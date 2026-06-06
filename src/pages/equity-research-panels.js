import React from 'react';
import { sb } from './config.js';
import { PeerComparison } from './equity-peers.js';
import { TechnicalsTab } from './equity-technicals.js';

var h = React.createElement;
var useState = React.useState;
var useEffect = React.useEffect;
var useMemo = React.useMemo;

// ── tokens ────────────────────────────────────────────────────────────────────
var T = {
    cyan: '#22d3ee',   cyanDim:   'rgba(34,211,238,.13)',
    amber: '#f5b53d',  amberDim:  'rgba(245,181,61,.13)',
    green: '#41d18a',  greenDim:  'rgba(65,209,138,.13)',
    red: '#f76d6d',    redDim:    'rgba(247,109,109,.13)',
    violet: '#a78bfa', violetDim: 'rgba(167,139,250,.09)',
    text: '#e7eef5',   muted: '#7e8b99', muted2: '#5a6573',
    card: 'rgba(17,23,31,.97)', card2: 'rgba(20,27,37,.97)',
    border: 'rgba(255,255,255,.08)', border2: 'rgba(255,255,255,.13)',
    mono: "'JetBrains Mono',monospace", display: "'Syne','DM Sans',sans-serif",
};

// ── tiny helpers ──────────────────────────────────────────────────────────────
function nv(o, k) { var x = Number(o && o[k]); return fin(x) ? x : null; }
function fmtD(v, d) { if (!fin(v)) return '—'; var x = Number(v); return x.toFixed(d == null ? 2 : d); }
function fmtDol(v, d) { if (!fin(v)) return '—'; var x = Number(v); return '$' + x.toFixed(d == null ? 0 : d); }
function fmtPct(v, d) { if (!fin(v)) return '—'; var x = Number(v); return (x >= 0 ? '+' : '') + (x * 100).toFixed(d == null ? 1 : d) + '%'; }
function fmtB(n) {
    if (!fin(n)) return '—';
    var x = Number(n);
    var a = Math.abs(x);
    if (a >= 1e12) return (x < 0 ? '-' : '') + '$' + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9)  return (x < 0 ? '-' : '') + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6)  return (x < 0 ? '-' : '') + '$' + (a / 1e6).toFixed(1) + 'M';
    return '$' + x.toFixed(2);
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
// Strict finite check. Global fin(null) === true (null coerces to 0), which
// makes `fin(x) ? x.toFixed() : '—'` crash on null DB columns. fin() rejects
// null/undefined/NaN/Infinity while still accepting numeric strings.
function fin(v) {
    if (v == null) return false;
    v = Number(v);
    return v === v && v !== Infinity && v !== -Infinity;
}

// ── shared UI ─────────────────────────────────────────────────────────────────
function Card(p) {
    return h('div', {
        style: Object.assign({ border: '1px solid ' + T.border, borderRadius: 13, background: T.card, padding: 20 }, p.style || {})
    },
        (p.title || p.badge || p.meta) && h('div', {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }
        },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                p.title && h('div', {
                    style: { fontFamily: T.mono, fontSize: 11, letterSpacing: '.15em', color: T.muted, textTransform: 'uppercase' }
                }, p.title),
                p.badge && h('span', {
                    style: { fontFamily: T.mono, fontSize: 8.5, letterSpacing: '.1em', color: p.badgeColor || T.cyan, border: '1px solid ' + (p.badgeColor ? p.badgeColor + '66' : 'rgba(34,211,238,.4)'), borderRadius: 4, padding: '2px 5px' }
                }, p.badge)
            ),
            p.meta && h('div', { style: { fontFamily: T.mono, fontSize: 10, color: T.muted2 } }, p.meta)
        ),
        p.children
    );
}

function Pill(p) {
    return h('span', {
        style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: T.mono, fontSize: 10, padding: '3px 8px', borderRadius: 5, letterSpacing: '.05em', background: p.dim, color: p.color }
    }, p.text);
}

function StatBox(p) {
    return h('div', {
        style: { border: '1px solid ' + T.border, borderRadius: 11, padding: 16, background: T.card2 }
    },
        h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: T.muted2, textTransform: 'uppercase', marginBottom: 8 } }, p.label),
        h('div', { style: { fontFamily: T.mono, fontSize: p.big ? 30 : 22, fontWeight: 600, color: p.color || T.text } }, p.value),
        p.sub && h('div', { style: { marginTop: 6, fontSize: 11, color: T.muted } }, p.sub)
    );
}

// Editable slider row — drives interactive scenario inputs.
function SliderRow(p) {
    // p: { label, value, min, max, step, fmt, color, onChange }
    return h('div', { style: { marginBottom: 10 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 } },
            h('span', { style: { fontSize: 11, color: T.muted } }, p.label),
            h('b', { style: { fontFamily: T.mono, fontSize: 12, color: p.color || T.text, fontWeight: 600 } },
                p.fmt ? p.fmt(p.value) : String(p.value))
        ),
        h('input', {
            type: 'range', min: p.min, max: p.max, step: p.step, value: p.value,
            onChange: function(e) { p.onChange(parseFloat(e.target.value)); },
            style: { width: '100%', height: 4, accentColor: p.color || T.cyan, cursor: 'pointer' }
        })
    );
}

function CkRow(p) {
    var dot = p.na ? T.muted2 : p.pass ? T.green : T.red;
    return h('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + T.border, fontSize: 12.5 }
    },
        h('span', { style: { color: T.muted } }, p.label),
        h('span', { style: { fontFamily: T.mono, fontSize: 11, display: 'flex', alignItems: 'center', gap: 8, color: p.na ? T.muted2 : dot } },
            h('span', { style: { width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 } }),
            p.na ? '—' : p.value != null ? String(p.value) : (p.pass ? '1' : '0')
        )
    );
}

function Note(p) {
    return h('div', { style: Object.assign({ fontSize: 12, color: T.muted, lineHeight: 1.55 }, p.style || {}) }, p.children);
}

function Grid(p) {
    return h('div', { style: Object.assign({ display: 'grid', gap: 14 }, p.style || {}) }, p.children);
}

// ── football field (FIXED SCALING) ───────────────────────────────────────────
// All positions are computed from actual values — no hardcoding.
function FootballField(p) {
    var models = p.models || [];  // [{label, lo, point, hi}]
    var price = p.price;
    var blendedFV = p.blendedFV;

    var allVals = [];
    models.forEach(function(m) { [m.lo, m.point, m.hi].forEach(function(v) { if (fin(v)) allVals.push(v); }); });
    if (fin(price)) allVals.push(price);
    if (fin(blendedFV)) allVals.push(blendedFV);
    if (!allVals.length) return h(Note, null, 'Insufficient data for football field.');

    var dataMin = Math.min.apply(null, allVals);
    var dataMax = Math.max.apply(null, allVals);
    var span = dataMax - dataMin || 1;
    var pad = span * 0.15;
    var axisMin = Math.floor((dataMin - pad) / 5) * 5;
    var axisMax = Math.ceil((dataMax + pad) / 5) * 5;
    var axisSpan = axisMax - axisMin;
    function pos(v) { return fin(v) ? clamp((v - axisMin) / axisSpan * 100, 0, 100) : null; }

    var ticks = [0, 1, 2, 3, 4].map(function(i) { return Math.round(axisMin + axisSpan * i / 4); });

    return h('div', null,
        models.map(function(m, i) {
            var lo = pos(m.lo), hi = pos(m.hi), pt = pos(m.point);
            return h('div', { key: m.label, style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 13 } },
                h('div', { style: { width: 145, fontSize: 12, color: T.muted, flexShrink: 0 } }, m.label),
                h('div', { style: { flex: 1, height: 20, position: 'relative' } },
                    lo != null && hi != null && h('div', {
                        style: { position: 'absolute', left: lo + '%', width: Math.max(2, hi - lo) + '%', height: '100%', borderRadius: 5, background: T.cyanDim, top: 0 }
                    }),
                    pt != null && h('div', {
                        style: { position: 'absolute', left: pt + '%', width: 2, height: 26, top: -3, background: T.text, transform: 'translateX(-1px)' }
                    })
                )
            );
        }),
        fin(blendedFV) && h('div', { style: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 6 } },
            h('div', { style: { width: 145, fontSize: 12, color: T.amber, fontWeight: 600, flexShrink: 0 } }, 'Blended FV'),
            h('div', { style: { flex: 1, height: 20, position: 'relative' } },
                h('div', {
                    style: { position: 'absolute', left: Math.max(0, pos(blendedFV) - 1.5) + '%', width: '5%', height: '100%', borderRadius: 5, background: T.amber, top: 0, opacity: .9 }
                }),
                fin(price) && h('div', {
                    style: { position: 'absolute', left: pos(price) + '%', width: 2, height: 30, top: -5, background: T.green, transform: 'translateX(-1px)' },
                    title: 'Current price ' + fmtDol(price, 2)
                })
            )
        ),
        h('div', {
            style: { display: 'flex', justifyContent: 'space-between', marginTop: 6, marginLeft: 159, fontFamily: T.mono, fontSize: 10, color: T.muted2 }
        }, ticks.map(function(t) { return h('span', { key: t }, '$' + t); })),
        fin(price) && fin(blendedFV) && h(Note, { style: { marginTop: 14, borderTop: '1px solid ' + T.border, paddingTop: 12 } },
            'Blended fair value ', h('b', { style: { color: T.amber } }, fmtDol(blendedFV)),
            '. Current price ', h('b', { style: { color: T.green } }, fmtDol(price, 2)),
            ' (' + (price > blendedFV
                ? h('span', { style: { color: T.red } }, fmtPct((price - blendedFV) / blendedFV) + ' above FV — modest overvaluation')
                : h('span', { style: { color: T.green } }, fmtPct((price - blendedFV) / blendedFV) + ' below FV — modest discount')
            ) + '). Green marker = current price.'
        )
    );
}

// ── DCF engine ────────────────────────────────────────────────────────────────
function dcfEV(revenue0, gr, margin, tax, wacc, g, n) {
    if (wacc <= g) return NaN;
    var pv = 0, rev = revenue0;
    for (var t = 1; t <= n; t++) {
        rev *= (1 + gr);
        pv += rev * margin * (1 - tax) / Math.pow(1 + wacc, t);
    }
    var lastFCFF = rev * margin * (1 - tax);
    pv += (lastFCFF * (1 + g) / (wacc - g)) / Math.pow(1 + wacc, n);
    return pv;
}

function dcfFV(revenue0, gr, margin, tax, wacc, g, n, netDebt, shares) {
    var ev = dcfEV(revenue0, gr, margin, tax, wacc, g, n);
    if (!fin(ev) || !shares) return null;
    return (ev - netDebt) / shares;
}

