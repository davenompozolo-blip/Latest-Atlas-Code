// ============================================================
// Equity Research — Financials tab logic.
//
// The fixtures carry the shapes that actually occur and that a naive
// implementation gets wrong: a retailer with no R&D line, a bank whose
// operating-cycle ratios are withheld by the view, a company with no peers
// loaded, and the oldest period of a symbol, where every average-balance
// ratio is null because there is no prior balance to average against.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    periodChange, finite, numOrNull, buildColumns,
    hasAnyValue, visibleLines, visibleRatioGroups,
    INCOME_LINES, BALANCE_LINES, indexPeers, peerComparison,
} from '../pages/equity/statementRows.js';

// TGT-shaped: a retailer. No R&D line at all.
const RETAILER = [
    { symbol: 'TGT', fiscal_date_ending: '2026-01-31', fiscal_year: 2026, aligned_year: 2025,
      statement_profile: 'operating', total_revenue: 104780e6, gross_profit: 29269e6,
      research_and_development: null, net_income: 3705e6, current_ratio: 0.94,
      gross_margin: 0.2793, roe: 0.2403, inventory_turnover: 6.03,
      days_inventory_outstanding: 60.5, fcff: 3180.9e6, interest_expense: 445e6,
      operating_cashflow: 6562e6, capital_expenditures: 3727e6, effective_tax_rate: 0.2228 },
    { symbol: 'TGT', fiscal_date_ending: '2025-01-31', fiscal_year: 2025, aligned_year: 2024,
      statement_profile: 'operating', total_revenue: 106566e6, gross_profit: 30064e6,
      research_and_development: null, net_income: 4091e6, current_ratio: 0.98,
      gross_margin: 0.2821, roe: 0.2912, inventory_turnover: 5.90,
      days_inventory_outstanding: 58.7, fcff: 4795.6e6, interest_expense: 411e6,
      operating_cashflow: 7367e6, capital_expenditures: 2891e6, effective_tax_rate: 0.2224 },
];

// JPM-shaped: the view withholds the operating cycle and coverage for a bank.
const BANK = [
    { symbol: 'JPM', fiscal_date_ending: '2025-12-31', fiscal_year: 2025, aligned_year: 2025,
      statement_profile: 'financial', total_revenue: 163000e6, net_income: 57048e6,
      roe: 0.1613, debt_to_equity: 1.38, asset_turnover: 0.0664,
      current_ratio: null, quick_ratio: null, inventory_turnover: null,
      days_inventory_outstanding: null, cash_conversion_cycle: null,
      interest_coverage: null, debt_to_ebitda: null, fcff: null, free_cash_flow: null,
      gross_margin: null, ebitda_margin: null, cash_conversion: null },
];

test('an unreported line is dropped, not rendered as zero', () => {
    const cols = buildColumns(RETAILER);
    assert.equal(hasAnyValue(cols, 'research_and_development'), false);
    const lines = visibleLines(cols, INCOME_LINES);
    assert.ok(!lines.some(l => l.key === 'research_and_development'),
        'a retailer has no R&D line; showing a row of dashes reads as "spends nothing"');
    assert.ok(lines.some(l => l.key === 'total_revenue'), 'reported lines survive');
});

test("a bank's undefined ratio groups disappear rather than showing dashes", () => {
    const groups = visibleRatioGroups(buildColumns(BANK));
    const names = groups.map(g => g.group);
    assert.ok(!names.includes('Liquidity'),
        'the view withholds a bank\'s liquidity ratios, so the group has nothing to show');
    assert.ok(!names.includes('Efficiency') || !groups.find(g => g.group === 'Efficiency')
        .rows.some(r => r.key === 'days_inventory_outstanding'));
    assert.ok(names.includes('Profitability'), 'ROE and asset turnover ARE defined for a bank');
    const prof = groups.find(g => g.group === 'Profitability');
    assert.ok(prof.rows.some(r => r.key === 'roe'));
    assert.ok(!prof.rows.some(r => r.key === 'gross_margin'),
        'gross profit is not a line a bank reports');
});

test('period-over-period is null where either side is absent — never 0%', () => {
    assert.equal(periodChange(null, 100), null);
    assert.equal(periodChange(100, null), null);
    assert.equal(periodChange(undefined, undefined), null);
    const ch = periodChange(104780e6, 106566e6);
    assert.ok(ch.pct < 0, 'revenue fell');
    assert.ok(Math.abs(ch.pct - (-0.016759)) < 1e-5);
});

test('a change from zero has a level but no rate', () => {
    const ch = periodChange(500, 0);
    assert.equal(ch.abs, 500);
    assert.equal(ch.pct, null, 'growth from nothing is not a percentage');
});

test('finite() refuses null, NaN and both infinities', () => {
    [null, undefined, '', NaN, Infinity, -Infinity].forEach(v =>
        assert.equal(finite(v), false, String(v) + ' must not be finite'));
    [0, -1, 1e12, '42'].forEach(v => assert.equal(finite(v), true));
    assert.equal(numOrNull(null), null);
    assert.equal(numOrNull(0), 0, 'a genuine zero is a measurement');
});

test('columns pair each period with the PRIOR period of the same periodicity', () => {
    const cols = buildColumns(RETAILER);
    assert.equal(cols[0].label, '2026-01');
    assert.equal(cols[0].prior.fiscal_year, 2025, 'newest-first, so prior is the next row');
    assert.equal(cols[1].prior, null, 'the oldest loaded period has no prior');
});

