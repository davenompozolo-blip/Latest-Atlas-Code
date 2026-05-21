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

// Per-position clamp — used when regime scores provide individual min/max bounds
function clampWeightsArr(w, minWArr, maxWArr) {
    var sum = 0;
    var out = w.map(function(wi, i) {
        var c = Math.max(minWArr[i], Math.min(maxWArr[i], wi));
        sum += c;
        return c;
    });
    if (sum <= 0) return w.slice();
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

// ── Per-position risk budget rows for L4 ─────────────────────────────────────
// Returns rows matching RiskTable: { ticker, weight, vol_90d, mrc, prc }
// Computed from live positions+history so no duplicates and Name/Sector available.

export function computeRiskRows(positions, histBySymbol) {
    var totalMv = positions.reduce(function(s, p) { return s + (p.market_value || 0); }, 0);
    if (!totalMv) return [];

    var rows = positions.map(function(pos) {
        var w    = (pos.market_value || 0) / totalMv;
        var hist = histBySymbol[pos.symbol];
        var vol90d = null;
        if (hist && hist.length >= 10) {
            var prices = hist.map(function(d) { return d.close; });
            var n = prices.length;
            var sumSq = 0, cnt = 0;
            for (var i = 1; i <= Math.min(90, n - 1); i++) {
                var r = Math.log(prices[n - i] / prices[n - i - 1]);
                if (isFinite(r)) { sumSq += r * r; cnt++; }
            }
            if (cnt > 5) vol90d = Math.sqrt(sumSq / cnt * 252) * 100;
        }
        return { ticker: pos.symbol, weight: w, vol90d: vol90d };
    });

    var totalRiskProxy = rows.reduce(function(s, r) { return s + r.weight * (r.vol90d || 0); }, 0);

    return rows.map(function(r) {
        var rc = r.weight * (r.vol90d || 0);
        return {
            ticker:  r.ticker,
            weight:  r.weight * 100,
            vol_90d: r.vol90d,
            mrc:     r.vol90d != null ? r.weight * r.vol90d / 100 : null,
            prc:     totalRiskProxy > 0 ? rc / totalRiskProxy * 100 : null,
        };
    }).sort(function(a, b) { return (b.prc || 0) - (a.prc || 0); });
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
    means._lookbackDays = minLen;  // carry lookback for display
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

// ── ATLAS Adaptive: macro-informed, turnover-penalized, entropy-regularized ───

// Raw factor scores for a single position's price history
export function perSymbolFactors(hist) {
    if (!hist || hist.length < 30) return null;
    var prices = hist.map(function(d) { return d.close; });
    var n = prices.length;
    var pNow = prices[n - 1];
    var p1m  = prices[Math.max(0, n - 22)];
    var p3m  = prices[Math.max(0, n - 63)];
    var p12m = prices[Math.max(0, n - 252)];
    var ret12m = (pNow - p12m) / p12m;
    var ret3m  = (pNow - p3m)  / p3m;
    var ret1m  = (pNow - p1m)  / p1m;
    var mom    = ret12m - ret1m; // skip-month momentum
    var sumSq = 0, cnt = 0;
    for (var i = 1; i <= Math.min(60, n - 1); i++) {
        var r = Math.log(prices[n - i] / prices[n - i - 1]);
        if (isFinite(r)) { sumSq += r * r; cnt++; }
    }
    var vol = cnt > 5 ? Math.sqrt(sumSq / cnt * 252) : 0.25;
    var quality = vol > 0 ? ret12m / vol : 0;
    return { mom: mom, growth: ret3m, quality: quality, lowvol: -vol, value: -ret12m };
}

// ── Regime → sector alignment table ──────────────────────────────────────────
// Scores reflect which sectors are structurally favoured in each macro regime.
var REGIME_SECTOR_TILTS = {
    'Goldilocks': {
        Technology: 0.9, 'Consumer Discretionary': 0.7, Communications: 0.4,
        Healthcare: 0.3, Financials: 0.2, Industrials: 0.2, International: 0.1,
        'Real Estate': 0.0, Materials: -0.1, 'Consumer Staples': -0.1,
        Energy: -0.2, Utilities: -0.3, 'Fixed Income': -0.5,
    },
    'Reflation': {
        Energy: 1.0, Materials: 0.8, Financials: 0.6, Industrials: 0.5,
        International: 0.3, 'Consumer Discretionary': 0.2, Technology: 0.1,
        'Real Estate': 0.0, Healthcare: -0.1, 'Consumer Staples': -0.2,
        Utilities: -0.3, 'Fixed Income': -0.6,
    },
    'Stagflation': {
        Energy: 0.8, 'Consumer Staples': 0.7, Materials: 0.6, Healthcare: 0.5,
        Utilities: 0.4, 'Real Estate': 0.1, International: 0.0,
        'Fixed Income': 0.2, Financials: -0.2, Technology: -0.6,
        'Consumer Discretionary': -0.7, Communications: -0.3,
    },
    'Deflation': {
        'Fixed Income': 1.0, Healthcare: 0.6, 'Consumer Staples': 0.5,
        Utilities: 0.4, Technology: 0.2, 'Real Estate': 0.0, International: -0.1,
        Financials: -0.3, 'Consumer Discretionary': -0.4,
        Materials: -0.5, Energy: -0.6,
    },
};

// Classify every portfolio position against the current regime.
// Returns [{ symbol, sector, regimeScore, factorScore, sectorScore, regimeClass, isOption, factors }]
// regimeClass: 'favorable' (>0.25) | 'neutral' (-0.25..0.25) | 'counter' (<-0.25)
export function computeRegimeScores(positions, histBySymbol, macroSignals) {
    var tilts     = macroToFactorTilts(macroSignals);
    var regime    = macroSignals ? macroSignals.regime : null;
    var sectorMap = (regime && REGIME_SECTOR_TILTS[regime]) || {};

    return positions.map(function(pos) {
        var f = perSymbolFactors(histBySymbol[pos.symbol]);
        var factorScore = 0;
        if (f && tilts) {
            var raw = tilts.mom     * Math.tanh(f.mom     * 5)
                    + tilts.quality * Math.tanh(f.quality * 2)
                    + tilts.lowvol  * Math.tanh(f.lowvol  * 5)
                    + tilts.value   * Math.tanh(f.value   * 5)
                    + tilts.growth  * Math.tanh(f.growth  * 8);
            factorScore = Math.max(-1, Math.min(1, raw / 5));
        }
        var sector      = pos.sector || '';
        var sectorScore = sectorMap[sector] != null ? sectorMap[sector] : 0;
        // 55% quantitative factor behaviour + 45% qualitative macro sector thesis
        var combined    = Math.max(-1, Math.min(1, factorScore * 0.55 + sectorScore * 0.45));
        var regimeClass = combined > 0.25 ? 'favorable' : combined < -0.25 ? 'counter' : 'neutral';
        return {
            symbol:      pos.symbol,
            sector:      sector,
            regimeScore: combined,
            factorScore: factorScore,
            sectorScore: sectorScore,
            regimeClass: regimeClass,
            isOption:    !!(pos.asset_class && pos.asset_class.includes('option')),
            factors:     f,
        };
    });
}

// Map macro signals → factor tilt vector (values −1 to +1)
function macroToFactorTilts(signals) {
    if (!signals) return null;
    var t = { mom: 0, quality: 0, lowvol: 0, value: 0, growth: 0 };

    switch (signals.regime) {
        case 'Goldilocks':   // Growth↑ Inflation↓ — classic risk-on
            t.mom = 0.8; t.growth = 0.7; t.quality = 0.2; t.lowvol = -0.5; t.value = -0.2;
            break;
        case 'Reflation':    // Growth↑ Inflation↑ — pro-cyclical, value
            t.mom = 0.5; t.value = 0.8; t.growth = 0.3; t.quality = 0.0; t.lowvol = -0.4;
            break;
        case 'Stagflation':  // Growth↓ Inflation↑ — defensive, quality
            t.quality = 0.9; t.lowvol = 0.7; t.value = 0.5; t.mom = -0.5; t.growth = -0.7;
            break;
        case 'Deflation':    // Growth↓ Inflation↓ — risk-off, hide in quality
            t.quality = 0.8; t.lowvol = 0.9; t.value = 0.2; t.mom = -0.6; t.growth = -0.8;
            break;
    }

    // Yield-curve inversion overlay: +defensive
    if (signals.spread2s10s != null && signals.spread2s10s < 0) {
        t.quality += 0.3; t.lowvol += 0.3; t.mom -= 0.2;
    }

    // Elevated HY spreads (>400 bps): risk-off credit overlay
    if (signals.hySpreads != null && signals.hySpreads > 400) {
        t.quality += 0.2; t.lowvol += 0.2; t.mom -= 0.2;
    }

    // Clamp to [−1, +1]
    Object.keys(t).forEach(function(k) { t[k] = Math.max(-1, Math.min(1, t[k])); });
    return t;
}

// Async: pull latest macro signals from the existing /api/macro endpoint
export async function fetchMacroSignals() {
    try {
        var resp = await fetch('/api/macro');
        if (!resp.ok) return null;
        var data = await resp.json();
        var spread2s10s = null, hySpreads = null, cpiYoY = null, unrate = null;
        if (data.yields && data.yields.curve) spread2s10s = data.yields.curve.spread2s10s;
        if (data.credit && data.credit.hySpreads && data.credit.hySpreads.length)
            hySpreads = data.credit.hySpreads[data.credit.hySpreads.length - 1].value;
        if (data.regime) cpiYoY = data.regime.cpiYoY;
        if (data.growth && data.growth.unrate && data.growth.unrate.length)
            unrate = data.growth.unrate[data.growth.unrate.length - 1].value;
        return {
            regime:      data.regime ? data.regime.label : null,
            regimeColor: data.regime ? data.regime.color : '#6b7280',
            spread2s10s: spread2s10s,
            hySpreads:   hySpreads,
            cpiYoY:      cpiYoY,
            unrate:      unrate,
        };
    } catch(e) {
        console.warn('[PCM] fetchMacroSignals failed:', e);
        return null;
    }
}

// Gradient ascent on anchored, entropy-regularized, sector-diversified Sharpe
function anchoredEntropyOptimizer(means, cov, currentWeights, riskTolerance, maxW, sectorIdx, nSectors, lambdaOv, gammaOv, etaOv, minWArr, maxWArr) {
    var n = means.length;
    var minW = 0.005;  // 0.5% hard floor — let the Sharpe gradient actually differentiate
    maxW = maxW || 0.30;
    var hasPerPos = !!(minWArr && maxWArr && minWArr.length === n);

    var rt = riskTolerance != null ? Math.max(1, Math.min(10, riskTolerance)) : 5;
    var lambda = lambdaOv != null ? lambdaOv : (0.025 + 0.075 * (10 - rt) / 9);
    var gamma  = gammaOv  != null ? gammaOv  : 0.005;  // reduced from 0.018 — entropy was over-powering Sharpe gradient
    var eta    = etaOv    != null ? etaOv    : 0.18;

    var hasSectors = sectorIdx && sectorIdx.length === n && nSectors > 0;

    // Warm-start from current weights (already sums to ~1)
    var w = currentWeights.slice();
    var sumW = w.reduce(function(s, wi) { return s + wi; }, 0);
    if (sumW < 0.5) w = new Array(n).fill(1 / n);
    w = hasPerPos ? clampWeightsArr(w, minWArr, maxWArr) : clampWeights(w, minW, maxW);

    var w0 = currentWeights.slice();
    var lr = 0.012;

    // Sector-weight accumulator (reused each iteration)
    var sectorW = hasSectors ? new Array(nSectors).fill(0) : null;

    for (var iter = 0; iter < 800; iter++) {
        var vol = portVol(w, cov);
        if (vol < 1e-12) break;
        var ret = w.reduce(function(s, wi, i) { return s + wi * means[i]; }, 0);
        var sharpe = ret / vol;
        var mrc = margRisk(w, cov);

        // Aggregate sector weights
        if (hasSectors) {
            for (var s = 0; s < nSectors; s++) sectorW[s] = 0;
            for (var i = 0; i < n; i++) sectorW[sectorIdx[i]] += w[i];
        }

        var grad = means.map(function(mu, i) {
            var gSharpe   = (mu - sharpe * mrc[i]) / vol;
            var gTurnover = -2 * lambda * (w[i] - w0[i]);
            var gEntropy  = -gamma * (Math.log(Math.max(w[i], 1e-12)) + 1);
            var gSector   = hasSectors ? -2 * eta * sectorW[sectorIdx[i]] : 0;
            return gSharpe + gTurnover + gEntropy + gSector;
        });

        var stepped = w.map(function(wi, i) { return wi + lr * grad[i]; });
        var newW = hasPerPos ? clampWeightsArr(stepped, minWArr, maxWArr) : clampWeights(stepped, minW, maxW);
        var change = w.reduce(function(s, wi, i) { return s + Math.abs(wi - newW[i]); }, 0);
        w = newW;
        if (change < 1e-10) break;
    }
    return w;
}

// Full ATLAS Adaptive run — call this instead of runOptimizer when mode==='atlas'
// regimeScores: output of computeRegimeScores — drives per-position weight bounds
export function runAtlasAdaptive(inputs, positions, histBySymbol, ips, macroSignals, overrides, regimeScores) {
    var n = inputs.symbols.length;
    var totalMv = positions.reduce(function(s, p) { return s + (p.market_value || 0); }, 0);

    // Current weights for each optimizer symbol (warm start)
    var currentWeights = inputs.symbols.map(function(sym) {
        var pos = positions.find(function(p) { return p.symbol === sym; });
        return pos && totalMv > 0 ? pos.market_value / totalMv : 1 / n;
    });

    // Macro tilts from regime + overlays
    var tilts = macroToFactorTilts(macroSignals);
    var ALPHA = 0.55; // 55% weight on macro views — regime scores must drive differentiated weights

    // Per-symbol macro alignment → return adjustment
    var macroAlignments = inputs.symbols.map(function(sym) {
        if (!tilts) return 0;
        var f = perSymbolFactors(histBySymbol[sym]);
        if (!f) return 0;
        // Weighted dot product (scaling each factor to bring into comparable units)
        var score = tilts.mom     * Math.tanh(f.mom     * 5)
                  + tilts.quality * Math.tanh(f.quality * 2)
                  + tilts.lowvol  * Math.tanh(f.lowvol  * 5)
                  + tilts.value   * Math.tanh(f.value   * 5)
                  + tilts.growth  * Math.tanh(f.growth  * 8);
        return Math.max(-1, Math.min(1, score / 5)); // normalise by factor count
    });

    // Macro-adjusted expected daily returns
    var adjMeans = inputs.means.map(function(mu, i) {
        return mu + ALPHA * macroAlignments[i] * inputs.vols[i];
    });

    // Sector mapping for the breadth penalty
    var sectorList = [];
    var sectorIdx = inputs.symbols.map(function(sym) {
        var pos = positions.find(function(p) { return p.symbol === sym; });
        var sec = (pos && pos.sector) ? pos.sector : 'Unknown';
        var idx = sectorList.indexOf(sec);
        if (idx === -1) { sectorList.push(sec); idx = sectorList.length - 1; }
        return idx;
    });

    var maxW = ips && ips.concentration_limit ? ips.concentration_limit / 100 : 0.30;
    var rt   = ips ? ips.risk_tolerance : 5;

    // Per-position weight bounds from ML regime classification
    var minWArr = null, maxWArr = null;
    if (regimeScores && regimeScores.length > 0) {
        var regimeBySymbol = {};
        regimeScores.forEach(function(rs) { regimeBySymbol[rs.symbol] = rs; });
        minWArr = inputs.symbols.map(function(sym) {
            var rs = regimeBySymbol[sym];
            if (!rs) return 0.005;
            if (rs.regimeClass === 'favorable') return 0.02;
            if (rs.regimeClass === 'counter')   return 0.001;
            return 0.005;
        });
        maxWArr = inputs.symbols.map(function(sym) {
            var rs = regimeBySymbol[sym];
            if (!rs) return maxW;
            if (rs.regimeClass === 'favorable') return Math.min(0.45, maxW * 1.75);
            if (rs.regimeClass === 'counter')   return Math.min(0.06, maxW * 0.35);
            return maxW;
        });
    }

    var weights = anchoredEntropyOptimizer(adjMeans, inputs.cov, currentWeights, rt, maxW,
                                            sectorIdx, sectorList.length,
                                            overrides ? overrides.lambda : null,
                                            overrides ? overrides.gamma  : null,
                                            overrides ? overrides.eta    : null,
                                            minWArr, maxWArr);

    var vol    = portVol(weights, inputs.cov) * Math.sqrt(252) * 100;
    var ret    = weights.reduce(function(s, w, i) { return s + w * adjMeans[i]; }, 0) * 252 * 100;
    var sharpe = vol > 0 ? ret / vol : 0;
    var lambda = (overrides && overrides.lambda != null) ? overrides.lambda
               : (0.025 + 0.075 * (10 - Math.max(1, Math.min(10, rt || 5))) / 9);

    // Breadth metrics — effective N positions, effective N sectors
    var hhi = weights.reduce(function(s, w) { return s + w * w; }, 0);
    var effectiveN = hhi > 0 ? 1 / hhi : 0;
    var sectorWeights = new Array(sectorList.length).fill(0);
    weights.forEach(function(w, i) { sectorWeights[sectorIdx[i]] += w; });
    var sectorHHI = sectorWeights.reduce(function(s, w) { return s + w * w; }, 0);
    var effectiveSectors = sectorHHI > 0 ? 1 / sectorHHI : 0;

    // Top sector breakdown (descending) for display
    var sectorBreakdown = sectorList.map(function(name, i) {
        return { sector: name, weight: sectorWeights[i] };
    }).filter(function(s) { return s.weight > 0.005; })
      .sort(function(a, b) { return b.weight - a.weight; });

    var alignedRanked = inputs.symbols.map(function(sym, i) {
        return { sym: sym, a: macroAlignments[i] };
    }).sort(function(a, b) { return b.a - a.a; });

    // Cap each alignment list to half the universe so they never overlap
    var alignHalf = Math.max(1, Math.floor(n / 2));

    return {
        symbols: inputs.symbols,
        weights: weights,
        metrics: {
            expectedReturn: ret.toFixed(2),
            expectedVol:    vol.toFixed(2),
            sharpe:         sharpe.toFixed(3),
            effectiveN:        effectiveN.toFixed(1),
            effectiveSectors:  effectiveSectors.toFixed(1),
            totalPositions:    inputs.symbols.length,
            totalSectors:      sectorList.length,
            lookbackDays:      inputs.means._lookbackDays || null,
        },
        macroContext: {
            regime:      macroSignals ? macroSignals.regime      : null,
            regimeColor: macroSignals ? macroSignals.regimeColor : '#6b7280',
            spread2s10s: macroSignals ? macroSignals.spread2s10s : null,
            hySpreads:   macroSignals ? macroSignals.hySpreads   : null,
            cpiYoY:      macroSignals ? macroSignals.cpiYoY      : null,
            tilts:       tilts,
            lambda:      lambda,
            topAligned:  alignedRanked.slice(0, alignHalf),
            botAligned:  alignedRanked.slice(n - alignHalf).reverse(),
            sectorBreakdown: sectorBreakdown,
            regimeScores: regimeScores || null,
        },
    };
}
