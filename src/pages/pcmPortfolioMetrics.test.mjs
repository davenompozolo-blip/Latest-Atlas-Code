import test from 'node:test';
import assert from 'node:assert/strict';
import { computePortfolioMetrics } from './pcm-optimizer.js';

// The book PCM was measuring: two names, both with a usable price history.
const POSITIONS = [
    { symbol: 'AAA', market_value: 60000 },
    { symbol: 'BBB', market_value: 40000 },
];

function series(n, step) {
    const out = [];
    let p = 100;
    for (let i = 0; i < n; i++) { p *= 1 + (i % 2 ? -step : step); out.push({ close: p }); }
    return out;
}
const HIST = { AAA: series(120, 0.010), BBB: series(120, 0.004) };

// A settled DAILY book return series: 1% a session, alternating.
const DAILY = Array.from({ length: 180 }, (_, i) => (i % 2 ? -0.01 : 0.01));

// The same book sampled every five minutes, which is what `account_snapshots`
// holds and what the old code differenced. On a random walk a 5-minute return
// is the daily one over sqrt(78), not over 78 — there are ~78 five-minute
// intervals in a session and variance adds, not volatility. Getting that
// wrong is what made the first draft of this fixture assert 8.83 and measure
// 79.5; the code was right and the fixture was not.
const SQRT78 = Math.sqrt(78);
const FIVE_MIN = Array.from({ length: 180 }, (_, i) => (i % 2 ? -0.01 : 0.01) / SQRT78);

test('portfolio vol is annualised from DAILY returns', () => {
    const m = computePortfolioMetrics(POSITIONS, HIST, DAILY);
    // 1% a session -> 0.01 * sqrt(252) ~= 15.9%
    assert.ok(m.portfolioVol != null);
    assert.ok(Math.abs(Number(m.portfolioVol) - 15.9) < 0.5,
        'expected ~15.9%, got ' + m.portfolioVol);
});

test('a five-minute series annualised as daily is understated ~8.8x', () => {
    // This is the defect, held as a test so the magnitude is not folklore:
    // sqrt(252) under-scales an intraday series by sqrt(78).
    const daily = Number(computePortfolioMetrics(POSITIONS, HIST, DAILY).portfolioVol);
    const intra = Number(computePortfolioMetrics(POSITIONS, HIST, FIVE_MIN).portfolioVol);
    const ratio = daily / intra;
    assert.ok(Math.abs(ratio - SQRT78) < 0.2,
        'expected the ratio to be ~sqrt(78)=8.83, got ' + ratio.toFixed(2));
});

test('diversificationRatio divides by portfolio vol, so it inherits the error', () => {
    const good = computePortfolioMetrics(POSITIONS, HIST, DAILY);
    const bad  = computePortfolioMetrics(POSITIONS, HIST, FIVE_MIN);
    assert.ok(good.diversificationRatio != null && bad.diversificationRatio != null);
    // The understated denominator inflates the ratio by the same factor —
    // the page reported the book as far better diversified than it is.
    const inflation = Number(bad.diversificationRatio) / Number(good.diversificationRatio);
    assert.ok(inflation > 5, 'expected a large inflation, got ' + inflation.toFixed(2));
});

test('it takes RETURNS, not equity levels — the substitution cannot be written', () => {
    // Equity rows carry no numeric index, so Number({as_of, equity}) is NaN and
    // every observation is refused rather than silently differenced.
    const levels = Array.from({ length: 180 }, (_, i) => ({ as_of: '2026-01-01', equity: 100 + i }));
    const m = computePortfolioMetrics(POSITIONS, HIST, levels);
    assert.equal(m.portfolioVol, null);
    assert.equal(m.diversificationRatio, null);
});

test('too few observations is absent, never a small number', () => {
    const m = computePortfolioMetrics(POSITIONS, HIST, DAILY.slice(0, 8));
    assert.equal(m.portfolioVol, null);
    // HHI and weighted vol do not depend on the book series and still publish.
    assert.ok(Number(m.riskHHI) > 0);
    assert.ok(m.weightedAvgVol != null);
});

test('an absent series is absent, not zero', () => {
    for (const arg of [undefined, null, []]) {
        const m = computePortfolioMetrics(POSITIONS, HIST, arg);
        assert.equal(m.portfolioVol, null, 'arg=' + String(arg));
        assert.equal(m.diversificationRatio, null);
    }
});

test('non-finite observations are refused, not counted', () => {
    const poisoned = DAILY.slice();
    poisoned[5] = NaN; poisoned[6] = Infinity;
    const clean = Number(computePortfolioMetrics(POSITIONS, HIST, DAILY).portfolioVol);
    const dirty = Number(computePortfolioMetrics(POSITIONS, HIST, poisoned).portfolioVol);
    assert.ok(isFinite(dirty), 'a NaN must not propagate into the published figure');
    assert.ok(Math.abs(clean - dirty) < 0.5);
});
