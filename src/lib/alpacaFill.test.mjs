// The ledger's reading of an Alpaca FILL. Fixtures are the real activities
// Atlas Secondary produced on 2026-09-24 (supabase/functions/_shared/alpaca_fill.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseFill, fillSymbol } from '../../supabase/functions/_shared/alpaca_fill.js';

const META_LOT = { symbol: 'META', side: 'buy', qty: '47', type: 'fill' };
const META_REVERSAL = { symbol: 'META', side: 'buy', qty: '-0.825261546', type: 'partial_fill' };

function net(fills) {
  return fills.map(normaliseFill)
    .reduce((s, f) => s + (f.transactionType === 'orderside.buy' ? f.quantity : -f.quantity), 0);
}

test('a negative-quantity fill reverses its side', () => {
  const f = normaliseFill(META_REVERSAL);
  assert.equal(f.transactionType, 'orderside.sell');
  assert.equal(f.quantity, 0.825261546);
  assert.equal(f.reversed, true);
});

test('a notional order nets to the broker holding, not lot + |reversal|', () => {
  // Broker reported 46.174738454; Math.abs(qty) gave 47.825261546.
  assert.ok(Math.abs(net([META_LOT, META_REVERSAL]) - 46.174738454) < 1e-9);
});

test('a negative sell fill is a buy', () => {
  assert.equal(normaliseFill({ symbol: 'X', side: 'sell', qty: '-2' }).transactionType, 'orderside.buy');
});

test('ordinary fills are unchanged', () => {
  assert.deepEqual(normaliseFill({ symbol: 'AAPL', side: 'sell', qty: 10 }),
    { symbol: 'AAPL', assetClass: 'equity', transactionType: 'orderside.sell', quantity: 10, reversed: false });
});

test('a crypto pair resolves to the asset /v2/positions reports', () => {
  assert.deepEqual(fillSymbol('BCH/USD'), { symbol: 'BCHUSD', assetClass: 'crypto' });
  assert.equal(normaliseFill({ symbol: 'BCH/USD', side: 'buy', qty: '18.054812727' }).symbol, 'BCHUSD');
});

test('options and plain tickers keep their class', () => {
  assert.equal(fillSymbol('SOXX261016P00500000').assetClass, 'option');
  assert.equal(fillSymbol(' BRK.B ').symbol, 'BRK.B');
});

test('a fill without its own qty refuses; cum_qty is an order total, not this fill', () => {
  assert.throws(() => normaliseFill({ symbol: 'X', side: 'buy', cum_qty: '40.528525' }));
  assert.throws(() => normaliseFill({ symbol: 'X', side: 'buy', qty: '  ' }));
});

test('an unreadable quantity or side refuses rather than guessing', () => {
  assert.throws(() => normaliseFill({ symbol: 'X', side: 'buy', qty: 'abc' }));
  assert.throws(() => normaliseFill({ symbol: 'X', side: 'hold', qty: '1' }));
});
