import Plotly from 'plotly.js-dist-min';
import Chart from 'chart.js/auto';
import React from 'react';
// ============================================================
// ATLAS Terminal — Secondary Pages
// ------------------------------------------------------------
// RiskAnalysis (tabs: Risk Breakdown + Core Risk + Monte Carlo),
// CommandCentre.
// ============================================================

import { sb, loadViewState, normalizeCommand } from './config.js';
import { loadFeeds } from '../lib/feedStates.js';
import { fmt, fmtPct, fmtCurrency, cls, badgeCls, healthCls, useChart, returnStatus, sharpeStatus, ddStatus } from './utils.js';
import { Loading, EmptyState, HeroCard, FeedNotice } from './components.js';
import { buildAccountSyncView, statusTone, ACCOUNT_SYNC_LOADED, ACCOUNT_SYNC_EMPTY } from '../lib/accountSyncView.js';

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
// Risk Breakdown charts
// ============================================================

function RiskTierDonut(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        var total = p.high + p.mod + p.low;
        if (!total) return null;
        return {
            type: 'doughnut',
            data: {
                labels: ['High Risk', 'Moderate Risk', 'Low Risk'],
                datasets: [{ data: [p.high, p.mod, p.low], backgroundColor: ['rgba(239,68,68,0.8)', 'rgba(245,158,11,0.75)', 'rgba(16,185,129,0.75)'], borderWidth: 0, hoverOffset: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                cutout: '68%',
                plugins: { legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 }, boxWidth: 14, padding: 12 } } }
            }
        };
    }, [p.high, p.mod, p.low]);
    return React.createElement('div', { style: { height: 180 } }, React.createElement('canvas', { ref: ref }));
}

function VaRContribBar(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.rows || !p.rows.length) return null;
        var top = p.rows
            .filter(function(r) { return r.dollar_var_95_daily != null; })
            .sort(function(a, b) { return Math.abs(b.dollar_var_95_daily) - Math.abs(a.dollar_var_95_daily); })
            .slice(0, 10);
        return {
            type: 'bar',
            data: {
                labels: top.map(function(r) { return r.symbol; }),
                datasets: [{
                    data: top.map(function(r) { return Math.abs(r.dollar_var_95_daily); }),
                    backgroundColor: top.map(function(r) {
                        return r.risk_tier === 'High Risk' ? 'rgba(239,68,68,0.75)' : r.risk_tier === 'Moderate Risk' ? 'rgba(245,158,11,0.7)' : 'rgba(16,185,129,0.65)';
                    }),
                    borderWidth: 0, borderRadius: 3,
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 }, callback: function(v) { return '$' + v.toFixed(0); } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }, grid: { display: false } }
                }
            }
        };
    }, [p.rows]);
    return React.createElement('div', { style: { height: 180 } }, React.createElement('canvas', { ref: ref }));
}

// ---- Plotly bubble scatter: Ann. Vol vs Daily VaR, sized by MV ----------

