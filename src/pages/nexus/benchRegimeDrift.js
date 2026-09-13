// ============================================================
// E1.3 — regime drift on the Bench thesis view
// ------------------------------------------------------------
// Master spec §6 E1: "When a thesis is created or materially revised,
// snapshot the axis state it was written under. Thereafter compute drift
// between that snapshot and current state."
//
// E1.1 wrote `thesis_regime_snapshots`, E1.2 built `vw_thesis_regime_drift`.
// This is E1.3 and it is INSTRUMENT ONLY.
//
// NO FLAG IN v1. The spec is explicit: "display the drift, let the analyst
// judge, and watch for a month whether the drift readings correspond to
// theses that genuinely went stale." `premise_drifted` is E1.4 and arrives
// only after 30 days of observation — it is also one of the four decisions
// §10.3 reserves to the product owner. So nothing here ranks, colours by
// severity, or says a premise has expired. It reports what moved.
//
// THE UNITS TRAP. `score_20d` is a rolling 20-SESSION SUM of the daily axis
// score, not a sigma level — mean |score_20d| runs 3.3 to 5.8 across the
// axes. A drift of "-6.72" therefore means nothing on its own, and dividing
// it by the axis's own standard deviation is the only way to make it
// readable. That ratio is scale CONTEXT and is NOT a z-score of the drift;
// the view's own comment says so and the label here says so too.
// ============================================================

// Axis order on screen. Follows factor_axes.pc_rank when the rows carry it,
// so adding a fourth axis needs no edit here.
export function sortAxes(rows) {
    return rows.slice().sort((a, b) => {
        const ra = a.pc_rank == null ? 99 : a.pc_rank;
        const rb = b.pc_rank == null ? 99 : b.pc_rank;
        if (ra !== rb) return ra - rb;
        return String(a.axis_key).localeCompare(String(b.axis_key));
    });
}

export function groupDriftByThesis(rows) {
    const by = new Map();
    for (const r of rows || []) {
        if (r == null || r.thesis_id == null) continue;
        const k = String(r.thesis_id);
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(r);
    }
    for (const [k, v] of by) by.set(k, sortAxes(v));
    return by;
}

const n = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// One axis row, ready to render. Every numeric is either a finite number or
// null — a renderer cannot print a number it was never handed, which is the
// same construction nexusReturnBasis.js and the A2 axis panel use.
export function axisDrift(row) {
    const snap = n(row.snapshot_score_20d);
    const cur = n(row.current_score_20d);
    const drift = n(row.drift_score_20d);
    const sd = n(row.score_20d_stdev_full);
    // Scale context, NOT a z-score. Null when the axis has no dispersion to
    // measure against rather than dividing by zero and printing Infinity.
    const vsSd = drift != null && sd != null && sd > 0 ? drift / sd : null;
    return {
        axisKey: row.axis_key,
        axisLabel: row.axis_label || row.axis_key,
        positiveMeans: row.positive_means || null,
        marginal: row.axis_marginal === true,
        snapshot: snap,
        current: cur,
        drift,
        axisSd: sd,
        driftVsAxisSd: vsSd,
        // A statement of fact about the data, not a verdict about the thesis:
        // the axis was one sign when the thesis was written and is the other
        // now. The spec calls exactly this "a true, useful, auditable
        // statement that requires no theme engine at all".
        signFlipped: row.sign_flipped === true,
        measurable: drift != null,
    };
}

// Dispersion is a property of the SNAPSHOT, not of the axis, so it is read
// once per thesis rather than repeated on every axis row.
export function dispersionRead(rows) {
    const first = (rows || [])[0];
    if (!first) return null;
    return {
        snapshot: first.snapshot_dispersion_state || null,
        current: first.current_dispersion_state || null,
        changed: first.dispersion_changed === true,
    };
}

export function thesisDrift(rows) {
    const sorted = sortAxes(rows || []);
    if (!sorted.length) return null;
    const first = sorted[0];
    const axes = sorted.map(axisDrift);
    return {
        thesisId: first.thesis_id,
        status: first.thesis_status || null,
        snapshotAt: first.snapshot_at || null,
        snapshotReason: first.snapshot_reason || null,
        snapshotDate: first.snapshot_score_date || null,
        currentDate: first.current_score_date || null,
        sessionsSpanDays: n(first.sessions_span_days),
        axes,
        dispersion: dispersionRead(sorted),
        measuredAxes: axes.filter(a => a.measurable).length,
        // Published so a surface can state its denominator instead of
        // implying it measured every axis.
        totalAxes: axes.length,
    };
}

// Display helpers. Minus is U+2212 throughout the codebase.
export const fmtScore = (v, dp = 2) =>
    (v == null ? '—' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(dp));

export const fmtVsSd = v =>
    (v == null ? null : Math.abs(v).toFixed(2) + '× axis sd');
