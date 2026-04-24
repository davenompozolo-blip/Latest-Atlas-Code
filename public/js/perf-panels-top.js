// ============================================================
// ATLAS Terminal — Performance Suite: Overview & Returns Panels
// ------------------------------------------------------------
// React 18 UMD, no JSX. Chart.js for visualizations.
// ============================================================

import { fmt, fmtPct, fmtCurrency, cls, useChart } from './utils.js';
import {
    computePortfolioMetrics, computeDrawdownSeries, computeReturnsBins,
    computeMonthlyReturns, computeCumulativeReturns, computePeriodReturns
} from './perf-engine.js';

var useRef = React.useRef, useMemo = React.useMemo;
var h = React.createElement;

// --- Helpers -------------------------------------------------

function retColor(v) {
    if (v == null) return 'rgba(255,255,255,0.5)';
    return v >= 0 ? '#10b981' : '#ef4444';
}

function volColor(v) {
    if (v == null) return 'rgba(255,255,255,0.5)';
    if (v < 0.15) return '#10b981';
    if (v < 0.25) return '#f59e0b';
    return '#ef4444';
}

function ratioColor(v) {
    if (v == null) return 'rgba(255,255,255,0.5)';
    if (v > 1) return '#10b981';
    if (v > 0) return '#f59e0b';
    return '#ef4444';
}

function sharpeLabel(v) {
    if (v == null) return '';
    if (v > 1.5) return 'Excellent';
    if (v > 1) return 'Good';
    if (v > 0) return 'Fair';
    return 'Poor';
}

function calendarColor(ret) {
    if (ret == null) return 'rgba(255,255,255,0.02)';
    var i = Math.min(Math.abs(ret) * 8, 1);
    if (ret > 0) return 'rgba(16,185,129,' + (0.1 + i * 0.5) + ')';
    return 'rgba(239,68,68,' + (0.1 + i * 0.5) + ')';
}

// --- Metric Tile ---------------------------------------------

function Tile(p) {
    return h('div', { className: 'metric-card' },
        h('div', { className: 'label' }, p.label),
        h('div', { className: 'value', style: { color: p.color || 'rgba(255,255,255,0.85)' } }, p.value),
        p.sub ? h('div', { className: 'sub' }, p.sub) : null
    );
}

// =============================================================
// Export 1: OverviewPanel
// =============================================================

