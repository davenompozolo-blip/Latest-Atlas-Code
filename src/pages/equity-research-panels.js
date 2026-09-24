import React from 'react';
import { T } from './equity/equityTheme.js';
import { sb } from './config.js';
import { PeerComparison } from './equity-peers.js';
import { TechnicalsTab } from './equity-technicals.js';
import {
    loadStatementLayer, STATE_LOADED, derivedFromStatements, mergeDerived,
} from './equity/equityStatements.js';
import {
    piotroskiView, PIOTROSKI_OUT_OF, qualityGradeView, sloanView,
    capitalAllocationView, compositeCallView,
    ROW_GRADED, ROW_NO_MEASURE,
} from '../lib/equityVerdicts.js';

var h = React.createElement;
var useState = React.useState;
var useEffect = React.useEffect;
var useMemo = React.useMemo;
var useRef = React.useRef;

// ── tiny helpers ──────────────────────────────────────────────────────────────
function nv(o, k) { var x = Number(o && o[k]); return fin(x) ? x : null; }
function fmtD(v, d) { if (!fin(v)) return '—'; var x = Number(v); return x.toFixed(d == null ? 2 : d); }
function fmtDol(v, d) { if (!fin(v)) return '—'; var x = Number(v); return '$' + x.toFixed(d == null ? 0 : d); }
// Fair-value/price formatter that keeps cents on low-nominal names. Whole-dollar
// rounding of a fair value is >5% of the figure under ~$20 (ABEV $8.41 → "$8"),
// which makes the displayed FV disagree with the upside computed off the raw
// value (ER-01). Show 2 decimals under $100, whole dollars above.
function fmtFV(v) { if (!fin(v)) return '—'; var x = Number(v); return '$' + x.toFixed(Math.abs(x) < 100 ? 2 : 0); }
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
    // Fair values and prices are non-negative; never let the 15% padding push the
    // axis floor below $0. On low-dividend names a small-but-positive DDM (e.g.
    // NVDA ~$2 Gordon value) + padding crossed zero, drawing "$-30" ticks that
    // implied a negative method (ER-03/ER-11). The floor is $0.
    var axisMin = Math.max(0, Math.floor((dataMin - pad) / 5) * 5);
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
        fin(price) && fin(blendedFV) && (function() {
            var over = price > blendedFV;
            var mag = Math.abs((price - blendedFV) / blendedFV);
            var word = mag < 0.10 ? 'broadly fair value'
                     : mag < 0.30 ? (over ? 'a meaningful premium' : 'a meaningful discount')
                     : (over ? 'a steep premium to fair value' : 'a deep discount to fair value');
            return h(Note, { style: { marginTop: 14, borderTop: '1px solid ' + T.border, paddingTop: 12 } },
                'Blended fair value ', h('b', { style: { color: T.amber } }, fmtFV(blendedFV)),
                '. Current price ', h('b', { style: { color: T.green } }, fmtDol(price, 2)),
                ' — ',
                h('span', { style: { color: over ? T.red : T.green } },
                    fmtPct((price - blendedFV) / blendedFV) + (over ? ' above FV' : ' below FV')),
                ' (' + word + '). Green marker = current price.'
            );
        })()
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

