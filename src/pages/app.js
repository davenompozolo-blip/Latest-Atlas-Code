import React from 'react';
import { sb, loadView, MOCK_COMMAND } from './config.js';
import { ConfigPrompt } from './components.js';
import { NexusPage, NexusShell } from './nexus-page.js';
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

const TABS = [
    { id: 'nexus',       component: NexusPage },
    { id: 'portfolio',   component: PortfolioHome },
    { id: 'trading',     component: TradingDashboard },
    { id: 'quant',       component: QuantDashboard },
    { id: 'risk',        component: RiskAnalysis },
    { id: 'performance', component: PerformanceSuite },
    { id: 'command',     component: CommandCentre },
    { id: 'equity',      component: EquityResearch },
    { id: 'macro',       component: MacroDashboard },
    { id: 'funds',       component: FundsDashboard },
    { id: 'markets',     component: MarketWatch },
    { id: 'options',     component: OptionsAnalysis },
    { id: 'valuation',   component: ValuationHub },
    { id: 'sql',         component: SqlTerminal },
    { id: 'scrapbook',   component: Scrapbook },
    { id: 'pcm',         component: PortfolioConstruction },
];

// ── Error boundary ────────────────────────────────────────────
class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(e) { return { error: e }; }
    render() {
        if (this.state.error) {
            return React.createElement('div', {
                style: { padding: 40, color: '#ef4444', fontFamily: 'monospace', background: '#070814', minHeight: '100vh' }
            },
                React.createElement('div', { style: { fontSize: 18, fontWeight: 700, marginBottom: 12 } }, '⚠ ATLAS — Render Error'),
                React.createElement('pre', { style: { fontSize: 11, whiteSpace: 'pre-wrap', color: '#fca5a5' } },
                    String(this.state.error) + '\n\n' + (this.state.error.stack || ''))
            );
        }
        return this.props.children;
    }
}

// ── Root App ──────────────────────────────────────────────────
function App() {
    var _s = useState('nexus');
    var activeTab   = _s[0];
    var setActiveTab = _s[1];

    // Scrapbook deep-link
    var _st = useState(null);
    var scrapbookTicker = _st[0];
    var setScrapbookTicker = _st[1];

    // Cross-module symbol navigation
    var _ns = useState(null);
    var navSymbol   = _ns[0];
    var setNavSymbol = _ns[1];

    // Listen for Scrapbook navigation
    useEffect(function() {
        function onOpenScrapbook(ev) {
            setScrapbookTicker((ev.detail && ev.detail.ticker) || null);
            setActiveTab('scrapbook');
        }
        window.addEventListener('atlas:open-scrapbook', onOpenScrapbook);
        return function() { window.removeEventListener('atlas:open-scrapbook', onOpenScrapbook); };
    }, []);

    // Cross-module navigation: atlas:navigate → { tab, symbol }
    useEffect(function() {
        function onNavigate(ev) {
            if (!ev.detail) return;
            if (ev.detail.symbol) setNavSymbol(ev.detail.symbol);
            if (ev.detail.tab)    setActiveTab(ev.detail.tab);
        }
        window.addEventListener('atlas:navigate', onNavigate);
        return function() { window.removeEventListener('atlas:navigate', onNavigate); };
    }, []);

    var entry = TABS.find(function(t) { return t.id === activeTab; }) || TABS[0];
    var ActiveComponent = entry.component;

    var contentProps =
        activeTab === 'scrapbook' ? { initialTicker: scrapbookTicker }
        : activeTab === 'equity'   ? { initialSymbol: navSymbol }
        : activeTab === 'trading'  ? { initialSymbol: navSymbol }
        : activeTab === 'options'  ? { initialSymbol: navSymbol }
        : activeTab === 'valuation'? { initialSymbol: navSymbol }
        : null;

    // NexusShell is the universal persistent chrome for every module.
    return React.createElement(NexusShell, { activeTab: activeTab, onNavigate: setActiveTab },
        !sb ? React.createElement(ConfigPrompt, null) : null,
        React.createElement(ActiveComponent, contentProps)
    );
}

export { App, ErrorBoundary };
