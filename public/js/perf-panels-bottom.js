// ============================================================
// ATLAS Terminal — Performance Suite: Risk & Positions Panels
// ------------------------------------------------------------
// React 18 UMD, no JSX. Chart.js for visualizations.
// ============================================================

import { fmt, fmtPct, fmtCurrency, cls, healthCls, useChart, volStatus, ddStatus, sharpeStatus, calmarStatus } from './utils.js';
import { HeroCard } from './components.js';
import {
    computePortfolioMetrics, computeRollingMetrics,
    computeDrawdownPeriods, computeBrinsonAttribution, computePositionContributions
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
    var rolling = useMemo(function() { return computeRollingMetrics(p.navSeries, 60); }, [p.navSeries]);
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

    // C. Rolling Sharpe & Volatility — lightweight-charts dual line
    var rollingRef = useRef(null);
    var rollingChartRef = useRef(null);
    React.useEffect(function() {
        if (!rolling.length || !rollingRef.current) return;
        if (rollingChartRef.current) { rollingChartRef.current.remove(); rollingChartRef.current = null; }
        var chart = LightweightCharts.createChart(rollingRef.current, {
            width: rollingRef.current.clientWidth || 700, height: 260,
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono', fontSize: 10 },
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
            leftPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
            rightPriceScale: { visible: true, borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
            timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
            crosshair: { vertLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 3 }, horzLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 3 } },
            handleScroll: false, handleScale: false,
        });
        rollingChartRef.current = chart;
        var sharpeSeries = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#00d4ff', lineWidth: 2, priceScaleId: 'left',
            priceFormat: { type: 'custom', formatter: function(v) { return v.toFixed(2); } },
        });
        var volSeries = chart.addSeries(LightweightCharts.LineSeries, {
            color: '#8b5cf6', lineWidth: 1.5, lineStyle: 1, priceScaleId: 'right',
            priceFormat: { type: 'custom', formatter: function(v) { return (v * 100).toFixed(1) + '%'; } },
        });
        sharpeSeries.setData(rolling.map(function(d) { return { time: d.date, value: d.sharpe }; }));
        volSeries.setData(rolling.map(function(d) { return { time: d.date, value: d.vol }; }));
        chart.timeScale().fitContent();
        return function() { if (rollingChartRef.current) { rollingChartRef.current.remove(); rollingChartRef.current = null; } };
    }, [rolling]);

    var rollingCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
            h('div', { className: 'card-title', style: { margin: 0 } }, 'ROLLING 60-DAY SHARPE & VOLATILITY'),
            h('div', { style: { display: 'flex', gap: 14, alignItems: 'center' } },
                h('span', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#00d4ff', fontFamily: 'JetBrains Mono' } },
                    h('span', { style: { width: 16, height: 2, background: '#00d4ff', display: 'inline-block' } }), 'Sharpe (L)'),
                h('span', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#8b5cf6', fontFamily: 'JetBrains Mono' } },
                    h('span', { style: { width: 16, height: 2, background: '#8b5cf6', display: 'inline-block', opacity: 0.7 } }), 'Volatility (R)')
            )
        ),
        rolling.length ? h('div', { ref: rollingRef, style: { height: 260 } }) :
            h('div', { style: { height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 } }, 'Insufficient history for rolling metrics (need 30+ data points)')
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
// Export 2: PositionsPanel — Brinson Attribution Dashboard
// =============================================================

