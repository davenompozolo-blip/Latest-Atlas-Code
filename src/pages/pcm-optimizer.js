// ============================================================
// ATLAS PCM — In-browser portfolio optimizer
// Implements: Min Variance, ERC (Risk Parity), Max Sharpe,
//             Max Diversification, Benchmark-Constrained MVO
// No external dependencies — pure JS matrix math.
// ============================================================

// ── Matrix helpers ────────────────────────────────────────────────────────────

function matMul(A, B) {
    const n = A.length, m = B[0].length, p = B.length;
    return Array.from({ length: n }, function(_, i) {
        return Array.from({ length: m }, function(_, j) {
            var s = 0;
            for (var k = 0; k < p; k++) s += A[i][k] * B[k][j];
            return s;
        });
    });
}

// Gaussian-elimination matrix inverse; returns null if singular
function matInv(M) {
    var n = M.length;
    var A = M.map(function(row, i) {
        return row.slice().concat(Array.from({ length: n }, function(_, j) { return j === i ? 1 : 0; }));
    });
    for (var col = 0; col < n; col++) {
        var maxRow = col;
        for (var row = col + 1; row < n; row++) {
            if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
        }
        var tmp = A[col]; A[col] = A[maxRow]; A[maxRow] = tmp;
        var pivot = A[col][col];
        if (Math.abs(pivot) < 1e-14) return null;
        for (var j = 0; j < 2 * n; j++) A[col][j] /= pivot;
        for (var r = 0; r < n; r++) {
            if (r === col) continue;
            var f = A[r][col];
            for (var jj = 0; jj < 2 * n; jj++) A[r][jj] -= f * A[col][jj];
        }
    }
    return A.map(function(row) { return row.slice(n); });
}

// Covariance matrix from returns matrix (rows=time, cols=assets)
export function covMatrix(returns) {
    var T = returns.length, N = returns[0].length;
    var means = Array.from({ length: N }, function(_, j) {
        return returns.reduce(function(s, r) { return s + r[j]; }, 0) / T;
    });
    return Array.from({ length: N }, function(_, i) {
        return Array.from({ length: N }, function(_, j) {
            var s = returns.reduce(function(sum, r) {
                return sum + (r[i] - means[i]) * (r[j] - means[j]);
            }, 0);
            return s / Math.max(T - 1, 1);
        });
    });
}

// Add small ridge to diagonal to ensure positive-definiteness
function ridgeCov(cov, lambda) {
    var n = cov.length, eps = lambda || 1e-6;
    return cov.map(function(row, i) {
        return row.map(function(v, j) { return v + (i === j ? eps : 0); });
    });
}

function portVar(w, cov) {
    var n = w.length, s = 0;
    for (var i = 0; i < n; i++)
        for (var j = 0; j < n; j++)
            s += w[i] * w[j] * cov[i][j];
    return Math.max(s, 0);
}

function portVol(w, cov) { return Math.sqrt(portVar(w, cov)); }

function margRisk(w, cov) {
    var n = w.length, vol = portVol(w, cov);
    if (vol < 1e-12) return new Array(n).fill(0);
    return Array.from({ length: n }, function(_, i) {
        return w.reduce(function(s, wj, j) { return s + wj * cov[i][j]; }, 0) / vol;
    });
}

function clampWeights(w, minW, maxW) {
    var sum = 0;
    var out = w.map(function(wi) {
        var c = Math.max(minW, Math.min(maxW, wi));
        sum += c;
        return c;
    });
    return out.map(function(wi) { return wi / sum; });
}

// ── Optimization modes ────────────────────────────────────────────────────────

// Min Variance: analytical w* = Σ⁻¹1 / 1'Σ⁻¹1
export function minVariance(cov, maxW) {
    var n = cov.length;
    var maxW_ = maxW || 0.30;
    var inv = matInv(ridgeCov(cov));
    if (!inv) return new Array(n).fill(1 / n);
    var invOnes = Array.from({ length: n }, function(_, i) {
        return inv[i].reduce(function(s, v) { return s + v; }, 0);
    });
    var sum = invOnes.reduce(function(s, v) { return s + v; }, 0);
    if (!sum) return new Array(n).fill(1 / n);
    return clampWeights(invOnes.map(function(v) { return v / sum; }), 0.001, maxW_);
}

