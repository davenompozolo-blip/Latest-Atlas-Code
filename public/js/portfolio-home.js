// ============================================================
// ATLAS Terminal — Portfolio Home Page
// ------------------------------------------------------------
// Consumes vw_portfolio_home, vw_command_centre, vw_portfolio_nav_daily.
// Renders metrics row, positions table (with column manager),
// donut of top holdings, benchmark line, P&L contributors, sector
// P&L attribution.
// ============================================================

import { loadView, MOCK_POSITIONS, MOCK_COMMAND } from './config.js';
import {
    fmt, fmtPct, fmtCurrency, cls,
    DEFAULT_COLS, ALL_COLS, getVisibleCols,
    cellValue, cellClass, cellStyle, qualityPill
} from './utils.js';
import { Loading } from './components.js';

const { useState, useEffect, useRef, useMemo } = React;

var MOVER_COLORS = { gain: '#10b981', loss: '#ef4444', neutral: 'rgba(255,255,255,0.4)' };

function MoverRow(p) {
    var chg = Number(p.pos.daily_change_pct) || 0;
    var chgDollar = Number(p.pos.daily_change_dollar) || 0;
    var color = chg > 0 ? MOVER_COLORS.gain : chg < 0 ? MOVER_COLORS.loss : MOVER_COLORS.neutral;
    var arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '—';
    return React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }
    },
        React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, color: '#00d4ff', minWidth: 52 } }, p.pos.symbol),
        React.createElement('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.5)', flex: 1, paddingLeft: 8 } }, p.pos.asset_name || p.pos.name || ''),
        React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.6)', minWidth: 64, textAlign: 'right' } },
            p.pos.current_price ? '$' + Number(p.pos.current_price).toFixed(2) : '—'),
        React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, color: color, minWidth: 72, textAlign: 'right', fontWeight: 600 } },
            arrow + ' ' + (Math.abs(chg) * 100).toFixed(2) + '%'),
        React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: color, minWidth: 72, textAlign: 'right', opacity: 0.8 } },
            chgDollar !== 0 ? (chgDollar > 0 ? '+' : '') + fmtCurrency(chgDollar) : '')
    );
}

function TodayMovers(p) {
    var positions = p.positions;
    if (!positions || !positions.length) return null;
    var withChg = positions.filter(function(pos) { return pos.daily_change_pct != null && isFinite(Number(pos.daily_change_pct)); });
    if (!withChg.length) return null;
    withChg.sort(function(a, b) { return Number(b.daily_change_pct) - Number(a.daily_change_pct); });
    var gainers = withChg.slice(0, 4);
    var losers = withChg.slice(-4).reverse();
    var colStyle = { flex: 1, minWidth: 0 };
    var titleStyle = { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 4, fontFamily: 'DM Sans' };
    return React.createElement('div', { className: 'card', style: { marginBottom: 16 } },
        React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 } }, "TODAY'S MOVERS"),
        React.createElement('div', { style: { display: 'flex', gap: 24 } },
            React.createElement('div', { style: colStyle },
                React.createElement('div', { style: titleStyle }, '▲ Top Gainers'),
                gainers.map(function(pos) { return React.createElement(MoverRow, { key: pos.symbol, pos: pos }); })
            ),
            React.createElement('div', { style: { width: 1, background: 'rgba(255,255,255,0.06)', flexShrink: 0 } }),
            React.createElement('div', { style: colStyle },
                React.createElement('div', { style: titleStyle }, '▼ Top Losers'),
                losers.map(function(pos) { return React.createElement(MoverRow, { key: pos.symbol, pos: pos }); })
            )
        )
    );
}

