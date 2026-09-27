-- C-1b: Nexus conviction rebuilt on evidence about the company.
--
-- conviction_score was 35% DCF upside, 25% "macro", 25% technical trend and
-- 15% "quality". Two of the four legs did not measure what they were named
-- for:
--
--   macro   = a sector label (rate sensitivity) crossed with the stock's OWN
--             price regime. No rate, spread or regime input anywhere; it
--             correlates 0.78 with the technical leg, so the score counted
--             price trend twice.
--   quality = vw_portfolio_home.quality_score: the stock's Sharpe, low vol,
--             YOUR gain on cost, and 20 points for being <= 10% of the book.
--             Book-dependent, so the same stock graded differently per
--             account (18 of 38 shared names lower on Atlas Secondary, only
--             because they were bought yesterday), and the sizing term fed
--             back into the Drift target it was computed against.
--
-- Now: valuation (DCF upside) 0.35, technical trend 0.25, quality 0.15, where
-- quality is the Piotroski F-Score from the loaded statements -- the same
-- nine tests and the same completeness rule Equity Research applies. A score
-- formed from fewer than nine tests is NOT a lower score; the leg is absent
-- and its weight renormalised out, exactly as valuation already was.
--
-- A name with NEITHER a valuation nor a quality leg gets NO conviction. Trend
-- alone would be a verdict with no fundamental evidence behind it (Bull ->
-- Add, Wary -> Exit); `conviction_basis` = 'no_fundamental_leg' says why.
--
-- The formula lives in ONE function, atlas_conviction(), because
-- vw_nexus_holdings recomputes the score from the live mark and used to carry
-- a second copy of the arithmetic. recommended_action likewise: the old CASE
-- ended in ELSE 'Exit', so a 75+ name at exactly 10.0% weight read Exit.

create or replace view public.vw_company_piotroski as
with r as (
  select f.symbol, f.fiscal_date_ending, f.net_income, f.operating_cashflow, f.roa,
         f.debt_to_assets, f.current_ratio, f.common_stock_shares_outstanding,
         f.gross_margin, f.asset_turnover,
         row_number() over (partition by f.symbol order by f.fiscal_date_ending desc) as rn
    from public.vw_company_fundamentals f
   where f.period = 'annual'
), c as (select * from r where rn = 1),
   p as (select * from r where rn = 2),
t as (
  select c.symbol, c.fiscal_date_ending, p.fiscal_date_ending as prior_fiscal_date_ending,
    case when c.net_income is null then null else c.net_income > 0 end as t_ni_pos,
    case when c.operating_cashflow is null then null else c.operating_cashflow > 0 end as t_cfo_pos,
    case when c.roa is null or p.roa is null then null else c.roa > p.roa end as t_roa_rising,
    case when c.operating_cashflow is null or c.net_income is null then null
         else c.operating_cashflow > c.net_income end as t_cfo_gt_ni,
    -- falling = NOT rising, so an unchanged ratio passes (statementRows.js falling()).
    case when c.debt_to_assets is null or p.debt_to_assets is null then null
         else not (c.debt_to_assets > p.debt_to_assets) end as t_lev_falling,
    case when c.current_ratio is null or p.current_ratio is null then null
         else c.current_ratio > p.current_ratio end as t_cr_rising,
    case when c.common_stock_shares_outstanding is null or p.common_stock_shares_outstanding is null then null
         else c.common_stock_shares_outstanding <= p.common_stock_shares_outstanding end as t_no_new_shares,
    case when c.gross_margin is null or p.gross_margin is null then null
         else c.gross_margin > p.gross_margin end as t_gm_rising,
    case when c.asset_turnover is null or p.asset_turnover is null then null
         else c.asset_turnover > p.asset_turnover end as t_at_rising
  from c left join p using (symbol)
), s as (
  select t.*,
    (t_ni_pos is not null)::int + (t_cfo_pos is not null)::int + (t_roa_rising is not null)::int
    + (t_cfo_gt_ni is not null)::int + (t_lev_falling is not null)::int + (t_cr_rising is not null)::int
    + (t_no_new_shares is not null)::int + (t_gm_rising is not null)::int + (t_at_rising is not null)::int
      as determinable,
    coalesce(t_ni_pos::int,0) + coalesce(t_cfo_pos::int,0) + coalesce(t_roa_rising::int,0)
    + coalesce(t_cfo_gt_ni::int,0) + coalesce(t_lev_falling::int,0) + coalesce(t_cr_rising::int,0)
    + coalesce(t_no_new_shares::int,0) + coalesce(t_gm_rising::int,0) + coalesce(t_at_rising::int,0)
      as passed
  from t
)
select symbol, fiscal_date_ending, prior_fiscal_date_ending,
       t_ni_pos, t_cfo_pos, t_roa_rising, t_cfo_gt_ni, t_lev_falling,
       t_cr_rising, t_no_new_shares, t_gm_rising, t_at_rising,
       determinable, passed,
       determinable = 9 as complete,
       -- A 9-point score exists only when nine tests resolved (EQ-9).
       case when determinable = 9 then passed end as fscore,
       case when determinable <> 9 then null
            when passed >= 7 then 'A-'
            when passed >= 5 then 'B'
            else 'C' end as grade
  from s;

