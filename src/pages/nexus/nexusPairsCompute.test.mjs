import test from 'node:test';
import assert from 'node:assert/strict';
import {
    assignAxis, groupPairsByAxis, alignedWindow, buildSeries, metricTiles, pairRead,
} from './nexusPairsCompute.js';

// Real factor_axis_loadings rows, read from vdmojjszvvcithuxwexx on
// 2026-09-10. Used so the acceptance claims are checked against the live
// matrix rather than against numbers invented to make a test pass.
const LIVE_LOADINGS = [
    { axis_key: 'cyclical', pair_key: 'xli_xlu', loading: 0.404650680077 },
    { axis_key: 'concentration', pair_key: 'xli_xlu', loading: 0.094804402887 },
    { axis_key: 'dollar', pair_key: 'xli_xlu', loading: -0.065339419395 },

    { axis_key: 'cyclical', pair_key: 'rsp_spy', loading: 0.243456954075 },
    { axis_key: 'concentration', pair_key: 'rsp_spy', loading: -0.465522180568 },
    { axis_key: 'dollar', pair_key: 'rsp_spy', loading: -0.252363932601 },

    { axis_key: 'cyclical', pair_key: 'hyg_tlt', loading: 0.367681146405 },
    { axis_key: 'concentration', pair_key: 'hyg_tlt', loading: 0.046249805437 },
    { axis_key: 'dollar', pair_key: 'hyg_tlt', loading: 0.371227062604 },

    { axis_key: 'cyclical', pair_key: 'qqq_spy', loading: 0.000149097683 },
    { axis_key: 'concentration', pair_key: 'qqq_spy', loading: 0.545876427833 },
    { axis_key: 'dollar', pair_key: 'qqq_spy', loading: -0.276448573686 },
    // cper_gld deliberately absent: it has no loading on any axis.
];

const LIVE_AXES = [
    { axis_key: 'cyclical', label: 'Cyclical risk-on', pc_rank: 1, marginal: false, positive_means: 'risk appetite rising' },
    { axis_key: 'concentration', label: 'Index concentration', pc_rank: 2, marginal: false, positive_means: 'leadership narrowing' },
    { axis_key: 'dollar', label: 'Dollar strength', pc_rank: 3, marginal: true, positive_means: 'dollar strengthening' },
];

const LIVE_PAIRS = [
    { pair_key: 'xli_xlu', numerator_symbol: 'XLI', denominator_symbol: 'XLU', thesis: 'Physical industrial expansion against defensive yield-seeking.', caveats: 'x' },
    { pair_key: 'rsp_spy', numerator_symbol: 'RSP', denominator_symbol: 'SPY', thesis: 'Breadth of participation against mega-cap concentration.', caveats: 'x' },
    { pair_key: 'hyg_tlt', numerator_symbol: 'HYG', denominator_symbol: 'TLT', thesis: 'Appetite for credit risk against the safety of duration.', caveats: 'x' },
    { pair_key: 'qqq_spy', numerator_symbol: 'QQQ', denominator_symbol: 'SPY', thesis: 'Appetite for long-duration growth against broad equity beta.', caveats: 'x' },
    { pair_key: 'cper_gld', numerator_symbol: 'CPER', denominator_symbol: 'GLD', thesis: 'Global physical growth against monetary hedging.', caveats: 'x' },
];

// ── Axis assignment comes from the loadings, never from a map ─────────────

test('acceptance 4: RSP/SPY resolves to concentration at the SIGNED loading −0.47', () => {
    const a = assignAxis(LIVE_LOADINGS.filter(l => l.pair_key === 'rsp_spy'));
    assert.equal(a.axisKey, 'concentration');
    assert.equal(a.loading.toFixed(2), '-0.47');
    assert.ok(a.loading < 0, 'the sign is load-bearing and must survive');
});

