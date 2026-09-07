import React from 'react';
// ============================================================
// ATLAS Terminal — Performance, the three levels (spec §3–§5, handoff §3–§5)
// ------------------------------------------------------------
// React 18, no JSX — repo convention.
//
//   L1 BOOK      one number, then the composition that produced it
//   L2 BETS      segments, weight against risk, one reading each
//   L3 COUNTERS  the positions inside one segment, front and back
//
// The user reaches a card THROUGH a segment, never through a wall of 59.
//
// ## Palette
//
// Taken from the `:root` block of docs/mockups/L2_bets.html verbatim, not
// approximated. It is a different palette from the rest of Performance — the
// mockups are authoritative on layout and colour here, and the handoff says
// so explicitly.
//
// ## What this file must not do
//
// - Never average member excesses into a segment figure. `excessPp` on a
//   segment comes from `atlas_counterfactual_segment` and nothing else.
// - Never render a missing figure as 0 or blank. Every gate has words.
// - Never mix the two groupings on one screen, and always name the one shown.
// - Never generate an insight sentence at runtime; they come from
//   `segmentView.insightSentences` and are templates.
// ============================================================

import { sb } from './config.js';
import { Loading } from './components.js';
import {
    loadSegments, buildBetsView, latestAsOf,
    GROUPING_BET, GROUPING_THEME, DEFAULT_GROUPING, GROUPING_LABEL, GROUPING_HINT,
    stripColor, stripGlow,
} from '../lib/segmentView.js';
import { loadCounters, loadMembership, buildCounters, segmentReading, groupByVerdict } from '../lib/counterView.js';
import { loadTradingEffect, buildTradingView } from '../lib/tradingEffect.js';
import { loadBookBaseline, readBookBaseline } from '../lib/bookBaseline.js';

var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo;
var h = React.createElement;

// docs/mockups/L2_bets.html :root — verbatim.
var T = {
    bg: '#0a0d12', card: '#121821', card2: '#161d27', raise: '#1b2531',
    cyan: '#3ad6e0', amber: '#f5a623', green: '#43d68a', red: '#f2645a', violet: '#8b7ff0',
    line: 'rgba(255,255,255,.07)', lineCy: 'rgba(58,214,224,.22)',
    t1: '#e6edf4', t2: '#8fa1b3', t3: '#5b6b7c',
    display: "'Syne', sans-serif",
    body: "'DM Sans', sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
};

var VERDICT_COLOR = {
    leader: T.green, holding_own: T.t2, lagging: T.amber,
    cut_candidate: T.red, unlabelled: T.t3,
};
var VERDICT_TEXT = {
    leader: 'Leader', holding_own: 'Holding own', lagging: 'Lagging',
    cut_candidate: 'Cut candidate', unlabelled: 'Unlabelled',
};

function pct1(x) { return x == null ? '—' : (x * 100).toFixed(1) + '%'; }
function ppStr(x, dp) {
    if (x == null) return '—';
    return (x >= 0 ? '+' : '') + x.toFixed(dp == null ? 2 : dp) + 'pp';
}
function usd(x) {
    if (x == null) return '—';
    var s = Math.abs(x) >= 1000 ? Math.round(x).toLocaleString() : Math.abs(x).toFixed(0);
    return (x < 0 ? '−$' : '$') + s.replace('-', '');
}
function toneFor(x) { return x == null ? T.t3 : (x > 0 ? T.green : (x < 0 ? T.red : T.t2)); }

// ── shared bits ───────────────────────────────────────────────

function Crumb(parts) {
    return h('p', { style: {
        fontFamily: T.mono, fontSize: 11, letterSpacing: '.09em', color: T.t3,
        textTransform: 'uppercase', margin: '0 0 20px',
    } }, parts.map(function (p, i) {
        return h(React.Fragment, { key: i },
            i > 0 ? h('span', { style: { opacity: .5 } }, '  ›  ') : null,
            p.onClick
                ? h('span', { onClick: p.onClick, style: { cursor: 'pointer', color: T.t3 } }, p.text)
                : h('b', { style: { color: T.cyan, fontWeight: 500 } }, p.text));
    }));
}

/**
 * The two-bar device — the point of level 2.
 *
 * Weight above, risk below, on an IDENTICAL 0–100% scale so the comparison is
 * the reading. `minWidth: 2` keeps a 0.1% share visible; the bond sleeve is
 * 0.12% of risk and must not vanish, because "invisible" and "zero" would
 * look the same and mean different things. Only the risk fill glows — that
 * asymmetry is deliberate.
 */
