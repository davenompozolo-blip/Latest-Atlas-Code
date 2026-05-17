import React from 'react';
// ============================================================
// ATLAS Terminal — Performance Suite (Main Wrapper)
// ------------------------------------------------------------
// Owns the KPI pulse bar, tab bar, and panel routing.
// Sub-panels: Overview · Returns · Risk · Positions
// ============================================================

import { loadView, MOCK_COMMAND } from './config.js';
import { fmtPct, fmt, fmtCurrency } from './utils.js';
import { Loading, EmptyState } from './components.js';
import { computePortfolioMetrics, computePeriodReturns } from './perf-engine.js';
import { OverviewPanel, ReturnsPanel } from './perf-panels-top.js';
import { RiskPanel, PositionsPanel } from './perf-panels-bottom.js';
import { AdvancedChart } from './advanced-chart.js';

var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo;
var h = React.createElement;

var SUB_TABS = [
    { id: 'overview',  label: 'OVERVIEW',  sub: 'Metrics & Curve' },
    { id: 'returns',   label: 'RETURNS',   sub: 'Period Analysis' },
    { id: 'risk',      label: 'RISK',      sub: 'Drawdown & VaR' },
    { id: 'positions', label: 'POSITIONS', sub: 'Attribution' },
    { id: 'charts',    label: 'CHARTS',    sub: 'Advanced Analysis' },
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
    var _l = useState(true);
    var loading = _l[0], setLoading = _l[1];

    useEffect(function() {
        function load() {
            Promise.all([
                loadView('vw_portfolio_nav_daily', []),
                loadView('vw_performance_suite', []),
                loadView('vw_command_centre', [MOCK_COMMAND]),
                loadView('vw_portfolio_home', []),
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
                setHomeData(res[3] || []);
                setLoading(false);
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
            overflow: 'hidden',
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
            h('div', { style: hl }, 'Win Rate'),
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
    var tabBar = h('div', { style: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.07)' } },
        SUB_TABS.map(function(tab) {
            var isActive = activeTab === tab.id;
            return h('button', {
                key: tab.id,
                onClick: function() { setActiveTab(tab.id); },
                style: {
                    padding: '10px 24px 12px', border: 'none',
                    borderBottom: '2px solid ' + (isActive ? '#00d4ff' : 'transparent'),
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    transition: 'all 0.15s ease', marginBottom: -1,
                }
            },
                h('span', { style: { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, fontFamily: 'JetBrains Mono', color: isActive ? '#00d4ff' : 'rgba(255,255,255,0.42)', transition: 'color 0.15s' } }, tab.label),
                h('span', { style: { fontSize: 9.5, color: isActive ? 'rgba(0,212,255,0.55)' : 'rgba(255,255,255,0.2)', fontFamily: 'Figtree', transition: 'color 0.15s' } }, tab.sub)
            );
        })
    );

    // ---- Panel routing ----------------------------------------
    var panel = null;
    switch (activeTab) {
        case 'overview':
            panel = hasNav ? h(OverviewPanel, { navSeries: navSeries, cmdData: cmdData }) : h(EmptyState, null);
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
        case 'charts':
            panel = h('div', { style: { height: 'calc(100vh - 220px)', minHeight: 480 } }, h(AdvancedChart, { navSeries: navSeries }));
            break;
    }

    return h('div', null, kpiBar, tabBar, panel);
}
