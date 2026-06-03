// Edge Function: cortex_pretrade_risk
//
// Computes the three scalars needed for client-side marginal risk slider:
//   sigma_p   — current portfolio daily vol (std dev of portfolio returns)
//   sigma_c   — candidate asset daily vol
//   cov_cp    — candidate-to-portfolio covariance (Σ_j w_j · cov(c,j))
//
// Plus current book aggregates so the client can compute all panel deltas
// instantly without a round-trip per slider tick.
//
// Client computes, for any allocation fraction `a`:
//   σ_new(a) = sqrt((1−a)²·σ_p² + a²·σ_c² + 2·a·(1−a)·cov_cp)
//   VaR(95,1d) = 1.645 · σ_new(a) · NAV
//   MCTR(c)   = a · (a·σ_c² + (1−a)·cov_cp) / σ_new(a)
//   Beta_p(a) = (1−a)·beta_p + a·beta_c
//   EffN(a)   = 1 / Σ wᵢ²   (rescaled weights: existing × (1−a), candidate at a)
//
// Parametric/normal VaR. Label it as such in the UI footnote.
//
// NOTE: No pre-computed covariance matrix exists in the DB.
// This function computes it on the fly from 252 days of price_history.
// Typical latency: <800ms for a 20-position portfolio.
//
// Required secrets: SUPABASE_DB_URL (already set)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

// ── CORS ────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

const LOOKBACK_DAYS  = 252   // ~1 trading year
const Z_95           = 1.645 // one-tailed 95% VaR
const MIN_OBS        = 30    // a position needs >= this many returns to enter the vol/cov calc

type Sql = ReturnType<typeof postgres>

// ── Math helpers ───────────────────────────────────────────────────────────
function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)
}

function stddev(xs: number[]): number {
  return Math.sqrt(variance(xs))
}

function covariance(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return 0
  const mx = mean(xs.slice(0, n))
  const my = mean(ys.slice(0, n))
  return xs.slice(0, n).reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / (n - 1)
}

// Compute daily log returns from a sorted (ascending by date) price series
function toReturns(prices: number[]): number[] {
  const rets: number[] = []
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      rets.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }
  }
  return rets
}

// Effective N from weight vector: 1 / Σ wᵢ²  (Herfindahl-based)
function effectiveN(weights: number[]): number {
  const hhi = weights.reduce((s, w) => s + w * w, 0)
  return hhi > 0 ? 1 / hhi : 0
}

// ── Data fetch ─────────────────────────────────────────────────────────────
interface PriceRow {
  symbol: string
  asset_id: string
  prices: number[]     // ascending by date, length up to LOOKBACK_DAYS+1
}

interface PositionRow {
  symbol: string
  asset_id: string
  weight: number       // fraction of NAV (0..1)
  market_value: number
  sector: string
}

async function fetchPortfolio(sql: Sql): Promise<{ positions: PositionRow[]; total_nav: number }> {
  // Aggregate by asset — the positions table can hold multiple rows per asset
  // (historical / multi-lot), so collapse to one row per asset_id.
  const rows = await sql<{
    symbol: string; asset_id: string; market_value: number; sector: string
  }[]>`
    SELECT a.symbol, a.id::text AS asset_id,
           SUM(p.market_value) AS market_value,
           COALESCE(ec.payload->'Overview'->>'Sector', a.sector, 'Other') AS sector
    FROM positions p
    JOIN assets a ON a.id = p.asset_id
    LEFT JOIN equity_cache ec ON ec.symbol = a.symbol
    WHERE p.quantity > 0
    GROUP BY a.symbol, a.id, COALESCE(ec.payload->'Overview'->>'Sector', a.sector, 'Other')
    ORDER BY SUM(p.market_value) DESC
  `

  const totalNav = rows.reduce((s, r) => s + Number(r.market_value), 0)

  const positions: PositionRow[] = rows.map(r => ({
    symbol:       r.symbol,
    asset_id:     r.asset_id,
    market_value: Number(r.market_value),
    weight:       totalNav > 0 ? Number(r.market_value) / totalNav : 0,
    sector:       r.sector,
  }))

  return { positions, total_nav: totalNav }
}

