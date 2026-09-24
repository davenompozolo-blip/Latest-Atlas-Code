// Edge Function: sync_alpaca_positions (v4 — one account per portfolio)
//
// v4 (MP-1): each Alpaca portfolio is synced with ITS OWN credentials
// (broker_accounts.credential_prefix), behind an identity gate on
// /v2/account's account_number, in its own transaction with its own sync_log
// row. v3 fetched one account with a global key pair and wrote that book into
// EVERY portfolio row, so a second portfolio would have received a copy of the
// first. One account failing no longer blocks or touches another.
//
// Self-contained single-file version for Supabase Dashboard paste-deploy.
// All dependencies inlined — no `../_shared/` imports required.
//
// Changes from v2:
//   1. Stores Alpaca `side` ('long'/'short') in positions.side
//   2. Fetches /v2/account and writes account_snapshots (cash, equity,
//      buying_power, long/short MV) — one append-only row per invocation.
//   3. sync_log details include account snapshot values.
//
// Environment variables (Dashboard -> Edge Functions -> Secrets):
//   <credential_prefix>_KEY / <credential_prefix>_SECRET for every Alpaca
//   broker account (ALPACA_API_* for the original), SUPABASE_DB_URL

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

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

function toNumeric(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (!Number.isFinite(n)) throw new Error(`Invalid numeric string: ${v}`)
    return n
  }
  throw new Error(`Expected string|number numeric, got: ${typeof v}`)
}

function toNumericOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  return toNumeric(v)
}

// OCC option symbol: ROOT(1-6 A-Z/.) + YYMMDD + C|P + 8-digit strike
const OCC_RE = /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/

function classifyAssetClass(symbol: string, alpacaClass?: string): string {
  if (OCC_RE.test(symbol)) return 'option'
  if (alpacaClass) return alpacaClass
  return 'equity'
}

// ── sync_log helpers ────────────────────────────────────────────────────────

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

interface SyncCounts {
  positions_seen?: number
  positions_upserted?: number
}