test('no peer comparison is rendered when no peer carries a measured value', () => {
    const idx = indexPeers([
        { symbol: 'TGT', aligned_year: 2025, metric: 'gross_margin',
          peer_count: 0, peer_median: null, peer_percentile: null, vs_peer_median: null, peer_symbols: null },
    ]);
    const cmp = peerComparison(idx, 2025, 'gross_margin');
    assert.equal(cmp.measurable, false);
    assert.equal(cmp.peerCount, 0);
    assert.ok(!('median' in cmp), 'an unmeasurable comparison carries no median to print');
});

test('a real peer comparison carries its denominator and its members', () => {
    const idx = indexPeers([
        { symbol: 'WMT', aligned_year: 2025, metric: 'gross_margin', peer_count: 1,
          peer_median: 0.1284, peer_p25: 0.1284, peer_p75: 0.1284,
          peer_percentile: 1, vs_peer_median: 0.1209, peer_symbols: ['COST'] },
    ]);
    const cmp = peerComparison(idx, 2025, 'gross_margin');
    assert.equal(cmp.measurable, true);
    assert.equal(cmp.peerCount, 1);
    assert.deepEqual(cmp.peers, ['COST']);
    assert.ok(Math.abs(cmp.median - 0.1284) < 1e-9);
    assert.ok(cmp.vsMedian > 0, 'WMT runs a wider gross margin than COST');
});

test('a missing metric for the year yields no comparison object at all', () => {
    const idx = indexPeers([{ symbol: 'TGT', aligned_year: 2025, metric: 'roe', peer_count: 2, peer_median: 0.3 }]);
    assert.equal(peerComparison(idx, 2025, 'gross_margin'), null);
    assert.equal(peerComparison(idx, 2024, 'roe'), null, 'wrong year is not a fallback');
});

test('percentile is withheld when the company itself has no measurement', () => {
    const idx = indexPeers([
        { symbol: 'KMTUY', aligned_year: 2025, metric: 'roe', peer_count: 4,
          peer_median: 0.21, peer_percentile: null, vs_peer_median: null, peer_symbols: ['A', 'B', 'C', 'D'] },
    ]);
    const cmp = peerComparison(idx, 2025, 'roe');
    assert.equal(cmp.measurable, true, 'the peers were measured');
    assert.equal(cmp.percentile, null,
        'a company that cannot be measured does not sit at the bottom of its peer group');
    assert.equal(cmp.vsMedian, null);
});

// ── company phase, derived from the statements ───────────────────────────────
import { companyPhase, revenueCagr, PHASE_BANDS } from '../pages/equity/statementRows.js';

const period = (y, rev, ni, payout) => ({
    fiscal_year: y, total_revenue: rev, net_income: ni, dividend_payout_ratio: payout,
    ebit: rev * 0.1, effective_tax_rate: 0.22, capital_expenditures: rev * 0.04, d_and_a: rev * 0.03,
});

test('revenue CAGR is over the loaded window and null when an end is unusable', () => {
    const rows = [period(2025, 1000), period(2024, 800), period(2023, 600), period(2022, 450)];
    const c = revenueCagr(rows);
    assert.ok(Math.abs(c - (Math.pow(1000 / 450, 1 / 3) - 1)) < 1e-12);
    assert.equal(revenueCagr([period(2025, 1000)]), null, 'one period is not a trend');
    assert.equal(revenueCagr([period(2025, 1000), period(2024, 0)]), null, 'growth from zero is undefined');
    assert.equal(revenueCagr([period(2025, 1000), period(2024, null)]), null);
});

test('a fast-growing loss-maker is early stage, not growth', () => {
    const rows = [period(2025, 1000, -50), period(2024, 700, -60), period(2023, 450, -40)];
    const p = companyPhase(rows);
    assert.equal(p.phase, 'Early stage');
    assert.equal(p.evidence.profitable, false);
});

test('slow growth plus a real payout is mature', () => {
    const rows = [period(2025, 1000, 100, 0.55), period(2024, 985, 98, 0.52), period(2023, 975, 95, 0.50)];
    const p = companyPhase(rows);
    assert.equal(p.phase, 'Mature');
    assert.ok(p.evidence.payoutRatio >= PHASE_BANDS.maturePayout);
});

test('slow growth WITHOUT a payout is not called mature outright', () => {
    const rows = [period(2025, 1000, 100, null), period(2024, 985, 98, null), period(2023, 975, 95, null)];
    assert.equal(companyPhase(rows).phase, 'Mature / low growth',
        'no dividend is not evidence of maturity on its own');
});

test('a company with no usable evidence gets NO phase, not a default', () => {
    assert.equal(companyPhase([]), null);
    assert.equal(companyPhase(null), null);
    assert.equal(companyPhase([{ fiscal_year: 2025 }]), null,
        'an empty row must not be placed in a phase');
});

test('the bands are absolute, so a phase does not move when peers change', () => {
    // Same company, evaluated twice. Nothing about the cohort enters the call.
    const rows = [period(2025, 1000, 100, null), period(2024, 700, 80, null), period(2023, 500, 60, null)];
    assert.equal(companyPhase(rows).phase, companyPhase(rows).phase);
    assert.equal(companyPhase(rows).bands.highGrowth, PHASE_BANDS.highGrowth);
});
