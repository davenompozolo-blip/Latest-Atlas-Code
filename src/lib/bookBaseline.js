// ============================================================
// ATLAS — the do-nothing baseline (memo v2 close-out §5.1)
// ------------------------------------------------------------
// The frozen-weight counterfactual, read for display.
//
// ## Why this number gets billing rather than a drill-down
//
// Every other figure in the Performance module grades a *position*: did this
// holding earn its slot, against its cluster or against the rest of the book.
// This one grades the *trading*. Freeze the book at its opening weights, let
// it run, and compare. The difference is what all the buying and selling
// actually bought.
//
// It is also the number most likely to say something unwelcome — on the book
// today the frozen book is ahead — and a number that might embarrass you is
// exactly the one that never gets clicked into. So it sits on the scorecard.
//
// ## Book level, not per position
//
// Over the ~166 days of ledger history a single position's trading effect is
// noise: the per-row median is 0.00pp, 36 positions helped and 41 hurt. It is
// only signal in aggregate, across 63 positions and 557 transactions. The
// per-row figure stays available for drill-down; the headline is the book.
//
// ## Why staleness is measured in sessions, not hours
//
// `book_risk_daily` gains one row per weekday night. Measured against the wall
// clock, the figure is "16 hours old" on a Monday morning and "60 hours old"
// on a Sunday — the same healthy state, described two ways, and the weekend
// reading looks like a fault. The same mistake this codebase already made with
// `feed_coverage` and fixed with `atlas_last_traded_day()`.
//
// The anchor here is the NAV series the page has already loaded. Its dates ARE
// the sessions, so counting how many of them fall after `as_of` gives an exact
// trading-day age with no extra fetch and no calendar arithmetic. One session
// behind is the ordinary intraday state (today's run has not happened yet).
// Two or more means a night was missed, and the figure is no longer a
// description of the book on screen.
// ============================================================

/** A row this far behind the last session is not published as current. */
export const STALE_AFTER_SESSIONS = 2;

/**
 * Newest `book_risk_daily` row.
 *
 * Ordered DESC with an explicit limit rather than `loadView`'s bare
 * `select('*')`: the table grows a row every weekday, and PostgREST caps a
 * response at 1,000 rows whatever the request says. An ascending or unordered
 * read of a growing time series eventually returns the OLDEST 1,000 rows and
 * silently drops the newest — the `api/nexus-theme.js` defect, which published
 * a six-week-old tape with nothing in the shape of the data to give it away.
 */
export async function loadBookBaseline(sb) {
    if (!sb) return null;
    try {
        const { data, error } = await sb
            .from('book_risk_daily')
            .select('as_of, logic_version, traded_book_return_pct, frozen_book_return_pct, ' +
                    'trading_effect_pct, positions_cluster_eligible, positions_no_correlate, ' +
                    'positions_in_matrix, positions_absent_from_matrix, effective_bets')
            .order('as_of', { ascending: false })
            .limit(1);
        if (error) throw error;
        return (data && data[0]) || null;
    } catch (e) {
        // Loudly, not into the void. A swallowed read failure here renders as
        // "no baseline yet", which is indistinguishable from the job never
        // having run — the exact confusion §5.1 exists to remove.
        console.error('[ATLAS] book_risk_daily read failed:', e.message);
        return null;
    }
}

/** ISO date (YYYY-MM-DD) from whatever shape a row or series carries. */
function isoDay(v) {
    if (!v) return null;
    const s = typeof v === 'string' ? v : String(v);
    return s.length >= 10 ? s.slice(0, 10) : null;
}

/**
 * How many trading sessions have closed since `asOf`, using the NAV series as
 * the session calendar. Returns null when there is no series to anchor to —
 * never 0, which would be a claim of freshness we cannot support.
 */
export function sessionsBehind(asOf, navSeries) {
    const day = isoDay(asOf);
    if (!day || !Array.isArray(navSeries) || !navSeries.length) return null;
    let n = 0;
    for (const row of navSeries) {
        const d = isoDay(row && (row.price_date || row.date));
        if (d && d > day) n++;
    }
    return n;
}

/**
 * The baseline, ready to render.
 *
 * `status` is one of:
 *   'measured' — publish the figure
 *   'stale'    — a row exists but is too far behind the tape to describe it
 *   'absent'   — the nightly job has written nothing
 *
 * A stale row keeps its numbers in the return value so a drill-down can still
 * show what was last computed and when. What it must not do is appear beside
 * a live return with nothing to say it is older, which is the mixed-basis
 * failure in a new place.
 */
export function readBookBaseline(row, navSeries) {
    if (!row || row.trading_effect_pct == null) {
        return {
            status: 'absent',
            reason: 'no do-nothing baseline has been computed yet',
            effectPp: null, tradedPct: null, frozenPct: null,
            asOf: null, behind: null, logicVersion: null,
        };
    }

    const asOf   = isoDay(row.as_of);
    const behind = sessionsBehind(asOf, navSeries);
    const stale  = behind != null && behind >= STALE_AFTER_SESSIONS;

    return {
        status: stale ? 'stale' : 'measured',
        reason: stale
            ? 'last computed ' + behind + ' sessions ago (' + asOf + ')'
            : null,
        // Stored as fractions; the display multiplies. `effectPp` is a
        // difference of two returns, so it is percentage POINTS, not a percent
        // — naming it so is the whole point of the memo's labelling rule.
        effectPp:     Number(row.trading_effect_pct) * 100,
        tradedPct:    row.traded_book_return_pct != null ? Number(row.traded_book_return_pct) * 100 : null,
        frozenPct:    row.frozen_book_return_pct != null ? Number(row.frozen_book_return_pct) * 100 : null,
        asOf:         asOf,
        behind:       behind,
        logicVersion: row.logic_version || null,
    };
}

/**
 * The one-line read. Deliberately blunt in both directions — the memo's case
 * for putting this on the scorecard is that an unwelcome answer must not be
 * softened into something skippable.
 */
export function baselineVerdict(b) {
    if (!b || b.status === 'absent') return 'Not yet computed';
    if (b.effectPp == null) return 'Not measurable';
    if (b.effectPp > 0.05)  return 'Trading added value';
    if (b.effectPp < -0.05) return 'Doing nothing would have beaten this';
    return 'Trading was a wash';
}
