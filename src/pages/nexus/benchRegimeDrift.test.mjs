import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    sortAxes, groupDriftByThesis, axisDrift, dispersionRead, thesisDrift, fmtScore, fmtVsSd,
} from './benchRegimeDrift.js';

// Real shapes from vw_thesis_regime_drift, 2026-09-13.
const BABA = axis => ({
    thesis_id: 3, symbol: 'BABA', thesis_status: 'untested',
    snapshot_at: '2026-08-11T09:00:00Z', snapshot_reason: 'backfill',
    snapshot_score_date: '2026-08-11', current_score_date: '2026-09-11',
    sessions_span_days: 31, snapshot_dispersion_state: 'contested',
    current_dispersion_state: 'contested', dispersion_changed: false,
    score_20d_stdev_full: 8.22, ...axis,
});
const ROWS = [
    BABA({ axis_key: 'dollar', pc_rank: 3, axis_marginal: true, axis_label: 'Dollar strength',
           snapshot_score_20d: 1.10, current_score_20d: 0.30, drift_score_20d: -0.80,
           sign_flipped: false, score_20d_stdev_full: 3.30 }),
    BABA({ axis_key: 'cyclical', pc_rank: 1, axis_marginal: false, axis_label: 'Cyclical risk-on',
           snapshot_score_20d: 5.14, current_score_20d: -1.59, drift_score_20d: -6.72,
           sign_flipped: true }),
    BABA({ axis_key: 'concentration', pc_rank: 2, axis_marginal: false,
           axis_label: 'Index concentration', snapshot_score_20d: -0.40,
           current_score_20d: 2.24, drift_score_20d: 2.64, sign_flipped: true,
           score_20d_stdev_full: 5.80 }),
];

test('axes sort by pc_rank, not by arrival or alphabet', () => {
    assert.deepEqual(sortAxes(ROWS).map(r => r.axis_key),
        ['cyclical', 'concentration', 'dollar']);
});

test('an axis with no pc_rank sorts last rather than throwing', () => {
    const odd = [{ axis_key: 'zeta' }, ...ROWS];
    assert.equal(sortAxes(odd).at(-1).axis_key, 'zeta');
});

test('groupDriftByThesis keys by thesis_id and drops rows without one', () => {
    const g = groupDriftByThesis([...ROWS, { axis_key: 'x' }, null]);
    assert.deepEqual([...g.keys()], ['3']);
    assert.equal(g.get('3').length, 3);
});

test('driftVsAxisSd is scale context computed against the AXIS sd, per axis', () => {
    // The three axes carry different sds (8.22 / 5.80 / 3.30). Using one
    // axis's sd for another would silently rescale the reading.
    const [cyc, con, dol] = sortAxes(ROWS).map(axisDrift);
    assert.ok(Math.abs(cyc.driftVsAxisSd - (-6.72 / 8.22)) < 1e-12);
    assert.ok(Math.abs(con.driftVsAxisSd - (2.64 / 5.80)) < 1e-12);
    assert.ok(Math.abs(dol.driftVsAxisSd - (-0.80 / 3.30)) < 1e-12);
    // Same drift, different axis => different reading. That is the point.
    assert.notEqual(cyc.driftVsAxisSd, con.driftVsAxisSd);
});

test('a zero or absent axis sd yields null, never Infinity or NaN', () => {
    for (const sd of [0, null, undefined]) {
        const a = axisDrift(BABA({ axis_key: 'cyclical', drift_score_20d: -6.72,
                                   score_20d_stdev_full: sd }));
        assert.equal(a.driftVsAxisSd, null);
        assert.equal(fmtVsSd(a.driftVsAxisSd), null);
    }
});

test('an unmeasurable axis is marked, not zeroed', () => {
    const a = axisDrift(BABA({ axis_key: 'cyclical', drift_score_20d: null,
                               snapshot_score_20d: null, current_score_20d: null }));
    assert.equal(a.measurable, false);
    assert.equal(a.drift, null);
    assert.equal(fmtScore(a.drift), '−'.replace('−', '—'));
});

test('marginal comes from the row, so a re-estimate changes it with no code edit', () => {
    const axes = sortAxes(ROWS).map(axisDrift);
    assert.deepEqual(axes.map(a => a.marginal), [false, false, true]);
});

test('dispersion is read once per thesis, not per axis', () => {
    const d = dispersionRead(ROWS);
    assert.deepEqual(d, { snapshot: 'contested', current: 'contested', changed: false });
    assert.equal(dispersionRead([]), null);
});

test('dispersion_changed is carried through as given', () => {
    const moved = ROWS.map(r => ({ ...r, current_dispersion_state: 'aligned', dispersion_changed: true }));
    assert.deepEqual(dispersionRead(moved), { snapshot: 'contested', current: 'aligned', changed: true });
});

test('thesisDrift states its denominator', () => {
    const t = thesisDrift([...ROWS, BABA({ axis_key: 'omega', pc_rank: 4, drift_score_20d: null })]);
    assert.equal(t.totalAxes, 4);
    assert.equal(t.measuredAxes, 3);
    assert.equal(t.thesisId, 3);
    assert.equal(t.sessionsSpanDays, 31);
});

test('thesisDrift returns null for a thesis with no snapshot rows', () => {
    // vw_thesis_regime_drift covers OPEN theses only, so a settled one has no
    // rows at all. That must render as nothing, never as a zero drift.
    assert.equal(thesisDrift([]), null);
    assert.equal(thesisDrift(null), null);
});

test('NO FLAG: nothing in the result asserts a premise expired', () => {
    const t = thesisDrift(ROWS);
    const json = JSON.stringify(t);
    for (const banned of ['premise_drifted', 'premiseDrifted', 'expired', 'stale', 'breach', 'alert']) {
        assert.ok(!json.includes(banned), 'E1.3 must not emit ' + banned + ' (that is E1.4)');
    }
    // signFlipped is a fact about the axis, and is allowed.
    assert.equal(t.axes[0].signFlipped, true);
});

test('fmtScore uses the codebase minus and keeps the sign explicit', () => {
    assert.equal(fmtScore(-6.72), '−6.72');
    assert.equal(fmtScore(2.64), '+2.64');
    assert.equal(fmtScore(0), '+0.00');
    assert.equal(fmtScore(null), '—');
});
