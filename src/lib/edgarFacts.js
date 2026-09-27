// ============================================================
// EDGAR companyfacts -> normalised annual statement rows.
//
// PURE. No network, no database. Given one `companyfacts` payload it returns
// rows shaped exactly like `company_income_statement` / `company_balance_sheet`
// / `company_cash_flow`, so nothing downstream of `vw_company_fundamentals`
// has to change.
//
// WHY EDGAR AND NOT A VENDOR. Measured 2026-09-24 against production:
//
//   - Alpha Vantage gives 20 annual periods and is capped at 25 requests/day
//     on two independent free keys -- 3 calls per symbol, so ~8 symbols/day
//     against a 913-symbol universe. That is the ceiling EQ-1 recorded.
//   - Finnhub `financials-reported` is 60/min with no daily cap, but it is a
//     SEC 10-K feed: 4 of 4 foreign private issuers return zero rows, and its
//     per-filer field coverage is a face-statement parse (AAPL 16/16 on every
//     core field, TGT/XOM/UNP/NVDA a uniform ceiling of 13).
//   - EDGAR companyfacts is ONE call per company for every concept the filer
//     ever tagged, every period, no key and no daily cap (10 req/s). ASML --
//     zero rows from Finnhub -- returns 19-20 years on all ten core fields,
//     and files its 20-F in `us-gaap`, not IFRS.
//
// It is also the filing itself rather than a vendor's parse, so provenance
// (accession, filed date) comes free and a restatement is resolvable.
//
// FOUR TRAPS, ALL MEASURED RATHER THAN ANTICIPATED.
//
// 1. `fy`/`fp` DESCRIBE THE FILING, NOT THE FACT. A FY2025 10-K carries the
//    FY2023 comparative column stamped `fy: 2025, fp: 'FY'`. Keying a period
//    on `fy` collapses every comparative onto the filing year and UNDERCOUNTS:
//    TGT total_revenue read 17 years keyed on `fy` and 19 keyed on the fact's
//    own `end` date. The period is the `end` date. Always.
//
// 2. A FLOW NEEDS AN ANNUAL DURATION. `Revenues` appears with quarterly and
//    year-to-date durations in the same filing. A fact with a `start` is a
//    flow and is kept only at ~365 days; a fact with no `start` is a stock
//    (a balance-sheet instant) and has no duration to test.
//
// 3. ONE CONCEPT PER FIELD IS NOT ENOUGH -- THE TAG CHANGES WITH THE
//    ACCOUNTING ERA. TGT's net income is THREE tags end to end:
//      ProfitLoss                                       2007-2011
//      NetIncomeLossAvailableToCommonStockholdersBasic   2009-2021
//      NetIncomeLoss                                     2020-2025
//    Union = 19 years; `NetIncomeLoss` alone = 11. Same shape as the LDTI and
//    CECL splits EQ-4 found in banks and insurers, now in a retailer. So every
//    field is an ORDERED alias list and the winning concept is recorded, which
//    is what makes a wrong mapping diagnosable instead of merely wrong.
//
// 4. THE THREE STATEMENTS MUST SHARE ONE PERIOD-END DATE. The consumer view
//    INNER JOINs them on `fiscal_date_ending`, so an income statement ending
//    2025-02-01 against a balance instant dated 2025-02-02 drops the symbol
//    from the view ENTIRELY -- it would load clean and display nothing. Every
//    fact is therefore bucketed into a fiscal year first, and all three rows
//    for that year are stamped with ONE canonical end date.
//
// ABSENT IS NEVER ZERO. A field whose aliases are all missing is NULL. XOM
// tags no `OperatingIncomeLoss` and no `GrossProfit` at all, and TGT tags no
// `Liabilities` -- corroborated absent by Finnhub independently, so these are
// facts about what the filer reports, not parse gaps. A zero would read as a
// company that earned nothing.
// ============================================================

export const SOURCE_EDGAR = 'edgar';

