// Edge Function: generate_cortex_signals
//
// Hybrid signal engine for the Cortex module.
// Stage A: deterministic rules over existing portfolio analytics
// Stage B: Claude API enriches each signal with title + thesis narrative
//
// Modes:
//   POST {}                  → full regeneration (cron / on-demand)
//   POST {dry_run: true}     → run all logic, skip DB writes
//   POST {class_filter: []}  → only regenerate specific signal classes
//
// Required secrets (Dashboard → Edge Functions → Secrets):
//   SUPABASE_DB_URL     (already set for other functions)
//   ANTHROPIC_API_KEY   (new — set before deploying)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

// ── CORS ────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' }

// ── Constants (expose for tuning) ──────────────────────────────────────────
const MODULE_NAME          = 'Cortex'
const CLAUDE_MODEL         = 'claude-sonnet-4-6'
const ANTHROPIC_API        = 'https://api.anthropic.com/v1/messages'

// Thresholds
const THEME_CEILING_PCT    = 25     // % NAV: sector above this → no thesis signal
const HEADROOM_MIN_PCT     = 2      // min headroom vs ceiling to emit thesis signal
const GAP_THRESHOLD_PCT    = 1.5    // undershoot vs equal-weight SAA → gap filler fires
const VAR_SHARE_THRESHOLD  = 0.10   // single name > 10% of portfolio VaR → risk flag
const HIGH_VOL_THRESHOLD   = 0.35   // annual vol > 35% → high vol risk flag
const MAX_PER_CLASS        = 3      // cap per signal class per run
const CANDIDATE_LIMIT      = 4      // max candidates per signal

// NOTE: Component VaR, Effective N, and conditional correlation (Risk v2.1)
// are not yet exposed as queryable views. This function uses simpler marginal
// VaR (weight × vol) and individual dollar_var_95_daily as proxies.
// When Risk v2.1 view is available, update the risk flag rules in
// buildRiskFlagSignals() to use those metrics directly.

// ── Types ──────────────────────────────────────────────────────────────────
interface Position {
  symbol: string
  sector: string
  weight: number
  annual_vol: number
  dollar_var_95: number
  market_value: number
  risk_tier: string
  name: string
}

interface SectorSummary {
  sector: string
  weight_pct: number
  n_positions: number
  symbols: string[]
}

interface PortfolioState {
  positions: Position[]
  sectors: SectorSummary[]
  total_nav: number
  portfolio_var: number
  held_symbols: string[]
  n_sectors: number
  equal_weight_target_pct: number
}

interface Candidate {
  ticker: string
  fit_score: number
  sector: string
  subtheme: string
  name?: string
}

interface SignalDraft {
  signal_class: 'thesis' | 'gap' | 'risk'
  relevance: number
  conviction: 'low' | 'medium' | 'high'
  risk_urgency: number
  setup_json: Record<string, unknown>
  candidates: Candidate[]
  origin_metric: string
  // filled by Stage B
  title?: string
  thesis_md?: string
}

type Sql = ReturnType<typeof postgres>

