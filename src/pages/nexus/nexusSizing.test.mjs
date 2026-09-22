// Conviction-target sizing — the money math behind the Holdings "Trade"
// column and the order blotter. Pure, so it runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizeTrade, targetWeights, bookNav } from './nexusLiveCompute.js';

test('bookNav derives NAV from the weight identity (weight = |mv|/NAV)', () => {
    const rows = [
        { symbol: 'A', weight_pct: 10, market_value: 1000 },
        { symbol: 'B', weight_pct: 20, market_value: 2000 },
    ];
    assert.equal(bookNav(rows), 10000);
});

test('targetWeights ∝ conviction, normalised to invested weight', () => {
    const rows = [
        { symbol: 'A', weight_pct: 30, conviction_score: 75 },
        { symbol: 'B', weight_pct: 30, conviction_score: 25 },
    ];
    const t = targetWeights(rows); // invested 60, convSum 100 → A 45, B 15
    assert.equal(+t.get('A').toFixed(2), 45);
    assert.equal(+t.get('B').toFixed(2), 15);
});

test('ADD buys the shortfall to target, in shares + $', () => {
    const r = sizeTrade('add', { nav: 100000, price: 50, currentWeightPct: 5, targetWeightPct: 7 });
    assert.equal(r.tradeSide, 'buy');     // drift +2ppt → $2000 → 40sh
    assert.equal(r.tradeShares, 40);
    assert.equal(Math.round(r.tradeUsd), 2000);
});

test('TRIM sells the excess over target', () => {
    const r = sizeTrade('trim', { nav: 100000, price: 40, currentWeightPct: 8, targetWeightPct: 5 });
    assert.equal(r.tradeSide, 'sell');    // drift -3ppt → -$3000 → -75sh
    assert.equal(r.tradeShares, -75);
});

test('ADD already at/above conviction weight → at target, no trade', () => {
    const r = sizeTrade('add', { nav: 100000, price: 50, currentWeightPct: 9, targetWeightPct: 7 });
    assert.equal(r.tradeSide, null);
    assert.equal(r.atTarget, true);
});

test('HOLD / WATCH never trade, whatever the drift', () => {
    assert.equal(sizeTrade('hold', { nav: 1e5, price: 50, currentWeightPct: 5, targetWeightPct: 9 }).tradeSide, null);
    assert.equal(sizeTrade('watch', { nav: 1e5, price: 50, currentWeightPct: 5, targetWeightPct: 1 }).tradeSide, null);
});

test('EXIT closes the full line', () => {
    const r = sizeTrade('exit', { nav: 1e5, price: 50, currentWeightPct: 4, targetWeightPct: 2, currentShares: 80 });
    assert.equal(r.tradeSide, 'sell');
    assert.equal(r.tradeShares, -80);
});

test('no NAV or no price → no trade (never guesses a size)', () => {
    assert.equal(sizeTrade('add', { nav: null, price: 50, currentWeightPct: 5, targetWeightPct: 9 }).tradeSide, null);
    assert.equal(sizeTrade('add', { nav: 1e5, price: 0, currentWeightPct: 5, targetWeightPct: 9 }).tradeSide, null);
});

// ── H-4: a name whose analytics are pending has NO target weight ──────
// Not a target of 0%. The two are opposite instructions: 0% means "the book's
// own conviction model says hold none of this", and that is what `sizeTrade`
// turns into a full exit. A name bought between two matview refreshes arrives
// priced and sized with no conviction on file, and the model has said nothing
// about it at all.

test('targetWeights gives a pending name NO entry, never a zero one', () => {
    const rows = [
        { symbol: 'A', weight_pct: 30, conviction_score: 75 },
        { symbol: 'B', weight_pct: 30, conviction_score: 25 },
        { symbol: 'C', weight_pct: 40, conviction_score: null },   // bought minutes ago
    ];
    const t = targetWeights(rows);
    // `has`, not `get(...) || 0` -- the caller must be able to tell the two apart.
    assert.equal(t.has('C'), false);
    assert.equal(t.get('C'), undefined);
});

test('a pending name does not dilute the targets of the names that are scored', () => {
    const scoredOnly = [
        { symbol: 'A', weight_pct: 30, conviction_score: 75 },
        { symbol: 'B', weight_pct: 30, conviction_score: 25 },
    ];
    const withPending = [...scoredOnly, { symbol: 'C', weight_pct: 40, conviction_score: null }];

    const a = targetWeights(scoredOnly), b = targetWeights(withPending);
    // Identical: C contributes nothing to `invested` and nothing to `convSum`.
    assert.equal(+b.get('A').toFixed(6), +a.get('A').toFixed(6));
    assert.equal(+b.get('B').toFixed(6), +a.get('B').toFixed(6));
    assert.equal(+b.get('A').toFixed(2), 45);
    // The old code counted C's 40ppt in `invested` and 0 in `convSum`, giving
    // A = 75/100 * 100 = 75 -- a target two thirds higher than the model says,
    // manufactured by a name the model never scored.
    assert.notEqual(+b.get('A').toFixed(2), 75);
});

test('a conviction of 0 still gets a target entry -- it is a reading', () => {
    const t = targetWeights([
        { symbol: 'A', weight_pct: 50, conviction_score: 80 },
        { symbol: 'Z', weight_pct: 50, conviction_score: 0 },
    ]);
    assert.equal(t.has('Z'), true);
    assert.equal(t.get('Z'), 0);
    // And Z's weight IS in the denominator, because the model did score it.
    assert.equal(+t.get('A').toFixed(2), 100);
});
