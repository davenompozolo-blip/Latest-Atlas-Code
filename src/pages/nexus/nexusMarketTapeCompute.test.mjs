import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    sprintSectors, sprintMovers, sprintCapSpectrum, sprintCrossAsset,
    marketBandOf, buildMarketTape, MOVERS_PER_SIDE, STALE_PAYLOAD_MIN,
} from './nexusMarketTapeCompute.js';

const q = (symbol, changePct, name) => ({ symbol, changePct, name, price: 100 });

// ── sectors ──────────────────────────────────────────────────
test('sectors rank by move and band on SIGN, not on position', () => {
    const s = sprintSectors([q('XLE', -2.9, 'Energy'), q('XLK', 1.4, 'Technology'), q('XLF', -0.2, 'Financials')]);
    assert.deepEqual(s.items.map(i => i.symbol), ['XLK', 'XLF', 'XLE']);
    assert.deepEqual(s.items.map(i => i.band), ['up', 'down', 'down']);
});

test('an all-red tape has no LEADING band at all', () => {
    const s = sprintSectors([q('XLE', -2.9), q('XLK', -1.4), q('XLF', -0.2)]);
    const bands = new Set(s.items.map(i => marketBandOf(i).label));
    assert.deepEqual([...bands], ['LAGGING']);
    // The failure this guards: a top-half split would label XLF "LEADING"
    // on a day every sector fell.
});

test('a sector at exactly 0.00% is FLAT, not rounded into a direction', () => {
    const s = sprintSectors([q('XLU', 0)]);
    assert.equal(s.items[0].band, 'flat');
    assert.equal(s.items[0].move, 0);
    assert.equal(marketBandOf(s.items[0]).label, 'FLAT');
});

test('a quote with no change percent is withheld and named, never printed as zero', () => {
    const s = sprintSectors([q('XLK', 1.4), q('XLRE', null), { symbol: 'XLB' }]);
    assert.deepEqual(s.items.map(i => i.symbol), ['XLK']);
    assert.equal(s.withheldCount, 2);
    assert.match(s.withheldReason, /XLRE/);
    assert.match(s.withheldReason, /XLB/);
    assert.ok(!s.items.some(i => i.move === 0));
});

// ── movers ───────────────────────────────────────────────────
test('movers band BEST / WORST and survive an all-green bottom slice', () => {
    // Every name up: the "bottom five" are still gains. A GAINERS/LOSERS
    // band would call a +0.1% day a loss.
    const s = sprintMovers([q('NVDA', 4.1), q('AMD', 3.8)], [q('PG', 0.3), q('KO', 0.1)]);
    const labels = s.items.map(i => marketBandOf(i).label);
    assert.deepEqual(labels, ['BEST', 'BEST', 'WORST', 'WORST']);
    assert.ok(s.items.filter(i => i.band === 'worst').every(i => i.move > 0));
});

test('movers state their universe rather than claiming the market', () => {
    const s = sprintMovers([q('NVDA', 4.1)], [q('PG', -1.2)]);
    assert.match(s.scopeNote, /30 tracked large caps/);
    assert.match(s.scopeNote, /not the whole market/);
});

test('movers cap each side independently', () => {
    const many = Array.from({ length: 9 }, (_, i) => q('S' + i, 9 - i));
    const s = sprintMovers(many, many);
    assert.equal(s.items.filter(i => i.band === 'best').length, MOVERS_PER_SIDE);
    assert.equal(s.items.filter(i => i.band === 'worst').length, MOVERS_PER_SIDE);
});

// ── cap spectrum ─────────────────────────────────────────────
test('the cap spectrum keeps size order and is never re-ranked by move', () => {
    const s = sprintCapSpectrum([q('SPY', -0.4), q('QQQ', 0.9), q('MDY', -1.1), q('IWM', 0.2)]);
    assert.deepEqual(s.items.map(i => i.symbol), ['SPY', 'QQQ', 'MDY', 'IWM']);
    // and carries no band: a frame marker restating its own sprint label
    // is noise where every marker means "the frame just changed".
    assert.ok(s.items.every(i => marketBandOf(i) === null));
    // Sorting by move would read +0.9 / +0.2 / −0.4 / −1.1 and destroy the
    // mega→micro sequence that IS the breadth signal.
});

// ── cross-asset ──────────────────────────────────────────────
test('cross-asset groups from the shared registry and orders by class', () => {
    const s = sprintCrossAsset([q('GLD', 0.6), q('SPY', -0.3), q('TLT', 0.2), q('EEM', -0.1)]);
    assert.deepEqual(s.items.map(i => i.symbol), ['SPY', 'EEM', 'TLT', 'GLD']);
    assert.deepEqual(s.items.map(i => i.bandLabel),
        ['US EQUITIES', 'GLOBAL', 'RATES & CREDIT', 'COMMODITIES & FX']);
});

test('an unregistered symbol is dropped and named, never filed under a class', () => {
    const s = sprintCrossAsset([q('SPY', -0.3), q('XYZ', 1.1)]);
    assert.deepEqual(s.items.map(i => i.symbol), ['SPY']);
    assert.deepEqual(s.droppedSymbols, ['XYZ']);
    // A wrong class reads as a fact about the asset; an absent one does not.
});

test('cross-asset carries the proxy as interpretation, with the ticker as the label', () => {
    const s = sprintCrossAsset([q('EEM', -0.1)]);
    assert.equal(s.items[0].symbol, 'EEM');
    assert.equal(s.items[0].proxiesFor, 'MSCI Emerging Markets');
});

// ── assembly ─────────────────────────────────────────────────
test('an empty sprint is dropped rather than rendered as a bare label', () => {
    const t = buildMarketTape([sprintSectors([]), sprintMovers([q('NVDA', 1)], [])]);
    assert.deepEqual(t.sprints.map(s => s.key), ['movers']);
    assert.equal(t.empty, false);
});

test('no sprints at all is empty, which the surface says differently from a dead feed', () => {
    assert.equal(buildMarketTape([sprintSectors([]), sprintCapSpectrum([])]).empty, true);
});

test('payload age is measured and flagged past the threshold', () => {
    const now = 1_700_000_000_000;
    const fresh = buildMarketTape([sprintSectors([q('XLK', 1)])], { asOfTs: now - 5 * 60000, now });
    assert.equal(fresh.ageMinutes, 5);
    assert.equal(fresh.stale, false);

    const old = buildMarketTape([sprintSectors([q('XLK', 1)])], { asOfTs: now - (STALE_PAYLOAD_MIN + 1) * 60000, now });
    assert.equal(old.stale, true);
});

test('a missing timestamp gives no age rather than an age of zero', () => {
    const t = buildMarketTape([sprintSectors([q('XLK', 1)])], { now: 1_700_000_000_000 });
    assert.equal(t.ageMinutes, null);
    assert.equal(t.stale, false);
    // `?? 0` here would publish "0m old" for a payload of unknown age --
    // the absent-witness failure this codebase records against the
    // positions coherence gate.
});
