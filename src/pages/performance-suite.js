import React from 'react';
// ============================================================
// ATLAS Terminal — Performance Suite (Main Wrapper)
// ------------------------------------------------------------
// Owns the KPI pulse bar, tab bar, and panel routing.
// Sub-panels: Overview · Returns · Risk · Positions
// ============================================================

import { sb, loadView, MOCK_COMMAND } from './config.js';
import { fmtPct, fmt, fmtCurrency } from './utils.js';
import { Loading, EmptyState } from './components.js';
import { computePortfolioMetrics, computePeriodReturns } from './perf-engine.js';
import { OverviewPanel, ReturnsPanel } from './perf-panels-top.js';
import { RiskPanel, PositionsPanel } from './perf-panels-bottom.js';
import { RollingAttributionPanel, FactorEnginePanel, RegimeSlicerPanel } from './perf-panels-analytics.js';
import { AdvancedChart } from './advanced-chart.js';

var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo;
var h = React.createElement;

var SUB_TABS = [
    { id: 'overview',     label: 'OVERVIEW',     sub: 'Metrics & Curve' },
    { id: 'returns',      label: 'RETURNS',       sub: 'Period Analysis' },
    { id: 'risk',         label: 'RISK',          sub: 'Drawdown & VaR' },
    { id: 'positions',    label: 'POSITIONS',     sub: 'Attribution' },
    { id: 'rolling',      label: 'CONTRIBUTION',  sub: 'Rolling P&L · NEW', isNew: true },
    { id: 'factors',      label: 'FACTOR ENGINE', sub: 'Return Decomp · NEW', isNew: true },
    { id: 'regime',       label: 'REGIME SLICER', sub: 'Macro Windows · NEW', isNew: true },
    { id: 'charts',       label: 'CHARTS',        sub: 'Advanced Analysis' },
];

