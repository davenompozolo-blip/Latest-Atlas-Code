// Edge Function: sync_alpaca_prices (v1)
//
// Daily OHLCV price ingestion from Alpaca Markets → public.price_history.
// Replaces the dead yfinance pipeline (last successful run 2026-03-28).
//
// House style matches sync_alpaca_positions: single-file, postgresjs over
// SUPABASE_DB_URL, openSyncLog/closeSyncLog* helpers, POST-only, sync_log
// rows with function_name = 'sync_alpaca_prices'.
//
// Modes
// -----
//   POST {}                                  → ingest yesterday's bars (cron)
//   POST {start_date, end_date}              → backfill that range (inclusive)
//   POST {symbols: [...], start_date, ...}   → restrict universe
//   POST {dry_run: true, ...}                → end-to-end without upsert
//   POST {feed: 'iex'|'sip'}                → override Alpaca data feed
//
// Environment variables (Dashboard → Edge Functions → Secrets):
//   ALPACA_API_KEY, ALPACA_API_SECRET, SUPABASE_DB_URL

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

// ── Config ──────────────────────────────────────────────────────────────────
const ALPACA_DATA_BASE  = 'https://data.alpaca.markets'
const DEFAULT_FEED      = 'iex'         // free tier; override via payload.feed
const SYMBOL_BATCH_SIZE = 100           // Alpaca multi-symbol cap
const PAGE_LIMIT        = 10_000
const UPSERT_CHUNK      = 1_000

// ── Alpaca helpers ──────────────────────────────────────────────────────────
function alpacaHeaders(): Record<string, string> {
  const key    = Deno.env.get('ALPACA_API_KEY')
  const secret = Deno.env.get('ALPACA_API_SECRET')
  if (!key || !secret) {
    throw new Error('Missing ALPACA_API_KEY and/or ALPACA_API_SECRET')
  }
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
  }
}

interface AlpacaBar {
  t: string; o: number; h: number; l: number; c: number; v: number
  vw?: number; n?: number
}

interface AlpacaBarsResponse {
  bars?: Record<string, AlpacaBar[]>
  next_page_token?: string | null
}

async function fetchBarsBatch(
  endpoint: string,
  symbols: string[],
  start: string,
  end: string,
  extra: Record<string, string> = {},
): Promise<Record<string, AlpacaBar[]>> {
  const out: Record<string, AlpacaBar[]> = {}
  for (let i = 0; i < symbols.length; i += SYMBOL_BATCH_SIZE) {
    const batch = symbols.slice(i, i + SYMBOL_BATCH_SIZE)
    let pageToken: string | undefined
    do {
      const params = new URLSearchParams({
        symbols: batch.join(','),
        timeframe: '1Day',
        start, end,
        limit: String(PAGE_LIMIT),
        adjustment: 'split',
        ...extra,
      })
      if (pageToken) params.set('page_token', pageToken)
      const url = `${ALPACA_DATA_BASE}${endpoint}?${params.toString()}`
      const resp = await fetch(url, { headers: alpacaHeaders() })
      const text = await resp.text()
      if (!resp.ok) {
        console.error(`Alpaca ${endpoint} ${resp.status}: ${text.slice(0, 400)}`)
        break
      }
      let json: AlpacaBarsResponse
      try { json = JSON.parse(text) as AlpacaBarsResponse } catch {
        console.error(`Alpaca ${endpoint} non-JSON: ${text.slice(0, 200)}`)
        break
      }
      for (const [sym, bars] of Object.entries(json.bars ?? {})) {
        out[sym] = [...(out[sym] ?? []), ...bars]
      }
      pageToken = json.next_page_token ?? undefined
    } while (pageToken)
  }
  return out
}

const fetchStockBars = (s: string[], start: string, end: string, feed: string) =>
  fetchBarsBatch('/v2/stocks/bars', s, start, end, { feed })

const fetchCryptoBars = (s: string[], start: string, end: string) =>
  fetchBarsBatch('/v1beta3/crypto/us/bars', s, start, end)

