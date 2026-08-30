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
import { thesisGate, thesisQuadrants, QUADRANT_READ, THESIS_STALE_DAYS } from '../lib/thesisGate.js';
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

// Bench vocabulary. `untested` is deliberately muted rather than warning-
// coloured: it is the honest reading of a thesis nobody has judged, not a
// fault, and colouring it amber would read as an alert about the position.
var THESIS_COLOR = {
    intact:       T.green,
    confirmed:    T.green,
    bending:      T.amber,
    broken:       T.red,
    contradicted: T.red,
    expired:      T.slate,
    untested:     T.slate,
    pending:      T.slate,
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

        // ── the Bench's thesis, gated (§5.2) ─────────────────
        // Absent entirely when no claim was ever written for the name — there
        // is no absence to explain, so no row is drawn. Present but unjudged
        // renders UNTESTED with the reason, which is every held thesis today.
        (function () {
            var g = thesisGate({
                thesis_state: c.thesisState, thesis_state_as_of: c.thesisAsOf,
            });
            if (!g) return null;
            var col = THESIS_COLOR[g.display] || T.slate;
            return h('div', { style: { marginTop: 9, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' } },
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 7 } },
                    h('span', { style: { fontSize: 8.5, letterSpacing: 1, color: T.text2 } }, 'THESIS'),
                    h('span', { style: { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: col } },
                        g.display.toUpperCase()),
                    // A gated state is flagged as such: the reader should see
                    // that the word was produced by the freshness rule, not by
                    // someone judging the thesis untested.
                    g.gated && h('span', { style: { fontSize: 8, color: T.amber, border: '1px solid rgba(245,158,11,0.35)', borderRadius: 3, padding: '0 3px' } }, 'STALE')
                ),
                h('div', { style: { fontSize: 9, color: T.text3, marginTop: 2, lineHeight: 1.35 } }, g.reason));
        })(),

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

        h(ThesisMatrix, { cards: view.cards }),

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

// ── the book-level 2×2 (§5.2) ────────────────────────────────
// One level up from the card: does the thesis still hold, and is the position
// actually working? The two questions are independent, which is the whole
// point — "right for a reason you no longer believe" and "the case survives
// the price" are different situations needing different actions.
//
// Placement uses the GATED state. A quadrant built on a stale INTACT would put
// a position in "working as intended" on a judgement nobody has made for
// months. Anything unjudged, gated or edgeless lands in its own bucket beside
// the grid rather than inside it: not knowing is not the same as knowing the
// thesis is broken.
function ThesisMatrix(props) {
    var q = thesisQuadrants(props.cards);
    var placed = q.holdingWinning.length + q.holdingLosing.length
               + q.brokenWinning.length + q.brokenLosing.length;

    function Cell(key, label, color) {
        var list = q[key];
        return h('div', {
            style: {
                background: 'rgba(255,255,255,0.02)', border: '1px solid ' + T.cardBorder,
                borderLeft: '2px solid ' + (list.length ? color : 'rgba(255,255,255,0.07)'),
                borderRadius: 6, padding: '9px 11px', minHeight: 62,
            }
        },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                h('div', { style: { fontFamily: T.mono, fontSize: 17, fontWeight: 700, color: list.length ? color : T.text3 } },
                    String(list.length)),
                h('div', { style: { fontSize: 9, color: T.text2, letterSpacing: 0.4 } }, label)),
            h('div', { style: { fontSize: 9, color: T.text3, marginTop: 3, lineHeight: 1.35 } }, QUADRANT_READ[key]),
            list.length ? h('div', { style: { fontSize: 9.5, color: T.text2, marginTop: 4, fontFamily: T.mono } },
                list.slice(0, 8).map(function (c) { return c.symbol; }).join(' ')
                + (list.length > 8 ? ' +' + (list.length - 8) : '')) : null);
    }

    return h('div', { style: { marginBottom: 16 } },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 } },
            h('div', { style: { fontFamily: T.mono, fontSize: 11.5, fontWeight: 700, color: T.text1, letterSpacing: 0.6 } },
                'THESIS vs POSITION'),
            h('div', { style: { fontSize: 10, color: T.text2 } },
                placed + ' of ' + props.cards.length + ' placeable')),
        h('div', { style: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' } },
            Cell('holdingWinning', 'holding · ahead',  T.green),
            Cell('holdingLosing',  'holding · behind', T.amber),
            Cell('brokenWinning',  'gone · ahead',     T.amber),
            Cell('brokenLosing',   'gone · behind',    T.red)),
        h('div', { style: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', marginTop: 10 } },
            Cell('notJudged', 'no reliable reading', T.slate),
            Cell('noThesis',  'no thesis on file',   T.slate)),
        placed === 0 && h('div', {
            style: {
                marginTop: 10, padding: '9px 12px', borderRadius: 6,
                background: 'rgba(124,133,152,0.08)', border: '1px solid rgba(124,133,152,0.28)',
                fontSize: 10.5, color: T.text2, lineHeight: 1.5,
            }
        },
            h('strong', { style: { color: T.text1 } }, 'Nothing is placeable yet. '),
            'The Bench holds ', h('strong', null, String(q.notJudged.length)), ' theses for held names, each with a '
            + 'falsifier and a review date, and not one claim has been judged — so every state is UNTESTED and '
            + 'undated. The grid fills as claims are marked confirmed or contradicted; a state older than '
            + THESIS_STALE_DAYS + ' days falls back out of it.')
    );
}
