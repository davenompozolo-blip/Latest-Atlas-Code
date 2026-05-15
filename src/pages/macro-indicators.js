import React from 'react';
// ============================================================
// ATLAS Terminal — Macro Intelligence: Inflation & Growth Panel
// ------------------------------------------------------------
// React 18 UMD (no JSX). Chart.js via useChart hook.
// ============================================================

import { fmt, fmtPct, useChart } from './utils.js';
var useState = React.useState, useRef = React.useRef;
var h = React.createElement;

// --- Helpers ---

function computeYoY(series) {
    if (!series || series.length < 13) return null;
    var latest = series[series.length - 1].value;
    var yearAgo = series[series.length - 13].value;
    if (!yearAgo) return null;
    return (latest / yearAgo - 1) * 100;
}

function inflColor(v) {
    if (v == null) return null;
    if (v > 4) return '#ef4444';
    if (v > 3) return '#f59e0b';
    return '#10b981';
}

function rollingYoY(series) {
    if (!series || series.length < 13) return [];
    var result = [];
    for (var i = 12; i < series.length; i++) {
        result.push({ date: series[i].date, value: (series[i].value / series[i - 12].value - 1) * 100 });
    }
    return result;
}

function latest(arr) {
    if (!arr || !arr.length) return null;
    return arr[arr.length - 1].value;
}

function fN(n, d) { return n != null && isFinite(n) ? Number(n).toFixed(d != null ? d : 2) : '\u2014'; }

// --- Metric Tile ---

function Tile(p) {
    return h('div', { className: 'metric-card' },
        h('div', { className: 'label' }, p.label),
        h('div', { className: 'value', style: p.color ? { color: p.color } : null }, p.value)
    );
}

// --- Inflation Charts ---

function InflationTrendsChart(p) {
    var ref = useRef(null);
    useChart(ref, function () {
        var cpiYoY = rollingYoY(p.cpi);
        var coreYoY = rollingYoY(p.coreCpi);
        var pceYoY = rollingYoY(p.pce);
        if (!cpiYoY.length && !coreYoY.length && !pceYoY.length) return null;

        // Use longest series for labels
        var longest = [cpiYoY, coreYoY, pceYoY].reduce(function (a, b) { return b.length > a.length ? b : a; }, []);
        var labels = longest.map(function (d) { return d.date; });

        // Build lookup maps for alignment
        function toMap(arr) {
            var m = {};
            for (var i = 0; i < arr.length; i++) m[arr[i].date] = arr[i].value;
            return m;
        }
        var cpiMap = toMap(cpiYoY), coreMap = toMap(coreYoY), pceMap = toMap(pceYoY);

        return {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'CPI YoY', data: labels.map(function (d) { return cpiMap[d] != null ? cpiMap[d] : null; }),
                      borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)', tension: 0.3, pointRadius: 0, borderWidth: 2 },
                    { label: 'Core CPI YoY', data: labels.map(function (d) { return coreMap[d] != null ? coreMap[d] : null; }),
                      borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', tension: 0.3, pointRadius: 0, borderWidth: 2 },
                    { label: 'PCE YoY', data: labels.map(function (d) { return pceMap[d] != null ? pceMap[d] : null; }),
                      borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.1)', tension: 0.3, pointRadius: 0, borderWidth: 2 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: 'rgba(255,255,255,0.6)', boxWidth: 10, font: { size: 11 } } },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    y: { ticks: { color: 'rgba(255,255,255,0.6)', callback: function (v) { return v.toFixed(1) + '%'; } },
                         grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }
                }
            }
        };
    }, [p.cpi, p.coreCpi, p.pce]);
    return h('div', { style: { height: 260 } }, h('canvas', { ref: ref }));
}

