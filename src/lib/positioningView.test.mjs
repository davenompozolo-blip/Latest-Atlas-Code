// The fixtures mirror measurements already recorded for `vw_company_peer_cohort`
// -- Banking `ev_ebitda` 0 of 63, Biotechnology `forward_pe` 18 of 44, JPM
// carrying `roic_pct` alone, the 46 buckets being Finnhub's single-level
// taxonomy -- rather than invented shapes. Live verification of the loader
// against the view is still owed; what these pin is the render contract.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildPositioningView, MIN_PEERS_FOR_PERCENTILE, MIN_COHORT_MEMBERS,
    POS_LOADED, POS_NOT_LOADED, POS_NO_COHORT, POS_FAILED,
} from './positioningView.js';

function row(over) {
    return Object.assign({
        symbol: 'JPM', company_name: 'JPMorgan Chase & Co', cohort_key: 'Banking',
        cohort_basis: 'finnhub_industry', metric: 'roe_ttm', value: 16.13,
        higher_is_better: true, peer_median: 11.4, vs_peer_median: 4.73,
        peer_count: 58, peer_percentile: 0.83, peer_withheld: null,
        market_cap_usd: 7.2e11, market_cap_bucket: 'mega', current_price: 250,
    }, over || {});
}

test('a loaded cohort carries the basis, never a bare industry label', () => {
    const v = buildPositioningView([row()], POS_LOADED);
    assert.equal(v.state, POS_LOADED);
    assert.equal(v.cohortKey, 'Banking');
    assert.equal(v.cohortBasis, 'finnhub_industry');
    // The taxonomy is not optional: a renderer must be able to name it.
    assert.ok(v.cohortBasis);
});

test('polarity is read from the row and never re-derived', () => {
    const v = buildPositioningView([row({ higher_is_better: false, metric: 'ev_ebitda', value: 9.1 })], POS_LOADED);
    assert.equal(v.metrics[0].higherIsBetter, false);
    // A row with no recorded direction gets NO direction, not a guess.
    const u = buildPositioningView([row({ higher_is_better: null })], POS_LOADED);
    assert.equal('higherIsBetter' in u.metrics[0], false);
});

test('an unmeasured metric is ABSENT from metrics and named in withheldMetrics', () => {
    const v = buildPositioningView([
        row({ metric: 'roic_pct', value: 12.2 }),
        row({ metric: 'ev_ebitda', value: null }),   // Banking: 0 of 63
    ], POS_LOADED);
    assert.equal(v.metrics.length, 1);
    assert.equal(v.metrics[0].metric, 'roic_pct');
    assert.equal(v.measuredCount, 1);
    assert.equal(v.offeredCount, 2);
    assert.deepEqual(v.withheldMetrics, ['ev_ebitda']);
    // Nothing on the object can be read as a value for the absent metric.
    assert.equal(v.metrics.some(m => m.metric === 'ev_ebitda'), false);
});

test('a percentile over too few peers is withheld with its reason', () => {
    const thin = buildPositioningView([row({ peer_count: 3, peer_percentile: 0.5 })], POS_LOADED);
    const m = thin.metrics[0];
    assert.equal('percentile' in m, false, 'a 3-peer percentile was published');
    assert.equal(m.percentileWithheld, 'too_few_peers');
    // The MEDIAN survives: weak is not degenerate.
    assert.equal(m.peerMedian, 11.4);
});

test('at the floor exactly, the percentile publishes', () => {
    const at = buildPositioningView([row({ peer_count: MIN_PEERS_FOR_PERCENTILE })], POS_LOADED);
    assert.equal(at.metrics[0].percentile, 0.83);
    const below = buildPositioningView([row({ peer_count: MIN_PEERS_FOR_PERCENTILE - 1 })], POS_LOADED);
    assert.equal('percentile' in below.metrics[0], false);
});

test('a genuine zero is a measurement', () => {
    const v = buildPositioningView([row({ value: 0, vs_peer_median: -11.4 })], POS_LOADED);
    assert.equal(v.metrics[0].value, 0);
    assert.equal(v.measuredCount, 1);
});

test('a cohort too small to be a peer group says so rather than loading', () => {
    const v = buildPositioningView([row({ peer_count: 2 })], POS_LOADED);
    assert.equal(v.state, POS_NO_COHORT);
    assert.equal(v.cohortTooSmall, true);
    assert.ok(MIN_COHORT_MEMBERS > 3);
});

test('a company measured on nothing is not a loaded comparison', () => {
    const v = buildPositioningView([row({ value: null }), row({ metric: 'beta', value: null })], POS_LOADED);
    assert.equal(v.state, POS_NO_COHORT);
    assert.equal(v.nothingMeasured, true);
    assert.equal(v.measuredCount, 0);
});

test('a transport failure never reads as a statement about the company', () => {
    const f = buildPositioningView(null, POS_FAILED);
    assert.equal(f.state, POS_FAILED);
    assert.equal('metrics' in f, false);
    assert.equal('nothingMeasured' in f, false);
    // and an empty result is NOT a failure
    assert.equal(buildPositioningView([], POS_LOADED).state, POS_NOT_LOADED);
});

test('cohortPeers is the widest peer count, not one metric\'s', () => {
    const v = buildPositioningView([
        row({ metric: 'roe_ttm', value: 16.1, peer_count: 58 }),
        row({ metric: 'forward_pe', value: 12.0, peer_count: 41 }),
    ], POS_LOADED);
    assert.equal(v.cohortPeers, 58);
});

test('non-finite input is refused rather than rendered', () => {
    // null is the one that matters: Number(null) is 0, so a bare
    // Number.isFinite check publishes an absent value as a measured zero.
    for (const bad of [null, undefined, '', false, [], NaN, Infinity, -Infinity, 'abc']) {
        const v = buildPositioningView([row({ value: bad })], POS_LOADED);
        assert.equal(v.measuredCount, 0, String(bad) + ' was accepted as a value');
    }
});
