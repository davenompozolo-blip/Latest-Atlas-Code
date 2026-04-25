import { fmt, fmtPct, cls, useChart } from './utils.js';

const { useState, useRef, useEffect, useMemo } = React;

// ---- Stats helpers ----

function mean(a) {
    var s = 0; for (var i = 0; i < a.length; i++) s += a[i];
    return a.length ? s / a.length : 0;
}

function std(a) {
    if (a.length < 2) return 0;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
}

function cov(a, b) {
    var n = Math.min(a.length, b.length);
    if (n < 2) return 0;
    var ma = mean(a), mb = mean(b), s = 0;
    for (var i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
    return s / (n - 1);
}

function corr(a, b) {
    var sa = std(a), sb = std(b);
    return (sa && sb) ? cov(a, b) / (sa * sb) : 0;
}

function returns(prices) {
    var r = [];
    for (var i = 1; i < prices.length; i++) r.push(prices[i] / prices[i - 1] - 1);
    return r;
}

function parseDaily(raw) {
    var ts = raw && raw['Time Series (Daily)'];
    if (!ts) return [];
    var out = [];
    for (var d in ts) {
        var c = parseFloat(ts[d]['4. close']);
        if (isFinite(c)) out.push({ date: d, close: c });
    }
    out.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
    return out;
}

// ---- Core risk engine ----

function computeRisk(stockSeries, benchSeries) {
    var bMap = {};
    for (var i = 0; i < benchSeries.length; i++) bMap[benchSeries[i].date] = benchSeries[i].close;

    var sp = [], bp = [], dates = [];
    for (var j = 0; j < stockSeries.length; j++) {
        if (bMap[stockSeries[j].date] != null) {
            sp.push(stockSeries[j].close);
            bp.push(bMap[stockSeries[j].date]);
            dates.push(stockSeries[j].date);
        }
    }

    var sr = returns(sp), br = returns(bp);
    var n = sr.length;
    if (n < 10) return null;

    var rf = 0.05 / 252;
    var mS = mean(sr), sS = std(sr);
    var annRet = mS * 252, annVol = sS * Math.sqrt(252);

    var sorted = sr.slice().sort(function(a, b) { return a - b; });
    var i5 = Math.max(0, Math.floor(n * 0.05));
    var i1 = Math.max(0, Math.floor(n * 0.01));
    var var95 = -sorted[i5];
    var var99 = -sorted[i1];
    var cvar95 = i5 > 0 ? -mean(sorted.slice(0, i5)) : var95;

    var sharpe = annVol > 0 ? (annRet - 0.05) / annVol : null;
    var down = sr.filter(function(r) { return r < 0; });
    var downDev = std(down) * Math.sqrt(252);
    var sortino = downDev > 0 ? (annRet - 0.05) / downDev : null;

    var peak = 0, maxDD = 0;
    for (var k = 0; k < sp.length; k++) {
        if (sp[k] > peak) peak = sp[k];
        var dd = (sp[k] - peak) / peak;
        if (dd < maxDD) maxDD = dd;
    }
    var calmar = maxDD < 0 ? annRet / Math.abs(maxDD) : null;

    var vB = std(br); vB = vB * vB;
    var beta = vB > 0 ? cov(sr, br) / vB : null;
    var mB = mean(br);
    var alpha = beta != null ? ((mS - rf) - beta * (mB - rf)) * 252 : null;
    var rSq = Math.pow(corr(sr, br), 2);

    var excess = [];
    for (var e = 0; e < Math.min(sr.length, br.length); e++) excess.push(sr[e] - br[e]);
    var te = std(excess) * Math.sqrt(252);
    var ir = te > 0 ? mean(excess) * 252 / te : null;

    var s3 = 0, s4 = 0;
    for (var q = 0; q < n; q++) { var z = (sr[q] - mS) / sS; s3 += z * z * z; s4 += z * z * z * z; }
    var skew = s3 / n, kurt = s4 / n - 3;

    var rc = [], rv30 = [], rv90 = [], rb = [];
    for (var w = 0; w < sr.length; w++) {
        var dt = dates[w + 1];
        if (w >= 89) {
            var sw = sr.slice(w - 89, w + 1), bw = br.slice(w - 89, w + 1);
            rc.push({ date: dt, value: corr(sw, bw) });
            rv90.push({ date: dt, value: std(sw) * Math.sqrt(252) });
            var vbw = std(bw); vbw = vbw * vbw;
            rb.push({ date: dt, value: vbw > 0 ? cov(sw, bw) / vbw : null });
        }
        if (w >= 29) rv30.push({ date: dt, value: std(sr.slice(w - 29, w + 1)) * Math.sqrt(252) });
    }

    var binCt = 30, minR = sorted[0], maxR = sorted[n - 1], bw2 = (maxR - minR) / binCt;
    var bins = [];
    for (var b = 0; b < binCt; b++) {
        var lo = minR + b * bw2, hi = lo + bw2, ct = 0;
        for (var h = 0; h < n; h++) if (sorted[h] >= lo && (b === binCt - 1 ? sorted[h] <= hi : sorted[h] < hi)) ct++;
        bins.push({ mid: (lo + hi) / 2, count: ct });
    }

    return {
        annRet: annRet, annVol: annVol, var95: var95, var99: var99, cvar95: cvar95,
        sharpe: sharpe, sortino: sortino, maxDD: maxDD, calmar: calmar,
        beta: beta, alpha: alpha, rSq: rSq, te: te, ir: ir,
        skew: skew, kurt: kurt,
        sr: sr, br: br, dates: dates,
        rc: rc, rv30: rv30, rv90: rv90, rb: rb, bins: bins,
    };
}

// ---- Monte Carlo GBM engine ----

function normalRandom() {
    var u1 = Math.random(), u2 = Math.random();
    while (u1 === 0) u1 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function runGBM(dailyReturns, nPaths, horizon, price) {
    var n = dailyReturns.length;
    if (n < 30 || price <= 0) return null;
    var mu = mean(dailyReturns), sigma = std(dailyReturns);
    if (sigma <= 0) return null;
    var drift = mu - 0.5 * sigma * sigma;
    var paths = [];
    for (var i = 0; i < nPaths; i++) {
        var path = [price];
        for (var t = 0; t < horizon; t++) {
            path.push(path[path.length - 1] * Math.exp(drift + sigma * normalRandom()));
        }
        paths.push(path);
    }
    var pctLevels = [5, 25, 50, 75, 95];
    var bands = pctLevels.map(function() { return []; });
    for (var t2 = 0; t2 <= horizon; t2++) {
        var col = paths.map(function(p) { return p[t2]; }).sort(function(a, b) { return a - b; });
        pctLevels.forEach(function(pv, pi) {
            bands[pi].push(col[Math.max(0, Math.round(pv / 100 * (col.length - 1)))]);
        });
    }
    var finals = paths.map(function(p) { return p[horizon]; }).sort(function(a, b) { return a - b; });
    var finalRets = finals.map(function(v) { return (v - price) / price; });
    return {
        bands: bands,
        pcts: pctLevels,
        finalRets: finalRets,
        stats: {
            mean: mean(finals),
            median: finals[Math.floor(finals.length / 2)],
            p5: finals[Math.floor(0.05 * finals.length)],
            p95: finals[Math.floor(0.95 * finals.length)],
            probProfit: finals.filter(function(v) { return v > price; }).length / finals.length * 100,
            probLoss10: finals.filter(function(v) { return v < price * 0.9; }).length / finals.length * 100,
            probGain20: finals.filter(function(v) { return v > price * 1.2; }).length / finals.length * 100,
        },
    };
}

// ---- Monte Carlo chart components ----

function McPathsChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.bands || !p.bands.length) return null;
        var horizon = p.bands[0].length - 1;
        var labels = [];
        for (var i = 0; i <= horizon; i++) labels.push(i % 20 === 0 ? 'Day ' + i : '');
        var colors = ['#ef4444', '#f59e0b', '#00d4ff', '#10b981', '#a78bfa'];
        var pctLabels = ['P5 Bear', 'P25', 'P50 Median', 'P75', 'P95 Bull'];
        var datasets = p.bands.map(function(band, i) {
            return {
                label: pctLabels[i],
                data: band,
                borderColor: colors[i],
                borderWidth: i === 2 ? 2.5 : 1.5,
                borderDash: i < 2 ? [4, 3] : i > 2 ? [2, 2] : [],
                fill: false,
                pointRadius: 0,
                tension: 0.2,
            };
        });
        return {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', labels: { color: 'rgba(255,255,255,0.55)', boxWidth: 18, font: { size: 10 } } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
                    y: {
                        ticks: {
                            color: 'rgba(255,255,255,0.4)', font: { size: 9 },
                            callback: function(v) { return '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0)); }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        };
    }, [p.bands]);
    return React.createElement('div', { style: { height: 280 } }, React.createElement('canvas', { ref: ref }));
}

function McDistChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.rets || !p.rets.length) return null;
        var sorted = p.rets.slice().sort(function(a, b) { return a - b; });
        var minR = sorted[0], maxR = sorted[sorted.length - 1];
        var nBins = 40, bw = (maxR - minR) / nBins || 0.001;
        var bins = [];
        for (var b = 0; b < nBins; b++) {
            var lo = minR + b * bw, hi = lo + bw, ct = 0;
            for (var i = 0; i < sorted.length; i++) {
                if (sorted[i] >= lo && (b === nBins - 1 ? sorted[i] <= hi : sorted[i] < hi)) ct++;
            }
            bins.push({ mid: (lo + hi) / 2, count: ct });
        }
        var varIdx = Math.max(0, Math.floor((1 - p.conf / 100) * sorted.length));
        var varLine = sorted[varIdx];
        return {
            type: 'bar',
            data: {
                labels: bins.map(function(b) { return (b.mid * 100).toFixed(1) + '%'; }),
                datasets: [{
                    label: 'Frequency',
                    data: bins.map(function(b) { return b.count; }),
                    backgroundColor: bins.map(function(b) { return b.mid < varLine ? 'rgba(239,68,68,0.65)' : 'rgba(99,102,241,0.6)'; }),
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 }, maxRotation: 45, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [p.rets, p.conf]);
    return React.createElement('div', { style: { height: 200 } }, React.createElement('canvas', { ref: ref }));
}

// ---- Sub-tab 5: Monte Carlo ----

var MC_PATH_OPTIONS = [100, 250, 500, 1000, 2000];
var MC_HORIZON_OPTIONS = [[30, '1 Month'], [63, '3 Months'], [126, '6 Months'], [252, '1 Year'], [504, '2 Years']];
var MC_CONF_OPTIONS = [90, 95, 99];

var selStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 4, padding: '5px 8px', width: '100%', cursor: 'pointer' };
var ctrlLabelStyle = { fontSize: 10, color: 'var(--text-sec)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };

function McPanel(p) {
    var r = p.risk, price = p.price;
    var _s = useState(500), nPaths = _s[0], setNPaths = _s[1];
    var _h = useState(252), horizon = _h[0], setHorizon = _h[1];
    var _c = useState(95), conf = _c[0], setConf = _c[1];

    var mc = useMemo(function() {
        if (!r || !r.sr || r.sr.length < 30 || !price) return null;
        return runGBM(r.sr, nPaths, horizon, price);
    }, [r, nPaths, horizon, price]);

    if (!r || !r.sr || r.sr.length < 30) {
        return React.createElement('div', { className: 'card', style: { color: 'var(--text-muted)', textAlign: 'center', padding: 24 } },
            'Insufficient price history for simulation (need 30+ days).');
    }

    var varIdx = mc ? Math.max(0, Math.floor((1 - conf / 100) * mc.finalRets.length)) : 0;
    var varVal = mc ? mc.finalRets[varIdx] : null;
    var cvarRets = mc ? mc.finalRets.filter(function(x) { return x <= varVal; }) : [];
    var cvarVal = cvarRets.length ? mean(cvarRets) : varVal;

    return React.createElement('div', null,
        React.createElement('div', { className: 'card', style: { marginBottom: 16 } },
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: mc ? 16 : 0 } },
                React.createElement('div', null,
                    React.createElement('div', { style: ctrlLabelStyle }, 'Simulations'),
                    React.createElement('select', { value: nPaths, onChange: function(e) { setNPaths(+e.target.value); }, style: selStyle },
                        MC_PATH_OPTIONS.map(function(v) { return React.createElement('option', { key: v, value: v }, v + ' paths'); })
                    )
                ),
                React.createElement('div', null,
                    React.createElement('div', { style: ctrlLabelStyle }, 'Horizon'),
                    React.createElement('select', { value: horizon, onChange: function(e) { setHorizon(+e.target.value); }, style: selStyle },
                        MC_HORIZON_OPTIONS.map(function(v) { return React.createElement('option', { key: v[0], value: v[0] }, v[1]); })
                    )
                ),
                React.createElement('div', null,
                    React.createElement('div', { style: ctrlLabelStyle }, 'Confidence Level'),
                    React.createElement('select', { value: conf, onChange: function(e) { setConf(+e.target.value); }, style: selStyle },
                        MC_CONF_OPTIONS.map(function(v) { return React.createElement('option', { key: v, value: v }, v + '%'); })
                    )
                )
            ),
            mc ? React.createElement('div', null,
                React.createElement('div', { className: 'card-title' }, 'Simulated Price Paths — ' + nPaths + ' paths · ' + horizon + ' trading days'),
                React.createElement(McPathsChart, { bands: mc.bands })
            ) : null
        ),
        mc ? React.createElement('div', null,
            React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 } },
                React.createElement(Tile, { label: 'Expected Price', value: '$' + mc.stats.mean.toFixed(2) }),
                React.createElement(Tile, { label: 'Median (P50)', value: '$' + mc.stats.median.toFixed(2) }),
                React.createElement(Tile, { label: 'P5 Bear Case', value: '$' + mc.stats.p5.toFixed(2), color: '#ef4444' }),
                React.createElement(Tile, { label: 'P95 Bull Case', value: '$' + mc.stats.p95.toFixed(2), color: '#10b981' })
            ),
            React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 } },
                React.createElement(Tile, { label: 'Prob of Profit', value: mc.stats.probProfit.toFixed(1) + '%', color: mc.stats.probProfit > 50 ? '#10b981' : '#ef4444' }),
                React.createElement(Tile, { label: 'Prob Loss >10%', value: mc.stats.probLoss10.toFixed(1) + '%', color: '#ef4444' }),
                React.createElement(Tile, { label: 'Prob Gain >20%', value: mc.stats.probGain20.toFixed(1) + '%', color: '#10b981' })
            ),
            React.createElement('div', { className: 'card' },
                React.createElement('div', { className: 'card-title' }, 'Final Return Distribution'),
                React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: 12 } },
                    React.createElement(Tile, { label: 'VaR (' + conf + '%)', value: fP(varVal), color: '#ef4444' }),
                    React.createElement(Tile, { label: 'CVaR (' + conf + '%)', value: fP(cvarVal), color: '#f59e0b' })
                ),
                React.createElement(McDistChart, { rets: mc.finalRets, conf: conf }),
                React.createElement('div', { style: { fontSize: 10, color: 'var(--text-sec)', textAlign: 'center', marginTop: 6 } },
                    'Red = below VaR threshold · GBM log-normal assumption · Based on historical return distribution')
            )
        ) : null
    );
}

