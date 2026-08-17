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

// ── Colour ────────────────────────────────────────────────────
// The exact ramp the NAME IMPACT heatmap uses (NexusRealized.js), so the two
// surfaces read as one system. Three things make that language work and the
// first version of this treemap had none of them:
//
//   Deep, desaturated fills rather than bright ones. A saturated green block
//   at 30% of the book dominates a page whose every other element is dark.
//
//   A DEAD ZONE at zero. The stops sit at 0.48 and 0.52, both slate, so a
//   bucket that barely moved reads as neutral ground rather than faint green.
//   Without it every tile is tinted and nothing stands out.
//
//   Colour carries ONE variable. The old version hijacked the fill to purple
//   for fragility clusters, which meant a tile's colour answered two different
//   questions. Fragility is now a glyph on the label; colour is only the move.
export const CLIP_PCT = 3;

const RAMP = [
    [0.00, [185, 28, 28], 0.92],
    [0.35, [127, 29, 29], 0.70],
    [0.48, [15, 23, 42], 0.85],
    [0.52, [15, 23, 42], 0.85],
    [0.65, [6, 78, 59], 0.70],
    [1.00, [5, 150, 105], 0.92],
];

/** Move → colour, piecewise-linear across the heatmap's stops. */
export function moveFill(movePct) {
    if (movePct == null || !isFinite(movePct)) return 'rgba(15,23,42,0.55)';
    const clamped = Math.max(-CLIP_PCT, Math.min(CLIP_PCT, movePct));
    const t = (clamped + CLIP_PCT) / (2 * CLIP_PCT);   // 0..1

    let lo = RAMP[0], hi = RAMP[RAMP.length - 1];
    for (let i = 0; i < RAMP.length - 1; i++) {
        if (t >= RAMP[i][0] && t <= RAMP[i + 1][0]) { lo = RAMP[i]; hi = RAMP[i + 1]; break; }
    }
    const span = hi[0] - lo[0];
    const k = span === 0 ? 0 : (t - lo[0]) / span;
    const ch = (a, b) => Math.round(a + (b - a) * k);
    const rgb = [ch(lo[1][0], hi[1][0]), ch(lo[1][1], hi[1][1]), ch(lo[1][2], hi[1][2])];
    const alpha = lo[2] + (hi[2] - lo[2]) * k;
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
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
                const showLabel = t.w > 78 && t.h > 30;
                const showPct = t.w > 46 && t.h > 20;
                const isHover = hover === t.label;
                // Same convention as the heatmap: the clip is visible, not
                // silent, so a bucket past the ramp is marked rather than
                // quietly flattened to full green or full red.
                const clipped = t.movePct != null && Math.abs(t.movePct) > CLIP_PCT;
                const mark = (clipped ? ' ◤' : '') + (t.fragility ? ' ⌁' : '');
                return e('g', {
                    key: t.label || i,
                    onMouseEnter: () => setHover(t.label),
                    onMouseLeave: () => setHover(null),
                    style: { cursor: 'default' },
                },
                    e('title', null,
                        `${t.label} — ${t.value.toFixed(1)}% of book`
                        + (t.movePct != null ? `, ${t.movePct >= 0 ? '+' : '−'}${Math.abs(t.movePct).toFixed(2)}% today` : '')
                        + (clipped ? ` (colour clipped at ±${CLIP_PCT}%)` : '')
                        + (t.fragility ? ' · fragility cluster' : '')
                        + (t.stale ? ' · stale' : '')),
                    e('rect', {
                        x: t.x, y: t.y, width: Math.max(0, t.w - 2), height: Math.max(0, t.h - 2),
                        fill: moveFill(t.movePct),
                        // Dark separators, as on the heatmap. Light hairlines
                        // read as a grid drawn on top; dark ones read as gaps
                        // between solids, which is what a treemap is.
                        stroke: isHover ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.60)',
                        strokeWidth: isHover ? 1.5 : 1.5, rx: 1,
                    }),
                    showLabel
                        ? e('text', { x: t.x + 9, y: t.y + 18, className: 'nf-tm-lbl' }, t.label + mark)
                        : null,
                    showPct
                        ? e('text', {
                            x: t.x + 9, y: t.y + (showLabel ? 33 : 15), className: 'nf-tm-val',
                        }, t.value.toFixed(1) + '%'
                            + (showLabel && t.movePct != null
                                ? '  ' + (t.movePct >= 0 ? '+' : '−') + Math.abs(t.movePct).toFixed(2) + '%'
                                : ''))
                        : null,
                    t.stale && t.w > 110 && t.h > 48
                        ? e('text', { x: t.x + 9, y: t.y + 48, className: 'nf-tm-stale' }, 'STALE')
                        : null);
            })),
        // A legend, because colour carrying a signed variable needs one.
        e('div', { className: 'nf-tm-legend' },
            e('span', null, `area = share of book · colour = today, clipped at ±${CLIP_PCT}% (◤)`),
            e('span', { className: 'nf-tm-scale' },
                e('i', { style: { background: moveFill(-CLIP_PCT) } }),
                e('i', { style: { background: moveFill(-CLIP_PCT / 2) } }),
                e('i', { style: { background: moveFill(0) } }),
                e('i', { style: { background: moveFill(CLIP_PCT / 2) } }),
                e('i', { style: { background: moveFill(CLIP_PCT) } }),
                e('span', { className: 'nf-tm-scalelbl' }, `−${CLIP_PCT}%  →  +${CLIP_PCT}%`)),
            hover
                ? e('span', { className: 'nf-tm-hover' }, hover)
                : (unmappedWeight > 0
                    ? e('span', { className: 'nf-tm-hover' },
                        unmappedWeight.toFixed(1) + '% unclassified')
                    : null)));
}