export function OverviewPanel(p) {
    var m = useMemo(function() { return computePortfolioMetrics(p.navSeries); }, [p.navSeries]);
    var ddSeries = useMemo(function() { return computeDrawdownSeries(p.navSeries); }, [p.navSeries]);

    if (!m) {
        return h('div', { className: 'card', style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 } },
            'Insufficient data for performance overview.'
        );
    }

    // Canonical overrides from cmdData
    var cmd = p.cmdData || {};
    var sharpe = cmd.sharpe_ratio != null ? cmd.sharpe_ratio : m.sharpe;
    var sortino = cmd.sortino_ratio != null ? cmd.sortino_ratio : m.sortino;
    var maxDD = cmd.drawdown_pct != null ? cmd.drawdown_pct : m.maxDD;

    // A. Hero Metrics
    var heroGrid = h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }
    },
        h(Tile, { label: 'Total Return', value: fmtPct(m.totalReturn), color: retColor(m.totalReturn) }),
        h(Tile, { label: 'Ann. Return', value: fmtPct(m.annReturn), color: retColor(m.annReturn) }),
        h(Tile, { label: 'Ann. Volatility', value: fmtPct(m.annVol), color: volColor(m.annVol) }),
        h(Tile, { label: 'Sharpe Ratio', value: fmt(sharpe, 2), color: ratioColor(sharpe), sub: sharpeLabel(sharpe) }),
        h(Tile, { label: 'Sortino Ratio', value: fmt(sortino, 2), color: ratioColor(sortino), sub: sharpeLabel(sortino) }),
        h(Tile, { label: 'Max Drawdown', value: fmtPct(maxDD), color: '#ef4444' }),
        h(Tile, { label: 'Calmar Ratio', value: fmt(m.calmar, 2), color: m.calmar != null && m.calmar > 1 ? '#10b981' : 'rgba(255,255,255,0.85)' }),
        h(Tile, { label: 'Win Rate', value: fmtPct(m.winRate), color: m.winRate > 0.55 ? '#10b981' : 'rgba(255,255,255,0.85)' })
    );

    // B. Equity Curve Chart
    var eqRef = useRef(null);
    useChart(eqRef, function() {
        if (!p.navSeries || !p.navSeries.length) return null;
        return {
            type: 'line',
            data: {
                labels: p.navSeries.map(function(d) { return d.price_date; }),
                datasets: [{
                    data: p.navSeries.map(function(d) { return d.nav; }),
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0,212,255,0.08)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 12, maxRotation: 0 },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            callback: function(v) { return '$' + (v / 1000).toFixed(0) + 'k'; }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        };
    }, [p.navSeries]);

    var equityCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Portfolio Equity Curve'),
        h('div', { style: { height: 280 } }, h('canvas', { ref: eqRef }))
    );

    // C. Underwater Chart
    var ddRef = useRef(null);
    useChart(ddRef, function() {
        if (!ddSeries.length) return null;
        return {
            type: 'line',
            data: {
                labels: ddSeries.map(function(d) { return d.date; }),
                datasets: [{
                    data: ddSeries.map(function(d) { return d.dd; }),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239,68,68,0.25)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 12, maxRotation: 0 },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            callback: function(v) { return (v * 100).toFixed(1) + '%'; }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        };
    }, [ddSeries]);

    var underwaterCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Drawdown (Underwater)'),
        h('div', { style: { height: 180 } }, h('canvas', { ref: ddRef }))
    );

    // D. Best / Worst Day Card
    var bestWorst = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'Best Day'),
            h('div', { className: 'value', style: { color: '#10b981' } }, fmtPct(m.bestDay.value)),
            h('div', { className: 'sub' }, m.bestDay.date)),
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'Worst Day'),
            h('div', { className: 'value', style: { color: '#ef4444' } }, fmtPct(m.worstDay.value)),
            h('div', { className: 'sub' }, m.worstDay.date))
    );

    return h('div', null, heroGrid, equityCard, underwaterCard, bestWorst);
}

// =============================================================
// Export 2: ReturnsPanel
// =============================================================