/** Forms whose facts describe a full financial year. */
export const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);

/** A flow is annual at ~365 days. Narrow enough to exclude a 3-quarter YTD. */
const MIN_FLOW_DAYS = 330;
const MAX_FLOW_DAYS = 400;

/**
 * A fiscal year ending in January or February belongs to the PRIOR calendar
 * year -- Target's year ending 2026-01-31 is FY2025. Matches the direction of
 * `atlas_fiscal_aligned_year`'s six-month shift; kept at two months here
 * because this only has to bucket a filer against ITSELF.
 */
export function fiscalYearOf(endISO) {
    if (typeof endISO !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(endISO)) return null;
    const y = Number(endISO.slice(0, 4));
    const m = Number(endISO.slice(5, 7));
    return m <= 2 ? y - 1 : y;
}

function dayspan(startISO, endISO) {
    const a = Date.parse(startISO + 'T00:00:00Z');
    const b = Date.parse(endISO + 'T00:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.round((b - a) / 86400000);
}

function isFiniteNum(v) {
    return typeof v === 'number' && isFinite(v);
}

// ── field -> ordered concept aliases ────────────────────────────────────────
// Ordered most-preferred first WITHIN an era-free reading; coverage is a union
// across aliases, so order only decides which wins when a period has several.

export const INCOME_FIELDS = {
    total_revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues',
        'SalesRevenueNet', 'SalesRevenueGoodsNet', 'RevenueFromContractWithCustomerIncludingAssessedTax',
        'RevenuesNetOfInterestExpense'],
    cost_of_revenue: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', 'CostOfServices'],
    gross_profit: ['GrossProfit'],
    operating_income: ['OperatingIncomeLoss'],
    operating_expenses: ['OperatingExpenses', 'CostsAndExpenses'],
    selling_general_and_administrative: ['SellingGeneralAndAdministrativeExpense',
        'GeneralAndAdministrativeExpense'],
    research_and_development: ['ResearchAndDevelopmentExpense'],
    depreciation_and_amortization: ['DepreciationDepletionAndAmortization',
        'DepreciationAmortizationAndAccretionNet', 'DepreciationAndAmortization'],
    interest_expense: ['InterestExpense', 'InterestExpenseDebt', 'InterestIncomeExpenseNet'],
    net_interest_income: ['InterestIncomeExpenseNet'],
    income_before_tax: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
        'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'],
    income_tax_expense: ['IncomeTaxExpenseBenefit'],
    comprehensive_income_net_of_tax: ['ComprehensiveIncomeNetOfTax'],
    // The three-era split. See trap 3.
    net_income: ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'],
};

