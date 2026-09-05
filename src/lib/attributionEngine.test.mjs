// node src/lib/attributionEngine.test.mjs

import assert from 'node:assert/strict';
import {
    computeBrinsonAttribution, BENCHMARKS,
    RETURN_SINCE_ENTRY, RETURN_ON_COST, verdictForEffect,
} from './attributionEngine.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }

const pos = (symbol, sector, mv, sinceEntry, onCost) => ({
    symbol, sector, market_value: mv,
    total_return_pct: sinceEntry,
    unrealised_return_pct: onCost,
});

// ── the accessor is required ──────────────────────────────────
t('the engine refuses to guess a basis', () => {
    // It used to read `total_return_pct || unrealised_return_pct || 0` and
    // tell nobody which it had picked.
    const rows = [pos('A', 'Tech', 100, 10, 5)];
    assert.throws(() => computeBrinsonAttribution(rows, null), /explicit return accessor/);
    assert.throws(() => computeBrinsonAttribution(rows, null, 'since_entry'), /explicit return accessor/);
});

t('the two accessors read different columns and never each other', () => {
    const p = pos('A', 'Tech', 100, 31.68, -4.01);
    assert.equal(RETURN_SINCE_ENTRY(p), 31.68);
    assert.equal(RETURN_ON_COST(p), -4.01);

    // No cross-fallback in either direction.
    assert.equal(RETURN_SINCE_ENTRY(pos('B', 'Tech', 100, null, -4.01)), null);
    assert.equal(RETURN_ON_COST(pos('C', 'Tech', 100, 31.68, null)), null);
});

t('a genuine 0.00% return survives; it is not falsy-swapped', () => {
    // The old `||` chain treated 0 as absent and fell through to the other
    // basis, so a flat position silently reported the wrong measure.
    const p = pos('FLAT', 'Tech', 100, 0, -12);
    assert.equal(RETURN_SINCE_ENTRY(p), 0);
    const b = computeBrinsonAttribution([p, pos('X', 'Health', 100, 4, 4)], null, RETURN_SINCE_ENTRY);
    assert.equal(b.measuredCount, 2);
    assert.equal(b.sectors.find(s => s.sector === 'Tech').portfolioReturn, 0);
});

// ── the live bug: unmeasurable rows were counted as 0% ────────
t('an unmeasurable position is excluded, not counted as flat', () => {
    // KMTUY: no total_return_pct (feed 176 days dark), 1 of 3 Industrials.
    // Counted as 0.00% it dragged the sector both ways at once.
    const rows = [
        pos('IND_A', 'Industrials', 1000, 0.30, 0.30),
        pos('IND_B', 'Industrials', 1000, 0.08, 0.08),
        pos('KMTUY', 'Industrials', 3625, null, null),
    ];
    const b = computeBrinsonAttribution(rows, null, RETURN_SINCE_ENTRY);
    assert.equal(b.measuredCount, 2);
    assert.equal(b.withheldCount, 1);
    assert.deepEqual(b.withheldSymbols, ['KMTUY']);

    const ind = b.sectors.find(s => s.sector === 'Industrials');
    // Benchmark leg is the simple average of the MEASURED two, not of three
    // with a fabricated zero.
    assert.equal(Math.round(ind.benchmarkReturn * 100) / 100, 0.19);
    // And the value-weighted portfolio leg no longer carries KMTUY's $3,625
    // of zero-return weight.
    assert.equal(Math.round(ind.portfolioReturn * 100) / 100, 0.19);
});

t('the withheld count is published so a surface can state its denominator', () => {
    const rows = [
        pos('A', 'Tech', 100, 10, 10),
        pos('B', 'Tech', 100, null, 3),
        pos('C', 'Tech', 100, null, null),
    ];
    const b = computeBrinsonAttribution(rows, null, RETURN_SINCE_ENTRY);
    assert.equal(b.measuredCount, 1);
    assert.equal(b.withheldCount, 2);
    assert.deepEqual(b.withheldSymbols.sort(), ['B', 'C']);
});

t('nothing measurable returns null rather than an empty decomposition', () => {
    const rows = [pos('A', 'Tech', 100, null, null)];
    assert.equal(computeBrinsonAttribution(rows, null, RETURN_SINCE_ENTRY), null);
});

// ── basis actually changes the answer ─────────────────────────
t('choosing the basis changes the decomposition, provably', () => {
    // Real sign-disagreeing names: SNDK +31.68/-4.01, MU +20.73/-6.57,
    // PG +0.94/-3.80. Unequal market values inside Tech, so the value-weighted
    // portfolio leg differs from the equal-weighted benchmark leg and
    // selection is non-trivial — with one name per sector rp == rb and
    // selection is zero on every basis, which proves nothing.
    const rows = [
        pos('SNDK', 'Tech', 3000, 31.68, -4.01),
        pos('MU', 'Tech', 1000, 20.73, -6.57),
        pos('PG', 'Staples', 1000, 0.94, -3.80),
    ];
    const entry = computeBrinsonAttribution(rows, null, RETURN_SINCE_ENTRY);
    const cost = computeBrinsonAttribution(rows, null, RETURN_ON_COST);

    // The book is up since entry and down on cost — opposite verdicts from
    // the same rows, which is exactly why the engine must not pick for the
    // caller.
    assert.ok(entry.portfolioReturn > 0, 'since entry should be positive');
    assert.ok(cost.portfolioReturn < 0, 'on cost should be negative');
    assert.notEqual(entry.totals.selection, cost.totals.selection);
    assert.notEqual(entry.activeReturn, cost.activeReturn);
});

// ── the identity still holds ──────────────────────────────────
t('allocation + selection + interaction = active return', () => {
    const rows = [
        pos('A', 'Tech', 4000, 12, 12),
        pos('B', 'Tech', 1000, -3, -3),
        pos('C', 'Health', 2000, 5, 5),
        pos('D', 'Energy', 3000, -8, -8),
    ];
    const b = computeBrinsonAttribution(rows, null, RETURN_SINCE_ENTRY);
    const sum = b.totals.allocation + b.totals.selection + b.totals.interaction;
    assert.ok(Math.abs(sum - b.activeReturn) < 1e-9,
        'decomposition ' + sum + ' should equal active return ' + b.activeReturn);
});

t('the identity survives a named benchmark too', () => {
    const rows = [
        pos('A', 'Technology', 4000, 12, 12),
        pos('B', 'Health Care', 2000, 5, 5),
        pos('C', 'Energy', 3000, -8, -8),
    ];
    const b = computeBrinsonAttribution(rows, BENCHMARKS.spy.weights, RETURN_SINCE_ENTRY);
    const sum = b.totals.allocation + b.totals.selection + b.totals.interaction;
    assert.ok(Math.abs(sum - b.activeReturn) < 1e-9);
});

// ── unchanged behaviour ───────────────────────────────────────
t('verdictForEffect is untouched by the basis work', () => {
    assert.equal(verdictForEffect(-0.5, null), 'DRAG');
    assert.equal(verdictForEffect(0.5, null), null);
    const trailing = Array(12).fill(0.1);
    assert.equal(verdictForEffect(0.5, trailing), 'WORKING');
    assert.equal(verdictForEffect(0.05, trailing), 'FLAT');
});

t('an empty book is null, not a throw', () => {
    assert.equal(computeBrinsonAttribution([], null, RETURN_SINCE_ENTRY), null);
    assert.equal(computeBrinsonAttribution(null, null, RETURN_SINCE_ENTRY), null);
});

console.log('\n' + passed + '/' + passed + ' passed');