// ── Stage A: Portfolio analytics ───────────────────────────────────────────
async function buildPortfolioState(sql: Sql): Promise<PortfolioState> {
  // Per-position risk from existing view
  const riskRows = await sql<{
    symbol: string; name: string; market_value: number; weight: number;
    annual_vol: number; dollar_var_95_daily: number; risk_tier: string
  }[]>`
    SELECT symbol, name, market_value, weight, annual_vol,
           dollar_var_95_daily, risk_tier
    FROM vw_risk_analysis
    ORDER BY dollar_var_95_daily DESC
  `

  // Sector composition via positions + assets + equity_cache for better sector data
  const sectorRows = await sql<{
    sector: string; weight_pct: number; n_positions: number; symbols: string[]
  }[]>`
    WITH nav AS (SELECT SUM(market_value) AS total FROM positions WHERE quantity > 0),
    sector_agg AS (
      SELECT
        COALESCE(
          ec.payload->'Overview'->>'Sector',
          a.sector,
          'Other'
        )                                               AS sector,
        SUM(p.market_value)                             AS sector_mv,
        COUNT(DISTINCT a.symbol)                        AS n_positions,
        ARRAY_AGG(a.symbol ORDER BY p.market_value DESC) AS symbols
      FROM positions p
      JOIN assets a ON a.id = p.asset_id
      LEFT JOIN equity_cache ec ON ec.symbol = a.symbol
      CROSS JOIN nav
      WHERE p.quantity > 0
      GROUP BY 1
    )
    SELECT
      sector,
      ROUND((sector_mv / (SELECT total FROM nav) * 100)::numeric, 2) AS weight_pct,
      n_positions,
      symbols
    FROM sector_agg
    ORDER BY weight_pct DESC
  `

  const totalNavRow = await sql<{ total_nav: number }[]>`
    SELECT SUM(market_value) AS total_nav FROM positions WHERE quantity > 0
  `

  const totalNav    = Number(totalNavRow[0]?.total_nav ?? 0)
  const portfolioVar = riskRows.reduce((s, r) => s + Number(r.dollar_var_95_daily), 0)
  const heldSymbols  = riskRows.map(r => r.symbol)

  const positions: Position[] = riskRows.map(r => ({
    symbol:       r.symbol,
    name:         r.name,
    sector:       sectorRows.find(s => s.symbols.includes(r.symbol))?.sector ?? 'Other',
    weight:       Number(r.weight),
    annual_vol:   Number(r.annual_vol),
    dollar_var_95: Number(r.dollar_var_95_daily),
    market_value: Number(r.market_value),
    risk_tier:    r.risk_tier,
  }))

  const nSectors = sectorRows.length
  const equalWeightTarget = nSectors > 0 ? 100 / nSectors : 10

  return {
    positions,
    sectors: sectorRows.map(r => ({
      sector:       r.sector,
      weight_pct:   Number(r.weight_pct),
      n_positions:  Number(r.n_positions),
      symbols:      r.symbols,
    })),
    total_nav:              totalNav,
    portfolio_var:          portfolioVar,
    held_symbols:           heldSymbols,
    n_sectors:              nSectors,
    equal_weight_target_pct: equalWeightTarget,
  }
}

// Get candidate tickers for a sector (non-held names with recent price data)
async function fetchCandidates(
  sql: Sql,
  sector: string,
  heldSymbols: string[],
  limit: number,
): Promise<Candidate[]> {
  const rows = await sql<{ symbol: string; name: string; sector_src: string; roe: number | null; quality: number }[]>`
    WITH held AS (SELECT UNNEST(${heldSymbols}::text[]) AS sym),
    universe AS (
      SELECT
        a.symbol,
        COALESCE(a.name, a.symbol)                          AS name,
        COALESCE(ec.payload->'Overview'->>'Sector', a.sector, 'Other') AS sector_src,
        (ec.payload->'Finnhub'->'metric'->>'roaRfy')::numeric         AS roe,
        CASE
          WHEN (ec.payload->'Finnhub'->'metric'->>'peBasicExclExtraTTM')::numeric BETWEEN 5 AND 30
            THEN 20 ELSE 0
        END +
        CASE
          WHEN (ec.payload->'Finnhub'->'metric'->>'roaRfy')::numeric > 0.05
            THEN 30 ELSE 0
        END +
        CASE
          WHEN (ec.payload->'Finnhub'->'metric'->>'revenueGrowthTTMYoy')::numeric > 0
            THEN 20 ELSE 0
        END +
        CASE
          WHEN (ec.payload->'Overview'->>'AnalystTargetPrice')::numeric >
               (ec.payload->'Overview'->>'50DayMovingAverage')::numeric
            THEN 30 ELSE 0
        END                                                  AS quality
      FROM assets a
      LEFT JOIN equity_cache ec ON ec.symbol = a.symbol
      WHERE a.asset_class IN ('Stock', 'us_equity', 'equity', 'etf')
        AND a.symbol NOT IN (SELECT sym FROM held)
        AND EXISTS (
          SELECT 1 FROM price_history ph
          WHERE ph.asset_id = a.id
          GROUP BY ph.asset_id HAVING COUNT(*) >= 20
        )
        AND (
          COALESCE(ec.payload->'Overview'->>'Sector', a.sector, '') = ${sector}
          OR ${sector} = 'any'
        )
    )
    SELECT symbol, name, sector_src, roe, quality
    FROM universe
    ORDER BY quality DESC NULLS LAST, symbol
    LIMIT ${limit}
  `

  return rows.map(r => ({
    ticker:    r.symbol,
    name:      r.name,
    sector:    r.sector_src,
    subtheme:  r.sector_src,
    fit_score: Math.min(100, Math.max(0, Number(r.quality ?? 0))),
  }))
}

