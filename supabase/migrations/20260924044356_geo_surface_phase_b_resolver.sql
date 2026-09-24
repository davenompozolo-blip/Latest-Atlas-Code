-- Geographic surface, phase B: the look-through resolver.
--
--   geo_exposure_detail(portfolio_id, as_of, basis)   one row per holding x country
--   resolve_geo_exposure(portfolio_id, as_of, basis)  one row per country  (the map)
--   geo_exposure_summary(portfolio_id, as_of, basis)  one row              (the footer)
--
-- All three read the same detail function, so the map, the inspector and the
-- coverage line cannot disagree about a single holding.
--
-- The spec's three rules, and how each is enforced here:
--   1. Never silently rebase. Unallocated revenue stays in XX and XX is a row
--      like any other; weights are shares of the whole book and are never
--      renormalised over the attributed part.
--   2. Coverage travels with the number. Every country row carries the share
--      of its weight that came from a disclosure, and the summary carries the
--      book-level figure the surface grades itself against.
--   3. No disclosure -> domicile, flagged. resolution = 'domicile_fallback',
--      never counted as attributable.
--
-- One deliberate departure from rule 3: a FUND with no look-through does NOT
-- fall back to its domicile. Every fund in this book is a US-registered
-- wrapper, so EWY (Korea), EZA (South Africa) and EWA (Australia) would all
-- land on the United States -- a fallback that is not a guess about where the
-- money earns but a statement known to be false. They go to XX as
-- 'fund_no_lookthrough' and are counted apart.
--
-- Holdings are the CURRENT book (vw_positions_current, which reconciles
-- against the account-snapshot watermark). p_as_of selects which disclosure
-- period applies -- the latest period_end on or before it -- and does not
-- reconstruct a past book.
--
-- Options are excluded from both sides: a contract has no revenue and no
-- domicile of its own. The summary reports how much was left out. Tested on
-- the class AND the OCC symbol shape, since either alone has been wrong here.

