import Plotly from 'plotly.js-dist-min';
import Chart from 'chart.js/auto';
import React from 'react';
// ============================================================
// ATLAS Options Analysis — Payoff Diagram Tab
// ============================================================

import { OC, oFmt, oFmtPct, apiFetch, ContractPicker, GreeksCard } from './options-analysis.js';

var h        = React.createElement;
var useState = React.useState;
var useEffect = React.useEffect;
var useRef   = React.useRef;

// ── Payoff math ───────────────────────────────────────────────
function contractPayoff(contract, underlyingPrice, action) {
    var premium  = action === 'buy' ? (contract.ask || 0) : (contract.bid || 0);
    var strike   = contract.strike;
    var intrinsic = contract.type === 'C'
        ? Math.max(0, underlyingPrice - strike)
        : Math.max(0, strike - underlyingPrice);
    return action === 'buy'
        ? (intrinsic - premium) * 100
        : (premium - intrinsic) * 100;
}

function breakeven(contract, action) {
    var premium = action === 'buy' ? (contract.ask || 0) : (contract.bid || 0);
    return contract.type === 'C' ? contract.strike + premium : contract.strike - premium;
}

function maxProfit(contract, action) {
    var premium = action === 'buy' ? (contract.ask || 0) : (contract.bid || 0);
    if (action === 'buy') {
        return contract.type === 'C' ? 'Unlimited' : '$' + oFmt((contract.strike - premium) * 100, 0);
    }
    return '$' + oFmt(premium * 100, 0);
}

function maxLoss(contract, action) {
    var premium = action === 'buy' ? (contract.ask || 0) : (contract.bid || 0);
    if (action === 'buy') return '$' + oFmt(premium * 100, 0);
    return contract.type === 'C' ? 'Unlimited' : '$' + oFmt((contract.strike - premium) * 100, 0);
}

// ── Payoff chart (Plotly) ─────────────────────────────────────
function PayoffChart(p) {
    var plotRef = useRef(null);

    useEffect(function () {
        if (!p.contract || !plotRef.current) return;
        var cp = p.currentPrice || p.contract.strike;
        var lo = cp * 0.60, hi = cp * 1.40;
        var step = (hi - lo) / 250;
        var prices = [], pnl = [];
        for (var x = lo; x <= hi; x += step) {
            var px = parseFloat(x.toFixed(2));
            prices.push(px);
            pnl.push(contractPayoff(p.contract, px, p.action));
        }
        var be    = breakeven(p.contract, p.action);
        var maxP  = Math.max.apply(null, pnl);
        var minP  = Math.min.apply(null, pnl);
        var range = Math.max(Math.abs(maxP), Math.abs(minP)) * 1.15;
        var col   = p.action === 'buy' ? OC.green : OC.red;

        var traces = [
            { x: [lo, hi], y: [0, 0], mode: 'lines',
              line: { color: 'rgba(255,255,255,0.12)', dash: 'dash', width: 1 },
              hoverinfo: 'skip', showlegend: false },
            { x: [cp, cp], y: [-range, range], mode: 'lines',
              line: { color: OC.amber, dash: 'dot', width: 1.5 },
              hoverinfo: 'skip', showlegend: false },
        ];
        if (be > lo && be < hi) {
            traces.push({ x: [be, be], y: [-range, range], mode: 'lines',
                line: { color: 'rgba(255,255,255,0.35)', dash: 'dot', width: 1.2 },
                hoverinfo: 'skip', showlegend: false });
        }
        traces.push({
            x: prices, y: pnl, mode: 'lines', fill: 'tozeroy',
            fillcolor: col + '18', line: { color: col, width: 2.5 },
            hovertemplate: 'Underlying: $%{x:.2f}<br>P&L: $%{y:,.0f}<extra></extra>',
            showlegend: false,
        });

        Plotly.react(plotRef.current, traces, {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 64, r: 20, t: 10, b: 52 },
            xaxis: { title: { text: 'Underlying Price at Expiry', font: { color: OC.muted, size: 10 } },
                tickprefix: '$', tickfont: { color: OC.muted, size: 10, family: 'JetBrains Mono' },
                gridcolor: 'rgba(255,255,255,0.05)', zeroline: false },
            yaxis: { title: { text: 'P&L per Contract ($)', font: { color: OC.muted, size: 10 } },
                tickprefix: '$', tickformat: ',.0f',
                tickfont: { color: OC.muted, size: 10, family: 'JetBrains Mono' },
                gridcolor: 'rgba(255,255,255,0.05)', zeroline: true,
                zerolinecolor: 'rgba(255,255,255,0.15)', range: [-range, range] },
            annotations: [
                { x: cp, y: range * 0.92, text: 'Now $' + oFmt(cp, 2), showarrow: false,
                  font: { color: OC.amber, size: 9 }, xanchor: 'center' },
                be > lo && be < hi ? { x: be, y: -range * 0.88, text: 'B/E $' + oFmt(be, 2),
                  showarrow: false, font: { color: 'rgba(255,255,255,0.5)', size: 9 }, xanchor: 'center' } : null,
            ].filter(Boolean),
            showlegend: false,
        }, { responsive: true, displayModeBar: false });
    }, [p.contract, p.action, p.currentPrice]);

    return h('div', { ref: plotRef, style: { height: 360, width: '100%' } });
}

