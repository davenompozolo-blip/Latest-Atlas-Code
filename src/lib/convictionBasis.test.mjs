// C-1: conviction needs a fundamental leg (a DCF valuation or a complete
// F-Score). A name with neither -- most ETFs -- arrives with its analytics
// computed and conviction NULL, basis 'no_fundamental_leg'. That is WITHHELD,
// not PENDING, and it must never be read as a score of zero.
//
// The fixtures carry a withheld row everywhere, because before C-1 the shape
// could not occur: every held name got a score, however little stood behind it.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    analyticsPending, convictionWithheld, unscoredLabel, partitionByAnalytics,
    ANALYTICS_PENDING_LABEL, CONVICTION_WITHHELD_LABEL, BASIS_NO_FUNDAMENTAL,
} from './holdingsAnalytics.js';
import { targetWeights } from '../pages/nexus/nexusLiveCompute.js';

const scored  = (symbol, conviction, weight) => ({ symbol, conviction_score: conviction, weight_pct: weight,
    market_value: weight * 1000, conviction_basis: 'valuation+quality+trend' });
const withheld = (symbol, weight) => ({ symbol, conviction_score: null, weight_pct: weight,
    market_value: weight * 1000, conviction_basis: BASIS_NO_FUNDAMENTAL });
// H-4's pending row: bought between refreshes, no analytics at all.
const pending = (symbol, weight) => ({ symbol, conviction_score: null, weight_pct: weight,
    market_value: weight * 1000, conviction_basis: null });

test('withheld and pending are different states', () => {
    assert.equal(convictionWithheld(withheld('EWA', 5)), true);
    assert.equal(analyticsPending(withheld('EWA', 5)), false);
    assert.equal(convictionWithheld(pending('NEW', 5)), false);
    assert.equal(analyticsPending(pending('NEW', 5)), true);
    assert.equal(analyticsPending(scored('AAPL', 60, 5)), false);
    assert.equal(convictionWithheld(scored('AAPL', 60, 5)), false);
});

test('each unscored state says which it is', () => {
    assert.equal(unscoredLabel(withheld('EWA', 5)), CONVICTION_WITHHELD_LABEL);
    assert.equal(unscoredLabel(pending('NEW', 5)), ANALYTICS_PENDING_LABEL);
    assert.notEqual(CONVICTION_WITHHELD_LABEL, ANALYTICS_PENDING_LABEL);
});

test('a withheld name gets NO target -- not a 0% target, which reads as an exit', () => {
    const t = targetWeights([scored('A', 80, 45), scored('B', 40, 45), withheld('EWA', 10)]);
    assert.equal(t.has('EWA'), false);
});

test('a withheld name does not dilute the targets of the names that carry a score', () => {
    // Invested weight among scored names is 90, split 80:40.
    const t = targetWeights([scored('A', 80, 45), scored('B', 40, 45), withheld('EWA', 10)]);
    assert.ok(Math.abs(t.get('A') - 60) < 1e-9, 'A ' + t.get('A'));
    assert.ok(Math.abs(t.get('B') - 30) < 1e-9, 'B ' + t.get('B'));
});

test('a pending name is still excluded from targets, as before', () => {
    const t = targetWeights([scored('A', 80, 50), pending('NEW', 50)]);
    assert.equal(t.has('NEW'), false);
    assert.ok(Math.abs(t.get('A') - 50) < 1e-9);
});

test('the partition keeps withheld apart from pending and states both shares', () => {
    const p = partitionByAnalytics([scored('A', 80, 50), withheld('EWA', 30), pending('NEW', 20)]);
    assert.deepEqual(p.withheldSymbols, ['EWA']);
    assert.deepEqual(p.pendingSymbols, ['NEW']);
    assert.equal(p.measuredCount, 1);
    assert.ok(Math.abs(p.withheldSharePct - 30) < 1e-9);
    assert.ok(Math.abs(p.pendingSharePct - 20) < 1e-9);
});
