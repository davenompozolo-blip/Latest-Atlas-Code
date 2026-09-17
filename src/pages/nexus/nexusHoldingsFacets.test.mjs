import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    readFacets, signalFacets, sectorOptions, themeOptions,
    applyFilters, isFiltered, READ_ORDER, UNCLASSIFIED,
} from './nexusHoldingsFacets.js';

const h = (tk, read, signal, sector, theme) => ({ tk, read, signal, sector, theme });

// ── read facets ──────────────────────────────────────────────
test('read tiles keep the add→exit spectrum, never re-sort by count', () => {
    const f = readFacets([
        h('A', 'exit'), h('B', 'exit'), h('C', 'exit'),
        h('D', 'add'), h('E', 'hold'),
    ]);
    assert.deepEqual(f.map(x => x.key), ['add', 'hold', 'exit']);
    // Ranking by count would put exit first and destroy the only thing
    // the row's left-to-right order carries.
});

test('a read with no members gets no tile', () => {
    const f = readFacets([h('A', 'add')]);
    assert.deepEqual(f.map(x => x.key), ['add']);
    assert.ok(READ_ORDER.length > 1);
    // An empty tile invites a click that finds nothing, and on a summary
    // row a zero is a claim about the book rather than about a null column.
});

test('every tile carries a blurb, which is most of why the row reads', () => {
    for (const t of readFacets(READ_ORDER.map((r, i) => h('T' + i, r)))) {
        assert.ok(t.blurb && t.blurb.length, t.key + ' has no blurb');
    }
});

test('rows with no read contribute no tile and are not counted', () => {
    const f = readFacets([h('A', 'add'), h('B', null), h('C', '')]);
    assert.deepEqual(f, [{ key: 'add', label: 'add', count: 1, blurb: 'raise the position' }]);
});

// ── signal facets ────────────────────────────────────────────
test('signal tiles are alphabetical, so a price move cannot reorder them', () => {
    const f = signalFacets([
        h('A', 'add', 'Overvalued'), h('B', 'add', 'Overvalued'), h('C', 'add', 'Undervalued'),
    ]);
    assert.deepEqual(f.map(x => x.key), ['Overvalued', 'Undervalued']);
    assert.deepEqual(f.map(x => x.count), [2, 1]);
});

// ── options ──────────────────────────────────────────────────
test('Unclassified is a real bucket and is offered as one', () => {
    const opts = sectorOptions([h('A', 'add', null, 'Technology'), h('B', 'add', null, null)]);
    assert.deepEqual(opts, ['Technology', UNCLASSIFIED]);
});

test('Unclassified is only offered when something is actually unclassified', () => {
    assert.deepEqual(sectorOptions([h('A', 'add', null, 'Energy')]), ['Energy']);
});

test('theme keeps its NULL and is never coalesced to sector', () => {
    const { themes, anyUnmapped } = themeOptions([
        h('A', 'add', null, 'Technology', 'AI infrastructure'),
        h('B', 'add', null, 'Energy', null),
    ]);
    assert.deepEqual(themes, ['AI infrastructure']);
    assert.equal(anyUnmapped, true);
    assert.ok(!themes.includes('Energy'));
});

// ── filtering ────────────────────────────────────────────────
const BOOK = [
    h('AMD', 'add', 'Undervalued', 'Technology', 'AI infrastructure'),
    h('XOM', 'trim', 'Overvalued', 'Energy', null),
    h('PG', 'hold', 'Fair', 'Consumer staples', 'Defensives'),
    h('KMTUY', 'watch', null, null, null),
];

test('search matches on ticker and is case-insensitive', () => {
    assert.deepEqual(applyFilters(BOOK, { query: 'am' }).map(x => x.tk), ['AMD']);
    assert.deepEqual(applyFilters(BOOK, { query: 'XoM' }).map(x => x.tk), ['XOM']);
});

test('read and signal filters are sets and intersect with the rest', () => {
    assert.deepEqual(applyFilters(BOOK, { reads: new Set(['add', 'trim']) }).map(x => x.tk), ['AMD', 'XOM']);
    assert.deepEqual(
        applyFilters(BOOK, { reads: new Set(['add', 'trim']), signals: new Set(['Overvalued']) }).map(x => x.tk),
        ['XOM']);
});

test('UNMAPPED selects exactly the names with no theme', () => {
    assert.deepEqual(applyFilters(BOOK, { theme: 'UNMAPPED' }).map(x => x.tk), ['XOM', 'KMTUY']);
});

test('the Unclassified sector selects a null sector, not a literal string match', () => {
    assert.deepEqual(applyFilters(BOOK, { sector: UNCLASSIFIED }).map(x => x.tk), ['KMTUY']);
    assert.deepEqual(applyFilters(BOOK, { sector: 'Energy' }).map(x => x.tk), ['XOM']);
});

test('an empty filter set does not filter — an empty Set is not "match nothing"', () => {
    assert.equal(applyFilters(BOOK, { reads: new Set(), signals: new Set() }).length, BOOK.length);
});

test('no filter object returns the book unchanged', () => {
    assert.equal(applyFilters(BOOK, null).length, BOOK.length);
    assert.equal(applyFilters(null, {}).length, 0);
});

// ── the clear affordance ─────────────────────────────────────
test('clear appears only when something is actually narrowing the view', () => {
    assert.equal(isFiltered(null), false);
    assert.equal(isFiltered({ theme: 'ALL', sector: 'ALL', query: '   ', reads: new Set() }), false);
    assert.equal(isFiltered({ query: 'am' }), true);
    assert.equal(isFiltered({ sector: 'Energy' }), true);
    assert.equal(isFiltered({ reads: new Set(['add']) }), true);
});