// ── Sizing engine: Risk-Budgeted Conviction Sizing ─────────────────────────
// Base allocation is set by conviction tier, scaled down for high-volatility
// names toward a target portfolio vol, then clamped by SAA headroom, a hard
// single-add ceiling, a sector-concentration cap, and a minimum economic size.
const SIZE_TARGET_VOL_ANNUAL = 0.25  // names above this get scaled down
const SIZE_HARD_CEILING_PCT  = 5     // never add more than this in one move
const SIZE_FLOOR_PCT         = 0.5   // below this, costs outweigh alpha
const SIZE_SECTOR_CONC_PCT   = 20    // sector above this → tighten new adds
const SIZE_SECTOR_CONC_CAP   = 1.5   // cap when sector already concentrated

function convictionToScore(c: 'low' | 'medium' | 'high'): number {
  return c === 'high' ? 0.8 : c === 'medium' ? 0.55 : 0.3
}

function computeSuggestedSize(opts: {
  conviction: 'low' | 'medium' | 'high'
  headroomPct: number
  sectorWeightPct: number
  positionVol?: number   // annualized; omit when unknown (no vol scaling)
}): { size_pct: number; rationale: string } {
  const score = convictionToScore(opts.conviction)

  // 1. Conviction-tiered base allocation
  const base = score >= 0.7 ? 3.0 : score >= 0.4 ? 2.0 : 1.0

  // 2. Volatility scalar (only when we have a vol estimate)
  let volScalar = 1.0
  if (opts.positionVol && opts.positionVol > 0) {
    volScalar = Math.min(1.0, SIZE_TARGET_VOL_ANNUAL / opts.positionVol)
  }

  let size = base * volScalar
  const beforeCaps = size

  // 3. SAA headroom + hard single-add ceiling
  const ceiling = Math.min(opts.headroomPct, SIZE_HARD_CEILING_PCT)
  size = Math.min(size, ceiling)

  // 4. Sector-concentration cap
  let sectorCapped = false
  if (opts.sectorWeightPct > SIZE_SECTOR_CONC_PCT) {
    size = Math.min(size, SIZE_SECTOR_CONC_CAP)
    sectorCapped = true
  }

  // 5. Minimum economic size — unless headroom itself is below the floor
  if (ceiling >= SIZE_FLOOR_PCT) {
    size = Math.max(size, SIZE_FLOOR_PCT)
  } else {
    size = ceiling
  }

  size = Math.round(size * 100) / 100

  const parts = [`${opts.conviction} conviction → ${base.toFixed(1)}% base`]
  if (volScalar < 1) parts.push(`vol-scaled ×${volScalar.toFixed(2)}`)
  if (beforeCaps > ceiling) parts.push(`capped to ${ceiling.toFixed(1)}% headroom/ceiling`)
  if (sectorCapped) parts.push(`sector >${SIZE_SECTOR_CONC_PCT}% → tightened to ${SIZE_SECTOR_CONC_CAP}%`)

  return { size_pct: size, rationale: parts.join('; ') }
}