function BreakevenChart(p) {
    var ref = useRef(null);
    useChart(ref, function () {
        var be5 = p.be5y || [];
        var be10 = p.be10y || [];
        if (!be5.length && !be10.length) return null;

        var longest = be5.length >= be10.length ? be5 : be10;
        var labels = longest.map(function (d) { return d.date; });

        function toMap(arr) {
            var m = {};
            for (var i = 0; i < arr.length; i++) m[arr[i].date] = arr[i].value;
            return m;
        }
        var map5 = toMap(be5), map10 = toMap(be10);

        return {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: '5Y Breakeven', data: labels.map(function (d) { return map5[d] != null ? map5[d] : null; }),
                      borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.08)', tension: 0.3, pointRadius: 0, borderWidth: 2 },
                    { label: '10Y Breakeven', data: labels.map(function (d) { return map10[d] != null ? map10[d] : null; }),
                      borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', tension: 0.3, pointRadius: 0, borderWidth: 2 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: 'rgba(255,255,255,0.6)', boxWidth: 10, font: { size: 11 } } },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    y: { ticks: { color: 'rgba(255,255,255,0.6)', callback: function (v) { return v.toFixed(2) + '%'; } },
                         grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }
                }
            }
        };
    }, [p.be5y, p.be10y]);
    return h('div', { style: { height: 200 } }, h('canvas', { ref: ref }));
}

// --- Growth Charts ---

function UnemploymentChart(p) {
    var ref = useRef(null);
    useChart(ref, function () {
        var series = p.unrate;
        if (!series || !series.length) return null;
        return {
            type: 'line',
            data: {
                labels: series.map(function (d) { return d.date; }),
                datasets: [{
                    label: 'Unemployment Rate',
                    data: series.map(function (d) { return d.value; }),
                    borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.2)',
                    fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    y: { ticks: { color: 'rgba(255,255,255,0.6)', callback: function (v) { return v.toFixed(1) + '%'; } },
                         grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }
                }
            }
        };
    }, [p.unrate]);
    return h('div', { style: { height: 240 } }, h('canvas', { ref: ref }));
}

function GdpChart(p) {
    var ref = useRef(null);
    useChart(ref, function () {
        var series = p.realGdp;
        if (!series || !series.length) return null;
        return {
            type: 'bar',
            data: {
                labels: series.map(function (d) { return d.date; }),
                datasets: [{
                    label: 'Real GDP',
                    data: series.map(function (d) { return d.value; }),
                    backgroundColor: 'rgba(0,212,255,0.6)', borderColor: '#00d4ff', borderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    y: { ticks: { color: 'rgba(255,255,255,0.6)', callback: function (v) { return '$' + (v / 1000).toFixed(1) + 'T'; } },
                         grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }
                }
            }
        };
    }, [p.realGdp]);
    return h('div', { style: { height: 220 } }, h('canvas', { ref: ref }));
}

function ClaimsChart(p) {
    var ref = useRef(null);
    useChart(ref, function () {
        var series = p.claims;
        if (!series || !series.length) return null;
        return {
            type: 'line',
            data: {
                labels: series.map(function (d) { return d.date; }),
                datasets: [{
                    label: 'Initial Claims',
                    data: series.map(function (d) { return d.value; }),
                    borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)',
                    fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    y: { ticks: { color: 'rgba(255,255,255,0.6)', callback: function (v) { return v.toFixed(0) + 'k'; } },
                         grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }
                }
            }
        };
    }, [p.claims]);
    return h('div', { style: { height: 180 } }, h('canvas', { ref: ref }));
}

// --- Inflation View ---

function InflationView(p) {
    var inf = p.inflation;
    if (!inf) {
        return h('div', { className: 'card', style: { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' } },
            'Inflation data unavailable.');
    }

    var cpiYoY = computeYoY(inf.cpi);
    var coreYoY = computeYoY(inf.coreCpi);
    var pceYoY = computeYoY(inf.pce);
    var be5 = latest(inf.breakeven5y);

    var tiles = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 } },
        h(Tile, { label: 'CPI YoY', value: cpiYoY != null ? fN(cpiYoY, 1) + '%' : '\u2014', color: inflColor(cpiYoY) }),
        h(Tile, { label: 'Core CPI YoY', value: coreYoY != null ? fN(coreYoY, 1) + '%' : '\u2014', color: inflColor(coreYoY) }),
        h(Tile, { label: 'PCE YoY', value: pceYoY != null ? fN(pceYoY, 1) + '%' : '\u2014', color: inflColor(pceYoY) }),
        h(Tile, { label: '5Y Breakeven', value: be5 != null ? fN(be5, 1) + '%' : '\u2014', color: inflColor(be5) })
    );

    var trendsCard = h('div', { className: 'card', style: { marginBottom: 14 } },
        h('div', { className: 'card-title' }, 'Inflation Trends (YoY %)'),
        h(InflationTrendsChart, { cpi: inf.cpi, coreCpi: inf.coreCpi, pce: inf.pce })
    );

    var beCard = h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Inflation Expectations (Breakeven Rates)'),
        h(BreakevenChart, { be5y: inf.breakeven5y, be10y: inf.breakeven10y })
    );

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        tiles, trendsCard, beCard
    );
}

