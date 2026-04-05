// Portfolio history task: /v2/account/portfolio/history -> public.portfolio_equity_curve.
//
// Default: period=all, timeframe=1D (nightly backfill). Intraday invocations
// can override via opts (e.g. period=1D, timeframe=5Min).

import { alpacaGet, ALPACA_TRADING_BASE, toNumericOrNull } from '../alpaca.ts'

export interface PortfolioHistoryResult {
  portfolios: number
  points_upserted: number
  period: string
  timeframe: string
}

interface AlpacaPortfolioHistory {
  timestamp: number[]
  equity: (number | null)[]
  profit_loss: (number | null)[]
  profit_loss_pct: (number | null)[]
  base_value?: number
  timeframe?: string
  [k: string]: unknown
}

export async function runPortfolioHistory(
  sql: any,
  opts: {
    portfolioId?: string | null
    period?: string       // '1D' | '1W' | '1M' | '3M' | '1A' | 'all' ; default 'all'
    timeframe?: string    // '1Min' | '5Min' | '15Min' | '1H' | '1D'  ; default '1D'
  } = {}
): Promise<PortfolioHistoryResult> {
  const period    = opts.period    ?? 'all'
  const timeframe = opts.timeframe ?? '1D'

  const portfolios = await sql`
    select p.id as portfolio_id
    from public.portfolios p
    join public.broker_accounts b on b.id = p.broker_account_id
    where b.broker = 'alpaca'
    ${opts.portfolioId ? sql`and p.id = ${opts.portfolioId}` : sql``}
  `

  if (portfolios.length === 0) {
    return { portfolios: 0, points_upserted: 0, period, timeframe }
  }

  // Alpaca account endpoint isn't portfolio-scoped on their side; we call once
  // and write the same curve for every local alpaca portfolio row.
  const history = await alpacaGet<AlpacaPortfolioHistory>(
    ALPACA_TRADING_BASE,
    '/v2/account/portfolio/history',
    { period, timeframe }
  )

  const { timestamp = [], equity = [], profit_loss = [], profit_loss_pct = [], base_value } = history
  const n = Math.min(timestamp.length, equity.length)

  let upserted = 0
  await sql.begin(async (tx: any) => {
    for (const pr of portfolios) {
      for (let i = 0; i < n; i += 1) {
        const tsSec = timestamp[i]
        if (tsSec == null) continue
        const ts = new Date(tsSec * 1000).toISOString()
        await tx`
          insert into public.portfolio_equity_curve (
            portfolio_id, ts, equity, profit_loss, profit_loss_pct, base_value, timeframe
          ) values (
            ${pr.portfolio_id}, ${ts},
            ${toNumericOrNull(equity[i])}, ${toNumericOrNull(profit_loss[i])},
            ${toNumericOrNull(profit_loss_pct[i])}, ${toNumericOrNull(base_value)},
            ${timeframe}
          )
          on conflict (portfolio_id, timeframe, ts) do update set
            equity          = excluded.equity,
            profit_loss     = excluded.profit_loss,
            profit_loss_pct = excluded.profit_loss_pct,
            base_value      = excluded.base_value
        `
        upserted += 1
      }
    }
  })

  return { portfolios: portfolios.length, points_upserted: upserted, period, timeframe }
}
