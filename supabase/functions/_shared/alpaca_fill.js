// Normalise one Alpaca FILL activity into the ledger's vocabulary.
//
// Plain JavaScript so the node test suite can import it directly
// (src/lib/alpacaFill.test.mjs); Deno imports it unchanged.
//
// Two traps, both found on Atlas Secondary's first day (2026-09-24):
//
// 1. A NEGATIVE quantity is a reversal, not a buy. A notional order fills a
//    whole-share lot and then a correcting fill with side='buy' and a negative
//    qty (META: +47, then -0.825261546, net 46.174738454 = the broker's own
//    holding). Taking Math.abs(qty) booked the correction as a second buy, so
//    the ledger overstated four names by exactly twice the fractional part.
//    The sign wins over `side`: a negative fill reverses the side it names.
//
// 2. Crypto activities name the PAIR ("BCH/USD") where /v2/positions names the
//    asset without the slash ("BCHUSD"). Two spellings made two assets, so the
//    broker held a name the ledger had never bought and the ledger held one the
//    broker did not - the phantom signature the verdict preflight refuses on.
//    The slash is dropped so both syncs resolve one asset, and the class is
//    'crypto' so the transactions sync does not overwrite the positions sync's
//    classification with 'equity'.

const OCC_RE = /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/
const CRYPTO_PAIR_RE = /^([A-Z0-9]+)\/([A-Z]+)$/

function toNumber(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric value: ${JSON.stringify(v)}`)
  return n
}

export function fillSymbol(raw) {
  const s = typeof raw === 'string' ? raw.trim() : ''
  const pair = CRYPTO_PAIR_RE.exec(s)
  return pair ? { symbol: pair[1] + pair[2], assetClass: 'crypto' }
              : { symbol: s, assetClass: OCC_RE.test(s) ? 'option' : 'equity' }
}

// The established ledger vocabulary ('orderside.buy' / 'orderside.sell');
// vw_position_nav_daily selects buys with `lower(transaction_type) like '%buy%'`.
function sideOf(side) {
  const s = String(side ?? '').toLowerCase()
  if (s.includes('buy')) return 'buy'
  if (s.includes('sell')) return 'sell'
  throw new Error(`Unrecognised activity side: ${JSON.stringify(side)}`)
}

export function normaliseFill(a) {
  const { symbol, assetClass } = fillSymbol(a.symbol)
  // A fill's own quantity, never the order's cum_qty: on a partial fill that
  // is the running total, and recording it as this fill overstates the ledger.
  const raw = a.qty
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
    throw new Error(`Fill ${JSON.stringify(a.id ?? null)} carries no qty`)
  }
  const q = toNumber(raw)
  let side = sideOf(a.side)
  if (q < 0) side = side === 'buy' ? 'sell' : 'buy'
  return {
    symbol,
    assetClass,
    transactionType: 'orderside.' + side,
    quantity: Math.abs(q),
    reversed: q < 0,
  }
}
