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
// MP-1: one account per portfolio, each with its own credentials, identity
// gate and resume watermark. See sync_alpaca_positions v4.
//
// Environment (Dashboard -> Edge Functions -> Secrets):
//   <credential_prefix>_KEY / _SECRET per Alpaca broker account
//   (ALPACA_API_* for the original), SUPABASE_DB_URL

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'
import { normaliseFill } from '../_shared/alpaca_fill.js'

// Alpaca caps activities pages at 100. Guard the loop so a pagination bug
// cannot spin forever inside a scheduled function.
const PAGE_SIZE = 100
const MAX_PAGES = 100

// When the table is empty there is no watermark to resume from. Start at the
// first known transaction date rather than pulling the account's entire
// lifetime on every cold start.
const COLD_START_AFTER = '2025-12-01T00:00:00Z'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

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

// Asset class, side vocabulary ('orderside.buy' / 'orderside.sell', which
// vw_position_nav_daily matches with `like '%buy%'`) and the sign of a fill
// are decided in _shared/alpaca_fill.js.

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
async function fetchFills(t: BrokerTarget, after: string): Promise<AlpacaActivity[]> {
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

        const batch = await alpacaGet<AlpacaActivity[]>(t, `/v2/account/activities?${qs}`)
        if (!Array.isArray(batch) || batch.length === 0) break
        out.push(...batch)
        if (batch.length < PAGE_SIZE) break

        const last = batch[batch.length - 1]
        if (!last?.id) break
        pageToken = last.id
    }
    return out
}

async function openSyncLog(portfolioId: string | null): Promise<number> {
    const rows = await sql<{ id: number }[]>`
        insert into public.sync_log (status, source, function_name, portfolio_id)
        values ('running', 'pg_cron', 'sync_alpaca_transactions', ${portfolioId})
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
            -- duration_ms is a generated column; assigning it raises
            -- "can only be updated to DEFAULT" and would fail the whole close
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

async function runTransactionSync(t: BrokerTarget): Promise<SyncResult> {
    // ONE portfolio per call, with that portfolio's own credentials. The
    // single-element list keeps the write path below unchanged from the
    // version that looped over every Alpaca portfolio with one account's fills.
    const portfolios = [{ portfolio_id: t.portfolio_id }]

    // Identity gate before anything is fetched or written.
    await verifiedAccount<{ account_number?: string }>(t)

    // Resume from the newest row we already hold. Alpaca's `after` is
    // exclusive on time, and the (portfolio_id, external_id) unique key makes
    // any overlap idempotent, so a re-run can never double-count a fill.
    // Formatted as strict ISO8601-Z: Postgres's default text cast renders
    // "2026-03-26 14:30:00+00", which Alpaca rejects as an `after` value.
    const [wm] = await sql<{ watermark: string | null }[]>`
        select to_char(max(transaction_date) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as watermark
        from public.transactions
        where portfolio_id = ${t.portfolio_id}
    `
    const after = wm?.watermark ?? COLD_START_AFTER

    // The watermark is THIS portfolio's newest fill. A global max would let a
    // quieter account resume from a busier one's newest fill and skip its own.
    const activities = await fetchFills(t, after)

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
        // Symbol, side and quantity come from normaliseFill: a negative qty is
        // a reversal (it flips the side), and a crypto pair "BCH/USD" is the
        // asset "BCHUSD" that /v2/positions reports. See _shared/alpaca_fill.js.
        const fill = a.symbol ? normaliseFill(a) : null
        const symbol = fill ? fill.symbol : ''
        const when = a.transaction_time || a.date
        // A fill with no symbol or no timestamp cannot be attributed to an
        // asset or placed on the timeline. Count it and move on — never
        // invent a placeholder that would look like a real trade.
        if (!symbol || !when || !a.id) { skippedNoSymbol += 1; continue }
        parsed.push({
            externalId: String(a.id),
            symbol,
            assetClass: fill!.assetClass,
            transactionType: fill!.transactionType,
            quantity: fill!.quantity,
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
                const assetClass = parsed.find(p => p.symbol === symbol)!.assetClass
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

Deno.serve(async (_req: Request) => {
    // One account per iteration, each with its own sync_log row, so one
    // account's failure is recorded against it and blocks nothing else.
    let targets: BrokerTarget[]
    try {
        targets = await loadTargets(null)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('sync_alpaca_transactions failed:', message)
        return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        })
    }

    if (targets.length === 0) {
        // A no-op must not answer 200: no registered Alpaca portfolio is a
        // configuration fault, not a quiet day.
        const logId = await openSyncLog(null)
        const err = new Error('no Alpaca portfolios registered')
        await closeSyncLogError(logId, err)
        console.error('sync_alpaca_transactions failed:', err.message)
        return new Response(JSON.stringify({ ok: false, error: err.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' },
        })
    }

    const results: Record<string, unknown>[] = []
    let failures = 0
    for (const t of targets) {
        let logId: number | null = null
        try {
            logId = await openSyncLog(t.portfolio_id)
            const result = await runTransactionSync(t)
            await closeSyncLogSuccess(logId, result.upserted, {
                ...(result as unknown as Record<string, unknown>),
                portfolio_id: t.portfolio_id,
                account_number: t.account_number,
            })
            results.push({ portfolio_id: t.portfolio_id, ok: true, ...result })
        } catch (err) {
            failures += 1
            await closeSyncLogError(logId, err)
            const message = err instanceof Error ? err.message : String(err)
            console.error(`sync_alpaca_transactions failed for portfolio ${t.portfolio_id}:`, message)
            results.push({ portfolio_id: t.portfolio_id, ok: false, error: message })
        }
    }
    // 500 when ANY account failed, so a failed run is visible to the caller and
    // to pg_cron's job_run_details rather than a silent 200 that reads as healthy.
    return new Response(JSON.stringify({ ok: failures === 0, portfolios: targets.length, failures, results }), {
        status: failures === 0 ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
    })
})