// ── Trade summary card ────────────────────────────────────────
function TradeSummaryCard(p) {
    var c = p.contract;
    if (!c) return null;
    var premium = p.action === 'buy' ? (c.ask || 0) : (c.bid || 0);
    var be  = breakeven(c, p.action);
    var mxP = maxProfit(c, p.action);
    var mxL = maxLoss(c, p.action);
    var prob = c.delta != null ? (p.action === 'buy' ? Math.abs(c.delta) : 1 - Math.abs(c.delta)) : null;
    var profCol = prob != null ? (prob > 0.55 ? OC.green : prob < 0.45 ? OC.red : OC.amber) : OC.muted;

    function row(label, val, color) {
        return h('div', { key: label,
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }
        },
            h('span', { style: { fontSize: 11, color: OC.sec } }, label),
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: color || OC.text } }, val)
        );
    }

    return h('div', { style: { background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border, padding: '14px 16px' } },
        h('div', { style: { fontSize: 10, fontWeight: 700, color: OC.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 } }, 'Trade Summary'),
        row('Premium (' + (p.action === 'buy' ? 'ask' : 'bid') + ')',
            '$' + oFmt(premium, 2) + ' · $' + oFmt(premium * 100, 0) + '/contract', OC.sec),
        row('Breakeven at Expiry', '$' + oFmt(be, 2), OC.amber),
        row('Max Profit',  mxP, OC.green),
        row('Max Loss',    mxL, OC.red),
        prob != null && row('Est. Prob. Profit', oFmt(prob * 100, 0) + '%', profCol),
        c.theta != null && row('Time Decay / Day', '$' + oFmt(Math.abs(c.theta) * 100, 2), OC.red)
    );
}

// ── Payoff tab ────────────────────────────────────────────────
export function PayoffTab(p) {
    var _action = useState('buy'); var action = _action[0]; var setAction = _action[1];
    var _price  = useState(null); var price  = _price[0];  var setPrice  = _price[1];

    useEffect(function () {
        if (!p.symbol) return;
        apiFetch('/api/trading?action=quote&symbol=' + encodeURIComponent(p.symbol))
            .then(function (j) { if (j.last) setPrice(j.last); })
            .catch(function () {});
    }, [p.symbol]);

    function pillBtn(a, active, col) {
        return {
            padding: '5px 20px', borderRadius: 5, fontSize: 12, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer',
            background: active ? col + '22' : 'transparent',
            border: '1px solid ' + (active ? col + '55' : 'rgba(255,255,255,0.08)'),
            color: active ? col : OC.muted,
        };
    }

    return h('div', { style: { display: 'grid', gridTemplateColumns: '280px 1fr', gap: 14 } },
        // Left column
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            h(ContractPicker, { symbol: p.symbol, onChange: p.onContract }),
            p.contract && h(GreeksCard, { contract: p.contract }),
            p.contract && h(TradeSummaryCard, { contract: p.contract, action: action })
        ),
        // Right column
        h('div', { style: { background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border, padding: '16px' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' } },
                h('span', { style: { fontSize: 10, color: OC.muted, letterSpacing: 1, textTransform: 'uppercase' } }, 'Position:'),
                h('button', { onClick: function () { setAction('buy'); }, style: pillBtn('buy', action === 'buy', OC.green) }, 'Long (Buy)'),
                h('button', { onClick: function () { setAction('sell'); }, style: pillBtn('sell', action === 'sell', OC.red) }, 'Short (Sell)'),
                price && h('span', { style: { marginLeft: 'auto', fontFamily: 'JetBrains Mono', fontSize: 12, color: OC.sec } },
                    'Underlying: $' + oFmt(price, 2))
            ),
            !p.contract && h('div', {
                style: { height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: OC.muted, fontSize: 12 }
            }, 'Select a contract on the left to see the payoff diagram'),
            p.contract && h(PayoffChart, { contract: p.contract, action: action, currentPrice: price })
        )
    );
}
