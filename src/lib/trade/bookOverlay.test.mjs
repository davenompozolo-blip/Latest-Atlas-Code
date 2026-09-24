// The universe's "in book" marks come from the ACTIVE account's live book,
// never from the nightly row -- which trade-sync writes from the default
// portfolio. Seen live on Atlas Secondary: the map ringed SNDK, CRWV and MRVL,
// Primary's holdings, as held.

import test from 'node:test';
import assert from 'node:assert/strict';
import { overlayActiveBook, heldSymbols } from './bookOverlay.js';

// Rows exactly as the nightly job stores them: Primary's book baked in.
const STORED = [
    { symbol: 'SNDK', eligible: true, rank: 1, bookState: 'held', heldWeightPct: 4.2 },
    { symbol: 'CRWV', eligible: true, rank: 2, bookState: 'held', heldWeightPct: 3.1 },
    { symbol: 'ARM',  eligible: true, rank: 3, bookState: 'unowned', heldWeightPct: null },
    { symbol: 'CAT',  eligible: true, rank: 4, bookState: 'unowned', heldWeightPct: null },
];

// Secondary's live book.
const SECONDARY = {
    available: true,
    positions: [
        { symbol: 'ARM', marketValue: 20046 },
        { symbol: 'CAT', marketValue: 30000 },
    ],
    account: { equity: 1_000_000 },
};

test('a name only the OTHER account holds is not marked held', () => {
    const out = overlayActiveBook(STORED, SECONDARY);
    const by = Object.fromEntries(out.map((r) => [r.symbol, r]));
    assert.equal(by.SNDK.bookState, 'unowned');
    assert.equal(by.SNDK.heldWeightPct, null, 'no weight carried over from the other book');
    assert.equal(by.CRWV.bookState, 'unowned');
});

test("the active account's holdings are marked held, weighted on its own equity", () => {
    const out = overlayActiveBook(STORED, SECONDARY);
    const by = Object.fromEntries(out.map((r) => [r.symbol, r]));
    assert.equal(by.ARM.bookState, 'held');
    assert.ok(Math.abs(by.ARM.heldWeightPct - 2.0046) < 1e-9);
    assert.equal(by.CAT.heldWeightPct, 3);
});

test('everything that is a fact about the stock is left alone', () => {
    const out = overlayActiveBook(STORED, SECONDARY);
    out.forEach((r, i) => {
        assert.equal(r.rank, STORED[i].rank);
        assert.equal(r.eligible, STORED[i].eligible);
    });
    assert.equal(STORED[0].bookState, 'held', 'input rows are not mutated');
});

test('no equity figure: held stays held, the weight is ABSENT rather than 0', () => {
    const out = overlayActiveBook(STORED, { positions: SECONDARY.positions, account: null });
    const arm = out.find((r) => r.symbol === 'ARM');
    assert.equal(arm.bookState, 'held');
    assert.equal(arm.heldWeightPct, null);
});

test('an empty or unavailable book marks nothing held, whatever the stored row says', () => {
    for (const book of [null, { positions: [], account: { equity: 1 } }]) {
        const out = overlayActiveBook(STORED, book);
        assert.ok(out.every((r) => r.bookState === 'unowned'));
    }
});

test('heldSymbols is the de-duplicated set of symbols in the book', () => {
    assert.deepEqual(heldSymbols({ positions: [{ symbol: 'A' }, { symbol: 'B' }, { symbol: 'A' }] }), ['A', 'B']);
    assert.deepEqual(heldSymbols(null), []);
});
