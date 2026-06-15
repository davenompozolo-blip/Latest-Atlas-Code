// Regime transforms — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regimePlaybook, macroIndicators, bookRegimeFit, regimeRead, regimeQuadrant } from './nexusRegimeCompute.js';

const macro = {
    regime: { label: 'Reflation', cpiYoY: 4.27 },
    yields: {
        fedFunds: [{ date: 'a', value: 3.70 }, { date: 'b', value: 3.63 }],
        dgs2: [{ date: 'a', value: 4.13 }, { date: 'b', value: 4.05 }],   // -8bp
        dgs10: [{ date: 'a', value: 4.55 }, { date: 'b', value: 4.45 }],  // -10bp
    },
    inflation: { breakeven5y: [{ date: 'a', value: 2.35 }, { date: 'b', value: 2.39 }] },
    growth: { unrate: [{ date: 'a', value: 4.2 }, { date: 'b', value: 4.3 }], claims: [{ date: 'a', value: 221000 }, { date: 'b', value: 229000 }] },
    credit: { hySpreads: [{ date: 'a', value: 2.9 }, { date: 'b', value: 2.78 }] },
    volatility: { vix: [{ date: 'a', value: 22.2 }, { date: 'b', value: 19.44 }] },
};

test('regimePlaybook returns the rewards/punishes for a named regime', () => {
    const pb = regimePlaybook('Reflation');
    assert.ok(pb.rewards.includes('Energy') && pb.rewards.includes('Financials'));
    assert.ok(pb.punishes.includes('Technology'));
    assert.equal(pb.duration, 'short');
    assert.equal(regimePlaybook('Nonsense').duration, 'neutral'); // unknown fallback
});

test('macroIndicators builds grouped rows with levels + deltas + tone', () => {
    const ind = macroIndicators(macro);
    const get = l => ind.find(r => r.label === l);
    assert.equal(get('2Y UST').value, '4.05%');
    assert.equal(get('2Y UST').delta, '−8bp');
    assert.equal(get('2Y UST').deltaTone, 'down');         // yields fell
    assert.equal(get('10Y–2Y curve').value, '+40bp');      // 4.45 - 4.05
    assert.equal(get('CPI YoY').value, '4.3%');
    assert.equal(get('Unemployment').value, '4.3%');
    assert.equal(get('Unemployment').deltaTone, 'down');   // inverted: rising unemployment is bad
    assert.equal(get('VIX').value, '19.4');
    assert.equal(get('VIX').deltaTone, 'up');              // inverted: falling VIX is good
    assert.ok(new Set(ind.map(r => r.group)).size >= 4);   // Rates / Inflation / Growth / Stress
});

const spine = [
    { theme: 'Technology', sharePct: 37 },   // Reflation punishes
    { theme: 'Energy', sharePct: 8 },         // rewards
    { theme: 'Financials', sharePct: 7 },     // rewards
    { theme: 'Materials', sharePct: 8 },      // rewards
    { theme: 'Healthcare', sharePct: 10 },    // neutral
];

test('bookRegimeFit scores the spine against the playbook', () => {
    const fit = bookRegimeFit(spine, 'Reflation');
    // rewards 8+7+8=23, punishes 37 → net (23-37)/70 = -0.2
    assert.equal(fit.alignedWeight, 23);
    assert.equal(fit.misalignedWeight, 37);
    assert.ok(fit.score < 0);
    assert.equal(fit.misaligned[0].theme, 'Technology');
});

test('regimeRead calls misalignment and prescribes a tilt', () => {
    const fit = bookRegimeFit(spine, 'Reflation');
    const r = regimeRead('Reflation', fit);
    assert.equal(r.verdict, 'misaligned');
    assert.match(r.text, /offside the Reflation regime/);
    assert.match(r.text, /Tilt toward/);
});

test('regimeRead flags alignment when the book leans into the rewards', () => {
    const aligned = bookRegimeFit([{ theme: 'Energy', sharePct: 30 }, { theme: 'Financials', sharePct: 20 }, { theme: 'Technology', sharePct: 5 }], 'Reflation');
    const r = regimeRead('Reflation', aligned);
    assert.equal(r.verdict, 'aligned');
    assert.match(r.text, /leans into/);
});

test('regimeQuadrant places each regime in the right corner', () => {
    assert.deepEqual(regimeQuadrant('Reflation'), { growthUp: true, inflationUp: true });
    assert.deepEqual(regimeQuadrant('Goldilocks'), { growthUp: true, inflationUp: false });
    assert.deepEqual(regimeQuadrant('Stagflation'), { growthUp: false, inflationUp: true });
    assert.deepEqual(regimeQuadrant('Deflation'), { growthUp: false, inflationUp: false });
});