// The reverse-DCF solvers that lived here are gone with TAB 2. Worth recording
// why they are not simply moved: the old `bisect` NEVER CHECKED ITS BRACKET, so
// a target enterprise value outside [lo, hi] returned an endpoint — the solver's
// own bound, published as the growth the market expects. `bisectFor` in
// equity/valuationReconcile.js returns null instead, and the panel says the
// price is not explained by any growth rate in a sane range.

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
    // READS THE STATEMENT LAYER, not `equity_fundamentals_derived`. EQ-5b
    // measured that table as ABSENT FROM THE PRODUCTION BUNDLE (0 occurrences
    // in `dist/`), so `p.derived` has always been null in the deployed app and
    // every figure here came from a fallback.
    var derived = useStatementDerived(p.symbol, p.derived);

    if (!inp) return null;

    // THE LOCAL FAIR-VALUE BLEND IS GONE, AND WITH IT THE CALL IT DROVE.
    //
    // `fairValueComposite.js` states this product's governing rule in its own
    // header: "when an input can't be trusted, drop it. If nothing survives,
    // return null — never fabricate a number." The blend that stood here did
    // the opposite. It ran a ten-year DCF on a SUBSTITUTED 10% revenue growth
    // rate and a SUBSTITUTED 20% operating margin, a multiple leg on a
    // SUBSTITUTED 18x EV/EBITDA, and a third leg that was simply trailing EPS
    // times a flat 20 — then averaged whatever came out and published
    // BUY / ACCUMULATE / HOLD / REDUCE off it, with nothing on screen saying
    // which inputs were measured and which were typed. (`inp.taxRate` falls
    // back to 0.21 and `inp.wacc` is a fixed 0.085, so even the "measured"
    // legs carried assumptions.)
    //
    // There is one composite in this product and it is the canonical engine's.
    // Where the engine did not run there is no fair value, and therefore no
    // upside and no call.
    var cv = compositeCallView(p.compositeFV, p.price);
    var compositeFV = cv.fv == null ? null : cv.fv;
    var upside = cv.upside == null ? null : cv.upside;

    // Prob-weighted EV from Bull/Base/Bear (defaults)
    var ev_pw = p.ev_pw;

    // Quality grade — the complete F-Score or nothing. It used to band a
    // PARTIAL score ("piotroski_f >= 5 ? 'B' : 'C'") and, when the table was
    // absent, fall through to `roe > 0.20 ? 'B+' : '—'`: a letter on the same
    // scale derived from one ratio, marked only "prov.".
    var pv = piotroskiView(derived && derived.piotroski_detail);
    var qv = qualityGradeView(pv);

    var forensicClean = (derived && derived.beneish_m != null) ? derived.beneish_m < -1.78 : null;
    var upsideColor = upside == null ? T.muted : upside >= 0.10 ? T.green : upside >= -0.05 ? T.amber : T.red;

    var callColor = cv.tone === 'good' ? T.green : cv.tone === 'ok' ? T.cyan : cv.tone === 'warn' ? T.amber : T.red;
    var callDim   = cv.tone === 'good' ? T.greenDim : cv.tone === 'ok' ? T.cyanDim : cv.tone === 'warn' ? T.amberDim : T.redDim;

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
        vs('Composite FV', fin(compositeFV) ? fmtFV(compositeFV) : '—'),
        sep,
        vs('Up / Downside', fin(upside) ? fmtPct(upside) : '—', upsideColor),
        sep,
        vs('Prob-weighted EV', fin(ev_pw) ? fmtDol(ev_pw) : '—'),
        sep,
        // The grade is ABSENT from `qv` when the F-Score is incomplete, so
        // there is no value to print and no band to colour it with.
        vs('Quality', qv.grade || '—', qv.grade ? (qv.grade.charAt(0) === 'A' ? T.green : qv.grade.charAt(0) === 'B' ? T.cyan : T.amber) : null),
        sep,
        vs('Forensic flag', forensicClean == null ? '—' : forensicClean ? 'Clean' : 'Flag', forensicClean == null ? null : forensicClean ? T.green : T.red),
        cv.call
            ? h('div', {
                style: {
                    marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 9,
                    border: '1px solid ' + callColor, borderRadius: 8, padding: '9px 15px', background: callDim,
                }
            },
                h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: callColor, flexShrink: 0 } }),
                h('b', { style: { fontFamily: T.mono, fontSize: 13, color: callColor, letterSpacing: '.05em' } }, cv.call)
            )
            // NO CALL WITHOUT A FAIR VALUE. The old chain ended
            // `else { call = 'REDUCE · overvalued' }`, and every ladder of `>`
            // comparisons against a null falls through to its last rung — so a
            // ticker the engine could not value rendered the most negative
            // verdict on the board, in red, as though it had been measured.
            : h('div', {
                style: {
                    marginLeft: 'auto', maxWidth: 380, fontFamily: T.mono, fontSize: 10,
                    color: T.muted2, lineHeight: 1.6, textAlign: 'right',
                }
            }, cv.reason),
        // An em dash in a slot that looks like every other slot is
        // indistinguishable from a measurement, so say what is withheld.
        (!qv.grade || forensicClean == null) && h('div', {
            style: { flexBasis: '100%', fontFamily: T.mono, fontSize: 9.5, color: T.muted2, lineHeight: 1.7, marginTop: 2 },
        }, [
            qv.grade ? null : 'Quality: ' + qv.reason,
            forensicClean == null ? 'Forensic flag: the Beneish M-Score needs receivables, PPE and SG&A, which the fundamentals view does not publish.' : null,
        ].filter(Boolean).join('  ·  '))
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

    // Track the live ticker so a slow ~15s generation that resolves after the user
    // has navigated away neither writes its thesis onto the new ticker nor leaves a
    // stale spinner/error behind.
    var symRef = useRef(p.symbol);
    useEffect(function() {
        symRef.current = p.symbol;
        setGenStatus('idle'); setErrMsg(null);
    }, [p.symbol]);

    function generate() {
        if (!p.symbol) return;
        var reqSymbol = p.symbol;
        setGenStatus('loading'); setErrMsg(null);
        // Call edge function via Supabase client (imported at top of file)
        sb.functions.invoke('synthesize_thesis', { body: { ticker: reqSymbol } })
            .then(function(res) {
                if (symRef.current !== reqSymbol) return;  // user navigated away — drop stale result
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
            .catch(function(e) { if (symRef.current === reqSymbol) { setErrMsg(e.message || 'Network error'); setGenStatus('error'); } });
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

    // Football field methods + blended FV come from the canonical engine (the
    // same DDM / FCFF / FCFE / Multiples / RI legs and trimmed composite the
    // Valuation House shows), so this synthesizer and the headline verdict can't
    // tell two different stories. Sector-inapplicable legs (e.g. DCF for banks)
    // are already dropped upstream. Falls back to the local quick models only
    // when the engine could not run for this ticker.
    var engine = p.engine;
    var models = [];
    var blendedFV = null;
    if (engine && engine.computed) {
        var ec = engine.computed;
        [
            { label: 'DCF (FCFF)',      v: ec.ffR ? ec.ffR.eqPS : null },
            { label: 'FCFE',            v: ec.feR ? ec.feR.eqPS : null },
            { label: 'DDM',             v: ec.ddmV },
            { label: 'Multiples',       v: ec.multAvg },
            { label: 'Residual income', v: ec.riR ? ec.riR.v : null },
        ].forEach(function(mm) { if (fin(mm.v) && mm.v > 0) models.push({ label: mm.label, point: mm.v }); });
        blendedFV = engine.composite && fin(engine.composite.avg_fair_value) ? engine.composite.avg_fair_value : null;
    } else {
        if (inp.revenue && inp.shares && fin(margin) && margin > 0) {
            var fv_base = dcfFV(inp.revenue, gr, margin, tax, wacc, g, n, inp.netDebt, inp.shares);
            var fv_lo   = dcfFV(inp.revenue, gr * 0.7, margin * 0.88, tax, wacc + 0.01, g, n, inp.netDebt, inp.shares);
            var fv_hi   = dcfFV(inp.revenue, gr * 1.35, margin * 1.12, tax, wacc - 0.01, g, n, inp.netDebt, inp.shares);
            if (fin(fv_lo) && fin(fv_hi) && fv_lo > 0) {
                models.push({ label: '2-stage DCF', lo: fv_lo, point: fv_base, hi: fv_hi });
            }
        }
        if (inp.divPS && inp.divPS > 0 && wacc > g) {
            models.push({ label: 'DDM', lo: inp.divPS / (wacc + 0.01 - g), point: inp.divPS / (wacc - g), hi: inp.divPS / (wacc - 0.01 - g + 0.01) });
        } else if (inp.trailEps && inp.trailEps > 0) {
            models.push({ label: 'Earnings Multiple', lo: inp.trailEps * 16, point: inp.trailEps * 22, hi: inp.trailEps * 28 });
        }
        var fvs = models.filter(function(m) { return fin(m.point) && m.point > 0; }).map(function(m) { return m.point; });
        blendedFV = fvs.length ? fvs.reduce(function(a, b) { return a + b; }, 0) / fvs.length : null;
    }
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

    // ER-02: the Bull/Base/Bear levers (Revenue CAGR / Terminal margin / Exit
    // multiple) drive a DCF what-if and are meaningless without an underlying
    // income statement. ETFs and funds (no revenue/EBITDA/shares — the exact
    // inputs bbbFV needs) can't move them, so hide the interactive sliders
    // instead of presenting live equity controls that produce nothing.
    var scenarioOk = !!(inp.revenue && inp.ebitda && inp.shares);

    // ── Render ─────────────────────────────────────────────────────────────
    return h('div', null,
        // Football field + R/R
        h(Grid, { style: { gridTemplateColumns: '1.3fr .7fr', marginBottom: 14 } },
            h(Card, { title: 'Composite Fair-Value Synthesizer', badge: engine && engine.computed ? 'SHARED ENGINE' : 'LOCAL', meta: (engine && engine.computed ? 'shared engine · ' : 'local models · ') + models.length + ' methods' },
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
        h(Card, { title: 'Bull / Base / Bear — probability-weighted', badge: 'SCENARIO', meta: scenarioOk ? ('what-if · does not set the call · EV ' + (fin(ev_pw) ? fmtFV(ev_pw) : '—')) : 'not applicable — no company fundamentals', style: { marginBottom: 14 } },
            !scenarioOk ? h(Note, null, 'Scenario analysis needs revenue, EBITDA and a share count to drive a DCF what-if. ETFs and funds without an underlying income statement don’t support these levers, so the sliders are hidden.') :
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
                            h('div', { style: { fontFamily: T.mono, fontSize: 20, fontWeight: 600, color: sc.color } }, fin(fv) ? fmtFV(fv) : '—')
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
            scenarioOk && (function() {
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
// TAB 2 — VALUATION lives in equity-valuation-tab.js now.
// ─────────────────────────────────────────────────────────────────────────────
//
// The panel that stood here ran every reverse DCF at `parseInputs`'s hardcoded
// 8.5% WACC — one constant for every symbol in the universe — and closed with
// a sentence computed from nothing:
//
//     "The market isn't asking for heroic growth — it's asking margins to hold
//      at the current level for a decade."'"
//
// That was printed for every company in every market since it was written. A
// sentence that cannot be false is not a verdict, and this file already
// records the same shape twice: the chrome's hardcoded RISK-ON pill, and the
// conditional-correlation panel that hardcoded the sign of a surge.
//
// Its sensitivity grid and tornado are preserved in the new tab, re-centred on
// the company's OWN cost of capital rather than the constant.
// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — QUALITY & FORENSICS
// ─────────────────────────────────────────────────────────────────────────────

// ── derived scores, loaded HERE rather than in equity-research.js ────────────
//
// The `derived` prop is supplied by an effect in equity-research.js that reads
// equity_fundamentals_derived. Measured against the production bundle on the
// baseline commit: the strings `equity_fundamentals_derived` and
// `compute_ticker_derived` appear ZERO times, while `Composite Fair-Value`
// from this file appears once. That read has never shipped, so `derived` has
// always been null in the deployed app — which is the whole of the 0/9
// Piotroski, the "partial estimate" Altman and the N/A Beneish, independently
// of what the table holds.
//
// Loading from this file, which provably ships, removes the dependency on
// whatever rollup is doing to that effect body. It also upgrades the source:
// the statements carry 20 annual periods, so every year-over-year test
// resolves, where compute_ticker_derived only ever fetched two.
function useStatementDerived(symbol, fromProps) {
    var state = React.useState(null);
    var fromStatements = state[0], setFromStatements = state[1];
    React.useEffect(function () {
        var cancelled = false;
        setFromStatements(null);
        if (!symbol) return;
        loadStatementLayer(symbol, 'annual').then(function (res) {
            if (cancelled || res.state !== STATE_LOADED) return;
            setFromStatements(derivedFromStatements(res.rows));
        });
        return function () { cancelled = true; };
    }, [symbol]);
    // Statements win per key; a null from them never erases a real figure.
    return mergeDerived(fromProps, fromStatements);
}

export function QualityTab(p) {
    var inp = p.inputs, snap = p.snap;
    var derived = useStatementDerived(p.symbol, p.derived);
    var s = snap || {};

    // Piotroski. `piotroskiView` is the ONE place that decides what this card
    // may say, and it withholds the composite and the band on a partial
    // reading rather than scaling them — see src/lib/equityVerdicts.js.
    //
    // THE GUARD THAT STOOD HERE WAS DEAD. `pfPartial` was
    // `!pfFromTable && pfKnown < 9` and `pfFromTable` was
    // `derived.piotroski_f != null`, which the statement path satisfies for
    // every symbol — so on the one case it was written for (a reading formed
    // from fewer than nine criteria) it evaluated false, `pfKnown` was set to
    // a literal 9, and the card printed a 9-point score with a definitive
    // band. Measured on the 52 symbols carrying statements: only 23 resolve
    // all nine, and SONY and CPER resolve THREE, printing "2 / 9 · WEAK"
    // where 2 of the 3 tests that resolved had passed.
    //
    // The six trend criteria need a prior year, so without statements only
    // the three single-period checks can resolve at all.
    var pd = derived && derived.piotroski_detail ? derived.piotroski_detail : null;
    var pv = piotroskiView(pd || {
        niPos:   (inp && fin(inp.netIncome)) ? inp.netIncome > 0 : null,
        cfoPos:  (inp && fin(inp.cfo))       ? inp.cfo > 0       : null,
        cfoGtNi: (inp && fin(inp.cfo) && fin(inp.netIncome)) ? inp.cfo > inp.netIncome : null,
    });
    var pfColor = !pv.complete ? T.muted
        : pv.band === 'STRONG' ? T.green : pv.band === 'GOOD' ? T.cyan : T.amber;

    // Altman Z'' (service/non-manufacturing model)
    // X1=WC/TA, X2=RE/TA, X3=EBIT/TA, X4=BV_equity/TL
    var az = derived && derived.altman_z != null ? derived.altman_z : null;
    var azComp = derived && derived.altman_components ? derived.altman_components : null;
    var azModel = derived && derived.altman_model ? derived.altman_model : 'service_z2';

    // THE APPROXIMATION THAT STOOD HERE IS GONE. It computed
    //
    //     totalLiab  = mktCap / pb − bookEq          <- not a liability figure
    //     approxTA   = bookEq + totalDebt            <- not total assets
    //     azApprox   = 6.72 * x3 + 1.05 * x4         <- X3+X4 only, no X1, no X2
    //
    // and fed the result straight into the full Z'' bands and needle below. Two
    // independent faults compounding: a PARTIAL score read under the zones of a
    // complete one (CodeRabbit, PR #806, which found the same partial in
    // `compute_ticker_derived`), and inputs algebraically inverted out of a
    // market multiple rather than read off a balance sheet.
    //
    // JPM is the live case. EQ-2's statement_profile gate correctly nulls a
    // bank's working capital, so the statements refuse the Z'' — and this
    // fallback then printed a distress zone from a fabricated balance sheet.
    //
    // A Z'' missing a term is not a lower Z''; it is a different statistic.
    // `altman_refused` carries the refusal from the statement layer and
    // `mergeDerived` deletes any partial score the table holds, so `az` is the
    // only path and an unformed score renders as absent with its reason.
    var azRefused = derived && derived.altman_refused === true;
    var azWithheld = derived && derived._withheld ? derived._withheld : null;
    var azDisplay = fin(az) ? az : null;
    // `null > 2.60` is FALSE, so the old chain fell straight through to
    // DISTRESS — a score that could not be formed rendered as the worst
    // reading on the card, in red, with a needle. An unformed score has NO
    // zone: the band is the reading, not a default.
    var azZone = !fin(azDisplay) ? null
        : azModel === 'manufacturing'
            ? (azDisplay > 2.99 ? 'SAFE' : azDisplay > 1.81 ? 'GREY' : 'DISTRESS')
            : (azDisplay > 2.60 ? 'SAFE' : azDisplay > 1.10 ? 'GREY' : 'DISTRESS');
    var azColor = azZone === 'SAFE' ? T.green : azZone === 'GREY' ? T.amber : azZone === 'DISTRESS' ? T.red : T.muted2;
    var azNeedlePos = fin(azDisplay) ? clamp(azDisplay / 8 * 100, 2, 98) : null;

    // Beneish M-Score
    var bm = derived && derived.beneish_m != null ? derived.beneish_m : null;
    var bmDetail = derived && derived.beneish_detail ? derived.beneish_detail : null;
    var bmFlag = bm != null ? bm > -1.78 : null;

    // Sloan accrual quality — STATEMENTS ONLY.
    //
    // THE FALLBACK THAT STOOD HERE RECONSTRUCTED A BALANCE SHEET OUT OF A
    // MARKET MULTIPLE:
    //
    //     approxAssets = mktCap / (pb || 3) + totalDebt
    //     sloan        = (netIncome - cfo) / approxAssets
    //
    // `mktCap / pb` is approximate BOOK EQUITY, and equity plus debt is not
    // total assets — it omits payables, deferred revenue and leases, which for
    // a retailer is most of the balance sheet. Worse, `pb || 3` SUBSTITUTES a
    // price-to-book of 3 when none is on file, so a name with no P/B got a
    // denominator nobody measured. That is the same algebra deleted from the
    // Altman card on PR #806, still live one card across — and the result went
    // straight into "Earnings are high-quality", which is a verdict.
    var sv = sloanView(derived ? derived.sloan_accrual : null);
    var accrualQ = derived ? derived.accrual_quality : null;

    // CCC
    var cccHistory = derived && derived.ccc_history ? derived.ccc_history : null;

    return h('div', null,
        h(Grid, { style: { gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 } },
            // Piotroski
            h(Card, { title: 'Piotroski F-Score', badge: 'REWORKED' },
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 } },
                    // A determinable count of zero must not render as a score
                    // of zero: printing '0' there is a measurement nobody made.
                    h('div', { style: { fontFamily: T.mono, fontWeight: 600, fontSize: 40, color: pfColor } },
                        pv.determinable ? pv.passed : '—'),
                    h('div', { style: { color: T.muted } },
                        pv.complete ? '/ ' + PIOTROSKI_OUT_OF
                            : pv.determinable ? 'of ' + pv.determinable + ' resolved' : ''),
                    h(Pill, {
                        text: pv.complete ? pv.band : pv.determinable ? 'PARTIAL' : 'NO DATA',
                        color: pfColor,
                        dim: pfColor === T.green ? T.greenDim : pfColor === T.cyan ? T.cyanDim : pfColor === T.muted ? T.border : T.amberDim,
                        style: { marginLeft: 'auto' },
                    })
                ),
                // `na` comes from the criterion being unresolved, for every
                // row. It used to be passed only for the six trend rows, so an
                // absent net income or operating cash flow rendered as a
                // FAILED test — a red dot and a '0' where nothing was known.
                pv.rows.map(function(r) {
                    return h(CkRow, { key: r.key, label: r.label, pass: r.pass, na: !r.resolved });
                }),
                !pv.complete && h(Note, { style: { marginTop: 8, fontSize: 10 } },
                    pv.determinable
                        ? '※ ' + pv.determinable + ' of ' + PIOTROSKI_OUT_OF + ' criteria resolved, so there is NO F-Score '
                          + 'and no band: the STRONG / GOOD / WEAK thresholds are defined over all nine, and a count of '
                          + 'fewer tests is a different statistic rather than a lower score. Unresolved: '
                          + pv.withheld.join(', ') + '.'
                        : '※ No criteria resolved — no financial statements are loaded for this symbol, and the '
                          + 'six trend criteria need a prior year in any case.')
            ),

            // Altman Z
            h(Card, { title: 'Altman Z-Score', badge: 'REWORKED' },
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 } },
                    h('div', { style: { fontFamily: T.mono, fontWeight: 600, fontSize: 40, color: azColor } }, fin(azDisplay) ? azDisplay.toFixed(1) : '\u2014'),
                    azZone && h(Pill, { text: azZone, color: azColor, dim: azColor === T.green ? T.greenDim : azColor === T.amber ? T.amberDim : T.redDim })
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
                }) : null,
                !fin(azDisplay) && h(Note, { style: { fontSize: 10, marginTop: 8 } },
                    azRefused && azWithheld && azWithheld.reason === 'financial_profile'
                        ? 'WITHHELD, not missing. ' + azWithheld.note
                        : azRefused
                            ? 'Refused: a Z\u2033 missing a component is not a lower Z\u2033, it is a different '
                              + 'statistic, and the band chart above is drawn for the complete one. '
                              + 'The components below show which terms are absent.'
                            : 'No statements loaded for this symbol yet, so no Z\u2033 can be formed.')
            ),

            // Beneish M
            h(Card, { title: 'Beneish M-Score', badge: 'NEW' },
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 } },
                    h('div', { style: { fontFamily: T.mono, fontWeight: 600, fontSize: 40, color: bm != null && !bmFlag ? T.green : bm != null ? T.red : T.muted } },
                        bm != null ? bm.toFixed(2) : '—'),
                    bm != null
                        ? h(Pill, { text: bmFlag ? 'FLAG' : 'NO FLAG', color: bmFlag ? T.red : T.green, dim: bmFlag ? T.redDim : T.greenDim })
                        : h(Pill, { text: 'N/A', color: T.muted, dim: T.border })
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
                    h(StatBox, { label: 'Sloan accrual ratio', value: sv.ratio == null ? '—' : (sv.ratio * 100).toFixed(1) + '%', color: sv.ratio == null ? T.muted2 : sv.cashBacked ? T.green : T.amber, sub: 'Low accruals → earnings cash-backed' }),
                    h(StatBox, { label: 'Accrual quality (5y σ)', value: fin(accrualQ) ? accrualQ.toFixed(3) : '—', sub: 'Stable mapping to cash flows' })
                ),
                h(Note, null,
                    sv.note || sv.reason,
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
    var inp = p.inputs;
    var derived = useStatementDerived(p.symbol, p.derived);

    // NO PROXIES AND NO LITERAL GRADES. Three fabrications stood here:
    //
    //   roic      = inp.roe * 0.6            <- a made-up factor, then
    //                                           differenced against a WACC to
    //                                           print "value-creating"
    //   buyback   = -(fcf - cash) / mktCap   <- negative free cash flow over
    //                                           market cap, under the name
    //                                           "buyback yield"; nothing in it
    //                                           knows about repurchases
    //   scorecard = capGrade ? 'C+' : null   <- a grade for buyback accretion,
    //             = capGrade ? 'A−' : null      and one for the M&A record,
    //                                           from the EXISTENCE of a row
    //
    // and `overallGrade` ended `: 'B'`, so a company with nothing measured got
    // a B in 64-point type. `capitalAllocationView` withholds instead.
    var waccMeasured = derived && fin(derived.wacc_est);
    var cap = capitalAllocationView({
        roic: derived && fin(derived.roic) ? derived.roic : null,
        wacc: waccMeasured ? derived.wacc_est : (inp ? inp.wacc : null),
        waccBasis: waccMeasured ? 'estimated' : 'assumed',
        reinvRate: derived && fin(derived.reinvest_rate) ? derived.reinvest_rate : null,
        // Free cash flow over dividends paid IS dividend coverage, and all
        // three inputs are measured, so this is a computation rather than a
        // substitution — but it is a different source from the statements, so
        // the basis travels with it.
        divCov: (derived && fin(derived.div_coverage)) ? derived.div_coverage
              : (inp && fin(inp.fcf) && fin(inp.divPS) && fin(inp.shares) && inp.divPS * inp.shares > 0)
                    ? inp.fcf / (inp.divPS * inp.shares) : null,
        divCovBasis: (derived && fin(derived.div_coverage)) ? 'statements' : 'overview',
        buybackYield: derived && fin(derived.buyback_yield) ? derived.buyback_yield : null,
    });

    var spread = cap.spread == null ? null : cap.spread;
    var spreadColor = spread == null ? T.muted : spread > 0.10 ? T.green : spread > 0 ? T.cyan : T.red;
    var overallColor = !cap.overall ? T.muted2
        : cap.overall.charAt(0) === 'A' ? T.green : cap.overall.charAt(0) === 'B' ? T.cyan : T.amber;

    return h('div', null,
        h(Grid, { style: { gridTemplateColumns: '1.3fr .7fr', marginBottom: 14 } },
            h(Card, { title: 'Capital Allocation Report Card', badge: 'REWORKED' },
                h(Grid, { style: { gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 8 } },
                    h(StatBox, {
                        label: 'ROIC − WACC spread',
                        value: spread == null ? '—' : (spread >= 0 ? '+' : '') + (spread * 100).toFixed(1) + 'pp',
                        color: spreadColor,
                        // The value verdict is a claim about the spread and
                        // cannot outlive it: `spread > 0` on a null is false,
                        // so the old sub-line read "value-destroying" for a
                        // company whose ROIC nobody had.
                        sub: spread == null
                            ? (cap.roic == null ? 'No measured ROIC on file' : null)
                            : (cap.roic * 100).toFixed(1) + '% vs ' + (cap.wacc * 100).toFixed(1) + '% '
                              + (cap.waccBasis === 'assumed' ? 'assumed' : 'estimated') + ' · ' + cap.valueVerdict,
                    }),
                    h(StatBox, { label: 'Reinvestment rate', value: fin(derived && derived.reinvest_rate) ? (derived.reinvest_rate * 100).toFixed(0) + '%' : '—', sub: 'of NOPAT' }),
                    h(StatBox, { label: 'Buyback yield', value: cap.buybackYield == null ? '—' : (cap.buybackYield * 100).toFixed(1) + '%', color: cap.buybackYield == null ? T.muted2 : T.amber, sub: cap.buybackYield == null ? 'No repurchase series on file' : null })
                ),
                h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.12em', color: T.muted2, textTransform: 'uppercase', margin: '14px 0 6px' } }, 'Allocation scorecard'),
                cap.rows.map(function(sc) {
                    var gradeColor = sc.grade && sc.grade.charAt(0) === 'A' ? T.green : sc.grade && sc.grade.charAt(0) === 'B' ? T.cyan : T.amber;
                    return h('div', { key: sc.label, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid ' + T.border, fontSize: 12.5 } },
                        h('span', { style: { color: sc.state === ROW_NO_MEASURE ? T.muted2 : T.muted } }, sc.label),
                        sc.state === ROW_GRADED
                            ? h('span', { style: { fontFamily: T.mono, fontSize: 11, background: gradeColor === T.green ? T.greenDim : gradeColor === T.cyan ? T.cyanDim : T.amberDim, color: gradeColor, padding: '2px 8px', borderRadius: 5 } }, sc.grade)
                            // "nothing computes this" and "this filer has no
                            // value" are different facts, and one em dash in a
                            // grade slot cannot tell them apart.
                            : h('span', { style: { fontFamily: T.mono, fontSize: 9.5, color: T.muted2, textAlign: 'right' } }, sc.why)
                    );
                })
            ),
            h(Card, { title: 'Overall Grade' },
                h('div', { style: { textAlign: 'center', padding: '18px 0' } },
                    h('div', { style: { fontFamily: T.display, fontWeight: 700, fontSize: cap.overall ? 64 : 34, color: overallColor } }, cap.overall || 'NOT GRADED'),
                    cap.overall && h('div', { style: { fontFamily: T.mono, fontSize: 9.5, color: T.muted2, marginTop: 6 } }, cap.overallBasis),
                    h(Note, { style: { marginTop: 8 } }, cap.overall
                        ? (spread == null
                            ? 'Graded on what could be measured; the returns-on-capital component is not among it.'
                            : spread > 0.10
                                ? 'Elite returns on capital, disciplined reinvestment. Value creation is robust across cycles.'
                                : spread > 0
                                    ? 'Positive spread over WACC. Monitor reinvestment quality as growth decelerates.'
                                    : 'Returns on capital sit below the cost of capital on this reading.')
                        : cap.overallReason)
                ),
                inp && h(Grid, { style: { gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 } },
                    h('div', { style: { textAlign: 'center' } },
                        h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: T.muted2, textTransform: 'uppercase', marginBottom: 4 } }, 'FCF Yield'),
                        h('div', { style: { fontFamily: T.mono, fontSize: 18 } }, fin(inp.fcf) && fin(inp.mktCap) && inp.mktCap > 0 ? (inp.fcf / inp.mktCap * 100).toFixed(1) + '%' : '—')
                    ),
                    h('div', { style: { textAlign: 'center' } },
                        h('div', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: T.muted2, textTransform: 'uppercase', marginBottom: 4 } }, 'Dividend Coverage'),
                        h('div', { style: { fontFamily: T.mono, fontSize: 18, color: cap.divCov != null && cap.divCov > 2 ? T.green : T.muted } }, cap.divCov == null ? '—' : cap.divCov.toFixed(1) + 'x'),
                        // Name the basis: the statements and the overview
                        // answer the same question from different books.
                        cap.divCov != null && h('div', { style: { fontFamily: T.mono, fontSize: 9, color: T.muted2, marginTop: 3 } }, 'from ' + cap.divCovBasis)
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
