// ============================================================
// A holdings row can carry the BOOK without carrying the ANALYTICS.
// ------------------------------------------------------------
// H-4 made `vw_nexus_holdings` draw its rows from the live `vw_portfolio_home`
// and LEFT JOIN `mv_nexus_holdings` for the expensive analytics, so a mark is
// never served from two places at once. The consequence at the client is new:
// a name bought between matview refreshes now ARRIVES, correctly sized and
// priced, with no conviction score, no recommended action, no alert flag and
// no insight line. Before, it was simply absent from every Nexus surface for
// the same window.
//
// The view withholds those four TOGETHER and withholds them as NULL, never as
// a default -- `recommended_action`'s CASE ends in `ELSE 'Exit'`, so a
// defaulted score would have labelled a position bought four minutes ago
// "Exit". That is the rule this module carries into the browser.
//
// ## A PENDING SCORE IS NOT A SCORE OF 50
//
// Every call site read `h.conviction_score || 50` and `h.recommended_action ||
// 'Hold'`. Those are not neutral: 50 is a real reading on a 0-100 scale and
// 'Hold' is a real verdict. Defaulting them turns "the analytics have not been
// computed for this name yet" into "we looked, and it is unremarkable" --
// which is a claim, and one nothing supports. On the book-weighted average it
// drags the result toward 50 by exactly the pending weight with nothing on
// screen to say so, the same silent dilution `weightedMove` exists to prevent.
//
// ## There is no second weighting implementation here
//
// A book-weighted conviction is `weightedMove(rows, { value, move })` with the
// score as the move -- identical arithmetic, identical withhold-and-
// renormalise rule, identical `pct`-absent-when-nothing-measurable contract.
// Writing a `weightedConviction` here would be a second copy of the one piece
// of arithmetic this codebase keeps insisting on having once. Callers import
// `weightedMove` and pass `move: convictionOf`.
//
// ## The accessors return null, never a default
//
// `convictionOf` and `actionOf` are the only sanctioned readers. They cannot
// be handed a fallback, on the `returnOf` / `weightedMove` precedent: the
// substitution has to be impossible to write, not merely discouraged.
// ============================================================

export const ANALYTICS_PENDING_LABEL = 'Analytics pending';

// ## WITHHELD IS NOT PENDING (C-1, 2026-09-25)
//
// Since C-1 conviction needs at least one FUNDAMENTAL leg -- a DCF valuation
// or a complete Piotroski F-Score. A name with neither (most ETFs, a filer
// with no statements) arrives with its analytics computed and conviction NULL,
// `conviction_basis = 'no_fundamental_leg'`. That is an ANSWER, not a wait:
// labelling it "pending" promises a score that will never come. Trend alone
// would have been a verdict with nothing behind it (Bull -> Add, Wary -> Exit).
export const BASIS_NO_FUNDAMENTAL = 'no_fundamental_leg';
export const CONVICTION_WITHHELD_LABEL = 'No valuation or quality on file';

const toNum = v => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
};

/**
 * True when the row carries a live book position but no analytics yet.
 *
 * `conviction_score` is the probe because the view withholds all four analytic
 * fields on the same condition (`has_analytics`), and it is the one of the
 * four that is numeric -- so a caller cannot confuse "absent" with a
 * legitimate empty string.
 */
export function analyticsPending(row) {
    if (!row) return true;
    return toNum(row.conviction_score) == null && !convictionWithheld(row);
}

/** Conviction computed and deliberately absent: no fundamental leg. */
export function convictionWithheld(row) {
    return !!row && toNum(row.conviction_score) == null
        && row.conviction_basis === BASIS_NO_FUNDAMENTAL;
}

/** The sentence for a row with no score -- withheld and pending read apart. */
export function unscoredLabel(row) {
    return convictionWithheld(row) ? CONVICTION_WITHHELD_LABEL : ANALYTICS_PENDING_LABEL;
}

/** Conviction score, or null. NEVER 50. */
export function convictionOf(row) {
    return row ? toNum(row.conviction_score) : null;
}

/** Recommended action, or null. NEVER 'Hold'. */
export function actionOf(row) {
    if (!row) return null;
    const a = row.recommended_action;
    return (typeof a === 'string' && a !== '') ? a : null;
}

/**
 * Split a holdings list into the names whose analytics are on file and the
 * names still waiting, so a surface can state its denominator rather than
 * implying full cover.
 *
 * `value` is optional and defaults to market value; it only affects the
 * weight figures, never the membership.
 */
export function partitionByAnalytics(rows, value) {
    const val = typeof value === 'function' ? value : (r => r && r.market_value);
    const measured = [], pending = [], pendingSymbols = [];
    const withheld = [], withheldSymbols = [];
    let measuredValue = 0, pendingValue = 0, withheldValue = 0;

    for (const row of rows || []) {
        const v = Math.abs(toNum(val(row)) ?? 0);
        if (convictionWithheld(row)) {
            withheld.push(row);
            withheldValue += v;
            if (row && row.symbol) withheldSymbols.push(row.symbol);
        } else if (analyticsPending(row)) {
            pending.push(row);
            pendingValue += v;
            if (row && row.symbol) pendingSymbols.push(row.symbol);
        } else {
            measured.push(row);
            measuredValue += v;
        }
    }
    const total = measuredValue + pendingValue + withheldValue;
    return {
        measured, pending, pendingSymbols, withheld, withheldSymbols,
        measuredCount: measured.length,
        pendingCount: pending.length,
        withheldCount: withheld.length,
        measuredValue, pendingValue, withheldValue,
        // Share of book value with no analytics yet, as a percentage.
        pendingSharePct: total ? (pendingValue / total) * 100 : 0,
        // Share of book value with no fundamental leg to score.
        withheldSharePct: total ? (withheldValue / total) * 100 : 0,
    };
}

/**
 * Sort by conviction with PENDING ROWS ALWAYS LAST, whichever way the caller
 * is sorting.
 *
 * `b.conviction_score - a.conviction_score` yields NaN against a null, and a
 * NaN comparator is not merely wrong, it is UNSTABLE -- the resulting order
 * depends on the engine's sort implementation and on the input order. Nulls
 * also must not sort as high scores: claiming the one name nobody has scored
 * ranks above the ones that were is exactly the failure the bets strip hit
 * when an unmeasured segment sorted as zero.
 *
 * `dir` is -1 for descending (the default, best first) and 1 for ascending.
 */
export function sortByConviction(rows, dir) {
    const d = dir === 1 ? 1 : -1;
    return [...(rows || [])].sort((a, b) => {
        const x = convictionOf(a), y = convictionOf(b);
        if (x == null && y == null) return 0;
        if (x == null) return 1;   // pending last, in both directions
        if (y == null) return -1;
        return d === -1 ? y - x : x - y;
    });
}
