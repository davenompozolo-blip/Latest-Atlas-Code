// ============================================================
// ATLAS Terminal — Trading Dashboard  (Chunk 1 of 5)
// ------------------------------------------------------------
// Buy-side trading terminal: live quotes, TradingView chart,
// order ticket, fundamentals.
// Data: /api/trading (Alpaca) + /api/equity (Finnhub/Yahoo)
// ============================================================

import { fmt, fmtCurrency, fmtPct, cls } from './utils.js';
import { Loading, EmptyState } from './components.js';

var h = React.createElement;
var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;
var useCallback = React.useCallback;

// ── Palette ──────────────────────────────────────────────────
var C = {
    bg:      '#070814',
    card:    '#0d0f1a',
    border:  'rgba(255,255,255,0.06)',
    text:    'rgba(255,255,255,0.92)',
    sec:     'rgba(255,255,255,0.52)',
    muted:   'rgba(255,255,255,0.28)',
    cyan:    '#00d4ff',
    green:   '#10b981',
    red:     '#ef4444',
    amber:   '#f59e0b',
    indigo:  '#6366f1',
};

// ── Formatters ───────────────────────────────────────────────
function fN(v, d) {
    if (v == null || !isFinite(v)) return '—';
    return Number(v).toFixed(d != null ? d : 2);
}
function fP(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + fN(v, 2) + '%';
}
function fLarge(v) {
    if (v == null || !isFinite(v)) return '—';
    var abs = Math.abs(v);
    if (abs >= 1e12) return '$' + fN(v / 1e12, 2) + 'T';
    if (abs >= 1e9)  return '$' + fN(v / 1e9,  2) + 'B';
    if (abs >= 1e6)  return '$' + fN(v / 1e6,  2) + 'M';
    return '$' + fN(v, 0);
}
function chCol(v) {
    return v == null ? C.sec : v > 0 ? C.green : v < 0 ? C.red : C.sec;
}

// ── API helpers ───────────────────────────────────────────────
function apiFetch(url) {
    return fetch(url).then(function (r) { return r.json(); });
}

function useQuote(symbol) {
    var _s = useState(null); var quote = _s[0]; var setQuote = _s[1];
    var _l = useState(false); var loading = _l[0]; var setLoading = _l[1];
    var _e = useState(null); var error = _e[0]; var setError = _e[1];
    useEffect(function () {
        if (!symbol) return;
        setLoading(true); setError(null);
        apiFetch('/api/trading?action=quote&symbol=' + encodeURIComponent(symbol))
            .then(function (j) {
                if (j.error) { setError(j.error); setLoading(false); return; }
                setQuote(j); setLoading(false);
            })
            .catch(function (e) { setError(e.message); setLoading(false); });
    }, [symbol]);
    return { quote: quote, loading: loading, error: error };
}

function useAccount() {
    var _s = useState(null); var acct = _s[0]; var setAcct = _s[1];
    useEffect(function () {
        apiFetch('/api/trading?action=account')
            .then(function (j) { if (!j.error) setAcct(j); })
            .catch(function () {});
    }, []);
    return acct;
}

function useFundamentals(symbol) {
    var _s = useState(null); var data = _s[0]; var setData = _s[1];
    var _l = useState(false); var loading = _l[0]; var setLoading = _l[1];
    useEffect(function () {
        if (!symbol) return;
        setData(null); setLoading(true);
        apiFetch('/api/equity?symbol=' + encodeURIComponent(symbol) + '&endpoint=overview')
            .then(function (j) { setData(j); setLoading(false); })
            .catch(function () { setLoading(false); });
    }, [symbol]);
    return { data: data, loading: loading };
}

// ── Chunk 2: AccountBadge + SymbolSearch + PriceHero ─────────

function AccountBadge(p) {
    var a = p.acct;
    if (!a) return null;
    var pnlCol = a.dayPnl >= 0 ? C.green : C.red;
    var modeCol = a.mode === 'LIVE' ? C.red : C.amber;
    return h('div', {
        style: {
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '6px 14px', borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid ' + C.border,
        }
    },
        h('span', {
            style: {
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                background: modeCol + '22', color: modeCol,
                fontFamily: 'JetBrains Mono', letterSpacing: 1,
            }
        }, a.mode),
        h('span', { style: { fontSize: 12, color: C.sec } }, 'Equity'),
        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: C.text } },
            fLarge(a.equity)),
        h('span', { style: { fontSize: 12, color: C.sec } }, 'Cash'),
        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 13, color: C.text } },
            fLarge(a.cash)),
        h('span', { style: { fontSize: 12, color: C.sec } }, 'Day P&L'),
        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: pnlCol } },
            (a.dayPnl >= 0 ? '+' : '') + fLarge(a.dayPnl)
            + ' (' + fP(a.dayPnlPct) + ')')
    );
}