export const BALANCE_FIELDS = {
    total_assets: ['Assets'],
    total_current_assets: ['AssetsCurrent'],
    cash_and_cash_equivalents: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsAndShortTermInvestments'],
    short_term_investments: ['ShortTermInvestments', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'],
    inventory: ['InventoryNet'],
    current_net_receivables: ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent'],
    property_plant_equipment: ['PropertyPlantAndEquipmentNet'],
    goodwill: ['Goodwill'],
    intangible_assets_excluding_goodwill: ['FiniteLivedIntangibleAssetsNet', 'IntangibleAssetsNetExcludingGoodwill'],
    total_liabilities: ['Liabilities'],
    total_current_liabilities: ['LiabilitiesCurrent'],
    current_accounts_payable: ['AccountsPayableCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent'],
    long_term_debt: ['LongTermDebtNoncurrent', 'LongTermDebt'],
    current_debt: ['DebtCurrent', 'LongTermDebtCurrent'],
    retained_earnings: ['RetainedEarningsAccumulatedDeficit'],
    common_stock_shares_outstanding: ['CommonStockSharesOutstanding', 'CommonStockSharesIssued',
        'EntityCommonStockSharesOutstanding'],
    total_shareholder_equity: ['StockholdersEquity',
        'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
};

export const CASHFLOW_FIELDS = {
    operating_cashflow: ['NetCashProvidedByUsedInOperatingActivities',
        'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
    capital_expenditures: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
    depreciation_depletion_and_amortization: ['DepreciationDepletionAndAmortization',
        'DepreciationAmortizationAndAccretionNet'],
    change_in_receivables: ['IncreaseDecreaseInAccountsReceivable'],
    change_in_inventory: ['IncreaseDecreaseInInventories'],
    stock_based_compensation: ['ShareBasedCompensation'],
    // EQ-1 measured the vendor trap that the buyback sits under a field whose
    // name reads like the opposite. In XBRL it is unambiguous.
    payments_for_repurchase_of_common_stock: ['PaymentsForRepurchaseOfCommonStock'],
    dividend_payout: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'],
    dividend_payout_common_stock: ['PaymentsOfDividendsCommonStock'],
    cashflow_from_investment: ['NetCashProvidedByUsedInInvestingActivities',
        'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations'],
    cashflow_from_financing: ['NetCashProvidedByUsedInFinancingActivities',
        'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations'],
    change_in_cash_and_cash_equivalents: ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect',
        'CashAndCashEquivalentsPeriodIncreaseDecrease'],
    proceeds_from_issuance_of_common_stock: ['ProceedsFromIssuanceOfCommonStock'],
    net_income: ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic', 'ProfitLoss'],
};

/**
 * Every annual observation of one concept, keyed by fiscal year.
 *
 * Returns Map<fiscalYear, {val, end, filed, form, accn, unit, concept}>.
 * A period seen more than once keeps the most recently FILED value, so a
 * restatement supersedes the original print rather than racing it.
 */
export function annualFacts(conceptBlock, conceptName) {
    const out = new Map();
    if (!conceptBlock || typeof conceptBlock !== 'object') return out;
    const units = conceptBlock.units;
    if (!units || typeof units !== 'object') return out;

    for (const unit of Object.keys(units)) {
        // Monetary units only. `shares` and `pure` are handled by the caller
        // for the one share-count field that needs them.
        const arr = units[unit];
        if (!Array.isArray(arr)) continue;
        for (const e of arr) {
            if (!e || !ANNUAL_FORMS.has(e.form)) continue;
            const end = e.end;
            if (typeof end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
            if (!isFiniteNum(e.val)) continue;          // absent, or a sentinel: not a measurement
            if (e.start) {                              // a flow
                const d = dayspan(e.start, end);
                if (d === null || d < MIN_FLOW_DAYS || d > MAX_FLOW_DAYS) continue;
            }
            const fy = fiscalYearOf(end);
            if (fy === null) continue;
            const filed = typeof e.filed === 'string' ? e.filed : '';
            const prev = out.get(fy);
            if (prev && prev.filed >= filed) continue;
            out.set(fy, {
                val: e.val, end, filed, form: e.form,
                accn: e.accn || null, unit, concept: conceptName,
            });
        }
    }
    return out;
}

/** The taxonomy blocks a filer may tag in. ASML files a 20-F in `us-gaap`. */
function conceptBlocks(facts, concept) {
    const found = [];
    if (!facts || typeof facts !== 'object') return found;
    for (const tax of Object.keys(facts)) {
        const block = facts[tax];
        if (block && typeof block === 'object' && block[concept]) {
            found.push(block[concept]);
        }
    }
    return found;
}

/**
 * Resolve one field across its ordered aliases.
 * Returns Map<fiscalYear, fact>. Earlier aliases win a contested period.
 */
function resolveField(facts, aliases) {
    const merged = new Map();
    for (const concept of aliases) {
        for (const block of conceptBlocks(facts, concept)) {
            for (const [fy, fact] of annualFacts(block, concept)) {
                if (!merged.has(fy)) merged.set(fy, fact);
            }
        }
    }
    return merged;
}

/**
 * ONE canonical period-end date per fiscal year, shared by all three
 * statements. See trap 4 -- without this the consumer view's inner join drops
 * the symbol.
 *
 * The anchor is the INCOME STATEMENT's own period end, because that is what
 * defines the fiscal year; a balance-sheet instant that disagrees by a day or
 * two is snapped to it. A fiscal year with no income-statement fact at all
 * falls back to the balance instant, so a filer is never dropped for lacking
 * the anchor.
 */
export function canonicalPeriodEnds(resolved) {
    const anchor = new Map();   // fy -> end (income statement preferred)
    const fallback = new Map();

    for (const field of Object.keys(INCOME_FIELDS)) {
        const m = resolved.income[field];
        if (!m) continue;
        for (const [fy, f] of m) {
            const cur = anchor.get(fy);
            // Latest end date within the year: a filer that changes its year
            // end mid-history should be dated on what it actually reported.
            if (!cur || f.end > cur) anchor.set(fy, f.end);
        }
    }
    for (const group of ['balance', 'cashflow']) {
        for (const field of Object.keys(group === 'balance' ? BALANCE_FIELDS : CASHFLOW_FIELDS)) {
            const m = resolved[group][field];
            if (!m) continue;
            for (const [fy, f] of m) {
                const cur = fallback.get(fy);
                if (!cur || f.end > cur) fallback.set(fy, f.end);
            }
        }
    }
    const out = new Map();
    for (const fy of new Set([...anchor.keys(), ...fallback.keys()])) {
        out.set(fy, anchor.get(fy) || fallback.get(fy));
    }
    return out;
}

/**
 * Normalised annual rows for one symbol.
 *
 * @returns {{income: object[], balance: object[], cashflow: object[], provenance: object}}
 */
export function statementRowsFromFacts(companyfacts, symbol) {
    const facts = (companyfacts && companyfacts.facts) || {};
    const resolved = {
        income: {}, balance: {}, cashflow: {},
    };
    for (const [f, aliases] of Object.entries(INCOME_FIELDS))   resolved.income[f]   = resolveField(facts, aliases);
    for (const [f, aliases] of Object.entries(BALANCE_FIELDS))  resolved.balance[f]  = resolveField(facts, aliases);
    for (const [f, aliases] of Object.entries(CASHFLOW_FIELDS)) resolved.cashflow[f] = resolveField(facts, aliases);

    const ends = canonicalPeriodEnds(resolved);

    // The currency the filer reported in, per fiscal year. Taken from whichever
    // monetary fact is present rather than assumed USD -- a 20-F filer may
    // report in EUR, and `reported_currency` is what tells a consumer so.
    const ccy = new Map();
    for (const group of ['income', 'balance', 'cashflow']) {
        for (const field of Object.keys(resolved[group])) {
            for (const [fy, f] of resolved[group][field]) {
                if (!ccy.has(fy) && f.unit && /^[A-Z]{3}$/.test(f.unit)) ccy.set(fy, f.unit);
            }
        }
    }

    const provenance = { by_field: {}, fiscal_years: [], accessions: {} };

    function build(group, fields) {
        const rows = [];
        for (const fy of [...ends.keys()].sort()) {
            const end = ends.get(fy);
            const row = {
                symbol,
                fiscal_date_ending: end,
                period: 'annual',
                source: SOURCE_EDGAR,
                reported_currency: ccy.get(fy) || null,
            };
            let measured = 0;
            for (const field of Object.keys(fields)) {
                const f = resolved[group][field] && resolved[group][field].get(fy);
                // ABSENT IS NULL, NEVER ZERO.
                row[field] = f ? f.val : null;
                if (f) {
                    measured++;
                    if (!provenance.by_field[field]) provenance.by_field[field] = {};
                    provenance.by_field[field][f.concept] =
                        (provenance.by_field[field][f.concept] || 0) + 1;
                    if (f.accn) provenance.accessions[fy] = f.accn;
                }
            }
            // A row with no measured field at all is not a period. Emitting it
            // would put a fiscal year on screen with every cell empty.
            if (measured > 0) rows.push(row);
        }
        return rows;
    }

    const income   = build('income', INCOME_FIELDS);
    const balance  = build('balance', BALANCE_FIELDS);
    const cashflow = build('cashflow', CASHFLOW_FIELDS);
    provenance.fiscal_years = [...ends.keys()].sort();

    return { income, balance, cashflow, provenance };
}

// ============================================================
// QUARTERLY. Same payload, same field maps, a different period key.
//
// Measured on AAPL, TGT, JPM and AMD companyfacts before writing a line
// (2026-09-27). The quarterly basis is NOT the annual rules with a shorter
// window, because of what a 10-Q actually tags:
//
// 5. A 10-Q REPORTS FLOWS YEAR-TO-DATE, AND OFTEN ONLY YEAR-TO-DATE. AAPL's
//    revenue carries a discrete 90-day fact for every quarter, but its
//    operating cash flow is tagged ONLY at 90 / 181 / 272 days from the
//    fiscal-year start -- there is no three-month cash-flow fact at all. So a
//    quarter's flow is the reported three-month fact where one exists, and
//    otherwise the DIFFERENCE of two consecutive year-to-date facts sharing a
//    start date. Alpha Vantage's quarterly rows are discrete three-month
//    figures (AMD's four quarters sum EXACTLY to the annual on revenue and on
//    CFO), so this is the basis the view already reads.
//
// 6. THERE IS NO 10-Q FOR Q4. The fourth quarter exists only inside the 10-K's
//    annual fact, which shares the year-to-date chain's start date -- so Q4 is
//    annual minus nine-month YTD by the same differencing, with no special
//    case.
//
// 7. A DIFFERENCE IS ONLY A QUARTER IF THE TWO ENDS ARE ONE QUARTER APART. A
//    chain missing its six-month fact would difference nine months against
//    three and publish two quarters as one. Each step must be 60-120 days
//    (13 or 14 weeks, 52/53-week filers included), or the quarter is NULL.
//
// 8. NEVER DIFFERENCE ACROSS CONCEPTS. TGT's net income is `ProfitLoss` in one
//    era and `NetIncomeLoss` in another, and the two differ by the
//    noncontrolling interest. Annual `ProfitLoss` minus nine-month
//    `NetIncomeLoss` is not a quarter of anything. Chains are built per
//    concept and the aliases are merged only AFTER, earlier alias winning.
//
// Balance-sheet fields are instants and need none of this: the value at the
// quarter end, latest filing winning, snapped to the income statement's
// quarter end within a week (trap 4, for quarters).
// ============================================================

/** Forms whose facts can describe a fiscal quarter. The 10-K carries Q4. */
export const QUARTERLY_FORMS = new Set(['10-Q', '10-Q/A', '10-K', '10-K/A']);

/** One fiscal quarter: 13 or 14 weeks, with room for a filer's calendar. */
const MIN_Q_DAYS = 60;
const MAX_Q_DAYS = 120;

/** A balance instant this close to an income quarter end is the same quarter. */
const SNAP_DAYS = 7;
const DAY_MS = 86400000;
// Quarters must sum to the annual within this share of it (rounding in a
// filing is in whole millions; 0.5% is well clear of that and well inside
// any restatement worth catching).
const RECONCILE_TOL = 0.005;

/**
 * Every quarter of ONE concept, keyed by period-end date.
 *
 * Returns Map<endISO, {val, end, filed, form, accn, unit, concept, derived}>.
 * `derived` is true when the value is a difference of two year-to-date facts
 * rather than a reported three-month (or instant) fact.
 */
export function quarterlyFacts(conceptBlock, conceptName, crossVintage) {
    const out = new Map();
    if (!conceptBlock || typeof conceptBlock !== 'object') return out;
    const units = conceptBlock.units;
    if (!units || typeof units !== 'object') return out;

    for (const unit of Object.keys(units)) {
        const arr = units[unit];
        if (!Array.isArray(arr)) continue;

        const instants = new Map();   // end -> fact
        const flows = new Map();      // start|end -> fact
        for (const e of arr) {
            if (!e || !QUARTERLY_FORMS.has(e.form)) continue;
            const end = e.end;
            if (typeof end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
            if (!isFiniteNum(e.val)) continue;
            const filed = typeof e.filed === 'string' ? e.filed : '';
            const fact = { val: e.val, end, filed, form: e.form, accn: e.accn || null, unit, concept: conceptName };
            if (e.start) {
                const d = dayspan(e.start, end);
                if (d === null || d < MIN_Q_DAYS || d > MAX_FLOW_DAYS) continue;
                const key = e.start + '|' + end;
                const prev = flows.get(key);
                // Every value this period was ever filed at. A period filed at
                // two values was RESTATED, and a difference taken against it
                // may pair the restated figure with an unrestated one.
                const vals = prev ? prev.vals : new Set();
                vals.add(e.val);
                if (prev && prev.filed >= filed) continue;   // restatement supersedes
                flows.set(key, { ...fact, start: e.start, days: d, vals });
            } else {
                const prev = instants.get(end);
                if (prev && prev.filed >= filed) continue;
                instants.set(end, fact);
            }
        }

        for (const [end, f] of instants) {
            if (!out.has(end)) out.set(end, { ...f, derived: false });
        }

        // Reported three-month facts first: a quarter the filer tagged beats
        // one reconstructed from its year-to-date figures.
        for (const f of flows.values()) {
            if (f.days > MAX_Q_DAYS) continue;
            if (!out.has(f.end)) out.set(f.end, { val: f.val, end: f.end, filed: f.filed, form: f.form,
                accn: f.accn, unit, concept: conceptName, derived: false });
        }

        // Year-to-date chains, one per fiscal-year start date (trap 5, 6, 7).
        const chains = new Map();
        for (const f of flows.values()) {
            if (!chains.has(f.start)) chains.set(f.start, []);
            chains.get(f.start).push(f);
        }
        for (const chain of chains.values()) {
            chain.sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0));
            for (let i = 1; i < chain.length; i++) {
                const a = chain[i - 1];
                const b = chain[i];
                const step = dayspan(a.end, b.end);
                if (step === null || step < MIN_Q_DAYS || step > MAX_Q_DAYS) continue;
                if (out.has(b.end)) continue;
                // CROSS-VINTAGE (CodeRabbit, PR #840). If either end of the
                // difference was restated, the latest versions of the two may
                // come from different filings: TGT's Q4 FY2013 would be the
                // restated annual minus the ORIGINAL nine-month figure and
                // absorb the whole restatement. The annual reconciliation
                // cannot see that -- the four quarters then sum to the very
                // annual Q4 was built from. So the quarter is withheld unless
                // both ends are unrestated or come from one filing.
                const restated = a.vals.size > 1 || b.vals.size > 1;
                if (restated && !(a.accn && a.accn === b.accn)) {
                    if (Array.isArray(crossVintage)) crossVintage.push({ concept: conceptName, end: b.end });
                    continue;
                }
                out.set(b.end, {
                    val: b.val - a.val, end: b.end,
                    filed: a.filed > b.filed ? a.filed : b.filed,
                    form: b.form, accn: b.accn, unit, concept: conceptName, derived: true,
                });
            }
        }
    }
    return out;
}

/** One field across its aliases, quarterly. Earlier aliases win a quarter. */
function resolveQuarterField(facts, aliases, crossVintage) {
    const merged = new Map();
    for (const concept of aliases) {
        for (const block of conceptBlocks(facts, concept)) {
            for (const [end, fact] of quarterlyFacts(block, concept, crossVintage)) {
                if (!merged.has(end)) merged.set(end, fact);
            }
        }
    }
    return merged;
}

/**
 * The quarter ends every row is keyed on, from the INCOME STATEMENT: a quarter
 * with no measured income field is not a quarter this layer can publish, since
 * the consumer view inner-joins all three statements on the date. Ends within
 * a week of each other are one quarter, dated on the latest.
 *
 * Returns Map<anyEndISO, canonicalEndISO> covering the anchor ends only.
 */
export function canonicalQuarterEnds(resolvedIncome) {
    const ends = new Set();
    for (const m of Object.values(resolvedIncome)) {
        if (m) for (const end of m.keys()) ends.add(end);
    }
    const sorted = [...ends].sort();
    const out = new Map();
    let cluster = [];
    const flush = () => {
        if (!cluster.length) return;
        const canon = cluster[cluster.length - 1];
        for (const e of cluster) out.set(e, canon);
        cluster = [];
    };
    for (const e of sorted) {
        if (cluster.length && dayspan(cluster[cluster.length - 1], e) > SNAP_DAYS) flush();
        cluster.push(e);
    }
    flush();
    return out;
}

/** Re-key one field's quarter map onto the canonical ends; nearest fact wins. */
function snapToQuarters(fieldMap, canonical) {
    const canonEnds = [...new Set(canonical.values())].sort();
    const out = new Map();
    const dist = new Map();
    for (const [end, f] of fieldMap) {
        let best = null;
        let bestD = Infinity;
        for (const c of canonEnds) {
            const d = Math.abs(dayspan(end, c));
            if (d <= SNAP_DAYS && d < bestD) { best = c; bestD = d; }
        }
        if (best === null) continue;
        if (!out.has(best) || bestD < dist.get(best)) { out.set(best, f); dist.set(best, bestD); }
    }
    return out;
}

/**
 * Normalised QUARTERLY rows for one symbol, `period = 'quarterly'`.
 *
 * Flows are discrete three-month figures (reported, or differenced from the
 * year-to-date chain), balance fields are quarter-end instants. Absent is
 * NULL, never zero, exactly as on the annual basis.
 *
 * A foreign private issuer files no 10-Q, so it returns no quarters -- the
 * honest answer, not a gap to fill from the annual figures.
 *
 * @returns {{income: object[], balance: object[], cashflow: object[], provenance: object}}
 */
export function quarterlyStatementRowsFromFacts(companyfacts, symbol) {
    const facts = (companyfacts && companyfacts.facts) || {};
    const resolved = { income: {}, balance: {}, cashflow: {} };
    // Quarters withheld as cross-vintage, per field, where no other alias
    // supplied that quarter. Recorded so an absent quarter says why.
    const crossVintage = {};
    const resolveTracked = (field, aliases) => {
        const sink = [];
        const m = resolveQuarterField(facts, aliases, sink);
        const ends = [...new Set(sink.filter(x => !m.has(x.end)).map(x => x.end))].sort();
        if (ends.length) crossVintage[field] = ends;
        return m;
    };
    for (const [f, a] of Object.entries(INCOME_FIELDS))   resolved.income[f]   = resolveTracked(f, a);
    const canonical = canonicalQuarterEnds(resolved.income);
    for (const f of Object.keys(INCOME_FIELDS)) resolved.income[f] = snapToQuarters(resolved.income[f], canonical);
    for (const [f, a] of Object.entries(BALANCE_FIELDS))  resolved.balance[f]  = snapToQuarters(resolveTracked(f, a), canonical);
    for (const [f, a] of Object.entries(CASHFLOW_FIELDS)) resolved.cashflow[f] = snapToQuarters(resolveTracked(f, a), canonical);

    const quarters = [...new Set(canonical.values())].sort();

    // RECONCILE EVERY DERIVED QUARTER AGAINST THE ANNUAL IT CAME FROM.
    // A derived quarter is a difference of two facts that can come from
    // different filings, and a filer restates between them (TGT re-cut FY2013
    // for discontinued Canada after its 10-Qs were filed: quarters sum to
    // 72,597m against a restated annual of 71,279m). So where all four
    // quarters of a fiscal year carry a field and they do not sum to that
    // year's annual figure, the DERIVED quarters of that field are withheld:
    // a residual built across two vintages is not a quarter of either.
    // Reported quarters stay -- they are what the filer published.
    const unreconciled = {};
    const restated = {};
    const annualCache = new Map();
    const annualOf = (concept) => {
        if (!annualCache.has(concept)) {
            const list = [];
            for (const block of conceptBlocks(facts, concept)) {
                for (const f of annualFacts(block, concept).values()) list.push(f);
            }
            annualCache.set(concept, list);
        }
        return annualCache.get(concept);
    };
    const years = [];
    for (let i = 0; i + 3 < quarters.length; i++) {
        const span = Date.parse(quarters[i + 3]) - Date.parse(quarters[i]);
        if (span >= 250 * DAY_MS && span <= 300 * DAY_MS) years.push(quarters.slice(i, i + 4));
    }
    for (const [group, fields] of [['income', INCOME_FIELDS], ['cashflow', CASHFLOW_FIELDS]]) {
        for (const field of Object.keys(fields)) {
            const m = resolved[group][field];
            for (const yr of years) {
                const fs = yr.map(q => m.get(q));
                if (fs.some(f => !f)) continue;
                const concept = fs[3].concept;
                if (fs.some(f => f.concept !== concept)) continue;   // two measures: nothing to test against
                const last = Date.parse(fs[3].end);
                const ann = annualOf(concept).find(f =>
                    f.unit === fs[3].unit && Math.abs(Date.parse(f.end) - last) <= SNAP_DAYS * DAY_MS);
                if (!ann) continue;
                const sum = fs.reduce((t, f) => t + f.val, 0);
                if (Math.abs(sum - ann.val) <= RECONCILE_TOL * Math.max(Math.abs(ann.val), 1)) continue;
                const derivedQs = yr.filter(q => m.get(q).derived);
                const bucket = derivedQs.length ? unreconciled : restated;
                (bucket[field] = bucket[field] || []).push(yr[3]);
                for (const q of derivedQs) m.delete(q);
            }
        }
    }

    const ccy = new Map();
    for (const group of ['income', 'balance', 'cashflow']) {
        for (const m of Object.values(resolved[group])) {
            for (const [q, f] of m) {
                if (!ccy.has(q) && f.unit && /^[A-Z]{3}$/.test(f.unit)) ccy.set(q, f.unit);
            }
        }
    }

    const provenance = { quarters: [], derived_by_field: {}, reported_by_field: {}, unreconciled, restated, cross_vintage: crossVintage };

    function build(group, fields) {
        const rows = [];
        for (const q of quarters) {
            const row = {
                symbol,
                fiscal_date_ending: q,
                period: 'quarterly',
                source: SOURCE_EDGAR,
                reported_currency: ccy.get(q) || null,
            };
            let measured = 0;
            for (const field of Object.keys(fields)) {
                const f = resolved[group][field].get(q);
                row[field] = f ? f.val : null;     // ABSENT IS NULL, NEVER ZERO.
                if (f) {
                    measured++;
                    const bucket = f.derived ? provenance.derived_by_field : provenance.reported_by_field;
                    bucket[field] = (bucket[field] || 0) + 1;
                }
            }
            if (measured > 0) rows.push(row);
        }
        return rows;
    }

    const income   = build('income', INCOME_FIELDS);
    const balance  = build('balance', BALANCE_FIELDS);
    const cashflow = build('cashflow', CASHFLOW_FIELDS);
    provenance.quarters = income.map(r => r.fiscal_date_ending);
    return { income, balance, cashflow, provenance };
}

export default statementRowsFromFacts;
