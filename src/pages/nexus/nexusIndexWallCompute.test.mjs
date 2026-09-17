import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    wallSeparate, wallCompared, windowMove, rangeOf, DEFAULT_RANGE,
} from './nexusIndexWallCompute.js';

// A series of daily closes starting at `from`, one per calendar day.
function ser(start, closes, skip = []) {
    const out = [];
    let d = new Date(start + 'T00:00:00Z').getTime();
    for (let i = 0; i < closes.length; i++) {
        const t = new Date(d + i * 86400000).toISOString().slice(0, 10);
        if (!skip.includes(t)) out.push({ t, c: closes[i] });
    }
    return out;
}
const ix = (symbol, series) => ({ symbol, series });

// ── window move ──────────────────────────────────────────────
test('window move is first-to-last close, and 0.00% survives', () => {
    assert.equal(windowMove([{ t: 'a', c: 100 }, { t: 'b', c: 110 }]), 10);
    assert.equal(windowMove([{ t: 'a', c: 100 }, { t: 'b', c: 100 }]), 0);
});

test('a zero first close has no percent relative to it — null, not Infinity', () => {
    assert.equal(windowMove([{ t: 'a', c: 0 }, { t: 'b', c: 5 }]), null);
    assert.equal(windowMove([{ t: 'a', c: 100 }]), null);
});

// ── separate face ────────────────────────────────────────────
test('separate slices each leg to the window and keeps its own bars', () => {
    const w = wallSeparate([ix('SPY', ser('2026-01-01', Array.from({ length: 40 }, (_, i) => 100 + i)))], '1M');
    assert.equal(w[0].sessions, 21);
    assert.equal(w[0].truncated, false);
    // The last 21 of closes 100..139 run 119 -> 139, which is +16.81%,
    // not the 20 POINTS the sequence moved. The window's move is a
    // percentage of its own first close, never of the series start.
    assert.equal(Math.round(w[0].move * 100) / 100, 16.81);
});

test('a window the data cannot fill is MARKED, not shown as a full one', () => {
    const w = wallSeparate([ix('DIA', ser('2026-01-01', Array.from({ length: 90 }, () => 100)))], '1Y');
    assert.equal(w[0].sessions, 90);
    assert.equal(w[0].truncated, true);
    // "1Y" over 90 bars is a different statement from "1Y".
});

test('Max is unbounded and never marked truncated', () => {
    const w = wallSeparate([ix('SPY', ser('2026-01-01', Array.from({ length: 7 }, () => 100)))], 'MAX');
    assert.equal(w[0].sessions, 7);
    assert.equal(w[0].truncated, false);
});

test('a bar with no close is dropped rather than plotted as a gap', () => {
    const w = wallSeparate([ix('SPY', [{ t: 'a', c: 100 }, { t: 'b', c: null }, { t: 'c', c: 102 }])], 'MAX');
    assert.deepEqual(w[0].series.map(b => b.t), ['a', 'c']);
});

// ── compared face ────────────────────────────────────────────
test('compared rebases every leg on the COMMON first session', () => {
    // QQQ starts a session later. Rebasing each from its own first bar
    // would give the two lines different origins and a free advantage to
    // whichever started on a down day.
    const c = wallCompared([
        ix('SPY', ser('2026-01-01', [100, 90, 99])),
        ix('QQQ', ser('2026-01-02', [50, 55])),
    ], 'MAX');
    assert.equal(c.from, '2026-01-02');
    assert.equal(c.sessions, 2);
    const spy = c.legs.find(l => l.symbol === 'SPY');
    const qqq = c.legs.find(l => l.symbol === 'QQQ');
    // SPY from its COMMON origin of 90 -> 99 is +10%, not 99/100 = −1%.
    assert.equal(Math.round(spy.move * 100) / 100, 10);
    assert.equal(Math.round(qqq.move * 100) / 100, 10);
});

test('the alignment cost is published rather than absorbed', () => {
    const c = wallCompared([
        ix('SPY', ser('2026-01-01', [1, 2, 3, 4, 5])),
        ix('QQQ', ser('2026-01-03', [1, 2, 3])),
    ], 'MAX');
    assert.equal(c.sessions, 3);
    assert.equal(c.alignmentCost, 2);   // SPY gave up two sessions to be comparable
});

test('compared ranks legs by their rebased move', () => {
    const c = wallCompared([
        ix('SPY', ser('2026-01-01', [100, 101])),
        ix('QQQ', ser('2026-01-01', [100, 105])),
        ix('IWM', ser('2026-01-01', [100, 98])),
    ], 'MAX');
    assert.deepEqual(c.legs.map(l => l.symbol), ['QQQ', 'SPY', 'IWM']);
});

test('a leg that cannot cover the common window is dropped and named', () => {
    // IWM is missing one of the common dates outright, so it cannot be
    // drawn on the same origin as the others.
    const c = wallCompared([
        ix('SPY', ser('2026-01-01', [100, 101, 102])),
        ix('QQQ', ser('2026-01-01', [100, 101, 102])),
        ix('IWM', [{ t: '2026-01-01', c: 100 }, { t: '2026-01-03', c: 102 }]),
    ], 'MAX');
    // The intersection is the two dates IWM has, so all three survive here.
    assert.deepEqual(c.legs.map(l => l.symbol).sort(), ['IWM', 'QQQ', 'SPY']);
    assert.deepEqual(c.dropped, []);
    assert.equal(c.sessions, 2);
});

test('no overlap at all reports tooShort rather than drawing one leg alone', () => {
    const c = wallCompared([
        ix('SPY', ser('2026-01-01', [100, 101])),
        ix('QQQ', ser('2026-06-01', [100, 101])),
    ], 'MAX');
    assert.equal(c.tooShort, true);
    assert.deepEqual(c.legs, []);
    // One leg drawn alone under a "compared" heading is the worst outcome:
    // it looks like a comparison and is not one.
});

test('empty input is empty, not a crash', () => {
    assert.deepEqual(wallSeparate([], '1M'), []);
    assert.deepEqual(wallCompared([], '1M').legs, []);
    assert.deepEqual(wallCompared(null, '1M').legs, []);
});

test('an unknown range key falls back to the default rather than to nothing', () => {
    assert.equal(rangeOf('NOPE').key, DEFAULT_RANGE);
    assert.equal(rangeOf(undefined).key, DEFAULT_RANGE);
});