// ---- Shared UI atoms ----

function Tile(p) {
    return React.createElement('div', { className: 'metric-card' },
        React.createElement('div', { className: 'label' }, p.label),
        React.createElement('div', { className: 'value', style: p.color ? { color: p.color } : null }, p.value),
        p.sub ? React.createElement('div', { className: 'sub' }, p.sub) : null
    );
}

function SubTab(p) {
    return React.createElement('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 } },
        p.tabs.map(function(t) {
            var a = t.id === p.active;
            return React.createElement('button', {
                key: t.id, onClick: function() { p.onSelect(t.id); },
                style: {
                    background: a ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                    color: a ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                    border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                    borderRadius: 6, padding: '6px 14px', fontSize: 11,
                    fontWeight: a ? 600 : 400, cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: 0.8,
                }
            }, t.label);
        })
    );
}

function fN(n, d) { return n != null && isFinite(n) ? Number(n).toFixed(d != null ? d : 2) : '\u2014'; }
function fP(n) { return n != null && isFinite(n) ? (n * 100).toFixed(2) + '%' : '\u2014'; }
function rc(v) { return v > 0 ? '#10b981' : v < 0 ? '#ef4444' : null; }

// ---- Sub-tab 1: Overview ----

function OverviewPanel(p) {
    var r = p.risk;
    if (!r) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Insufficient data.');
    return React.createElement('div', null,
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(4, 1fr)' } },
            React.createElement(Tile, { label: 'VaR (1D, 95%)', value: fP(r.var95), color: '#ef4444' }),
            React.createElement(Tile, { label: 'CVaR (1D, 95%)', value: fP(r.cvar95), color: '#ef4444' }),
            React.createElement(Tile, { label: 'Max Drawdown', value: fP(r.maxDD), color: '#ef4444' }),
            React.createElement(Tile, { label: 'Ann. Volatility', value: fP(r.annVol) })
        ),
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 } },
            React.createElement(Tile, { label: 'Sharpe Ratio', value: fN(r.sharpe), color: rc(r.sharpe) }),
            React.createElement(Tile, { label: 'Sortino Ratio', value: fN(r.sortino), color: rc(r.sortino) }),
            React.createElement(Tile, { label: 'Calmar Ratio', value: fN(r.calmar), color: rc(r.calmar) }),
            React.createElement(Tile, { label: 'Ann. Return', value: fP(r.annRet), color: rc(r.annRet) })
        ),
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 } },
            React.createElement(Tile, { label: 'Beta (vs SPY)', value: fN(r.beta), sub: r.beta != null ? (r.beta > 1 ? 'Higher systematic risk' : r.beta < 0.8 ? 'Defensive' : 'Market-like') : null }),
            React.createElement(Tile, { label: 'Alpha (ann.)', value: fP(r.alpha), color: rc(r.alpha) }),
            React.createElement(Tile, { label: 'R\u00B2', value: fN(r.rSq), sub: r.rSq != null ? (r.rSq > 0.7 ? 'High market linkage' : 'Idiosyncratic') : null }),
            React.createElement(Tile, { label: 'Tracking Error', value: fP(r.te) })
        ),
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 12 } },
            React.createElement(Tile, { label: 'Information Ratio', value: fN(r.ir), color: rc(r.ir) }),
            React.createElement(Tile, { label: 'VaR (1D, 99%)', value: fP(r.var99), color: '#ef4444' }),
            React.createElement(Tile, { label: 'Skewness', value: fN(r.skew), sub: r.skew != null ? (r.skew < -0.5 ? 'Left-tail risk' : r.skew > 0.5 ? 'Right-skewed' : 'Symmetric') : null }),
            React.createElement(Tile, { label: 'Excess Kurtosis', value: fN(r.kurt), sub: r.kurt != null ? (r.kurt > 1 ? 'Fat tails' : 'Normal-like') : null })
        )
    );
}