export function PositionsPanel(p) {
    var _sv = React.useState('total');
    var activeView = _sv[0], setActiveView = _sv[1];
    var _s = React.useState('total_return_pct');
    var sortKey = _s[0], setSortKey = _s[1];
    var _d = React.useState(true);
    var desc = _d[0], setDesc = _d[1];

    var perf    = p.perfData || [];
    var brinson = useMemo(function() { return computeBrinsonAttribution(perf); }, [perf]);
    var contribs = useMemo(function() { return computePositionContributions(perf); }, [perf]);

    if (!perf.length) {
        return h('div', { className: 'card', style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 } }, 'No position data available.');
    }

    var VIEWS = [
        { id: 'total',   label: 'ATTRIBUTION OVERVIEW' },
        { id: 'brinson', label: 'BRINSON ANALYSIS' },
        { id: 'table',   label: 'POSITION TABLE' },
    ];

    var viewBar = h('div', { style: { display: 'flex', gap: 4, marginBottom: 16 } },
        VIEWS.map(function(v) {
            var a = activeView === v.id;
            return h('button', { key: v.id, onClick: function() { setActiveView(v.id); }, style: {
                padding: '5px 14px', border: '1px solid ' + (a ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.07)'),
                borderRadius: 4, background: a ? 'rgba(0,212,255,0.1)' : 'transparent',
                color: a ? '#00d4ff' : 'rgba(255,255,255,0.38)', fontSize: 10, fontWeight: 700,
                fontFamily: 'JetBrains Mono', letterSpacing: 0.8, cursor: 'pointer',
            }}, v.label);
        })
    );

    // ---- ATTRIBUTION OVERVIEW ----------------------------------
    function retC(v) { return v == null ? 'rgba(255,255,255,0.4)' : v >= 0 ? '#10b981' : '#ef4444'; }
    function pctStr(v, decimals) { if (v == null) return '—'; return (v >= 0 ? '+' : '') + (v * 100).toFixed(decimals != null ? decimals : 2) + '%'; }

    var cuts = perf.filter(function(p) { return p.cut_candidate_flag; });
    var best = perf.reduce(function(b, q) { return (Number(q.total_return_pct)||0) > (Number(b.total_return_pct)||0) ? q : b; }, perf[0]);
    var worst = perf.reduce(function(w, q) { return (Number(q.total_return_pct)||0) < (Number(w.total_return_pct)||0) ? q : w; }, perf[0]);
    var avgCagr = perf.reduce(function(s, q) { return s + (Number(q.annualised_return)||0); }, 0) / perf.length;
    var maxAbsC = Math.max.apply(null, contribs.map(function(c) { return Math.abs(c.contribution); }).concat([0.001]));

    function mkContribRow(c, i) {
        var bw  = Math.min(Math.abs(c.contribution) / maxAbsC, 1) * 100;
        var col = c.contribution >= 0 ? '#10b981' : '#ef4444';
        return h('div', { key: c.symbol + i, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: '#00d4ff', minWidth: 52 } }, c.symbol),
            h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.38)', minWidth: 40, textAlign: 'right', fontFamily: 'JetBrains Mono' } }, (c.weight * 100).toFixed(1) + '%'),
            h('div', { style: { flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' } },
                h('div', { style: { width: bw + '%', height: '100%', background: c.contribution >= 0 ? 'rgba(16,185,129,0.55)' : 'rgba(239,68,68,0.55)', borderRadius: 2 } })
            ),
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(255,255,255,0.45)', minWidth: 56, textAlign: 'right' } }, pctStr(c.ret, 1)),
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: col, minWidth: 64, textAlign: 'right' } }, pctStr(c.contribution))
        );
    }

    var overviewView = h('div', null,
        // Summary HeroCards
        h('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 } },
            h(Tile, { icon: '◈', label: 'Positions', value: String(perf.length), color: '#00d4ff', accent: 'cyan', badge: 'In Portfolio' }),
            h(Tile, { icon: '◆', label: 'Avg CAGR', value: fmtPct(avgCagr), color: retC(avgCagr), accent: avgCagr >= 0 ? 'green' : 'red' }),
            h(Tile, { icon: '▲', label: 'Best Performer', value: best.symbol, color: '#10b981', accent: 'green', sub: fmtPct(best.total_return_pct) }),
            h(Tile, { icon: '✂', label: 'Cut Candidates', value: String(cuts.length), color: cuts.length > 0 ? '#ef4444' : '#10b981', accent: cuts.length > 0 ? 'red' : 'green', badge: cuts.length > 0 ? 'Review' : 'All Clear' })
        ),
        // Contribution split: top contributors vs top detractors
        h('div', { className: 'card', style: { marginBottom: 16 } },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
                h('div', { className: 'card-title', style: { margin: 0 } }, 'POSITION RETURN ATTRIBUTION'),
                h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'DM Sans' } }, 'Weight% · Bar = contribution · Pos Return · Contribution to portfolio')
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' } },
                h('div', null,
                    h('div', { style: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(16,185,129,0.7)', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'DM Sans' } }, '▲ Top Contributors'),
                    contribs.slice(0, 8).map(mkContribRow)
                ),
                h('div', null,
                    h('div', { style: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(239,68,68,0.7)', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'DM Sans' } }, '▼ Top Detractors'),
                    contribs.slice(-6).reverse().map(function(c, i) { return mkContribRow(c, i + 50); })
                )
            )
        )
    );

    // ---- BRINSON ANALYSIS -------------------------------------
    var brinsonView = h('div', null,
        brinson ? h('div', null,
            // Active return decomposition — 3 hero numbers
            h('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 } },
                h(Tile, { icon: '◆', label: 'Allocation Effect', value: pctStr(brinson.totals.allocation), color: retC(brinson.totals.allocation), accent: brinson.totals.allocation >= 0 ? 'green' : 'red',
                    sub: 'Sector weighting vs benchmark', badge: brinson.totals.allocation >= 0 ? 'Positive' : 'Negative' }),
                h(Tile, { icon: '✦', label: 'Selection Effect', value: pctStr(brinson.totals.selection), color: retC(brinson.totals.selection), accent: brinson.totals.selection >= 0 ? 'green' : 'red',
                    sub: 'Stock picks within sectors', badge: brinson.totals.selection >= 0 ? 'Positive' : 'Negative' }),
                h(Tile, { icon: '≋', label: 'Interaction Effect', value: pctStr(brinson.totals.interaction), color: retC(brinson.totals.interaction), accent: 'violet',
                    sub: 'Allocation × selection combined' })
            ),
            // Brinson sector table
            h('div', { className: 'card' },
                h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
                    h('div', { className: 'card-title', style: { margin: 0 } }, 'BRINSON-FACHLER ATTRIBUTION BY SECTOR'),
                    h('div', { style: { display: 'flex', gap: 16 } },
                        h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono' } }, 'Portfolio return: ' + pctStr(brinson.portfolioReturn)),
                        h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono' } }, 'Benchmark: ' + pctStr(brinson.benchmarkReturn)),
                        h('span', { style: { fontSize: 10, fontWeight: 700, color: retC(brinson.activeReturn), fontFamily: 'JetBrains Mono' } }, 'Active: ' + pctStr(brinson.activeReturn))
                    )
                ),
                h('div', { style: { overflowX: 'auto' } },
                    h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 680 } },
                        h('thead', null,
                            h('tr', null,
                                ['Sector', 'Pos', 'Port Wt', 'Bench Wt', 'Active Wt', 'Port Ret', 'Bench Ret', 'Allocation', 'Selection', 'Total'].map(function(col) {
                                    return h('th', { key: col, style: { position: 'sticky', top: 0, background: '#0b0f1a', padding: '8px 8px', fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid rgba(255,255,255,0.07)', textAlign: col === 'Sector' || col === 'Pos' ? 'left' : 'right', fontFamily: 'DM Sans', whiteSpace: 'nowrap' } }, col);
                                })
                            )
                        ),
                        h('tbody', null,
                            brinson.sectors.map(function(s) {
                                return h('tr', { key: s.sector,
                                    onMouseEnter: function(e) { e.currentTarget.style.background = 'rgba(0,212,255,0.03)'; },
                                    onMouseLeave: function(e) { e.currentTarget.style.background = 'transparent'; }
                                },
                                    h('td', { style: { padding: '8px 8px', fontWeight: 600, color: '#00d4ff', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.04)' } }, s.sector),
                                    h('td', { style: { padding: '8px 8px', textAlign: 'left', fontSize: 10, color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'JetBrains Mono' } }, s.positionCount),
                                    h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.75)', borderBottom: '1px solid rgba(255,255,255,0.04)' } }, (s.portfolioWeight * 100).toFixed(1) + '%'),
                                    h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.45)', borderBottom: '1px solid rgba(255,255,255,0.04)' } }, (s.benchmarkWeight * 100).toFixed(1) + '%'),
                                    h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600, color: retC(s.activeWeight), borderBottom: '1px solid rgba(255,255,255,0.04)' } }, (s.activeWeight >= 0 ? '+' : '') + (s.activeWeight * 100).toFixed(1) + '%'),
                                    h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: retC(s.portfolioReturn), borderBottom: '1px solid rgba(255,255,255,0.04)' } }, pctStr(s.portfolioReturn, 1)),
                                    h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.04)' } }, pctStr(s.benchmarkReturn, 1)),
                                    h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600, color: retC(s.allocationEffect), borderBottom: '1px solid rgba(255,255,255,0.04)' } }, pctStr(s.allocationEffect)),
                                    h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600, color: retC(s.selectionEffect), borderBottom: '1px solid rgba(255,255,255,0.04)' } }, pctStr(s.selectionEffect)),
                                    h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: retC(s.totalEffect), borderBottom: '1px solid rgba(255,255,255,0.04)' } }, pctStr(s.totalEffect))
                                );
                            }),
                            // Totals row
                            h('tr', { style: { background: 'rgba(0,212,255,0.04)' } },
                                h('td', { style: { padding: '8px 8px', fontWeight: 700, color: '#00d4ff', fontSize: 11, borderTop: '1px solid rgba(0,212,255,0.15)' } }, 'TOTAL'),
                                h('td', { style: { padding: '8px 8px', borderTop: '1px solid rgba(0,212,255,0.15)' } }, perf.length),
                                h('td', { colSpan: 3, style: { borderTop: '1px solid rgba(0,212,255,0.15)' } }),
                                h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: retC(brinson.portfolioReturn), borderTop: '1px solid rgba(0,212,255,0.15)' } }, pctStr(brinson.portfolioReturn, 1)),
                                h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.5)', borderTop: '1px solid rgba(0,212,255,0.15)' } }, pctStr(brinson.benchmarkReturn, 1)),
                                h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: retC(brinson.totals.allocation), borderTop: '1px solid rgba(0,212,255,0.15)' } }, pctStr(brinson.totals.allocation)),
                                h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: retC(brinson.totals.selection), borderTop: '1px solid rgba(0,212,255,0.15)' } }, pctStr(brinson.totals.selection)),
                                h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: retC(brinson.totals.total), borderTop: '1px solid rgba(0,212,255,0.15)' } }, pctStr(brinson.totals.total))
                            )
                        )
                    )
                )
            )
        ) : h('div', { className: 'card', style: { textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: 32 } }, 'Insufficient sector data for Brinson attribution.')
    );

    // ---- POSITION TABLE ----------------------------------------
    var sorted = perf.slice().sort(function(a, b) {
        var av = Number(a[sortKey]) || 0, bv = Number(b[sortKey]) || 0;
        return desc ? bv - av : av - bv;
    });

    function headerClick(key) {
        if (sortKey === key) { setDesc(!desc); } else { setSortKey(key); setDesc(true); }
    }
    var arw = function(key) { return sortKey === key ? (desc ? ' ↓' : ' ↑') : ''; };

    var COLS = [
        { key: 'symbol',              label: 'Symbol',    align: 'left' },
        { key: 'entry_price',         label: 'Entry $',   align: 'right' },
        { key: 'current_price',       label: 'Current $', align: 'right' },
        { key: 'days_held',           label: 'Days',      align: 'right' },
        { key: 'total_return_pct',    label: 'Return %',  align: 'right' },
        { key: 'annualised_return',   label: 'CAGR %',    align: 'right' },
        { key: 'entry_efficiency_score', label: 'Efficiency', align: 'right' },
    ];

    var thS = { position: 'sticky', top: 0, background: '#0b0f1a', padding: '8px 8px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', fontFamily: 'DM Sans' };

    var tableView = h('div', null,
        h('div', { className: 'card' },
            h('div', { className: 'card-title', style: { marginBottom: 12 } }, 'POSITION PERFORMANCE (' + perf.length + ')'),
            h('div', { style: { overflowX: 'auto', overflowY: 'auto', maxHeight: 480, borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' } },
                h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 620 } },
                    h('thead', null,
                        h('tr', null,
                            COLS.map(function(c) {
                                return h('th', { key: c.key, style: Object.assign({}, thS, { textAlign: c.align }), onClick: function() { headerClick(c.key); } }, c.label + arw(c.key));
                            }),
                            h('th', { style: Object.assign({}, thS, { cursor: 'default' }) }, 'Status')
                        )
                    ),
                    h('tbody', null, sorted.map(function(row) {
                        return h('tr', { key: row.symbol,
                            onMouseEnter: function(e) { e.currentTarget.style.background = 'rgba(0,212,255,0.03)'; },
                            onMouseLeave: function(e) { e.currentTarget.style.background = 'transparent'; }
                        },
                            h('td', { style: { padding: '8px 8px', fontWeight: 700, color: '#00d4ff', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)' } }, row.symbol),
                            h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.65)', borderBottom: '1px solid rgba(255,255,255,0.04)' } }, fmtCurrency(row.entry_price)),
                            h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.75)', borderBottom: '1px solid rgba(255,255,255,0.04)' } }, fmtCurrency(row.current_price)),
                            h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.04)' } }, row.days_held || '—'),
                            h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: retC(row.total_return_pct), borderBottom: '1px solid rgba(255,255,255,0.04)' } }, fmtPct(row.total_return_pct)),
                            h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: retC(row.annualised_return), borderBottom: '1px solid rgba(255,255,255,0.04)' } }, fmtPct(row.annualised_return)),
                            h('td', { style: { padding: '8px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.65)', borderBottom: '1px solid rgba(255,255,255,0.04)' } }, fmt(row.entry_efficiency_score, 1)),
                            h('td', { style: { padding: '8px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
                                row.cut_candidate_flag
                                    ? h('span', { className: 'badge red' }, 'CUT')
                                    : h('span', { className: 'badge green' }, 'HOLD')
                            )
                        );
                    }))
                )
            )
        )
    );

    var panelContent = activeView === 'brinson' ? brinsonView : activeView === 'table' ? tableView : overviewView;
    return h('div', null, viewBar, panelContent);
}
