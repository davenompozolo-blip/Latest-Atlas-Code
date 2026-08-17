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
const { useState, useRef, useLayoutEffect } = React;

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

/**
 * Measure the element in real CSS pixels.
 *
 * This exists because the first version drew into an SVG with
 * viewBox="0 0 1000 280" and preserveAspectRatio="none", stretched to fill a
 * ~1700px card. Everything inside was therefore scaled ~1.7x horizontally and
 * 1.0x vertically: glyphs came out literally stretched (the "low resolution"
 * look), a 1.5px stroke rendered 2.55px wide and 1.5px tall, and squarify's
 * whole purpose — keeping tiles near-square — was undone by the distortion
 * after the fact. Laying out in true pixels is the fix for all three.
 */
function useMeasure() {
    const ref = useRef(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
        read();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(read);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return [ref, box];
}

// JetBrains Mono advance width is a hair under 0.6em. Used only to decide
// whether a label has room; CSS ellipsis is the backstop when it does not.
const CH = 0.6;

export function SpineTreemap({ rows, dimension, unmappedWeight }) {
    const [hover, setHover] = useState(null);
    const [ref, box] = useMeasure();

    const tiles = (rows && rows.length && box.w > 0 && box.h > 0)
        ? squarify(
            rows.map(r => ({
                label: r.label, value: r.sharePct, movePct: r.movePct,
                fragility: r.fragility, stale: r.stale, names: r.names, riskShift: r.riskShift,
            })),
            box.w, box.h,
        )
        : [];

    return e('div', { className: 'nf-tmwrap' },
        e('div', {
            className: 'nf-treemap', ref,
            role: 'img', 'aria-label': `Positioning by ${dimension}, area is share of book`,
        },
            tiles.map((t, i) => {
                const clipped = t.movePct != null && Math.abs(t.movePct) > CLIP_PCT;
                const mark = (clipped ? ' ◤' : '') + (t.fragility ? ' ⌁' : '');
                const pct = t.value.toFixed(1) + '%';
                const move = t.movePct == null ? ''
                    : (t.movePct >= 0 ? '+' : '−') + Math.abs(t.movePct).toFixed(2) + '%';

                // Both lines need real room, measured against the tile's actual
                // pixel width rather than a viewBox unit — the wrong unit is
                // what let "Consumer Staples" bleed into its neighbour before.
                //
                // A label shows if it fits outright, or if there is room for a
                // recognisable prefix (~10 chars) that CSS then ellipsises.
                // Below that the tile keeps only its share, which is the more
                // useful of the two when space is this tight.
                const inner = t.w - 18;
                const charW = 11 * CH;
                const need = (t.label.length + mark.length) * charW;
                const fitsLabel = t.h >= 34 && inner >= Math.min(need, 10 * charW);
                const fitsValue = t.h >= 20 && inner >= 34;

                return e('div', {
                    key: t.label || i,
                    className: 'nf-tm-tile' + (hover === t.label ? ' on' : ''),
                    style: {
                        left: t.x, top: t.y,
                        width: Math.max(0, t.w - 2), height: Math.max(0, t.h - 2),
                        background: moveFill(t.movePct),
                    },
                    onMouseEnter: () => setHover(t.label),
                    onMouseLeave: () => setHover(null),
                    title: `${t.label} — ${pct} of book`
                        + (move ? `, ${move} today` : '')
                        + (clipped ? ` (colour clipped at ±${CLIP_PCT}%)` : '')
                        + (t.fragility ? ' · fragility cluster' : '')
                        + (t.stale ? ' · stale' : ''),
                },
                    fitsLabel ? e('div', { className: 'nf-tm-lbl' }, t.label + mark) : null,
                    fitsValue
                        ? e('div', { className: 'nf-tm-val' },
                            pct,
                            move ? e('span', { className: 'nf-tm-move' }, move) : null)
                        : null,
                    t.stale && t.h >= 52 && inner >= 40
                        ? e('div', { className: 'nf-tm-stale' }, 'STALE')
                        : null);
            })),

        // A legend, because colour carrying a signed variable needs one.
        e('div', { className: 'nf-tm-legend' },
            e('span', null, `area = share of book · colour = today, clipped at ±${CLIP_PCT}% (◤)`),
            e('span', { className: 'nf-tm-scale' },
                e('span', { className: 'nf-tm-scalelbl' }, `−${CLIP_PCT}%`),
                e('i', { style: { background: moveFill(-CLIP_PCT) } }),
                e('i', { style: { background: moveFill(-CLIP_PCT * 0.55) } }),
                e('i', { style: { background: moveFill(0) } }),
                e('i', { style: { background: moveFill(CLIP_PCT * 0.55) } }),
                e('i', { style: { background: moveFill(CLIP_PCT) } }),
                e('span', { className: 'nf-tm-scalelbl' }, `+${CLIP_PCT}%`)),
            hover
                ? e('span', { className: 'nf-tm-hover' }, hover)
                : (unmappedWeight > 0
                    ? e('span', { className: 'nf-tm-hover' },
                        unmappedWeight.toFixed(1) + '% unclassified')
                    : null)));
}
