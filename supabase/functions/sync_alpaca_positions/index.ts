// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'
import { z } from 'npm:zod'

const ALPACA_API_KEY = Deno.env.get('ALPACA_API_KEY')
const ALPACA_API_SECRET = Deno.env.get('ALPACA_API_SECRET')

if (!ALPACA_API_KEY || !ALPACA_API_SECRET) {
  console.error('Missing ALPACA_API_KEY and/or ALPACA_API_SECRET')
}

// Paper trading base URL (Alpaca)
const ALPACA_BASE_URL = 'https://paper-api.alpaca.markets'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

const PositionsResponseSchema = z.array(
  z.object({
    symbol: z.string(),
    qty: z.union([z.string(), z.number()]),
    cost_basis: z.union([z.string(), z.number()]),
    // market value is typically present; fall back if missing
    market_value: z.union([z.string(), z.number()]).optional(),
  })
)

function toNumeric(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (!Number.isFinite(n)) throw new Error(`Invalid numeric string: ${v}`)
    return n
  }
  throw new Error(`Expected string/number numeric, got: ${typeof v}`)
}

async function fetchAlpacaPositions(): Promise<unknown[]> {
  const resp = await fetch(`${ALPACA_BASE_URL}/v2/positions`, {
    method: 'GET',
    headers: {
      'APCA-API-KEY-ID': ALPACA_API_KEY!,
      'APCA-API-SECRET-KEY': ALPACA_API_SECRET!,
    },
  })

  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`Alpaca positions failed: ${resp.status} ${text}`)
  }

  // Parse JSON from text to give better error if malformed
  const json = JSON.parse(text)
  return json
}

// --- sync_log instrumentation helpers ---------------------------------------
// Writes a row to public.sync_log at the start of every invocation and
// updates it with the outcome on success/failure. The ATLAS terminal reads
// the latest row via public.vw_sync_status to render the navbar status pill.
//
// The sync_log table + view are defined in
//   supabase/migrations/20260404000000_sync_log.sql

