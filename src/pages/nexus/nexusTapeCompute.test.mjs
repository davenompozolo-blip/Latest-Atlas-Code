// F-5 tape — pure transforms, runs under plain node.
//
//   node --test src/pages/nexus/nexusTapeCompute.test.mjs
//
// Fixtures deliberately use tickers and group names that do not match the
// live register, so anything hardcoding XLE/SPY/EEM — or assuming that
// `regional` is the thin group — fails here rather than in production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    MIN_FRAME_LEGS, FALLBACK_GROUP, SIGNAL_WINDOWS,
    sprintNames, sprintGroups, sprintSignals, buildTape, fmtPct, moveTone,
} from './nexusTapeCompute.js';

// ── Sprint 1 ─────────────────────────────────────────────────
const HOLDINGS = [
    { tk: 'AAA', today_pct: 3.1, price_days_old: 0, stale: false },
    { tk: 'BBB', today_pct: -2.4, price_days_old: 0, stale: false },
    { tk: 'CCC', today_pct: 0, price_days_old: 0, stale: false },   // a genuine flat session
    { tk: 'DDD', today_pct: 1.2, price_days_old: 1, stale: false },
    { tk: 'EEE', today_pct: null, price_days_old: 179, stale: true }, // gated by the 7-day rule
];

test('names: a NULL move is withheld and named, never ranked and never printed as 0.00%', () => {
    const s = sprintNames(HOLDINGS, 2);
    assert.equal(s.withheldCount, 1);
    assert.deepEqual(s.withheldSymbols, ['EEE']);
    assert.equal(s.measuredCount, 4);
    assert.ok(!s.items.some(i => i.symbol === 'EEE'));
    // The reason is published, so a surface can say why rather than
    // showing a shorter book with nothing to explain it.
    assert.equal(s.withheldReason, 'no current price');
});

test('names: a genuine 0.00% move survives — it is a measurement, not a missing value', () => {
    // The `||` vs `??` trap. CCC moved exactly zero and must be rankable.
    const s = sprintNames(HOLDINGS, 5);
    const ccc = s.items.find(i => i.symbol === 'CCC');
    assert.ok(ccc, 'a flat name must still appear');
    assert.equal(ccc.move, 0);
    assert.equal(s.withheldCount, 1);   // only EEE, not CCC
});

test('names: best and worst never print the same name twice on a short book', () => {
    // 4 measured names, 3 per side — naive slicing would overlap by two.
    const s = sprintNames(HOLDINGS, 3);
    const syms = s.items.map(i => i.symbol);
    assert.equal(new Set(syms).size, syms.length, 'no name may appear on both sides');
});

test('names: ordering is best descending, worst ascending from the bottom', () => {
    const s = sprintNames(HOLDINGS, 2);
    const best = s.items.filter(i => i.side === 'best').map(i => i.symbol);
    const worst = s.items.filter(i => i.side === 'worst').map(i => i.symbol);
    assert.deepEqual(best, ['AAA', 'DDD']);
    assert.deepEqual(worst, ['BBB', 'CCC']);
});

// ── Sprint 2 ─────────────────────────────────────────────────
// Three groups: `wide` has 3 legs, `mid` has 2, `thin` has 1. FALLBACK_GROUP
// is 'index', so the fixture names the fallback group 'index' and puts the
// thin group elsewhere — the fold target is config, not a fixture accident.
const INSTRUMENTS = [
    { symbol: 'S1', tape_group: 'sector', proxies_for: 'a sector' },
    { symbol: 'S2', tape_group: 'sector', proxies_for: 'a sector' },
    { symbol: 'S3', tape_group: 'sector', proxies_for: 'a sector' },
    { symbol: 'I1', tape_group: 'index', proxies_for: 'an index' },
    { symbol: 'I2', tape_group: 'index', proxies_for: 'an index' },
    { symbol: 'R1', tape_group: 'regional', proxies_for: 'a region' },
    { symbol: 'OFF', tape_group: null, proxies_for: 'not on the tape' },
];
const PX = {
    S1: { '2026-09-14': 100, '2026-09-15': 102 },
    S2: { '2026-09-14': 100, '2026-09-15': 99 },
    S3: { '2026-09-14': 50, '2026-09-15': 50 },      // genuine flat
    I1: { '2026-09-14': 200, '2026-09-15': 201 },
    I2: { '2026-09-15': 10 },                         // one bar only
    R1: { '2026-09-14': 40, '2026-09-15': 40.4 },
};

test('groups: a single-leg group is folded into the broad frame, not given a category', () => {
    const s = sprintGroups(INSTRUMENTS, PX);
    assert.ok(!s.frames.includes('regional'), 'one instrument is a data point, not a category');
    assert.deepEqual(s.frames, ['sector', 'index']);
    const r1 = s.items.find(i => i.symbol === 'R1');
    assert.equal(r1.group, FALLBACK_GROUP);
    assert.equal(r1.nativeGroup, 'regional');
    assert.equal(r1.folded, true, 'the fold is recorded so the surface can say it happened');
    assert.deepEqual(s.foldedGroups, ['regional']);
});

