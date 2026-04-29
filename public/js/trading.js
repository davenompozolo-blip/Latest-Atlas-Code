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

// ── Dropdown / select fix — force white text in dark inputs ──
var SELECT_STYLE_INJECTED = false;
function injectSelectStyle() {
    if (SELECT_STYLE_INJECTED || typeof document === 'undefined') return;
    SELECT_STYLE_INJECTED = true;
    var s = document.createElement('style');
    s.textContent = 'select option { background:#111827; color:#e2e8f0; }';
    document.head.appendChild(s);
}
injectSelectStyle();

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

// ── Chunk 3: CandleChart (TradingView LightweightCharts v5) ──

var TF_LABELS = ['1D', '5D', '1M', '3M', '6M', '1Y', '5Y'];

function CandleChart(p) {
    var containerRef = useRef(null);
    var chartRef     = useRef(null);
    var candleRef    = useRef(null);
    var volRef       = useRef(null);
    var _l = useState(false); var loading = _l[0]; var setLoading = _l[1];
    var _e = useState(null);  var error   = _e[0]; var setError   = _e[1];

    // Create chart once on mount
    useEffect(function () {
        if (!containerRef.current || !window.LightweightCharts) return;
        var LC = window.LightweightCharts;
        var chart = LC.createChart(containerRef.current, {
            layout: {
                background: { color: '#0d0f1a' },
                textColor: 'rgba(255,255,255,0.45)',
            },
            grid: {
                vertLines: { color: 'rgba(255,255,255,0.04)' },
                horzLines: { color: 'rgba(255,255,255,0.04)' },
            },
            crosshair: { mode: LC.CrosshairMode ? LC.CrosshairMode.Normal : 1 },
            timeScale: { timeVisible: true, borderColor: 'rgba(255,255,255,0.08)' },
            rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
            width:  containerRef.current.clientWidth || 600,
            height: 340,
        });

        // v5 API: addSeries with type constant; fall back to v4 if needed
        var candles, vol;
        if (LC.CandlestickSeries) {
            candles = chart.addSeries(LC.CandlestickSeries, {
                upColor: '#10b981', downColor: '#ef4444',
                borderVisible: false,
                wickUpColor: '#10b981', wickDownColor: '#ef4444',
            });
            vol = chart.addSeries(LC.HistogramSeries, {
                priceFormat: { type: 'volume' },
                priceScaleId: 'vol',
            });
        } else {
            candles = chart.addCandlestickSeries({
                upColor: '#10b981', downColor: '#ef4444',
                borderVisible: false,
                wickUpColor: '#10b981', wickDownColor: '#ef4444',
            });
            vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
        }
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

        chartRef.current   = chart;
        candleRef.current  = candles;
        volRef.current     = vol;

        var ro = new ResizeObserver(function () {
            if (containerRef.current && chartRef.current) {
                chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
            }
        });
        ro.observe(containerRef.current);
        return function () { ro.disconnect(); chart.remove(); };
    }, []);

    // Fetch data whenever symbol or timeframe changes
    useEffect(function () {
        if (!p.symbol || !candleRef.current) return;
        setLoading(true); setError(null);
        apiFetch('/api/trading?action=chart&symbol=' + encodeURIComponent(p.symbol) + '&range=' + p.range)
            .then(function (j) {
                if (j.error) { setError(j.error); setLoading(false); return; }
                var bars = j.bars || [];
                var cData = bars.map(function (b) {
                    return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };
                });
                var vData = bars.map(function (b) {
                    return {
                        time: b.time, value: b.volume,
                        color: b.close >= b.open ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)',
                    };
                });
                if (candleRef.current) candleRef.current.setData(cData);
                if (volRef.current)    volRef.current.setData(vData);
                if (chartRef.current)  chartRef.current.timeScale().fitContent();
                setLoading(false);
            })
            .catch(function (e) { setError(e.message); setLoading(false); });
    }, [p.symbol, p.range]);

    return h('div', { style: { background: '#0d0f1a', borderRadius: 8, border: '1px solid ' + C.border, padding: '12px 14px' } },
        // Timeframe pills
        h('div', { style: { display: 'flex', gap: 6, marginBottom: 10 } },
            TF_LABELS.map(function (tf) {
                var active = tf === p.range;
                return h('button', {
                    key: tf,
                    onClick: function () { p.onRange(tf); },
                    style: {
                        padding: '3px 11px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        fontFamily: 'JetBrains Mono', cursor: 'pointer',
                        background: active ? C.cyan + '22' : 'transparent',
                        border: '1px solid ' + (active ? C.cyan + '66' : 'rgba(255,255,255,0.08)'),
                        color: active ? C.cyan : C.muted,
                    },
                }, tf);
            })
        ),
        loading && h('div', {
            style: { textAlign: 'center', padding: '20px 0', fontSize: 12, color: C.muted }
        }, 'Loading chart…'),
        error && h('div', { style: { color: C.red, fontSize: 12, padding: '8px 0' } }, 'Chart: ' + error),
        h('div', { ref: containerRef, style: { width: '100%' } })
    );
}

