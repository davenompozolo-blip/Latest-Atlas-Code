// ============================================================
// ATLAS Nexus — shared lightweight-charts scaffold
// ------------------------------------------------------------
// These options and this hook were written in NexusBoard.js, whose own
// header says they "mirror the perf panels". They are now read by two
// panels, so they live here rather than being copied: a second copy is
// how two charts in the same module drift apart on grid colour, font and
// scale margins until nobody can say which one is the house style.
//
// lightweight-charts v5 needs colour LITERALS -- it paints to canvas and
// never resolves a CSS variable -- so the theme hexes are duplicated from
// the stylesheet on purpose. Keep them in step with nexus-flagship.css.
//
// The chart's SIZE comes from the container, never from a constant beside
// it. A number in JS that restates a CSS height is a second source for one
// measurement, and the two go out of step silently -- the canvas is painted,
// so nothing reflows and nothing warns.
// ============================================================

import React from 'react';
import * as LC from 'lightweight-charts';

const { useEffect } = React;

export const CHART_COL = {
    cyan: '#22d3ee', purple: '#8b5cf6', amber: '#f5a623',
    green: '#22c55e', red: '#ef4444', dim: '#51647b',
};

// The element's real box. A zero is not a size -- a detached or `display:none`
// container measures 0, and applying that paints a chart with no plot area --
// so a zero falls back to the caller's option and then to the default.
function boxOf(el, opts) {
    const w = el.clientWidth, h = el.clientHeight;
    const o = opts || {};
    return {
        width: w > 0 ? w : (o.width || 600),
        height: h > 0 ? h : (o.height || 200),
    };
}

// `size` is applied LAST, so the container wins over any width/height a
// caller passes -- there is one source for the box and it is the CSS.
export function baseOpts(size, opts) {
    const s = size || {};
    return Object.assign({
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono', fontSize: 10 },
        grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: { vertLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 3 }, horzLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 3 } },
        handleScroll: false, handleScale: false,
    }, opts || {}, { width: s.width || 600, height: s.height || 200 });
}

// Build a chart once `build(chart)` is provided; handles resize + teardown.
// `opts` is merged over baseOpts, so a panel can turn a scale on without
// restating the theme. It is NOT where the size comes from -- see boxOf.
export function useLwChart(ref, build, deps, opts) {
    useEffect(function () {
        const el = ref.current;
        if (!el) return;
        let box = boxOf(el, opts);
        const chart = LC.createChart(el, baseOpts(box, opts));
        try { build(chart); } catch (err) { /* leave empty on series error */ }
        chart.timeScale().fitContent();

        // Observe the CONTAINER, not the window. The board's Composite/Workings
        // toggle takes this card from one grid column to `grid-column: 1 / -1`
        // and its chart from 220px to 240px -- a container change with no
        // window event behind it, so a window listener never fires. Measured
        // before the fix: the container went 930x240 -> 441x220 while the
        // chart stayed 930x200, overflowing the card by 489px and carrying the
        // right price axis off screen.
        const apply = function () {
            const cur = ref.current;
            if (!cur) return;
            const next = boxOf(cur, opts);
            // Also the loop guard: applyOptions resizes canvases inside the
            // observed element, so a no-op must not re-enter.
            if (next.width === box.width && next.height === box.height) return;
            box = next;
            chart.applyOptions(next);
            // fixLeftEdge/fixRightEdge pin the window, so a width change has to
            // be refitted or the series keeps the bar spacing it was built at.
            chart.timeScale().fitContent();
        };

        let ro = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(apply);
            ro.observe(el);
        } else {
            window.addEventListener('resize', apply);
        }
        return function () {
            if (ro) ro.disconnect(); else window.removeEventListener('resize', apply);
            chart.remove();
        };
    }, deps);
}
