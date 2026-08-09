// Edge Function: sync_alpaca_transactions
//
// Replaces the transactions leg of scripts/sync-wrapper.mjs, which ran on
// GitHub Actions and never once completed. Two independent failures killed it:
//
//   1. Actions cannot provision a runner in this repo. Every ATLAS Sync run
//      dies in 3-5 seconds with runner_id 0 and no runner name — the job never
//      reaches its first step. The schedule fires fine; there is nothing to
//      run it on.
//   2. Even given a runner, syncTransactions() wrote columns that do not
//      exist: activity_id, symbol, side, qty, order_id, type, leaves_qty,
//      cum_qty, updated_at — and set onConflict to activity_id, also absent.
//      The real table keys on (portfolio_id, external_id) and wants asset_id,
//      transaction_type, quantity, fees, metadata. Every upsert would have
//      thrown. atlas_sync_log has zero rows for sync_type='transactions',
//      confirming it never ran to the point of logging.
//
// So this is not a repair of a working thing that stopped. It is the first
// working implementation. It follows sync_alpaca_positions exactly, because
// that pattern has 2016 consecutive clean pg_cron runs behind it.
//
// Environment (Dashboard -> Edge Functions -> Secrets):
//   ALPACA_API_KEY, ALPACA_API_SECRET, SUPABASE_DB_URL

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const ALPACA_TRADING_BASE = 'https://paper-api.alpaca.markets'

// Alpaca caps activities pages at 100. Guard the loop so a pagination bug
// cannot spin forever inside a scheduled function.
const PAGE_SIZE = 100
const MAX_PAGES = 100

// When the table is empty there is no watermark to resume from. Start at the
// first known transaction date rather than pulling the account's entire
// lifetime on every cold start.
const COLD_START_AFTER = '2025-12-01T00:00:00Z'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

function alpacaHeaders(): Record<string, string> {
    const key = Deno.env.get('ALPACA_API_KEY')
    const secret = Deno.env.get('ALPACA_API_SECRET')
    if (!key || !secret) throw new Error('Missing ALPACA_API_KEY and/or ALPACA_API_SECRET')
    return { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret }
}