// ── Chunk 4: OrderTicket ──────────────────────────────────────

function OrderTicket(p) {
    var quote = p.quote;
    var price = quote ? quote.last : null;

    var _side  = useState('buy');    var side  = _side[0];  var setSide  = _side[1];
    var _type  = useState('market'); var type  = _type[0];  var setType  = _type[1];
    var _qty   = useState('1');      var qty   = _qty[0];   var setQty   = _qty[1];
    var _lp    = useState('');       var lp    = _lp[0];    var setLp    = _lp[1];
    var _sp    = useState('');       var sp    = _sp[0];    var setSp    = _sp[1];
    var _note  = useState('market'); var mode  = _note[0];  var setMode  = _note[1]; // 'qty'|'notional'
    var _conf  = useState(false);    var conf  = _conf[0];  var setConf  = _conf[1];
    var _res   = useState(null);     var result = _res[0];  var setResult = _res[1];
    var _busy  = useState(false);    var busy  = _busy[0];  var setBusy  = _busy[1];

    var estCost = (price && parseFloat(qty) > 0) ? price * parseFloat(qty) : null;

    function inputStyle(w) {
        return {
            width: w || '100%', padding: '7px 10px', fontSize: 12,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5,
            color: C.text, fontFamily: 'JetBrains Mono', outline: 'none',
            boxSizing: 'border-box',
        };
    }

    function labelStyle() {
        return { fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'block' };
    }

    function submitOrder() {
        setBusy(true); setResult(null);
        var body = {
            symbol:  p.symbol,
            side:    side,
            type:    type,
            tif:     'day',
        };
        if (mode === 'notional') {
            body.notional = parseFloat(qty) || 100;
        } else {
            body.qty = parseFloat(qty) || 1;
        }
        if ((type === 'limit' || type === 'stop_limit') && lp) body.limitPrice = parseFloat(lp);
        if ((type === 'stop'  || type === 'stop_limit') && sp) body.stopPrice  = parseFloat(sp);

        fetch('/api/trading?action=order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                setResult(j); setBusy(false); setConf(false);
            })
            .catch(function (e) {
                setResult({ success: false, error: e.message }); setBusy(false); setConf(false);
            });
    }

    var sideColors = { buy: C.green, sell: C.red };
    var activeSide = sideColors[side];

    return h('div', {
        style: {
            background: C.card, borderRadius: 8, border: '1px solid ' + C.border,
            padding: '16px', display: 'flex', flexDirection: 'column', gap: 12,
        }
    },
        // Title
        h('div', { style: { fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' } },
            'Order Ticket · ' + (p.symbol || '—')),

        // Buy / Sell toggle
        h('div', { style: { display: 'flex', gap: 6 } },
            ['buy', 'sell'].map(function (s) {
                var active = side === s;
                var col = s === 'buy' ? C.green : C.red;
                return h('button', {
                    key: s,
                    onClick: function () { setSide(s); setResult(null); setConf(false); },
                    style: {
                        flex: 1, padding: '7px 0', borderRadius: 6, fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1,
                        background: active ? col + '22' : 'transparent',
                        border: '1px solid ' + (active ? col + '66' : 'rgba(255,255,255,0.08)'),
                        color: active ? col : C.sec,
                    },
                }, s);
            })
        ),

        // Order type
        h('div', null,
            h('label', { style: labelStyle() }, 'Order Type'),
            h('select', {
                value: type,
                onChange: function (e) { setType(e.target.value); },
                style: Object.assign({}, inputStyle(), { cursor: 'pointer' }),
            },
                h('option', { value: 'market' }, 'Market'),
                h('option', { value: 'limit' }, 'Limit'),
                h('option', { value: 'stop' }, 'Stop'),
                h('option', { value: 'stop_limit' }, 'Stop-Limit')
            )
        ),

        // Qty / Notional toggle + input
        h('div', null,
            h('div', { style: { display: 'flex', gap: 6, marginBottom: 6 } },
                ['qty', 'notional'].map(function (m) {
                    return h('button', {
                        key: m,
                        onClick: function () { setMode(m); },
                        style: {
                            padding: '3px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5,
                            background: mode === m ? C.indigo + '33' : 'transparent',
                            border: '1px solid ' + (mode === m ? C.indigo + '66' : 'rgba(255,255,255,0.08)'),
                            color: mode === m ? C.indigo : C.muted,
                        },
                    }, m === 'qty' ? 'Shares' : 'Notional $');
                })
            ),
            h('input', {
                type: 'number', value: qty, min: 0,
                onChange: function (e) { setQty(e.target.value); },
                placeholder: mode === 'qty' ? 'Shares' : 'Dollar amount',
                style: inputStyle(),
            }),
            estCost != null && mode === 'qty' && h('div', {
                style: { fontSize: 10, color: C.muted, marginTop: 4 }
            }, 'Est. ' + (side === 'buy' ? 'cost' : 'proceeds') + ': ' + fLarge(estCost))
        ),

        // Conditional price fields
        (type === 'limit' || type === 'stop_limit') && h('div', null,
            h('label', { style: labelStyle() }, 'Limit Price'),
            h('input', {
                type: 'number', value: lp, placeholder: price ? '$' + fN(price, 2) : '$0.00',
                onChange: function (e) { setLp(e.target.value); },
                style: inputStyle(),
            })
        ),
        (type === 'stop' || type === 'stop_limit') && h('div', null,
            h('label', { style: labelStyle() }, 'Stop Price'),
            h('input', {
                type: 'number', value: sp, placeholder: '$0.00',
                onChange: function (e) { setSp(e.target.value); },
                style: inputStyle(),
            })
        ),

        // Confirm / Submit
        !conf
            ? h('button', {
                onClick: function () { setConf(true); setResult(null); },
                disabled: busy || !p.symbol,
                style: {
                    padding: '9px 0', borderRadius: 6, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1,
                    background: activeSide + '22',
                    border: '1px solid ' + activeSide + '66',
                    color: activeSide,
                },
            }, side.toUpperCase() + ' ' + (p.symbol || '—'))
            : h('div', { style: { display: 'flex', gap: 8 } },
                h('button', {
                    onClick: submitOrder, disabled: busy,
                    style: {
                        flex: 1, padding: '9px 0', borderRadius: 6, fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', background: activeSide + '33',
                        border: '1px solid ' + activeSide, color: activeSide,
                    },
                }, busy ? 'Sending…' : '✓ Confirm'),
                h('button', {
                    onClick: function () { setConf(false); },
                    style: {
                        flex: 1, padding: '9px 0', borderRadius: 6, fontSize: 12,
                        cursor: 'pointer', background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.12)', color: C.sec,
                    },
                }, 'Cancel')
            ),

        // Result banner
        result && h('div', {
            style: {
                padding: '8px 12px', borderRadius: 6, fontSize: 12,
                background: result.success ? C.green + '18' : C.red + '18',
                border: '1px solid ' + (result.success ? C.green + '44' : C.red + '44'),
                color: result.success ? C.green : C.red,
            }
        }, result.success
            ? '✓ Order submitted · ' + (result.order && result.order.id ? result.order.id.slice(0, 8) + '…' : '')
            : '✗ ' + (result.error || (result.order && result.order.error) || 'Error')
        )
    );
}

