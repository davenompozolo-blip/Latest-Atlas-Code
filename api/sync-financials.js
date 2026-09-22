// ============================================================
// sync-financials — the multi-year statement loader.
// ------------------------------------------------------------
// Writes company_income_statement / company_balance_sheet / company_cash_flow
// from Alpha Vantage's normalised statement endpoints. See the EQ-1 migration
// header for why this layer exists and what was measured before building it:
// in short, the platform held ZERO multi-year statements, and every blank cell
// in Equity Research's forensics, capital-allocation and ratio panels traces
// to that one absence.
//
// ## Alpha Vantage signals a rate limit with HTTP 200
//
// The endpoints answer 200 with `{"Information": "..."}` or `{"Note": "..."}`
// when the daily or per-minute cap is hit — no error status, no exception. A
// loader that only looks for `annualReports` therefore parses nothing, writes
// nothing, and closes its sync_log row as `success`. That is the
// "a no-op must not answer 200" defect this codebase has already recorded
// three times, and it would be indistinguishable from a company that simply
// has no filings.
//
// So the rate-limit shape is detected EXPLICITLY and is terminal for the run:
// the remaining symbols are abandoned rather than hammered, the run closes
// `partial` (or `error` if nothing was written at all), and
// `details.rate_limited` plus `details.rate_limit_message` record it. A run
// that stops early because the vendor said stop is legible as exactly that.
//
// ## Budget, and why `refresh_days` matters more than it looks
//
// The key in production may be free tier, which is 25 requests/day against
// 3 requests per symbol. Without a skip rule a nightly job re-fetches the same
// eight names forever and the universe never fills. `refresh_days` skips any
// symbol whose newest row is younger than the window, so each run advances the
// frontier instead of re-treading it.
//
// ## 'None' is NOT zero
//
// Alpha Vantage writes the string "None" for a line item the filing does not
// report. `researchAndDevelopment` is "None" on all 20 of TGT's annual
// periods because a retailer has no R&D line — that is a fact about the
// company, not a gap, and `paymentsForRepurchaseOfCommonStock` is "None" on
// all 20 while `proceedsFromRepurchaseOfEquity` is populated on all 20. Both
// become NULL. A surface reading NULL as 0 would publish "no buyback
// programme" for a company that bought back stock every year for two decades.
// ============================================================

