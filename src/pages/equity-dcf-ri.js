import React from 'react';
import { fmt, fmtPct, fmtCurrency, useChart } from './utils.js';
import { runResidualIncome, Tile, Slider, fN } from './dcf-engine.js';

const { useState, useRef } = React;

function RiBarChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.riStream || !p.riStream.length) return null;
        var colors = p.riStream.map(function(x){
            return x.ri >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)';
        });
        var borders = p.riStream.map(function(x){
            return x.ri >= 0 ? '#10b981' : '#ef4444';
        });
        return {
            type: 'bar',
            data: { labels: p.riStream.map(function(x){return 'Y'+x.year;}),
                    datasets: [{ label:'Residual Income', data: p.riStream.map(function(x){return x.ri;}),
                                 backgroundColor:colors, borderColor:borders, borderWidth:1 }] },
            options: { responsive:true, maintainAspectRatio:false,
                       plugins:{ legend:{display:false} },
                       scales:{ y:{ ticks:{ color:'rgba(255,255,255,0.6)', callback:function(v){return '$'+v.toFixed(2);} },
                                    grid:{ color:'rgba(255,255,255,0.05)' } },
                                x:{ ticks:{ color:'rgba(255,255,255,0.6)' }, grid:{display:false} } } }
        };
    }, [p.riStream]);
    return React.createElement('div', { style:{ height:240 } }, React.createElement('canvas', { ref:ref }));
}

export function RiPanel(p) {
    var defaults = p.defaults, price = p.price;

    if (!defaults.bookValue || defaults.bookValue <= 0) {
        return React.createElement('div', { className:'card', style:{ padding:24, textAlign:'center', color:'var(--text-muted)' } },
            React.createElement('div', { style:{ fontSize:14, marginBottom:8, color:'#fbbf24' } }, 'No Book Value Data'),
            React.createElement('div', null, 'Residual Income valuation requires book value per share data.'));
    }

    var _c = useState(defaults.coe), riCoe = _c[0], setCoe = _c[1];
    var _r = useState(defaults.roe), riRoe = _r[0], setRoe = _r[1];
    var _g = useState(0.03), riGrowth = _g[0], setGrowth = _g[1];
    var _y = useState(10), riYears = _y[0], setYears = _y[1];
    var _rr = useState(0.6), retention = _rr[0], setRetention = _rr[1];

    var sliderGrid = React.createElement('div', {
        style: { display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:16, marginBottom:16 }
    },
        React.createElement(Slider, { label:'Cost of Equity', value:riCoe, min:0.04, max:0.20, step:0.005, onChange:setCoe, fmt:fmtPct }),
        React.createElement(Slider, { label:'ROE', value:riRoe, min:0.01, max:0.60, step:0.01, onChange:setRoe, fmt:fmtPct }),
        React.createElement(Slider, { label:'Terminal Growth', value:riGrowth, min:0, max:0.06, step:0.0025, onChange:setGrowth, fmt:fmtPct }),
        React.createElement(Slider, { label:'Forecast Years', value:riYears, min:5, max:15, step:1, onChange:setYears, fmt:function(v){return fN(v,0)+'y';} }),
        React.createElement(Slider, { label:'Retention Ratio', value:retention, min:0, max:1, step:0.05, onChange:setRetention, fmt:function(v){return fN(v*100,0)+'%';} })
    );

    var ri = runResidualIncome(defaults.bookValue, riRoe, riCoe, riGrowth, riYears, retention);

    var upsideColor = ri && price ? (ri.value > price ? '#10b981' : (ri.value < price ? '#ef4444' : null)) : null;
    var intrinsicColor = ri && price && ri.value > price ? '#00d4ff' : upsideColor;

    var tiles = React.createElement('div', {
        style: { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:16 }
    },
        React.createElement(Tile, { label:'Intrinsic Value', value: ri ? fmtCurrency(ri.value) : '\u2014', color: intrinsicColor }),
        React.createElement(Tile, { label:'Book Value (Anchor)', value: fmtCurrency(defaults.bookValue) }),
        React.createElement(Tile, { label:'PV of Residual Income', value: ri ? fmtCurrency(ri.pvRI) : '\u2014' }),
        React.createElement(Tile, { label:'PV of Terminal Value', value: ri ? fmtCurrency(ri.pvTv) : '\u2014' })
    );

    var spread = riRoe - riCoe;
    var spreadColor = spread > 0 ? '#10b981' : (spread < 0 ? '#ef4444' : null);
    var spreadCard = React.createElement('div', { className:'card', style:{ marginBottom:16, padding:16 } },
        React.createElement('div', { style:{ fontSize:13, fontWeight:600, color:spreadColor, marginBottom:4 } },
            'ROE \u2212 Cost of Equity Spread = ' + fmtPct(spread)),
        React.createElement('div', { style:{ fontSize:11, color:'var(--text-sec)' } },
            'Positive spread indicates the company creates value above its cost of capital.')
    );

    var chartCard = ri ? React.createElement('div', { className:'card', style:{ marginBottom:16 } },
        React.createElement('div', { className:'card-title' }, 'Residual Income by Year'),
        React.createElement(RiBarChart, { riStream: ri.riStream })
    ) : null;

    var upsidePct = ri && price ? (ri.value / price - 1) : null;
    var upsideRowColor = upsidePct != null ? (upsidePct > 0 ? '#10b981' : (upsidePct < 0 ? '#ef4444' : null)) : null;
    var upsideRow = ri && price ? React.createElement('div', {
        style: { fontSize:12, color: upsideRowColor, padding:'8px 4px' }
    }, 'Per-Share Upside vs Current Price: ' + fmtPct(upsidePct)) : null;

    return React.createElement('div', null, sliderGrid, tiles, spreadCard, chartCard, upsideRow);
}
