// ============================================================
// ATLAS Terminal — Secondary Pages
// ------------------------------------------------------------
// RiskAnalysis (tabs: Risk Breakdown + Core Risk + Monte Carlo),
// CommandCentre.
// ============================================================

import { sb, loadView, MOCK_COMMAND } from './config.js';
import { fmt, fmtPct, fmtCurrency, cls, badgeCls, healthCls, useChart, returnStatus, sharpeStatus, ddStatus } from './utils.js';
import { Loading, EmptyState, HeroCard } from './components.js';

const { useState, useEffect, useRef, useMemo } = React;

// ============================================================
// Core Risk analytics (VaR distribution + rolling VaR)
// ============================================================

function computeVaRStats(navSeries) {
    var returns = [];
    for (var i = 1; i < navSeries.length; i++) {
        var r = navSeries[i].daily_return;
        if (r == null && navSeries[i - 1].nav > 0) r = (navSeries[i].nav - navSeries[i - 1].nav) / navSeries[i - 1].nav;
        if (r != null && isFinite(r) && Math.abs(r) < 0.5) returns.push({ date: navSeries[i].price_date, value: r });
    }
    if (returns.length < 30) return null;

    var vals = returns.map(function(r) { return r.value; }).slice().sort(function(a, b) { return a - b; });
    var varIdx = Math.floor(vals.length * 0.05);
    var var95 = vals[varIdx];
    var cvar = varIdx > 0 ? vals.slice(0, varIdx).reduce(function(s, v) { return s + v; }, 0) / varIdx : var95;

    var mean = vals.reduce(function(s, v) { return s + v; }, 0) / vals.length;
    var variance = vals.reduce(function(s, v) { return s + (v - mean) * (v - mean); }, 0) / vals.length;
    var annVol = Math.sqrt(variance) * Math.sqrt(252);

    // Rolling 30-day VaR
    var window30 = 30;
    var rolling = [];
    for (var i = window30; i < returns.length; i++) {
        var slice = returns.slice(i - window30, i).map(function(r) { return r.value; }).slice().sort(function(a, b) { return a - b; });
        rolling.push({ date: returns[i].date, var95: slice[Math.floor(slice.length * 0.05)] });
    }

    // Histogram bins for return distribution
    var minR = vals[0], maxR = vals[vals.length - 1];
    var binCt = 40, bw = (maxR - minR) / binCt;
    var bins = [];
    for (var b = 0; b < binCt; b++) {
        var lo = minR + b * bw, ct = 0;
        for (var j = 0; j < vals.length; j++) if (vals[j] >= lo && vals[j] < lo + bw) ct++;
        bins.push({ mid: (lo + bw / 2) * 100, count: ct, below: lo + bw <= var95 });
    }

    return { var95: var95, cvar: cvar, mean: mean, annVol: annVol, bins: bins, rolling: rolling, n: vals.length };
}

function VaRDistChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.bins || !p.bins.length) return null;
        return {
            type: 'bar',
            data: {
                labels: p.bins.map(function(b) { return b.mid.toFixed(1) + '%'; }),
                datasets: [{
                    data: p.bins.map(function(b) { return b.count; }),
                    backgroundColor: p.bins.map(function(b) { return b.below ? 'rgba(239,68,68,0.65)' : 'rgba(99,102,241,0.55)'; }),
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 }, maxRotation: 45, maxTicksLimit: 12 }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [p.bins]);
    return React.createElement('div', { style: { height: 220 } }, React.createElement('canvas', { ref: ref }));
}

function RollingVaRChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.rolling || !p.rolling.length) return null;
        return {
            type: 'line',
            data: {
                labels: p.rolling.map(function(r) { return r.date; }),
                datasets: [{
                    label: 'Rolling 30d VaR 95%',
                    data: p.rolling.map(function(r) { return r.var95 * 100; }),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239,68,68,0.08)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', labels: { color: 'rgba(255,255,255,0.45)', font: { size: 10 }, boxWidth: 20 } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.03)' } },
                    y: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 }, callback: function(v) { return v.toFixed(1) + '%'; } }, grid: { color: 'rgba(255,255,255,0.03)' } }
                }
            }
        };
    }, [p.rolling]);
    return React.createElement('div', { style: { height: 220 } }, React.createElement('canvas', { ref: ref }));
}

