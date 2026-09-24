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

export default statementRowsFromFacts;