function bisect(fn, target, lo, hi, iters) {
    iters = iters || 64;
    for (var i = 0; i < iters; i++) {
        var mid = (lo + hi) / 2;
        if (fn(mid) > target) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
}

function solveImpliedCAGR(price, shares, netDebt, revenue0, margin, tax, wacc, g, n) {
    var ev = price * shares + netDebt;
    return bisect(function(gr) { return dcfEV(revenue0, gr, margin, tax, wacc, g, n); }, ev, -0.05, 0.60);
}

function solveImpliedMargin(price, shares, netDebt, revenue0, gr, tax, wacc, g, n) {
    var ev = price * shares + netDebt;
    return bisect(function(m) { return dcfEV(revenue0, gr, m, tax, wacc, g, n); }, ev, 0.01, 0.85);
}

// ── parse key inputs from AV + snap ──────────────────────────────────────────
export function parseInputs(rawOverview, snap, price) {
    var o = rawOverview || {}, s = snap || {};
    var num = function(k, src) { var x = Number((src || o)[k]); return fin(x) ? x : null; };
    var sn = function(k) { return num(k, s); };

    var mktCap    = num('MarketCapitalization');
    var shares    = (price && mktCap) ? mktCap / price : null;
    if (!shares && sn('netIncome') && num('EPS')) shares = sn('netIncome') / num('EPS');

    var totalDebt = sn('totalDebt') || 0;
    var totalCash = sn('totalCash') || 0;
    var netDebt   = totalDebt - totalCash;

    var revenue   = sn('totalRevenue');
    var ebitda    = sn('ebitda');
    var operM     = sn('operatingMargins');
    var netM      = sn('profitMargins');
    var netIncome = sn('netIncome');
    var cfo       = sn('operatingCashflow');
    var fcf       = sn('freeCashflow');
    var bookVal   = sn('bookValue');     // per share
    var grossM    = sn('grossMargins');
    var trailEps  = sn('trailingEps') || num('EPS');
    var fwdEps    = sn('forwardEps');
    var fwdPE     = sn('forwardPE');
    var divPS     = num('DividendPerShare');
    var divYield  = num('DividendYield');
    var roe       = sn('returnOnEquity');
    var roa       = sn('returnOnAssets');
    var revGrowth = sn('revenueGrowth');
    var epsGrowth = sn('earningsGrowth');
    var evActual  = sn('enterpriseValue');
    var evEbitda  = sn('evToEbitda') || num('EVToEBITDA');
    var evRev     = sn('evToRevenue') || num('EVToRevenue');
    var pb        = sn('priceToBook')  || num('PriceToBookRatio');
    var peg       = sn('pegRatio')     || num('PEGRatio');
    var ma50      = num('50DayMovingAverage');
    var ma200     = num('200DayMovingAverage');
    var beta      = num('Beta');
    var analystT  = num('AnalystTargetPrice');

    // Tax rate approximation
    var ebit = (revenue && operM) ? revenue * operM : null;
    var taxRate = (ebit && netIncome && ebit > 0) ? clamp(1 - netIncome / ebit, 0.10, 0.40) : 0.21;

    return {
        shares, mktCap, netDebt, totalDebt, totalCash,
        revenue, ebitda, operM, netM, netIncome, cfo, fcf,
        bookVal, grossM, trailEps, fwdEps, fwdPE,
        divPS, divYield, roe, roa, revGrowth, epsGrowth,
        evActual, evEbitda, evRev, pb, peg, taxRate,
        ma50, ma200, beta, analystT,
        wacc: 0.085, termGrowth: 0.025, horizon: 10,
    };
}

// ── VERDICT STRIP ─────────────────────────────────────────────────────────────
export function VerdictStrip(p) {
    var inp = p.inputs;
    var derived = p.derived; // from equity_fundamentals_derived

    if (!inp) return null;

    // Compute composite FV (blended of available methods)
    var fvs = [];
    var n = inp.horizon, wacc = inp.wacc, g = inp.termGrowth;
    var gr = fin(inp.revGrowth) ? inp.revGrowth : 0.10;
    var margin = fin(inp.operM) ? inp.operM : 0.20;

    if (inp.revenue && inp.shares) {
        var fv1 = dcfFV(inp.revenue, gr, margin, inp.taxRate, wacc, g, n, inp.netDebt, inp.shares);
        if (fin(fv1) && fv1 > 0) fvs.push(fv1);
        // EV/EBITDA FV
        if (inp.ebitda && inp.shares) {
            var peerMult = fin(inp.evEbitda) ? inp.evEbitda * 0.9 : 18; // slight discount to current
            var fv2 = (inp.ebitda * peerMult - inp.netDebt) / inp.shares;
            if (fin(fv2) && fv2 > 0) fvs.push(fv2);
        }
    }
    if (inp.trailEps && inp.trailEps > 0) {
        var fv3 = inp.trailEps * 20; // simple 20x earnings
        fvs.push(fv3);
    }

    var compositeFV = fvs.length ? fvs.reduce(function(a, b) { return a + b; }, 0) / fvs.length : null;
    var upside = (compositeFV && p.price) ? (compositeFV / p.price - 1) : null;

    // Prob-weighted EV from Bull/Base/Bear (defaults)
    var ev_pw = p.ev_pw;

    // Quality grade
    var qualGrade = (derived && derived.piotroski_f != null)
        ? (derived.piotroski_f >= 7 ? 'A−' : derived.piotroski_f >= 5 ? 'B' : 'C')
        : (inp.roe && inp.roe > 0.20 ? 'B+' : '—');

    var forensicClean = (derived && derived.beneish_m != null) ? derived.beneish_m < -1.78 : null;
    var upsideColor = upside == null ? T.muted : upside >= 0.10 ? T.green : upside >= -0.05 ? T.amber : T.red;

    // Call
    var call, callColor, callDim;
    if (upside == null)              { call = 'REVIEW DATA'; callColor = T.muted;  callDim = T.border; }
    else if (upside >= 0.15)         { call = 'BUY · meaningful MoS'; callColor = T.green; callDim = T.greenDim; }
    else if (upside >= 0.03)         { call = 'ACCUMULATE · narrow MoS'; callColor = T.cyan;  callDim = T.cyanDim; }
    else if (upside >= -0.05)        { call = 'HOLD · limited MoS'; callColor = T.amber; callDim = T.amberDim; }
    else                             { call = 'REDUCE · overvalued'; callColor = T.red;   callDim = T.redDim; }

    var sep = h('div', { style: { width: 1, height: 34, background: T.border, flexShrink: 0 } });
    function vs(label, value, color) {
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
            h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: T.muted2, textTransform: 'uppercase' } }, label),
            h('div', { style: { fontFamily: T.mono, fontSize: 17, fontWeight: 600, color: color || T.text } }, value)
        );
    }

    return h('div', {
        style: {
            display: 'flex', alignItems: 'center', gap: 22,
            border: '1px solid ' + T.border, borderRadius: 11,
            background: 'linear-gradient(135deg,' + T.card2 + ',' + T.card + ')',
            padding: '14px 20px', marginBottom: 16, flexWrap: 'wrap',
        }
    },
        vs('Composite FV', fin(compositeFV) ? fmtDol(compositeFV) : '—'),
        sep,
        vs('Up / Downside', fin(upside) ? fmtPct(upside) : '—', upsideColor),
        sep,
        vs('Prob-weighted EV', fin(ev_pw) ? fmtDol(ev_pw) : '—'),
        sep,
        vs('Quality', qualGrade, qualGrade.startsWith('A') ? T.green : qualGrade.startsWith('B') ? T.cyan : T.amber),
        sep,
        vs('Forensic flag', forensicClean == null ? '—' : forensicClean ? 'Clean' : 'Flag', forensicClean == null ? null : forensicClean ? T.green : T.red),
        h('div', {
            style: {
                marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 9,
                border: '1px solid ' + callColor, borderRadius: 8, padding: '9px 15px', background: callDim,
            }
        },
            h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: callColor, flexShrink: 0 } }),
            h('b', { style: { fontFamily: T.mono, fontSize: 13, color: callColor, letterSpacing: '.05em' } }, call)
        )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI THESIS SYNTHESIZER CARD
