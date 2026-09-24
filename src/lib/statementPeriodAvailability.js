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
//
// ------------------------------------------------------------
// SECOND DEFECT, found auditing the first fix (2026-09-24).
//
// The first version read `income_quarterly` as "the quarterly basis carries
// periods". IT IS ONE STATEMENT'S ROW COUNT. `vw_company_fundamentals` INNER
// JOINs all three statements, so a basis renders only where three share a
// fiscal date -- which is why the view publishes `aligned_annual_periods` and
// not `income_annual`. There was no quarterly equivalent, so the module was
// reading the only quarterly number on offer and it was the wrong one.
//
// Live on SNDK (income statement only -- the half-loaded symbol EQ-2 records):
// `income_quarterly = 12`, aligned quarterly periods **0**. The panel offered
// "Show the quarterly statements ->", the switch returned no rows, and this
// module then called a KNOWN, NAMED state -- incomplete, stated on the same
// row by `is_complete = false` -- a "fault to chase". A dead-end button and a
// phantom fault, in the module written to stop exactly that sentence.
//
// Two corrections:
//   * read `aligned_quarterly_periods` (EQ-9c adds it) -- the count that
//     predicts whether the basis returns rows;
//   * test INCOMPLETE **before** the period branches. A symbol whose
//     statements did not all land cannot render on any basis, so offering a
//     switch is offering a dead end, and a contradiction claim is false.
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
 *   state: 'not_loaded'|'period_absent'|'incomplete'|'coverage_disagrees',
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
    // ALIGNED, never `income_quarterly`: the consumer view inner-joins the
    // three statements, so one statement's row count does not say whether the
    // basis renders. SNDK carried 12 income-quarterly rows and 0 aligned.
    const quarterly = count(c && c.aligned_quarterly_periods);
    const present   = count(c && c.statements_present);
    // Read only to decide whether the symbol is loaded at all -- a symbol can
    // carry income rows on a basis that cannot render, and that is still a
    // symbol somebody loaded.
    const incomeQuarterly = count(c && c.income_quarterly);

    // Nothing anywhere: the symbol has genuinely never been loaded.
    if (!c || (annual === 0 && quarterly === 0 && present === 0 && incomeQuarterly === 0)) {
        return { state: NOT_LOADED, requested };
    }

    // INCOMPLETE OUTRANKS BOTH PERIOD BRANCHES, and the order is the fix.
    // The three statements did not all land, so no basis can satisfy the join:
    // offering a switch would be a dead end, and calling the empty result a
    // contradiction would name a fault for a state the row already declares.
    // `present === 0` keeps a genuinely quarterly-only symbol out of here --
    // `statements_present` is annual-scoped, so absence of annual statements
    // is not evidence of an incomplete load.
    if (present > 0 && c.is_complete !== true) {
        const out = { state: INCOMPLETE, requested, statementsPresent: present };
        if (c.source) out.source = c.source;
        return out;
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

    // INCOMPLETE is handled above, before the period branches -- reaching here
    // means the symbol is loaded and complete on nothing the tab can show.
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