async function openSyncLog(source: string): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    insert into public.sync_log (status, source)
    values ('running', ${source})
    returning id
  `
  return rows[0].id
}

async function closeSyncLogSuccess(
  id: number,
  counts: {
    positions_seen: number
    positions_upserted: number
    portfolios: number
  },
  details: Record<string, unknown> = {}
): Promise<void> {
  await sql`
    update public.sync_log set
      finished_at          = now(),
      status               = 'success',
      positions_seen       = ${counts.positions_seen},
      positions_upserted   = ${counts.positions_upserted},
      details              = ${sql.json({ portfolios: counts.portfolios, ...details })}
    where id = ${id}
  `
}

async function closeSyncLogError(id: number, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  try {
    await sql`
      update public.sync_log set
        finished_at    = now(),
        status         = 'error',
        error_message  = ${message}
      where id = ${id}
    `
  } catch (logErr) {
    // Swallow secondary logging failures — the original error is what matters.
    console.error('Failed to write sync_log error row:', logErr)
  }
}
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('expected POST', { status: 405 })
  }

  // Optional payload: allow specifying a single portfolio_id, otherwise sync all alpaca portfolios.
  // Example: {"portfolio_id":"..."}
  const payload = await req.json().catch(() => ({}))
  const portfolioId = typeof payload?.portfolio_id === 'string' ? payload.portfolio_id : null

  const source =
    typeof payload?.source === 'string' && payload.source.length > 0
      ? payload.source
      : 'edge_function'

  const syncLogId = await openSyncLog(source)

  try {
    // Find alpaca portfolios + their broker accounts
    const portfolios = await sql`
      select p.id as portfolio_id
      from public.portfolios p
      join public.broker_accounts b
        on b.id = p.broker_account_id
      where b.broker = 'alpaca'
      ${portfolioId ? sql`and p.id = ${portfolioId}` : sql``}
    `

    if (portfolios.length === 0) {
      await closeSyncLogSuccess(
        syncLogId,
        { positions_seen: 0, positions_upserted: 0, portfolios: 0 },
        { note: 'No alpaca portfolios found' }
      )
      return new Response(
        JSON.stringify({ synced_portfolios: 0, note: 'No alpaca portfolios found' }),
        { headers: { 'content-type': 'application/json' }, status: 200 }
      )
    }

    // Alpaca positions are account-specific, but if you share credentials across accounts,
    // calling once is still safe. We'll call once per run.
    const raw = await fetchAlpacaPositions()

    const parsed = PositionsResponseSchema.parse(raw)

    // Prepare map of symbol -> { qty, cost_basis, market_value }
    const bySymbol = new Map<string, { qty: number; costBasis: number; marketValue: number | null }>()
    for (const p of parsed) {
      const symbol = (p as any).symbol
      const qty = toNumeric((p as any).qty)
      const costBasis = toNumeric((p as any).cost_basis)
      const mv = (p as any).market_value
      const marketValue = mv === undefined ? null : toNumeric(mv)
      bySymbol.set(symbol, { qty, costBasis, marketValue })
    }

    const symbols = Array.from(bySymbol.keys())

    let positionsUpserted = 0

    // 1) Upsert assets by symbol (assets.symbol is UNIQUE)
    // 2) For each portfolio, replace positions for symbols we received
    //    (positions table lacks a unique constraint on (portfolio_id, asset_id),
    //     so we delete+insert to avoid duplicates)

    await sql.begin(async (tx) => {
      // Upsert assets
      // Insert missing assets; update name/metadata if desired.
      // We only have symbol in this sync, so we keep other columns null/default.
      for (const symbol of symbols) {
        await tx`
          insert into public.assets(symbol)
          values (${symbol})
          on conflict (symbol) do nothing
        `
      }

      // Load asset IDs for all symbols
      const assetRows = await tx`
        select id, symbol
        from public.assets
        where symbol = any(${symbols})
      `

      const assetBySymbol = new Map<string, string>()
      for (const r of assetRows) assetBySymbol.set(r.symbol, r.id)

      for (const pr of portfolios) {
        const portfolio = pr.portfolio_id

        // Delete existing positions for these (portfolio, symbol/asset)
        const assetIds = symbols
          .map((s) => assetBySymbol.get(s))
          .filter((x): x is string => !!x)

        if (assetIds.length > 0) {
          await tx`
            delete from public.positions
            where portfolio_id = ${portfolio}
              and asset_id = any(${assetIds})
          `
        }

        // Insert positions
        for (const symbol of symbols) {
          const assetId = assetBySymbol.get(symbol)
          if (!assetId) continue
          const p = bySymbol.get(symbol)!
          await tx`
            insert into public.positions(
              portfolio_id,
              asset_id,
              quantity,
              average_cost,
              market_value,
              as_of_date
            ) values (
              ${portfolio},
              ${assetId},
              ${p.qty},
              ${p.costBasis},
              ${p.marketValue},
              current_date
            )
          `
          positionsUpserted += 1
        }
      }
    })

    await closeSyncLogSuccess(
      syncLogId,
      {
        positions_seen: symbols.length,
        positions_upserted: positionsUpserted,
        portfolios: portfolios.length,
      },
      { synced_as_of_date: new Date().toISOString().slice(0, 10) }
    )

    return new Response(JSON.stringify({
      synced_portfolios: portfolios.length,
      synced_symbols: symbols.length,
      synced_as_of_date: new Date().toISOString().slice(0, 10),
      sync_log_id: syncLogId,
    }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    await closeSyncLogError(syncLogId, err)
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync_alpaca_positions failed:', message)
    return new Response(
      JSON.stringify({ error: 'sync_alpaca_positions failed', detail: message, sync_log_id: syncLogId }),
      { headers: { 'content-type': 'application/json' }, status: 500 }
    )
  }
})
