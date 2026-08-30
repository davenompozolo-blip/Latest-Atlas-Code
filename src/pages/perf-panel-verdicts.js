import React from 'react';
// ============================================================
// ATLAS Terminal — Verdict cards (memo v2 close-out §5.3)
// ------------------------------------------------------------
// React 18, no JSX — repo convention.
//
// One card per open position. The middle of every card is the TIER SLOT: the
// comparison that actually applies, in the same place, always named.
//
//   Tier 1  own return vs the median of its correlated peers
//   Tier 2  own return vs the rest of the book at prevailing weights
//   neither the reason it could not be measured
//
// The point of the slot is that no card has a hole in it. Only 19 of 57
// positions can carry a peer ranking, so a cluster panel on every card would
// leave two-thirds looking broken. The full rankings are one level up on the
// CLUSTERS tab; here each card gets the tier it earned and says so.
// ============================================================

import { loadVerdictRows, buildVerdictCards, barGeometry } from '../lib/verdictCard.js';
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
    slate:      '#7c8598',
    text1:      'rgba(255,255,255,0.88)',
    text2:      'rgba(255,255,255,0.45)',
    text3:      'rgba(255,255,255,0.24)',
    mono:       "'JetBrains Mono', ui-monospace, monospace",
};

var LABEL = {
    leader:        { color: T.green, text: 'LEADER' },
    holding_own:   { color: T.text2, text: 'HOLDING OWN' },
    lagging:       { color: T.amber, text: 'LAGGING' },
    cut_candidate: { color: T.red,   text: 'CUT CANDIDATE' },
};

// The tier is a fact about the evidence, so it gets its own colour and never
// borrows the verdict's — a Tier 2 leader and a Tier 1 leader are the same
// verdict on different evidence, and the card has to keep the two readable
// apart at a glance.
var BASIS = {
    cluster: { color: T.teal,  text: 'TIER 1 · CLUSTER' },
    book:    { color: T.blue,  text: 'TIER 2 · REST OF BOOK' },
    none:    { color: T.slate, text: 'NOT MEASURED' },
};

function pct(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
function ppOf(v, dp) {
    if (v == null || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(dp == null ? 2 : dp) + 'pp';
}
function sign(v) {
    if (v == null) return T.text3;
    return v >= 0 ? T.green : T.red;
}
function money(v) {
    if (v == null || !isFinite(v)) return '—';
    return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// ── the slot's bar ───────────────────────────────────────────
// A diverging track centred on the reference. Right of centre the position
// beat its comparator, left of centre it did not. Length encodes the edge on
// one shared scale so two cards are comparable; the exact figure is printed
// beside it, so a clipped bar loses nothing but the picture.
function EdgeBar(props) {
    var g = barGeometry(props.edge, props.scale);
    var positive = props.edge != null && props.edge >= 0;
    var color = sign(props.edge);

    return h('div', { style: { position: 'relative', height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', margin: '8px 0 6px' } },
        // Centre line = the comparator. Everything is read against it.
        h('div', { style: { position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: 'rgba(255,255,255,0.22)' } }),
        props.edge != null && h('div', {
            style: {
                position: 'absolute', top: 0, bottom: 0,
                left: positive ? '50%' : (50 - g.frac * 50) + '%',
                width: (g.frac * 50) + '%',
                background: color, opacity: 0.75,
                borderRadius: positive ? '0 4px 4px 0' : '4px 0 0 4px',
            }
        }),
        // Clip marker: says the bar ran out of track, not out of number.
        g.clipped && h('div', {
            style: {
                position: 'absolute', top: -3, fontSize: 10, color: color, fontWeight: 700,
                left: positive ? 'calc(100% + 3px)' : null,
                right: positive ? null : 'calc(100% + 3px)',
            }
        }, positive ? '▸' : '◂')
    );
}

// ── one card ─────────────────────────────────────────────────
function VerdictCard(props) {
    var c = props.card;
    var s = c.slot;
    var basis = BASIS[s.basis] || BASIS.none;
    var lab = LABEL[c.label] || null;

    return h('div', {
        style: {
            background: T.cardBg, border: '1px solid ' + T.cardBorder,
            borderTop: '2px solid ' + basis.color,
            borderRadius: 8, padding: '12px 14px 11px',
            display: 'flex', flexDirection: 'column',
        }
    },
        // header — symbol, verdict
        h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 } },
            h('div', { style: { fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.text1, letterSpacing: 0.3 } }, c.symbol),
            lab && h('div', { style: { fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, color: lab.color } }, lab.text)
        ),
        h('div', { style: { fontSize: 8.5, letterSpacing: 1, color: basis.color, opacity: 0.9, marginTop: 3, fontWeight: 600 } }, basis.text),

        // ── THE TIER SLOT ────────────────────────────────────
        s.basis === 'none'
            ? h('div', { style: { marginTop: 12, marginBottom: 6, padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' } },
                h('div', { style: { fontSize: 11.5, color: T.slate, fontWeight: 600 } }, s.reason),
                s.staleDays != null && h('div', { style: { fontSize: 9.5, color: T.text3, marginTop: 3, fontFamily: T.mono } },
                    'last close ' + s.staleDays + ' days old'))
            : h('div', { style: { marginTop: 10, paddingTop: 9, borderTop: '1px solid rgba(255,255,255,0.05)' } },
                h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' } },
                    h('div', { style: { fontSize: 9, letterSpacing: 0.9, textTransform: 'uppercase', color: T.text2 } }, s.label),
                    h('div', { style: { fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: sign(s.edge) } }, ppOf(s.edge))
                ),
                h(EdgeBar, { edge: s.edge, scale: props.scale }),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontFamily: T.mono, color: T.text2 } },
                    h('span', null, 'own ' + pct(s.own)),
                    h('span', null, s.referenceLabel + ' ' + pct(s.reference))
                ),
                s.detail && h('div', { style: { fontSize: 9, color: T.text3, marginTop: 4, lineHeight: 1.4 } }, s.detail),
                // Rank belongs to Tier 1 only, and only once the job records
                // it. Nights before 2026-08-31 carry none and say so rather
                // than showing a dash that reads as "unranked".
                s.basis === 'cluster' && h('div', { style: { fontSize: 9.5, color: T.text2, marginTop: 4, fontFamily: T.mono } },
                    s.rank != null
                        ? 'rank #' + s.rank + (s.field ? ' of ' + s.field : '')
                        : h('span', { style: { color: T.text3 } }, 'rank not recorded this night')),
                // Display only — never the score, never the bar.
                s.basis === 'cluster' && s.bestSymbol && h('div', { style: { fontSize: 9, color: T.text3, marginTop: 2, fontFamily: T.mono } },
                    'best peer ' + s.bestSymbol + (s.regret == null ? '' : ' · ' + ppOf(s.regret, 1) + ' behind'))
            ),

        // footer — evidence
        h('div', { style: { marginTop: 'auto', paddingTop: 9, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.text3, fontFamily: T.mono } },
            h('span', null, c.daysHeld != null ? c.daysHeld + 'd held' : '—'),
            h('span', null, money(c.capital))
        ),
        c.reasonCode && h('div', { style: { marginTop: 6, fontSize: 9, color: T.amber, fontWeight: 600, letterSpacing: 0.4 } },
            c.reasonCode.replace(/_/g, ' '))
    );
}

