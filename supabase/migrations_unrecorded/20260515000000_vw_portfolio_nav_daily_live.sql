-- Migration: vw_portfolio_nav_daily — add live intraday point from account_snapshots
--
-- Previously this view read only from portfolio_equity_curve (nightly sync),
-- meaning the chart always showed yesterday's close as the latest point.
--
-- account_snapshots is populated every 5 minutes by sync-alpaca-positions (cron job 6).
-- This rewrite UNIONs the historical daily closes with today's latest snapshot so the
-- chart shows the current intraday value, refreshing automatically every 5 minutes.
--
-- Logic:
--   today_live  — most recent account_snapshots row for CURRENT_DATE
--   historical  — all portfolio_equity_curve rows where date < CURRENT_DATE
--   combined    — today_live overrides any historical row for today's date

CREATE OR REPLACE VIEW vw_portfolio_nav_daily AS
WITH
historical AS (
  SELECT DISTINCT ON (portfolio_id, ts::date)
    portfolio_id,
    ts::date      AS price_date,
    equity
  FROM portfolio_equity_curve
  WHERE timeframe = '1D'
    AND equity IS NOT NULL
    AND equity > 0
  ORDER BY portfolio_id, ts::date, ts DESC
),
today_live AS (
  SELECT DISTINCT ON (portfolio_id)
    portfolio_id,
    as_of::date   AS price_date,
    equity
  FROM account_snapshots
  WHERE as_of::date = CURRENT_DATE
    AND equity IS NOT NULL
    AND equity > 0
  ORDER BY portfolio_id, as_of DESC
),
combined AS (
  SELECT portfolio_id, price_date, equity FROM today_live
  UNION ALL
  SELECT portfolio_id, price_date, equity FROM historical
  WHERE price_date < CURRENT_DATE
)
SELECT
  portfolio_id,
  price_date,
  equity AS nav,
  (equity - lag(equity) OVER (PARTITION BY portfolio_id ORDER BY price_date))
    / NULLIF(lag(equity) OVER (PARTITION BY portfolio_id ORDER BY price_date), 0) AS daily_return,
  NULL::integer AS position_count
FROM combined
ORDER BY portfolio_id, price_date;
