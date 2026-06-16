// Opportunities transforms — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildOpportunities, opportunitiesRead,
    isolatedMerit, portfolioFit, scoreOpportunity, fundability, rankLedger, extractStance, sectorTilts,
} from './nexusOpportunitiesCompute.js';

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

test('v2 portfolioFit: high corr or excess VaR → redundant; low + diversifying → additive', () => {
    assert.equal(portfolioFit({ maxCorrToBook: 0.72, excessVar: 0.1 }), 'redundant');
    assert.equal(portfolioFit({ maxCorrToBook: 0.2, excessVar: -0.3 }), 'additive');
    assert.equal(portfolioFit({ maxCorrToBook: 0.5, excessVar: 0.2 }), 'neutral');
});

test('v2 isolatedMerit winsorises, gates on trust, only counts upside', () => {
    assert.equal(isolatedMerit({ fvGapPct: -20 }), 0);
    assert.ok(isolatedMerit({ fvGapPct: 40, fvTrustworthy: true, conviction: 60 }) > isolatedMerit({ fvGapPct: 40, fvTrustworthy: false, conviction: 60 }));
    assert.equal(isolatedMerit({ fvGapPct: 150, fvTrustworthy: true, conviction: 50 }), isolatedMerit({ fvGapPct: 60, fvTrustworthy: true, conviction: 50 }));
});

test('v2 THE POINT: a redundant cheap name ranks below an additive, less-cheap one', () => {
    const cands = [
        { tk: 'NVDA', fvGapPct: 61, fvTrustworthy: true, conviction: 81, maxCorrToBook: 0.72 },
        { tk: 'PFE', fvGapPct: 36, fvTrustworthy: true, conviction: 66, maxCorrToBook: 0.2, excessVar: -0.2 },
    ];
    const ranked = rankLedger(cands, [{ tk: 'BIDU', fvGapPct: -36, conviction: 30 }]);
    assert.equal(ranked[0].tk, 'PFE');
    assert.equal(ranked[0].fit, 'additive');
    assert.equal(ranked[0].fundFrom, 'BIDU');
    assert.equal(ranked[1].tk, 'NVDA');
    assert.equal(ranked[1].fit, 'redundant');
    assert.equal(ranked[1].fundFrom, null);
});

test('v2 fundability picks the richest, lowest-conviction held name', () => {
    assert.equal(fundability([{ tk: 'AMD', fvGapPct: -28, conviction: 53 }, { tk: 'BIDU', fvGapPct: -36, conviction: 30 }, { tk: 'JNJ', fvGapPct: 5, conviction: 64 }]), 'BIDU');
    assert.equal(fundability([{ tk: 'JNJ', fvGapPct: 5 }]), null);
});

test('v2 extractStance reads prose; sectorTilts pits stance against weight', () => {
    assert.equal(extractStance('a Neutral sector stance pending clarity'), 'neutral');
    assert.equal(extractStance('selective opportunity, constructive setup'), 'cheap');
    assert.equal(extractStance('the sector screens rich and late-cycle'), 'rich');
    const tilts = sectorTilts(
        [{ sector: 'Healthcare', sector_verdict: 'cheap, constructive' }, { sector: 'Technology', sector_verdict: 'rich, late' }],
        { Healthcare: 10, Technology: 37 }, 12);
    assert.equal(tilts.find(t => t.sector === 'Healthcare').tilt, 'up');
    assert.equal(tilts.find(t => t.sector === 'Technology').tilt, 'down');
});
