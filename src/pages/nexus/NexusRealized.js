// ============================================================
// ATLAS Nexus — Realized layer (beats 05 · 06 · 07 · 08)
// ------------------------------------------------------------
// The page above this point makes calls (regime → rotation →
// transmission → names). These four beats grade them:
//   05 Realized transmission — beat 03's betas turned into dollars
//   06 Name impact           — beat 05's residual cut by name
//   07 Decision scorecard    — Brinson grades the two Nexus engines
//   08 Evidence              — chart bench over chartSeriesEngine
//
// Organising principle (spec §1): nothing here is a new panel — every
// section is the realized counterpart of the beat directly above it.
// All maths lives in nexusRealizedCompute.js / lib engines; this file
// only renders and fetches.
//
// Data honesty: the residual 1σ flag and the scorecard verdict badges
// need trailing history (sector_pnl_residuals / attribution_history).
// Until those tables accrue rows they render '—' — never faked (§8).
// ============================================================

import React from 'react';
import Plotly from 'plotly.js-dist-min';
import { sb, loadView } from '../config.js';
import { computeBrinsonAttribution, BENCHMARKS, verdictForEffect } from '../../lib/attributionEngine.js';
import {
    alignSeries, computeMetrics, rollingBeta, makeRequestGate,
    sma, ema, bollingerBands, rsi as rsiCalc, macd as macdCalc, TIMEFRAMES,
} from '../../lib/chartSeriesEngine.js';
import {
    sectorPnl, impliedVsActual, topResidualRows, residualSigma, flaggedSectors,
    transmissionRead, nameImpact, residualConcentration, nameRead, losingStreak,
    scorecardRead, trailingEffects,
} from './nexusRealizedCompute.js';

const { useState, useEffect, useMemo, useRef, useCallback } = React;
const e = React.createElement;

// ── formatters ────────────────────────────────────────────────
const money = v => {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    const s = a >= 1000 ? '$' + (a / 1000).toFixed(1) + 'k' : '$' + a.toFixed(0);
    return (v < 0 ? '-' : '+') + s;
};
const pctS = (v, d = 2) => (v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d) + '%');
const fpct = (v, d = 2) => (v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%');
const toneOf = v => (v == null ? 't3' : v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : 't3');

// benchKey shared with PERF → Brinson via localStorage (both surfaces
// read/write the same key, so switching in one follows to the other).
const BENCH_LS_KEY = 'atlas_brinson_bench';
function loadBenchKey() {
    try { const k = localStorage.getItem(BENCH_LS_KEY); return BENCHMARKS[k] ? k : 'equal'; }
    catch (_) { return 'equal'; }
}
function saveBenchKey(k) { try { localStorage.setItem(BENCH_LS_KEY, k); } catch (_) {} }

function drillName(symbol) {
    window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol } }));
}