async function fetchPriceSeries(
  sql: Sql,
  assetIds: string[],
): Promise<Map<string, number[]>> {
  if (assetIds.length === 0) return new Map()

  // Fetch last LOOKBACK_DAYS+1 closes per asset (need +1 to compute LOOKBACK_DAYS returns)
  const rows = await sql<{ asset_id: string; close: number }[]>`
    WITH ranked AS (
      SELECT
        asset_id::text,
        COALESCE(adjusted_close, close) AS close,
        ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY price_date DESC) AS rn
      FROM price_history
      WHERE asset_id = ANY(${assetIds.map(id => id)}::uuid[])
        AND interval = '1d'
        AND COALESCE(adjusted_close, close) > 0
    )
    SELECT asset_id, close
    FROM ranked
    WHERE rn <= ${LOOKBACK_DAYS + 1}
    ORDER BY asset_id, rn DESC   -- ascending date order within each asset
  `

  const map = new Map<string, number[]>()
  for (const r of rows) {
    const id = r.asset_id
    if (!map.has(id)) map.set(id, [])
    map.get(id)!.push(Number(r.close))
  }
  return map
}

async function findCandidateAssetId(sql: Sql, ticker: string): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    SELECT id::text FROM assets WHERE symbol = ${ticker} LIMIT 1
  `
  return rows[0]?.id ?? null
}

async function fetchBeta(sql: Sql, assetId: string): Promise<number | null> {
  // Beta from equity_cache (Finnhub metric)
  const rows = await sql<{ beta: number | null }[]>`
    SELECT (ec.payload->'Finnhub'->'metric'->>'beta')::numeric AS beta
    FROM equity_cache ec
    JOIN assets a ON a.symbol = ec.symbol
    WHERE a.id::text = ${assetId}
    LIMIT 1
  `
  const b = rows[0]?.beta
  return b != null ? Number(b) : null
}

// ── Core risk computation ──────────────────────────────────────────────────
interface PreTradeResult {
  // The three scalars the client uses for live slider recompute
  sigma_p:   number    // current portfolio daily vol (std dev, not annualized)
  sigma_c:   number    // candidate daily vol
  cov_cp:    number    // candidate-to-portfolio covariance

  // Current book aggregates
  var_95_daily_zar:  number    // current portfolio VaR in ZAR (1.645 × σ_p × NAV)
  beta_p:            number    // portfolio weighted beta
  beta_c:            number | null  // candidate beta (null if not in cache)
  total_nav:         number
  effective_n:       number    // current 1/Σwᵢ²
  n_positions:       number

  // Per-position weights for Effective N recompute on client
  position_weights: { symbol: string; weight: number; sector: string }[]

  // Sector/theme current state for the candidate's sector
  candidate_sector:       string
  candidate_sector_weight: number   // current fraction of NAV
  candidate_sector_nav:   number    // current ZAR in sector

  // Diagnostics
  obs:      number   // number of overlapping return observations used
  method:   'parametric_normal'
}

async function computePreTradeRisk(
  sql: Sql,
  candidateTicker: string,
): Promise<PreTradeResult> {
  // 1. Portfolio composition
  const { positions, total_nav } = await fetchPortfolio(sql)
  if (positions.length === 0) throw new Error('No portfolio positions found')

  // 2. Find candidate asset
  const candidateAssetId = await findCandidateAssetId(sql, candidateTicker)
  if (!candidateAssetId) throw new Error(`Ticker not found in assets: ${candidateTicker}`)

  // 3. Fetch price series for all positions + candidate
  const allAssetIds = [...positions.map(p => p.asset_id), candidateAssetId]
  const priceMap    = await fetchPriceSeries(sql, allAssetIds)

  // 4. Compute return series
  const returnMap = new Map<string, number[]>()
  for (const [id, prices] of priceMap) {
    returnMap.set(id, toReturns(prices))
  }

  const candidateReturns = returnMap.get(candidateAssetId) ?? []
  if (candidateReturns.length < 20) {
    throw new Error(`Insufficient price history for ${candidateTicker} (${candidateReturns.length} obs)`)
  }

  // 5. Align to a common window. Positions with too little history (< MIN_OBS
  //    returns) are excluded from the vol/cov computation so a single
  //    newly-added name can't collapse the whole window to a few days.
  //    Their weight is renormalised across the qualifying set.
  const qualifying = positions
    .map(p => ({ p, rets: returnMap.get(p.asset_id) ?? [] }))
    .filter(x => x.rets.length >= MIN_OBS)

  if (qualifying.length === 0) {
    throw new Error(`No portfolio positions have >= ${MIN_OBS} days of price history`)
  }

  const obs = Math.min(
    candidateReturns.length,
    ...qualifying.map(x => x.rets.length),
  )

  const qualWeightSum = qualifying.reduce((s, x) => s + x.p.weight, 0) || 1

  // 6. Compute portfolio return series (weighted sum of qualifying position returns)
  const portfolioReturns: number[] = new Array(obs).fill(0)
  for (const { p, rets } of qualifying) {
    const w = p.weight / qualWeightSum   // renormalise within qualifying set
    for (let t = 0; t < obs; t++) {
      portfolioReturns[t] += w * (rets[t] ?? 0)
    }
  }

  // 7. Core scalars
  const sigmaP = stddev(portfolioReturns)
  const sigmaC = stddev(candidateReturns.slice(0, obs))
  const covCp  = covariance(candidateReturns.slice(0, obs), portfolioReturns)

  // 8. Portfolio-level aggregates
  const varDaily = Z_95 * sigmaP * total_nav

  // Effective N
  const effN = effectiveN(positions.map(p => p.weight))

  // 9. Beta (from equity_cache; best-effort)
  const [betaP, betaC] = await Promise.all([
    // Portfolio beta: weighted average of position betas from cache
    (async () => {
      const betas = await Promise.all(
        positions.map(p => fetchBeta(sql, p.asset_id)),
      )
      const validPairs = positions
        .map((p, i) => ({ w: p.weight, b: betas[i] }))
        .filter(x => x.b != null)
      if (validPairs.length === 0) return 1.0
      const wSum  = validPairs.reduce((s, x) => s + x.w, 0)
      return validPairs.reduce((s, x) => s + x.w * x.b!, 0) / (wSum || 1)
    })(),
    fetchBeta(sql, candidateAssetId),
  ])

  // 10. Candidate sector info
  const candidateSectorRow = await sql<{ sector: string; sector_nav: number; weight: number }[]>`
    SELECT
      COALESCE(ec.payload->'Overview'->>'Sector', a.sector, 'Other') AS sector,
      SUM(p.market_value)                                             AS sector_nav,
      SUM(p.market_value) / ${total_nav}                             AS weight
    FROM assets a
    JOIN positions p ON p.asset_id = a.id
    LEFT JOIN equity_cache ec ON ec.symbol = a.symbol
    WHERE a.symbol = ${candidateTicker}
       OR COALESCE(ec.payload->'Overview'->>'Sector', a.sector) = (
            SELECT COALESCE(ec2.payload->'Overview'->>'Sector', a2.sector, 'Other')
            FROM assets a2
            LEFT JOIN equity_cache ec2 ON ec2.symbol = a2.symbol
            WHERE a2.id::text = ${candidateAssetId}
            LIMIT 1
          )
    GROUP BY 1
    LIMIT 1
  `

  const candidateSector      = candidateSectorRow[0]?.sector ?? 'Other'
  const candidateSectorNav   = Number(candidateSectorRow[0]?.sector_nav ?? 0)
  const candidateSectorWeight = total_nav > 0 ? candidateSectorNav / total_nav : 0

  return {
    sigma_p:   sigmaP,
    sigma_c:   sigmaC,
    cov_cp:    covCp,

    var_95_daily_zar: varDaily,
    beta_p:           betaP,
    beta_c:           betaC,
    total_nav,
    effective_n:      effN,
    n_positions:      positions.length,

    position_weights: positions.map(p => ({
      symbol: p.symbol,
      weight: p.weight,
      sector: p.sector,
    })),

    candidate_sector:        candidateSector,
    candidate_sector_weight: candidateSectorWeight,
    candidate_sector_nav:    candidateSectorNav,

    obs,
    method: 'parametric_normal',
  }
}

// ── HTTP entry point ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS })
  }

  const payload = await req.json().catch(() => ({}))
  const ticker  = payload.ticker as string | undefined

  if (!ticker || typeof ticker !== 'string') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Missing required field: ticker' }),
      { status: 400, headers: JSON_HEADERS },
    )
  }

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

  try {
    const result = await computePreTradeRisk(sql, ticker.toUpperCase())

    return new Response(
      JSON.stringify({ ok: true, ...result }),
      { headers: JSON_HEADERS },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[cortex_pretrade_risk] Error for ${ticker}:`, msg)
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: JSON_HEADERS },
    )
  } finally {
    await sql.end()
  }
})
