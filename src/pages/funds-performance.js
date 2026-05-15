import React from 'react';
// ============================================================
// ATLAS Terminal — Funds Performance Sub-Panel
// ------------------------------------------------------------
// React 18 UMD, no JSX. Chart.js for visualizations.
// ============================================================

import { fmt, fmtPct, fmtCurrency, useChart } from './utils.js';
var useRef = React.useRef, useMemo = React.useMemo;
var h = React.createElement;

// --- Helpers -------------------------------------------------

function retColor(v) {
    if (v == null) return 'rgba(255,255,255,0.5)';
    return v >= 0 ? '#10b981' : '#ef4444';
}

function retText(v) {
    if (v == null) return '\u2014';
    var pct = (v * 100).toFixed(2);
    return (v >= 0 ? '+' : '') + pct + '%';
}

function monthHeatColor(ret) {
    if (ret == null) return 'rgba(255,255,255,0.04)';
    var intensity = Math.min(Math.abs(ret) * 10, 1);
    if (ret > 0) return 'rgba(16,185,129,' + (0.1 + intensity * 0.5) + ')';
    return 'rgba(239,68,68,' + (0.1 + intensity * 0.5) + ')';
}

function computeRollingSharpe(series) {
    if (!series || series.length < 253) return [];
    var result = [];
    for (var i = 252; i < series.length; i++) {
        var window = [];
        for (var j = i - 251; j <= i; j++) {
            window.push(series[j].close / series[j - 1].close - 1);
        }
        var mean = window.reduce(function(s, v) { return s + v; }, 0) / window.length;
        var variance = window.reduce(function(s, v) { return s + (v - mean) * (v - mean); }, 0) / window.length;
        var vol = Math.sqrt(variance) * Math.sqrt(252);
        var annRet = mean * 252;
        var sharpe = vol > 0 ? (annRet - 0.045) / vol : 0;
        result.push({ date: series[i].date, value: sharpe });
    }
    return result;
}

function computeMonthlyReturns(series) {
    if (!series || series.length < 22) return [];
    var months = {};
    series.forEach(function(s) {
        var ym = s.date.slice(0, 7);
        if (!months[ym]) months[ym] = { first: s.close, last: s.close };
        months[ym].last = s.close;
    });
    var keys = Object.keys(months).sort();
    var result = [];
    for (var i = 1; i < keys.length; i++) {
        result.push({ month: keys[i], ret: months[keys[i]].last / months[keys[i]].first - 1 });
    }
    return result;
}

// --- 1. Returns Table ----------------------------------------