function TwoBar(weight, risk, riskColor, riskGlow) {
    // `glow` is the shadow colour, or null for no glow — the weight bar never
    // glows and the risk bar always does. That asymmetry is the reading.
    var row = function (label, value, color, glow, hot) {
        return h('div', { style: { display: 'flex', alignItems: 'center', gap: 11, marginBottom: 5 } },
            h('span', { style: {
                fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.09em', color: T.t3,
                textTransform: 'uppercase', width: 48,
            } }, label),
            h('div', { style: { flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.055)' } },
                h('div', { style: {
                    height: 5, borderRadius: 3, minWidth: 2,
                    width: Math.max(0, Math.min(1, value || 0)) * 100 + '%',
                    background: color,
                    boxShadow: glow ? '0 0 12px ' + glow : 'none',
                } })),
            h('span', { style: {
                fontFamily: T.mono, fontSize: 11, width: 44, textAlign: 'right',
                color: hot ? T.t1 : T.t2,
            } }, pct1(value)));
    };
    return h('div', null,
        row('weight', weight, 'rgba(255,255,255,.3)', null, false),
        row('risk', risk, riskColor || T.cyan, riskGlow || 'rgba(58,214,224,.4)', true));
}

function Insights(list) {
    return (list || []).map(function (ins, i) {
        // One <em> per sentence at most, on the clause carrying the finding.
        var parts = ins.emphasis && ins.text.indexOf(ins.emphasis) >= 0
            ? ins.text.split(ins.emphasis)
            : null;
        return h('p', { key: i, style: {
            fontSize: 13.5, lineHeight: 1.68, color: T.t2, margin: '11px 0 0', maxWidth: '74ch',
        } }, parts
            ? [parts[0], h('em', { key: 'e', style: { color: T.t1, fontStyle: 'normal' } }, ins.emphasis), parts.slice(1).join(ins.emphasis)]
            : ins.text);
    });
}

// The three levels are exported so each can be rendered on its own against
// real rows in `perf-panel-bets.test.mjs`. The checklist says every item is
// verifiable from a screenshot; this is that, run in CI instead of by eye.
//
// ── Level 2 — Bets ────────────────────────────────────────────

function RiskStrip(view) {
    return h('div', null,
        h('div', { style: { display: 'flex', height: 9, borderRadius: 5, overflow: 'hidden', gap: 2, marginBottom: 8 } },
            view.strip.map(function (s, i) {
                return h('div', { key: s.id, title: s.label + ' · ' + pct1(s.share), style: {
                    height: 9, width: Math.max(0.15, (s.share || 0) * 100) + '%',
                    background: stripColor(i, view.strip.length),
                } });
            })),
        h('div', { style: {
            display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 10,
            letterSpacing: '.07em', color: T.t3, textTransform: 'uppercase', marginBottom: 30,
        } },
            h('span', null, 'risk share, descending'),
            h('span', null, view.segmentCount + ' segments')));
}

function SegmentRow(seg, onOpen, riskColor, riskGlow) {
    var kindCluster = seg.kind === 'cluster';
    return h('div', {
        key: seg.segmentId,
        onClick: function () { onOpen(seg); },
        style: { padding: '18px 0', borderTop: '1px solid ' + T.line, cursor: 'pointer' },
        onMouseEnter: function (e) {
            e.currentTarget.style.background = 'linear-gradient(90deg,rgba(58,214,224,.045),transparent 55%)';
        },
        onMouseLeave: function (e) { e.currentTarget.style.background = 'transparent'; },
    },
        h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginBottom: 12 } },
            h('div', null,
                h('span', { style: { fontSize: 16.5, fontWeight: 500, color: T.t1 } }, seg.label),
                h('span', { style: {
                    fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase',
                    padding: '3px 8px', borderRadius: 4, marginLeft: 11,
                    color: kindCluster ? T.cyan : T.t3,
                    background: kindCluster ? 'rgba(58,214,224,.1)' : 'rgba(255,255,255,.045)',
                    border: '1px solid ' + (kindCluster ? T.lineCy : T.line),
                } }, (kindCluster ? seg.label.replace(/^Cluster /, 'Cluster ') : (seg.kind === 'theme' ? 'Theme' : 'No segment')) + ' · ' + seg.memberCount)),
            // A segment whose counterfactual did not resolve shows the reason
            // where the number would be. Never a dash on its own.
            seg.excessPp != null
                ? h('span', { style: { fontFamily: T.mono, fontSize: 17, fontWeight: 500, color: toneFor(seg.excessPp) } },
                    ppStr(seg.excessPp))
                : h('span', { style: { fontFamily: T.mono, fontSize: 10.5, color: T.amber, textAlign: 'right', maxWidth: 220 } },
                    (seg.cfReason || seg.cfStatus || 'not measurable'))),
        TwoBar(seg.weightShare, seg.riskShare, riskColor, riskGlow),
        Insights(seg.insights),
        seg.withheld > 0
            ? h('p', { style: { fontFamily: T.mono, fontSize: 10, color: T.t3, margin: '8px 0 0' } },
                seg.withheld + ' of ' + seg.memberCount + ' withheld from the measure — ' +
                (seg.withheldSymbols || []).join(', '))
            : null);
}