function CoreRiskTab(p) {
    var h = React.createElement;
    var stats = useMemo(function() { return computeVaRStats(p.navData || []); }, [p.navData]);

    if (!p.navData || p.navData.length < 30) {
        return h('div', { className: 'card', style: { padding: 32, color: 'var(--text-muted)', textAlign: 'center' } },
            'Core Risk analytics require 30+ days of portfolio NAV history.');
    }
    if (!stats) {
        return h('div', { className: 'card', style: { padding: 24, color: 'var(--text-muted)', textAlign: 'center' } },
            'Insufficient return data for analysis.');
    }

    var fmtPt = function(v) { return v != null ? (v >= 0 ? '+' : '') + (v * 100).toFixed(2) + '%' : '—'; };

    var metricTiles = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 } },
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'MEAN DAILY RETURN'),
            h('div', { className: 'value', style: { color: stats.mean > 0 ? '#10b981' : '#ef4444' } }, fmtPt(stats.mean))
        ),
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'ANN. VOLATILITY'),
            h('div', { className: 'value' }, (stats.annVol * 100).toFixed(1) + '%')
        ),
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'VaR 95% (1-Day)'),
            h('div', { className: 'value', style: { color: '#ef4444' } }, fmtPt(stats.var95))
        ),
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'CVaR (Exp. Shortfall)'),
            h('div', { className: 'value', style: { color: '#ef4444' } }, fmtPt(stats.cvar))
        )
    );

    var distCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Daily Return Distribution  ·  ' + stats.n + ' observations'),
        h('div', { style: { fontSize: 11, color: 'rgba(239,68,68,0.8)', marginBottom: 8 } },
            'Red = below VaR 95% (' + (stats.var95 * 100).toFixed(2) + '%)  ·  CVaR ' + (stats.cvar * 100).toFixed(2) + '%'
        ),
        h(VaRDistChart, { bins: stats.bins })
    );

    var rollingCard = h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Rolling 30-Day VaR Evolution'),
        h('div', { style: { fontSize: 11, color: 'var(--text-sec)', marginBottom: 8 } },
            'Rising line = tail risk expanding. Falling = risk compressing.'
        ),
        h(RollingVaRChart, { rolling: stats.rolling })
    );

    return h('div', null, metricTiles, distCard, rollingCard);
}

// ============================================================
// GBM Monte Carlo engine (pure JS, no dependencies)
// ============================================================

