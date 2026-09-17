import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    bookVsMarket, residualRead, sectorAlignment, latestMarketBeta, RESIDUAL_BAND_PCT,
} from './nexusBookVsMarketCompute.js';

const gauge = (bookPct, benchPct, over) => Object.assign(
    { bookPct, benchPct, measuredWeightPct: 97.9, withheldWeightPct: 2.1 }, over || {});
const beta = (b, significant, over) => Object.assign(
    { beta: b, tStat: significant ? 12.4 : 0.9, significant, nObs: 168, estimatedAt: '2026-09-09T00:00:00Z' }, over || {});

// ── the expectation ──────────────────────────────────────────
test('expected move is beta x benchmark, and the residual is what it leaves', () => {
    const m = bookVsMarket({ gauge: gauge(-0.30, -0.44), marketBeta: beta(1.026, true) });
    assert.equal(m.excessPct, 0.14);          // −0.30 − (−0.44)
    assert.equal(m.expectedPct, -0.45);       // 1.026 × −0.44
    assert.equal(m.residualPct, 0.15);        // −0.30 − (−0.45)
});

test('an INSIGNIFICANT beta produces no expectation and no residual', () => {
    const m = bookVsMarket({ gauge: gauge(-0.30, -0.44), marketBeta: beta(0.04, false) });
    assert.equal(m.expectedPct, null);
    assert.equal(m.residualPct, null);
    assert.equal(m.beta, 0.04);
    assert.equal(m.betaSignificant, false);
    assert.match(m.reason, /not significant/);
    // An insignificant beta times today's move is a number with no
    // evidence behind it -- "an absent number beats a flagged one",
    // applied to a product rather than a coefficient.
});

test('the excess still stands without a beta — it needs no model', () => {
    const m = bookVsMarket({ gauge: gauge(0.70, 0.20), marketBeta: null });
    assert.equal(m.excessPct, 0.5);
    assert.equal(m.expectedPct, null);
    assert.match(m.reason, /no market beta on file/);
});

test('no benchmark is not a zero benchmark', () => {
    const m = bookVsMarket({ gauge: gauge(0.70, null), marketBeta: beta(1.026, true) });
    assert.equal(m.excessPct, null);
    assert.equal(m.residualPct, null);
    assert.match(m.reason, /no benchmark move/);
});

test('no book move says so rather than reading 0.00%', () => {
    const m = bookVsMarket({ gauge: gauge(null, -0.44), marketBeta: beta(1.026, true) });
    assert.equal(m.excessPct, null);
    assert.match(m.reason, /no measurable book move/);
});

test('a book move of exactly 0.00% is a measurement and survives', () => {
    const m = bookVsMarket({ gauge: gauge(0, -0.44), marketBeta: beta(1.026, true) });
    assert.equal(m.bookPct, 0);
    assert.equal(m.excessPct, 0.44);
    assert.equal(m.reason, null);
});

// ── the two bases ────────────────────────────────────────────
test('the live move and the historical beta are named as two bases, not reconciled', () => {
    const m = bookVsMarket({ gauge: gauge(-0.30, -0.44), marketBeta: beta(1.026, true) });
    assert.equal(m.alignment.live, 'today, intraday');
    assert.match(m.alignment.model, /2026-09-09/);
    assert.match(m.alignment.model, /n=168/);
    assert.match(m.alignment.note, /two bases/);
});

test('a beta of unknown vintage says so rather than claiming one', () => {
    const m = bookVsMarket({ gauge: gauge(-0.3, -0.44), marketBeta: beta(1.0, true, { estimatedAt: null, nObs: null }) });
    assert.match(m.alignment.model, /unknown vintage/);
});

// ── the denominator travels ──────────────────────────────────
test('the measured and withheld weights travel with the numbers', () => {
    const m = bookVsMarket({ gauge: gauge(-0.30, -0.44, { measuredWeightPct: 84.2, withheldWeightPct: 15.8 }), marketBeta: beta(1.026, true) });
    assert.equal(m.measuredWeightPct, 84.2);
    assert.equal(m.withheldWeightPct, 15.8);
    // A residual computed on 84% of the book is a residual on 84% of
    // the book, and the surface has to be able to say so.
});

// ── the read ─────────────────────────────────────────────────
test('the residual band is absolute, never a quantile', () => {
    assert.equal(residualRead({ residualPct: RESIDUAL_BAND_PCT }).key, 'explained');
    assert.equal(residualRead({ residualPct: -RESIDUAL_BAND_PCT }).key, 'explained');
    assert.equal(residualRead({ residualPct: RESIDUAL_BAND_PCT + 0.01 }).key, 'ahead');
    assert.equal(residualRead({ residualPct: -RESIDUAL_BAND_PCT - 0.01 }).key, 'behind');
    // A quantile rule forces a fixed share of days to be "unusual"
    // however the book actually behaved.
});