// ── Stage A: Rule engines ──────────────────────────────────────────────────
async function buildThesisSignals(
  sql: Sql,
  state: PortfolioState,
): Promise<SignalDraft[]> {
  const signals: SignalDraft[] = []

  for (const s of state.sectors) {
    if (signals.length >= MAX_PER_CLASS) break

    const headroom = THEME_CEILING_PCT - s.weight_pct
    if (headroom < HEADROOM_MIN_PCT) continue  // at or near ceiling
    if (s.weight_pct <= 0) continue             // not currently held

    // Relevance scales with current weight (larger existing thesis = higher relevance)
    const relevance = Math.min(100, Math.round(s.weight_pct * 3 + headroom))
    const conviction: 'low' | 'medium' | 'high' =
      s.weight_pct > 15 ? 'high' : s.weight_pct > 8 ? 'medium' : 'low'

    let candidates = await fetchCandidates(sql, s.sector, state.held_symbols, CANDIDATE_LIMIT)
    if (candidates.length === 0) {
      candidates = await fetchCandidates(sql, 'any', state.held_symbols, CANDIDATE_LIMIT)
    }

    const sizing = computeSuggestedSize({
      conviction,
      headroomPct:     headroom,
      sectorWeightPct: s.weight_pct,
    })
    const suggestedSizePct = sizing.size_pct

    signals.push({
      signal_class: 'thesis',
      relevance,
      conviction,
      risk_urgency: 0,
      setup_json: {
        action:              'buy',
        theme:               s.sector,
        theme_weight_from:   s.weight_pct,
        theme_weight_to:     Math.min(s.weight_pct + suggestedSizePct, THEME_CEILING_PCT),
        suggested_size_pct:  suggestedSizePct,
        sizing_rationale:    sizing.rationale,
        subtheme:            s.sector,
        headroom_pct:        headroom,
        saa_ceiling_pct:     THEME_CEILING_PCT,
        n_existing_positions: s.n_positions,
      },
      candidates,
      origin_metric: `thesis_extender:${s.sector}:weight=${s.weight_pct}pct`,
    })
  }

  return signals
}

async function buildGapSignals(
  sql: Sql,
  state: PortfolioState,
): Promise<SignalDraft[]> {
  const signals: SignalDraft[] = []
  const { equal_weight_target_pct } = state

  // Identify sectors with zero weight or significant undershoot
  // Also detect sectors with >0 holdings but still below target
  const gapSectors = state.sectors
    .filter(s => {
      const gap = s.weight_pct - equal_weight_target_pct
      return gap < -GAP_THRESHOLD_PCT
    })
    .sort((a, b) => (a.weight_pct - equal_weight_target_pct) - (b.weight_pct - equal_weight_target_pct))

  // Also check for completely unrepresented sectors with price history
  const unrepresentedRows = await sql<{ sector: string }[]>`
    SELECT DISTINCT COALESCE(ec.payload->'Overview'->>'Sector', a.sector, 'Other') AS sector
    FROM assets a
    LEFT JOIN equity_cache ec ON ec.symbol = a.symbol
    WHERE a.asset_class IN ('Stock', 'us_equity', 'equity', 'etf')
      AND COALESCE(ec.payload->'Overview'->>'Sector', a.sector) IS NOT NULL
      AND COALESCE(ec.payload->'Overview'->>'Sector', a.sector, '') NOT IN (
        SELECT UNNEST(${state.sectors.map(s => s.sector)}::text[])
      )
    ORDER BY 1
    LIMIT 5
  `

  const allGapTargets = [
    ...gapSectors.map(s => ({ sector: s.sector, current_pct: s.weight_pct })),
    ...unrepresentedRows.map(r => ({ sector: r.sector, current_pct: 0 })),
  ].slice(0, MAX_PER_CLASS)

  for (const g of allGapTargets) {
    if (signals.length >= MAX_PER_CLASS) break

    const gap = g.current_pct - equal_weight_target_pct
    const absgap = Math.abs(gap)
    const relevance = Math.min(100, Math.round(absgap * 8))
    const conviction: 'low' | 'medium' | 'high' =
      absgap > 8 ? 'high' : absgap > 4 ? 'medium' : 'low'

    let candidates = await fetchCandidates(sql, g.sector, state.held_symbols, CANDIDATE_LIMIT)
    if (candidates.length === 0) {
      candidates = await fetchCandidates(sql, 'any', state.held_symbols, CANDIDATE_LIMIT)
    }
    if (candidates.length === 0) continue

    // For gap fills, the room to deploy is the undershoot vs SAA target.
    const sizing = computeSuggestedSize({
      conviction,
      headroomPct:     absgap,
      sectorWeightPct: g.current_pct,
    })

    signals.push({
      signal_class: 'gap',
      relevance,
      conviction,
      risk_urgency: 0,
      setup_json: {
        action:              'buy',
        theme:               g.sector,
        gap_pct:             gap,
        current_weight_pct:  g.current_pct,
        saa_target_pct:      equal_weight_target_pct,
        suggested_size_pct:  sizing.size_pct,
        sizing_rationale:    sizing.rationale,
        from_gap:            true,
      },
      candidates,
      origin_metric: `gap_filler:${g.sector}:gap=${gap.toFixed(1)}pct_vs_target=${equal_weight_target_pct.toFixed(1)}pct`,
    })
  }

  return signals
}

