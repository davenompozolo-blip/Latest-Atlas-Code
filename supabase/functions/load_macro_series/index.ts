// Edge Function: load_macro_series (v1)
//
// Loads daily observations into public.macro_series_values for the series
// registered in public.macro_series. Phase A0b of the regime & risk layer --
// the breakeven, nominal-yield, slope and Brent series that no ETF pair can
// proxy.
//
// House style matches backfill_market_prices: single-file, postgresjs over
// SUPABASE_DB_URL, POST-only, sync_log rows with
// function_name = 'load_macro_series'.
//
// NOTE: verify_jwt is FALSE for this function, deliberately, as it is on every
// other cron-invoked function in this project. pg_cron calls it over pg_net
// with no Authorization header. Flipping it to true 401s the nightly job
// silently -- the deploy tool defaults it to true, so pass it explicitly.
//
// Source
// ------
// FRED for all seven series, through the public fredgraph CSV endpoint, which
// needs no API key. Brent included: Alpha Vantage's BRENT endpoint was compared
// against FRED's DCOILBRENTEU over full history and the two are identical on
// all 9,973 observations, so there is no second measurement to choose between.
//
// UPSERT, NEVER INSERT-ONLY. FRED revises published values after first
// publication -- a nominal yield or a breakeven can change days later. An
// insert-only loader would freeze the first print and the series would quietly
// stop matching its own source.
//
// Modes
// -----
//   POST {}                      -> every active series, LOOKBACK_DEFAULT window
//   POST {full: true}            -> every active series, whole history
//   POST {lookback_days: 30}     -> explicit window
//   POST {series: ["T5YIFR"]}    -> restrict to those series
//   POST {dry_run: true}         -> fetch and count, no upsert
//
// details records `mode` and `lookback_days` for the same reason
// backfill_market_prices does: "success, 42 rows" reads fine until you know it
// should have been 102,907.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const FREDGRAPH       = 'https://fred.stlouisfed.org/graph/fredgraph.csv'
const UPSERT_CHUNK    = 2_000
const LOOKBACK_DEFAULT = 30   // calendar days; FRED revises, so overlap is the point

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

interface SeriesRow {
  series_key: string; provider: string; provider_code: string
  inception_date: string
}
interface ValueRow { series_key: string; date: string; value: number }

interface SeriesResult {
  series_key: string; provider_code: string
  fetched: number; kept: number; dropped: number
  first_date: string | null; last_date: string | null
  latest_value: number | null
  upserted: number
  // Only meaningful on a full run: a window fetch starts at the window, so its
  // first row says nothing about the provider's first observation.
  provider_inception?: string | null
  inception_drift?: boolean
  error?: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// FRED marks a non-trading day, or a day it has not yet published, with a lone
// '.' -- and older exports use an empty field. Neither is an observation, and
// value is NOT NULL, so both are dropped here rather than rejected by the
// database mid-chunk.
function parseFredCsv(series_key: string, text: string): { rows: ValueRow[]; fetched: number } {
  const lines = text.split('\n')
  const rows: ValueRow[] = []
  let fetched = 0
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    fetched++
    const comma = line.indexOf(',')
    if (comma < 0) continue
    // Columns are (date, value) whatever the header calls them -- fredgraph has
    // used both `DATE` and `observation_date` for the first column.
    const d = line.slice(0, comma).trim()
    const v = line.slice(comma + 1).trim()
    if (!ISO_DATE.test(d)) continue
    if (v === '' || v === '.') continue
    const n = Number(v)
    if (!Number.isFinite(n)) continue
    rows.push({ series_key, date: d, value: n })
  }
  return { rows, fetched }
}

async function fetchSeries(s: SeriesRow, cosd: string | null): Promise<{ rows: ValueRow[]; fetched: number }> {
  const url = `${FREDGRAPH}?id=${encodeURIComponent(s.provider_code)}`
            + (cosd ? `&cosd=${cosd}` : '')
  const resp = await fetch(url, { headers: { 'User-Agent': 'atlas-terminal/1.0' } })
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`FRED ${s.provider_code} ${resp.status}: ${text.slice(0, 300)}`)
  }
  // A 200 carrying an HTML error page parses to zero rows and would otherwise
  // read as "the series published nothing", which is a statement about the data
  // when the truth is that the transport failed.
  if (text.trimStart().startsWith('<')) {
    throw new Error(`FRED ${s.provider_code}: HTML body, not CSV (${text.slice(0, 200)})`)
  }
  return parseFredCsv(s.series_key, text)
}

