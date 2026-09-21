// The stale-move gate, browser side. Runs under plain node.
//
// The database now withholds `daily_return_pct` when a name's last bar is
// older than 7 days or it has no bar at all (20260921080000 / 20260921081500).
// This file exists because the 55-file suite passed UNCHANGED across that
// change: every fixture in it supplies a move for every row, so none of them
// can tell a withheld move apart from a zero one. A fixture that never
// withholds cannot detect a withholding bug.
//
// Every fixture below therefore carries at least one withheld row, with
// values chosen so that reading it as 0.00% CHANGES THE ANSWER -- not by a
// rounding step, by a multiple.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weightedMove, withheldSharePct } from '../../lib/weightedMove.js';
import { mapHolding, buildSpine, buildPerformanceGauge } from './nexusLiveCompute.js';
import { buildThemeView, themeDispersion } from './nexusThemeCompute.js';

const acc = { value: r => r.weight_pct, move: r => r.daily_return_pct };

// ── weightedMove ─────────────────────────────────────────────

test('a withheld move is excluded from BOTH numerator and denominator', () => {
    // Naive `|| 0`: (50*4 + 50*0)/100 = +2.0. Correct: (50*4)/50 = +4.0.
    const rows = [
        { symbol: 'AAA', weight_pct: 50, daily_return_pct: 4 },
        { symbol: 'BBB', weight_pct: 50, daily_return_pct: null },
    ];
    const r = weightedMove(rows, acc);
    assert.equal(r.pct, 4, 'must renormalise to the measured weight, not dilute towards zero');
    assert.equal(r.measuredCount, 1);
    assert.equal(r.withheldCount, 1);
    assert.deepEqual(r.withheldSymbols, ['BBB']);
});

test('dilution is the failure mode, and it is large', () => {
    // A 1%-weight name up 50% beside 99% of the book withheld.
    // Naive: +0.5%. Correct: +50%. Two orders of magnitude.
    const r = weightedMove([
        { symbol: 'AAA', weight_pct: 1,  daily_return_pct: 50 },
        { symbol: 'BBB', weight_pct: 99, daily_return_pct: null },
    ], acc);
    assert.equal(r.pct, 50);
    assert.equal(Math.round(withheldSharePct(r, 100)), 99);
});

test('pct is ABSENT from the result when nothing is measurable, not zero', () => {
    const r = weightedMove([
        { symbol: 'AAA', weight_pct: 50, daily_return_pct: null },
        { symbol: 'BBB', weight_pct: 50, daily_return_pct: undefined },
    ], acc);
    // Absent, so a renderer cannot print a number it was never handed --
    // the same construction as nexusReturnBasis.js and the A2 axis panel.
    assert.equal('pct' in r, false, 'the key itself must be missing');
    assert.equal(r.pct, undefined);
    assert.equal(r.withheldCount, 2);
});

test('a genuine 0.00% move is a MEASUREMENT and is counted', () => {
    // The mirror of the rule above: withholding a real zero would be the
    // same class of error in the other direction.
    const r = weightedMove([
        { symbol: 'AAA', weight_pct: 50, daily_return_pct: 0 },
        { symbol: 'BBB', weight_pct: 50, daily_return_pct: 4 },
    ], acc);
    assert.equal(r.pct, 2);
    assert.equal(r.measuredCount, 2);
    assert.equal(r.withheldCount, 0);
});

test('a non-finite move is withheld, never arithmetic', () => {
    const r = weightedMove([
        { symbol: 'AAA', weight_pct: 50, daily_return_pct: NaN },
        { symbol: 'BBB', weight_pct: 50, daily_return_pct: Infinity },
        { symbol: 'CCC', weight_pct: 50, daily_return_pct: 3 },
    ], acc);
    assert.equal(r.pct, 3);
    assert.equal(r.withheldCount, 2);
});

test('both accessors are REQUIRED', () => {
    // Making the argument required is what finds the caller that forgot --
    // the `returnOf` precedent from computeBrinsonAttribution, where a third
    // call site would otherwise have thrown only at runtime.
    assert.throws(() => weightedMove([], {}), TypeError);
    assert.throws(() => weightedMove([], { value: r => r.w }), TypeError);
    assert.throws(() => weightedMove([], { move: r => r.m }), TypeError);
});

test('exclude() withholds a row the move column cannot speak for', () => {
    const r = weightedMove([
        { symbol: 'AAA', weight_pct: 50, daily_return_pct: 4 },
        { symbol: 'BBB', weight_pct: 50, daily_return_pct: 9 },
    ], { ...acc, exclude: row => row.symbol === 'BBB' });
    assert.equal(r.pct, 4);
    assert.deepEqual(r.withheldSymbols, ['BBB']);
});

test('the denominator is the caller’s unit, so market value works too', () => {
    const r = weightedMove([
        { symbol: 'AAA', market_value: 8000, daily_return_pct: 2 },
        { symbol: 'BBB', market_value: 2000, daily_return_pct: null },
    ], { value: h => h.market_value, move: h => h.daily_return_pct });
    assert.equal(r.pct, 2);
    assert.equal(withheldSharePct(r, 10000), 20);
});

// ── mapHolding ─────────────────────────────────────────────────

