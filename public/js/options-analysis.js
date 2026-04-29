// ============================================================
// ATLAS Terminal — Options Analysis Module
// ------------------------------------------------------------
// Tabs: Payoff Diagram | Strategy Builder | IV Surface
// Data: /api/trading (Alpaca options snapshots + greeks)
// ============================================================

import { PayoffTab }   from './options-payoff.js';
import { StrategyTab } from './options-strategy.js';
import { IVSurfaceTab } from './options-iv.js';

var h          = React.createElement;
var useState   = React.useState;
var useEffect  = React.useEffect;
var useRef     = React.useRef;

// ── Shared palette ────────────────────────────────────────────
export var OC = {
    bg:     '#070814',
    card:   '#0d0f1a',
    border: 'rgba(255,255,255,0.06)',
    text:   'rgba(255,255,255,0.92)',
    sec:    'rgba(255,255,255,0.52)',
    muted:  'rgba(255,255,255,0.28)',
    cyan:   '#00d4ff',
    green:  '#10b981',
    red:    '#ef4444',
    amber:  '#f59e0b',
    indigo: '#6366f1',
    violet: '#8b5cf6',
};

// ── Shared formatters ─────────────────────────────────────────
export function oFmt(v, d) {
    if (v == null || !isFinite(Number(v))) return '—';
    return Number(v).toFixed(d != null ? d : 2);
}
export function oFmtPct(v) { return v != null && isFinite(v) ? oFmt(v * 100, 1) + '%' : '—'; }
export function oFmtD(v)   { return v != null && isFinite(v) ? oFmt(v, 4) : '—'; }

// ── Shared API helpers ────────────────────────────────────────
export function apiFetch(url) {
    return fetch(url).then(function (r) { return r.json(); });
}
export function fetchExpiries(sym) {
    return apiFetch('/api/trading?action=option_expiries&symbol=' + encodeURIComponent(sym));
}
export function fetchChain(sym, expiry) {
    return apiFetch('/api/trading?action=options_chain&symbol='
        + encodeURIComponent(sym) + '&expiry=' + encodeURIComponent(expiry));
}

// ── Symbol search ─────────────────────────────────────────────
function OSymbolSearch(p) {
    var _q = useState(p.value || ''); var q = _q[0]; var setQ = _q[1];
    var _s = useState([]); var sug = _s[0]; var setSug = _s[1];
    var _t = useRef(null);

    function search(v) {
        clearTimeout(_t.current);
        if (!v) { setSug([]); return; }
        _t.current = setTimeout(function () {
            apiFetch('/api/trading?action=search&q=' + encodeURIComponent(v))
                .then(function (j) { setSug(Array.isArray(j) ? j.slice(0, 8) : []); })
                .catch(function () { setSug([]); });
        }, 300);
    }

    function commit(sym) { setQ(sym); setSug([]); if (p.onLoad) p.onLoad(sym.toUpperCase()); }

    return h('div', { style: { position: 'relative', maxWidth: 340 } },
        h('div', { style: { display: 'flex', gap: 8 } },
            h('input', {
                value: q,
                onChange: function (e) { setQ(e.target.value); search(e.target.value); },
                onKeyDown: function (e) { if (e.key === 'Enter') commit(q); },
                placeholder: 'Symbol — AAPL, SPY, TSLA…',
                style: { flex: 1, padding: '8px 12px', borderRadius: 6, fontSize: 13,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                    color: OC.text, fontFamily: 'DM Sans', outline: 'none' }
            }),
            h('button', {
                onClick: function () { commit(q); },
                style: { padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: OC.cyan + '22', border: '1px solid ' + OC.cyan + '55',
                    color: OC.cyan, cursor: 'pointer' }
            }, 'Load')
        ),
        sug.length > 0 && h('div', {
            style: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                background: '#111827', border: '1px solid ' + OC.border, borderRadius: 6,
                marginTop: 4, overflow: 'hidden' }
        },
            sug.map(function (s) {
                return h('button', {
                    key: s.symbol, onClick: function () { commit(s.symbol); },
                    style: { display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '7px 12px', background: 'transparent', border: 'none',
                        borderBottom: '1px solid ' + OC.border, color: OC.text, cursor: 'pointer', textAlign: 'left' }
                },
                    h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: OC.cyan, minWidth: 56 } }, s.symbol),
                    h('span', { style: { fontSize: 11, color: OC.sec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name)
                );
            })
        )
    );
}

