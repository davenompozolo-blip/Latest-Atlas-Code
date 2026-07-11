// ============================================================
// ATLAS Nexus — Volatility Dispersion surfaces
// ------------------------------------------------------------
// Three read paths over the one vol_dispersion_daily store (written
// nightly by api/vol-dispersion-sync.js); all classification is pure
// (nexusDispersionCompute.dispersionRead) over the stored spreads —
// a windowed read, never a recompute.
//
//   • DispersionRegime      — Rotation Map header badge (market
//     basket): Wide / Neutral / Compressed + percentile, sparkline,
//     expandable full spread history with z-score bands. Colours how
//     the rest of the rotation funnel is read: wide → trust the
//     name-level calls, compressed → beta dominates, treat rotation
//     reads as noise.
//   • SectorDispersionStrip — per-sector cells under the map, each
//     sector vs its OWN trailing window (sector ETF benchmark).
//   • LedgerDispersionNote  — Opportunities annotation (portfolio
//     basket): when correlation is elevated, flag that isolated-merit
//     scores are less trustworthy right now. Display only — v1 never
//     touches the scoring.
//
// Regime is a status, not a series: state always ships as label +
// colour, never colour alone; a degraded (thin-sample) day says so
// instead of silently showing a spread off missing names.
// ============================================================

import React from 'react';
import { supabase } from '../../lib/supabase.js';
import { dispersionRead, MARKET_BASKET, SECTOR_BASKETS } from './nexusDispersionCompute.js';

const { useState, useEffect, useMemo } = React;
const e = React.createElement;

const REGIME = {
    wide:       { color: 'var(--success)', bg: 'var(--success-b)' },
    neutral:    { color: 'var(--text2)',   bg: 'rgba(88,100,115,.16)' },
    compressed: { color: 'var(--amber)',   bg: 'var(--amber-b)' },
    building:   { color: 'var(--text3)',   bg: 'rgba(88,100,115,.12)' },
};
const regimeStyle = r => REGIME[r] || REGIME.building;
const fmtSpread = v => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1));
const ordPct = p => (p == null ? null : p + (p % 10 === 1 && p !== 11 ? 'st' : p % 10 === 2 && p !== 12 ? 'nd' : p % 10 === 3 && p !== 13 ? 'rd' : 'th'));

// ── Data: one windowed read per basket type ──────────────────
function useDispersionRows(basketType) {
    const [s, setS] = useState({ rows: [], loaded: false });
    useEffect(function () {
        let alive = true;
        if (!supabase) { setS({ rows: [], loaded: true }); return; }
        const since = new Date(Date.now() - 370 * 86_400_000).toISOString().slice(0, 10);
        supabase.from('vol_dispersion_daily')
            .select('date,sector,spread,constituent_count')
            .eq('basket_type', basketType)
            .gte('date', since)
            .order('date', { ascending: true })
            .then(({ data, error }) => { if (alive) setS({ rows: error ? [] : (data || []), loaded: true }); });
        return () => { alive = false; };
    }, [basketType]);
    return s;
}