const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
const SB_URL = (process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHA_VANTAGE_KEY || '';
const AV_BASE = 'https://www.alphavantage.co/query';

const SOURCE = 'alphavantage';
const FN_NAME = 'sync_financials';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sbHeaders = key => ({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' });

async function fetchT(url, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 20000);
    try { return await fetch(url, { signal: ac.signal }); }
    finally { clearTimeout(t); }
}

// null for anything that is not a finite number. Never 0 — see the header.
// 'NaN' and 'Infinity' both parse to non-finite Numbers and are refused here
// rather than at the CHECK constraint, so a poisoned value never reaches a
// statement row at all.
export function num(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (s === '' || s === 'None' || s === 'none' || s === '-' || s === 'NaN') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

// Alpha Vantage's own spelling is preserved on the left so a reader can diff
// this against the vendor's response without a translation step. Note
// `costofGoodsAndServicesSold` — lowercase 'of' — which is the vendor's, not a
// typo here.
const INCOME_MAP = {
    costOfRevenue: 'cost_of_revenue',
    costofGoodsAndServicesSold: 'cost_of_goods_and_services_sold',
    grossProfit: 'gross_profit',
    totalRevenue: 'total_revenue',
    operatingIncome: 'operating_income',
    operatingExpenses: 'operating_expenses',
    sellingGeneralAndAdministrative: 'selling_general_and_administrative',
    researchAndDevelopment: 'research_and_development',
    depreciation: 'depreciation',
    depreciationAndAmortization: 'depreciation_and_amortization',
    ebit: 'ebit',
    ebitda: 'ebitda',
    interestExpense: 'interest_expense',
    interestIncome: 'interest_income',
    netInterestIncome: 'net_interest_income',
    interestAndDebtExpense: 'interest_and_debt_expense',
    investmentIncomeNet: 'investment_income_net',
    nonInterestIncome: 'non_interest_income',
    otherNonOperatingIncome: 'other_non_operating_income',
    incomeBeforeTax: 'income_before_tax',
    incomeTaxExpense: 'income_tax_expense',
    netIncomeFromContinuingOperations: 'net_income_from_continuing_operations',
    comprehensiveIncomeNetOfTax: 'comprehensive_income_net_of_tax',
    netIncome: 'net_income',
};

const BALANCE_MAP = {
    totalAssets: 'total_assets',
    totalCurrentAssets: 'total_current_assets',
    cashAndCashEquivalentsAtCarryingValue: 'cash_and_cash_equivalents',
    cashAndShortTermInvestments: 'cash_and_short_term_investments',
    inventory: 'inventory',
    currentNetReceivables: 'current_net_receivables',
    totalNonCurrentAssets: 'total_non_current_assets',
    propertyPlantEquipment: 'property_plant_equipment',
    accumulatedDepreciationAmortizationPPE: 'accumulated_depreciation_amortization_ppe',
    intangibleAssets: 'intangible_assets',
    intangibleAssetsExcludingGoodwill: 'intangible_assets_excluding_goodwill',
    goodwill: 'goodwill',
    investments: 'investments',
    longTermInvestments: 'long_term_investments',
    shortTermInvestments: 'short_term_investments',
    otherCurrentAssets: 'other_current_assets',
    otherNonCurrentAssets: 'other_non_current_assets',
    totalLiabilities: 'total_liabilities',
    totalCurrentLiabilities: 'total_current_liabilities',
    currentAccountsPayable: 'current_accounts_payable',
    deferredRevenue: 'deferred_revenue',
    currentDebt: 'current_debt',
    shortTermDebt: 'short_term_debt',
    totalNonCurrentLiabilities: 'total_non_current_liabilities',
    capitalLeaseObligations: 'capital_lease_obligations',
    longTermDebt: 'long_term_debt',
    currentLongTermDebt: 'current_long_term_debt',
    longTermDebtNoncurrent: 'long_term_debt_noncurrent',
    shortLongTermDebtTotal: 'short_long_term_debt_total',
    otherCurrentLiabilities: 'other_current_liabilities',
    otherNonCurrentLiabilities: 'other_non_current_liabilities',
    totalShareholderEquity: 'total_shareholder_equity',
    treasuryStock: 'treasury_stock',
    retainedEarnings: 'retained_earnings',
    commonStock: 'common_stock',
    commonStockSharesOutstanding: 'common_stock_shares_outstanding',
};

const CASHFLOW_MAP = {
    operatingCashflow: 'operating_cashflow',
    paymentsForOperatingActivities: 'payments_for_operating_activities',
    proceedsFromOperatingActivities: 'proceeds_from_operating_activities',
    changeInOperatingLiabilities: 'change_in_operating_liabilities',
    changeInOperatingAssets: 'change_in_operating_assets',
    depreciationDepletionAndAmortization: 'depreciation_depletion_and_amortization',
    capitalExpenditures: 'capital_expenditures',
    changeInReceivables: 'change_in_receivables',
    changeInInventory: 'change_in_inventory',
    profitLoss: 'profit_loss',
    cashflowFromInvestment: 'cashflow_from_investment',
    cashflowFromFinancing: 'cashflow_from_financing',
    proceedsFromRepaymentsOfShortTermDebt: 'proceeds_from_repayments_of_short_term_debt',
    paymentsForRepurchaseOfCommonStock: 'payments_for_repurchase_of_common_stock',
    paymentsForRepurchaseOfEquity: 'payments_for_repurchase_of_equity',
    paymentsForRepurchaseOfPreferredStock: 'payments_for_repurchase_of_preferred_stock',
    dividendPayout: 'dividend_payout',
    dividendPayoutCommonStock: 'dividend_payout_common_stock',
    dividendPayoutPreferredStock: 'dividend_payout_preferred_stock',
    proceedsFromIssuanceOfCommonStock: 'proceeds_from_issuance_of_common_stock',
    proceedsFromIssuanceOfLongTermDebtAndCapitalSecuritiesNet: 'proceeds_from_issuance_of_lt_debt_and_cap_securities_net',
    proceedsFromIssuanceOfPreferredStock: 'proceeds_from_issuance_of_preferred_stock',
    proceedsFromRepurchaseOfEquity: 'proceeds_from_repurchase_of_equity',
    proceedsFromSaleOfTreasuryStock: 'proceeds_from_sale_of_treasury_stock',
    stockBasedCompensation: 'stock_based_compensation',
    changeInCashAndCashEquivalents: 'change_in_cash_and_cash_equivalents',
    changeInExchangeRate: 'change_in_exchange_rate',
    netIncome: 'net_income',
};

export const STATEMENTS = [
    { fn: 'INCOME_STATEMENT', table: 'company_income_statement', map: INCOME_MAP },
    { fn: 'BALANCE_SHEET',    table: 'company_balance_sheet',    map: BALANCE_MAP },
    { fn: 'CASH_FLOW',        table: 'company_cash_flow',        map: CASHFLOW_MAP },
];

export class RateLimited extends Error {
    constructor(message) { super(message); this.name = 'RateLimited'; }
}

// Alpha Vantage answers 200 for a throttle. `Note` is the classic per-minute
// message, `Information` the daily-cap one; `Error Message` is a bad symbol,
// which is NOT a rate limit and must not abandon the run.
export function assertNotThrottled(json) {
    if (!json || typeof json !== 'object') return;
    const msg = json.Note || json.Information || json['Information '] || null;
    if (msg) throw new RateLimited(String(msg).slice(0, 300));
}

export function rowsFor(json, statement, symbol) {
    const out = [];
    const currency = r => (r && typeof r.reportedCurrency === 'string' && r.reportedCurrency !== 'None')
        ? r.reportedCurrency : null;
    for (const [key, period] of [['annualReports', 'annual'], ['quarterlyReports', 'quarterly']]) {
        const arr = Array.isArray(json[key]) ? json[key] : [];
        for (const rep of arr) {
            const date = rep && rep.fiscalDateEnding;
            // No fiscal date, no row. A statement that cannot say which period
            // it describes is not a period.
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) continue;
            const row = {
                symbol,
                fiscal_date_ending: date,
                period,
                source: SOURCE,
                reported_currency: currency(rep),
            };
            for (const [av, col] of Object.entries(statement.map)) row[col] = num(rep[av]);
            out.push(row);
        }
    }
    return out;
}

async function sbUpsert(table, rows) {
    if (!rows.length) return 0;
    const url = SB_URL + '/rest/v1/' + table
        + '?on_conflict=symbol,fiscal_date_ending,period,source';
    const res = await fetch(url, {
        method: 'POST',
        headers: { ...sbHeaders(SB_SERVICE), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(table + ' upsert ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 200));
    return rows.length;
}

async function sbSelect(path) {
    const res = await fetch(SB_URL + '/rest/v1/' + path, { headers: sbHeaders(SB_SERVICE) });
    if (!res.ok) throw new Error('select ' + path.split('?')[0] + ' ' + res.status);
    return res.json();
}

// Priority order is deliberate: the held book first (those names are on a page
// someone is looking at today), then the wider screener universe. A run that
// can only afford eight symbols should spend them on the book.
async function resolveSymbols(explicit, limit, refreshDays) {
    if (explicit.length) return explicit;

    const held = await sbSelect('vw_positions_current?select=asset_id&limit=2000').catch(() => []);
    const heldIds = held.map(r => r.asset_id).filter(Boolean);
    let heldSyms = [];
    if (heldIds.length) {
        const assets = await sbSelect(
            'assets?select=symbol,asset_class&id=in.(' + heldIds.join(',') + ')&limit=2000'
        ).catch(() => []);
        heldSyms = assets
            // Options expire and have no filings of their own.
            .filter(a => a.symbol && !String(a.asset_class || '').startsWith('us_option'))
            .map(a => a.symbol);
    }

    const universe = await sbSelect('equity_screener_universe?select=symbol&limit=5000').catch(() => []);
    const uniSyms = universe.map(r => r.symbol).filter(Boolean);

    // Skip anything already loaded inside the refresh window, so successive
    // runs advance the frontier instead of re-fetching the same head of the
    // list until the daily cap is spent.
    let fresh = new Set();
    if (refreshDays > 0) {
        const cutoff = new Date(Date.now() - refreshDays * 86400000).toISOString();
        const recent = await sbSelect(
            'company_income_statement?select=symbol&period=eq.annual&source=eq.' + SOURCE
            + '&loaded_at=gte.' + cutoff + '&limit=20000'
        ).catch(() => []);
        fresh = new Set(recent.map(r => r.symbol));
    }

    const seen = new Set();
    const ordered = [];
    for (const s of [...heldSyms, ...uniSyms]) {
        if (!s || seen.has(s) || fresh.has(s)) continue;
        seen.add(s);
        ordered.push(s);
    }
    return ordered.slice(0, limit);
}

export default async function handler(req, res) {
    const secret = (process.env.CRON_SECRET || '').trim();
    if (secret) {
        const auth = req.headers.authorization || '';
        const token = (req.query && req.query.token) || '';
        if (auth !== 'Bearer ' + secret && token !== secret) return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!AV_KEY) {
        console.error('sync_financials: ALPHA_VANTAGE_API_KEY unset — refusing to run');
        return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY unset' });
    }
    if (!SB_SERVICE) {
        console.error('sync_financials: SUPABASE_SERVICE_ROLE_KEY unset — refusing to run');
        return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY unset' });
    }

    const q = req.query || {};
    const explicit = String(q.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const limit = Math.max(1, Math.min(500, Number(q.limit) || 8));
    const refreshDays = q.refresh_days === undefined ? 30 : Math.max(0, Number(q.refresh_days) || 0);
    const paceMs = Math.max(0, Number(q.pace_ms) || 900);
    const budgetMs = Math.max(10000, Math.min(280000, Number(q.budget_ms) || 240000));
    const started = Date.now();

    const summary = {
        scope: explicit.length ? 'explicit' : 'book+universe',
        mode: 'statements',
        source: SOURCE,
        requested: 0, attempted: 0, symbols_written: 0, rows_written: 0,
        av_calls: 0, rate_limited: false, rate_limit_message: null,
        years: {}, failures: [], budget_exhausted: false,
    };

    let logId = null;
    try {
        const ins = await fetch(SB_URL + '/rest/v1/sync_log', {
            method: 'POST', headers: { ...sbHeaders(SB_SERVICE), Prefer: 'return=representation' },
            body: JSON.stringify([{
                function_name: FN_NAME, source: FN_NAME, status: 'running',
                started_at: new Date().toISOString(),
            }]),
        });
        // Never swallowed. A handler that writes its data and no sync_log row
        // cannot be diagnosed afterwards — api/options-snapshot.js did exactly
        // that on 2026-09-09 and the gap was invisible from the chain layer.
        if (ins.ok) { const j = await ins.json().catch(() => null); logId = j && j[0] && j[0].id; }
        else console.error('sync_financials: sync_log open refused', ins.status, await ins.text().catch(() => ''));
    } catch (e) { console.error('sync_financials: sync_log open threw', e && e.message); }

    let symbols = [];
    try {
        symbols = await resolveSymbols(explicit, limit, refreshDays);
        summary.requested = symbols.length;
    } catch (e) {
        summary.failures.push({ stage: 'resolve', error: e.message });
        console.error('sync_financials: symbol resolve failed', e && e.message);
    }

    for (const symbol of symbols) {
        if (Date.now() - started > budgetMs) { summary.budget_exhausted = true; break; }
        summary.attempted++;
        let wroteAny = false;
        try {
            for (const st of STATEMENTS) {
                const url = AV_BASE + '?function=' + st.fn + '&symbol=' + encodeURIComponent(symbol)
                    + '&apikey=' + encodeURIComponent(AV_KEY);
                const r = await fetchT(url, 25000);
                summary.av_calls++;
                if (!r.ok) throw new Error(st.fn + ' http ' + r.status);
                const json = await r.json();
                assertNotThrottled(json);          // throws RateLimited — terminal for the run
                const rows = rowsFor(json, st, symbol);
                if (rows.length) {
                    summary.rows_written += await sbUpsert(st.table, rows);
                    wroteAny = true;
                    if (st.fn === 'INCOME_STATEMENT') {
                        summary.years[symbol] = rows.filter(x => x.period === 'annual').length;
                    }
                }
                if (paceMs) await sleep(paceMs);
            }
            if (wroteAny) summary.symbols_written++;
            else summary.failures.push({ symbol, error: 'no reports returned' });
        } catch (e) {
            if (e instanceof RateLimited) {
                summary.rate_limited = true;
                summary.rate_limit_message = e.message;
                console.error('sync_financials: rate limited, abandoning run —', e.message);
                break;                              // do not hammer a vendor that said stop
            }
            summary.failures.push({ symbol, error: String(e.message).slice(0, 200) });
            console.error('sync_financials:', symbol, e && e.message);
        }
    }

    // Three outcomes, kept apart. `success` only when rows landed and nothing
    // was refused; `skipped` when there was genuinely nothing to do (every
    // candidate inside the refresh window); `error` when we attempted work and
    // produced nothing. An idempotent no-op dressed as a successful write is
    // what hid three separate defects in this codebase.
    let status;
    if (summary.rows_written > 0) status = (summary.failures.length || summary.rate_limited) ? 'partial' : 'success';
    else if (summary.requested === 0) status = 'skipped';
    else status = 'error';

    if (logId != null) {
        try {
            const upd = await fetch(SB_URL + '/rest/v1/sync_log?id=eq.' + logId, {
                method: 'PATCH', headers: sbHeaders(SB_SERVICE),
                // duration_ms is GENERATED ALWAYS from finished_at - started_at.
                // Including it makes PostgREST reject the ENTIRE patch with
                // 428C9 and leaves the row open forever.
                // The row count lives in `details` and NOT in a typed column.
                // sync_log carries positions_/transactions_/prices_upserted and
                // nothing generic; inventing `rows_upserted` makes PostgREST
                // reject the WHOLE patch the same way duration_ms does, which
                // is how 41 rows sat open in 'running' for three months.
                // Verified against information_schema before writing this.
                body: JSON.stringify({
                    finished_at: new Date().toISOString(),
                    status,
                    error_message: summary.rate_limit_message
                        || (summary.failures.length ? summary.failures[0].error : null),
                    details: summary,
                }),
            });
            if (!upd.ok) console.error('sync_financials: sync_log close refused', upd.status, await upd.text().catch(() => ''));
        } catch (e) { console.error('sync_financials: sync_log close threw', e && e.message); }
    }

    return res.status(status === 'error' ? 503 : 200).json(summary);
}
