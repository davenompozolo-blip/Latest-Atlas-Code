import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    heldCountriesBySymbol, inCountry, filterByCountry, bookPointsByDomicile,
    railRanking, coverageSentence, fallbackNote,
} from './nexusBookGeoCompute.js';
import { exposureFrom } from '../../geo/geoCompute.js';

// Rows mirror normaliseRow() output from nexusBookMapCompute.
const rows = [
    { symbol: 'TSM', held: true, weightPct: 3.8 },
    { symbol: 'AMD', held: true, weightPct: 5.0 },
    { symbol: 'EWY', held: true, weightPct: 3.0 },     // a fund: resolver puts it in XX
    { symbol: 'ASX', held: false },                    // candidate domiciled TW
    { symbol: 'NOPE', held: false },                   // candidate with no domicile
];
const domicileBySymbol = new Map([['TSM', 'TW'], ['AMD', 'US'], ['EWY', 'US'], ['ASX', 'TW']]);
const centroids = new Map([['TW', [121, 23.6]], ['US', [-97, 39]]]);
const detail = [
    { symbol: 'TSM', iso2: 'TW', weight: 0.038 },
    { symbol: 'AMD', iso2: 'US', weight: 0.05 },
    { symbol: 'EWY', iso2: 'XX', weight: 0.03 },
];
const ctx = { heldCountries: heldCountriesBySymbol(detail), domicileBySymbol };

test('XX never counts as a country a held name "earns in", but the name stays resolved', () => {
    assert.ok(ctx.heldCountries.has('EWY'), 'resolved -- so its domicile is never consulted');
    assert.equal(ctx.heldCountries.get('EWY').size, 0);
});

test('held names filter on the resolver; candidates on recorded domicile', () => {
    assert.deepEqual(filterByCountry(rows, 'TW', ctx).map((r) => r.symbol), ['TSM', 'ASX']);
    assert.deepEqual(filterByCountry(rows, 'US', ctx).map((r) => r.symbol), ['AMD']);
    // EWY's wrapper is US-registered but the resolver placed it in XX, so it
    // does NOT appear under the United States -- the whole point of the fund rule.
    assert.equal(inCountry(rows[2], 'US', ctx), false);
    assert.equal(filterByCountry(rows, null, ctx).length, rows.length, 'no country = no filter');
});

test('a candidate with no recorded domicile is never placed anywhere', () => {
    for (const iso2 of ['US', 'TW', 'GB']) assert.equal(inCountry(rows[4], iso2, ctx), false);
    const pts = bookPointsByDomicile(rows, domicileBySymbol, centroids);
    assert.equal(pts.unplacedCand, 1);
});

test('points aggregate per domicile, held weight and candidate count apart', () => {
    const { points, unplacedHeld } = bookPointsByDomicile(rows, domicileBySymbol, centroids);
    const us = points.find((p) => p.iso2 === 'US');
    const tw = points.find((p) => p.iso2 === 'TW');
    assert.equal(us.heldCount, 2);
    assert.ok(Math.abs(us.heldWeightPct - 8.0) < 1e-12);
    assert.equal(tw.candCount, 1);
    assert.equal(unplacedHeld, 0);
    assert.equal(points[0].iso2, 'US', 'ordered by held weight');
});

test('the rail ranks by domicile, and says why, while revenue coverage is under the floor', () => {
    const revenue = exposureFrom([{ iso2: 'US', weight: 0.6 }, { iso2: 'XX', weight: 0.4 }]);
    const domicile = exposureFrom([{ iso2: 'US', weight: 0.9 }, { iso2: 'TW', weight: 0.1 }]);
    const r = railRanking({ revenue, domicile, revenueSummary: { book_coverage: 0 }, names: new Map() });
    assert.equal(r.mode, 'domicile');
    assert.deepEqual(r.rows.map((x) => x.iso2), ['US', 'TW']);
    assert.match(r.reason, /withheld: revenue coverage is 0\.0%/);
});

test('above the floor it ranks the gap', () => {
    const revenue = exposureFrom([{ iso2: 'CN', weight: 0.2 }, { iso2: 'US', weight: 0.8, coverage: 0.9 }]);
    const domicile = exposureFrom([{ iso2: 'US', weight: 1 }]);
    const r = railRanking({ revenue, domicile, revenueSummary: { book_coverage: 0.85 }, names: new Map() });
    assert.equal(r.mode, 'gap');
    assert.deepEqual(r.rows.map((x) => x.iso2), ['CN', 'US']);
    assert.ok(r.rows[0].value > 0 && r.rows[1].value < 0);
});

test('a missing basis ranks nothing rather than an empty list standing in for it', () => {
    assert.equal(railRanking({ revenue: null, domicile: null }).mode, 'unavailable');
});

test('the footer names the remainder as a disclosure gap, not as revenue earned nowhere', () => {
    assert.match(coverageSentence({ book_coverage: 0.81 }), /Coverage is 81% .* remaining 19% .* not revenue earned nowhere/);
    assert.match(coverageSentence(null), /unknown/);
});

test('the fallback note counts each kind of fallback, and is absent when there is none', () => {
    assert.match(fallbackNote({ domicile_fallback_count: 48, fund_unresolved_count: 18 }), /48 holdings have .* 18 funds have/);
    assert.equal(fallbackNote({ domicile_fallback_count: 0, fund_unresolved_count: 0 }), null);
});