// ── Greeks card ───────────────────────────────────────────────
export function GreeksCard(p) {
    var c = p.contract;
    if (!c) return null;
    var isCall = c.type === 'C';
    var col    = isCall ? OC.green : OC.red;

    function gRow(label, val, color, note) {
        return h('div', { key: label,
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }
        },
            h('div', null,
                h('span', { style: { fontSize: 12, color: OC.sec, fontWeight: 600, marginRight: 4 } }, label),
                note && h('span', { style: { fontSize: 9, color: OC.muted } }, note)
            ),
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: color || OC.text } }, val)
        );
    }

    return h('div', { style: { background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border, padding: '14px 16px' } },
        h('div', { style: { fontSize: 10, fontWeight: 700, color: OC.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 } }, 'Greeks'),
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 10, padding: '6px 10px', borderRadius: 6, background: col + '18', border: '1px solid ' + col + '33' } },
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 800, color: col } },
                '$' + oFmt(c.strike, 2) + ' ' + (isCall ? 'CALL' : 'PUT')),
            h('span', { style: { fontSize: 11, color: OC.sec, marginLeft: 'auto', alignSelf: 'center' } }, c.expiry)
        ),
        gRow('Δ Delta',  oFmtD(c.delta),                    c.delta != null && Math.abs(c.delta) > 0.5 ? col : OC.text, 'price sensitivity'),
        gRow('Γ Gamma',  c.gamma  != null ? oFmt(c.gamma, 5)  : '—', OC.text, 'delta rate of change'),
        gRow('Θ Theta',  c.theta  != null ? oFmt(c.theta, 4) + '/d' : '—', c.theta != null ? OC.red : OC.text, 'daily decay'),
        gRow('V Vega',   c.vega   != null ? oFmt(c.vega,  4)  : '—', OC.text, 'per 1% IV move'),
        gRow('ρ Rho',    c.rho    != null ? oFmt(c.rho,   5)  : '—', OC.text, 'rate sensitivity'),
        gRow('IV',       oFmtPct(c.iv),                     OC.amber, 'implied volatility'),
        h('div', { style: { display: 'flex', gap: 8, marginTop: 10 } },
            h('div', { style: { flex: 1, textAlign: 'center', padding: '6px', borderRadius: 5, background: OC.green + '10', border: '1px solid ' + OC.green + '28' } },
                h('div', { style: { fontSize: 9, color: OC.muted } }, 'BID'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: OC.green } },
                    c.bid != null ? '$' + oFmt(c.bid, 2) : '—')
            ),
            h('div', { style: { flex: 1, textAlign: 'center', padding: '6px', borderRadius: 5, background: OC.red + '10', border: '1px solid ' + OC.red + '28' } },
                h('div', { style: { fontSize: 9, color: OC.muted } }, 'ASK'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: OC.red } },
                    c.ask != null ? '$' + oFmt(c.ask, 2) : '—')
            )
        )
    );
}

// ── Contract picker (shared across tabs) ──────────────────────
export function ContractPicker(p) {
    var _exp  = useState([]); var expiries = _exp[0]; var setExpiries = _exp[1];
    var _sel  = useState(null); var expiry  = _sel[0]; var setExpiry  = _sel[1];
    var _ch   = useState(null); var chain   = _ch[0];  var setChain   = _ch[1];
    var _type = useState('C');  var type    = _type[0]; var setType   = _type[1];
    var _str  = useState(null); var strike  = _str[0]; var setStrike = _str[1];
    var _ld   = useState(false); var loading = _ld[0]; var setLoading = _ld[1];
    var _er   = useState(null);  var err     = _er[0]; var setErr    = _er[1];

    // Reset + fetch expiries when symbol changes
    useEffect(function () {
        if (!p.symbol) return;
        setExpiries([]); setExpiry(null); setChain(null); setStrike(null); setErr(null); setLoading(true);
        fetchExpiries(p.symbol)
            .then(function (j) {
                if (j && j.error) { setErr(j.error); setLoading(false); return; }
                var list = Array.isArray(j) ? j : [];
                setExpiries(list);
                if (list.length) setExpiry(list[0]);
                setLoading(false);
            })
            .catch(function (e) { setErr(e.message); setLoading(false); });
    }, [p.symbol]);

    // Fetch chain when expiry changes
    useEffect(function () {
        if (!p.symbol || !expiry) return;
        setChain(null); setStrike(null); setLoading(true);
        fetchChain(p.symbol, expiry)
            .then(function (j) {
                if (j.error) { setErr(j.error); setLoading(false); return; }
                setChain(j);
                var list = type === 'C' ? j.calls : j.puts;
                if (list && list.length) setStrike(list[Math.floor(list.length / 2)].strike);
                setLoading(false);
            })
            .catch(function (e) { setErr(e.message); setLoading(false); });
    }, [p.symbol, expiry]);

    // Notify parent when selection is complete
    useEffect(function () {
        if (!chain || !strike) return;
        var list = type === 'C' ? chain.calls : chain.puts;
        var found = list && list.find(function (c) { return c.strike === strike; });
        if (found && p.onChange) p.onChange(Object.assign({}, found, { expiry: expiry }));
    }, [chain, strike, type]);

    // When type changes, re-pick a default strike from the new side
    useEffect(function () {
        if (!chain) return;
        var list = type === 'C' ? chain.calls : chain.puts;
        if (list && list.length) setStrike(list[Math.floor(list.length / 2)].strike);
    }, [type]);

    var strikes = chain ? (type === 'C' ? chain.calls : chain.puts).map(function (c) { return c.strike; }) : [];
    var selStyle = function (active, col) { return {
        flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        background: active ? col + '22' : 'transparent',
        border: '1px solid ' + (active ? col + '55' : 'rgba(255,255,255,0.08)'),
        color: active ? col : OC.muted,
    }; };

    return h('div', { style: { background: OC.card, borderRadius: 8, border: '1px solid ' + OC.border, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 } },
        h('div', { style: { fontSize: 10, fontWeight: 700, color: OC.muted, letterSpacing: 2, textTransform: 'uppercase' } }, 'Contract'),
        loading && h('div', { style: { color: OC.muted, fontSize: 12 } }, 'Loading…'),
        err     && h('div', { style: { color: OC.amber, fontSize: 11, lineHeight: 1.5 } }, '⚠ ' + err),
        expiries.length > 0 && h('div', null,
            h('div', { style: { fontSize: 9, color: OC.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 } }, 'Expiry'),
            h('select', {
                value: expiry || '', onChange: function (e) { setExpiry(e.target.value); },
                style: { width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12,
                    background: '#111827', border: '1px solid rgba(255,255,255,0.12)', color: OC.text, cursor: 'pointer' }
            },
                expiries.map(function (e) { return h('option', { key: e, value: e }, e); })
            )
        ),
        chain && h('div', { style: { display: 'flex', gap: 6 } },
            h('button', { onClick: function () { setType('C'); }, style: selStyle(type === 'C', OC.green) }, 'Call'),
            h('button', { onClick: function () { setType('P'); }, style: selStyle(type === 'P', OC.red)  }, 'Put')
        ),
        strikes.length > 0 && h('div', null,
            h('div', { style: { fontSize: 9, color: OC.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 } }, 'Strike'),
            h('select', {
                value: strike != null ? strike : '',
                onChange: function (e) { setStrike(Number(e.target.value)); },
                style: { width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12,
                    background: '#111827', border: '1px solid rgba(255,255,255,0.12)', color: OC.text, cursor: 'pointer' }
            },
                strikes.map(function (s) { return h('option', { key: s, value: s }, '$' + oFmt(s, 2)); })
            )
        )
    );
}

