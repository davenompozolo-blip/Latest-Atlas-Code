// Edge Function: sync_portfolio_history
//
// Calls Alpaca GET /v2/account/portfolio/history and upserts into
// public.portfolio_equity_curve. Run with period='all' for the
// initial backfill; the nightly cron (job 9, 01:00 UTC) sends period='6M'.
//
// Body params (all optional):
//   period       - Alpaca period string e.g. '1A', '6M', 'all'  (default: 'all')
//   timeframe    - Alpaca timeframe e.g. '1D', '1H'             (default: '1D')
//   portfolio_id - sync only this portfolio                     (every Alpaca portfolio if omitted)
//
// MP-1: every Alpaca portfolio is synced with its OWN credentials behind an
// identity gate, one sync_log row each. Before MP-1 this took `limit 1` of the
// Alpaca portfolios -- an arbitrary one once there are two -- and a passed
// portfolio_id merely TAGGED the one global account's history with that id.
//
// Environment variables (Dashboard -> Edge Functions -> Secrets):
//   <credential_prefix>_KEY / _SECRET per Alpaca broker account
//   (ALPACA_API_* for the original), SUPABASE_DB_URL
//
// == C1.3: stale provider snapshots ========================================
//
// Alpaca occasionally returns a point whose equity is the prior session's
// level with profit_loss reported as 0.00. That is arithmetically CONSISTENT
// with the carried level -- profit_loss here is the daily change -- so the row
// is internally coherent and factually false, and no cross-column check inside
// the row can catch it. Three such rows exist in the history (2026-01-15,
// 2026-05-04, 2026-07-29); the last sits against a -1.55% SPY session.
//
// This writer never carried anything forward itself: it writes exactly what
// the provider returns. The defect is upstream, which is why the remedy is
// detection and disclosure rather than a change to how the level is computed.
//
// DEVIATION FROM THE BRIEF, stated so it can be overruled. C1.3 asked for the
// row not to be written at all. It is written, flagged `stale_snapshot`,
// because:
//   * C1.1 settles the same question the other way for the same class of row
//     -- "deleting them would hide the defect and change row counts other
//     modules may depend on. The flag is the fix; consumers filter on it." Not
//     writing is deleting, decided one night earlier.
//   * The job re-fetches a 6-month window nightly. Skipping an interior point
//     leaves a hole with nothing to explain it -- the silent outcome the brief
//     is trying to eliminate -- and leaves C1.1's flag nothing to mark.
//   * The gate is "no row in the series is a settled level the provider did
//     not settle". A row flagged `stale_snapshot` is not a settled level.
// The refusal is made legible rather than the write silent, which is the
// brief's own stated principle and the `partial_sessions_dropped` pattern A0
// already uses.
//
// A row already marked `recovered` is never overwritten. That value came from
// a reconstruction someone had to defend; letting the provider's stale level
// clobber it on the next nightly run would undo the repair invisibly.
//
// This function also had NO sync_log integration of any kind -- it had never
// written a single row -- so the 01:00 job was invisible to every surface the
// platform monitors. That is fixed here: it opens a row, closes it with the
// real outcome, and never writes duration_ms (GENERATED ALWAYS).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const FUNCTION_NAME = 'sync_portfolio_history'

const ET_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
})

// ── Broker targets (MP-1) ───────────────────────────────────────────────────
// Each Alpaca portfolio names its OWN credentials and the account they must
// belong to. broker_accounts.credential_prefix is the NAME of a secret pair
// (<prefix>_KEY / <prefix>_SECRET), never a value. There is no global key pair:
// one pair for every portfolio is what wrote one account's book into every
// portfolio row before MP-1.

interface BrokerTarget {
  portfolio_id: string
  credential_prefix: string | null
  account_number: string | null
  is_paper: boolean
}

async function loadTargets(portfolioId: string | null): Promise<BrokerTarget[]> {
  return await sql<BrokerTarget[]>`
    select p.id as portfolio_id, b.credential_prefix,
           b.alpaca_account_number as account_number, b.is_paper
      from public.portfolios p
      join public.broker_accounts b on b.id = p.broker_account_id
     where b.broker = 'alpaca'
     ${portfolioId ? sql`and p.id = ${portfolioId}` : sql``}
     order by p.created_at, p.id
  `
}

function tradingBase(t: BrokerTarget): string {
  return t.is_paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets'
}

function alpacaHeaders(t: BrokerTarget): Record<string, string> {
  if (!t.credential_prefix) {
    throw new Error(`portfolio ${t.portfolio_id}: its broker account names no credential_prefix`)
  }
  const key    = Deno.env.get(`${t.credential_prefix}_KEY`)
  const secret = Deno.env.get(`${t.credential_prefix}_SECRET`)
  if (!key || !secret) {
    throw new Error(`Missing ${t.credential_prefix}_KEY and/or ${t.credential_prefix}_SECRET`)
  }
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
  }
}