test('groups: the fold rule is structural — a second leg earns the frame with no code change', () => {
    // This is the whole argument for MIN_FRAME_LEGS over a carve-out.
    const withSecond = INSTRUMENTS.concat([{ symbol: 'R2', tape_group: 'regional', proxies_for: 'a region' }]);
    const px = Object.assign({}, PX, { R2: { '2026-09-14': 20, '2026-09-15': 20.1 } });
    const s = sprintGroups(withSecond, px);
    assert.ok(s.frames.includes('regional'));
    assert.equal(s.items.find(i => i.symbol === 'R1').folded, false);
    assert.deepEqual(s.foldedGroups, []);
    assert.equal(MIN_FRAME_LEGS, 2);
});

test('groups: a NULL tape_group stays off the tape entirely', () => {
    const s = sprintGroups(INSTRUMENTS, PX);
    assert.ok(!s.items.some(i => i.symbol === 'OFF'));
});

test('groups: a single bar yields no move — never a fabricated flat session', () => {
    const s = sprintGroups(INSTRUMENTS, PX);
    const i2 = s.items.find(i => i.symbol === 'I2');
    assert.equal(i2.move, null, 'one bar cannot express a change');
    // ...while a real unchanged close does yield 0.
    assert.equal(s.items.find(i => i.symbol === 'S3').move, 0);
});

test('groups: freshness is measured against the newest bar on the tape, not wall-clock', () => {
    const px = Object.assign({}, PX, { S2: { '2026-09-10': 100, '2026-09-11': 99 } });
    const s = sprintGroups(INSTRUMENTS, px);
    assert.equal(s.asOf, '2026-09-15');
    assert.equal(s.items.find(i => i.symbol === 'S2').behind, true);
    assert.equal(s.items.find(i => i.symbol === 'S1').behind, false);
});

test('groups: with no fallback frame a thin group is dropped and named, never folded nowhere', () => {
    const only = [
        { symbol: 'S1', tape_group: 'sector' }, { symbol: 'S2', tape_group: 'sector' },
        { symbol: 'R1', tape_group: 'regional' },
    ];
    const s = sprintGroups(only, PX);
    assert.deepEqual(s.frames, ['sector']);
    assert.deepEqual(s.droppedSymbols, ['R1']);
    assert.ok(!s.items.some(i => i.symbol === 'R1'));
});

// ── Sprint 3 ─────────────────────────────────────────────────
function ramp(start, n, step) {
    const out = {};
    for (let i = 0; i < n; i++) {
        const d = new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString().slice(0, 10);
        out[d] = start + i * step;
    }
    return out;
}
const PAIR_PX = { NUM: ramp(100, 40, 1), DEN: ramp(100, 40, 0.5), SPY: ramp(400, 40, 1) };
const PAIRS = [
    { pair_key: 'num_den', numerator_symbol: 'NUM', denominator_symbol: 'DEN' },
    { pair_key: 'orphan', numerator_symbol: 'NUM', denominator_symbol: 'SPY' },
];
const LOADINGS = [
    { pair_key: 'num_den', axis_key: 'ax1', loading: 0.80 },
    { pair_key: 'num_den', axis_key: 'ax2', loading: 0.10 },
    // 'orphan' has no loading row at all — the CPER/GLD case.
];
const AXES = [{ axis_key: 'ax1', label: 'Axis one', pc_rank: 1 }, { axis_key: 'ax2', label: 'Axis two', pc_rank: 2 }];

test('signals: a pair with no axis loading renders as unassigned, never filed under one', () => {
    const s = sprintSignals({ pairs: PAIRS, loadings: LOADINGS, axes: AXES, bySymbol: PAIR_PX });
    const orphan = s.items.find(i => i.pairKey === 'orphan');
    assert.equal(orphan.axisUnassigned, true);
    assert.equal(orphan.axisKey, null);
    assert.equal(orphan.axisLabel, null);
    // ...and an assigned pair carries its axis and the loading's sign.
    const assigned = s.items.find(i => i.pairKey === 'num_den');
    assert.equal(assigned.axisKey, 'ax1');
    assert.equal(assigned.axisLabel, 'Axis one');
});

