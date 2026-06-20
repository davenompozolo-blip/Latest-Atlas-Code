// Edge Function: sync_fundamentals  (v2 — universe-scale, paginated)
//
// Populates equity_cache with fundamentals for the LARGE/MID-CAP universe, not
// just current holdings. Each invocation processes one paginated batch of the
// `assets` table so the whole universe can be covered across several scheduled
// calls without exceeding the edge-function wall-clock or Finnhub rate limits.
//
// Strategy per symbol:
//   1. Finnhub /stock/profile2  (cheap) → name, industry, marketCapitalization
//   2. Gate: skip names below MIN_MARKET_CAP_USD (keeps us to ~large/mid cap)
//   3. Finnhub /stock/metric?metric=all  → full fundamentals blob (stored whole,
//      so downstream views can read any field and remapping never needs a re-fetch)
//   4. Upsert into equity_cache with payload { overview, profile, metric,
//      market_cap_usd, source, fetched_at }
//
// Request body (all optional):
//   { offset?: number, limit?: number, min_market_cap_usd?: number,
//     only_missing?: boolean }
//
// Required secrets (Dashboard → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FINNHUB_API_KEY
//   ALPHA_VANTAGE_KEY (optional fallback)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const FH_BASE             = 'https://finnhub.io/api/v1'
const THROTTLE_MS         = 1100   // ~55 req/min, under Finnhub 60/min free tier
const DEFAULT_LIMIT       = 120
const MIN_MARKET_CAP_USD  = 2_000_000_000   // $2B → large/mid cap
const OCC_RE              = /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

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

interface FinnhubProfile {
  name?: string; ticker?: string; finnhubIndustry?: string;
  marketCapitalization?: number; beta?: number; exchange?: string; country?: string; currency?: string
}

