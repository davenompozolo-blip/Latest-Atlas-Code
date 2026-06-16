// Opportunities transforms — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOpportunities, opportunitiesRead } from './nexusOpportunitiesCompute.js';

const holdings = [
    { tk: 'KMI', fvGapPct: 35, conviction: 63, valuationTrusted: true, signalTone: 'improving', stale: false },
    { tk: 'PFE', fvGapPct: 40, conviction: 65, valuationTrusted: false, signalTone: 'neutral', stale: false },
    { tk: 'GILD', fvGapPct: 26, conviction: 47, valuationTrusted: false, signalTone: 'neutral', stale: false },
    { tk: 'AVGO', fvGapPct: -31, conviction: 74, valuationTrusted: false, signalTone: 'neutral', stale: false },
    { tk: 'BKR', fvGapPct: -31, conviction: 47, valuationTrusted: true, signalTone: 'deteriorating', stale: false },
    { tk: 'NULLY', fvGapPct: null, conviction: 50, stale: false },     // no valuation → excluded
    { tk: 'STALEY', fvGapPct: 80, conviction: 90, stale: true },        // stale → excluded
];

test('buildOpportunities splits cheap vs rich, sorted by gap', () => {
    const o = buildOpportunities(holdings);
    assert.equal(o.valued, 5);                         // NULLY + STALEY excluded
    assert.deepEqual(o.cheap.map(h => h.tk), ['PFE', 'KMI', 'GILD']);   // +40, +35, +26
    assert.deepEqual(o.rich.map(h => h.tk), ['AVGO', 'BKR']);            // tie -31, stable sort keeps order
    assert.equal(o.cheapCount, 3);
    assert.equal(o.richCount, 2);
});

test('best long favours cheap × convicted × composite-backed', () => {
    const o = buildOpportunities(holdings);
    // PFE +40 untrusted conv65 vs KMI +35 trusted conv63: KMI gets the 1.15 trust bonus.
    // PFE: 40*(0.5+0.325)=33.0 ; KMI: 35*(0.5+0.315)*1.15=32.8 → PFE edges it.
    assert.equal(o.bestLong.tk, 'PFE');
});

test('clearest trim favours rich × unconvicted × deteriorating', () => {
    const o = buildOpportunities(holdings);
    // AVGO -31 conv74 stable vs BKR -31 conv47 deteriorating → BKR wins (lower conv + 1.2 tone).
    assert.equal(o.bestTrim.tk, 'BKR');
});

test('opportunitiesRead names the long and the trim with the why', () => {
    const r = opportunitiesRead(buildOpportunities(holdings));
    assert.equal(r.longTk, 'PFE');
    assert.equal(r.trimTk, 'BKR');
    assert.match(r.text, /Best long: PFE/);
    assert.match(r.text, /Clearest trim: BKR/);
    assert.match(r.text, /deteriorating/);
});

test('no valued names → honest empty read', () => {
    const r = opportunitiesRead(buildOpportunities([{ tk: 'X', fvGapPct: null }]));
    assert.equal(r.longTk, null);
    assert.match(r.text, /No clear valuation edge/);
});

test('winsorised gap: a noisy +150% outlier does not beat cheap × convicted', () => {
    const o = buildOpportunities([
        { tk: 'ABEV', fvGapPct: 149, conviction: 55, valuationTrusted: false, stale: false },
        { tk: 'NVDA', fvGapPct: 61, conviction: 81, valuationTrusted: false, stale: false },
    ]);
    assert.equal(o.bestLong.tk, 'NVDA'); // clamp(149)=60 → 46.5 vs 60 × (0.5+0.405) = 54.3
});
