// Positions task: /v2/positions -> public.positions (snapshot for today).
//
// Differences from the original Edge Function:
//   1. average_cost = cost_basis / qty  (per-share, matches schema intent)
//   2. Options are kept but tagged asset_class='option' so they still
//      contribute to NAV while the UI can hide them separately.
//   3. Uses ON CONFLICT (portfolio_id, asset_id, as_of_date) DO UPDATE
//      instead of delete+insert. The unique constraint already exists
//      in supabase/migrations/20260306211500_initial_portfolio_schema.sql.

import { alpacaGet, ALPACA_TRADING_BASE, toNumeric, toNumericOrNull, classifyAssetClass } from '../alpaca.ts'

export interface PositionsResult {
  positions_seen: number
  positions_upserted: number
  portfolios: number
  symbols: string[]
  options_count: number
}

interface AlpacaPosition {
  symbol: string
  qty: string | number
  cost_basis: string | number
  market_value?: string | number
  asset_class?: string
  [k: string]: unknown
}

export async function runPositions(
  sql: any,
  opts: { portfolioId?: string | null } = {}
): Promise<PositionsResult> {
  const portfolios = await sql`
    select p.id as portfolio_id
    from public.portfolios p
    join public.broker_accounts b on b.id = p.broker_account_id
    where b.broker = 'alpaca'
    ${opts.portfolioId ? sql`and p.id = ${opts.portfolioId}` : sql``}
  `

  if (portfolios.length === 0) {
    return { positions_seen: 0, positions_upserted: 0, portfolios: 0, symbols: [], options_count: 0 }
  }

  const raw = await alpacaGet<AlpacaPosition[]>(ALPACA_TRADING_BASE, '/v2/positions')

  type ParsedPos = {
    symbol: string
    qty: number
    averageCost: number
    marketValue: number | null
    assetClass: string
  }
  const bySymbol = new Map<string, ParsedPos>()
  let optionsCount = 0
  for (const p of raw) {
    const qty = toNumeric(p.qty)
    const costBasis = toNumeric(p.cost_basis)
    // average_cost is per-share; Alpaca's cost_basis is the total.
    const averageCost = qty !== 0 ? costBasis / qty : 0
    const assetClass = classifyAssetClass(p.symbol, p.asset_class)
    if (assetClass === 'option') optionsCount += 1
    bySymbol.set(p.symbol, {
      symbol: p.symbol,
      qty,
      averageCost,
      marketValue: toNumericOrNull(p.market_value),
      assetClass,
    })
  }

  const symbols = Array.from(bySymbol.keys())
  let positionsUpserted = 0

  await sql.begin(async (tx: any) => {
    // Upsert assets with correct asset_class. For existing rows we don't
    // clobber the name column but we do refresh asset_class so options
    // synced before the fix get reclassified.
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

    for (const pr of portfolios) {
      for (const symbol of symbols) {
        const assetId = assetBySymbol.get(symbol)
        if (!assetId) continue
        const pos = bySymbol.get(symbol)!
        await tx`
          insert into public.positions (
            portfolio_id, asset_id, quantity, average_cost, market_value, as_of_date
          ) values (
            ${pr.portfolio_id}, ${assetId}, ${pos.qty}, ${pos.averageCost},
            ${pos.marketValue}, current_date
          )
          on conflict (portfolio_id, asset_id, as_of_date) do update set
            quantity      = excluded.quantity,
            average_cost  = excluded.average_cost,
            market_value  = excluded.market_value,
            updated_at    = now()
        `
        positionsUpserted += 1
      }
    }
  })

  return {
    positions_seen: symbols.length,
    positions_upserted: positionsUpserted,
    portfolios: portfolios.length,
    symbols,
    options_count: optionsCount,
  }
}
