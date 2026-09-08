// Edge Function: backfill_market_prices (v2)
//
// Loads daily close / adjusted close into public.market_prices for the legs
// registered in public.market_instruments. Phase A0 of the regime & risk
// series layer.
//
// House style matches sync_alpaca_prices: single-file, postgresjs over
// SUPABASE_DB_URL, POST-only, sync_log rows with
// function_name = 'backfill_market_prices'. verify_jwt is false, as it is on
// every other cron-invoked function in this project, so pg_cron can call it
// with no Authorization header.
//
// Source
// ------
// The A0 spec names Alpaca primary with AlphaVantage as fallback "where
// Alpaca history is short". For this instrument set Alpaca history is short
// for ALL SIXTEEN legs: Alpaca's stock bars begin 2016, while the shallowest
// leg here (CPER) starts 2011 and the deepest (SPY) starts 1993. AlphaVantage
// cannot cover the gap either -- TIME_SERIES_DAILY_ADJUSTED and outputsize=full
// are both premium features and the key held by this project is free-tier
// (the same limitation already recorded for vol-dispersion).
//
// Neither named source can deliver an adjusted close to inception, and
// adj_close is a hard requirement of the spec (ratio legs have materially
// different dividend yields). Yahoo's chart endpoint returns raw close AND
// adjusted close over full history, and returns firstTradeDate so the
// registry's inception dates are provider-verified rather than asserted.
// data_source on every instrument row records 'yahoo' accordingly -- the
// registry states the provider the rows actually came from.
//
// Modes
// -----
//   POST {}                        -> every active leg, LOOKBACK_DEFAULT window
//   POST {full: true}              -> every active leg, whole history (backfill)
//   POST {lookback_days: 30}       -> explicit window
//   POST {symbols: ["SPY","DIA"]}  -> restrict to those legs
//   POST {dry_run: true}           -> fetch and count, no upsert
//
// The nightly cron sends a WINDOW, not the whole series. Refetching 100k+ bars
// every night to learn one new close is waste, and the upsert on (symbol, date)
// makes an overlapping window free -- so a missed night self-heals on the next
// run instead of leaving a permanent hole. Same reasoning as the five-day
// window on sync_alpaca_prices.
//
// sync_log.details records `mode` and `lookback_days`. Without them a window
// run and a full backfill are indistinguishable in the log, and "success, 320
// rows" reads fine until you know it should have been 102,907.
//
// Environment variables (Dashboard -> Edge Functions -> Secrets):
//   SUPABASE_DB_URL

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const YAHOO_CHART      = 'https://query1.finance.yahoo.com/v8/finance/chart'
const UPSERT_CHUNK     = 1_000
const LOOKBACK_DEFAULT = 10      // trading days plus slack; see Modes above

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

// Yahoo stamps each bar at the exchange open in epoch seconds. Converting via
// UTC would roll the early-hours bars onto the wrong calendar day, so the
// session date is resolved in exchange-local time explicitly.
const ET_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
})
const etDate = (epochSeconds: number): string =>
  ET_DATE.format(new Date(epochSeconds * 1000))

interface PriceRow {
  symbol: string; date: string; close: number; adj_close: number
  volume: number | null
}

// Yahoo returns a bar for TODAY while the session is still running, and its
// `close` is simply the last trade so far. Storing that as a settled close
// publishes an intraday print as the day's close -- and it looks completely
// normal, because the row is the right shape on the right date.
//
// The provider's own session clock decides. `currentTradingPeriod.regular.end`
// is today's 16:00 ET close while the session is live; once it is past, or
// once Yahoo rolls the period to the next session, today's bar is settled.
// Testing BOTH the date and the instant makes the rule correct in either case.
// With no meta to read, refuse today's bar: lagging a day beats publishing a
// half-formed close.
function todaysBarIsPartial(
  regularEnd: unknown, todayEt: string, nowSec: number,
): boolean {
  if (typeof regularEnd !== 'number') return true
  return ET_DATE.format(new Date(regularEnd * 1000)) === todayEt && nowSec < regularEnd
}