function runGBM(navSeries, initialNav, nScenarios, horizon) {
    // Build returns array from nav series
    var returns = [];
    for (var i = 1; i < navSeries.length; i++) {
        var r = navSeries[i].daily_return;
        if (r == null && navSeries[i - 1].nav > 0) {
            r = (navSeries[i].nav - navSeries[i - 1].nav) / navSeries[i - 1].nav;
        }
        if (r != null && isFinite(r) && Math.abs(r) < 0.5) returns.push(r);
    }
    if (returns.length < 30) return null;

    var n = returns.length;
    var mu = returns.reduce(function(s, v) { return s + v; }, 0) / n;
    var variance = returns.reduce(function(s, v) { return s + (v - mu) * (v - mu); }, 0) / n;
    var sigma = Math.sqrt(variance);
    var drift = mu - 0.5 * sigma * sigma;

    // Simulate paths — keep per-step buckets for fan chart
    var stepBuckets = [];
    for (var t = 0; t <= horizon; t++) stepBuckets.push([]);

    for (var s = 0; s < nScenarios; s++) {
        var val = initialNav;
        stepBuckets[0].push(val);
        for (var t = 1; t <= horizon; t++) {
            // Box-Muller normal sample
            var u1 = Math.random(), u2 = Math.random();
            var Z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
            val = val * Math.exp(drift + sigma * Z);
            stepBuckets[t].push(val);
        }
    }

    function pct(arr, p) { return arr[Math.floor(arr.length * p)]; }

    // Sort each step bucket, then extract percentile bands
    var bands = stepBuckets.map(function(arr) {
        arr.sort(function(a, b) { return a - b; });
        return { p10: pct(arr, 0.10), p25: pct(arr, 0.25), p50: pct(arr, 0.50), p75: pct(arr, 0.75), p90: pct(arr, 0.90) };
    });

    var finals = stepBuckets[horizon]; // already sorted
    var mean = finals.reduce(function(s, v) { return s + v; }, 0) / finals.length;
    var profitN = 0, loss10N = 0, gain20N = 0;
    finals.forEach(function(v) {
        var r = (v - initialNav) / initialNav;
        if (r > 0) profitN++;
        if (r < -0.10) loss10N++;
        if (r > 0.20) gain20N++;
    });

    var varIdx = Math.floor(finals.length * 0.05);
    var varVal = finals[varIdx];
    var varRet = (varVal - initialNav) / initialNav;
    var cvarSlice = finals.slice(0, varIdx);
    var cvarRet = cvarSlice.length > 0
        ? cvarSlice.reduce(function(s, v) { return s + (v - initialNav) / initialNav; }, 0) / cvarSlice.length
        : varRet;

    // Return distribution histogram (in % return)
    var retVals = finals.map(function(v) { return (v - initialNav) / initialNav; });
    var minR = retVals[0], maxR = retVals[retVals.length - 1];
    var binCt = 40, bw = (maxR - minR) / binCt;
    var bins = [];
    for (var b = 0; b < binCt; b++) {
        var lo = minR + b * bw, ct = 0;
        for (var j = 0; j < retVals.length; j++) if (retVals[j] >= lo && retVals[j] < lo + bw) ct++;
        bins.push({ mid: (lo + bw / 2) * 100, count: ct, below: lo + bw <= varRet });
    }

    return {
        bands: bands, bins: bins, mean: mean,
        p5: pct(finals, 0.05), p50: pct(finals, 0.50), p95: pct(finals, 0.95),
        probProfit: profitN / finals.length * 100,
        probLoss10: loss10N / finals.length * 100,
        probGain20: gain20N / finals.length * 100,
        varRet: varRet, cvarRet: cvarRet,
        mu: mu, sigma: sigma, n: finals.length,
    };
}

// ============================================================
// Monte Carlo charts
// ============================================================

function McFanChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        var bands = p.bands, horizon = p.horizon;
        if (!bands || !bands.length) return null;
        var step = Math.max(1, Math.ceil(horizon / 60));
        var labels = [], p10 = [], p25 = [], p50 = [], p75 = [], p90 = [];
        for (var t = 0; t <= horizon; t += step) {
            var b = bands[t];
            labels.push(t === 0 ? 'Now' : 'D' + t);
            p10.push(b.p10); p25.push(b.p25); p50.push(b.p50); p75.push(b.p75); p90.push(b.p90);
        }
        var yFmt = function(v) { return '$' + (v / 1000).toFixed(0) + 'k'; };
        return {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'P90', data: p90, borderColor: 'rgba(16,185,129,0.35)', borderWidth: 1, pointRadius: 0, fill: false, borderDash: [4, 4] },
                    { label: 'P75', data: p75, borderColor: 'rgba(16,185,129,0.65)', borderWidth: 1, pointRadius: 0, fill: '-1', backgroundColor: 'rgba(16,185,129,0.07)' },
                    { label: 'P50', data: p50, borderColor: '#00d4ff', borderWidth: 2, pointRadius: 0, fill: false },
                    { label: 'P25', data: p25, borderColor: 'rgba(239,68,68,0.65)', borderWidth: 1, pointRadius: 0, fill: '+1', backgroundColor: 'rgba(239,68,68,0.07)' },
                    { label: 'P10', data: p10, borderColor: 'rgba(239,68,68,0.35)', borderWidth: 1, pointRadius: 0, fill: false, borderDash: [4, 4] },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', labels: { color: 'rgba(255,255,255,0.45)', font: { size: 10 }, boxWidth: 20, padding: 10 } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 10 }, callback: yFmt }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [p.bands, p.horizon]);
    return React.createElement('div', { style: { height: 280 } }, React.createElement('canvas', { ref: ref }));
}

function McHistChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        var bins = p.bins;
        if (!bins || !bins.length) return null;
        return {
            type: 'bar',
            data: {
                labels: bins.map(function(b) { return b.mid.toFixed(0) + '%'; }),
                datasets: [{
                    label: 'Frequency',
                    data: bins.map(function(b) { return b.count; }),
                    backgroundColor: bins.map(function(b) { return b.below ? 'rgba(239,68,68,0.65)' : 'rgba(99,102,241,0.65)'; }),
                    borderWidth: 0,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 }, maxRotation: 45, maxTicksLimit: 10 }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [p.bins]);
    return React.createElement('div', { style: { height: 200 } }, React.createElement('canvas', { ref: ref }));
}

// ============================================================
// Monte Carlo tab
// ============================================================

function MonteCarloTab(p) {
    var h = React.createElement;
    var navData = p.navData, command = p.command;

    var _r = useState(1000), mcRuns = _r[0], setMcRuns = _r[1];
    var _hz = useState(63), horizon = _hz[0], setHorizon = _hz[1];

    var initialNav = (command && command.portfolio_nav > 0 ? command.portfolio_nav : null) || 100000;

    var mc = useMemo(function() {
        return runGBM(navData || [], initialNav, mcRuns, horizon);
    }, [navData, initialNav, mcRuns, horizon]);

    var fmtNav = function(v) {
        return v != null ? '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
    };
    var fmtPt = function(v) {
        return v != null ? (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%' : '—';
    };

    var sliderRow = function(label, val, min, max, step, set, display) {
        return h('div', null,
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-sec)', marginBottom: 4 } },
                h('span', null, label),
                h('span', { style: { color: '#00d4ff', fontFamily: "'JetBrains Mono', monospace" } }, display)
            ),
            h('input', { type: 'range', min: min, max: max, step: step, value: val,
                onChange: function(e) { set(+e.target.value); },
                style: { width: '100%', accentColor: '#00d4ff' }
            })
        );
    };

    var controls = h('div', { className: 'card', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 } },
        sliderRow('SIMULATIONS', mcRuns, 200, 2000, 200, setMcRuns, mcRuns.toLocaleString()),
        sliderRow('HORIZON (TRADING DAYS)', horizon, 21, 252, 21, setHorizon, horizon + 'd  (' + Math.round(horizon / 21) + ' mo)')
    );

    if (!navData || navData.length < 30) {
        return h('div', null, controls,
            h('div', { className: 'card', style: { padding: 32, color: 'var(--text-muted)', textAlign: 'center' } },
                'Monte Carlo requires 30+ days of portfolio NAV history.'));
    }

    if (!mc) {
        return h('div', null, controls,
            h('div', { className: 'card', style: { padding: 24, color: 'var(--text-muted)', textAlign: 'center' } },
                'Insufficient return history for simulation.'));
    }

    var tile = function(label, value, color, sub) {
        return h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, label),
            h('div', { className: 'value', style: color ? { color: color } : null }, value),
            sub ? h('div', { className: 'sub', style: color ? { color: color } : null }, sub) : null
        );
    };

    var summaryTiles = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 } },
        tile('STARTING NAV', fmtNav(initialNav), null, null),
        tile('EXPECTED VALUE', fmtNav(mc.mean), mc.mean > initialNav ? '#10b981' : '#ef4444', fmtPt((mc.mean - initialNav) / initialNav)),
        tile('WORST (P5)', fmtNav(mc.p5), '#ef4444', fmtPt((mc.p5 - initialNav) / initialNav)),
        tile('BEST (P95)', fmtNav(mc.p95), '#10b981', fmtPt((mc.p95 - initialNav) / initialNav))
    );

    var probTiles = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 } },
        tile('PROB. OF PROFIT', mc.probProfit.toFixed(1) + '%', '#10b981', null),
        tile('PROB. LOSS > 10%', mc.probLoss10.toFixed(1) + '%', '#ef4444', null),
        tile('PROB. GAIN > 20%', mc.probGain20.toFixed(1) + '%', '#10b981', null)
    );

    var riskCard = h('div', { className: 'card', style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 } },
        h('div', null,
            h('div', { style: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-sec)', marginBottom: 6 } }, 'VaR 95% at Horizon'),
            h('div', { style: { fontSize: 22, fontWeight: 700, color: '#ef4444' } }, fmtPt(mc.varRet))
        ),
        h('div', null,
            h('div', { style: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-sec)', marginBottom: 6 } }, 'CVaR (Expected Shortfall)'),
            h('div', { style: { fontSize: 22, fontWeight: 700, color: '#ef4444' } }, fmtPt(mc.cvarRet))
        ),
        h('div', null,
            h('div', { style: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-sec)', marginBottom: 6 } }, 'Median Outcome'),
            h('div', { style: { fontSize: 22, fontWeight: 700, color: mc.p50 > initialNav ? '#10b981' : '#ef4444' } }, fmtNav(mc.p50)),
            h('div', { style: { fontSize: 11, color: 'var(--text-sec)' } }, fmtPt((mc.p50 - initialNav) / initialNav))
        )
    );

    var fanCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Portfolio NAV Forecast  ·  GBM Fan Chart'),
        h('div', { style: { fontSize: 11, color: 'var(--text-sec)', marginBottom: 8 } },
            'μ ' + (mc.mu * 252 * 100).toFixed(1) + '% ann.  ·  σ ' + (mc.sigma * Math.sqrt(252) * 100).toFixed(1) + '% ann.  ·  ' + mc.n.toLocaleString() + ' paths'
        ),
        h(McFanChart, { bands: mc.bands, horizon: horizon })
    );

    var histCard = h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Final Return Distribution'),
        h('div', { style: { fontSize: 11, color: 'rgba(239,68,68,0.8)', marginBottom: 8 } },
            'Red = below VaR threshold (' + (mc.varRet * 100).toFixed(1) + '%)'
        ),
        h(McHistChart, { bins: mc.bins, varRet: mc.varRet })
    );

    return h('div', null, controls, summaryTiles, probTiles, riskCard, fanCard, histCard);
}