// ── Sparkline — single series, no axes, 2px line ─────────────
function Spark({ rows, color, w = 92, h = 22 }) {
    const vals = rows.slice(-60).map(r => Number(r.spread));
    if (vals.length < 2) return null;
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const step = w / (vals.length - 1);
    const d = vals.map((v, i) => (i ? 'L' : 'M') + (i * step).toFixed(1) + ' ' + (2 + (h - 4) * (1 - (v - min) / span)).toFixed(1)).join(' ');
    return e('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': true },
        e('path', { d, fill: 'none', stroke: color, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', opacity: 0.85 }));
}

// ── Full history — spread line over recessive σ-bands ────────
function HistoryChart({ rows, read }) {
    const [hov, setHov] = useState(null);
    const W = 760, H = 190, X0 = 46, X1 = W - 14, Y0 = 12, Y1 = H - 24;
    const pts = rows.filter(r => r.spread != null);
    const { mean, sd } = useMemo(() => {
        const vals = pts.map(r => Number(r.spread));
        const m = vals.reduce((a, v) => a + v, 0) / (vals.length || 1);
        return { mean: m, sd: Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / (vals.length || 1)) };
    }, [rows]);
    if (pts.length < 2) return e('div', { className: 'nb-empty' }, 'Not enough spread history to chart yet.');

    const vals = pts.map(r => Number(r.spread));
    const lo = Math.min(...vals, mean - 2 * sd, 0), hi = Math.max(...vals, mean + 2 * sd);
    const span = hi - lo || 1;
    const px = i => X0 + (i / (pts.length - 1)) * (X1 - X0);
    const py = v => Y0 + (1 - (v - lo) / span) * (Y1 - Y0);
    const line = vals.map((v, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1)).join(' ');
    const c = regimeStyle(read.regime).color;
    const kids = [];

    // σ bands + mean — recessive context, data on top.
    if (sd > 0) {
        kids.push(e('rect', { key: 'b2', x: X0, y: py(mean + 2 * sd), width: X1 - X0, height: py(mean - 2 * sd) - py(mean + 2 * sd), fill: 'rgba(255,255,255,.025)' }));
        kids.push(e('rect', { key: 'b1', x: X0, y: py(mean + sd), width: X1 - X0, height: py(mean - sd) - py(mean + sd), fill: 'rgba(255,255,255,.035)' }));
    }
    kids.push(e('line', { key: 'mean', x1: X0, y1: py(mean), x2: X1, y2: py(mean), stroke: 'rgba(255,255,255,.18)', strokeWidth: 1, strokeDasharray: '2 3' }));
    if (lo < 0 && hi > 0) kids.push(e('line', { key: 'zero', x1: X0, y1: py(0), x2: X1, y2: py(0), stroke: 'rgba(240,88,79,.35)', strokeWidth: 1 }));

    // y-axis extremes only, in text ink.
    [[hi, py(hi) + 4], [lo, py(lo)]].forEach(([v, y], i) =>
        kids.push(e('text', { key: 'yl' + i, x: X0 - 6, y, textAnchor: 'end', fontSize: 10, fill: 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, fmtSpread(v))));
    // x-axis: first and last date.
    kids.push(e('text', { key: 'x0', x: X0, y: H - 8, fontSize: 10, fill: 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, pts[0].date));
    kids.push(e('text', { key: 'x1', x: X1, y: H - 8, textAnchor: 'end', fontSize: 10, fill: 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, pts[pts.length - 1].date));

    kids.push(e('path', { key: 'ln', d: line, fill: 'none', stroke: c, strokeWidth: 2, strokeLinejoin: 'round' }));
    kids.push(e('circle', { key: 'now', cx: px(pts.length - 1), cy: py(vals[vals.length - 1]), r: 3.5, fill: c, stroke: 'var(--bg1)', strokeWidth: 2 }));

    // Hover crosshair + readout.
    if (hov != null) {
        const r = pts[hov], v = Number(r.spread);
        const zh = sd > 0 ? ((v - mean) / sd).toFixed(1) : '0.0';
        kids.push(e('line', { key: 'ch', x1: px(hov), y1: Y0, x2: px(hov), y2: Y1, stroke: 'rgba(255,255,255,.22)', strokeWidth: 1 }));
        kids.push(e('circle', { key: 'chp', cx: px(hov), cy: py(v), r: 4, fill: 'none', stroke: c, strokeWidth: 2 }));
        kids.push(e('text', { key: 'cht', x: px(hov) < (X0 + X1) / 2 ? px(hov) + 8 : px(hov) - 8, y: Y0 + 11, textAnchor: px(hov) < (X0 + X1) / 2 ? 'start' : 'end', fontSize: 10.5, fill: 'var(--text2)', style: { fontFamily: 'var(--fm)' } },
            r.date + ' · spread ' + fmtSpread(v) + ' · z ' + (zh >= 0 ? '+' : '') + zh));
    }

    return e('svg', {
        viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img',
        'aria-label': 'Dispersion spread history with mean and one/two sigma bands.',
        onMouseMove: ev => {
            const box = ev.currentTarget.getBoundingClientRect();
            const fx = ((ev.clientX - box.left) / box.width) * W;
            setHov(Math.max(0, Math.min(pts.length - 1, Math.round(((fx - X0) / (X1 - X0)) * (pts.length - 1)))));
        },
        onMouseLeave: () => setHov(null),
    }, kids);
}

// ── 1. Rotation Map header badge (market basket) ─────────────
export function DispersionRegime() {
    const { rows, loaded } = useDispersionRows('market');
    const [open, setOpen] = useState(false);
    const read = useMemo(() => dispersionRead(rows, MARKET_BASKET.length), [rows]);
    if (!loaded) return null;
    if (!rows.length) return null; // store empty (job not live yet) — say nothing rather than guess
    const st = regimeStyle(read.regime);
    return e('div', { className: 'nvd-wrap' },
        e('div', { className: 'nvd-badge', role: 'button', tabIndex: 0, title: read.because,
            onClick: () => setOpen(o => !o),
            onKeyDown: ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpen(o => !o); } } },
            e('span', { className: 't3' }, 'Dispersion regime'),
            e('span', { className: 'nvd-chip', style: { color: st.color, background: st.bg } },
                read.label + (read.pct != null ? ' · ' + ordPct(read.pct) + ' pct' : '')),
            read.degraded ? e('span', { className: 'nvd-chip nvd-degraded', title: 'Constituent coverage thin today — options data missing for several names; treat the level with caution.' }, 'degraded') : null,
            e('span', { className: 'nvd-spread mono' }, fmtSpread(read.spread) + ' vol pts'),
            e(Spark, { rows, color: st.color }),
            e('span', { className: 'nvd-caret' }, open ? '▾' : '▸')),
        open ? e('div', { className: 'nvd-panel' },
            e('div', { className: 'nvd-panel-h' },
                'Top-of-index basket 30D IV minus SPY 30D IV — implied-correlation proxy. ',
                e('span', { className: 't3' }, read.because),
                read.z != null ? e('span', { className: 'mono t2' }, ' · z ' + (read.z >= 0 ? '+' : '') + read.z) : null),
            e(HistoryChart, { rows, read })) : null);
}

// ── 2. Sector cells (sector baskets vs their own windows) ────
const SECTOR_SHORT = {
    'Technology': 'Tech', 'Financials': 'Fins', 'Energy': 'Energy', 'Healthcare': 'Health',
    'Consumer Discretionary': 'Disc', 'Consumer Staples': 'Staples', 'Industrials': 'Indus',
    'Materials': 'Mats', 'Utilities': 'Utes', 'Real Estate': 'RE', 'Communication': 'Comms',
};

export function SectorDispersionStrip() {
    const { rows, loaded } = useDispersionRows('sector');
    const cells = useMemo(() => {
        const bySector = new Map();
        for (const r of rows) {
            if (!bySector.has(r.sector)) bySector.set(r.sector, []);
            bySector.get(r.sector).push(r);
        }
        return [...bySector.entries()]
            .filter(([sector]) => SECTOR_BASKETS[sector])
            .map(([sector, rs]) => ({ sector, read: dispersionRead(rs, (SECTOR_BASKETS[sector] || []).length) }))
            .sort((a, b) => (b.read.pct ?? -1) - (a.read.pct ?? -1));
    }, [rows]);
    if (!loaded || !cells.length) return null;
    return e('div', { className: 'nvd-strip' },
        e('span', { className: 't3', style: { marginRight: 2 } }, 'Sector dispersion vs own baseline:'),
        cells.map(({ sector, read }) => {
            const st = regimeStyle(read.regime);
            return e('span', {
                key: sector, className: 'nvd-cell' + (read.degraded ? ' deg' : ''),
                style: { color: st.color, background: st.bg },
                title: sector + ' vs ' + 'sector ETF — ' + read.because + (read.degraded ? ' Coverage thin today.' : ''),
            }, (SECTOR_SHORT[sector] || sector) + ' ' + (read.ready ? (read.pct != null ? read.pct : '·') : '…'));
        }),
        e('span', { className: 't3', style: { marginLeft: 2 } }, 'high = dispersing (pick names) · low = moving as a block'));
}

// ── 3. Ledger annotation (portfolio basket, display only) ────
export function LedgerDispersionNote() {
    const { rows, loaded } = useDispersionRows('portfolio');
    const read = useMemo(() => dispersionRead(rows, null), [rows]);
    if (!loaded || !rows.length || !read.ready) return null;
    if (read.regime !== 'compressed') return null;
    return e('div', { className: 'nvd-note' },
        e('b', null, 'Correlation elevated' + (read.inverted ? ' (spread inverted)' : '') + ' — '),
        'your holdings’ implied vol is compressing toward the index (' + ordPct(read.pct) + ' percentile of the portfolio’s own window). ',
        'Beta is doing the driving, so isolated-merit scores below are less trustworthy right now; lean on portfolio fit.',
        read.degraded ? e('span', { className: 't3' }, ' Coverage thin today — several names missing options data.') : null);
}
