import Plotly from 'plotly.js-dist-min';
import Chart from 'chart.js/auto';
import React from 'react';
// ============================================================
// ATLAS Terminal — Quant Panel: Position Signals
// ------------------------------------------------------------
// Consumes vw_quant_dashboard — per-position regime, RSI-14,
// Z-20D, ATR-14, BB width, 52W range, momentum.
// Renders RSI histogram + Z-score distribution + RSI/Z scatter
// + signal card grid (replaces table).
// ============================================================

import { fmt, fmtCurrency, cls, badgeCls, rsiFillStyle, useChart } from './utils.js';
import { NarrativeStrip } from './components.js';

const { useState, useEffect, useRef } = React;

// ---- RSI vs Z-Score Plotly scatter -------------------------

function SignalScatter({ rows }) {
    const ref = useRef(null);
    useEffect(function() {
        if (!rows || !rows.length || !ref.current) return;
        const regimeColors = { Uptrend: '#10b981', Downtrend: '#ef4444', Sideways: '#f59e0b' };
        const groups = {};
        rows.forEach(function(r) {
            const regime = r.price_regime || 'Sideways';
            if (!groups[regime]) groups[regime] = { x: [], y: [], text: [] };
            const rsi = Number(r.rsi_14);
            const z   = Number(r.zscore_20d);
            if (!isNaN(rsi) && !isNaN(z)) {
                groups[regime].x.push(rsi);
                groups[regime].y.push(z);
                groups[regime].text.push(r.symbol);
            }
        });

        const traces = Object.keys(groups).map(function(regime) {
            const g = groups[regime];
            return {
                type: 'scatter', mode: 'markers+text', name: regime,
                x: g.x, y: g.y, text: g.text,
                textposition: 'top center',
                textfont: { size: 8, color: 'rgba(255,255,255,0.65)', family: 'JetBrains Mono' },
                marker: {
                    size: 18,
                    color: regimeColors[regime] || '#6366f1',
                    opacity: 0.82,
                    line: { width: 1, color: 'rgba(255,255,255,0.15)' },
                },
                hovertemplate: '<b>%{text}</b><br>RSI: %{x:.1f}<br>Z-Score: %{y:.2f}<extra></extra>',
            };
        });

        Plotly.react(ref.current, traces, {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: 'rgba(255,255,255,0.45)', family: 'JetBrains Mono', size: 10 },
            showlegend: true,
            legend: { bgcolor: 'rgba(0,0,0,0)', font: { size: 10, color: 'rgba(255,255,255,0.55)' }, x: 1.01, y: 1 },
            margin: { l: 48, r: 90, t: 10, b: 50 },
            xaxis: {
                title: { text: 'RSI-14', font: { size: 11 } },
                range: [0, 100], gridcolor: 'rgba(255,255,255,0.05)', zeroline: false,
                tickfont: { size: 10 },
            },
            yaxis: {
                title: { text: 'Z-Score (20D)', font: { size: 11 } },
                range: [-3.5, 3.5], gridcolor: 'rgba(255,255,255,0.05)',
                zeroline: true, zerolinecolor: 'rgba(255,255,255,0.1)',
                tickfont: { size: 10 },
            },
            shapes: [
                // RSI overbought / oversold vertical lines
                { type: 'line', x0: 70, x1: 70, y0: -3.5, y1: 3.5, line: { color: 'rgba(239,68,68,0.25)', width: 1, dash: 'dot' } },
                { type: 'line', x0: 30, x1: 30, y0: -3.5, y1: 3.5, line: { color: 'rgba(16,185,129,0.25)', width: 1, dash: 'dot' } },
                // Z-score ±2 horizontal lines
                { type: 'line', x0: 0, x1: 100, y0:  2, y1:  2, line: { color: 'rgba(239,68,68,0.2)',   width: 1, dash: 'dot' } },
                { type: 'line', x0: 0, x1: 100, y0: -2, y1: -2, line: { color: 'rgba(16,185,129,0.2)', width: 1, dash: 'dot' } },
            ],
            annotations: [
                { x: 85, y:  3.3, text: 'Overbought', font: { size: 9, color: 'rgba(239,68,68,0.45)' },  showarrow: false },
                { x: 15, y: -3.3, text: 'Oversold',   font: { size: 9, color: 'rgba(16,185,129,0.45)' }, showarrow: false },
            ],
        }, { responsive: true, displayModeBar: false });
    }, [rows]);
    return React.createElement('div', { ref: ref, style: { height: 300 } });
}

// ---- Per-position signal card ------------------------------

