import React from 'react';
// ============================================================
// ATLAS Terminal — Application Shell & Entry Point
// ------------------------------------------------------------
// Owns:
//   • TAB registry + NAV_STRUCTURE sidebar config
//   • Root <App/> component (top bar, sidebar, content router)
//   • ReactDOM root mount
//
// This is the module entry point loaded by index.html as
// <script type="module" src="js/app.js"></script>.
// ============================================================

import { sb, loadView, MOCK_COMMAND } from './config.js';
import { fmtPct, fmtCurrency, cls } from './utils.js';
import { ConfigPrompt, TopBarSparkline, SyncStatusPill, RefreshButton } from './components.js';
import { NexusPage } from './nexus-page.js';
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
import { PortfolioConstruction } from './pcm.js';

const { useState, useEffect } = React;

// ------------------------------------------------------------
// Tab registry & sidebar navigation structure
// ------------------------------------------------------------
const TABS = [
    { id: 'nexus',     label: 'NEXUS',     sub: 'Unified Intelligence',    icon: '\u2B21', component: NexusPage },
    { id: 'portfolio', label: 'PORTFOLIO', sub: 'Positions & NAV',        icon: '\u25CB', component: PortfolioHome },
    { id: 'trading',   label: 'TRADING',   sub: 'Order Desk & Research',   icon: '\u25B6', component: TradingDashboard },
    { id: 'quant',     label: 'QUANT',     sub: 'Quantitative Signals',    icon: '\u25C7', component: QuantDashboard },
    { id: 'risk',      label: 'RISK',      sub: 'Metrics & Drawdown',      icon: '\u25B3', component: RiskAnalysis },
    { id: 'performance', label: 'PERFORMANCE', sub: 'Returns & Attribution', icon: '\u25C6', component: PerformanceSuite },
    { id: 'command',   label: 'COMMAND',   sub: 'System Overview',         icon: '\u2726', component: CommandCentre },
    { id: 'equity',    label: 'EQUITY',    sub: 'Ticker Research',         icon: '\u25A1', component: EquityResearch },
    { id: 'macro',     label: 'MACRO',     sub: 'Economic Intelligence',   icon: '\u25C9', component: MacroDashboard },
    { id: 'funds',     label: 'FUNDS',     sub: 'Fund & ETF Research',     icon: '\u25A0', component: FundsDashboard },
    { id: 'markets',   label: 'MARKETS',   sub: 'Global Market Watch',     icon: '\u25CE', component: MarketWatch },
    { id: 'options',    label: 'OPTIONS',    sub: 'Derivatives Analysis',    icon: '\u03A9', component: OptionsAnalysis },
    { id: 'valuation',  label: 'VALUATION',  sub: 'Equity Valuation Suite',  icon: '\u25C8', component: ValuationHub },
    { id: 'sql',        label: 'SQL',        sub: 'Query Terminal',           icon: '\u25A3', component: SqlTerminal },
    { id: 'scrapbook',  label: 'SCRAPBOOK',  sub: 'Research & Thesis Notes', icon: '\u{1F4D2}', component: Scrapbook },
    { id: 'pcm',        label: 'PCM',        sub: 'Portfolio Construction',  icon: '⬢',   component: PortfolioConstruction },
];

