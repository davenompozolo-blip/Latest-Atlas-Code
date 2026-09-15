-- APPLIED 2026-09-15 via the Supabase SQL editor; ledger row 20260915051500.
--
-- vw_risk_analysis published positions the book does not hold. `latest_pos` was
-- DISTINCT ON (asset_id) ORDER BY as_of_date DESC -- the latest row PER ASSET,
-- not the latest snapshot -- so a sold name kept its final row forever at its
-- last market value and went on being published.
--
-- Measured against production, old definition vs this one:
--
--   rows                              83        ->  62
--   symbols introduced                --            0     (strict subset)
--   rows not in vw_positions_current  21        ->  0
--   sum(weight)                       1.015326  ->  1.000000
--   runtime                           58.1 ms   ->  33.6 ms
--   EXPLAIN execution time                          57.8 ms  (3000 ms anon cap)
--
-- The old sum(weight) of 101.53% is its own tell: shorts count toward NAV while
-- their rows are dropped by the inner join to vol_per_position, so the published
-- weights never summed to the book.
--
-- 62 rows against vw_positions_current's 65 is NOT a regression: three held names
-- have no usable price history and are dropped by the inner join to
-- vol_per_position, exactly as the old definition did.
--
-- Sourced from vw_positions_current, which CLAUDE.md designates for "what is
-- held" and which is correct intraday -- it reconciles against the
-- account-snapshot watermark rather than trusting that a row exists.
--
-- COUPLING: atlas_write_verdicts derives book_risk_daily.total_vol_annual by
-- summing marginal_vol_contribution * weight over THIS view, so this change
-- moves that published number by dropping the stale rows' ~13.4% share. That
-- figure was already wrong by ~2.4x for unrelated dimensional reasons; the
-- correction is a separate change.

create or replace view public.vw_risk_analysis as
 WITH latest_pos AS (
         SELECT c.asset_id, c.quantity, c.average_cost, c.market_value, c.as_of_date
           FROM public.vw_positions_current c
             JOIN public.assets a_1 ON a_1.id = c.asset_id
          WHERE c.quantity IS NOT NULL AND c.quantity <> 0::numeric
            AND (c.market_value IS NULL OR abs(c.market_value) > 0.01)
            AND NOT ((a_1.asset_class = ANY (ARRAY['option'::text,'us_option'::text]))
                     AND a_1.symbol ~ '^[A-Z.]{1,6}[0-9]{6}[CP][0-9]{8}$'::text
                     AND to_date("substring"(a_1.symbol,'([0-9]{6})[CP]'::text),'YYMMDD'::text) < CURRENT_DATE)
        ), returns AS (
         SELECT ph.asset_id, ph.price_date,
            (ph.close - lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
              / NULLIF(lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date),0::numeric) AS r
           FROM public.price_history ph
          WHERE ph."interval" = '1d'::text
            AND ph.price_date >= (CURRENT_DATE - '252 days'::interval)
            AND ph.asset_id IN (SELECT latest_pos.asset_id FROM latest_pos)
        ), vol_per_position AS (
         SELECT returns.asset_id, count(*) AS obs, avg(returns.r) AS mu, stddev(returns.r) AS sigma,
            stddev(returns.r)::double precision * sqrt(252::double precision) AS annual_vol,
            percentile_cont(0.05::double precision) WITHIN GROUP (ORDER BY (returns.r::double precision)) AS var_95_daily
           FROM returns WHERE returns.r IS NOT NULL GROUP BY returns.asset_id
        ), nav AS (SELECT sum(latest_pos.market_value) AS total_nav FROM latest_pos)
 SELECT a.symbol, a.name, a.sector, p.market_value,
    p.market_value / NULLIF(nav.total_nav,0::numeric) AS weight,
    v.annual_vol,
    (p.market_value / NULLIF(nav.total_nav,0::numeric))::double precision * v.annual_vol AS marginal_vol_contribution,
    abs(v.var_95_daily) * p.market_value::double precision AS dollar_var_95_daily,
    v.obs AS trading_days,
        CASE WHEN v.annual_vol > 0.40::double precision THEN 'High Risk'::text
             WHEN v.annual_vol > 0.20::double precision THEN 'Moderate Risk'::text
             ELSE 'Low Risk'::text END AS risk_tier
   FROM latest_pos p
     JOIN public.assets a ON a.id = p.asset_id
     JOIN vol_per_position v ON v.asset_id = p.asset_id
     CROSS JOIN nav
  ORDER BY ((p.market_value / NULLIF(nav.total_nav,0::numeric))::double precision * v.annual_vol) DESC;