// Equal Risk Contribution — iterative (Spinu 2013)
export function equalRiskContrib(cov, maxW) {
    var n = cov.length;
    var maxW_ = maxW || 0.30;
    var w = new Array(n).fill(1 / n);
    for (var iter = 0; iter < 300; iter++) {
        var mrc = margRisk(w, cov);
        var vol = portVol(w, cov);
        if (vol < 1e-12) break;
        var target = vol / n;
        var newW = w.map(function(wi, i) {
            return wi * target / Math.max(Math.abs(wi * mrc[i]), 1e-12);
        });
        newW = clampWeights(newW, 0.001, maxW_);
        var change = w.reduce(function(s, wi, i) { return s + Math.abs(wi - newW[i]); }, 0);
        w = newW;
        if (change < 1e-9) break;
    }
    return w;
}

// Max Sharpe — gradient ascent with projection
export function maxSharpe(means, cov, maxW) {
    var n = means.length;
    var maxW_ = maxW || 0.30;
    var w = new Array(n).fill(1 / n);
    var lr = 0.02;
    for (var iter = 0; iter < 400; iter++) {
        var vol = portVol(w, cov);
        if (vol < 1e-12) break;
        var ret = w.reduce(function(s, wi, i) { return s + wi * means[i]; }, 0);
        var sharpe = ret / vol;
        var mrc = margRisk(w, cov);
        var grad = means.map(function(mu, i) { return (mu - sharpe * mrc[i]) / vol; });
        var newW = clampWeights(w.map(function(wi, i) { return wi + lr * grad[i]; }), 0.001, maxW_);
        var change = w.reduce(function(s, wi, i) { return s + Math.abs(wi - newW[i]); }, 0);
        w = newW;
        if (change < 1e-9) break;
    }
    return w;
}

// Max Diversification — gradient ascent
export function maxDiversification(vols, cov, maxW) {
    var n = vols.length;
    var maxW_ = maxW || 0.30;
    var w = new Array(n).fill(1 / n);
    var lr = 0.02;
    for (var iter = 0; iter < 400; iter++) {
        var vol = portVol(w, cov);
        if (vol < 1e-12) break;
        var wv = w.reduce(function(s, wi, i) { return s + wi * vols[i]; }, 0);
        var dr = wv / vol;
        var mrc = margRisk(w, cov);
        var grad = vols.map(function(si, i) { return (si - dr * mrc[i]) / vol; });
        var newW = clampWeights(w.map(function(wi, i) { return wi + lr * grad[i]; }), 0.001, maxW_);
        var change = w.reduce(function(s, wi, i) { return s + Math.abs(wi - newW[i]); }, 0);
        w = newW;
        if (change < 1e-9) break;
    }
    return w;
}

// Benchmark-constrained = Max Sharpe with IPS concentration cap
export function benchmarkConstrained(means, cov, concentrationLimit) {
    var cap = concentrationLimit ? concentrationLimit / 100 : 0.20;
    return maxSharpe(means, cov, cap);
}

// ── Factor exposure computation ───────────────────────────────────────────────
// Returns factor score array matching MOCK_PCM_FACTORS shape.
// positions: [{ symbol, market_value }]
// histBySymbol: { SYMBOL: [{ close }, ...] } — chronological order

