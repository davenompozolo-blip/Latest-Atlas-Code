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
    // A null limit means EVERY loaded period. The `Max` control used to map to
    // 20, so a quarterly load carrying 81 periods could never show more than a
    // quarter of them — a cap that read as the data's own depth. Raised by
    // CodeRabbit on PR #806.
    const all = (rows || []);
    const n = limit == null ? all.length : limit;
    return all.slice(0, n).map(function (r, i, arr) {
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

// ============================================================
// Quality & Forensics / Capital Allocation — the derived shape, computed from
// these same statements.
//
// equity_fundamentals_derived is written by compute_ticker_derived, which
// fetches TWO annual periods from Finnhub. Eight of Piotroski's nine tests are
// year-over-year, so they could never resolve, and Altman could only ever be a
// partial X3+X4 estimate. That is why the panel showed 0/9 with eight blank
// rows -- not a display bug.
//
// Lives here rather than in its own module because this file is the pure
// statement logic and rollup drops a pure module whose only importer's call
// site it cannot see; consolidating removes the boundary rather than arguing
// with the bundler. See the build note in the EQ-5b report.
// ============================================================

/** Strictly greater, and null when either side is absent — never a silent false. */
function rising(cur, prev) {
    const a = numOrNull(cur), b = numOrNull(prev);
    if (a == null || b == null) return null;
    return a > b;
}
function falling(cur, prev) {
    const r = rising(cur, prev);
    return r == null ? null : !r;
}

/**
 * Piotroski F-score. Each test is TRUE, FALSE or NULL — never false-for-absent.
 * A null is "not determinable", which the panel already renders apart from a
 * failed test; counting nulls as fails is what produced a misleading weak grade.
 */
export function piotroski(cur, prev) {
    if (!cur) return { score: null, detail: null, determinable: 0 };
    const d = {
        niPos:   finite(cur.net_income)        ? Number(cur.net_income) > 0 : null,
        cfoPos:  finite(cur.operating_cashflow)? Number(cur.operating_cashflow) > 0 : null,
        roaRising:  prev ? rising(cur.roa, prev.roa) : null,
        cfoGtNi: (finite(cur.operating_cashflow) && finite(cur.net_income))
                    ? Number(cur.operating_cashflow) > Number(cur.net_income) : null,
        // Leverage FALLING is the healthy direction.
        levFalling: prev ? falling(cur.debt_to_assets, prev.debt_to_assets) : null,
        crRising:   prev ? rising(cur.current_ratio, prev.current_ratio) : null,
        // No new shares: the count did not rise. Equal counts pass.
        noNewShares: (prev && finite(cur.common_stock_shares_outstanding) && finite(prev.common_stock_shares_outstanding))
                    ? Number(cur.common_stock_shares_outstanding) <= Number(prev.common_stock_shares_outstanding) : null,
        gmRising:   prev ? rising(cur.gross_margin, prev.gross_margin) : null,
        atRising:   prev ? rising(cur.asset_turnover, prev.asset_turnover) : null,
    };
    const vals = Object.keys(d).map(k => d[k]);
    const determinable = vals.filter(v => v !== null).length;
    const passed = vals.reduce((n, v) => n + (v === true ? 1 : 0), 0);
    const complete = determinable === vals.length;
    // A 9-POINT SCORE IS PUBLISHED ONLY WHEN NINE CRITERIA RESOLVED.
    // This used to return `determinable ? passed : null`, so a reading formed
    // from three tests was emitted as an F-Score out of nine and read under
    // bands defined over nine. Live on 29 of the 52 symbols carrying
    // statements: SONY and CPER resolve THREE criteria and published
    // "2 / 9 · WEAK", where 2 of the 3 that resolved had in fact passed.
    // `passed` and `determinable` carry the partial reading so a surface can
    // state its own denominator; `score` is the composite and is absent.
    return { score: complete ? passed : null, passed, detail: d, determinable, complete };
}

/**
 * Altman Z'' — the variant for non-manufacturers and mixed universes. It needs
 * NO market capitalisation, which is why it is the one computable purely from
 * the statements; the classic Z's X4 is market equity over total liabilities
 * and would drag a market-data dependency into a statement-derived score.
 *
 *   Z'' = 6.56·X1 + 3.26·X2 + 6.72·X3 + 1.05·X4
 *   X1 working capital / total assets
 *   X2 retained earnings / total assets
 *   X3 EBIT / total assets
 *   X4 BOOK equity / total liabilities
 */
export function altmanZDoublePrime(r) {
    if (!r) return { z: null, components: null, model: 'z_double_prime' };
    const ta = numOrNull(r.total_assets);
    if (!ta) return { z: null, components: null, model: 'z_double_prime' };
    const ebit = numOrNull(r.ebit) != null ? numOrNull(r.ebit) : numOrNull(r.operating_income);
    const tl = numOrNull(r.total_liabilities);
    const x1 = numOrNull(r.working_capital)    != null ? numOrNull(r.working_capital) / ta : null;
    const x2 = numOrNull(r.retained_earnings)  != null ? numOrNull(r.retained_earnings) / ta : null;
    const x3 = ebit != null ? ebit / ta : null;
    const x4 = (numOrNull(r.total_shareholder_equity) != null && tl) ? numOrNull(r.total_shareholder_equity) / tl : null;
    const comps = { x1, x2, x3, x4 };
    // Every component must be present: a Z'' missing a term is not a lower Z'',
    // it is a different statistic, and the panel has a band chart behind it.
    if ([x1, x2, x3, x4].some(v => v == null)) {
        return { z: null, components: comps, model: 'z_double_prime', partial: true };
    }
    return { z: 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4, components: comps, model: 'z_double_prime' };
}

/** Reinvestment as a share of NOPAT: (capex − D&A) / NOPAT. */
export function reinvestmentRate(r) {
    if (!r) return null;
    const ebit = numOrNull(r.ebit) != null ? numOrNull(r.ebit) : numOrNull(r.operating_income);
    const t = numOrNull(r.effective_tax_rate);
    if (ebit == null || t == null) return null;
    const nopat = ebit * (1 - Math.min(Math.max(t, 0), 1));
    if (!nopat) return null;
    const capex = numOrNull(r.capital_expenditures);
    const da = numOrNull(r.d_and_a);
    if (capex == null || da == null) return null;
    return (Math.abs(capex) - da) / nopat;
}

/**
 * Build the object the existing panels consume. Anything not derivable from
 * the statements alone is left ABSENT so the panel's own fallback decides,
 * rather than being handed a zero that reads as a measurement.
 */
export function derivedFromStatements(rows) {
    if (!rows || !rows.length) return null;
    const cur = rows[0];
    const prev = rows[1] || null;

    const p = piotroski(cur, prev);
    const a = altmanZDoublePrime(cur);

    // Newest-first in, oldest-first out: a history is read left to right.
    const cccHistory = rows
        .filter(r => finite(r.cash_conversion_cycle))
        .slice(0, 5)
        .map(r => ({ year: r.fiscal_year, ccc: Number(r.cash_conversion_cycle) }))
        .reverse();

    const divCovOfFcf = numOrNull(cur.dividend_coverage_of_fcf);

    // Why a figure is missing matters as much as that it is. A bank's
    // operating cycle is NOT DEFINED (EQ-2's statement_profile gate nulls the
    // working capital, CCC, ROIC and cash-conversion columns), so a panel that
    // renders N/A there is reporting a gate as a data failure — the same shape
    // as a transport error rendering as a statement about the data.
    const profile = cur.statement_profile || null;
    const withheld = {};
    if (profile === 'financial') {
        withheld.reason = 'financial_profile';
        withheld.note = 'A financial institution has no operating cycle and no working-capital '
                      + 'cycle, and its interest expense is a cost of revenue rather than a '
                      + 'leverage signal. These are WITHHELD by construction, not missing. The '
                      + 'CFA framework for one is CAMELS, and it needs as-reported line items '
                      + '(Tier 1 capital, risk-weighted assets, NPLs) the normalised statements '
                      + 'do not carry.';
        withheld.fields = ['altman_z', 'ccc_history', 'roic', 'accrual_quality', 'sloan_accrual'];
    }

    const out = {
        _source: 'statements',
        _statementProfile: profile,
        _withheld: withheld.reason ? withheld : null,
        _fiscalYear: cur.fiscal_year,
        _periods: rows.length,

        piotroski_f: p.score,
        piotroski_detail: p.detail,
        piotroski_determinable: p.determinable,
        // Same shape as `altman_refused`: a REFUSAL to form the composite,
        // not an absence of data. `mergeDerived` must not let a 9-point score
        // from `equity_fundamentals_derived` stand in for one the statements
        // declined to form.
        piotroski_partial: p.complete !== true,

        altman_z: a.z,
        altman_components: a.components,
        altman_model: a.model,
        // A REFUSAL, not an absence. `mergeDerived` must not let a partial
        // X3+X4 score from equity_fundamentals_derived stand in for a Z'' the
        // statements deliberately declined to form — CodeRabbit, PR #806, and
        // JPM is the live case: its X1 is null because a bank has no working
        // capital, so the statements refuse and the table's partial survives.
        altman_refused: a.partial === true,

        sloan_accrual: numOrNull(cur.sloan_accrual_ratio),
        accrual_quality: numOrNull(cur.cash_conversion),
        ccc_history: cccHistory.length ? cccHistory : null,

        roic: numOrNull(cur.roic),
        reinvest_rate: reinvestmentRate(cur),
        // The panel reads coverage as FCF per unit of dividend; the view
        // publishes the reciprocal (dividends as a share of FCF).
        div_coverage: divCovOfFcf ? 1 / divCovOfFcf : null,
    };

    // BENEISH IS NOT COMPUTED and is deliberately absent rather than null-filled.
    // Its eight factors need receivables, PPE and SG&A, which the fundamentals
    // view does not publish yet (they exist in its base CTE). Emitting a key
    // here would let the panel render an M-score built from missing terms.
    return out;
}

/**
 * The statements are the better source wherever they carry a value, but they
 * do not cover everything the stale table held. Merge with the statements
 * winning per KEY, never wholesale: a null from the statements must not erase
 * a real figure, and a real figure from the statements must not be shadowed.
 */
export function mergeDerived(fromTable, fromStatements) {
    if (!fromStatements) return fromTable || null;
    if (!fromTable) return fromStatements;
    const out = Object.assign({}, fromTable);
    Object.keys(fromStatements).forEach(function (k) {
        const v = fromStatements[k];
        if (v !== null && v !== undefined) out[k] = v;
    });
    // ONE EXCEPTION to "a null from the statements must not erase a real
    // figure": a REFUSED Altman. `compute_ticker_derived` publishes
    // `6.72*x3 + 1.05*x4` when it cannot form x1 and x2 — a partial score that
    // the panel then reads under full Z'' bands. That is not a real figure to
    // preserve, so the refusal wins and the key is DELETED rather than nulled:
    // a renderer cannot print a number it was never handed.
    if (fromStatements.altman_refused === true) {
        delete out.altman_z;
        delete out.altman_components;
    }
    // And the same for a partial F-Score, for the same reason: the table
    // publishes a 9-point composite whether or not nine criteria resolved,
    // and the card's bands are defined over nine.
    if (fromStatements.piotroski_partial === true) {
        delete out.piotroski_f;
    }
    return out;
}

// ============================================================
// Company type, derived from the statements rather than asserted.
//
// The brief asks for "Growth / Value / mature / early stage". That is a claim
// about a company's phase, and the statements can support it: revenue
// trajectory, whether earnings are positive and stable, what share of profit
// is returned rather than reinvested, and how long the filing history runs.
//
// Bands are ABSOLUTE and stated on the card, never quantiles over whatever
// happens to be loaded — a quantile rule would relabel a company because its
// peers changed, which is a ranking dressed as a classification.
//
// Returns null when the evidence is not there. A company whose phase cannot be
// established is not "mature by default".
// ============================================================

export const PHASE_BANDS = {
    highGrowth: 0.15,   // revenue CAGR above this reads as growth
    lowGrowth: 0.05,    // and below this as mature
    maturePayout: 0.30, // returning this share of earnings reads as mature
};

/** Compound annual growth over the loaded window; null if either end is unusable. */
export function revenueCagr(rows) {
    if (!rows || rows.length < 2) return null;
    const newest = rows[0], oldest = rows[rows.length - 1];
    const a = numOrNull(newest.total_revenue);
    const b = numOrNull(oldest.total_revenue);
    if (a == null || b == null || b <= 0 || a <= 0) return null;
    const years = rows.length - 1;
    if (years < 1) return null;
    return Math.pow(a / b, 1 / years) - 1;
}

export function companyPhase(rows) {
    if (!rows || !rows.length) return null;
    const cur = rows[0];
    const cagr = revenueCagr(rows);
    const payout = numOrNull(cur.dividend_payout_ratio);
    const ni = numOrNull(cur.net_income);

    // Loss-making with a filing history too short to show a trend is the one
    // case the statements genuinely cannot place.
    const profitable = ni == null ? null : ni > 0;
    const lossMaking = profitable === false;

    const evidence = {
        revenueCagr: cagr,
        periods: rows.length,
        payoutRatio: payout,
        profitable: profitable,
        reinvestmentRate: reinvestmentRate(cur),
    };

    if (cagr == null && payout == null && profitable == null) return null;

    let phase = null;
    let why = null;
    if (lossMaking && cagr != null && cagr >= PHASE_BANDS.highGrowth) {
        phase = 'Early stage';
        why = 'growing fast and not yet profitable';
    } else if (cagr != null && cagr >= PHASE_BANDS.highGrowth) {
        phase = 'Growth';
        why = 'revenue compounding above ' + Math.round(PHASE_BANDS.highGrowth * 100) + '% a year';
    } else if (cagr != null && cagr < PHASE_BANDS.lowGrowth
               && payout != null && payout >= PHASE_BANDS.maturePayout) {
        phase = 'Mature';
        why = 'low revenue growth and returning a substantial share of earnings';
    } else if (cagr != null && cagr < PHASE_BANDS.lowGrowth) {
        phase = 'Mature / low growth';
        why = 'revenue compounding below ' + Math.round(PHASE_BANDS.lowGrowth * 100) + '% a year';
    } else if (cagr != null) {
        phase = 'Steady';
        why = 'revenue growth between the growth and mature bands';
    }
    if (!phase) return null;
    return { phase, why, evidence, bands: PHASE_BANDS };
}
