-- Contribution, step 3 of 3: materialise it, and refresh it on the job that
-- already refreshes the holdings it is derived from.
--
-- Steps 1 and 2 took vw_bench_contribution from 13,550 ms to ~620 ms, which
-- clears anon's 3,000 ms cap warm. It does not clear it reliably: the view
-- walks vw_position_nav_daily over the whole history of every held name, and
-- CLAUDE.md already records twice what "under the cap warm" is worth -- a mean
-- under the cap is not a fix, and the failures land per call on whichever load
-- hits a colder buffer cache.
--
-- The refresh is free in wall-clock terms: refresh_nexus_holdings() already
-- runs every 10 minutes for mv_nexus_holdings, and this view's inputs
-- (price_history, positions) are the same inputs on the same cadence. So the
-- matview is never staler than the holdings feed beside it, and CONCURRENTLY
-- means readers are never blocked by the refresh.
--
-- computed_at is published so a consumer can say how old the figure is rather
-- than assume it is live. now() is evaluated at refresh time, which is exactly
-- the timestamp wanted.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_bench_contribution AS
WITH daily AS (
    SELECT v.price_date,
           v.symbol,
           sum(v.position_value) AS pos_val,
           max(v.close_price)    AS close_price
      FROM public.vw_position_nav_daily v
     WHERE v.close_price IS NOT NULL AND v.position_value IS NOT NULL
     GROUP BY v.price_date, v.symbol
),
-- Book NAV per day as a window over `daily`, not a join back to it. The
-- self-join cost 12.1 s of a 13.9 s run: a CTE that only aggregates another
-- CTE gives the planner no row estimate to work with (rows=1), and the
-- nested loop it chose from that estimate is unbounded.
daily_nav AS (
    SELECT d.price_date, d.symbol, d.pos_val, d.close_price,
           sum(d.pos_val) OVER (PARTITION BY d.price_date) AS total_nav
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
    SELECT price_date, symbol,
           (close_price / prev_close - 1::numeric)
             * (prev_pos_val / prev_nav) * 100::numeric AS contrib_pct
      FROM seq
     WHERE prev_close > 0::numeric
       AND prev_nav   > 0::numeric
       AND prev_pos_val IS NOT NULL
),
last_day AS (
    SELECT max(price_date) AS d FROM contrib WHERE contrib_pct IS NOT NULL
),
agg AS (
    SELECT symbol,
           round(COALESCE(sum(contrib_pct)
                   FILTER (WHERE price_date = (SELECT d FROM last_day)), 0::numeric), 3)
             AS contrib_today,
           round(sum(contrib_pct)
                   FILTER (WHERE price_date
                                 >= date_trunc('year', CURRENT_DATE::timestamptz)::date), 3)
             AS contrib_ytd,
           round(sum(contrib_pct), 3) AS contrib_since_entry,
           min(price_date) AS series_start,
           max(price_date) AS series_end,
           count(*)        AS observations
      FROM contrib
     WHERE contrib_pct IS NOT NULL
     GROUP BY symbol
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
           WHEN NOT EXISTS (SELECT 1
                              FROM public.vw_filled_transactions t
                              JOIN public.assets s ON s.id = t.asset_id
                             WHERE s.symbol = h.symbol) THEN 'no_transaction_history'
           ELSE 'no_priced_position_days'
       END AS coverage_reason,
       h.weight_pct AS actual_weight_pct,
       -- One read of vw_nexus_holdings, not two. The coverage percentage was a
       -- second CROSS JOINed pass over the same rows; as a window over the
       -- rows already in hand it is free.
       round(100.0 * sum(h.weight_pct) FILTER (WHERE a.symbol IS NOT NULL) OVER ()
             / NULLIF(sum(h.weight_pct) OVER (), 0::numeric), 2) AS nav_coverage_pct,
       now() AS computed_at
  FROM public.vw_nexus_holdings h
  LEFT JOIN agg a ON a.symbol = h.symbol;

-- REFRESH ... CONCURRENTLY requires a unique index. symbol is unique because
-- vw_nexus_holdings carries one row per held name.
CREATE UNIQUE INDEX IF NOT EXISTS mv_bench_contribution_symbol_uniq
    ON public.mv_bench_contribution (symbol);

-- The view keeps its name and its column list, so no consumer changes. It is
-- now a pass-through, which is what makes the matview swappable.
CREATE OR REPLACE VIEW public.vw_bench_contribution AS
SELECT symbol,
       contrib_today,
       contrib_ytd,
       contrib_since_entry,
       series_start,
       series_end,
       observations,
       covered,
       coverage_reason,
       actual_weight_pct,
       nav_coverage_pct,
       computed_at
  FROM public.mv_bench_contribution;

GRANT SELECT ON public.vw_bench_contribution TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_nexus_holdings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_nexus_holdings;
  -- Ordered, not simultaneous: mv_bench_contribution reads vw_nexus_holdings,
  -- which reads mv_nexus_holdings. Refreshing them the other way round would
  -- publish a contribution set derived from the previous holdings snapshot.
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_bench_contribution;
END;
$function$;
