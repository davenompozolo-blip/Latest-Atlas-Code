// EQ-4 · the institution layer's view shape.
//
// Every fixture below is a REAL shape from the 2026-09-23 load of eleven
// financial filers, not an invented one. The values are the view's own output
// for that filer-year.
//
// THE TESTS THAT EARN THEIR PLACE are the ones that fail if a metric is
// rendered when it should be absent: `benefits_to_premiums` without its
// caveat, a withheld CAMELS A leg, and a retailer that loaded lines and has
// no framework. Each of those looks identical to a working panel from the
// outside, which is how the mock gauges survived on the flagship for months.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildInstitutionView, withheldSentence, FRAMEWORK_LABEL,
    INST_LOADED, INST_NO_FRAMEWORK, INST_NOT_LOADED,
} from './institutionView.js';

// JPM FY2024, as the view returns it. CAMELS A computes on the ASC 326 pair.
const JPM_2024 = {
    symbol: 'JPM', fiscal_year: 2024, primary_framework: 'bank',
    bank_applicable: true, short_duration_applicable: false, long_duration_applicable: false,
    efficiency_ratio: '0.517003', noninterest_income_share: '0.462', nii_to_assets: '0.0294',
    deposits_to_assets: '0.5443', allowance_to_loans: '0.018392', loans_to_assets: '0.330678',
    camels_a_withheld: null,
    camels_c_withheld: 'regulatory_capital_not_in_face_statements',
    loss_and_lae_ratio: null, benefits_to_premiums: null,
};
// WFC FY2024: a bank whose filing carries no CECL loan-book tag.
const WFC_2024 = Object.assign({}, JPM_2024, {
    symbol: 'WFC', efficiency_ratio: '0.663434',
    allowance_to_loans: null, loans_to_assets: null,
    camels_a_withheld: 'loan_book_not_reported_by_this_filer_year',
});
// UNH FY2024: a HEALTH insurer, short-duration. 0.855494 is its published
// 85.5% medical care ratio.
const UNH_2024 = {
    symbol: 'UNH', fiscal_year: 2024, primary_framework: 'short_duration_insurer',
    bank_applicable: false, short_duration_applicable: true, long_duration_applicable: false,
    loss_and_lae_ratio: '0.855494', reserves_to_premiums: '0.1121',
    combined_ratio_withheld: 'underwriting_expense_not_measured',
    efficiency_ratio: null, benefits_to_premiums: null,
};
// PRU FY2024: long-duration. The ratio is above 1.0 and means nothing about
// underwriting, which is why the caveat exists.
const PRU_2024 = {
    symbol: 'PRU', fiscal_year: 2024, primary_framework: 'long_duration_insurer',
    bank_applicable: false, short_duration_applicable: false, long_duration_applicable: true,
    benefits_to_premiums: '1.098422',
    benefits_ratio_caveat: 'premiums_are_a_minority_of_long_duration_revenue',
    separate_account_share: '0.2814',
    loss_and_lae_ratio: null, efficiency_ratio: null,
};
// A retailer: lines loaded, no framework applies.
const TGT_2024 = {
    symbol: 'TGT', fiscal_year: 2024, primary_framework: null,
    bank_applicable: false, short_duration_applicable: false, long_duration_applicable: false,
    no_framework_reason: 'no_institution_lines',
};

test('no rows is NOT_LOADED, and carries no metrics', () => {
    const v = buildInstitutionView([]);
    assert.equal(v.state, INST_NOT_LOADED);
    assert.deepEqual(v.metrics, {});
    assert.deepEqual(v.years, []);
    assert.equal(buildInstitutionView(null).state, INST_NOT_LOADED);
});

test('LINES LOADED WITH NO FRAMEWORK IS AN ANSWER, NOT A GAP', () => {
    const v = buildInstitutionView([TGT_2024]);
    assert.equal(v.state, INST_NO_FRAMEWORK);
    // It must be distinguishable from NOT_LOADED: the fiscal year is known,
    // which is the whole difference. "We have this filer's filings and no
    // institution framework applies" and "nobody has loaded this filer" need
    // opposite actions from whoever is looking.
    assert.equal(v.fiscalYear, 2024);
    assert.notEqual(v.state, INST_NOT_LOADED);
    assert.deepEqual(v.metrics, {});
});

test('a bank publishes the CAMELS legs it can measure', () => {
    const v = buildInstitutionView([JPM_2024]);
    assert.equal(v.state, INST_LOADED);
    assert.equal(v.framework, 'bank');
    assert.equal(v.frameworkLabel, FRAMEWORK_LABEL.bank);
    assert.equal(v.metrics.efficiency_ratio, 0.517003);
    assert.equal(v.metrics.allowance_to_loans, 0.018392);
    assert.equal(v.metrics.loans_to_assets, 0.330678);
    // C is refused on every filer measured, and the reason is a sentence.
    assert.equal(v.withheld.camels_c, 'regulatory_capital_not_in_face_statements');
    assert.match(withheldSentence(v.withheld.camels_c), /Tier 1/);
    assert.equal(v.withheld.camels_a, undefined);
});