create function public.geo_exposure_detail(
    p_portfolio_id uuid default null,
    p_as_of        date default current_date,
    p_basis        text default 'revenue'
)
returns table (
    asset_id        uuid,
    symbol          text,
    name            text,
    instrument_kind text,
    domicile_iso2   char(2),
    market_value    numeric,
    position_weight numeric,
    iso2            char(2),
    weight          numeric,
    resolution      text,
    attributable    boolean,
    period_end      date,
    source_url      text
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
    if p_basis = 'active' then
        raise exception 'geo basis "active" needs a benchmark geographic breakdown, and none is on file'
            using errcode = '22023';
    elsif p_basis is null or p_basis not in ('domicile', 'revenue') then
        raise exception 'unknown geo basis "%" (expected domicile or revenue)', p_basis
            using errcode = '22023';
    end if;

    return query
    with book as (
        select p.asset_id, a.symbol, a.name, p.market_value::numeric as mv
          from public.vw_positions_current p
          join public.assets a on a.id = p.asset_id
         where (p_portfolio_id is null or p.portfolio_id = p_portfolio_id)
           and p.market_value is not null
           and coalesce(a.asset_class, '') not ilike '%option%'
           and a.symbol !~ '^[A-Z]{1,6}[0-9]{6}[CP][0-9]{8}$'
    ),
    tot as (select sum(b.mv) as t from book b),
    bw as (
        select b.*, b.mv / nullif(tot.t, 0) as w,
               d.iso2 as d_iso2, d.instrument_kind as kind
          from book b
          cross join tot
          left join public.security_domicile d on d.security_id = b.asset_id
    ),
    lastp as (
        select r.security_id, max(r.period_end) as pe
          from public.security_geo_revenue r
         where r.period_end <= p_as_of
           and r.security_id in (select bw.asset_id from bw)
         group by r.security_id
    ),
    disclosed as (
        select bw.asset_id, bw.symbol, bw.name, bw.kind, bw.d_iso2, bw.mv, bw.w,
               r.iso2, bw.w * r.revenue_share as cw,
               r.basis::text as res,
               (r.basis in ('disclosed', 'mapped_from_segment') and r.iso2 <> 'XX') as attr,
               r.period_end, r.source_url
          from bw
          join lastp lp on lp.security_id = bw.asset_id
          join public.security_geo_revenue r
            on r.security_id = lp.security_id and r.period_end = lp.pe
         where p_basis = 'revenue'
    ),
    undisclosed as (
        select bw.asset_id, bw.symbol, bw.name, bw.kind, bw.d_iso2, bw.mv, bw.w,
               case
                   when bw.d_iso2 is null then 'XX'
                   when p_basis = 'revenue' and bw.kind = 'fund' then 'XX'
                   else bw.d_iso2
               end::char(2) as iso2,
               bw.w as cw,
               case
                   when bw.d_iso2 is null then 'no_domicile'
                   when p_basis = 'domicile' then 'domicile'
                   when bw.kind = 'fund' then 'fund_no_lookthrough'
                   else 'domicile_fallback'
               end as res,
               (p_basis = 'domicile' and bw.d_iso2 is not null) as attr,
               null::date as period_end, null::text as source_url
          from bw
         where p_basis = 'domicile'
            or not exists (select 1 from lastp lp where lp.security_id = bw.asset_id)
    )
    select x.asset_id, x.symbol, x.name, x.kind, x.d_iso2, x.mv, x.w,
           x.iso2, x.cw, x.res, x.attr, x.period_end, x.source_url
      from (select * from disclosed union all select * from undisclosed) x
     order by x.iso2, x.cw desc, x.symbol;
end
$fn$;

comment on function public.geo_exposure_detail(uuid, date, text) is
  'One row per holding x country. resolution: disclosed | mapped_from_segment | estimated (from '
  'security_geo_revenue) | domicile (domicile basis) | domicile_fallback | fund_no_lookthrough | no_domicile. '
  'attributable is true only for a disclosure (or segment mapping) naming a country, or a sourced domicile on '
  'the domicile basis. Weights are shares of the whole non-option book and are never renormalised.';

create function public.resolve_geo_exposure(
    p_portfolio_id uuid default null,
    p_as_of        date default current_date,
    p_basis        text default 'revenue'
)
returns table (
    iso2                char(2),
    weight              numeric,
    coverage            numeric,
    contributor_count   int,
    attributable_weight numeric,
    fallback_weight     numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
    select d.iso2,
           sum(d.weight),
           case when sum(d.weight) > 0
                then coalesce(sum(d.weight) filter (where d.attributable), 0) / sum(d.weight)
           end,
           count(distinct d.asset_id)::int,
           coalesce(sum(d.weight) filter (where d.attributable), 0),
           coalesce(sum(d.weight) filter (where not d.attributable), 0)
      from public.geo_exposure_detail(p_portfolio_id, p_as_of, p_basis) d
     group by d.iso2
     order by sum(d.weight) desc;
$fn$;

comment on function public.resolve_geo_exposure(uuid, date, text) is
  'Book exposure by country on a basis (domicile | revenue; active refuses -- no benchmark on file). '
  'coverage = share of the country''s weight resting on a disclosure. XX is unallocated and is returned, never dropped.';

create function public.geo_exposure_summary(
    p_portfolio_id uuid default null,
    p_as_of        date default current_date,
    p_basis        text default 'revenue'
)
returns table (
    basis                    text,
    as_of                    date,
    n_positions              int,
    book_market_value        numeric,
    book_coverage            numeric,
    unallocated_weight       numeric,
    n_countries              int,
    concentration_hhi        numeric,
    disclosed_count          int,
    disclosed_weight         numeric,
    domicile_fallback_count  int,
    domicile_fallback_weight numeric,
    fund_unresolved_count    int,
    fund_unresolved_weight   numeric,
    no_domicile_count        int,
    no_domicile_weight       numeric,
    excluded_option_count    int,
    excluded_option_mv       numeric,
    latest_period_end        date
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
    with d as (
        select * from public.geo_exposure_detail(p_portfolio_id, p_as_of, p_basis)
    ),
    c as (
        select d.iso2, sum(d.weight) as w from d where d.iso2 <> 'XX' group by d.iso2
    ),
    per_asset as (
        select d.asset_id,
               bool_or(d.resolution in ('disclosed', 'mapped_from_segment', 'estimated')) as has_disclosure,
               max(d.position_weight) as pw,
               max(d.resolution) filter (where d.resolution in
                   ('domicile_fallback', 'fund_no_lookthrough', 'no_domicile')) as gap
          from d group by d.asset_id
    ),
    opts as (
        select count(*)::int as n, coalesce(sum(p.market_value), 0)::numeric as mv
          from public.vw_positions_current p
          join public.assets a on a.id = p.asset_id
         where (p_portfolio_id is null or p.portfolio_id = p_portfolio_id)
           and (coalesce(a.asset_class, '') ilike '%option%'
                or a.symbol ~ '^[A-Z]{1,6}[0-9]{6}[CP][0-9]{8}$')
    )
    select p_basis,
           p_as_of,
           (select count(*)::int from per_asset),
           (select sum(x.mv) from (select distinct d.asset_id, d.market_value as mv from d) x),
           (select coalesce(sum(d.weight) filter (where d.attributable), 0) from d),
           (select coalesce(sum(d.weight) filter (where d.iso2 = 'XX'), 0) from d),
           (select count(*)::int from c where c.w > 0),
           -- Concentration over the ATTRIBUTED countries only; XX is not a
           -- place and cannot be concentrated in.
           (select sum(c.w * c.w) from c),
           (select count(*)::int from per_asset where has_disclosure),
           (select coalesce(sum(pw), 0) from per_asset where has_disclosure),
           (select count(*)::int from per_asset where gap = 'domicile_fallback'),
           (select coalesce(sum(pw), 0) from per_asset where gap = 'domicile_fallback'),
           (select count(*)::int from per_asset where gap = 'fund_no_lookthrough'),
           (select coalesce(sum(pw), 0) from per_asset where gap = 'fund_no_lookthrough'),
           (select count(*)::int from per_asset where gap = 'no_domicile'),
           (select coalesce(sum(pw), 0) from per_asset where gap = 'no_domicile'),
           (select n from opts),
           (select mv from opts),
           (select max(d.period_end) from d);
$fn$;

comment on function public.geo_exposure_summary(uuid, date, text) is
  'One row: book-level coverage, the unallocated share, and a count and weight for every way a holding can '
  'fail to be attributed. The surface grades itself on book_coverage (muted below 0.80).';

grant execute on function public.geo_exposure_detail(uuid, date, text)  to anon, authenticated, service_role;
grant execute on function public.resolve_geo_exposure(uuid, date, text) to anon, authenticated, service_role;
grant execute on function public.geo_exposure_summary(uuid, date, text) to anon, authenticated, service_role;
