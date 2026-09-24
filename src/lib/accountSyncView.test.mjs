import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildAccountSyncView, statusTone,
    ACCOUNT_SYNC_LOADED, ACCOUNT_SYNC_EMPTY, ACCOUNT_SYNC_FAILED,
} from './accountSyncView.js';

// Shapes as PostgREST returns them: numeric columns arrive as JSON numbers or
// strings depending on type, so both are exercised.
const HEALTHY = {
    portfolio_id: 'p1', portfolio_name: 'Alpaca Primary Account', is_default: true,
    positions_age_minutes: 0.4, positions_count: 67, nav_drift_pct: '0.0000',
    status: 'passed', reasons: [],
};
const STOPPED = {
    portfolio_id: 'p2', portfolio_name: 'Atlas Secondary', is_default: false,
    positions_age_minutes: 1500, positions_count: 38, nav_drift_pct: null,
    status: 'failed', reasons: ['positions last synced 1500 min ago'],
};
const NEVER = {
    portfolio_id: 'p3', portfolio_name: 'Third', is_default: false,
    positions_age_minutes: null, positions_count: 0, nav_drift_pct: null,
    status: 'failed', reasons: ['positions sync has never succeeded'],
};

test('a failing account is reported beside a healthy one, not hidden by it', () => {
    const v = buildAccountSyncView({ data: [HEALTHY, STOPPED], error: null });
    assert.equal(v.state, ACCOUNT_SYNC_LOADED);
    assert.deepEqual(v.rows.map((r) => r.tone), ['green', 'red']);
    assert.equal(v.rows[1].ageLabel, '1.0d');
    assert.deepEqual(v.rows[1].reasons, ['positions last synced 1500 min ago']);
});

test('drift and age are ABSENT when unmeasured, never 0', () => {
    const v = buildAccountSyncView({ data: [STOPPED, NEVER], error: null });
    assert.equal('driftLabel' in v.rows[0], false);
    assert.equal('ageLabel' in v.rows[1], false, 'a sync that never succeeded has no age');
    assert.equal(v.rows[1].positions, 0, 'a real zero count is still a measurement');
});

test('a measured zero drift is published', () => {
    const v = buildAccountSyncView({ data: [HEALTHY], error: null });
    assert.equal(v.rows[0].driftLabel, '0.00%');
    assert.equal(v.rows[0].ageLabel, '<1m');
});

test('a transport failure is FAILED, never "no accounts"', () => {
    for (const res of [null, { data: null, error: { message: 'function does not exist' } }, { data: null, error: null }]) {
        const v = buildAccountSyncView(res);
        assert.equal(v.state, ACCOUNT_SYNC_FAILED);
        assert.equal('rows' in v, false);
    }
});

test('an empty answer is a fact about configuration', () => {
    assert.equal(buildAccountSyncView({ data: [], error: null }).state, ACCOUNT_SYNC_EMPTY);
});

test('the database vocabulary maps to tones; unknown is grey, never green', () => {
    // atlas_run_validation writes passed / warning / failed. The Command
    // Centre's validation log tested only pass / ok / warn, so every passed
    // check rendered red.
    assert.equal(statusTone('passed'), 'green');
    assert.equal(statusTone('warning'), 'amber');
    assert.equal(statusTone('failed'), 'red');
    assert.equal(statusTone('pass'), 'green');
    assert.equal(statusTone('warn'), 'amber');
    assert.equal(statusTone('mystery'), 'grey');
    assert.equal(statusTone(null), 'grey');
});
