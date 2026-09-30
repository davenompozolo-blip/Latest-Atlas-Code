-- Step 1 — vw_position_nav_daily: 6,161 ms -> 642 ms.
--
-- The engine's own substrate, and the heaviest read in either the Performance
-- or Risk module. Measured against anon's 3s cap it failed on any cold cache.
--
-- EXPLAIN found three problems, two of them fixed here.
--
-- 1. THE PRICE JOIN WAS NEVER BOUND TO HELD ASSETS  (4,244 ms of 6,161)
--
--      Hash (rows=496553)  Batches: 8  temp written=2572
--        -> Seq Scan on price_history  Filter: interval = '1d'
--
--    The final LEFT JOIN hashed the ENTIRE price_history table -- all 496,553
--    rows of the 1,724-name universe -- to serve 10,207 rows belonging to 99
--    held assets, spilling to disk across 8 batches. This is exactly the rule
--    already written down on 2026-08-11 ("filter price_history to the assets
--    you will actually return"); the sweep that fixed the other views did not
--    reach this join.
--
--    Replaced with a LATERAL top-1, which forces a unique-index lookup per row
--    off price_history_asset_date_interval_uniq: 10,207 probes at ~0.010 ms
--    instead of one 496k-row hash.
--
-- 2. THE HOLDINGS SUBQUERY RAN THREE TIMES PER ROW  (~1,030 ms)
--
--    `quantity` was a correlated scalar subquery, referenced three times in the
--    output -- once for quantity, once for position_value, once in the WHERE.
--    Postgres evaluated it three times: SubPlan 3, 4 and 5, 32,255 executions
--    in total, each scanning and sorting the cumulative_holdings CTE.
--
--    Promoted to a LEFT JOIN LATERAL so it is computed once per grid row
--    (11,841 executions) and referenced freely.
--
-- 3. STILL OPEN, deliberately not fixed here.
--
--    trading_days does an Index Only Scan with Heap Fetches: 70,163 -- the
--    visibility map is stale, so it is not actually index-only. A VACUUM on
--    price_history addresses that and benefits every view over the table; it
--    cannot run inside a migration.
--
--    The LATERAL subplan is now the largest remaining cost (~390 ms). Turning
--    cumulative_holdings into validity ranges and range-joining would remove it
--    entirely, but 642 ms leaves 4.7x headroom under the anon cap and the memo
--    moves this computation into the nightly job at step 2 regardless. Not
--    worth the rewrite now.
--
-- Proved equivalent by EXCEPT both ways before applying: 0 lost, 0 gained,
-- 10,207 rows each side.
--
-- Note on benchmarking: `select count(*)` shows almost no difference between
-- the two definitions, because it lets the planner elide the very joins this
-- fixes. The numbers above are from `explain analyze select *`.
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

drop view if exists public.vw_position_nav_daily_new;
