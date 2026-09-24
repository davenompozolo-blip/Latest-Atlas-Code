// The fixtures are the LIVE coverage rows, not invented shapes: AAPL as EDGAR
// loaded it (19 aligned annual, 0 quarterly, complete) and GOOGL as Alpha
// Vantage loaded it (both bases). Each test was checked by reverting the
// module to the shipped predicate and watching it fail.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    statementPeriodAvailability, periodAbsentReason,
    NOT_LOADED, PERIOD_ABSENT, INCOMPLETE, COVERAGE_DISAGREES,
} from './statementPeriodAvailability.js';

const AAPL = {  // measured: vw_company_statement_coverage, 2026-09-24
    symbol: 'AAPL', source: 'edgar', statements_present: 3,
    aligned_annual_periods: 19, is_complete: true,
    income_quarterly: 0, aligned_quarterly_periods: 0,
};
const GOOGL = { // an Alpha Vantage symbol, which does carry quarterly
    symbol: 'GOOGL', source: 'alphavantage', statements_present: 3,
    aligned_annual_periods: 20, is_complete: true,
    income_quarterly: 81, aligned_quarterly_periods: 81,
};
// THE ROW THAT BREAKS THE FIRST FIX. SNDK is the half-loaded symbol EQ-2
// records -- income statement only. `income_quarterly` is 12 and **nothing**
// renders, because the consumer view inner-joins three statements. Reading
// the income count offered a button to a basis that returns no rows, and the
// module then called the empty result a fault to chase.
const SNDK = {
    symbol: 'SNDK', source: 'alphavantage', statements_present: 1,
    aligned_annual_periods: 0, is_complete: false,
    income_quarterly: 12, aligned_quarterly_periods: 0,
};

test('an EDGAR symbol asked for quarterly is PERIOD_ABSENT, not unloaded', () => {
    const v = statementPeriodAvailability(AAPL, 'quarterly');
    // The shipped predicate (`statements_present > 0 && !is_complete`) is false
    // here, so this fell through to "not loaded yet" for a symbol with 19
    // complete annual periods.
    assert.equal(v.state, PERIOD_ABSENT);
    assert.notEqual(v.state, NOT_LOADED);
    assert.equal(v.available, 'annual');
    assert.equal(v.availableCount, 19);
    assert.equal(v.source, 'edgar');
});

test('the reason names the loader, and never an Alpha Vantage quota', () => {
    const body = periodAbsentReason(statementPeriodAvailability(AAPL, 'quarterly'));
    assert.match(body, /19 annual periods/);
    assert.match(body, /EDGAR/);
    assert.match(body, /annual filings only/);
    // AAPL was loaded from EDGAR, which has no key and no daily cap. The old
    // copy blamed the AV free tier for it.
    assert.doesNotMatch(body, /Alpha Vantage/);
    assert.doesNotMatch(body, /25 requests/);
});

test('a switch is offered ONLY to a basis that carries periods', () => {
    const absent = statementPeriodAvailability(AAPL, 'quarterly');
    assert.equal(absent.available, 'annual');
    // Nothing loaded at all: no basis to offer, and the key is absent from the
    // shape rather than null, so a button cannot be rendered.
    const nothing = statementPeriodAvailability(null, 'quarterly');
    assert.equal(nothing.state, NOT_LOADED);
    assert.ok(!('available' in nothing));
    assert.ok(!('availableCount' in nothing));
});

test('a symbol carrying both bases is never PERIOD_ABSENT for either', () => {
    assert.notEqual(statementPeriodAvailability(GOOGL, 'quarterly').state, PERIOD_ABSENT);
    assert.notEqual(statementPeriodAvailability(GOOGL, 'annual').state, PERIOD_ABSENT);
});

test('coverage claiming the requested basis is a contradiction, not an absence', () => {
    // Reached only with an empty row set; coverage says 19 annual. Calling that
    // "not loaded" is the defect this module exists to fix, one level down.
    const v = statementPeriodAvailability(AAPL, 'annual');
    assert.equal(v.state, COVERAGE_DISAGREES);
    assert.equal(v.requestedCount, 19);
    assert.equal(periodAbsentReason(v), null);   // not a period-absent reason
});

test('a part-landed symbol still reports INCOMPLETE', () => {
    const v = statementPeriodAvailability(
        { source: 'alphavantage', statements_present: 1, aligned_annual_periods: 0,
          income_quarterly: 0, is_complete: false }, 'annual');
    assert.equal(v.state, INCOMPLETE);
    assert.equal(v.statementsPresent, 1);
});

test('a zero count is an absence, never a period offer', () => {
    const v = statementPeriodAvailability(
        { source: 'edgar', statements_present: 0, aligned_annual_periods: 0,
          income_quarterly: 0, is_complete: false }, 'quarterly');
    assert.equal(v.state, NOT_LOADED);
    assert.ok(!('available' in v));
});

