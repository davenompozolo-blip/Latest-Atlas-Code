// Edge Function: sync_portfolio_history
//
// Calls Alpaca GET /v2/account/portfolio/history and upserts into
// public.portfolio_equity_curve. Run with period='all' for the
// initial backfill; use period='1M' for nightly incremental updates.
//
// Body params (all optional):
//   period       — Alpaca period string e.g. '1A', '6M', 'all'  (default: 'all')
//   timeframe    — Alpaca timeframe e.g. '1D', '1H'             (default: '1D')
//   portfolio_id — UUID of a specific portfolio to tag rows      (auto-detected if omitted)
//
// Environment variables (Dashboard -> Edge Functions -> Secrets):
//   ALPACA_API_KEY, ALPACA_API_SECRET, SUPABASE_DB_URL

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js'

const ALPACA_TRADING_BASE = 'https://paper-api.alpaca.markets'

function alpacaHeaders(): Record<string, string> {
  const key    = Deno.env.get('ALPACA_API_KEY')
  const secret = Deno.env.get('ALPACA_API_SECRET')
  if (!key || !secret) throw new Error('Missing ALPACA_API_KEY and/or ALPACA_API_SECRET')
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
  }
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

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse('expected POST', 405)
  }

  const payload     = await req.json().catch(() => ({}))
  const period      = typeof payload?.period       === 'string' ? payload.period       : 'all'
  const timeframe   = typeof payload?.timeframe    === 'string' ? payload.timeframe    : '1D'
  const portfolioId = typeof payload?.portfolio_id === 'string' ? payload.portfolio_id : null

  try {
    // ── Resolve portfolio_id ───────────────────────────────────────────────
    let resolvedPortfolioId: string
    if (portfolioId) {
      resolvedPortfolioId = portfolioId
    } else {
      const rows = await sql<{ id: string }[]>`
        select p.id
        from public.portfolios p
        join public.broker_accounts b on b.id = p.broker_account_id
        where b.broker = 'alpaca'
        limit 1
      `
      if (rows.length === 0) throw new Error('No Alpaca portfolio found in DB')
      resolvedPortfolioId = rows[0].id
    }

    // ── Fetch from Alpaca ──────────────────────────────────────────────────
    const params = new URLSearchParams({ period, timeframe })
    const url    = `${ALPACA_TRADING_BASE}/v2/account/portfolio/history?${params}`
    const resp   = await fetch(url, { headers: alpacaHeaders() })
    const text   = await resp.text()
    if (!resp.ok) throw new Error(`Alpaca portfolio/history failed: ${resp.status} ${text.slice(0, 500)}`)

    const history: AlpacaPortfolioHistory = JSON.parse(text)
    const { timestamp, equity, profit_loss, profit_loss_pct, base_value } = history

    if (!Array.isArray(timestamp) || timestamp.length === 0) {
      return jsonResponse({ inserted: 0, message: 'Alpaca returned empty history' }, 200)
    }

    // ── Build rows, skip null-equity points (non-trading day padding) ──────
    const validRows = timestamp
      .map((ts, i) => ({
        portfolio_id:    resolvedPortfolioId,
        ts:              new Date(ts * 1000).toISOString(),
        equity:          toNumericOrNull(equity[i]),
        profit_loss:     toNumericOrNull(profit_loss[i]),
        profit_loss_pct: toNumericOrNull(profit_loss_pct[i]),
        base_value:      toNumericOrNull(base_value),
        timeframe,
      }))
      .filter(r => r.equity !== null && r.equity > 0)

    // ── Upsert in 500-row chunks ───────────────────────────────────────────
    let inserted = 0
    const chunkSize = 500
    for (let i = 0; i < validRows.length; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize)
      await sql`
        insert into public.portfolio_equity_curve
          (portfolio_id, ts, equity, profit_loss, profit_loss_pct, base_value, timeframe)
        select
          x.portfolio_id::uuid,
          x.ts::timestamptz,
          x.equity::numeric,
          x.profit_loss::numeric,
          x.profit_loss_pct::numeric,
          x.base_value::numeric,
          x.timeframe
        from jsonb_to_recordset(${sql.json(chunk)}::jsonb) as x(
          portfolio_id    text,
          ts              text,
          equity          text,
          profit_loss     text,
          profit_loss_pct text,
          base_value      text,
          timeframe       text
        )
        on conflict (portfolio_id, timeframe, ts) do update set
          equity          = excluded.equity,
          profit_loss     = excluded.profit_loss,
          profit_loss_pct = excluded.profit_loss_pct,
          base_value      = excluded.base_value
      `
      inserted += chunk.length
    }

    return jsonResponse({
      portfolio_id:     resolvedPortfolioId,
      period,
      timeframe,
      rows_from_alpaca: timestamp.length,
      valid_rows:       validRows.length,
      inserted,
    }, 200)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('sync_portfolio_history failed:', message)
    return jsonResponse({ error: 'sync_portfolio_history failed', detail: message }, 500)
  }
})

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}