function RiskScatter({ rows }) {
    const ref = useRef(null);
    useEffect(function() {
        if (!rows || !rows.length || !ref.current) return;
        const tierColors = { 'High Risk': '#ef4444', 'Moderate Risk': '#f59e0b', 'Low Risk': '#10b981' };
        const groups = {};
        rows.forEach(function(r) {
            const tier = r.risk_tier || 'Low Risk';
            if (!groups[tier]) groups[tier] = { x: [], y: [], size: [], text: [] };
            const vol = Number(r.annual_vol) * 100;
            const var$ = Math.abs(Number(r.dollar_var_95_daily) || 0);
            const mv   = Math.abs(Number(r.market_value) || 0);
            if (!isNaN(vol) && vol > 0 && var$ > 0) {
                groups[tier].x.push(vol);
                groups[tier].y.push(var$);
                groups[tier].size.push(mv);
                groups[tier].text.push(r.symbol);
            }
        });

        const allSizes = Object.values(groups).reduce(function(acc, g) { return acc.concat(g.size); }, []);
        const maxSize  = allSizes.length ? Math.max.apply(null, allSizes) : 1;

        const traces = Object.keys(groups).map(function(tier) {
            const g = groups[tier];
            return {
                type: 'scatter', mode: 'markers+text', name: tier,
                x: g.x, y: g.y, text: g.text,
                textposition: 'top center',
                textfont: { size: 8, color: 'rgba(255,255,255,0.62)', family: 'JetBrains Mono' },
                marker: {
                    size: g.size.map(function(s) { return 10 + (s / maxSize) * 26; }),
                    color: tierColors[tier] || '#6366f1',
                    opacity: 0.72,
                    line: { width: 1, color: 'rgba(255,255,255,0.12)' },
                },
                hovertemplate: '<b>%{text}</b><br>Ann. Vol: %{x:.1f}%<br>Daily VaR: $%{y:,.0f}<extra></extra>',
            };
        });

        Plotly.react(ref.current, traces, {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: 'rgba(255,255,255,0.45)', family: 'JetBrains Mono', size: 10 },
            showlegend: true,
            legend: { bgcolor: 'rgba(0,0,0,0)', font: { size: 10, color: 'rgba(255,255,255,0.55)' }, x: 1.01, y: 1 },
            margin: { l: 58, r: 100, t: 14, b: 50 },
            xaxis: {
                title: { text: 'Annual Volatility (%)', font: { size: 11 } },
                gridcolor: 'rgba(255,255,255,0.05)', zeroline: false,
                tickfont: { size: 10 }, ticksuffix: '%',
            },
            yaxis: {
                title: { text: 'Daily VaR 95% ($)', font: { size: 11 } },
                gridcolor: 'rgba(255,255,255,0.05)', zeroline: false,
                tickfont: { size: 10 }, tickprefix: '$',
            },
            shapes: [
                { type: 'line', x0: 25, x1: 25, y0: 0, y1: 1, yref: 'paper', line: { color: 'rgba(245,158,11,0.22)', width: 1, dash: 'dot' } },
                { type: 'line', x0: 40, x1: 40, y0: 0, y1: 1, yref: 'paper', line: { color: 'rgba(239,68,68,0.22)',   width: 1, dash: 'dot' } },
            ],
            annotations: [
                { x: 25, y: 1.08, yref: 'paper', text: '25% threshold', font: { size: 8, color: 'rgba(245,158,11,0.45)' }, showarrow: false },
                { x: 40, y: 1.08, yref: 'paper', text: '40% high-vol', font: { size: 8, color: 'rgba(239,68,68,0.45)' },   showarrow: false },
            ],
        }, { responsive: true, displayModeBar: false });
    }, [rows]);
    return React.createElement('div', { ref: ref, style: { height: 290 } });
}

// ---- Per-position risk card ------------------------------------------

