import React from 'react';
// ============================================================
// ATLAS Terminal — Trading-effect drill-down (memo v2 close-out §5.1)
// ------------------------------------------------------------
// React 18, no JSX — repo convention.
//
// The layer under the do-nothing baseline tile in the KPI bar. That tile says
// what the trading was worth; this says where it went.
//
// Three things drive the layout, all of them findings rather than taste:
//
//   1. Dollars lead and the rate column is subordinate, because only dollars
//      add up to the book. The panel states the size of that difference
//      (−160.76pp against −1.03pp) rather than leaving the reader to assume
//      the two columns are two views of one number.
//   2. The by-kind rollup comes BEFORE the position table, because the answer
//      is in the rollup: exits carry the whole effect and resizing is a wash.
//      A ranked list of 63 positions buries that under its own top row.
//   3. Untouched positions get a count and no rows. Fourteen lines of "$0 /
//      0.00pp" would read as a broken measurement rather than as fourteen
//      positions nobody traded.
//
// The traded list is NOT capped, and that was measured rather than assumed.
// The top ten rows carry only 48% of the gross movement and the largest row
// outside the top thirty is still $145, so there is no point in the
// distribution where a cut stops hiding real content. A "top 20 and the rest"
// treatment would drop a quarter of the effect into a summary line.
// ============================================================

import { loadTradingEffect, buildTradingView, tradingVerdict } from '../lib/tradingEffect.js';
import { loadBookBaseline, readBookBaseline } from '../lib/bookBaseline.js';
import { sb } from './config.js';
import { Loading } from './components.js';

var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo;
var h = React.createElement;

var T = {
    cardBg:     'rgba(255,255,255,0.025)',
    cardBorder: 'rgba(255,255,255,0.07)',
    teal:       '#00d4b8',
    green:      '#22c55e',
    red:        '#ef4444',
    amber:      '#f59e0b',
    blue:       '#3b82f6',
    text1:      'rgba(255,255,255,0.88)',
    text2:      'rgba(255,255,255,0.45)',
    text3:      'rgba(255,255,255,0.22)',
    mono:       "'JetBrains Mono', ui-monospace, monospace",
};

var KIND_COLOR = { exit: T.red, resized: T.blue, untouched: T.text3 };
var KIND_LABEL = { exit: 'EXITS', resized: 'RESIZED', untouched: 'UNTOUCHED' };

function usd(v, dp) {
    if (v == null || !isFinite(v)) return '—';
    var s = Math.abs(v).toFixed(dp == null ? 0 : dp).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // Zero takes no sign. "+$0" reads as a rounded-up small positive; the
    // untouched bucket's zero is exact and should not look approximated.
    if (Number(s.replace(/,/g, '')) === 0) return '$' + s;
    return (v < 0 ? '−$' : '+$') + s;
}
function usdPlain(v) {
    if (v == null || !isFinite(v)) return '—';
    return '$' + Math.abs(v).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function pp(v, dp) {
    if (v == null || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dp == null ? 2 : dp) + 'pp';
}
function signColor(v) {
    if (v == null) return T.text3;
    return v >= 0 ? T.green : T.red;
}

// ── small pieces ─────────────────────────────────────────────
function Stat(props) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 130 } },
        h('div', { style: { fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: T.text2 } }, props.label),
        h('div', { style: { fontFamily: T.mono, fontSize: 24, fontWeight: 700, color: props.color || T.text1, lineHeight: 1.1 } }, props.value),
        props.sub && h('div', { style: { fontSize: 10, color: T.text3, maxWidth: 250, lineHeight: 1.35 } }, props.sub));
}

function TH(props) {
    return h('th', {
        style: {
            textAlign: props.right ? 'right' : 'left', padding: '6px 10px',
            fontSize: 9, letterSpacing: 1.2,
            textTransform: props.raw ? 'none' : 'uppercase',
            color: T.text2, fontWeight: 600, whiteSpace: 'nowrap',
            borderBottom: '1px solid ' + T.cardBorder,
        }
    }, props.children);
}

function TD(props) {
    return h('td', {
        style: Object.assign({
            textAlign: props.right ? 'right' : 'left', padding: '7px 10px',
            fontFamily: props.mono === false ? 'inherit' : T.mono,
            fontSize: 11.5, color: props.color || T.text1, whiteSpace: 'nowrap',
        }, props.style || {})
    }, props.children);
}

function Note(props) {
    var c = props.color || T.amber;
    return h('div', {
        style: {
            background: props.fill || 'rgba(245,158,11,0.07)',
            border: '1px solid ' + (props.border || 'rgba(245,158,11,0.28)'),
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            fontSize: 11.5, color: T.text2, lineHeight: 1.55,
        }
    },
        props.title && h('strong', { style: { color: c } }, props.title + ' '),
        props.children);
}

