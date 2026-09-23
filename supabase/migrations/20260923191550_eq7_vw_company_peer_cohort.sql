-- ============================================================
-- EQ-7 · vw_company_peer_cohort — where a company sits against the companies
-- it is actually compared with.
--
-- NOT built on the statement layer. `vw_company_fundamental_peers` is derived
-- from the Alpha Vantage load, which is ten symbols behind a 25-request/day
-- ceiling, and reasoning from it is what made this unit look blocked.
-- `equity_screener_universe` carries 913 symbols refreshed daily and none of
-- it depends on that load.
--
-- THE COHORT IS NAMED FOR THE VENDOR TAXONOMY, NOT FOR A GICS LEVEL.
-- `equity_screener_universe.industry` is a COPY of `sector`: 896 rows
-- identical, 17 where industry is NULL, and ZERO rows where both are present
-- and differ. There is no independent industry classification in this
-- platform, so calling these buckets "industry peers" would assert a
-- granularity the data does not carry -- the `fwd_pe` defect in a cohort
-- definition. The 46 buckets are Finnhub's single-level taxonomy and they mix
-- GICS sector names (Technology, Energy, Utilities) with GICS industry names
-- (Semiconductors, Banking, Biotechnology), so they are neither level
-- cleanly. `cohort_basis` travels on every row and says so.
--
-- THE SUBJECT IS EXCLUDED FROM ITS OWN COHORT. A median containing the
-- subject is not a benchmark, and in a small cohort the subject can BE the
-- median. EQ-2 established this; what changes here is HOW.
--
-- EQ-2 computed its medians with a correlated lateral and flagged it as a
-- growth-linked node that "has not been measured at scale". This one is a
-- leave-one-out median off a single sorted array per (cohort, metric): one
-- pass, no self-join, and the cost does not grow with the number of metrics
-- per cohort the way a per-row lateral does.
-- ============================================================

-- Leave-one-out median of a SORTED array, removing the element at 1-based
-- position k. The caller supplies the array already ordered and k as the
-- subject's own row_number within that ordering, so a tie is resolved by
-- IDENTITY rather than by value -- removing "a row with that value" would
-- drop the wrong company when two peers report the same number.
create or replace function public.atlas_loo_median(p_sorted numeric[], p_k integer)
returns numeric language sql immutable
set search_path = ''
as $fn$
    with d as (
        select array_length(p_sorted, 1) - 1 as m
    ),
    -- Map a 1-based index in the REDUCED array back to the original array:
    -- everything at or after the removed position shifts up by one.
    pick as (
        select d.m,
               case when d.m % 2 = 1 then (d.m + 1) / 2 else d.m / 2 end     as lo,
               case when d.m % 2 = 1 then (d.m + 1) / 2 else d.m / 2 + 1 end as hi
          from d
    )
    select case
        when p_sorted is null or p_k is null then null
        when (select m from pick) < 1 then null   -- a cohort of one has no peer
        else (
            p_sorted[(select case when lo < p_k then lo else lo + 1 end from pick)]
          + p_sorted[(select case when hi < p_k then hi else hi + 1 end from pick)]
        ) / 2.0
    end
$fn$;

comment on function public.atlas_loo_median(numeric[], integer) is
'EQ-7. The median of a sorted numeric array with the element at 1-based
position k removed. k is the subject row''s own row_number within the same
ordering, so ties are broken by identity: removing "a row with that value"
would drop the wrong company when two peers report the same number. Returns
NULL for a cohort of one, which has no peer to be measured against.';

revoke execute on function public.atlas_loo_median(numeric[], integer) from public;
grant execute on function public.atlas_loo_median(numeric[], integer) to anon, authenticated, service_role;