export function computeFactorScores(positions, histBySymbol) {
    var totalMv = positions.reduce(function(s, p) { return s + (p.market_value || 0); }, 0);
    if (!totalMv) return null;

    var acc = { mom: 0, growth: 0, quality: 0, lowvol: 0, value: 0, size: 0, profitability: 0 };
    var totalW = 0;

    positions.forEach(function(pos) {
        var w   = (pos.market_value || 0) / totalMv;
        var hist = histBySymbol[pos.symbol];
        if (!hist || hist.length < 30) return;
        var prices = hist.map(function(d) { return d.close; });
        var n = prices.length;
        var pNow = prices[n - 1];
        var p1m  = prices[Math.max(0, n - 22)];
        var p3m  = prices[Math.max(0, n - 63)];
        var p12m = prices[Math.max(0, n - 252)];

        var ret12m = (pNow - p12m) / p12m;
        var ret3m  = (pNow - p3m)  / p3m;
        var ret1m  = (pNow - p1m)  / p1m;
        var mom    = ret12m - ret1m;

        // 60-day realised vol
        var sumSq = 0, cnt = 0;
        for (var i = 1; i <= Math.min(60, n - 1); i++) {
            var r = Math.log(prices[n - i] / prices[n - i - 1]);
            if (isFinite(r)) { sumSq += r * r; cnt++; }
        }
        var vol = cnt > 5 ? Math.sqrt(sumSq / cnt * 252) : 0.25;
        var quality = vol > 0 ? ret12m / vol : 0;

        acc.mom          += w * mom;
        acc.growth       += w * ret3m;
        acc.quality      += w * quality;
        acc.lowvol       += w * (-vol);
        acc.value        += w * (-ret12m);
        acc.size         += w * Math.log10(Math.max(pos.market_value, 1));
        acc.profitability += w * ret12m;
        totalW += w;
    });

    if (totalW < 0.5) return null;

    function norm(v, center, scale) {
        return Math.max(-1, Math.min(1, (v - center) / scale));
    }
    function direction(score) {
        return score > 0.4 ? 'Overweight'
             : score > 0.1 ? 'Moderate'
             : score > -0.1 ? 'Neutral'
             : score > -0.4 ? 'Underweight'
             : 'Significant UW';
    }

    return [
        { factor: 'Momentum',      score: norm(acc.mom,          0.05,  0.20) },
        { factor: 'Growth',        score: norm(acc.growth,       0.03,  0.12) },
        { factor: 'Quality',       score: norm(acc.quality,      0.5,   0.8)  },
        { factor: 'Low Vol',       score: norm(acc.lowvol,      -0.25,  0.15) },
        { factor: 'Value',         score: norm(acc.value,        0,     0.20) },
        { factor: 'Size',          score: norm(acc.size,         4.5,   1.0)  },
        { factor: 'Profitability', score: norm(acc.profitability, 0.1,  0.20) },
    ].map(function(f) {
        f.score     = Math.round(f.score * 100) / 100;
        f.direction = direction(f.score);
        return f;
    });
}

// ── Portfolio-level metrics ───────────────────────────────────────────────────
// Compute: portfolio vol, HHI, diversification ratio
// positions: [{ symbol, market_value }]
// histBySymbol: { SYMBOL: [{ close }] }
// equitySnapshots: [{ as_of, equity }] — for portfolio-level vol

export function computePortfolioMetrics(positions, histBySymbol, equitySnapshots) {
    var totalMv = positions.reduce(function(s, p) { return s + (p.market_value || 0); }, 0);
    if (!totalMv) return null;

    // HHI (weight-based concentration)
    var hhi = positions.reduce(function(s, p) {
        var w = (p.market_value || 0) / totalMv;
        return s + w * w;
    }, 0);

    // Individual vols — weighted avg
    var weightedVol = 0, totalW = 0;
    positions.forEach(function(pos) {
        var w    = (pos.market_value || 0) / totalMv;
        var hist = histBySymbol[pos.symbol];
        if (!hist || hist.length < 20) return;
        var prices = hist.map(function(d) { return d.close; });
        var n = prices.length;
        var sumSq = 0, cnt = 0;
        for (var i = 1; i <= Math.min(90, n - 1); i++) {
            var r = Math.log(prices[n - i] / prices[n - i - 1]);
            if (isFinite(r)) { sumSq += r * r; cnt++; }
        }
        if (cnt > 10) { weightedVol += w * Math.sqrt(sumSq / cnt * 252); totalW += w; }
    });

    // Portfolio vol from equity snapshots
    var portVol_ = null;
    if (equitySnapshots && equitySnapshots.length > 20) {
        var snaps = equitySnapshots.slice().sort(function(a, b) { return new Date(a.as_of) - new Date(b.as_of); });
        var sumSq2 = 0, cnt2 = 0;
        for (var i = 1; i < snaps.length; i++) {
            var prev = snaps[i - 1].equity, curr = snaps[i].equity;
            if (prev > 0 && curr > 0) {
                var r = Math.log(curr / prev);
                if (isFinite(r)) { sumSq2 += r * r; cnt2++; }
            }
        }
        if (cnt2 > 10) portVol_ = Math.sqrt(sumSq2 / cnt2 * 252) * 100;
    }

    var wAvgVol = totalW > 0.5 ? (weightedVol / totalW) * 100 : null;
    var divRatio = portVol_ && wAvgVol && portVol_ > 0 ? wAvgVol / portVol_ : null;

    return {
        portfolioVol:       portVol_   ? portVol_.toFixed(1)   : null,
        riskHHI:            hhi.toFixed(4),
        diversificationRatio: divRatio ? divRatio.toFixed(2)   : null,
        weightedAvgVol:     wAvgVol    ? wAvgVol.toFixed(1)    : null,
    };
}