// ── the by-kind decomposition ────────────────────────────────
function KindBars(props) {
    var byKind = props.byKind;
    // Scaled on the largest magnitude so the dominant bucket fills the row and
    // the rest are read against it. On this book that is one very long bar and
    // two slivers, which is the finding, not a rendering problem.
    var max = byKind.reduce(function (m, k) { return Math.max(m, Math.abs(k.usd)); }, 0) || 1;

    return h('div', {
        style: {
            background: T.cardBg, border: '1px solid ' + T.cardBorder,
            borderRadius: 10, padding: '14px 18px 16px', marginBottom: 16,
        }
    },
        h('div', { style: { fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: T.text2, marginBottom: 12 } },
            'Where the effect came from'),
        byKind.map(function (k) {
            var w = (Math.abs(k.usd) / max) * 100;
            var c = k.usd === 0 ? T.text3 : (k.usd > 0 ? T.green : T.red);
            return h('div', { key: k.kind, style: { marginBottom: 12 } },
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 } },
                    h('div', { style: { fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: KIND_COLOR[k.kind], letterSpacing: 0.8, minWidth: 88 } },
                        KIND_LABEL[k.kind]),
                    h('div', { style: { fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: c, minWidth: 90 } },
                        k.count ? usd(k.usd) : '—'),
                    h('div', { style: { fontSize: 10.5, color: T.text2 } },
                        k.count + (k.count === 1 ? ' position — ' : ' positions — ') + k.read)
                ),
                h('div', { style: { height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' } },
                    h('div', { style: { height: '100%', width: Math.max(w, k.count && k.usd !== 0 ? 1.5 : 0) + '%', background: c, opacity: 0.75, borderRadius: 3 } }))
            );
        })
    );
}

// ── the panel ────────────────────────────────────────────────
export function TradingEffectPanel() {
    var _r = useState(null);
    var rows = _r[0], setRows = _r[1];
    var _b = useState(null);
    var baseline = _b[0], setBaseline = _b[1];
    var _l = useState(true);
    var loading = _l[0], setLoading = _l[1];

    useEffect(function () {
        var alive = true;
        function load() {
            // The baseline is fetched here too, not passed down. This panel has
            // to compare its own valuation date against the tile's night, and a
            // prop threaded through the suite would let the two drift apart
            // silently on any future refactor.
            Promise.all([loadTradingEffect(sb), loadBookBaseline(sb)]).then(function (out) {
                if (!alive) return;
                setRows(out[0]);
                // No NAV series passed, deliberately. `readBookBaseline` uses
                // it to age the row in trading sessions, which is the KPI
                // tile's job — it has the series and owns the STALE badge.
                // Here the equivalent question is answered better by
                // `alignment()`, which compares the tile's night against this
                // panel's own live valuation date. Threading a series in would
                // add a second, weaker staleness signal saying the same thing.
                setBaseline(readBookBaseline(out[1], null));
                setLoading(false);
            });
        }
        load();
        window.addEventListener('atlas:refresh', load);
        return function () { alive = false; window.removeEventListener('atlas:refresh', load); };
    }, []);

    var view = useMemo(function () {
        return buildTradingView(rows || [], baseline);
    }, [rows, baseline]);

    if (loading) return h(Loading, null);
    return h(TradingEffectView, { view: view, loadFailed: rows === null });
}

/**
 * Pure render, split from the loader so the surface can be exercised against a
 * known book without a live database — the same split as the clusters and
 * verdicts panels, and the reason the §5.1 tile's two layout defects were
 * found by looking at it rather than by asserting about it.
 */
