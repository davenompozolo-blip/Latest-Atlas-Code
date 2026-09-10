// A2 axis-panel transforms — pure, runs under plain node.
//
//   node --test src/pages/nexus/nexusAxesCompute.test.mjs
//
// The point of most of these is that the panel is DATA-DRIVEN. Fixtures
// deliberately use axis keys that do not exist in the real database
// (`synthetic`, `fourth`) so that anything hardcoding the live three
// would fail here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildAxisRows, dispersionState, vintage, axisRead, exposureLabel,
    latestEstimateSet, readBlockEnabled, QUIET_SIGMA,
} from './nexusAxesCompute.js';

const axis = (key, rank, over) => ({
    axis_key: key, pc_rank: rank, label: key + ' label',
    variance_explained: 0.2, marginal: false,
    positive_means: 'positive means something for ' + key,
    pc_sign_flipped: false, ...over,
});
const beta = (factor, b, sig, over) => ({
    factor, beta: b, std_error: 0.001, t_stat: sig ? 3.1 : 0.9, significant: sig,
    window_start: '2025-12-26', window_end: '2026-09-04', n_obs: 168,
    estimated_at: '2026-09-09 15:22:52.968575+00', r_squared: 0.778, ...over,
});
const score = (key, d, s20) => ({
    date: d, axis_key: key, score: 0.5, score_20d: s20, score_60d: 1, pairs_used: 11,
});

// ── §1 everything renders from the database ──────────────────

test('rows come from the axes table, ordered by pc_rank, with no axis list in code', () => {
    const rows = buildAxisRows({
        // deliberately out of rank order, and none of these keys is real
        axes: [axis('gamma', 3), axis('alpha_ax', 1), axis('beta_ax', 2)],
        loadings: [], scores: [], betas: [],
    });
    assert.deepEqual(rows.map(r => r.axisKey), ['alpha_ax', 'beta_ax', 'gamma']);
});

test('a fourth axis appears with no code change', () => {
    const rows = buildAxisRows({
        axes: [axis('a', 1), axis('b', 2), axis('c', 3), axis('fourth', 4)],
        loadings: [], scores: [], betas: [],
    });
    assert.equal(rows.length, 4);
    assert.equal(rows[3].axisKey, 'fourth');
});

test('alpha and market are dropped structurally, by not being axes', () => {
    const rows = buildAxisRows({
        axes: [axis('synthetic', 1)],
        loadings: [], scores: [],
        betas: [beta('synthetic', 0.002, true), beta('alpha', -0.0009, false), beta('market', 1.03, true)],
    });
    assert.deepEqual(rows.map(r => r.axisKey), ['synthetic']);
});

test('latestEstimateSet takes the newest set whole, never row by row', () => {
    const est = latestEstimateSet([
        beta('x', 1, true, { estimated_at: '2026-09-08 19:15:14+00', n_obs: 174 }),
        beta('y', 2, true, { estimated_at: '2026-09-08 19:15:14+00', n_obs: 174 }),
        beta('x', 3, true, { estimated_at: '2026-09-09 15:22:52+00', n_obs: 168 }),
        beta('y', 4, true, { estimated_at: '2026-09-09 15:22:52+00', n_obs: 168 }),
    ]);
    assert.equal(est.nObs, 168);
    assert.equal(Number(est.byFactor.x.beta), 3);
    assert.equal(Number(est.byFactor.y.beta), 4);
});

// ── §2 the one rule that matters ─────────────────────────────

test('significant = false renders "no measurable exposure" and CARRIES NO BETA', () => {
    const [row] = buildAxisRows({
        axes: [axis('synthetic', 1)], loadings: [], scores: [],
        betas: [beta('synthetic', 0.000496309675, false)],
    });
    assert.equal(row.exposure.measured, false);
    assert.equal(exposureLabel(row), 'no measurable exposure');
    // The number is absent from the shape, not merely flagged: a template
    // cannot print what it was never handed.
    assert.equal('beta' in row.exposure, false);
    // The evidence for the claim is still carried.
    assert.equal(row.exposure.tStatWhenUnmeasured, 0.9);
});

test('significant = true renders the value', () => {
    const [row] = buildAxisRows({
        axes: [axis('synthetic', 1)], loadings: [], scores: [],
        betas: [beta('synthetic', -0.004763141529, true)],
    });
    assert.equal(row.exposure.measured, true);
    assert.equal(exposureLabel(row), null);
    assert.equal(row.exposure.beta, -0.004763141529);
});

