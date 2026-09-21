// Tests for the cluster identity layer (H-2).
//
// Each fixture is chosen so that the NAIVE implementation fails it: a shape
// that nulls an unmeasured axis instead of omitting it, a sentence built from
// the axis key instead of the sign, a label substituted across basis, and a
// gate on `marginal`. A test that passes under both versions proves nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    shapeIdentity, identityTitle, compositionNote, axisSentence, axisTag,
    marketSentence, fitNote, byClusterId, NO_AXIS_TEXT, T_SIGNIFICANT,
} from './clusterIdentity.js';

// Cluster 196 on the 2026-09-18 book: the semis bet, named from the curated
// theme of 8 of its 34 members, loading NEGATIVELY on the dollar.
const SEMIS = {
    as_of_date: '2026-09-18', logic_version: 'v1:ols:mkt+3axis',
    cluster_id: 196, cluster_size: 34, held_count: 8, avg_intra_rho: 0.71,
    composition_label: 'AI / accelerated compute', composition_basis: 'curated_theme',
    composition_coverage: 0.24,
    fit_status: 'measured', n_obs: 139, r_squared: 0.780297,
    beta_market: 0.81245581, t_market: 3.2199, market_significant: true,
    primary_axis: 'dollar', primary_axis_sign: -1,
    primary_axis_t: -6.4, primary_axis_beta: -0.0031,
    primary_axis_label: 'Dollar strength (up = stronger dollar; gold, EM and small caps pressured)',
    primary_axis_positive_means: 'dollar strengthening; EEM/SPY, GLD/SPY and IWM/SPY falling',
    primary_axis_marginal: true,
    held_symbols: ['AMD', 'ASML', 'DFEV', 'EWY', 'MRVL', 'MU', 'SNDK', 'TSM'],
};

// KMI's bucket: fitted, nothing clearing the bar. R2 0.03, market t 0.06.
const NO_AXIS = {
    as_of_date: '2026-09-18', cluster_id: 151, cluster_size: 2, held_count: 1,
    composition_label: 'Energy', composition_basis: 'curated_theme',
    composition_coverage: 0.5,
    fit_status: 'measured', n_obs: 139, r_squared: 0.029963,
    beta_market: 0.011625, t_market: 0.0625, market_significant: false,
    primary_axis: null, primary_axis_sign: null,
    primary_axis_t: null, primary_axis_beta: null,
    primary_axis_label: null, primary_axis_positive_means: null,
    primary_axis_marginal: null,
    held_symbols: ['KMI'],
};

test('an unnamed axis is ABSENT from the shape, not null', () => {
    const s = shapeIdentity(NO_AXIS);
    // The point of the rule: a renderer cannot print what it was never handed.
    assert.equal('axisBeta' in s, false);
    assert.equal('axisT' in s, false);
    assert.equal('axisSign' in s, false);
    assert.equal(s.axis, null);
    // And a named one DOES carry them.
    const t = shapeIdentity(SEMIS);
    assert.equal('axisBeta' in t, true);
    assert.equal(t.axisT, -6.4);
});

test('an unnamed axis reads as no measurable exposure, never as a value', () => {
    assert.equal(axisSentence(shapeIdentity(NO_AXIS)), NO_AXIS_TEXT);
    assert.equal(axisTag(shapeIdentity(NO_AXIS)), null);
});

test('the axis sentence carries the SIGN, not just the key', () => {
    const neg = axisSentence(shapeIdentity(SEMIS));
    assert.match(neg, /^Falls with /);
    // Flip only the sign; the sentence must reverse.
    const pos = axisSentence(shapeIdentity(
        Object.assign({}, SEMIS, { primary_axis_sign: 1, primary_axis_beta: 0.0031 })));
    assert.match(pos, /^Rises with /);
    assert.notEqual(neg, pos);
    // Both quote the DB's own wording rather than restating it here.
    assert.ok(neg.endsWith(SEMIS.primary_axis_positive_means));
});