// ============================================================
// RISK ANALYSIS
// ============================================================

export function RiskAnalysis() {
    const [risk, setRisk] = useState(null);
    const [command, setCommand] = useState(null);
    const [navData, setNavData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('breakdown');

    useEffect(() => {
        Promise.all([
            loadView('vw_risk_analysis', []),
            loadView('vw_command_centre', [MOCK_COMMAND]),
            loadView('vw_portfolio_nav_daily', []),
        ]).then(([r, c, n]) => {
            setRisk(r);
            setCommand(c[0] || MOCK_COMMAND);
            setNavData(n);
            setLoading(false);
        });
    }, []);

    if (loading) return React.createElement(Loading, null);
    if (!risk || !risk.length) return React.createElement(EmptyState, null);

    const c = command || MOCK_COMMAND;
    const highRisk = risk.filter(r => r.risk_tier === 'High Risk').length;
    const modRisk = risk.filter(r => r.risk_tier === 'Moderate Risk').length;
    const lowRisk = risk.filter(r => r.risk_tier === 'Low Risk').length;

    var ddVal = c.drawdown_pct != null ? c.drawdown_pct / 100 : null;

    const TABS = [
        { id: 'breakdown', label: 'Risk Breakdown' },
        { id: 'corerisk', label: 'Core Risk' },
        { id: 'montecarlo', label: 'Monte Carlo' },
    ];

    const tabBar = React.createElement('div', { style: { display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' } },
        TABS.map(function(t) {
            var a = t.id === tab;
            return React.createElement('button', {
                key: t.id,
                onClick: function() { setTab(t.id); },
                style: {
                    background: a ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                    color: a ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                    border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                    borderRadius: 6, padding: '6px 16px', fontSize: 11,
                    fontWeight: a ? 600 : 400, cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: 0.8,
                }
            }, t.label);
        })
    );

    if (tab === 'corerisk') {
        return React.createElement('div', null,
            React.createElement('div', { className: 'page-title' }, 'Risk Analysis'),
            tabBar,
            React.createElement(CoreRiskTab, { navData: navData, command: c })
        );
    }

    if (tab === 'montecarlo') {
        return React.createElement('div', null,
            React.createElement('div', { className: 'page-title' }, 'Risk Analysis'),
            tabBar,
            React.createElement(MonteCarloTab, { navData: navData, command: c })
        );
    }

    // Default: Risk Breakdown tab
    return React.createElement('div', null,
        React.createElement('div', { className: 'page-title' }, 'Risk Analysis'),
        tabBar,
        React.createElement('div', { className: 'metrics-row' },
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Sharpe Ratio'), React.createElement('div', { className: 'value' }, fmt(c.sharpe_ratio))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Sortino Ratio'), React.createElement('div', { className: 'value' }, fmt(c.sortino_ratio))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Max Drawdown'), React.createElement('div', { className: 'value negative' }, fmt(c.drawdown_pct) + '%')),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Portfolio VaR (95%)'), React.createElement('div', { className: 'value' }, fmtCurrency(c.dollar_var_95)))
        ),
        // Risk tier counts
        React.createElement('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 } },
            React.createElement(HeroCard, { icon: '⬡', label: 'HIGH RISK POSITIONS',  value: String(highRisk), color: 'var(--red)',   accent: 'red' }),
            React.createElement(HeroCard, { icon: '⬡', label: 'MODERATE RISK',        value: String(modRisk),  color: 'var(--amber)', accent: 'amber' }),
            React.createElement(HeroCard, { icon: '⬡', label: 'LOW RISK POSITIONS',   value: String(lowRisk),  color: 'var(--green)', accent: 'green' })
        ),
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Position Risk Breakdown'),
            React.createElement('div', { style: { overflowX: 'auto' } },
                React.createElement('table', { className: 'data-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            ['Symbol', 'Market Value', 'Weight %', 'Annual Vol', 'Vol Contribution', 'Daily VaR $', 'Risk Tier'].map(h =>
                                React.createElement('th', { key: h }, h)))),
                    React.createElement('tbody', null,
                        risk.map(r =>
                            React.createElement('tr', { key: r.symbol },
                                React.createElement('td', { style: { fontWeight: 600, color: '#00d4ff' } }, r.symbol),
                                React.createElement('td', null, fmtCurrency(r.market_value)),
                                React.createElement('td', null, fmtPct(r.weight)),
                                React.createElement('td', null, fmtPct(r.annual_vol)),
                                React.createElement('td', null, fmtPct(r.marginal_vol_contribution)),
                                React.createElement('td', null, fmtCurrency(r.dollar_var_95_daily)),
                                React.createElement('td', null, React.createElement('span', { className: 'badge ' + badgeCls(r.risk_tier) }, r.risk_tier))
                            ))
                    )
                )
            )
        )
    );
}

