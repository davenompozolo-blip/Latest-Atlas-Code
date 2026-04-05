// Edge Function: sync_alpaca_positions
//
// Thin wrapper around the shared `runPositions` task. Opens a sync_log row,
// runs the task, writes the outcome, and returns JSON.
//
// Payload (all optional):
//   { "portfolio_id": "...", "source": "manual" }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'
import { createSyncLog } from '../_shared/sync_log.ts'
import { runPositions } from '../_shared/alpaca_tasks/positions.ts'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('expected POST', { status: 405 })

  const payload = await req.json().catch(() => ({}))
  const portfolioId = typeof payload?.portfolio_id === 'string' ? payload.portfolio_id : null
  const source = typeof payload?.source === 'string' ? payload.source : 'edge_function'
  const parentId = typeof payload?.parent_sync_log_id === 'number' ? payload.parent_sync_log_id : null

  const log = createSyncLog(sql, { functionName: 'sync_alpaca_positions', source, parentId })
  await log.open()

  try {
    const result = await runPositions(sql, { portfolioId })
    await log.success(
      {
        positions_seen: result.positions_seen,
        positions_upserted: result.positions_upserted,
      },
      {
        portfolios: result.portfolios,
        options_count: result.options_count,
        synced_as_of_date: new Date().toISOString().slice(0, 10),
      }
    )
    return jsonResponse({ sync_log_id: log.id, ...result }, 200)
  } catch (err) {
    await log.error(err)
    return jsonResponse(
      { sync_log_id: log.id, error: 'sync_alpaca_positions failed', detail: errMessage(err) },
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

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
