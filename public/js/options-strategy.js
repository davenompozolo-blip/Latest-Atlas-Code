// ============================================================
// ATLAS Options Analysis — Strategy Builder Tab
// ============================================================

import { OC, oFmt, oFmtPct, fetchExpiries, fetchChain, apiFetch } from './options-analysis.js';

var h         = React.createElement;
var useState  = React.useState;
var useEffect = React.useEffect;
var useRef    = React.useRef;

// ── Strategy presets ──────────────────────────────────────────
var PRESETS = [
    { id: 'long_call',   name: 'Long Call',        legs: [{ type:'C', action:'buy',  strikeFn:'atm'      }] },
    { id: 'long_put',    name: 'Long Put',          legs: [{ type:'P', action:'buy',  strikeFn:'atm'      }] },
    { id: 'bull_call',   name: 'Bull Call Spread',  legs: [{ type:'C', action:'buy',  strikeFn:'atm'      }, { type:'C', action:'sell', strikeFn:'otm1'     }] },
    { id: 'bear_put',    name: 'Bear Put Spread',   legs: [{ type:'P', action:'buy',  strikeFn:'atm'      }, { type:'P', action:'sell', strikeFn:'itm1_put' }] },
    { id: 'straddle',    name: 'Straddle',          legs: [{ type:'C', action:'buy',  strikeFn:'atm'      }, { type:'P', action:'buy',  strikeFn:'atm'      }] },
    { id: 'strangle',    name: 'Strangle',          legs: [{ type:'C', action:'buy',  strikeFn:'otm1'     }, { type:'P', action:'buy',  strikeFn:'otm1_put' }] },
    { id: 'iron_condor', name: 'Iron Condor',       legs: [
        { type:'P', action:'buy',  strikeFn:'otm2_put' },
        { type:'P', action:'sell', strikeFn:'otm1_put' },
        { type:'C', action:'sell', strikeFn:'otm1'     },
        { type:'C', action:'buy',  strikeFn:'otm2'     },
    ]},
    { id: 'custom',      name: '+ Custom',          legs: [] },
];

// Find ATM index in a sorted list of contracts
function atmIdx(list, cp) {
    var best = 0, bestDiff = Infinity;
    list.forEach(function (c, i) {
        var d = Math.abs(c.strike - cp);
        if (d < bestDiff) { bestDiff = d; best = i; }
    });
    return best;
}

function resolveContract(chains, legDef, cp) {
    var calls = chains.calls.slice().sort(function (a, b) { return a.strike - b.strike; });
    var puts  = chains.puts.slice().sort(function (a, b)  { return a.strike - b.strike; });
    var ci = atmIdx(calls, cp);
    var pi = atmIdx(puts, cp);
    var pickC = function (off) { return calls[Math.max(0, Math.min(calls.length - 1, ci + off))]; };
    var pickP = function (off) { return puts[Math.max(0, Math.min(puts.length  - 1, pi + off))]; };
    var map = {
        atm:      pickC(0),
        otm1:     pickC(1),
        otm2:     pickC(2),
        itm1:     pickC(-1),
        atm_put:  pickP(0),
        otm1_put: pickP(-1),
        otm2_put: pickP(-2),
        itm1_put: pickP(1),
    };
    return map[legDef.strikeFn] || pickC(0);
}

// ── Combined payoff ───────────────────────────────────────────
function combinedPayoff(legs, price) {
    return legs.reduce(function (sum, leg) {
        if (!leg.strike) return sum;
        var premium  = leg.action === 'buy' ? (leg.ask || 0) : (leg.bid || 0);
        var intrinsic = leg.type === 'C'
            ? Math.max(0, price - leg.strike)
            : Math.max(0, leg.strike - price);
        var pnl = leg.action === 'buy'
            ? (intrinsic - premium) * 100 * (leg.qty || 1)
            : (premium - intrinsic) * 100 * (leg.qty || 1);
        return sum + pnl;
    }, 0);
}

