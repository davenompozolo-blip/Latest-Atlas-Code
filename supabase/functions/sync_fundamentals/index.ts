// Edge Function: sync_fundamentals
//
// Fetches Alpha Vantage OVERVIEW + EARNINGS for every current portfolio
// holding and upserts results into equity_cache, so that vw_nexus_holdings
// can surface P/E, PEG, Beta, Analyst Target (→ DCF upside), and next
// earnings date without requiring the Vercel serverless function.
//
// Invoke manually via Supabase Dashboard → Edge Functions → Invoke,
// or schedule via pg_cron / GitHub Actions calling the functions URL.
//
// Required secrets (Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL            — your project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key
//   ALPHA_VANTAGE_KEY       — Alpha Vantage free-tier API key
//   FINNHUB_API_KEY         — Finnhub free-tier API key (primary, faster)
//
// Strategy: Finnhub first (60 req/min free), Alpha Vantage as fallback
// (25 req/day — used sparingly for symbols Finnhub misses).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const AV_BASE      = 'https://www.alphavantage.co/query'
const FH_BASE      = 'https://finnhub.io/api/v1'
const THROTTLE_MS  = 1200   // ~50 req/min → comfortably under Finnhub 60/min
const MAX_SYMBOLS  = 60

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Supabase REST helpers ───────────────────────────────────────

function sbHeaders(key: string) {
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
}

async function sbGet(baseUrl: string, key: string, path: string) {
  const r = await fetch(baseUrl + path, { headers: sbHeaders(key) })
  if (!r.ok) throw new Error('Supabase GET ' + path + ': ' + r.status)
  return r.json()
}