create or replace view public.vw_company_peer_cohort as
with base as (
    select u.symbol,
           u.company_name,
           -- `sector` is the populated one (913/913); `industry` is its copy
           -- and is NULL on 17 rows. Reading `sector` is not a preference,
           -- it is the only column that always carries the bucket.
           u.sector                as cohort_key,
           u.market_cap_usd,
           u.market_cap_bucket,
           u.current_price,
           u.cached_at
      from public.equity_screener_universe u
     where u.sector is not null and btrim(u.sector) <> ''
),
-- Long form: one row per (symbol, metric). `higher_is_better` is carried from
-- here so a surface can never invert a reading -- a percentile with no
-- orientation asserts the opposite half the time, the same defect as an axis
-- key printed without its loading's sign. It is NULL, never guessed, where
-- the direction is genuinely a matter of mandate rather than quality: beta
-- and volatility are the position a reader takes, not a score.
m as (
    select b.symbol, b.cohort_key, x.metric, x.value, x.higher_is_better
      from base b
      join public.equity_screener_universe u on u.symbol = b.symbol
     cross join lateral (values
        ('forward_pe',             u.forward_pe,             false),
        ('pe_ratio',               u.pe_ratio,               false),
        ('peg_ratio',              u.peg_ratio,              false),
        ('ev_ebitda',              u.ev_ebitda,              false),
        ('price_to_book',          u.price_to_book,          false),
        ('price_to_sales',         u.price_to_sales,         false),
        ('roe_ttm',                u.roe_ttm,                true),
        ('roa_ttm',                u.roa_ttm,                true),
        ('gross_margin',           u.gross_margin,           true),
        ('net_margin',             u.net_margin,             true),
        ('rev_growth_yoy',         u.rev_growth_yoy,         true),
        ('rev_growth_3y',          u.rev_growth_3y,          true),
        ('eps_growth_yoy',         u.eps_growth_yoy,         true),
        ('div_yield_pct',          u.div_yield_pct,          true),
        ('return_52w',             u.return_52w,             true),
        ('return_13w',             u.return_13w,             true),
        ('roic_pct',               u.roic_pct,               true),
        ('roic_wacc_spread_pct',   u.roic_wacc_spread_pct,   true),
        ('beta',                   u.beta,                   null),
        ('vol_3m',                 u.vol_3m,                 null)
     ) as x(metric, value, higher_is_better)
     -- TWO-SIDED, never `is not null` alone. NaN and +Infinity both pass a
     -- one-sided bound and NaN sorts ABOVE every finite value in this
     -- database, so one sentinel would take the top of every percentile it
     -- appeared in. PR #783.
     where x.value is not null
       and x.value > '-Infinity'::numeric
       and x.value <  'Infinity'::numeric
),
ranked as (
    select m.*,
           row_number() over (partition by m.cohort_key, m.metric
                              order by m.value, m.symbol)              as rk,
           count(*)     over (partition by m.cohort_key, m.metric)     as n_measured,
           -- Peers STRICTLY below. A tie is neither below nor counted, so an
           -- identical value does not inflate either company past the other.
           count(*)     over (partition by m.cohort_key, m.metric
                              order by m.value
                              range between unbounded preceding
                                        and 1 preceding)               as peers_below
      from m
),
arr as (
    select cohort_key, metric, array_agg(value order by value, symbol) as sorted
      from ranked group by 1, 2
)
select
    b.symbol,
    b.company_name,
    b.cohort_key,
    -- The taxonomy this bucket comes from, so no surface can label it as a
    -- GICS sector or a GICS industry. It is neither.
    'finnhub_taxonomy'::text                     as cohort_basis,
    r.metric,
    r.value,
    r.higher_is_better,

    -- The cohort median EXCLUDING this company.
    round(public.atlas_loo_median(a.sorted, r.rk::int), 6)  as peer_median,
    round(r.value - public.atlas_loo_median(a.sorted, r.rk::int), 6) as vs_peer_median,

    -- PEERS, not cohort size, and peers with a MEASURED value for THIS
    -- metric. `ev_ebitda` is 0 of 63 on Banking and `forward_pe` 18 of 44 on
    -- Biotechnology; a denominator of "how many companies are in the bucket"
    -- would publish a median over a handful and call it the sector.
    (r.n_measured - 1)                           as peer_count,
    case when r.n_measured > 1
         then round((r.peers_below::numeric / (r.n_measured - 1)), 6) end as peer_percentile,

    -- A cohort of one has no peer and says so rather than rendering an
    -- absent median as a neutral reading.
    case when r.n_measured <= 1 then 'no_peer_with_this_metric' end as peer_withheld,

    b.market_cap_usd,
    b.market_cap_bucket,
    b.current_price,
    b.cached_at
  from ranked r
  join base b on b.symbol = r.symbol
  join arr  a on a.cohort_key = r.cohort_key and a.metric = r.metric;

comment on view public.vw_company_peer_cohort is
'EQ-7. Where a company sits against the companies it is actually compared
with, one row per (symbol, metric).

Built on equity_screener_universe (913 symbols, refreshed daily), NOT on the
statement layer: vw_company_fundamental_peers derives from the Alpha Vantage
load and is ten symbols deep behind a 25-request/day ceiling.

THE COHORT IS THE VENDOR TAXONOMY AND cohort_basis SAYS SO. This platform has
no independent industry classification -- equity_screener_universe.industry is
a copy of sector, identical on all 896 rows that carry both -- and the 46
buckets mix GICS sector names with GICS industry names, so they are neither
level cleanly.

The subject is excluded from its own median (a median containing the subject
is not a benchmark). peer_count counts peers with a MEASURED value for that
metric, never cohort size. peer_percentile is the share of peers strictly
below, so a tie inflates neither side. higher_is_better travels on the row and
is NULL for beta and volatility, where the direction is a mandate rather than
a quality.';

grant select on public.vw_company_peer_cohort to anon, authenticated, service_role;
