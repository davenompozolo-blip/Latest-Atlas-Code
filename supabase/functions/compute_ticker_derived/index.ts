// Edge Function: compute_ticker_derived
//
// On-demand computation of quality/forensic/capital scores for a single ticker.
// Called by the Equity Research UI when a ticker is loaded and derived data is
// missing or stale (>7 days old).
//
// Scoring pipeline:
//   1. Load Finnhub metric blob from equity_cache (or fetch live)
//   2. Fetch Finnhub financials-reported (2 annual periods) for multi-year signals
//   3. Compute: Piotroski F, Altman Z'', Beneish M, Sloan accrual, ROIC, factor pct
//   4. Upsert to equity_fundamentals_derived
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FINNHUB_API_KEY

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const FH_BASE = 'https://finnhub.io/api/v1'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function sbHeaders(key: string) {
  return {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  }
}

async function sbGet(base: string, key: string, path: string): Promise<unknown> {
  const r = await fetch(base + path, { headers: sbHeaders(key) })
  if (!r.ok) throw new Error('Supabase GET ' + path + ': ' + r.status)
  return r.json()
}

async function sbUpsert(base: string, key: string, table: string, rows: unknown[]) {
  const r = await fetch(base + '/rest/v1/' + table, {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error('Supabase upsert ' + table + ': ' + r.status + ' ' + t.slice(0, 300))
  }
}

async function fhFetch<T>(path: string, token: string): Promise<T | null> {
  try {
    const sep = path.includes('?') ? '&' : '?'
    const r = await fetch(FH_BASE + path + sep + 'token=' + token, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    })
    if (!r.ok) return null
    return await r.json() as T
  } catch {
    return null
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function n(v: unknown): number | null {
  if (v == null) return null
  const x = Number(v)
  return isFinite(x) ? x : null
}

function safe(a: number | null, b: number | null, op: (a: number, b: number) => number): number | null {
  if (a == null || b == null) return null
  if (b === 0) return null
  return op(a, b)
}

// Estimate percentile from threshold ladder [p20, p40, p60, p80]
function pctEst(value: number | null, thresholds: [number, number, number, number], invert = false): number | null {
  if (value == null) return null
  const v = invert ? -value : value
  const [t0, t1, t2, t3] = invert
    ? [-thresholds[3], -thresholds[2], -thresholds[1], -thresholds[0]]
    : thresholds
  if (v >= t3) return 90
  if (v >= t2) return 70
  if (v >= t1) return 55
  if (v >= t0) return 35
  return 15
}

// ── Finnhub data types ────────────────────────────────────────────────────────

interface FhMetric {
  [key: string]: number | string | null | undefined
}

interface FhReport {
  period?: string
  year?: number
  quarter?: number
  report?: {
    ic?: Array<{ concept: string; value: number }>
    bs?: Array<{ concept: string; value: number }>
    cf?: Array<{ concept: string; value: number }>
  }
}

interface FhFinancials {
  data?: FhReport[]
  symbol?: string
}

// Extract value from Finnhub's reported-financials concept array
function fhVal(arr: Array<{ concept: string; value: number }> | undefined, ...concepts: string[]): number | null {
  if (!arr) return null
  for (const c of concepts) {
    const found = arr.find(r => r.concept === c)
    if (found != null && isFinite(found.value)) return found.value
  }
  return null
}

// ── Score computation ─────────────────────────────────────────────────────────

interface AnnualData {
  revenue: number | null
  grossProfit: number | null
  ebit: number | null
  netIncome: number | null
  cfo: number | null
  cfi: number | null
  capex: number | null
  depreciation: number | null
  totalAssets: number | null
  currentAssets: number | null
  currentLiabilities: number | null
  retainedEarnings: number | null
  totalLiabilities: number | null
  longTermDebt: number | null
  ppe: number | null
  accountsReceivable: number | null
  sga: number | null
  sharesOutstanding: number | null
  dividendsPaid: number | null
  buybacks: number | null
  bookEquity: number | null
}

function extractAnnualData(report: FhReport | undefined): AnnualData {
  const ic = report?.report?.ic
  const bs = report?.report?.bs
  const cf = report?.report?.cf

  const revenue    = fhVal(ic, 'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet')
  const grossProfit = fhVal(ic, 'GrossProfit')
  const ebit       = fhVal(ic, 'OperatingIncomeLoss')
  const netIncome  = fhVal(ic, 'NetIncomeLoss', 'ProfitLoss')
  const sga        = fhVal(ic, 'SellingGeneralAndAdministrativeExpense')
  const depreciation = fhVal(ic, 'DepreciationDepletionAndAmortization', 'DepreciationAndAmortization')

  const cfo        = fhVal(cf, 'NetCashProvidedByUsedInOperatingActivities')
  const cfi        = fhVal(cf, 'NetCashProvidedByUsedInInvestingActivities')
  const capex      = fhVal(cf, 'PaymentsToAcquirePropertyPlantAndEquipment',
                                'CapitalExpenditureContinuingOperations')
  const dividendsPaid = fhVal(cf, 'PaymentsOfDividends', 'PaymentsOfDividendsCommonStock')
  const buybacks      = fhVal(cf, 'PaymentsForRepurchaseOfCommonStock',
                                  'PaymentsForRepurchaseOfEquity')

  const totalAssets          = fhVal(bs, 'Assets')
  const currentAssets        = fhVal(bs, 'AssetsCurrent')
  const currentLiabilities   = fhVal(bs, 'LiabilitiesCurrent')
  const retainedEarnings     = fhVal(bs, 'RetainedEarningsAccumulatedDeficit')
  const totalLiabilities     = fhVal(bs, 'Liabilities')
  const longTermDebt         = fhVal(bs, 'LongTermDebt', 'LongTermDebtNoncurrent')
  const ppe                  = fhVal(bs, 'PropertyPlantAndEquipmentNet')
  const accountsReceivable   = fhVal(bs, 'AccountsReceivableNetCurrent')
  const bookEquity           = fhVal(bs, 'StockholdersEquity',
                                        'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest')
  const sharesOutstanding    = fhVal(bs, 'CommonStockSharesOutstanding')

  return {
    revenue, grossProfit, ebit, netIncome, cfo, cfi, capex, depreciation,
    totalAssets, currentAssets, currentLiabilities, retainedEarnings,
    totalLiabilities, longTermDebt, ppe, accountsReceivable, sga,
    sharesOutstanding, dividendsPaid, buybacks, bookEquity,
  }
}

function computeScores(cur: AnnualData, prv: AnnualData | null, metric: FhMetric, marketCapUsd: number | null) {
  // ── Piotroski F-Score ──────────────────────────────────────────────────────
  const niPos      = cur.netIncome != null ? cur.netIncome > 0 : null
  const cfoPos     = cur.cfo != null ? cur.cfo > 0 : null
  const cfoGtNi    = (cur.cfo != null && cur.netIncome != null) ? cur.cfo > cur.netIncome : null

  const curROA = safe(cur.netIncome, cur.totalAssets, (a, b) => a / b)
  const prvROA = (prv && prv.netIncome != null && prv.totalAssets != null)
    ? prv.netIncome / prv.totalAssets : null
  const roaRising = (curROA != null && prvROA != null) ? curROA > prvROA : null

  const curLev = (cur.longTermDebt != null && cur.totalAssets != null && cur.totalAssets > 0)
    ? cur.longTermDebt / cur.totalAssets : null
  const prvLev = (prv && prv.longTermDebt != null && prv.totalAssets != null && prv.totalAssets > 0)
    ? prv.longTermDebt / prv.totalAssets : null
  const levFalling = (curLev != null && prvLev != null) ? curLev < prvLev : null

  const curCR = safe(cur.currentAssets, cur.currentLiabilities, (a, b) => a / b)
  const prvCR = (prv && prv.currentAssets != null && prv.currentLiabilities != null && prv.currentLiabilities > 0)
    ? prv.currentAssets / prv.currentLiabilities : null
  const crRising = (curCR != null && prvCR != null) ? curCR > prvCR : null

  const noNewShares = (cur.sharesOutstanding != null && prv && prv.sharesOutstanding != null)
    ? cur.sharesOutstanding <= prv.sharesOutstanding * 1.005 : null   // ≤0.5% dilution

  const curGM = safe(cur.grossProfit, cur.revenue, (a, b) => a / b)
  const prvGM = (prv && prv.grossProfit != null && prv.revenue != null && prv.revenue > 0)
    ? prv.grossProfit / prv.revenue : null
  const gmRising = (curGM != null && prvGM != null) ? curGM > prvGM : null

  const curAT = safe(cur.revenue, cur.totalAssets, (a, b) => a / b)
  const prvAT = (prv && prv.revenue != null && prv.totalAssets != null && prv.totalAssets > 0)
    ? prv.revenue / prv.totalAssets : null
  const atRising = (curAT != null && prvAT != null) ? curAT > prvAT : null

  const piotroski_detail = {
    niPos, cfoPos, cfoGtNi, roaRising, levFalling, crRising, noNewShares, gmRising, atRising,
  }
  const piotroski_f = [niPos, cfoPos, cfoGtNi, roaRising, levFalling, crRising, noNewShares, gmRising, atRising]
    .filter(v => v === true).length

  // ── Altman Z'' (service model) ─────────────────────────────────────────────
  // Z'' = 6.56*X1 + 3.26*X2 + 6.72*X3 + 1.05*X4
  // Fallback to manufacturing model if looks like mfg (ppe > 20% of assets)
  let altman_z: number | null = null
  let altman_model = 'service_z2'
  let altman_components: Record<string, number | null> | null = null

  if (cur.totalAssets && cur.totalAssets > 0) {
    const wc = (cur.currentAssets != null && cur.currentLiabilities != null)
      ? cur.currentAssets - cur.currentLiabilities : null
    const x1 = safe(wc, cur.totalAssets, (a, b) => a / b)
    const x2 = safe(cur.retainedEarnings, cur.totalAssets, (a, b) => a / b)
    const x3 = safe(cur.ebit, cur.totalAssets, (a, b) => a / b)
    const x4 = (cur.bookEquity != null && cur.totalLiabilities != null && cur.totalLiabilities > 0)
      ? cur.bookEquity / cur.totalLiabilities : null

    altman_components = { x1, x2, x3, x4 }

    const ppeRatio = (cur.ppe != null) ? cur.ppe / cur.totalAssets : 0
    if (ppeRatio > 0.20) {
      altman_model = 'manufacturing'
      // Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 1.0*X5 (X5 = rev/assets)
      const x5 = safe(cur.revenue, cur.totalAssets, (a, b) => a / b)
      if (x1 != null && x2 != null && x3 != null && x4 != null && x5 != null) {
        altman_z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5
        altman_components = { x1, x2, x3, x4, x5 }
      }
    } else {
      if (x1 != null && x2 != null && x3 != null && x4 != null) {
        altman_z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4
      } else if (x3 != null && x4 != null) {
        // Partial — available components only
        altman_z = 6.72 * x3 + 1.05 * x4
      }
    }
  }

  // ── Beneish M-Score ────────────────────────────────────────────────────────
  let beneish_m: number | null = null
  let beneish_detail: Record<string, number | null> | null = null

  if (prv && cur.revenue && prv.revenue && cur.totalAssets && prv.totalAssets) {
    const dsri = (cur.accountsReceivable != null && prv.accountsReceivable != null && prv.revenue > 0 && cur.revenue > 0)
      ? (cur.accountsReceivable / cur.revenue) / (prv.accountsReceivable / prv.revenue) : null

    const curGMv = (cur.grossProfit != null && cur.revenue > 0) ? cur.grossProfit / cur.revenue : null
    const prvGMv = (prv.grossProfit != null && prv.revenue > 0) ? prv.grossProfit / prv.revenue : null
    const gmi = (curGMv != null && prvGMv != null && curGMv > 0) ? prvGMv / curGMv : null

    const curNCA = (cur.currentAssets != null && cur.ppe != null) ? cur.currentAssets + cur.ppe : null
    const prvNCA = (prv.currentAssets != null && prv.ppe != null) ? prv.currentAssets + prv.ppe : null
    const aqi = (curNCA != null && prvNCA != null && cur.totalAssets > 0 && prv.totalAssets > 0)
      ? (1 - curNCA / cur.totalAssets) / (1 - prvNCA / prv.totalAssets) : null

    const sgi = prv.revenue > 0 ? cur.revenue / prv.revenue : null

    const curDepRate = (cur.depreciation != null && cur.ppe != null && (cur.depreciation + cur.ppe) > 0)
      ? cur.depreciation / (cur.depreciation + cur.ppe) : null
    const prvDepRate = (prv.depreciation != null && prv.ppe != null && (prv.depreciation + prv.ppe) > 0)
      ? prv.depreciation / (prv.depreciation + prv.ppe) : null
    const depi = (curDepRate != null && prvDepRate != null && curDepRate > 0)
      ? prvDepRate / curDepRate : null

    const sgai = (cur.sga != null && prv.sga != null && cur.revenue > 0 && prv.revenue > 0)
      ? (cur.sga / cur.revenue) / (prv.sga / prv.revenue) : null

    const curLevM = ((cur.longTermDebt != null ? cur.longTermDebt : 0) + (cur.currentLiabilities != null ? cur.currentLiabilities : 0))
    const prvLevM = ((prv.longTermDebt != null ? prv.longTermDebt : 0) + (prv.currentLiabilities != null ? prv.currentLiabilities : 0))
    const lvgi = (prv.totalAssets > 0 && cur.totalAssets > 0)
      ? (curLevM / cur.totalAssets) / (prvLevM / prv.totalAssets) : null

    const tata = (cur.netIncome != null && cur.cfo != null && cur.totalAssets > 0)
      ? (cur.netIncome - cur.cfo) / cur.totalAssets : null

    beneish_detail = { dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata }

    if (dsri != null && gmi != null && aqi != null && sgi != null) {
      let m = -4.84
        + 0.920 * (dsri ?? 1)
        + 0.528 * (gmi  ?? 1)
        + 0.404 * (aqi  ?? 1)
        + 0.892 * (sgi  ?? 1)
      if (depi  != null) m += 0.115 * depi
      if (sgai  != null) m += -0.172 * sgai
      if (tata  != null) m += 4.679 * tata
      if (lvgi  != null) m += -0.327 * lvgi
      beneish_m = m
    }
  }

  // ── Sloan Accrual ──────────────────────────────────────────────────────────
  let sloan_accrual: number | null = null
  if (cur.netIncome != null && cur.cfo != null && cur.totalAssets && cur.totalAssets > 0) {
    sloan_accrual = (cur.netIncome - cur.cfo) / cur.totalAssets
  }

  // ── CCC ────────────────────────────────────────────────────────────────────
  let ccc_days: number | null = null
  if (cur.revenue && cur.accountsReceivable && cur.totalAssets) {
    // DSO = AR / (Revenue / 365)
    const dso = cur.revenue > 0 ? cur.accountsReceivable / (cur.revenue / 365) : null
    ccc_days = dso   // simplified — DIO+DSO-DPO requires COGS and AP which we may lack
  }

  // ── ROIC & Capital Allocation ─────────────────────────────────────────────
  // Tax rate from metrics or approximate
  const taxRate = n(metric['taxRateForCalcs']) ?? 0.21

  let roic: number | null = null
  let reinvest_rate: number | null = null
  let roic_nopat: number | null = null
  let invested_capital: number | null = null

  if (cur.ebit != null && cur.totalAssets) {
    const nopat = cur.ebit * (1 - taxRate)
    roic_nopat = nopat
    // IC = Total Assets - Non-interest-bearing current liabilities - Excess cash
    const cash = n(metric['cashAndEquivalents']) ?? 0
    const ic = cur.totalAssets - (cur.currentLiabilities ?? 0) - Math.max(0, cash - (cur.revenue ?? 0) * 0.02)
    if (ic > 0) {
      roic = nopat / ic
      invested_capital = ic
    }
  }

  // Fallback from Finnhub metric
  if (roic == null) {
    const roiTTM = n(metric['roiTTM'])
    if (roiTTM != null) roic = roiTTM / 100
  }

  const wacc_est = estimateWACC(metric, cur, marketCapUsd)

  let reinvest_rate_val: number | null = null
  if (cur.capex != null && cur.depreciation != null && roic_nopat && roic_nopat > 0) {
    const reinvestment = Math.max(0, cur.capex - cur.depreciation)
    reinvest_rate_val = reinvestment / roic_nopat
  }

  // Buyback yield
  let buyback_yield: number | null = null
  if (cur.buybacks != null && marketCapUsd != null && marketCapUsd > 0) {
    buyback_yield = Math.abs(cur.buybacks) / marketCapUsd
  }

  // Dividend coverage
  let div_coverage: number | null = null
  if (cur.cfo != null && cur.dividendsPaid != null && Math.abs(cur.dividendsPaid) > 0) {
    div_coverage = cur.cfo / Math.abs(cur.dividendsPaid)
  }

  // Capital allocation grade
  const spread = (roic != null && wacc_est != null) ? roic - wacc_est : null
  let capalloc_grade: string | null = null
  if (spread != null) {
    capalloc_grade = spread > 0.15 ? 'A' : spread > 0.08 ? 'B+' : spread > 0 ? 'B−' : 'C'
  }

  // ── Factor Percentiles ────────────────────────────────────────────────────
  const grossMarginTTM = n(metric['grossMarginTTM'])
  const pct_gross_profit = pctEst(grossMarginTTM, [0.20, 0.35, 0.50, 0.65])
  const pct_roic         = pctEst(roic, [0.05, 0.12, 0.20, 0.30])

  // Earnings variability: 1 - coefficient of variation of EPS growth
  // We don't have a 5yr series, so leave null — better null than garbage
  const pct_earnings_var: number | null = null

  // Value percentiles (lower multiple = higher percentile for value)
  const evEbitda = n(metric['enterpriseValueEbitdaTTM']) ?? n(metric['evEbitda'])
  const pct_ev_ebitda_z = evEbitda != null ? pctEst(evEbitda, [8, 14, 20, 28], true) : null

  const fcfYield = (cur.cfo != null && cur.capex != null && marketCapUsd && marketCapUsd > 0)
    ? (cur.cfo - Math.abs(cur.capex)) / marketCapUsd : null
  const pct_fcf_yield = pctEst(fcfYield, [0.005, 0.02, 0.04, 0.06])

  const peg = n(metric['pegRatio'])
  const pct_peg = peg != null && peg > 0 ? pctEst(peg, [0.5, 1.0, 1.5, 2.5], true) : null

  // Momentum percentiles — require price series, not available here; leave null
  const pct_momentum_12_1: number | null = null
  const pct_revision_breadth: number | null = null

  return {
    piotroski_f,
    piotroski_detail,
    altman_z,
    altman_model,
    altman_components,
    beneish_m,
    beneish_detail,
    sloan_accrual,
    accrual_quality: null, // requires 5yr series
    ccc_days,
    ccc_history: null,
    roic,
    wacc_est,
    reinvest_rate: reinvest_rate_val,
    buyback_yield,
    avg_buyback_px: null,
    div_coverage,
    capalloc_grade,
    pct_gross_profit,
    pct_roic,
    pct_earnings_var,
    pct_fcf_yield,
    pct_ev_ebitda_z,
    pct_peg,
    pct_momentum_12_1,
    pct_revision_breadth,
  }
}

// WACC estimate:  cost of equity (CAPM) weighted with after-tax cost of debt
function estimateWACC(metric: FhMetric, cur: AnnualData, marketCapUsd: number | null): number {
  const beta     = n(metric['beta']) ?? 1.1
  const rfRate   = 0.043  // ~10yr Treasury as of 2026
  const mktPrem  = 0.055  // long-run equity risk premium
  const ke = rfRate + beta * mktPrem   // CAPM cost of equity

  if (!marketCapUsd || !cur.longTermDebt || cur.longTermDebt <= 0) return ke

  const totalCap = marketCapUsd + cur.longTermDebt
  const eWeight  = marketCapUsd / totalCap
  const dWeight  = cur.longTermDebt / totalCap
  const kd       = 0.05 * (1 - 0.21)  // blended pre-tax 5% × (1-tax)

  return eWeight * ke + dWeight * kd
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sbUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const fhKey = Deno.env.get('FINNHUB_API_KEY') ?? ''

  if (!sbUrl || !sbKey) return json({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
  if (!fhKey)           return json({ error: 'Missing FINNHUB_API_KEY' }, 500)

  const body = await req.json().catch(() => ({})) as { ticker?: string; force?: boolean }
  const ticker = (body.ticker ?? '').trim().toUpperCase()
  if (!ticker || !/^[A-Z0-9.\-]{1,14}$/.test(ticker)) return json({ error: 'Invalid ticker' }, 400)

  // ── Check cache freshness ─────────────────────────────────────────────────
  if (!body.force) {
    try {
      const existing = await sbGet(sbUrl, sbKey,
        `/rest/v1/equity_fundamentals_derived?select=updated_at&ticker=eq.${ticker}&order=fiscal_year.desc&limit=1`)
      const rows = existing as { updated_at: string }[]
      if (rows.length) {
        const age = Date.now() - new Date(rows[0].updated_at).getTime()
        if (age < 7 * 24 * 60 * 60 * 1000) {
          return json({ status: 'cached', ticker, age_hours: Math.round(age / 3600000) })
        }
      }
    } catch { /* non-fatal */ }
  }

  // ── Load or fetch Finnhub metric blob ─────────────────────────────────────
  let metric: FhMetric = {}
  let marketCapUsd: number | null = null

  try {
    const cached = await sbGet(sbUrl, sbKey,
      `/rest/v1/equity_cache?select=payload&symbol=eq.${ticker}&endpoint=eq.overview&limit=1`)
    const rows = cached as { payload: { metric: FhMetric; market_cap_usd: number } }[]
    if (rows.length) {
      metric        = rows[0].payload.metric ?? {}
      marketCapUsd  = rows[0].payload.market_cap_usd ?? null
    }
  } catch { /* non-fatal */ }

  if (!metric || Object.keys(metric).length === 0) {
    // Fetch live from Finnhub
    const raw = await fhFetch<{ metric: FhMetric }>('/stock/metric?symbol=' + ticker + '&metric=all', fhKey)
    if (raw?.metric) metric = raw.metric
    const profile = await fhFetch<{ marketCapitalization?: number }>('/stock/profile2?symbol=' + ticker, fhKey)
    if (profile?.marketCapitalization) marketCapUsd = profile.marketCapitalization * 1_000_000
  }

  // ── Fetch Finnhub reported financials (2 annual periods) ──────────────────
  let annualReports: FhReport[] = []
  const fin = await fhFetch<FhFinancials>('/financials-reported?symbol=' + ticker + '&freq=annual&limit=2', fhKey)
  if (fin?.data && Array.isArray(fin.data)) {
    // Sort descending by period
    annualReports = fin.data
      .filter(r => r.quarter == null || r.quarter === 0)   // annual only
      .sort((a, b) => (b.period ?? '').localeCompare(a.period ?? ''))
      .slice(0, 2)
  }

  const cur  = annualReports[0] ? extractAnnualData(annualReports[0]) : makeMetricFallback(metric)
  const prv  = annualReports[1] ? extractAnnualData(annualReports[1]) : null

  // ── Compute scores ────────────────────────────────────────────────────────
  const scores = computeScores(cur, prv, metric, marketCapUsd)

  // Determine fiscal year from the report period string (e.g. "2024-09-30")
  const fyStr = annualReports[0]?.period
  const fiscal_year = fyStr ? parseInt(fyStr.slice(0, 4), 10) : new Date().getFullYear() - 1

  const row = {
    ticker,
    fiscal_year,
    ...scores,
    updated_at: new Date().toISOString(),
  }

  try {
    await sbUpsert(sbUrl, sbKey, 'equity_fundamentals_derived', [row])
  } catch (e) {
    return json({ error: 'Upsert failed: ' + (e as Error).message }, 500)
  }

  return json({
    status: 'computed',
    ticker,
    fiscal_year,
    piotroski_f: scores.piotroski_f,
    altman_z: scores.altman_z,
    beneish_m: scores.beneish_m,
    roic: scores.roic,
    wacc_est: scores.wacc_est,
    pct_gross_profit: scores.pct_gross_profit,
    had_reported_financials: annualReports.length > 0,
    had_prior_year: prv != null,
  })
})

// If Finnhub reported financials are unavailable, fall back to metric blob
function makeMetricFallback(metric: FhMetric): AnnualData {
  // Fail loud: no real share count → null. (Falling back to marketCapitalization
  // as a share count was nonsensical and corrupted every per-share derivation.)
  const shares = n(metric['shareOutstanding'])
  return {
    revenue:             n(metric['revenuePerShareTTM']) != null && shares ? (n(metric['revenuePerShareTTM'])! * shares) : null,
    grossProfit:         null,
    ebit:                null,
    netIncome:           n(metric['epsNormalizedAnnual']) != null && shares ? (n(metric['epsNormalizedAnnual'])! * shares) : null,
    cfo:                 n(metric['cashFlowPerShareTTM']) != null && shares ? (n(metric['cashFlowPerShareTTM'])! * shares) : null,
    cfi:                 null,
    capex:               null,
    depreciation:        null,
    totalAssets:         null,
    currentAssets:       null,
    currentLiabilities:  null,
    retainedEarnings:    null,
    totalLiabilities:    null,
    longTermDebt:        null,
    ppe:                 null,
    accountsReceivable:  null,
    sga:                 null,
    sharesOutstanding:   shares,
    dividendsPaid:       null,
    buybacks:            null,
    bookEquity:          null,
  }
}
