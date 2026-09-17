// ============================================================
// ATLAS Nexus — the index wall (G-5)
// ------------------------------------------------------------
// The Markets module shows four major indices as four TradingView
// iframes; the board shows ONE of the same four at a time behind symbol
// chips. Neither lets you see them together, which is the only way the
// question "which one is carrying this tape" gets answered.
//
// The wall takes `board.indices` — ALREADY LOADED for the board, so this
// adds no feed and no request — and gives it two faces:
//
//   SEPARATE  small multiples at native price. What each index did.
//   COMPARED  all four rebased to 100 on a common session, one chart.
//             Which index did better.
//
// Both faces are the same four series answering the same question
// differently, which is the bar NexusFaceToggle sets; neither shows a
// leg the other lacks.
//
// Charts are the house lightweight-charts scaffold, not iframes: four
// TradingView embeds is four third-party documents, four sockets and a
// theme nobody here controls. The scaffold reads its size from the
// container, so the wall reflows into one column at a narrow breakpoint
// without the canvas going stale — the defect G-5 would have walked
// straight into a week ago.
// ============================================================

import React from 'react';
import * as LC from 'lightweight-charts';
import { CHART_COL, useLwChart } from './nexusChart.js';
import { NexusFaceToggle, useFace } from './NexusFaceToggle.js';
import {
    WALL_RANGES, DEFAULT_RANGE, wallSeparate, wallCompared,
} from './nexusIndexWallCompute.js';

const { useState, useMemo, useRef } = React;
const e = React.createElement;

const COL = CHART_COL;
// Line colours for the compared face. Assigned by RANK, not by symbol:
// the eye should follow the ordering, and a fixed per-symbol palette
// makes the leader a different colour every day.
const RANK_COL = [COL.green, COL.cyan, COL.purple, COL.amber, COL.red];

const pct = (v, d = 2) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%');
const tone = v => (v == null ? '' : v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : '');

const WALL_FACES = [
    { id: 'separate', label: 'Separate', title: 'each index at its own price' },
    { id: 'compared', label: 'Compared', title: 'all indices rebased to 100 on a common session' },
];

// ── One small multiple ───────────────────────────────────────
function IndexCell({ leg }) {
    const ref = useRef(null);
    const down = leg.move != null && leg.move < 0;
    useLwChart(ref, function (chart) {
        const c = down ? COL.red : COL.green;
        const s = chart.addSeries(LC.AreaSeries, {
            lineColor: c,
            topColor: down ? 'rgba(239,68,68,0.16)' : 'rgba(34,197,94,0.16)',
            bottomColor: 'rgba(0,0,0,0)',
            lineWidth: 2,
            priceFormat: { type: 'custom', formatter: v => v.toFixed(0) },
        });
        s.setData(leg.series.map(b => ({ time: b.t, value: b.c })));
    }, [leg.symbol, leg.series.length, leg.series.length ? leg.series[0].t : null, down]);

    return e('div', { className: 'niw-cell' },
        e('div', { className: 'niw-cell-h' },
            e('span', { className: 'niw-tk' }, leg.symbol),
            e('span', { className: 'niw-move ' + tone(leg.move) }, pct(leg.move)),
            // A window the data could not fill says so rather than passing
            // 90 bars off as a year.
            leg.truncated
                ? e('span', { className: 'niw-trunc', title: 'only ' + leg.sessions + ' sessions available in this window' },
                    leg.sessions + ' sess')
                : null
        ),
        leg.series.length
            ? e('div', { ref, className: 'niw-chart' })
            : e('div', { className: 'niw-empty' }, 'No closes in this window.')
    );
}