const fetchOptionBars = (s: string[], start: string, end: string) =>
  fetchBarsBatch('/v1beta1/options/bars', s, start, end)

// ── sync_log helpers (mirror sync_alpaca_positions) ─────────────────────────
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

interface SyncCounts {
  positions_seen?: number   // re-used as 'assets_seen'
  prices_upserted?: number
}

async function openSyncLog(
  functionName: string, source: string, parentId: number | null,
): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    insert into public.sync_log (status, source, function_name, parent_id)
    values ('running', ${source}, ${functionName}, ${parentId})
    returning id
  `
  return rows[0].id
}

async function closeSyncLogSuccess(
  id: number, counts: SyncCounts, details: Record<string, unknown>,
): Promise<void> {
  await sql`
    update public.sync_log set
      finished_at        = now(),
      status             = 'success',
      positions_seen     = ${counts.positions_seen ?? null},
      prices_upserted    = ${counts.prices_upserted ?? null},
      details            = ${sql.json(details)}
    where id = ${id}
  `
}

async function closeSyncLogError(id: number | null, err: unknown): Promise<void> {
  if (id == null) return
  const message = err instanceof Error ? err.message : String(err)
  try {
    await sql`
      update public.sync_log set
        finished_at   = now(),
        status        = 'error',
        error_message = ${message.slice(0, 1000)}
      where id = ${id}
    `
  } catch (e) {
    console.error('sync_log error update failed:', e)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function ymd(d: Date): string { return d.toISOString().slice(0, 10) }
function yesterday(): string { return ymd(new Date(Date.now() - 86_400_000)) }

// OCC option symbol (mirrors sync_alpaca_positions)
const OCC_RE = /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/

interface AssetRow { id: string; symbol: string; asset_class: string | null }

async function getAssetUniverse(symbolFilter?: string[]): Promise<AssetRow[]> {
  const cutoff = ymd(new Date(Date.now() - 30 * 86_400_000))
  const rows = await sql<AssetRow[]>`
    select distinct a.id, a.symbol, a.asset_class
    from public.assets a
    join public.positions p on p.asset_id = a.id
    where p.as_of_date >= ${cutoff}
      and a.symbol is not null
      ${symbolFilter && symbolFilter.length
          ? sql`and a.symbol = any(${symbolFilter})`
          : sql``}
  `
  return rows
}

function partitionAssets(universe: AssetRow[]) {
  const stocks:  AssetRow[] = []
  const crypto:  AssetRow[] = []
  const options: AssetRow[] = []
  for (const a of universe) {
    const c = (a.asset_class ?? '').toLowerCase()
    if (c === 'crypto')                                  crypto.push(a)
    else if (c === 'option' || OCC_RE.test(a.symbol))   options.push(a)
    else                                                 stocks.push(a)
  }
  return { stocks, crypto, options }
}

interface PriceRow {
  asset_id: string; price_date: string
  open: number; high: number; low: number; close: number
  adjusted_close: number; volume: number
  source: string; interval: string
}

function barsToRows(asset: AssetRow, bars: AlpacaBar[]): PriceRow[] {
  return bars.map(b => ({
    asset_id:       asset.id,
    price_date:     b.t.slice(0, 10),
    open:           b.o,
    high:           b.h,
    low:            b.l,
    close:          b.c,
    adjusted_close: b.c,  // adjustment=split applied by Alpaca
    volume:         Math.round(b.v),
    source:         'alpaca',
    interval:       '1d',
  }))
}

async function upsertPrices(rows: PriceRow[]): Promise<number> {
  let upserted = 0
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const slice = rows.slice(i, i + UPSERT_CHUNK)
    await sql`
      insert into public.price_history ${sql(
        slice,
        'asset_id', 'price_date', 'open', 'high', 'low', 'close',
        'adjusted_close', 'volume', 'source', 'interval',
      )}
      on conflict (asset_id, price_date, "interval") do update set
        open           = excluded.open,
        high           = excluded.high,
        low            = excluded.low,
        close          = excluded.close,
        adjusted_close = excluded.adjusted_close,
        volume         = excluded.volume,
        source         = excluded.source
    `
    upserted += slice.length
  }
  return upserted
}

// ── Core task ────────────────────────────────────────────────────────────────
interface Payload {
  start_date?:          string
  end_date?:            string
  symbols?:             string[]
  dry_run?:             boolean
  feed?:                string
  source?:              string
  parent_sync_log_id?:  number
}

interface RunResult {
  start_date:           string
  end_date:             string
  assets_seen:          number
  rows_built:           number
  upserted:             number
  missing_symbol_count: number
  missing_sample:       string[]
  partition: { stocks: number; crypto: number; options: number }
  dry_run:              boolean
}

async function runPriceSync(payload: Payload): Promise<RunResult> {
  const end_date   = payload.end_date   ?? yesterday()
  const start_date = payload.start_date ?? end_date
  const dry_run    = !!payload.dry_run
  const feed       = payload.feed ?? DEFAULT_FEED

  const universe  = await getAssetUniverse(payload.symbols)
  const partition = partitionAssets(universe)

  const [stockBars, cryptoBars, optionBars] = await Promise.all([
    partition.stocks.length
      ? fetchStockBars(partition.stocks.map(a => a.symbol), start_date, end_date, feed)
      : Promise.resolve({} as Record<string, AlpacaBar[]>),
    partition.crypto.length
      ? fetchCryptoBars(partition.crypto.map(a => a.symbol), start_date, end_date)
      : Promise.resolve({} as Record<string, AlpacaBar[]>),
    partition.options.length
      ? fetchOptionBars(partition.options.map(a => a.symbol), start_date, end_date)
      : Promise.resolve({} as Record<string, AlpacaBar[]>),
  ])

  const rows:    PriceRow[] = []
  const missing: string[]   = []

  for (const { assets, bars } of [
    { assets: partition.stocks,  bars: stockBars  },
    { assets: partition.crypto,  bars: cryptoBars },
    { assets: partition.options, bars: optionBars },
  ]) {
    for (const a of assets) {
      const b = bars[a.symbol]
      if (!b || !b.length) { missing.push(a.symbol); continue }
      rows.push(...barsToRows(a, b))
    }
  }

  let upserted = 0
  if (rows.length && !dry_run) {
    upserted = await upsertPrices(rows)
  }

  return {
    start_date, end_date,
    assets_seen:          universe.length,
    rows_built:           rows.length,
    upserted,
    missing_symbol_count: missing.length,
    missing_sample:       missing.slice(0, 20),
    partition: {
      stocks:  partition.stocks.length,
      crypto:  partition.crypto.length,
      options: partition.options.length,
    },
    dry_run,
  }
}

// ── HTTP entry point ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('expected POST', { status: 405 })
  }

  const payload: Payload = await req.json().catch(() => ({}))
  const source   = typeof payload?.source === 'string' ? payload.source : 'edge_function'
  const parentId = typeof payload?.parent_sync_log_id === 'number' ? payload.parent_sync_log_id : null

  let syncLogId: number | null = null
  try {
    syncLogId = await openSyncLog('sync_alpaca_prices', source, parentId)
    const result = await runPriceSync(payload)
    await closeSyncLogSuccess(
      syncLogId,
      { positions_seen: result.assets_seen, prices_upserted: result.upserted },
      {
        start_date:           result.start_date,
        end_date:             result.end_date,
        rows_built:           result.rows_built,
        missing_symbol_count: result.missing_symbol_count,
        missing_sample:       result.missing_sample,
        partition:            result.partition,
        dry_run:              result.dry_run,
      },
    )
    return jsonResponse({ sync_log_id: syncLogId, ...result }, 200)
  } catch (err) {
    await closeSyncLogError(syncLogId, err)
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync_alpaca_prices failed:', message)
    return jsonResponse(
      { sync_log_id: syncLogId, error: 'sync_alpaca_prices failed', detail: message },
      500,
    )
  }
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}
