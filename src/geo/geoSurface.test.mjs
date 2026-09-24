import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    LAYERS, availability, toggleLayer, defaultLayers, drawable, layerByKey, UNMET_REASON,
} from './layers/registry.js';
import {
    exposureFrom, coverageState, fillFor, binOf, WEIGHT_BINS, gaps, footerStats, contributorsOf,
    flowsFrom, venuesFrom, makeCuller, parseGeoState, geoQuery, throttle, rankCountries,
    screenByDomicile, isFallback, COVERAGE_FLOOR, legendFor, CHOKEPOINTS, pct,
} from './geoCompute.js';

// ── Fixtures mirror the resolver's ROW SHAPES ──────────────────────────────
// The live book on 2026-09-24 had 0% revenue coverage: 48 issuers falling back
// to domicile and 18 funds in XX. The fixture keeps that shape because it is
// the one the surface ships into, and it is the shape a naive implementation
// gets wrong (publishing fallbacks as findings, or dropping XX).

const revRows = [
    { iso2: 'US', weight: 0.60, coverage: 0, contributor_count: 39, attributable_weight: 0 },
    { iso2: 'XX', weight: 0.22, coverage: 0, contributor_count: 18, attributable_weight: 0 },
    { iso2: 'TW', weight: 0.04, coverage: 0, contributor_count: 1, attributable_weight: 0 },
    { iso2: 'NL', weight: 0.14, coverage: 0, contributor_count: 1, attributable_weight: 0 },
];
const domRows = [
    { iso2: 'US', weight: 0.82, coverage: 1, contributor_count: 57, attributable_weight: 0.82 },
    { iso2: 'TW', weight: 0.04, coverage: 1, contributor_count: 1, attributable_weight: 0.04 },
    { iso2: 'NL', weight: 0.14, coverage: 1, contributor_count: 1, attributable_weight: 0.14 },
];
const revSummary = {
    book_coverage: 0, n_positions: 66, concentration_hhi: 0.3687,
    domicile_fallback_count: 48, domicile_fallback_weight: 0.7759,
    fund_unresolved_count: 18, fund_unresolved_weight: 0.2241,
    no_domicile_count: 0, no_domicile_weight: 0,
};
const domSummary = { book_coverage: 1, n_positions: 66, concentration_hhi: 0.6891, no_domicile_count: 0 };

// ── Registry ───────────────────────────────────────────────────────────────

test('the registry declares the phase-1/2 layers plus the Holdings points, and is frozen', () => {
    assert.deepEqual(LAYERS.map((l) => l.key), [
        'revenue-source', 'domicile', 'active-weight', 'coverage',
        'listing-venues', 'book-positions', 'revenue-flows', 'fx-sensitivity', 'chokepoints',
    ]);
    assert.equal(availability(layerByKey('book-positions'), 'flat', []).available, false,
        'unavailable where the candidate universe is not loaded -- with a reason, never hidden');
    assert.ok(Object.isFrozen(LAYERS));
    assert.ok(LAYERS.every((l) => Object.isFrozen(l) && Object.isFrozen(l.renderers)));
    assert.throws(() => { LAYERS[0].label = 'x'; });
});

test('an unavailable layer carries a reason, never just a disabled flag', () => {
    const active = availability(layerByKey('active-weight'), 'flat', []);
    assert.equal(active.available, false);
    assert.equal(active.reason, UNMET_REASON['benchmark-geo']);
    const fxGlobe = availability(layerByKey('fx-sensitivity'), 'globe', ['fx-sensitivity']);
    assert.equal(fxGlobe.available, false);
    assert.match(fxGlobe.reason, /flat renderer only/);
    assert.equal(availability(layerByKey('active-weight'), 'flat', ['benchmark-geo']).available, true);
});