test('ACCEPTANCE 3 — flipping significant flips the cell, same code, same beta', () => {
    const build = sig => buildAxisRows({
        axes: [axis('synthetic', 1)], loadings: [], scores: [],
        betas: [beta('synthetic', 0.0005, sig)],
    })[0];

    const off = build(false);
    const on = build(true);

    assert.equal(exposureLabel(off), 'no measurable exposure');
    assert.equal('beta' in off.exposure, false);
    assert.equal(exposureLabel(on), null);
    assert.equal(on.exposure.beta, 0.0005);
    // The rule is general: the only thing that changed is the flag.
});

test('a factor with no estimate at all is "not estimated", not "no measurable exposure"', () => {
    const [row] = buildAxisRows({ axes: [axis('synthetic', 1)], loadings: [], scores: [], betas: [] });
    assert.equal(exposureLabel(row), 'not estimated');
    assert.equal(row.exposure.reason, 'not_estimated');
});

// ── §3 direction and signs come from the data ────────────────

test('positive_means is carried on every row and pc_sign_flipped is provenance', () => {
    const rows = buildAxisRows({
        axes: [axis('a', 1), axis('b', 2, { pc_sign_flipped: true })],
        loadings: [], scores: [], betas: [],
    });
    for (const r of rows) assert.ok(r.positiveMeans && r.positiveMeans.length > 0);
    assert.equal(rows[1].pcSignFlipped, true);
});

test('pairs keep their loading sign and sort by magnitude', () => {
    const [row] = buildAxisRows({
        axes: [axis('synthetic', 1)],
        loadings: [
            { axis_key: 'synthetic', pair_key: 'hyg_tlt', loading: 0.046 },
            { axis_key: 'synthetic', pair_key: 'gld_spy', loading: -0.504 },
            { axis_key: 'synthetic', pair_key: 'qqq_spy', loading: 0.276 },
        ],
        scores: [], betas: [],
    });
    assert.deepEqual(row.pairs.map(p => p.pairKey), ['gld_spy', 'qqq_spy', 'hyg_tlt']);
    assert.ok(row.pairs[0].loading < 0, 'negative loading must survive as negative');
});

test('marginal is carried so the row can qualify itself', () => {
    const rows = buildAxisRows({
        axes: [axis('a', 1), axis('m', 2, { marginal: true })],
        loadings: [], scores: [], betas: [],
    });
    assert.equal(rows[0].marginal, false);
    assert.equal(rows[1].marginal, true);
});

// ── §4 dispersion — all states reachable ─────────────────────

const rowsFor = specs => buildAxisRows({
    axes: specs.map((s, i) => axis(s.key, i + 1, { marginal: !!s.marginal })),
    loadings: [],
    scores: specs.map(s => score(s.key, '2026-09-09', s.s20)),
    betas: [],
});

test('quiet — every included axis inside the threshold', () => {
    const d = dispersionState(rowsFor([{ key: 'a', s20: 0.2 }, { key: 'b', s20: -0.1 }]));
    assert.equal(d.state, 'quiet');
});

test('aligned — same sign, at least one at or past the threshold', () => {
    const d = dispersionState(rowsFor([{ key: 'a', s20: 2.2 }, { key: 'b', s20: 0.9 }]));
    assert.equal(d.state, 'aligned');
});

test('contested — signs disagree', () => {
    const d = dispersionState(rowsFor([{ key: 'a', s20: -2.9 }, { key: 'b', s20: 2.2 }]));
    assert.equal(d.state, 'contested');
});

test('marginal axes are excluded from the state and named', () => {
    const d = dispersionState(rowsFor([
        { key: 'a', s20: 2.2 }, { key: 'b', s20: 0.9 }, { key: 'm', s20: -9, marginal: true },
    ]));
    // Without the exclusion the -9 would make this contested.
    assert.equal(d.state, 'aligned');
    assert.deepEqual(d.included, ['a', 'b']);
    assert.deepEqual(d.excluded, ['m']);
});

test('fewer than two non-marginal axes renders a reason, never a state', () => {
    const d = dispersionState(rowsFor([{ key: 'a', s20: 2.2 }, { key: 'm', s20: -9, marginal: true }]));
    assert.equal(d.state, 'insufficient_axes');
    assert.equal(d.label, 'insufficient axes');
});

test('two included axes are marked as a two-way comparison, not a consensus', () => {
    const d = dispersionState(rowsFor([{ key: 'a', s20: -2.9 }, { key: 'b', s20: 2.2 }]));
    assert.equal(d.twoWay, true);
    const three = dispersionState(rowsFor([{ key: 'a', s20: 1 }, { key: 'b', s20: 1 }, { key: 'c', s20: 1 }]));
    assert.equal(three.twoWay, false);
});

test('an axis with no 20d score is excluded rather than treated as zero', () => {
    const d = dispersionState(rowsFor([{ key: 'a', s20: 2.2 }, { key: 'b', s20: null }]));
    assert.equal(d.state, 'insufficient_axes');
});