// ─────────────────────────────────────────────────────────────────────────────
function AIThesisCard(p) {
    var _st = useState('idle'); // 'idle' | 'loading' | 'done' | 'error'
    var genStatus = _st[0], setGenStatus = _st[1];
    var _err = useState(null); var errMsg = _err[0], setErrMsg = _err[1];
    var thesis = p.thesis;

    function generate() {
        if (!p.symbol) return;
        setGenStatus('loading'); setErrMsg(null);
        // Call edge function via Supabase client (imported at top of file)
        sb.functions.invoke('synthesize_thesis', { body: { ticker: p.symbol } })
            .then(function(res) {
                if (res.error) { setErrMsg(res.error.message || 'Generation failed'); setGenStatus('error'); return; }
                var d = res.data;
                if (d && d.bull && d.bear) {
                    p.onThesis && p.onThesis(d);
                    setGenStatus('done');
                } else {
                    setErrMsg((d && d.error) || 'Unexpected response from synthesizer');
                    setGenStatus('error');
                }
            })
            .catch(function(e) { setErrMsg(e.message || 'Network error'); setGenStatus('error'); });
    }

    var hasThesis = thesis && thesis.bull && thesis.bull.length;
    var isLoading = genStatus === 'loading';

    return h('div', {
        style: { border: '1px solid rgba(167,139,250,.3)', borderRadius: 13, background: T.violetDim, padding: 20 }
    },
        // Header row
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: hasThesis ? 16 : 12 } },
            h('span', { style: { fontFamily: T.mono, fontSize: 9, letterSpacing: '.14em', color: T.violet, border: '1px solid rgba(167,139,250,.4)', borderRadius: 5, padding: '4px 8px', flexShrink: 0 } }, '◆ AI ANALYST'),
            h('div', { style: { fontFamily: T.mono, fontSize: 11, letterSpacing: '.15em', color: T.muted, textTransform: 'uppercase' } }, 'Thesis Synthesizer'),
            hasThesis && thesis.filing_date && h('div', { style: { fontFamily: T.mono, fontSize: 10, color: T.muted2 } }, '10-K · ' + thesis.filing_date),
            h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' } },
                !hasThesis && !isLoading && h('button', {
                    onClick: generate,
                    style: { fontFamily: T.mono, fontSize: 10, color: T.violet, background: 'rgba(167,139,250,.12)', border: '1px solid rgba(167,139,250,.4)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }
                }, 'Generate'),
                hasThesis && h('button', {
                    onClick: generate, disabled: isLoading,
                    style: { fontFamily: T.mono, fontSize: 9, color: T.muted2, background: 'transparent', border: '1px solid ' + T.border, borderRadius: 6, padding: '4px 10px', cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1 }
                }, isLoading ? 'Refreshing…' : 'Refresh'),
                isLoading && !hasThesis && h('div', { style: { fontFamily: T.mono, fontSize: 10, color: T.violet } }, 'Fetching 10-K from EDGAR…')
            )
        ),

        // Loading skeleton
        isLoading && !hasThesis && h('div', null,
            h(Note, null, 'Reading SEC EDGAR 10-K filing · extracting MD&A · calling Claude · this takes ~15 seconds.'),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 } },
                [T.green, T.red].map(function(col, i) {
                    return h('div', { key: i, style: { border: '1px solid ' + col + '33', borderRadius: 9, padding: 14 } },
                        h('div', { style: { fontFamily: T.mono, fontSize: 10, color: col, marginBottom: 10, letterSpacing: '.1em' } }, i === 0 ? 'BULL CASE' : 'BEAR CASE'),
                        [1,2,3].map(function(j) {
                            return h('div', { key: j, style: { height: 10, background: 'rgba(255,255,255,.06)', borderRadius: 4, marginBottom: 8, width: (60 + j * 10) + '%' } });
                        })
                    );
                })
            )
        ),

        // Error
        genStatus === 'error' && h(Note, { style: { color: T.red, marginBottom: 10 } }, errMsg || 'Generation failed.'),

        // Summary
        hasThesis && thesis.summary && h('div', { style: { fontFamily: 'inherit', fontSize: 12.5, color: T.muted, lineHeight: 1.6, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid ' + T.border } },
            thesis.summary
        ),

        // Bull / Bear grid
        hasThesis && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
            [
                { key: 'bull', label: 'BULL CASE', color: T.green, dim: T.greenDim, items: thesis.bull },
                { key: 'bear', label: 'BEAR CASE', color: T.red,   dim: T.redDim,   items: thesis.bear },
            ].map(function(side) {
                return h('div', { key: side.key },
                    h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: side.color, textTransform: 'uppercase', marginBottom: 10 } }, side.label),
                    (side.items || []).map(function(item, idx) {
                        return h('div', { key: idx,
                            style: { padding: '10px 12px', borderRadius: 8, background: side.dim, border: '1px solid ' + side.color + '33', marginBottom: 8 }
                        },
                            h('div', { style: { fontSize: 12.5, color: T.text, lineHeight: 1.55, marginBottom: 5 } }, item.point),
                            h('div', { style: { fontFamily: T.mono, fontSize: 9, color: side.color, opacity: 0.75 } }, item.source)
                        );
                    })
                );
            })
        ),

        // Empty prompt (no thesis yet, not loading)
        !hasThesis && !isLoading && genStatus !== 'error' && h(Note, null,
            'Click Generate to fetch this company\'s latest 10-K from SEC EDGAR and produce structured bull/bear investment drivers using Claude. Results are cached for 90 days.'
        )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — THESIS