test('acceptance 5: CPER/GLD is unassigned with a reason, never blank', () => {
    const a = assignAxis(LIVE_LOADINGS.filter(l => l.pair_key === 'cper_gld'));
    assert.equal(a.unassigned, true);
    assert.equal(a.axisKey, null);
    assert.match(a.reason, /unassigned/);
});

test('assignment picks the largest MAGNITUDE, so a negative winner beats a smaller positive', () => {
    const a = assignAxis(LIVE_LOADINGS.filter(l => l.pair_key === 'rsp_spy'));
    // cyclical is +0.243 and positive; concentration is −0.466. Magnitude wins.
    assert.equal(a.axisKey, 'concentration');
});

test('HYG/TLT is flagged a near tie: 0.3712 dollar against 0.3677 cyclical', () => {
    const a = assignAxis(LIVE_LOADINGS.filter(l => l.pair_key === 'hyg_tlt'));
    assert.equal(a.axisKey, 'dollar');
    assert.equal(a.nearTie, true, 'a ~1% margin must not be presented as a settled assignment');
    assert.equal(a.runnerUp.axisKey, 'cyclical');
});

test('a clear winner is NOT flagged as a near tie', () => {
    const a = assignAxis(LIVE_LOADINGS.filter(l => l.pair_key === 'qqq_spy'));
    assert.equal(a.axisKey, 'concentration');
    assert.equal(a.nearTie, false);
});

test('acceptance 2: grouping is derived from loadings — synthetic axes group correctly', () => {
    // Axis keys that do not exist live. Anything hardcoding the real three
    // fails here.
    const groups = groupPairsByAxis({
        pairs: [{ pair_key: 'aa_bb', numerator_symbol: 'AA', denominator_symbol: 'BB', thesis: 't', caveats: 'c' }],
        loadings: [
            { axis_key: 'zeta', pair_key: 'aa_bb', loading: 0.1 },
            { axis_key: 'omega', pair_key: 'aa_bb', loading: -0.9 },
        ],
        axes: [
            { axis_key: 'zeta', label: 'Zeta', pc_rank: 1 },
            { axis_key: 'omega', label: 'Omega', pc_rank: 2 },
        ],
    });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].axisKey, 'omega');
    assert.equal(groups[0].pairs[0].axis.loading, -0.9);
});

test('groups follow pc_rank, and unassigned pairs get their own group last', () => {
    const groups = groupPairsByAxis({ pairs: LIVE_PAIRS, loadings: LIVE_LOADINGS, axes: LIVE_AXES });
    assert.deepEqual(groups.map(g => g.axisKey), ['cyclical', 'concentration', 'dollar', null]);
    assert.deepEqual(groups[3].pairs.map(p => p.pairKey), ['cper_gld']);
    assert.deepEqual(groups[1].pairs.map(p => p.pairKey), ['qqq_spy', 'rsp_spy']);
});

test('the pair carries its thesis through as `measures`', () => {
    const groups = groupPairsByAxis({ pairs: LIVE_PAIRS, loadings: LIVE_LOADINGS, axes: LIVE_AXES });
    const rsp = groups[1].pairs.find(p => p.pairKey === 'rsp_spy');
    assert.match(rsp.measures, /Breadth of participation/);
});

// ── Alignment and series ─────────────────────────────────────────────────

const mk = (dates, vals) => dates.reduce((m, d, i) => (m[d] = vals[i], m), {});
const D = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];

test('a session missing from ANY of the three series is dropped from all', () => {
    const win = alignedWindow({
        bySymbol: {
            AA: mk(D, [100, 101, 102, 103]),
            BB: mk(['2026-09-01', '2026-09-03', '2026-09-04'], [50, 51, 52]),
            SPY: mk(D, [400, 401, 402, 403]),
        },
        numerator: 'AA', denominator: 'BB', benchmark: 'SPY', sessions: 60,
    });
    assert.deepEqual(win.dates, ['2026-09-01', '2026-09-03', '2026-09-04']);
    assert.equal(win.num.length, 3);
    assert.equal(win.truncated, true, 'a short window must be legible as short');
});

