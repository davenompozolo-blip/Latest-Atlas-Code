// ATLAS Trade — shared numeric primitives.
//
// Isomorphic on purpose: the browser uses these to price a ticket as you type,
// the nightly sync job uses the same functions to write signal_scores and
// universe_clusters. One implementation, so the number on screen and the number
// in the intent row can never be produced by two different pieces of arithmetic.

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export const isNum = (x) => typeof x === 'number' && isFinite(x);

/** Coerce to a finite number or null. Empty strings and NaN are null, not 0. */
export function num(v) {
    if (v == null || v === '') return null;
    const x = Number(v);
    return isFinite(x) ? x : null;
}

export function mean(xs) {
    const v = xs.filter(isNum);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function stdev(xs, { sample = false } = {}) {
    const v = xs.filter(isNum);
    const n = v.length;
    if (n < (sample ? 2 : 1)) return null;
    const m = mean(v);
    const ss = v.reduce((a, x) => a + (x - m) * (x - m), 0);
    return Math.sqrt(ss / (sample ? n - 1 : n));
}

export function weightedMean(xs, ws) {
    let sw = 0, sx = 0;
    for (let i = 0; i < xs.length; i++) {
        if (!isNum(xs[i]) || !isNum(ws[i]) || ws[i] <= 0) continue;
        sw += ws[i];
        sx += ws[i] * xs[i];
    }
    return sw > 0 ? sx / sw : null;
}

/**
 * Population weighted standard deviation about the weighted mean.
 * Spec §5.3 defines dispersion as exactly this: "weighted stdev of s across
 * families, weighted by w".
 */
export function weightedStdev(xs, ws) {
    const m = weightedMean(xs, ws);
    if (m == null) return null;
    let sw = 0, ss = 0;
    for (let i = 0; i < xs.length; i++) {
        if (!isNum(xs[i]) || !isNum(ws[i]) || ws[i] <= 0) continue;
        sw += ws[i];
        ss += ws[i] * (xs[i] - m) * (xs[i] - m);
    }
    return sw > 0 ? Math.sqrt(ss / sw) : null;
}

/**
 * Percentile rank of x within sample, 0–100, by the fraction of observations
 * strictly below plus half the ties. Returns null on an empty sample rather
 * than a confident-looking 50.
 */
export function percentileRank(x, sample) {
    if (!isNum(x)) return null;
    const v = sample.filter(isNum);
    if (!v.length) return null;
    let below = 0, equal = 0;
    for (const s of v) { if (s < x) below++; else if (s === x) equal++; }
    return ((below + equal / 2) / v.length) * 100;
}

/** Herfindahl–Hirschman index over weights expressed as fractions of 1. */
export function hhi(weights) {
    return weights.filter(isNum).reduce((a, w) => a + w * w, 0);
}

/** Pearson correlation over paired series. */
export function correlation(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    const px = [], py = [];
    for (let i = 0; i < n; i++) {
        if (isNum(xs[i]) && isNum(ys[i])) { px.push(xs[i]); py.push(ys[i]); }
    }
    if (px.length < 3) return null;
    const mx = mean(px), my = mean(py);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < px.length; i++) {
        const dx = px[i] - mx, dy = py[i] - my;
        sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    const den = Math.sqrt(sxx * syy);
    return den > 0 ? sxy / den : null;
}

// ── Portfolio risk ───────────────────────────────────────────────────────────

/**
 * Build a covariance matrix from a correlation lookup and per-symbol vols.
 * Σij = ρij · σi · σj. Missing correlations fall back to `fallbackRho` and the
 * caller is told, via `missing`, how much of the matrix was guessed — a risk
 * number built mostly out of assumptions should say so.
 */
export function covarianceMatrix(symbols, vols, rho, { fallbackRho = 0 } = {}) {
    const n = symbols.length;
    const S = Array.from({ length: n }, () => new Array(n).fill(0));
    let missing = 0, pairs = 0;
    for (let i = 0; i < n; i++) {
        const vi = num(vols[symbols[i]]);
        for (let j = i; j < n; j++) {
            const vj = num(vols[symbols[j]]);
            if (vi == null || vj == null) { S[i][j] = S[j][i] = 0; continue; }
            if (i === j) { S[i][j] = vi * vi; continue; }
            pairs++;
            let r = rho(symbols[i], symbols[j]);
            if (!isNum(r)) { r = fallbackRho; missing++; }
            const c = r * vi * vj;
            S[i][j] = c; S[j][i] = c;
        }
    }
    return { matrix: S, missingPairs: missing, totalPairs: pairs };
}

/** wᵀΣw → portfolio variance. */
export function portfolioVariance(w, S) {
    let acc = 0;
    for (let i = 0; i < w.length; i++) {
        if (!isNum(w[i]) || w[i] === 0) continue;
        for (let j = 0; j < w.length; j++) {
            if (!isNum(w[j]) || w[j] === 0) continue;
            acc += w[i] * w[j] * S[i][j];
        }
    }
    return Math.max(acc, 0);
}

export function portfolioVol(w, S) {
    return Math.sqrt(portfolioVariance(w, S));
}

/**
 * Marginal contribution to risk for every position.
 * mctr_i = w_i·(Σw)_i / σ_p, and Σ mctr_i = σ_p exactly, which is what makes it
 * an attribution rather than a set of sensitivities.
 */
export function marginalContributions(w, S) {
    const sigma = portfolioVol(w, S);
    if (!(sigma > 0)) return w.map(() => 0);
    return w.map((wi, i) => {
        let sw = 0;
        for (let j = 0; j < w.length; j++) sw += S[i][j] * (isNum(w[j]) ? w[j] : 0);
        return (isNum(wi) ? wi : 0) * sw / sigma;
    });
}

/** Parametric 1-day VaR at the given confidence, in currency. */
export function parametricVaR(annualVol, equity, { confidence = 0.95, tradingDays = 252 } = {}) {
    if (!isNum(annualVol) || !isNum(equity)) return null;
    const z = confidence >= 0.99 ? 2.3263 : confidence >= 0.975 ? 1.9600 : 1.6449;
    return z * (annualVol / Math.sqrt(tradingDays)) * equity;
}

/**
 * Monotone root find by bisection. Used for the incremental-risk sizing method,
 * which §4.1 requires be solved numerically "since the marginal relationship is
 * not linear once the position is a meaningful weight".
 */
export function solveMonotone(f, target, lo, hi, { tol = 1e-7, maxIter = 80 } = {}) {
    let flo = f(lo) - target, fhi = f(hi) - target;
    if (!isNum(flo) || !isNum(fhi)) return null;
    if (flo > 0 && fhi > 0) return lo;      // even the smallest clip overshoots
    if (flo < 0 && fhi < 0) return hi;      // even the largest clip undershoots
    let a = lo, b = hi;
    for (let i = 0; i < maxIter; i++) {
        const m = (a + b) / 2;
        const fm = f(m) - target;
        if (!isNum(fm)) return null;
        if (Math.abs(fm) < tol || (b - a) / 2 < tol) return m;
        if ((fm < 0) === (flo < 0)) { a = m; flo = fm; } else { b = m; fhi = fm; }
    }
    return (a + b) / 2;
}

// ── Clustering ───────────────────────────────────────────────────────────────

/**
 * Average-linkage agglomerative clustering over correlation distance
 * d = 1 − ρ, cut at `distanceCut`.
 *
 * Spec §4.1: the ρ>0.75 pairwise rule is "a V1 scaffold, not the destination…
 * it misses a name at 0.73 that belongs to the cluster and admits one at 0.76
 * that does not". This is the destination; the pairwise number stays on screen
 * beside it so the two methods can be seen disagreeing.
 */
export function clusterByCorrelation(symbols, rho, { distanceCut = 0.35 } = {}) {
    const n = symbols.length;
    if (!n) return [];
    let groups = symbols.map((s, i) => ({ id: i, members: [s] }));

    const dist = (ga, gb) => {
        let acc = 0, cnt = 0;
        for (const a of ga.members) {
            for (const b of gb.members) {
                const r = rho(a, b);
                if (isNum(r)) { acc += 1 - r; cnt++; }
            }
        }
        return cnt ? acc / cnt : Infinity;
    };

    for (;;) {
        let best = null;
        for (let i = 0; i < groups.length; i++) {
            for (let j = i + 1; j < groups.length; j++) {
                const d = dist(groups[i], groups[j]);
                if (d <= distanceCut && (!best || d < best.d)) best = { i, j, d };
            }
        }
        if (!best) break;
        const merged = { id: groups[best.i].id, members: groups[best.i].members.concat(groups[best.j].members) };
        groups = groups.filter((_, k) => k !== best.i && k !== best.j).concat([merged]);
    }

    return groups.map((g, idx) => {
        let acc = 0, cnt = 0;
        for (let i = 0; i < g.members.length; i++) {
            for (let j = i + 1; j < g.members.length; j++) {
                const r = rho(g.members[i], g.members[j]);
                if (isNum(r)) { acc += r; cnt++; }
            }
        }
        return {
            clusterId: idx + 1,
            members: g.members.slice().sort(),
            size: g.members.length,
            avgIntraRho: cnt ? acc / cnt : null,
        };
    }).sort((a, b) => b.size - a.size || a.members[0].localeCompare(b.members[0]));
}
