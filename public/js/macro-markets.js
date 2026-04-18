// ============================================================
// ATLAS Terminal — Cross-Asset Markets Panel
// ------------------------------------------------------------
// Macro Intelligence sub-panel: heatmap of daily cross-asset
// performance, credit spreads, risk barometer, intermarket
// summary.
//
// React 18 UMD, no JSX.  Consumes globals: React
// ============================================================

import { fmt, fmtPct, fmtCurrency } from './utils.js';
var h = React.createElement;

// --- Asset groups ---
var GROUPS = [
    { label: 'EQUITIES', symbols: ['SPY', 'QQQ', 'IWM', 'EFA', 'EEM'] },
    { label: 'FIXED INCOME', symbols: ['TLT', 'HYG', 'LQD'] },
    { label: 'ALTERNATIVES', symbols: ['GLD', 'USO', 'UUP'] },
];

// --- Helpers ---
function fN(n, d) { return n != null && isFinite(n) ? Number(n).toFixed(d != null ? d : 2) : '\u2014'; }

function latest(arr) {
    if (!arr || !arr.length) return null;
    return arr[arr.length - 1].value;
}

function heatBg(pct) {
    if (pct == null) return 'rgba(255,255,255,0.04)';
    var intensity = Math.min(Math.abs(pct) / 3, 1);
    if (pct > 0) return 'rgba(16,185,129,' + (0.08 + intensity * 0.25) + ')';
    if (pct < 0) return 'rgba(239,68,68,' + (0.08 + intensity * 0.25) + ')';
    return 'rgba(255,255,255,0.04)';
}

function changeColor(pct) {
    if (pct == null) return 'rgba(255,255,255,0.5)';
    if (pct > 0) return '#10b981';
    if (pct < 0) return '#ef4444';
    return 'rgba(255,255,255,0.6)';
}

function findQuote(market, sym) {
    if (!market) return null;
    return market.find(function(m) { return m.symbol === sym; }) || null;
}

function computeRiskSignal(market, credit) {
    var signals = [];
    var spy = findQuote(market, 'SPY');
    if (spy && spy.changePct != null) signals.push(spy.changePct > 0 ? 1 : -1);
    var tlt = findQuote(market, 'TLT');
    if (tlt && tlt.changePct != null) signals.push(tlt.changePct > 0 ? -0.5 : 0.5);
    var hy = credit && credit.hySpreads && credit.hySpreads.length > 0;
    if (hy) {
        var hyVal = credit.hySpreads[credit.hySpreads.length - 1].value;
        signals.push(hyVal > 5 ? -1 : hyVal > 4 ? -0.5 : 0.5);
    }
    if (!signals.length) return { label: 'N/A', color: 'rgba(255,255,255,0.5)' };
    var avg = signals.reduce(function(s, v) { return s + v; }, 0) / signals.length;
    if (avg > 0.3) return { label: 'RISK-ON', color: '#10b981' };
    if (avg < -0.3) return { label: 'RISK-OFF', color: '#ef4444' };
    return { label: 'NEUTRAL', color: '#f59e0b' };
}

function arrow(pct) {
    if (pct == null) return '\u2014';
    return pct > 0 ? '\u25B2' : pct < 0 ? '\u25BC' : '\u25C6';
}