async function finnhubFetch<T>(path: string, fhKey: string): Promise<T | null> {
  try {
    const r = await fetch(FH_BASE + path + (path.includes('?') ? '&' : '?') + 'token=' + fhKey, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    return await r.json() as T
  } catch { return null }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } })
  }

  const sbUrl = Deno.env.get('SUPABASE_URL') || ''
  const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const fhKey = Deno.env.get('FINNHUB_API_KEY') || ''

  if (!sbUrl || !sbKey) {
    return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }), { status: 500 })
  }
  if (!fhKey) {
    return new Response(JSON.stringify({ error: 'Missing FINNHUB_API_KEY — set it in Edge Function secrets before running' }), { status: 500 })
  }

  const body = await req.json().catch(() => ({})) as {
    offset?: number; limit?: number; min_market_cap_usd?: number; only_missing?: boolean; symbols?: string[]
  }
  const offset   = Math.max(0, body.offset ?? 0)
  const limit    = Math.min(300, Math.max(1, body.limit ?? DEFAULT_LIMIT))
  const onlyMissing = body.only_missing === true
  // Targeted mode: when `symbols` is supplied (e.g. the current holdings), sync
  // exactly those names instead of a rotating universe slice. Lets a scheduled
  // job keep holdings fresh regardless of where the universe rotation has reached.
  const targetSymbols = Array.isArray(body.symbols)
    ? body.symbols.filter((s): s is string => typeof s === 'string' && !!s).map(s => s.toUpperCase())
    : null
  // Held names must be covered even if they are below the universe large/mid-cap
  // gate, so targeted mode defaults the floor to 0.
  const minCap   = body.min_market_cap_usd ?? (targetSymbols ? 0 : MIN_MARKET_CAP_USD)

  // Load the symbols to enrich: either the explicit target list or a paginated
  // slice of the equity universe from `assets`.
  let universe: { id: string; symbol: string }[] = []
  try {
    const q = (targetSymbols && targetSymbols.length)
      ? `/rest/v1/assets?select=id,symbol&symbol=in.(${targetSymbols.map(s => `"${s}"`).join(',')})`
      : `/rest/v1/assets?select=id,symbol&asset_class=in.(Stock,us_equity,equity,etf)` +
        `&order=symbol.asc&offset=${offset}&limit=${limit}`
    const rows = await sbGet(sbUrl, sbKey, q) as { id: string; symbol: string }[]
    universe = rows.filter(r => r.symbol && !OCC_RE.test(r.symbol))
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to load universe: ' + (e as Error).message }), { status: 500 })
  }

  // Optionally skip symbols already cached (lets a re-run fill only the gaps)
  let alreadyCached = new Set<string>()
  if (onlyMissing && universe.length) {
    try {
      const syms = universe.map(u => `"${u.symbol}"`).join(',')
      const cached = await sbGet(sbUrl, sbKey,
        `/rest/v1/equity_cache?select=symbol&endpoint=eq.overview&symbol=in.(${syms})`
      ) as { symbol: string }[]
      alreadyCached = new Set(cached.map(c => c.symbol))
    } catch { /* non-fatal */ }
  }

  const started = Date.now()
  let enriched = 0, skippedSmall = 0, skippedCached = 0, noData = 0, failed = 0
  const log: string[] = []

  for (let i = 0; i < universe.length; i++) {
    const { symbol } = universe[i]
    if (onlyMissing && alreadyCached.has(symbol)) { skippedCached++; continue }

    try {
      // 1. Cheap profile probe for market cap + identity
      const profile = await finnhubFetch<FinnhubProfile>(
        '/stock/profile2?symbol=' + encodeURIComponent(symbol), fhKey)
      const marketCapUsd = profile?.marketCapitalization != null
        ? Math.round(profile.marketCapitalization * 1_000_000)   // Finnhub returns $M; keep integer (downstream ::bigint casts)
        : null

      // 2. Gate to large/mid cap
      if (marketCapUsd == null || marketCapUsd < minCap) {
        skippedSmall++
        log.push(`${symbol} – cap ${marketCapUsd ? '$' + Math.round(marketCapUsd/1e9) + 'B' : 'n/a'} < gate`)
        await sleep(THROTTLE_MS)
        continue
      }

      // 3. Full metric blob (stored whole for forward-compat)
      const metricResp = await finnhubFetch<{ metric: Record<string, unknown> }>(
        '/stock/metric?symbol=' + encodeURIComponent(symbol) + '&metric=all', fhKey)
      const metric = metricResp?.metric || {}

      const overview = {
        Symbol: symbol,
        Name: profile?.name,
        Sector: profile?.finnhubIndustry,
        Exchange: profile?.exchange,
        Currency: profile?.currency,
        Country: profile?.country,
        MarketCapitalization: marketCapUsd,
        Beta: metric['beta'] ?? profile?.beta,
        PERatio: metric['peNormalizedAnnual'] ?? metric['peTTM'],
        PEGRatio: metric['pegRatio'],
      }

      const row = {
        cache_key:  symbol + ':overview',
        symbol,
        endpoint:   'overview',
        payload:    { overview, profile, metric, market_cap_usd: marketCapUsd, source: 'finnhub', fetched_at: new Date().toISOString() },
        cached_at:  new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }
      await sbUpsert(sbUrl, sbKey, 'equity_cache', [row])
      enriched++
      log.push(`${symbol} ✓ $${Math.round(marketCapUsd/1e9)}B`)
    } catch (e) {
      failed++
      log.push(`${symbol} ✗ ${(e as Error).message.slice(0, 60)}`)
    }

    if (i < universe.length - 1) await sleep(THROTTLE_MS)
  }

  const elapsed = Math.round((Date.now() - started) / 1000)
  const nextOffset = offset + limit
  const result = {
    offset, limit, processed: universe.length,
    enriched, skipped_small: skippedSmall, skipped_cached: skippedCached, no_data: noData, failed,
    elapsed_s: elapsed, next_offset: nextOffset,
    sample: log.slice(0, 25),
  }

  try {
    await sbUpsert(sbUrl, sbKey, 'atlas_sync_log', [{
      sync_type: 'fundamentals_universe',
      status: failed > enriched ? 'partial' : 'success',
      metrics: result,
      notes: `offset=${offset} enriched=${enriched} small=${skippedSmall}`,
    }])
  } catch { /* best-effort */ }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
})