function SymbolSearch(p) {
    var _q = useState(p.symbol || '');
    var query = _q[0]; var setQuery = _q[1];
    var _s = useState([]); var suggestions = _s[0]; var setSuggestions = _s[1];
    var _t = useRef(null);

    function doSearch(q) {
        if (!q || q.length < 1) { setSuggestions([]); return; }
        clearTimeout(_t.current);
        _t.current = setTimeout(function () {
            apiFetch('/api/trading?action=search&q=' + encodeURIComponent(q))
                .then(function (j) { setSuggestions(Array.isArray(j) ? j : []); })
                .catch(function () { setSuggestions([]); });
        }, 300);
    }

    function commit(sym) {
        setQuery(sym); setSuggestions([]);
        if (p.onLoad) p.onLoad(sym.toUpperCase().trim());
    }

    return h('div', { style: { position: 'relative', flex: 1, maxWidth: 360 } },
        h('div', { style: { display: 'flex', gap: 8 } },
            h('input', {
                value: query,
                onChange: function (e) { setQuery(e.target.value); doSearch(e.target.value); },
                onKeyDown: function (e) {
                    if (e.key === 'Enter') commit(query);
                },
                placeholder: 'Search symbol — AAPL, TSLA, SPY…',
                style: {
                    flex: 1, background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
                    color: C.text, padding: '8px 12px', fontSize: 13,
                    fontFamily: 'DM Sans', outline: 'none',
                },
            }),
            h('button', {
                onClick: function () { commit(query); },
                style: {
                    padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    background: C.cyan + '22', border: '1px solid ' + C.cyan + '55',
                    color: C.cyan, cursor: 'pointer',
                },
            }, 'Load')
        ),
        suggestions.length > 0 && h('div', {
            style: {
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: '#111827', border: '1px solid ' + C.border, borderRadius: 6,
                marginTop: 4, overflow: 'hidden',
            }
        },
            suggestions.map(function (s) {
                return h('button', {
                    key: s.symbol,
                    onClick: function () { commit(s.symbol); },
                    style: {
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '8px 12px', background: 'transparent',
                        border: 'none', borderBottom: '1px solid ' + C.border,
                        color: C.text, cursor: 'pointer', textAlign: 'left',
                    },
                },
                    h('span', {
                        style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: C.cyan, minWidth: 60 }
                    }, s.symbol),
                    h('span', { style: { fontSize: 12, color: C.sec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.name),
                    h('span', { style: { fontSize: 10, color: C.muted, marginLeft: 'auto' } }, s.exchange)
                );
            })
        )
    );
}

function PriceHero(p) {
    var q = p.quote;
    if (!q) return h('div', { style: { height: 80 } });
    var col = chCol(q.change);
    var arrow = q.change == null ? '' : q.change > 0 ? ' ▲' : ' ▼';
    return h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' } },
        h('span', {
            style: { fontFamily: 'JetBrains Mono', fontSize: '2.4rem', fontWeight: 800, color: C.text }
        }, q.last != null ? '$' + fN(q.last, 2) : '—'),
        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: '1.1rem', fontWeight: 700, color: col } },
            arrow + ' ' + (q.change != null ? (q.change >= 0 ? '+' : '') + fN(q.change, 2) : '—')),
        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: '1.0rem', color: col } },
            '(' + fP(q.changePct) + ')'),
        q.vwap != null && h('span', { style: { fontSize: 11, color: C.muted, marginLeft: 8 } },
            'VWAP $' + fN(q.vwap, 2))
    );
}

function QuoteStrip(p) {
    var q = p.quote;
    if (!q) return null;
    var spread = (q.bid != null && q.ask != null) ? q.ask - q.bid : null;
    function cell(label, val, color) {
        return h('div', {
            style: {
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '8px 14px', borderRadius: 6,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid ' + C.border, minWidth: 80,
            }
        },
            h('span', { style: { fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 } }, label),
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: color || C.text } }, val)
        );
    }
    return h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' } },
        cell('BID', q.bid != null ? '$' + fN(q.bid, 2) + (q.bidSize ? ' ×' + q.bidSize : '') : '—', C.green),
        cell('ASK', q.ask != null ? '$' + fN(q.ask, 2) + (q.askSize ? ' ×' + q.askSize : '') : '—', C.red),
        cell('SPREAD', spread != null ? '$' + fN(spread, 3) : '—', C.amber),
        cell('OPEN', q.open != null ? '$' + fN(q.open, 2) : '—'),
        cell('HIGH', q.high != null ? '$' + fN(q.high, 2) : '—', C.green),
        cell('LOW', q.low != null ? '$' + fN(q.low, 2) : '—', C.red),
        cell('PREV', q.prevClose != null ? '$' + fN(q.prevClose, 2) : '—'),
        cell('VOL', q.volume != null ? fN(q.volume / 1e6, 2) + 'M' : '—')
    );
}