function SignalCard({ row: r }) {
    const h = React.createElement;

    const rsi = Number(r.rsi_14);
    const z   = Number(r.zscore_20d);
    const mom = r.momentum_pct_rank_20d != null ? Number(r.momentum_pct_rank_20d) : null;

    const rsiOk   = !isNaN(rsi);
    const zOk     = !isNaN(z);
    const rsiColor = !rsiOk ? 'rgba(255,255,255,0.4)' : rsi >= 70 ? '#ef4444' : rsi <= 30 ? '#10b981' : '#a5b4fc';
    const zColor   = !zOk   ? 'rgba(255,255,255,0.4)' : Math.abs(z) >= 2 ? (z > 0 ? '#ef4444' : '#10b981') : 'rgba(255,255,255,0.55)';
    const momColor = mom == null ? 'rgba(255,255,255,0.3)' : mom > 80 ? '#10b981' : mom < 20 ? '#ef4444' : 'rgba(255,255,255,0.55)';

    const regColor = r.price_regime === 'Uptrend' ? '#10b981' : r.price_regime === 'Downtrend' ? '#ef4444' : '#f59e0b';
    const volColor = r.vol_regime === 'High'      ? '#ef4444' : r.vol_regime === 'Elevated' ? '#f59e0b' : r.vol_regime === 'Normal' ? '#a5b4fc' : '#10b981';
    const mrColor  = r.mean_reversion_signal === 'Overbought' ? '#ef4444' : r.mean_reversion_signal === 'Oversold' ? '#10b981' : 'rgba(255,255,255,0.35)';

    // RSI cursor: 0-100 position
    const rsiFill = rsiOk ? Math.max(0, Math.min(100, rsi)) : 50;
    // Z-score bar grows from center (50%) in either direction, max ±3
    const zFillW  = zOk ? (Math.min(Math.abs(z), 3) / 3 * 50).toFixed(1) + '%' : '0%';
    const zSide   = zOk && z < 0 ? 'right' : 'left';

    const pill = function(txt, col) {
        return h('span', { style: { fontSize: 9, padding: '1px 6px', borderRadius: 3, background: col + '28', color: col, fontWeight: 700, letterSpacing: 0.3 } }, txt);
    };

    function nav(tab) {
        window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: tab, symbol: r.symbol } }));
    }

    return h('div', { style: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', position: 'relative', overflow: 'hidden' } },
        // Regime accent bar
        h('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: regColor } }),
        // Header — symbol is clickable → Equity Research
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 } },
            h('span', {
                title: 'Research ' + r.symbol,
                onClick: function() { nav('equity'); },
                style: { fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: '#00d4ff',
                         cursor: 'pointer', borderBottom: '1px dotted rgba(0,212,255,0.4)' }
            }, r.symbol),
            h('div', { style: { display: 'flex', gap: 4 } },
                pill((r.price_regime || '—').replace('trend', ''), regColor),
                pill(r.vol_regime || '—', volColor)
            )
        ),
        // Price
        h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'JetBrains Mono', marginBottom: 10 } },
            r.current_price ? '$' + Number(r.current_price).toFixed(2) : '—'),
        // RSI gauge
        h('div', { style: { marginBottom: 7 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 2 } },
                h('span', { style: { fontSize: 9, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'RSI'),
                h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: rsiColor } }, rsiOk ? rsi.toFixed(0) : '—')
            ),
            h('div', { style: { height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' } },
                h('div', { style: { position: 'absolute', left: 0, width: '30%', height: '100%', background: 'rgba(16,185,129,0.14)' } }),
                h('div', { style: { position: 'absolute', right: 0, width: '30%', height: '100%', background: 'rgba(239,68,68,0.14)' } }),
                rsiOk ? h('div', { style: { position: 'absolute', left: rsiFill + '%', transform: 'translateX(-50%)', width: 3, height: '100%', background: rsiColor, borderRadius: 2 } }) : null
            )
        ),
        // Z-Score bar
        h('div', { style: { marginBottom: 10 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 2 } },
                h('span', { style: { fontSize: 9, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Z-Score'),
                h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: zColor } }, zOk ? (z >= 0 ? '+' : '') + z.toFixed(2) : '—')
            ),
            h('div', { style: { height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' } },
                h('div', { style: { position: 'absolute', left: '50%', width: 1, height: '100%', background: 'rgba(255,255,255,0.18)' } }),
                zOk ? h('div', { style: { position: 'absolute', [zSide]: '50%', width: zFillW, height: '100%', background: zColor, borderRadius: zSide === 'left' ? '0 3px 3px 0' : '3px 0 0 3px' } }) : null
            )
        ),
        // Bottom: momentum + mean-reversion
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
            h('div', { style: { fontSize: 9 } },
                h('span', { style: { color: 'rgba(255,255,255,0.28)', marginRight: 4 } }, 'MOM'),
                h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: momColor } }, mom != null ? mom.toFixed(0) + '%' : '—')
            ),
            pill(r.mean_reversion_signal || 'Neutral', mrColor)
        ),
        // Action row
        h('div', { style: { display: 'flex', gap: 5, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8 } },
            h('button', { onClick: function() { nav('trading'); }, title: 'Trade ' + r.symbol,
                style: { flex: 1, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)',
                         borderRadius: 4, padding: '3px 0', fontSize: 9, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 } }, '▶ Trade'),
            h('button', { onClick: function() { nav('valuation'); }, title: 'Value ' + r.symbol,
                style: { flex: 1, background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)',
                         borderRadius: 4, padding: '3px 0', fontSize: 9, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 } }, '◆ Value')
        )
    );
}

