-- Correct the Finnhub metric field names against the real /stock/metric schema
-- (verified against live data):
--   EV/EBITDA  → evEbitdaTTM            (evToEbitdaTTM does not exist)
--   ROIC       → roiTTM                 (roicTTM does not exist)
--   leverage   → totalDebt/totalEquityQuarterly  (no net-debt/EBITDA on free tier;
--                used as the leverage proxy surfaced in the UI as Debt/Equity)
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
),
fund AS (
  SELECT symbol, payload FROM equity_cache WHERE endpoint = 'overview'
)
SELECT
  a.symbol,
  COALESCE(a.name, f.payload->'overview'->>'Name', a.symbol)               AS name,
  COALESCE(f.payload->'overview'->>'Sector', a.sector, 'Other')            AS sector,
  a.asset_class, a.exchange,
  COALESCE(
    (f.payload->>'market_cap_usd')::numeric,
    (f.payload->'overview'->>'MarketCapitalization')::numeric
  )                                                                        AS market_cap,
  (f.payload->'metric'->>'evEbitdaTTM')::numeric                           AS ev_ebitda,
  (f.payload->'metric'->>'revenueGrowthTTMYoy')::numeric                   AS rev_growth,
  (f.payload->'metric'->>'netProfitMarginTTM')::numeric                    AS net_margin,
  (f.payload->'metric'->>'pfcfShareTTM')::numeric                          AS p_fcf,
  (f.payload->'metric'->>'roiTTM')::numeric                                AS roic,
  (f.payload->'metric'->>'roeTTM')::numeric                                AS roe,
  (f.payload->'metric'->>'totalDebt/totalEquityQuarterly')::numeric        AS debt_equity,
  (f.payload->'metric'->>'totalDebt/totalEquityQuarterly')::numeric        AS net_debt_ebitda,
  (f.payload->'metric'->>'dividendGrowthRate5Y')::numeric                  AS div_growth_5y,
  r.ret_1m
FROM assets a
LEFT JOIN tracked t ON t.asset_id = a.id
LEFT JOIN ret r     ON r.asset_id = a.id
LEFT JOIN fund f    ON f.symbol   = a.symbol
WHERE a.asset_class IN ('Stock','us_equity','equity','etf')
  AND (t.asset_id IS NOT NULL OR f.symbol IS NOT NULL);

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
