import { deriveDefaults, runFCFF, runGordonDDM, runResidualIncome, SubTab } from './dcf-engine.js';
import { FcffPanel } from './equity-dcf-fcff.js';
import { DdmPanel } from './equity-dcf-ddm.js';
import { RiPanel } from './equity-dcf-ri.js';
import { SimPanel } from './equity-dcf-sim.js';

var useState = React.useState;
var h = React.createElement;

// ---- Consensus Valuation panel ----------------------------------------
// Runs all available models with default assumptions and shows them side by
// side with a weighted composite. Bear/Base/Bull columns show the range.

var PRESET_CONFIGS = {
    BEAR: { wacc: 0.12, tg: 0.015, revGMult: 0.5,  fcfMMult: 0.85, coeAdj: +0.03, gGrowth: 0.015 },
    BASE: { wacc: null, tg: 0.025, revGMult: 1.0,  fcfMMult: 1.00, coeAdj:  0.00, gGrowth: 0.025 },
    BULL: { wacc: 0.07, tg: 0.035, revGMult: 1.35, fcfMMult: 1.15, coeAdj: -0.02, gGrowth: 0.035 },
};

function runConsensus(defaults, price) {
    var results = {};
    ['BEAR', 'BASE', 'BULL'].forEach(function(sc) {
        var cfg = PRESET_CONFIGS[sc];
        var wacc = cfg.wacc != null ? cfg.wacc : defaults.wacc;
        var revG = defaults.revGrowth * cfg.revGMult;
        var fcfM = defaults.fcfMargin * cfg.fcfMMult;
        var coe  = defaults.coe + cfg.coeAdj;

        var fcff = runFCFF(defaults, wacc, cfg.tg, revG, fcfM, 5);
        var ddm  = defaults.divPerShare > 0
            ? runGordonDDM(defaults.divPerShare, coe, cfg.gGrowth)
            : null;
        var ri   = defaults.bookValue > 0
            ? runResidualIncome(defaults.bookValue, defaults.roe, coe, cfg.tg, 10, 0.6)
            : null;

        var vals = [];
        if (fcff)  vals.push({ model: 'FCFF DCF',     value: fcff.perShare });
        if (ddm)   vals.push({ model: 'Gordon DDM',   value: ddm.value });
        if (ri)    vals.push({ model: 'Residual Inc.', value: ri.value });

        var composite = vals.length
            ? vals.reduce(function(s, v) { return s + v.value; }, 0) / vals.length
            : null;

        results[sc] = { vals: vals, composite: composite };
    });
    return results;
}

