import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    riskBarometer, heatmapRows, heatIntensity, creditLevels, RISK_BAND, HEAT_CAP_PCT,
} from './nexusCrossAssetCompute.js';
import { ASSET_CLASSES } from '../../lib/marketAssetGroups.js';

const q = (symbol, changePct) => ({ symbol, changePct });
const cred = (hy, ig, nfci) => ({
    hySpreads: hy == null ? [] : [{ value: hy }],
    igSpreads: ig == null ? [] : [{ value: ig }],
    nfci: nfci == null ? [] : [{ value: nfci }],
});

// ── barometer ────────────────────────────────────────────────
test('no inputs reads UNKNOWN — never a default label', () => {
    const b = riskBarometer([], null);
    assert.equal(b.label, 'UNKNOWN');
    assert.equal(b.score, null);
    assert.equal(b.measured, 0);
    // The defect this closes: nexus-page.js rendered the STRING 'RISK-ON'
    // in the top bar, computed from nothing and green forever, while
    // macro-markets.js computed NEUTRAL from the same session's data.
});

test('the reading is reproduced from the shipped weights, not re-invented', () => {
    // SPY up (+1), TLT up (−0.5), HY 3.0 contained (+0.5) → 1/3 = 0.333 > 0.3
    const b = riskBarometer([q('SPY', 0.4), q('TLT', 0.2)], cred(3.0));
    assert.equal(b.measured, 3);
    assert.ok(Math.abs(b.score - 1 / 3) < 1e-12);
    assert.equal(b.label, 'RISK-ON');
});

test('the band is symmetric and a reading inside it is NEUTRAL', () => {
    // SPY up (+1), TLT up (−0.5), HY 4.5 widening (−0.5) → 0/3 = 0
    const b = riskBarometer([q('SPY', 0.4), q('TLT', 0.2)], cred(4.5));
    assert.equal(b.score, 0);
    assert.equal(b.label, 'NEUTRAL');
    assert.ok(Math.abs(b.score) <= RISK_BAND);
});

test('stressed spreads and offered equities read RISK-OFF', () => {
    // SPY down (−1), TLT up (−0.5), HY 6 stressed (−1) → −2.5/3
    const b = riskBarometer([q('SPY', -1.2), q('TLT', 0.5)], cred(6));
    assert.equal(b.label, 'RISK-OFF');
    assert.ok(b.score < -RISK_BAND);
});

test('every component is published so the label can be checked', () => {
    const b = riskBarometer([q('SPY', 0.4), q('TLT', -0.2)], cred(3.0));
    assert.deepEqual(b.components.map(c => c.key), ['spy', 'tlt', 'hy']);
    assert.ok(b.components.every(c => c.says && typeof c.contribution === 'number'));
});

test('TLT contributes INVERSELY — a bid for duration is risk-off', () => {
    const up = riskBarometer([q('TLT', 0.9)], null);
    const dn = riskBarometer([q('TLT', -0.9)], null);
    assert.equal(up.components[0].contribution, -0.5);
    assert.equal(dn.components[0].contribution, 0.5);
    assert.match(up.components[0].says, /flight to safety/);
});

test('a missing input marks the reading partial rather than silently reweighting', () => {
    const b = riskBarometer([q('SPY', 0.4)], null);
    assert.equal(b.measured, 1);
    assert.equal(b.partial, true);
    // A one-component average is still an average; the surface has to be
    // able to say it rested on one input.
});

test('the reading declares itself a heuristic', () => {
    assert.equal(riskBarometer([q('SPY', 0.4)], null).basis, 'heuristic');
    assert.equal(riskBarometer([], null).basis, 'heuristic');
    // Three signs over a +/-0.3 band is not a measured regime. B0's betas
    // and E3's covariance are; this is the cheap signal and says so.
});

test('a flat SPY is treated as offered, matching the shipped comparison', () => {
    // `changePct > 0 ? 1 : -1` puts exactly zero on the negative side. That
    // is the behaviour that shipped and it is preserved deliberately --
    // changing it here would move the published reading under cover of a
    // refactor.
    assert.equal(riskBarometer([q('SPY', 0)], null).components[0].contribution, -1);
});

// ── heatmap ──────────────────────────────────────────────────
test('a symbol with no quote is an ABSENT cell, not a grey zero', () => {
    const { rows, withheld } = heatmapRows([q('SPY', 0.4), q('QQQ', null)], ASSET_CLASSES);
    const us = rows.find(r => r.key === 'us');
    assert.deepEqual(us.cells.map(c => c.symbol), ['SPY']);
    assert.ok(withheld.includes('QQQ'));
    assert.ok(!us.cells.some(c => c.move === 0));
});

test('a class with no quoted members is dropped rather than rendered empty', () => {
    const { rows } = heatmapRows([q('SPY', 0.4)], ASSET_CLASSES);
    assert.deepEqual(rows.map(r => r.key), ['us']);
});

test('intensity saturates at the cap and an absent move has none', () => {
    assert.equal(heatIntensity(0), 0);
    assert.equal(heatIntensity(HEAT_CAP_PCT), 1);
    assert.equal(heatIntensity(-HEAT_CAP_PCT * 4), 1);
    assert.equal(heatIntensity(null), null);
});

// ── credit ───────────────────────────────────────────────────
test('credit reads the latest level of each series and counts what it got', () => {
    const c = creditLevels(cred(2.76, 0.98, -0.56));
    assert.equal(c.hy, 2.76);
    assert.equal(c.ig, 0.98);
    assert.equal(c.nfci, -0.56);
    assert.equal(c.measured, 3);
});

test('a NEGATIVE NFCI is LOOSE, and the panel says which', () => {
    assert.match(creditLevels(cred(3, 1, -0.56)).nfciSays, /loose/);
    assert.match(creditLevels(cred(3, 1, 0.42)).nfciSays, /tight/);
    // The sign is counter-intuitive; printing the number without the
    // direction invites the reader to get it exactly backwards.
});

test('absent credit series give null readings rather than zeros', () => {
    const c = creditLevels(null);
    assert.equal(c.hy, null);
    assert.equal(c.nfciSays, null);
    assert.equal(c.measured, 0);
});