// ── Strategy payoff chart ─────────────────────────────────────
function StrategyChart(p) {
    var plotRef = useRef(null);

    useEffect(function () {
        var valid = (p.legs || []).filter(function (l) { return l.strike; });
        if (!valid.length || !plotRef.current) return;
        var cp = p.currentPrice || valid[0].strike;
        var lo = cp * 0.60, hi = cp * 1.40, step = (hi - lo) / 250;
        var prices = [], pnl = [];
        for (var x = lo; x <= hi; x += step) {
            var px = parseFloat(x.toFixed(2));
            prices.push(px);
            pnl.push(combinedPayoff(valid, px));
        }
        var maxP = Math.max.apply(null, pnl);
        var minP = Math.min.apply(null, pnl);
        var range = Math.max(Math.abs(maxP), Math.abs(minP)) * 1.15 || 500;

        // Find zero crossings (breakevens)
        var breakevens = [];
        for (var i = 0; i < pnl.length - 1; i++) {
            if ((pnl[i] <= 0 && pnl[i + 1] >= 0) || (pnl[i] >= 0 && pnl[i + 1] <= 0)) {
                var be = prices[i] + (prices[i + 1] - prices[i]) * (-pnl[i] / (pnl[i + 1] - pnl[i]));
                breakevens.push(parseFloat(be.toFixed(2)));
            }
        }

        var traces = [
            { x: [lo, hi], y: [0, 0], mode: 'lines', line: { color: 'rgba(255,255,255,0.12)', dash: 'dash', width: 1 }, hoverinfo: 'skip', showlegend: false },
            { x: [cp, cp], y: [-range, range], mode: 'lines', line: { color: OC.amber, dash: 'dot', width: 1.5 }, hoverinfo: 'skip', showlegend: false },
            { x: prices, y: pnl, mode: 'lines', fill: 'tozeroy', fillcolor: OC.indigo + '1a',
              line: { color: OC.indigo, width: 2.5 },
              hovertemplate: 'Price: $%{x:.2f}<br>P&L: $%{y:,.0f}<extra></extra>', showlegend: false },
        ];
        breakevens.forEach(function (be) {
            traces.push({ x: [be, be], y: [-range, range], mode: 'lines',
                line: { color: 'rgba(255,255,255,0.3)', dash: 'dot', width: 1 },
                hoverinfo: 'skip', showlegend: false });
        });

        var annotations = [{ x: cp, y: range * 0.9, text: 'Now $' + oFmt(cp, 2), showarrow: false, font: { color: OC.amber, size: 9 }, xanchor: 'center' }];
        breakevens.forEach(function (be) {
            annotations.push({ x: be, y: -range * 0.85, text: 'B/E $' + oFmt(be, 2), showarrow: false, font: { color: 'rgba(255,255,255,0.5)', size: 9 }, xanchor: 'center' });
        });

        Plotly.react(plotRef.current, traces, {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 64, r: 20, t: 10, b: 52 },
            xaxis: { title: { text: 'Underlying Price at Expiry', font: { color: OC.muted, size: 10 } }, tickprefix: '$', tickfont: { color: OC.muted, size: 10, family: 'JetBrains Mono' }, gridcolor: 'rgba(255,255,255,0.05)', zeroline: false },
            yaxis: { title: { text: 'Combined P&L ($)', font: { color: OC.muted, size: 10 } }, tickprefix: '$', tickformat: ',.0f', tickfont: { color: OC.muted, size: 10, family: 'JetBrains Mono' }, gridcolor: 'rgba(255,255,255,0.05)', zeroline: true, zerolinecolor: 'rgba(255,255,255,0.15)', range: [-range, range] },
            annotations: annotations,
            showlegend: false,
        }, { responsive: true, displayModeBar: false });
    }, [p.legs, p.currentPrice]);

    return h('div', { ref: plotRef, style: { height: 380, width: '100%' } });
}

