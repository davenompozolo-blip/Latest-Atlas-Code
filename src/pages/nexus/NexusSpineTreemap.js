// ============================================================
// Positioning spine — treemap view
// ------------------------------------------------------------
// The alternative to the bars. A pie was the obvious reach and it is the
// wrong tool here: a pie encodes one variable (share) as angle, which people
// read badly, and it collapses at 14 buckets where the small slices become
// unlabellable slivers.
//
// A treemap encodes the same share as AREA, which reads better, uses the full
// width of the card rather than a circle inscribed in it, and leaves a second
// channel — colour — free to carry today's move. So one glance answers both
// "how much of the book is this" and "what is it doing today", which is
// exactly the pair the bar view already shows side by side.
//
// Squarified layout (Bruls, Huizing & van Wijk 2000): tiles are kept as close
// to square as possible, because long thin rectangles make area comparisons
// hard — which would give back the advantage over the pie.
// ============================================================

import React from 'react';

const e = React.createElement;
const { useState } = React;

/** Move → colour. Same scale as the table's tone classes, as a gradient. */
function moveFill(movePct, fragility) {
    if (movePct == null || !isFinite(movePct)) return 'rgba(100,116,139,0.35)';
    const m = Math.max(-3, Math.min(3, movePct)) / 3;   // clamp at ±3%
    if (fragility) {
        // The fragility cluster keeps its purple identity from the bar view.
        const a = 0.35 + Math.abs(m) * 0.4;
        return `rgba(167,139,250,${a.toFixed(3)})`;
    }
    if (m >= 0) return `rgba(34,197,94,${(0.18 + m * 0.55).toFixed(3)})`;
    return `rgba(239,68,68,${(0.18 + Math.abs(m) * 0.55).toFixed(3)})`;
}

/**
 * Squarified treemap.
 * @param items  [{ label, value, movePct, fragility, stale, names }]
 * @returns      [{ ...item, x, y, w, h }]
 */
export function squarify(items, width, height) {
    const total = items.reduce((a, r) => a + (r.value || 0), 0);
    if (!total || !width || !height) return [];
    // Scale values into pixel area so the row-worst ratios are computed in the
    // same units as the rectangle we are filling.
    const scaled = items
        .filter(r => (r.value || 0) > 0)
        .map(r => ({ ...r, area: (r.value / total) * width * height }))
        .sort((a, b) => b.area - a.area);

    const out = [];
    let x = 0, y = 0, w = width, h = height;
    let row = [];

    const worst = (rw, len) => {
        if (!rw.length || !len) return Infinity;
        const s = rw.reduce((a, r) => a + r.area, 0);
        const mx = Math.max(...rw.map(r => r.area));
        const mn = Math.min(...rw.map(r => r.area));
        const len2 = len * len, s2 = s * s;
        return Math.max((len2 * mx) / s2, s2 / (len2 * mn));
    };

    const layoutRow = (rw, horizontal) => {
        const s = rw.reduce((a, r) => a + r.area, 0);
        if (horizontal) {
            const rowH = s / w;
            let cx = x;
            rw.forEach(r => {
                const rw2 = r.area / rowH;
                out.push({ ...r, x: cx, y, w: rw2, h: rowH });
                cx += rw2;
            });
            y += rowH; h -= rowH;
        } else {
            const rowW = s / h;
            let cy = y;
            rw.forEach(r => {
                const rh2 = r.area / rowW;
                out.push({ ...r, x, y: cy, w: rowW, h: rh2 });
                cy += rh2;
            });
            x += rowW; w -= rowW;
        }
    };

    let i = 0;
    while (i < scaled.length) {
        const horizontal = w >= h;
        const len = horizontal ? w : h;
        const next = scaled[i];
        if (!row.length || worst([...row, next], len) <= worst(row, len)) {
            row.push(next);
            i += 1;
        } else {
            layoutRow(row, horizontal);
            row = [];
        }
    }
    if (row.length) layoutRow(row, w >= h);
    return out;
}

export function SpineTreemap({ rows, dimension, unmappedWeight }) {
    const [hover, setHover] = useState(null);
    if (!rows || !rows.length) return null;

    const W = 1000, H = 280;   // viewBox units; the SVG scales to the card
    const tiles = squarify(
        rows.map(r => ({
            label: r.label, value: r.sharePct, movePct: r.movePct,
            fragility: r.fragility, stale: r.stale, names: r.names, riskShift: r.riskShift,
        })),
        W, H,
    );

    return e('div', { className: 'nf-tmwrap' },
        e('svg', {
            className: 'nf-treemap', viewBox: `0 0 ${W} ${H}`,
            preserveAspectRatio: 'none', role: 'img',
            'aria-label': `Positioning by ${dimension}, area is share of book`,
        },
            tiles.map((t, i) => {
                // Only label tiles with room for it — a clipped label is noise.
                const showLabel = t.w > 92 && t.h > 34;
                const showPct = t.w > 52 && t.h > 22;
                const isHover = hover === t.label;
                return e('g', {
                    key: t.label || i,
                    onMouseEnter: () => setHover(t.label),
                    onMouseLeave: () => setHover(null),
                    style: { cursor: 'default' },
                },
                    e('rect', {
                        x: t.x + 1, y: t.y + 1, width: Math.max(0, t.w - 2), height: Math.max(0, t.h - 2),
                        fill: moveFill(t.movePct, t.fragility),
                        stroke: isHover ? 'var(--cyan)' : 'rgba(255,255,255,0.10)',
                        strokeWidth: isHover ? 2 : 1, rx: 3,
                    }),
                    showLabel
                        ? e('text', {
                            x: t.x + 10, y: t.y + 20, className: 'nf-tm-lbl',
                            style: { fontSize: Math.min(13, Math.max(10, t.w / 14)) },
                        }, t.label)
                        : null,
                    showPct
                        ? e('text', {
                            x: t.x + 10, y: t.y + (showLabel ? 38 : 18), className: 'nf-tm-val',
                        }, t.value.toFixed(1) + '%'
                            + (showLabel && t.movePct != null
                                ? '  ' + (t.movePct >= 0 ? '+' : '−') + Math.abs(t.movePct).toFixed(1) + '%'
                                : ''))
                        : null,
                    t.stale && t.w > 120 && t.h > 52
                        ? e('text', { x: t.x + 10, y: t.y + 54, className: 'nf-tm-stale' }, 'STALE')
                        : null);
            })),
        // A legend, because colour carrying a signed variable needs one.
        e('div', { className: 'nf-tm-legend' },
            e('span', null, 'area = share of book · colour = today'),
            e('span', { className: 'nf-tm-scale' },
                e('i', { style: { background: moveFill(-3) } }),
                e('i', { style: { background: moveFill(-1) } }),
                e('i', { style: { background: moveFill(0) } }),
                e('i', { style: { background: moveFill(1) } }),
                e('i', { style: { background: moveFill(3) } }),
                e('span', { className: 'nf-tm-scalelbl' }, '−3%  →  +3%')),
            hover
                ? e('span', { className: 'nf-tm-hover' }, hover)
                : (unmappedWeight > 0
                    ? e('span', { className: 'nf-tm-hover' },
                        unmappedWeight.toFixed(1) + '% unclassified')
                    : null)));
}
