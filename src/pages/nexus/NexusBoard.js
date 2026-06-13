// ============================================================
// ATLAS Nexus — Macro & Breadth board
// ------------------------------------------------------------
// The visual half of the flagship: a Fear & Greed composite, a VIX
// track-record with FOMC/CPI/jobs markers, equal- vs cap-weight
// breadth, and major-index charts — each paired with the read, not
// shown in isolation. Self-fetching (/api/nexus-board) so it loads
// independently of the positioning model. Charts use the app's
// lightweight-charts (v5) the same way the perf panels do.
// ============================================================

import React from 'react';
import * as LC from 'lightweight-charts';

const { useState, useEffect, useRef } = React;
const e = React.createElement;

// Theme hexes (lightweight-charts needs literals, not CSS vars).
const COL = { cyan: '#22d3ee', purple: '#8b5cf6', amber: '#f5a623', green: '#22c55e', red: '#ef4444', dim: '#51647b' };
const EVENT_COL = { FOMC: COL.amber, CPI: COL.cyan, NFP: COL.purple };

const pct = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');
const moveTone = v => (v > 0 ? COL.green : v < 0 ? COL.red : COL.dim);

// ── Self-fetching board data ──────────────────────────────────
function useBoard() {
    const [state, setState] = useState({ board: null, loading: true, err: null });
    useEffect(function () {
        let alive = true;
        fetch('/api/nexus-board')
            .then(r => r.json())
            .then(j => { if (alive) setState({ board: j && j.ok ? j : null, loading: false, err: j && j.ok ? null : (j && j.error) || 'unavailable' }); })
            .catch(er => { if (alive) setState({ board: null, loading: false, err: er.message || String(er) }); });
        return () => { alive = false; };
    }, []);
    return state;
}