export function PerformanceSuite() {
    var _t = useState('overview');
    var activeTab = _t[0], setActiveTab = _t[1];
    var _n = useState(null);
    var navSeries = _n[0], setNavSeries = _n[1];
    var _p = useState(null);
    var perfData = _p[0], setPerfData = _p[1];
    var _c = useState(null);
    var cmdData = _c[0], setCmdData = _c[1];
    var _h = useState(null);
    var homeData = _h[0], setHomeData = _h[1];
    var _tx = useState([]);
    var txData = _tx[0], setTxData = _tx[1];
    var _l = useState(true);
    var loading = _l[0], setLoading = _l[1];
    var _hist = useState({});
    var histBySymbol = _hist[0], setHistBySymbol = _hist[1];
    var _hr = useState(false);
    var histReady = _hr[0], setHistReady = _hr[1];

    useEffect(function() {
        function load() {
            Promise.all([
                loadView('vw_portfolio_nav_daily', []),
                loadView('vw_performance_suite', []),
                loadView('vw_command_centre', [MOCK_COMMAND]),
                loadView('vw_portfolio_home', []),
                loadView('vw_transactions', []),
            ]).then(function(res) {
                var nav = res[0];
                if (Array.isArray(nav) && nav.length) {
                    nav = nav.slice().sort(function(a, b) {
                        return new Date(a.price_date) - new Date(b.price_date);
                    });
                }
                setNavSeries(nav);
                setPerfData(res[1]);
                var cmd = Array.isArray(res[2]) ? res[2][0] : res[2];
                setCmdData(cmd || MOCK_COMMAND);
                var home = res[3] || [];
                setHomeData(home);
                setTxData(res[4] || []);
                setLoading(false);

                // ── Price history batch fetch for analytics tabs ─────────────
                if (!sb || !home.length) { setHistReady(true); return; }
                var portfolioSymbols = home
                    .filter(function(r) { return r.symbol; })
                    .map(function(r) { return r.symbol; });
                var equitySymbols = home
                    .filter(function(r) {
                        var ac = (r.asset_class || '').toLowerCase();
                        return r.symbol && !ac.includes('option');
                    })
                    .map(function(r) { return r.symbol; });

                sb.from('assets').select('id, symbol, asset_class')
                    .in('symbol', portfolioSymbols.length ? portfolioSymbols : ['__none__'])
                    .then(function(assetResult) {
                        var assetRows = assetResult.data || [];
                        var assetBySymbol = {};
                        assetRows.forEach(function(a) { assetBySymbol[a.symbol] = a; });

                        var equityIds = equitySymbols
                            .map(function(sym) { return assetBySymbol[sym] && assetBySymbol[sym].id; })
                            .filter(function(id) { return id != null; });

                        var cutoffDate = new Date();
                        cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
                        var cutoff = cutoffDate.toISOString().slice(0, 10);

                        var BATCH = 15;
                        var batches = [];
                        for (var bi = 0; bi < equityIds.length; bi += BATCH) {
                            batches.push(equityIds.slice(bi, bi + BATCH));
                        }
                        if (!batches.length) { setHistReady(true); return; }

                        Promise.all(batches.map(function(batchIds) {
                            return sb.from('price_history')
                                .select('asset_id, price_date, close')
                                .in('asset_id', batchIds)
                                .gte('price_date', cutoff)
                                .order('price_date', { ascending: true })
                                .limit(batchIds.length * 260)
                                .then(function(ph) { return ph.data || []; });
                        })).then(function(results) {
                            var allRows = results.reduce(function(acc, rows) { return acc.concat(rows); }, []);
                            var byAsset = {};
                            allRows.forEach(function(row) {
                                if (!byAsset[row.asset_id]) byAsset[row.asset_id] = [];
                                // Store both close and date for time-series analytics
                                byAsset[row.asset_id].push({ close: parseFloat(row.close), date: row.price_date });
                            });
                            var bySymbol = {};
                            equitySymbols.forEach(function(sym) {
                                var asset = assetBySymbol[sym];
                                if (asset && byAsset[asset.id]) bySymbol[sym] = byAsset[asset.id];
                            });
                            setHistBySymbol(bySymbol);
                            setHistReady(true);
                        }).catch(function() { setHistReady(true); });
                    }).catch(function() { setHistReady(true); });
            });
        }
        load();
        window.addEventListener('atlas:refresh', load);
        return function() { window.removeEventListener('atlas:refresh', load); };
    }, []);

    var metrics = useMemo(function() {
        return navSeries && navSeries.length > 1 ? computePortfolioMetrics(navSeries) : null;
    }, [navSeries]);

    var periods = useMemo(function() {
        return navSeries && navSeries.length > 1 ? computePeriodReturns(navSeries) : null;
    }, [navSeries]);

    if (loading) return h(Loading, null);

    var hasNav  = navSeries && navSeries.length > 1;
    var hasPerf = perfData  && perfData.length  > 0;

    if (!hasNav && !hasPerf) return h(EmptyState, null);

    var cmd = cmdData || MOCK_COMMAND;
    var m   = metrics;

    var sharpe   = cmd.sharpe_ratio  != null ? cmd.sharpe_ratio  : (m ? m.sharpe   : null);
    var maxDD    = cmd.drawdown_pct  != null ? cmd.drawdown_pct  : (m ? m.maxDD    : null);
    var totalRet = m ? m.totalReturn : null;
    var annRet   = m ? m.annReturn   : null;
    var annVol   = m ? m.annVol      : null;
    var winRate  = m ? m.winRate     : null;
    var ytd      = periods ? periods.ytd : null;

    // Account Equity = latest equity value from portfolio_equity_curve (via navSeries)
    // Mirror Portfolio Home priority: account_snapshots.equity (via vw_command_centre) first,
    // fall back to nightly NAV history only if the live snapshot is absent.
    var navHistoryEquity = hasNav ? navSeries[navSeries.length - 1].nav : null;
    var accountEquity = (cmd.portfolio_nav != null && cmd.portfolio_nav > 0)
        ? cmd.portfolio_nav
        : navHistoryEquity;
    // Portfolio Value = sum of long position market values (from homeData)
    var portfolioValue = homeData && homeData.length
        ? homeData.reduce(function(s, r) { return s + (r.market_value != null ? Number(r.market_value) : 0); }, 0)
        : null;
    // Cash & Margin = difference (positive = net cash, negative = margin leverage)
    var cashMargin = accountEquity != null && portfolioValue != null ? accountEquity - portfolioValue : null;

    // ---- Colour helpers ----------------------------------------
    function rc(v)   { return v == null ? 'rgba(255,255,255,0.5)' : v >= 0 ? '#10b981' : '#ef4444'; }
    function ddC(v)  { return v == null ? 'rgba(255,255,255,0.5)' : v < -0.10 ? '#ef4444' : v < -0.03 ? '#f59e0b' : '#10b981'; }
    function volC(v) { return v == null ? 'rgba(255,255,255,0.5)' : v > 0.30 ? '#ef4444' : v > 0.18 ? '#f59e0b' : '#10b981'; }
    function shC(v)  { return v == null ? 'rgba(255,255,255,0.5)' : v > 1.5 ? '#10b981' : v > 0.5 ? '#f59e0b' : '#ef4444'; }

    function pct(v, decimals) {
        if (v == null || !isFinite(v)) return '—';
        return (v >= 0 ? '+' : '') + (v * 100).toFixed(decimals != null ? decimals : 2) + '%';
    }
    function money(v) {
        if (v == null || !isFinite(v)) return '—';
        return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    // Status label
    var statusLabel, statusBg, statusBorder, statusColor;
    if (totalRet != null && totalRet >= 0.15) {
        statusLabel = '● OUTPERFORMING'; statusBg = 'rgba(16,185,129,0.1)'; statusBorder = 'rgba(16,185,129,0.28)'; statusColor = '#10b981';
    } else if (totalRet != null && totalRet >= 0) {
        statusLabel = '○ POSITIVE'; statusBg = 'rgba(245,158,11,0.1)'; statusBorder = 'rgba(245,158,11,0.28)'; statusColor = '#f59e0b';
    } else {
        statusLabel = '▽ NEGATIVE'; statusBg = 'rgba(239,68,68,0.1)'; statusBorder = 'rgba(239,68,68,0.28)'; statusColor = '#ef4444';
    }

    var hl  = { fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontFamily: 'Figtree' };
    var hb  = { display: 'flex', flexDirection: 'column', justifyContent: 'center' };
    var div = { width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 20px', flexShrink: 0 };

    // ---- KPI Pulse Bar ----------------------------------------
    var kpiBar = h('div', {
        style: {
            background: 'linear-gradient(135deg,rgba(99,102,241,0.05),rgba(0,212,255,0.04))',
            border: '1px solid rgba(99,102,241,0.15)',
            borderTop: '3px solid #6366f1',
            borderRadius: 10, padding: '14px 22px', marginBottom: 16,
            display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 12,
        }
    },
        h('div', { style: hb },
            h('div', { style: hl }, 'Account Equity'),
            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 700, color: '#00d4ff' } }, money(accountEquity)),
            h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'JetBrains Mono' } }, 'Cash + positions − margin')
        ),
        h('div', { style: div }),
        h('div', { style: hb },
            h('div', { style: hl }, 'Portfolio Value'),
            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.85)' } }, money(portfolioValue)),
            h('div', { style: { fontSize: 10, color: cashMargin != null ? (cashMargin >= 0 ? '#10b981' : '#ef4444') : 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'JetBrains Mono' } },
                cashMargin != null ? (cashMargin >= 0 ? '+' : '') + money(cashMargin) + ' cash/margin' : 'Long positions MV')
        ),
        h('div', { style: div }),
        h('div', { style: hb },
            h('div', { style: hl }, 'Total Return'),
            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 700, color: rc(totalRet) } }, pct(totalRet)),
            h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'JetBrains Mono' } }, 'Since inception')
        ),
        h('div', { style: div }),
        h('div', { style: hb },
            h('div', { style: hl }, 'YTD Return'),
            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: rc(ytd) } }, pct(ytd)),
            h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'JetBrains Mono' } }, new Date().getFullYear() + ' year-to-date')
        ),
        h('div', { style: div }),
        h('div', { style: hb },
            h('div', { style: hl }, 'Ann. Return'),
            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: rc(annRet) } }, pct(annRet, 1)),
            h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'JetBrains Mono' } }, 'CAGR p.a.')
        ),
        h('div', { style: div }),
        h('div', { style: hb },
            h('div', { style: hl }, 'Sharpe Ratio'),
            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: shC(sharpe) } }, sharpe != null ? sharpe.toFixed(2) : '—'),
            h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'JetBrains Mono' } },
                sharpe != null && sharpe > 1.5 ? 'Excellent risk-adj.' : sharpe != null && sharpe > 0.5 ? 'Good risk-adj.' : 'Monitor')
        ),
        h('div', { style: div }),
        h('div', { style: hb },
            h('div', { style: hl }, 'Max Drawdown'),
            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: ddC(maxDD) } }, maxDD != null ? (maxDD * 100).toFixed(2) + '%' : '—'),
            h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'JetBrains Mono' } }, 'Peak-to-trough')
        ),
        h('div', { style: div }),
        h('div', { style: hb },
            h('div', { style: hl }, 'Ann. Volatility'),
            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: volC(annVol) } }, pct(annVol, 1)),
            h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'JetBrains Mono' } },
                annVol != null && annVol > 0.25 ? 'High vol' : annVol != null && annVol > 0.15 ? 'Moderate vol' : 'Low vol')
        ),
        h('div', { style: div }),
        h('div', { style: hb },
            h('div', { style: hl }, 'Day Win Rate'),
            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: winRate != null && winRate > 0.55 ? '#10b981' : 'rgba(255,255,255,0.75)' } },
                winRate != null ? (winRate * 100).toFixed(1) + '%' : '—'),
            h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'JetBrains Mono' } }, 'Positive days')
        ),
        h('div', { style: { marginLeft: 'auto' } },
            h('div', { style: { padding: '6px 16px', borderRadius: 20, background: statusBg, border: '1px solid ' + statusBorder, color: statusColor, fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono', letterSpacing: 0.8, whiteSpace: 'nowrap' } },
                statusLabel)
        )
    );

    // ---- Tab Bar ----------------------------------------------
    var tabBar = h('div', { style: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap' } },
        SUB_TABS.map(function(tab) {
            var isActive = activeTab === tab.id;
            return h('button', {
                key: tab.id,
                onClick: (function(id) { return function() { setActiveTab(id); }; })(tab.id),
                style: {
                    padding: '10px 20px 12px', border: 'none',
                    borderBottom: '2px solid ' + (isActive ? '#00d4ff' : 'transparent'),
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    transition: 'all 0.15s ease', marginBottom: -1,
                }
            },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 5 } },
                    h('span', { style: { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, fontFamily: 'JetBrains Mono', color: isActive ? '#00d4ff' : 'rgba(255,255,255,0.42)', transition: 'color 0.15s' } }, tab.label),
                    tab.isNew && h('span', { style: { fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(0,212,185,0.15)', color: '#00d4b8', border: '1px solid rgba(0,212,185,0.3)', letterSpacing: 0.5 } }, 'NEW')
                ),
                h('span', { style: { fontSize: 9.5, color: isActive ? 'rgba(0,212,255,0.55)' : 'rgba(255,255,255,0.2)', fontFamily: 'Figtree', transition: 'color 0.15s' } }, tab.sub)
            );
        })
    );

    // ---- Panel routing ----------------------------------------
    var panel = null;
    switch (activeTab) {
        case 'overview':
            panel = hasNav ? h(OverviewPanel, { navSeries: navSeries, cmdData: cmdData, txData: txData, positions: homeData || [] }) : h(EmptyState, null);
            break;
        case 'returns':
            panel = hasNav ? h(ReturnsPanel, { navSeries: navSeries, perfData: perfData }) : h(EmptyState, null);
            break;
        case 'risk':
            panel = hasNav ? h(RiskPanel, { navSeries: navSeries, cmdData: cmdData }) : h(EmptyState, null);
            break;
        case 'positions':
            panel = hasPerf ? h(PositionsPanel, { perfData: perfData, cmdData: cmdData, homeData: homeData || [] }) : h(EmptyState, null);
            break;
        case 'rolling':
            panel = h(RollingAttributionPanel, { positions: homeData || [], histBySymbol: histBySymbol, histReady: histReady, perfData: perfData || [] });
            break;
        case 'factors':
            panel = h(FactorEnginePanel, { positions: homeData || [], histBySymbol: histBySymbol, histReady: histReady, perfData: perfData || [] });
            break;
        case 'regime':
            panel = h(RegimeSlicerPanel, { positions: homeData || [], histBySymbol: histBySymbol, histReady: histReady, perfData: perfData || [] });
            break;
        case 'charts':
            panel = h('div', { style: { height: 'calc(100vh - 220px)', minHeight: 480 } }, h(AdvancedChart, { navSeries: navSeries }));
            break;
    }

    return h('div', null, kpiBar, tabBar, panel);
}