test('signals: the loading SIGN is carried, so a negative loader cannot read as a positive one', () => {
    // RSP/SPY loads −0.47 on concentration live. A tape tagging it
    // "concentration" with no sign asserts the opposite of the loading,
    // which is the misreading nexusPairsCompute's own header warns about.
    const negLoad = [{ pair_key: 'num_den', axis_key: 'ax1', loading: -0.80 }];
    const neg = sprintSignals({ pairs: [PAIRS[0]], loadings: negLoad, axes: AXES, bySymbol: PAIR_PX });
    assert.equal(neg.items[0].loadingSign, '−');
    const pos = sprintSignals({ pairs: [PAIRS[0]], loadings: LOADINGS, axes: AXES, bySymbol: PAIR_PX });
    assert.equal(pos.items[0].loadingSign, '+');
    // An unassigned pair has no sign to carry rather than a defaulted one.
    const orphan = pos.items.find(i => i.pairKey === 'orphan');
    assert.equal(orphan, undefined);
    const un = sprintSignals({ pairs: [PAIRS[1]], loadings: [], axes: AXES, bySymbol: PAIR_PX });
    assert.equal(un.items[0].loadingSign, null);
});

test('signals: the axis token is the KEY; the sentence label rides on the payload for the title', () => {
    // factor_axes.label is a full sentence and swamps a ticker-sized item.
    const s = sprintSignals({ pairs: [PAIRS[0]], loadings: LOADINGS, axes: AXES, bySymbol: PAIR_PX });
    assert.equal(s.items[0].axisKey, 'ax1');
    assert.equal(s.items[0].axisLabel, 'Axis one');
    // positive_means is carried so orientation is never discarded.
    const withMeans = sprintSignals({
        pairs: [PAIRS[0]], loadings: LOADINGS, bySymbol: PAIR_PX,
        axes: [{ axis_key: 'ax1', label: 'Axis one', pc_rank: 1, positive_means: 'up means risk on' }],
    });
    assert.equal(withMeans.items[0].axisPositiveMeans, 'up means risk on');
});

test('signals: all three windows are produced and a short window is flagged as short', () => {
    const shortPx = { NUM: ramp(100, 4, 1), DEN: ramp(100, 4, 0.5), SPY: ramp(400, 4, 1) };
    const s = sprintSignals({ pairs: [PAIRS[0]], loadings: LOADINGS, axes: AXES, bySymbol: shortPx });
    const m = s.items[0].moves;
    assert.deepEqual(Object.keys(m), SIGNAL_WINDOWS.map(w => w.key));
    assert.equal(m.d.truncated, false, '2 sessions are available');
    assert.equal(m.m.truncated, true, 'a 22-session window over 4 bars is short and says so');
    assert.equal(m.m.sessions, 4);
});

test('signals: the tape reproduces the explorer transform exactly, not an approximation', () => {
    // F2 §3: the tape and the explorer "must never be able to disagree".
    // Recomputing via the explorer's own functions must land on the same
    // number to the bit, because it is the same call.
    const s = sprintSignals({ pairs: [PAIRS[0]], loadings: LOADINGS, axes: AXES, bySymbol: PAIR_PX });
    const dates = Object.keys(PAIR_PX.NUM).sort().slice(-2);
    const r0 = PAIR_PX.NUM[dates[0]] / PAIR_PX.DEN[dates[0]];
    const r1 = PAIR_PX.NUM[dates[1]] / PAIR_PX.DEN[dates[1]];
    assert.equal(s.items[0].moves.d.value, (r1 / r0 - 1) * 100);
});

test('signals: a pair with nothing measurable is dropped, not padded with zeros', () => {
    const s = sprintSignals({ pairs: PAIRS, loadings: LOADINGS, axes: AXES, bySymbol: { NUM: {}, DEN: {}, SPY: {} } });
    assert.equal(s.items.length, 0);
});

// ── Assembly ─────────────────────────────────────────────────
test('tape: an empty sprint is skipped and named, never rendered as a heading over nothing', () => {
    const t = buildTape([
        sprintNames(HOLDINGS, 2),
        sprintGroups([], {}),                                        // no legs at all
        sprintSignals({ pairs: PAIRS, loadings: LOADINGS, axes: AXES, bySymbol: PAIR_PX }),
    ]);
    assert.equal(t.sprintCount, 2, 'a two-sprint tape is legible as two');
    assert.deepEqual(t.skipped, ['groups']);
    assert.deepEqual(t.sprints.map(s => s.key), ['names', 'signals']);
    assert.equal(t.empty, false);
});

test('tape: with nothing at all it reports empty rather than rendering a shell', () => {
    const t = buildTape([sprintNames([], 2), sprintGroups([], {})]);
    assert.equal(t.empty, true);
    assert.equal(t.sprintCount, 0);
});

// ── Formatting ───────────────────────────────────────────────
test('format: absent is absent; zero is zero', () => {
    assert.equal(fmtPct(null), null, 'an absent value must not become a string');
    assert.equal(fmtPct(0), '0.00%');
    assert.equal(fmtPct(1.234), '+1.23%');
    assert.equal(fmtPct(-1.235), '−1.24%');
    assert.equal(moveTone(null), '');
    assert.equal(moveTone(0), '');
    assert.equal(moveTone(0.1), 'tone-up');
    assert.equal(moveTone(-0.1), 'tone-down');
});