function buildRiskFlagSignals(state: PortfolioState): SignalDraft[] {
  const signals: SignalDraft[] = []
  const { portfolio_var, positions } = state

  // Name-level VaR concentration flags
  for (const pos of positions) {
    if (signals.length >= MAX_PER_CLASS) break

    const varShare = portfolio_var > 0 ? pos.dollar_var_95 / portfolio_var : 0
    const isHighVol = pos.annual_vol > HIGH_VOL_THRESHOLD

    if (varShare < VAR_SHARE_THRESHOLD && !isHighVol) continue

    const riskUrgency = Math.min(100, Math.round(varShare * 200))
    const relevance   = riskUrgency
    const conviction: 'low' | 'medium' | 'high' =
      varShare > 0.25 ? 'high' : varShare > 0.18 ? 'medium' : 'low'

    signals.push({
      signal_class:  'risk',
      relevance,
      conviction,
      risk_urgency:  riskUrgency,
      setup_json: {
        action:               'reduce',
        name:                 pos.name,
        symbol:               pos.symbol,
        var_share_pct:        (varShare * 100).toFixed(1),
        var_threshold_pct:    (VAR_SHARE_THRESHOLD * 100).toFixed(1),
        annual_vol_pct:       (pos.annual_vol * 100).toFixed(1),
        dollar_var_95:        pos.dollar_var_95.toFixed(0),
        portfolio_var_total:  portfolio_var.toFixed(0),
        portfolio_weight_pct: (pos.weight * 100).toFixed(1),
        risk_tier:            pos.risk_tier,
        suggested_reduction_pct: Math.min(pos.weight * 100 * 0.3, 3).toFixed(1),
        note_on_metrics: 'Using marginal VaR proxy (weight×vol). Component VaR via covariance matrix available after Risk v2.1 view is deployed.',
      },
      candidates: [{
        ticker:    pos.symbol,
        fit_score: 0,
        sector:    pos.sector,
        subtheme:  'Reduce concentration',
        name:      pos.name,
      }],
      origin_metric: `risk_flag:${pos.symbol}:var_share=${(varShare * 100).toFixed(1)}pct:vol=${(pos.annual_vol * 100).toFixed(0)}pct`,
    })
  }

  return signals
}