// ── Shared chart scaffold (mirrors perf-panels options) ───────
function baseOpts(width, opts) {
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
function useChart(ref, build, deps) {
    useEffect(function () {
        if (!ref.current) return;
        const chart = LC.createChart(ref.current, baseOpts(ref.current.clientWidth));
        try { build(chart); } catch (e) { /* leave empty on series error */ }
        chart.timeScale().fitContent();
        const onResize = () => { if (ref.current) chart.applyOptions({ width: ref.current.clientWidth }); };
        window.addEventListener('resize', onResize);
        return function () { window.removeEventListener('resize', onResize); chart.remove(); };
    }, deps);
}

function Card({ title, sub, right, children, span2 }) {
    return e('div', { className: 'nf-card nf-fade nb-card' + (span2 ? ' nb-span2' : '') },
        e('div', { className: 'nf-card-h' },
            e('div', null, e('h3', null, title), sub ? e('div', { className: 'nf-sub', style: { marginTop: 3 } }, sub) : null),
            right || null
        ),
        children
    );
}

// ── Fear & Greed gauge ────────────────────────────────────────
function FearGreed({ fg }) {
    if (!fg) return e(Card, { title: 'Fear & Greed' }, e('div', { className: 'nb-empty' }, 'No composite available.'));
    const tone = fg.score < 25 ? COL.red : fg.score < 45 ? COL.amber : fg.score <= 55 ? COL.dim : fg.score <= 75 ? COL.cyan : COL.green;
    return e(Card, { title: 'Fear & Greed', sub: 'composite of vol · momentum · safe-haven · credit · breadth' },
        e('div', { className: 'nb-fg-top' },
            e('div', { className: 'nb-fg-score', style: { color: tone } }, fg.score),
            e('div', { className: 'nb-fg-label', style: { color: tone } }, fg.label)
        ),
        e('div', { className: 'nb-fg-bar' },
            e('span', { className: 'nb-fg-needle', style: { left: fg.score + '%' } })
        ),
        e('div', { className: 'nb-fg-scaleends' }, e('span', null, 'Extreme fear'), e('span', null, 'Extreme greed')),
        e('div', { className: 'nb-fg-parts' },
            fg.parts.map((p, i) => e('div', { className: 'nb-fg-part', key: i },
                e('span', { className: 'nb-fg-pname' }, p.name),
                e('span', { className: 'nb-fg-ptrack' }, e('i', { style: { width: p.score + '%', background: p.score < 45 ? COL.red : p.score > 55 ? COL.green : COL.dim } })),
                e('span', { className: 'nb-fg-pval' }, p.value)
            ))
        )
    );
}

// ── VIX track-record with event markers ───────────────────────
function VixChart({ vix }) {
    const ref = useRef(null);
    const series = (vix && vix.series) || [];
    const events = (vix && vix.events) || [];
    const last = series.length ? series[series.length - 1].v : null;
    useChart(ref, function (chart) {
        const s = chart.addSeries(LC.AreaSeries, {
            lineColor: COL.amber, topColor: 'rgba(245,166,35,0.22)', bottomColor: 'rgba(245,166,35,0.01)', lineWidth: 2,
            priceFormat: { type: 'custom', formatter: v => v.toFixed(1) },
        });
        s.setData(series.map(d => ({ time: d.t, value: d.v })));
        // Calm/stress guide lines.
        s.createPriceLine({ price: 20, color: 'rgba(255,255,255,0.12)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        const first = series.length ? series[0].t : null;
        const lastT = series.length ? series[series.length - 1].t : null;
        const marks = events
            .filter(ev => first && lastT && ev.time >= first && ev.time <= lastT)
            .map(ev => ({ time: ev.time, position: 'aboveBar', color: EVENT_COL[ev.kind] || COL.dim, shape: 'circle', text: ev.label }));
        if (marks.length && LC.createSeriesMarkers) LC.createSeriesMarkers(s, marks);
    }, [JSON.stringify(series.map(d => d.t)), events.length]);

    const legend = e('div', { className: 'nb-legend' },
        ['FOMC', 'CPI', 'NFP'].map(k => e('span', { key: k, className: 'nb-leg' },
            e('i', { style: { background: EVENT_COL[k] } }), k === 'NFP' ? 'Jobs' : k))
    );
    return e(Card, { title: 'Volatility track record', sub: 'VIX, 1Y — spikes against macro events', right: last != null ? e('span', { className: 'nb-readout', style: { color: COL.amber } }, last.toFixed(1)) : null, span2: true },
        legend,
        series.length ? e('div', { ref, className: 'nb-chart' }) : e('div', { className: 'nb-empty' }, 'VIX history unavailable.')
    );
}

// ── Breadth: equal- vs cap-weight ratios (rebased 100) ────────
function BreadthChart({ breadth }) {
    const ref = useRef(null);
    const rows = breadth || [];
    useChart(ref, function (chart) {
        const colors = [COL.cyan, COL.purple];
        rows.forEach((row, i) => {
            const s = chart.addSeries(LC.LineSeries, { color: colors[i % colors.length], lineWidth: 2, priceFormat: { type: 'custom', formatter: v => v.toFixed(1) } });
            s.setData((row.series || []).map(d => ({ time: d.t, value: d.v })));
            if (i === 0) s.createPriceLine({ price: 100, color: 'rgba(255,255,255,0.18)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        });
    }, [JSON.stringify(rows.map(r => r.pair + ':' + r.series.length))]);

    const legend = e('div', { className: 'nb-legend' },
        rows.map((r, i) => e('span', { key: i, className: 'nb-leg' },
            e('i', { style: { background: i === 0 ? COL.cyan : COL.purple } }), r.pair)));
    return e(Card, { title: 'Market breadth', sub: 'equal-weight ÷ cap-weight, rebased to 100 — rising = broadening', right: legend, span2: true },
        rows.length ? e('div', { ref, className: 'nb-chart' }) : e('div', { className: 'nb-empty' }, 'Breadth series unavailable.'),
        e('div', { className: 'nb-foot' }, 'Above 100 and rising: participation is widening past the mega-caps. Falling: leadership is narrowing.')
    );
}

// ── Major indices (selectable) ────────────────────────────────
function IndexChart({ indices }) {
    const list = indices || [];
    const [sel, setSel] = useState(list.length ? list[0].symbol : null);
    const ref = useRef(null);
    const active = list.find(i => i.symbol === sel) || list[0];
    const series = (active && active.series) || [];
    useChart(ref, function (chart) {
        const up = active && active.changePct != null && active.changePct < 0;
        const c = up ? COL.red : COL.green;
        const s = chart.addSeries(LC.AreaSeries, {
            lineColor: c, topColor: up ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)', bottomColor: 'rgba(0,0,0,0)', lineWidth: 2,
            priceFormat: { type: 'custom', formatter: v => v.toFixed(0) },
        });
        s.setData(series.map(d => ({ time: d.t, value: d.c })));
    }, [sel, JSON.stringify(series.map(d => d.t))]);

    return e(Card, { title: 'Major indices', sub: '6-month price · ' + (active ? active.symbol : '—'),
        right: e('div', { className: 'nb-idx-chips' },
            list.map(i => e('button', {
                key: i.symbol, className: 'nb-idx-chip' + (i.symbol === sel ? ' active' : ''), onClick: () => setSel(i.symbol),
            }, e('span', { className: 'nb-idx-tk' }, i.symbol),
               e('span', { className: 'nb-idx-chg', style: { color: moveTone(i.changePct) } }, pct(i.changePct))))) },
        series.length ? e('div', { ref, className: 'nb-chart' }) : e('div', { className: 'nb-empty' }, 'Index history unavailable.')
    );
}

// ── Board section (rendered inside the flagship) ──────────────
export function NexusBoardSection() {
    const { board, loading, err } = useBoard();
    if (loading) return e('div', { className: 'nf-card nb-loading' }, e('span', { className: 'nb-spin' }, '◴'), ' Loading macro & breadth…');
    if (!board) return e('div', { className: 'nf-card nb-loading' }, '⚠ Macro & breadth board unavailable' + (err ? ' (' + err + ')' : '') + '.');
    return e('div', { className: 'nb-grid' },
        e(FearGreed, { fg: board.fearGreed }),
        e(IndexChart, { indices: board.indices }),
        e(VixChart, { vix: board.vix }),
        e(BreadthChart, { breadth: board.breadth })
    );
}

export default NexusBoardSection;
