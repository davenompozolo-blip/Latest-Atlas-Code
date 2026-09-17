import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normaliseRow, isPlaceable, isRankable, placement, extents, bookCentroid,
    quadrantOf, rankCandidates, facetCounts, applyMapFilters, sectorOptions,
    candidateLine, ABSENCE_TEXT,
} from './nexusBookMapCompute.js';

// The fixture mirrors `mv_book_candidate_map`'s ROW SHAPE, flags included.
// is_inverse / is_levered are the matview's columns, derived there from
// measured beta_spy -- the classification belongs to the database and the
// surface must not carry a second copy of it. Deriving them here keeps the
// fixture honest without moving the rule into JS.
const row = (o) => {
    const r = Object.assign({
        symbol: 'X', held: false, rho_to_book: 0.2, vol_annual: 0.3, beta_spy: 1.0,
        measured_weight_pct: 97.3, sector: 'Technology',
    }, o);
    const b = r.beta_spy;
    if (r.is_inverse === undefined) r.is_inverse = b == null ? null : b < 0;
    if (r.is_levered === undefined) r.is_levered = b == null ? null : Math.abs(b) > 1.5;
    return normaliseRow(r);
};

// The real shape: five inverse ETFs topped the unfiltered "most diversifying"
// list on the live universe, and a 3x semiconductor fund topped the vol axis.
const UNIVERSE = [
    row({ symbol: 'AMD', held: true, weight_pct: 6, rho_to_book: 0.31, vol_annual: 0.55, beta_spy: 2.1 }),
    row({ symbol: 'MSFT', held: true, weight_pct: 4, rho_to_book: 0.28, vol_annual: 0.24, beta_spy: 1.0 }),
    row({ symbol: 'SPY', rho_to_book: 0.38, vol_annual: 0.11, beta_spy: 1.0, sector: 'Benchmark' }),
    row({ symbol: 'MA', rho_to_book: -0.023, vol_annual: 0.204, beta_spy: 0.05, sector: 'Financials' }),
    row({ symbol: 'ADSK', rho_to_book: -0.057, vol_annual: 0.51, beta_spy: 0.07 }),
    row({ symbol: 'SH', rho_to_book: -0.376, vol_annual: 0.115, beta_spy: -0.988, sector: 'Other' }),
    row({ symbol: 'QID', rho_to_book: -0.352, vol_annual: 0.387, beta_spy: -3.018, sector: 'Other' }),
    row({ symbol: 'SOXL', rho_to_book: 0.306, vol_annual: 1.483, beta_spy: 8.648, sector: 'Other' }),
    row({ symbol: 'NOBETA', rho_to_book: -0.40, vol_annual: 0.20, beta_spy: null, sector: 'Other' }),
];

test('an inverse ETF is plotted but never ranked', () => {
    const sh = UNIVERSE.find((r) => r.symbol === 'SH');
    assert.equal(isPlaceable(sh), true, 'it belongs on the map');
    assert.equal(isRankable(sh), false, 'it does not belong in a ranking');
    const { ranked } = rankCandidates(UNIVERSE);
    assert.ok(!ranked.some((r) => r.symbol === 'SH'));
});

test('the ranking would otherwise be a leverage screen', () => {
    // Sorted on rho alone, SH (-0.376) and QID (-0.352) lead. Both are
    // negatively correlated BY CONSTRUCTION, which is not a differentiated bet.
    const naive = UNIVERSE.filter((r) => !r.held && isPlaceable(r))
        .slice().sort((a, b) => a.rhoToBook - b.rhoToBook);
    assert.deepEqual(naive.slice(0, 3).map((r) => r.symbol), ['NOBETA', 'SH', 'QID']);

    const { ranked } = rankCandidates(UNIVERSE);
    assert.deepEqual(ranked.map((r) => r.symbol), ['ADSK', 'MA', 'SPY']);
});