async function upsert(rows: ValueRow[]): Promise<number> {
  let n = 0
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK)
    await sql`
      insert into public.macro_series_values ${sql(chunk, 'series_key', 'date', 'value')}
      on conflict (series_key, date) do update set value = excluded.value
    `
    n += chunk.length
  }
  return n
}

async function openSyncLog(): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    insert into public.sync_log (status, source, function_name)
    values ('running', 'fred', 'load_macro_series')
    returning id
  `
  return rows[0].id
}

async function closeSyncLog(
  id: number, status: string, details: unknown, message: string | null,
): Promise<void> {
  // Never write duration_ms -- it is GENERATED ALWAYS from finished_at and
  // including it makes the server reject the whole statement.
  // sync_log_status_check permits running/success/partial/error/skipped only.
  await sql`
    update public.sync_log
       set status = ${status}, finished_at = now(),
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
    series?: string[]; full?: boolean; lookback_days?: number; dry_run?: boolean
  } = {}
  try { body = await req.json() } catch { /* empty body is the default mode */ }

  const logId = await openSyncLog()

  try {
    const registered = await sql<SeriesRow[]>`
      select series_key, provider, provider_code, inception_date::text as inception_date
        from public.macro_series
       where active
         and provider = 'fred'
         and (${body.series ?? null}::text[] is null
              or series_key = any(${body.series ?? null}::text[]))
       order by series_key
    `

    if (registered.length === 0) {
      // A run that matched no series has not succeeded at anything. Logging
      // 'success, 0 rows' here is precisely how a stopped feed stays invisible.
      await closeSyncLog(logId, 'error', { series_requested: body.series ?? null },
                         'no active FRED series matched')
      return new Response(
        JSON.stringify({ ok: false, error: 'no active FRED series matched' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const full = body.full === true
    const lookbackDays = Math.max(1, Math.floor(body.lookback_days ?? LOOKBACK_DEFAULT))
    const cosd = full
      ? null
      : new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10)

    const results: SeriesResult[] = []
    for (const s of registered) {
      try {
        const { rows, fetched } = await fetchSeries(s, cosd)
        const upserted = body.dry_run ? 0 : await upsert(rows)
        const providerInception = full && rows.length ? rows[0].date : null
        results.push({
          series_key: s.series_key, provider_code: s.provider_code,
          fetched, kept: rows.length, dropped: fetched - rows.length,
          first_date: rows.length ? rows[0].date : null,
          last_date: rows.length ? rows[rows.length - 1].date : null,
          latest_value: rows.length ? rows[rows.length - 1].value : null,
          upserted,
          provider_inception: full ? providerInception : undefined,
          inception_drift: full && providerInception !== null
            ? providerInception !== s.inception_date
            : undefined,
        })
      } catch (e) {
        console.error(`load_macro_series ${s.series_key}: ${String(e)}`)
        results.push({
          series_key: s.series_key, provider_code: s.provider_code,
          fetched: 0, kept: 0, dropped: 0, first_date: null, last_date: null,
          latest_value: null, upserted: 0, error: String(e),
        })
      }
    }

    const failed   = results.filter((r) => r.error)
    const upserted = results.reduce((a, r) => a + r.upserted, 0)
    const drifted  = results.filter((r) => r.inception_drift).map((r) => r.series_key)

    const details = {
      dry_run: !!body.dry_run,
      mode: full ? 'full' : 'window',
      lookback_days: full ? null : lookbackDays,
      window_start: cosd,
      series_count: results.length,
      rows_upserted: upserted,
      inception_drift: drifted,
      results,
    }

    // Three outcomes, not two. A run that wrote nothing is only healthy when it
    // was asked to write nothing -- otherwise 200 {written: 0} is exactly the
    // shape that let chain_theme_leadership report green for weeks.
    const status = failed.length === results.length ? 'error'
                 : failed.length > 0                ? 'partial'
                 : (upserted === 0 && !body.dry_run) ? 'error'
                 : 'success'
    const message = failed.length
      ? `${failed.length}/${results.length} series failed: ${failed.map((f) => f.series_key).join(',')}`
      : status === 'error' ? 'no rows upserted'
      : drifted.length ? `provider inception differs from registry: ${drifted.join(',')}`
      : null

    await closeSyncLog(logId, status, details, message)

    return new Response(JSON.stringify({ ok: status !== 'error', status, ...details }), {
      status: status === 'error' ? 503 : 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error(`load_macro_series: ${String(e)}`)
    await closeSyncLog(logId, 'error', {}, String(e))
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