// ============================================================
// COMMAND CENTRE
// ============================================================
export function CommandCentre() {
    const [command, setCommand] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadView('vw_command_centre', [MOCK_COMMAND]).then(d => { setCommand(d[0] || MOCK_COMMAND); setLoading(false); });
    }, []);

    if (loading) return React.createElement(Loading, null);
    const c = command || MOCK_COMMAND;

    return React.createElement('div', null,
        React.createElement('div', { className: 'page-title' }, 'Command Centre'),
        // Health Score Hero
        React.createElement('div', { style: { textAlign: 'center', marginBottom: 32 } },
            React.createElement('div', { className: 'health-score ' + healthCls(c.atlas_health_score), style: { width: 120, height: 120, fontSize: 42, margin: '0 auto 12px' } },
                Math.round(c.atlas_health_score || 0)),
            React.createElement('div', { style: { fontSize: 18, fontWeight: 600 } }, 'ATLAS Health Score'),
            React.createElement('div', null, React.createElement('span', { className: 'badge ' + badgeCls(c.portfolio_health_status), style: { marginTop: 8, fontSize: 13, padding: '5px 16px' } }, c.portfolio_health_status))
        ),
        // Metrics Grid — Hero Cards
        React.createElement('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 } },
            React.createElement(HeroCard, {
                icon: '◊', label: 'PORTFOLIO NAV', value: fmtCurrency(c.portfolio_nav), accent: 'cyan'
            }),
            React.createElement(HeroCard, {
                icon: '◇', label: 'TOTAL INVESTED', value: fmtCurrency(c.total_invested), accent: 'indigo'
            }),
            React.createElement(HeroCard, {
                icon: (c.total_return_pct || 0) >= 0 ? '▲' : '▽',
                label: 'TOTAL RETURN',
                value: fmtPct(c.total_return_pct),
                color: (c.total_return_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)',
                accent: (c.total_return_pct || 0) >= 0 ? 'green' : 'red',
                badge: returnStatus(c.total_return_pct)
            }),
            React.createElement(HeroCard, {
                icon: '✦', label: 'SHARPE RATIO', value: fmt(c.sharpe_ratio),
                color: c.sharpe_ratio > 1 ? 'var(--green)' : c.sharpe_ratio > 0 ? 'var(--amber)' : 'var(--red)',
                accent: 'cyan', badge: sharpeStatus(c.sharpe_ratio)
            }),
            React.createElement(HeroCard, {
                icon: '◈', label: 'SORTINO RATIO', value: fmt(c.sortino_ratio),
                color: c.sortino_ratio > 1 ? 'var(--green)' : c.sortino_ratio > 0 ? 'var(--amber)' : 'var(--red)',
                accent: 'violet', badge: sharpeStatus(c.sortino_ratio)
            }),
            React.createElement(HeroCard, {
                icon: '▽', label: 'MAX DRAWDOWN',
                value: c.drawdown_pct != null ? fmt(c.drawdown_pct, 2) + '%' : '—',
                color: 'var(--red)', accent: 'red',
                badge: ddStatus(c.drawdown_pct != null ? c.drawdown_pct / 100 : null)
            }),
            React.createElement(HeroCard, {
                icon: '⚠', label: 'DAILY VAR (95%)', value: fmtCurrency(c.dollar_var_95), accent: 'amber'
            }),
            React.createElement(HeroCard, {
                icon: '◉', label: 'POSITIONS', value: String(c.position_count || '—'), accent: 'indigo'
            }),
            React.createElement(HeroCard, {
                icon: '≡', label: 'DAYS OF HISTORY', value: String(c.days_of_history || '—'), accent: 'indigo'
            })
        ),
        // System Status
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'System Status'),
            React.createElement('table', { className: 'data-table' },
                React.createElement('tbody', null,
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'DM Sans', color: 'rgba(255,255,255,0.5)' } }, 'Supabase Connection'),
                        React.createElement('td', null, sb ? React.createElement('span', { className: 'badge green' }, 'Connected') : React.createElement('span', { className: 'badge amber' }, 'Demo Mode'))),
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'DM Sans', color: 'rgba(255,255,255,0.5)' } }, 'Last Computed'),
                        React.createElement('td', null, c.computed_at ? new Date(c.computed_at).toLocaleString() : '—')),
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'DM Sans', color: 'rgba(255,255,255,0.5)' } }, 'Data Source'),
                        React.createElement('td', null, 'Supabase PostgreSQL + Alpaca Markets API')),
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'DM Sans', color: 'rgba(255,255,255,0.5)' } }, 'NAV Methodology'),
                        React.createElement('td', null, 'FIFO Transaction-Based Reconstruction'))
                )
            )
        )
    );
}
