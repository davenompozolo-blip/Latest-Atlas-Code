// ============================================================
// ATLAS — the thesis freshness gate (memo v2 close-out §5.2)
// ------------------------------------------------------------
// Performance inherits the Bench's freshness the moment `thesis_state` appears
// on a verdict card. A stale INTACT sitting beside a live return is the
// mixed-basis problem in a new place — the same failure as Nexus showing
// since-entry above unrealised — so the state is gated before it is shown.
//
// Past the threshold, the card shows UNTESTED. That word is already in the
// Bench vocabulary (`pending · untested · intact · bending · broken ·
// confirmed · contradicted · expired`) and it is the honest reading: the
// thesis has not been judged recently enough to rely on.
//
// ## The threshold is Bench's own
//
// 30 days, matching `THESIS_STALE_DAYS` in nexusBenchCompute.js. Picking a
// different number here would let Performance call a thesis fresh that the
// Bench calls stale, about the same thesis, on the same day.
//
// ## Three ways a state fails to be current, not one
//
//   never judged     no as_of at all. `bench_claims_status_stamp` NULLs
//                    status_changed_at for pending/untested and stamps now()
//                    for anything resolved, so a missing date is not a missing
//                    field — it is the database saying no judgement happened.
//   review overdue   the claim named its own `review_by` and that date has
//                    passed. Better than a global threshold where it exists,
//                    because the thesis said when it should next be examined.
//   simply old       judged, but longer ago than the threshold.
//
// ## The last reading is kept, not dropped
//
// Downgrading is symmetric — a stale BROKEN is no more reliable than a stale
// INTACT — but the card still says what it last read and when. "was BROKEN,
// last judged 74 days ago" is strictly more useful than UNTESTED alone, and
// it does not assert the state still holds.
// ============================================================

/** Matches THESIS_STALE_DAYS in nexusBenchCompute.js. Do not diverge. */
export const THESIS_STALE_DAYS = 30;

const DAY_MS = 86_400_000;

/** States that assert something about the thesis and can therefore go stale. */
const CONFIDENT = ['intact', 'bending', 'broken', 'confirmed', 'contradicted', 'expired'];

/** States that already say "not judged" — gating them changes nothing. */
const UNJUDGED = ['untested', 'pending'];

function day(v) {
    if (!v) return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function daysBetween(fromIso, nowIso) {
    const a = Date.parse(fromIso + 'T00:00:00Z');
    const b = nowIso ? Date.parse(String(nowIso).slice(0, 10) + 'T00:00:00Z') : Date.now();
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.max(0, Math.floor((b - a) / DAY_MS));
}

/**
 * What the card should show for a thesis.
 *
 * Returns null when the symbol has no thesis at all — no claim was ever
 * written, so there is nothing to render and no absence to explain. That is
 * different from a thesis that exists and has not been judged, which renders
 * UNTESTED with a reason.
 *
 * @param {object} row  carries thesis_state, thesis_state_as_of, review_by
 * @param {string} nowIso  optional, for deterministic tests
 */
export function thesisGate(row, nowIso) {
    if (!row) return null;
    const state = row.thesis_state || row.thesisState || null;
    if (!state) return null;

    const asOf     = day(row.thesis_state_as_of || row.thesisAsOf);
    const reviewBy = day(row.review_by || row.reviewBy);
    const ageDays  = asOf ? daysBetween(asOf, nowIso) : null;

    // Already unjudged. Not a downgrade — this IS the state.
    if (UNJUDGED.indexOf(state) >= 0) {
        return {
            display: 'untested', gated: false, lastState: state, asOf: asOf, ageDays: ageDays,
            reason: 'no claim on this thesis has been judged yet',
        };
    }

    const known = CONFIDENT.indexOf(state) >= 0;

    if (!asOf) {
        return {
            display: 'untested', gated: true, lastState: known ? state : null, asOf: null, ageDays: null,
            reason: 'state carries no date — never judged',
        };
    }

    const overdue = reviewBy && daysBetween(reviewBy, nowIso) > 0;
    if (overdue) {
        return {
            display: 'untested', gated: true, lastState: state, asOf: asOf, ageDays: ageDays,
            reviewBy: reviewBy,
            reason: 'review was due ' + reviewBy + ' — was ' + state.toUpperCase()
                    + (ageDays == null ? '' : ', last judged ' + ageDays + 'd ago'),
        };
    }

    if (ageDays != null && ageDays >= THESIS_STALE_DAYS) {
        return {
            display: 'untested', gated: true, lastState: state, asOf: asOf, ageDays: ageDays,
            reviewBy: reviewBy,
            reason: 'was ' + state.toUpperCase() + ', last judged ' + ageDays + 'd ago',
        };
    }

    return {
        display: state, gated: false, lastState: state, asOf: asOf, ageDays: ageDays,
        reviewBy: reviewBy,
        reason: ageDays === 0 ? 'judged today' : 'judged ' + ageDays + 'd ago',
    };
}

/**
 * The book-level 2×2 (§5.2): thesis holding, against whether the position is
 * actually working on its own tier.
 *
 * The thesis axis uses the GATED state, not the raw one — a quadrant built on
 * a stale INTACT would put a position in "working as intended" on the strength
 * of a judgement nobody has made for months. Anything gated, unjudged or
 * absent lands in `notJudged`, which is deliberately a column of its own
 * rather than being folded into "thesis broken": not knowing is not the same
 * as knowing it is broken.
 */
export function thesisQuadrants(cards, nowIso) {
    const q = {
        holdingWinning: [], holdingLosing: [],
        brokenWinning: [], brokenLosing: [],
        notJudged: [], noThesis: [],
    };

    (cards || []).forEach(function (c) {
        const g = thesisGate({ thesis_state: c.thesisState, thesis_state_as_of: c.thesisAsOf, review_by: c.reviewBy }, nowIso);
        if (!g) { q.noThesis.push(c); return; }

        const edge = c.slot && c.slot.edge;
        if (g.display === 'untested' || edge == null) { q.notJudged.push(c); return; }

        // `bending` counts as holding: the thesis is under pressure, not
        // falsified. Only broken/contradicted/expired say the case is gone.
        const holding = g.display === 'intact' || g.display === 'confirmed' || g.display === 'bending';
        const winning = edge >= 0;

        if (holding && winning)  q.holdingWinning.push(c);
        else if (holding)        q.holdingLosing.push(c);
        else if (winning)        q.brokenWinning.push(c);
        else                     q.brokenLosing.push(c);
    });

    return q;
}

/** What each quadrant means, in one line. */
export const QUADRANT_READ = {
    holdingWinning: 'thesis holding, position ahead — working as intended',
    holdingLosing:  'thesis holding, position behind — the case survives the price',
    brokenWinning:  'thesis gone, position ahead — right for a reason you no longer believe',
    brokenLosing:   'thesis gone, position behind — the exit case',
    notJudged:      'no reliable thesis reading — nothing to place',
    noThesis:       'no thesis on the Bench at all',
};
