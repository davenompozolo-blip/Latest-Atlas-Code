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

// -- sync_log ---------------------------------------------------------------
//
// This function logged to `atlas_sync_log` -- the LEGACY table, which has 0 rows
// ever -- with a payload naming columns (`metrics`, `notes`) that do not exist
// on it, inside a bare `catch {}`. So every write was rejected and every
// rejection swallowed, for the entire life of the function. Two cron jobs (13
// `sync_holdings_fundamentals` and 28 `sync_universe_fundamentals`) fire it ten
// times a week and none of it was visible to `atlas_sync_status`,
// `stuck_syncs`, `feed_coverage` or any other surface the platform monitors.
//
// The work itself was always fine -- `equity_cache` is current. Only the log
// was dead, which is the failure mode that costs months: absence of failures is
// not evidence when absence of everything is the actual state.
//
// duration_ms is GENERATED ALWAYS on sync_log; writing it makes PostgREST
// reject the whole PATCH with 428C9. Set finished_at and let it derive.

const SYNC_LOG_STATUSES = 'running | success | partial | error | skipped'

async function openSyncLog(
  baseUrl: string, key: string, fn: string, details: unknown,
): Promise<number | null> {
  try {
    const r = await fetch(baseUrl + '/rest/v1/sync_log', {
      method: 'POST',
      headers: { ...sbHeaders(key), Prefer: 'return=representation' },
      body: JSON.stringify([{
        function_name: fn, status: 'running', source: 'edge_function', details,
      }]),
    })
    if (!r.ok) {
      console.error('sync_log open failed:', r.status, (await r.text().catch(() => '')).slice(0, 300))
      return null
    }
    const rows = await r.json() as { id: number }[]
    return rows?.[0]?.id ?? null
  } catch (e) {
    console.error('sync_log open threw:', (e as Error).message)
    return null
  }
}

async function closeSyncLog(
  baseUrl: string, key: string, id: number | null,
  status: string, details: unknown, errorMessage?: string,
) {
  if (id === null) return
  // Never include duration_ms -- GENERATED ALWAYS.
  const patch: Record<string, unknown> = {
    status, finished_at: new Date().toISOString(), details,
  }
  if (errorMessage) patch.error_message = errorMessage.slice(0, 2000)
  try {
    const r = await fetch(baseUrl + '/rest/v1/sync_log?id=eq.' + id, {
      method: 'PATCH',
      headers: { ...sbHeaders(key), Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    })
    // A swallowed write failure costs months. Log it at error level.
    if (!r.ok) {
      console.error('sync_log close failed:', r.status,
        (await r.text().catch(() => '')).slice(0, 300),
        '(permitted statuses:', SYNC_LOG_STATUSES + ')')
    }
  } catch (e) {
    console.error('sync_log close threw:', (e as Error).message)
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

  // `mode` distinguishes the two callers: cron job 13 sends an explicit holdings
  // list, job 28 a rotating universe slice. Without it a run of 12 symbols and a
  // run of 720 are indistinguishable in the log -- the same reason A0 records
  // details.mode and the price sync records details.scope.
  const mode = targetSymbols ? 'holdings' : 'universe'
  const logId = await openSyncLog(sbUrl, sbKey, 'sync_fundamentals', {
    mode, offset, limit, only_missing: onlyMissing, min_market_cap_usd: minCap,
    target_symbols: targetSymbols ? targetSymbols.length : null,
  })

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
    const msg = 'Failed to load universe: ' + (e as Error).message
    await closeSyncLog(sbUrl, sbKey, logId, 'error', { mode, offset, limit }, msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
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

  // Four outcomes, so an idempotent no-op is never dressed up as a successful
  // write and never mistaken for a failure either:
  //
  //   enriched > 0, no failures            -> success
  //   enriched > 0, some failures          -> partial
  //   enriched = 0, some failures          -> error
  //   enriched = 0, no failures            -> skipped  (nothing needed doing)
  //
  // That last row is the ordinary case under only_missing=true once the
  // universe is warm, and it is deliberately NOT an error: writing nothing is
  // not the defect signal here, exactly as `sync_alpaca_transactions` writes
  // zero rows on a day the book does not trade. `details.processed` is the
  // discriminator -- processed > 0 with everything already cached is healthy;
  // processed = 0 on the FIRST page means `assets` returned nothing, which is.
  const emptyFirstPage = universe.length === 0 && offset === 0 && !targetSymbols
  const status =
    emptyFirstPage        ? 'error'
    : enriched > 0        ? (failed > 0 ? 'partial' : 'success')
    : failed > 0          ? 'error'
    : 'skipped'

  const reason =
    emptyFirstPage ? 'assets returned no equity symbols on the first page'
    : status === 'skipped'
      ? (universe.length === 0
          ? `pagination past end of universe (offset ${offset})`
          : 'every symbol in this slice was already cached')
      : null

  await closeSyncLog(sbUrl, sbKey, logId, status,
    { ...result, mode, reason },
    failed > 0 ? `${failed} symbol(s) failed; see details.sample` : (reason && status === 'error' ? reason : undefined))

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
})
