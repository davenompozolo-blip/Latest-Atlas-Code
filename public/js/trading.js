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