test('choropleths are one radio set across groups; points and arcs toggle freely', () => {
    let a = ['revenue-source', 'listing-venues'];
    a = toggleLayer(a, 'domicile');
    assert.deepEqual(a, ['listing-venues', 'domicile']);
    // coverage is in the UNIVERSE group and still displaces an exposure layer:
    // it paints the same polygons.
    a = toggleLayer(a, 'coverage');
    assert.deepEqual(a, ['listing-venues', 'coverage']);
    a = toggleLayer(a, 'chokepoints');
    a = toggleLayer(a, 'revenue-flows');
    assert.deepEqual(a.sort(), ['chokepoints', 'coverage', 'listing-venues', 'revenue-flows']);
    assert.deepEqual(toggleLayer(a, 'coverage').includes('coverage'), false);
});

test('the renderer toggle filters the registry rather than forking the tree', () => {
    const on = ['fx-sensitivity', 'chokepoints'];
    assert.deepEqual(drawable(on, 'flat', ['fx-sensitivity']), ['fx-sensitivity', 'chokepoints']);
    assert.deepEqual(drawable(on, 'globe', ['fx-sensitivity']), ['chokepoints']);
    assert.deepEqual(defaultLayers(), ['revenue-source', 'listing-venues']);
});

// ── Exposure and the coverage gate ─────────────────────────────────────────

test('XX is split out, never dropped: weights still account for the whole book', () => {
    const x = exposureFrom(revRows);
    assert.equal(x.map.has('XX'), false);
    assert.equal(x.unallocated, 0.22);
    const total = [...x.map.values()].reduce((s, e) => s + e.weight, 0) + x.unallocated;
    assert.ok(Math.abs(total - 1) < 1e-12);
});

test('below the floor the surface is muted and the sentence names each gap', () => {
    const g = coverageState(revSummary, 'revenue');
    assert.equal(g.muted, true);
    assert.match(g.sentence, /Revenue coverage is 0\.0% of book weight/);
    assert.match(g.sentence, /48 holdings \(77\.6%\) fall back to domicile/);
    assert.match(g.sentence, /18 funds \(22\.4%\) have no look-through/);
    assert.equal(coverageState({ ...revSummary, book_coverage: COVERAGE_FLOOR }, 'revenue').muted, false);
    assert.equal(coverageState(domSummary, 'domicile').muted, false);
    // No summary is not "fine": it is muted and says the resolver did not answer.
    assert.equal(coverageState(null, 'revenue').muted, true);
});

test('muting changes the fill, and "none" is distinct from the lowest bin', () => {
    const e = { weight: 0.2, coverage: 0 };
    assert.notDeepEqual(fillFor(e, { muted: true }), fillFor(e, { muted: false }));
    assert.notDeepEqual(binOf(WEIGHT_BINS, 0).rgb, binOf(WEIGHT_BINS, 0.001).rgb);
    assert.equal(binOf(WEIGHT_BINS, 0.0999).key, 'b3');
    assert.equal(binOf(WEIGHT_BINS, 0.10).key, 'b4');
    assert.equal(fillFor({ weight: 0.2, coverage: 0 }, { scale: 'coverage' })[0], 120);
    assert.equal(legendFor('weight').length, 5);
});

test('the largest gap is WITHHELD under the floor — a fallback gap is not a finding', () => {
    const rev = exposureFrom(revRows);
    const dom = exposureFrom(domRows);
    const g = gaps(rev, dom, 0);
    assert.equal(g.withheld, true);
    assert.equal(g.rows.length, 0);
    assert.match(g.reason, /revenue coverage is 0\.0%/);
    const f = footerStats({ revenue: rev, domicile: dom, revenueSummary: revSummary, domicileSummary: domSummary });
    assert.equal(f.largestGap, null);
    assert.ok(f.gapWithheld);
    // Look-through countries count only ATTRIBUTED weight: zero here, not three.
    assert.equal(f.lookThroughCountries, 0);
    assert.equal(f.domicileCountries, 3);
    // HHI falls back to the basis that has coverage, and says which.
    assert.equal(f.hhiBasis, 'domicile');
    assert.ok(Math.abs(f.hhiTimes1e3 - 689.1) < 1e-9);
});