// ── The compared chart ───────────────────────────────────────
function ComparedChart({ model }) {
    const ref = useRef(null);
    useLwChart(ref, function (chart) {
        model.legs.forEach((leg, i) => {
            const s = chart.addSeries(LC.LineSeries, {
                color: RANK_COL[i % RANK_COL.length],
                lineWidth: 2,
                priceLineVisible: false,
                priceFormat: { type: 'custom', minMove: 0.01, formatter: v => (v - 100 >= 0 ? '+' : '−') + Math.abs(v - 100).toFixed(1) + '%' },
            });
            s.setData(leg.series.map(b => ({ time: b.t, value: b.c })));
            // The 100 line is the common origin, drawn once. Every leg
            // starts on it by construction, which is the whole claim the
            // face is making.
            if (i === 0) s.createPriceLine({ price: 100, color: 'rgba(255,255,255,0.18)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        });
    }, [model.legs.map(l => l.symbol + ':' + l.series.length).join('|'), model.from]);

    return e('div', { ref, className: 'niw-chart niw-chart-tall' });
}

// ── The wall ─────────────────────────────────────────────────
export function NexusIndexWall({ indices }) {
    const [face, setFace] = useFace('atlas.nexus.indexwall.face.v1', WALL_FACES, 'separate');
    const [range, setRange] = useState(DEFAULT_RANGE);

    const separate = useMemo(() => wallSeparate(indices, range), [indices, range]);
    const compared = useMemo(() => wallCompared(indices, range), [indices, range]);

    const head = e('div', { className: 'nf-card-h' },
        e('div', null,
            e('h3', null, 'Major indices'),
            e('div', { className: 'nf-sub', style: { marginTop: 3 } },
                face === 'separate'
                    ? 'each index at its own price · ' + range
                    : 'rebased to 100 on a common session · ' + range)
        ),
        e('div', { className: 'niw-controls' },
            e('div', { className: 'niw-ranges' },
                WALL_RANGES.map(r => e('button', {
                    key: r.key, type: 'button',
                    className: 'nb-range-chip' + (r.key === range ? ' active' : ''),
                    onClick: () => setRange(r.key),
                }, r.label))),
            e(NexusFaceToggle, {
                faces: WALL_FACES, active: face, onChange: setFace,
                persistKey: 'atlas.nexus.indexwall.face.v1', affix: true,
            })
        )
    );

    if (!indices || !indices.length) {
        return e('div', { className: 'nf-card nf-fade niw' }, head,
            e('div', { className: 'niw-empty' }, 'Index history unavailable — /api/nexus-board carried no series.'));
    }

    if (face === 'compared') {
        // One leg drawn alone under a "compared" heading is the worst
        // outcome available: it looks like a comparison and is not one.
        const body = compared.tooShort || compared.legs.length < 2
            ? e('div', { className: 'niw-empty' },
                'Not enough overlapping sessions to compare these indices on one origin.')
            : e('div', null,
                e(ComparedChart, { model: compared }),
                e('div', { className: 'niw-legend' },
                    compared.legs.map((l, i) => e('span', { className: 'niw-leg', key: l.symbol },
                        e('i', { style: { background: RANK_COL[i % RANK_COL.length] } }),
                        e('span', { className: 'niw-tk' }, l.symbol),
                        e('span', { className: 'niw-move ' + tone(l.move) }, pct(l.move, 1))))),
                e('div', { className: 'niw-foot' },
                    compared.sessions + ' common sessions, ' + compared.from + ' → ' + compared.to
                    // The cost of being comparable is published rather than
                    // absorbed: a reader can see that the window they asked
                    // for is not the window they got, and why.
                    + (compared.alignmentCost
                        ? ' · ' + compared.alignmentCost + ' session' + (compared.alignmentCost === 1 ? '' : 's')
                          + ' dropped so every leg shares one origin'
                        : '')
                    + (compared.dropped.length
                        ? ' · ' + compared.dropped.join(', ') + ' withheld — no bar on every common session'
                        : '')));

        return e('div', { className: 'nf-card nf-fade niw' }, head, body);
    }

    return e('div', { className: 'nf-card nf-fade niw' }, head,
        e('div', { className: 'niw-grid' },
            separate.map(leg => e(IndexCell, { leg, key: leg.symbol })))
    );
}

export default NexusIndexWall;