// ── shared small UI ───────────────────────────────────────────
function Pills({ options, value, onChange }) {
    return e('div', { style: { display: 'inline-flex', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(58,214,224,.14)', borderRadius: 5, overflow: 'hidden' } },
        options.map(o => {
            const on = value === o.value;
            const disabled = !!o.disabled;
            return e('button', {
                key: o.value,
                title: o.reason || o.label,
                onClick: disabled ? undefined : () => onChange(o.value),
                style: {
                    background: on ? 'rgba(58,214,224,.13)' : 'none', border: 0,
                    color: disabled ? 'var(--text3)' : on ? 'var(--cyan)' : 'var(--text3)',
                    opacity: disabled ? 0.45 : 1,
                    fontFamily: 'var(--fm)', fontSize: 10, letterSpacing: '.08em',
                    padding: '5px 10px', cursor: disabled ? 'not-allowed' : 'pointer',
                },
            }, o.label);
        }));
}

function BeatHead({ no, title, why }) {
    return e('div', { style: { margin: '30px 0 12px', display: 'flex', alignItems: 'baseline', gap: 14 } },
        e('span', { style: { fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--cyan)', letterSpacing: '.18em', border: '1px solid rgba(58,214,224,.32)', padding: '3px 7px', borderRadius: 3 } }, no),
        e('h3', { style: { margin: 0, fontSize: 14, letterSpacing: '.10em', textTransform: 'uppercase' } }, title),
        e('div', { style: { color: 'var(--text3)', fontSize: 11.5, marginLeft: 'auto', maxWidth: '46%', textAlign: 'right', lineHeight: 1.5 } }, why));
}

function ReadLine({ tag, children }) {
    return e('div', { style: { marginTop: 13, borderLeft: '2px solid var(--cyan)', padding: '9px 0 9px 13px', fontSize: 12.5, lineHeight: 1.65, color: 'var(--text2)', background: 'linear-gradient(90deg,rgba(58,214,224,.05),transparent 70%)' } },
        e('span', { style: { fontFamily: 'var(--fm)', fontSize: 9.5, letterSpacing: '.14em', color: 'var(--cyan)', display: 'block', marginBottom: 4, textTransform: 'uppercase' } }, tag),
        children);
}

// ── Beat 05: waterfall SVG ────────────────────────────────────
function WaterfallSvg({ items, total, isPct }) {
    if (!items.length) return e('div', { className: 'nb-empty' }, 'No sector P&L for this period yet.');
    const W = 680, H = 300, pad = { l: 56, r: 10, t: 14, b: 80 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    let run = 0;
    const pts = items.map(it => { const p = { n: it.sector, v: it.value, s: run, e: run + it.value }; run += it.value; return p; });
    const all = pts.flatMap(p => [p.s, p.e]).concat([0, total]);
    const min = Math.min(...all) * 1.15 - 1e-9, max = Math.max(...all) * 1.15 + 1e-9;
    const y = v => pad.t + ih - ((v - min) / (max - min)) * ih;
    const step = iw / (pts.length + 1), bw = step * 0.62;
    const fmtV = v => (isPct ? pctS(v, 2) : money(v));
    const kids = [];
    [max, (max + min) / 2, 0, min].forEach((g, i) => {
        kids.push(e('line', { key: 'g' + i, x1: pad.l, x2: W - pad.r, y1: y(g), y2: y(g), stroke: 'rgba(255,255,255,.05)' }));
        kids.push(e('text', { key: 'gt' + i, x: pad.l - 8, y: y(g) + 3, fill: 'var(--text3)', fontSize: 9, textAnchor: 'end', style: { fontFamily: 'var(--fm)' } },
            isPct ? g.toFixed(1) + '%' : (g < 0 ? '-$' : '$') + Math.abs(Math.round(g))));
    });
    pts.forEach((p, i) => {
        const x = pad.l + step * i + step * 0.5 - bw / 2;
        const c = p.v >= 0 ? 'var(--success)' : 'var(--danger)';
        const top = Math.min(y(p.s), y(p.e)), h2 = Math.max(2, Math.abs(y(p.s) - y(p.e)));
        kids.push(e('rect', { key: 'b' + i, x, y: top, width: bw, height: h2, fill: c, opacity: .85, rx: 1 }));
        kids.push(e('text', { key: 'l' + i, transform: `translate(${x + bw / 2},${pad.t + ih + 10}) rotate(38)`, fill: 'var(--text2)', fontSize: 9 }, p.n));
        kids.push(e('text', { key: 'v' + i, x: x + bw / 2, y: top - 4, fill: c, fontSize: 8.5, textAnchor: 'middle', style: { fontFamily: 'var(--fm)' } }, fmtV(p.v)));
    });
    const xt = pad.l + step * pts.length + step * 0.5 - bw / 2;
    kids.push(e('rect', { key: 'tb', x: xt, y: Math.min(y(0), y(total)), width: bw, height: Math.max(2, Math.abs(y(0) - y(total))), fill: 'var(--cyan)', opacity: .9, rx: 1 }));
    kids.push(e('text', { key: 'tv', x: xt + bw / 2, y: Math.min(y(0), y(total)) - 4, fill: 'var(--cyan)', fontSize: 8.5, textAnchor: 'middle', style: { fontFamily: 'var(--fm)' } }, fmtV(total)));
    kids.push(e('text', { key: 'tl', transform: `translate(${xt + bw / 2},${pad.t + ih + 10}) rotate(38)`, fill: 'var(--cyan)', fontSize: 9 }, 'Total'));
    return e('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'Sector P&L waterfall' }, kids);
}

// ── Beat 06: contribution bars SVG ────────────────────────────
function NameBars({ bars, isPct, totalMv }) {
    if (!bars.length) return e('div', { className: 'nb-empty' }, 'No period P&L on the filtered book.');
    const W = 1000, rowH = 26, pad = { l: 70, r: 14, t: 8, b: 24 };
    const H = pad.t + pad.b + bars.length * rowH, iw = W - pad.l - pad.r;
    const val = b => (isPct && totalMv ? (b.pnl / totalMv) * 100 : b.pnl);
    const m = Math.max(...bars.map(b => Math.abs(val(b))), 1e-9);
    const mid = pad.l + iw / 2, sc = v => (v / m) * (iw / 2) * 0.92;
    const kids = [e('line', { key: 'mid', x1: mid, x2: mid, y1: pad.t, y2: pad.t + bars.length * rowH, stroke: 'rgba(255,255,255,.12)' })];
    bars.forEach((b, i) => {
        const v = val(b);
        const yy = pad.t + i * rowH + 4, hh = rowH - 11;
        const c = v >= 0 ? 'var(--success)' : 'var(--danger)';
        const x = v >= 0 ? mid : mid + sc(v);
        kids.push(e('rect', { key: 'r' + b.symbol, x, y: yy, width: Math.abs(sc(v)), height: hh, fill: c, opacity: .82, rx: 2, style: { cursor: 'pointer' }, onClick: () => drillName(b.symbol) }));
        kids.push(e('text', { key: 'n' + b.symbol, x: pad.l - 10, y: yy + hh - 3, fill: 'var(--text1)', fontSize: 10.5, textAnchor: 'end', style: { fontFamily: 'var(--fm)', cursor: 'pointer' }, onClick: () => drillName(b.symbol) }, b.symbol));
        const lx = v >= 0 ? x + Math.abs(sc(v)) + 7 : x - 7;
        kids.push(e('text', { key: 'v' + b.symbol, x: lx, y: yy + hh - 3, fill: c, fontSize: 10, textAnchor: v >= 0 ? 'start' : 'end', style: { fontFamily: 'var(--fm)' } }, isPct ? pctS(v) : money(v)));
    });
    kids.push(e('text', { key: 'z', x: mid, y: H - 6, fill: 'var(--text3)', fontSize: 9, textAnchor: 'middle', style: { fontFamily: 'var(--fm)' } }, isPct ? '0%' : '$0'));
    return e('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': 'Contribution to period P&L by name' }, kids);
}

// ── Beat 06: heatmap (Plotly treemap, colour clipped at ±6%) ──
const HEAT_CLIP = 6;
function Heatmap({ rows, colourKey }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!ref.current || !rows.length) return;
        const labels = [], values = [], colors = [], texts = [], hovers = [];
        rows.forEach(r => {
            const mv = Math.abs(Number(r.market_value) || 0);
            if (!mv) return;
            const chg = (Number(r[colourKey]) || 0) * 100;
            const clipped = Math.abs(chg) > HEAT_CLIP;
            labels.push(r.symbol);
            values.push(mv);
            colors.push(Math.max(-HEAT_CLIP, Math.min(HEAT_CLIP, chg)));
            // Clip is visible, not silent: a caret marks cells past ±6%.
            texts.push(r.symbol + (clipped ? ' ◤' : '') + '<br>' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%');
            hovers.push('<b>' + r.symbol + '</b><br>' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%'
                + (clipped ? ' (colour clipped at ±' + HEAT_CLIP + '%)' : '')
                + '<br>MV $' + mv.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '<extra></extra>');
        });
        Plotly.react(ref.current, [{
            type: 'treemap', labels, parents: labels.map(() => ''), values,
            text: texts, customdata: hovers, textinfo: 'text', hovertemplate: '%{customdata}',
            textfont: { family: 'JetBrains Mono', size: 11, color: 'rgba(255,255,255,0.92)' },
            marker: {
                colors,
                colorscale: [
                    [0, 'rgba(185,28,28,0.92)'], [0.35, 'rgba(127,29,29,0.7)'],
                    [0.48, 'rgba(15,23,42,0.85)'], [0.52, 'rgba(15,23,42,0.85)'],
                    [0.65, 'rgba(6,78,59,0.7)'], [1, 'rgba(5,150,105,0.92)'],
                ],
                cmin: -HEAT_CLIP, cmax: HEAT_CLIP, cmid: 0, showscale: false,
                line: { width: 1.5, color: 'rgba(0,0,0,0.6)' },
            },
            tiling: { pad: 2 },
        }], {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 0, r: 0, t: 0, b: 0 },
        }, { responsive: true, displayModeBar: false });
    }, [rows, colourKey]);
    return e('div', null,
        e('div', { ref, style: { height: 300 } }),
        e('div', { className: 'nf-sub', style: { marginTop: 8 } },
            'Sized by NAV weight · colour clipped at ±' + HEAT_CLIP + '% (◤ marks clipped cells) — one −15% name no longer compresses the rest of the book to black.'));
}

// ── Beat 07: verdict badge ────────────────────────────────────
const VERDICT_STYLE = {
    WORKING: { bg: 'rgba(18,184,134,.14)', col: 'var(--success)' },
    DRAG: { bg: 'rgba(224,64,92,.14)', col: 'var(--danger)' },
    FLAT: { bg: 'rgba(255,255,255,.06)', col: 'var(--text2)' },
};
function VerdictBadge({ verdict, labelFor }) {
    if (!verdict) {
        return e('span', {
            title: 'Needs 12 weeks of attribution_history for a trailing median — accruing, not faked.',
            style: { display: 'inline-block', marginTop: 9, fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '.12em', padding: '2px 7px', borderRadius: 3, background: 'rgba(255,255,255,.04)', color: 'var(--text3)' },
        }, '—');
    }
    const s = VERDICT_STYLE[verdict];
    return e('span', { style: { display: 'inline-block', marginTop: 9, fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '.12em', padding: '2px 7px', borderRadius: 3, background: s.bg, color: s.col } },
        labelFor(verdict));
}

// ── Beat 08: evidence chart ───────────────────────────────────
const EV_PALETTE = ['#3ad6e0', '#f0b429', '#8b7bd8', '#12b886', '#e0405c', '#fb923c', '#60a5fa', '#a3e635'];
const EV_MAX_SERIES = 8;

function EvidenceChart({ aligned, drawnIds, chartType, subplots, overlays, normalise, betaSub }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!ref.current) return;
        const { dates, series } = aligned;
        const drawn = series.filter(s => drawnIds.indexOf(s.id) >= 0);
        const traces = [], shapes = [];
        const spDefs = [];
        if (subplots.volume) spDefs.push({ key: 'volume', frac: 0.12, yKey: 'y2' });
        if (subplots.rsi) spDefs.push({ key: 'rsi', frac: 0.15, yKey: 'y3' });
        if (subplots.macd) spDefs.push({ key: 'macd', frac: 0.16, yKey: 'y4' });
        const betaLive = subplots.beta && betaSub && betaSub.length;
        if (betaLive) spDefs.push({ key: 'beta', frac: 0.16, yKey: 'y5' });
        const GAP = 0.015;
        const totalFrac = spDefs.reduce((s, sp) => s + sp.frac + GAP, 0);
        let bottom = 0; const domains = {};
        spDefs.forEach(sp => { domains[sp.key] = [bottom, bottom + sp.frac - GAP]; bottom += sp.frac; });
        const axisBase = {
            gridcolor: 'rgba(255,255,255,0.04)', linecolor: 'rgba(255,255,255,0.06)',
            tickfont: { color: 'rgba(255,255,255,0.28)', size: 10, family: "'JetBrains Mono',monospace" },
            showgrid: true, zeroline: false,
        };
        const yaxes = { yaxis: Object.assign({}, axisBase, { domain: [totalFrac, 1] }) };

        drawn.forEach((s, idx) => {
            const colour = EV_PALETTE[idx % EV_PALETTE.length];
            if (chartType === 'candlestick' && drawn.length === 1) {
                traces.push({
                    type: 'candlestick', name: s.id, x: dates,
                    open: s.ohlc.map(o => o && o.open), high: s.ohlc.map(o => o && o.high),
                    low: s.ohlc.map(o => o && o.low), close: s.ohlc.map(o => o && o.close),
                    increasing: { line: { color: '#3ad6e0', width: 1 }, fillcolor: 'rgba(58,214,224,0.45)' },
                    decreasing: { line: { color: '#e0405c', width: 1 }, fillcolor: 'rgba(224,64,92,0.45)' },
                    yaxis: 'y', xaxis: 'x',
                });
            } else {
                traces.push({
                    type: 'scatter', mode: 'lines', name: s.id, x: dates, y: s.values,
                    line: { color: colour, width: idx === 0 ? 2 : 1.5 },
                    fill: chartType === 'area' && idx === 0 ? 'tozeroy' : 'none',
                    fillcolor: chartType === 'area' && idx === 0 ? 'rgba(58,214,224,0.08)' : undefined,
                    connectgaps: false, yaxis: 'y', xaxis: 'x',
                });
            }
            if (idx === 0) {
                const prices = s.values.map(v => (v == null ? NaN : v));
                if (overlays.ma20) traces.push({ type: 'scatter', mode: 'lines', name: 'MA 20', x: dates, y: sma(prices, 20), line: { color: '#fbbf24', width: 1.2, dash: 'dash' } });
                if (overlays.ma50) traces.push({ type: 'scatter', mode: 'lines', name: 'MA 50', x: dates, y: sma(prices, 50), line: { color: '#a78bfa', width: 1.2, dash: 'dash' } });
                if (overlays.ma200) traces.push({ type: 'scatter', mode: 'lines', name: 'MA 200', x: dates, y: sma(prices, 200), line: { color: '#fb923c', width: 1.2, dash: 'dot' } });
                if (overlays.ema12) traces.push({ type: 'scatter', mode: 'lines', name: 'EMA 12', x: dates, y: ema(prices, 12), line: { color: '#34d399', width: 1.2 } });
                if (overlays.ema26) traces.push({ type: 'scatter', mode: 'lines', name: 'EMA 26', x: dates, y: ema(prices, 26), line: { color: '#60a5fa', width: 1.2 } });
                if (overlays.bb) {
                    const bb = bollingerBands(prices, 20, 2);
                    traces.push(
                        { type: 'scatter', mode: 'lines', name: 'BB up', x: dates, y: bb.map(b => b.upper), line: { color: 'rgba(148,163,184,0.35)', width: 1, dash: 'dot' } },
                        { type: 'scatter', mode: 'lines', name: 'BB mid', x: dates, y: bb.map(b => b.mid), line: { color: 'rgba(100,116,139,0.6)', width: 1 } },
                        { type: 'scatter', mode: 'lines', name: 'BB low', x: dates, y: bb.map(b => b.lower), line: { color: 'rgba(148,163,184,0.35)', width: 1, dash: 'dot' }, fill: 'tonexty', fillcolor: 'rgba(148,163,184,0.06)' },
                    );
                }
            }
        });

        const primary = drawn[0];
        if (subplots.volume && primary) {
            traces.push({
                type: 'bar', name: 'Volume', x: dates, y: primary.ohlc.map(o => (o ? o.volume : null)),
                marker: { color: 'rgba(58,214,224,0.3)' }, yaxis: 'y2', xaxis: 'x',
            });
            yaxes.yaxis2 = Object.assign({}, axisBase, { domain: domains.volume, showticklabels: false });
        }
        if (subplots.rsi && primary) {
            traces.push({ type: 'scatter', mode: 'lines', name: 'RSI', x: dates, y: rsiCalc(primary.values.map(v => (v == null ? NaN : v))), line: { color: '#8b7bd8', width: 1.4 }, yaxis: 'y3', xaxis: 'x' });
            yaxes.yaxis3 = Object.assign({}, axisBase, { domain: domains.rsi, range: [0, 100], title: { text: 'RSI', font: { color: 'rgba(255,255,255,0.28)', size: 9 } } });
            shapes.push(
                { type: 'line', xref: 'paper', yref: 'y3', x0: 0, x1: 1, y0: 70, y1: 70, line: { color: 'rgba(224,64,92,0.4)', width: 1, dash: 'dash' } },
                { type: 'line', xref: 'paper', yref: 'y3', x0: 0, x1: 1, y0: 30, y1: 30, line: { color: 'rgba(58,214,224,0.4)', width: 1, dash: 'dash' } },
            );
        }
        if (subplots.macd && primary) {
            const mc = macdCalc(primary.values.map(v => (v == null ? NaN : v)));
            traces.push(
                { type: 'bar', name: 'MACD hist', x: dates, y: mc.histogram, marker: { color: mc.histogram.map(v => ((v || 0) >= 0 ? 'rgba(58,214,224,0.5)' : 'rgba(224,64,92,0.5)')) }, yaxis: 'y4', xaxis: 'x' },
                { type: 'scatter', mode: 'lines', name: 'MACD', x: dates, y: mc.macdLine, line: { color: '#3ad6e0', width: 1.2 }, yaxis: 'y4', xaxis: 'x' },
                { type: 'scatter', mode: 'lines', name: 'Signal', x: dates, y: mc.signalLine, line: { color: '#f0b429', width: 1.2 }, yaxis: 'y4', xaxis: 'x' },
            );
            yaxes.yaxis4 = Object.assign({}, axisBase, { domain: domains.macd, title: { text: 'MACD', font: { color: 'rgba(255,255,255,0.28)', size: 9 } } });
        }
        if (betaLive) {
            // The subplot that makes this a Nexus tool: rolling 60d beta of
            // each non-portfolio series vs the ATLAS Portfolio.
            betaSub.forEach((bs, i) => {
                traces.push({ type: 'scatter', mode: 'lines', name: 'β60 ' + bs.id, x: dates, y: bs.values, line: { color: EV_PALETTE[(drawnIds.indexOf(bs.id) + 8) % 8], width: 1.3 }, connectgaps: false, yaxis: 'y5', xaxis: 'x' });
            });
            shapes.push({ type: 'line', xref: 'paper', yref: 'y5', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: 'rgba(255,255,255,0.18)', width: 1, dash: 'dash' } });
            yaxes.yaxis5 = Object.assign({}, axisBase, { domain: domains.beta, title: { text: 'β60 vs port', font: { color: 'rgba(255,255,255,0.28)', size: 9 } } });
        }

        const layout = Object.assign({
            paper_bgcolor: 'transparent', plot_bgcolor: 'rgba(255,255,255,0.012)',
            margin: { l: 8, r: 62, t: 8, b: 28 },
            font: { color: 'rgba(255,255,255,0.42)', size: 10, family: "'JetBrains Mono',monospace" },
            legend: { bgcolor: 'transparent', orientation: 'h', y: -0.08, x: 0, font: { size: 10 } },
            xaxis: Object.assign({}, axisBase, { domain: [0, 1], rangeslider: { visible: false } }),
            annotations: [{ text: 'ATLAS', xref: 'paper', yref: 'paper', x: 0.5, y: 0.55, showarrow: false, font: { color: 'rgba(58,214,224,0.04)', size: 52, family: "'Syne',sans-serif" } }],
            shapes,
        }, yaxes);
        if (normalise && chartType !== 'candlestick') {
            shapes.push({ type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: 100, y1: 100, line: { color: 'rgba(255,255,255,0.15)', width: 1, dash: 'dot' } });
        }
        Plotly.react(ref.current, traces, layout, { responsive: true, displayModeBar: false });
    }, [aligned, drawnIds, chartType, subplots, overlays, normalise, betaSub]);
    return e('div', { ref, style: { height: 380 } });
}

