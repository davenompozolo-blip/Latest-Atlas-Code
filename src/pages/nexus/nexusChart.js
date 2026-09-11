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
// ============================================================

import React from 'react';
import * as LC from 'lightweight-charts';

const { useEffect } = React;

export const CHART_COL = {
    cyan: '#22d3ee', purple: '#8b5cf6', amber: '#f5a623',
    green: '#22c55e', red: '#ef4444', dim: '#51647b',
};

export function baseOpts(width, opts) {
    return Object.assign({
        width: width || 600, height: 200,
        layout: { background: { type: 'solid', color: 'transparent' }, textColor: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono', fontSize: 10 },
        grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: { vertLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 3 }, horzLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 3 } },
        handleScroll: false, handleScale: false,
    }, opts || {});
}

// Build a chart once `build(chart)` is provided; handles resize + teardown.
// `opts` is merged over baseOpts, so a panel can set its own height or turn
// a scale on without restating the theme.
export function useLwChart(ref, build, deps, opts) {
    useEffect(function () {
        if (!ref.current) return;
        const chart = LC.createChart(ref.current, baseOpts(ref.current.clientWidth, opts));
        try { build(chart); } catch (err) { /* leave empty on series error */ }
        chart.timeScale().fitContent();
        const onResize = () => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }); };
        window.addEventListener('resize', onResize);
        return function () { window.removeEventListener('resize', onResize); chart.remove(); };
    }, deps);
}