// ── Stage B: Claude narrative ──────────────────────────────────────────────
async function callClaude(prompt: string): Promise<{ title: string; thesis_md: string } | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set — skipping narrative enrichment')
    return null
  }

  try {
    const resp = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 300,
        system: [
          'You are an institutional portfolio analyst for an international, US-dollar-denominated equity portfolio traded through Alpaca.',
          'All monetary values are in USD. Do not reference the JSE, ZAR, or any South-Africa-specific framing.',
          'Generate concise, data-grounded signal narratives.',
          'Output ONLY valid JSON with keys "title" (string, one line) and "thesis_md" (string, 2-4 sentences).',
          'Only reference tickers supplied in the input. Do not fabricate numbers. If unsure, omit rather than invent.',
        ].join(' '),
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!resp.ok) {
      const body = await resp.text()
      console.error(`Claude API error ${resp.status}: ${body.slice(0, 300)}`)
      return null
    }

    const data = await resp.json()
    // Filter content blocks defensively
    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
    if (!textBlock?.text) return null

    // Strip code fences before parsing
    const raw = textBlock.text
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim()

    const parsed = JSON.parse(raw)
    if (typeof parsed.title !== 'string' || typeof parsed.thesis_md !== 'string') return null
    return { title: parsed.title, thesis_md: parsed.thesis_md }
  } catch (err) {
    console.error('Claude parse error:', err)
    return null
  }
}

async function enrichWithClaude(drafts: SignalDraft[]): Promise<SignalDraft[]> {
  const enriched: SignalDraft[] = []

  for (const d of drafts) {
    const tickers = d.candidates.map(c => c.name ? `${c.ticker} (${c.name})` : c.ticker).join(', ')
    const setup   = d.setup_json

    let prompt: string
    if (d.signal_class === 'thesis') {
      const s = setup as { theme: string; theme_weight_from: number; suggested_size_pct: number; sizing_rationale?: string }
      prompt = [
        `Signal class: Thesis Extender`,
        `Sector: ${s.theme} | Current weight: ${s.theme_weight_from}% | Suggested add: ${s.suggested_size_pct}%`,
        `Sizing rationale: ${s.sizing_rationale ?? 'risk-budgeted conviction sizing'}`,
        `Candidate tickers: ${tickers}`,
        `Thesis: The portfolio has an active ${s.theme} thesis with room to extend before hitting the 25% sector ceiling.`,
        `Generate title + 2-3 sentence thesis referencing these exact numbers and tickers.`,
        `Output JSON: {"title": "...", "thesis_md": "..."}`,
      ].join('\n')
    } else if (d.signal_class === 'gap') {
      const s = setup as { theme: string; gap_pct: number; saa_target_pct: number; suggested_size_pct: number; sizing_rationale?: string }
      prompt = [
        `Signal class: Gap Filler`,
        `Sector: ${s.theme} | Current weight: ${((s.saa_target_pct + (s.gap_pct ?? 0)))}% | SAA target: ${s.saa_target_pct}% | Gap: ${s.gap_pct}%`,
        `Suggested allocation: ${s.suggested_size_pct}% NAV (${s.sizing_rationale ?? 'risk-budgeted conviction sizing'})`,
        `Candidate tickers: ${tickers}`,
        `Generate title + 2-3 sentence thesis explaining why closing this gap improves portfolio construction. Reference the numbers.`,
        `Output JSON: {"title": "...", "thesis_md": "..."}`,
      ].join('\n')
    } else {
      const s = setup as { symbol: string; name: string; var_share_pct: string; annual_vol_pct: string; suggested_reduction_pct: string }
      prompt = [
        `Signal class: Risk Flag`,
        `Name: ${s.name} (${s.symbol}) | VaR share: ${s.var_share_pct}% of portfolio | Annual vol: ${s.annual_vol_pct}%`,
        `Suggested reduction: ${s.suggested_reduction_pct}% NAV`,
        `Generate title + 2-3 sentence risk management thesis explaining the concentration concern and suggested action.`,
        `Output JSON: {"title": "...", "thesis_md": "..."}`,
      ].join('\n')
    }

    const narrative = await callClaude(prompt)
    enriched.push({
      ...d,
      title:     narrative?.title     ?? `${d.signal_class.toUpperCase()}: ${d.candidates[0]?.sector ?? 'Portfolio'}`,
      thesis_md: narrative?.thesis_md ?? d.origin_metric,
    })
  }

  return enriched
}

