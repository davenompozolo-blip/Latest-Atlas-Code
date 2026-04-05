// Prices task: /v2/stocks/bars -> public.price_history for currently held symbols.
//
// Uses the IEX feed (free on paper accounts). Fetches bars for every asset
// that currently appears in public.positions (so we price everything the
// terminal might need). Options are skipped — Alpaca market data API does
// not serve options bars on the free tier.

import { alpacaGet, ALPACA_DATA_BASE, toNumericOrNull, isOptionSymbol } from '../alpaca.ts'

export interface PricesResult {
  symbols_requested: number
  bars_upserted: number
  timeframe: string
  start: string
  end: string
}

interface AlpacaBarsResponse {
  bars: Record<
    string,
    Array<{
      t: string
      o: number
      h: number
      l: number
      c: number
      v: number
      n?: number
      vw?: number
    }>
  >
  next_page_token?: string | null
}

export async function runPrices(
  sql: any,
  opts: {
    lookbackDays?: number  // default 90
    timeframe?: string     // default '1Day'
    feed?: string          // default 'iex'
    batchSize?: number     // default 100 symbols per request
  } = {}
): Promise<PricesResult> {
  const lookbackDays = opts.lookbackDays ?? 90
  const timeframe    = opts.timeframe    ?? '1Day'
  const feed         = opts.feed         ?? 'iex'
  const batchSize    = opts.batchSize    ?? 100

  const end = new Date()
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
  const startIso = start.toISOString()
  const endIso   = end.toISOString()

  // Every symbol currently held across any portfolio, minus options
  // (options bars aren't served on the free data feed).
  const symbolRows = await sql<{ id: string; symbol: string }[]>`
    select distinct a.id, a.symbol
    from public.positions p
    join public.assets a on a.id = p.asset_id
    where a.symbol <> '$CASH'
  `
  const assetBySymbol = new Map<string, string>()
  for (const r of symbolRows) assetBySymbol.set(r.symbol, r.id)

  const symbols = Array.from(assetBySymbol.keys()).filter((s) => !isOptionSymbol(s))
  if (symbols.length === 0) {
    return { symbols_requested: 0, bars_upserted: 0, timeframe, start: startIso, end: endIso }
  }

  // Batch the symbols into comma-separated groups to stay under URL limits.
  let upserted = 0
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    let pageToken: string | undefined = undefined
    let safety = 0
    do {
      if (safety++ > 50) throw new Error('prices task pagination runaway')
      const resp = await alpacaGet<AlpacaBarsResponse>(
        ALPACA_DATA_BASE,
        '/v2/stocks/bars',
        {
          symbols: batch.join(','),
          timeframe,
          start: startIso,
          end: endIso,
          feed,
          adjustment: 'raw',
          limit: 10000,
          page_token: pageToken,
        }
      )
      const bars = resp.bars ?? {}

      await sql.begin(async (tx: any) => {
        for (const [symbol, rows] of Object.entries(bars)) {
          const assetId = assetBySymbol.get(symbol)
          if (!assetId) continue
          for (const bar of rows) {
            const priceDate = bar.t.slice(0, 10)
            await tx`
              insert into public.price_history (
                asset_id, price_date, open, high, low, close,
                adjusted_close, volume, source, interval
              ) values (
                ${assetId}, ${priceDate},
                ${toNumericOrNull(bar.o)}, ${toNumericOrNull(bar.h)},
                ${toNumericOrNull(bar.l)}, ${toNumericOrNull(bar.c)},
                ${toNumericOrNull(bar.c)}, ${bar.v ?? null},
                ${'alpaca_' + feed}, ${timeframe === '1Day' ? '1d' : timeframe}
              )
              on conflict (asset_id, source, interval, price_date) do update set
                open           = excluded.open,
                high           = excluded.high,
                low            = excluded.low,
                close          = excluded.close,
                adjusted_close = excluded.adjusted_close,
                volume         = excluded.volume
            `
            upserted += 1
          }
        }
      })

      pageToken = resp.next_page_token ?? undefined
    } while (pageToken)
  }

  return {
    symbols_requested: symbols.length,
    bars_upserted: upserted,
    timeframe,
    start: startIso,
    end: endIso,
  }
}