interface SymbolResult {
  symbol: string; fetched: number; kept: number; dropped: number
  first_date: string | null; last_date: string | null
  first_trade_date: string | null; upserted: number
  dropped_partial_session: number
  // The registry's inception_date is meant to be the provider's own
  // firstTradeDate. The provider restating it is exactly the kind of silent
  // change that should surface rather than be assumed away.
  inception_drift?: boolean
  error?: string
}

async function fetchSeries(symbol: string, todayEt: string, period1: number): Promise<{
  rows: PriceRow[]; fetched: number; firstTradeDate: string | null
  droppedPartial: number
}> {
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}`
            + `?period1=${period1}&period2=9999999999&interval=1d&events=div%2Csplit`
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`Yahoo ${symbol} ${resp.status}: ${text.slice(0, 300)}`)
  }

  const json = JSON.parse(text)
  const result = json?.chart?.result?.[0]
  if (!result) {
    throw new Error(`Yahoo ${symbol}: no result (${text.slice(0, 300)})`)
  }

  const stamps: number[] = result.timestamp ?? []
  const quote = result.indicators?.quote?.[0] ?? {}
  const adj   = result.indicators?.adjclose?.[0]?.adjclose ?? []
  const closes: (number | null)[] = quote.close ?? []
  const vols:   (number | null)[] = quote.volume ?? []

  const ftdEpoch = result.meta?.firstTradeDate
  const firstTradeDate = typeof ftdEpoch === 'number' ? etDate(ftdEpoch) : null

  const skipToday = todaysBarIsPartial(
    result.meta?.currentTradingPeriod?.regular?.end,
    todayEt,
    Math.floor(Date.now() / 1000),
  )

  let droppedPartial = 0
  const rows: PriceRow[] = []
  for (let i = 0; i < stamps.length; i++) {
    const c = closes[i]
    const a = adj[i]
    // A bar missing either close is not a bar. Both columns are NOT NULL and
    // CHECKed positive, so a null or non-positive value is dropped here rather
    // than rejected by the database mid-chunk.
    if (typeof c !== 'number' || typeof a !== 'number') continue
    if (!(c > 0) || !(a > 0)) continue

    const d = etDate(stamps[i])
    if (d > todayEt) continue
    if (skipToday && d === todayEt) { droppedPartial++; continue }

    const v = vols[i]
    rows.push({
      symbol, date: d, close: c, adj_close: a,
      volume: typeof v === 'number' && v >= 0 ? Math.round(v) : null,
    })
  }
  return { rows, fetched: stamps.length, firstTradeDate, droppedPartial }
}

async function upsert(rows: PriceRow[]): Promise<number> {
  let n = 0
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK)
    await sql`
      insert into public.market_prices ${sql(chunk, 'symbol', 'date', 'close', 'adj_close', 'volume')}
      on conflict (symbol, date) do update set
        close = excluded.close,
        adj_close = excluded.adj_close,
        volume = excluded.volume
    `
    n += chunk.length
  }
  return n
}

async function openSyncLog(): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    insert into public.sync_log (status, source, function_name)
    values ('running', 'yahoo', 'backfill_market_prices')
    returning id
  `
  return rows[0].id
}