// ---- Sub-tab 2: Beta & Correlation ----

function BetaPanel(p) {
    var r = p.risk;
    if (!r) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Insufficient data.');

    var scatterRef = useRef(null);
    var corrRef = useRef(null);

    useChart(scatterRef, function() {
        var pts = [];
        for (var i = 0; i < Math.min(r.sr.length, r.br.length); i++) {
            pts.push({ x: r.br[i] * 100, y: r.sr[i] * 100 });
        }
        var xMin = -5, xMax = 5;
        var slope = r.beta != null ? r.beta : 1;
        var intercept = r.alpha != null ? r.alpha / 252 * 100 : 0;
        return {
            type: 'scatter',
            data: {
                datasets: [
                    { label: p.symbol + ' vs SPY', data: pts, backgroundColor: 'rgba(0,212,255,0.3)', pointRadius: 2.5, pointHoverRadius: 5 },
                    { label: '\u03B2 = ' + fN(r.beta), type: 'line', data: [{ x: xMin, y: xMin * slope + intercept }, { x: xMax, y: xMax * slope + intercept }], borderColor: '#f59e0b', borderWidth: 2, borderDash: [6, 3], pointRadius: 0, fill: false }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } } },
                scales: {
                    x: { title: { display: true, text: 'SPY Daily Return (%)', color: 'rgba(255,255,255,0.5)', font: { size: 11 } }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { title: { display: true, text: p.symbol + ' Daily Return (%)', color: 'rgba(255,255,255,0.5)', font: { size: 11 } }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [r]);

    useChart(corrRef, function() {
        if (!r.rc.length) return null;
        return {
            type: 'line',
            data: {
                labels: r.rc.map(function(d) { return d.date; }),
                datasets: [
                    { label: '90D Correlation', data: r.rc.map(function(d) { return d.value; }), borderColor: '#00d4ff', borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: 'rgba(0,212,255,0.08)', tension: 0.3 },
                    { label: '90D Beta', data: r.rb.map(function(d) { return d.value; }), borderColor: '#8b5cf6', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [r]);

    return React.createElement('div', null,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Beta Scatter \u2014 ' + p.symbol + ' vs SPY'),
            React.createElement('div', { style: { height: 280 } }, React.createElement('canvas', { ref: scatterRef }))
        ),
        React.createElement('div', { className: 'card', style: { marginTop: 16 } },
            React.createElement('div', { className: 'card-title' }, 'Rolling Correlation & Beta (90D)'),
            React.createElement('div', { style: { height: 220 } }, React.createElement('canvas', { ref: corrRef }))
        )
    );
}

// ---- Sub-tab 3: Volatility ----

function VolPanel(p) {
    var r = p.risk;
    if (!r) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Insufficient data.');

    var ref = useRef(null);
    useChart(ref, function() {
        if (!r.rv30.length) return null;
        var labels = r.rv90.map(function(d) { return d.date; });
        return {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: '30D Vol', data: r.rv30.slice(r.rv30.length - labels.length).map(function(d) { return d.value * 100; }), borderColor: '#00d4ff', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false },
                    { label: '90D Vol', data: r.rv90.map(function(d) { return d.value * 100; }), borderColor: '#8b5cf6', borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true, backgroundColor: 'rgba(139,92,246,0.08)' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
                    y: { title: { display: true, text: 'Annualised Vol (%)', color: 'rgba(255,255,255,0.5)', font: { size: 11 } }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, callback: function(v) { return v.toFixed(0) + '%'; } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [r]);

    return React.createElement('div', null,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Rolling Volatility'),
            React.createElement('div', { style: { height: 260 } }, React.createElement('canvas', { ref: ref }))
        ),
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 16 } },
            React.createElement(Tile, { label: 'Current 30D Vol', value: r.rv30.length ? fP(r.rv30[r.rv30.length - 1].value) : '\u2014' }),
            React.createElement(Tile, { label: 'Current 90D Vol', value: r.rv90.length ? fP(r.rv90[r.rv90.length - 1].value) : '\u2014' }),
            React.createElement(Tile, { label: 'Ann. Volatility', value: fP(r.annVol) })
        )
    );
}

// ---- Sub-tab 4: Distribution ----

function DistPanel(p) {
    var r = p.risk;
    if (!r) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Insufficient data.');

    var ref = useRef(null);
    useChart(ref, function() {
        if (!r.bins.length) return null;
        return {
            type: 'bar',
            data: {
                labels: r.bins.map(function(b) { return (b.mid * 100).toFixed(1) + '%'; }),
                datasets: [{
                    label: 'Frequency',
                    data: r.bins.map(function(b) { return b.count; }),
                    backgroundColor: r.bins.map(function(b) { return b.mid >= 0 ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'; }),
                    borderRadius: 2,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [r]);

    return React.createElement('div', null,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Daily Return Distribution'),
            React.createElement('div', { style: { height: 260 } }, React.createElement('canvas', { ref: ref }))
        ),
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 16 } },
            React.createElement(Tile, { label: 'Mean Daily', value: r.sr.length ? fP(mean(r.sr)) : '\u2014' }),
            React.createElement(Tile, { label: 'Std Dev (Daily)', value: r.sr.length ? fP(std(r.sr)) : '\u2014' }),
            React.createElement(Tile, { label: 'Skewness', value: fN(r.skew), sub: r.skew < -0.5 ? 'Left-tail risk' : r.skew > 0.5 ? 'Right-skewed' : 'Symmetric' }),
            React.createElement(Tile, { label: 'Excess Kurtosis', value: fN(r.kurt), sub: r.kurt > 1 ? 'Fat tails' : 'Normal-like' })
        )
    );
}

// ---- Main export ----

var TABS = [
    { id: 'overview', label: 'Risk Overview' },
    { id: 'beta', label: 'Beta & Correlation' },
    { id: 'vol', label: 'Volatility' },
    { id: 'dist', label: 'Distribution' },
    { id: 'mc', label: 'Monte Carlo' },
];

export function RiskAnalysis(p) {
    var _t = useState('overview');
    var tab = _t[0], setTab = _t[1];

    var _b = useState(null);
    var bench = _b[0], setBench = _b[1];
    var _l = useState(true);
    var loading = _l[0], setLoading = _l[1];
    var _e = useState(null);
    var err = _e[0], setErr = _e[1];

    useEffect(function() {
        setLoading(true); setErr(null);
        fetch('/api/equity?symbol=SPY&endpoint=daily')
            .then(function(r) { return r.json(); })
            .then(function(j) {
                if (j.error) { setErr(j.error); setLoading(false); return; }
                setBench(parseDaily(j.daily || j));
                setLoading(false);
            })
            .catch(function(e) { setErr(e.message); setLoading(false); });
    }, []);

    if (loading) return React.createElement('div', { className: 'card', style: { padding: 32, textAlign: 'center', color: 'var(--text-sec)' } }, 'Loading benchmark data (SPY)\u2026');

    if (!p.series || p.series.length < 30) {
        return React.createElement('div', { className: 'card', style: { padding: 32, color: 'var(--text-muted)' } }, 'Insufficient price history for risk analysis (need \u226530 days).');
    }

    var risk = bench && bench.length > 30 ? computeRisk(p.series, bench) : null;
    var price = p.series[p.series.length - 1].close;

    if (!risk) {
        return React.createElement('div', { className: 'card', style: { padding: 32, color: 'var(--text-muted)' } },
            'Could not compute risk metrics.',
            err ? React.createElement('div', { style: { fontSize: 11, color: 'rgba(239,68,68,0.7)', marginTop: 8, fontFamily: 'monospace' } }, err) : null
        );
    }

    var content = null;
    if (tab === 'overview') content = React.createElement(OverviewPanel, { risk: risk });
    if (tab === 'beta') content = React.createElement(BetaPanel, { risk: risk, symbol: p.symbol });
    if (tab === 'vol') content = React.createElement(VolPanel, { risk: risk });
    if (tab === 'dist') content = React.createElement(DistPanel, { risk: risk });
    if (tab === 'mc') content = React.createElement(McPanel, { risk: risk, price: price });

    return React.createElement('div', null,
        React.createElement(SubTab, { tabs: TABS, active: tab, onSelect: setTab }),
        content
    );
}