// ── data hooks ────────────────────────────────────────────────
function useOnce(fn, deps) { // fetch-on-mount with alive guard
    useEffect(() => {
        let alive = true;
        fn(v => alive && v);
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps || []);
}

// ── main layer ────────────────────────────────────────────────
// Props (all from NexusThemePanel so beats 03/05 share one source):
//   themeRows:   buildThemeView rows + betas (beat 03's exact objects)
//   factorMoves: today's factor moves in the beta units (/api/nexus-theme)
//   betasAsOf:   price date the betas were computed to (staleness note)
//   model:       resolved NexusModel (Cortex signals per holding)
//   macro:       /api/macro payload (risk-free for Sharpe)
//   rotation:    { buyTheme, sellTheme } from rotationCall (beat 02)
export function NexusRealizedLayer({ themeRows, factorMoves, betasAsOf, model, macro, rotation }) {
    // shared realized-layer state: one period for beats 05 + 06 (§3.3)
    const [period, setPeriod] = useState('1d');
    const [valMode, setValMode] = useState('$');
    const [homeRows, setHomeRows] = useState(null);
    const [perfRows, setPerfRows] = useState(null);
    const [navRows, setNavRows] = useState(null);
    const [residHist, setResidHist] = useState(null); // null = loading/unavailable
    const [attrHist, setAttrHist] = useState(null);
    const [streakInfo, setStreakInfo] = useState(null); // { symbol, streak }

    useOnce(ok => {
        loadView('vw_portfolio_home', []).then(r => ok(true) && setHomeRows(r || []));
        loadView('vw_performance_suite', []).then(r => ok(true) && setPerfRows(r || []));
        loadView('vw_portfolio_nav_daily', []).then(r => ok(true) && setNavRows(r || []));
        if (sb) {
            const since = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);
            sb.from('sector_pnl_residuals').select('date, sector, residual').gte('date', since)
                .then(res => ok(true) && setResidHist(res.error ? null : res.data || []))
                .catch(() => ok(true) && setResidHist(null));
            sb.from('attribution_history').select('week_start, benchmark, allocation_effect, selection_effect, interaction_effect')
                .order('week_start', { ascending: false }).limit(60)
                .then(res => ok(true) && setAttrHist(res.error ? null : res.data || []))
                .catch(() => ok(true) && setAttrHist(null));
        } else { setResidHist(null); setAttrHist(null); }
    });

    // ── Beat 05 compute ───────────────────────────────────────
    const rows = homeRows || [];
    const cut = useMemo(() => sectorPnl(rows, period), [rows, period]);
    const betasBySector = useMemo(() => new Map((themeRows || []).filter(r => r.betas).map(r => [r.theme, r.betas])), [themeRows]);
    const iva = useMemo(() => impliedVsActual(cut.sectors, betasBySector, factorMoves), [cut, betasBySector, factorMoves]);
    const sigma = useMemo(() => residualSigma(residHist || []), [residHist]);
    const flagged = useMemo(() => flaggedSectors(iva, sigma), [iva, sigma]);
    const tRead = useMemo(() => transmissionRead(iva, sigma), [iva, sigma]);
    const ivaTop = useMemo(() => topResidualRows(iva, 5), [iva]);

    // Waterfall order = beat 03's transmission-strip order (share-weight
    // desc, the buildThemeView sort), so the eye tracks straight down.
    // Sectors absent from the strip append after, by P&L.
    const wfItems = useMemo(() => {
        const order = new Map((themeRows || []).map((r, i) => [r.theme, i]));
        const inStrip = cut.sectors.filter(s => order.has(s.sector)).sort((a, b) => order.get(a.sector) - order.get(b.sector));
        const rest = cut.sectors.filter(s => !order.has(s.sector));
        const isPct = valMode === '%';
        const scale = isPct && cut.totalMv ? 100 / cut.totalMv : 1;
        return inStrip.concat(rest).map(s => ({ sector: s.sector, value: s.pnl * scale }));
    }, [cut, themeRows, valMode]);

    // ── Beat 06 compute ───────────────────────────────────────
    // Pre-select 'Flagged sectors' only when beat 05 actually flagged
    // something (§3.2); user's later clicks stick.
    const [nameFilter, setNameFilter] = useState(null); // null = not yet auto-set
    const effFilter = nameFilter != null ? nameFilter : (flagged.length ? 'flagged' : 'all');
    const [nameView, setNameView] = useState('bars');
    const [heatKey, setHeatKey] = useState('daily_change_pct');
    const bars = useMemo(() => nameImpact(rows, period, { filter: effFilter === 'flagged' ? 'flagged' : 'all', flagged }), [rows, period, effFilter, flagged]);
    const heatRows = useMemo(() => (effFilter === 'flagged' && flagged.length ? rows.filter(r => flagged.indexOf(r.sector || 'Other') >= 0) : rows), [rows, effFilter, flagged]);
    const concentrations = useMemo(
        () => flagged.map(sec => residualConcentration(rows, period, iva.find(r => r.sector === sec))).filter(Boolean),
        [flagged, rows, period, iva]);
    const worst = bars.length ? bars[bars.length - 1] : null;
    const cortexNames = useMemo(() => {
        const sigByTk = new Map(((model && model.holdings) || []).filter(h => h.signal).map(h => [h.tk, h.signal]));
        return bars.filter(b => sigByTk.has(b.symbol)).map(b => ({ symbol: b.symbol, signal: sigByTk.get(b.symbol) }));
    }, [bars, model]);

    // Losing-streak for the largest detractor — one tiny price query.
    useEffect(() => {
        if (!sb || !worst || worst.pnl >= 0) { setStreakInfo(null); return; }
        let alive = true;
        sb.from('assets').select('id').eq('symbol', worst.symbol).limit(1)
            .then(a => {
                const id = a.data && a.data[0] && a.data[0].id;
                if (!id) return null;
                return sb.from('price_history').select('price_date, close').eq('asset_id', id)
                    .order('price_date', { ascending: false }).limit(12);
            })
            .then(ph => {
                if (!alive || !ph || ph.error || !ph.data) return;
                const closes = ph.data.slice().reverse().map(r => Number(r.close));
                setStreakInfo({ symbol: worst.symbol, streak: losingStreak(closes) });
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [worst && worst.symbol, worst && worst.pnl < 0]); // eslint-disable-line react-hooks/exhaustive-deps

    const nRead = useMemo(() => nameRead({
        concentrations,
        worst: worst && worst.pnl < 0 ? worst : null,
        streak: streakInfo && worst && streakInfo.symbol === worst.symbol ? streakInfo.streak : null,
        cortexNames,
    }), [concentrations, worst, streakInfo, cortexNames]);

    // ── Beat 07 compute ───────────────────────────────────────
    const [benchKey, setBenchKeyState] = useState(loadBenchKey);
    const setBenchKey = k => { setBenchKeyState(k); saveBenchKey(k); };
    const [scPeriod, setScPeriod] = useState('itd');
    const merged = useMemo(() => {
        if (!perfRows || !perfRows.length) return [];
        const byS = new Map((rows || []).map(r => [r.symbol, r]));
        return perfRows.map(p => {
            const h2 = byS.get(p.symbol) || {};
            return Object.assign({}, p, {
                market_value: p.market_value != null ? p.market_value : h2.market_value,
                sector: p.sector || h2.sector || 'Other',
            });
        });
    }, [perfRows, rows]);
    const brinson = useMemo(() => (merged.length ? computeBrinsonAttribution(merged, BENCHMARKS[benchKey].weights) : null), [merged, benchKey]);
    const trailing = useMemo(() => trailingEffects(attrHist || [], benchKey, 12), [attrHist, benchKey]);
    const verdicts = brinson ? {
        allocation: verdictForEffect(brinson.totals.allocation, trailing.allocation),
        selection: verdictForEffect(brinson.totals.selection, trailing.selection),
        interaction: verdictForEffect(brinson.totals.interaction, trailing.interaction),
    } : { allocation: null, selection: null, interaction: null };
    const scReadText = useMemo(() => scorecardRead(brinson, rotation), [brinson, rotation]);
    const scSectors = useMemo(() => {
        if (!brinson) return [];
        const byTotal = brinson.sectors.slice().sort((a, b) => b.totalEffect - a.totalEffect);
        const top3 = byTotal.slice(0, 3), bot3 = byTotal.slice(-3).filter(s => top3.indexOf(s) < 0);
        return top3.concat(bot3);
    }, [brinson]);
    const engineOf = s => {
        const a = Math.abs(s.allocationEffect), b = Math.abs(s.selectionEffect);
        if (a > 2 * b) return 'Rotation';
        if (b > 2 * a) return 'Names';
        return 'Both';
    };

    // ── Beat 08 state ─────────────────────────────────────────
    const [evMode, setEvMode] = useState('vs-portfolio');
    const [evType, setEvType] = useState('area');
    const [evTf, setEvTf] = useState('YTD');
    const [evNorm, setEvNorm] = useState(true);
    const [evIds, setEvIds] = useState(['portfolio']);
    const [evOverlays, setEvOverlays] = useState({ ma20: false, ma50: false, ma200: false, ema12: false, ema26: false, bb: false });
    const [evSub, setEvSub] = useState({ volume: false, rsi: false, macd: false, beta: true });
    const [rawById, setRawById] = useState({});
    const [fetchWarnings, setFetchWarnings] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [deadTickers, setDeadTickers] = useState({});
    const [evSearch, setEvSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const gate = useRef(makeRequestGate());
    const preloaded = useRef(false);

    // Portfolio series from NAV history.
    useEffect(() => {
        if (!navRows || !navRows.length) return;
        const series = navRows.slice()
            .sort((a, b) => (a.price_date < b.price_date ? -1 : 1))
            .map(r => ({ date: r.price_date, close: Number(r.nav) }))
            .filter(r => isFinite(r.close) && r.close > 0);
        setRawById(prev => Object.assign({}, prev, { portfolio: series }));
    }, [navRows]);

    // Asset catalog — for the search box. Availability is enforced at add
    // time (empty price_history fetch → warned + marked dead), which is
    // the fail-loud fix for §6.1 #1 without a full join over price_history.
    useOnce(ok => {
        if (!sb) return;
        Promise.all([
            sb.from('assets').select('id, symbol, name'),
            sb.from('positions').select('asset_id'),
        ]).then(res => {
            if (!ok(true)) return;
            const held = new Set((res[1].data || []).map(p => p.asset_id).filter(Boolean));
            const items = (res[0].data || []).filter(a => a.symbol).map(a => ({
                id: a.symbol, assetId: a.id, held: held.has(a.id),
                label: a.symbol + (a.name && a.name !== a.symbol ? ' — ' + a.name : ''),
            }));
            items.sort((a, b) => (a.held !== b.held ? (a.held ? -1 : 1) : a.id < b.id ? -1 : 1));
            setCatalog(items);
        }).catch(() => {});
    });

    const addEvidenceSeries = useCallback(item => {
        setEvIds(prev => (prev.length >= EV_MAX_SERIES || prev.indexOf(item.id) >= 0 ? prev : prev.concat([item.id])));
        if (rawById[item.id] || !item.assetId || !sb) return;
        const token = gate.current.next();
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 6);
        sb.from('price_history')
            .select('price_date, open, high, low, close, adjusted_close, volume')
            .eq('asset_id', item.assetId)
            .gte('price_date', cutoff.toISOString().slice(0, 10))
            .order('price_date', { ascending: false })
            .limit(1600)
            .then(res => {
                // A newer request supersedes: keyed writes are safe, but the
                // gate stops a late empty/error result from re-warning after
                // the user has moved on.
                if (res.error || !res.data || !res.data.length) {
                    if (!gate.current.isCurrent(token)) return;
                    setEvIds(prev => prev.filter(id => id !== item.id));
                    setDeadTickers(prev => Object.assign({}, prev, { [item.id]: res.error ? 'fetch failed' : 'no price history' }));
                    setFetchWarnings(prev => prev.concat([item.id + ': ' + (res.error ? 'price fetch failed — ' + res.error.message : 'no price history in the database — not plotted')]));
                    return;
                }
                const series = res.data.slice().reverse().map(d => ({
                    date: d.price_date,
                    open: Number(d.open) || Number(d.close) || 0,
                    high: Number(d.high) || Number(d.close) || 0,
                    low: Number(d.low) || Number(d.close) || 0,
                    close: Number(d.close || d.adjusted_close) || 0,
                    volume: Number(d.volume) || 0,
                }));
                setRawById(prev => Object.assign({}, prev, { [item.id]: series }));
            })
            .catch(err => {
                if (!gate.current.isCurrent(token)) return;
                setEvIds(prev => prev.filter(id => id !== item.id));
                setFetchWarnings(prev => prev.concat([item.id + ': price fetch failed — ' + (err && err.message)]));
            });
    }, [rawById]);

    // Beat 06 → beat 08 carry-through (§5.2): the names behind flagged
    // sectors' residuals are pre-loaded as series, once, when known.
    useEffect(() => {
        if (preloaded.current || !concentrations.length || !catalog.length) return;
        preloaded.current = true;
        concentrations.slice(0, 2).forEach(c => {
            const item = catalog.find(x => x.id === c.topName);
            if (item) addEvidenceSeries(item);
        });
    }, [concentrations, catalog, addEvidenceSeries]);

    // Alignment: portfolio is ALWAYS aligned (it is the reference frame
    // even when not drawn — §5.4); drawing is filtered by mode.
    const alignedIds = useMemo(() => (evIds.indexOf('portfolio') >= 0 ? evIds : ['portfolio'].concat(evIds)), [evIds]);
    const aligned = useMemo(() => alignSeries({ raw: rawById, ids: alignedIds, timeframe: evTf, normalise: evNorm }), [rawById, alignedIds, evTf, evNorm]);
    const drawnIds = useMemo(() => (evMode === 'vs-portfolio' ? evIds : evIds.filter(id => id !== 'portfolio')), [evMode, evIds]);
    const rf = useMemo(() => {
        const curve = macro && macro.yields && macro.yields.curve;
        const v = curve && curve.values && curve.values[0];
        return v != null && isFinite(v) ? v / 100 : 0.045;
    }, [macro]);
    const metrics = useMemo(() => {
        const drawn = aligned.series.filter(s => drawnIds.indexOf(s.id) >= 0);
        return computeMetrics({ dates: aligned.dates, series: aligned.series, referenceId: 'portfolio', rf })
            .filter(m => drawn.some(s => s.id === m.id));
    }, [aligned, drawnIds, rf]);
    const betaSub = useMemo(() => {
        if (!evSub.beta) return null;
        return aligned.series.filter(s => s.id !== 'portfolio' && drawnIds.indexOf(s.id) >= 0)
            .map(s => Object.assign({ id: s.id }, rollingBeta({ dates: aligned.dates, series: aligned.series, referenceId: 'portfolio', id: s.id, window: 60 })));
    }, [aligned, drawnIds, evSub.beta]);
    // no_data engine warnings are transient (fetch in flight) or already
    // reported with a reason by the fetch handler — drop them here.
    const allWarnings = useMemo(
        () => aligned.warnings.filter(w => w.kind !== 'no_data').map(w => w.text).concat(fetchWarnings),
        [aligned, fetchWarnings]);
    const candleDisabled = drawnIds.length > 1;
    useEffect(() => {
        if (candleDisabled && evType === 'candlestick') setEvType('line');
    }, [candleDisabled, evType]);

    const loading = homeRows == null;
    const totalPnl = cut.total;
    const isPctMode = valMode === '%';

    // ── render ────────────────────────────────────────────────
    return e('div', null,

        // ═══ BEAT 05 — Realized transmission ═══
        e(BeatHead, { no: '05', title: 'Realized transmission', why: 'Beat 03 says which factor should be hitting the book and how hard. This is what it actually cost — same sectors, same order, dollars instead of betas.' }),
        e('div', { style: { display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 14 } },
            e('div', { className: 'nf-card nf-fade' },
                e('div', { className: 'nf-card-h' },
                    e('div', null, e('h3', null, 'Sector P&L bridge'),
                        e('div', { className: 'nf-sub', style: { marginTop: 4 } },
                            'ordered to match the beat 03 strip · covered ' + Math.round(cut.covered * 100) + '% of book MV')),
                    e('div', { style: { display: 'flex', gap: 8 } },
                        e(Pills, { options: [{ value: '$', label: '$' }, { value: '%', label: '%' }], value: valMode, onChange: setValMode }),
                        e(Pills, {
                            options: [
                                { value: '1d', label: '1D' },
                                { value: '5d', label: '5D' },
                                { value: 'mtd', label: 'MTD', disabled: true, reason: 'No per-position MTD P&L source yet — needs position-level snapshot history. Disabled rather than approximated.' },
                            ], value: period, onChange: setPeriod,
                        }))),
                loading ? e('div', { className: 'nb-empty' }, 'Loading book…')
                    : e(WaterfallSvg, { items: wfItems, total: isPctMode && cut.totalMv ? totalPnl * 100 / cut.totalMv : totalPnl, isPct: isPctMode })),
            e('div', { className: 'nf-card nf-fade' },
                e('div', { className: 'nf-card-h' },
                    e('h3', null, 'Implied vs actual'),
                    flagged.length
                        ? e('span', { style: { fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '.1em', color: 'var(--amber)', border: '1px solid rgba(240,180,41,.3)', borderRadius: 3, padding: '2px 6px' } }, 'RESIDUAL > 1σ ON ' + flagged.length)
                        : e('span', {
                            title: residHist === null ? 'sector_pnl_residuals unavailable' : 'Needs ≥20 daily residual rows per sector in sector_pnl_residuals for a σ. Accruing, not faked.',
                            style: { fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '.1em', color: 'var(--text3)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 3, padding: '2px 6px' },
                        }, residHist && residHist.length ? '1σ FLAGS: NONE' : '1σ FLAGS: —')),
                e('div', { className: 'nf-sub', style: { marginBottom: 8 } },
                    'implied = Σ β_f × today\'s factor move × sector MV — the β and moves are beat 03\'s own values'
                    + (betasAsOf ? ' (prices to ' + betasAsOf + ')' : '')),
                e('div', { className: 'nf-table-scroll' },
                    e('table', { className: 'nf-table' },
                        e('thead', null, e('tr', null,
                            ['Sector', 'Implied', 'Actual', 'Residual'].map((h2, i) => e('th', { key: h2, className: i === 0 ? 'nf-l' : '' }, h2)))),
                        e('tbody', null, ivaTop.map(r => {
                            const pending = r.residual == null;
                            return e('tr', { key: r.sector, style: pending ? { opacity: 0.45 } : null },
                                e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk' }, r.sector)),
                                e('td', { className: 'nf-mono-cell' }, pending ? '—' : money(r.implied)),
                                e('td', { className: 'nf-mono-cell ' + toneOf(r.actual) }, money(r.actual)),
                                e('td', { className: 'nf-mono-cell ' + (pending ? 't3' : toneOf(r.residual)) },
                                    pending ? '— β pending' : money(r.residual)));
                        })))),
                e(ReadLine, { tag: 'Transmission read' }, tRead.text))),

        // ═══ BEAT 06 — Name impact ═══
        e(BeatHead, { no: '06', title: 'Name impact', why: 'The residual from beat 05 has to belong to somebody. Same period cut by name, with flagged sectors carried through so the funnel does not restart.' }),
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' },
                e('div', null, e('h3', null, 'Contribution to ' + (period === '1d' ? 'day' : '5-day') + ' P&L'),
                    e('div', { className: 'nf-sub', style: { marginTop: 4 } }, 'bars are the decision view, heatmap is the surface view — default is bars')),
                e('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                    e('span', { className: 'nf-sub', style: { letterSpacing: '.1em' } }, 'FILTER'),
                    e(Pills, {
                        options: [
                            { value: 'all', label: 'All' },
                            { value: 'flagged', label: 'Flagged sectors', disabled: !flagged.length, reason: flagged.length ? 'Names inside beat 05\'s >1σ sectors' : 'No sector currently exceeds 1σ residual (or no σ history yet)' },
                            { value: 'book', label: 'Book only' },
                        ], value: effFilter, onChange: setNameFilter,
                    }),
                    e(Pills, { options: [{ value: 'bars', label: 'Bars' }, { value: 'heat', label: 'Heatmap' }], value: nameView, onChange: setNameView }),
                    nameView === 'heat' ? e(Pills, { options: [{ value: 'daily_change_pct', label: 'Day %' }, { value: 'unrealised_return_pct', label: 'Total' }], value: heatKey, onChange: setHeatKey }) : null)),
            loading ? e('div', { className: 'nb-empty' }, 'Loading book…')
                : nameView === 'bars'
                    ? e(NameBars, { bars, isPct: isPctMode, totalMv: cut.totalMv })
                    : e(Heatmap, { rows: heatRows, colourKey: heatKey }),
            e(ReadLine, { tag: 'Name read' }, nRead)),

        // ═══ BEAT 07 — Decision scorecard ═══
        e(BeatHead, { no: '07', title: 'Decision scorecard', why: 'Nexus makes exactly two kinds of call: where to sit (beat 02) and what to own (beat 04). Brinson grades those two engines separately.' }),
        e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 } },
            [
                { key: 'allocation', label: 'Allocation effect', accent: 'var(--cyan)', engine: ['Grades the ', e('b', { key: 'b', style: { color: 'var(--cyan)' } }, 'rotation map'), '. Sector weights vs benchmark.'], labelFor: v => (v === 'WORKING' ? 'ROTATION ENGINE WORKING' : v === 'DRAG' ? 'ROTATION ENGINE DRAG' : 'ROTATION ENGINE FLAT') },
                { key: 'selection', label: 'Selection effect', accent: 'var(--success)', engine: ['Grades the ', e('b', { key: 'b', style: { color: 'var(--success)' } }, 'opportunities ledger'), '. Name picks inside sectors.'], labelFor: v => (v === 'WORKING' ? 'NAME ENGINE WORKING' : v === 'DRAG' ? 'NAME ENGINE DRAG' : 'NAME ENGINE FLAT') },
                { key: 'interaction', label: 'Interaction', accent: 'var(--violet, #8b7bd8)', engine: ['Overweighting the sectors we also picked well in — the two engines agreeing.'], labelFor: v => (v === 'WORKING' ? 'ALIGNED' : v === 'DRAG' ? 'FIGHTING' : 'NEUTRAL') },
            ].map(t => {
                const v = brinson ? brinson.totals[t.key] : null;
                return e('div', { key: t.key, className: 'nf-card nf-fade', style: { position: 'relative', overflow: 'hidden' } },
                    e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: t.accent } }),
                    e('div', { style: { fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--text3)' } }, t.label),
                    e('div', { className: toneOf(v), style: { fontFamily: 'var(--fm)', fontSize: 26, margin: '7px 0 3px' } }, fpct(v)),
                    e('div', { style: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 } }, t.engine),
                    e(VerdictBadge, { verdict: verdicts[t.key], labelFor: t.labelFor }));
            })),
        e('div', { className: 'nf-card nf-fade', style: { marginTop: 14 } },
            e('div', { className: 'nf-card-h' },
                e('h3', null, 'Where the active return came from'),
                e('div', { style: { display: 'flex', gap: 8 } },
                    e(Pills, {
                        options: Object.keys(BENCHMARKS).map(k => ({ value: k, label: BENCHMARKS[k].label, reason: BENCHMARKS[k].desc })),
                        value: benchKey, onChange: setBenchKey,
                    }),
                    e(Pills, {
                        options: [
                            { value: 'qtd', label: 'QTD', disabled: true, reason: 'Position-level QTD returns are not stored yet — attribution runs on inception-to-date returns until attribution_history accrues period snapshots.' },
                            { value: 'ytd', label: 'YTD', disabled: true, reason: 'Position-level YTD returns are not stored yet — attribution runs on inception-to-date returns until attribution_history accrues period snapshots.' },
                            { value: 'itd', label: 'ITD' },
                        ], value: scPeriod, onChange: setScPeriod,
                    }))),
            brinson ? e('div', null,
                e('div', { className: 'nf-table-scroll' },
                    e('table', { className: 'nf-table' },
                        e('thead', null, e('tr', null,
                            ['Sector', 'Active wt', 'Allocation', 'Selection', 'Total', 'Engine'].map((h2, i) => e('th', { key: h2, className: i === 0 ? 'nf-l' : '' }, h2)))),
                        e('tbody', null,
                            scSectors.map(s => e('tr', { key: s.sector },
                                e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk' }, s.sector)),
                                e('td', { className: 'nf-mono-cell ' + toneOf(s.activeWeight) }, fpct(s.activeWeight, 1)),
                                e('td', { className: 'nf-mono-cell ' + toneOf(s.allocationEffect) }, fpct(s.allocationEffect)),
                                e('td', { className: 'nf-mono-cell ' + toneOf(s.selectionEffect) }, fpct(s.selectionEffect)),
                                e('td', { className: 'nf-mono-cell ' + toneOf(s.totalEffect) }, fpct(s.totalEffect)),
                                e('td', { className: 'nf-mono-cell t3' }, engineOf(s)))),
                            e('tr', null,
                                e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk', style: { color: 'var(--cyan)' } }, 'Total · ' + merged.length + ' pos')),
                                e('td', { className: 'nf-mono-cell t3' }, '—'),
                                e('td', { className: 'nf-mono-cell ' + toneOf(brinson.totals.allocation) }, fpct(brinson.totals.allocation)),
                                e('td', { className: 'nf-mono-cell ' + toneOf(brinson.totals.selection) }, fpct(brinson.totals.selection)),
                                e('td', { className: 'nf-mono-cell ' + toneOf(brinson.totals.total) }, fpct(brinson.totals.total)),
                                e('td', { className: 'nf-mono-cell t3' }, '—'))))),
                e(ReadLine, { tag: 'Scorecard read' },
                    scReadText, e('br', null),
                    e('span', { className: 'nf-sub' }, 'Full Brinson-Fachler by sector, position-level attribution and the complete table live in ',
                        e('a', {
                            href: '#', style: { color: 'var(--cyan)' },
                            onClick: ev => { ev.preventDefault(); window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'performance' } })); },
                        }, 'PERF → Brinson Analysis'), '. Both read the same attribution engine.')))
                : e('div', { className: 'nb-empty' }, 'Attribution needs vw_performance_suite rows with sectors — none loaded.')),

        // ═══ BEAT 08 — Evidence ═══
        e(BeatHead, { no: '08', title: 'Evidence', why: 'Everything above is an assertion. This is the bench where you test one: chart anything against the book and read the metrics off the exact window you are looking at.' }),
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h', style: { flexWrap: 'wrap', gap: 8 } },
                e('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
                    e(Pills, { options: [{ value: 'vs-portfolio', label: 'vs Portfolio' }, { value: 'asset-vs-asset', label: 'Asset vs asset' }], value: evMode, onChange: setEvMode }),
                    e(Pills, {
                        options: [
                            { value: 'area', label: 'Area' }, { value: 'line', label: 'Line' },
                            { value: 'candlestick', label: 'Candle', disabled: candleDisabled, reason: candleDisabled ? 'Candles need exactly one drawn series — remove the others first.' : 'OHLC candles' },
                        ], value: evType, onChange: setEvType,
                    }),
                    e(Pills, { options: TIMEFRAMES.map(tf => ({ value: tf, label: tf })), value: evTf, onChange: setEvTf }),
                    e(Pills, { options: [{ value: 'on', label: 'Normalise' }, { value: 'off', label: 'Raw' }], value: evNorm ? 'on' : 'off', onChange: v => setEvNorm(v === 'on') })),
                evNorm ? e('span', { style: { fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '.1em', color: 'var(--amber)', border: '1px solid rgba(240,180,41,.3)', borderRadius: 3, padding: '2px 6px' } },
                    'REBASED TO COMMON START' + (aligned.commonStart ? ' · ' + aligned.commonStart : '')) : null),
            e('div', { style: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 } },
                // series rail
                e('div', null,
                    e('div', { className: 'nf-sub', style: { letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 8 } }, 'Series'),
                    evIds.map((id, i) => e('div', {
                        key: id,
                        style: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.02)', border: '1px solid rgba(58,214,224,.14)', borderRadius: 5, padding: '8px 10px', marginBottom: 6, fontFamily: 'var(--fm)', fontSize: 10.5 },
                    },
                        e('span', { style: { width: 7, height: 7, borderRadius: '50%', background: EV_PALETTE[i % EV_PALETTE.length], flex: '0 0 auto' } }),
                        id === 'portfolio' ? 'ATLAS Portfolio' : id,
                        id === 'portfolio' && evMode === 'vs-portfolio'
                            ? e('span', { style: { marginLeft: 'auto', color: 'var(--text3)', fontSize: 9, letterSpacing: '.1em' } }, 'LOCKED')
                            : e('span', {
                                style: { marginLeft: 'auto', color: 'var(--text3)', cursor: 'pointer' },
                                onClick: () => setEvIds(prev => prev.filter(x => x !== id)),
                            }, '×'))),
                    evIds.length < EV_MAX_SERIES ? e('div', { style: { position: 'relative' } },
                        e('input', {
                            placeholder: catalog.length ? 'Add asset, benchmark or fund' : 'Loading assets…',
                            value: evSearch,
                            onChange: ev => { setEvSearch(ev.target.value); setShowAdd(true); },
                            onFocus: () => setShowAdd(true),
                            onBlur: () => setTimeout(() => setShowAdd(false), 150),
                            style: { width: '100%', background: 'rgba(255,255,255,.02)', border: '1px solid rgba(58,214,224,.14)', borderRadius: 5, color: 'var(--text2)', padding: '8px 10px', fontFamily: 'var(--fm)', fontSize: 10.5, boxSizing: 'border-box' },
                        }),
                        showAdd && catalog.length ? e('div', {
                            style: { position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, maxHeight: 220, overflowY: 'auto', background: '#0c1119', border: '1px solid rgba(58,214,224,.25)', borderRadius: 5 },
                        }, catalog
                            .filter(c => evIds.indexOf(c.id) < 0 && (!evSearch || c.label.toLowerCase().indexOf(evSearch.toLowerCase()) >= 0))
                            .slice(0, 20)
                            .map(c => e('div', {
                                key: c.id,
                                onMouseDown: ev => {
                                    ev.preventDefault();
                                    if (deadTickers[c.id]) return;
                                    addEvidenceSeries(c);
                                    setEvSearch('');
                                    setShowAdd(false);
                                },
                                title: deadTickers[c.id] ? c.id + ': ' + deadTickers[c.id] : c.label,
                                style: { padding: '6px 10px', fontFamily: 'var(--fm)', fontSize: 10.5, cursor: deadTickers[c.id] ? 'not-allowed' : 'pointer', color: deadTickers[c.id] ? 'var(--text3)' : 'var(--text2)', textDecoration: deadTickers[c.id] ? 'line-through' : 'none' },
                            }, c.label + (c.held ? '  ·  held' : '') + (deadTickers[c.id] ? '  (' + deadTickers[c.id] + ')' : '')))) : null) : null,
                    concentrations.length ? e('div', { className: 'nf-sub', style: { marginTop: 10, lineHeight: 1.5 } },
                        'Carried in from beat 06: ',
                        e('span', { style: { color: 'var(--cyan)' } }, concentrations.slice(0, 2).map(c => c.topName).join(', ')),
                        ' — the flagged-sector residual name' + (concentrations.length > 1 ? 's' : '') + ', pre-loaded here.') : null,
                    e('div', { className: 'nf-sub', style: { letterSpacing: '.15em', textTransform: 'uppercase', margin: '16px 0 8px' } }, 'Overlays'),
                    e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                        [['ma20', 'MA20'], ['ma50', 'MA50'], ['ma200', 'MA200'], ['ema12', 'EMA12'], ['ema26', 'EMA26'], ['bb', 'BB(20,2)']].map(([k, lbl]) =>
                            e('button', {
                                key: k, onClick: () => setEvOverlays(p => Object.assign({}, p, { [k]: !p[k] })),
                                style: { background: evOverlays[k] ? 'rgba(58,214,224,.13)' : 'none', border: '1px solid rgba(58,214,224,.14)', borderRadius: 4, color: evOverlays[k] ? 'var(--cyan)' : 'var(--text3)', fontFamily: 'var(--fm)', fontSize: 9.5, padding: '3px 7px', cursor: 'pointer' },
                            }, lbl))),
                    e('div', { className: 'nf-sub', style: { letterSpacing: '.15em', textTransform: 'uppercase', margin: '12px 0 8px' } }, 'Subplots'),
                    e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
                        [['volume', 'Volume'], ['rsi', 'RSI(14)'], ['macd', 'MACD'], ['beta', 'β60 vs portfolio']].map(([k, lbl]) =>
                            e('button', {
                                key: k, onClick: () => setEvSub(p => Object.assign({}, p, { [k]: !p[k] })),
                                style: { background: evSub[k] ? 'rgba(58,214,224,.13)' : 'none', border: '1px solid rgba(58,214,224,.14)', borderRadius: 4, color: evSub[k] ? 'var(--cyan)' : 'var(--text3)', fontFamily: 'var(--fm)', fontSize: 9.5, padding: '3px 7px', cursor: 'pointer' },
                            }, lbl)))),
                // chart + metrics
                e('div', null,
                    aligned.dates.length
                        ? e(EvidenceChart, { aligned, drawnIds, chartType: evType, subplots: evSub, overlays: evOverlays, normalise: evNorm, betaSub })
                        : e('div', { className: 'nb-empty' }, 'Portfolio NAV history loading — the bench charts once vw_portfolio_nav_daily responds.'),
                    allWarnings.length ? e('div', { style: { marginTop: 8, fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--amber)', lineHeight: 1.6 } },
                        allWarnings.slice(0, 6).map((w, i) => e('div', { key: i }, '⚠ ' + w))) : null,
                    e('div', { className: 'nf-table-scroll', style: { marginTop: 14 } },
                        e('table', { className: 'nf-table' },
                            e('thead', null, e('tr', null,
                                ['Series', 'Total ret', 'Ann. ret', 'Vol', 'Max DD', 'Sharpe', 'Beta', 'Corr', 'Up/Down'].map((h2, i) => e('th', { key: h2, className: i === 0 ? 'nf-l' : '' }, h2)))),
                            e('tbody', null, metrics.map(m => {
                                if (m.insufficient) {
                                    return e('tr', { key: m.id, style: { opacity: 0.45 } },
                                        e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk' }, m.id === 'portfolio' ? 'ATLAS Portfolio' : m.id)),
                                        e('td', { className: 'nf-mono-cell t3', colSpan: 8 }, 'insufficient history in this window (' + m.obs + ' obs, need 20)'));
                                }
                                return e('tr', { key: m.id },
                                    e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk' }, m.id === 'portfolio' ? 'ATLAS Portfolio' : m.id)),
                                    e('td', { className: 'nf-mono-cell ' + toneOf(m.totalReturn) }, fpct(m.totalReturn)),
                                    e('td', { className: 'nf-mono-cell ' + toneOf(m.annReturn) }, fpct(m.annReturn, 1)),
                                    e('td', { className: 'nf-mono-cell' }, m.vol == null ? '—' : (m.vol * 100).toFixed(1) + '%'),
                                    e('td', { className: 'nf-mono-cell tone-down' }, m.maxDD == null ? '—' : (m.maxDD * 100).toFixed(1) + '%'),
                                    e('td', { className: 'nf-mono-cell' }, m.sharpe == null ? '—' : m.sharpe.toFixed(2)),
                                    e('td', { className: 'nf-mono-cell' }, m.beta == null ? '—' : m.beta.toFixed(2)),
                                    e('td', { className: 'nf-mono-cell' }, m.corr == null ? '—' : m.corr.toFixed(2)),
                                    e('td', { className: 'nf-mono-cell' },
                                        m.upCapture == null ? '—' : Math.round(m.upCapture) + ' / ' + (m.downCapture == null ? '—' : Math.round(m.downCapture))));
                            })))),
                    e('div', { className: 'nf-sub', style: { marginTop: 8, lineHeight: 1.5 } },
                        'Metrics computed on the ' + evTf + ' window shown, from the same aligned series the chart draws. '
                        + 'Beta, correlation and up/down capture are measured against ATLAS Portfolio'
                        + (evMode === 'asset-vs-asset' ? ' (still the reference frame even though it is not drawn)' : '') + '. '
                        + 'Non-trading days are forward-filled to the portfolio calendar. '
                        + 'Sharpe risk-free: ' + (macro && macro.yields && macro.yields.curve && macro.yields.curve.values && macro.yields.curve.values[0] != null
                            ? macro.yields.curve.values[0].toFixed(2) + '% (3M Treasury via /api/macro)'
                            : '4.50% (macro feed down — fallback)') + '.')))));
}

export default NexusRealizedLayer;
