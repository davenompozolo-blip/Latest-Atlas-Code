-- equity_fundamentals_derived: precomputed quality / forensic scores per ticker per fiscal year.
-- Populated by the fundamentals hydration job (sync_fundamentals).
-- The frontend reads from this table; client-side JS computes only the DCF / scenario / factor-percentile
-- widgets whose inputs are few and should be interactive.

CREATE TABLE IF NOT EXISTS equity_fundamentals_derived (
  ticker                 text        NOT NULL,
  fiscal_year            int         NOT NULL,

  -- Piotroski F-Score (9 binary points)
  piotroski_f            int,                     -- 0..9
  piotroski_detail       jsonb,                   -- {niPos, cfoPos, roaRising, cfoGtNi, levFalling, crRising, noNewShares, gmRising, atRising}

  -- Altman Z-Score
  altman_z               numeric,
  altman_model           text,                    -- 'manufacturing' | 'service_z2'
  altman_components      jsonb,                   -- {x1,x2,x3,x4,x5}

  -- Beneish M-Score
  beneish_m              numeric,
  beneish_detail         jsonb,                   -- {dsri,gmi,aqi,sgi,depi,sgai,lvgi,tata}

  -- Earnings quality
  sloan_accrual          numeric,                 -- (NI - CFO - CFI) / avg total assets
  accrual_quality        numeric,                 -- 5-yr std of sloan_accrual

  -- Cash conversion cycle (store array for sparkline: [{fiscal_year, ccc_days}])
  ccc_days               numeric,
  ccc_history            jsonb,                   -- [{fy, days}] last 5 years

  -- Capital allocation
  roic                   numeric,
  wacc_est               numeric,
  reinvest_rate          numeric,
  buyback_yield          numeric,
  avg_buyback_px         numeric,
  div_coverage           numeric,
  capalloc_grade         text,                    -- letter grade

  -- Factor percentiles (vs S&P 500 universe)
  pct_gross_profit       numeric,                 -- 0..100
  pct_roic               numeric,
  pct_earnings_var       numeric,
  pct_fcf_yield          numeric,
  pct_ev_ebitda_z        numeric,
  pct_peg                numeric,
  pct_momentum_12_1      numeric,
  pct_revision_breadth   numeric,

  updated_at             timestamptz DEFAULT now(),
  PRIMARY KEY (ticker, fiscal_year)
);

ALTER TABLE equity_fundamentals_derived ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_read_derived"
  ON equity_fundamentals_derived FOR SELECT
  USING (true);

-- ai_thesis_cache: cache Claude API responses (1 per ticker per 10-K filing date).
CREATE TABLE IF NOT EXISTS ai_thesis_cache (
  ticker       text NOT NULL,
  filing_date  date NOT NULL,
  bull         jsonb,    -- [{point, source}]
  bear         jsonb,
  summary      text,
  model        text,
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (ticker, filing_date)
);

ALTER TABLE ai_thesis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_read_thesis"
  ON ai_thesis_cache FOR SELECT
  USING (true);

GRANT SELECT ON equity_fundamentals_derived TO anon, authenticated, service_role;
GRANT INSERT, UPDATE ON equity_fundamentals_derived TO service_role;
GRANT SELECT ON ai_thesis_cache TO anon, authenticated, service_role;
GRANT INSERT ON ai_thesis_cache TO service_role;