function RiskCard({ row: r, maxVar }) {
    const h = React.createElement;
    const tierColor = r.risk_tier === 'High Risk' ? '#ef4444' : r.risk_tier === 'Moderate Risk' ? '#f59e0b' : '#10b981';
    const volColor  = r.annual_vol > 0.4 ? '#ef4444' : r.annual_vol > 0.25 ? '#f59e0b' : '#10b981';
    const varPct    = maxVar > 0 ? Math.abs(r.dollar_var_95_daily || 0) / maxVar : 0;
    const volPct    = Math.min(1, (r.annual_vol || 0) / 0.6);

    return h('div', {
        style: {
            background: 'linear-gradient(135deg,rgba(15,18,40,0.9),rgba(21,25,50,0.95))',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 12, padding: '14px 16px',
            position: 'relative', overflow: 'hidden',
        }
    },
        h('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: tierColor, borderRadius: '12px 12px 0 0', opacity: 0.85 } }),
        // Symbol + tier badge
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 4, marginBottom: 10 } },
            h('span', {
                title: 'Open in Equity Research',
                onClick: (function(sym) { return function() {
                    window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol: sym } }));
                }; })(r.symbol),
                style: { fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 15, color: '#00d4ff',
                         cursor: 'pointer', borderBottom: '1px dotted rgba(0,212,255,0.4)', paddingBottom: 1 }
            }, r.symbol),
            h('span', { style: { fontSize: 8, fontWeight: 700, letterSpacing: 0.8, padding: '2px 6px', borderRadius: 4, background: tierColor + '22', color: tierColor, border: '1px solid ' + tierColor + '44', textTransform: 'uppercase', fontFamily: 'Figtree' } },
                r.risk_tier ? r.risk_tier.replace(' Risk', '') : 'Low')
        ),
        // MV + Weight
        h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 10 } },
            h('div', null,
                h('div', { style: { fontSize: 8, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2, fontFamily: 'Figtree' } }, 'Market Value'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)' } }, fmtCurrency(r.market_value))
            ),
            h('div', { style: { textAlign: 'right' } },
                h('div', { style: { fontSize: 8, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2, fontFamily: 'Figtree' } }, 'Weight'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)' } }, fmtPct(r.weight))
            )
        ),
        // Daily VaR bar
        h('div', { style: { marginBottom: 8 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3 } },
                h('span', { style: { fontSize: 8, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Figtree' } }, 'Daily VaR 95%'),
                h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: '#ef4444', fontWeight: 600 } }, fmtCurrency(r.dollar_var_95_daily))
            ),
            h('div', { style: { height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' } },
                h('div', { style: { height: '100%', width: (varPct * 100).toFixed(1) + '%', background: 'linear-gradient(90deg,' + tierColor + '88,' + tierColor + ')', borderRadius: 3, transition: 'width 0.4s ease' } })
            )
        ),
        // Ann Vol bar
        h('div', null,
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3 } },
                h('span', { style: { fontSize: 8, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Figtree' } }, 'Ann. Volatility'),
                h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: volColor, fontWeight: 600 } }, r.annual_vol != null ? (r.annual_vol * 100).toFixed(1) + '%' : '—')
            ),
            h('div', { style: { height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' } },
                h('div', { style: { height: '100%', width: (volPct * 100).toFixed(1) + '%', background: 'linear-gradient(90deg,' + volColor + '66,' + volColor + ')', borderRadius: 3, transition: 'width 0.4s ease' } })
            )
        ),
        // Action row — hedge button for elevated risk positions
        (r.risk_tier === 'High Risk' || r.risk_tier === 'Moderate Risk') && h('div', {
            style: { display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }
        },
            h('button', {
                title: 'Analyse options hedge for ' + r.symbol,
                onClick: (function(sym) { return function() { window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'options', symbol: sym } })); }; })(r.symbol),
                style: {
                    flex: 1, background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                    border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5,
                    padding: '4px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    letterSpacing: 0.5, fontFamily: 'Figtree', textTransform: 'uppercase',
                }
            }, 'Ω Hedge →')
        )
    );
}

// ============================================================
// RISK ANALYSIS  — delegated to risk-v2.js
// ============================================================

import { RiskAnalysisV2 as _RiskAnalysisV2 } from './risk-v2.js';
export function RiskAnalysis() { return React.createElement(_RiskAnalysisV2, null); }