// ── §5 vintage and staleness ─────────────────────────────────

const SESSIONS = ['2026-09-09', '2026-09-08', '2026-09-04', '2026-09-03', '2026-09-02'];

test('level scores are not stale', () => {
    const v = vintage({
        seriesClose: '2026-09-09', scoreDate: '2026-09-09',
        estimate: latestEstimateSet([beta('x', 1, true)]), sessions: SESSIONS,
    });
    assert.equal(v.stale, false);
    assert.equal(v.lagSessions, 0);
});

test('one session behind is tolerated', () => {
    const v = vintage({ seriesClose: '2026-09-09', scoreDate: '2026-09-08', sessions: SESSIONS });
    assert.equal(v.lagSessions, 1);
    assert.equal(v.stale, false);
});

test('ACCEPTANCE 7 — holding the score date back two sessions raises the banner', () => {
    const v = vintage({ seriesClose: '2026-09-09', scoreDate: '2026-09-04', sessions: SESSIONS });
    assert.equal(v.lagSessions, 2);
    assert.equal(v.stale, true);
    assert.match(v.staleReason, /trail/);
});

test('a weekend gap is not staleness — lag counts sessions, not calendar days', () => {
    // 09-04 (Fri) to 09-08 (Tue) is four calendar days and one session.
    const v = vintage({ seriesClose: '2026-09-08', scoreDate: '2026-09-04', sessions: SESSIONS });
    assert.equal(v.lagSessions, 1);
    assert.equal(v.stale, false);
});

test('an unplaceable score date counts as stale, never as current', () => {
    const v = vintage({ seriesClose: '2026-09-09', scoreDate: '2001-01-01', sessions: SESSIONS });
    assert.equal(v.stale, true);
});

test('all three dates are surfaced', () => {
    const v = vintage({
        seriesClose: '2026-09-09', scoreDate: '2026-09-09',
        estimate: latestEstimateSet([beta('x', 1, true)]), sessions: SESSIONS,
    });
    assert.equal(v.seriesClose, '2026-09-09');
    assert.equal(v.scoreDate, '2026-09-09');
    assert.equal(v.betaWindowEnd, '2026-09-04');
    assert.equal(v.nObs, 168);
});

// ── §6 read block ────────────────────────────────────────────

test('the read flag is off by default and off when storage throws', () => {
    assert.equal(readBlockEnabled({ getItem: () => null }), false);
    assert.equal(readBlockEnabled({ getItem: () => { throw new Error('blocked'); } }), false);
    assert.equal(readBlockEnabled({ getItem: () => 'on' }), true);
});

test('an unmeasured axis never receives an interpretation of its beta', () => {
    const rows = buildAxisRows({
        axes: [axis('synthetic', 1)], loadings: [],
        scores: [score('synthetic', '2026-09-09', -2.9)],
        betas: [beta('synthetic', 0.0005, false)],
    });
    const r = axisRead(rows, dispersionState(rows));
    const line = r.lines[0];
    assert.match(line, /no measurable exposure to the axis/);
    assert.doesNotMatch(line, /0\.0005/);
    assert.doesNotMatch(line, /leans/);
});

test('a quiet unmeasured axis says there is nothing to read there', () => {
    const rows = buildAxisRows({
        axes: [axis('synthetic', 1)], loadings: [],
        scores: [score('synthetic', '2026-09-09', 0.1)],
        betas: [beta('synthetic', 0.0005, false)],
    });
    assert.match(axisRead(rows, dispersionState(rows)).lines[0], /nothing to read there/);
});

test('a marginal axis carries its qualifier into the prose', () => {
    const rows = buildAxisRows({
        axes: [axis('m', 1, { marginal: true })], loadings: [],
        scores: [score('m', '2026-09-09', -1.4)],
        betas: [beta('m', -0.0047, true)],
    });
    assert.match(axisRead(rows, dispersionState(rows)).lines[0], /marginal axis/);
});

test('a contested state says it is not established, and the derivation line is fixed', () => {
    const rows = rowsFor([{ key: 'a', s20: -2.9 }, { key: 'b', s20: 2.2 }]);
    const r = axisRead(rows, dispersionState(rows));
    assert.ok(r.lines.some(l => /not established/.test(l)));
    assert.equal(r.derivation, 'derived from axis scores × book factor betas · no regime label asserted');
});

test('QUIET_SIGMA is the single threshold the state reads', () => {
    const rows = rowsFor([{ key: 'a', s20: 0.4 }, { key: 'b', s20: -0.4 }]);
    assert.equal(dispersionState(rows).state, 'quiet');
    assert.equal(dispersionState(rows, { threshold: 0.3 }).state, 'contested');
    assert.equal(QUIET_SIGMA, 0.5);
});