// ── Single leg row ────────────────────────────────────────────
function LegRow(p) {
    var leg = p.leg;
    var contracts = p.chains ? (leg.type === 'C' ? p.chains.calls : p.chains.puts) : [];
    var actionCol = leg.action === 'buy' ? OC.green : OC.red;
    var typeCol   = leg.type   === 'C'  ? OC.green : OC.red;
    var selS = { padding: '4px 6px', borderRadius: 4, fontSize: 11, background: '#111', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' };

    return h('div', {
        style: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px',
            borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }
    },
        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: OC.muted, minWidth: 18 } }, '#' + (p.idx + 1)),
        h('select', { value: leg.action, onChange: function (e) { p.onUpdate({ action: e.target.value }); }, style: Object.assign({}, selS, { color: actionCol, fontWeight: 700 }) },
            h('option', { value: 'buy' }, 'BUY'), h('option', { value: 'sell' }, 'SELL')),
        h('input', { type: 'number', value: leg.qty || 1, min: 1, max: 50, step: 1,
            onChange: function (e) { p.onUpdate({ qty: Math.max(1, parseInt(e.target.value) || 1) }); },
            style: { width: 48, padding: '4px 6px', borderRadius: 4, fontSize: 11, background: '#111', border: '1px solid rgba(255,255,255,0.1)', color: OC.text, textAlign: 'center' } }),
        h('select', { value: leg.type, onChange: function (e) { p.onUpdate({ type: e.target.value, strike: null }); }, style: Object.assign({}, selS, { color: typeCol, fontWeight: 700 }) },
            h('option', { value: 'C' }, 'CALL'), h('option', { value: 'P' }, 'PUT')),
        h('select', {
            value: leg.strike != null ? leg.strike : '',
            onChange: function (e) {
                var s = Number(e.target.value);
                var found = contracts.find(function (c) { return c.strike === s; });
                if (found) p.onUpdate({ strike: s, bid: found.bid, ask: found.ask, iv: found.iv, delta: found.delta, symbol: found.symbol });
            },
            style: Object.assign({}, selS, { flex: 1, minWidth: 120, color: OC.text })
        },
            h('option', { value: '' }, 'Strike…'),
            contracts.map(function (c) {
                return h('option', { key: c.strike, value: c.strike },
                    '$' + oFmt(c.strike, 2) + (c.ask ? '  ask $' + oFmt(c.ask, 2) : ''));
            })
        ),
        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: OC.sec, minWidth: 52, textAlign: 'right' } },
            leg.action === 'buy' ? (leg.ask ? '$' + oFmt(leg.ask, 2) : '—') : (leg.bid ? '$' + oFmt(leg.bid, 2) : '—')),
        h('button', { onClick: p.onRemove, style: { background: 'transparent', border: 'none', color: OC.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' } }, '×')
    );
}

// ── Strategy tab ──────────────────────────────────────────────
export function StrategyTab(p) {
    var _pid   = useState('long_call'); var pid     = _pid[0];   var setPid     = _pid[1];
    var _exp   = useState(null);        var expiry  = _exp[0];   var setExpiry  = _exp[1];
    var _exps  = useState([]);          var expiries = _exps[0]; var setExpiries = _exps[1];
    var _ch    = useState(null);        var chains  = _ch[0];    var setChains  = _ch[1];
    var _legs  = useState([]);          var legs    = _legs[0];  var setLegs    = _legs[1];
    var _price = useState(null);        var price   = _price[0]; var setPrice   = _price[1];
    var _ld    = useState(false);       var loading = _ld[0];    var setLoading = _ld[1];
    var _err   = useState(null);        var err     = _err[0];   var setErr     = _err[1];

    // Current price
    useEffect(function () {
        if (!p.symbol) return;
        apiFetch('/api/trading?action=quote&symbol=' + encodeURIComponent(p.symbol))
            .then(function (j) { if (j.last) setPrice(j.last); })
            .catch(function () {});
    }, [p.symbol]);

    // Load expiries
    useEffect(function () {
        if (!p.symbol) return;
        setExpiries([]); setExpiry(null); setChains(null); setLegs([]);
        fetchExpiries(p.symbol)
            .then(function (j) {
                if (j && j.error) { setErr(j.error); return; }
                var list = Array.isArray(j) ? j : [];
                setExpiries(list);
                if (list.length) setExpiry(list[0]);
            })
            .catch(function (e) { setErr(e.message); });
    }, [p.symbol]);

    // Load chain for expiry
    useEffect(function () {
        if (!p.symbol || !expiry) return;
        setLoading(true); setChains(null);
        fetchChain(p.symbol, expiry)
            .then(function (j) {
                if (j.error) { setErr(j.error); setLoading(false); return; }
                setChains(j);
                setLoading(false);
                buildLegs(j, pid);
            })
            .catch(function (e) { setErr(e.message); setLoading(false); });
    }, [p.symbol, expiry]);

    function buildLegs(chainData, stratId) {
        var preset = PRESETS.find(function (s) { return s.id === stratId; });
        if (!preset || !preset.legs.length || !chainData) { setLegs([]); return; }
        var cp = price || 0;
        setLegs(preset.legs.map(function (def) {
            var c = resolveContract(chainData, def, cp);
            return { type: def.type, action: def.action, qty: 1,
                strike: c ? c.strike : null, bid: c ? c.bid : null,
                ask: c ? c.ask : null, iv: c ? c.iv : null,
                delta: c ? c.delta : null, symbol: c ? c.symbol : null };
        }));
    }

    function changePid(id) {
        setPid(id);
        if (chains) buildLegs(chains, id);
        else setLegs([]);
    }

    function updateLeg(i, changes) {
        setLegs(function (prev) { var n = prev.slice(); n[i] = Object.assign({}, n[i], changes); return n; });
    }
    function removeLeg(i) { setLegs(function (prev) { return prev.filter(function (_, j) { return j !== i; }); }); }
    function addLeg() {
        var mid = chains ? chains.calls[Math.floor(chains.calls.length / 2)] : null;
        setLegs(function (prev) { return prev.concat([{ type: 'C', action: 'buy', qty: 1, strike: mid ? mid.strike : null, bid: mid ? mid.bid : null, ask: mid ? mid.ask : null, iv: mid ? mid.iv : null, delta: mid ? mid.delta : null }]); });
    }

    var valid = legs.filter(function (l) { return l.strike; });
    var netCost = legs.reduce(function (s, l) {
        return s + (l.action === 'buy' ? (l.ask || 0) : -(l.bid || 0)) * 100 * (l.qty || 1);
    }, 0);
    var netDelta = legs.reduce(function (s, l) {
        return s + (l.delta || 0) * (l.action === 'buy' ? 1 : -1) * (l.qty || 1) * 100;
    }, 0);

    return h('div', { style: { display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14 } },
        // Left controls
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            // Strategy + expiry picker
            h('div', { style: { background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border, padding: '14px 16px' } },
                h('div', { style: { fontSize: 10, fontWeight: 700, color: OC.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 } }, 'Strategy'),
                h('select', { value: pid, onChange: function (e) { changePid(e.target.value); },
                    style: { width: '100%', padding: '7px 8px', borderRadius: 5, fontSize: 12, background: '#111827', border: '1px solid rgba(255,255,255,0.12)', color: OC.text, cursor: 'pointer', marginBottom: 10 } },
                    PRESETS.map(function (s) { return h('option', { key: s.id, value: s.id }, s.name); })
                ),
                expiries.length > 0 && h('div', null,
                    h('div', { style: { fontSize: 9, color: OC.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 } }, 'Expiry'),
                    h('select', { value: expiry || '', onChange: function (e) { setExpiry(e.target.value); },
                        style: { width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, background: '#111827', border: '1px solid rgba(255,255,255,0.12)', color: OC.text, cursor: 'pointer' } },
                        expiries.map(function (e) { return h('option', { key: e, value: e }, e); })
                    )
                )
            ),
            // Legs editor
            h('div', { style: { background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border, padding: '14px 16px' } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
                    h('div', { style: { fontSize: 10, fontWeight: 700, color: OC.muted, letterSpacing: 2, textTransform: 'uppercase' } }, 'Legs'),
                    h('button', { onClick: addLeg,
                        style: { padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: OC.indigo + '22', border: '1px solid ' + OC.indigo + '44', color: OC.indigo } }, '+ Add')
                ),
                loading && h('div', { style: { color: OC.muted, fontSize: 12, padding: 8 } }, 'Loading chain…'),
                err     && h('div', { style: { color: OC.amber, fontSize: 11, padding: 4 } }, '⚠ ' + err),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                    legs.map(function (leg, i) {
                        return h(LegRow, { key: i, idx: i, leg: leg, chains: chains,
                            onUpdate: function (ch) { updateLeg(i, ch); },
                            onRemove: function () { removeLeg(i); } });
                    })
                )
            ),
            // Net summary
            valid.length > 0 && h('div', { style: { background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border, padding: '14px 16px' } },
                h('div', { style: { fontSize: 10, fontWeight: 700, color: OC.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 } }, 'Net Position'),
                [
                    ['Net Δ Delta', (netDelta >= 0 ? '+' : '') + oFmt(netDelta, 2), netDelta > 0 ? OC.green : OC.red],
                    [netCost >= 0 ? 'Net Debit' : 'Net Credit', '$' + oFmt(Math.abs(netCost), 0) + ' / strategy', netCost >= 0 ? OC.red : OC.green],
                    ['Legs', String(valid.length), OC.text],
                ].map(function (r) {
                    return h('div', { key: r[0], style: { display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
                        h('span', { style: { fontSize: 11, color: OC.sec } }, r[0]),
                        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: r[2] } }, r[1])
                    );
                })
            )
        ),
        // Right: chart
        h('div', { style: { background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border, padding: '16px' } },
            h('div', { style: { fontSize: 10, fontWeight: 700, color: OC.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 } }, 'Combined Payoff at Expiry'),
            valid.length === 0 && h('div', { style: { height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center', color: OC.muted, fontSize: 12 } },
                'Configure legs to see the combined payoff diagram'),
            valid.length > 0 && h(StrategyChart, { legs: valid, currentPrice: price })
        )
    );
}
