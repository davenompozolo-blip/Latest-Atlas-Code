// ============================================================
// ATLAS Risk — aligned return series, without fabricated zeros.
// ------------------------------------------------------------
// The Risk page builds one return vector per held name over a shared date
// grid, because correlation, rolling correlation and component VaR all
// align positionally. The old construction was
//
//     rets.push(p0 && p1 && p0 > 0 ? (p1 - p0) / p0 : 0);
//
// so a date with no bar became a REAL 0.00% return. `vw_position_nav_daily`
// carries a row only for a date the position was HELD, so every name
// bought after the grid starts is zero-filled back to the beginning: on
// the 2026-09-18 book that is 5,889 fabricated returns across 63 names,
// and MA (bought 09-17) carried 183 of them against 2 real bars.
//
// The damage is not a missing number, it is a published one. A vector of
// zeros has ZERO variance, so the name reads as riskless; and its
// correlation to everything is zero, so it reads as a perfect diversifier.
// Both are the most flattering possible answers, and neither is measured.
//
// Worse, every guard on the page tested ARRAY LENGTH (`a.length > 5`),
// which the zero-fill satisfies by construction — so the fabrication made
// itself invisible to the checks meant to catch it. Count MEASURED
// observations, never slots.
//
// So: a date with no bar on either endpoint is `null`, never 0, and every
// statistic here is pairwise-complete over the non-null pairs. A name with
// too few measured returns is WITHHELD and its weight published, the
// `measuredWeightPct` / `withheldWeightPct` construction this codebase
// already uses for stale marks and unmeasurable contributions — never
// silently counted as a name that sat flat.
// ============================================================

// Matches the page's own long-standing guard, now applied to measured
// observations rather than to array length.
export const MIN_OBS = 5;

/**
 * Build one aligned return vector per symbol over `dates`.
 *
 * @param {string[]} dates  shared grid, ASCENDING.
 * @param {Object<string,Object<string,number>>} closeBySymbol
 *        symbol -> { date -> close }.
 * @param {string[]} symbols
 * @returns {{series:Object<string,Array<number|null>>,
 *            coverage:Object<string,{measured:number,slots:number}>}}
 *          Each vector has length `dates.length - 1`; slot i is the return
 *          from dates[i] to dates[i+1], or null where either bar is absent.
 */
export function buildReturnSeries(dates, closeBySymbol, symbols) {
    const series = {};
    const coverage = {};
    const slots = Math.max(0, (dates || []).length - 1);
    for (const sym of symbols || []) {
        const prices = (closeBySymbol && closeBySymbol[sym]) || {};
        const vec = new Array(slots);
        let measured = 0;
        for (let i = 1; i < dates.length; i++) {
            const p0 = prices[dates[i - 1]];
            const p1 = prices[dates[i]];
            // A bar must exist at BOTH endpoints and the base must be
            // positive. Anything else is not a return we observed.
            if (Number.isFinite(p0) && Number.isFinite(p1) && p0 > 0) {
                vec[i - 1] = (p1 - p0) / p0;
                measured++;
            } else {
                vec[i - 1] = null;
            }
        }
        series[sym] = vec;
        coverage[sym] = { measured: measured, slots: slots };
    }
    return { series: series, coverage: coverage };
}

/** How many slots in `vec` carry an observation. Never `vec.length`. */
export function measuredCount(vec) {
    let n = 0;
    for (const v of vec || []) if (v != null && Number.isFinite(v)) n++;
    return n;
}

/** The observations of `vec`, gaps dropped. Order preserved. */
export function measuredValues(vec) {
    const out = [];
    for (const v of vec || []) if (v != null && Number.isFinite(v)) out.push(v);
    return out;
}

/**
 * The indices where BOTH vectors carry an observation, so a pair statistic
 * is computed on days both names actually traded.
 */
export function pairwiseComplete(a, b, indices) {
    const sa = [], sb = [];
    const n = Math.min((a || []).length, (b || []).length);
    for (let i = 0; i < n; i++) {
        if (indices && !indices[i]) continue;
        const ai = a[i], bi = b[i];
        if (ai == null || bi == null) continue;
        if (!Number.isFinite(ai) || !Number.isFinite(bi)) continue;
        sa.push(ai); sb.push(bi);
    }
    return { a: sa, b: sb, n: sa.length };
}

/**
 * Pearson correlation over pairwise-complete observations.
 *
 * Returns **null**, never 0, when it cannot be measured — too few shared
 * observations, or a constant series. The old helper returned 0 in both
 * cases, which is a claim (`uncorrelated`) rather than an absence, and it
 * is the claim a zero-filled vector produces.
 */
export function corrPairwise(a, b, minObs, indices) {
    const floor = minObs == null ? MIN_OBS : minObs;
    const { a: sa, b: sb, n } = pairwiseComplete(a, b, indices);
    if (n < floor) return null;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += sa[i]; mb += sb[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
        const x = sa[i] - ma, y = sb[i] - mb;
        num += x * y; da += x * x; db += y * y;
    }
    const denom = Math.sqrt(da * db);
    // A constant series has no correlation with anything. That is not zero
    // correlation; it is an unanswerable question.
    if (!(denom > 0)) return null;
    return num / denom;
}

/**
 * Split symbols into those carrying enough measured returns to be ranked
 * and those that do not, with the weight on each side so a surface can
 * state its denominator rather than quietly shrinking the book.
 */
export function partitionBySufficiency(symbols, series, weightOf, minObs) {
    const floor = minObs == null ? MIN_OBS : minObs;
    const measured = [], withheld = [];
    let measuredWeight = 0, withheldWeight = 0;
    for (const sym of symbols || []) {
        const n = measuredCount(series && series[sym]);
        const w = Number(weightOf ? weightOf(sym) : 0) || 0;
        if (n >= floor) { measured.push(sym); measuredWeight += w; }
        else { withheld.push({ symbol: sym, measured: n }); withheldWeight += w; }
    }
    const total = measuredWeight + withheldWeight;
    return {
        measured: measured,
        withheld: withheld,
        measuredWeightPct: total > 0 ? (measuredWeight / total) * 100 : 0,
        withheldWeightPct: total > 0 ? (withheldWeight / total) * 100 : 0,
    };
}