test('the compact tag also carries direction', () => {
    assert.equal(axisTag(shapeIdentity(SEMIS)), 'DOLLAR −');
    assert.equal(axisTag(shapeIdentity(
        Object.assign({}, SEMIS, { primary_axis_sign: 1 }))), 'DOLLAR +');
});

test('`marginal` is NOT a gate', () => {
    // `dollar` is marginal = true and is the book's most significant exposure.
    // Reading marginal as "not measurable" would withhold exactly the axis
    // that matters most.
    const s = shapeIdentity(SEMIS);
    assert.equal(s.axisMarginal, true);
    assert.notEqual(axisSentence(s), NO_AXIS_TEXT);
    assert.equal(axisTag(s), 'DOLLAR −');
});

test('the label states its basis and its coverage', () => {
    assert.equal(compositionNote(shapeIdentity(SEMIS)),
        'from curated theme, 24% of members');
    const vendor = shapeIdentity(Object.assign({}, SEMIS, {
        composition_label: 'Industrials', composition_basis: 'vendor_sector',
        composition_coverage: 1,
    }));
    // Sector is not theme. The two must never read the same.
    assert.equal(compositionNote(vendor), 'from vendor sector, 100% of members');
});

test('an unclassified cluster gets no label, and falls back to its id', () => {
    const u = shapeIdentity(Object.assign({}, SEMIS, {
        composition_label: null, composition_basis: 'unclassified',
        composition_coverage: null,
    }));
    assert.equal(compositionNote(u), null);
    assert.equal(identityTitle(u), 'Cluster 196');
    assert.equal(identityTitle(shapeIdentity(SEMIS)), 'AI / accelerated compute');
});

test('the market line is withheld when the market beta is not significant', () => {
    // KMI's bucket has a market beta of 0.0116 at t 0.06. Printing "Beta to
    // SPY 0.01" asserts a measured near-zero beta; it is not measured at all.
    assert.equal(marketSentence(shapeIdentity(NO_AXIS)), null);
    assert.equal(marketSentence(shapeIdentity(SEMIS)), 'Beta to SPY 0.81');
});

test('a fit that could not be reached says why', () => {
    assert.equal(fitNote(shapeIdentity(SEMIS)), null);
    const thin = shapeIdentity(Object.assign({}, SEMIS, {
        fit_status: 'insufficient_history', n_obs: 12,
        primary_axis: null, primary_axis_sign: null,
    }));
    assert.equal(fitNote(thin), 'Too little shared history to fit');
    assert.equal(axisSentence(thin), NO_AXIS_TEXT);
});

test('held symbols and counts survive the shape', () => {
    const s = shapeIdentity(SEMIS);
    assert.equal(s.heldCount, 8);
    assert.deepEqual(s.heldSymbols, ['AMD', 'ASML', 'DFEV', 'EWY', 'MRVL', 'MU', 'SNDK', 'TSM']);
    // Not the same as the cluster size -- 8 held out of a 34-name bucket.
    assert.equal(s.clusterSize, 34);
    assert.notEqual(s.heldCount, s.clusterSize);
});

test('byClusterId indexes on the id and drops rows without one', () => {
    const m = byClusterId([shapeIdentity(SEMIS), shapeIdentity(NO_AXIS),
        shapeIdentity({ cluster_id: null })]);
    assert.equal(m.size, 2);
    assert.equal(m.get(196).label, 'AI / accelerated compute');
    assert.equal(m.get(151).axis, null);
});

test('the significance bar is the database rule, not a local constant', () => {
    assert.equal(T_SIGNIFICANT, 2);
    // market_significant comes from the view, which binds it to |t| > 2.
    // The shape reads it rather than recomputing, so a disagreement is
    // impossible rather than merely unlikely.
    const lying = shapeIdentity(Object.assign({}, SEMIS,
        { t_market: 0.1, market_significant: false }));
    assert.equal(lying.marketSignificant, false);
    assert.equal(marketSentence(lying), null);
});
