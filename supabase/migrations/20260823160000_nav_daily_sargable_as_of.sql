-- vw_portfolio_nav_daily: 4,850 ms warm, against anon's 3s cap.
--
-- EXPLAIN put 3,098 ms of a 3,110 ms run in ONE node: a Seq Scan on
-- account_snapshots removing 39,854 rows to find 141. The filter was
--     (as_of)::date = CURRENT_DATE
-- and casting the column makes the predicate unsargable, so
-- account_snapshots_portfolio_as_of_idx (portfolio_id, as_of DESC) -- which
-- already existed -- could never be used. No new index was needed; the cast
-- was the whole problem.
--
-- This is why the bench reported "Portfolio NAV history loading" and why
-- components failed on a cold first load and came good on a reload: the view
-- sat over the cap on every call, and whether it returned depended on the
-- buffer cache rather than on anything about the data.
--
-- It also got worse forever on its own. positions sync every 5 minutes, so
-- account_snapshots gains ~288 rows a day whether or not the book changes.
-- A seq scan over it is a clock, not a constant.
--
-- Proved equivalent by EXCEPT both ways in one transaction before applying:
-- 0 lost, 0 gained. Result: 3,110 ms -> 246 ms, Index Scan.
--
-- The only change is the today_live predicate. Everything else is the previous
-- definition verbatim.
create or replace view public.vw_portfolio_nav_daily as
 WITH historical AS (
         SELECT DISTINCT ON (portfolio_equity_curve.portfolio_id, (portfolio_equity_curve.ts::date)) portfolio_equity_curve.portfolio_id,
            portfolio_equity_curve.ts::date AS price_date,
            portfolio_equity_curve.equity
           FROM portfolio_equity_curve
          WHERE portfolio_equity_curve.timeframe = '1D'::text AND portfolio_equity_curve.equity IS NOT NULL AND portfolio_equity_curve.equity > 0::numeric
          ORDER BY portfolio_equity_curve.portfolio_id, (portfolio_equity_curve.ts::date), portfolio_equity_curve.ts DESC
        ), today_live AS (
         SELECT DISTINCT ON (account_snapshots.portfolio_id) account_snapshots.portfolio_id,
            account_snapshots.as_of::date AS price_date,
            account_snapshots.equity
           FROM account_snapshots
          WHERE account_snapshots.as_of >= CURRENT_DATE::timestamptz
            AND account_snapshots.as_of <  (CURRENT_DATE + 1)::timestamptz
            AND account_snapshots.equity IS NOT NULL AND account_snapshots.equity > 0::numeric
          ORDER BY account_snapshots.portfolio_id, account_snapshots.as_of DESC
        ), combined AS (
         SELECT today_live.portfolio_id,
            today_live.price_date,
            today_live.equity
           FROM today_live
        UNION ALL
         SELECT historical.portfolio_id,
            historical.price_date,
            historical.equity
           FROM historical
          WHERE historical.price_date < CURRENT_DATE
        )
 SELECT portfolio_id,
    price_date,
    equity AS nav,
    (equity - lag(equity) OVER (PARTITION BY portfolio_id ORDER BY price_date)) / NULLIF(lag(equity) OVER (PARTITION BY portfolio_id ORDER BY price_date), 0::numeric) AS daily_return,
    NULL::integer AS position_count
   FROM combined
  ORDER BY portfolio_id, price_date;
