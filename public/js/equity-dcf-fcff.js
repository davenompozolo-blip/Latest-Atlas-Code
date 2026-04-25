import { fmt, fmtPct, fmtCurrency, useChart } from './utils.js';
import { runFCFF, Tile, Slider, fN, fB } from './dcf-engine.js';

const { useState, useRef } = React;

var SCENARIOS = {
    BEAR: { label: 'Bear', color: '#ef4444', wacc: 0.12, tg: 0.015, revG: -0.02, fcfM: 0.08, years: 5 },
    BASE: { label: 'Base', color: '#f59e0b', wacc: null,  tg: 0.025, revG: null,  fcfM: null,  years: 5 },
    BULL: { label: 'Bull', color: '#10b981', wacc: 0.07,  tg: 0.035, revG: null,  fcfM: null,  years: 7 },
};

function ScenarioBar(p) {
    return React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
        Object.entries(SCENARIOS).map(function(entry) {
            var id = entry[0], s = entry[1];
            var active = p.active === id;
            return React.createElement('button', {
                key: id,
                onClick: function() { p.onSelect(id); },
                style: {
                    flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    border: '1px solid ' + (active ? s.color : 'rgba(255,255,255,0.08)'),
                    background: active ? s.color + '22' : 'rgba(255,255,255,0.03)',
                    color: active ? s.color : 'rgba(255,255,255,0.5)',
                    letterSpacing: 1, textTransform: 'uppercase', transition: 'all 0.15s ease',
                }
            }, s.label);
        })
    );
}

function FcfChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.projections || !p.projections.length) return null;
        return {
            type: 'bar',
            data: { labels: p.projections.map(function(x){return 'Y'+x.year;}),
                    datasets: [{ label:'FCF', data: p.projections.map(function(x){return x.fcf;}),
                                 backgroundColor:'rgba(0,212,255,0.6)', borderColor:'#00d4ff', borderWidth:1 }] },
            options: { responsive:true, maintainAspectRatio:false,
                       plugins:{ legend:{display:false} },
                       scales:{ y:{ ticks:{ color:'rgba(255,255,255,0.6)', callback:function(v){return fB(v);} },
                                    grid:{ color:'rgba(255,255,255,0.05)' } },
                                x:{ ticks:{ color:'rgba(255,255,255,0.6)' }, grid:{display:false} } } }
        };
    }, [p.projections]);
    return React.createElement('div', { style:{ height:240 } }, React.createElement('canvas', { ref:ref }));
}

function Row(p) {
    var style = { display: 'flex', justifyContent: 'space-between', padding: '8px 0' };
    if (p.topBorder) style.borderTop = '1px solid rgba(255,255,255,0.08)';
    if (p.bold) style.fontWeight = 600;
    if (p.small) style.fontSize = 11;
    if (p.color) style.color = p.color;
    return React.createElement('div', { style: style },
        React.createElement('span', null, p.label),
        React.createElement('span', null, p.value)
    );
}

export function FcffPanel(p) {
    var defaults = p.defaults, price = p.price;
    var _w = useState(defaults.wacc), wacc = _w[0], setWacc = _w[1];
    var _t = useState(0.025), tg = _t[0], setTg = _t[1];
    var _r = useState(defaults.revGrowth), revG = _r[0], setRevG = _r[1];
    var _m = useState(defaults.fcfMargin), fcfM = _m[0], setFcfM = _m[1];
    var _y = useState(5), years = _y[0], setYears = _y[1];
    var _sc = useState('BASE'), scenario = _sc[0], setScenario = _sc[1];

    function applyScenario(id) {
        var s = SCENARIOS[id];
        setScenario(id);
        setWacc(s.wacc != null ? s.wacc : defaults.wacc);
        setTg(s.tg);
        setRevG(s.revG != null ? s.revG : defaults.revGrowth);
        setFcfM(s.fcfM != null ? s.fcfM : defaults.fcfMargin);
        setYears(s.years);
    }

    var sliderGrid = React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 16 }
    },
        React.createElement(Slider, { label: 'WACC', value: wacc, min: 0.04, max: 0.20, step: 0.005, onChange: setWacc, fmt: fmtPct }),
        React.createElement(Slider, { label: 'Terminal Growth', value: tg, min: 0, max: 0.06, step: 0.0025, onChange: setTg, fmt: fmtPct }),
        React.createElement(Slider, { label: 'Revenue Growth', value: revG, min: -0.10, max: 0.30, step: 0.01, onChange: setRevG, fmt: fmtPct }),
        React.createElement(Slider, { label: 'FCF Margin', value: fcfM, min: 0.02, max: 0.50, step: 0.01, onChange: setFcfM, fmt: fmtPct }),
        React.createElement(Slider, { label: 'Forecast Years', value: years, min: 3, max: 10, step: 1, onChange: setYears, fmt: function(v){return fN(v,0)+'y';} })
    );

    var r = runFCFF(defaults, wacc, tg, revG, fcfM, years);
    if (!r) {
        return React.createElement('div', null,
            React.createElement(ScenarioBar, { active: scenario, onSelect: applyScenario }),
            sliderGrid,
            React.createElement('div', { className: 'card', style: { color: 'var(--text-muted)', textAlign: 'center', padding: 24 } }, 'Insufficient data for FCFF DCF.')
        );
    }

    var upsideColor = r.upside > 0 ? '#10b981' : (r.upside < 0 ? '#ef4444' : null);

    var tiles = React.createElement('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }
    },
        React.createElement(Tile, { label: 'Intrinsic / Share', value: fmtCurrency(r.perShare), color: upsideColor }),
        React.createElement(Tile, { label: 'Current Price', value: fmtCurrency(price) }),
        React.createElement(Tile, { label: 'Upside', value: fmtPct(r.upside), color: upsideColor }),
        React.createElement(Tile, { label: 'TV % of EV', value: fmtPct(r.tvPct) })
    );

    var chartCard = React.createElement('div', { className: 'card', style: { marginBottom: 16 } },
        React.createElement('div', { className: 'card-title' }, 'Projected Free Cash Flow'),
        React.createElement(FcfChart, { projections: r.projections })
    );

    var netDebt = r.evTotal - r.eqValue;
    var waterfall = React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title' }, 'Valuation Bridge'),
        React.createElement(Row, { label: 'PV of Forecast FCF', value: fB(r.pvFcfSum) }),
        React.createElement(Row, { label: 'PV of Terminal Value', value: fB(r.pvTv) }),
        React.createElement(Row, { label: 'Enterprise Value', value: fB(r.evTotal), bold: true, topBorder: true }),
        React.createElement(Row, { label: 'Less: Net Debt', value: fB(netDebt) }),
        React.createElement(Row, { label: 'Equity Value', value: fB(r.eqValue), bold: true, topBorder: true }),
        React.createElement(Row, { label: '\u00f7 Shares Outstanding', value: fN(defaults.shares / 1e6, 1) + 'M', small: true }),
        React.createElement(Row, { label: 'Per-Share Value', value: fmtCurrency(r.perShare), bold: true, topBorder: true, color: '#00d4ff' })
    );

    return React.createElement('div', null,
        React.createElement(ScenarioBar, { active: scenario, onSelect: applyScenario }),
        sliderGrid, tiles, chartCard, waterfall);
}
