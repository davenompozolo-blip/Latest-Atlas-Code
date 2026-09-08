-- ============================================================
-- `vw_bench_contribution` was 13.9s against anon's 3s cap
-- ------------------------------------------------------------
-- The Nexus Contribution panel read "No measurable contribution. 61 holdings
-- (99.97% of book) not measurable - outside the contribution view" for over a
-- week. The view was healthy the whole time: 61 rows, all covered, real
-- numbers. It was being CANCELLED.
--
--   GET /rest/v1/vw_bench_contribution -> 500 {"code":"57014",
--                     "message":"canceling statement due to statement timeout"}
--
-- Fourth instance of a pattern this file already documents: a view fast enough
-- for `service_role` (300s) and impossible for `anon` (3s), whose failure the
-- UI renders as missing data rather than as a failure.
--
-- ## The cost was one avoidable join
--
-- `seq` joined `daily` to `nav`, where `nav` is nothing but a per-date total
-- OVER `daily`. Both are CTEs, so the planner estimated `rows=1` for each and
-- chose a nested loop - rescanning `nav` once per row of `daily`:
--
--   Nested Loop (actual time=1411.665..13530.143 rows=9249)
--
-- 12.1 of the 13.9 seconds in that one node. A per-date total does not need a
-- join; it is a window. seq stage: 13,550 ms -> 622 ms.
--
-- Proven identical before applying (EXCEPT both ways, `old_not_new = 0`).
--
-- **A CTE that only aggregates another CTE is a window function.** The join is
-- where the planner loses the row estimate, and a nested loop over a
-- misestimated CTE is unbounded in the size of the outer side.
-- ============================================================

CREATE OR REPLACE VIEW public.vw_bench_contribution AS
WITH daily AS (
    SELECT v.price_date, v.symbol,
           sum(v.position_value) AS pos_val, max(v.close_price) AS close_price
      FROM vw_position_nav_daily v
     WHERE v.close_price IS NOT NULL AND v.position_value IS NOT NULL
     GROUP BY v.price_date, v.symbol
),
daily_nav AS (
    SELECT d.*, sum(d.pos_val) OVER (PARTITION BY d.price_date) AS total_nav FROM daily d
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
      FROM contrib WHERE contrib.contrib_pct IS NOT NULL GROUP BY contrib.symbol
),
coverage AS (
    SELECT round(100.0 * sum(h_1.weight_pct) FILTER (WHERE a_1.symbol IS NOT NULL)
                 / NULLIF(sum(h_1.weight_pct), 0::numeric), 2) AS nav_coverage_pct
      FROM vw_nexus_holdings h_1 LEFT JOIN agg a_1 ON a_1.symbol = h_1.symbol
)
SELECT h.symbol, a.contrib_today, a.contrib_ytd, a.contrib_since_entry,
       a.series_start, a.series_end, COALESCE(a.observations, 0::bigint) AS observations,
       a.symbol IS NOT NULL AS covered,
       CASE WHEN a.symbol IS NOT NULL THEN NULL::text
            WHEN NOT (EXISTS (SELECT 1 FROM vw_filled_transactions t
                                JOIN assets s ON s.id = t.asset_id
                               WHERE s.symbol = h.symbol)) THEN 'no_transaction_history'::text
            ELSE 'no_priced_position_days'::text END AS coverage_reason,
       h.weight_pct AS actual_weight_pct, cv.nav_coverage_pct
  FROM vw_nexus_holdings h
  LEFT JOIN agg a ON a.symbol = h.symbol
  CROSS JOIN coverage cv;