test('once coverage clears the floor, gaps rank by magnitude', () => {
    const rev = exposureFrom([{ iso2: 'CN', weight: 0.3 }, { iso2: 'US', weight: 0.8 }]);
    const dom = exposureFrom([{ iso2: 'US', weight: 1 }]);
    const g = gaps(rev, dom, 0.9);
    assert.equal(g.withheld, false);
    assert.deepEqual(g.rows.map((r) => r.iso2), ['CN', 'US']);
    assert.ok(Math.abs(g.rows[0].gap - 0.3) < 1e-12);
});

test('ranking excludes XX and orders by weight, ties by code', () => {
    const r = rankCountries(exposureFrom(revRows), new Map([['US', 'United States']]), 3);
    assert.deepEqual(r.map((x) => x.iso2), ['US', 'NL', 'TW']);
    assert.equal(r[0].name, 'United States');
});

// ── Detail rows: contributors, flows, venues ───────────────────────────────

const detail = [
    { asset_id: 'a1', symbol: 'TSM', name: 'Taiwan Semi', instrument_kind: 'issuer', domicile_iso2: 'TW', position_weight: 0.04, iso2: 'TW', weight: 0.024, resolution: 'disclosed', attributable: true },
    { asset_id: 'a1', symbol: 'TSM', name: 'Taiwan Semi', instrument_kind: 'issuer', domicile_iso2: 'TW', position_weight: 0.04, iso2: 'US', weight: 0.006, resolution: 'disclosed', attributable: true },
    { asset_id: 'a1', symbol: 'TSM', name: 'Taiwan Semi', instrument_kind: 'issuer', domicile_iso2: 'TW', position_weight: 0.04, iso2: 'XX', weight: 0.01, resolution: 'disclosed', attributable: false },
    { asset_id: 'a2', symbol: 'AMD', name: 'AMD', instrument_kind: 'issuer', domicile_iso2: 'US', position_weight: 0.05, iso2: 'US', weight: 0.05, resolution: 'domicile_fallback', attributable: false },
    // An ESTIMATE naming a foreign country: not attributable, so no arc. This
    // is the row the flows guard exists for — a fallback cannot reach it,
    // because a fallback is always placed at its own domicile.
    { asset_id: 'a4', symbol: 'SONY', name: 'Sony', instrument_kind: 'issuer', domicile_iso2: 'JP', position_weight: 0.02, iso2: 'KR', weight: 0.02, resolution: 'estimated', attributable: false },
    { asset_id: 'a3', symbol: 'EWY', name: 'iShares Korea', instrument_kind: 'fund', domicile_iso2: 'US', position_weight: 0.03, iso2: 'XX', weight: 0.03, resolution: 'fund_no_lookthrough', attributable: false },
];
const centroids = new Map([['TW', [121, 23.6]], ['US', [-97, 39]], ['KR', [128, 36]], ['JP', [138, 36]]]);

test('contributors sort by weight and carry their resolution', () => {
    const c = contributorsOf(detail, 'US');
    assert.deepEqual(c.map((x) => x.symbol), ['AMD', 'TSM']);
    assert.equal(isFallback(c[0].resolution), true);
    assert.equal(isFallback(c[1].resolution), false);
    assert.deepEqual(contributorsOf(detail, 'XX').map((x) => x.symbol), ['EWY', 'TSM']);
});

test('flows come only from disclosures to another country — a fallback has no flow', () => {
    const f = flowsFrom(detail, centroids);
    assert.equal(f.length, 1);
    assert.deepEqual([f[0].from, f[0].to], ['TW', 'US']);
    assert.ok(Math.abs(f[0].weight - 0.006) < 1e-12);
    // The fund sits in XX and the AMD fallback sits at its own domicile:
    // neither may draw an arc.
    assert.equal(f.some((x) => ['AMD', 'EWY', 'SONY'].some((s) => x.symbols.includes(s))), false);
});

test('venues count each holding once and report what they could not place', () => {
    const v = venuesFrom(detail, new Map([['TSM', 'NYSE'], ['AMD', 'NASDAQ']]));
    assert.deepEqual(v.points.map((p) => [p.code, p.count]), [['NASDAQ', 1], ['NYSE', 1]]);
    assert.equal(v.unplaced, 2);
    assert.ok(Math.abs(v.unplacedWeight - 0.05) < 1e-12);
});