test('no residual gives no read at all', () => {
    assert.equal(residualRead({ residualPct: null }), null);
    assert.equal(residualRead(null), null);
});

// ── sector alignment ─────────────────────────────────────────
const H = (tk, sector, w) => ({ tk, sector, currentWeightPct: w });
const Q = (symbol, changePct) => ({ symbol, changePct });

test('book sectors match ETF labels across vendor spellings', () => {
    const a = sectorAlignment(
        [H('AMD', 'Information Technology', 10), H('PG', 'Cons. Staples', 5)],
        [Q('XLK', 1.0), Q('XLP', -0.5)]);
    assert.deepEqual(a.rows.map(r => r.etf).sort(), ['XLK', 'XLP']);
    assert.equal(a.unmatchedWeightPct, 0);
});

test('an unmatched sector is REPORTED, never silently dropped', () => {
    const a = sectorAlignment(
        [H('AMD', 'Technology', 10), H('KMTUY', null, 2), H('X', 'Widgets', 3)],
        [Q('XLK', 1.0)]);
    assert.equal(a.matchedWeightPct, 10);
    assert.equal(a.unmatchedWeightPct, 5);
    assert.deepEqual(a.unmatched.map(u => u.sector).sort(), ['Unclassified', 'Widgets']);
    // A partial match reads as a data gap rather than as a join that did
    // not land -- this codebase's own finding from the sector/theme overlap.
});

test('a sector with no quote is unmatched, not counted at zero', () => {
    const a = sectorAlignment([H('XOM', 'Energy', 8)], []);
    assert.deepEqual(a.rows, []);
    assert.equal(a.unmatchedWeightPct, 8);
});

test('sector contribution is weight x the SECTOR move, and ranks by magnitude', () => {
    const a = sectorAlignment(
        [H('AMD', 'Technology', 20), H('XOM', 'Energy', 5)],
        [Q('XLK', 1.0), Q('XLE', -3.0)]);
    // Tech: 20% x +1.0 = +0.20 ; Energy: 5% x −3.0 = −0.15
    assert.equal(a.rows[0].etf, 'XLK');
    assert.equal(a.rows[0].sectorContribPct, 0.2);
    assert.equal(a.rows[1].sectorContribPct, -0.15);
});

test('weights in one sector are summed across names', () => {
    const a = sectorAlignment(
        [H('AMD', 'Technology', 4), H('NVDA', 'Technology', 6)],
        [Q('XLK', 2.0)]);
    assert.equal(a.rows.length, 1);
    assert.equal(a.rows[0].weightPct, 10);
});

// ── picking the beta ─────────────────────────────────────────
test('the LATEST estimate set is read, never a mix of two', () => {
    const b = latestMarketBeta([
        { factor_key: 'market', beta: 0.968, significant: true, n_obs: 174, estimated_at: '2026-09-08T00:00:00Z' },
        { factor_key: 'market', beta: 1.026, significant: true, n_obs: 168, estimated_at: '2026-09-09T00:00:00Z' },
        { factor_key: 'dollar', beta: -2.1, significant: true, n_obs: 168, estimated_at: '2026-09-09T00:00:00Z' },
    ]);
    assert.equal(b.beta, 1.026);
    assert.equal(b.nObs, 168);
    // book_factor_betas is append-only and holds B0's set and C3's;
    // mixing them quotes one estimate's market beta beside another's axes.
});

test('no market row gives null rather than falling back to another factor', () => {
    assert.equal(latestMarketBeta([{ factor_key: 'dollar', beta: -2.1, significant: true }]), null);
    assert.equal(latestMarketBeta([]), null);
    assert.equal(latestMarketBeta(null), null);
});

// ── the baseline-gauge refusal ───────────────────────────────
test('a gauge that fell back to the structural baseline is REFUSED', () => {
    const m = bookVsMarket({
        gauge: gauge(-0.9, -1.2, { live: false }),
        marketBeta: beta(1.026, true),
    });
    assert.equal(m.bookPct, null);
    assert.equal(m.excessPct, null);
    assert.equal(m.residualPct, null);
    assert.match(m.reason, /structural baseline/);
    // nexusLive's liveOr falls back to nexusMock's figures. A residual
    // against a fitted beta computed from a MOCK book move is a finding
    // about a book that did not move that way -- and the old code only
    // logged the fallback, which tells the console and tells no consumer.
});

test('an explicitly live gauge is read normally', () => {
    const m = bookVsMarket({ gauge: gauge(-0.30, -0.44, { live: true }), marketBeta: beta(1.026, true) });
    assert.equal(m.residualPct, 0.15);
});

test('a gauge with no live marker at all is still read — absence is not a claim of mockness', () => {
    const m = bookVsMarket({ gauge: gauge(-0.30, -0.44), marketBeta: beta(1.026, true) });
    assert.equal(m.residualPct, 0.15);
});