async function closeSyncLog(
  id: number, status: string, details: unknown, message: string | null,
  pricesUpserted: number,
): Promise<void> {
  // Never write duration_ms -- it is GENERATED ALWAYS from finished_at and
  // including it makes the server reject the whole statement.
  // status is constrained by sync_log_status_check to
  // running/success/partial/error/skipped. 'warning' is NOT permitted.
  await sql`
    update public.sync_log
       set status = ${status}, finished_at = now(),
           prices_upserted = ${pricesUpserted},
           details = ${sql.json(details as never)}, error_message = ${message}
     where id = ${id}
  `
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: {
    symbols?: string[]; dry_run?: boolean
    lookback_days?: number; full?: boolean
  } = {}
  try { body = await req.json() } catch { /* empty body is the default mode */ }

  const logId = await openSyncLog()
  const todayEt = etDate(Math.floor(Date.now() / 1000))

  try {
    const registered = await sql<{ symbol: string; inception_date: string }[]>`
      select symbol, inception_date::text as inception_date
        from public.market_instruments
       where active
         and (${body.symbols ?? null}::text[] is null
              or symbol = any(${body.symbols ?? null}::text[]))
       order by symbol
    `
    const symbols = registered.map((r) => r.symbol)
    const inceptionOf = new Map(registered.map((r) => [r.symbol, r.inception_date]))

    const full = body.full === true
    const lookbackDays = Math.max(1, Math.floor(body.lookback_days ?? LOOKBACK_DEFAULT))
    // period1 = 0 asks Yahoo for the whole series. A window run still returns
    // meta.firstTradeDate, so inception stays verifiable either way.
    const period1 = full ? 0 : Math.max(0, Math.floor(Date.now() / 1000) - lookbackDays * 86_400)
    if (symbols.length === 0) {
      // A run that matches no instrument has not succeeded at anything. Saying
      // 'success, 0 rows' here is how a stopped feed stays invisible.
      await closeSyncLog(logId, 'error', { symbols_requested: body.symbols ?? null },
                         'no active instruments matched', 0)
      return new Response(
        JSON.stringify({ ok: false, error: 'no active instruments matched' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const results: SymbolResult[] = []
    for (const symbol of symbols) {
      try {
        const { rows, fetched, firstTradeDate, droppedPartial } =
          await fetchSeries(symbol, todayEt, period1)
        const upserted = body.dry_run ? 0 : await upsert(rows)
        const registryInception = inceptionOf.get(symbol) ?? null
        results.push({
          symbol, fetched, kept: rows.length, dropped: fetched - rows.length,
          first_date: rows.length ? rows[0].date : null,
          last_date: rows.length ? rows[rows.length - 1].date : null,
          first_trade_date: firstTradeDate, upserted,
          dropped_partial_session: droppedPartial,
          inception_drift: firstTradeDate !== null && registryInception !== null
            ? firstTradeDate !== registryInception
            : undefined,
        })
      } catch (e) {
        console.error(`backfill_market_prices ${symbol}: ${String(e)}`)
        results.push({
          symbol, fetched: 0, kept: 0, dropped: 0, first_date: null,
          last_date: null, first_trade_date: null, upserted: 0,
          dropped_partial_session: 0, error: String(e),
        })
      }
    }

    const failed   = results.filter((r) => r.error)
    const upserted = results.reduce((a, r) => a + r.upserted, 0)
    const drifted = results.filter((r) => r.inception_drift).map((r) => r.symbol)
    const details  = {
      dry_run: !!body.dry_run,
      mode: full ? 'full' : 'window',
      lookback_days: full ? null : lookbackDays,
      rows_upserted: upserted,
      partial_sessions_dropped: results.reduce((a, r) => a + r.dropped_partial_session, 0),
      inception_drift: drifted,
      results,
    }

    // Three outcomes, not two: a run that wrote nothing is only healthy when it
    // was asked to write nothing.
    const status = failed.length === results.length ? 'error'
                 : failed.length > 0                ? 'partial'
                 : (upserted === 0 && !body.dry_run) ? 'error'
                 : 'success'
    const message = failed.length
      ? `${failed.length}/${results.length} symbols failed: ${failed.map((f) => f.symbol).join(',')}`
      : status === 'error' ? 'no rows upserted'
      : drifted.length ? `provider inception differs from registry: ${drifted.join(',')}`
      : null

    await closeSyncLog(logId, status, details, message, upserted)

    return new Response(JSON.stringify({ ok: status !== 'error', status, ...details }), {
      status: status === 'error' ? 503 : 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    await closeSyncLog(logId, 'error', {}, String(e), 0)
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
