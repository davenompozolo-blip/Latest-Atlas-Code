import React from 'react';
import { fmt, fmtCurrency, fmtPct, useChart } from './utils.js';
import { runGordonDDM, runMultiStageDDM, Tile, Slider, fN } from './dcf-engine.js';

const { useState, useRef } = React;

function DivStreamChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.divStream || !p.divStream.length) return null;
        return {
            type: 'line',
            data: { labels: p.divStream.map(function(x){return 'Y'+x.year;}),
                    datasets: [
                      { label:'Dividend', data: p.divStream.map(function(x){return x.div;}),
                        borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.1)', tension:0.3, fill:true },
                      { label:'Present Value', data: p.divStream.map(function(x){return x.pv;}),
                        borderColor:'#00d4ff', backgroundColor:'rgba(0,212,255,0.1)', tension:0.3, fill:true } ] },
            options: { responsive:true, maintainAspectRatio:false,
                       plugins:{ legend:{ labels:{ color:'rgba(255,255,255,0.7)' } } },
                       scales:{ y:{ ticks:{ color:'rgba(255,255,255,0.6)', callback:function(v){return '$'+v.toFixed(2);} },
                                    grid:{ color:'rgba(255,255,255,0.05)' } },
                                x:{ ticks:{ color:'rgba(255,255,255,0.6)' }, grid:{display:false} } } }
        };
    }, [p.divStream]);
    return React.createElement('div', { style:{ height:240 } }, React.createElement('canvas', { ref:ref }));
}

export function DdmPanel(p) {
    var defaults = p.defaults || {};
    var price = p.price;

    if (!defaults.divPerShare || defaults.divPerShare <= 0) {
        return React.createElement('div', { className:'card', style:{ padding:24, textAlign:'center', color:'var(--text-muted)' } },
            React.createElement('div', { style:{ fontSize:14, marginBottom:8, color:'#fbbf24' } }, 'No Dividend'),
            React.createElement('div', null, 'Dividend Discount Models require a dividend-paying stock. This security has no current dividend yield.'));
    }

    var coeState = useState(defaults.coe != null ? defaults.coe : 0.09);
    var coe = coeState[0], setCoe = coeState[1];
    var gordonGState = useState(0.03);
    var gordonG = gordonGState[0], setGordonG = gordonGState[1];
    var highGState = useState(0.08);
    var highG = highGState[0], setHighG = highGState[1];
    var stableGState = useState(0.025);
    var stableG = stableGState[0], setStableG = stableGState[1];
    var highYearsState = useState(5);
    var highYears = highYearsState[0], setHighYears = highYearsState[1];

    var g = runGordonDDM(defaults.divPerShare, coe, gordonG);
    var ms = runMultiStageDDM(defaults.divPerShare, coe, highG, stableG, highYears);

    return React.createElement('div', null,
        React.createElement('div', { className:'card', style:{ marginBottom:16 } },
            React.createElement('div', { className:'card-title' }, 'DDM Assumptions'),
            React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 } },
                React.createElement(Slider, {
                    label:'Cost of Equity', value:coe, onChange:setCoe,
                    min:0.04, max:0.20, step:0.005, fmt:function(v){ return (v*100).toFixed(2)+'%'; }
                }),
                React.createElement(Slider, {
                    label:'Gordon Growth', value:gordonG, onChange:setGordonG,
                    min:0, max:0.06, step:0.0025, fmt:function(v){ return (v*100).toFixed(2)+'%'; }
                }),
                React.createElement(Slider, {
                    label:'High Growth', value:highG, onChange:setHighG,
                    min:0, max:0.25, step:0.01, fmt:function(v){ return (v*100).toFixed(2)+'%'; }
                }),
                React.createElement(Slider, {
                    label:'Stable Growth', value:stableG, onChange:setStableG,
                    min:0, max:0.06, step:0.0025, fmt:function(v){ return (v*100).toFixed(2)+'%'; }
                }),
                React.createElement(Slider, {
                    label:'High Growth Years', value:highYears, onChange:setHighYears,
                    min:3, max:10, step:1, fmt:function(v){ return v + 'Y'; }
                })
            )
        ),
        React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 } },
            React.createElement('div', { className:'card' },
                React.createElement('div', { className:'card-title' }, 'Gordon Growth Model'),
                React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 } },
                    React.createElement(Tile, {
                        label:'Intrinsic',
                        value: g ? fmtCurrency(g.value) : '\u2014',
                        color: g && price ? (g.value > price ? '#10b981' : '#ef4444') : null
                    }),
                    React.createElement(Tile, {
                        label:'Year 1 Dividend',
                        value: g ? fmtCurrency(g.d1) : '\u2014'
                    }),
                    React.createElement(Tile, {
                        label:'vs Current Price',
                        value: g && price ? fmtPct(g.value/price - 1) : '\u2014',
                        color: g && price ? (g.value > price ? '#10b981' : '#ef4444') : null
                    })
                )
            ),
            React.createElement('div', { className:'card' },
                React.createElement('div', { className:'card-title' }, 'Multi-Stage DDM'),
                React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 } },
                    React.createElement(Tile, {
                        label:'Intrinsic',
                        value: ms ? fmtCurrency(ms.value) : '\u2014',
                        color: ms && price ? (ms.value > price ? '#10b981' : '#ef4444') : null
                    }),
                    React.createElement(Tile, {
                        label:'PV of Dividends',
                        value: ms ? fmtCurrency(ms.pvDiv) : '\u2014'
                    }),
                    React.createElement(Tile, {
                        label:'PV of Terminal',
                        value: ms ? fmtCurrency(ms.pvTv) : '\u2014'
                    })
                )
            )
        ),
        React.createElement('div', { className:'card' },
            React.createElement('div', { className:'card-title' }, 'Dividend Projection (Multi-Stage)'),
            ms && ms.divStream
                ? React.createElement(DivStreamChart, { divStream: ms.divStream })
                : React.createElement('div', { style:{ color:'var(--text-muted)', padding:16, textAlign:'center' } },
                    'Unable to project dividend stream with current assumptions.')
        )
    );
}