export function BetsLevel(view, grouping, setGrouping, onOpen) {
    if (!view) {
        return h('div', { style: { padding: 40, textAlign: 'center', color: T.t2, fontSize: 13 } },
            'No segment history for this grouping yet. ',
            h('span', { style: { fontFamily: T.mono, fontSize: 11, color: T.t3 } },
                'atlas_write_segment_verdicts runs nightly at 23:38 UTC.'));
    }
    return h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 6 } },
            h('h1', { style: { fontFamily: T.display, fontWeight: 600, fontSize: 30, margin: 0, letterSpacing: '-.015em', color: T.t1 } },
                Math.min(view.full.length, view.segmentCount) + ' bets ',
                h('span', { style: { color: T.t3, fontWeight: 500 } },
                    'of ' + view.segmentCount + ' · ' + view.positionCount + ' positions')),
            h('div', { style: { textAlign: 'right' } },
                h('span', { style: { display: 'block', fontFamily: T.mono, fontSize: 10, letterSpacing: '.08em', color: T.t3, textTransform: 'uppercase', marginBottom: 3 } },
                    'effective bets'),
                h('b', { style: { fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: T.cyan } },
                    view.effectiveBets == null ? '—' : view.effectiveBets.toFixed(1)))),
        h('p', { style: { fontSize: 14, lineHeight: 1.65, color: T.t2, maxWidth: '64ch', margin: '0 0 6px' } },
            view.groupingHint + '. Bars are shown against the whole book — weight above, risk below.'),
        // Effective bets is a property of the grouping. Saying so stops the
        // figure being read as a fact about the book that changed under a
        // relabelling.
        h('p', { style: { fontFamily: T.mono, fontSize: 10, color: T.t3, letterSpacing: '.06em', textTransform: 'uppercase', margin: '0 0 20px' } },
            'effective bets measured on this grouping · ' + view.groupingLabel + ' · as of ' + (view.asOf || '—')),

        h('div', { style: { display: 'inline-flex', padding: 3, borderRadius: 8, background: T.card, border: '1px solid ' + T.line, marginBottom: 20 } },
            [GROUPING_THEME, GROUPING_BET].map(function (g) {
                var sel = grouping === g;
                return h('button', {
                    key: g,
                    onClick: function () { setGrouping(g); },
                    style: {
                        fontFamily: T.mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase',
                        padding: '7px 15px', borderRadius: 6, border: 0, cursor: 'pointer',
                        background: sel ? 'rgba(58,214,224,.13)' : 'transparent',
                        color: sel ? T.cyan : T.t3,
                        boxShadow: sel ? 'inset 0 0 0 1px ' + T.lineCy : 'none',
                    },
                }, GROUPING_LABEL[g]);
            })),

        RiskStrip(view),
        // Each row's risk fill takes the colour it has in the strip above, by
        // rank — so a reader can carry a segment from the strip to its row
        // without re-reading the label.
        view.full.map(function (s, i) { return SegmentRow(s, onOpen, stripColor(i, view.strip.length), stripGlow(i)); }),
        view.tailSummary ? TailRow(view) : null);
}

function TailRow(view) {
    var ts = view.tailSummary;
    return h('div', { style: {
        padding: '18px 0', borderTop: '1px solid ' + T.line, borderBottom: '1px solid ' + T.line,
        opacity: .82,
    } },
        h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 } },
            h('span', { style: { fontSize: 16.5, fontWeight: 500, color: T.t2 } },
                ts.count + ' small bets'),
            h('span', { style: { fontFamily: T.mono, fontSize: 12, color: T.t2 } },
                pct1(ts.weightShare) + ' weight · ' + pct1(ts.riskShare) + ' risk')),
        h('p', { style: { fontSize: 13.5, lineHeight: 1.68, color: T.t2, margin: '6px 0 0', maxWidth: '74ch' } },
            pct1(ts.weightShare) + ' of weight, ' + pct1(ts.riskShare) + ' of risk, spread across ' +
            ts.count + ' segments — ',
            h('em', { style: { color: T.t1, fontStyle: 'normal' } },
                ts.singletons + ' of them single names'),
            '. The strip above still shows every one of them.'));
}

// ── Level 3 — Counters ────────────────────────────────────────