function fmtCurrency(n) {
    if (n == null || !isFinite(n)) return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) { return n != null && isFinite(n) ? (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%' : '—'; }

function ConsensusPanel(p) {
    var defaults = p.defaults, price = p.price;
    if (!defaults || !price) {
        return h('div', { className: 'card', style: { color: 'var(--text-muted)', padding: 32, textAlign: 'center' } },
            'Consensus requires price and fundamentals data.');
    }

    var res = runConsensus(defaults, price);
    var base = res.BASE.composite;
    var bear = res.BEAR.composite;
    var bull = res.BULL.composite;

    var scColors = { BEAR: '#ef4444', BASE: '#f59e0b', BULL: '#10b981' };

    // Header tiles
    var headerTiles = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 } },
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'BASE FAIR VALUE'),
            h('div', { className: 'value', style: { color: base && base > price ? '#10b981' : '#ef4444' } }, fmtCurrency(base)),
            h('div', { className: 'sub', style: { color: base && base > price ? '#10b981' : '#ef4444' } },
                base ? fmtPct(base / price - 1) + ' vs current' : '—')
        ),
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'BEAR CASE'),
            h('div', { className: 'value', style: { color: '#ef4444' } }, fmtCurrency(bear)),
            h('div', { className: 'sub', style: { color: '#ef4444' } }, bear ? fmtPct(bear / price - 1) : '—')
        ),
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'BULL CASE'),
            h('div', { className: 'value', style: { color: '#10b981' } }, fmtCurrency(bull)),
            h('div', { className: 'sub', style: { color: '#10b981' } }, bull ? fmtPct(bull / price - 1) : '—')
        ),
        h('div', { className: 'metric-card' },
            h('div', { className: 'label' }, 'SIGNAL'),
            h('div', { className: 'value', style: {
                fontSize: 16,
                color: base == null ? 'var(--text-muted)'
                    : base > price * 1.15 ? '#10b981'
                    : base < price * 0.85 ? '#ef4444' : '#f59e0b'
            } },
                base == null ? '—'
                    : base > price * 1.15 ? 'Undervalued'
                    : base < price * 0.85 ? 'Overvalued' : 'Fair Value'
            ),
            h('div', { className: 'sub' }, price ? 'Current: ' + fmtCurrency(price) : '')
        )
    );

    // Range bar: show bear → price → bull
    var rangeBar = (bear && bull && bear < bull) ? h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Valuation Range'),
        h('div', { style: { position: 'relative', height: 40, marginTop: 8 } },
            h('div', { style: { position: 'absolute', top: '50%', left: 0, right: 0, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, transform: 'translateY(-50%)' } }),
            // Bear-to-Bull fill
            (function() {
                var lo = Math.min(bear, bull, price) * 0.95;
                var hi = Math.max(bear, bull, price) * 1.05;
                var span = hi - lo;
                var leftPct = ((bear - lo) / span * 100).toFixed(1) + '%';
                var widthPct = (((bull - bear) / span) * 100).toFixed(1) + '%';
                var pricePct = (((price - lo) / span) * 100).toFixed(1) + '%';
                return [
                    h('div', { key: 'range', style: { position: 'absolute', top: '50%', left: leftPct, width: widthPct, height: 6, background: 'linear-gradient(90deg, #ef4444, #f59e0b, #10b981)', borderRadius: 3, transform: 'translateY(-50%)', opacity: 0.5 } }),
                    h('div', { key: 'price', style: { position: 'absolute', top: '50%', left: pricePct, width: 14, height: 14, background: '#00d4ff', borderRadius: '50%', transform: 'translate(-50%, -50%)', boxShadow: '0 0 8px rgba(0,212,255,0.8)', zIndex: 2 } }),
                    h('div', { key: 'plabel', style: { position: 'absolute', top: '100%', left: pricePct, transform: 'translateX(-50%)', fontSize: 10, color: '#00d4ff', marginTop: 4, whiteSpace: 'nowrap' } }, 'Current ' + fmtCurrency(price)),
                ];
            })()
        )
    ) : null;

    // Per-scenario detail table
    var table = h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Model Detail by Scenario'),
        h('div', { style: { overflowX: 'auto' } },
            h('table', { className: 'data-table' },
                h('thead', null,
                    h('tr', null,
                        ['Model', 'Bear', 'Base', 'Bull'].map(function(col) {
                            return h('th', { key: col }, col);
                        })
                    )
                ),
                h('tbody', null,
                    (function() {
                        var models = [];
                        ['FCFF DCF', 'Gordon DDM', 'Residual Inc.'].forEach(function(m) {
                            models.push(h('tr', { key: m },
                                h('td', { style: { fontWeight: 600 } }, m),
                                ['BEAR', 'BASE', 'BULL'].map(function(sc) {
                                    var found = res[sc].vals.find(function(v) { return v.model === m; });
                                    var val = found ? found.value : null;
                                    var up = val && price ? val / price - 1 : null;
                                    return h('td', { key: sc, style: { color: scColors[sc] } },
                                        val ? fmtCurrency(val) + (up != null ? ' (' + fmtPct(up) + ')' : '') : '—');
                                })
                            ));
                        });
                        // Composite row
                        models.push(h('tr', { key: 'composite', style: { borderTop: '1px solid rgba(255,255,255,0.1)' } },
                            h('td', { style: { fontWeight: 700 } }, 'Composite'),
                            ['BEAR', 'BASE', 'BULL'].map(function(sc) {
                                var c = res[sc].composite;
                                var up = c && price ? c / price - 1 : null;
                                return h('td', { key: sc, style: { fontWeight: 700, color: scColors[sc] } },
                                    c ? fmtCurrency(c) + (up != null ? ' (' + fmtPct(up) + ')' : '') : '—');
                            })
                        ));
                        return models;
                    })()
                )
            )
        )
    );

    return h('div', null, headerTiles, rangeBar, table);
}

// -----------------------------------------------------------------------

var TABS = [
    { id: 'consensus', label: 'Consensus' },
    { id: 'fcff', label: 'FCFF DCF' },
    { id: 'ddm', label: 'Dividend Discount' },
    { id: 'ri', label: 'Residual Income' },
    { id: 'sim', label: 'Simulation' },
];

export function DCFEngine(p) {
    var financials = p.financials, overview = p.overview, series = p.series;
    var _t = useState('consensus'), tab = _t[0], setTab = _t[1];

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
    if (tab === 'consensus') content = h(ConsensusPanel, { defaults: defaults, price: price });
    else if (tab === 'fcff') content = h(FcffPanel, { defaults: defaults, price: price });
    else if (tab === 'ddm') content = h(DdmPanel, { defaults: defaults, price: price });
    else if (tab === 'ri') content = h(RiPanel, { defaults: defaults, price: price });
    else if (tab === 'sim') content = h(SimPanel, { defaults: defaults, price: price });

    return h('div', null,
        h(SubTab, { tabs: TABS, active: tab, onSelect: setTab }),
        content
    );
}