async function sbUpsert(baseUrl: string, key: string, table: string, rows: unknown[]) {
  const r = await fetch(baseUrl + '/rest/v1/' + table, {
    method: 'POST',
    headers: { ...sbHeaders(key), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error('Supabase upsert ' + table + ': ' + r.status + ' ' + t.slice(0, 200))
  }
}

// ── Finnhub ─────────────────────────────────────────────────────

interface FinnhubProfile {
  name?: string; ticker?: string; finnhubIndustry?: string;
  beta?: number; weburl?: string
}
interface FinnhubMetric {
  '52WeekHigh'?: number; '52WeekLow'?: number;
  peNormalizedAnnual?: number; pegRatio?: number;
  beta?: number; revenuePerShareAnnual?: number
}
interface FinnhubRec { buy?: number; hold?: number; sell?: number; strongBuy?: number; strongSell?: number }
interface FinnhubEps { data?: { actual?: number; estimate?: number; period?: string }[] }
interface FinnhubPriceTarget { targetMean?: number; targetHigh?: number; targetLow?: number; targetMedian?: number }

async function finnhubFetch<T>(path: string, fhKey: string): Promise<T | null> {
  try {
    const r = await fetch(FH_BASE + path + '&token=' + fhKey, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    return await r.json() as T
  } catch { return null }
}

async function finnhubOverview(symbol: string, fhKey: string) {
  const [profile, metrics, recs, eps, priceTarget] = await Promise.all([
    finnhubFetch<FinnhubProfile>('/stock/profile2?symbol=' + encodeURIComponent(symbol), fhKey),
    finnhubFetch<{ metric: FinnhubMetric }>('/stock/metric?symbol=' + encodeURIComponent(symbol) + '&metric=all', fhKey),
    finnhubFetch<{ recommendation: FinnhubRec[] }>('/stock/recommendation?symbol=' + encodeURIComponent(symbol), fhKey),
    finnhubFetch<FinnhubEps>('/stock/eps-surprise?symbol=' + encodeURIComponent(symbol) + '&limit=1', fhKey),
    finnhubFetch<FinnhubPriceTarget>('/stock/price-target?symbol=' + encodeURIComponent(symbol), fhKey),
  ])

  const m  = metrics?.metric || {}
  const rec = recs?.recommendation?.[0] || {}

  const beta         = m.beta ?? profile?.beta
  const peRatio      = m.peNormalizedAnnual
  const pegRatio     = m.pegRatio
  const analystTarget = priceTarget?.targetMean ?? priceTarget?.targetMedian
  const week52High   = m['52WeekHigh']
  const week52Low    = m['52WeekLow']
  const name         = profile?.name
  const sector       = profile?.finnhubIndustry

  const hasData = beta != null || peRatio != null || analystTarget != null
  if (!hasData) return null

  return {
    Symbol: symbol,
    Name: name,
    Sector: sector,
    Beta: beta != null ? String(beta) : undefined,
    PERatio: peRatio != null ? String(peRatio) : undefined,
    PEGRatio: pegRatio != null ? String(pegRatio) : undefined,
    AnalystTargetPrice: analystTarget != null ? String(analystTarget) : undefined,
    '52WeekHigh': week52High != null ? String(week52High) : undefined,
    '52WeekLow': week52Low != null ? String(week52Low) : undefined,
    // Analyst consensus count
    AnalystRatingBuy: rec.buy,
    AnalystRatingHold: rec.hold,
    AnalystRatingSell: rec.sell,
  }
}

// ── Alpha Vantage (fallback) ─────────────────────────────────────

async function avOverview(symbol: string, avKey: string) {
  try {
    const url = AV_BASE + '?function=OVERVIEW&symbol=' + encodeURIComponent(symbol) + '&apikey=' + avKey
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return null
    const j = await r.json() as Record<string, string>
    if (!j || !j.Symbol || j.Note || j.Information) return null
    return j
  } catch { return null }
}

async function avEarnings(symbol: string, avKey: string): Promise<string | null> {
  try {
    const url = AV_BASE + '?function=EARNINGS&symbol=' + encodeURIComponent(symbol) + '&apikey=' + avKey
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!r.ok) return null
    const j = await r.json() as { quarterlyEarnings?: { fiscalDateEnding?: string; reportedDate?: string }[] }
    if (!j || !j.quarterlyEarnings?.length) return null
    // Next earnings = first future date in the quarterly array
    const today = new Date().toISOString().slice(0, 10)
    const next = j.quarterlyEarnings.find(q => q.reportedDate && q.reportedDate > today)
    return next?.reportedDate ?? null
  } catch { return null }
}

// ── Main handler ─────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })
  }

  const sbUrl  = Deno.env.get('SUPABASE_URL') || ''
  const sbKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const fhKey  = Deno.env.get('FINNHUB_API_KEY') || ''
  const avKey  = Deno.env.get('ALPHA_VANTAGE_KEY') || ''

  if (!sbUrl || !sbKey) {
    return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), { status: 500 })
  }
  if (!fhKey && !avKey) {
    return new Response(JSON.stringify({ error: 'Missing FINNHUB_API_KEY and ALPHA_VANTAGE_KEY — need at least one' }), { status: 500 })
  }

  // Load holding symbols
  let symbols: string[] = []
  try {
    const rows = await sbGet(sbUrl, sbKey,
      '/rest/v1/vw_portfolio_home?select=symbol,market_value&order=market_value.desc&limit=' + MAX_SYMBOLS
    ) as { symbol: string; market_value: number }[]
    const isOption = (s: string) => /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/.test(s)
    symbols = [...new Set(rows.map(r => r.symbol).filter(s => s && !isOption(s)))]
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to load holdings: ' + (e as Error).message }), { status: 500 })
  }

  const started = Date.now()
  let enriched = 0, failed = 0, avUsed = 0
  const log: string[] = []

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i]
    try {
      let overview: Record<string, unknown> | null = null

      // Primary: Finnhub
      if (fhKey) {
        overview = await finnhubOverview(sym, fhKey) as Record<string, unknown> | null
      }

      // Fallback: Alpha Vantage (budget: use only for remaining symbols after Finnhub)
      if (!overview && avKey && avUsed < 20) {
        const avOv = await avOverview(sym, avKey)
        if (avOv) {
          overview = avOv
          avUsed++
        }
      }

      if (overview) {
        // Fetch next earnings date via AV if we have budget and Finnhub didn't give us one
        let nextEarningsDate: string | null = null
        if (avKey && avUsed < 20 && !overview.NextEarningsDate) {
          nextEarningsDate = await avEarnings(sym, avKey)
          if (nextEarningsDate) avUsed++
          await sleep(300)
        }
        if (nextEarningsDate) overview.NextEarningsDate = nextEarningsDate

        const ttlMs = 24 * 60 * 60 * 1000  // 24h
        const row = {
          cache_key: sym + ':overview',
          symbol: sym,
          endpoint: 'overview',
          payload: { overview },
          cached_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + ttlMs).toISOString(),
        }
        await sbUpsert(sbUrl, sbKey, 'equity_cache', [row])
        enriched++
        log.push(sym + ' ✓')
      } else {
        log.push(sym + ' – no data')
      }
    } catch (e) {
      failed++
      log.push(sym + ' ✗ ' + (e as Error).message.slice(0, 60))
    }

    if (i < symbols.length - 1) await sleep(THROTTLE_MS)
  }

  const elapsed = Math.round((Date.now() - started) / 1000)
  const result = { symbols: symbols.length, enriched, failed, avUsed, elapsed_s: elapsed, log }

  // Write sync log
  try {
    await sbUpsert(sbUrl, sbKey, 'atlas_sync_log', [{
      sync_type: 'fundamentals_edge',
      status: failed > enriched ? 'partial' : 'success',
      metrics: result,
      notes: log.filter(l => l.includes('✗')).slice(0, 10).join(' | ') || null,
    }])
  } catch { /* best-effort */ }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
})