// ── Chunk 5: FundamentalsPanel + TradingDashboard ────────────

function FundamentalsPanel(p) {
    var fd = p.data;
    if (!fd) return h('div', { style: { color: C.muted, fontSize: 12, padding: 12 } }, p.loading ? 'Loading fundamentals…' : 'No data');
    var ov = fd.overview || {};
    var fin = fd.financials && fd.financials.snapshot ? fd.financials.snapshot : {};

    function row(label, val, color) {
        if (val == null || val === '—') return null;
        return h('div', {
            key: label,
            style: {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
            }
        },
            h('span', { style: { fontSize: 11, color: C.sec } }, label),
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600, color: color || C.text } }, val)
        );
    }

    function pct(v) { return v != null ? fN(v * 100, 1) + '%' : null; }
    function mul(v) { return v != null ? fN(v, 2) + '×' : null; }

    return h('div', {
        style: { background: C.card, borderRadius: 8, border: '1px solid ' + C.border, padding: '14px 16px' }
    },
        h('div', { style: { fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 } }, 'Fundamentals'),
        ov.Name && h('div', { style: { fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 } }, ov.Name),
        (ov.Sector || ov.Industry) && h('div', { style: { fontSize: 11, color: C.sec, marginBottom: 8 } },
            [ov.Sector, ov.Industry].filter(Boolean).join(' · ')),
        row('Market Cap', ov.MarketCapitalization ? fLarge(parseFloat(ov.MarketCapitalization)) : null),
        row('P/E (TTM)', ov.PERatio ? fN(parseFloat(ov.PERatio), 1) + '×' : null),
        row('P/E (Fwd)', fin.forwardPE ? mul(fin.forwardPE) : null),
        row('PEG', ov.PEGRatio ? fN(parseFloat(ov.PEGRatio), 2) + '×' : null),
        row('EV/EBITDA', fin.evToEbitda ? mul(fin.evToEbitda) : null),
        row('EPS', ov.EPS ? '$' + fN(parseFloat(ov.EPS), 2) : null),
        row('Beta', ov.Beta ? fN(parseFloat(ov.Beta), 2) : null),
        row('Gross Margin', pct(fin.grossMargins)),
        row('Op Margin', pct(fin.operatingMargins)),
        row('Net Margin', pct(fin.profitMargins)),
        row('ROE', pct(fin.returnOnEquity), fin.returnOnEquity > 0 ? C.green : C.red),
        row('D/E Ratio', fin.debtToEquity ? fN(fin.debtToEquity, 2) : null),
        ov.DividendYield && parseFloat(ov.DividendYield) > 0
            ? row('Div Yield', fN(parseFloat(ov.DividendYield) * 100, 2) + '%', C.cyan)
            : null,
        ov.AnalystTargetPrice && h('div', {
            style: { marginTop: 10, padding: '8px 10px', borderRadius: 6, background: C.indigo + '18', border: '1px solid ' + C.indigo + '33' }
        },
            h('div', { style: { fontSize: 10, color: C.muted, marginBottom: 2 } }, 'Analyst Target'),
            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, color: C.indigo } },
                '$' + fN(parseFloat(ov.AnalystTargetPrice), 2))
        )
    );
}

