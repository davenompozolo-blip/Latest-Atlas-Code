-- Migration: vw_portfolio_home — use live intraday prices from positions table
--
-- Previously latest_prices read from price_history (updated nightly at 22:00 UTC),
-- meaning current_price was always yesterday's close.
--
-- positions.market_value is updated every 5 minutes by sync-alpaca-positions.
-- abs(market_value) / abs(quantity) = implied live price per share.
--
-- Changes:
--   latest_prices  — primary: positions live implied price; fallback: price_history rn=1
--   prev_day_prices — rn=1 (was rn=2): price_history[0] is now "prev close" since today is live
--   five_day_prices — rn=5 (was rn=6): same shift

-- Must DROP first; CREATE OR REPLACE cannot change column data types
DROP VIEW IF EXISTS vw_portfolio_home CASCADE;

CREATE VIEW vw_portfolio_home AS
WITH
latest_pos_snapshot AS (
  SELECT DISTINCT ON (p.asset_id)
    p.asset_id,
    p.quantity,
    p.average_cost,
    p.market_value,
    p.as_of_date,
    p.side
  FROM positions p
  JOIN assets a ON a.id = p.asset_id
  WHERE p.as_of_date >= (SELECT MAX(as_of_date) - 2 FROM positions)
    AND NOT (
      a.asset_class = 'option'
      AND a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
      AND to_date(substring(a.symbol, '(\d{6})[CP]'), 'YYMMDD') < CURRENT_DATE
    )
  ORDER BY p.asset_id, p.as_of_date DESC
),
latest_pos AS (
  SELECT *
  FROM latest_pos_snapshot
  WHERE quantity IS NOT NULL
    AND quantity <> 0
    AND (market_value IS NULL OR abs(market_value) > 0.01)
),
ranked_prices AS (
  SELECT
    asset_id,
    close,
    price_date,
    row_number() OVER (PARTITION BY asset_id ORDER BY price_date DESC) AS rn
  FROM price_history
  WHERE "interval" = '1d'
),
-- Live intraday price = implied from positions market_value / quantity.
-- Falls back to most-recent price_history close when positions data is absent.
latest_prices AS (
  SELECT
    lp.asset_id,
    COALESCE(
      CASE WHEN ABS(lp.quantity) > 0 THEN ABS(lp.market_value) / ABS(lp.quantity) END,
      rp.close
    ) AS current_price,
    COALESCE(lp.as_of_date, rp.price_date) AS price_date
  FROM latest_pos lp
  LEFT JOIN ranked_prices rp ON rp.asset_id = lp.asset_id AND rp.rn = 1
),
-- rn=1 is now "prev close" because today's live price comes from positions above
prev_day_prices AS (
  SELECT asset_id, close AS prev_close
  FROM ranked_prices
  WHERE rn = 1
),
-- rn=5 is now the 5-trading-day-ago close (shifted by one from the old rn=6)
five_day_prices AS (
  SELECT asset_id, close AS close_5d
  FROM ranked_prices
  WHERE rn = 5
),
latest_account AS (
  SELECT DISTINCT ON (portfolio_id)
    portfolio_id,
    equity,
    cash,
    buying_power,
    long_market_value,
    short_market_value
  FROM account_snapshots
  ORDER BY portfolio_id, as_of DESC
),
returns AS (
  SELECT
    ph.asset_id,
    (ph.close - lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date))
      / NULLIF(lag(ph.close) OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date), 0) AS daily_return
  FROM price_history ph
  WHERE ph."interval" = '1d'
),
stats AS (
  SELECT
    asset_id,
    count(*)           AS trading_days,
    avg(daily_return)  AS mu,
    stddev(daily_return) AS sigma
  FROM returns
  WHERE daily_return IS NOT NULL
  GROUP BY asset_id
),
nav AS (
  SELECT
    COALESCE(
      (SELECT equity FROM latest_account LIMIT 1),
      (SELECT SUM(market_value) FROM latest_pos)
    ) AS total_nav,
    (SELECT cash             FROM latest_account LIMIT 1) AS cash_balance,
    (SELECT buying_power     FROM latest_account LIMIT 1) AS buying_power,
    (SELECT long_market_value  FROM latest_account LIMIT 1) AS long_mv,
    (SELECT short_market_value FROM latest_account LIMIT 1) AS short_mv
),
hhi AS (
  SELECT
    SUM(POWER(ABS(p.market_value) / NULLIF((SELECT total_nav FROM nav), 0), 2)) AS hhi_score,
    COUNT(*) AS n_positions
  FROM latest_pos p
)
SELECT
  a.symbol,
  a.name,
  a.asset_class,
  a.sector,
  p.side,
  CASE WHEN p.side = 'short' THEN -ABS(p.quantity) ELSE p.quantity END AS quantity,
  p.average_cost AS cost_basis,
  lp.current_price,
  p.market_value,
  CASE
    WHEN pdp.prev_close IS NOT NULL AND pdp.prev_close > 0
    THEN (lp.current_price - pdp.prev_close) / pdp.prev_close
  END AS daily_change_pct,
  CASE
    WHEN fdp.close_5d IS NOT NULL AND fdp.close_5d > 0
    THEN (lp.current_price - fdp.close_5d) / fdp.close_5d
  END AS return_5d_pct,
  CASE
    WHEN p.side = 'short' THEN (p.average_cost - lp.current_price) * ABS(p.quantity)
    ELSE                       (lp.current_price - p.average_cost) * ABS(p.quantity)
  END AS total_gain_loss_dollar,
  ABS(p.market_value) / NULLIF(nav.total_nav, 0)                                         AS weight_equity_pct,
  ABS(p.market_value) / NULLIF(COALESCE(nav.long_mv, 0) + ABS(COALESCE(nav.short_mv, 0)), 0) AS weight_gross_pct,
  GREATEST(0, LEAST(100, ROUND(
    30.0 * LEAST(1.0, GREATEST(0.0, COALESCE(s.mu / NULLIF(s.sigma, 0) * SQRT(252.0), 0.0) / 2.0))
  + 20.0 * GREATEST(0.0, 1.0 - LEAST(1.0, COALESCE(s.sigma * SQRT(252.0), 0.5) / 0.5))
  + 30.0 * LEAST(1.0, GREATEST(0.0,
      (COALESCE(
        CASE WHEN p.side = 'short'
          THEN (p.average_cost - lp.current_price) / NULLIF(p.average_cost, 0)
          ELSE (lp.current_price - p.average_cost) / NULLIF(p.average_cost, 0)
        END, 0.0) + 0.10) / 0.30))
  + CASE WHEN (ABS(p.market_value) / NULLIF(nav.total_nav, 0)) > 0.10 THEN 6.0 ELSE 20.0 END
  ))) AS quality_score,
  CASE
    WHEN p.side = 'short' THEN (p.average_cost - lp.current_price) / NULLIF(p.average_cost, 0)
    ELSE                       (lp.current_price - p.average_cost) / NULLIF(p.average_cost, 0)
  END AS unrealised_return_pct,
  ABS(p.market_value) / NULLIF(nav.total_nav, 0)            AS portfolio_weight,
  s.sigma::double precision * SQRT(252::double precision)    AS annualised_vol,
  (s.mu / NULLIF(s.sigma, 0))::double precision * SQRT(252::double precision) AS sharpe_approx,
  h.hhi_score,
  h.n_positions,
  CASE WHEN (ABS(p.market_value) / NULLIF(nav.total_nav, 0)) > 0.10 THEN true ELSE false END AS is_concentrated,
  lp.price_date,
  nav.total_nav        AS portfolio_nav,
  nav.cash_balance,
  nav.buying_power,
  nav.long_mv          AS long_market_value,
  nav.short_mv         AS short_market_value
FROM latest_pos p
JOIN  assets          a   ON a.id         = p.asset_id
LEFT JOIN latest_prices   lp  ON lp.asset_id  = p.asset_id
LEFT JOIN prev_day_prices pdp ON pdp.asset_id = p.asset_id
LEFT JOIN five_day_prices fdp ON fdp.asset_id = p.asset_id
LEFT JOIN stats           s   ON s.asset_id   = p.asset_id
CROSS JOIN nav
CROSS JOIN hhi h
ORDER BY ABS(p.market_value) DESC NULLS LAST;