test('chokepoints are context points with valid coordinates', () => {
    assert.ok(CHOKEPOINTS.every((c) => c.lon >= -180 && c.lon <= 180 && c.lat >= -90 && c.lat <= 90));
});

// ── Culling ───────────────────────────────────────────────────────────────

const sq = (id, x, y) => ({ id, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y]]] } });

test('an unchanged visible set returns the IDENTICAL array reference', () => {
    const cull = makeCuller([sq('A', 0, 0), sq('B', 50, 50), sq('C', 100, 0)]);
    const a = cull([-10, -10, 10, 10]);
    const b = cull([-9, -9, 9, 9]);
    assert.deepEqual(a.map((f) => f.id), ['A']);
    assert.equal(a, b, 'same key must return the same reference so deck.gl skips retessellation');
    const c = cull([-10, -10, 60, 60]);
    assert.notEqual(c, a);
    assert.deepEqual(c.map((f) => f.id), ['A', 'B']);
});

test('a world-wide or antimeridian-crossing view culls nothing', () => {
    const feats = [sq('A', 0, 0), sq('B', 170, 0)];
    const cull = makeCuller(feats);
    assert.equal(cull([-200, -80, 200, 80]).length, 2);
    assert.equal(cull([160, -10, 190, 10]).length, 2);
});

// ── URL state ─────────────────────────────────────────────────────────────

test('renderer and layers round-trip through the hash; unknown keys and XX are dropped', () => {
    const known = LAYERS.map((l) => l.key);
    const q = geoQuery({ renderer: 'globe', layers: ['domicile', 'chokepoints'], selected: 'CN' });
    assert.equal(q, '?r=globe&l=domicile,chokepoints&c=CN');
    const s = parseGeoState('#/trade/geographic' + q, known);
    assert.deepEqual(s, { renderer: 'globe', layers: ['domicile', 'chokepoints'], selected: 'CN' });
    assert.deepEqual(parseGeoState('#/trade/geographic?l=bogus,domicile&c=XX', known),
        { renderer: 'flat', layers: ['domicile'], selected: null });
    assert.deepEqual(parseGeoState('#/trade/geographic', known), { renderer: 'flat', layers: null, selected: null });
});

// ── Hover throttle ────────────────────────────────────────────────────────

test('hover is throttled: leading call, then one trailing call with the latest value', () => {
    let t = 0;
    const calls = [];
    const timers = [];
    const fake = { set: (fn, ms) => { timers.push({ fn, at: t + ms }); return timers.length; }, clear: () => {} };
    const h = throttle((x) => calls.push(x), 60, () => t, fake);
    h('US'); t = 10; h('CN'); t = 20; h('JP');
    assert.deepEqual(calls, ['US']);
    t = 60; timers[0].fn();
    assert.deepEqual(calls, ['US', 'JP']);
});

// ── Screen from selection ─────────────────────────────────────────────────

test('screening reads recorded domicile only, ranked', () => {
    const members = [{ symbol: 'B', rank: 2 }, { symbol: 'A', rank: 1 }, { symbol: 'C', rank: 3 }];
    const dom = new Map([['A', 'TW'], ['B', 'TW'], ['C', 'US']]);
    assert.deepEqual(screenByDomicile(members, dom, 'TW').map((m) => m.symbol), ['A', 'B']);
    // A name with no recorded domicile is never screened in by default.
    assert.deepEqual(screenByDomicile([{ symbol: 'Z' }], dom, 'US'), []);
});

test('a dust weight prints as <0.1%, never as 0.0%; a true zero stays 0.0%', () => {
    assert.equal(pct(3.2e-9), '<0.1%');
    assert.equal(pct(0.0004), '<0.1%');
    assert.equal(pct(0.0005), '0.1%');
    assert.equal(pct(0), '0.0%');
    assert.equal(pct(0.004, 0), '<1%');
    assert.equal(pct(null), '—');
});
