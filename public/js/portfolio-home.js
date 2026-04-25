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

const { useState, useEffect, useRef } = React;

// ---- Earnings Calendar card ----------------------------------------

function EarningsCalendar({ data }) {
    if (!data || !data.length) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' } }, 'UPCOMING EARNINGS'),
            React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '24px 0' } },
                'No earnings data cached. Earnings dates populate as tickers are looked up in Equity Research.')
        );
    }

    // Show all — those with dates first (already ordered by SQL)
    var rows = data.slice(0, 20);

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' } }, 'EARNINGS CALENDAR'),
        React.createElement('table', { className: 'data-table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    ['Ticker', 'Name', 'Wt%', 'Earnings Date', 'Days', 'Ex-Div', 'Target'].map(function(h) {
                        return React.createElement('th', { key: h }, h);
                    })
                )
            ),
            React.createElement('tbody', null,
                rows.map(function(r) {
                    var days = r.days_to_earnings;
                    var daysColor = days == null ? 'var(--text-muted)'
                        : days <= 7 ? '#ef4444'
                        : days <= 30 ? '#f59e0b' : 'var(--text)';
                    var daysText = days == null ? '—' : days <= 0 ? 'Today / Past' : days + 'd';

                    var target = r.analyst_target ? '$' + Number(r.analyst_target).toFixed(2) : '—';

                    return React.createElement('tr', { key: r.symbol },
                        React.createElement('td', { style: { fontWeight: 600, color: '#00d4ff' } }, r.symbol),
                        React.createElement('td', { style: { color: 'rgba(255,255,255,0.6)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif' } },
                            r.name || '—'),
                        React.createElement('td', null, r.weight_pct != null ? (r.weight_pct * 100).toFixed(1) + '%' : '—'),
                        React.createElement('td', null, r.earnings_date || '—'),
                        React.createElement('td', { style: { color: daysColor, fontWeight: days != null && days <= 30 ? 600 : 400 } }, daysText),
                        React.createElement('td', { style: { color: 'var(--text-sec)' } }, r.ex_div_date || '—'),
                        React.createElement('td', { style: { color: 'var(--text-sec)' } }, target)
                    );
                })
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
    var _ec = useState(null), earningsData = _ec[0], setEarningsData = _ec[1];
    var donutRef = useRef(null);
    var donutInst = useRef(null);
    var benchRef = useRef(null);
    var benchInst = useRef(null);
    var pnlRef = useRef(null);
    var pnlInst = useRef(null);
    var sectorRef = useRef(null);
    var sectorInst = useRef(null);

    useEffect(function() {
        Promise.all([
            loadView('vw_portfolio_home', MOCK_POSITIONS),
            loadView('vw_command_centre', [MOCK_COMMAND]),
            loadView('vw_portfolio_nav_daily', []),
            loadView('vw_earnings_calendar', []),
        ]).then(function(res) {
            setPositions(res[0]);
            setCommand(res[1][0] || MOCK_COMMAND);
            setNavData(res[2]);
            setEarningsData(res[3]);
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

    // Benchmark line chart
    useEffect(function() {
        if (!navData || !navData.length || !benchRef.current) return;
        if (benchInst.current) benchInst.current.destroy();
        var sorted = navData.slice().sort(function(a, b) { return new Date(a.price_date) - new Date(b.price_date); });
        var baseNav = sorted[0].nav;
        benchInst.current = new Chart(benchRef.current, {
            type: 'line',
            data: {
                labels: sorted.map(function(d) { return ''; }),
                datasets: [{
                    label: 'ATLAS',
                    data: sorted.map(function(d) { return ((d.nav / baseNav) - 1) * 100; }),
                    borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.05)', borderWidth: 2, pointRadius: 0, fill: true, tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { display: false },
                    y: { display: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: 'JetBrains Mono' }, callback: function(v) { return v.toFixed(0) + '%'; } } }
                },
                plugins: { legend: { display: true, labels: { color: 'rgba(255,255,255,0.5)', font: { size: 10 }, boxWidth: 10, usePointStyle: true } } }
            }
        });
        return function() { if (benchInst.current) benchInst.current.destroy(); };
    }, [navData]);

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

    // Sector P&L waterfall chart
    useEffect(function() {
        if (!positions || !positions.length || !sectorRef.current) return;
        if (sectorInst.current) sectorInst.current.destroy();
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
        var sectorColors = sectors.map(function(s) { return bySector[s] >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'; });
        sectorInst.current = new Chart(sectorRef.current, {
            type: 'bar',
            data: {
                labels: sectors,
                datasets: [{
                    data: sectorPnl,
                    backgroundColor: sectorColors,
                    borderWidth: 0,
                    borderRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10, family: 'DM Sans' }, maxRotation: 45 }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: 'JetBrains Mono' }, callback: function(v) { return '$' + (v / 1000).toFixed(1) + 'k'; } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                },
                plugins: { legend: { display: false } }
            }
        });
        return function() { if (sectorInst.current) sectorInst.current.destroy(); };
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
                // Portfolio vs Benchmark chart
                React.createElement('div', { className: 'card' },
                    React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' } }, 'PORTFOLIO VS BENCHMARK (%)'),
                    React.createElement('div', { style: { height: 200 } },
                        React.createElement('canvas', { ref: benchRef })
                    )
                )
            )
        ),
        // P&L Contributors & Detractors chart
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' } }, 'TOP P&L CONTRIBUTORS & DETRACTORS'),
            React.createElement('div', { style: { height: 320 } },
                React.createElement('canvas', { ref: pnlRef })
            )
        ),
        // Sector P&L Waterfall
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' } }, 'SECTOR P&L ATTRIBUTION'),
            React.createElement('div', { style: { height: 280 } },
                React.createElement('canvas', { ref: sectorRef })
            )
        ),
        // Earnings Calendar
        React.createElement(EarningsCalendar, { data: earningsData })
    );
}
