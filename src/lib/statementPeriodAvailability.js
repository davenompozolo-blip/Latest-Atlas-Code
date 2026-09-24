// ============================================================
// What the Financials tab may SAY when a period returns no rows.
//
// Pure module: no React, no Supabase, no imports.
//
// Switching AAPL from Annual to Quarterly rendered:
//
//     "Statements for AAPL are not loaded yet"
//     "...the Alpha Vantage key is on the free tier - 25 requests a day..."
//
// BOTH HALVES ARE FALSE FOR THAT SYMBOL. AAPL carries 19 complete annual
// periods, and it was loaded from EDGAR, which has no key and no daily cap --
// so the sentence blames a quota that never applied to it. Measured over the
// loaded set: 9 symbols carry quarterly (all Alpha Vantage), 43 carry annual
// only (the EDGAR cohort), so the wrong message is the MODAL one.
//
// The panel had every fact it needed and never looked at the period.
// `vw_company_statement_coverage` publishes `aligned_annual_periods`,
// `income_quarterly`, `is_complete` and `source` per symbol; the old code
// tested only `statements_present > 0 && !is_complete`, which is false for a
// symbol that is complete on the OTHER basis, so it fell through to the
// generic unloaded copy.
//
// "This symbol is not loaded" and "this symbol has nothing on THIS period
// basis" are different facts and need different sentences -- the same rule
// `institutionView.js` states for not_loaded / no_framework / failed, and the
// same family as a transport failure rendering as a claim about the data.
// ============================================================

export const NOT_LOADED    = 'not_loaded';     // nothing for this symbol, on any basis
export const PERIOD_ABSENT = 'period_absent';  // loaded, but not on the requested basis
export const INCOMPLETE    = 'incomplete';     // some statements landed, no period carries all three
export const COVERAGE_DISAGREES = 'coverage_disagrees'; // coverage claims periods the view did not return

const count = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * @param {?Object} coverage  a `vw_company_statement_coverage` row, or null
 * @param {string}  period    the basis the tab asked for: 'annual' | 'quarterly'
 * @returns {{
 *   state: 'not_loaded'|'period_absent'|'incomplete',
 *   requested: string,
 *   available?: string,        // the basis that DOES carry periods
 *   availableCount?: number,   // how many periods it carries
 *   source?: string,           // which provider loaded it
 *   statementsPresent?: number,
 * }}
 *
 * `available` / `availableCount` are ABSENT unless the other basis genuinely
 * carries periods, so a renderer cannot offer a switch to a basis that is just
 * as empty -- the "absent from the shape" construction this codebase uses
 * wherever a figure might not exist.
 */
export function statementPeriodAvailability(coverage, period) {
    const requested = period === 'quarterly' ? 'quarterly' : 'annual';
    const c = coverage || null;

    const annual    = count(c && c.aligned_annual_periods);
    const quarterly = count(c && c.income_quarterly);
    const present   = count(c && c.statements_present);

    // Nothing anywhere: the symbol has genuinely never been loaded.
    if (!c || (annual === 0 && quarterly === 0 && present === 0)) {
        return { state: NOT_LOADED, requested };
    }

    // THE REQUESTED BASIS CLAIMS PERIODS AND THE VIEW RETURNED NONE.
    // This function is only reached with an empty row set, so reaching it while
    // coverage reports periods on the very basis asked for is a contradiction
    // between two objects, not an absence. Calling it "not loaded" would be the
    // exact defect this module exists to fix, one level down: a sentence about
    // the symbol standing in for a fault somewhere else.
    const requestedCount = requested === 'annual' ? annual : quarterly;
    if (requestedCount > 0) {
        const out = { state: COVERAGE_DISAGREES, requested, requestedCount };
        if (c.source) out.source = c.source;
        return out;
    }

    const otherKey   = requested === 'annual' ? 'quarterly' : 'annual';
    const otherCount = requested === 'annual' ? quarterly : annual;

    if (otherCount > 0) {
        const out = {
            state: PERIOD_ABSENT,
            requested,
            available: otherKey,
            availableCount: otherCount,
        };
        if (c.source) out.source = c.source;
        return out;
    }

    // Statements landed but no period carries all three.
    if (present > 0 && c.is_complete !== true) {
        const out = { state: INCOMPLETE, requested, statementsPresent: present };
        if (c.source) out.source = c.source;
        return out;
    }

    return { state: NOT_LOADED, requested };
}

/**
 * Why the requested basis is empty, in the loader's own terms.
 *
 * EDGAR `companyfacts` DOES carry quarterly facts -- `edgarFacts.js` filters to
 * ANNUAL_FORMS and requires a 330-400 day duration, so quarterly is not fetched
 * rather than not available. Saying "the loader reads annual filings" is the
 * true reason; saying "not loaded yet" invites waiting for something that will
 * never arrive on its own.
 */
export function periodAbsentReason(view) {
    if (!view || view.state !== PERIOD_ABSENT) return null;
    const src = view.source === 'edgar' ? 'EDGAR'
              : view.source === 'alphavantage' ? 'Alpha Vantage'
              : view.source === 'finnhub' ? 'Finnhub' : null;
    const n = view.availableCount;
    const have = n + ' ' + view.available + ' period' + (n === 1 ? '' : 's');

    if (view.requested === 'quarterly' && view.source === 'edgar') {
        return 'This symbol carries ' + have + ', loaded from EDGAR, whose reader takes annual '
             + 'filings only. The quarterly facts exist in the same feed and are not fetched yet, '
             + 'so this is a gap in the loader rather than a gap at the source.';
    }
    return 'This symbol carries ' + have + (src ? ', loaded from ' + src : '')
         + ', and nothing on the ' + view.requested + ' basis.';
}