// ============================================================
// COMMAND CENTRE
// ============================================================
// ── AccountBalances (live from Alpaca) ────────────────────────────────────────
function AccountBalances() {
    const [acct, setAcct] = useState(null);
    const [err, setErr]   = useState(null);
    const [ts, setTs]     = useState(null);

    useEffect(() => {
        fetch('/api/trading?action=account')
            .then(r => r.json())
            .then(j => { setAcct(j); setTs(new Date()); })
            .catch(e => setErr(e.message));
    }, []);

    const f = (v) => v == null || !isFinite(v) ? '—' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const col = { neg: '#ef4444', pos: '#10b981', head: 'rgba(255,255,255,0.38)', val: 'rgba(255,255,255,0.88)' };

    const section = (title) => React.createElement('tr', { key: 'h' + title },
        React.createElement('td', { colSpan: 2, style: { paddingTop: 14, paddingBottom: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--nx-blue)', fontFamily: 'var(--nx-fb)', borderBottom: '1px solid rgba(0,212,255,0.15)' } }, title)
    );
    const row = (label, val, highlight) => React.createElement('tr', { key: label },
        React.createElement('td', { style: { padding: '5px 0', fontSize: 12, color: col.head, fontFamily: 'var(--nx-fb)', paddingLeft: 8 } }, label),
        React.createElement('td', { style: { padding: '5px 0', fontSize: 12, fontFamily: 'var(--nx-fm)', textAlign: 'right', color: highlight === 'neg' ? col.neg : highlight === 'pos' ? col.pos : col.val } }, val)
    );

    const card = { background: 'var(--nx-bg2)', border: '1px solid var(--nx-border)', borderRadius: 10, padding: '18px 20px', marginBottom: 20 };

    if (err) return React.createElement('div', { style: card },
        React.createElement('div', { style: { fontSize: 11, color: '#ef4444' } }, '⚠ Could not load account: ' + err));

    if (!acct) return React.createElement('div', { style: card },
        React.createElement('div', { style: { fontSize: 11, color: 'var(--nx-text3)' } }, 'Loading account…'));

    const dayPnlColor = acct.dayPnl >= 0 ? 'pos' : 'neg';
    const cashColor   = acct.cash >= 0 ? 'pos' : 'neg';

    return React.createElement('div', { style: card },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 } },
            React.createElement('div', { style: { fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--nx-fb)', color: 'var(--nx-text)' } }, 'Account Balances'),
            React.createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
                React.createElement('span', { style: { fontSize: 9, padding: '3px 8px', borderRadius: 4, background: acct.mode === 'PAPER' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: acct.mode === 'PAPER' ? '#f59e0b' : '#10b981', fontFamily: 'var(--nx-fb)', fontWeight: 700, letterSpacing: '0.08em' } }, acct.mode),
                ts && React.createElement('span', { style: { fontSize: 9, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)' } }, ts.toLocaleTimeString())
            )
        ),
        React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    React.createElement('th', { style: { textAlign: 'left',  fontSize: 9, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)', fontWeight: 600, letterSpacing: '0.08em', paddingBottom: 6, textTransform: 'uppercase' } }, 'Balance'),
                    React.createElement('th', { style: { textAlign: 'right', fontSize: 9, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)', fontWeight: 600, letterSpacing: '0.08em', paddingBottom: 6, textTransform: 'uppercase' } }, 'Current')
                )
            ),
            React.createElement('tbody', null,
                section('Buying Power'),
                row('RegT Buying Power',           f(acct.regt_buying_power)),
                row('Day Trading Buying Power',    f(acct.daytrading_buying_power)),
                row('Effective Buying Power',      f(acct.buyingPower)),
                row('Non-Marginable Buying Power', f(acct.non_marginable_buying_power)),
                section('Margin'),
                row('Initial Margin',              f(acct.initial_margin)),
                row('Maintenance Margin',          f(acct.maintenance_margin)),
                section('Cash'),
                row('Cash',                        f(acct.cash),              cashColor),
                row('Cash Withdrawable',           f(acct.cash_withdrawable)),
                row('Pending Transfer Out',        f(acct.pending_transfer_out)),
                section('Positions'),
                row('Equity',                      f(acct.equity)),
                row('Long Market Value',           f(acct.long_market_value)),
                row('Short Market Value',          f(acct.short_market_value)),
                row('Position Market Value',       f(acct.position_market_value)),
                section('P&L'),
                row('Day P&L',                     f(acct.dayPnl),            dayPnlColor),
                section('Miscellaneous'),
                row('Accrued Fees',                f(acct.accrued_fees)),
                row('Day Trade Count',             String(acct.daytrade_count || 0))
            )
        )
    );
}

var CC_TONE_COLOR = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', grey: 'var(--text-3)' };

export function CommandCentre() {
    const [command, setCommand] = useState(null);
    const [navData, setNavData] = useState(null);
    const [homeData, setHomeData] = useState(null);
    const [freshness, setFreshness] = useState(null);
    const [validationLog, setValidationLog] = useState([]);
    const [accountSync, setAccountSync] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [feeds, setFeeds] = useState({ states: {}, problems: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        function load() {
            // No mock fallback: a command centre that did not answer used to
            // render a sample $119,500 NAV and a 1.35 Sharpe as the book.
            const FEEDS = ['vw_command_centre', 'vw_portfolio_nav_daily', 'vw_portfolio_home'];
            const freshnessPromise = sb
                ? sb.rpc('data_freshness').then(function(r) { return r.data || []; })
                : Promise.resolve([]);
            const validationPromise = sb
                ? sb.from('atlas_validation_log').select('*').order('checked_at', { ascending: false }).limit(20).then(function(r) { return r.data || []; })
                : Promise.resolve([]);
            // Per-account sync health (MP-4c). The raw result is kept so a
            // transport failure is told apart from an empty answer.
            const accountSyncPromise = sb
                ? sb.rpc('atlas_account_sync_health').then(
                    function(r) { return buildAccountSyncView(r); },
                    function(e) { return buildAccountSyncView({ data: null, error: e }); })
                : Promise.resolve(null);
            const alertsPromise = sb
                ? sb.from('atlas_memory').select('*').eq('category', 'bug').order('created_at', { ascending: false }).limit(10).then(function(r) { return r.data || []; })
                : Promise.resolve([]);
            Promise.all([
                loadFeeds(FEEDS, loadViewState),
                freshnessPromise,
                validationPromise,
                alertsPromise,
                accountSyncPromise,
            ]).then(function(res) {
                const f = res[0];
                setFeeds(f);
                setCommand(f.rows.vw_command_centre[0] || null);
                setNavData(f.rows.vw_portfolio_nav_daily);
                setHomeData(f.rows.vw_portfolio_home);
                setFreshness(res[1]);
                setValidationLog(res[2] || []);
                setAlerts(res[3] || []);
                setAccountSync(res[4]);
                setLoading(false);
            });
        }
        load();
        window.addEventListener('atlas:refresh', load);
        return () => window.removeEventListener('atlas:refresh', load);
    }, []);

    if (loading) return React.createElement(Loading, null);
    const c = normalizeCommand(command) || {};

    // Compute equity + cash balance from loaded data
    var _cNavSorted = navData ? navData.slice().sort(function(a,b){ return new Date(a.price_date) - new Date(b.price_date); }) : [];
    // Canonical book aggregates come from the broker account snapshot
    // (vw_command_centre), not the summed positions view, so exposure / cash /
    // leverage agree with the Portfolio page and the broker.
    var cmdEquity = c.portfolio_nav != null ? Number(c.portfolio_nav)
        : (_cNavSorted.length ? _cNavSorted[_cNavSorted.length - 1].nav : null);
    var cmdPortMV = c.long_market_value != null ? Number(c.long_market_value)
        : (homeData && homeData.length ? homeData.reduce(function(s, r) { return s + (Number(r.market_value) || 0); }, 0) : null);
    var cmdCash = c.cash_balance != null ? Number(c.cash_balance)
        : (cmdEquity != null && cmdPortMV != null ? cmdEquity - cmdPortMV : null);
    var cmdLeverage = c.gross_leverage != null ? Number(c.gross_leverage)
        : (cmdEquity && cmdEquity > 0 && cmdPortMV != null ? cmdPortMV / cmdEquity : null);
    var cmdCashLabel = cmdCash == null ? '—' : (cmdCash >= 0 ? '+' : '') + fmtCurrency(cmdCash);
    var cmdCashBadge = cmdCash == null ? 'N/A' : cmdCash >= 0 ? 'Cash on Hand' : cmdLeverage != null ? cmdLeverage.toFixed(2) + '× Leveraged' : 'Margined';
    var cmdCashColor = cmdCash == null ? undefined : cmdCash >= 0 ? 'var(--green)' : 'var(--red)';
    var cmdCashAccent = cmdCash == null ? 'indigo' : cmdCash >= 0 ? 'green' : 'red';

    return React.createElement('div', null,
        React.createElement('div', { className: 'page-title' }, 'Command Centre'),
        React.createElement(FeedNotice, { problems: feeds.problems }),
        // Health Score Hero
        React.createElement('div', { style: { textAlign: 'center', marginBottom: 32 } },
            // No score, no band: healthCls(undefined) is 'weak', which painted a
            // feed that did not answer in the red of a failing book.
            React.createElement('div', { className: 'health-score ' + (c.atlas_health_score == null ? '' : healthCls(c.atlas_health_score)), style: { width: 120, height: 120, fontSize: 42, margin: '0 auto 12px' } },
                c.atlas_health_score != null ? Math.round(c.atlas_health_score) : '—'),
            React.createElement('div', { style: { fontSize: 18, fontWeight: 600 } }, 'ATLAS Health Score'),
            React.createElement('div', null, React.createElement('span', { className: 'badge ' + badgeCls(c.portfolio_health_status), style: { marginTop: 8, fontSize: 13, padding: '5px 16px' } }, c.portfolio_health_status))
        ),
        // Metrics Grid — Hero Cards
        React.createElement('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 } },
            React.createElement(HeroCard, {
                icon: '◈', label: 'ACCOUNT EQUITY',
                value: cmdEquity != null ? fmtCurrency(cmdEquity) : fmtCurrency(c.portfolio_nav),
                accent: 'cyan',
                badge: 'Cash + Longs − Margin'
            }),
            React.createElement(HeroCard, {
                icon: '◊', label: 'PORTFOLIO NAV', value: fmtCurrency(cmdPortMV || c.portfolio_nav), accent: 'cyan'
            }),
            React.createElement(HeroCard, {
                icon: cmdCash != null && cmdCash < 0 ? '▽' : '◉',
                label: 'CASH / MARGIN',
                value: cmdCashLabel,
                color: cmdCashColor,
                accent: cmdCashAccent,
                badge: cmdCashBadge
            }),
            React.createElement(HeroCard, {
                icon: '◇', label: 'TOTAL INVESTED', value: fmtCurrency(c.total_invested), accent: 'indigo'
            }),
            React.createElement(HeroCard, {
                icon: c.total_return_pct == null ? '◇' : c.total_return_pct >= 0 ? '▲' : '▽',
                label: 'TOTAL RETURN',
                value: fmtPct(c.total_return_pct),
                color: c.total_return_pct == null ? undefined : c.total_return_pct >= 0 ? 'var(--green)' : 'var(--red)',
                accent: c.total_return_pct == null ? 'indigo' : c.total_return_pct >= 0 ? 'green' : 'red',
                badge: returnStatus(c.total_return_pct)
            }),
            React.createElement(HeroCard, {
                icon: '✦', label: 'SHARPE RATIO', value: fmt(c.sharpe_ratio),
                color: c.sharpe_ratio == null ? undefined : c.sharpe_ratio > 1 ? 'var(--green)' : c.sharpe_ratio > 0 ? 'var(--amber)' : 'var(--red)',
                accent: 'cyan', badge: sharpeStatus(c.sharpe_ratio)
            }),
            React.createElement(HeroCard, {
                icon: '◈', label: 'SORTINO RATIO', value: fmt(c.sortino_ratio),
                color: c.sortino_ratio == null ? undefined : c.sortino_ratio > 1 ? 'var(--green)' : c.sortino_ratio > 0 ? 'var(--amber)' : 'var(--red)',
                accent: 'violet', badge: sharpeStatus(c.sortino_ratio)
            }),
            React.createElement(HeroCard, {
                icon: '▽', label: 'MAX DRAWDOWN',
                value: fmtPct(c.drawdown_pct),
                color: 'var(--red)', accent: 'red',
                badge: ddStatus(c.drawdown_pct)
            }),
            React.createElement(HeroCard, {
                icon: '⚠', label: 'DAILY VAR (95%)', value: fmtCurrency(c.dollar_var_95), accent: 'amber'
            }),
            React.createElement(HeroCard, {
                icon: '◉', label: 'POSITIONS', value: String((homeData && homeData.length) || c.position_count || '—'), accent: 'indigo'
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
                        React.createElement('td', { style: { fontFamily: 'Figtree', color: 'rgba(255,255,255,0.5)' } }, 'Supabase Connection'),
                        React.createElement('td', null, sb ? React.createElement('span', { className: 'badge green' }, 'Connected') : React.createElement('span', { className: 'badge amber' }, 'Demo Mode'))),
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'Figtree', color: 'rgba(255,255,255,0.5)' } }, 'Last Computed'),
                        React.createElement('td', null, c.computed_at ? new Date(c.computed_at).toLocaleString() : '—')),
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'Figtree', color: 'rgba(255,255,255,0.5)' } }, 'Data Source'),
                        React.createElement('td', null, 'Supabase PostgreSQL + Alpaca Markets API')),
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'Figtree', color: 'rgba(255,255,255,0.5)' } }, 'NAV Methodology'),
                        React.createElement('td', null, 'FIFO Transaction-Based Reconstruction'))
                )
            )
        ),
        // Broker accounts (MP-4c): each account graded on its own syncs and
        // its own book, so one healthy account cannot hide another.
        accountSync ? React.createElement('div', { className: 'card', style: { marginTop: 16 } },
            React.createElement('div', { className: 'card-title' }, 'Broker Accounts'),
            accountSync.state === ACCOUNT_SYNC_LOADED
                ? React.createElement('table', { className: 'data-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            ['Account', 'Position sync', 'Positions', 'NAV drift', 'Status', 'Why'].map(function(h) {
                                return React.createElement('th', { key: h }, h);
                            })
                        )
                    ),
                    React.createElement('tbody', null,
                        accountSync.rows.map(function(r) {
                            var col = CC_TONE_COLOR[r.tone];
                            return React.createElement('tr', { key: r.id },
                                React.createElement('td', null, r.name + (r.isDefault ? ' · default' : '')),
                                React.createElement('td', null, 'ageLabel' in r ? r.ageLabel + ' ago' : 'never'),
                                React.createElement('td', null, 'positions' in r ? r.positions : '—'),
                                React.createElement('td', null, 'driftLabel' in r ? r.driftLabel : 'not reconciled'),
                                React.createElement('td', null, React.createElement('span', { className: 'badge', style: { color: col } }, (r.status || 'unknown').toUpperCase())),
                                React.createElement('td', { style: { fontSize: 11, color: 'var(--text-2)' } }, r.reasons.length ? r.reasons.join('; ') : '—')
                            );
                        })
                    )
                )
                : React.createElement('div', { style: { color: 'var(--text-2)', fontSize: 13, padding: '12px 0' } },
                    accountSync.state === ACCOUNT_SYNC_EMPTY
                        ? 'No broker account is registered for syncing.'
                        : 'Account sync health did not answer (' + accountSync.reason + '). This says nothing about whether the accounts are syncing.'
                )
        ) : null,
        // Data Freshness tile
        React.createElement('div', { className: 'card', style: { marginTop: 16 } },
            React.createElement('div', { className: 'card-title' }, 'Data Freshness'),
            freshness && freshness.length > 0
                ? React.createElement('table', { className: 'data-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            React.createElement('th', null, 'Stream'),
                            React.createElement('th', null, 'Last Update'),
                            React.createElement('th', null, 'Age'),
                            React.createElement('th', null, 'Status')
                        )
                    ),
                    React.createElement('tbody', null,
                        freshness.map(function(row) {
                            // v2 RPC returns status field directly; fall back to age calc for v1
                            var s = row.status || (
                                !row.last_update ? 'dead' :
                                Number(row.age_hours) > 96 ? 'dead' :
                                Number(row.age_hours) > 36 ? 'stale' : 'fresh'
                            );
                            var statusLabel = s === 'fresh' ? 'LIVE' : s === 'stale' ? 'STALE' : 'DEAD';
                            var statusCls   = s === 'fresh' ? 'green' : s === 'stale' ? 'amber' : 'red';
                            var hours = Number(row.age_hours) || 0;
                            var ageLabel = !row.last_update ? '—' : hours < 1 ? '<1h' : hours < 24 ? Math.round(hours) + 'h' : (hours / 24).toFixed(1) + 'd';
                            var lastStr  = row.last_update ? new Date(row.last_update).toLocaleString() : '—';
                            var streamNames = {
                                price_history:         'Price History',
                                positions:             'Positions',
                                account_snapshots:     'Account Snapshots',
                                sync_alpaca_positions: 'Position Sync',
                                sync_alpaca_prices:    'Price Sync',
                                last_sync:             'Last Sync',
                            };
                            return React.createElement('tr', { key: row.stream },
                                React.createElement('td', { style: { fontFamily: 'Figtree', color: 'rgba(255,255,255,0.7)' } }, streamNames[row.stream] || row.stream),
                                React.createElement('td', null, lastStr),
                                React.createElement('td', { style: { fontWeight: 600, color: s === 'fresh' ? 'var(--green)' : s === 'stale' ? 'var(--amber)' : 'var(--red)' } }, ageLabel),
                                React.createElement('td', null, React.createElement('span', { className: 'badge ' + statusCls }, statusLabel))
                            );
                        })
                    )
                )
                : React.createElement('div', { style: { color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '12px 0' } },
                    sb ? 'Freshness data unavailable' : 'Live in demo mode — connect Supabase to see data freshness'
                )
        ),
        // Validation Log
        React.createElement('div', { className: 'card', style: { marginTop: 16 } },
            React.createElement('div', { className: 'card-title' }, 'Validation Log  ·  Last 20 checks'),
            validationLog.length > 0
                ? React.createElement('table', { className: 'data-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            ['Check', 'Status', 'Message', 'When'].map(function(h) {
                                return React.createElement('th', { key: h }, h);
                            })
                        )
                    ),
                    React.createElement('tbody', null,
                        validationLog.map(function(row, i) {
                            // The database writes passed / warning / failed;
                            // this used to test only pass / ok / warn.
                            var tone = statusTone(row.status);
                            var ts = row.checked_at ? new Date(row.checked_at).toLocaleString() : '—';
                            return React.createElement('tr', { key: i },
                                React.createElement('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: '#00d4ff' } }, row.check_name || row.check || '—'),
                                React.createElement('td', null, React.createElement('span', { className: 'badge', style: { color: CC_TONE_COLOR[tone] } }, (row.status || '—').toUpperCase())),
                                React.createElement('td', { style: { fontSize: 11, color: 'rgba(255,255,255,0.55)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.message || '—'),
                                React.createElement('td', { style: { fontSize: 11, color: 'rgba(255,255,255,0.35)' } }, ts)
                            );
                        })
                    )
                )
                : React.createElement('div', { style: { color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '12px 0' } },
                    sb ? 'No validation checks found (atlas_validation_log is empty)' : 'Connect Supabase to see validation checks'
                )
        ),
        // System Alerts (from atlas_memory bugs)
        alerts.length > 0
            ? React.createElement('div', { className: 'card', style: { marginTop: 16 } },
                React.createElement('div', { className: 'card-title' }, 'System Alerts'),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                    alerts.map(function(a, i) {
                        var ts = a.created_at ? new Date(a.created_at).toLocaleString() : '—';
                        var priBg = a.priority <= 1 ? 'rgba(239,68,68,0.1)' : a.priority === 2 ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.04)';
                        var priBrd = a.priority <= 1 ? 'rgba(239,68,68,0.25)' : a.priority === 2 ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.06)';
                        return React.createElement('div', {
                            key: i,
                            style: { background: priBg, border: '1px solid ' + priBrd, borderRadius: 6, padding: '10px 14px' }
                        },
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                                React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: a.priority <= 1 ? '#ef4444' : a.priority === 2 ? '#f59e0b' : 'rgba(255,255,255,0.7)' } }, a.title || a.content && a.content.slice(0, 60) || 'Alert'),
                                React.createElement('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)' } }, ts)
                            ),
                            a.content && React.createElement('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 } }, a.content.slice(0, 200))
                        );
                    })
                )
            )
            : null,
        React.createElement(AccountBalances, null)
    );
}