export function PortfolioHome() {
    var _p = useState(null), positions = _p[0], setPositions = _p[1];
    var _c = useState(null), command = _c[0], setCommand = _c[1];
    var _l = useState(true), loading = _l[0], setLoading = _l[1];
    var _n = useState(null), navData = _n[0], setNavData = _n[1];
    var _vc = useState(getVisibleCols), visCols = _vc[0], setVisCols = _vc[1];
    var _cm = useState(false), showCols = _cm[0], setShowCols = _cm[1];
    var donutRef = useRef(null);
    var donutInst = useRef(null);
    var navPlotRef = useRef(null);
    var _nr = useState('ALL'), navRange = _nr[0], setNavRange = _nr[1];
    var pnlRef = useRef(null);
    var pnlInst = useRef(null);
    var sectorRef = useRef(null);

    useEffect(function() {
        Promise.all([
            loadView('vw_portfolio_home', MOCK_POSITIONS),
            loadView('vw_command_centre', [MOCK_COMMAND]),
            loadView('vw_portfolio_nav_daily', [])
        ]).then(function(res) {
            setPositions(res[0]);
            setCommand(res[1][0] || MOCK_COMMAND);
            setNavData(res[2]);
            setLoading(false);
        });
    }, []);

    // Column toggle handler
    function toggleCol(key) {
        setVisCols(function(prev) {
            var next = prev.indexOf(key) >= 0 ? prev.filter(function(k) { return k !== key; }) : prev.concat([key]);
            try { localStorage.setItem('atlas_cols', JSON.stringify(next)); } catch(e) {}
            return next;
        });
    }
    function resetCols() {
        setVisCols(DEFAULT_COLS);
        try { localStorage.setItem('atlas_cols', JSON.stringify(DEFAULT_COLS)); } catch(e) {}
    }

    // Donut chart
    useEffect(function() {
        if (!positions || !donutRef.current) return;
        if (donutInst.current) donutInst.current.destroy();
        var top10 = positions.slice(0, 10);
        donutInst.current = new Chart(donutRef.current, {
            type: 'doughnut',
            data: {
                labels: top10.map(function(p) { return p.symbol; }),
                datasets: [{ data: top10.map(function(p) { return Math.abs(Number(p.market_value) || 0); }),
                    backgroundColor: ['#00d4ff', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#a855f7'],
                    borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.55)', font: { size: 10, family: 'DM Sans' }, padding: 6, boxWidth: 10, usePointStyle: true } }
                }
            },
            plugins: [{ id: 'centerText', beforeDraw: function(chart) {
                var ctx = chart.ctx, w = chart.width, h = chart.height;
                ctx.save();
                ctx.font = '700 18px JetBrains Mono';
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                var totalMv = top10.reduce(function(s, p) { return s + Math.abs(Number(p.market_value) || 0); }, 0);
                ctx.fillText(fmtCurrency(totalMv), w / 2, h / 2 - 4);
                ctx.restore();
            }}]
        });
        return function() { if (donutInst.current) donutInst.current.destroy(); };
    }, [positions]);

    // Plotly NAV chart
    useEffect(function() {
        if (!navData || !navData.length || !navPlotRef.current) return;
        var sorted = navData.slice().sort(function(a, b) { return new Date(a.price_date) - new Date(b.price_date); });
        var cutoff = null;
        var now = new Date();
        if (navRange === '1W') cutoff = new Date(now - 7 * 864e5);
        else if (navRange === '1M') cutoff = new Date(now - 30 * 864e5);
        else if (navRange === '3M') cutoff = new Date(now - 90 * 864e5);
        var slice = cutoff ? sorted.filter(function(d) { return new Date(d.price_date) >= cutoff; }) : sorted;
        if (!slice.length) slice = sorted;
        var baseNav = slice[0].nav;
        var xs = slice.map(function(d) { return d.price_date; });
        var ys = slice.map(function(d) { return +((d.nav / baseNav - 1) * 100).toFixed(2); });
        var lastY = ys[ys.length - 1];
        var fillColor = lastY >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
        var lineColor = lastY >= 0 ? '#10b981' : '#ef4444';
        Plotly.react(navPlotRef.current, [{
            x: xs, y: ys,
            type: 'scatter', mode: 'lines',
            fill: 'tozeroy', fillcolor: fillColor,
            line: { color: lineColor, width: 2, shape: 'spline' },
            hovertemplate: '%{x}<br><b>%{y:.2f}%</b><extra></extra>',
            name: 'ATLAS NAV',
        }], {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 48, r: 12, t: 8, b: 32 },
            xaxis: { showgrid: false, tickfont: { color: 'rgba(255,255,255,0.3)', size: 10, family: 'JetBrains Mono' }, tickformat: '%b %d', nticks: 6 },
            yaxis: { gridcolor: 'rgba(255,255,255,0.05)', zeroline: true, zerolinecolor: 'rgba(255,255,255,0.1)', zerolinewidth: 1, tickfont: { color: 'rgba(255,255,255,0.3)', size: 10, family: 'JetBrains Mono' }, ticksuffix: '%' },
            showlegend: false,
            font: { family: 'DM Sans', color: 'rgba(255,255,255,0.5)' },
        }, { responsive: true, displayModeBar: false });
    }, [navData, navRange]);

    // P&L contributors chart
    useEffect(function() {
        if (!positions || !positions.length || !pnlRef.current) return;
        if (pnlInst.current) pnlInst.current.destroy();
        var withPnl = positions.map(function(p) {
            var pnl = p.total_gain_loss_dollar != null ? Number(p.total_gain_loss_dollar) :
                (Number(p.current_price || 0) - Number(p.cost_basis || 0)) * Number(p.quantity || 0);
            return { symbol: p.symbol, pnl: pnl };
        }).filter(function(p) { return isFinite(p.pnl); });
        withPnl.sort(function(a, b) { return b.pnl - a.pnl; });
        var top5 = withPnl.slice(0, 5);
        var bottom5 = withPnl.slice(-5).reverse();
        var chartItems = top5.concat(bottom5);
        var seen = {};
        chartItems = chartItems.filter(function(item) {
            if (seen[item.symbol]) return false;
            seen[item.symbol] = true;
            return true;
        });
        pnlInst.current = new Chart(pnlRef.current, {
            type: 'bar',
            data: {
                labels: chartItems.map(function(p) { return p.symbol; }),
                datasets: [{
                    data: chartItems.map(function(p) { return p.pnl; }),
                    backgroundColor: chartItems.map(function(p) { return p.pnl >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'; }),
                    borderWidth: 0,
                    borderRadius: 3
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: 'JetBrains Mono' }, callback: function(v) { return '$' + (v / 1000).toFixed(1) + 'k'; } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11, family: 'JetBrains Mono' } }, grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
        return function() { if (pnlInst.current) pnlInst.current.destroy(); };
    }, [positions]);

    // Sector P&L waterfall (Plotly)
    useEffect(function() {
        if (!positions || !positions.length || !sectorRef.current) return;
        var bySector = {};
        positions.forEach(function(p) {
            var sec = p.sector || 'Other';
            var pnl = p.total_gain_loss_dollar != null ? Number(p.total_gain_loss_dollar) :
                (Number(p.current_price || 0) - Number(p.cost_basis || 0)) * Number(p.quantity || 0);
            if (!isFinite(pnl)) return;
            bySector[sec] = (bySector[sec] || 0) + pnl;
        });
        var sectors = Object.keys(bySector).sort(function(a, b) { return bySector[b] - bySector[a]; });
        var sectorPnl = sectors.map(function(s) { return bySector[s]; });
        var total = sectorPnl.reduce(function(s, v) { return s + v; }, 0);
        var labels = sectors.concat(['Total']);
        var measures = sectors.map(function() { return 'relative'; }).concat(['total']);
        var values = sectorPnl.concat([total]);
        var textValues = values.map(function(v) { return (v >= 0 ? '+' : '') + '$' + (v / 1000).toFixed(1) + 'k'; });
        Plotly.react(sectorRef.current, [{
            type: 'waterfall',
            orientation: 'v',
            measure: measures,
            x: labels,
            y: values,
            text: textValues,
            textposition: 'outside',
            textfont: { color: 'rgba(255,255,255,0.7)', size: 10, family: 'JetBrains Mono' },
            connector: { line: { color: 'rgba(255,255,255,0.1)', width: 1 } },
            increasing: { marker: { color: 'rgba(16,185,129,0.75)' } },
            decreasing: { marker: { color: 'rgba(239,68,68,0.75)' } },
            totals: { marker: { color: 'rgba(0,212,255,0.75)' } },
            hovertemplate: '<b>%{x}</b><br>P&L: %{y:$,.0f}<extra></extra>',
        }], {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 48, r: 12, t: 8, b: 60 },
            xaxis: { tickfont: { color: 'rgba(255,255,255,0.5)', size: 10, family: 'DM Sans' }, tickangle: -30, showgrid: false },
            yaxis: { gridcolor: 'rgba(255,255,255,0.05)', zeroline: true, zerolinecolor: 'rgba(255,255,255,0.15)', tickfont: { color: 'rgba(255,255,255,0.3)', size: 10, family: 'JetBrains Mono' }, tickprefix: '$', tickformat: ',.0f' },
            showlegend: false,
        }, { responsive: true, displayModeBar: false });
    }, [positions]);

    if (loading) return React.createElement(Loading, null);
    var c = command || MOCK_COMMAND;
    var activeCols = ALL_COLS.filter(function(col) { return visCols.indexOf(col.key) >= 0; });

    return React.createElement('div', null,
        // Metrics Row
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(4, 1fr)' } },
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'PORTFOLIO NAV'),
                React.createElement('div', { className: 'value' }, fmtCurrency(c.portfolio_nav)),
                React.createElement('div', { className: 'sub' }, (c.position_count || positions.length) + ' positions')
            ),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'INITIAL EQUITY'),
                React.createElement('div', { className: 'value' }, fmtCurrency(c.initial_equity || 100000)),
                React.createElement('div', { className: 'sub' }, 'Cost basis: ' + fmtCurrency(c.total_invested))
            ),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'UNREALISED P&L'),
                React.createElement('div', { className: 'value ' + cls(c.unrealised_pnl) }, fmtCurrency(c.unrealised_pnl)),
                React.createElement('div', { className: 'sub ' + cls(c.unrealised_return_pct) }, fmtPct(c.unrealised_return_pct))
            ),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'CASH'),
                React.createElement('div', { className: 'value ' + cls(c.cash_balance) }, fmtCurrency(c.cash_balance)),
                React.createElement('div', { className: 'sub' },
                    c.gross_leverage != null ? 'Leverage: ' + Number(c.gross_leverage).toFixed(2) + 'x' : '\u2014')
            )
        ),
        // Content with right sidebar
        React.createElement('div', { className: 'content-with-sidebar' },
            // Left: Positions table
            React.createElement('div', { className: 'content-primary' },
                React.createElement('div', { className: 'card', style: { padding: '16px 20px' } },
                    // Title row with column manager toggle
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
                        React.createElement('div', { className: 'card-title', style: { fontSize: 16, fontFamily: 'Syne', fontWeight: 700, letterSpacing: 1, margin: 0 } }, 'POSITIONS'),
                        React.createElement('button', {
                            onClick: function() { setShowCols(!showCols); },
                            style: { background: showCols ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (showCols ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'), color: showCols ? '#00d4ff' : 'rgba(255,255,255,0.5)', borderRadius: 6, padding: '4px 12px', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: 'DM Sans' }
                        }, '\u2699 Columns')
                    ),
                    // Column manager panel
                    showCols ? React.createElement('div', { className: 'col-manager-panel' },
                        ALL_COLS.map(function(col) {
                            var isActive = visCols.indexOf(col.key) >= 0;
                            return React.createElement('button', {
                                key: col.key,
                                className: 'col-toggle' + (isActive ? ' active' : ''),
                                onClick: function() { toggleCol(col.key); }
                            }, col.label);
                        }),
                        React.createElement('button', {
                            className: 'col-toggle',
                            onClick: resetCols,
                            style: { borderColor: 'rgba(245,158,11,0.3)', color: '#f59e0b' }
                        }, '\u21BA Reset')
                    ) : null,
                    // Table
                    React.createElement('div', { style: { overflowX: 'auto' } },
                        React.createElement('table', { className: 'data-table' },
                            React.createElement('thead', null,
                                React.createElement('tr', null,
                                    activeCols.map(function(col) {
                                        return React.createElement('th', { key: col.key }, col.label);
                                    })
                                )
                            ),
                            React.createElement('tbody', null,
                                positions.map(function(p) {
                                    return React.createElement('tr', { key: p.symbol },
                                        activeCols.map(function(col) {
                                            var val = col.key === 'quality_score' ? qualityPill(p.quality_score) : cellValue(p, col.key);
                                            return React.createElement('td', {
                                                key: col.key,
                                                className: cellClass(p, col.key),
                                                style: cellStyle(col.key)
                                            }, val);
                                        })
                                    );
                                })
                            )
                        )
                    )
                )
            ),
            // Right sidebar: charts
            React.createElement('div', { className: 'content-sidebar' },
                // Top holdings donut
                React.createElement('div', { className: 'card' },
                    React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' } }, 'TOP HOLDINGS'),
                    React.createElement('div', { style: { height: 260 } },
                        React.createElement('canvas', { ref: donutRef })
                    )
                ),
                // Portfolio NAV chart (Plotly)
                React.createElement('div', { className: 'card' },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
                        React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', margin: 0 } }, 'PORTFOLIO NAV (%)'),
                        React.createElement('div', { style: { display: 'flex', gap: 4 } },
                            ['1W', '1M', '3M', 'ALL'].map(function(r) {
                                var active = navRange === r;
                                return React.createElement('button', {
                                    key: r, onClick: function() { setNavRange(r); },
                                    style: { background: active ? 'rgba(0,212,255,0.15)' : 'transparent', color: active ? '#00d4ff' : 'rgba(255,255,255,0.35)', border: '1px solid ' + (active ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.08)'), borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'JetBrains Mono' }
                                }, r);
                            })
                        )
                    ),
                    React.createElement('div', { ref: navPlotRef, style: { height: 200 } })
                )
            )
        ),
        // Today's Movers
        React.createElement(TodayMovers, { positions: positions }),
        // P&L Contributors & Detractors chart
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' } }, 'TOP P&L CONTRIBUTORS & DETRACTORS'),
            React.createElement('div', { style: { height: 320 } },
                React.createElement('canvas', { ref: pnlRef })
            )
        ),
        // Sector P&L Waterfall (Plotly)
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' } }, 'SECTOR P&L ATTRIBUTION'),
            React.createElement('div', { ref: sectorRef, style: { height: 300 } })
        )
    );
}