const NAV_STRUCTURE = [
    { type: 'header', label: 'CORE' },
    { type: 'tab', id: 'nexus' },
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
// Error boundary — surfaces render crashes as visible error card
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
    var _s = useState('nexus');
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
    // Scrapbook deep-link ticker — set when ValuationHouse triggers Save & Analyse
    var _st = useState(null);
    var scrapbookTicker = _st[0];
    var setScrapbookTicker = _st[1];
    // Cross-module navigation: symbol passed when navigating to equity tab
    var _ns = useState(null);
    var navSymbol = _ns[0];
    var setNavSymbol = _ns[1];

    var ActiveComponent = TABS.find(function(t) { return t.id === activeTab; }).component;

    // Load summary data for top bar — also re-runs on atlas:refresh
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

    // Listen for Scrapbook navigation events dispatched by ScrapbookSaveBar
    useEffect(function() {
        function onOpenScrapbook(e) {
            setScrapbookTicker((e.detail && e.detail.ticker) || null);
            setActiveTab('scrapbook');
        }
        window.addEventListener('atlas:open-scrapbook', onOpenScrapbook);
        return function() { window.removeEventListener('atlas:open-scrapbook', onOpenScrapbook); };
    }, []);

    // Cross-module navigation: atlas:navigate → { tab, symbol }
    useEffect(function() {
        function onNavigate(e) {
            if (!e.detail) return;
            if (e.detail.symbol) setNavSymbol(e.detail.symbol);
            if (e.detail.tab) setActiveTab(e.detail.tab);
        }
        window.addEventListener('atlas:navigate', onNavigate);
        return function() { window.removeEventListener('atlas:navigate', onNavigate); };
    }, []);

    // Nexus owns its entire viewport — bypass the ATLAS shell entirely.
    // Placed after all hooks so hook order stays stable across renders.
    // Wrapped in ErrorBoundary so a data/render hiccup degrades gracefully.
    if (activeTab === 'nexus') {
        return React.createElement(ErrorBoundary, null,
            React.createElement(NexusPage, { onNavigate: setActiveTab }));
    }

    var c = topCmd || MOCK_COMMAND;
    var pnl = c.total_return_pct;
    var pnlStr = pnl != null ? (pnl >= 0 ? '+' : '') + fmtCurrency(c.portfolio_nav - c.total_invested) + ' (' + fmtPct(pnl) + ')' : '';

    return React.createElement('div', { className: 'app-container' },
        // Gradient top line
        React.createElement('div', { style: { height: 2, background: 'linear-gradient(90deg, transparent, #00d4ff, #8b5cf6, transparent)', backgroundSize: '200% 100%', animation: 'shimmer 4s linear infinite' } }),
        // Top Bar
        React.createElement('div', { className: 'top-bar' },
            React.createElement('div', null,
                React.createElement('div', { className: 'logo' }, 'ATLAS'),
                React.createElement('div', { className: 'logo-sub' }, 'TERMINAL')
            ),
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', lineHeight: 1.2 } },
                React.createElement('div', { style: { fontSize: 9, letterSpacing: 1.8, color: 'rgba(255,255,255,0.35)', fontFamily: 'Figtree', textTransform: 'uppercase', marginBottom: 2 } }, 'Net Equity'),
                React.createElement('div', { className: 'nav-summary' }, fmtCurrency(c.portfolio_nav))
            ),
            React.createElement('div', { className: 'nav-pnl ' + cls(pnl) }, pnlStr),
            React.createElement(TopBarSparkline, { nav: topNav }),
            React.createElement('div', { className: 'spacer' }),
            React.createElement('div', {
                    className: 'status-badge ' + (dataMode === 'live' ? 'live' : 'demo'),
                    title: dataMode === 'live'
                        ? 'Supabase views returned rows under anon key'
                        : 'Anon key not returning rows — open DevTools console for [ATLAS] warnings'
                },
                dataMode === 'live' ? '\u25CF LIVE DATA' : '\u25CB MOCK DATA'
            ),
            React.createElement(SyncStatusPill, null),
            React.createElement(RefreshButton, null),
            React.createElement('div', { className: 'date' },
                new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
            )
        ),
        // Body layout (sidebar + content)
        React.createElement('div', { className: 'body-layout' },
            // Left Sidebar
            React.createElement('div', { className: 'sidebar' },
                NAV_STRUCTURE.map(function(item, idx) {
                    if (item.type === 'header') {
                        return React.createElement('div', { key: 'h' + idx, className: 'nav-section-header' }, item.label);
                    }
                    if (item.type === 'placeholder') {
                        return React.createElement('div', { key: 'p' + idx, className: 'nav-item disabled' },
                            React.createElement('span', { className: 'nav-icon' }, '\u25CB'),
                            React.createElement('div', null,
                                React.createElement('div', { className: 'nav-label' }, item.label),
                                React.createElement('div', { className: 'nav-sublabel' }, item.sub)
                            )
                        );
                    }
                    var tab = TABS.find(function(t) { return t.id === item.id; });
                    if (!tab) return null;
                    return React.createElement('button', {
                        key: tab.id,
                        className: 'nav-item' + (activeTab === tab.id ? ' active' : ''),
                        onClick: function() { setActiveTab(tab.id); }
                    },
                        React.createElement('span', { className: 'nav-icon' }, tab.icon),
                        React.createElement('div', null,
                            React.createElement('div', { className: 'nav-label' }, tab.label),
                            React.createElement('div', { className: 'nav-sublabel' }, tab.sub)
                        )
                    );
                }),
                React.createElement('div', { className: 'sidebar-footer' },
                    'ATLAS TERMINAL v2.0',
                    React.createElement('br'),
                    '\u00A9 2026 ATLAS'
                )
            ),
            // Main Content
            React.createElement('div', { className: 'main-content', style: { display: 'flex', flexDirection: 'column' } },
                !sb ? React.createElement(ConfigPrompt, null) : null,
                React.createElement('div', { style: { flex: 1, overflow: 'auto' } },
                    React.createElement(ActiveComponent,
                        activeTab === 'scrapbook' ? { initialTicker: scrapbookTicker }
                        : activeTab === 'equity'   ? { initialSymbol: navSymbol }
                        : activeTab === 'trading'  ? { initialSymbol: navSymbol }
                        : activeTab === 'options'  ? { initialSymbol: navSymbol }
                        : activeTab === 'valuation'? { initialSymbol: navSymbol }
                        : null)
                )
            )
        )
    );
}

export { App, ErrorBoundary };