function Metric(m) {
    return h('div', { key: m.key },
        h('span', { style: { fontFamily: T.mono, fontSize: 10, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase' } }, m.label),
        m.available
            ? h('b', { style: { display: 'block', fontFamily: T.mono, fontSize: 14, fontWeight: 500, marginTop: 3, color: m.key === 'selection' ? toneFor(m.value) : T.t1 } },
                (m.unit === 'pp' ? ppStr(m.value, 1) : (m.unit === '%' ? (m.value == null ? '—' : m.value.toFixed(1) + '%') : m.value.toFixed(2))))
            // Never blank, never zero. The words are the point.
            : h('b', { title: m.absentReason, style: { display: 'block', fontFamily: T.mono, fontSize: 10, fontWeight: 400, marginTop: 5, color: T.t3, lineHeight: 1.3 } },
                m.absentShort || 'not measured'));
}

function Tile(card, flipped, onFlip) {
    var slot = card.slot, back = card.back;
    var faceBase = {
        position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
        borderRadius: 14, padding: '17px 18px', overflow: 'hidden',
        background: 'linear-gradient(168deg,' + T.card2 + ' 0%,' + T.card + ' 62%)',
        border: '1px solid ' + T.line, borderTop: '1px solid ' + T.lineCy,
    };
    var basisText = slot.basis === 'cluster' ? 'Tier 1 · Cluster'
                  : slot.basis === 'book' ? 'Tier 2 · Rest of book' : 'Not measured';
    var basisColor = slot.basis === 'cluster' ? T.cyan : (slot.basis === 'book' ? T.violet : T.t3);
    var vColor = VERDICT_COLOR[card.label || 'unlabelled'] || T.t3;

    return h('div', {
        key: card.symbol,
        onClick: onFlip,
        style: { perspective: 1600, height: 316, cursor: 'pointer' },
    },
        h('div', { style: {
            position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d',
            transition: 'transform .58s cubic-bezier(.4,0,.2,1)',
            transform: flipped ? 'rotateY(180deg)' : 'none',
        } },
            // front
            h('div', { style: faceBase },
                h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 } },
                    h('span', { style: { fontFamily: T.mono, fontSize: 19, fontWeight: 600, letterSpacing: '.02em', color: T.t1 } }, card.symbol),
                    card.label
                        ? h('span', { style: {
                            fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase',
                            padding: '3px 8px', borderRadius: 4, color: vColor,
                            background: 'rgba(255,255,255,.04)', border: '1px solid ' + T.line,
                        } }, VERDICT_TEXT[card.label] || card.label)
                        : null),
                h('p', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.13em', color: basisColor, textTransform: 'uppercase', margin: '0 0 20px', opacity: .85 } },
                    basisText),
                slot.basis === 'none'
                    ? h('div', null,
                        h('p', { style: { fontFamily: T.mono, fontSize: 10, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase', margin: 0 } }, 'why not'),
                        h('p', { style: { fontSize: 14, lineHeight: 1.55, color: T.amber, margin: '8px 0 0' } }, slot.reason),
                        slot.staleDays != null
                            ? h('p', { style: { fontFamily: T.mono, fontSize: 11, color: T.t3, margin: '10px 0 0' } }, slot.staleDays + ' days since the last bar')
                            : null)
                    : h('div', null,
                        h('p', { style: { fontFamily: T.mono, fontSize: 10, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase', margin: 0 } }, slot.label),
                        h('p', { style: { fontFamily: T.mono, fontSize: 33, fontWeight: 500, letterSpacing: '-.02em', margin: '4px 0 14px', color: toneFor(slot.edge) } },
                            slot.edge == null ? '—' : (slot.edge >= 0 ? '+' : '') + slot.edge.toFixed(1),
                            h('span', { style: { fontSize: 20 } }, 'pp')),
                        h('div', { style: { height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden' } },
                            h('div', { style: {
                                height: 4, borderRadius: 2,
                                width: Math.min(100, Math.abs(slot.edge || 0) / 2) + '%',
                                background: toneFor(slot.edge),
                                boxShadow: '0 0 11px ' + (slot.edge >= 0 ? 'rgba(67,214,138,.45)' : 'rgba(242,100,90,.45)'),
                            } })),
                        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 11, color: T.t2, marginTop: 12 } },
                            h('span', null, 'own ' + (slot.own == null ? '—' : slot.own.toFixed(2) + '%')),
                            h('span', null, (slot.referenceLabel || 'peer') + ' ' + (slot.reference == null ? '—' : slot.reference.toFixed(2) + '%'))),
                        slot.rank != null
                            ? h('p', { style: { fontFamily: T.mono, fontSize: 11.5, margin: '11px 0 0', color: T.t1 } },
                                'rank #' + slot.rank + (slot.field ? ' of ' + slot.field : ''))
                            : (slot.detail ? h('p', { style: { fontFamily: T.mono, fontSize: 10.5, color: T.t3, margin: '11px 0 0' } }, slot.detail) : null),
                        slot.bestSymbol
                            ? h('p', { style: { fontFamily: T.mono, fontSize: 10.5, color: T.t3, margin: '3px 0 0' } },
                                'best peer ' + slot.bestSymbol + (slot.regret == null ? '' : ' · ' + Math.abs(slot.regret).toFixed(1) + 'pp ahead'))
                            : null),
                h('div', { style: {
                    position: 'absolute', left: 18, right: 18, bottom: 14, display: 'flex',
                    justifyContent: 'space-between', fontFamily: T.mono, fontSize: 10.5, color: T.t3,
                    borderTop: '1px solid ' + T.line, paddingTop: 11,
                } },
                    h('span', null, (card.daysHeld == null ? '—' : card.daysHeld + 'd held')),
                    h('span', null, usd(card.capital)))),
            // back
            h('div', { style: Object.assign({}, faceBase, { transform: 'rotateY(180deg)' }) },
                h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 } },
                    h('span', { style: { fontFamily: T.mono, fontSize: 16, fontWeight: 600, color: T.t1 } }, card.symbol),
                    h('span', { style: { fontFamily: T.mono, fontSize: 10.5, color: T.t3 } }, back.peerNote || '')),
                back.barsSuppressed
                    ? h('p', { style: { fontSize: 13, lineHeight: 1.6, color: T.t2, margin: '0 0 12px' } },
                        back.barsSuppressedReason)
                    : h('div', null,
                        h('p', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase', margin: '0 0 9px' } },
                            'Your ' + usd(back.capital) + ', on the same dates'),
                        back.bars.map(function (b) {
                            var you = b.tone === 'you';
                            return h('div', { key: b.key, style: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 7 } },
                                h('span', { style: { fontSize: 11, width: 88, color: you ? T.t1 : T.t2, fontWeight: you ? 500 : 400 } }, b.name),
                                h('div', { style: { flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)' } },
                                    h('div', { style: {
                                        height: 4, borderRadius: 2, minWidth: 2, width: (b.frac * 100) + '%',
                                        background: you ? T.green : (b.tone === 'mid' ? 'rgba(255,255,255,.36)' : 'rgba(255,255,255,.22)'),
                                        boxShadow: you ? '0 0 11px rgba(67,214,138,.45)' : 'none',
                                    } })),
                                h('span', { style: { fontFamily: T.mono, fontSize: 10.5, width: 60, textAlign: 'right', color: you ? T.t1 : T.t2, fontWeight: you ? 500 : 400 } },
                                    (b.value >= 0 ? '+' : '') + b.value.toFixed(1) + '%'));
                        })),
                h('div', { style: {
                    display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, margin: '13px 0',
                    padding: '11px 0', borderTop: '1px solid ' + T.line, borderBottom: '1px solid ' + T.line,
                } }, back.metrics.map(Metric)),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 13 } },
                    h('div', null,
                        h('span', { style: { fontFamily: T.mono, fontSize: 10, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase' } }, 'Thesis'),
                        h('b', { style: { display: 'block', fontSize: 12, fontWeight: 400, color: T.t2, marginTop: 3 } },
                            back.thesis + (back.thesisRecorded ? '' : ' · none on file'))),
                    h('div', { style: { textAlign: 'right' } },
                        h('span', { style: { fontFamily: T.mono, fontSize: 10, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase' } }, 'Conviction at entry'),
                        h('b', { style: { display: 'block', fontFamily: T.mono, fontSize: 12, fontWeight: 400, color: T.t2, marginTop: 3 } }, back.conviction))),
                back.action
                    ? h('button', {
                        onClick: function (e) { e.stopPropagation(); },
                        style: {
                            width: '100%', padding: 9, borderRadius: 7, cursor: 'pointer',
                            background: 'rgba(58,214,224,.09)', border: '1px solid ' + T.lineCy, color: T.cyan,
                            fontFamily: T.mono, fontSize: 10.5, letterSpacing: '.09em', textTransform: 'uppercase',
                        },
                    }, back.action)
                    : null)));
}

function tileGrid(tiles, flipped, setFlipped) {
    return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(258px,1fr))', gap: 16 } },
        tiles.map(function (c) {
            return Tile(c, !!flipped[c.symbol], function () {
                setFlipped(function (prev) {
                    var next = Object.assign({}, prev);
                    next[c.symbol] = !next[c.symbol];
                    return next;
                });
            });
        }));
}

/**
 * §6, edge case 1: Unpaired is sub-grouped by verdict, not rendered as one
 * block. It is 17 positions and 27% of the book by weight under BY THEME —
 * as a single wall of tiles it reproduces exactly the problem the three
 * levels exist to remove. Every other segment stays a single grid; banding a
 * two-name cluster would be noise.
 */
function renderTiles(segment, tiles, flipped, setFlipped) {
    if (segment.kind !== 'unpaired') return tileGrid(tiles, flipped, setFlipped);
    var bands = groupByVerdict(tiles);
    if (bands.length <= 1) return tileGrid(tiles, flipped, setFlipped);
    return h('div', null, bands.map(function (b) {
        return h('div', { key: b.label, style: { marginBottom: 26 } },
            h('div', { style: {
                display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12,
                paddingBottom: 7, borderBottom: '1px solid ' + T.line,
            } },
                h('span', { style: {
                    fontFamily: T.mono, fontSize: 10, letterSpacing: '.11em', textTransform: 'uppercase',
                    color: VERDICT_COLOR[b.label] || T.t3,
                } }, VERDICT_TEXT[b.label] || b.label),
                h('span', { style: { fontFamily: T.mono, fontSize: 10, color: T.t3 } }, b.count)),
            tileGrid(b.tiles, flipped, setFlipped));
    }));
}

export function CountersLevel(segment, tiles, missing, reading, flipped, setFlipped) {
    return h('div', null,
        h('div', { style: {
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24,
            paddingBottom: 16, borderBottom: '1px solid ' + T.line, marginBottom: 14,
        } },
            h('h1', { style: { fontFamily: T.display, fontWeight: 600, fontSize: 30, margin: 0, letterSpacing: '-.015em', color: T.t1 } },
                segment.label),
            h('div', { style: { display: 'flex', gap: 26 } },
                [['weight', pct1(segment.weightShare), T.t1],
                 ['risk', pct1(segment.riskShare), T.cyan],
                 ['vs book', segment.excessPp == null ? '—' : ppStr(segment.excessPp, 1), toneFor(segment.excessPp)]
                ].map(function (x) {
                    return h('div', { key: x[0], style: { textAlign: 'right' } },
                        h('span', { style: { display: 'block', fontFamily: T.mono, fontSize: 10, letterSpacing: '.08em', color: T.t3, textTransform: 'uppercase', marginBottom: 3 } }, x[0]),
                        h('b', { style: { fontFamily: T.mono, fontSize: 19, fontWeight: 500, color: x[2] } }, x[1]));
                }))),
        h('p', { style: { fontSize: 14.5, lineHeight: 1.65, color: T.t2, maxWidth: '66ch', margin: '0 0 6px' } },
            reading.emphasis && reading.text.indexOf(reading.emphasis) >= 0
                ? [reading.text.split(reading.emphasis)[0],
                   h('em', { key: 'e', style: { color: T.t1, fontStyle: 'normal' } }, reading.emphasis)]
                : reading.text),
        // The segment excess is a counterfactual over the segment's own pooled
        // flows, not an average of the tiles below — which sit on two
        // different tiers and could not honestly be averaged.
        h('p', { style: { fontFamily: T.mono, fontSize: 10, color: T.t3, letterSpacing: '.06em', textTransform: 'uppercase', margin: '0 0 4px' } },
            'vs book is this segment’s own flows run into the book without it'),
        h('p', { style: { fontFamily: T.mono, fontSize: 10.5, letterSpacing: '.07em', color: T.t3, textTransform: 'uppercase', margin: '0 0 22px' } },
            'Tap a tile to turn it over'),
        missing && missing.length
            ? h('p', { style: { fontSize: 12.5, color: T.amber, margin: '0 0 16px' } },
                missing.length + ' member' + (missing.length === 1 ? '' : 's') +
                ' with no verdict row tonight: ' + missing.join(', '))
            : null,
        renderTiles(segment, tiles, flipped, setFlipped));
}

// ── Level 1 — Book ────────────────────────────────────────────

function Tile1(label, value, sub, color) {
    return h('div', { key: label, style: {
        padding: '14px 16px', borderRadius: 10, background: T.card, border: '1px solid ' + T.line,
    } },
        h('span', { style: { display: 'block', fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase', marginBottom: 6 } }, label),
        h('b', { style: { fontFamily: T.mono, fontSize: 20, fontWeight: 500, color: color || T.t1 } }, value),
        sub ? h('span', { style: { display: 'block', fontSize: 11, color: T.t3, marginTop: 4 } }, sub) : null);
}

export function BookLevel(book, view, onSeeAll, onFilter) {
    var eff = book && book.tradingEffectPp;
    return h('div', null,
        h('div', { style: { marginBottom: 26 } },
            h('span', { style: { display: 'block', fontFamily: T.mono, fontSize: 10, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase', marginBottom: 8 } },
                'trading effect · do-nothing baseline'),
            h('div', { style: { fontFamily: T.display, fontWeight: 600, fontSize: 48, letterSpacing: '-.02em', color: toneFor(eff) } },
                eff == null ? '—' : ppStr(eff)),
            h('p', { style: { fontSize: 14, lineHeight: 1.65, color: T.t2, maxWidth: '64ch', margin: '10px 0 0' } },
                book && book.traded != null && book.frozen != null
                    ? ['The traded book returned ', h('em', { key: 'a', style: { color: T.t1, fontStyle: 'normal' } }, book.traded.toFixed(2) + '%'),
                       ' against ', h('em', { key: 'b', style: { color: T.t1, fontStyle: 'normal' } }, book.frozen.toFixed(2) + '%'),
                       ' for the same positions held frozen at their opening weights.']
                    : ((book && book.reason) || 'The do-nothing baseline has not been written for this night.')),
            // Two histories, two dates. Said out loud whenever they differ.
            book && view && book.asOf && view.asOf && book.asOf !== view.asOf
                ? h('p', { style: { fontFamily: T.mono, fontSize: 10, color: T.amber, margin: '8px 0 0', letterSpacing: '.05em' } },
                    'HEADLINE AS OF ' + book.asOf + ' · COMPOSITION BELOW AS OF ' + view.asOf +
                    ' — the two nightly jobs did not land on the same night')
                : (book && book.status === 'stale'
                    ? h('p', { style: { fontFamily: T.mono, fontSize: 10, color: T.amber, margin: '8px 0 0' } },
                        String(book.reason || '').toUpperCase())
                    : null)),

        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 26 } },
            Tile1('book MWR', book && book.traded != null ? book.traded.toFixed(2) + '%' : '—', 'money-weighted'),
            Tile1('vs frozen', eff == null ? '—' : ppStr(eff), 'traded minus do-nothing', toneFor(eff)),
            Tile1('effective bets', view && view.effectiveBets != null ? view.effectiveBets.toFixed(1) : '—',
                  view ? 'on ' + view.groupingLabel.toLowerCase() : null),
            Tile1('measured / total', view ? (view.positionCount - view.withheldTotal) + ' / ' + view.positionCount : '—',
                  view && view.withheldTotal ? view.withheldTotal + ' withheld by the engine' : 'all measurable')),

        // §3 item 3. Stubbed until the Phase 1 queries land — rendered in a
        // pending state rather than omitted, so its absence is visible.
        h('div', { style: { padding: '16px 18px', borderRadius: 10, background: T.card, border: '1px dashed ' + T.line, marginBottom: 26 } },
            h('span', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase' } }, 'process · pending'),
            h('p', { style: { fontSize: 13, lineHeight: 1.6, color: T.t3, margin: '8px 0 0', maxWidth: '60ch' } },
                'Hit rate, win:loss and holding-period skew land with the Phase 1 queries. The panel is here so its absence is visible rather than silent.')),

        view ? h('div', { style: { marginBottom: 26 } },
            h('span', { style: { display: 'block', fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase', marginBottom: 8 } },
                'verdicts across the book'),
            VerdictBar(view, onFilter)) : null,

        view ? h('div', null,
            h('span', { style: { display: 'block', fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.09em', color: T.t3, textTransform: 'uppercase', marginBottom: 10 } },
                'largest bets by risk'),
            view.full.slice(0, 3).map(function (s) {
                return h('div', { key: s.segmentId, onClick: function () { onSeeAll(s); }, style: {
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '11px 0', borderTop: '1px solid ' + T.line, cursor: 'pointer',
                } },
                    h('span', { style: { fontSize: 14, color: T.t1 } }, s.label),
                    h('span', { style: { fontFamily: T.mono, fontSize: 12, color: T.t2 } },
                        pct1(s.weightShare) + ' w · ' + pct1(s.riskShare) + ' r · ' +
                        (s.excessPp == null ? '—' : ppStr(s.excessPp, 1))));
            }),
            h('p', { onClick: function () { onSeeAll(null); }, style: {
                fontFamily: T.mono, fontSize: 10.5, letterSpacing: '.09em', color: T.cyan,
                textTransform: 'uppercase', marginTop: 14, cursor: 'pointer',
            } }, 'see all bets →')) : null);
}

function VerdictBar(view, onFilter) {
    var totals = {};
    view.segments.forEach(function (s) {
        var c = s.verdictCounts || {};
        Object.keys(c).forEach(function (k) { totals[k] = (totals[k] || 0) + Number(c[k] || 0); });
    });
    var order = ['leader', 'holding_own', 'lagging', 'cut_candidate', 'unlabelled'];
    var sum = order.reduce(function (t, k) { return t + (totals[k] || 0); }, 0);
    if (!sum) return h('p', { style: { fontSize: 12, color: T.t3 } }, 'No verdict labels for this night.');
    return h('div', null,
        h('div', { style: { display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 } },
            order.filter(function (k) { return totals[k]; }).map(function (k) {
                return h('div', {
                    key: k, title: VERDICT_TEXT[k] + ' · ' + totals[k],
                    onClick: function () { onFilter(k); },
                    style: { height: 10, width: (totals[k] / sum * 100) + '%', background: VERDICT_COLOR[k], cursor: 'pointer' },
                });
            })),
        h('div', { style: { display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' } },
            order.filter(function (k) { return totals[k]; }).map(function (k) {
                return h('span', { key: k, style: { fontFamily: T.mono, fontSize: 10, color: T.t3 } },
                    h('span', { style: { color: VERDICT_COLOR[k] } }, '■ '), VERDICT_TEXT[k] + ' ' + totals[k]);
            })),
        h('p', { style: { fontFamily: T.mono, fontSize: 9.5, color: T.t3, marginTop: 6 } },
            sum + ' of ' + view.positionCount + ' positions labelled'));
}

// ── the panel ─────────────────────────────────────────────────

export default function PerfBetsPanel() {
    var _l = useState('book'), level = _l[0], setLevel = _l[1];
    var _g = useState(DEFAULT_GROUPING), grouping = _g[0], setGrouping = _g[1];
    var _s = useState(null), openSegment = _s[0], setOpenSegment = _s[1];
    var _f = useState({}), flipped = _f[0], setFlipped = _f[1];
    var _vf = useState(null), verdictFilter = _vf[0], setVerdictFilter = _vf[1];

    var _d = useState(null), data = _d[0], setData = _d[1];
    var _ld = useState(true), loading = _ld[0], setLoading = _ld[1];

    useEffect(function () {
        var alive = true;
        (async function () {
            var segs = await loadSegments(sb);
            var asOf = latestAsOf(segs);
            var res = await Promise.all([
                loadCounters(sb, asOf),
                loadMembership(sb),
                loadTradingEffect(sb),
                loadBookBaseline(sb),
            ]);
            if (!alive) return;
            setData({
                segments: segs, asOf: asOf, counters: res[0], membership: res[1],
                trading: res[2], baseline: res[3],
            });
            setLoading(false);
        })();
        return function () { alive = false; };
    }, []);

    var view = useMemo(function () {
        if (!data || !data.segments) return null;
        return buildBetsView(data.segments, grouping);
    }, [data, grouping]);

    // The hero reads `book_risk_daily`, a nightly history; the segment rows
    // read `segment_verdicts`, a different nightly history. On an ordinary day
    // they describe the same night. The day one job misses, they do not, and a
    // headline one session ahead of the composition beneath it is the
    // mixed-basis failure in a new place — so both dates are published and
    // never reconciled.
    var book = useMemo(function () {
        if (!data) return null;
        var b = data.baseline ? readBookBaseline(data.baseline) : null;
        if (!b) return null;
        return {
            traded:          b.tradedPct,
            frozen:          b.frozenPct,
            tradingEffectPp: b.effectPp,
            status:          b.status,
            reason:          b.reason,
            asOf:            b.asOf,
        };
    }, [data]);

    // Which positions were bought once and never traded — the structural test
    // the engine already makes, not a magnitude threshold applied here.
    var singleTx = useMemo(function () {
        var map = {};
        (data && data.trading ? data.trading : []).forEach(function (r) {
            if (r && r.trade_kind === 'untouched') map[r.symbol] = true;
        });
        return map;
    }, [data]);

    var counters = useMemo(function () {
        if (!data || !openSegment) return null;
        var syms = (data.membership || [])
            .filter(function (m) { return m.grouping === grouping && m.segment_id === openSegment.segmentId; })
            .map(function (m) { return m.symbol; });
        var built = buildCounters(data.counters || [], syms, { singleTransaction: singleTx });
        var tiles = verdictFilter
            ? built.tiles.filter(function (t) { return (t.label || 'unlabelled') === verdictFilter; })
            : built.tiles;
        return { tiles: tiles, missing: built.missing, all: built.tiles };
    }, [data, openSegment, grouping, singleTx, verdictFilter]);

    if (loading) return h(Loading, { text: 'Reading the segment history…' });

    var openBets = function (seg) {
        if (seg) { setOpenSegment(seg); setLevel('counters'); }
        else { setLevel('bets'); }
    };

    var crumb = level === 'book'
        ? [{ text: 'Book' }]
        : level === 'bets'
            ? [{ text: 'Book', onClick: function () { setLevel('book'); } }, { text: 'Bets' }]
            : [{ text: 'Book', onClick: function () { setLevel('book'); } },
               { text: 'Bets', onClick: function () { setLevel('bets'); } },
               { text: openSegment ? openSegment.label : '—' }];

    return h('div', { style: { fontFamily: T.body, color: T.t1, maxWidth: 1180, margin: '0 auto' } },
        Crumb(crumb),
        verdictFilter
            ? h('p', { style: { fontFamily: T.mono, fontSize: 10.5, color: T.cyan, margin: '-10px 0 16px', cursor: 'pointer' },
                       onClick: function () { setVerdictFilter(null); } },
                'FILTERED TO ' + (VERDICT_TEXT[verdictFilter] || verdictFilter).toUpperCase() + ' · CLEAR ×')
            : null,
        level === 'book'
            ? BookLevel(book, view, function (seg) { openBets(seg); },
                        function (k) { setVerdictFilter(k); setLevel('bets'); })
            : level === 'bets'
                ? BetsLevel(view, grouping, function (g) { setGrouping(g); setOpenSegment(null); }, openBets)
                : (openSegment && counters
                    ? CountersLevel(openSegment, counters.tiles, counters.missing,
                                    segmentReading(counters.all, openSegment), flipped, setFlipped)
                    : h('p', { style: { color: T.t2 } }, 'Select a bet.')));
}