comment on view public.vw_company_piotroski is
  'Piotroski F-Score on the latest two annual periods, the same nine tests as src/pages/equity/statementRows.js. fscore and grade are NULL unless all nine resolved.';

create or replace function public.atlas_conviction(p_val_c numeric, p_technical text, p_qual_c numeric)
returns integer language sql immutable parallel safe
set search_path = pg_catalog
as $fn$
  select case
    when p_val_c is null and p_qual_c is null then null
    else round(
      ( coalesce(0.35 * p_val_c, 0)
      + 0.25 * (case p_technical when 'Bull' then 80 when 'Neutral' then 50 else 30 end)
      + coalesce(0.15 * p_qual_c, 0) )
      / ( (case when p_val_c is null then 0 else 0.35 end) + 0.25
        + (case when p_qual_c is null then 0 else 0.15 end) )
    )::integer
  end
$fn$;

create or replace function public.atlas_conviction_basis(p_val_c numeric, p_qual_c numeric)
returns text language sql immutable parallel safe
set search_path = pg_catalog
as $fn$
  select case
    when p_val_c is null and p_qual_c is null then 'no_fundamental_leg'
    when p_val_c is not null and p_qual_c is not null then 'valuation+quality+trend'
    when p_val_c is not null then 'valuation+trend'
    else 'quality+trend'
  end
$fn$;

-- Same bands as before. Two changes: an absent score has no action, and the
-- weight test is >= 10 so a 75+ name at exactly 10.0% trims rather than
-- falling through to Exit.
create or replace function public.atlas_recommended_action(p_conviction integer, p_weight numeric)
returns text language sql immutable parallel safe
set search_path = pg_catalog
as $fn$
  select case
    when p_conviction is null then null
    when p_conviction >= 75 and p_weight < 10 then 'Add'
    when p_conviction between 60 and 74 then 'Hold'
    when p_conviction between 45 and 59 or p_weight >= 10 then 'Trim'
    else 'Exit'
  end
$fn$;

create or replace function public.atlas_nexus_insight(p_weight numeric, p_technical text, p_grade text, p_fscore integer, p_valuation text)
returns text language sql immutable parallel safe
set search_path = pg_catalog
as $fn$
  select 'Weight ' || round(p_weight, 1) || '% · Tech ' || coalesce(p_technical, 'n/a')
      || ' · Quality ' || case when p_grade is null then 'not graded'
                               else p_grade || ' (F-Score ' || p_fscore || '/9)' end
      || coalesce(' · ' || p_valuation, '') || '.'
$fn$;

alter table public.nexus_holdings_analytics
  add column quality_fscore integer,
  add column conviction_basis text;

