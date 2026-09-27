// Tests for the EDGAR companyfacts extractor.
//
// Every fixture here is a REAL shape measured against production on
// 2026-09-24, not an invented one, and each is chosen so that the naive
// implementation gets a DIFFERENT answer -- checked by reverting.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    statementRowsFromFacts, annualFacts, fiscalYearOf, canonicalPeriodEnds,
    INCOME_FIELDS, SOURCE_EDGAR,
    quarterlyFacts, quarterlyStatementRowsFromFacts,
} from './edgarFacts.js';

const USD = (entries) => ({ units: { USD: entries } });

// ── trap 1: `fy` describes the FILING, not the fact ─────────────────────────
test('a comparative column is keyed on its own period, not the filing year', () => {
    // One FY2025 10-K carrying three years of income. All three rows are
    // stamped fy:2025 fp:FY -- that is what the filing says, and it is not
    // what the facts describe. Measured: TGT read 17 years keyed on `fy`
    // against 19 keyed on `end`.
    const block = USD([
        { start: '2024-10-01', end: '2025-09-27', val: 300, fy: 2025, fp: 'FY', form: '10-K', filed: '2025-10-30' },
        { start: '2023-10-01', end: '2024-09-28', val: 200, fy: 2025, fp: 'FY', form: '10-K', filed: '2025-10-30' },
        { start: '2022-10-01', end: '2023-09-30', val: 100, fy: 2025, fp: 'FY', form: '10-K', filed: '2025-10-30' },
    ]);
    const got = annualFacts(block, 'Revenues');
    assert.deepEqual([...got.keys()].sort(), [2023, 2024, 2025],
        'three distinct periods, not one');
    assert.equal(got.get(2023).val, 100);
    assert.equal(got.get(2025).val, 300);
});

// ── trap 2: a flow needs an annual duration ─────────────────────────────────
test('a quarterly and a year-to-date duration are refused; the annual one is kept', () => {
    // ORDER MATTERS IN THIS FIXTURE. The quarter is listed FIRST: with the
    // duration check removed it is stored first and the annual figure is then
    // skipped as a same-filed duplicate, so the answer changes rather than
    // merely the reasoning. A fixture listing the annual entry first passes
    // either way and proves nothing.
    const block = USD([
        { start: '2025-10-01', end: '2025-12-31', val: 260,  form: '10-K', filed: '2026-02-01' }, // a quarter
        { start: '2025-01-01', end: '2025-09-30', val: 740,  form: '10-K', filed: '2026-02-01' }, // 3 quarters
        { start: '2025-01-01', end: '2025-12-31', val: 1000, form: '10-K', filed: '2026-02-01' },
    ]);
    const got = annualFacts(block, 'Revenues');
    assert.equal(got.size, 1);
    assert.equal(got.get(2025).val, 1000, 'the annual figure, never the quarter');
});

test('a balance-sheet instant has no start and is kept', () => {
    const block = USD([{ end: '2025-12-31', val: 5000, form: '10-K', filed: '2026-02-01' }]);
    assert.equal(annualFacts(block, 'Assets').get(2025).val, 5000);
});

// ── restatement ─────────────────────────────────────────────────────────────
test('the most recently filed value wins a period', () => {
    const block = USD([
        { start: '2024-01-01', end: '2024-12-31', val: 100, form: '10-K', filed: '2025-02-01' },
        { start: '2024-01-01', end: '2024-12-31', val: 111, form: '10-K', filed: '2026-02-01' },
    ]);
    assert.equal(annualFacts(block, 'Revenues').get(2024).val, 111, 'the restatement supersedes');
});

// ── trap 3: the tag changes with the accounting era ─────────────────────────
test('TGT net income spans three tags and only their union covers the history', () => {
    // Measured on CIK 0000027419: ProfitLoss 2007-2011,
    // NetIncomeLossAvailableToCommonStockholdersBasic 2009-2021,
    // NetIncomeLoss 2020-2025. NetIncomeLoss alone reads 11 of 19 years.
    const facts = { facts: { 'us-gaap': {
        ProfitLoss: USD([
            { start: '2010-01-31', end: '2011-01-29', val: 2920, form: '10-K', filed: '2011-03-11' },
        ]),
        NetIncomeLossAvailableToCommonStockholdersBasic: USD([
            { start: '2015-02-01', end: '2016-01-30', val: 3363, form: '10-K', filed: '2016-03-11' },
        ]),
        NetIncomeLoss: USD([
            { start: '2024-02-04', end: '2025-02-01', val: 4091, form: '10-K', filed: '2025-03-12' },
        ]),
    } } };
    const { income } = statementRowsFromFacts(facts, 'TGT');
    const byYear = new Map(income.map(r => [fiscalYearOf(r.fiscal_date_ending), r.net_income]));
    assert.equal(byYear.get(2010), 2920, 'the ProfitLoss era');
    assert.equal(byYear.get(2015), 3363, 'the AvailableToCommonStockholdersBasic era');
    assert.equal(byYear.get(2024), 4091, 'the NetIncomeLoss era');
    assert.equal(income.length, 3, 'three eras, three periods, no double count');
});