async function alpacaGet<T = unknown>(path: string): Promise<T> {
    const url = new URL(path, ALPACA_TRADING_BASE)
    const resp = await fetch(url.toString(), { headers: alpacaHeaders() })
    const text = await resp.text()
    if (!resp.ok) throw new Error(`Alpaca ${path} failed: ${resp.status} ${text.slice(0, 500)}`)
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

const OCC_RE = /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/
function classifyAssetClass(symbol: string): string {
    return OCC_RE.test(symbol) ? 'option' : 'equity'
}

// The existing 146 rows use 'orderside.buy' / 'orderside.sell', and
// vw_position_nav_daily selects buys with `lower(transaction_type) like
// '%buy%'`. Emitting a different vocabulary would leave new rows invisible to
// every transaction-derived surface — the same silent-omission failure this
// sync exists to end. Match the established format exactly.
function transactionType(side: unknown): string {
    const s = String(side ?? '').toLowerCase()
    if (s.includes('buy')) return 'orderside.buy'
    if (s.includes('sell')) return 'orderside.sell'
    throw new Error(`Unrecognised activity side: ${JSON.stringify(side)}`)
}

interface AlpacaActivity {
    id: string
    symbol?: string
    side?: string
    qty?: string | number
    price?: string | number
    transaction_time?: string
    date?: string
    cum_qty?: string | number
    [k: string]: unknown
}

// Page through FILL activities newer than `after`. Alpaca returns activities
// newest-first within a page and supports page_token continuation.
async function fetchFills(after: string): Promise<AlpacaActivity[]> {
    const out: AlpacaActivity[] = []
    let pageToken: string | null = null

    for (let page = 0; page < MAX_PAGES; page++) {
        const qs = new URLSearchParams({
            activity_types: 'FILL',
            after,
            direction: 'asc',
            page_size: String(PAGE_SIZE),
        })
        if (pageToken) qs.set('page_token', pageToken)

        const batch = await alpacaGet<AlpacaActivity[]>(`/v2/account/activities?${qs}`)
        if (!Array.isArray(batch) || batch.length === 0) break
        out.push(...batch)
        if (batch.length < PAGE_SIZE) break

        const last = batch[batch.length - 1]
        if (!last?.id) break
        pageToken = last.id
    }
    return out
}

async function openSyncLog(): Promise<number> {
    const rows = await sql<{ id: number }[]>`
        insert into public.sync_log (status, source, function_name)
        values ('running', 'pg_cron', 'sync_alpaca_transactions')
        returning id
    `
    return rows[0].id
}

async function closeSyncLogSuccess(id: number, upserted: number, details: Record<string, unknown>): Promise<void> {
    await sql`
        update public.sync_log set
            finished_at           = now(),
            status                = 'success',
            transactions_upserted = ${upserted},
            duration_ms           = (extract(epoch from (now() - started_at)) * 1000)::int,
            details               = ${sql.json(details)}
        where id = ${id}
    `
}

async function closeSyncLogError(id: number | null, err: unknown): Promise<void> {
    if (id == null) return
    const message = err instanceof Error ? err.message : String(err)
    try {
        await sql`
            update public.sync_log
            set finished_at = now(), status = 'error', error_message = ${message}
            where id = ${id}
        `
    } catch (e) {
        console.error('sync_log error update failed:', e)
    }
}

interface SyncResult {
    watermark: string
    fetched: number
    upserted: number
    skipped_no_symbol: number
    assets_created: number
    symbols: string[]
}

async function runTransactionSync(): Promise<SyncResult> {
    const portfolios = await sql<{ portfolio_id: string }[]>`
        select p.id as portfolio_id
        from public.portfolios p
        join public.broker_accounts b on b.id = p.broker_account_id
        where b.broker = 'alpaca'
    `
    if (portfolios.length === 0) {
        return { watermark: COLD_START_AFTER, fetched: 0, upserted: 0, skipped_no_symbol: 0, assets_created: 0, symbols: [] }
    }

    // Resume from the newest row we already hold. Alpaca's `after` is
    // exclusive on time, and the (portfolio_id, external_id) unique key makes
    // any overlap idempotent, so a re-run can never double-count a fill.
    // Formatted as strict ISO8601-Z: Postgres's default text cast renders
    // "2026-03-26 14:30:00+00", which Alpaca rejects as an `after` value.
    const [wm] = await sql<{ watermark: string | null }[]>`
        select to_char(max(transaction_date) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as watermark
        from public.transactions
    `
    const after = wm?.watermark ?? COLD_START_AFTER

    const activities = await fetchFills(after)

    type Parsed = {
        externalId: string
        symbol: string
        assetClass: string
        transactionType: string
        quantity: number
        price: number | null
        transactionDate: string
        raw: AlpacaActivity
    }
    const parsed: Parsed[] = []
    let skippedNoSymbol = 0

    for (const a of activities) {
        const symbol = typeof a.symbol === 'string' ? a.symbol.trim() : ''
        const when = a.transaction_time || a.date
        // A fill with no symbol or no timestamp cannot be attributed to an
        // asset or placed on the timeline. Count it and move on — never
        // invent a placeholder that would look like a real trade.
        if (!symbol || !when || !a.id) { skippedNoSymbol += 1; continue }
        parsed.push({
            externalId: String(a.id),
            symbol,
            assetClass: classifyAssetClass(symbol),
            transactionType: transactionType(a.side),
            quantity: Math.abs(toNumeric(a.qty ?? a.cum_qty ?? 0)),
            price: a.price == null ? null : toNumeric(a.price),
            transactionDate: when,
            raw: a,
        })
    }

    const symbols = Array.from(new Set(parsed.map(p => p.symbol)))
    let upserted = 0
    let assetsCreated = 0

    if (parsed.length) {
        await sql.begin(async (tx: any) => {
            const before = await tx<{ n: string }[]>`
                select count(*)::text as n from public.assets where symbol = any(${symbols})
            `
            for (const symbol of symbols) {
                const assetClass = classifyAssetClass(symbol)
                await tx`
                    insert into public.assets (symbol, asset_class)
                    values (${symbol}, ${assetClass})
                    on conflict (symbol) do update set asset_class = excluded.asset_class
                `
            }
            const after2 = await tx<{ n: string }[]>`
                select count(*)::text as n from public.assets where symbol = any(${symbols})
            `
            assetsCreated = Number(after2[0].n) - Number(before[0].n)

            const assetRows = await tx<{ id: string; symbol: string }[]>`
                select id, symbol from public.assets where symbol = any(${symbols})
            `
            const assetBySymbol = new Map<string, string>()
            for (const r of assetRows) assetBySymbol.set(r.symbol, r.id)

            for (const pr of portfolios) {
                for (const p of parsed) {
                    const assetId = assetBySymbol.get(p.symbol)
                    // asset_id is NOT NULL; without a resolved asset the row
                    // cannot be written at all. Skip rather than fabricate.
                    if (!assetId) continue
                    await tx`
                        insert into public.transactions (
                            portfolio_id, asset_id, transaction_type, quantity,
                            price, fees, transaction_date, external_id, metadata
                        ) values (
                            ${pr.portfolio_id}, ${assetId}, ${p.transactionType}, ${p.quantity},
                            ${p.price}, 0, ${p.transactionDate}, ${p.externalId}, ${sql.json(p.raw)}
                        )
                        on conflict (portfolio_id, external_id) do update set
                            transaction_type = excluded.transaction_type,
                            quantity         = excluded.quantity,
                            price            = excluded.price,
                            transaction_date = excluded.transaction_date,
                            metadata         = excluded.metadata
                    `
                    upserted += 1
                }
            }
        })
    }

    return {
        watermark: after,
        fetched: activities.length,
        upserted,
        skipped_no_symbol: skippedNoSymbol,
        assets_created: assetsCreated,
        symbols,
    }
}

Deno.serve(async (req: Request) => {
    let logId: number | null = null
    try {
        logId = await openSyncLog()
        const result = await runTransactionSync()
        await closeSyncLogSuccess(logId, result.upserted, result as unknown as Record<string, unknown>)
        return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: { 'Content-Type': 'application/json' },
        })
    } catch (err) {
        await closeSyncLogError(logId, err)
        const message = err instanceof Error ? err.message : String(err)
        console.error('sync_alpaca_transactions failed:', message)
        // 500 so a failed run is visible to the caller and to pg_cron's
        // job_run_details, rather than a silent 200 that reads as healthy.
        return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        })
    }
})
