// ============================================================
// Equity Research — statement line definitions and the CFA ratio catalogue.
//
// Pure: no React, no network. The tab renders what this returns, so the
// arithmetic and the groupings are testable without a DOM.
//
// ABSENT IS NOT ZERO, everywhere in here. A line the filer does not report
// (a retailer has no R&D; a bank has no inventory) yields null and renders as
// an em dash. Reading it as 0 publishes "spends nothing on R&D" for a company
// that has no such line, and those are different claims.
// ============================================================

export const INCOME_LINES = [
    { key: 'total_revenue',       label: 'Revenue',                 emphasis: true },
    { key: 'cogs',                label: 'Cost of revenue' },
    { key: 'gross_profit',        label: 'Gross profit',            emphasis: true },
    { key: 'research_and_development', label: 'R&D' },
    { key: 'operating_income',    label: 'Operating income',        emphasis: true },
    { key: 'ebitda',              label: 'EBITDA' },
    { key: 'interest_expense',    label: 'Interest expense' },
    { key: 'income_before_tax',   label: 'Pre-tax income' },
    { key: 'income_tax_expense',  label: 'Tax' },
    { key: 'net_income',          label: 'Net income',              emphasis: true },
];

export const BALANCE_LINES = [
    { key: 'total_assets',              label: 'Total assets',        emphasis: true },
    { key: 'total_current_assets',      label: 'Current assets' },
    { key: 'cash_and_cash_equivalents', label: 'Cash & equivalents' },
    { key: 'inventory',                 label: 'Inventory' },
    { key: 'total_liabilities',         label: 'Total liabilities',   emphasis: true },
    { key: 'total_current_liabilities', label: 'Current liabilities' },
    { key: 'total_debt',                label: 'Total debt' },
    { key: 'net_debt',                  label: 'Net debt' },
    { key: 'retained_earnings',         label: 'Retained earnings' },
    { key: 'total_shareholder_equity',  label: 'Shareholders’ equity', emphasis: true },
];

export const CASHFLOW_LINES = [
    { key: 'operating_cashflow',       label: 'Cash from operations', emphasis: true },
    { key: 'capital_expenditures',     label: 'Capital expenditure' },
    { key: 'free_cash_flow',           label: 'Free cash flow',       emphasis: true },
    { key: 'fcff',                     label: 'FCFF',                 emphasis: true },
    { key: 'fcfe',                     label: 'FCFE',                 emphasis: true },
    { key: 'net_borrowing',            label: 'Net borrowing' },
    { key: 'dividends_paid',           label: 'Dividends paid' },
    { key: 'buybacks',                 label: 'Buybacks' },
    { key: 'stock_based_compensation', label: 'Stock-based comp' },
];

// The CFA framework groupings the brief asked for. `pct` marks a ratio that is
// a rate and should render as a percentage; `dp` is display precision.
export const RATIO_GROUPS = [
    { group: 'Liquidity', rows: [
        { key: 'current_ratio',        label: 'Current ratio',        dp: 2 },
        { key: 'quick_ratio',          label: 'Quick ratio',          dp: 2 },
        { key: 'cash_ratio',           label: 'Cash ratio',           dp: 2 },
        { key: 'operating_cash_ratio', label: 'Operating cash ratio', dp: 2 },
    ] },
    { group: 'Profitability', rows: [
        { key: 'gross_margin',     label: 'Gross margin',     pct: true },
        { key: 'operating_margin', label: 'Operating margin', pct: true },
        { key: 'ebitda_margin',    label: 'EBITDA margin',    pct: true },
        { key: 'net_margin',       label: 'Net margin',       pct: true },
        { key: 'fcf_margin',       label: 'FCF margin',       pct: true },
        { key: 'roa',              label: 'Return on assets', pct: true },
        { key: 'roe',              label: 'Return on equity', pct: true },
        { key: 'roic',             label: 'Return on invested capital', pct: true },
    ] },
    { group: 'Efficiency', rows: [
        { key: 'asset_turnover',              label: 'Asset turnover',       dp: 2 },
        { key: 'inventory_turnover',          label: 'Inventory turnover',   dp: 2 },
        { key: 'receivables_turnover',        label: 'Receivables turnover', dp: 2 },
        { key: 'days_inventory_outstanding',  label: 'Days inventory (DIO)', dp: 1 },
        { key: 'days_sales_outstanding',      label: 'Days sales (DSO)',     dp: 1 },
        { key: 'days_payables_outstanding',   label: 'Days payables (DPO)',  dp: 1 },
        { key: 'cash_conversion_cycle',       label: 'Cash conversion cycle',dp: 1 },
    ] },
    { group: 'Leverage', rows: [
        { key: 'debt_to_equity',        label: 'Debt / equity',        dp: 2 },
        { key: 'debt_to_assets',        label: 'Debt / assets',        dp: 2 },
        { key: 'liabilities_to_assets', label: 'Liabilities / assets', dp: 2 },
        { key: 'equity_multiplier',     label: 'Equity multiplier',    dp: 2 },
    ] },
    { group: 'Solvency & coverage', rows: [
        { key: 'interest_coverage',  label: 'Interest coverage',  dp: 2 },
        { key: 'debt_to_ebitda',     label: 'Debt / EBITDA',      dp: 2 },
        { key: 'net_debt_to_ebitda', label: 'Net debt / EBITDA',  dp: 2 },
        { key: 'cfo_to_debt',        label: 'CFO / debt',         dp: 2 },
    ] },
    { group: 'Cash-flow quality', rows: [
        { key: 'cash_conversion',     label: 'CFO / net income', dp: 2 },
        { key: 'sloan_accrual_ratio', label: 'Sloan accrual ratio', dp: 4 },
    ] },
    { group: 'Capital allocation & growth', rows: [
        { key: 'dividend_payout_ratio',    label: 'Dividend payout',     pct: true },
        { key: 'dividend_coverage_of_fcf', label: 'Dividends / FCF',     pct: true },
        { key: 'total_payout_of_fcf',      label: 'Total payout / FCF',  pct: true },
        { key: 'capex_intensity',          label: 'Capex / revenue',     pct: true },
        { key: 'rnd_intensity',            label: 'R&D / revenue',       pct: true },
        { key: 'retention_ratio',          label: 'Retention ratio',     dp: 3 },
        { key: 'sustainable_growth_rate',  label: 'Sustainable growth (SGR)', pct: true },
        { key: 'revenue_growth',           label: 'Revenue growth',      pct: true },
        { key: 'net_income_growth',        label: 'Net income growth',   pct: true },
    ] },
];