// --- 1. Heatmap Cell ---
function HeatCell(p) {
    var q = p.quote;
    if (!q) return h('div', { style: {
        flex: 1, minWidth: 100, padding: 12, borderRadius: 8,
        background: 'rgba(255,255,255,0.04)', textAlign: 'center'
    } }, h('div', { style: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)' } }, p.symbol));

    return h('div', { style: {
        flex: 1, minWidth: 100, padding: 12, borderRadius: 8,
        background: heatBg(q.changePct), textAlign: 'center',
        transition: 'background 0.3s'
    } },
        h('div', { style: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 4 } }, q.symbol),
        h('div', { style: { fontSize: 13, fontFamily: "'JetBrains Mono', monospace", color: '#fff', marginBottom: 2 } }, fN(q.price)),
        h('div', { style: { fontSize: 12, fontWeight: 600, color: changeColor(q.changePct), fontFamily: "'JetBrains Mono', monospace" } },
            (q.changePct > 0 ? '+' : '') + fN(q.changePct) + '%'
        )
    );
}

// --- 2. Cross-Asset Heatmap ---
function Heatmap(p) {
    var market = p.market;
    return h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Cross-Asset Heatmap'),
        GROUPS.map(function(g) {
            return h('div', { key: g.label, style: { marginBottom: 16 } },
                h('div', { style: {
                    fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
                    textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)',
                    marginBottom: 8
                } }, g.label),
                h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                    g.symbols.map(function(sym) {
                        return h(HeatCell, { key: sym, symbol: sym, quote: findQuote(market, sym) });
                    })
                )
            );
        })
    );
}

// --- 3. Credit Spreads Card ---
function CreditCard(p) {
    var credit = p.credit || {};
    var hyVal = latest(credit.hySpreads);
    var igVal = latest(credit.igSpreads);
    var nfciVal = latest(credit.nfci);

    return h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Credit Spreads'),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            h('div', { className: 'metric-card' },
                h('div', { className: 'label' }, 'HY OAS'),
                h('div', { className: 'value', style: { color: hyVal != null && hyVal > 5 ? '#ef4444' : '#10b981', fontFamily: "'JetBrains Mono', monospace" } },
                    hyVal != null ? fN(hyVal) + '%' : '\u2014'
                )
            ),
            h('div', { className: 'metric-card' },
                h('div', { className: 'label' }, 'IG OAS'),
                h('div', { className: 'value', style: { fontFamily: "'JetBrains Mono', monospace" } },
                    igVal != null ? fN(igVal) + '%' : '\u2014'
                )
            ),
            h('div', { className: 'metric-card' },
                h('div', { className: 'label' }, 'NFCI'),
                h('div', { className: 'value', style: { color: nfciVal != null ? (nfciVal < 0 ? '#10b981' : '#ef4444') : null, fontFamily: "'JetBrains Mono', monospace" } },
                    nfciVal != null ? fN(nfciVal) : '\u2014'
                )
            )
        ),
        h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 10 } },
            'Negative NFCI = loose financial conditions'
        )
    );
}

// --- 4. Risk Barometer Card ---
function RiskBarometer(p) {
    var sig = computeRiskSignal(p.market, p.credit);
    var gaugeWidth = 100;
    var pos = sig.label === 'RISK-ON' ? 80 : sig.label === 'RISK-OFF' ? 20 : 50;

    return h('div', { className: 'card', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
        h('div', { className: 'card-title', style: { alignSelf: 'flex-start', width: '100%' } }, 'Risk Barometer'),
        h('div', { style: {
            fontSize: 22, fontWeight: 800, letterSpacing: 2,
            color: sig.color, marginTop: 16, marginBottom: 20,
            textShadow: '0 0 20px ' + sig.color + '44'
        } }, sig.label),
        // Gauge bar
        h('div', { style: { width: '80%', marginBottom: 8 } },
            h('div', { style: {
                height: 8, borderRadius: 4, width: '100%',
                background: 'linear-gradient(to right, #ef4444, #f59e0b, #10b981)',
                position: 'relative'
            } },
                h('div', { style: {
                    position: 'absolute', top: -4, width: 16, height: 16,
                    borderRadius: '50%', background: '#fff', border: '2px solid ' + sig.color,
                    left: 'calc(' + pos + '% - 8px)',
                    transition: 'left 0.4s ease',
                    boxShadow: '0 0 8px ' + sig.color
                } })
            )
        ),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', width: '80%', fontSize: 9, color: 'rgba(255,255,255,0.35)' } },
            h('span', null, 'Risk-Off'),
            h('span', null, 'Neutral'),
            h('span', null, 'Risk-On')
        )
    );
}

