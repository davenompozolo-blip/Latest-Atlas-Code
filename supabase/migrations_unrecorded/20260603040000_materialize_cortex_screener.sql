-- Materialize the Cortex screener for fast anon reads.
-- Restricts to assets with ≥20 days of price history (~76 tracked names)
-- so the 7,600+ data-empty SPACs never surface.
-- Refreshed post-sync via refresh_cortex_screener() RPC.

DROP MATERIALIZED VIEW IF EXISTS mv_cortex_screener CASCADE;

CREATE MATERIALIZED VIEW mv_cortex_screener AS
WITH tracked AS (
  SELECT asset_id FROM price_history GROUP BY asset_id HAVING COUNT(*) >= 20
),
price_bounds AS (
  SELECT ph.asset_id, MAX(ph.price_date) AS last_date
  FROM price_history ph JOIN tracked t ON t.asset_id = ph.asset_id
  GROUP BY ph.asset_id
),
ret AS (
  SELECT pb.asset_id,
    ROUND(((lp.close / NULLIF(fp.close, 0)) - 1) * 100, 2) AS ret_1m
  FROM price_bounds pb
  JOIN price_history lp ON lp.asset_id = pb.asset_id AND lp.price_date = pb.last_date
  JOIN price_history fp ON fp.asset_id = pb.asset_id AND fp.price_date = (
    SELECT MIN(price_date) FROM price_history
    WHERE asset_id = pb.asset_id AND price_date >= pb.last_date - INTERVAL '31 days'
  )
)
SELECT
  a.symbol,
  COALESCE(a.name, a.symbol)                                               AS name,
  COALESCE(ec.payload->'Overview'->>'Sector', a.sector, 'Other')           AS sector,
  a.asset_class, a.exchange,
  NULLIF(ec.payload->'Overview'->>'MarketCapitalization','')::numeric      AS market_cap,
  (ec.payload->'Finnhub'->'metric'->>'evToEbitdaTTM')::numeric             AS ev_ebitda,
  (ec.payload->'Finnhub'->'metric'->>'revenueGrowthTTMYoy')::numeric       AS rev_growth,
  (ec.payload->'Finnhub'->'metric'->>'netProfitMarginTTM')::numeric        AS net_margin,
  (ec.payload->'Finnhub'->'metric'->>'pfcfShareTTM')::numeric              AS p_fcf,
  (ec.payload->'Finnhub'->'metric'->>'roiTTM')::numeric                    AS roic,
  (ec.payload->'Finnhub'->'metric'->>'roeTTM')::numeric                    AS roe,
  (ec.payload->'Finnhub'->'metric'->>'totalDebt/totalEquityQuarterly')::numeric AS debt_equity,
  (ec.payload->'Finnhub'->'metric'->>'dividendGrowthRate5Y')::numeric      AS div_growth_5y,
  r.ret_1m
FROM assets a
JOIN tracked t ON t.asset_id = a.id
LEFT JOIN equity_cache ec ON ec.symbol = a.symbol
LEFT JOIN ret r ON r.asset_id = a.id
WHERE a.asset_class IN ('Stock','us_equity','equity','etf');

CREATE UNIQUE INDEX mv_cortex_screener_symbol_idx ON mv_cortex_screener (symbol);
CREATE INDEX mv_cortex_screener_sector_idx        ON mv_cortex_screener (sector);

DROP VIEW IF EXISTS vw_cortex_screener;
CREATE VIEW vw_cortex_screener AS SELECT * FROM mv_cortex_screener;

GRANT SELECT ON mv_cortex_screener TO anon, authenticated, service_role;
GRANT SELECT ON vw_cortex_screener TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION refresh_cortex_screener()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_cortex_screener;
END;
$$;
GRANT EXECUTE ON FUNCTION refresh_cortex_screener() TO service_role;
