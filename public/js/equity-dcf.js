import { deriveDefaults, SubTab } from './dcf-engine.js';
import { FcffPanel } from './equity-dcf-fcff.js';
import { DdmPanel } from './equity-dcf-ddm.js';
import { RiPanel } from './equity-dcf-ri.js';
import { SimPanel } from './equity-dcf-sim.js';

var useState = React.useState;
var h = React.createElement;

var TABS = [
    { id: 'fcff', label: 'FCFF DCF' },
    { id: 'ddm', label: 'Dividend Discount' },
    { id: 'ri', label: 'Residual Income' },
    { id: 'sim', label: 'Simulation' },
];

export function DCFEngine(p) {
    var financials = p.financials, overview = p.overview, series = p.series;
    var _t = useState('fcff'), tab = _t[0], setTab = _t[1];

    var rawOv = {
        Beta: overview && overview.beta,
        MarketCapitalization: overview && overview.marketCap,
        DividendYield: overview && overview.dividendYield,
    };
    var price = series && series.length ? series[series.length - 1].close : null;
    var snap = financials && financials.snapshot;
    var defaults = deriveDefaults(snap, rawOv, price);

    if (!defaults || !snap) {
        return h('div', { className: 'card', style: { color: 'var(--text-muted)', padding: 32, textAlign: 'center' } },
            h('div', { style: { fontSize: 14, marginBottom: 8 } }, 'DCF Engine'),
            h('div', null, 'Requires fundamentals data. Search for a ticker with available financials.'));
    }

    var content = null;
    if (tab === 'fcff') content = h(FcffPanel, { defaults: defaults, price: price });
    else if (tab === 'ddm') content = h(DdmPanel, { defaults: defaults, price: price });
    else if (tab === 'ri') content = h(RiPanel, { defaults: defaults, price: price });
    else if (tab === 'sim') content = h(SimPanel, { defaults: defaults, price: price });

    return h('div', null,
        h(SubTab, { tabs: TABS, active: tab, onSelect: setTab }),
        content
    );
}