test('SH is inverse and NOT levered — the two facts are separate', () => {
    const sh = UNIVERSE.find((r) => r.symbol === 'SH');
    const qid = UNIVERSE.find((r) => r.symbol === 'QID');
    assert.equal(sh.isInverse, true);
    assert.equal(sh.isLevered, false, 'beta -0.988 is a 1x hedge, not leverage');
    assert.equal(qid.isInverse, true);
    assert.equal(qid.isLevered, true);
});

test('a missing beta is not evidence of no leverage', () => {
    const nb = UNIVERSE.find((r) => r.symbol === 'NOBETA');
    assert.equal(nb.isInverse, false, 'the flag is absent, not false-because-measured');
    assert.equal(isRankable(nb), false, 'and it is therefore held out of the ranking');
    const { excludedNoBeta } = rankCandidates(UNIVERSE);
    assert.equal(excludedNoBeta, 1);
});

test('the exclusions are counted and named, not silently dropped', () => {
    const r = rankCandidates(UNIVERSE);
    assert.equal(r.excludedCount, 4);      // SH, QID, SOXL, NOBETA
    assert.equal(r.excludedInverse, 2);
    assert.equal(r.excludedLevered, 2);    // QID, SOXL
    assert.equal(r.eligibleCount, 3);
});

test('one axis is not a point', () => {
    assert.equal(isPlaceable(row({ rho_to_book: 0.2, vol_annual: null })), false);
    assert.equal(isPlaceable(row({ rho_to_book: null, vol_annual: 0.2 })), false);
    assert.equal(isPlaceable(row({ rho_to_book: 0, vol_annual: 0 })), true, 'zero is a measurement');
});

test('an option contract and a dark feed are different absences', () => {
    const rows = [
        row({ symbol: 'SOXX261016P00500000', held: true, weight_pct: 1.2, rho_to_book: null, vol_annual: null, absence_reason: 'option_contract' }),
        row({ symbol: 'IXC', held: true, weight_pct: 0.8, rho_to_book: null, vol_annual: null, absence_reason: 'no_risk_stats' }),
        UNIVERSE[0],
    ];
    const p = placement(rows);
    assert.equal(p.placed.length, 1);
    assert.deepEqual(Object.keys(p.withheldByReason).sort(), ['no_risk_stats', 'option_contract']);
    assert.notEqual(ABSENCE_TEXT.option_contract, ABSENCE_TEXT.no_risk_stats);
    assert.match(ABSENCE_TEXT.option_contract, /expires/);
});

test('the map states how much of the BOOK it is not showing', () => {
    // Quietly dropping a held name makes the map show a smaller book than the
    // one you own, with nothing on screen to say so.
    const rows = [
        row({ symbol: 'IXC', held: true, weight_pct: 0.8, rho_to_book: null, vol_annual: null, absence_reason: 'no_risk_stats' }),
        UNIVERSE[0], UNIVERSE[1],
    ];
    const p = placement(rows);
    assert.deepEqual(p.heldWithheldSymbols, ['IXC']);
    assert.equal(p.heldWithheldWeightPct, 0.8);
});

test('the centroid is weight-weighted, not a mean of names', () => {
    const c = bookCentroid(UNIVERSE);
    assert.equal(c.count, 2);
    // AMD 6%, MSFT 4% -> 0.6/0.4, not 0.5/0.5.
    assert.ok(Math.abs(c.rhoToBook - (0.6 * 0.31 + 0.4 * 0.28)) < 1e-12);
    assert.ok(Math.abs(c.volAnnual - (0.6 * 0.55 + 0.4 * 0.24)) < 1e-12);
    // A plain average of the two names would give a different answer.
    assert.notEqual(c.volAnnual, (0.55 + 0.24) / 2);
});