function ReturnsTable(p) {
    var m = p.metrics || {};
    var rows = [
        { label: '1 Month', value: m.ret1m },
        { label: '3 Month', value: m.ret3m },
        { label: '6 Month', value: m.ret6m },
        { label: '1 Year', value: m.ret1y },
        { label: '3 Year (Ann.)', value: m.ret3y }
    ];
    return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Period Returns'),
        h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            h('thead', null,
                h('tr', null,
                    h('th', { style: { textAlign: 'left', padding: '8px 0', color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' } }, 'Period'),
                    h('th', { style: { textAlign: 'right', padding: '8px 0', color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' } }, 'Return')
                )
            ),
            h('tbody', null, rows.map(function(r, i) {
                return h('tr', { key: i },
                    h('td', { style: { padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.8)' } }, r.label),
                    h('td', { style: { padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: retColor(r.value) } }, retText(r.value))
                );
            }))
        )
    );
}

// --- 2. Returns Bar Chart ------------------------------------

function ReturnsBarChart(p) {
    var ref = useRef(null);
    var m = p.metrics || {};
    var periods = ['1M', '3M', '6M', '1Y', '3Y Ann.'];
    var values = [m.ret1m, m.ret3m, m.ret6m, m.ret1y, m.ret3y];

    useChart(ref, function() {
        var data = values.map(function(v) { return v != null ? v * 100 : 0; });
        var colors = data.map(function(v) { return v >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'; });
        var borders = data.map(function(v) { return v >= 0 ? '#10b981' : '#ef4444'; });
        return {
            type: 'bar',
            data: {
                labels: periods,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderColor: borders,
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.6)', callback: function(v) { return v.toFixed(1) + '%'; } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.8)' },
                        grid: { display: false }
                    }
                }
            }
        };
    }, [m.ret1m, m.ret3m, m.ret6m, m.ret1y, m.ret3y]);

    return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Period Returns Comparison'),
        h('div', { style: { height: 180 } }, h('canvas', { ref: ref }))
    );
}

// --- 3. Risk-Return Profile ----------------------------------

function RiskReturnCard(p) {
    var m = p.metrics || {};
    var retVal = m.annReturn;
    var volVal = m.annVol;
    var sharpeVal = m.sharpe;

    var sectionStyle = { flex: 1, textAlign: 'center', padding: '12px 8px' };
    var labelStyle = { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' };
    var bigNumStyle = { fontSize: 24, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' };
    var divider = { width: 1, background: 'rgba(255,255,255,0.08)', alignSelf: 'stretch' };

    return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Risk-Return Profile'),
        h('div', { style: { display: 'flex', alignItems: 'center' } },
            h('div', { style: sectionStyle },
                h('div', { style: labelStyle }, 'Ann. Return'),
                h('div', { style: Object.assign({}, bigNumStyle, { color: retColor(retVal) }) }, retText(retVal))
            ),
            h('div', { style: divider }),
            h('div', { style: sectionStyle },
                h('div', { style: labelStyle }, 'Sharpe Ratio'),
                h('div', { style: Object.assign({}, bigNumStyle, { color: '#00d4ff' }) }, sharpeVal != null ? fmt(sharpeVal) : '\u2014')
            ),
            h('div', { style: divider }),
            h('div', { style: sectionStyle },
                h('div', { style: labelStyle }, 'Ann. Volatility'),
                h('div', { style: Object.assign({}, bigNumStyle, { color: 'rgba(255,255,255,0.85)' }) }, retText(volVal))
            )
        )
    );
}

// --- 4. Rolling Sharpe Chart ---------------------------------

function RollingSharpeChart(p) {
    var ref = useRef(null);
    var rolling = useMemo(function() {
        return computeRollingSharpe(p.series);
    }, [p.series]);

    useChart(ref, function() {
        if (!rolling.length) return null;
        return {
            type: 'line',
            data: {
                labels: rolling.map(function(r) { return r.date; }),
                datasets: [
                    {
                        label: 'Rolling 1Y Sharpe',
                        data: rolling.map(function(r) { return r.value; }),
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0,212,255,0.08)',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: 'Zero Line',
                        data: rolling.map(function() { return 0; }),
                        borderColor: 'rgba(255,255,255,0.2)',
                        borderWidth: 1,
                        borderDash: [4, 4],
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                if (ctx.datasetIndex === 1) return null;
                                return 'Sharpe: ' + ctx.parsed.y.toFixed(2);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: 'rgba(255,255,255,0.5)',
                            maxTicksLimit: 6,
                            maxRotation: 0
                        },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            callback: function(v) { return v.toFixed(1); }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        };
    }, [rolling]);

    if (!p.series || p.series.length < 253) {
        return h('div', { className: 'card', style: { marginBottom: 16 } },
            h('div', { className: 'card-title' }, 'Rolling 1Y Sharpe Ratio'),
            h('div', { style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32, fontSize: 13 } },
                'Insufficient data for rolling analysis (need >1Y daily history).'
            )
        );
    }

    return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Rolling 1Y Sharpe Ratio'),
        h('div', { style: { height: 220 } }, h('canvas', { ref: ref }))
    );
}

// --- 5. Monthly Returns Heatmap ------------------------------

function MonthlyHeatmap(p) {
    var monthly = useMemo(function() {
        return computeMonthlyReturns(p.series);
    }, [p.series]);

    if (!monthly.length) {
        return h('div', { className: 'card', style: { marginBottom: 16 } },
            h('div', { className: 'card-title' }, 'Monthly Returns'),
            h('div', { style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24, fontSize: 13 } },
                'Insufficient data for monthly returns.'
            )
        );
    }

    var cells = monthly.map(function(m, i) {
        var pct = (m.ret * 100).toFixed(2);
        var sign = m.ret >= 0 ? '+' : '';
        return h('div', {
            key: i,
            title: m.month + ': ' + sign + pct + '%',
            style: {
                width: 30,
                height: 30,
                background: monthHeatColor(m.ret),
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 8,
                fontFamily: 'JetBrains Mono, monospace',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'default'
            }
        }, m.month.slice(5));
    });

    return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Monthly Returns'),
        h('div', {
            style: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                padding: '4px 0'
            }
        }, cells)
    );
}

// --- 6. Additional Metrics Row (Sortino, MaxDD, Calmar) ------

function RiskMetricsRow(p) {
    var m = p.metrics || {};
    var tiles = [
        { label: 'Sortino', value: m.sortino != null ? fmt(m.sortino) : '\u2014', color: '#00d4ff' },
        { label: 'Max Drawdown', value: retText(m.maxDD), color: m.maxDD != null ? retColor(m.maxDD) : 'rgba(255,255,255,0.5)' },
        { label: 'Calmar Ratio', value: m.calmar != null ? fmt(m.calmar) : '\u2014', color: '#00d4ff' }
    ];

    return h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }
    }, tiles.map(function(t, i) {
        return h('div', { key: i, className: 'card', style: { textAlign: 'center', padding: '14px 8px' } },
            h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' } }, t.label),
            h('div', { style: { fontSize: 20, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: t.color } }, t.value)
        );
    }));
}

// --- Main Export ---------------------------------------------

export function FundPerformance(p) {
    var data = p.data || {};
    var metrics = data.metrics || {};
    var series = data.series || [];

    return h('div', null,
        h(ReturnsTable, { metrics: metrics }),
        h(ReturnsBarChart, { metrics: metrics }),
        h(RiskReturnCard, { metrics: metrics }),
        h(RiskMetricsRow, { metrics: metrics }),
        h(RollingSharpeChart, { series: series }),
        h(MonthlyHeatmap, { series: series })
    );
}