test('mapHolding leaves todayPct and contribPct null when the feed withheld', () => {
    const [withheld, measured] = [
        mapHolding({ symbol: 'KMTUY', weight_pct: 2.13, daily_return_pct: null }, new Map(), new Set()),
        mapHolding({ symbol: 'NVDA',  weight_pct: 4,    daily_return_pct: 2 }, new Map(), new Set()),
    ];
    assert.equal(withheld.todayPct, null, 'a withheld move must not read as flat');
    assert.equal(withheld.contribPct, null, 'and neither must its contribution');
    assert.equal(measured.todayPct, 2);
    assert.equal(measured.contribPct, 0.08);
});

test('mapHolding keeps a genuine zero move as zero', () => {
    const r = mapHolding({ symbol: 'AAA', weight_pct: 4, daily_return_pct: 0 }, new Map(), new Set());
    assert.equal(r.todayPct, 0);
    assert.equal(r.contribPct, 0);
});

// ── buildSpine ───────────────────────────────────────────────

const spineRows = [
    // Energy: half the bucket withheld. Naive (40*3 + 40*0)/80 = +1.5.
    // Correct (40*3)/40 = +3.0.
    { symbol: 'XLE', sector: 'Energy', theme: 'Energy', weight_pct: 40, daily_return_pct: 3,    var_contribution_pct: 10 },
    { symbol: 'HAL', sector: 'Energy', theme: 'Energy', weight_pct: 40, daily_return_pct: null, var_contribution_pct: 10 },
    // ADRs: the whole bucket withheld.
    { symbol: 'KMTUY', sector: 'Industrials', theme: null, weight_pct: 20, daily_return_pct: null, var_contribution_pct: 5 },
];

test('buildSpine renormalises a partly-withheld bucket', () => {
    const energy = buildSpine(spineRows, new Set(), 'sector').find(g => g.label === 'Energy');
    assert.equal(energy.movePct, 3, 'the withheld half must not halve the move');
    assert.equal(energy.sharePct, 80, 'the bucket still carries its full weight');
    assert.equal(energy.withheldSharePct, 40, 'and reports the share it could not price');
});

test('buildSpine omits movePct entirely for a bucket with nothing measurable', () => {
    const ind = buildSpine(spineRows, new Set(), 'sector').find(g => g.label === 'Industrials');
    assert.equal('movePct' in ind, false, 'absent, not 0.0 -- the bucket did not sit flat');
    assert.equal(ind.sharePct, 20);
    assert.equal(ind.withheldSharePct, 20);
});

test('buildSpine adds no withheldSharePct when the bucket is fully priced', () => {
    const g = buildSpine([
        { symbol: 'A', sector: 'Tech', weight_pct: 10, daily_return_pct: 1, var_contribution_pct: 1 },
    ], new Set(), 'sector')[0];
    assert.equal('withheldSharePct' in g, false);
    assert.equal(g.movePct, 1);
});

// ── buildPerformanceGauge ────────────────────────────────────

test('the performance gauge renormalises and states its cover', () => {
    const g = buildPerformanceGauge([
        { symbol: 'AAA', weight_pct: 60, daily_return_pct: 2, var_contribution_pct: 1 },
        { symbol: 'BBB', weight_pct: 40, daily_return_pct: null, var_contribution_pct: 1 },
    ], { market: [{ symbol: 'SPY', changePct: 1 }] }, new Set());
    // Naive would be (60*2 + 40*0)/100 = +1.2, which reads as underperforming
    // a +1.0% tape. Renormalised it is +2.0, which outperforms. The withheld
    // name flips the verdict, not just the decimal.
    assert.equal(+g.bookPct.toFixed(2), 2);
    assert.ok(g.measuredWeightPct < 100, 'the gauge must say it did not cover the book');
});

// ── theme layer ──────────────────────────────────────────────

const themeHoldings = [
    { tk: 'XLE',   theme: 'Energy', conviction: 60, contribPct: 1.2,  componentVar: 5, fvGapPct: null, read: 'hold' },
    { tk: 'HAL',   theme: 'Energy', conviction: 55, contribPct: null, componentVar: 5, fvGapPct: null, read: 'hold' },
    { tk: 'KMTUY', theme: 'ADRs',   conviction: 50, contribPct: null, componentVar: 2, fvGapPct: null, read: 'hold' },
];

test('a theme with no measurable member carries no contribution at all', () => {
    const rows = buildThemeView(themeHoldings, []);
    const adrs = rows.find(r => r.theme === 'ADRs');
    assert.equal(adrs.contribPct, null, 'not 0.00 -- it contributed an unknown amount');
    assert.equal(adrs.contribWithheldCount, 1);
});

test('a partly-measurable theme sums what it has and says how much it did not', () => {
    const energy = buildThemeView(themeHoldings, []).find(r => r.theme === 'Energy');
    assert.equal(energy.contribPct, 1.2);
    assert.equal(energy.contribWithheldCount, 1);
});

test('dispersion ranks only names that have a move', () => {
    // Every name here is UP, so entering HAL at 0.0 makes it the bottom of
    // the range: the spread becomes 3.0 instead of the true 2.0, and a name
    // with a dark feed is reported as the theme's worst performer. Chosen so
    // the naive version gets a different number, not a different rounding.
    const d = themeDispersion([
        { tk: 'XLE', theme: 'Energy', todayPct: 3 },
        { tk: 'HAL', theme: 'Energy', todayPct: null },
        { tk: 'SLB', theme: 'Energy', todayPct: 1 },
    ]);
    assert.equal(d.Energy.spread, 2, 'a withheld name must not define either end of the range');
    assert.equal(d.Energy.winners.some(w => w.tk === 'HAL'), false);
    assert.equal(d.Energy.losers.some(w => w.tk === 'HAL'), false);
});
