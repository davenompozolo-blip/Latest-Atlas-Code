// ============================================================
// Equity Research — the statement layer's reader.
//
// Reads the EQ-1/EQ-2 views (company_income_statement / _balance_sheet /
// _cash_flow via vw_company_fundamentals, and vw_company_fundamental_peers)
// for one symbol. These are the ONLY multi-year statements in the platform:
// equity_cache.financials.yearly is empty for every symbol, and its
// `quarterly` array is an EPS-surprise series rather than a statement.
//
// THREE STATES, KEPT APART. "Not loaded" is not "no data", and neither is an
// error. A symbol outside the loaded set must say so and say what to do about
// it, because at ~8 symbols/day on the current Alpha Vantage key most of the
// universe is legitimately not loaded yet. Rendering that as an em dash is
// what makes the module look broken when it is merely empty.
// ============================================================
import { sb } from '../config.js';
import { fetchPaged } from '../../lib/pagedRead.js';

export const STATE_LOADED     = 'loaded';
export const STATE_NOT_LOADED = 'not_loaded';
export const STATE_FAILED     = 'failed';

/** Rows come back newest-first; callers that walk time reverse it themselves. */
export function loadFundamentals(symbol, period) {
    const per = period === 'quarterly' ? 'quarterly' : 'annual';
    // TOTAL ORDER: (symbol, period, source) is pinned by the filter, so
    // fiscal_date_ending alone is unique within the result set — the view is
    // one row per (symbol, fiscal_date_ending, period, source).
    return fetchPaged(
        (from, to) => sb.from('vw_company_fundamentals')
            .select('*')
            .eq('symbol', symbol)
            .eq('period', per)
            .order('fiscal_date_ending', { ascending: false })
            .range(from, to),
        'vw_company_fundamentals');
}

export function loadPeerMedians(symbol, period) {
    const per = period === 'quarterly' ? 'quarterly' : 'annual';
    // TOTAL ORDER: one row per (symbol, period, aligned_year, metric).
    return fetchPaged(
        (from, to) => sb.from('vw_company_fundamental_peers')
            .select('*')
            .eq('symbol', symbol)
            .eq('period', per)
            .order('aligned_year', { ascending: false })
            .order('metric', { ascending: true })
            .range(from, to),
        'vw_company_fundamental_peers');
}

export function loadCoverage(symbol) {
    return sb.from('vw_company_statement_coverage')
        .select('*')
        .eq('symbol', symbol)
        .then(r => { if (r.error) throw r.error; return (r.data && r.data[0]) || null; });
}

/**
 * One call for the whole tab. Never throws: a transport failure is a STATE,
 * not an exception the panel has to guess at — the codebase has four entries
 * about a dead feed rendering as a statement about the data.
 */
export async function loadStatementLayer(symbol, period) {
    if (!symbol) return { state: STATE_NOT_LOADED, symbol: symbol || null, rows: [], peers: [], coverage: null };
    try {
        const [rows, peers, coverage] = await Promise.all([
            loadFundamentals(symbol, period),
            loadPeerMedians(symbol, period),
            loadCoverage(symbol).catch(() => null),
        ]);
        if (!rows.length) {
            return { state: STATE_NOT_LOADED, symbol, rows: [], peers: [], coverage };
        }
        return { state: STATE_LOADED, symbol, rows, peers, coverage };
    } catch (e) {
        // Logged at error level: a silent failure here is indistinguishable
        // from a symbol that simply has not been loaded yet, and the two need
        // completely different actions from whoever is looking at the page.
        console.error('equityStatements: load failed for ' + symbol, e);
        return { state: STATE_FAILED, symbol, rows: [], peers: [], coverage: null, error: (e && e.message) || String(e) };
    }
}

// Re-exported here so a consumer of the statement layer gets the rows and the
// derived view of them through ONE module boundary. Quality & Forensics and
// Capital Allocation read the derived shape; Financials reads the rows; both
// are the same load.
export { derivedFromStatements, mergeDerived } from './statementRows.js';
