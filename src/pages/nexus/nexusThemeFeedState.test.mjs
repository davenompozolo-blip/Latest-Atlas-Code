import test from 'node:test';
import assert from 'node:assert/strict';
import { momentumFeedState, MOMENTUM_LOADING, MOMENTUM_FAILED, MOMENTUM_PARTIAL, MOMENTUM_EMPTY, MOMENTUM_OK } from './nexusThemeCompute.js';

const rows = [{ theme: 'A', momentum5d: 1.2 }, { theme: 'B', momentum5d: null }];

test('a failed feed is a transport failure, never "pending sync"', () => {
    const s = momentumFeedState({ loaded: true, failed: true }, rows);
    assert.equal(s.state, MOMENTUM_FAILED);
    assert.match(s.text, /did not answer/);
    assert.doesNotMatch(s.text, /sync/i);
});

test('failed wins even when stale rows carry momentum', () => {
    assert.equal(momentumFeedState({ loaded: true, failed: true }, rows).state, MOMENTUM_FAILED);
});

test('loading is not empty', () => {
    assert.equal(momentumFeedState({ loaded: false }, []).state, MOMENTUM_LOADING);
});

test('an answered feed with nothing measured is empty, and says so', () => {
    assert.equal(momentumFeedState({ loaded: true }, [{ momentum5d: null }]).state, MOMENTUM_EMPTY);
});

test('a truncated tape is flagged partial', () => {
    assert.equal(momentumFeedState({ loaded: true, degraded: ['prices_partial'] }, rows).state, MOMENTUM_PARTIAL);
});

test('healthy', () => {
    const s = momentumFeedState({ loaded: true, degraded: [] }, rows);
    assert.equal(s.state, MOMENTUM_OK);
    assert.equal(s.text, null);
});
