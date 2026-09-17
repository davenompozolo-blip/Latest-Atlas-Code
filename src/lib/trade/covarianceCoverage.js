// ATLAS Trade — is the covariance matrix complete enough to publish from?
//
// Pane B builds Σ from `universe_correlations` and fills any pair with no row
// using `covarianceMatrix`'s `fallbackRho: 0`. That fallback is not a small
// approximation: a portfolio vol computed with every off-diagonal at zero is
// the DIVERSIFIED-AWAY FLOOR — a different quantity answering a different
// question, and always far below the truth for a book that moves together.
//
// Measured on the live book, 2026-09-16, with the matrix truncated to an
// arbitrary 1,000 of 88,408 rows (none of them held-to-held):
//
//     published    6.54%      every pair at ρ = 0
//     true        17.62%      Σ = D R D over correlation_simple, 2,016 pairs
//     undiversified 37.51%    Σ wᵢσᵢ
//
// The pane already carried a note saying the numbers were "a floor, not an
// estimate" and printed them anyway. A flag beside a number nobody checks is
// not a safeguard; the figure is withheld instead.

import { isNum } from './stats.js';

// A judgement, not a measurement. The honest denominator is WEIGHT rather than
// pair count — a missing pair between two 4% names matters far more than one
// between two 0.05% names — and Pane B's inputs do not carry a per-pair weight.
// So the threshold is deliberately conservative and the OBSERVED coverage is
// always printed with the refusal, rather than the bar being presented as
// precise.
export const MIN_COVARIANCE_COVERAGE = 0.90;

/** True when enough of the book's pairs are real to publish a risk figure. */
export function covarianceIsMeasurable(risk) {
    if (!risk) return false;
    const c = risk.covarianceCoverage;
    return isNum(c) && c >= MIN_COVARIANCE_COVERAGE;
}

/**
 * Why the risk block is absent, in terms a reader can act on: how much of the
 * matrix was on file, and what the alternative reading would have been.
 */
export function coverageSentence(risk) {
    const r = risk || {};
    if (!isNum(r.covarianceCoverage)) {
        return 'No correlation snapshot was loaded, so not one pair in the book could be measured. '
            + 'Portfolio vol from an all-zero correlation matrix is the diversified-away floor, not an '
            + 'estimate of this book, so it is withheld rather than shown.';
    }
    const total = isNum(r.totalPairs) ? r.totalPairs : 0;
    const missing = isNum(r.missingPairs) ? r.missingPairs : 0;
    const have = Math.max(total - missing, 0);
    const pct = (r.covarianceCoverage * 100).toFixed(0);
    return `${have.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} pairs had a correlation on `
        + `file (${pct}%). The rest would be treated as uncorrelated, which reports the diversified-away `
        + 'floor rather than this book’s risk, so the figures are withheld.';
}
