// R-1: the intermarket-axis regime framework, as PCM consumes it.
//
// Two inputs, both MEASURED, neither a return forecast:
//
//   EXPOSURE  vw_position_axis_exposure -- each held position's cluster
//             exposure to the three axes, published only where |t| > 2.
//   RISK      vw_regime_axis_state -- today's reading on each axis and the
//             active account's regime-CVaR vol ratio for the bucket that
//             reading falls in.
//
// What is deliberately NOT here is a tilt of expected returns toward the axes
// that have been rising. That was built and measured first: an axis's mean
// daily score over 20 sessions has correlation -0.005 / -0.027 / +0.007 with
// the next 20 (206 blocks, 13 years), and is mildly mean-reverting at 5. A
// persistence tilt would be a view the axes' own history refutes.
//
// So the optimiser uses the framework two ways:
//   1. an EXPOSURE BUDGET: the optimal book may not carry MORE aggregate
//      exposure to an axis than the current book does. It can reduce a bet,
//      never pile further into it.
//   2. a RISK SCALE: covariance scaled by the regime-CVaR vol ratio of the
//      bucket today's reading sits in (the largest across axes, and which
//      axis set it is reported).

export const AXES = Object.freeze(['cyclical', 'concentration', 'dollar']);

function finite(v) {
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

// rows -> { bySymbol: { SYM: { cyclical?, concentration?, dollar? } },
//           status: { SYM: exposure_status }, withheld: [{symbol, status}] }
// An insignificant or absent exposure is ABSENT from the symbol's object, not
// 0: "no measurable exposure" and "exposure of zero" are different claims.
export function exposuresBySymbol(rows) {
    const bySymbol = Object.create(null);
    const status = Object.create(null);
    const withheld = [];
    (rows || []).forEach(function (r) {
        if (!r || !r.symbol) return;
        const e = {};
        AXES.forEach(function (a) {
            const v = finite(r['exposure_' + a]);
            if (v != null) e[a] = v;
        });
        bySymbol[r.symbol] = e;
        status[r.symbol] = r.exposure_status || 'unknown';
        if (r.exposure_status !== 'measured' && r.exposure_status !== 'no_significant_axis') {
            withheld.push({ symbol: r.symbol, status: r.exposure_status || 'unknown' });
        }
    });
    return { bySymbol: bySymbol, status: status, withheld: withheld };
}

// Aggregate exposure per axis: sum of weight x exposure over the names that
// carry one. Also returns the weight that could be measured at all, so a
// surface can state its denominator.
export function aggregateExposure(symbols, weights, bySymbol) {
    const out = { cyclical: 0, concentration: 0, dollar: 0, measuredWeight: 0, totalWeight: 0 };
    symbols.forEach(function (sym, i) {
        const w = finite(weights[i]) || 0;
        out.totalWeight += Math.abs(w);
        const e = bySymbol[sym];
        if (!e) return;
        if (Object.keys(e).length) out.measuredWeight += Math.abs(w);
        AXES.forEach(function (a) { if (e[a] != null) out[a] += w * e[a]; });
    });
    return out;
}

// The budget is the current book's own exposure magnitude per axis. The
// normaliser keeps the penalty in comparable units across axes whose betas
// differ by an order of magnitude, and keeps a zero budget from dividing by 0.
export function exposureBudgets(current, bySymbol) {
    const out = {};
    AXES.forEach(function (a) {
        const mags = Object.keys(bySymbol).map(function (s) { return bySymbol[s][a]; })
            .filter(function (v) { return v != null; }).map(Math.abs);
        const typical = mags.length ? mags.reduce(function (x, y) { return x + y; }, 0) / mags.length : 0;
        out[a] = { budget: Math.abs(current[a] || 0), scale: Math.max(Math.abs(current[a] || 0), typical, 1e-12) };
    });
    return out;
}

// Gradient of  -K * sum_a max(0, |E_a| - B_a)^2 / S_a^2  with respect to w.
// Zero inside every budget, so it never moves a book that is within them.
export function exposurePenaltyGrad(symbols, w, bySymbol, budgets, strength) {
    const K = strength == null ? 2 : strength;
    const agg = aggregateExposure(symbols, w, bySymbol);
    const g = new Array(symbols.length).fill(0);
    AXES.forEach(function (a) {
        const b = budgets[a];
        if (!b) return;
        const E = agg[a];
        const excess = Math.abs(E) - b.budget;
        if (excess <= 0) return;
        const coef = -2 * K * excess / (b.scale * b.scale) * Math.sign(E);
        symbols.forEach(function (sym, i) {
            const e = bySymbol[sym];
            if (e && e[a] != null) g[i] += coef * e[a];
        });
    });
    return g;
}

// Risk scale from today's regime buckets. The LARGEST ratio across axes, and
// which axis set it, is reported. With no regime CVaR for this account the
// scale is 1 and the reason says so -- never a silent default.
export function regimeRiskScale(axisRows) {
    let best = null;
    (axisRows || []).forEach(function (r) {
        const v = finite(r && r.regime_vol_ratio);
        if (v == null || v <= 0) return;
        if (!best || v > best.scale) best = { scale: v, axis: r.axis_key, bucket: r.regime_bucket_label || null };
    });
    if (!best) return { scale: 1, axis: null, bucket: null, basis: 'none',
                        reason: 'no regime CVaR for this account yet' };
    return { scale: best.scale, axis: best.axis, bucket: best.bucket, basis: 'regime_cvar' };
}

// A list ranked on a score is only a ranking where the scores differ. Entries
// whose score is zero are neither "top" nor "bottom" and are dropped from
// both, so a column of zeros cannot render as winners and losers.
export function splitRanked(items, key, eps) {
    const tol = eps == null ? 1e-12 : eps;
    const pos = items.filter(function (x) { return x[key] > tol; })
        .sort(function (a, b) { return b[key] - a[key]; });
    const neg = items.filter(function (x) { return x[key] < -tol; })
        .sort(function (a, b) { return a[key] - b[key]; });
    return { top: pos, bottom: neg, flat: items.length - pos.length - neg.length };
}

// FRED publishes both spreads in PERCENT. PCM compared HY against 400 and
// printed "bps", so the credit overlay could never fire and "3 bps" was on
// screen for a ~300 bp spread.
export function pctToBps(v) {
    const n = finite(v);
    return n == null ? null : n * 100;
}
