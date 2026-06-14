// Theme aggregation — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildThemeView, themeLeaders } from './nexusThemeCompute.js';

const holdings = [
    { tk: 'CVX', theme: 'Energy', conviction: 63, contribPct: 0.04, componentVar: 0.7, fvGapPct: 35, read: 'add' },
    { tk: 'HAL', theme: 'Energy', conviction: 47, contribPct: 0.03, componentVar: 1.1, fvGapPct: -31, read: 'trim' },
    { tk: 'KMI', theme: 'Energy', conviction: 70, contribPct: 0.02, componentVar: 0.5, fvGapPct: 12, read: 'add' },
    { tk: 'AAPL', theme: 'Technology', conviction: 80, contribPct: 0.10, componentVar: 2.0, fvGapPct: -2, read: 'hold' },
    { tk: 'NVDA', theme: 'Technology', conviction: 74, contribPct: 0.20, componentVar: 3.0, fvGapPct: null, read: 'watch' },
];
const spine = [
    { theme: 'Technology', sharePct: 30, movePct: 1.5, riskShift: 2, fragility: true },
    { theme: 'Energy', sharePct: 12, movePct: -0.8, riskShift: 0, stale: false },
];

test('buildThemeView rolls holdings up by theme, heaviest share first', () => {
    const rows = buildThemeView(holdings, spine);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].theme, 'Technology'); // 30% share sorts first
    assert.equal(rows[1].theme, 'Energy');
});

test('per-theme aggregates: count, conviction, contrib, var, valuation tilt', () => {
    const energy = buildThemeView(holdings, spine).find(r => r.theme === 'Energy');
    assert.equal(energy.count, 3);
    assert.equal(energy.avgConviction, 60);          // (63+47+70)/3 = 60
    assert.equal(energy.contribPct, 0.09);           // 0.04+0.03+0.02
    assert.equal(energy.varSharePct, 2.3);           // 0.7+1.1+0.5
    assert.equal(energy.avgFvGapPct, 5.3);           // (35-31+12)/3 = 5.33 → cheap-ish but within ±8
    assert.equal(energy.valuationTilt, 'fair');
    assert.equal(energy.sharePct, 12);               // from spine
    assert.equal(energy.movePct, -0.8);
    assert.deepEqual(energy.reads, { add: 2, trim: 1 });
});

test('valuation tilt flags cheap / rich beyond ±8%', () => {
    const cheap = buildThemeView([{ tk: 'X', theme: 'T', conviction: 50, read: 'add', fvGapPct: 20 }], []);
    assert.equal(cheap[0].valuationTilt, 'cheap');
    const rich = buildThemeView([{ tk: 'Y', theme: 'T', conviction: 50, read: 'trim', fvGapPct: -20 }], []);
    assert.equal(rich[0].valuationTilt, 'rich');
});

test('topNames ranked by conviction; null fvGap ignored in the tilt', () => {
    const tech = buildThemeView(holdings, spine).find(r => r.theme === 'Technology');
    assert.deepEqual(tech.topNames, ['AAPL', 'NVDA']);
    assert.equal(tech.avgFvGapPct, -2);   // only AAPL has a gap; NVDA null ignored
    assert.equal(tech.fragility, true);
    assert.equal(tech.riskShift, 2);
});

test('themeLeaders picks heaviest, leader and laggard by move', () => {
    const rows = buildThemeView(holdings, spine);
    const l = themeLeaders(rows);
    assert.equal(l.top.theme, 'Technology');     // heaviest share
    assert.equal(l.leader.theme, 'Technology');  // +1.5%
    assert.equal(l.laggard.theme, 'Energy');     // -0.8%
});
