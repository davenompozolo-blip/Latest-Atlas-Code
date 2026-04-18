import { Loading, EmptyState } from './components.js';
import { RegimePanel } from './macro-regime.js';
import { YieldsPanel } from './macro-yields.js';
import { IndicatorsPanel } from './macro-indicators.js';
import { MarketsPanel } from './macro-markets.js';

var useState = React.useState, useEffect = React.useEffect, useCallback = React.useCallback;
var h = React.createElement;

var TABS = [
    { id: 'regime', label: 'Regime' },
    { id: 'yields', label: 'Rates & Yields' },
    { id: 'indicators', label: 'Inflation & Growth' },
    { id: 'markets', label: 'Cross-Asset' },
];

function SubTab(p) {
    return h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 } },
        p.tabs.map(function(t) {
            var a = t.id === p.active;
            return h('button', {
                key: t.id, onClick: function() { p.onSelect(t.id); },
                style: {
                    background: a ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                    color: a ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                    border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                    borderRadius: 8, padding: '8px 16px', fontSize: 12,
                    fontWeight: a ? 600 : 400, cursor: 'pointer', letterSpacing: 0.5,
                }
            }, t.label);
        })
    );
}

export function MacroDashboard() {
    var _t = useState('regime'), tab = _t[0], setTab = _t[1];
    var _s = useState('idle'), status = _s[0], setStatus = _s[1];
    var _d = useState(null), data = _d[0], setData = _d[1];
    var _e = useState(null), errMsg = _e[0], setErrMsg = _e[1];

    var fetchData = useCallback(function(nocache) {
        setStatus('loading');
        setErrMsg(null);
        var url = '/api/macro' + (nocache ? '?nocache=1' : '');
        fetch(url).then(function(r) {
            if (!r.ok) throw new Error('API returned ' + r.status);
            return r.json();
        }).then(function(d) {
            setData(d);
            setStatus('ready');
        }).catch(function(e) {
            setErrMsg(e.message || 'Failed to load macro data');
            setStatus('error');
        });
    }, []);

    useEffect(function() { fetchData(false); }, []);

    if (status === 'idle' || status === 'loading') {
        return h('div', { className: 'main-content' },
            h('div', { style: { marginBottom: 20 } },
                h('h2', { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, 'Macro Intelligence'),
                h('p', { style: { fontSize: 12, color: 'var(--text-sec)', margin: '4px 0 0' } }, 'Economic regime, rates, inflation, growth & cross-asset signals')
            ),
            h(Loading, null)
        );
    }

    if (status === 'error') {
        return h('div', { className: 'main-content' },
            h('div', { style: { marginBottom: 20 } },
                h('h2', { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, 'Macro Intelligence')
            ),
            h('div', { className: 'card', style: { padding: 32, textAlign: 'center' } },
                h('div', { style: { color: '#ef4444', marginBottom: 12, fontSize: 14 } }, 'Error loading macro data'),
                h('div', { style: { color: 'var(--text-muted)', marginBottom: 16 } }, errMsg),
                h('button', {
                    onClick: function() { fetchData(true); },
                    style: { background: 'rgba(0,212,255,0.15)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }
                }, 'Retry')
            )
        );
    }

    var content = null;
    if (tab === 'regime') content = h(RegimePanel, { data: data });
    else if (tab === 'yields') content = h(YieldsPanel, { data: data });
    else if (tab === 'indicators') content = h(IndicatorsPanel, { data: data });
    else if (tab === 'markets') content = h(MarketsPanel, { data: data });

    return h('div', { className: 'main-content' },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 } },
            h('div', null,
                h('h2', { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, 'Macro Intelligence'),
                h('p', { style: { fontSize: 12, color: 'var(--text-sec)', margin: '4px 0 0' } }, 'Economic regime, rates, inflation, growth & cross-asset signals')
            ),
            h('button', {
                onClick: function() { fetchData(true); },
                style: { background: 'rgba(255,255,255,0.04)', color: 'var(--text-sec)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }
            }, 'Refresh')
        ),
        h(SubTab, { tabs: TABS, active: tab, onSelect: setTab }),
        content
    );
}
