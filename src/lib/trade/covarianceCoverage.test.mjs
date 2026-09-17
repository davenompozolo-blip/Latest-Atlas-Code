import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    MIN_COVARIANCE_COVERAGE, covarianceIsMeasurable, coverageSentence,
} from './covarianceCoverage.js';

// The case that shipped: the matrix truncated to 1,000 of 88,408 rows, none of
// them held-to-held, so every one of the book's 2,145 pairs took the ρ=0
// fallback. Coverage 0 -- and the pane published 6.54% against a true 17.62%.
const TRUNCATED = { covarianceCoverage: 0, totalPairs: 2145, missingPairs: 2145 };
const HEALTHY = { covarianceCoverage: 2016 / 2145, totalPairs: 2145, missingPairs: 129 };

test('the truncated matrix is refused', () => {
    assert.equal(covarianceIsMeasurable(TRUNCATED), false);
});

test('the real book clears the bar', () => {
    // 2,016 of 2,145 is 93.99% -- above the floor, and the 129 missing pairs
    // are genuine gaps in the snapshot rather than a truncation.
    assert.ok(HEALTHY.covarianceCoverage > MIN_COVARIANCE_COVERAGE);
    assert.equal(covarianceIsMeasurable(HEALTHY), true);
});

test('coverage of exactly the threshold is measurable, just below is not', () => {
    assert.equal(covarianceIsMeasurable({ covarianceCoverage: MIN_COVARIANCE_COVERAGE }), true);
    assert.equal(covarianceIsMeasurable({ covarianceCoverage: MIN_COVARIANCE_COVERAGE - 1e-9 }), false);
});

test('a missing coverage figure is not a passing one', () => {
    // The distinction that matters: "we did not measure coverage" must not
    // read as "coverage is fine". null, undefined and NaN all refuse.
    assert.equal(covarianceIsMeasurable({ covarianceCoverage: null }), false);
    assert.equal(covarianceIsMeasurable({}), false);
    assert.equal(covarianceIsMeasurable({ covarianceCoverage: NaN }), false);
    assert.equal(covarianceIsMeasurable(null), false);
});

test('a one-name book has no pairs and is not measurable', () => {
    // totalPairs 0 makes coverage null in computeBookImpact, so it refuses --
    // correctly: there is no covariance structure to have got right.
    assert.equal(covarianceIsMeasurable({ covarianceCoverage: null, totalPairs: 0 }), false);
});

test('the refusal states the observed coverage, not the threshold', () => {
    const s = coverageSentence(TRUNCATED);
    assert.match(s, /0 of 2,145 pairs/);
    assert.match(s, /\(0%\)/);
    assert.ok(!s.includes('90'), 'the threshold is a judgement and is not quoted as if measured');
});

test('no snapshot at all reads differently from a partial one', () => {
    // A transport failure must never render as a statement about the data.
    const none = coverageSentence({ covarianceCoverage: null });
    const partial = coverageSentence({ covarianceCoverage: 0.5, totalPairs: 100, missingPairs: 50 });
    assert.match(none, /No correlation snapshot was loaded/);
    assert.match(partial, /50 of 100 pairs/);
    assert.notEqual(none, partial);
});

test('the sentence names the floor rather than calling it an understatement', () => {
    // The published 6.54% is not a low estimate of 17.62%; it answers a
    // different question. The wording has to carry that.
    for (const r of [TRUNCATED, { covarianceCoverage: null }]) {
        assert.match(coverageSentence(r), /diversified-away floor/);
    }
});