test('A WITHHELD CAMELS A LEG IS ABSENT FROM THE METRICS, NOT ZERO', () => {
    const v = buildInstitutionView([WFC_2024]);
    assert.equal(v.state, INST_LOADED);
    assert.equal(v.withheld.camels_a, 'loan_book_not_reported_by_this_filer_year');
    // ABSENT. Not null, not 0 — the key is not there, so a renderer that does
    // `metrics.allowance_to_loans.toFixed(2)` throws in a test rather than
    // printing "0.00" of a bank's loan book on a page.
    assert.equal('allowance_to_loans' in v.metrics, false);
    assert.equal('loans_to_assets' in v.metrics, false);
    // The rest of the framework still reports.
    assert.equal(v.metrics.efficiency_ratio, 0.663434);
    assert.match(withheldSentence(v.withheld.camels_a), /ASC 326/);
});

test('a health insurer is SHORT-DURATION and never labelled P&C', () => {
    const v = buildInstitutionView([UNH_2024]);
    assert.equal(v.framework, 'short_duration_insurer');
    assert.equal(v.metrics.loss_and_lae_ratio, 0.855494);
    // The label must not assert property and casualty business UNH does not
    // write. EQ-4h is this defect; a panel restating the old name reintroduces
    // it one layer out.
    assert.doesNotMatch(v.frameworkLabel, /P&C|property|casualty/i);
    assert.match(v.frameworkLabel, /short-duration/i);
    assert.equal(v.withheld.combined_ratio, 'underwriting_expense_not_measured');
    // No bank metric may appear on an insurer.
    assert.equal('efficiency_ratio' in v.metrics, false);
    assert.equal('deposits_to_assets' in v.metrics, false);
});

test('benefits_to_premiums travels WITH its caveat', () => {
    const v = buildInstitutionView([PRU_2024]);
    assert.equal(v.metrics.benefits_to_premiums, 1.098422);
    assert.equal(v.metrics.benefits_ratio_caveat,
        'premiums_are_a_minority_of_long_duration_revenue');
});

test('WITHOUT THE CAVEAT THE FIGURE IS REFUSED', () => {
    // A regression that dropped the caveat column would otherwise publish a
    // 1.098 next to a short-duration insurer's 0.855 as though they answered
    // the same question. They do not.
    const bare = Object.assign({}, PRU_2024, { benefits_ratio_caveat: null });
    const v = buildInstitutionView([bare]);
    assert.equal('benefits_to_premiums' in v.metrics, false);
    assert.equal(v.withheld.benefits_to_premiums, 'caveat_missing');
    // And the rest of the long-duration leg is unaffected.
    assert.equal(v.metrics.separate_account_share, 0.2814);
});

test('a mixed insurer publishes both duration legs', () => {
    const cb = Object.assign({}, UNH_2024, {
        symbol: 'CB', primary_framework: 'mixed_insurer',
        long_duration_applicable: true,
        benefits_to_premiums: '0.61',
        benefits_ratio_caveat: 'premiums_are_a_minority_of_long_duration_revenue',
        separate_account_share: '0.04',
    });
    const v = buildInstitutionView([cb]);
    assert.equal(v.framework, 'mixed_insurer');
    assert.equal(v.metrics.loss_and_lae_ratio, 0.855494);
    assert.equal(v.metrics.benefits_to_premiums, 0.61);
    assert.equal(v.shortDurationApplicable, true);
    assert.equal(v.longDurationApplicable, true);
});

test('the latest year is the headline however the rows arrive', () => {
    const older = Object.assign({}, JPM_2024, { fiscal_year: 2019, efficiency_ratio: '0.58' });
    // Deliberately oldest-first: a caller can hand rows from anywhere, so the
    // order is re-derived rather than trusted. Same rule as H-1's bets panel,
    // which grouped fifteen nights together because the loader's scoping was
    // the only gate.
    const v = buildInstitutionView([older, JPM_2024]);
    assert.equal(v.fiscalYear, 2024);
    assert.equal(v.metrics.efficiency_ratio, 0.517003);
    assert.equal(v.periods, 2);
    assert.deepEqual(v.years, [2024, 2019]);
});

test('A SERIES SKIPS UNMEASURED YEARS RATHER THAN PLOTTING ZERO', () => {
    // The risk-v2 zero-fill, in a new layer: a year with no efficiency ratio
    // is a year the filing did not support one, and a 0.00 on that chart is a
    // bank with no costs.
    const y2 = Object.assign({}, JPM_2024, { fiscal_year: 2023, efficiency_ratio: null });
    const y3 = Object.assign({}, JPM_2024, { fiscal_year: 2022, efficiency_ratio: '0.60' });
    const v = buildInstitutionView([JPM_2024, y2, y3]);
    const s = v.series('efficiency_ratio');
    assert.deepEqual(s, [{ year: 2022, value: 0.6 }, { year: 2024, value: 0.517003 }]);
    assert.equal(s.some(pt => pt.value === 0), false);
});

test('a non-finite value never reaches the metrics', () => {
    // PostgREST hands numerics back as strings, so a bad one arrives as a
    // string too. NaN passes every one-sided numeric CHECK in this database
    // (PR #783) and must not pass this one.
    for (const bad of ['NaN', 'Infinity', '', null, undefined, 'n/a']) {
        const row = Object.assign({}, JPM_2024, { efficiency_ratio: bad });
        const v = buildInstitutionView([row]);
        assert.equal('efficiency_ratio' in v.metrics, false, 'admitted ' + String(bad));
    }
});