export function ReturnsPanel(p) {
    var periods = useMemo(function() { return computePeriodReturns(p.navSeries); }, [p.navSeries]);
    var cumReturns = useMemo(function() { return computeCumulativeReturns(p.navSeries); }, [p.navSeries]);
    var bins = useMemo(function() { return computeReturnsBins(p.navSeries, 40); }, [p.navSeries]);
    var monthly = useMemo(function() { return computeMonthlyReturns(p.navSeries); }, [p.navSeries]);

    if (!p.navSeries || p.navSeries.length < 2) {
        return h('div', { className: 'card', style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 } },
            'Insufficient data for returns analysis.'
        );
    }

    // A. Period Returns Table
    var periodRows = [
        { label: '1 Day', value: periods.ret1d },
        { label: '1 Week', value: periods.ret1w },
        { label: '1 Month', value: periods.ret1m },
        { label: '3 Month', value: periods.ret3m },
        { label: '6 Month', value: periods.ret6m },
        { label: '1 Year', value: periods.ret1y },
        { label: 'MTD', value: periods.mtd },
        { label: 'YTD', value: periods.ytd },
        { label: 'Inception', value: periods.inception }
    ];

    var thStyle = { textAlign: 'left', padding: '8px 0', color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' };
    var thStyleR = { textAlign: 'right', padding: '8px 0', color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.08)' };

    var periodTable = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Period Returns'),
        h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            h('thead', null,
                h('tr', null,
                    h('th', { style: thStyle }, 'Period'),
                    h('th', { style: thStyleR }, 'Return')
                )
            ),
            h('tbody', null, periodRows.map(function(r, i) {
                var val = r.value;
                var text = val != null ? ((val >= 0 ? '+' : '') + (val * 100).toFixed(2) + '%') : '\u2014';
                return h('tr', { key: i },
                    h('td', { style: { padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.8)' } }, r.label),
                    h('td', { style: { padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: retColor(val) } }, text)
                );
            }))
        )
    );

    // B. Cumulative Returns Chart
    var cumRef = useRef(null);
    useChart(cumRef, function() {
        if (!cumReturns.length) return null;
        return {
            type: 'line',
            data: {
                labels: cumReturns.map(function(d) { return d.date; }),
                datasets: [{
                    data: cumReturns.map(function(d) { return d.value; }),
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0,212,255,0.08)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 12, maxRotation: 0 },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            callback: function(v) { return (v * 100).toFixed(0) + '%'; }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        };
    }, [cumReturns]);

    var cumCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Cumulative Returns'),
        h('div', { style: { height: 240 } }, h('canvas', { ref: cumRef }))
    );

    // C. Returns Distribution Histogram
    var histRef = useRef(null);
    useChart(histRef, function() {
        if (!bins.length) return null;
        return {
            type: 'bar',
            data: {
                labels: bins.map(function(b) { return b.mid.toFixed(2) + '%'; }),
                datasets: [{
                    data: bins.map(function(b) { return b.count; }),
                    backgroundColor: bins.map(function(b) { return b.mid >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'; }),
                    borderColor: bins.map(function(b) { return b.mid >= 0 ? '#10b981' : '#ef4444'; }),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 8, maxRotation: 0 },
                        grid: { display: false }
                    },
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.6)' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        };
    }, [bins]);

    var histCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Daily Returns Distribution'),
        h('div', { style: { height: 220 } }, h('canvas', { ref: histRef }))
    );

    // D. Monthly Returns Heatmap Calendar
    var years = {};
    monthly.forEach(function(m) {
        if (!years[m.year]) years[m.year] = {};
        years[m.year][m.month] = m.ret;
    });
    var yearKeys = Object.keys(years).sort();
    var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    var cellBase = {
        width: 50, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 3, fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
        color: 'rgba(255,255,255,0.85)', cursor: 'default'
    };
    var headerCell = {
        width: 50, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase'
    };
    var yearLabel = {
        width: 40, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        paddingRight: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600,
        fontFamily: 'JetBrains Mono, monospace'
    };

    var heatmapContent;
    if (!monthly.length) {
        heatmapContent = h('div', { style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24, fontSize: 13 } },
            'Insufficient data for monthly calendar.'
        );
    } else {
        // Header row
        var headerRow = h('div', { style: { display: 'flex', gap: 2, marginLeft: 48 } },
            MONTHS.map(function(m, i) { return h('div', { key: 'h' + i, style: headerCell }, m); })
        );
        // Year rows
        var rows = yearKeys.map(function(yr) {
            var cells = [];
            for (var mi = 0; mi < 12; mi++) {
                var ret = years[yr][mi + 1];
                var text = ret != null ? (ret * 100).toFixed(1) + '%' : '';
                cells.push(h('div', {
                    key: mi,
                    style: Object.assign({}, cellBase, { background: calendarColor(ret) })
                }, text));
            }
            return h('div', { key: yr, style: { display: 'flex', gap: 2 } },
                h('div', { style: yearLabel }, yr),
                cells
            );
        });
        heatmapContent = h('div', null, headerRow, h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } }, rows));
    }

    var heatmapCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Monthly Returns Calendar'),
        heatmapContent
    );

    return h('div', null, periodTable, cumCard, histCard, heatmapCard);
}
