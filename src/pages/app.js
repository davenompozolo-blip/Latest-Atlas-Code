import React from 'react';
// ============================================================
// ATLAS Terminal — Application Shell & Entry Point
// ============================================================

import { sb, loadView, MOCK_COMMAND } from './config.js';
import { fmtPct, fmtCurrency, cls } from './utils.js';
import { ConfigPrompt, SyncStatusPill, RefreshButton } from './components.js';
import { PortfolioHome } from './portfolio-home.js';
import { QuantDashboard } from './quant-dashboard.js';
import { RiskAnalysis, CommandCentre } from './pages-other.js';
import { PerformanceSuite } from './performance-suite.js';
import { EquityResearch } from './equity-research.js';
import { MacroDashboard } from './macro-dashboard.js';
import { FundsDashboard } from './funds-dashboard.js';
import { MarketWatch } from './market-watch.js';
import { TradingDashboard } from './trading.js';
import { OptionsAnalysis } from './options-analysis.js';
import { ValuationHub } from './valuation-hub.js';
import { SqlTerminal } from './sql-terminal.js';
import { Scrapbook } from './scrapbook.js';
import { PortfolioConstruction } from './portfolio-construction.js';

const { useState, useEffect } = React;

// ------------------------------------------------------------
// Tab registry & sidebar navigation structure
// ------------------------------------------------------------
const TABS = [
    { id: 'portfolio', label: 'PORTFOLIO',    sub: 'Positions & NAV',          icon: '○', component: PortfolioHome },
    { id: 'trading',   label: 'TRADING',      sub: 'Order Desk & Research',     icon: '▶', component: TradingDashboard },
    { id: 'quant',     label: 'QUANT',        sub: 'Quantitative Signals',      icon: '◇', component: QuantDashboard },
    { id: 'risk',      label: 'RISK',         sub: 'Metrics & Drawdown',        icon: '△', component: RiskAnalysis },
    { id: 'performance', label: 'PERFORMANCE', sub: 'Returns & Attribution',    icon: '◆', component: PerformanceSuite },
    { id: 'command',   label: 'COMMAND',      sub: 'System Overview',           icon: '✦', component: CommandCentre },
    { id: 'equity',    label: 'EQUITY',       sub: 'Ticker Research',           icon: '□', component: EquityResearch },
    { id: 'macro',     label: 'MACRO',        sub: 'Economic Intelligence',     icon: '◉', component: MacroDashboard },
    { id: 'funds',     label: 'FUNDS',        sub: 'Fund & ETF Research',       icon: '■', component: FundsDashboard },
    { id: 'markets',   label: 'MARKETS',      sub: 'Global Market Watch',       icon: '◎', component: MarketWatch },
    { id: 'options',   label: 'OPTIONS',      sub: 'Derivatives Analysis',      icon: 'Ω', component: OptionsAnalysis },
    { id: 'valuation', label: 'VALUATION',    sub: 'Equity Valuation Suite',    icon: '◈', component: ValuationHub },
    { id: 'sql',       label: 'SQL',          sub: 'Query Terminal',            icon: '▣', component: SqlTerminal },
    { id: 'scrapbook', label: 'SCRAPBOOK',    sub: 'Research & Thesis Notes',   icon: '\u{1F4D2}', component: Scrapbook },
    { id: 'pcm',       label: 'PCM',          sub: 'Portfolio Construction',    icon: '⧆', component: PortfolioConstruction },
];

const NAV_STRUCTURE = [
    { type: 'header', label: 'CORE' },
    { type: 'tab', id: 'portfolio' },
    { type: 'tab', id: 'trading' },
    { type: 'header', label: 'ANALYSIS' },
    { type: 'tab', id: 'performance' },
    { type: 'tab', id: 'quant' },
    { type: 'tab', id: 'options' },
    { type: 'header', label: 'SYSTEM' },
    { type: 'tab', id: 'risk' },
    { type: 'tab', id: 'command' },
    { type: 'tab', id: 'sql' },
    { type: 'header', label: 'RESEARCH' },
    { type: 'tab', id: 'equity' },
    { type: 'tab', id: 'macro' },
    { type: 'tab', id: 'funds' },
    { type: 'header', label: 'MARKETS' },
    { type: 'tab', id: 'markets' },
    { type: 'header', label: 'VALUATION' },
    { type: 'tab', id: 'valuation' },
    { type: 'tab', id: 'scrapbook' },
    { type: 'header', label: 'CONSTRUCT' },
    { type: 'tab', id: 'pcm' },
];