// ── Chunk 6: OrderHistory ─────────────────────────────────────

var ORDER_STATUS_COLOR = {
    filled:            '#10b981',
    partially_filled:  '#f59e0b',
    pending_new:       '#6366f1',
    new:               '#6366f1',
    accepted:          '#6366f1',
    canceled:          'rgba(255,255,255,0.3)',
    cancelled:         'rgba(255,255,255,0.3)',
    expired:           'rgba(255,255,255,0.3)',
    rejected:          '#ef4444',
    held:              '#f59e0b',
};

function OrderHistory() {
    var _orders  = useState([]); var orders  = _orders[0]; var setOrders  = _orders[1];
    var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
    var _err     = useState(null);  var err     = _err[0];    var setErr     = _err[1];
    var _filter  = useState('all'); var filter  = _filter[0]; var setFilter  = _filter[1];

    function load() {
        setLoading(true); setErr(null);
        apiFetch('/api/trading?action=orders&status=' + filter + '&limit=50')
            .then(function (j) {
                if (j.error) { setErr(j.error); setLoading(false); return; }
                setOrders(Array.isArray(j) ? j : []); setLoading(false);
            })
            .catch(function (e) { setErr(e.message); setLoading(false); });
    }

    useEffect(function () { load(); }, [filter]);

    function fDate(s) {
        if (!s) return '—';
        try { return new Date(s).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
        catch (_) { return s; }
    }

    var filterBtns = ['all', 'open', 'closed'];
    var thStyle = { fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', fontWeight: 600 };
    var tdStyle = { fontSize: 12, padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'JetBrains Mono' };

    return h('div', { style: { background: C.card, borderRadius: 8, border: '1px solid ' + C.border, padding: '14px 16px' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
            h('span', { style: { fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' } }, 'Order History'),
            h('div', { style: { display: 'flex', gap: 6 } },
                filterBtns.map(function (f) {
                    return h('button', {
                        key: f,
                        onClick: function () { setFilter(f); },
                        style: {
                            padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                            textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer',
                            background: filter === f ? C.cyan + '22' : 'transparent',
                            border: '1px solid ' + (filter === f ? C.cyan + '55' : 'rgba(255,255,255,0.08)'),
                            color: filter === f ? C.cyan : C.muted,
                        },
                    }, f);
                }),
                h('button', {
                    onClick: load,
                    style: { padding: '3px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: C.muted },
                }, '↻ Refresh')
            )
        ),
        loading && h('div', { style: { color: C.muted, fontSize: 12, padding: '12px 0' } }, 'Loading orders…'),
        err     && h('div', { style: { color: C.red, fontSize: 12, padding: '8px 0' } }, 'Error: ' + err),
        !loading && !err && orders.length === 0 && h('div', { style: { color: C.muted, fontSize: 12, padding: '12px 0', textAlign: 'center' } }, 'No orders found'),
        !loading && orders.length > 0 && h('div', { style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
                h('thead', null,
                    h('tr', null,
                        h('th', { style: thStyle }, 'Symbol'),
                        h('th', { style: thStyle }, 'Side'),
                        h('th', { style: thStyle }, 'Type'),
                        h('th', { style: thStyle }, 'Qty'),
                        h('th', { style: thStyle }, 'Filled'),
                        h('th', { style: thStyle }, 'Avg Fill'),
                        h('th', { style: thStyle }, 'Limit'),
                        h('th', { style: thStyle }, 'Status'),
                        h('th', { style: thStyle }, 'Time')
                    )
                ),
                h('tbody', null,
                    orders.map(function (o) {
                        var sCol = o.side === 'buy' ? C.green : C.red;
                        var stCol = ORDER_STATUS_COLOR[o.status] || C.sec;
                        return h('tr', {
                            key: o.id,
                            style: { background: 'transparent' },
                        },
                            h('td', { style: Object.assign({}, tdStyle, { color: C.cyan, fontWeight: 700 }) }, o.symbol),
                            h('td', { style: Object.assign({}, tdStyle, { color: sCol, fontWeight: 700, textTransform: 'uppercase' }) }, o.side),
                            h('td', { style: Object.assign({}, tdStyle, { color: C.sec }) }, o.type || '—'),
                            h('td', { style: tdStyle }, o.qty || '—'),
                            h('td', { style: Object.assign({}, tdStyle, { color: o.filledQty > 0 ? C.green : C.muted }) }, o.filledQty || '0'),
                            h('td', { style: tdStyle }, o.filledAvg ? '$' + fN(o.filledAvg, 2) : '—'),
                            h('td', { style: Object.assign({}, tdStyle, { color: C.sec }) }, o.limitPrice ? '$' + fN(o.limitPrice, 2) : '—'),
                            h('td', null,
                                h('span', {
                                    style: {
                                        display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                        background: stCol + '22', color: stCol,
                                    }
                                }, o.status)
                            ),
                            h('td', { style: Object.assign({}, tdStyle, { color: C.muted, fontSize: 10 }) }, fDate(o.createdAt))
                        );
                    })
                )
            )
        )
    );
}

// ── Chunk 7: OptionsChain ─────────────────────────────────────

function OptionsChain(p) {
    var sym = p.symbol;
    var _expiries = useState([]); var expiries = _expiries[0]; var setExpiries = _expiries[1];
    var _expiry   = useState(null); var expiry   = _expiry[0]; var setExpiry   = _expiry[1];
    var _chain    = useState(null); var chain    = _chain[0];  var setChain    = _chain[1];
    var _view     = useState('both'); var view   = _view[0];   var setView     = _view[1];
    var _loading  = useState(false);
    var _err      = useState(null);

    // Fetch expiry dates when symbol changes
    useEffect(function () {
        if (!sym) return;
        setExpiries([]); setExpiry(null); setChain(null); _err[1](null);
        apiFetch('/api/trading?action=option_expiries&symbol=' + encodeURIComponent(sym))
            .then(function (j) {
                if (j && j.error) { _err[1](j.error); return; }
                var list = Array.isArray(j) ? j : [];
                setExpiries(list);
                if (list.length) setExpiry(list[0]);
                else _err[1]('No listed options found for ' + sym);
            })
            .catch(function (e) { _err[1](e.message || 'Failed to fetch option expiries'); });
    }, [sym]);

    // Fetch chain when expiry selected
    useEffect(function () {
        if (!sym || !expiry) return;
        _loading[1](true); _err[1](null);
        apiFetch('/api/trading?action=options_chain&symbol=' + encodeURIComponent(sym) + '&expiry=' + encodeURIComponent(expiry))
            .then(function (j) {
                if (j.error) { _err[1](j.error); _loading[1](false); return; }
                setChain(j); _loading[1](false);
            })
            .catch(function (e) { _err[1](e.message); _loading[1](false); });
    }, [sym, expiry]);

    var loading = _loading[0];
    var err     = _err[0];

    function fOpt(v, d) { return v != null ? fN(v, d != null ? d : 2) : '—'; }
    function fIV(v)  { return v != null ? fN(v * 100, 1) + '%' : '—'; }
    function fDelta(v) { return v != null ? fN(v, 4) : '—'; }

    var thS = {
        fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1,
        padding: '5px 6px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontWeight: 600, whiteSpace: 'nowrap',
    };
    var thSL = Object.assign({}, thS, { textAlign: 'left' });
    var thCenter = Object.assign({}, thS, { textAlign: 'center', background: 'rgba(255,255,255,0.04)' });

    function cellN(v, color) {
        return h('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, padding: '5px 6px', textAlign: 'right', color: color || C.text, borderBottom: '1px solid rgba(255,255,255,0.03)' } }, v);
    }
    function cellStrike(v, atm) {
        return h('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, padding: '5px 8px', textAlign: 'center', color: C.amber, background: atm ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' } }, '$' + fN(v, 2));
    }

    if (!sym) return h('div', { style: { color: C.muted, fontSize: 12, padding: 16 } }, 'Load a symbol to see options.');
    if (expiries.length === 0 && !loading && !err) return h('div', { style: { color: C.muted, fontSize: 12, padding: 16 } }, 'Loading options for ' + sym + '…');
    if (expiries.length === 0 && !loading && err) return h('div', { style: { background: C.card, borderRadius: 8, border: '1px solid ' + C.border, padding: 20 } },
        h('div', { style: { fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 } }, 'Options Chain · ' + sym),
        h('div', { style: { color: C.amber, fontSize: 12, lineHeight: 1.6 } }, '⚠ ' + err)
    );

    var calls = chain ? chain.calls : [];
    var puts  = chain ? chain.puts  : [];
    var lastPrice = p.lastPrice;
    // Build strike-aligned rows
    var strikeSet = {};
    calls.forEach(function (c) { strikeSet[c.strike] = true; });
    puts.forEach(function (p) { strikeSet[p.strike] = true; });
    var strikes = Object.keys(strikeSet).map(Number).sort(function (a, b) { return a - b; });
    var callByStrike = {}; calls.forEach(function (c) { callByStrike[c.strike] = c; });
    var putByStrike  = {};  puts.forEach(function (p) { putByStrike[p.strike]  = p; });

    return h('div', { style: { background: C.card, borderRadius: 8, border: '1px solid ' + C.border, padding: '14px 16px' } },
        // Header row
        h('div', { style: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' } },
            h('span', { style: { fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 2, textTransform: 'uppercase' } }, 'Options Chain · ' + sym),

            // Expiry selector
            expiries.length > 0 && h('select', {
                value: expiry || '',
                onChange: function (e) { setExpiry(e.target.value); },
                style: { padding: '3px 8px', background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, color: C.text, fontSize: 11, cursor: 'pointer' },
            },
                expiries.map(function (e) { return h('option', { key: e, value: e }, e); })
            ),

            // Calls / Puts / Both
            h('div', { style: { display: 'flex', gap: 4, marginLeft: 'auto' } },
                ['both', 'calls', 'puts'].map(function (v) {
                    return h('button', {
                        key: v,
                        onClick: function () { setView(v); },
                        style: {
                            padding: '3px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                            textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer',
                            background: view === v ? C.cyan + '22' : 'transparent',
                            border: '1px solid ' + (view === v ? C.cyan + '55' : 'rgba(255,255,255,0.08)'),
                            color: view === v ? C.cyan : C.muted,
                        },
                    }, v);
                })
            )
        ),

        loading && h('div', { style: { color: C.muted, fontSize: 12, padding: 12 } }, 'Loading chain…'),
        err     && h('div', { style: { color: C.red,  fontSize: 12, padding: 8  } }, 'Error: ' + err),

        !loading && chain && strikes.length > 0 && h('div', { style: { overflowX: 'auto', overflowY: 'auto', maxHeight: 440 } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
                h('thead', null,
                    h('tr', null,
                        // Calls header (left)
                        view !== 'puts' && h('th', { colSpan: 7, style: Object.assign({}, thS, { textAlign: 'center', color: C.green, letterSpacing: 2 }) }, '— CALLS —'),
                        // Strike header (center)
                        h('th', { style: thCenter }, 'STRIKE'),
                        // Puts header (right)
                        view !== 'calls' && h('th', { colSpan: 7, style: Object.assign({}, thS, { textAlign: 'center', color: C.red, letterSpacing: 2 }) }, '— PUTS —')
                    ),
                    h('tr', null,
                        view !== 'puts'  && h('th', { style: thSL }, 'OI'),
                        view !== 'puts'  && h('th', { style: thS }, 'Vol'),
                        view !== 'puts'  && h('th', { style: thS }, 'Delta'),
                        view !== 'puts'  && h('th', { style: thS }, 'IV'),
                        view !== 'puts'  && h('th', { style: thS }, 'Chg'),
                        view !== 'puts'  && h('th', { style: Object.assign({}, thS, { color: C.green }) }, 'Bid'),
                        view !== 'puts'  && h('th', { style: Object.assign({}, thS, { color: C.green }) }, 'Ask'),
                        h('th', { style: thCenter }, ''),
                        view !== 'calls' && h('th', { style: Object.assign({}, thS, { color: C.red }) }, 'Bid'),
                        view !== 'calls' && h('th', { style: Object.assign({}, thS, { color: C.red }) }, 'Ask'),
                        view !== 'calls' && h('th', { style: thS }, 'Chg'),
                        view !== 'calls' && h('th', { style: thS }, 'IV'),
                        view !== 'calls' && h('th', { style: thS }, 'Delta'),
                        view !== 'calls' && h('th', { style: thS }, 'Vol'),
                        view !== 'calls' && h('th', { style: thS }, 'OI')
                    )
                ),
                h('tbody', null,
                    strikes.map(function (strike) {
                        var c = callByStrike[strike] || {};
                        var pu = putByStrike[strike] || {};
                        var atm = lastPrice && Math.abs(strike - lastPrice) / lastPrice < 0.005;
                        var rowBg = atm ? 'rgba(245,158,11,0.06)' : 'transparent';
                        return h('tr', { key: strike, style: { background: rowBg } },
                            view !== 'puts'  && cellN(c.oi    != null ? c.oi.toLocaleString()       : '—', C.sec),
                            view !== 'puts'  && cellN(c.volume != null ? c.volume.toLocaleString()  : '—'),
                            view !== 'puts'  && cellN(fDelta(c.delta), c.delta > 0.5 ? C.green : C.text),
                            view !== 'puts'  && cellN(fIV(c.iv)),
                            view !== 'puts'  && cellN(c.chg != null ? (c.chg >= 0 ? '+' : '') + fOpt(c.chg) : '—', c.chg >= 0 ? C.green : C.red),
                            view !== 'puts'  && h('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, padding: '5px 6px', textAlign: 'right', color: C.green, fontWeight: 700, background: 'rgba(16,185,129,0.08)', borderBottom: '1px solid rgba(255,255,255,0.03)' } }, c.bid != null ? fOpt(c.bid) : '—'),
                            view !== 'puts'  && h('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, padding: '5px 6px', textAlign: 'right', color: C.green, fontWeight: 700, background: 'rgba(16,185,129,0.08)', borderBottom: '1px solid rgba(255,255,255,0.03)' } }, c.ask != null ? fOpt(c.ask) : '—'),
                            cellStrike(strike, atm),
                            view !== 'calls' && h('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, padding: '5px 6px', textAlign: 'right', color: C.red, fontWeight: 700, background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(255,255,255,0.03)' } }, pu.bid != null ? fOpt(pu.bid) : '—'),
                            view !== 'calls' && h('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, padding: '5px 6px', textAlign: 'right', color: C.red, fontWeight: 700, background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(255,255,255,0.03)' } }, pu.ask != null ? fOpt(pu.ask) : '—'),
                            view !== 'calls' && cellN(pu.chg != null ? (pu.chg >= 0 ? '+' : '') + fOpt(pu.chg) : '—', pu.chg >= 0 ? C.green : C.red),
                            view !== 'calls' && cellN(fIV(pu.iv)),
                            view !== 'calls' && cellN(fDelta(pu.delta), pu.delta < -0.5 ? C.red : C.text),
                            view !== 'calls' && cellN(pu.volume != null ? pu.volume.toLocaleString() : '—'),
                            view !== 'calls' && cellN(pu.oi    != null ? pu.oi.toLocaleString()     : '—', C.sec)
                        );
                    })
                )
            )
        )
    );
}

export function TradingDashboard() {
    var _sym  = useState('AAPL'); var symbol  = _sym[0];  var setSymbol  = _sym[1];
    var _live = useState(null);   var liveSym = _live[0]; var setLiveSym = _live[1];
    var _rng  = useState('1Y');   var range   = _rng[0];  var setRange   = _rng[1];
    var _tab  = useState('trade'); var tab    = _tab[0];   var setTab    = _tab[1];

    var acct = useAccount();
    var _q   = useQuote(liveSym);
    var quote = _q.quote; var qLoad = _q.loading; var qErr = _q.error;
    var _f   = useFundamentals(liveSym);

    function handleLoad(sym) { setSymbol(sym); setLiveSym(sym); }
    useEffect(function () { setLiveSym('AAPL'); }, []);

    var TABS = [
        { id: 'trade',   label: 'Trade' },
        { id: 'options', label: 'Options Chain' },
        { id: 'orders',  label: 'Order History' },
    ];

    return h('div', { style: { padding: '20px 24px', maxWidth: 1400, margin: '0 auto' } },

        // Row 1: Search + account
        h('div', { style: { display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' } },
            h(SymbolSearch, { symbol: symbol, onLoad: handleLoad }),
            h(AccountBadge, { acct: acct })
        ),

        // Row 2: Price hero + quote strip
        liveSym && h('div', {
            style: { background: C.card, borderRadius: 8, border: '1px solid ' + C.border, padding: '14px 18px', marginBottom: 14 }
        },
            qLoad && h('div', { style: { color: C.muted, fontSize: 12 } }, 'Fetching quote…'),
            qErr  && h('div', { style: { color: C.red,  fontSize: 12 } }, 'Quote error: ' + qErr),
            !qLoad && quote && h('div', null,
                h('div', { style: { fontSize: 10, color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 } }, liveSym),
                h(PriceHero,  { quote: quote }),
                h(QuoteStrip, { quote: quote })
            )
        ),

        // Row 3: Chart
        liveSym && h('div', { style: { marginBottom: 14 } },
            h(CandleChart, { symbol: liveSym, range: range, onRange: setRange })
        ),

        // Row 4: Tab bar
        h('div', { style: { display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 } },
            TABS.map(function (t) {
                var active = tab === t.id;
                return h('button', {
                    key: t.id,
                    onClick: function () { setTab(t.id); },
                    style: {
                        padding: '8px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: 'transparent', border: 'none',
                        borderBottom: active ? '2px solid ' + C.cyan : '2px solid transparent',
                        color: active ? C.cyan : C.sec,
                        marginBottom: -1,
                    },
                }, t.label);
            })
        ),

        // Tab content
        tab === 'trade' && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 14 } },
            h(OrderTicket,      { symbol: liveSym, quote: quote }),
            h(FundamentalsPanel, { data: _f.data, loading: _f.loading })
        ),
        tab === 'options' && h(OptionsChain, { symbol: liveSym, lastPrice: quote ? quote.last : null }),
        tab === 'orders'  && h(OrderHistory, null)
    );
}