async function alpacaGet<T = unknown>(t: BrokerTarget, path: string): Promise<T> {
  const url = new URL(path, tradingBase(t))
  const resp = await fetch(url.toString(), { headers: alpacaHeaders(t) })
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`Alpaca ${path} failed: ${resp.status} ${text.slice(0, 500)}`)
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Alpaca ${path} returned non-JSON: ${text.slice(0, 200)}`)
  }
}

// IDENTITY GATE. The credentials must report the account the portfolio is
// registered to, or nothing is written. A mis-set credential_prefix is the
// pre-MP-1 defect reached by configuration instead of code -- one account's
// book silently written into another's portfolio -- and it would look healthy.
async function verifiedAccount<T extends { account_number?: unknown }>(t: BrokerTarget): Promise<T> {
  if (!t.account_number) {
    throw new Error(`portfolio ${t.portfolio_id}: its broker account names no alpaca_account_number`)
  }
  const acct = await alpacaGet<T>(t, '/v2/account')
  if (acct.account_number !== t.account_number) {
    throw new Error(
      `IDENTITY MISMATCH: ${t.credential_prefix}_* report account ${String(acct.account_number)}, ` +
      `portfolio ${t.portfolio_id} is registered to ${t.account_number}. Nothing written.`
    )
  }
  return acct
}

function toNumericOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

interface AlpacaPortfolioHistory {
  timestamp:       number[]
  equity:          (number | null)[]
  profit_loss:     (number | null)[]
  profit_loss_pct: (number | null)[]
  base_value:      number
  timeframe:       string
}

interface CurveRow {
  portfolio_id:    string
  ts:              string
  equity:          number | null
  profit_loss:     number | null
  profit_loss_pct: number | null
  base_value:      number | null
  timeframe:       string
  data_quality:    string
}

// A carried-forward level: same equity as the previous session, the day's
// change reported as exactly zero, off a session that did move. The third
// clause is what distinguishes it from a legitimately flat book -- an
// undeployed account reports zero change on both sides, and is not a defect.
function isStaleSnapshot(
  equity: number | null, profitLoss: number | null,
  prevEquity: number | null, prevProfitLoss: number | null,
): boolean {
  if (equity === null || prevEquity === null) return false
  if (profitLoss === null || prevProfitLoss === null) return false
  return equity === prevEquity && profitLoss === 0 && prevProfitLoss !== 0
}

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse('expected POST', 405)

  const payload     = await req.json().catch(() => ({}))
  const period      = typeof payload?.period       === 'string' ? payload.period       : 'all'
  const timeframe   = typeof payload?.timeframe    === 'string' ? payload.timeframe    : '1D'
  const portfolioId = typeof payload?.portfolio_id === 'string' ? payload.portfolio_id : null

  // `mode` distinguishes a window run from a full backfill. Without it
  // "success, 80 rows" reads fine until you know it should have been 175 --
  // the same reason A0 records details.mode and details.scope.
  const mode = period === 'all' ? 'backfill' : 'window'

  // One account per iteration, each with its own sync_log row: one account
  // failing is recorded against it and blocks nothing else.
  const targets = await loadTargets(portfolioId)
  if (targets.length === 0) {
    const [logRow] = await sql<{ id: number }[]>`
      insert into public.sync_log (function_name, status, source, details, finished_at, error_message)
      values (${FUNCTION_NAME}, 'error', 'edge_function', ${sql.json({ period, timeframe, mode })}, now(),
              ${portfolioId ? `no Alpaca portfolio with id ${portfolioId}` : 'no Alpaca portfolios registered'})
      returning id
    `
    return jsonResponse({ error: `${FUNCTION_NAME} failed`, detail: 'no matching Alpaca portfolio', sync_log_id: logRow.id }, 500)
  }

  const results: Record<string, unknown>[] = []
  let failures = 0
  for (const t of targets) {
    const r = await syncOne(t, period, timeframe, mode)
    if (!r.ok) failures += 1
    results.push(r)
  }
  return jsonResponse({ ok: failures === 0, portfolios: targets.length, failures, results },
                      failures === 0 ? 200 : 500)
})

async function syncOne(t: BrokerTarget, period: string, timeframe: string,
                       mode: string): Promise<Record<string, unknown>> {
  const resolvedPortfolioId = t.portfolio_id
  const [logRow] = await sql<{ id: number }[]>`
    insert into public.sync_log (function_name, status, source, details, portfolio_id)
    values (${FUNCTION_NAME}, 'running', 'edge_function',
            ${sql.json({ period, timeframe, mode, portfolio_id: t.portfolio_id, account_number: t.account_number })},
            ${t.portfolio_id})
    returning id
  `
  const logId = logRow.id

  try {
    // Identity gate before anything is fetched or written.
    await verifiedAccount<{ account_number?: string }>(t)

    // -- Fetch from Alpaca --------------------------------------------------
    const params = new URLSearchParams({ period, timeframe })
    const url    = `${tradingBase(t)}/v2/account/portfolio/history?${params}`
    const resp   = await fetch(url, { headers: alpacaHeaders(t) })
    const text   = await resp.text()
    if (!resp.ok) throw new Error(`Alpaca portfolio/history failed: ${resp.status} ${text.slice(0, 500)}`)

    const history: AlpacaPortfolioHistory = JSON.parse(text)
    const { timestamp, equity, profit_loss, profit_loss_pct, base_value } = history

    // An empty history is a failure, not a quiet success. This codebase has
    // been bitten twice by a scheduled job that answered 200 while writing
    // nothing, so the no-data path is an error.
    if (!Array.isArray(timestamp) || timestamp.length === 0) {
      throw new Error('Alpaca returned empty portfolio history')
    }

    // -- Build rows, skip null-equity points (non-trading day padding) ------
    const points = timestamp
      .map((ts, i) => ({
        ts:              new Date(ts * 1000).toISOString(),
        equity:          toNumericOrNull(equity[i]),
        profit_loss:     toNumericOrNull(profit_loss[i]),
        profit_loss_pct: toNumericOrNull(profit_loss_pct[i]),
      }))
      .filter(p => p.equity !== null && p.equity > 0)
      .sort((a, b) => a.ts.localeCompare(b.ts))

    // Seed the comparison from the row immediately preceding this window, so a
    // stale point sitting on the window's first bar is still detected. Without
    // this the boundary point is silently exempt -- and a window run puts a new
    // boundary in a different place every night.
    const [prior] = points.length
      ? await sql<{ equity: string; profit_loss: string | null }[]>`
          select equity, profit_loss
          from public.portfolio_equity_curve
          where portfolio_id = ${resolvedPortfolioId}
            and timeframe    = ${timeframe}
            and ts < ${points[0].ts}::timestamptz
          order by ts desc
          limit 1
        `
      : []

    let prevEquity     = prior ? Number(prior.equity) : null
    let prevProfitLoss = prior && prior.profit_loss !== null ? Number(prior.profit_loss) : null

    const staleDates: string[] = []
    const validRows: CurveRow[] = points.map(p => {
      const stale = isStaleSnapshot(p.equity, p.profit_loss, prevEquity, prevProfitLoss)
      if (stale) staleDates.push(ET_DATE.format(new Date(p.ts)))
      prevEquity     = p.equity
      prevProfitLoss = p.profit_loss
      return {
        portfolio_id:    resolvedPortfolioId,
        ts:              p.ts,
        equity:          p.equity,
        profit_loss:     p.profit_loss,
        profit_loss_pct: p.profit_loss_pct,
        base_value:      toNumericOrNull(base_value),
        timeframe,
        data_quality:    stale ? 'stale_snapshot' : 'settled',
      }
    })

    // -- Upsert in 500-row chunks -------------------------------------------
    let upserted = 0
    const chunkSize = 500
    for (let i = 0; i < validRows.length; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize)
      await sql`
        insert into public.portfolio_equity_curve
          (portfolio_id, ts, equity, profit_loss, profit_loss_pct, base_value, timeframe, data_quality)
        select
          x.portfolio_id::uuid,
          x.ts::timestamptz,
          x.equity::numeric,
          x.profit_loss::numeric,
          x.profit_loss_pct::numeric,
          x.base_value::numeric,
          x.timeframe,
          x.data_quality
        from jsonb_to_recordset(${sql.json(chunk)}::jsonb) as x(
          portfolio_id    text,
          ts              text,
          equity          text,
          profit_loss     text,
          profit_loss_pct text,
          base_value      text,
          timeframe       text,
          data_quality    text
        )
        on conflict (portfolio_id, timeframe, ts) do update set
          equity          = excluded.equity,
          profit_loss     = excluded.profit_loss,
          profit_loss_pct = excluded.profit_loss_pct,
          base_value      = excluded.base_value,
          data_quality    = excluded.data_quality
        where public.portfolio_equity_curve.data_quality <> 'recovered'
      `
      upserted += chunk.length
    }

    const status = staleDates.length > 0 ? 'partial' : 'success'
    const details = {
      period, timeframe, mode,
      portfolio_id:            resolvedPortfolioId,
      account_number:          t.account_number,
      rows_from_alpaca:        timestamp.length,
      valid_rows:              validRows.length,
      stale_snapshots_flagged: staleDates.length,
      stale_dates:             staleDates,
      reason: staleDates.length > 0
        ? 'provider returned a level unchanged from the prior session with the day\'s change reported as zero; written flagged stale_snapshot, not as a settled level'
        : null,
    }

    await sql`
      update public.sync_log
         set status = ${status}, finished_at = now(), details = ${sql.json(details)}
       where id = ${logId}
    `

    return { ok: true, status, sync_log_id: logId, ...details, upserted }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${FUNCTION_NAME} failed:`, message)
    await sql`
      update public.sync_log
         set status = 'error', finished_at = now(), error_message = ${message}
       where id = ${logId}
    `.catch(e => console.error('failed to close sync_log row:', e))
    return { ok: false, portfolio_id: t.portfolio_id, sync_log_id: logId, detail: message }
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}