// ── Main shell ────────────────────────────────────────────────
export function OptionsAnalysis() {
    var _sym  = useState('AAPL'); var symbol  = _sym[0];  var setSymbol  = _sym[1];
    var _live = useState(null);   var liveSym = _live[0]; var setLiveSym = _live[1];
    var _tab  = useState('payoff'); var tab   = _tab[0];  var setTab     = _tab[1];
    var _con  = useState(null);   var contract = _con[0]; var setContract = _con[1];

    useEffect(function () { setLiveSym('AAPL'); }, []);

    var TABS_DEF = [
        { id: 'payoff',    label: '⟁ Payoff Diagram'   },
        { id: 'strategy',  label: '⊞ Strategy Builder'  },
        { id: 'ivsurface', label: '⬡ IV Surface'        },
    ];

    return h('div', { style: { padding: '20px 24px', maxWidth: 1400, margin: '0 auto' } },
        // Header
        h('div', { style: { display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' } },
            h('div', null,
                h('div', { style: { fontSize: 10, color: OC.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 } }, 'Options Analysis'),
                h('div', { style: { fontFamily: 'Syne', fontSize: 24, fontWeight: 800, color: OC.cyan, letterSpacing: 2 } }, liveSym || '—')
            ),
            h(OSymbolSearch, { value: symbol, onLoad: function (s) { setSymbol(s); setLiveSym(s); setContract(null); } }),
            h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' } },
                h('span', { style: { fontSize: 9, color: OC.muted } }, 'Powered by Alpaca'),
                h('span', { style: { width: 6, height: 6, borderRadius: '50%', background: OC.green, display: 'inline-block' } })
            )
        ),

        // Tab bar
        h('div', { style: { display: 'flex', gap: 2, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.06)' } },
            TABS_DEF.map(function (t) {
                var active = tab === t.id;
                return h('button', {
                    key: t.id, onClick: function () { setTab(t.id); },
                    style: { padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: 'transparent', border: 'none',
                        borderBottom: active ? '2px solid ' + OC.cyan : '2px solid transparent',
                        color: active ? OC.cyan : OC.sec, marginBottom: -1, whiteSpace: 'nowrap' }
                }, t.label);
            })
        ),

        // Content
        tab === 'payoff'    && h(PayoffTab,    { symbol: liveSym, contract: contract, onContract: setContract }),
        tab === 'strategy'  && h(StrategyTab,  { symbol: liveSym }),
        tab === 'ivsurface' && h(IVSurfaceTab, { symbol: liveSym })
    );
}
