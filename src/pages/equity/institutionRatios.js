// ============================================================
// Equity Research — the EQ-4 institution layer's reader.
//
// `vw_company_institution_ratios` answers what the normalised statements
// cannot: a bank has no operating cycle and no free-cash-flow base, and
// EQ-2's `statement_profile` gate correctly nulls those columns for one. The
// CFA L2 V3 LM4 instruments — CAMELS for a depository, the short-duration and
// long-duration insurer legs — are computed from as-reported XBRL lines
// instead, and this module puts them on screen.
//
// The shape builder is PURE and lives in `src/lib/institutionView.js`; this
// file is transport only. Its states and `buildInstitutionView` are
// re-exported below so a consumer crosses one module boundary.
// ============================================================
import { sb } from '../config.js';
import { fetchPaged } from '../../lib/pagedRead.js';

import {
    INST_LOADED, INST_NO_FRAMEWORK, INST_NOT_LOADED, INST_FAILED,
} from '../../lib/institutionView.js';

// Re-exported so a consumer gets the states, the shape builder and the load
// through ONE module boundary.
export {
    INST_LOADED, INST_NO_FRAMEWORK, INST_NOT_LOADED, INST_FAILED,
    buildInstitutionView, FRAMEWORK_LABEL, withheldSentence,
} from '../../lib/institutionView.js';

/** Rows come back newest-first. */
export function loadInstitutionRatios(symbol) {
    // TOTAL ORDER: the view GROUPs by (symbol, fiscal_year), and the symbol is
    // pinned by the filter, so fiscal_year alone is unique within the result
    // set. Measured rather than reasoned: JPM returns 15 rows, 15 distinct
    // fiscal_year, 0 ties. Paged anyway, for the reason every PostgREST read
    // in this repo is: `limit` is a request, and so is no limit.
    return fetchPaged(
        (from, to) => sb.from('vw_company_institution_ratios')
            .select('*')
            .eq('symbol', symbol)
            .order('fiscal_year', { ascending: false })
            .range(from, to),
        'vw_company_institution_ratios');
}

/**
 * One call for the panel. Never throws: a transport failure is a STATE.
 */
export async function loadInstitutionLayer(symbol) {
    if (!symbol) return { state: INST_NOT_LOADED, symbol: symbol || null, rows: [] };
    try {
        const rows = await loadInstitutionRatios(symbol);
        if (!rows.length) return { state: INST_NOT_LOADED, symbol, rows: [] };
        return { state: INST_LOADED, symbol, rows };
    } catch (e) {
        // Error level. A swallowed failure here is indistinguishable from a
        // symbol nobody has loaded, and the two need opposite responses.
        console.error('institutionRatios: load failed for ' + symbol, e);
        return { state: INST_FAILED, symbol, rows: [], error: (e && e.message) || String(e) };
    }
}
