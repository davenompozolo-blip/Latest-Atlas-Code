// ============================================================
// ATLAS Terminal — Performance Suite: Risk & Positions Panels
// ------------------------------------------------------------
// React 18 UMD, no JSX. Chart.js for visualizations.
// ============================================================

import { fmt, fmtPct, fmtCurrency, cls, healthCls, useChart, volStatus, ddStatus, sharpeStatus, calmarStatus } from './utils.js';
import { HeroCard } from './components.js';
import {
    computePortfolioMetrics, computeRollingMetrics,
    computeDrawdownPeriods
} from './perf-engine.js';

var useState = React.useState, useRef = React.useRef, useMemo = React.useMemo;
var h = React.createElement;

function retColor(v) {
    if (v == null) return 'rgba(255,255,255,0.5)';
    return v >= 0 ? '#10b981' : '#ef4444';
}

function Tile(p) {
    return h(HeroCard, { label: p.label, value: p.value, color: p.color, accent: p.accent || 'cyan', sub: p.sub, icon: p.icon, badge: p.badge });
}


// =============================================================
// Export 1: RiskPanel
// =============================================================

export function RiskPanel(p) {
    var m = useMemo(function() { return computePortfolioMetrics(p.navSeries); }, [p.navSeries]);
    var rolling = useMemo(function() { return computeRollingMetrics(p.navSeries, 90); }, [p.navSeries]);
    var ddPeriods = useMemo(function() { return computeDrawdownPeriods(p.navSeries, 5); }, [p.navSeries]);

    if (!m) {
        return h('div', { className: 'card', style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 } },
            'Insufficient data for risk analysis.'
        );
    }

    var cmd = p.cmdData || {};

    // A. Risk Metrics Grid — HeroCards with accent colours
    var riskGrid = h('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 } },
        h(Tile, { icon: '⚡', label: 'VaR (95% Daily)', value: fmtPct(m.var95), color: '#ef4444', accent: 'red', badge: 'Tail Risk' }),
        h(Tile, { icon: '⚠', label: 'CVaR (95% Daily)', value: fmtPct(m.cvar95), color: '#ef4444', accent: 'red', badge: 'Exp. Shortfall' }),
        h(Tile, { icon: '▽', label: 'Max Drawdown', value: fmtPct(m.maxDD), color: '#ef4444', accent: 'red', badge: ddStatus(m.maxDD) }),
        h(Tile, { icon: '≡', label: 'Current Drawdown', value: fmtPct(m.currentDD), color: m.currentDD < -0.02 ? '#ef4444' : '#10b981', accent: m.currentDD < -0.02 ? 'red' : 'green' }),
        h(Tile, { icon: '≋', label: 'Ann. Volatility', value: fmtPct(m.annVol), color: m.annVol > 0.25 ? '#ef4444' : m.annVol > 0.15 ? '#f59e0b' : '#10b981', accent: m.annVol > 0.25 ? 'red' : 'amber', badge: volStatus(m.annVol) }),
        h(Tile, { icon: '◆', label: 'Calmar Ratio', value: fmt(m.calmar, 2), color: m.calmar != null && m.calmar > 1 ? '#10b981' : 'rgba(255,255,255,0.85)', accent: 'indigo', badge: calmarStatus(m.calmar) }),
        h(Tile, { icon: '$', label: 'Dollar VaR (95%)', value: cmd.dollar_var_95 != null ? fmtCurrency(cmd.dollar_var_95) : fmtCurrency(m.var95 * (m.endNav || 0)), color: '#ef4444', accent: 'red' }),
        h(Tile, { icon: '▼', label: 'Downside Dev.', value: fmtPct(m.annVol * 0.707), color: '#f59e0b', accent: 'amber', sub: 'Annualised' })
    );

    // B. ATLAS Health Score
    var health = cmd.atlas_health_score || 0;
    var healthCard = h('div', { className: 'card', style: { marginBottom: 16, textAlign: 'center', padding: '24px 16px' } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 } },
            h('div', { className: 'health-score ' + healthCls(health), style: { width: 80, height: 80, fontSize: 32, flexShrink: 0 } },
                Math.round(health)
            ),
            h('div', { style: { textAlign: 'left' } },
                h('div', { style: { fontSize: 16, fontWeight: 600, marginBottom: 4 } }, 'ATLAS Health Score'),
                h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.5)' } },
                    health >= 75 ? 'Portfolio operating within healthy risk parameters'
                    : health >= 50 ? 'Portfolio showing moderate risk — monitor closely'
                    : 'Portfolio under stress — review positions'
                ),
                cmd.portfolio_health_status
                    ? h('span', {
                        className: 'badge ' + (health >= 75 ? 'green' : health >= 50 ? 'amber' : 'red'),
                        style: { marginTop: 8, display: 'inline-block' }
                    }, cmd.portfolio_health_status)
                    : null
            )
        )
    );

    // C. Rolling Sharpe & Volatility Dual-Axis Chart
    var rollingRef = useRef(null);
    useChart(rollingRef, function() {
        if (!rolling.length) return null;
        return {
            type: 'line',
            data: {
                labels: rolling.map(function(d) { return d.date; }),
                datasets: [
                    {
                        label: 'Rolling Sharpe (90d)',
                        data: rolling.map(function(d) { return d.sharpe; }),
                        borderColor: '#00d4ff',
                        backgroundColor: 'rgba(0,212,255,0.08)',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        fill: true,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Rolling Vol (90d)',
                        data: rolling.map(function(d) { return d.vol; }),
                        borderColor: '#8b5cf6',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        borderDash: [4, 2],
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { labels: { color: 'rgba(255,255,255,0.6)', boxWidth: 12, font: { size: 11 } } }
                },
                scales: {
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 12, maxRotation: 0 },
                        grid: { display: false }
                    },
                    y: {
                        position: 'left',
                        title: { display: true, text: 'Sharpe', color: 'rgba(255,255,255,0.4)', font: { size: 10 } },
                        ticks: { color: 'rgba(255,255,255,0.6)' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y1: {
                        position: 'right',
                        title: { display: true, text: 'Volatility', color: 'rgba(255,255,255,0.4)', font: { size: 10 } },
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            callback: function(v) { return (v * 100).toFixed(0) + '%'; }
                        },
                        grid: { display: false }
                    }
                }
            }
        };
    }, [rolling]);

    var rollingCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Rolling 90-Day Sharpe & Volatility'),
        h('div', { style: { height: 260 } }, h('canvas', { ref: rollingRef }))
    );

    // D. Drawdown Periods Table
    var thStyle = { textAlign: 'left', padding: '8px 6px', color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.08)' };
    var tdStyle = { padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' };

    var ddTable = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Worst Drawdown Periods'),
        ddPeriods.length === 0
            ? h('div', { style: { color: 'rgba(255,255,255,0.4)', padding: 16, fontSize: 13 } }, 'No drawdown periods detected.')
            : h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null,
                    h('tr', null,
                        h('th', { style: thStyle }, '#'),
                        h('th', { style: thStyle }, 'Peak Date'),
                        h('th', { style: thStyle }, 'Trough Date'),
                        h('th', { style: thStyle }, 'Max DD'),
                        h('th', { style: thStyle }, 'Recovery'),
                        h('th', { style: thStyle }, 'Status')
                    )
                ),
                h('tbody', null, ddPeriods.map(function(dd, i) {
                    return h('tr', { key: i },
                        h('td', { style: tdStyle }, i + 1),
                        h('td', { style: tdStyle }, dd.startDate),
                        h('td', { style: tdStyle }, dd.troughDate),
                        h('td', { style: Object.assign({}, tdStyle, { color: '#ef4444', fontWeight: 600 }) }, (dd.dd * 100).toFixed(2) + '%'),
                        h('td', { style: tdStyle }, dd.recovered ? dd.endDate : '—'),
                        h('td', { style: tdStyle },
                            h('span', {
                                className: 'badge ' + (dd.recovered ? 'green' : 'red')
                            }, dd.recovered ? 'Recovered' : 'Active')
                        )
                    );
                }))
            )
    );

    return h('div', null, riskGrid, healthCard, rollingCard, ddTable);
}