// --- Growth View ---

function GrowthView(p) {
    var gr = p.growth;
    if (!gr) {
        return h('div', { className: 'card', style: { padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.4)' } },
            'Growth data unavailable.');
    }

    // Tile calculations
    var unrate = latest(gr.unrate);
    var unrateColor = unrate != null ? (unrate < 4 ? '#10b981' : unrate < 5 ? '#f59e0b' : '#ef4444') : null;

    var payrollsChg = null;
    if (gr.payrolls && gr.payrolls.length >= 2) {
        payrollsChg = gr.payrolls[gr.payrolls.length - 1].value - gr.payrolls[gr.payrolls.length - 2].value;
    }
    var payrollsStr = payrollsChg != null ? ((payrollsChg >= 0 ? '+' : '') + Math.round(payrollsChg) + 'k') : '\u2014';
    var payrollsColor = payrollsChg != null ? (payrollsChg >= 0 ? '#10b981' : '#ef4444') : null;

    var claims = latest(gr.claims);
    var claimsColor = claims != null ? (claims < 250 ? '#10b981' : claims < 350 ? '#f59e0b' : '#ef4444') : null;

    var indpro = latest(gr.indpro);

    var tiles = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 } },
        h(Tile, { label: 'Unemployment', value: unrate != null ? fN(unrate, 1) + '%' : '\u2014', color: unrateColor }),
        h(Tile, { label: 'Payrolls Chg', value: payrollsStr, color: payrollsColor }),
        h(Tile, { label: 'Initial Claims', value: claims != null ? Math.round(claims) + 'k' : '\u2014', color: claimsColor }),
        h(Tile, { label: 'Industrial Prod', value: indpro != null ? fN(indpro, 1) : '\u2014', color: null })
    );

    var unrateCard = h('div', { className: 'card', style: { marginBottom: 14 } },
        h('div', { className: 'card-title' }, 'Unemployment Rate (%)'),
        h(UnemploymentChart, { unrate: gr.unrate })
    );

    var gdpCard = h('div', { className: 'card', style: { marginBottom: 14 } },
        h('div', { className: 'card-title' }, 'Real GDP ($ Billions)'),
        h(GdpChart, { realGdp: gr.realGdp })
    );

    var claimsCard = h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Weekly Initial Claims (Thousands)'),
        h(ClaimsChart, { claims: gr.claims })
    );

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
        tiles, unrateCard, gdpCard, claimsCard
    );
}

// --- Main Export ---

export function IndicatorsPanel(p) {
    var data = p.data;
    var _t = useState('inflation'), view = _t[0], setView = _t[1];

    var btnStyle = function (active) {
        return {
            padding: '8px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
            background: active ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
            color: active ? '#00d4ff' : 'rgba(255,255,255,0.45)',
            borderBottom: active ? '2px solid #00d4ff' : '2px solid transparent'
        };
    };

    var toggle = h('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
        h('button', { style: btnStyle(view === 'inflation'), onClick: function () { setView('inflation'); } }, 'Inflation'),
        h('button', { style: btnStyle(view === 'growth'), onClick: function () { setView('growth'); } }, 'Growth')
    );

    var content = view === 'inflation'
        ? h(InflationView, { inflation: data ? data.inflation : null })
        : h(GrowthView, { growth: data ? data.growth : null });

    return h('div', null, toggle, content);
}