test('quadrants are relative to the book, not to zero', () => {
    const c = bookCentroid(UNIVERSE);
    // SPY: rho 0.38 > centroid 0.298, vol 0.11 < centroid 0.426.
    assert.equal(quadrantOf(UNIVERSE.find((r) => r.symbol === 'SPY'), c), 'crowding');
    assert.equal(quadrantOf(UNIVERSE.find((r) => r.symbol === 'MA'), c), 'diversifier');
    assert.equal(quadrantOf(UNIVERSE.find((r) => r.symbol === 'SOXL'), c), 'doubling');
    assert.equal(quadrantOf(UNIVERSE.find((r) => r.symbol === 'ADSK'), c), 'hedgeish');
    assert.equal(quadrantOf(UNIVERSE[0], null), null, 'no centroid, no quadrant claim');
});

test('the vol axis starts at a true zero', () => {
    // Otherwise a book of 40-90% vol names renders as though those differences
    // were the whole story.
    const e = extents(UNIVERSE);
    assert.equal(e.y0, 0);
    assert.ok(e.y1 > 1.483);
    assert.ok(e.x0 < -0.376 && e.x1 > 0.38);
});

test('an empty filter set matches everything', () => {
    assert.equal(applyMapFilters(UNIVERSE, { facets: new Set(), sectors: new Set(), search: '' }).length, UNIVERSE.length);
    assert.equal(applyMapFilters(UNIVERSE, {}).length, UNIVERSE.length);
});

test('facets filter and a facet with no members gets no tile', () => {
    const held = applyMapFilters(UNIVERSE, { facets: new Set(['held']) });
    assert.deepEqual(held.map((r) => r.symbol), ['AMD', 'MSFT']);

    const counts = facetCounts(UNIVERSE);
    assert.deepEqual(counts.map((c) => c.key), ['held', 'candidate', 'levered', 'inverse']);
    const noLeverage = facetCounts(UNIVERSE.filter((r) => !r.isLevered && !r.isInverse));
    assert.ok(!noLeverage.some((c) => c.key === 'levered'));
});

test('search matches symbol or name, sectors are counted', () => {
    assert.deepEqual(applyMapFilters(UNIVERSE, { search: 'sox' }).map((r) => r.symbol), ['SOXL']);
    const s = sectorOptions(UNIVERSE);
    assert.equal(s[0].label, 'Other');
    assert.equal(s[0].count, 4);
});

test('the sentence names the denominator when it is not the whole book', () => {
    const c = bookCentroid(UNIVERSE);
    const partial = row({ symbol: 'P', rho_to_book: 0.1, vol_annual: 0.2, measured_weight_pct: 62 });
    assert.match(candidateLine(partial, c), /62% of book weight/);
    const full = row({ symbol: 'F', rho_to_book: 0.1, vol_annual: 0.2, measured_weight_pct: 99.9 });
    assert.ok(!candidateLine(full, c).includes('book weight'));
});

test('the sentence says correlation, and leverage when it applies', () => {
    const c = bookCentroid(UNIVERSE);
    assert.match(candidateLine(UNIVERSE.find((r) => r.symbol === 'SOXL'), c), /plotted but never ranked/);
    assert.match(candidateLine(UNIVERSE.find((r) => r.symbol === 'SH'), c), /by construction/);
    assert.ok(!candidateLine(UNIVERSE.find((r) => r.symbol === 'MA'), c).includes('ranked'));
});

test('an unplaceable row says why rather than rendering a dash', () => {
    const opt = row({ symbol: 'O', rho_to_book: null, vol_annual: null, absence_reason: 'option_contract' });
    assert.match(candidateLine(opt, null), /cannot be placed/);
    assert.match(candidateLine(opt, null), /expires/);
});

test('the flags are READ from the row, never re-derived in the surface', () => {
    // mv_book_candidate_map owns this classification. If a future edit starts
    // computing it from beta here, the two definitions drift silently -- so a
    // row whose flag disagrees with its own beta must come through as stored.
    const contradictory = normaliseRow({
        symbol: 'C', held: false, rho_to_book: 0.1, vol_annual: 0.2,
        beta_spy: -4.0, is_inverse: false, is_levered: false,
    });
    assert.equal(contradictory.isInverse, false);
    assert.equal(contradictory.isLevered, false);
    assert.equal(isRankable(contradictory), true);
});
