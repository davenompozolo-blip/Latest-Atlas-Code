-- Flattened fundamentals + 1M momentum source for the Cortex Advanced Screener.
-- equity_cache.payload is the Finnhub/Alpha-Vantage blob; keys mapped best-effort
-- and COALESCE to NULL when absent (cache is currently sparsely populated).
CREATE OR REPLACE VIEW vw_cortex_screener AS
WITH ret AS (
  SELECT
    ph.asset_id,
    MAX(ph.price_date) AS last_d,
    (
      ( (ARRAY_AGG(ph.close ORDER BY ph.price_date DESC))[1]
        / NULLIF((ARRAY_AGG(ph.close ORDER BY ph.price_date ASC) FILTER (
            WHERE ph.price_date >= (SELECT MAX(price_date) FROM price_history p2 WHERE p2.asset_id = ph.asset_id) - INTERVAL '31 days'
          ))[1], 0) - 1 ) * 100
    ) AS ret_1m
  FROM price_history ph
  GROUP BY ph.asset_id
)
SELECT
  a.symbol,
  COALESCE(a.name, a.symbol)                                              AS name,
  COALESCE(ec.payload->'Overview'->>'Sector', a.sector, 'Other')          AS sector,
  a.asset_class,
  a.exchange,
  NULLIF(ec.payload->'Overview'->>'MarketCapitalization','')::numeric     AS market_cap,
  (ec.payload->'Finnhub'->'metric'->>'evToEbitdaTTM')::numeric            AS ev_ebitda,
  (ec.payload->'Finnhub'->'metric'->>'revenueGrowthTTMYoy')::numeric      AS rev_growth,
  (ec.payload->'Finnhub'->'metric'->>'netProfitMarginTTM')::numeric       AS net_margin,
  (ec.payload->'Finnhub'->'metric'->>'pfcfShareTTM')::numeric             AS p_fcf,
  (ec.payload->'Finnhub'->'metric'->>'roiTTM')::numeric                   AS roic,
  (ec.payload->'Finnhub'->'metric'->>'roeTTM')::numeric                   AS roe,
  (ec.payload->'Finnhub'->'metric'->>'totalDebt/totalEquityQuarterly')::numeric AS debt_equity,
  (ec.payload->'Finnhub'->'metric'->>'dividendGrowthRate5Y')::numeric     AS div_growth_5y,
  r.ret_1m
FROM assets a
LEFT JOIN equity_cache ec ON ec.symbol = a.symbol
LEFT JOIN ret r           ON r.asset_id = a.id
WHERE a.asset_class IN ('Stock','us_equity','equity','etf');

GRANT SELECT ON vw_cortex_screener TO anon, authenticated, service_role;
