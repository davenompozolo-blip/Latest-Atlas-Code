// Regime transforms — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regimePlaybook, macroIndicators } from './nexusRegimeCompute.js';

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
    assert.equal(get('Jobless claims').value, '229k');
    assert.equal(get('Jobless claims').delta, '+8k');      // delta scaled to match the value's k units
    assert.equal(get('Jobless claims').deltaTone, 'down'); // inverted: rising claims are bad
    assert.ok(new Set(ind.map(r => r.group)).size >= 4);   // Rates / Inflation / Growth / Stress
});

const spine = [
    { label: 'Technology', sharePct: 37 },   // Reflation punishes
    { label: 'Energy', sharePct: 8 },         // rewards
    { label: 'Financials', sharePct: 7 },     // rewards
    { label: 'Materials', sharePct: 8 },      // rewards
    { label: 'Healthcare', sharePct: 10 },    // neutral
];

// The bookRegimeFit / regimeRead / regimeQuadrant tests were removed with
// their subjects in Phase D (2026-09-10). They asserted the behaviour of the
// retired Growth x Inflation quadrant; keeping them would assert that a
// deleted classification still works.
//
// regimePlaybook is still covered above because NexusTheme reads it -- a
// Phase D3 consumer that is reported rather than translated.