test('a non-finite or negative count is not a period', () => {
    for (const bad of [NaN, Infinity, -Infinity, -3, null, undefined, '19']) {
        const v = statementPeriodAvailability(
            { source: 'edgar', statements_present: 3, aligned_annual_periods: bad,
              income_quarterly: 0, is_complete: true }, 'quarterly');
        assert.equal(v.state, NOT_LOADED, 'aligned=' + String(bad));
        assert.ok(!('available' in v), 'aligned=' + String(bad));
    }
});

test('periodAbsentReason refuses any state but PERIOD_ABSENT', () => {
    assert.equal(periodAbsentReason(null), null);
    assert.equal(periodAbsentReason({ state: NOT_LOADED }), null);
    assert.equal(periodAbsentReason(statementPeriodAvailability(null, 'annual')), null);
});

test('one period reads as singular', () => {
    const v = statementPeriodAvailability(
        { source: 'alphavantage', statements_present: 3, aligned_annual_periods: 0,
          income_quarterly: 1, aligned_quarterly_periods: 1, is_complete: true }, 'annual');
    assert.equal(v.availableCount, 1);
    assert.match(periodAbsentReason(v), /1 quarterly period,/);
});


// ── EQ-9c: the second defect, found auditing the first fix ───────────────────
// Every test below fails against the merged module, checked by reverting it.

test('an income-statement count is not a renderable basis', () => {
    // SNDK carries 12 quarterly INCOME rows and no balance sheet or cash flow,
    // so the quarterly basis returns nothing. The merged module read
    // `income_quarterly`, called this PERIOD_ABSENT and offered the switch.
    const v = statementPeriodAvailability(SNDK, 'annual');
    assert.notEqual(v.state, PERIOD_ABSENT);
    assert.ok(!('available' in v), 'no dead-end button');
    assert.ok(!('availableCount' in v));
});

test('an incomplete symbol reads INCOMPLETE on the basis it has rows on', () => {
    // ...and the merged module called this COVERAGE_DISAGREES -- "a fault to
    // chase" -- for a state `is_complete: false` declares on the same row.
    const v = statementPeriodAvailability(SNDK, 'quarterly');
    assert.equal(v.state, INCOMPLETE);
    assert.notEqual(v.state, COVERAGE_DISAGREES);
    assert.equal(v.statementsPresent, 1);
    assert.equal(v.source, 'alphavantage');
});

test('INCOMPLETE is the same answer on both bases', () => {
    // A symbol whose statements did not all land cannot render anywhere, so
    // the basis asked for does not change the answer or produce an offer.
    for (const period of ['annual', 'quarterly']) {
        const v = statementPeriodAvailability(SNDK, period);
        assert.equal(v.state, INCOMPLETE, period);
        assert.ok(!('available' in v), period);
    }
});

test('a complete symbol still gets the period offer', () => {
    // The precedence change must not swallow the case the first fix existed
    // for: AAPL is complete, so INCOMPLETE must not claim it.
    const v = statementPeriodAvailability(AAPL, 'quarterly');
    assert.equal(v.state, PERIOD_ABSENT);
    assert.equal(v.available, 'annual');
});

test('aligned quarterly periods drive the offer, not the income count', () => {
    // Same row twice; only the aligned count differs. If the module reads the
    // income count these two are indistinguishable.
    const renders = statementPeriodAvailability(
        { source: 'alphavantage', statements_present: 0, aligned_annual_periods: 0,
          income_quarterly: 40, aligned_quarterly_periods: 40, is_complete: false }, 'annual');
    const doesNot = statementPeriodAvailability(
        { source: 'alphavantage', statements_present: 0, aligned_annual_periods: 0,
          income_quarterly: 40, aligned_quarterly_periods: 0, is_complete: false }, 'annual');
    assert.equal(renders.state, PERIOD_ABSENT);
    assert.equal(renders.availableCount, 40);
    assert.notEqual(doesNot.state, PERIOD_ABSENT);
    assert.ok(!('available' in doesNot));
});

test('a quarterly-only symbol is not mistaken for an incomplete one', () => {
    // `statements_present` is ANNUAL-scoped, so 0 there is not evidence of a
    // half-loaded symbol -- it is what a quarterly-only load looks like. The
    // INCOMPLETE branch must not claim it.
    const v = statementPeriodAvailability(
        { source: 'alphavantage', statements_present: 0, aligned_annual_periods: 0,
          income_quarterly: 12, aligned_quarterly_periods: 12, is_complete: false }, 'annual');
    assert.equal(v.state, PERIOD_ABSENT);
    assert.equal(v.available, 'quarterly');
});
