
CREATE OR REPLACE VIEW equity_screener_universe AS
WITH latest_derived AS (
  SELECT DISTINCT ON (ticker)
    ticker, fiscal_year, piotroski_f, altman_z, beneish_m,
    sloan_accrual, accrual_quality, ccc_days, roic, wacc_est,
    (roic - wacc_est) AS roic_wacc_spread, capalloc_grade,
    pct_roic, pct_fcf_yield, pct_ev_ebitda_z, pct_peg, pct_momentum_12_1,
    updated_at AS derived_updated_at
  FROM equity_fundamentals_derived
  ORDER BY ticker, fiscal_year DESC
)
SELECT
  ec.symbol,
  ec.cached_at,
  -- Identity
  ec.payload->'overview'->>'Symbol'                                                     AS ticker,
  ec.payload->'overview'->>'Name'                                                       AS company_name,
  COALESCE(
    NULLIF(ec.payload->'overview'->>'Sector', ''),
    NULLIF(ec.payload->'profile'->>'finnhubIndustry', '')
  )                                                                                      AS sector,
  NULLIF(ec.payload->'profile'->>'finnhubIndustry', '')                                AS industry,
  NULLIF(ec.payload->'overview'->>'Exchange', '')                                       AS exchange,
  NULLIF(ec.payload->'profile'->>'country', '')                                         AS country,
  NULLIF(ec.payload->'profile'->>'currency', '')                                        AS currency,
  NULLIF(ec.payload->'profile'->>'logo', '')                                            AS logo_url,
  -- Current price derived from mktcap (millions) / shares (millions)
  CASE
    WHEN (ec.payload->'profile'->>'shareOutstanding')::numeric > 0
    THEN ROUND(
      (ec.payload->'profile'->>'marketCapitalization')::numeric
      / (ec.payload->'profile'->>'shareOutstanding')::numeric, 2)
  END                                                                                    AS current_price,
  -- Market cap (raw USD stored at top level)
  CAST(NULLIF(ec.payload->>'market_cap_usd', '') AS numeric)                           AS market_cap_usd,
  CASE
    WHEN CAST(NULLIF(ec.payload->>'market_cap_usd', '') AS numeric) >= 1e12 THEN 'Mega'
    WHEN CAST(NULLIF(ec.payload->>'market_cap_usd', '') AS numeric) >= 1e11 THEN 'Large'
    WHEN CAST(NULLIF(ec.payload->>'market_cap_usd', '') AS numeric) >= 1e10 THEN 'Mid'
    WHEN CAST(NULLIF(ec.payload->>'market_cap_usd', '') AS numeric) IS NOT NULL   THEN 'Small'
    ELSE NULL
  END                                                                                    AS market_cap_bucket,
  -- Valuation
  CAST(NULLIF(ec.payload->'overview'->>'PERatio', '') AS numeric)                      AS pe_ratio,
  CAST(NULLIF(ec.payload->'metric'->>'forwardPE', '') AS numeric)                      AS forward_pe,
  CAST(NULLIF(ec.payload->'metric'->>'pegTTM', '') AS numeric)                         AS peg_ratio,
  CAST(NULLIF(ec.payload->'metric'->>'evEbitdaTTM', '') AS numeric)                    AS ev_ebitda,
  CAST(NULLIF(ec.payload->'metric'->>'pbAnnual', '') AS numeric)                       AS price_to_book,
  CAST(NULLIF(ec.payload->'metric'->>'psTTM', '') AS numeric)                          AS price_to_sales,
  -- Profitability
  CAST(NULLIF(ec.payload->'metric'->>'roeTTM', '') AS numeric)                         AS roe_ttm,
  CAST(NULLIF(ec.payload->'metric'->>'roaTTM', '') AS numeric)                         AS roa_ttm,
  CAST(NULLIF(ec.payload->'metric'->>'grossMarginTTM', '') AS numeric)                 AS gross_margin,
  CAST(NULLIF(ec.payload->'metric'->>'netProfitMarginTTM', '') AS numeric)             AS net_margin,
  CAST(NULLIF(ec.payload->'metric'->>'epsTTM', '') AS numeric)                         AS eps_ttm,
  -- Growth
  CAST(NULLIF(ec.payload->'metric'->>'revenueGrowthTTMYoy', '') AS numeric)            AS rev_growth_yoy,
  CAST(NULLIF(ec.payload->'metric'->>'revenueGrowth3Y', '') AS numeric)                AS rev_growth_3y,
  CAST(NULLIF(ec.payload->'metric'->>'epsGrowthTTMYoy', '') AS numeric)                AS eps_growth_yoy,
  -- Dividends
  CAST(NULLIF(ec.payload->'metric'->>'currentDividendYieldTTM', '') AS numeric)        AS div_yield_raw,
  ROUND(
    CAST(NULLIF(ec.payload->'metric'->>'currentDividendYieldTTM', '') AS numeric) * 100,
    4
  )                                                                                      AS div_yield_pct,
  -- Risk / Momentum
  CAST(NULLIF(ec.payload->'overview'->>'Beta', '') AS numeric)                         AS beta,
  CAST(NULLIF(ec.payload->'metric'->>'52WeekHigh', '') AS numeric)                     AS week52_high,
  CAST(NULLIF(ec.payload->'metric'->>'52WeekLow', '') AS numeric)                      AS week52_low,
  CAST(NULLIF(ec.payload->'metric'->>'52WeekPriceReturnDaily', '') AS numeric)         AS return_52w,
  CAST(NULLIF(ec.payload->'metric'->>'13WeekPriceReturnDaily', '') AS numeric)         AS return_13w,
  CAST(NULLIF(ec.payload->'metric'->>'3MonthADReturnStd', '') AS numeric)              AS vol_3m,
  -- From equity_fundamentals_derived
  ld.fiscal_year,
  ld.piotroski_f,
  ld.altman_z,
  ld.beneish_m,
  ld.capalloc_grade,
  ROUND((ld.roic * 100)::numeric, 2)             AS roic_pct,
  ROUND((ld.wacc_est * 100)::numeric, 2)         AS wacc_pct,
  ROUND((ld.roic_wacc_spread * 100)::numeric, 2) AS roic_wacc_spread_pct,
  ld.pct_roic,
  ld.pct_momentum_12_1,
  ld.pct_ev_ebitda_z,
  ld.derived_updated_at
FROM equity_cache ec
LEFT JOIN latest_derived ld
  ON ld.ticker = ec.payload->'overview'->>'Symbol'
WHERE ec.endpoint = 'overview'
  AND ec.payload IS NOT NULL
  AND ec.payload->'overview'->>'Symbol' IS NOT NULL;