do $do$
declare
  v_def text := pg_get_viewdef('public.vw_nexus_holdings_compute'::regclass, true);
  v_pairs text[][] := array[
    array[$q$                END::numeric AS qual_c
           FROM derived
        ), convict AS ($q$, $q$                END::numeric AS qual_c
           FROM derived
             LEFT JOIN vw_company_piotroski pio ON pio.symbol = derived.symbol
        ), convict AS ($q$],
    array[$q$            derived.quality_grade,
            derived.quant_signal,
            derived.macro_signal,
            derived.valuation_signal,
                CASE
                    WHEN derived.dcf_upside_pct IS NULL THEN NULL::numeric$q$, $q$            pio.grade AS quality_grade,
            derived.quant_signal,
            derived.macro_signal,
            derived.valuation_signal,
            pio.fscore AS quality_fscore,
                CASE
                    WHEN derived.dcf_upside_pct IS NULL THEN NULL::numeric$q$],
    array[$q$                CASE derived.macro_signal
                    WHEN 'Tailwind'::text THEN 70
                    WHEN 'Headwind'::text THEN 30
                    ELSE 50
                END::numeric AS mac_c,
$q$, $q$$q$],
    array[$q$                CASE derived.quality_grade
                    WHEN 'A+'::text THEN 95
                    WHEN 'A'::text THEN 85
                    WHEN 'B+'::text THEN 70
                    WHEN 'B'::text THEN 55
                    ELSE 35
                END::numeric AS qual_c
           FROM derived
             LEFT JOIN$q$, $q$                pio.fscore::numeric * 100::numeric / 9::numeric AS qual_c
           FROM derived
             LEFT JOIN$q$],
    array[$q$            scored.val_c,
            scored.mac_c,
            scored.tec_c,
            scored.qual_c,
            round((COALESCE(0.35 * scored.val_c, 0::numeric) + 0.25 * scored.mac_c + 0.25 * scored.tec_c + 0.15 * scored.qual_c) / (
                CASE
                    WHEN scored.val_c IS NULL THEN 0::numeric
                    ELSE 0.35
                END + 0.25 + 0.25 + 0.15))::integer AS conviction_score
           FROM scored$q$, $q$            scored.quality_fscore,
            scored.val_c,
            scored.tec_c,
            scored.qual_c,
            atlas_conviction(scored.val_c, scored.technical_signal, scored.qual_c) AS conviction_score,
            atlas_conviction_basis(scored.val_c, scored.qual_c) AS conviction_basis
           FROM scored$q$],
    array[$q$        CASE
            WHEN conviction_score >= 75 AND weight_pct < 10::numeric THEN 'Add'::text
            WHEN conviction_score >= 60 AND conviction_score <= 74 THEN 'Hold'::text
            WHEN conviction_score >= 45 AND conviction_score <= 59 OR weight_pct > 10::numeric THEN 'Trim'::text
            ELSE 'Exit'::text
        END AS recommended_action,$q$, $q$    atlas_recommended_action(conviction_score, weight_pct) AS recommended_action,$q$],
    array[$q$    (((((((('Weight '::text || round(weight_pct, 1)) || '% · Tech '::text) || technical_signal) || ' · Macro '::text) || macro_signal) || ' · Quality '::text) || quality_grade) || COALESCE(' · '::text || valuation_signal, ''::text)) || '.'::text AS nexus_insight,$q$, $q$    atlas_nexus_insight(weight_pct, technical_signal, quality_grade, quality_fscore, valuation_signal) AS nexus_insight,$q$],
    array[$q$    current_price,
    valuation_source
   FROM convict$q$, $q$    current_price,
    valuation_source,
    quality_fscore,
    conviction_basis
   FROM convict$q$]
  ];
  i int;
  v_n int;
begin
  if position('atlas_conviction(' in v_def) > 0 then
    raise exception 'C-1b already applied to vw_nexus_holdings_compute';
  end if;
  for i in 1 .. array_length(v_pairs, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_pairs[i][1], ''))) / length(v_pairs[i][1]);
    if v_n <> 1 then
      raise exception 'C-1b vw_nexus_holdings_compute anchor % matched % times, expected 1', i, v_n;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute 'create or replace view public.vw_nexus_holdings_compute as ' || v_def;
end
$do$;