async function openSyncLog(functionName: string, source: string, parentId: number | null,
                           portfolioId: string | null): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    insert into public.sync_log (status, source, function_name, parent_id, portfolio_id)
    values ('running', ${source}, ${functionName}, ${parentId}, ${portfolioId})
    returning id
  `
  return rows[0].id
}

async function closeSyncLogSuccess(id: number, counts: SyncCounts, details: Record<string, unknown>): Promise<void> {
  await sql`
    update public.sync_log set
      finished_at           = now(),
      status                = 'success',
      positions_seen        = ${counts.positions_seen ?? null},
      positions_upserted    = ${counts.positions_upserted ?? null},
      details               = ${sql.json(details)}
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
        error_message = ${message}
      where id = ${id}
    `
  } catch (e) {
    console.error('sync_log error update failed:', e)
  }
}

// ── Alpaca types ────────────────────────────────────────────────────────────

interface AlpacaPosition {
  symbol: string
  qty: string | number
  cost_basis: string | number
  market_value?: string | number
  asset_class?: string
  side?: string                  // 'long' | 'short'
  [k: string]: unknown
}

interface AlpacaAccount {
  account_number?: string
  cash?: string
  equity?: string
  buying_power?: string
  portfolio_value?: string
  long_market_value?: string
  short_market_value?: string
  currency?: string
  [k: string]: unknown
}

interface PositionsResult {
  positions_seen: number
  positions_upserted: number
  positions_exited: number
  reconcile_skipped: number
  portfolios: number
  symbols: string[]
  options_count: number
  shorts_count: number
  account_equity: number | null
  account_cash: number | null
}

// ── Positions + Account task ────────────────────────────────────────────────

async function runPositionsAndAccount(t: BrokerTarget): Promise<PositionsResult> {
  // ONE portfolio per call, fetched with that portfolio's own credentials. The
  // single-element list keeps the write path below unchanged from v3, where it
  // looped over every Alpaca portfolio with one account's data.
  const portfolios = [{ portfolio_id: t.portfolio_id }]

  // Fetch positions and account in parallel. verifiedAccount throws on an
  // identity mismatch, and the throw lands before the transaction opens.
  const [raw, account] = await Promise.all([
    alpacaGet<AlpacaPosition[]>(t, '/v2/positions'),
    verifiedAccount<AlpacaAccount>(t),
  ])

  // `for (const p of raw)` accepts any iterable, so a 200 carrying a string
  // would parse character by character into a book of the wrong shape instead
  // of failing. Refuse before the transaction opens; nothing is written yet.
  if (!Array.isArray(raw)) {
    throw new Error('sync_alpaca_positions: /v2/positions did not return an array')
  }

  // ── Parse positions ─────────────────────────────────────────────────────
  type ParsedPos = {
    symbol: string
    qty: number
    averageCost: number
    marketValue: number | null
    assetClass: string
    side: string
  }
  const bySymbol = new Map<string, ParsedPos>()
  let optionsCount = 0
  let shortsCount = 0

  for (const p of raw) {
    const qty = toNumeric(p.qty)
    const costBasis = toNumeric(p.cost_basis)
    // average_cost is per-share; Alpaca's cost_basis is the total.
    // For shorts both are negative — dividing gives positive per-share cost.
    const averageCost = qty !== 0 ? costBasis / qty : 0
    const assetClass = classifyAssetClass(p.symbol, p.asset_class)
    const side = (p.side || 'long').toLowerCase()
    if (assetClass === 'option') optionsCount += 1
    if (side === 'short') shortsCount += 1
    bySymbol.set(p.symbol, {
      symbol: p.symbol,
      qty,
      averageCost,
      marketValue: toNumericOrNull(p.market_value),
      assetClass,
      side,
    })
  }

  // ── Parse account ───────────────────────────────────────────────────────
  const acctCash            = toNumericOrNull(account.cash)
  const acctEquity          = toNumericOrNull(account.equity)
  const acctBuyingPower     = toNumericOrNull(account.buying_power)
  const acctPortfolioValue  = toNumericOrNull(account.portfolio_value)
  const acctLongMV          = toNumericOrNull(account.long_market_value)
  const acctShortMV         = toNumericOrNull(account.short_market_value)
  const acctCurrency        = account.currency ?? 'USD'

  const symbols = Array.from(bySymbol.keys())
  let positionsUpserted = 0
  let positionsExited = 0
  let reconcileSkipped = 0

  await sql.begin(async (tx: any) => {
    // Upsert assets
    for (const [symbol, pos] of bySymbol) {
      await tx`
        insert into public.assets (symbol, asset_class)
        values (${symbol}, ${pos.assetClass})
        on conflict (symbol) do update set asset_class = excluded.asset_class
      `
    }

    const assetRows = await tx<{ id: string; symbol: string }[]>`
      select id, symbol from public.assets where symbol = any(${symbols})
    `
    const assetBySymbol = new Map<string, string>()
    for (const r of assetRows) assetBySymbol.set(r.symbol, r.id)

    // The asset_ids Alpaca actually reported this run -- the set the snapshot
    // is reconciled against below.
    const seenAssetIds = symbols
      .map((s) => assetBySymbol.get(s))
      .filter((id): id is string => Boolean(id))

    // Upsert positions (now includes side)
    for (const pr of portfolios) {
      for (const symbol of symbols) {
        const assetId = assetBySymbol.get(symbol)
        if (!assetId) continue
        const pos = bySymbol.get(symbol)!
        await tx`
          insert into public.positions (
            portfolio_id, asset_id, quantity, average_cost, market_value, as_of_date, side
          ) values (
            ${pr.portfolio_id}, ${assetId}, ${pos.qty}, ${pos.averageCost},
            ${pos.marketValue}, current_date, ${pos.side}
          )
          on conflict (portfolio_id, asset_id, as_of_date) do update set
            quantity      = excluded.quantity,
            average_cost  = excluded.average_cost,
            market_value  = excluded.market_value,
            side          = excluded.side,
            updated_at    = now()
        `
        positionsUpserted += 1
      }

      // ── RECONCILE: an upsert cannot express an EXIT ────────────────────
      // Everything above only ever writes rows for names Alpaca currently
      // returns. A name sold intraday simply stops being upserted, and the row
      // written before the sale survives in today's snapshot until as_of_date
      // rolls over at midnight -- so every book surface goes on showing a
      // position that is gone. Observed 2026-09-14: KMTUY liquidated at 13:35,
      // still carried at 20:00 as the only one of 66 rows the latest run had
      // not touched. This delete is the missing half of the write.
      //
      // COHERENCE GATE. An empty positions array is the correct answer for a
      // genuinely flat account and a catastrophic one if the endpoint hiccuped,
      // because reconciling on it removes the entire book. `/v2/account` is an
      // independent witness: its long/short market value comes from a different
      // endpoint in the same fetch. Refuse to reconcile when the two disagree,
      // and say so at error level rather than silently skipping -- a swallowed
      // refusal here is indistinguishable from a book that really did go flat.
      //
      // An ABSENT market value is not a zero one. `toNumericOrNull` yields null
      // for a field the payload did not carry, so `?? 0` would read a 200 that
      // omitted both fields as a confirmed-flat account and delete the book on
      // the strength of a witness that never testified. Both must be present.
      const grossMarketValue = (acctLongMV !== null && acctShortMV !== null)
        ? Math.abs(acctLongMV) + Math.abs(acctShortMV)
        : null
      const reconcilable = seenAssetIds.length > 0 ||
        (grossMarketValue !== null && grossMarketValue < 1)

      if (!reconcilable) {
        console.error(
          'sync_alpaca_positions: REFUSING to reconcile -- /v2/positions returned ' +
          'no rows while /v2/account ' +
          (grossMarketValue === null
            ? 'did not report long/short market value'
            : 'reports gross market value ' + grossMarketValue) +
          '. Stale positions left in place for portfolio ' + pr.portfolio_id + '.'
        )
        reconcileSkipped += 1
      } else {
        const removed = await tx`
          delete from public.positions
           where portfolio_id = ${pr.portfolio_id}
             and as_of_date   = current_date
             and not (asset_id = any(${seenAssetIds}::uuid[]))
          returning asset_id
        `
        positionsExited += removed.length
      }

      // Write account snapshot (append-only, one per invocation per portfolio)
      await tx`
        insert into public.account_snapshots (
          portfolio_id, as_of, cash, equity, buying_power, portfolio_value,
          long_market_value, short_market_value, currency, raw
        ) values (
          ${pr.portfolio_id}, now(), ${acctCash}, ${acctEquity}, ${acctBuyingPower},
          ${acctPortfolioValue}, ${acctLongMV}, ${acctShortMV},
          ${acctCurrency}, ${sql.json(account)}
        )
      `
    }
  })

  return {
    positions_seen: symbols.length,
    positions_upserted: positionsUpserted,
    positions_exited: positionsExited,
    reconcile_skipped: reconcileSkipped,
    portfolios: portfolios.length,
    symbols,
    options_count: optionsCount,
    shorts_count: shortsCount,
    account_equity: acctEquity,
    account_cash: acctCash,
  }
}

// ── HTTP entry point ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('expected POST', { status: 405 })
  }

  const payload = await req.json().catch(() => ({}))
  const portfolioId = typeof payload?.portfolio_id === 'string' ? payload.portfolio_id : null
  const source = typeof payload?.source === 'string' ? payload.source : 'edge_function'
  const parentId = typeof payload?.parent_sync_log_id === 'number' ? payload.parent_sync_log_id : null

  // One account per iteration, each with its own sync_log row: a failure in
  // one (bad credentials, an identity mismatch, an endpoint hiccup) is recorded
  // against THAT portfolio and does not block or roll back another.
  const targets = await loadTargets(portfolioId)

  if (targets.length === 0) {
    // A no-op must not answer 200: no registered Alpaca portfolio (or a
    // portfolio_id that matches none) is a configuration fault, not a quiet day.
    const logId = await openSyncLog('sync_alpaca_positions', source, parentId, null)
    const err = new Error(portfolioId
      ? `no Alpaca portfolio with id ${portfolioId}`
      : 'no Alpaca portfolios registered')
    await closeSyncLogError(logId, err)
    console.error('sync_alpaca_positions failed:', err.message)
    return jsonResponse({ sync_log_id: logId, error: 'sync_alpaca_positions failed', detail: err.message }, 500)
  }

  const results: Record<string, unknown>[] = []
  let failures = 0

  for (const t of targets) {
    let syncLogId: number | null = null
    try {
      syncLogId = await openSyncLog('sync_alpaca_positions', source, parentId, t.portfolio_id)
      const result = await runPositionsAndAccount(t)
      await closeSyncLogSuccess(
        syncLogId,
        { positions_seen: result.positions_seen, positions_upserted: result.positions_upserted },
        {
          portfolio_id: t.portfolio_id,
          account_number: t.account_number,
          portfolios: result.portfolios,
          options_count: result.options_count,
          shorts_count: result.shorts_count,
          account_equity: result.account_equity,
          account_cash: result.account_cash,
          // Legible on its own: "exited 1" is the record that a position left the
          // book on this run, and reconcile_skipped > 0 says the gate refused.
          positions_exited: result.positions_exited,
          reconcile_skipped: result.reconcile_skipped,
          synced_as_of_date: new Date().toISOString().slice(0, 10),
        }
      )
      results.push({ portfolio_id: t.portfolio_id, sync_log_id: syncLogId, ok: true, ...result })
    } catch (err) {
      failures += 1
      await closeSyncLogError(syncLogId, err)
      const message = err instanceof Error ? err.message : String(err)
      console.error(`sync_alpaca_positions failed for portfolio ${t.portfolio_id}:`, message)
      results.push({ portfolio_id: t.portfolio_id, sync_log_id: syncLogId, ok: false, detail: message })
    }
  }

  if (failures === 0) {
    // Update parser heartbeat only when every account synced
    await sql`select update_parser_heartbeat('ok', null)`.catch(() => {/* non-fatal */})
  }
  // 500 when ANY account failed, so pg_cron's job_run_details shows it; the
  // body says which, and every healthy account's rows are already committed.
  return jsonResponse({ portfolios: targets.length, failures, results }, failures === 0 ? 200 : 500)
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}