test('an earlier alias wins a period both tags report', () => {
    const facts = { facts: { 'us-gaap': {
        NetIncomeLoss: USD([{ start: '2024-01-01', end: '2024-12-31', val: 10, form: '10-K', filed: '2025-02-01' }]),
        ProfitLoss:    USD([{ start: '2024-01-01', end: '2024-12-31', val: 99, form: '10-K', filed: '2025-02-01' }]),
    } } };
    const { income } = statementRowsFromFacts(facts, 'X');
    assert.equal(income[0].net_income, 10, 'NetIncomeLoss is listed first and wins');
});

// ── trap 4: one period-end date across all three statements ─────────────────
test('a balance instant one day off the income period end still joins', () => {
    // The consumer view INNER JOINs the three tables on fiscal_date_ending.
    // If these disagree the symbol vanishes from the view entirely.
    const facts = { facts: { 'us-gaap': {
        Revenues: USD([{ start: '2024-02-04', end: '2025-02-01', val: 100, form: '10-K', filed: '2025-03-12' }]),
        Assets:   USD([{ end: '2025-02-02', val: 500, form: '10-K', filed: '2025-03-12' }]),
        NetCashProvidedByUsedInOperatingActivities:
                  USD([{ start: '2024-02-04', end: '2025-02-01', val: 70, form: '10-K', filed: '2025-03-12' }]),
    } } };
    const { income, balance, cashflow } = statementRowsFromFacts(facts, 'X');
    assert.equal(income.length, 1);
    assert.equal(balance.length, 1);
    assert.equal(cashflow.length, 1);
    assert.equal(balance[0].fiscal_date_ending, income[0].fiscal_date_ending,
        'the balance sheet is anchored to the income statement period end');
    assert.equal(cashflow[0].fiscal_date_ending, income[0].fiscal_date_ending);
    assert.equal(balance[0].total_assets, 500, 'and the value survives the snap');
    assert.equal(income[0].fiscal_date_ending, '2025-02-01',
        'the INCOME STATEMENT period end is the anchor -- it is what defines '
      + 'the fiscal year; the balance instant is snapped to it, not the reverse');
});

// ── absent is never zero ────────────────────────────────────────────────────
test('a line the filer does not report is NULL, never 0', () => {
    // XOM tags no OperatingIncomeLoss and no GrossProfit on any of 19 years;
    // TGT tags no Liabilities. Corroborated absent by Finnhub independently,
    // so these are facts about the filer, not parse gaps. A zero would read
    // as a company that earned nothing.
    const facts = { facts: { 'us-gaap': {
        Revenues:     USD([{ start: '2024-01-01', end: '2024-12-31', val: 100, form: '10-K', filed: '2025-02-01' }]),
        NetIncomeLoss:USD([{ start: '2024-01-01', end: '2024-12-31', val: 10,  form: '10-K', filed: '2025-02-01' }]),
    } } };
    const { income } = statementRowsFromFacts(facts, 'XOM');
    assert.equal(income[0].operating_income, null);
    assert.equal(income[0].gross_profit, null);
    assert.notEqual(income[0].operating_income, 0, 'explicitly not zero');
});

// ── forms and sentinels ─────────────────────────────────────────────────────
test('a 20-F is annual — the foreign filers Finnhub returns nothing for', () => {
    // ASML files a 20-F, in us-gaap, and returns 19-20 years on every core
    // field. Finnhub's 10-K feed returns ZERO rows for it.
    const block = USD([{ start: '2024-01-01', end: '2024-12-31', val: 42, form: '20-F', filed: '2025-02-12' }]);
    assert.equal(annualFacts(block, 'Revenues').get(2024).val, 42);
});