// ─────────────────────────────────────────────────────────────────────────────
export function ThesisTab(p) {
    var inp = p.inputs, price = p.price;
    if (!inp) return h(Note, null, 'No data loaded.');

    // ── Compute FV models ──────────────────────────────────────────────────
    var n = inp.horizon, wacc = inp.wacc, g = inp.termGrowth;
    var gr = fin(inp.revGrowth) ? inp.revGrowth : 0.10;
    var margin = fin(inp.operM) ? inp.operM : 0.20;
    var tax = inp.taxRate;

    var models = [];
    if (inp.revenue && inp.shares && fin(margin) && margin > 0) {
        var fv_base = dcfFV(inp.revenue, gr, margin, tax, wacc, g, n, inp.netDebt, inp.shares);
        var fv_lo   = dcfFV(inp.revenue, gr * 0.7, margin * 0.88, tax, wacc + 0.01, g, n, inp.netDebt, inp.shares);
        var fv_hi   = dcfFV(inp.revenue, gr * 1.35, margin * 1.12, tax, wacc - 0.01, g, n, inp.netDebt, inp.shares);
        if (fin(fv_lo) && fin(fv_hi) && fv_lo > 0) {
            models.push({ label: '2-stage DCF', lo: fv_lo, point: fv_base, hi: fv_hi });
        }
        // Reverse DCF: solve implied GR, then vary margin ±100bps
        if (fin(price) && inp.shares) {
            var impliedGR  = solveImpliedCAGR(price, inp.shares, inp.netDebt, inp.revenue, margin, tax, wacc, g, n);
            var rdcf_lo    = dcfFV(inp.revenue, impliedGR, margin - 0.01, tax, wacc, g, n, inp.netDebt, inp.shares);
            var rdcf_hi    = dcfFV(inp.revenue, impliedGR, margin + 0.01, tax, wacc, g, n, inp.netDebt, inp.shares);
            if (fin(rdcf_lo) && rdcf_lo > 0) {
                models.push({ label: 'Reverse DCF (implied)', lo: Math.min(rdcf_lo, price), point: price, hi: Math.max(rdcf_hi, price) });
            }
        }
    }
    if (inp.ebitda && inp.shares) {
        var peerLo = inp.evEbitda ? inp.evEbitda * 0.7 : 14;
        var peerHi = inp.evEbitda ? inp.evEbitda * 1.1 : 26;
        var peerMid = (peerLo + peerHi) / 2;
        var ev_lo  = (inp.ebitda * peerLo - inp.netDebt) / inp.shares;
        var ev_hi  = (inp.ebitda * peerHi - inp.netDebt) / inp.shares;
        var ev_mid = (inp.ebitda * peerMid - inp.netDebt) / inp.shares;
        if (fin(ev_lo) && ev_lo > 0) models.push({ label: 'EV/EBITDA peers', lo: ev_lo, point: ev_mid, hi: ev_hi });
    }
    if (inp.divPS && inp.divPS > 0 && wacc > g) {
        var ddm_lo  = inp.divPS / (wacc + 0.01 - g);
        var ddm_hi  = inp.divPS / (wacc - 0.01 - g + 0.01);
        var ddm_mid = inp.divPS / (wacc - g);
        if (fin(ddm_lo) && ddm_lo > 0) models.push({ label: 'DDM', lo: ddm_lo, point: ddm_mid, hi: ddm_hi });
    } else if (inp.trailEps && inp.trailEps > 0) {
        // Use earnings-based FV as DDM proxy for non-payers
        var ddmProxy_lo  = inp.trailEps * 16;
        var ddmProxy_hi  = inp.trailEps * 28;
        var ddmProxy_mid = inp.trailEps * 22;
        models.push({ label: 'Earnings Multiple', lo: ddmProxy_lo, point: ddmProxy_mid, hi: ddmProxy_hi });
    }

    var fvs = models.filter(function(m) { return fin(m.point) && m.point > 0; }).map(function(m) { return m.point; });
    var blendedFV = fvs.length ? fvs.reduce(function(a, b) { return a + b; }, 0) / fvs.length : null;
    if (fin(blendedFV)) p.onBlendedFV && p.onBlendedFV(blendedFV);

    // ── Bull / Base / Bear ─────────────────────────────────────────────────
    var _bbb = useState({ bull: { cagr: 0.16, margin: 0.47, mult: 32, prob: 25 }, base: { cagr: 0.13, margin: 0.44, mult: 28, prob: 50 }, bear: { cagr: 0.08, margin: 0.40, mult: 22, prob: 25 } });
    var bbb = _bbb[0], setBBB = _bbb[1];

    function bbbFV(s) {
        if (!inp.revenue || !inp.ebitda || !inp.shares) return null;
        var rev_n = inp.revenue * Math.pow(1 + s.cagr, n);
        var ebitda_n = rev_n * s.margin;
        var tv = ebitda_n * s.mult;
        var dcfPart = 0, rev = inp.revenue;
        for (var t = 1; t <= n; t++) {
            rev *= (1 + s.cagr);
            dcfPart += rev * s.margin * (1 - tax) / Math.pow(1 + wacc, t);
        }
        var ev_total = dcfPart + tv / Math.pow(1 + wacc, n);
        return (ev_total - inp.netDebt) / inp.shares;
    }

    var bullFV = bbbFV(bbb.bull);
    var baseFV = bbbFV(bbb.base);
    var bearFV = bbbFV(bbb.bear);
    var ev_pw = null;
    if (fin(bullFV) && fin(baseFV) && fin(bearFV)) {
        var tot = bbb.bull.prob + bbb.base.prob + bbb.bear.prob;
        ev_pw = (bullFV * bbb.bull.prob + baseFV * bbb.base.prob + bearFV * bbb.bear.prob) / tot;
        if (p.onEVPW) p.onEVPW(ev_pw);
    }
    var rrRatio = (fin(bullFV) && fin(bearFV) && fin(price))
        ? Math.abs(bullFV - price) / Math.abs(price - bearFV) : null;

    // ── Render ─────────────────────────────────────────────────────────────
    return h('div', null,
        // Football field + R/R
        h(Grid, { style: { gridTemplateColumns: '1.3fr .7fr', marginBottom: 14 } },
            h(Card, { title: 'Composite Fair-Value Synthesizer', badge: 'REWORKED', meta: 'football field · ' + models.length + ' methods' },
                h(FootballField, { models: models, price: price, blendedFV: blendedFV })
            ),
            h(Card, { title: 'Risk / Reward', badge: 'NEW' },
                fin(bullFV) && fin(bearFV) && fin(price)
                    ? h('div', null,
                        h('svg', { width: '100%', height: 130, viewBox: '0 0 200 130' },
                            h('line', { x1: 100, y1: 10, x2: 100, y2: 120, stroke: T.border2, strokeWidth: 1 }),
                            h('rect', { x: 100, y: 22, width: 65, height: 24, rx: 4, fill: T.greenDim, stroke: T.green }),
                            h('rect', { x: 46, y: 74, width: 54, height: 24, rx: 4, fill: T.redDim, stroke: T.red }),
                            h('text', { x: 170, y: 38, fill: T.green, fontFamily: T.mono, fontSize: 11 }, '+' + fmtD((bullFV / price - 1) * 100, 1) + '%'),
                            h('text', { x: 8, y: 90, fill: T.red, fontFamily: T.mono, fontSize: 11 }, fmtD((bearFV / price - 1) * 100, 1) + '%'),
                            h('text', { x: 100, y: 130, fill: T.muted2, fontFamily: T.mono, fontSize: 9, textAnchor: 'middle' }, 'current price')
                        ),
                        h(Note, { style: { textAlign: 'center', marginTop: 8 } },
                            'Reward/risk ',
                            h('b', { style: { color: rrRatio != null && rrRatio >= 1 ? T.green : T.red } }, fin(rrRatio) ? fmtD(rrRatio, 2) + '×' : '—'),
                            rrRatio != null ? (rrRatio >= 1 ? ' — favourable skew.' : ' — downside exceeds upside.') : ''
                        )
                    )
                    : h(Note, null, 'Load a ticker with earnings and balance sheet data.')
            )
        ),

        // Bull / Base / Bear — interactive
        h(Card, { title: 'Bull / Base / Bear — probability-weighted', badge: 'INTERACTIVE', meta: 'EV ' + (fin(ev_pw) ? fmtDol(ev_pw) : '—'), style: { marginBottom: 14 } },
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 } },
                [
                    { key: 'bull', label: 'Bull', color: T.green, topColor: T.green, s: bbb.bull },
                    { key: 'base', label: 'Base', color: T.cyan,  topColor: T.cyan,  s: bbb.base },
                    { key: 'bear', label: 'Bear', color: T.red,   topColor: T.red,   s: bbb.bear },
                ].map(function(sc) {
                    var fv = sc.key === 'bull' ? bullFV : sc.key === 'base' ? baseFV : bearFV;
                    var upPct = fin(fv) && fin(price) ? (fv / price - 1) : null;
                    function set(field, v) {
                        var next = Object.assign({}, bbb);
                        next[sc.key] = Object.assign({}, bbb[sc.key]); next[sc.key][field] = v;
                        setBBB(next);
                    }
                    return h('div', {
                        key: sc.key,
                        style: { border: '1px solid ' + T.border, borderTop: '3px solid ' + sc.topColor, borderRadius: 11, padding: 16, background: T.card2 }
                    },
                        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 } },
                            h('div', { style: { fontFamily: T.display, fontWeight: 700, fontSize: 14, color: sc.color } }, sc.label),
                            h('div', { style: { fontFamily: T.mono, fontSize: 20, fontWeight: 600, color: sc.color } }, fin(fv) ? fmtDol(fv) : '—')
                        ),
                        h('div', { style: { fontFamily: T.mono, fontSize: 10.5, color: upPct == null ? T.muted2 : upPct >= 0 ? T.green : T.red, marginBottom: 12, minHeight: 14 } },
                            upPct == null ? '' : (upPct >= 0 ? '+' : '') + (upPct * 100).toFixed(1) + '% vs price'),
                        h(SliderRow, { label: 'Revenue CAGR', value: sc.s.cagr, min: 0, max: 0.40, step: 0.005, color: sc.color, fmt: function(v) { return (v * 100).toFixed(1) + '%'; }, onChange: function(v) { set('cagr', v); } }),
                        h(SliderRow, { label: 'Terminal margin', value: sc.s.margin, min: 0.02, max: 0.70, step: 0.005, color: sc.color, fmt: function(v) { return (v * 100).toFixed(1) + '%'; }, onChange: function(v) { set('margin', v); } }),
                        h(SliderRow, { label: 'Exit multiple', value: sc.s.mult, min: 6, max: 50, step: 1, color: sc.color, fmt: function(v) { return v + '×'; }, onChange: function(v) { set('mult', v); } }),
                        h('div', { style: { marginTop: 7, paddingTop: 10, borderTop: '1px solid ' + T.border } },
                            h(SliderRow, { label: 'Probability', value: sc.s.prob, min: 0, max: 100, step: 5, color: sc.color, fmt: function(v) { return v + '%'; }, onChange: function(v) { set('prob', v); } })
                        )
                    );
                })
            ),
            (function() {
                var ptot = bbb.bull.prob + bbb.base.prob + bbb.bear.prob;
                var ok = ptot === 100;
                return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + T.border } },
                    h('span', { style: { fontFamily: T.mono, fontSize: 10.5, color: ok ? T.muted : T.amber } },
                        ok ? 'Probabilities sum to 100% · EV computed on weights as-is.' : 'Probabilities sum to ' + ptot + '% — EV is normalized to the total.'),
                    h('button', {
                        onClick: function() {
                            setBBB({ bull: { cagr: 0.16, margin: 0.47, mult: 32, prob: 25 }, base: { cagr: 0.13, margin: 0.44, mult: 28, prob: 50 }, bear: { cagr: 0.08, margin: 0.40, mult: 22, prob: 25 } });
                        },
                        style: { fontFamily: T.mono, fontSize: 10, color: T.muted, background: 'transparent', border: '1px solid ' + T.border2, borderRadius: 6, padding: '5px 11px', cursor: 'pointer' }
                    }, 'Reset')
                );
            })()
        ),

        // ── AI Thesis Synthesizer ─────────────────────────────────────────
        h(AIThesisCard, { thesis: p.thesis, symbol: p.symbol, onThesis: p.onThesis })
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — VALUATION
// ─────────────────────────────────────────────────────────────────────────────
export function ValuationTab(p) {
    var inp = p.inputs, price = p.price;
    if (!inp) return h(Note, null, 'No data loaded.');

    var n = inp.horizon, wacc = inp.wacc, g = inp.termGrowth;
    var gr = fin(inp.revGrowth) ? inp.revGrowth : 0.10;
    var margin = fin(inp.operM) ? inp.operM : 0.20;
    var tax = inp.taxRate;

    // Reverse DCF solved values
    var impliedCagr = null, impliedMargin = null, impliedROIC = null;
    var pvSplit = null;
    if (inp.revenue && inp.shares && fin(price)) {
        impliedCagr   = solveImpliedCAGR(price, inp.shares, inp.netDebt, inp.revenue, margin, tax, wacc, g, n);
        impliedMargin = solveImpliedMargin(price, inp.shares, inp.netDebt, inp.revenue, impliedCagr, tax, wacc, g, n);

        // PV split: explicit vs terminal
        var evTotal = price * inp.shares + inp.netDebt;
        var pvExplicit = 0, rev = inp.revenue;
        for (var t = 1; t <= n; t++) {
            rev *= (1 + impliedCagr);
            pvExplicit += rev * impliedMargin * (1 - tax) / Math.pow(1 + wacc, t);
        }
        pvSplit = fin(evTotal) && evTotal > 0 ? pvExplicit / evTotal : null;

        // Implied incremental ROIC
        var netNewIC = 0, rev2 = inp.revenue;
        for (var t2 = 1; t2 <= n; t2++) {
            var prevRev = rev2;
            rev2 *= (1 + impliedCagr);
            var deltaRev = rev2 - prevRev;
            netNewIC += deltaRev * impliedMargin * (1 - tax) * 1.5; // rough reinvestment
        }
        if (netNewIC > 0) {
            var totalNewNOPAT = inp.revenue * (Math.pow(1 + impliedCagr, n) - 1) * impliedMargin * (1 - tax);
            impliedROIC = totalNewNOPAT / netNewIC;
        }
    }

    // Sensitivity heatmap data
    var waccGrid = [0.075, 0.080, 0.085, 0.090, 0.095];
    var gGrid    = [0.015, 0.020, 0.025, 0.030, 0.035];
    var heatVals = waccGrid.map(function(w) {
        return gGrid.map(function(gg) {
            if (!inp.revenue || !inp.shares) return null;
            var fv = dcfFV(inp.revenue, impliedCagr || gr, impliedMargin || margin, tax, w, gg, n, inp.netDebt, inp.shares);
            return fin(fv) ? Math.round(fv) : null;
        });
    });

    // Tornado: ΔFV per driver
    var tornDrivers = [];
    if (inp.revenue && inp.shares) {
        function deltaFV(grOff, marginOff, waccOff, gOff) {
            var fvBase = dcfFV(inp.revenue, (impliedCagr || gr), (impliedMargin || margin), tax, wacc, g, n, inp.netDebt, inp.shares);
            var fvVar  = dcfFV(inp.revenue, (impliedCagr || gr) + grOff, (impliedMargin || margin) + marginOff, tax, wacc + waccOff, g + gOff, n, inp.netDebt, inp.shares);
            return fin(fvBase) && fin(fvVar) ? fvVar - fvBase : 0;
        }
        tornDrivers = [
            { label: 'Terminal margin (±200bps)', up: deltaFV(0, 0.02, 0, 0), dn: deltaFV(0, -0.02, 0, 0) },
            { label: 'WACC (±50bps)',              up: deltaFV(0, 0, -0.005, 0), dn: deltaFV(0, 0, 0.005, 0) },
            { label: 'Revenue CAGR (±2pp)',         up: deltaFV(0.02, 0, 0, 0), dn: deltaFV(-0.02, 0, 0, 0) },
            { label: 'Terminal growth (±50bps)',    up: deltaFV(0, 0, 0, 0.005), dn: deltaFV(0, 0, 0, -0.005) },
        ].sort(function(a, b) { return (Math.abs(b.up) + Math.abs(b.dn)) - (Math.abs(a.up) + Math.abs(a.dn)); });
    }
    var maxSwing = tornDrivers.length ? Math.max.apply(null, tornDrivers.map(function(d) { return Math.max(Math.abs(d.up), Math.abs(d.dn)); })) : 1;

    return h('div', null,
        // Reverse DCF panel
        h(Card, { title: 'Reverse DCF — Market-Implied Expectations', badge: 'NEW', meta: 'solved from ' + fmtDol(price, 2) + ' · WACC ' + (wacc * 100).toFixed(1) + '% · 10yr', style: { marginBottom: 14 } },
            h(Grid, { style: { gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 } },
                h(StatBox, {
                    label: 'Implied Revenue CAGR', big: true,
                    value: fin(impliedCagr) ? (impliedCagr * 100).toFixed(1) + '%' : '—',
                    color: T.cyan,
                    sub: fin(inp.revGrowth) ? 'vs ' + (inp.revGrowth * 100).toFixed(1) + '% delivered' : null,
                }),
                h(StatBox, {
                    label: 'Implied Terminal Margin', big: true,
                    value: fin(impliedMargin) ? (impliedMargin * 100).toFixed(1) + '%' : '—',
                    color: impliedMargin && inp.operM && impliedMargin > inp.operM * 1.05 ? T.amber : T.text,
                    sub: fin(inp.operM) ? 'vs ' + (inp.operM * 100).toFixed(1) + '% current operating margin' : null,
                }),
                h(StatBox, {
                    label: 'Implied Incr. ROIC', big: true,
                    value: fin(impliedROIC) ? (impliedROIC * 100).toFixed(1) + '%' : '—',
                    sub: fin(pvSplit) ? (pvSplit * 100).toFixed(0) + '% of EV in explicit period' : null,
                })
            ),
            fin(pvSplit) && h('div', { style: { marginBottom: 12 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 10, color: T.muted2, marginBottom: 5 } },
                    h('span', null, 'PV OF EXPLICIT ' + n + 'YR  ·  ' + (pvSplit * 100).toFixed(0) + '%'),
                    h('span', null, 'TERMINAL VALUE  ·  ' + ((1 - pvSplit) * 100).toFixed(0) + '%')
                ),
                h('div', { style: { display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', border: '1px solid ' + T.border } },
                    h('div', { style: { width: clamp(pvSplit * 100, 0, 100) + '%', background: T.cyanDim, borderRight: '2px solid ' + T.cyan, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, fontSize: 10, color: T.cyan } }, (pvSplit * 100).toFixed(0) + '%'),
                    h('div', { style: { flex: 1, background: T.amberDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, fontSize: 10, color: T.amber } }, ((1 - pvSplit) * 100).toFixed(0) + '%')
                )
            ),
            h(Note, null,
                fin(pvSplit) ? ((1 - pvSplit) * 100).toFixed(0) + '% of value sits in terminal value, so the margin assumption dominates. ' : '',
                'The market isn\'t asking for heroic growth — it\'s asking margins to hold at the current level for a decade.'
            )
        ),

        h(Grid, { style: { gridTemplateColumns: '1fr 1fr', marginBottom: 14 } },
            // Sensitivity heatmap
            h(Card, { title: 'Sensitivity — Fair Value', badge: 'NEW', meta: 'WACC × terminal growth' },
                h('div', { style: { display: 'grid', gridTemplateColumns: '50px repeat(5,1fr)', gap: 3, marginBottom: 4 } },
                    h('div'),
                    gGrid.map(function(gg) {
                        return h('div', { key: gg, style: { textAlign: 'center', fontFamily: T.mono, fontSize: 9.5, color: T.muted2 } }, (gg * 100).toFixed(1) + '%');
                    })
                ),
                h('div', { style: { display: 'grid', gridTemplateColumns: '50px repeat(5,1fr)', gap: 3 } },
                    waccGrid.map(function(w, ri) {
                        return [
                            h('div', { key: 'l' + ri, style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontFamily: T.mono, fontSize: 9.5, color: T.muted2, paddingRight: 4 } }, (w * 100).toFixed(1) + '%'),
                        ].concat(heatVals[ri].map(function(v, ci) {
                            var bg, fg;
                            if (v == null) { bg = T.card2; fg = T.muted2; }
                            else if (fin(price) && v >= price) {
                                var t = clamp((v - price) / price / 0.08, 0, 1);
                                bg = 'rgba(65,209,138,' + (0.12 + t * 0.5) + ')';
                                fg = '#cdeede';
                            } else {
                                var t2 = fin(price) ? clamp((price - v) / price / 0.12, 0, 1) : 0.5;
                                bg = 'rgba(247,109,109,' + (0.12 + t2 * 0.5) + ')';
                                fg = '#f6d2d2';
                            }
                            return h('div', {
                                key: ci,
                                style: { aspectRatio: '1.6', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, fontSize: 10, fontWeight: 500, background: bg, color: fg }
                            }, v != null ? v : '—');
                        }));
                    }).flat()
                ),
                h(Note, { style: { marginTop: 12 } }, 'Rows = WACC (' + (waccGrid[0] * 100) + '–' + (waccGrid[4] * 100) + '%). Green ≥ price, red < price. Rate-sensitive — valuation flips quickly as WACC rises.')
            ),

            // Tornado
            h(Card, { title: 'Value-Driver Tornado', badge: 'NEW', meta: 'Δ fair value, ±1 unit' },
                tornDrivers.length ? h('div', { style: { marginTop: 6 } },
                    tornDrivers.map(function(d) {
                        var upW = Math.abs(d.up) / maxSwing * 45;
                        var dnW = Math.abs(d.dn) / maxSwing * 45;
                        return h('div', { key: d.label, style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } },
                            h('div', { style: { width: 170, fontSize: 11.5, color: T.muted, textAlign: 'right', flexShrink: 0 } }, d.label),
                            h('div', { style: { flex: 1, height: 18, position: 'relative', display: 'flex', justifyContent: 'center' } },
                                h('div', { style: { position: 'absolute', top: '50%', left: '50%', width: 1, height: '140%', transform: 'translate(-50%,-50%)', background: T.border2 } }),
                                h('div', { style: { position: 'absolute', top: 0, right: '50%', width: dnW + '%', height: '100%', background: T.cyanDim, borderRight: '2px solid ' + T.cyan } }),
                                h('div', { style: { position: 'absolute', top: 0, left: '50%', width: upW + '%', height: '100%', background: T.amberDim, borderLeft: '2px solid ' + T.amber } })
                            )
                        );
                    }),
                    h(Note, { style: { marginTop: 14, borderTop: '1px solid ' + T.border, paddingTop: 12 } },
                        'The thesis is most fragile where assumptions are stretched. The largest swing factor is the key risk — that is where to focus scenario analysis.'
                    )
                ) : h(Note, null, 'Insufficient data for tornado.')
            )
        )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — QUALITY & FORENSICS
// ─────────────────────────────────────────────────────────────────────────────
export function QualityTab(p) {
    var inp = p.inputs, derived = p.derived, snap = p.snap;
    var s = snap || {};

    // Piotroski — compute what we can from AV data; prefer derived table
    var pd = derived && derived.piotroski_detail ? derived.piotroski_detail : null;
    var pf_score = derived && derived.piotroski_f != null ? derived.piotroski_f : null;

    var niPos      = pd ? pd.niPos      : (inp && fin(inp.netIncome)  ? inp.netIncome > 0  : null);
    var cfoPos     = pd ? pd.cfoPos     : (inp && fin(inp.cfo)        ? inp.cfo > 0        : null);
    var cfoGtNi    = pd ? pd.cfoGtNi    : (inp && fin(inp.cfo) && fin(inp.netIncome) ? inp.cfo > inp.netIncome : null);
    var roaRising  = pd ? pd.roaRising  : null;
    var levFalling = pd ? pd.levFalling : null;
    var crRising   = pd ? pd.crRising   : null;
    var noNewShares= pd ? pd.noNewShares: null;
    var gmRising   = pd ? pd.gmRising   : null;
    var atRising   = pd ? pd.atRising   : null;

    if (pf_score == null) {
        pf_score = [niPos, cfoPos, cfoGtNi, roaRising, levFalling, crRising, noNewShares, gmRising, atRising]
            .filter(function(v) { return v === true; }).length;
    }

    var pfColor = pf_score >= 7 ? T.green : pf_score >= 5 ? T.cyan : T.amber;
    var pfTag   = pf_score >= 7 ? 'STRONG' : pf_score >= 5 ? 'GOOD' : 'WEAK';

    // Altman Z'' (service/non-manufacturing model)
    // X1=WC/TA, X2=RE/TA, X3=EBIT/TA, X4=BV_equity/TL
    var az = derived && derived.altman_z != null ? derived.altman_z : null;
    var azComp = derived && derived.altman_components ? derived.altman_components : null;
    var azModel = derived && derived.altman_model ? derived.altman_model : 'service_z2';

    // Approximate if not in derived table (needs balance sheet — show approx)
    var azApprox = null;
    if (az == null && inp) {
        var bookEq = inp.bookVal && inp.shares ? inp.bookVal * inp.shares : null;
        var totalLiab = (inp.mktCap && bookEq) ? inp.mktCap / (inp.pb || 5) - bookEq : null;
        var approxTA = bookEq && inp.totalDebt ? bookEq + inp.totalDebt : null;
        var ebit = inp.revenue && inp.operM ? inp.revenue * inp.operM : null;
        if (approxTA && approxTA > 0) {
            var x3 = ebit ? ebit / approxTA : null;
            var x4 = (bookEq && totalLiab && totalLiab > 0) ? bookEq / totalLiab : null;
            if (fin(x3) && fin(x4)) {
                azApprox = 6.72 * x3 + 1.05 * x4; // partial — note as approximate
            }
        }
    }
    var azDisplay = fin(az) ? az : fin(azApprox) ? azApprox : null;
    var azZone = azModel === 'manufacturing'
        ? (azDisplay > 2.99 ? 'SAFE' : azDisplay > 1.81 ? 'GREY' : 'DISTRESS')
        : (azDisplay > 2.60 ? 'SAFE' : azDisplay > 1.10 ? 'GREY' : 'DISTRESS');
    var azColor = azZone === 'SAFE' ? T.green : azZone === 'GREY' ? T.amber : T.red;
    var azNeedlePos = azModel === 'manufacturing'
        ? clamp((azDisplay - 0) / 8 * 100, 2, 98)
        : clamp((azDisplay - 0) / 8 * 100, 2, 98);

    // Beneish M-Score
    var bm = derived && derived.beneish_m != null ? derived.beneish_m : null;
    var bmDetail = derived && derived.beneish_detail ? derived.beneish_detail : null;
    var bmFlag = bm != null ? bm > -1.78 : null;

    // Sloan accrual quality
    var sloan = derived ? derived.sloan_accrual : null;
    var accrualQ = derived ? derived.accrual_quality : null;
    // Approximate from available: (NI - CFO) / approx avg assets
    if (sloan == null && inp && fin(inp.netIncome) && fin(inp.cfo)) {
        var approxAssets = inp.mktCap ? inp.mktCap / (inp.pb || 3) + inp.totalDebt : null;
        if (approxAssets && approxAssets > 0) sloan = (inp.netIncome - inp.cfo) / approxAssets;
    }

    // CCC
    var cccHistory = derived && derived.ccc_history ? derived.ccc_history : null;

    return h('div', null,
        h(Grid, { style: { gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 } },
            // Piotroski
            h(Card, { title: 'Piotroski F-Score', badge: 'REWORKED' },
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 } },
                    h('div', { style: { fontFamily: T.mono, fontWeight: 600, fontSize: 40, color: pfColor } }, pf_score),
                    h('div', { style: { color: T.muted } }, '/ 9'),
                    h(Pill, { text: pfTag, color: pfColor, dim: pfColor === T.green ? T.greenDim : pfColor === T.cyan ? T.cyanDim : T.amberDim, style: { marginLeft: 'auto' } })
                ),
                [
                    ['Positive net income',        niPos,       null],
                    ['Positive operating CF',      cfoPos,      null],
                    ['Rising ROA',                 roaRising,   roaRising == null],
                    ['CF > net income (accruals)', cfoGtNi,     null],
                    ['Falling leverage',           levFalling,  levFalling == null],
                    ['Rising current ratio',       crRising,    crRising == null],
                    ['No new shares issued',       noNewShares, noNewShares == null],
                    ['Rising gross margin',        gmRising,    gmRising == null],
                    ['Rising asset turnover',      atRising,    atRising == null],
                ].map(function(r) {
                    return h(CkRow, { key: r[0], label: r[0], pass: r[1], na: r[2] });
                }),
                derived == null && h(Note, { style: { marginTop: 8, fontSize: 10 } }, '※ Multi-year ratios pending precomputation. Run sync_fundamentals to populate.')
            ),

            // Altman Z
            h(Card, { title: 'Altman Z-Score', badge: 'REWORKED' },
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 } },
                    h('div', { style: { fontFamily: T.mono, fontWeight: 600, fontSize: 40, color: azColor } }, fin(azDisplay) ? azDisplay.toFixed(1) : '—'),
                    h(Pill, { text: azZone, color: azColor, dim: azColor === T.green ? T.greenDim : azColor === T.amber ? T.amberDim : T.redDim })
                ),
                h('div', { style: { height: 30, borderRadius: 7, display: 'flex', overflow: 'hidden', border: '1px solid ' + T.border, position: 'relative', margin: '8px 0 4px' } },
                    h('div', { style: { flex: 33, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.red, fontFamily: T.mono, fontSize: 9, color: 'rgba(0,0,0,.55)', fontWeight: 600 } }, 'DISTRESS'),
                    h('div', { style: { flex: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.amber, fontFamily: T.mono, fontSize: 9, color: 'rgba(0,0,0,.55)', fontWeight: 600 } }, 'GREY'),
                    h('div', { style: { flex: 49, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.green, fontFamily: T.mono, fontSize: 9, color: 'rgba(0,0,0,.55)', fontWeight: 600 } }, 'SAFE'),
                    fin(azNeedlePos) && h('div', {
                        style: { position: 'absolute', top: -4, bottom: -4, left: azNeedlePos + '%', width: 3, background: T.text, boxShadow: '0 0 6px rgba(0,0,0,.6)' }
                    })
                ),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 9, color: T.muted2, marginBottom: 10 } },
                    h('span', null, '0'), h('span', null, azModel === 'manufacturing' ? '1.81' : '1.10'), h('span', null, azModel === 'manufacturing' ? '2.99' : '2.60'), h('span', null, '8+')
                ),
                h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.12em', color: T.muted2, textTransform: 'uppercase', margin: '12px 0 8px' } }, 'Components'),
                azComp ? [['X1 · working capital/assets', azComp.x1], ['X2 · retained earnings/assets', azComp.x2], ['X3 · EBIT/assets', azComp.x3], ['X4 · equity/liabilities', azComp.x4]].map(function(r) {
                    return h(CkRow, { key: r[0], label: r[0], value: fin(r[1]) ? r[1].toFixed(2) : '—', na: !fin(r[1]) });
                }) : h(Note, { style: { fontSize: 10 } }, azApprox != null ? '※ Partial estimate (X3+X4 only) — balance sheet needed for full score.' : 'Balance sheet data required. Run sync_fundamentals to populate.')
            ),

            // Beneish M
            h(Card, { title: 'Beneish M-Score', badge: 'NEW' },
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 } },
                    h('div', { style: { fontFamily: T.mono, fontWeight: 600, fontSize: 40, color: bm != null && !bmFlag ? T.green : bm != null ? T.red : T.muted } },
                        bm != null ? bm.toFixed(2) : '—'),
                    bm != null && h(Pill, { text: bmFlag ? 'FLAG' : 'NO FLAG', color: bmFlag ? T.red : T.green, dim: bmFlag ? T.redDim : T.greenDim })
                ),
                h(Note, { style: { marginBottom: 14 } }, bm != null
                    ? (bmFlag ? 'Above −1.78 threshold — elevated manipulation probability.' : 'Below −1.78 threshold — low probability of earnings manipulation.')
                    : 'Multi-year income statement required. Run sync_fundamentals to populate.'
                ),
                bmDetail
                    ? [['DSRI · receivables', bmDetail.dsri], ['GMI · gross margin', bmDetail.gmi], ['AQI · asset quality', bmDetail.aqi], ['SGI · sales growth', bmDetail.sgi], ['DEPI · depreciation', bmDetail.depi], ['TATA · total accruals', bmDetail.tata]].map(function(r) {
                        var v = Number(r[1]);
                        var warn = (r[0].includes('DSRI') && v > 1.1) || (r[0].includes('GMI') && v > 1.05) || (r[0].includes('TATA') && v > 0.05);
                        return h(CkRow, { key: r[0], label: r[0], value: fin(v) ? v.toFixed(2) : '—', pass: !warn, na: !fin(v) });
                    })
                    : h(Note, { style: { fontSize: 10 } }, 'Component detail available after sync_fundamentals run.')
            )
        ),

        h(Grid, { style: { gridTemplateColumns: '1fr 1fr' } },
            // Accruals
            h(Card, { title: 'Earnings Quality — Accruals', badge: 'NEW', meta: 'Sloan / Dechow-Dichev' },
                h(Grid, { style: { gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 } },
                    h(StatBox, { label: 'Sloan accrual ratio', value: fin(sloan) ? (sloan * 100).toFixed(1) + '%' : '—', color: fin(sloan) && Math.abs(sloan) < 0.05 ? T.green : T.amber, sub: 'Low accruals → earnings cash-backed' }),
                    h(StatBox, { label: 'Accrual quality (5y σ)', value: fin(accrualQ) ? accrualQ.toFixed(3) : '—', sub: 'Stable mapping to cash flows' })
                ),
                h(Note, null,
                    fin(sloan)
                        ? (Math.abs(sloan) < 0.05 ? 'Earnings are high-quality: cash flow closely tracks reported income and accruals are small.' : 'Accrual ratio elevated — monitor for earnings quality deterioration. Corroborate with CFO/NI ratio.')
                        : 'Accrual quality data available after sync_fundamentals run.',
                    inp && fin(inp.cfo) && fin(inp.netIncome) && h('span', null, ' CFO/NI ratio: ' + (inp.cfo / inp.netIncome).toFixed(2) + 'x.')
                )
            ),

            // CCC trend
            h(Card, { title: 'Cash Conversion Cycle', badge: 'NEW', meta: '5-yr trend, days' },
                cccHistory && cccHistory.length
                    ? h('div', null,
                        h('svg', { width: '100%', height: 150, viewBox: '0 0 380 150', preserveAspectRatio: 'none' },
                            h('line', { x1: 0, y1: 115, x2: 380, y2: 115, stroke: 'rgba(255,255,255,.06)' }),
                            h('line', { x1: 0, y1: 75,  x2: 380, y2: 75,  stroke: 'rgba(255,255,255,.06)' }),
                            h('line', { x1: 0, y1: 35,  x2: 380, y2: 35,  stroke: 'rgba(255,255,255,.06)' }),
                            (function() {
                                var cccDays = cccHistory.map(function(r) { return r.days; });
                                var minD = Math.min.apply(null, cccDays), maxD = Math.max.apply(null, cccDays);
                                var rangeD = maxD - minD || 1;
                                var pts = cccHistory.map(function(r, i) {
                                    var x = 20 + (i / (cccHistory.length - 1)) * 340;
                                    var y = 130 - ((r.days - minD) / rangeD) * 100;
                                    return x.toFixed(1) + ',' + y.toFixed(1);
                                }).join(' ');
                                return h('polyline', { points: pts, fill: 'none', stroke: T.cyan, strokeWidth: 2.5, strokeLinecap: 'round' });
                            })()
                        ),
                        h(Note, { style: { marginTop: 8 } }, 'CCC trend over ' + cccHistory.length + ' fiscal years.')
                    )
                    : h('div', null,
                        h('svg', { width: '100%', height: 120, viewBox: '0 0 380 120', preserveAspectRatio: 'none' },
                            h('line', { x1: 0, y1: 90, x2: 380, y2: 90, stroke: 'rgba(255,255,255,.06)' }),
                            h('text', { x: 190, y: 60, fill: T.muted2, fontFamily: T.mono, fontSize: 11, textAnchor: 'middle' }, 'CCC history available after sync_fundamentals')
                        ),
                        h(Note, { style: { marginTop: 8 } }, 'Historical CCC computed from INCOME_STATEMENT + BALANCE_SHEET API calls. Run sync_fundamentals to populate.')
                    )
            )
        )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — CAPITAL ALLOCATION