test('all four lines rebase to exactly 100 at the window start', () => {
    const win = alignedWindow({
        bySymbol: { AA: mk(D, [10, 11, 12, 13]), BB: mk(D, [5, 5, 5, 5]), SPY: mk(D, [400, 400, 400, 400]) },
        numerator: 'AA', denominator: 'BB', benchmark: 'SPY', sessions: 60,
    });
    const s = buildSeries(win);
    for (const k of ['numRebased', 'denRebased', 'benchRebased', 'ratioRebased']) {
        assert.equal(s[k][0], 100, k + ' must start at 100');
    }
});

test('the ratio equals the rebased legs divided — the two constructions agree', () => {
    const win = alignedWindow({
        bySymbol: { AA: mk(D, [10, 12, 9, 14]), BB: mk(D, [5, 5.5, 5.2, 5.1]), SPY: mk(D, [400, 402, 398, 405]) },
        numerator: 'AA', denominator: 'BB', benchmark: 'SPY', sessions: 60,
    });
    const s = buildSeries(win);
    s.ratioRebased.forEach((v, i) => {
        const viaLegs = (s.numRebased[i] / s.denRebased[i]) * 100;
        assert.ok(Math.abs(v - viaLegs) < 1e-9, 'ratio construction must be basis-independent');
    });
});

// ── The read: all three market-relation cases (§3.5 / acceptance 6) ───────

function readFor(numEnd, denEnd, benchEnd) {
    const win = alignedWindow({
        bySymbol: {
            AA: mk(D, [100, 100, 100, numEnd]),
            BB: mk(D, [100, 100, 100, denEnd]),
            SPY: mk(D, [100, 100, 100, benchEnd]),
        },
        numerator: 'AA', denominator: 'BB', benchmark: 'SPY', sessions: 60,
    });
    const s = buildSeries(win);
    const pair = { label: 'AA/BB', numerator: 'AA', denominator: 'BB' };
    return { read: pairRead(s, pair, { axisKey: 'zeta', loading: -0.47 }), series: s, pair };
}

test('case 1 — both legs beat SPY: rotation inside a rising market', () => {
    const { read } = readFor(110, 105, 102);
    assert.equal(read.marketRelation, 'rotation_in_rising_market');
    assert.match(read.sentences.join(' '), /rotation inside a rising market/);
});

test('case 2 — both legs lag SPY: the ratio is sorting losers', () => {
    const { read } = readFor(95, 90, 103);
    assert.equal(read.marketRelation, 'sorting_losers');
    assert.match(read.sentences.join(' '), /sorting losers/);
});

test('case 3 — one leg beats SPY: genuine relative information', () => {
    const { read } = readFor(110, 95, 102);
    assert.equal(read.marketRelation, 'genuine_relative');
    assert.match(read.sentences.join(' '), /genuine relative information/);
});

test('the SAME ratio move is read differently depending on which leg drove it', () => {
    // Both give a ratio of roughly +10%: once on numerator strength, once on
    // denominator weakness. This is the §1 distinction, and it is the whole
    // reason the explorer exists.
    const strength = readFor(110, 100, 100).read;
    const weakness = readFor(100, 90.9, 100).read;
    assert.match(strength.sentences[1], /strength in AA/);
    assert.match(weakness.sentences[1], /weakness in BB/);
    assert.notEqual(strength.sentences[1], weakness.sentences[1]);
});

test('the derivation line carries the signed loading, the net-of-SPY basis and the window', () => {
    const { read } = readFor(110, 105, 102);
    assert.match(read.derivation, /loads −0\.47 on zeta/);
    assert.match(read.derivation, /net of SPY/);
    assert.match(read.derivation, /4 sessions/);
});

