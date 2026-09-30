
CREATE OR REPLACE VIEW public.vw_screener AS
WITH
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
fundamentals AS (
  SELECT
    ec.symbol,
    (ec.payload ->> 'PERatio')::numeric           AS pe_ratio,
    (ec.payload ->> 'EVToEBITDA')::numeric         AS ev_ebitda,
    (ec.payload ->> 'PriceToBookRatio')::numeric   AS pb_ratio,
    (ec.payload ->> 'DividendYield')::numeric      AS div_yield,
    (ec.payload ->> 'ReturnOnEquityTTM')::numeric  AS roe,
    (ec.payload ->> 'RevenueGrowthYOY')::numeric   AS revenue_growth,
    (ec.payload ->> 'MarketCapitalization')::bigint AS market_cap_raw,
    (ec.payload ->> 'Sector')                      AS av_sector,
    (ec.payload ->> 'Industry')                    AS industry,
    (ec.payload ->> 'Country')                     AS country,
    (ec.payload ->> 'Exchange')                    AS exchange,
    (ec.payload ->> 'NextEarningsDate')::date      AS next_earnings,
    (ec.payload ->> 'AnalystTargetPrice')::numeric AS analyst_target
  FROM equity_cache ec
  WHERE ec.endpoint = 'overview'
    AND ec.expires_at > (now() - INTERVAL '48 hours')
),
drawdown_curr AS (
  SELECT symbol, current_drawdown_pct
  FROM vw_quant_drawdown
)
SELECT
  a.symbol,
  a.name,
  COALESCE(f.av_sector, a.sector, 'Other')   AS sector,
  COALESCE(f.industry, 'N/A')                 AS industry,
  COALESCE(f.country, 'US')                   AS country,
  COALESCE(f.exchange, a.exchange)             AS exchange,
  a.asset_class,
  ROUND(f.pe_ratio, 1)                         AS pe_ratio,
  ROUND(f.ev_ebitda, 1)                        AS ev_ebitda,
  ROUND(f.pb_ratio, 2)                         AS pb_ratio,
  ROUND(COALESCE(f.div_yield, 0) * 100, 2)    AS div_yield_pct,
  ROUND(f.roe * 100, 1)                        AS roe_pct,
  ROUND(f.revenue_growth * 100, 1)             AS revenue_growth_pct,
  CASE
    WHEN f.market_cap_raw >= 1e12 THEN 'Mega'
    WHEN f.market_cap_raw >= 1e11 THEN 'Large'
    WHEN f.market_cap_raw >= 1e10 THEN 'Mid'
    ELSE 'Small'
  END                                           AS market_cap_bucket,
  f.market_cap_raw,
  f.analyst_target,
  f.next_earnings,
  q.current_price,
  q.rsi_14,
  q.ma_20,
  q.ma_50,
  q.ma_200,
  q.price_regime,
  q.vol_regime,
  q.zscore_20d,
  q.mean_reversion_signal,
  q.annualised_vol_20d,
  q.high_52w,
  q.low_52w,
  q.pct_52w_range,
  q.atr_14,
  r.return_1d_pct,
  r.return_1w_pct,
  r.return_1m_pct,
  r.return_3m_pct,
  r.return_6m_pct,
  r.return_1y_pct,
  r.return_ytd_pct,
  d.current_drawdown_pct,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN (f.pe_ratio < 16 OR f.ev_ebitda < 9 OR f.pb_ratio < 1.5)
         THEN 'Value' END,
    CASE WHEN (COALESCE(f.revenue_growth,0) > 0.10 OR q.pct_52w_range > 70)
         THEN 'Growth' END,
    CASE WHEN (q.price_regime = 'Uptrend'
               AND q.rsi_14 > 50
               AND COALESCE(r.return_3m_pct, 0) > 8)
         THEN 'Momentum' END,
    CASE WHEN (COALESCE(f.roe, 0) > 0.15
               OR (q.annualised_vol_20d < 0.25 AND COALESCE(r.return_1y_pct, 0) > 0))
         THEN 'Quality' END,
    CASE WHEN COALESCE(f.div_yield, 0) > 0.015
         THEN 'Dividend' END,
    CASE WHEN COALESCE(d.current_drawdown_pct, 0) < -20
         THEN 'Contrarian' END
  ], NULL)                                      AS style_tags,
  CASE
    WHEN f.analyst_target IS NOT NULL AND q.current_price > 0
    THEN ROUND(((f.analyst_target - q.current_price) / q.current_price) * 100, 1)
    ELSE NULL
  END                                           AS analyst_upside_pct
FROM latest_pos lp
JOIN assets a ON a.id = lp.asset_id
LEFT JOIN fundamentals f ON f.symbol = a.symbol
LEFT JOIN vw_quant_dashboard q ON q.symbol = a.symbol
LEFT JOIN vw_quant_rolling_returns r ON r.symbol = a.symbol
LEFT JOIN drawdown_curr d ON d.symbol = a.symbol
ORDER BY ABS(COALESCE(r.return_3m_pct, 0)) DESC NULLS LAST;