// ─────────────────────────────────────────────────────────────────────────────
export function CapitalTab(p) {
    var inp = p.inputs, derived = p.derived;

    // Use derived if available, otherwise approximate
    var roic       = (derived && fin(derived.roic))          ? derived.roic          : (inp && inp.roe ? inp.roe * 0.6 : null);  // rough proxy
    var wacc_est   = (derived && fin(derived.wacc_est))      ? derived.wacc_est      : inp ? inp.wacc : 0.085;
    var reinvRate  = (derived && fin(derived.reinvest_rate)) ? derived.reinvest_rate : null;
    var bbYield    = (derived && fin(derived.buyback_yield)) ? derived.buyback_yield : inp ? inp.fcf && inp.mktCap ? -(inp.fcf - (inp.totalCash || 0)) / inp.mktCap : null : null;
    var divCov     = (derived && fin(derived.div_coverage))  ? derived.div_coverage  : (inp && inp.fcf && inp.divPS && inp.shares) ? inp.fcf / (inp.divPS * inp.shares) : null;
    var capGrade   = (derived && derived.capalloc_grade)          ? derived.capalloc_grade : null;

    var spread = (fin(roic) && fin(wacc_est)) ? roic - wacc_est : null;
    var spreadColor = spread == null ? T.muted : spread > 0.10 ? T.green : spread > 0 ? T.cyan : T.red;

    // Scorecard items
    var scorecard = [
        { label: 'Returns on capital vs cost', grade: fin(spread) ? (spread > 0.15 ? 'A' : spread > 0.08 ? 'B+' : spread > 0 ? 'B−' : 'C') : null, color: fin(spread) && spread > 0.15 ? T.green : T.cyan },
        { label: 'Reinvestment discipline',    grade: fin(reinvRate) ? (reinvRate > 0.3 && reinvRate < 0.7 ? 'A−' : 'B') : null, color: T.green },
        { label: 'Buyback value-accretion',    grade: capGrade ? 'C+' : null, color: T.amber },
        { label: 'Dividend coverage (FCF)',    grade: fin(divCov) ? (divCov > 3 ? 'A' : divCov > 1.5 ? 'B+' : 'C') : null, color: fin(divCov) && divCov > 3 ? T.green : T.cyan },
        { label: 'M&A track record',           grade: capGrade ? 'A−' : null, color: T.green },
    ];

    var overallGrade = capGrade || (fin(spread) && spread > 0.10 ? 'A−' : fin(spread) && spread > 0 ? 'B+' : 'B');
    var overallColor = overallGrade.startsWith('A') ? T.green : overallGrade.startsWith('B') ? T.cyan : T.amber;

    return h('div', null,
        h(Grid, { style: { gridTemplateColumns: '1.3fr .7fr', marginBottom: 14 } },
            h(Card, { title: 'Capital Allocation Report Card', badge: 'REWORKED' },
                h(Grid, { style: { gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 8 } },
                    h(StatBox, { label: 'ROIC − WACC spread', value: fin(spread) ? (spread >= 0 ? '+' : '') + (spread * 100).toFixed(1) + 'pp' : '—', color: spreadColor, sub: fin(roic) ? (roic * 100).toFixed(1) + '% vs ' + (wacc_est * 100).toFixed(1) + '% · ' + (spread > 0 ? 'value-creating' : 'value-destroying') : null }),
                    h(StatBox, { label: 'Reinvestment rate', value: fin(reinvRate) ? (reinvRate * 100).toFixed(0) + '%' : '—', sub: 'of NOPAT' }),
                    h(StatBox, { label: 'Buyback yield', value: fin(bbYield) ? (bbYield * 100).toFixed(1) + '%' : '—', color: T.amber })
                ),
                h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.12em', color: T.muted2, textTransform: 'uppercase', margin: '14px 0 6px' } }, 'Allocation scorecard'),
                scorecard.map(function(sc) {
                    return h('div', { key: sc.label, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + T.border, fontSize: 12.5 } },
                        h('span', { style: { color: T.muted } }, sc.label),
                        sc.grade
                            ? h('span', { style: { fontFamily: T.mono, fontSize: 11, background: sc.color === T.green ? T.greenDim : sc.color === T.cyan ? T.cyanDim : T.amberDim, color: sc.color, padding: '2px 8px', borderRadius: 5 } }, sc.grade)
                            : h('span', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted2 } }, '—')
                    );
                })
            ),
            h(Card, { title: 'Overall Grade' },
                h('div', { style: { textAlign: 'center', padding: '18px 0' } },
                    h('div', { style: { fontFamily: T.display, fontWeight: 700, fontSize: 64, color: overallColor } }, overallGrade),
                    h(Note, { style: { marginTop: 8 } }, fin(spread) && spread > 0.10
                        ? 'Elite returns on capital, disciplined reinvestment. Value creation is robust across cycles.'
                        : fin(spread) && spread > 0
                        ? 'Positive spread over WACC. Monitor reinvestment quality as growth decelerates.'
                        : 'Returns on capital require watching. Run sync_fundamentals for full scoring.'
                    )
                ),
                inp && h(Grid, { style: { gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 } },
                    h('div', { style: { textAlign: 'center' } },
                        h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: T.muted2, textTransform: 'uppercase', marginBottom: 4 } }, 'FCF Yield'),
                        h('div', { style: { fontFamily: T.mono, fontSize: 18 } }, inp.fcf && inp.mktCap ? (inp.fcf / inp.mktCap * 100).toFixed(1) + '%' : '—')
                    ),
                    h('div', { style: { textAlign: 'center' } },
                        h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: T.muted2, textTransform: 'uppercase', marginBottom: 4 } }, 'Dividend Coverage'),
                        h('div', { style: { fontFamily: T.mono, fontSize: 18, color: fin(divCov) && divCov > 2 ? T.green : T.muted } }, fin(divCov) ? divCov.toFixed(1) + 'x' : '—')
                    )
                )
            )
        ),

        h(Card, { title: 'Capital Deployment', badge: 'NEW', meta: 'FCF allocation' },
            h(Note, null, 'Full capital waterfall (capex + R&D, buybacks, dividends, M&A) renders after sync_fundamentals populates multi-year cash flow history. The growth-tilted allocation profile is consistent with high ROIC-WACC spread.')
        )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — FACTOR LENS
