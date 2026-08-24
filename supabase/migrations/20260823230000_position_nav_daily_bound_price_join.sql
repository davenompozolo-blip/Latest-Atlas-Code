-- Step 1 — vw_position_nav_daily: 6,161 ms -> 557 ms.
--
-- The engine's own substrate, and the heaviest read in either the Performance
-- or Risk module. Against anon's 3s cap it failed on any cold cache.
--
-- EXPLAIN found three problems.
--
-- 1. THE PRICE JOIN WAS NEVER BOUND TO HELD ASSETS  (4,244 ms of 6,161)
--
--      Hash (rows=496553)  Batches: 8  temp written=2572
--        -> Seq Scan on price_history  Filter: interval = '1d'
--
--    The final LEFT JOIN hashed the ENTIRE price_history table -- all 496,553
--    rows of the 1,724-name universe -- to serve 10,207 rows belonging to 99
--    held assets, spilling to disk across 8 batches. This is exactly the rule
--    written down on 2026-08-11 ("filter price_history to the assets you will
--    actually return"); the sweep that fixed the other views did not reach
--    this join, because it is a plain equijoin rather than a ranked CTE.
--
--    Replaced with a LATERAL top-1, forcing a unique-index lookup per row off
--    price_history_asset_date_interval_uniq: 10,207 probes at ~0.003 ms each
--    instead of one 496k-row hash.
--
-- 2. THE HOLDINGS SUBQUERY RAN THREE TIMES PER ROW  (~1,030 ms)
--
--    `quantity` was a correlated scalar subquery referenced three times in the
--    output -- quantity, position_value, and the WHERE filter. Postgres
--    evaluated it three times: SubPlan 3, 4 and 5, 32,255 executions in total,
--    each scanning and sorting the cumulative_holdings CTE.
--
--    Promoted to a LEFT JOIN LATERAL so it is computed once per grid row
--    (11,841 executions) and referenced freely.
--
--    A scalar subquery is not memoised across references. If you use one more
--    than once, promote it.
--
-- 3. THE INDEX ONLY SCAN WAS NOT INDEX-ONLY  (Heap Fetches: 70,163)
--
--    trading_days showed an Index Only Scan with 70,163 heap fetches -- the
--    visibility map was stale, so every "index-only" row still visited the
--    heap. Fixed by VACUUM (ANALYZE) on price_history, which cannot run inside
--    a migration and so is not in this file. After it: Heap Fetches 0, and the
--    per-row price probe fell from 0.010 ms to 0.003 ms.
--
--    That vacuum also took vw_risk_analysis from 1,362 ms to 327 ms without
--    any change to the view. price_history now gains ~1,700 rows a night from
--    the universe sync, so this is worth keeping an eye on rather than
--    treating as one-off.
--
-- Proved equivalent by EXCEPT both ways before applying: 0 lost, 0 gained,
-- 10,207 rows each side.
--
-- Benchmarking note: `select count(*)` shows almost no difference between the
-- two definitions, because it lets the planner elide the very joins this
-- fixes. Measure with `explain analyze select *`, or count over a subquery
-- that forces materialisation.
create or replace view public.vw_position_nav_daily as
 WITH signed_transactions AS (
         SELECT t.portfolio_id, t.asset_id, t.transaction_date::date AS tx_date,
                CASE
                    WHEN lower(t.transaction_type) ~~ '%sell%'::text THEN - abs(t.quantity)
                    WHEN lower(t.transaction_type) ~~ '%buy%'::text THEN abs(t.quantity)
                    WHEN lower(t.transaction_type) = 'fill'::text THEN t.quantity
                    ELSE 0::numeric
                END AS signed_qty
           FROM transactions t
             JOIN assets a_1 ON a_1.id = t.asset_id
          WHERE a_1.symbol <> '$CASH'::text
        ), daily_net AS (
         SELECT portfolio_id, asset_id, tx_date, sum(signed_qty) AS net_qty
           FROM signed_transactions
          GROUP BY portfolio_id, asset_id, tx_date
        ), cumulative_holdings AS (
         SELECT portfolio_id, asset_id, tx_date,
            sum(net_qty) OVER (PARTITION BY portfolio_id, asset_id ORDER BY tx_date
                               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_qty
           FROM daily_net
        ), asset_lifespan AS (
         SELECT portfolio_id, asset_id, min(tx_date) AS start_date
           FROM cumulative_holdings
          WHERE running_qty <> 0::numeric
          GROUP BY portfolio_id, asset_id
        ), trading_days AS (
         SELECT DISTINCT price_history.price_date AS cal_date
           FROM price_history
          WHERE price_history."interval" = '1d'::text
            AND (price_history.asset_id IN ( SELECT asset_lifespan.asset_id FROM asset_lifespan))
        ), holdings_grid AS (
         SELECT al.portfolio_id, al.asset_id, td.cal_date
           FROM asset_lifespan al
             JOIN trading_days td ON td.cal_date >= al.start_date AND td.cal_date <= CURRENT_DATE
        ), daily_holdings AS (
         SELECT hg.portfolio_id, hg.asset_id, hg.cal_date, q.running_qty AS quantity
           FROM holdings_grid hg
           LEFT JOIN LATERAL (
                SELECT ch.running_qty
                  FROM cumulative_holdings ch
                 WHERE ch.portfolio_id = hg.portfolio_id
                   AND ch.asset_id = hg.asset_id
                   AND ch.tx_date <= hg.cal_date
                 ORDER BY ch.tx_date DESC
                 LIMIT 1
           ) q ON true
        )
 SELECT dh.portfolio_id, dh.asset_id, a.symbol, a.asset_class,
    dh.cal_date AS price_date,
    COALESCE(dh.quantity, 0::numeric) AS quantity,
    px.close AS close_price,
    COALESCE(dh.quantity, 0::numeric) * px.close AS position_value
   FROM daily_holdings dh
     JOIN assets a ON a.id = dh.asset_id
     LEFT JOIN LATERAL (
          SELECT ph.close
            FROM price_history ph
           WHERE ph.asset_id = dh.asset_id
             AND ph.price_date = dh.cal_date
             AND ph."interval" = '1d'::text
           LIMIT 1
     ) px ON true
  WHERE COALESCE(dh.quantity, 0::numeric) <> 0::numeric;