do $do$
declare
  v_def text := pg_get_viewdef('public.vw_nexus_holdings'::regclass, true);
  v_pairs text[][] := array[
    array[$q$                    mv_nexus_holdings.valuation_source
                   FROM nexus_holdings_analytics mv_nexus_holdings$q$, $q$                    mv_nexus_holdings.valuation_source,
                    mv_nexus_holdings.quality_fscore
                   FROM nexus_holdings_analytics mv_nexus_holdings$q$],
    array[$q$            m.quality_grade
           FROM vw_portfolio_home ph$q$, $q$            m.quality_grade,
            m.quality_fscore
           FROM vw_portfolio_home ph$q$],
    array[$q$            w.quality_grade,
                CASE
                    WHEN w.dcf_upside_pct IS NULL THEN NULL::text$q$, $q$            w.quality_grade,
            w.quality_fscore,
                CASE
                    WHEN w.dcf_upside_pct IS NULL THEN NULL::text$q$],
    array[$q$            graded.quality_grade,
            graded.valuation_signal,$q$, $q$            graded.quality_grade,
            graded.quality_fscore,
            graded.valuation_signal,$q$],
    array[$q$                CASE
                    WHEN graded.has_analytics THEN round((COALESCE(0.35 * graded.val_c, 0::numeric) + 0.25 *
                    CASE graded.macro_signal
                        WHEN 'Tailwind'::text THEN 70
                        WHEN 'Headwind'::text THEN 30
                        ELSE 50
                    END::numeric + 0.25 *
                    CASE graded.technical_signal
                        WHEN 'Bull'::text THEN 80
                        WHEN 'Neutral'::text THEN 50
                        ELSE 30
                    END::numeric + 0.15 *
                    CASE graded.quality_grade
                        WHEN 'A+'::text THEN 95
                        WHEN 'A'::text THEN 85
                        WHEN 'B+'::text THEN 70
                        WHEN 'B'::text THEN 55
                        ELSE 35
                    END::numeric) / (
                    CASE
                        WHEN graded.val_c IS NULL THEN 0::numeric
                        ELSE 0.35
                    END + 0.25 + 0.25 + 0.15))::integer
                    ELSE NULL::integer
                END AS conviction_score$q$, $q$                CASE
                    WHEN graded.has_analytics THEN atlas_conviction(graded.val_c, graded.technical_signal, graded.quality_fscore::numeric * 100::numeric / 9::numeric)
                    ELSE NULL::integer
                END AS conviction_score,
                CASE
                    WHEN graded.has_analytics THEN atlas_conviction_basis(graded.val_c, graded.quality_fscore::numeric)
                    ELSE NULL::text
                END AS conviction_basis$q$],
    array[$q$        CASE
            WHEN conviction_score IS NULL THEN NULL::text
            WHEN conviction_score >= 75 AND weight_long_pct < 10::numeric THEN 'Add'::text
            WHEN conviction_score >= 60 AND conviction_score <= 74 THEN 'Hold'::text
            WHEN conviction_score >= 45 AND conviction_score <= 59 OR weight_long_pct > 10::numeric THEN 'Trim'::text
            ELSE 'Exit'::text
        END AS recommended_action,$q$, $q$    atlas_recommended_action(conviction_score, weight_long_pct) AS recommended_action,$q$],
    array[$q$            ELSE (((((((('Weight '::text || round(weight_long_pct, 1)) || '% · Tech '::text) || technical_signal) || ' · Macro '::text) || macro_signal) || ' · Quality '::text) || quality_grade) || COALESCE(' · '::text || valuation_signal, ''::text)) || '.'::text
        END AS nexus_insight,$q$, $q$            ELSE atlas_nexus_insight(weight_long_pct, technical_signal, quality_grade, quality_fscore, valuation_signal)
        END AS nexus_insight,$q$],
    array[$q$    move_publishable_src AS move_publishable
   FROM convict;$q$, $q$    move_publishable_src AS move_publishable,
    quality_fscore,
    conviction_basis
   FROM convict;$q$]
  ];
  i int;
  v_n int;
begin
  if position('atlas_conviction(' in v_def) > 0 then
    raise exception 'C-1b already applied to vw_nexus_holdings';
  end if;
  for i in 1 .. array_length(v_pairs, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_pairs[i][1], ''))) / length(v_pairs[i][1]);
    if v_n <> 1 then
      raise exception 'C-1b vw_nexus_holdings anchor % matched % times, expected 1', i, v_n;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute 'create or replace view public.vw_nexus_holdings as ' || v_def;
end
$do$;

-- mv_nexus_holdings computed the OLD score every ten minutes and nothing has
-- read it since MP-4d (pg_depend: no dependants). A stale matview nobody
-- refreshes correctly is one grep away from being read as current.
create or replace function public.refresh_nexus_holdings()
returns void language plpgsql
security definer
set search_path to 'public'
as $fn$
BEGIN
  PERFORM public.atlas_refresh_nexus_holdings_analytics();
  PERFORM public.atlas_refresh_bench_contribution();
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_book_candidate_map;
END;
$fn$;

drop materialized view public.mv_nexus_holdings;
