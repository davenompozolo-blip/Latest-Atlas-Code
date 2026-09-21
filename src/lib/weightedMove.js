// ============================================================
// One weighted-move implementation, and the withhold rule that goes with it.
// ------------------------------------------------------------
// Sigma w_i * r_i over the names that carry BOTH a size and a move,
// renormalised to the size that actually had one.
//
// The rule this exists to enforce: A WITHHELD MOVE IS NOT A ZERO MOVE.
//
// `vw_portfolio_home` and `vw_nexus_holdings` now NULL `daily_change_pct` /
// `daily_return_pct` when the name's last stored bar is older than 7 days or
// it has no bar at all (20260921080000, 20260921081500). Every caller that
// read those columns as `|| 0` or `?? 0` therefore turned "we cannot say what
// this name did" into "this name sat flat" -- which is a measurement, and a
// different one. On a weighted average it drags the result towards zero by
// exactly the withheld weight and leaves nothing on screen to say so.
//
// That is strictly worse than the defect the database gate closed, because an
// overstatement is visible and a dilution is not. KMTUY sat at 2.13% of book
// publishing +9.25% off a bar 179 days old: loud and wrong. Counted at 0.00%
// it is quiet and wrong.
//
// ## Both accessors are REQUIRED
//
// Not defaulted, on the `returnOf` precedent from `computeBrinsonAttribution`:
// making the argument required is what found the third caller. A default
// accessor would let a new call site pick up whichever field name happened to
// be right for the last one.
//
// ## `pct` is null, never 0, when nothing is measurable
//
// A book nobody can price did not move 0.00%. The key is ABSENT from the
// result in that case as well as null, so a renderer cannot print a number it
// was never handed -- the `nexusReturnBasis.js` / A2 construction.
// ============================================================

const toNum = v => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
};

/**
 * @param {Array} rows
 * @param {{ value: (row:any)=>any, move: (row:any)=>any, exclude?: (row:any)=>boolean }} opts
 *   `value` is the size to weight by (market value, weight percent -- the
 *   caller's choice, and the result is on that same denominator).
 *   `move` is the per-name move.
 *   `exclude` withholds a row for a reason the move itself cannot express,
 *   e.g. a staleness set computed elsewhere. An excluded row counts as
 *   withheld, never as measured.
 */
export function weightedMove(rows, opts) {
    if (!opts || typeof opts.value !== 'function' || typeof opts.move !== 'function') {
        throw new TypeError('weightedMove requires { value, move } accessors');
    }
    const exclude = typeof opts.exclude === 'function' ? opts.exclude : null;

    const measured = [];
    let numer = 0, measuredValue = 0, withheldValue = 0, withheldCount = 0;
    const withheldSymbols = [];

    for (const row of rows || []) {
        const v = toNum(opts.value(row));
        if (v == null || v === 0) continue;
        const r = (exclude && exclude(row)) ? null : toNum(opts.move(row));
        if (r == null) {
            withheldValue += Math.abs(v);
            withheldCount += 1;
            const id = row && (row.symbol || row.tk);
            if (id) withheldSymbols.push(id);
            continue;
        }
        numer += v * r;
        measuredValue += v;
        measured.push({ row, value: v, move: r, contrib: v * r });
    }

    const out = {
        measured,
        measuredCount: measured.length,
        withheldCount,
        measuredValue,
        withheldValue,
        withheldSymbols,
    };
    // Absent, not null-valued, when there is nothing to divide by.
    if (measuredValue !== 0) out.pct = numer / measuredValue;
    return out;
}

/** Share of `total` whose move could not be supported, as a percentage. */
export function withheldSharePct(result, total) {
    const t = Math.abs(toNum(total) ?? 0);
    if (!t) return 0;
    return (result.withheldValue / t) * 100;
}
