-- ============================================================
-- The Contribution panel reads a matview, not a live computation
-- ------------------------------------------------------------
-- The two rewrites took the view from 13.9s to a 0.9-2.7s band against a
-- 3,000 ms cap. That is a fix for "always broken" but not for "robust": 2.7s
-- cold leaves 300 ms of headroom, and this file already records what living
-- on that ceiling looks like -- per-call cancellations that land on whichever
-- request meets a colder buffer cache and never reproduce on demand.
--
-- The inputs only move when prices and positions move, both of which are
-- refreshed on schedules of their own, so recomputing this on every page load
-- buys nothing. `mv_bench_contribution` is refreshed CONCURRENTLY beside
-- `mv_nexus_holdings` on the same 10-minute job, and the view now reads it.
--
-- Freshness is published rather than assumed: `computed_at` rides on every
-- row so a consumer can say how old the reading is instead of trusting it.
--
-- CONCURRENTLY needs a unique index, so `symbol` carries one -- it is already
-- the key, one row per held name.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_bench_contribution;

CREATE MATERIALIZED VIEW public.mv_bench_contribution AS
WITH daily AS (
    SELECT v.price_date,
           v.symbol,
           sum(v.position_value) AS pos_val,
           max(v.close_price)    AS close_price
      FROM vw_position_nav_daily v
     WHERE v.close_price IS NOT NULL AND v.position_value IS NOT NULL
     GROUP BY v.price_date, v.symbol
),
daily_nav AS (
    SELECT d.*, sum(d.pos_val) OVER (PARTITION BY d.price_date) AS total_nav
      FROM daily d
),
seq AS (
    SELECT price_date, symbol, close_price,
           lag(close_price) OVER w AS prev_close,
           lag(pos_val)     OVER w AS prev_pos_val,
           lag(total_nav)   OVER w AS prev_nav
      FROM daily_nav
    WINDOW w AS (PARTITION BY symbol ORDER BY price_date)
),
contrib AS (
    SELECT seq.price_date, seq.symbol,
           (seq.close_price / seq.prev_close - 1::numeric)
             * (seq.prev_pos_val / seq.prev_nav) * 100::numeric AS contrib_pct
      FROM seq
     WHERE seq.prev_close > 0::numeric AND seq.prev_nav > 0::numeric
       AND seq.prev_pos_val IS NOT NULL
),
last_day AS (
    SELECT max(contrib.price_date) AS d FROM contrib WHERE contrib.contrib_pct IS NOT NULL
),
agg AS (
    SELECT contrib.symbol,
           round(COALESCE(sum(contrib.contrib_pct)
                 FILTER (WHERE contrib.price_date = (SELECT last_day.d FROM last_day)), 0::numeric), 3) AS contrib_today,
           round(sum(contrib.contrib_pct)
                 FILTER (WHERE contrib.price_date >= date_trunc('year'::text, CURRENT_DATE::timestamp with time zone)::date), 3) AS contrib_ytd,
           round(sum(contrib.contrib_pct), 3) AS contrib_since_entry,
           min(contrib.price_date) AS series_start,
           max(contrib.price_date) AS series_end,
           count(*) AS observations
      FROM contrib
     WHERE contrib.contrib_pct IS NOT NULL
     GROUP BY contrib.symbol
)
SELECT h.symbol,
       a.contrib_today,
       a.contrib_ytd,
       a.contrib_since_entry,
       a.series_start,
       a.series_end,
       COALESCE(a.observations, 0::bigint) AS observations,
       a.symbol IS NOT NULL AS covered,
       CASE
           WHEN a.symbol IS NOT NULL THEN NULL::text
           WHEN NOT (EXISTS (SELECT 1
                               FROM vw_filled_transactions t
                               JOIN assets s ON s.id = t.asset_id
                              WHERE s.symbol = h.symbol)) THEN 'no_transaction_history'::text
           ELSE 'no_priced_position_days'::text
       END AS coverage_reason,
       h.weight_pct AS actual_weight_pct,
       round(100.0 * sum(h.weight_pct) FILTER (WHERE a.symbol IS NOT NULL) OVER ()
             / NULLIF(sum(h.weight_pct) OVER (), 0::numeric), 2) AS nav_coverage_pct,
       now() AS computed_at
  FROM vw_nexus_holdings h
  LEFT JOIN agg a ON a.symbol = h.symbol;

CREATE UNIQUE INDEX mv_bench_contribution_symbol_uniq
    ON public.mv_bench_contribution (symbol);

GRANT SELECT ON public.mv_bench_contribution TO anon, authenticated, service_role;

-- The view keeps its name and shape; only what it reads changes, so every
-- consumer follows without a redeploy.
CREATE OR REPLACE VIEW public.vw_bench_contribution AS
    SELECT symbol, contrib_today, contrib_ytd, contrib_since_entry,
           series_start, series_end, observations, covered, coverage_reason,
           actual_weight_pct, nav_coverage_pct, computed_at
      FROM public.mv_bench_contribution;

COMMENT ON VIEW public.vw_bench_contribution IS
'Per-holding contribution to book return, served from mv_bench_contribution '
'(refreshed every 10 minutes beside mv_nexus_holdings). Read by '
'/api/nexus-bench over the anon role, so it lives under a 3s statement '
'timeout - it was 13.9s and cancelled on every call for over a week. '
'`computed_at` says how old the reading is.';

-- Refreshed on the same 10-minute job as the holdings matview it joins to,
-- so the two can never describe different books.
CREATE OR REPLACE FUNCTION public.refresh_nexus_holdings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_nexus_holdings;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bench_contribution;
END;
$function$;