// ── HTTP entry point ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS })
  }

  const payload    = await req.json().catch(() => ({}))
  const dryRun     = payload.dry_run === true
  const classFilter: string[] | undefined = payload.class_filter

  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

  try {
    console.log(`[${MODULE_NAME}] Signal generation starting — dry_run=${dryRun}`)

    const state = await buildPortfolioState(sql)
    console.log(`[${MODULE_NAME}] Portfolio: ${state.positions.length} positions, ${state.n_sectors} sectors, NAV=${state.total_nav.toFixed(0)}`)

    const allDrafts: SignalDraft[] = []

    if (!classFilter || classFilter.includes('thesis')) {
      const thesis = await buildThesisSignals(sql, state)
      allDrafts.push(...thesis)
      console.log(`[${MODULE_NAME}] Thesis signals: ${thesis.length}`)
    }

    if (!classFilter || classFilter.includes('gap')) {
      const gap = await buildGapSignals(sql, state)
      allDrafts.push(...gap)
      console.log(`[${MODULE_NAME}] Gap signals: ${gap.length}`)
    }

    if (!classFilter || classFilter.includes('risk')) {
      const risk = buildRiskFlagSignals(state)
      allDrafts.push(...risk)
      console.log(`[${MODULE_NAME}] Risk signals: ${risk.length}`)
    }

    if (allDrafts.length === 0) {
      console.log(`[${MODULE_NAME}] No signal candidates generated — portfolio within normal bounds`)
      return new Response(JSON.stringify({ ok: true, signals_generated: 0, inserted: 0, dry_run: dryRun }), {
        headers: JSON_HEADERS,
      })
    }

    // Stage B: Claude enrichment
    const signals = await enrichWithClaude(allDrafts)

    if (!dryRun) {
      // Clear non-muted signals and replace with fresh batch
      await sql`DELETE FROM cortex_signals WHERE is_muted = false`

      const generatedAt = new Date().toISOString()
      for (const s of signals) {
        await sql`
          INSERT INTO cortex_signals
            (signal_class, title, thesis_md, relevance, conviction, risk_urgency,
             setup_json, candidates, origin_metric, generated_at, is_muted)
          VALUES
            (${s.signal_class}, ${s.title!}, ${s.thesis_md!}, ${s.relevance},
             ${s.conviction}, ${s.risk_urgency},
             ${JSON.stringify(s.setup_json)}::jsonb, ${JSON.stringify(s.candidates)}::jsonb,
             ${s.origin_metric}, ${generatedAt}, false)
        `
      }
      console.log(`[${MODULE_NAME}] Wrote ${signals.length} signals to cortex_signals`)
    } else {
      console.log(`[${MODULE_NAME}] dry_run=true — skipping DB write`)
    }

    return new Response(
      JSON.stringify({
        ok:                true,
        signals_generated: signals.length,
        inserted:          dryRun ? 0 : signals.length,
        dry_run:           dryRun,
        breakdown: {
          thesis: signals.filter(s => s.signal_class === 'thesis').length,
          gap:    signals.filter(s => s.signal_class === 'gap').length,
          risk:   signals.filter(s => s.signal_class === 'risk').length,
        },
        previews: signals.map(s => ({
          class:  s.signal_class,
          title:  s.title,
          origin: s.origin_metric,
        })),
      }),
      { headers: JSON_HEADERS },
    )
  } catch (err) {
    console.error(`[${MODULE_NAME}] Error:`, err)
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: JSON_HEADERS },
    )
  } finally {
    await sql.end()
  }
})
