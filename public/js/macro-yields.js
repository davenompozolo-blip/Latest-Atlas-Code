// ============================================================
// ATLAS Terminal — Rates & Yields Sub-Panel
// ------------------------------------------------------------
// Macro Intelligence module: yield curve, key rates, historical
// yields, and 2s10s spread history.
//
// Consumes globals: React, Chart (UMD)
// ============================================================

import { fmt, fmtPct, useChart } from './utils.js';
var useState = React.useState, useRef = React.useRef;
var h = React.createElement;

// --- Helpers -------------------------------------------------

function lastVal(arr) {
    if (!arr || !arr.length) return null;
    return arr[arr.length - 1].value;
}

function fmtRate(v) {
    return v != null ? Number(v).toFixed(2) + '%' : '\u2014';
}

function fmtBps(v) {
    if (v == null) return '\u2014';
    return (v * 100).toFixed(0) + 'bps';
}

function mergeSeriesForChart(series1, series2, series3) {
    var dateSet = {};
    function add(arr, key) {
        if (!arr) return;
        arr.forEach(function(d) {
            if (!dateSet[d.date]) dateSet[d.date] = {};
            dateSet[d.date][key] = d.value;
        });
    }
    add(series1, 'a');
    add(series2, 'b');
    add(series3, 'c');
    var dates = Object.keys(dateSet).sort();
    return {
        labels: dates,
        a: dates.map(function(d) { return dateSet[d].a != null ? dateSet[d].a : null; }),
        b: dates.map(function(d) { return dateSet[d].b != null ? dateSet[d].b : null; }),
        c: dates.map(function(d) { return dateSet[d].c != null ? dateSet[d].c : null; })
    };
}

// --- Yield Curve Chart Component -----------------------------

function YieldCurveChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.curve || !p.curve.labels || !p.curve.values) return null;
        return {
            type: 'line',
            data: {
                labels: p.curve.labels,
                datasets: [{
                    label: 'Yield',
                    data: p.curve.values,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0,212,255,0.12)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#00d4ff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.6)', callback: function(v) { return v.toFixed(2) + '%'; } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.6)' },
                        grid: { display: false }
                    }
                }
            }
        };
    }, [p.curve]);
    return h('div', { style: { height: 220 } }, h('canvas', { ref: ref }));
}

// --- Historical Yields Chart Component -----------------------

function HistoricalYieldsChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        var merged = mergeSeriesForChart(p.dgs2, p.dgs10, p.fedFunds);
        if (!merged.labels.length) return null;
        var step = Math.max(1, Math.floor(merged.labels.length / 12));
        return {
            type: 'line',
            data: {
                labels: merged.labels,
                datasets: [
                    {
                        label: '2Y Treasury',
                        data: merged.a,
                        borderColor: '#10b981',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.2,
                        spanGaps: true
                    },
                    {
                        label: '10Y Treasury',
                        data: merged.b,
                        borderColor: '#00d4ff',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.2,
                        spanGaps: true
                    },
                    {
                        label: 'Fed Funds',
                        data: merged.c,
                        borderColor: '#f59e0b',
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        borderDash: [6, 3],
                        pointRadius: 0,
                        tension: 0.2,
                        spanGaps: true
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: 'rgba(255,255,255,0.7)', boxWidth: 12, padding: 12, font: { size: 11 } }
                    }
                },
                scales: {
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.6)', callback: function(v) { return v.toFixed(1) + '%'; } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 12
                        },
                        grid: { display: false }
                    }
                }
            }
        };
    }, [p.dgs2, p.dgs10, p.fedFunds]);
    return h('div', { style: { height: 260 } }, h('canvas', { ref: ref }));
}

// --- 2s10s Spread Chart Component ----------------------------

function SpreadChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.spreadData || !p.spreadData.length) return null;
        var labels = p.spreadData.map(function(d) { return d.date; });
        var values = p.spreadData.map(function(d) { return d.value; });
        var colors = values.map(function(v) { return v >= 0 ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'; });
        return {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '2s10s Spread',
                    data: values,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0,212,255,0.08)',
                    fill: true,
                    tension: 0.2,
                    pointRadius: 0,
                    borderWidth: 1.5,
                    spanGaps: true
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    annotation: {
                        annotations: {
                            zeroLine: {
                                type: 'line', yMin: 0, yMax: 0,
                                borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderDash: [4, 4]
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.6)', callback: function(v) { return (v * 100).toFixed(0) + 'bps'; } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.6)', maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
                        grid: { display: false }
                    }
                }
            }
        };
    }, [p.spreadData]);
    return h('div', { style: { height: 180 } }, h('canvas', { ref: ref }));
}

// --- Main Export ---------------------------------------------

export function YieldsPanel(p) {
    var data = p.data;

    // Guard: missing yields data
    if (!data || !data.yields) {
        return h('div', { className: 'card', style: { color: 'var(--text-muted)', textAlign: 'center', padding: 32 } },
            'Yield data unavailable. FRED API key may not be configured.'
        );
    }

    var y = data.yields;
    var spread2s10s = y.curve ? y.curve.spread2s10s : null;
    var inverted = spread2s10s != null && spread2s10s < 0;

    // Compute 2s10s spread history
    var spreadData = [];
    if (y.dgs2 && y.dgs10) {
        var map2 = {};
        y.dgs2.forEach(function(d) { map2[d.date] = d.value; });
        y.dgs10.forEach(function(d) {
            if (map2[d.date] != null) spreadData.push({ date: d.date, value: d.value - map2[d.date] });
        });
    }

    // 1. Yield Curve
    var curveCard = y.curve ? h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'US Treasury Yield Curve'),
        inverted ? h('div', {
            style: { fontSize: 12, color: '#ef4444', marginBottom: 8, fontWeight: 500 }
        }, '\u26A0 Yield Curve Inverted (2s10s: ' + fmtBps(spread2s10s) + ')') : null,
        h(YieldCurveChart, { curve: y.curve })
    ) : null;

    // 2. Key Rates Tiles
    var tiles = h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }
    },
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'Fed Funds'),
            h('div', { className: 'value' }, fmtRate(lastVal(y.fedFunds)))
        ),
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, '2-Year'),
            h('div', { className: 'value' }, fmtRate(lastVal(y.dgs2)))
        ),
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, '10-Year'),
            h('div', { className: 'value' }, fmtRate(lastVal(y.dgs10)))
        ),
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, '2s10s Spread'),
            h('div', {
                className: 'value',
                style: { color: inverted ? '#ef4444' : '#10b981' }
            }, fmtBps(spread2s10s))
        )
    );

    // 3. Historical Yields
    var histCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Historical Rates'),
        h(HistoricalYieldsChart, { dgs2: y.dgs2, dgs10: y.dgs10, fedFunds: y.fedFunds })
    );

    // 4. 2s10s Spread History
    var spreadCard = spreadData.length > 0 ? h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, '2s10s Spread'),
        h(SpreadChart, { spreadData: spreadData })
    ) : null;

    return h('div', null, curveCard, tiles, histCard, spreadCard);
}