test('an unassigned pair still reads, and says it has no axis loading', () => {
    const win = alignedWindow({
        bySymbol: { AA: mk(D, [100, 100, 100, 110]), BB: mk(D, [100, 100, 100, 105]), SPY: mk(D, [100, 100, 100, 102]) },
        numerator: 'AA', denominator: 'BB', benchmark: 'SPY', sessions: 60,
    });
    const read = pairRead(buildSeries(win), { label: 'AA/BB', numerator: 'AA', denominator: 'BB' },
        { unassigned: true, axisKey: null, loading: null });
    assert.match(read.derivation, /no axis loading/);
    assert.equal(read.unavailable, false);
});

test('no series at all yields an unavailable read, never a fabricated one', () => {
    const read = pairRead(null, { label: 'AA/BB', numerator: 'AA', denominator: 'BB' }, null);
    assert.equal(read.unavailable, true);
    assert.deepEqual(read.sentences, []);
});

// ── Tiles ────────────────────────────────────────────────────────────────

test('five tiles, and the net-of-SPY pair is what the read rests on', () => {
    const { series, pair } = readFor(110, 105, 102);
    const tiles = metricTiles(series, pair);
    assert.equal(tiles.length, 5);
    assert.deepEqual(tiles.map(t => t.key), ['ratio', 'num', 'den', 'numNet', 'denNet']);
    assert.ok(Math.abs(tiles[3].value - 8) < 1e-9, 'AA +10% less SPY +2% = +8%');
    assert.ok(Math.abs(tiles[4].value - 3) < 1e-9, 'BB +5% less SPY +2% = +3%');
});

// ── The benchmark as a leg (found by rendering, not by the tests) ─────────
// Seven of the twelve live pairs are `X/SPY`. The three-case branch above
// degenerates for every one of them: SPY's own return net of SPY is 0, so the
// generic read emitted "Only SPY is beating SPY".

function xSpyRead(numEnd, benchEnd) {
    const win = alignedWindow({
        bySymbol: {
            RSP: mk(D, [100, 100, 100, numEnd]),
            SPY: mk(D, [100, 100, 100, benchEnd]),
        },
        numerator: 'RSP', denominator: 'SPY', benchmark: 'SPY', sessions: 60,
    });
    const s = buildSeries(win);
    const pair = { label: 'RSP/SPY', numerator: 'RSP', denominator: 'SPY' };
    return { series: s, pair, read: pairRead(s, pair, { axisKey: 'concentration', loading: -0.4655 }, 'SPY') };
}

test('a benchmark leg never produces "Only SPY is beating SPY"', () => {
    const { read } = xSpyRead(95.9, 103.3);
    const text = read.sentences.join(' ');
    assert.doesNotMatch(text, /beating SPY/, 'the tautology must not survive');
    assert.doesNotMatch(text, /sorting losers/);
    assert.equal(read.marketRelation, 'benchmark_is_leg');
});

test('a benchmark leg says the ratio IS the net-of-market figure', () => {
    const { read } = xSpyRead(95.9, 103.3);
    assert.match(read.sentences[2], /SPY is one leg/);
    assert.match(read.sentences[2], /RSP lagged it by 7\.4%/);
    assert.match(read.derivation, /SPY is a leg, so the ratio is the net-of-market figure/);
});

test('a benchmark leg reads "led it by" when the other leg is ahead', () => {
    const { read } = xSpyRead(110, 102);
    assert.match(read.sentences[2], /RSP led it by 8\.0%/);
});

test('the vacuous "SPY vs SPY" tile is dropped, the informative one kept', () => {
    const { series, pair } = xSpyRead(95.9, 103.3);
    const tiles = metricTiles(series, pair, 'SPY');
    assert.equal(tiles.length, 4);
    assert.deepEqual(tiles.map(t => t.key), ['ratio', 'num', 'den', 'numNet']);
    assert.ok(!tiles.some(t => t.label === 'SPY vs SPY'));
});

test('pairs with no benchmark leg keep all five tiles', () => {
    const { series, pair } = readFor(110, 105, 102);
    assert.equal(metricTiles(series, pair, 'SPY').length, 5);
});
