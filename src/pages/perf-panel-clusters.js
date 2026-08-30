import React from 'react';
// ============================================================
// ATLAS Terminal — Cluster ranking panel (memo v2 close-out §5.3)
// ------------------------------------------------------------
// React 18, no JSX — repo convention.
//
// The cluster ranking, one level up from the position card. Shows the
// cluster-eligible positions grouped by risk cluster with their rankings, and
// beside them the count of positions with no close comparable, because that
// count is the complement of what is shown above and reading one without the
// other overstates the tier's coverage.
//
// NOTE ON NAMING. `perf-panels-analytics.js` carries a hand-kept `CLUSTERS`
// array — six labelled symbol buckets (AMD / Energy / Tech ex-AMD / ...) used
// by the rolling-attribution and factor panels. Those are hand-drawn and are
// NOT what this panel shows. This one groups by `universe_clusters`, the
// measured average-linkage partition, and the two must not be conflated: one
// is a taxonomy someone typed, the other is a correlation result that moves.
// ============================================================

import { loadClusterVerdicts, buildClusterView } from '../lib/clusterView.js';
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

var LABEL_COLOR = {
    leader:        T.green,
    holding_own:   T.text2,
    lagging:       T.amber,
    cut_candidate: T.red,
};

function pp(v, dp) {
    if (v == null || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(dp == null ? 2 : dp);
}
function pctOf(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
function signColor(v) {
    if (v == null) return T.text3;
    return v >= 0 ? T.green : T.red;
}

// ── small pieces ─────────────────────────────────────────────
function Stat(props) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, minWidth: 120 } },
        h('div', { style: { fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase', color: T.text2 } }, props.label),
        h('div', { style: { fontFamily: T.mono, fontSize: 24, fontWeight: 700, color: props.color || T.text1, lineHeight: 1.1 } }, props.value),
        props.sub && h('div', { style: { fontSize: 10, color: T.text3, maxWidth: 230, lineHeight: 1.35 } }, props.sub));
}

function TH(props) {
    return h('th', {
        style: {
            textAlign: props.right ? 'right' : 'left', padding: '6px 10px',
            fontSize: 9, letterSpacing: 1.2,
            // `raw` opts a header out of the uppercase transform. Needed for
            // the correlation column: CSS uppercase turns a lowercase rho
            // into a capital Rho, which is a different character and not the
            // notation for a mean correlation — it renders as a bare "P".
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

// ── one cluster ──────────────────────────────────────────────
function ClusterCard(props) {
    var c = props.cluster;
    var ranksRecorded = props.ranksRecorded;

    return h('div', {
        style: {
            background: T.cardBg, border: '1px solid ' + T.cardBorder,
            borderRadius: 10, padding: '12px 4px 4px', marginBottom: 14,
        }
    },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 12, padding: '0 12px 8px' } },
            h('div', { style: { fontFamily: T.mono, fontSize: 12.5, fontWeight: 700, color: T.teal, letterSpacing: 0.5 } },
                'RISK CLUSTER ' + (c.clusterId == null ? '—' : c.clusterId)),
            h('div', { style: { fontSize: 10.5, color: T.text2 } },
                c.heldCount + (c.heldCount === 1 ? ' held name' : ' held names')),
            c.heldCount === 1 && h('div', { style: { fontSize: 10, color: T.text3, fontStyle: 'italic' } },
                'the only name the book holds from this bucket')
        ),
        h('div', { style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', maxWidth: 1180, borderCollapse: 'collapse', minWidth: 720 } },
                h('thead', null, h('tr', null,
                    h(TH, null, 'Rank'),
                    h(TH, null, 'Symbol'),
                    h(TH, { right: true }, 'Own'),
                    h(TH, { right: true }, 'Peer median'),
                    h(TH, { right: true }, 'Selection'),
                    h(TH, null, 'Verdict'),
                    h(TH, { right: true, raw: true }, 'mean ρ'),
                    h(TH, null, 'Best peer')
                )),
                h('tbody', null, c.members.map(function (m) {
                    return h('tr', { key: m.symbol, style: { borderBottom: '1px solid rgba(255,255,255,0.03)' } },
                        h(TD, { color: m.rank == null ? T.text3 : T.text1 },
                            m.rank == null
                                ? (ranksRecorded ? '—' : 'not recorded')
                                : ('#' + m.rank + (m.field ? ' of ' + m.field : ''))),
                        h(TD, { style: { fontWeight: 700 } }, m.symbol),
                        h(TD, { right: true, color: signColor(m.ownPct) }, pctOf(m.ownPct)),
                        h(TD, { right: true, color: T.text2 }, pctOf(m.medianPct)),
                        h(TD, { right: true, color: signColor(m.selPp), style: { fontWeight: 700 } },
                            m.selPp == null ? '—' : pp(m.selPp) + 'pp'),
                        h(TD, { mono: false, color: LABEL_COLOR[m.label] || T.text3, style: { fontSize: 11 } },
                            m.label ? m.label.replace(/_/g, ' ') : '—'),
                        h(TD, { right: true, color: T.text2 }, m.avgRho == null ? '—' : m.avgRho.toFixed(3)),
                        h(TD, { color: T.text3, style: { fontSize: 10.5 } },
                            m.bestSymbol
                                ? m.bestSymbol + (m.regretPp == null ? '' : ' (' + pp(m.regretPp, 1) + 'pp)')
                                : '—')
                    );
                }))
            )
        )
    );
}

// ── the panel ────────────────────────────────────────────────
export function ClusterRankingPanel() {
    var _r = useState(null);
    var rows = _r[0], setRows = _r[1];
    var _l = useState(true);
    var loading = _l[0], setLoading = _l[1];

    useEffect(function () {
        var alive = true;
        function load() {
            loadClusterVerdicts(sb).then(function (data) {
                if (!alive) return;
                setRows(data);
                setLoading(false);
            });
        }
        load();
        window.addEventListener('atlas:refresh', load);
        return function () { alive = false; window.removeEventListener('atlas:refresh', load); };
    }, []);

    var view = useMemo(function () { return buildClusterView(rows || []); }, [rows]);

    if (loading) return h(Loading, null);
    return h(ClusterRankingView, { view: view });
}

/**
 * Pure render, split from the loader so the surface can be exercised against
 * a known night without a live database — which is how the two layout defects
 * in the §5.1 tile were found.
 */
export function ClusterRankingView(props) {
    var view = props.view;

    if (!view || !view.totalCount) {
        return h('div', { style: { padding: 28, color: T.text2, fontSize: 12.5, lineHeight: 1.6 } },
            h('div', { style: { fontWeight: 700, color: T.text1, marginBottom: 6 } }, 'No verdicts on file'),
            'The nightly verdict job writes ', h('code', { style: { fontFamily: T.mono } }, 'position_verdicts'),
            ' at 23:37 on weekdays. Nothing has been written yet, so there is no night to show — this is an ',
            'absent reading, not an empty book.');
    }

    var coveragePct = view.totalCount ? (view.eligibleCount / view.totalCount) * 100 : 0;

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
                label: 'Ranked against peers', color: T.teal,
                value: view.eligibleCount + ' of ' + view.totalCount,
                sub: 'Positions with at least 5 correlates at ρ ≥ 0.75 that actually priced — '
                     + coveragePct.toFixed(0) + '% of the book.',
            }),
            h(Stat, {
                label: 'No close comparable', color: T.amber,
                value: String(view.noComparableCount),
                sub: 'Best correlate inside the open book below ρ 0.65. A property of the book, '
                     + 'not a gap in the data — and the reason the rest of the book is the fallback basis.',
            }),
            h(Stat, {
                label: 'Risk clusters held', color: T.blue,
                value: String(view.clusters.length),
                sub: 'Buckets of the measured partition the book has any name in.',
            }),
            h('div', { style: { marginLeft: 'auto', textAlign: 'right', fontSize: 10, color: T.text3, fontFamily: T.mono, lineHeight: 1.6 } },
                h('div', null, 'as of ' + (view.asOf || '—')),
                h('div', null, view.logicVersion || '')
            )
        ),

        // The ranking column is only meaningful once the job has recorded it.
        // Saying so beats a column of dashes the reader has to interpret.
        !view.ranksRecorded && h('div', {
            style: {
                background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.28)',
                borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                fontSize: 11.5, color: T.amber, lineHeight: 1.5,
            }
        },
            h('strong', null, 'No ranking recorded for this night. '),
            h('span', { style: { color: T.text2 } },
                'position_verdicts is an append-only history and rank_in_cluster was not written before '
                + '2026-08-31, so these nights cannot be backfilled honestly — the peer counterfactuals were '
                + 'computed against the tape as it stood. Scores and peer medians below are unaffected.')
        ),

        view.clusters.map(function (c) {
            return h(ClusterCard, { key: String(c.clusterId), cluster: c, ranksRecorded: view.ranksRecorded });
        }),

        // ── the complement ───────────────────────────────────
        h('div', {
            style: {
                background: T.cardBg, border: '1px solid ' + T.cardBorder,
                borderRadius: 10, padding: '12px 4px 4px', marginTop: 22,
            }
        },
            h('div', { style: { padding: '0 12px 8px' } },
                h('div', { style: { fontFamily: T.mono, fontSize: 12.5, fontWeight: 700, color: T.amber, letterSpacing: 0.5 } },
                    'NO CLOSE COMPARABLE — ' + view.noComparableCount + ' POSITIONS'),
                h('div', { style: { fontSize: 10.5, color: T.text2, marginTop: 4, maxWidth: 760, lineHeight: 1.5 } },
                    'Nothing in the open book correlates above ρ 0.65 with these. They are graded against the '
                    + 'rest of the book instead. A name can appear here AND above: the peer set is drawn from the '
                    + 'whole correlation matrix — a substitute you could have bought — while this list asks how '
                    + 'differentiated the book you actually hold is. Opposite scoping, on purpose.')
            ),
            h('div', { style: { overflowX: 'auto' } },
                h('table', { style: { width: '100%', maxWidth: 900, borderCollapse: 'collapse', minWidth: 560 } },
                    h('thead', null, h('tr', null,
                        h(TH, null, 'Symbol'),
                        h(TH, null, 'Basis'),
                        h(TH, null, 'Closest name held'),
                        h(TH, { right: true, raw: true }, 'best ρ in book'),
                        h(TH, null, 'Verdict')
                    )),
                    h('tbody', null, view.noComparable.slice().sort(function (a, b) {
                        if (a.bestRho == null) return 1;
                        if (b.bestRho == null) return -1;
                        return b.bestRho - a.bestRho;
                    }).map(function (m) {
                        return h('tr', { key: m.symbol, style: { borderBottom: '1px solid rgba(255,255,255,0.03)' } },
                            h(TD, { style: { fontWeight: 700 } }, m.symbol),
                            h(TD, { mono: false, color: T.text2, style: { fontSize: 11 } },
                                m.status && m.status !== 'measured'
                                    ? m.status.replace(/_/g, ' ')
                                    : (m.peerBasis === 'cluster' ? 'cluster'
                                       : m.peerBasis === 'book' ? 'rest of book'
                                       : m.peerBasis || '—')),
                            h(TD, { color: T.text2 }, m.bestCorrelate || '—'),
                            h(TD, { right: true, color: m.bestRho == null ? T.text3 : T.text2 },
                                m.bestRho == null ? 'not measured' : m.bestRho.toFixed(3)),
                            h(TD, { mono: false, color: LABEL_COLOR[m.label] || T.text3, style: { fontSize: 11 } },
                                m.label ? m.label.replace(/_/g, ' ') : '—')
                        );
                    }))
                )
            )
        )
    );
}