// ── the panel ────────────────────────────────────────────────
export function VerdictCardsPanel() {
    var _r = useState(null);
    var rows = _r[0], setRows = _r[1];
    var _l = useState(true);
    var loading = _l[0], setLoading = _l[1];

    useEffect(function () {
        var alive = true;
        function load() {
            loadVerdictRows(sb).then(function (data) {
                if (!alive) return;
                setRows(data);
                setLoading(false);
            });
        }
        load();
        window.addEventListener('atlas:refresh', load);
        return function () { alive = false; window.removeEventListener('atlas:refresh', load); };
    }, []);

    var view = useMemo(function () { return buildVerdictCards(rows || []); }, [rows]);

    if (loading) return h(Loading, null);
    return h(VerdictCardsView, { view: view });
}

/** Pure render, split from the loader so it can be exercised on a known night. */
export function VerdictCardsView(props) {
    var view = props.view;

    if (!view || !view.cards.length) {
        return h('div', { style: { padding: 28, color: T.text2, fontSize: 12.5, lineHeight: 1.6 } },
            h('div', { style: { fontWeight: 700, color: T.text1, marginBottom: 6 } }, 'No verdicts on file'),
            'The nightly verdict job writes position_verdicts at 23:37 on weekdays. Nothing has been ',
            'written yet, so there is no night to show — an absent reading, not an empty book.');
    }

    var n = view.counts;

    return h('div', null,
        h('div', {
            style: {
                background: T.cardBg, border: '1px solid ' + T.cardBorder, borderRadius: 10,
                padding: '13px 18px', marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap',
            }
        },
            h('div', { style: { fontSize: 11, color: T.text2, maxWidth: 430, lineHeight: 1.5 } },
                'Every card carries the comparison that applies to it, in the same slot, named. ',
                'Full peer rankings are one level up on ',
                h('strong', { style: { color: T.teal } }, 'CLUSTERS'), '.'),
            h('div', { style: { display: 'flex', gap: 20, marginLeft: 'auto', flexWrap: 'wrap' } },
                [['cluster', 'Tier 1 · cluster'], ['book', 'Tier 2 · rest of book'], ['none', 'not measured']]
                    .map(function (pair) {
                        return h('div', { key: pair[0], style: { display: 'flex', flexDirection: 'column', gap: 2 } },
                            h('div', { style: { fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: T.text2 } }, pair[1]),
                            h('div', { style: { fontFamily: T.mono, fontSize: 19, fontWeight: 700, color: BASIS[pair[0]].color } },
                                String(n[pair[0]] || 0)));
                    })),
            h('div', { style: { fontSize: 9.5, color: T.text3, fontFamily: T.mono, textAlign: 'right', lineHeight: 1.6 } },
                h('div', null, 'as of ' + (view.asOf || '—')),
                h('div', null, view.logicVersion || ''))
        ),

        h('div', {
            style: {
                display: 'grid', gap: 12,
                gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))',
                alignItems: 'stretch',
            }
        }, view.cards.map(function (c) {
            return h(VerdictCard, { key: c.symbol, card: c, scale: view.scale });
        }))
    );
}
