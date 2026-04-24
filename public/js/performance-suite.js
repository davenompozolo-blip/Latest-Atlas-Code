// ============================================================
// ATLAS Terminal — Performance Suite (Main Wrapper)
// ------------------------------------------------------------
// Loads Supabase views, routes to 4 sub-tabs:
//   Overview · Returns · Risk · Positions
// ============================================================

import { loadView, MOCK_COMMAND } from './config.js';
import { Loading, EmptyState } from './components.js';
import { OverviewPanel, ReturnsPanel } from './perf-panels-top.js';
import { RiskPanel, PositionsPanel } from './perf-panels-bottom.js';

var useState = React.useState, useEffect = React.useEffect;
var h = React.createElement;

var SUB_TABS = [
    { id: 'overview', label: 'OVERVIEW' },
    { id: 'returns',  label: 'RETURNS' },
    { id: 'risk',     label: 'RISK' },
    { id: 'positions', label: 'POSITIONS' },
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
    var _l = useState(true);
    var loading = _l[0], setLoading = _l[1];

    useEffect(function() {
        Promise.all([
            loadView('vw_portfolio_nav_daily', []),
            loadView('vw_performance_suite', []),
            loadView('vw_command_centre', [MOCK_COMMAND])
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
            setLoading(false);
        });
    }, []);

    if (loading) return h(Loading, null);

    var hasNav = navSeries && navSeries.length > 1;
    var hasPerf = perfData && perfData.length > 0;

    if (!hasNav && !hasPerf) return h(EmptyState, null);

    // Sub-tab bar
    var tabBar = h('div', {
        style: {
            display: 'flex', gap: 2, marginBottom: 20, background: 'rgba(255,255,255,0.03)',
            borderRadius: 6, padding: 3, width: 'fit-content'
        }
    }, SUB_TABS.map(function(tab) {
        var isActive = activeTab === tab.id;
        return h('button', {
            key: tab.id,
            onClick: function() { setActiveTab(tab.id); },
            style: {
                padding: '8px 20px', border: 'none', borderRadius: 4, cursor: 'pointer',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                fontFamily: 'JetBrains Mono, monospace',
                background: isActive ? 'rgba(0,212,255,0.12)' : 'transparent',
                color: isActive ? '#00d4ff' : 'rgba(255,255,255,0.45)',
                transition: 'all 0.15s ease'
            }
        }, tab.label);
    }));

    // Route to panel
    var panel = null;
    switch (activeTab) {
        case 'overview':
            panel = hasNav ? h(OverviewPanel, { navSeries: navSeries, cmdData: cmdData }) : h(EmptyState, null);
            break;
        case 'returns':
            panel = hasNav ? h(ReturnsPanel, { navSeries: navSeries }) : h(EmptyState, null);
            break;
        case 'risk':
            panel = hasNav ? h(RiskPanel, { navSeries: navSeries, cmdData: cmdData }) : h(EmptyState, null);
            break;
        case 'positions':
            panel = hasPerf ? h(PositionsPanel, { perfData: perfData, cmdData: cmdData }) : h(EmptyState, null);
            break;
    }

    return h('div', null,
        h('div', { className: 'page-title' }, 'Performance Suite'),
        tabBar,
        panel
    );
}
