// Edge Function: sync_alpaca_positions (v3 — side + account snapshot)
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
//   ALPACA_API_KEY, ALPACA_API_SECRET, SUPABASE_DB_URL

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

// ── Alpaca helpers ──────────────────────────────────────────────────────────

const ALPACA_TRADING_BASE = 'https://paper-api.alpaca.markets'

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

async function alpacaGet<T = unknown>(path: string): Promise<T> {
  const url = new URL(path, ALPACA_TRADING_BASE)
  const resp = await fetch(url.toString(), { headers: alpacaHeaders() })
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

async function openSyncLog(functionName: string, source: string, parentId: number | null): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    insert into public.sync_log (status, source, function_name, parent_id)
    values ('running', ${source}, ${functionName}, ${parentId})
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
  portfolios: number
  symbols: string[]
  options_count: number
  shorts_count: number
  account_equity: number | null
  account_cash: number | null
}

// ── Positions + Account task ────────────────────────────────────────────────

async function runPositionsAndAccount(portfolioId: string | null): Promise<PositionsResult> {
  const portfolios = await sql<{ portfolio_id: string }[]>`
    select p.id as portfolio_id
    from public.portfolios p
    join public.broker_accounts b on b.id = p.broker_account_id
    where b.broker = 'alpaca'
    ${portfolioId ? sql`and p.id = ${portfolioId}` : sql``}
  `

  if (portfolios.length === 0) {
    return { positions_seen: 0, positions_upserted: 0, portfolios: 0,
             symbols: [], options_count: 0, shorts_count: 0,
             account_equity: null, account_cash: null }
  }

  // Fetch positions and account in parallel
  const [raw, account] = await Promise.all([
    alpacaGet<AlpacaPosition[]>('/v2/positions'),
    alpacaGet<AlpacaAccount>('/v2/account'),
  ])

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

  let syncLogId: number | null = null

  try {
    syncLogId = await openSyncLog('sync_alpaca_positions', source, parentId)
    const result = await runPositionsAndAccount(portfolioId)
    await closeSyncLogSuccess(
      syncLogId,
      { positions_seen: result.positions_seen, positions_upserted: result.positions_upserted },
      {
        portfolios: result.portfolios,
        options_count: result.options_count,
        shorts_count: result.shorts_count,
        account_equity: result.account_equity,
        account_cash: result.account_cash,
        synced_as_of_date: new Date().toISOString().slice(0, 10),
      }
    )
    // Update parser heartbeat on successful sync
    await sql`select update_parser_heartbeat('ok', null)`.catch(() => {/* non-fatal */})
    return jsonResponse({ sync_log_id: syncLogId, ...result }, 200)
  } catch (err) {
    await closeSyncLogError(syncLogId, err)
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync_alpaca_positions failed:', message)
    return jsonResponse(
      { sync_log_id: syncLogId, error: 'sync_alpaca_positions failed', detail: message },
      500
    )
  }
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}