/** Finite check that refuses null/NaN/Infinity rather than coercing them. */
export function finite(v) {
    if (v == null || v === '') return false;
    const n = Number(v);
    return n === n && n !== Infinity && n !== -Infinity;
}

export function numOrNull(v) { return finite(v) ? Number(v) : null; }

/**
 * Period-over-period change for one line.
 *
 * Returns null — not 0 — when either side is absent, and null when the prior
 * value is zero: a change from nothing is not a percentage. `abs` carries the
 * level change so a reader can see movement even where a rate is undefined.
 */
export function periodChange(current, prior) {
    const c = numOrNull(current);
    const p = numOrNull(prior);
    if (c == null || p == null) return null;
    const abs = c - p;
    const pct = p === 0 ? null : abs / Math.abs(p);
    return { abs, pct };
}

/**
 * Build the column set. Rows arrive newest-first from the view; columns render
 * newest-first too, and `prior` is the NEXT row in that order, which is the
 * previous period of the same periodicity.
 */
export function buildColumns(rows, limit) {
    const n = limit == null ? 10 : limit;
    return (rows || []).slice(0, n).map(function (r, i, arr) {
        return {
            key: r.fiscal_date_ending,
            fiscalYear: r.fiscal_year,
            alignedYear: r.aligned_year != null ? r.aligned_year : null,
            label: String(r.fiscal_date_ending || '').slice(0, 7),
            row: r,
            prior: arr[i + 1] || null,
        };
    });
}

/**
 * A ratio row is RENDERABLE when at least one column carries a value. A row
 * that is null in every column is not evidence of anything and is dropped, so
 * a bank's operating-cycle block disappears rather than showing seven em
 * dashes that look like a broken panel.
 */
export function hasAnyValue(columns, key) {
    return (columns || []).some(function (c) { return finite(c.row && c.row[key]); });
}

export function visibleRatioGroups(columns) {
    return RATIO_GROUPS
        .map(function (g) {
            return { group: g.group, rows: g.rows.filter(function (r) { return hasAnyValue(columns, r.key); }) };
        })
        .filter(function (g) { return g.rows.length > 0; });
}

export function visibleLines(columns, lines) {
    return (lines || []).filter(function (l) { return hasAnyValue(columns, l.key); });
}

/** Index the long-format peer rows for O(1) lookup by (aligned_year, metric). */
export function indexPeers(peerRows) {
    const byYear = new Map();
    (peerRows || []).forEach(function (r) {
        const y = r.aligned_year;
        if (!byYear.has(y)) byYear.set(y, new Map());
        byYear.get(y).set(r.metric, r);
    });
    return byYear;
}

/**
 * A peer comparison is renderable only when peers were actually MEASURED for
 * that metric. peer_count counts peers carrying a value, never the size of the
 * sector cohort, so zero means there is nothing to compare against and the
 * surface must say so rather than print a median of one thing.
 */
export function peerComparison(peerIndex, alignedYear, metric) {
    const forYear = peerIndex && peerIndex.get(alignedYear);
    const row = forYear && forYear.get(metric);
    if (!row) return null;
    const n = Number(row.peer_count) || 0;
    if (n < 1) return { measurable: false, peerCount: 0 };
    return {
        measurable: true,
        peerCount: n,
        median: row.peer_median == null ? null : Number(row.peer_median),
        p25: row.peer_p25 == null ? null : Number(row.peer_p25),
        p75: row.peer_p75 == null ? null : Number(row.peer_p75),
        // NULL when the company itself has no measurement: a company that
        // cannot be measured does not sit at the bottom of its peer group.
        percentile: row.peer_percentile == null ? null : Number(row.peer_percentile),
        vsMedian: row.vs_peer_median == null ? null : Number(row.vs_peer_median),
        peers: row.peer_symbols || [],
    };
}