// ── Build returns matrix from price history ───────────────────────────────────
// positions: [{ symbol, asset_id, market_value }]
// histBySymbol: { SYMBOL: [{ close }] }
// Returns: { symbols, means, cov, vols }

export function buildOptimizerInputs(positions, histBySymbol) {
    var symbols = [], returns = [];

    positions.forEach(function(pos) {
        var hist = histBySymbol[pos.symbol];
        if (!hist || hist.length < 30) return;
        var prices = hist.map(function(d) { return d.close; });
        var rets = [];
        for (var i = 1; i < prices.length; i++) {
            if (prices[i - 1] > 0) rets.push(Math.log(prices[i] / prices[i - 1]));
        }
        if (rets.length > 20) {
            symbols.push(pos.symbol);
            returns.push(rets);
        }
    });

    if (symbols.length < 2) return null;

    // Align to same length (trim to shortest)
    var minLen = returns.reduce(function(m, r) { return Math.min(m, r.length); }, Infinity);
    var trimmed = returns.map(function(r) { return r.slice(r.length - minLen); });

    // Rows = time, cols = assets
    var matrix = Array.from({ length: minLen }, function(_, t) {
        return trimmed.map(function(r) { return r[t]; });
    });

    var cov = ridgeCov(covMatrix(matrix), 1e-6);
    var means = Array.from({ length: symbols.length }, function(_, i) {
        return matrix.reduce(function(s, row) { return s + row[i]; }, 0) / minLen;
    });
    var vols = Array.from({ length: symbols.length }, function(_, i) {
        return Math.sqrt(Math.max(cov[i][i], 0));
    });

    return { symbols: symbols, means: means, cov: cov, vols: vols };
}

// ── Run optimizer given mode string ──────────────────────────────────────────
// Returns { symbols, weights, metrics }

export function runOptimizer(mode, inputs, concentrationLimit) {
    var symbols = inputs.symbols;
    var n       = symbols.length;
    var maxW    = concentrationLimit ? concentrationLimit / 100 : 0.30;
    var weights;

    if (mode === 'mvo')        weights = maxSharpe(inputs.means, inputs.cov, maxW);
    else if (mode === 'erc')   weights = equalRiskContrib(inputs.cov, maxW);
    else if (mode === 'minvar') weights = minVariance(inputs.cov, maxW);
    else if (mode === 'maxdiv') weights = maxDiversification(inputs.vols, inputs.cov, maxW);
    else if (mode === 'bench') weights = benchmarkConstrained(inputs.means, inputs.cov, concentrationLimit);
    else weights = new Array(n).fill(1 / n);

    var vol    = portVol(weights, inputs.cov) * Math.sqrt(252) * 100;
    var ret    = weights.reduce(function(s, w, i) { return s + w * inputs.means[i]; }, 0) * 252 * 100;
    var sharpe = vol > 0 ? ret / vol : 0;

    return {
        symbols: symbols,
        weights: weights,
        metrics: {
            expectedReturn: ret.toFixed(2),
            expectedVol:    vol.toFixed(2),
            sharpe:         sharpe.toFixed(3),
        },
    };
}
