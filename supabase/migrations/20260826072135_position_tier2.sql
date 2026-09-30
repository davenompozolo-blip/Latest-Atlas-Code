CREATE OR REPLACE VIEW public.vw_position_tier2 AS
WITH latest_corr AS (
    SELECT max(as_of_date) AS d FROM public.universe_correlations
),
held AS (
    SELECT DISTINCT symbol FROM public.mv_position_returns
),
-- The matrix stores each pair once; read it both ways so a name is not
-- silently missing its own best correlate because it happened to be stored
-- as symbol_2.
pairs AS (
    SELECT c.symbol_1 AS sym, c.symbol_2 AS other, c.correlation AS rho
      FROM public.universe_correlations c, latest_corr l
     WHERE c.as_of_date = l.d AND c.correlation IS NOT NULL
       AND c.symbol_2 IN (SELECT symbol FROM held)
    UNION ALL
    SELECT c.symbol_2, c.symbol_1, c.correlation
      FROM public.universe_correlations c, latest_corr l
     WHERE c.as_of_date = l.d AND c.correlation IS NOT NULL
       AND c.symbol_1 IN (SELECT symbol FROM held)
),
best AS (
    SELECT DISTINCT ON (p.sym) p.sym, p.other, p.rho
      FROM pairs p
      JOIN held h ON h.symbol = p.sym
     WHERE p.other <> p.sym
     ORDER BY p.sym, p.rho DESC
)
SELECT r.asset_id,
       r.symbol,
       r.engine_status,
       r.engine_reason,
       r.position_mwr_period_pct,
       c.cf_mwr_period_pct                    AS cf_book_return_pct,
       c.cf_capital_deployed_usd              AS cf_book_capital_deployed_usd,
       c.cf_net_pnl_usd                       AS cf_book_net_pnl_usd,
       c.cf_status                            AS cf_book_status,
       c.cf_reason                            AS cf_book_reason,
       -- The Tier 2 score. NULL unless BOTH legs measured: a difference with
       -- one side missing is not a small error, it is not a number.
       CASE
           WHEN r.engine_status = 'measured'
            AND c.cf_status = 'measured'
            AND r.position_mwr_period_pct IS NOT NULL
            AND c.cf_mwr_period_pct IS NOT NULL
           THEN (r.position_mwr_period_pct - c.cf_mwr_period_pct)::numeric
       END                                    AS excess_vs_book_pct,
       b.rho                                  AS best_correlate_rho,
       b.other                                AS best_correlate_symbol,
       (SELECT d FROM latest_corr)            AS correlation_as_of
  FROM public.mv_position_returns r
  CROSS JOIN LATERAL public.atlas_counterfactual_book(r.asset_id) c
  LEFT JOIN best b ON b.sym = r.symbol;

COMMENT ON VIEW public.vw_position_tier2 IS
 'Tier 2 of the ranking ladder (step 4 addendum rev. B §2.3-2.5): every position''s own money-weighted return against the same cash-flow schedule run into the rest of the book, plus its single best correlate. Covers every measurable position - 82 of 86 - because it depends on nothing outside the book. Read mv_position_tier2 from a page; this view calls a plpgsql counterfactual per position.';

GRANT SELECT ON public.vw_position_tier2 TO anon, authenticated, service_role;

DROP MATERIALIZED VIEW IF EXISTS public.mv_position_tier2;
CREATE MATERIALIZED VIEW public.mv_position_tier2 AS
    SELECT t.*, now() AS computed_at FROM public.vw_position_tier2 t;

CREATE UNIQUE INDEX mv_position_tier2_asset_uniq ON public.mv_position_tier2 (asset_id);
CREATE INDEX mv_position_tier2_symbol_idx        ON public.mv_position_tier2 (symbol);

GRANT SELECT ON public.mv_position_tier2 TO anon, authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.mv_position_tier2 IS
 'Nightly snapshot of vw_position_tier2. Unique index on asset_id allows REFRESH ... CONCURRENTLY.';