test('a 10-Q is not an annual period', () => {
    const block = USD([{ start: '2024-01-01', end: '2024-03-31', val: 9, form: '10-Q', filed: '2024-05-01' }]);
    assert.equal(annualFacts(block, 'Revenues').size, 0);
});

test('a non-finite value is refused rather than stored', () => {
    const block = USD([
        { start: '2024-01-01', end: '2024-12-31', val: null, form: '10-K', filed: '2025-02-01' },
        { start: '2023-01-01', end: '2023-12-31', val: 'n/a', form: '10-K', filed: '2025-02-01' },
    ]);
    assert.equal(annualFacts(block, 'Revenues').size, 0);
});

// ── fiscal year bucketing ───────────────────────────────────────────────────
test('a January or February year end belongs to the prior calendar year', () => {
    assert.equal(fiscalYearOf('2026-01-31'), 2025, "Target's FY2025 ends Jan 2026");
    assert.equal(fiscalYearOf('2025-02-01'), 2024);
    assert.equal(fiscalYearOf('2025-09-27'), 2025, "Apple's September year end is its own year");
    assert.equal(fiscalYearOf('2025-12-31'), 2025);
    assert.equal(fiscalYearOf('garbage'), null);
});

// ── a period with nothing measured is not a period ──────────────────────────
test('a fiscal year with no measured field emits no row', () => {
    const facts = { facts: { 'us-gaap': {
        Assets: USD([{ end: '2024-12-31', val: 500, form: '10-K', filed: '2025-02-01' }]),
    } } };
    const { income, balance } = statementRowsFromFacts(facts, 'X');
    assert.equal(balance.length, 1, 'the balance sheet has a measurement');
    assert.equal(income.length, 0, 'the income statement has none, so no empty row');
});

test('rows carry the edgar source and the annual period', () => {
    const facts = { facts: { 'us-gaap': {
        Assets: USD([{ end: '2024-12-31', val: 500, form: '10-K', filed: '2025-02-01' }]),
    } } };
    const { balance } = statementRowsFromFacts(facts, 'X');
    assert.equal(balance[0].source, SOURCE_EDGAR);
    assert.equal(balance[0].period, 'annual');
    assert.equal(balance[0].symbol, 'X');
    assert.equal(balance[0].reported_currency, 'USD');
});

test('a filer reporting in EUR records that currency rather than assuming USD', () => {
    const facts = { facts: { 'us-gaap': {
        Assets: { units: { EUR: [{ end: '2024-12-31', val: 500, form: '20-F', filed: '2025-02-01' }] } },
    } } };
    const { balance } = statementRowsFromFacts(facts, 'X');
    assert.equal(balance[0].reported_currency, 'EUR');
});

test('an empty or malformed payload yields no rows rather than throwing', () => {
    for (const bad of [null, {}, { facts: null }, { facts: {} }]) {
        const out = statementRowsFromFacts(bad, 'X');
        assert.deepEqual([out.income.length, out.balance.length, out.cashflow.length], [0, 0, 0]);
    }
});

// ── provenance ──────────────────────────────────────────────────────────────
test('the winning concept is recorded so a wrong mapping is diagnosable', () => {
    const facts = { facts: { 'us-gaap': {
        ProfitLoss: USD([{ start: '2010-01-31', end: '2011-01-29', val: 2920, form: '10-K', filed: '2011-03-11', accn: '0000027419-11-000005' }]),
    } } };
    const { provenance } = statementRowsFromFacts(facts, 'TGT');
    assert.ok(provenance.by_field.net_income.ProfitLoss >= 1,
        'the alias that produced the figure is named');
    assert.equal(provenance.accessions[2010], '0000027419-11-000005');
});

// ── quarterly (EQ-10) ──────────────────────────────────────────────────────
// Shape measured on AAPL/TGT: a 10-Q tags three-month and year-to-date
// spans, the 10-K only the year, and cash flow is often YTD-only.
const Q = (start, end, val, form, filed, accn) => ({ start, end, val, form, filed, accn: accn || form + filed });

test('a YTD-only flow is differenced into quarters, and Q4 is annual minus nine months', () => {
    const block = USD([
        Q('2025-01-01', '2025-03-31', 100, '10-Q', '2025-05-01'),
        Q('2025-01-01', '2025-06-30', 250, '10-Q', '2025-08-01'),
        Q('2025-01-01', '2025-09-30', 450, '10-Q', '2025-11-01'),
        Q('2025-01-01', '2025-12-31', 700, '10-K', '2026-02-01'),
    ]);
    const got = quarterlyFacts(block, 'NetCashProvidedByUsedInOperatingActivities');
    assert.deepEqual(['2025-03-31', '2025-06-30', '2025-09-30', '2025-12-31'].map(e => got.get(e).val),
        [100, 150, 200, 250]);
    assert.equal(got.get('2025-03-31').derived, false);
    assert.equal(got.get('2025-12-31').derived, true);
});