// =============================================================
// Export 2: PositionsPanel
// =============================================================

export function PositionsPanel(p) {
    var _s = useState('total_return_pct');
    var sortKey = _s[0], setSortKey = _s[1];
    var _d = useState(true);
    var desc = _d[0], setDesc = _d[1];

    var perf = p.perfData || [];
    if (!perf.length) {
        return h('div', { className: 'card', style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 } },
            'No position data available.'
        );
    }

    var sorted = perf.slice().sort(function(a, b) {
        var av = Number(a[sortKey]) || 0, bv = Number(b[sortKey]) || 0;
        return desc ? bv - av : av - bv;
    });

    function headerClick(key) {
        if (sortKey === key) { setDesc(!desc); }
        else { setSortKey(key); setDesc(true); }
    }

    var arrow = function(key) { return sortKey === key ? (desc ? ' ▼' : ' ▲') : ''; };

    // A. Summary tiles
    var cuts = perf.filter(function(p) { return p.cut_candidate_flag; });
    var best = perf.reduce(function(b, p) { return (Number(p.total_return_pct) || 0) > (Number(b.total_return_pct) || 0) ? p : b; }, perf[0]);
    var worst = perf.reduce(function(w, p) { return (Number(p.total_return_pct) || 0) < (Number(w.total_return_pct) || 0) ? p : w; }, perf[0]);
    var avgCagr = perf.reduce(function(s, p) { return s + (Number(p.annualised_return) || 0); }, 0) / perf.length;

    var summaryGrid = h('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }
    },
        h(Tile, { label: 'Positions', value: perf.length, color: '#00d4ff' }),
        h(Tile, { label: 'Avg CAGR', value: fmtPct(avgCagr), color: retColor(avgCagr) }),
        h(Tile, { label: 'Best Performer', value: best.symbol, color: '#10b981', sub: fmtPct(best.total_return_pct) }),
        h(Tile, { label: 'Cut Candidates', value: cuts.length, color: cuts.length > 0 ? '#ef4444' : '#10b981' })
    );

    // B. Best & Worst Performers Bar Chart
    var topN = perf.slice().sort(function(a, b) { return (Number(b.total_return_pct) || 0) - (Number(a.total_return_pct) || 0); });
    var chartData = topN.slice(0, 5).concat(topN.slice(-5).reverse());
    var barRef = useRef(null);
    useChart(barRef, function() {
        if (!chartData.length) return null;
        return {
            type: 'bar',
            data: {
                labels: chartData.map(function(d) { return d.symbol; }),
                datasets: [{
                    data: chartData.map(function(d) { return (Number(d.total_return_pct) || 0) * 100; }),
                    backgroundColor: chartData.map(function(d) {
                        return (Number(d.total_return_pct) || 0) >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)';
                    }),
                    borderColor: chartData.map(function(d) {
                        return (Number(d.total_return_pct) || 0) >= 0 ? '#10b981' : '#ef4444';
                    }),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            callback: function(v) { return v.toFixed(0) + '%'; }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.8)', font: { size: 11, weight: 600 } },
                        grid: { display: false }
                    }
                }
            }
        };
    }, [perf]);

    var barCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Top 5 & Bottom 5 Performers'),
        h('div', { style: { height: 300 } }, h('canvas', { ref: barRef }))
    );

    // C. Full Position Table
    var thBase = { textAlign: 'left', padding: '8px 6px', color: 'rgba(255,255,255,0.5)', fontWeight: 500, fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
    var thR = Object.assign({}, thBase, { textAlign: 'right' });
    var tdBase = { padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 12 };
    var tdMono = Object.assign({}, tdBase, { fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' });

    var cols = [
        { key: 'symbol', label: 'Symbol', align: 'left' },
        { key: 'entry_price', label: 'Entry $', align: 'right' },
        { key: 'current_price', label: 'Current $', align: 'right' },
        { key: 'days_held', label: 'Days Held', align: 'right' },
        { key: 'total_return_pct', label: 'Return %', align: 'right' },
        { key: 'annualised_return', label: 'CAGR %', align: 'right' },
        { key: 'entry_efficiency_score', label: 'Efficiency', align: 'right' },
    ];

    var table = h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Position Performance (' + perf.length + ')'),
        h('div', { style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null,
                    h('tr', null,
                        cols.map(function(c) {
                            var style = c.align === 'right' ? thR : thBase;
                            return h('th', { key: c.key, style: style, onClick: function() { headerClick(c.key); } }, c.label + arrow(c.key));
                        }),
                        h('th', { style: thBase }, 'Status')
                    )
                ),
                h('tbody', null, sorted.map(function(row) {
                    return h('tr', { key: row.symbol },
                        h('td', { style: Object.assign({}, tdBase, { fontWeight: 600, color: '#00d4ff' }) }, row.symbol),
                        h('td', { style: tdMono }, fmtCurrency(row.entry_price)),
                        h('td', { style: tdMono }, fmtCurrency(row.current_price)),
                        h('td', { style: tdMono }, row.days_held || '—'),
                        h('td', { style: Object.assign({}, tdMono, { color: retColor(row.total_return_pct), fontWeight: 600 }) }, fmtPct(row.total_return_pct)),
                        h('td', { style: Object.assign({}, tdMono, { color: retColor(row.annualised_return) }) }, fmtPct(row.annualised_return)),
                        h('td', { style: tdMono }, fmt(row.entry_efficiency_score, 1)),
                        h('td', { style: tdBase },
                            row.cut_candidate_flag
                                ? h('span', { className: 'badge red' }, 'CUT')
                                : h('span', { className: 'badge green' }, 'HOLD')
                        )
                    );
                }))
            )
        )
    );

    return h('div', null, summaryGrid, barCard, table);
}
