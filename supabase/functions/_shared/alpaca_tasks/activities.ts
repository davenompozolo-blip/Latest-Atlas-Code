// Activities task: /v2/account/activities -> public.transactions.
//
// Alpaca returns a mixed stream of activity types (FILL, DIV, INT, CSD, CSW,
// ACATC, etc.). We map each to a transaction_type string and upsert using
// the activity id as external_id so re-runs are idempotent.
//
// Non-symbol activities (interest, deposits, withdrawals) are attached to
// the synthetic $CASH asset created by the 20260405 migration.

import { alpacaGet, ALPACA_TRADING_BASE, toNumeric, toNumericOrNull, classifyAssetClass } from '../alpaca.ts'

export interface ActivitiesResult {
  activities_seen: number
  transactions_upserted: number
  unmapped_types: string[]
}

interface AlpacaActivity {
  id: string
  activity_type: string
  transaction_time?: string
  date?: string
  symbol?: string
  side?: string
  qty?: string
  price?: string
  net_amount?: string
  description?: string
  [k: string]: unknown
}

// Map Alpaca activity_type -> our transactions.transaction_type.
// Unmapped types are preserved verbatim (lowercased).
function mapActivityType(type: string, side?: string): string {
  switch (type) {
    case 'FILL':    return (side ?? '').toLowerCase() === 'sell' ? 'sell' : 'buy'
    case 'DIV':     return 'dividend'
    case 'DIVCGL':
    case 'DIVCGS':  return 'capital_gains'
    case 'INT':     return 'interest'
    case 'CSD':     return 'deposit'
    case 'CSW':     return 'withdrawal'
    case 'ACATC':
    case 'ACATS':   return 'transfer'
    case 'FEE':     return 'fee'
    case 'MA':      return 'merger'
    case 'SSO':
    case 'SSP':     return 'stock_split'
    default:        return type.toLowerCase()
  }
}

export async function runActivities(
  sql: any,
  opts: {
    portfolioId?: string | null
    afterDate?: string        // ISO date, default: last 30 days
    pageSize?: number
  } = {}
): Promise<ActivitiesResult> {
  const portfolios = await sql`
    select p.id as portfolio_id
    from public.portfolios p
    join public.broker_accounts b on b.id = p.broker_account_id
    where b.broker = 'alpaca'
    ${opts.portfolioId ? sql`and p.id = ${opts.portfolioId}` : sql``}
  `

  if (portfolios.length === 0) {
    return { activities_seen: 0, transactions_upserted: 0, unmapped_types: [] }
  }

  const after = opts.afterDate
    ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const pageSize = opts.pageSize ?? 100

  // Page through /v2/account/activities using `page_token` (id-based).
  const activities: AlpacaActivity[] = []
  let pageToken: string | undefined = undefined
  for (let page = 0; page < 50; page += 1) {
    const batch = await alpacaGet<AlpacaActivity[]>(
      ALPACA_TRADING_BASE,
      '/v2/account/activities',
      { after, page_size: pageSize, page_token: pageToken, direction: 'asc' }
    )
    if (!batch || batch.length === 0) break
    activities.push(...batch)
    if (batch.length < pageSize) break
    pageToken = batch[batch.length - 1].id
  }

  if (activities.length === 0) {
    return { activities_seen: 0, transactions_upserted: 0, unmapped_types: [] }
  }

  // Resolve CASH asset id (created by migration 20260405).
  const cashRows = await sql<{ id: string }[]>`
    select id from public.assets where symbol = '$CASH' limit 1
  `
  if (cashRows.length === 0) {
    throw new Error('$CASH asset missing — run migration 20260405_alpaca_full_sync.sql')
  }
  const cashAssetId = cashRows[0].id

  // Ensure all traded symbols exist as assets (so FILLs/DIVs have asset_id).
  const tradedSymbols = Array.from(
    new Set(
      activities
        .map((a) => a.symbol)
        .filter((s): s is string => !!s)
    )
  )
  if (tradedSymbols.length > 0) {
    await sql.begin(async (tx: any) => {
      for (const symbol of tradedSymbols) {
        const cls = classifyAssetClass(symbol)
        await tx`
          insert into public.assets (symbol, asset_class)
          values (${symbol}, ${cls})
          on conflict (symbol) do nothing
        `
      }
    })
  }
  const assetRows = await sql<{ id: string; symbol: string }[]>`
    select id, symbol from public.assets where symbol = any(${tradedSymbols})
  `
  const assetBySymbol = new Map<string, string>()
  for (const r of assetRows) assetBySymbol.set(r.symbol, r.id)

  const unmappedTypes = new Set<string>()
  let upserted = 0

  await sql.begin(async (tx: any) => {
    for (const pr of portfolios) {
      for (const act of activities) {
        const txType = mapActivityType(act.activity_type, act.side)
        if (txType === act.activity_type.toLowerCase()) unmappedTypes.add(act.activity_type)

        const assetId = act.symbol ? assetBySymbol.get(act.symbol) ?? cashAssetId : cashAssetId
        const qty = act.qty !== undefined ? toNumeric(act.qty) : (toNumericOrNull(act.net_amount) ?? 0)
        const price = toNumericOrNull(act.price)
        const txDate = act.transaction_time ?? act.date ?? new Date().toISOString()

        await tx`
          insert into public.transactions (
            portfolio_id, asset_id, transaction_type, quantity, price,
            transaction_date, external_id, notes, metadata
          ) values (
            ${pr.portfolio_id}, ${assetId}, ${txType}, ${qty}, ${price},
            ${txDate}, ${act.id}, ${act.description ?? null}, ${sql.json(act)}
          )
          on conflict (portfolio_id, external_id) do update set
            transaction_type = excluded.transaction_type,
            quantity         = excluded.quantity,
            price            = excluded.price,
            transaction_date = excluded.transaction_date,
            notes            = excluded.notes,
            metadata         = excluded.metadata
        `
        upserted += 1
      }
    }
  })

  return {
    activities_seen: activities.length,
    transactions_upserted: upserted,
    unmapped_types: Array.from(unmappedTypes),
  }
}