// ------------------------------------------------------------
// Error boundary
// ------------------------------------------------------------
class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(e) { return { error: e }; }
    render() {
        if (this.state.error) {
            return React.createElement('div', { style: { padding: 40, color: '#ef4444', fontFamily: 'monospace', background: '#070814', minHeight: '100vh' } },
                React.createElement('div', { style: { fontSize: 18, fontWeight: 700, marginBottom: 12 } }, '⚠ ATLAS — React Render Error'),
                React.createElement('pre', { style: { fontSize: 11, whiteSpace: 'pre-wrap', color: '#fca5a5' } },
                    String(this.state.error) + '\n\n' + (this.state.error.stack || ''))
            );
        }
        return this.props.children;
    }
}

// ------------------------------------------------------------
// Root App shell
// ------------------------------------------------------------
function App() {
    var _s = useState('portfolio');
    var activeTab = _s[0];
    var setActiveTab = _s[1];
    var _n = useState(null);
    var topNav = _n[0];
    var setTopNav = _n[1];
    var _c = useState(null);
    var topCmd = _c[0];
    var setTopCmd = _c[1];
    var _dm = useState(sb ? 'pending' : 'mock');
    var dataMode = _dm[0];
    var setDataMode = _dm[1];
    var _st = useState(null);
    var scrapbookTicker = _st[0];
    var setScrapbookTicker = _st[1];

    var ActiveComponent = TABS.find(function(t) { return t.id === activeTab; }).component;

    useEffect(function() {
        function load() {
            Promise.all([
                loadView('vw_portfolio_nav_daily', []),
                loadView('vw_command_centre', MOCK_COMMAND)
            ]).then(function(res) {
                setTopNav(res[0]);
                var cmd = Array.isArray(res[1]) ? res[1][0] : res[1];
                setTopCmd(cmd || MOCK_COMMAND);
                setDataMode(window.__ATLAS_DATA_MODE__ || 'mock');
            });
        }
        load();
        window.addEventListener('atlas:refresh', load);
        return function() { window.removeEventListener('atlas:refresh', load); };
    }, []);

    useEffect(function() {
        function onOpenScrapbook(e) {
            setScrapbookTicker((e.detail && e.detail.ticker) || null);
            setActiveTab('scrapbook');
        }
        window.addEventListener('atlas:open-scrapbook', onOpenScrapbook);
        return function() { window.removeEventListener('atlas:open-scrapbook', onOpenScrapbook); };
    }, []);

    var c = topCmd || MOCK_COMMAND;
    var pnl = c.total_return_pct;
    var mtd = c.mtd_return_pct;
    var activeTabObj = TABS.find(function(t) { return t.id === activeTab; });
    var activeLabel  = activeTabObj ? activeTabObj.label : 'DASHBOARD';

    return React.createElement('div', { className: 'app-container' },

        // ── Top Bar ──────────────────────────────────────────────────────────
        React.createElement('div', { className: 'top-bar' },

            // Left: Logo + breadcrumb
            React.createElement('div', { className: 'topbar-left' },
                React.createElement('div', { className: 'logo-group' },
                    React.createElement('span', { className: 'logo' }, 'ATLAS'),
                    React.createElement('span', { className: 'logo-word' }, 'TERMINAL')
                ),
                React.createElement('div', { className: 'topbar-breadcrumb' },
                    React.createElement('span', { className: 'bc-dim' }, 'Dashboard'),
                    React.createElement('span', { className: 'bc-sep' }, '›'),
                    React.createElement('span', { className: 'bc-active' }, activeLabel)
                )
            ),

            // Spacer
            React.createElement('div', { className: 'spacer' }),

            // Right: 3 compact metrics + controls
            React.createElement('div', { className: 'topbar-right' },
                React.createElement('div', { className: 'tb-metric' },
                    React.createElement('div', { className: 'tb-metric-value' }, fmtCurrency(c.portfolio_nav)),
                    React.createElement('div', { className: 'tb-metric-label' }, 'Portfolio NAV')
                ),
                React.createElement('div', { className: 'tb-divider' }),
                React.createElement('div', { className: 'tb-metric' },
                    React.createElement('div', {
                        className: 'tb-metric-value',
                        style: { color: mtd > 0 ? 'var(--green)' : mtd < 0 ? 'var(--red)' : 'var(--text-2)' }
                    }, mtd != null ? (mtd >= 0 ? '+' : '') + fmtPct(mtd) : '—'),
                    React.createElement('div', { className: 'tb-metric-label' }, 'MTD Return')
                ),
                React.createElement('div', { className: 'tb-divider' }),
                React.createElement('div', { className: 'tb-metric' },
                    React.createElement('div', {
                        className: 'tb-metric-value',
                        style: { color: pnl > 0 ? 'var(--green)' : pnl < 0 ? 'var(--red)' : 'var(--gold)' }
                    }, pnl != null ? (pnl >= 0 ? '+' : '') + fmtPct(pnl) : '—'),
                    React.createElement('div', { className: 'tb-metric-label' }, 'Total Return')
                ),
                React.createElement('div', { className: 'tb-divider' }),
                React.createElement('div', { className: 'topbar-controls' },
                    React.createElement('div', {
                        className: 'status-badge ' + (dataMode === 'live' ? 'live' : 'demo'),
                        title: dataMode === 'live' ? 'Live data' : 'Demo — set VITE_SUPABASE_ANON_KEY',
                    }, dataMode === 'live' ? '● LIVE' : '○ DEMO'),
                    React.createElement(SyncStatusPill, null),
                    React.createElement(RefreshButton, null)
                )
            )
        ),

        // ── Body layout ───────────────────────────────────────────────────────
        React.createElement('div', { className: 'body-layout' },

            // Left Sidebar
            React.createElement('div', { className: 'sidebar' },
                NAV_STRUCTURE.map(function(item, idx) {
                    if (item.type === 'header') {
                        return React.createElement('div', { key: 'h' + idx, className: 'nav-section-header' }, item.label);
                    }
                    if (item.type === 'placeholder') {
                        return React.createElement('div', { key: 'p' + idx, className: 'nav-item disabled' },
                            React.createElement('span', { className: 'nav-dash' }, '—'),
                            React.createElement('div', { className: 'nav-label' }, item.label)
                        );
                    }
                    var tab = TABS.find(function(t) { return t.id === item.id; });
                    if (!tab) return null;
                    var isActive = activeTab === tab.id;
                    return React.createElement('button', {
                        key: tab.id,
                        className: 'nav-item' + (isActive ? ' active' : ''),
                        onClick: function() { setActiveTab(tab.id); }
                    },
                        React.createElement('span', { className: 'nav-dash' }, isActive ? '▶' : '—'),
                        React.createElement('div', { className: 'nav-label' }, tab.label),
                        isActive
                            ? React.createElement('span', { className: 'nav-active-badge' }, 'ACTIVE')
                            : null
                    );
                }),
                React.createElement('div', { className: 'sidebar-footer' },
                    'ATLAS TERMINAL v2.0',
                    React.createElement('br'),
                    '© 2026 ATLAS'
                )
            ),

            // Main Content
            React.createElement('div', { className: 'main-content', style: { display: 'flex', flexDirection: 'column' } },
                !sb ? React.createElement(ConfigPrompt, null) : null,
                React.createElement('div', { style: { flex: 1, overflow: 'auto' } },
                    React.createElement(ActiveComponent, activeTab === 'scrapbook' ? { initialTicker: scrapbookTicker } : null)
                )
            )
        )
    );
}

export { App, ErrorBoundary };