test('a reported three-month quarter beats one derived from its YTD chain', () => {
    const block = USD([
        Q('2025-01-01', '2025-03-31', 100, '10-Q', '2025-05-01'),
        Q('2025-04-01', '2025-06-30', 160, '10-Q', '2025-08-01'),
        Q('2025-01-01', '2025-06-30', 250, '10-Q', '2025-08-01'),
    ]);
    const q2 = quarterlyFacts(block, 'Revenues').get('2025-06-30');
    assert.equal(q2.val, 160);
    assert.equal(q2.derived, false);
});

test('a gap in the chain leaves the quarter absent rather than spanning two', () => {
    const block = USD([
        Q('2025-01-01', '2025-03-31', 100, '10-Q', '2025-05-01'),
        Q('2025-01-01', '2025-09-30', 450, '10-Q', '2025-11-01'),   // no H1
    ]);
    const got = quarterlyFacts(block, 'Revenues');
    assert.equal(got.has('2025-06-30'), false);
    assert.equal(got.has('2025-09-30'), false, '9M minus Q1 is two quarters, not one');
});

test('an annual-only concept yields no quarters', () => {
    const block = USD([
        Q('2024-01-01', '2024-12-31', 600, '10-K', '2025-02-01'),
        Q('2025-01-01', '2025-12-31', 700, '10-K', '2026-02-01'),
    ]);
    assert.equal(quarterlyFacts(block, 'Revenues').size, 0);
});

test('a restated annual is not differenced against an unrestated nine months (TGT FY2013)', () => {
    // Original 10-K: 72,597. The next 10-K restates the year to 71,279
    // (Canada to discontinued operations). The nine-month figure is only in
    // the ORIGINAL 10-Q. Latest-wins would publish Q4 = 71,279 - 51,081 and
    // absorb the whole restatement; the four quarters would then sum to the
    // very annual Q4 was built from, so no reconciliation could see it.
    const block = USD([
        Q('2013-02-03', '2013-05-04', 16706, '10-Q', '2013-06-01'),
        Q('2013-02-03', '2013-08-03', 33823, '10-Q', '2013-09-01'),
        Q('2013-02-03', '2013-11-02', 51081, '10-Q', '2013-12-01'),
        Q('2013-02-03', '2014-02-01', 72597, '10-K', '2014-03-20'),
        Q('2013-02-03', '2014-02-01', 71279, '10-K', '2015-03-20'),
    ]);
    const sink = [];
    const got = quarterlyFacts(block, 'SalesRevenueNet', sink);
    assert.equal(got.has('2014-02-01'), false, 'a cross-vintage Q4 is withheld');
    assert.deepEqual(sink, [{ concept: 'SalesRevenueNet', end: '2014-02-01' }]);
    assert.equal(got.get('2013-08-03').val, 17117, 'unrestated steps still derive');
});

test('quarterly rows: balance instants snap to the income quarter, and cross-vintage is recorded', () => {
    const facts = { facts: { 'us-gaap': {
        Revenues: USD([
            Q('2025-01-01', '2025-03-29', 100, '10-Q', '2025-05-01'),
            Q('2025-01-01', '2025-06-28', 250, '10-Q', '2025-08-01'),
        ]),
        Assets: USD([
            { end: '2025-03-31', val: 5000, form: '10-Q', filed: '2025-05-01' },   // 2 days after
            { end: '2025-05-15', val: 9999, form: '10-Q', filed: '2025-05-20' },   // no quarter near it
        ]),
    } } };
    const { income, balance, provenance } = quarterlyStatementRowsFromFacts(facts, 'X');
    assert.deepEqual(income.map(r => [r.fiscal_date_ending, r.total_revenue, r.period]),
        [['2025-03-29', 100, 'quarterly'], ['2025-06-28', 150, 'quarterly']]);
    assert.equal(balance.find(r => r.fiscal_date_ending === '2025-03-29').total_assets, 5000);
    assert.equal(balance.some(r => r.total_assets === 9999), false);
    assert.deepEqual(provenance.cross_vintage, {});
});