export function TradingEffectView(props) {
    var view = props.view;

    if (props.loadFailed) {
        return h('div', { style: { padding: 28, color: T.text2, fontSize: 12.5, lineHeight: 1.6 } },
            h('div', { style: { fontWeight: 700, color: T.red, marginBottom: 6 } }, 'Could not read the decomposition'),
            'The read failed rather than returning nothing. This is not a book that never traded — ',
            'check the console for the PostgREST error.');
    }

    if (!view || !view.totalCount) {
        return h('div', { style: { padding: 28, color: T.text2, fontSize: 12.5, lineHeight: 1.6 } },
            h('div', { style: { fontWeight: 700, color: T.text1, marginBottom: 6 } }, 'No positions to compare'),
            'The return engine has published no positions, so there is no traded book to hold ',
            'against a frozen one.');
    }

    var byKind = {};
    view.byKind.forEach(function (k) { byKind[k.kind] = k; });
    var tradedGain = view.byKind.reduce(function (s, k) {
        return s + k.rows.reduce(function (a, r) { return a + (r.tradedGain || 0); }, 0);
    }, 0);
    var frozenGain = view.byKind.reduce(function (s, k) {
        return s + k.rows.reduce(function (a, r) { return a + (r.frozenGain || 0); }, 0);
    }, 0);

    return h('div', null,
        // ── header ───────────────────────────────────────────
        h('div', {
            style: {
                background: T.cardBg, border: '1px solid ' + T.cardBorder, borderRadius: 10,
                padding: '16px 20px', marginBottom: 16,
                display: 'flex', alignItems: 'flex-start', gap: 34, flexWrap: 'wrap',
            }
        },
            h(Stat, {
                label: 'Trading effect', color: signColor(view.totalUsd),
                value: usd(view.totalUsd),
                sub: 'Traded ' + usdPlain(tradedGain) + ' against a frozen book’s '
                     + usdPlain(frozenGain) + '. Dollars, because they are what add up.',
            }),
            h(Stat, {
                label: 'Helped / hurt', color: T.text1,
                value: view.helped + ' / ' + view.hurt,
                sub: 'Of ' + view.tradedCount + ' positions that were actually traded'
                     + (view.unchanged ? ' — the other ' + view.unchanged + ' changed nothing' : '')
                     + '. ' + view.untouchedCount + ' more were bought once and never touched.',
            }),
            h(Stat, {
                label: 'Cannot be compared', color: view.unmeasurableCount ? T.amber : T.text3,
                value: String(view.unmeasurableCount),
                sub: 'Of ' + view.totalCount + ' positions the engine knows. Reasons listed below — '
                     + 'none of them is a zero.',
            }),
            h('div', { style: { marginLeft: 'auto', textAlign: 'right', fontSize: 10, color: T.text3, fontFamily: T.mono, lineHeight: 1.6 } },
                h('div', null, 'marked to ' + (view.asOf || '—')),
                h('div', { style: { color: view.align.state === 'aligned' ? T.text3 : T.amber } },
                    view.align.state === 'aligned' ? 'aligned with the tile' : view.align.state.replace('_', ' '))
            )
        ),

        h('div', { style: { fontSize: 13, color: T.text1, fontWeight: 700, marginBottom: 14, letterSpacing: 0.2 } },
            tradingVerdict(view)),

        // ── the alignment gate ───────────────────────────────
        // A drill-down describing a different night from the headline above it
        // is the mixed-basis failure in a new place. Say which is which; never
        // reconcile them.
        view.align.state !== 'aligned' && h(Note, { title: 'Different night from the figure above.' },
            view.align.reason,
            '. The tile reads the nightly ',
            h('code', { style: { fontFamily: T.mono } }, 'book_risk_daily'),
            ' history; this reads the live engine. Both are correct about their own date.'),

        // ── why dollars ──────────────────────────────────────
        h(Note, {
            title: 'Ranked on dollars, not on the rate column.',
            color: T.teal, fill: 'rgba(0,212,184,0.06)', border: 'rgba(0,212,184,0.24)',
        },
            'The book figure is a money-weighted return over pooled cash flows, so no weighting of the '
            + 'per-position rates recovers it. Adding these ',
            h('strong', { style: { color: T.text1 } }, String(view.measuredCount)),
            ' rates together gives ',
            h('strong', { style: { color: T.red } }, pp(view.naiveRateSumPp)),
            view.bookEffectPp == null ? '' : ', against a book effect of ',
            view.bookEffectPp == null ? '' : h('strong', { style: { color: T.text1 } }, pp(view.bookEffectPp)),
            '. The dollar column does sum, exactly, which is why it is the ranking — and why the rate '
            + 'beside each row is context rather than a score.'),

        // ── breach: never silent ─────────────────────────────
        view.breaches.length > 0 && h(Note, { title: 'Structural zero breached.', color: T.red,
            fill: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.3)' },
            view.breaches.map(function (r) { return r.symbol; }).join(', '),
            ' are classed as never traded, yet their traded and frozen paths diverge. Those two things '
            + 'cannot both be true — either the classification or the counterfactual is wrong. The '
            + 'figures are shown unsnapped rather than zeroed.'),

        h(KindBars, { byKind: view.byKind }),

        // ── the ranked positions ─────────────────────────────
        h('div', {
            style: {
                background: T.cardBg, border: '1px solid ' + T.cardBorder,
                borderRadius: 10, padding: '12px 4px 4px', marginBottom: 16,
            }
        },
            h('div', { style: { padding: '0 12px 8px' } },
                h('div', { style: { fontFamily: T.mono, fontSize: 12.5, fontWeight: 700, color: T.teal, letterSpacing: 0.5 } },
                    'BY POSITION — ' + view.rankedByDollars.length + ' TRADED'),
                h('div', { style: { fontSize: 10.5, color: T.text2, marginTop: 4, maxWidth: 820, lineHeight: 1.5 } },
                    'Biggest movers of the book number first, either direction. The ',
                    h('span', { style: { color: T.amber } }, '⇄'),
                    ' mark means dollars and rate point opposite ways — the traded path deployed '
                    + 'different capital from the frozen one, so it can make more money at a worse rate. '
                    + 'Both readings are true; they answer different questions.')
            ),
            h('div', { style: { overflowX: 'auto' } },
                h('table', { style: { width: '100%', maxWidth: 1180, borderCollapse: 'collapse', minWidth: 780 } },
                    h('thead', null, h('tr', null,
                        h(TH, null, 'Symbol'),
                        h(TH, null, 'Trading'),
                        h(TH, { right: true }, 'Trades'),
                        h(TH, { right: true }, 'Traded gain'),
                        h(TH, { right: true }, 'Frozen gain'),
                        h(TH, { right: true }, 'Effect $'),
                        h(TH, { right: true }, 'Effect (rate)'),
                        h(TH, null, '')
                    )),
                    h('tbody', null, view.rankedByDollars.map(function (r) {
                        return h('tr', { key: r.symbol, style: { borderBottom: '1px solid rgba(255,255,255,0.03)' } },
                            h(TD, { style: { fontWeight: 700 } }, r.symbol),
                            h(TD, { mono: false, color: KIND_COLOR[r.kind] || T.text3, style: { fontSize: 11 } }, r.kind),
                            h(TD, { right: true, color: T.text2 }, String((r.buys || 0) + (r.sells || 0))),
                            h(TD, { right: true, color: T.text2 }, usd(r.tradedGain)),
                            h(TD, { right: true, color: T.text2 }, usd(r.frozenGain)),
                            h(TD, { right: true, color: signColor(r.effectUsd), style: { fontWeight: 700 } }, usd(r.effectUsd)),
                            h(TD, { right: true, color: r.disagree ? T.amber : T.text2 }, pp(r.effectPp, 1)),
                            h(TD, { color: T.amber, style: { fontSize: 12 } }, r.disagree ? '⇄' : '')
                        );
                    }))
                )
            )
        ),

        // ── untouched: a count, not fourteen empty rows ──────
        view.untouchedCount > 0 && h(Note, { color: T.text2, fill: 'rgba(255,255,255,0.02)',
            border: T.cardBorder, title: view.untouchedCount + ' positions were never traded.' },
            'Bought once and held. Their frozen path IS their traded path, so the effect is zero by '
            + 'construction rather than by measurement — the engine’s solver returns about 1e-7 for '
            + 'them and that residue is snapped away. They are listed nowhere above because a column of '
            + '$0 would read as a failed measurement.'),

        // ── the ones that cannot be compared ─────────────────
        view.unmeasurableCount > 0 && h('div', {
            style: {
                background: T.cardBg, border: '1px solid ' + T.cardBorder,
                borderRadius: 10, padding: '12px 4px 4px', marginTop: 6,
            }
        },
            h('div', { style: { padding: '0 12px 8px' } },
                h('div', { style: { fontFamily: T.mono, fontSize: 12.5, fontWeight: 700, color: T.amber, letterSpacing: 0.5 } },
                    'CANNOT BE COMPARED — ' + view.unmeasurableCount + ' POSITIONS'),
                h('div', { style: { fontSize: 10.5, color: T.text2, marginTop: 4, maxWidth: 820, lineHeight: 1.5 } },
                    'Excluded from every figure above, not counted as zero. Note that several read '
                    + 'healthy on the position and fail on the counterfactual: the traded return is '
                    + 'fine and it is the frozen path that cannot be priced, because marking it '
                    + 'requires a tape that has stopped.')
            ),
            h('div', { style: { overflowX: 'auto' } },
                h('table', { style: { width: '100%', maxWidth: 980, borderCollapse: 'collapse', minWidth: 560 } },
                    h('thead', null, h('tr', null,
                        h(TH, null, 'Symbol'),
                        h(TH, null, 'State'),
                        h(TH, null, 'Reason'),
                        h(TH, null, 'Detail')
                    )),
                    h('tbody', null, view.unmeasurable.map(function (r) {
                        return h('tr', { key: r.symbol, style: { borderBottom: '1px solid rgba(255,255,255,0.03)' } },
                            h(TD, { style: { fontWeight: 700 } }, r.symbol),
                            h(TD, { color: T.text2 }, r.state || '—'),
                            h(TD, { mono: false, color: T.amber, style: { fontSize: 11 } },
                                r.reason ? r.reason.replace(/_/g, ' ') : '—'),
                            h(TD, { mono: false, color: T.text3, style: { fontSize: 10.5, whiteSpace: 'normal', maxWidth: 420 } },
                                r.detail || '—')
                        );
                    }))
                )
            )
        )
    );
}