export function SignalsPanel({ rows }) {
    const [sortKey, setSortKey] = useState('rsi_14');
    const [sortDir, setSortDir] = useState('desc');
    const rsiRef = useRef(null);
    const zRef   = useRef(null);

    if (!rows || !rows.length) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'empty-state' }, 'No quant signals available — awaiting price history.'));
    }

    // === Regime aggregation ===
    const trendCounts = { Uptrend: 0, Sideways: 0, Downtrend: 0, Other: 0 };
    const volCounts   = { Low: 0, Normal: 0, Elevated: 0, High: 0, Other: 0 };
    const mrCounts    = { Oversold: 0, Neutral: 0, Overbought: 0, Other: 0 };
    rows.forEach(r => {
        const tr = r.price_regime || 'Other';
        trendCounts[tr] != null ? trendCounts[tr]++ : trendCounts.Other++;
        const vr = r.vol_regime || 'Other';
        volCounts[vr]  != null ? volCounts[vr]++  : volCounts.Other++;
        const mr = r.mean_reversion_signal || 'Other';
        mrCounts[mr]   != null ? mrCounts[mr]++   : mrCounts.Other++;
    });

    const rsiVals    = rows.map(r => Number(r.rsi_14)).filter(v => !isNaN(v));
    const overbought = rsiVals.filter(v => v >= 70).length;
    const oversold   = rsiVals.filter(v => v <= 30).length;
    const meanRsi    = rsiVals.length ? rsiVals.reduce((a, b) => a + b, 0) / rsiVals.length : null;
    const zVals      = rows.map(r => Number(r.zscore_20d)).filter(v => !isNaN(v));
    const extremeHigh = zVals.filter(v => v >= 2).length;
    const extremeLow  = zVals.filter(v => v <= -2).length;

    // === Charts ===
    useChart(rsiRef, () => {
        if (!rsiVals.length) return null;
        const edges = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100.01];
        const counts = new Array(edges.length - 1).fill(0);
        rsiVals.forEach(v => {
            for (let i = 0; i < edges.length - 1; i++) {
                if (v >= edges[i] && v < edges[i + 1]) { counts[i]++; break; }
            }
        });
        const labels = edges.slice(0, -1).map((e, i) => e + '–' + (edges[i + 1] > 100 ? 100 : edges[i + 1]));
        const colors = edges.slice(0, -1).map(lo =>
            lo >= 70 ? 'rgba(239,68,68,0.75)' : lo >= 60 ? 'rgba(245,158,11,0.60)' :
            lo >= 40 ? 'rgba(100,150,255,0.45)' : lo >= 30 ? 'rgba(16,185,129,0.40)' : 'rgba(16,185,129,0.75)');
        return {
            type: 'bar',
            data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
                },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y + ' positions' } } }
            }
        };
    }, [rows]);

    useChart(zRef, () => {
        if (!zVals.length) return null;
        const edges = [-4, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4.01];
        const counts = new Array(edges.length - 1).fill(0);
        zVals.forEach(v => {
            for (let i = 0; i < edges.length - 1; i++) {
                if (v >= edges[i] && v < edges[i + 1]) { counts[i]++; break; }
            }
        });
        const labels = edges.slice(0, -1).map((e, i) => e.toFixed(1) + '→' + (edges[i + 1] > 4 ? '4' : edges[i + 1].toFixed(1)));
        const colors = edges.slice(0, -1).map(lo =>
            lo >= 2   ? 'rgba(239,68,68,0.75)' : lo >= 1 ? 'rgba(245,158,11,0.55)' :
            lo >= -1  ? 'rgba(100,150,255,0.45)' : lo >= -2 ? 'rgba(245,158,11,0.55)' : 'rgba(16,185,129,0.75)');
        return {
            type: 'bar',
            data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 9 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.04)' } }
                },
                plugins: { legend: { display: false } }
            }
        };
    }, [rows]);

    // === Narrative ===
    const n = rows.length;
    const pctOf = x => n ? ((x / n) * 100).toFixed(0) + '%' : 'n/a';
    const narrative = [
        { icon: '▲', text: 'Trend mix: <strong class="pos">' + trendCounts.Uptrend + '</strong> uptrend, <strong>' + trendCounts.Sideways + '</strong> sideways, <strong class="neg">' + trendCounts.Downtrend + '</strong> downtrend (' + pctOf(trendCounts.Uptrend) + ' bullish).' },
        { icon: '◆', text: 'RSI: <strong class="neg">' + overbought + '</strong> overbought (≥70), <strong class="pos">' + oversold + '</strong> oversold (≤30), mean = <span class="mono">' + (meanRsi != null ? meanRsi.toFixed(1) : 'n/a') + '</span>.' },
        { icon: '◈', text: 'Z-20D: <strong class="neg">' + extremeHigh + '</strong> stretched (Z≥2), <strong class="pos">' + extremeLow + '</strong> depressed (Z≤-2)  ·  Vol: <strong>' + volCounts.High + '</strong> high, <strong>' + volCounts.Elevated + '</strong> elevated, <strong>' + volCounts.Normal + '</strong> normal.' }
    ];

    // === Card grid sort ===
    const SORT_OPTS = [
        { key: 'rsi_14', label: 'RSI' },
        { key: 'zscore_20d', label: 'Z-Score' },
        { key: 'momentum_pct_rank_20d', label: 'Momentum' },
        { key: 'annualised_vol_20d', label: 'Volatility' },
        { key: 'symbol', label: 'Symbol' },
    ];

    const sorted = [...rows].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1; if (bv == null) return -1;
        const cmp = (!isNaN(Number(av)) && !isNaN(Number(bv)))
            ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
    });

    return React.createElement('div', null,
        React.createElement(NarrativeStrip, { items: narrative }),

        // Histograms row
        React.createElement('div', { className: 'grid-2', style: { marginBottom: 16 } },
            React.createElement('div', { className: 'card' },
                React.createElement('div', { className: 'card-title' }, 'RSI-14 Distribution'),
                React.createElement('div', { className: 'chart-pane' }, React.createElement('canvas', { ref: rsiRef }))
            ),
            React.createElement('div', { className: 'card' },
                React.createElement('div', { className: 'card-title' }, 'Z-Score (20D) Distribution'),
                React.createElement('div', { className: 'chart-pane' }, React.createElement('canvas', { ref: zRef }))
            )
        ),

        // RSI vs Z-Score scatter
        React.createElement('div', { className: 'card', style: { marginBottom: 16 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 } },
                React.createElement('div', { className: 'card-title', style: { margin: 0 } }, 'RSI vs Z-Score  ·  Regime Quadrant Map'),
                React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'Figtree' } },
                    'Top-right = overbought & stretched  ·  Bottom-left = oversold & depressed')
            ),
            React.createElement(SignalScatter, { rows: rows })
        ),

        // Signal card grid
        React.createElement('div', { className: 'card' },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
                React.createElement('div', { className: 'card-title', style: { margin: 0 } }, 'Position Signals  ·  ' + rows.length + ' positions'),
                React.createElement('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                    React.createElement('span', { style: { fontSize: 9.5, color: 'rgba(255,255,255,0.28)', fontFamily: 'Figtree', marginRight: 2 } }, 'Sort:'),
                    SORT_OPTS.map(function(opt) {
                        const a = sortKey === opt.key;
                        return React.createElement('button', {
                            key: opt.key,
                            onClick: function() {
                                if (sortKey === opt.key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
                                else { setSortKey(opt.key); setSortDir('desc'); }
                            },
                            style: { background: a ? 'rgba(0,212,255,0.13)' : 'rgba(255,255,255,0.04)', color: a ? '#00d4ff' : 'rgba(255,255,255,0.38)', border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'), borderRadius: 5, padding: '3px 9px', fontSize: 9.5, fontWeight: a ? 700 : 400, cursor: 'pointer', fontFamily: 'Figtree' }
                        }, opt.label + (a ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''));
                    })
                )
            ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 } },
                sorted.map(function(r) {
                    return React.createElement(SignalCard, { key: r.symbol, row: r });
                })
            )
        )
    );
}