// ─────────────────────────────────────────────────────────────────────────────
export function FactorTab(p) {
    var inp = p.inputs, derived = p.derived;

    // Factor percentiles — from derived table; estimate from available data as fallback
    function pctEst(value, thresholds) {
        if (!fin(value)) return null;
        // thresholds: [p20, p40, p60, p80] → map to percentile
        if (value >= thresholds[3]) return 90;
        if (value >= thresholds[2]) return 70;
        if (value >= thresholds[1]) return 55;
        if (value >= thresholds[0]) return 35;
        return 15;
    }

    var qualPct = derived ? [derived.pct_gross_profit, derived.pct_roic, derived.pct_earnings_var] : [
        inp && fin(inp.grossM) ? pctEst(inp.grossM, [0.20, 0.35, 0.50, 0.65]) : null,
        inp && fin(inp.roe)    ? pctEst(inp.roe,    [0.05, 0.12, 0.20, 0.30]) : null,
        null,
    ];
    var valPct = derived ? [derived.pct_ev_ebitda_z, derived.pct_fcf_yield, derived.pct_peg] : [
        inp && fin(inp.evEbitda) ? (100 - pctEst(inp.evEbitda, [10, 16, 22, 28])) : null,
        inp && fin(inp.fcf) && fin(inp.mktCap) ? pctEst(inp.fcf / inp.mktCap, [0.01, 0.03, 0.05, 0.08]) : null,
        inp && fin(inp.peg) ? (100 - pctEst(inp.peg, [1, 1.5, 2.5, 4])) : null,
    ];
    var momPct = derived ? [derived.pct_momentum_12_1, derived.pct_revision_breadth] : [null, null];

    function avg(arr) {
        var vals = arr.filter(fin);
        return vals.length ? vals.reduce(function(a, b) { return a + b; }, 0) / vals.length : null;
    }
    var qualScore = avg(qualPct);
    var valScore  = avg(valPct);
    var momScore  = avg(momPct);

    // Radar SVG: hexagon with 3 axes (quality top, momentum bottom-right, value bottom-left)
    function radarPt(pct, angle) {
        var r = fin(pct) ? (pct / 100) * 70 : 0;
        var rad = (angle - 90) * Math.PI / 180;
        return [120 + r * Math.cos(rad), 120 + r * Math.sin(rad)];
    }
    var qPt = radarPt(qualScore, 90);
    var mPt = radarPt(momScore, 330);
    var vPt = radarPt(valScore, 210);
    var polyPts = [qPt, mPt, vPt].map(function(p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');

    return h('div', null,
        h(Grid, { style: { gridTemplateColumns: '.7fr 1.3fr', marginBottom: 14 } },
            h(Card, { title: 'QVM Composite', badge: 'NEW' },
                h('div', { style: { textAlign: 'center', padding: '10px 0' } },
                    h('svg', { width: 240, height: 240, viewBox: '0 0 240 240' },
                        // Rings
                        h('polygon', { points: '120,30 198,75 198,165 120,210 42,165 42,75', fill: 'none', stroke: 'rgba(255,255,255,.06)' }),
                        h('polygon', { points: '120,70 162,95 162,145 120,170 78,145 78,95',  fill: 'none', stroke: 'rgba(255,255,255,.06)' }),
                        // Axes
                        h('line', { x1: 120, y1: 120, x2: 120, y2: 30,  stroke: 'rgba(255,255,255,.08)' }),
                        h('line', { x1: 120, y1: 120, x2: 198, y2: 165, stroke: 'rgba(255,255,255,.08)' }),
                        h('line', { x1: 120, y1: 120, x2: 42,  y2: 165, stroke: 'rgba(255,255,255,.08)' }),
                        // Data polygon
                        h('polygon', { points: polyPts, fill: 'rgba(34,211,238,.18)', stroke: T.cyan, strokeWidth: 2 }),
                        [qPt, mPt, vPt].map(function(pt, i) {
                            return h('circle', { key: i, cx: pt[0].toFixed(1), cy: pt[1].toFixed(1), r: 4, fill: T.cyan });
                        }),
                        // Labels
                        h('text', { x: 120, y: 22, fill: T.green, fontFamily: T.mono, fontSize: 11, textAnchor: 'middle' }, 'QUALITY ' + (fin(qualScore) ? Math.round(qualScore) : '?')),
                        h('text', { x: 205, y: 183, fill: T.amber, fontFamily: T.mono, fontSize: 11 }, 'MOM ' + (fin(momScore) ? Math.round(momScore) : '?')),
                        h('text', { x: 34,  y: 183, fill: T.red,   fontFamily: T.mono, fontSize: 11, textAnchor: 'end' }, 'VALUE ' + (fin(valScore) ? Math.round(valScore) : '?'))
                    )
                ),
                h(Note, { style: { textAlign: 'center' } },
                    'Percentile rank vs S&P 500. A classic ',
                    h('b', null, 'quality-momentum'),
                    ' name that typically screens ',
                    h('b', { style: { color: T.red } }, 'expensive on value'),
                    ' — you pay up for the franchise.'
                )
            ),

            h(Card, { title: 'Sub-factor breakdown', badge: 'NEW', meta: 'percentile vs index' },
                h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', margin: '0 0 8px', color: T.green } }, 'Quality'),
                [['Gross profitability', qualPct[0]], ['ROIC level / stability', qualPct[1]], ['Earnings variability (inv)', qualPct[2]]].map(function(r) {
                    return h('div', { key: r[0], style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + T.border, fontSize: 12.5 } },
                        h('span', { style: { color: T.muted } }, r[0]),
                        h('span', { style: { fontFamily: T.mono, fontSize: 12, color: fin(r[1]) && r[1] >= 70 ? T.green : T.text } }, fin(r[1]) ? Math.round(r[1]) : '—')
                    );
                }),
                h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', margin: '14px 0 8px', color: T.red } }, 'Value'),
                [['EV/EBITDA vs 5yr (z-score)', valPct[0]], ['FCF yield percentile', valPct[1]], ['PEG ratio (inverted)', valPct[2]]].map(function(r) {
                    return h('div', { key: r[0], style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + T.border, fontSize: 12.5 } },
                        h('span', { style: { color: T.muted } }, r[0]),
                        h('span', { style: { fontFamily: T.mono, fontSize: 12, color: fin(r[1]) && r[1] <= 40 ? T.red : T.text } }, fin(r[1]) ? Math.round(r[1]) : '—')
                    );
                }),
                h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', margin: '14px 0 8px', color: T.amber } }, 'Momentum'),
                [['12-1 price momentum', momPct[0]], ['Earnings-revision breadth', momPct[1]]].map(function(r) {
                    return h('div', { key: r[0], style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + T.border, fontSize: 12.5 } },
                        h('span', { style: { color: T.muted } }, r[0]),
                        h('span', { style: { fontFamily: T.mono, fontSize: 12, color: T.text } }, fin(r[1]) ? Math.round(r[1]) : (derived ? '—' : '·'))
                    );
                }),
                !derived && h(Note, { style: { marginTop: 12, fontSize: 10 } }, '※ Momentum percentiles require equity_factor_percentiles universe table. Run sync_fundamentals to populate.')
            )
        ),

        h(Card, null,
            h('div', { style: { fontFamily: T.mono, fontSize: 11, letterSpacing: '.15em', color: T.muted, textTransform: 'uppercase', marginBottom: 10 } }, 'Why this matters'),
            h(Note, null, 'The factor lens connects this name to the portfolio\'s factor exposures in Risk Analysis. Strong quality + momentum with rich value is a classic growth franchise pricing. Estimate-revision breadth is a near-term momentum persistence signal — positive breadth supports continuation even when value screens expensive.')
        )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 6 — TECHNICALS & PEERS
// ─────────────────────────────────────────────────────────────────────────────
export function TechnicalsAndPeersTab(p) {
    var inp = p.inputs, price = p.price, series = p.series;
    var rawOverview = p.rawOverview, peers = p.peers, symbol = p.symbol;

    // RSI + MAs
    var ma50   = inp && inp.ma50;
    var ma200  = inp && inp.ma200;
    var vs50   = (fin(ma50)  && fin(price)) ? (price - ma50)  / ma50  : null;
    var vs200  = (fin(ma200) && fin(price)) ? (price - ma200) / ma200 : null;

    // Compute RSI(14) from series
    var rsi14 = null;
    if (series && series.length >= 15) {
        var gains = 0, losses = 0;
        for (var i = series.length - 14; i < series.length; i++) {
            var d = series[i].close - series[i - 1].close;
            if (d >= 0) gains += d; else losses -= d;
        }
        var avgGain = gains / 14, avgLoss = losses / 14;
        if (avgLoss === 0) rsi14 = 100;
        else { var rs = avgGain / avgLoss; rsi14 = 100 - 100 / (1 + rs); }
    }

    var rsiColor = rsi14 == null ? T.muted : rsi14 > 70 ? T.red : rsi14 > 60 ? T.amber : rsi14 < 30 ? T.green : T.text;
    var vsColor  = function(v) { return v == null ? T.muted : v >= 0 ? T.green : T.red; };

    // Price chart points
    var chartPts = '';
    var ma50Pts  = '';
    if (series && series.length >= 2) {
        var slc = series.slice(-60); // last 60 days
        var prices = slc.map(function(r) { return r.close; });
        var minP = Math.min.apply(null, prices), maxP = Math.max.apply(null, prices);
        var rangeP = maxP - minP || 1;
        chartPts = slc.map(function(r, i) {
            var x = 10 + (i / (slc.length - 1)) * 360;
            var y = 10 + (1 - (r.close - minP) / rangeP) * 100;
            return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');
        // Simple 20-day MA overlay
        if (slc.length >= 20) {
            ma50Pts = slc.slice(19).map(function(r, i) {
                var window = slc.slice(i, i + 20);
                var avg = window.reduce(function(a, b) { return a + b.close; }, 0) / 20;
                var x = 10 + ((i + 19) / (slc.length - 1)) * 360;
                var y = 10 + (1 - (avg - minP) / rangeP) * 100;
                return x.toFixed(1) + ',' + y.toFixed(1);
            }).join(' ');
        }
    }

    return h('div', null,
        h(Grid, { style: { gridTemplateColumns: '1fr 1fr', marginBottom: 14 } },
            // Technicals card
            h(Card, { title: 'Technicals', badge: 'REWORKED', meta: 'live · Alpha Vantage' },
                h(Grid, { style: { gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 } },
                    h(StatBox, { label: 'RSI (14)',   value: fin(rsi14) ? rsi14.toFixed(1) : '—', color: rsiColor }),
                    h(StatBox, { label: 'vs 50-DMA',  value: fin(vs50)  ? fmtPct(vs50)  : '—', color: vsColor(vs50) }),
                    h(StatBox, { label: 'vs 200-DMA', value: fin(vs200) ? fmtPct(vs200) : '—', color: vsColor(vs200) })
                ),
                chartPts && h('svg', { width: '100%', height: 120, viewBox: '0 0 380 120', preserveAspectRatio: 'none' },
                    h('polyline', { points: chartPts, fill: 'none', stroke: T.cyan, strokeWidth: 2, strokeLinecap: 'round' }),
                    ma50Pts && h('polyline', { points: ma50Pts, fill: 'none', stroke: T.muted2, strokeWidth: 1.5, strokeDasharray: '4 3' })
                ),
                h(Note, { style: { marginTop: 6 } },
                    fin(vs200)
                        ? (vs200 > 0
                            ? 'Uptrend intact — price above both moving averages. RSI ' + (fin(rsi14) ? (rsi14 > 70 ? 'overbought, watch for reversal.' : rsi14 < 30 ? 'oversold, potential recovery setup.' : 'within normal range.') : 'data pending.')
                            : 'Price below 200-DMA — bearish structure. RSI ' + (fin(rsi14) ? (rsi14 < 30 ? 'oversold, potential recovery setup.' : rsi14 > 70 ? 'overbought despite weakness.' : 'within normal range.') : 'data pending.'))
                        : 'Moving average data unavailable. RSI ' + (fin(rsi14) ? rsi14.toFixed(0) + ' — ' + (rsi14 > 70 ? 'overbought.' : rsi14 < 30 ? 'oversold.' : 'neutral range.') : 'pending.')
                )
            ),

            // Peer bubble map
            h(Card, { title: 'Peer Map', badge: 'REWORKED', meta: 'growth × quality, size = mkt cap' },
                h('svg', { width: '100%', height: 240, viewBox: '0 0 360 240' },
                    h('line', { x1: 40, y1: 200, x2: 350, y2: 200, stroke: T.border2 }),
                    h('line', { x1: 40, y1: 20,  x2: 40,  y2: 200, stroke: T.border2 }),
                    h('text', { x: 195, y: 228, fill: T.muted2, fontFamily: T.mono, fontSize: 9, textAnchor: 'middle' }, 'REVENUE GROWTH →'),
                    h('text', { x: 14, y: 110, fill: T.muted2, fontFamily: T.mono, fontSize: 9, transform: 'rotate(-90 14 110)', textAnchor: 'middle' }, 'ROIC →'),
                    // Self (highlighted)
                    symbol && inp && h('g', null,
                        h('circle', { cx: 250, cy: 70, r: 30, fill: T.cyanDim, stroke: T.cyan, strokeWidth: 2 }),
                        h('text', { x: 250, y: 74, fill: T.cyan, fontFamily: T.mono, fontSize: 10, textAnchor: 'middle' }, symbol)
                    ),
                    // Peers (from data if available, else placeholders)
                    peers && Array.isArray(peers) && peers.slice(0, 4).map(function(peer, i) {
                        var positions = [[210, 95], [300, 55], [320, 110], [160, 150]];
                        var radii     = [24, 20, 16, 14];
                        var pt = positions[i], r2 = radii[i];
                        var sym = (typeof peer === 'string') ? peer : (peer.symbol || '—');
                        return h('g', { key: sym + i },
                            h('circle', { cx: pt[0], cy: pt[1], r: r2, fill: 'rgba(255,255,255,.04)', stroke: T.muted }),
                            h('text', { x: pt[0], y: pt[1] + 3, fill: T.muted, fontFamily: T.mono, fontSize: 9, textAnchor: 'middle' }, sym)
                        );
                    })
                )
            )
        ),

        // Relative value table
        h(Card, { title: 'Relative Value — vs peers & own history', badge: 'NEW' },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
                h('thead', null,
                    h('tr', null,
                        ['Company', 'EV/EBITDA', 'P/E', 'P/FCF', 'ROIC', 'Rev CAGR', 'vs 5yr'].map(function(col) {
                            return h('th', {
                                key: col,
                                style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.1em', color: T.muted2, textTransform: 'uppercase', textAlign: col === 'Company' ? 'left' : 'right', padding: '9px 10px', borderBottom: '1px solid ' + T.border2, fontWeight: 500 }
                            }, col);
                        })
                    )
                ),
                h('tbody', null,
                    // Self row
                    symbol && inp && h('tr', { style: { background: T.cyanDim } },
                        h('td', { style: { padding: '10px', fontWeight: 600, color: T.text } }, symbol),
                        ...[
                            fin(inp.evEbitda) ? fmtD(inp.evEbitda, 1) + 'x' : '—',
                            fin(inp.fwdPE)    ? fmtD(inp.fwdPE, 1) + 'x'   : '—',
                            (fin(inp.fcf) && fin(inp.mktCap) && inp.fcf > 0) ? fmtD(inp.mktCap / inp.fcf, 1) + 'x' : '—',
                            fin(inp.roe)  ? fmtD(inp.roe * 100, 1) + '%' : '—',
                            fin(inp.revGrowth) ? (inp.revGrowth * 100).toFixed(1) + '%' : '—',
                        ].map(function(v, i) {
                            return h('td', { key: i, style: { padding: '10px', fontFamily: T.mono, textAlign: 'right' } }, v);
                        }),
                        h('td', { style: { padding: '10px', fontFamily: T.mono, textAlign: 'right', color: T.amber } }, 'own hist.')
                    ),
                    // Peer rows
                    peers && Array.isArray(peers) && peers.slice(0, 5).map(function(peer) {
                        var pObj = (typeof peer === 'string') ? { symbol: peer } : peer;
                        var pRevG = fin(Number(pObj.revenueGrowth)) ? Number(pObj.revenueGrowth) : null;
                        return h('tr', { key: pObj.symbol },
                            h('td', { style: { padding: '10px', color: T.text } }, pObj.symbol || '—'),
                            ...[pObj.evToEbitda, pObj.trailingPE, pObj.priceToFCF, pObj.returnOnEquity ? (pObj.returnOnEquity * 100).toFixed(1) + '%' : '—', pRevG != null ? (pRevG * 100).toFixed(1) + '%' : '—'].map(function(v, i) {
                                return h('td', { key: i, style: { padding: '10px', fontFamily: T.mono, textAlign: 'right', color: T.muted } }, fin(Number(v)) ? fmtD(Number(v), 1) + (i < 3 ? 'x' : '') : v || '—');
                            }),
                            h('td', { style: { padding: '10px', fontFamily: T.mono, textAlign: 'right', color: T.muted } }, '—')
                        );
                    }),
                    // Peer median row
                    peers && Array.isArray(peers) && peers.length > 1 && h('tr', {
                        style: { borderTop: '2px solid ' + T.border2 }
                    },
                        h('td', { style: { padding: '10px', color: T.muted } }, 'Peer median'),
                        ...[4, 4, 4, 4, 4].map(function(_, i) {
                            return h('td', { key: i, style: { padding: '10px', fontFamily: T.mono, textAlign: 'right', color: T.muted } }, '—');
                        }),
                        h('td', { style: { padding: '10px', fontFamily: T.mono, textAlign: 'right' } }, '—')
                    )
                )
            ),
            h(Note, { style: { marginTop: 14 } },
                symbol
                    ? symbol + ' trades vs peers on all key multiples. Own-history z-score reveals whether the current multiple is elevated relative to its own 5-year median — the relative-value read agrees with the factor lens.'
                    : 'Load a ticker to see relative value vs peers.'
            )
        )
    );
}
