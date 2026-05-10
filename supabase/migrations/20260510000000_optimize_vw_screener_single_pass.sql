-- ─────────────────────────────────────────────────────────────────────────────
-- VIEW: vw_screener (optimized — single-pass rewrite)
--
-- Root cause of statement timeout: the original view joined three separate
-- heavy views (vw_quant_dashboard, vw_quant_rolling_returns, vw_quant_drawdown)
-- each of which did a full unfiltered scan of price_history with window
-- functions → effectively 3 full table scans chained together.
--
-- Fix: one self-contained query that filters price_history to portfolio assets
-- upfront, then computes all metrics (MAs, RSI, rolling returns, drawdown, vol)
-- in a single pass. No joins to other views.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_screener AS
WITH
-- Active (non-expired-option) portfolio holdings
latest_pos AS (
  SELECT DISTINCT ON (p.asset_id) p.asset_id
  FROM positions p
  JOIN assets a ON a.id = p.asset_id
  WHERE p.quantity <> 0
    AND p.as_of_date >= (SELECT MAX(as_of_date) - 7 FROM positions)
    AND NOT (
      a.asset_class = 'option'
      AND a.symbol ~ '^[A-Z.]{1,6}\d{6}[CP]\d{8}$'
      AND to_date(substring(a.symbol FROM '(\d{6})[CP]'), 'YYMMDD') < CURRENT_DATE
    )
  ORDER BY p.asset_id, p.as_of_date DESC
),
-- ONE scan of price_history, filtered to portfolio assets only
ranked AS (
  SELECT
    ph.asset_id,
    ph.price_date,
    ph.close,
    ph.high,
    ph.low,
    ROW_NUMBER() OVER (PARTITION BY ph.asset_id ORDER BY ph.price_date DESC) AS rn
  FROM price_history ph
  WHERE ph.interval = '1d'
    AND ph.asset_id IN (SELECT asset_id FROM latest_pos)
),
-- Daily changes for RSI + vol (reuses ranked, no extra scan)
daily_chg AS (
  SELECT
    asset_id,
    price_date,
    rn,
    close - LAG(close) OVER (PARTITION BY asset_id ORDER BY price_date)     AS chg,
    (close - LAG(close) OVER (PARTITION BY asset_id ORDER BY price_date))
      / NULLIF(LAG(close) OVER (PARTITION BY asset_id ORDER BY price_date), 0) AS ret
  FROM ranked
),
-- All price-based stats in one GROUP BY
price_stats AS (
  SELECT
    asset_id,
    MAX(close) FILTER (WHERE rn = 1)    AS current_price,
    MAX(close) FILTER (WHERE rn = 2)    AS p_1d,
    MAX(close) FILTER (WHERE rn = 5)    AS p_1w,
    MAX(close) FILTER (WHERE rn = 21)   AS p_1m,
    MAX(close) FILTER (WHERE rn = 63)   AS p_3m,
    MAX(close) FILTER (WHERE rn = 126)  AS p_6m,
    MAX(close) FILTER (WHERE rn = 252)  AS p_1y,
    AVG(close)  FILTER (WHERE rn <= 20)  AS ma_20,
    AVG(close)  FILTER (WHERE rn <= 50)  AS ma_50,
    AVG(close)  FILTER (WHERE rn <= 200) AS ma_200,
    MAX(close)  FILTER (WHERE rn <= 252) AS high_52w,
    MIN(close)  FILTER (WHERE rn <= 252) AS low_52w,
    STDDEV(close) FILTER (WHERE rn <= 20) AS stddev_20,
    AVG(high - low) FILTER (WHERE rn <= 14) AS atr_14
  FROM ranked
  GROUP BY asset_id
),
-- Volatility (20d and 60d) from daily returns
vol_stats AS (
  SELECT
    asset_id,
    STDDEV(ret) FILTER (WHERE rn <= 21 AND ret IS NOT NULL) AS vol_20d,
    STDDEV(ret) FILTER (WHERE rn <= 63 AND ret IS NOT NULL) AS vol_60d
  FROM daily_chg
  GROUP BY asset_id
),
-- RSI-14 (simple avg gain/loss over last 14 changes)
rsi_calc AS (
  SELECT
    asset_id,
    CASE
      WHEN ABS(AVG(LEAST(chg, 0))    FILTER (WHERE rn BETWEEN 1 AND 14)) = 0
        THEN 100.0
      WHEN AVG(GREATEST(chg, 0)) FILTER (WHERE rn BETWEEN 1 AND 14) = 0
        THEN 0.0
      ELSE ROUND((100 - 100.0 / (1 +
        AVG(GREATEST(chg, 0)) FILTER (WHERE rn BETWEEN 1 AND 14)
        / NULLIF(ABS(AVG(LEAST(chg, 0)) FILTER (WHERE rn BETWEEN 1 AND 14)), 0)
      ))::numeric, 1)
    END AS rsi_14
  FROM daily_chg
  GROUP BY asset_id
),
-- Current drawdown vs running ATH (full history, not capped at 252)
drawdown AS (
  SELECT DISTINCT ON (asset_id)
    asset_id,
    ROUND((
      (close / NULLIF(
        MAX(close) OVER (PARTITION BY asset_id ORDER BY price_date
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ), 0) - 1) * 100
    )::numeric, 2) AS current_drawdown_pct
  FROM ranked
  ORDER BY asset_id, price_date DESC
),
-- YTD start price (small second scan, already asset-filtered)
ytd_price AS (
  SELECT DISTINCT ON (ph.asset_id)
    ph.asset_id, ph.close AS p_ytd
  FROM price_history ph
  WHERE ph.interval = '1d'
    AND ph.price_date >= date_trunc('year', CURRENT_DATE)::date
    AND ph.asset_id IN (SELECT asset_id FROM latest_pos)
  ORDER BY ph.asset_id, ph.price_date ASC
),
-- Fundamentals from equity_cache JSON
fundamentals AS (
  SELECT
    ec.symbol,
    (ec.payload->>'PERatio')::numeric            AS pe_ratio,
    (ec.payload->>'EVToEBITDA')::numeric         AS ev_ebitda,
    (ec.payload->>'PriceToBookRatio')::numeric   AS pb_ratio,
    (ec.payload->>'DividendYield')::numeric      AS div_yield,
    (ec.payload->>'ReturnOnEquityTTM')::numeric  AS roe,
    (ec.payload->>'RevenueGrowthYOY')::numeric   AS revenue_growth,
    (ec.payload->>'MarketCapitalization')::bigint AS market_cap_raw,
    (ec.payload->>'Sector')                      AS av_sector,
    (ec.payload->>'Industry')                    AS industry,
    (ec.payload->>'Country')                     AS country,
    (ec.payload->>'Exchange')                    AS exchange,
    (ec.payload->>'NextEarningsDate')::date      AS next_earnings,
    (ec.payload->>'AnalystTargetPrice')::numeric AS analyst_target
  FROM equity_cache ec
  WHERE ec.endpoint = 'overview'
    AND ec.expires_at > now() - INTERVAL '48 hours'
)
SELECT
  a.symbol,
  a.name,
  COALESCE(f.av_sector, a.sector, 'Other')   AS sector,
  COALESCE(f.industry, 'N/A')                AS industry,
  COALESCE(f.country, 'US')                  AS country,
  COALESCE(f.exchange, a.exchange)           AS exchange,
  a.asset_class,
  -- Fundamentals
  ROUND(f.pe_ratio, 1)                        AS pe_ratio,
  ROUND(f.ev_ebitda, 1)                       AS ev_ebitda,
  ROUND(f.pb_ratio, 2)                        AS pb_ratio,
  ROUND(COALESCE(f.div_yield, 0) * 100, 2)   AS div_yield_pct,
  ROUND(f.roe * 100, 1)                       AS roe_pct,
  ROUND(f.revenue_growth * 100, 1)            AS revenue_growth_pct,
  CASE
    WHEN (f.market_cap_raw)::numeric >= 1e12 THEN 'Mega'
    WHEN (f.market_cap_raw)::numeric >= 1e11 THEN 'Large'
    WHEN (f.market_cap_raw)::numeric >= 1e10 THEN 'Mid'
    ELSE 'Small'
  END                                         AS market_cap_bucket,
  f.market_cap_raw,
  f.analyst_target,
  f.next_earnings,
  -- Technicals (all derived from the single price_history scan above)
  ps.current_price,
  rc.rsi_14,
  ROUND(ps.ma_20::numeric,  4)  AS ma_20,
  ROUND(ps.ma_50::numeric,  4)  AS ma_50,
  ROUND(ps.ma_200::numeric, 4)  AS ma_200,
  CASE
    WHEN ps.current_price > ps.ma_50 AND ps.ma_50 > ps.ma_200 THEN 'Uptrend'
    WHEN ps.current_price < ps.ma_50 AND ps.ma_50 < ps.ma_200 THEN 'Downtrend'
    ELSE 'Sideways'
  END                                         AS price_regime,
  CASE
    WHEN vs.vol_20d > vs.vol_60d THEN 'Expanding'
    WHEN vs.vol_20d < vs.vol_60d THEN 'Compressing'
    ELSE 'Stable'
  END                                         AS vol_regime,
  ROUND(((ps.current_price - ps.ma_20) / NULLIF(ps.stddev_20, 0))::numeric, 2) AS zscore_20d,
  CASE
    WHEN (ps.current_price - ps.ma_20) / NULLIF(ps.stddev_20, 0) >  2 THEN 'Overbought'
    WHEN (ps.current_price - ps.ma_20) / NULLIF(ps.stddev_20, 0) < -2 THEN 'Oversold'
    ELSE 'Neutral'
  END                                         AS mean_reversion_signal,
  (vs.vol_20d * SQRT(252))::double precision  AS annualised_vol_20d,
  ROUND(ps.high_52w::numeric, 4)              AS high_52w,
  ROUND(ps.low_52w::numeric,  4)              AS low_52w,
  ROUND(((ps.current_price - ps.low_52w)
         / NULLIF(ps.high_52w - ps.low_52w, 0) * 100)::numeric, 1) AS pct_52w_range,
  ROUND(ps.atr_14::numeric, 4)                AS atr_14,
  -- Rolling returns
  ROUND(((ps.current_price - ps.p_1d)  / NULLIF(ps.p_1d,  0) * 100)::numeric, 2) AS return_1d_pct,
  ROUND(((ps.current_price - ps.p_1w)  / NULLIF(ps.p_1w,  0) * 100)::numeric, 2) AS return_1w_pct,
  ROUND(((ps.current_price - ps.p_1m)  / NULLIF(ps.p_1m,  0) * 100)::numeric, 2) AS return_1m_pct,
  ROUND(((ps.current_price - ps.p_3m)  / NULLIF(ps.p_3m,  0) * 100)::numeric, 2) AS return_3m_pct,
  ROUND(((ps.current_price - ps.p_6m)  / NULLIF(ps.p_6m,  0) * 100)::numeric, 2) AS return_6m_pct,
  ROUND(((ps.current_price - ps.p_1y)  / NULLIF(ps.p_1y,  0) * 100)::numeric, 2) AS return_1y_pct,
  ROUND(((ps.current_price - yp.p_ytd) / NULLIF(yp.p_ytd, 0) * 100)::numeric, 2) AS return_ytd_pct,
  -- Drawdown
  d.current_drawdown_pct,
  -- Style classification (multi-label)
  ARRAY_REMOVE(ARRAY[
    CASE WHEN (f.pe_ratio < 16 OR f.ev_ebitda < 9 OR f.pb_ratio < 1.5)
         THEN 'Value' END,
    CASE WHEN (COALESCE(f.revenue_growth, 0) > 0.10
               OR ROUND(((ps.current_price - ps.low_52w)
                         / NULLIF(ps.high_52w - ps.low_52w, 0) * 100)::numeric, 1) > 70)
         THEN 'Growth' END,
    CASE WHEN (ps.current_price > ps.ma_50
               AND ps.ma_50 > ps.ma_200
               AND COALESCE(rc.rsi_14, 0) > 50
               AND COALESCE(((ps.current_price - ps.p_3m) / NULLIF(ps.p_3m, 0) * 100)::numeric, 0) > 8)
         THEN 'Momentum' END,
    CASE WHEN (COALESCE(f.roe, 0) > 0.15
               OR (vs.vol_20d * SQRT(252) < 0.25
                   AND COALESCE(((ps.current_price - ps.p_1y) / NULLIF(ps.p_1y, 0) * 100)::numeric, 0) > 0))
         THEN 'Quality' END,
    CASE WHEN COALESCE(f.div_yield, 0) > 0.015
         THEN 'Dividend' END,
    CASE WHEN COALESCE(d.current_drawdown_pct, 0) < -20
         THEN 'Contrarian' END
  ], NULL)                                    AS style_tags,
  -- Analyst upside
  CASE
    WHEN f.analyst_target IS NOT NULL AND ps.current_price > 0
    THEN ROUND(((f.analyst_target - ps.current_price) / ps.current_price * 100)::numeric, 1)
    ELSE NULL
  END                                         AS analyst_upside_pct
FROM latest_pos lp
JOIN  assets       a  ON a.id        = lp.asset_id
LEFT JOIN fundamentals f  ON f.symbol     = a.symbol
LEFT JOIN price_stats  ps ON ps.asset_id  = lp.asset_id
LEFT JOIN vol_stats    vs ON vs.asset_id  = lp.asset_id
LEFT JOIN rsi_calc     rc ON rc.asset_id  = lp.asset_id
LEFT JOIN drawdown     d  ON d.asset_id   = lp.asset_id
LEFT JOIN ytd_price    yp ON yp.asset_id  = lp.asset_id
ORDER BY ABS(COALESCE(
  ((ps.current_price - ps.p_3m) / NULLIF(ps.p_3m, 0) * 100)::numeric, 0
)) DESC NULLS LAST;