// --- 5. Intermarket Summary ---
function IntermarketRow(p) {
    return h('div', { style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)'
    } },
        h('span', { style: { fontSize: 12, color: 'rgba(255,255,255,0.7)' } }, p.label),
        h('span', { style: { fontSize: 12, fontWeight: 600, color: p.color, fontFamily: "'JetBrains Mono', monospace" } },
            p.arrow + ' ' + p.text
        )
    );
}

function IntermarketSummary(p) {
    var market = p.market;
    var spy = findQuote(market, 'SPY');
    var tlt = findQuote(market, 'TLT');
    var gld = findQuote(market, 'GLD');
    var uup = findQuote(market, 'UUP');

    // Stocks vs Bonds
    var svbText = '\u2014', svbColor = 'rgba(255,255,255,0.5)', svbArrow = '\u25C6';
    if (spy && tlt && spy.changePct != null && tlt.changePct != null) {
        var stocksUp = spy.changePct > 0;
        var bondsUp = tlt.changePct > 0;
        if (stocksUp && !bondsUp) { svbText = 'Risk-On rotation'; svbColor = '#10b981'; svbArrow = '\u25B2'; }
        else if (!stocksUp && bondsUp) { svbText = 'Flight to safety'; svbColor = '#ef4444'; svbArrow = '\u25BC'; }
        else if (stocksUp && bondsUp) { svbText = 'Broad rally'; svbColor = '#00d4ff'; svbArrow = '\u25B2'; }
        else { svbText = 'Broad selloff'; svbColor = '#f59e0b'; svbArrow = '\u25BC'; }
    }

    // Risk Appetite (SPY vs GLD)
    var raText = '\u2014', raColor = 'rgba(255,255,255,0.5)', raArrow = '\u25C6';
    if (spy && gld && spy.changePct != null && gld.changePct != null) {
        if (spy.changePct > 0 && gld.changePct <= 0) { raText = 'Risk-seeking'; raColor = '#10b981'; raArrow = '\u25B2'; }
        else if (spy.changePct <= 0 && gld.changePct > 0) { raText = 'Defensive'; raColor = '#ef4444'; raArrow = '\u25BC'; }
        else { raText = 'Mixed signals'; raColor = '#f59e0b'; raArrow = '\u25C6'; }
    }

    // Dollar
    var dolText = '\u2014', dolColor = 'rgba(255,255,255,0.5)', dolArrow = '\u25C6';
    if (uup && uup.changePct != null) {
        dolArrow = arrow(uup.changePct);
        dolColor = changeColor(uup.changePct);
        dolText = uup.changePct > 0 ? 'Strengthening' : uup.changePct < 0 ? 'Weakening' : 'Flat';
    }

    return h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Intermarket Summary'),
        h(IntermarketRow, { label: 'Stocks vs Bonds', text: svbText, color: svbColor, arrow: svbArrow }),
        h(IntermarketRow, { label: 'Risk Appetite', text: raText, color: raColor, arrow: raArrow }),
        h(IntermarketRow, { label: 'Dollar', text: dolText, color: dolColor, arrow: dolArrow })
    );
}

// --- Main Export ---
export function MarketsPanel(p) {
    var data = p.data || {};
    var market = data.market;
    var credit = data.credit;

    if (!market || !market.length) {
        return h('div', { className: 'card', style: { textAlign: 'center', padding: 40 } },
            h('div', { style: { color: 'rgba(255,255,255,0.4)', fontSize: 14 } }, 'Market data unavailable.')
        );
    }

    return h('div', null,
        // 1. Heatmap
        h(Heatmap, { market: market }),

        // 2. Credit & Risk side-by-side
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 } },
            h(CreditCard, { credit: credit }),
            h(RiskBarometer, { market: market, credit: credit })
        ),

        // 3. Intermarket Summary
        h('div', { style: { marginTop: 16 } },
            h(IntermarketSummary, { market: market })
        )
    );
}
