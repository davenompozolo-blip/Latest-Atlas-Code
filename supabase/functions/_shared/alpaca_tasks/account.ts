// Account task: /v2/account -> public.account_snapshots (append-only).
//
// Writes one row per alpaca portfolio per invocation. Cash, equity,
// buying_power, portfolio_value, and long/short MV all land here so the
// terminal can display the authoritative NAV from Alpaca alongside the
// FIFO-derived value from positions.

import { alpacaGet, ALPACA_TRADING_BASE, toNumericOrNull } from '../alpaca.ts'

export interface AccountResult {
  snapshots_written: number
  portfolios: number
  equity: number | null
  cash: number | null
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

export async function runAccount(
  sql: any,
  opts: { portfolioId?: string | null } = {}
): Promise<AccountResult> {
  const portfolios = await sql`
    select p.id as portfolio_id
    from public.portfolios p
    join public.broker_accounts b on b.id = p.broker_account_id
    where b.broker = 'alpaca'
    ${opts.portfolioId ? sql`and p.id = ${opts.portfolioId}` : sql``}
  `

  if (portfolios.length === 0) {
    return { snapshots_written: 0, portfolios: 0, equity: null, cash: null }
  }

  const account = await alpacaGet<AlpacaAccount>(ALPACA_TRADING_BASE, '/v2/account')

  const cash             = toNumericOrNull(account.cash)
  const equity           = toNumericOrNull(account.equity)
  const buyingPower      = toNumericOrNull(account.buying_power)
  const portfolioValue   = toNumericOrNull(account.portfolio_value)
  const longMarketValue  = toNumericOrNull(account.long_market_value)
  const shortMarketValue = toNumericOrNull(account.short_market_value)
  const currency         = account.currency ?? 'USD'

  let written = 0
  await sql.begin(async (tx: any) => {
    for (const pr of portfolios) {
      await tx`
        insert into public.account_snapshots (
          portfolio_id, as_of, cash, equity, buying_power, portfolio_value,
          long_market_value, short_market_value, currency, raw
        ) values (
          ${pr.portfolio_id}, now(), ${cash}, ${equity}, ${buyingPower},
          ${portfolioValue}, ${longMarketValue}, ${shortMarketValue},
          ${currency}, ${sql.json(account)}
        )
      `
      written += 1
    }
  })

  return {
    snapshots_written: written,
    portfolios: portfolios.length,
    equity,
    cash,
  }
}
