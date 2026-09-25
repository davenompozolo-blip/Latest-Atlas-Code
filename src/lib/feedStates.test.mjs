import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFeeds, feedProblems, feedFailed, feedNoticeText } from './feedStates.js';

// The live shapes: a view with rows, an empty one, a cancelled one (57014), a
// truncated one, and a loader that throws outright.
function stub(map) {
    return function (name) {
        const v = map[name];
        if (v instanceof Error) return Promise.reject(v);
        return Promise.resolve(v);
    };
}

test('a cancelled view is failed, never an empty list the page reads as no data', async () => {
    const res = await loadFeeds(['vw_command_centre', 'vw_portfolio_home'], stub({
        vw_command_centre: { state: 'failed', rows: [], error: 'canceling statement due to statement timeout' },
        vw_portfolio_home: { state: 'ok', rows: [{ symbol: 'AMD' }] },
    }));
    assert.equal(feedFailed(res.states, 'vw_command_centre'), true);
    assert.equal(feedFailed(res.states, 'vw_portfolio_home'), false);
    assert.deepEqual(res.rows.vw_command_centre, []);
    assert.equal(res.rows.vw_portfolio_home.length, 1);
    assert.deepEqual(res.problems.map(p => p.view), ['vw_command_centre']);
});

test('an empty view is an answer, not a problem', async () => {
    const res = await loadFeeds(['vw_earnings_calendar'], stub({ vw_earnings_calendar: { state: 'empty', rows: [] } }));
    assert.deepEqual(res.problems, []);
    assert.equal(feedNoticeText(res.problems), null);
});

test('a loader that throws fails its own feed and no other', async () => {
    const res = await loadFeeds(['a', 'b'], stub({ a: new Error('boom'), b: { state: 'ok', rows: [1] } }));
    assert.equal(res.states.a.state, 'failed');
    assert.equal(res.states.a.error, 'boom');
    assert.equal(res.states.b.state, 'ok');
});

test('an unknown state is treated as failed, not as ok', async () => {
    const res = await loadFeeds(['a'], stub({ a: { state: 'weird', rows: [1] } }));
    assert.equal(res.states.a.state, 'failed');
});

test('the notice names failed and truncated views separately', () => {
    const t = feedNoticeText(feedProblems({
        vw_a: { state: 'failed', error: 'x' }, vw_b: { state: 'partial' }, vw_c: { state: 'ok' },
    }));
    assert.match(t, /One feed did not answer \(vw_a\)/);
    assert.match(t, /absent, not zero/);
    assert.match(t, /vw_b hit the 1,000-row response cap/);
    assert.doesNotMatch(t, /vw_c/);
});
