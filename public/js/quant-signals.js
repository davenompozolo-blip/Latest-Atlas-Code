// ============================================================
// ATLAS Terminal — Quant Panel: Position Signals
// ------------------------------------------------------------
// Consumes vw_quant_dashboard — per-position regime, RSI-14,
// Z-20D, ATR-14, BB width, 52W range, momentum.
// Renders RSI histogram + Z-score distribution + narrative + table.
// ============================================================

import { fmt, fmtCurrency, cls, badgeCls, rsiFillStyle, useChart } from './utils.js';
import { NarrativeStrip } from './components.js';

const { useState, useRef } = React;

export function SignalsPanel({ rows }) {
    const [sortKey, setSortKey] = useState('zscore_20d');
    const [sortDir, setSortDir] = useState('desc');
    const rsiRef = useRef(null);
    const zRef   = useRef(null);

    if (!rows || !rows.length) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'empty-state' },
                'No quant signals available — awaiting price history.'));
    }

    // === Regime / signal aggregation ===
    const trendCounts = { Uptrend: 0, Sideways: 0, Downtrend: 0, Other: 0 };
    const volCounts   = { Low: 0, Normal: 0, Elevated: 0, High: 0, Other: 0 };
    const mrCounts    = { Oversold: 0, Neutral: 0, Overbought: 0, Other: 0 };
    rows.forEach(r => {
        const tr = r.price_regime || 'Other';
        trendCounts[tr] != null ? trendCounts[tr]++ : trendCounts.Other++;
        const vr = r.vol_regime || 'Other';
        volCounts[vr] != null ? volCounts[vr]++ : volCounts.Other++;
        const mr = r.mean_reversion_signal || 'Other';
        mrCounts[mr] != null ? mrCounts[mr]++ : mrCounts.Other++;
    });

    const rsiVals = rows.map(r => Number(r.rsi_14)).filter(v => !isNaN(v));
    const overbought = rsiVals.filter(v => v >= 70).length;
    const oversold   = rsiVals.filter(v => v <= 30).length;
    const meanRsi    = rsiVals.length ? rsiVals.reduce((a, b) => a + b, 0) / rsiVals.length : null;

    const zVals = rows.map(r => Number(r.zscore_20d)).filter(v => !isNaN(v));
    const extremeHigh = zVals.filter(v => v >= 2).length;
    const extremeLow  = zVals.filter(v => v <= -2).length;

    // === RSI histogram (10-wide bins) ===
    useChart(rsiRef, () => {
        if (!rsiVals.length) return null;
        const edges = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100.01];
        const counts = new Array(edges.length - 1).fill(0);
        rsiVals.forEach(v => {
            for (let i = 0; i < edges.length - 1; i++) {
                if (v >= edges[i] && v < edges[i + 1]) { counts[i]++; break; }
            }
        });
        const labels = edges.slice(0, -1).map((e, i) => e + '\u2013' + (edges[i + 1] > 100 ? 100 : edges[i + 1]));
        const colors = edges.slice(0, -1).map(lo =>
            lo >= 70 ? 'rgba(239,68,68,0.75)'
            : lo >= 60 ? 'rgba(245,158,11,0.60)'
            : lo >= 40 ? 'rgba(100,150,255,0.45)'
            : lo >= 30 ? 'rgba(16,185,129,0.40)'
            :            'rgba(16,185,129,0.75)');
        return {
            type: 'bar',
            data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, stepSize: 1 },
                         grid: { color: 'rgba(255,255,255,0.04)' } }
                },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y + ' positions' } } }
            }
        };
    }, [rows]);

    // === Z-score distribution ===
    useChart(zRef, () => {
        if (!zVals.length) return null;
        const edges = [-4, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4.01];
        const counts = new Array(edges.length - 1).fill(0);
        zVals.forEach(v => {
            for (let i = 0; i < edges.length - 1; i++) {
                if (v >= edges[i] && v < edges[i + 1]) { counts[i]++; break; }
            }
        });
        const labels = edges.slice(0, -1).map((e, i) => e.toFixed(1) + '\u2192' + (edges[i + 1] > 4 ? '4' : edges[i + 1].toFixed(1)));
        const colors = edges.slice(0, -1).map(lo =>
            lo >= 2   ? 'rgba(239,68,68,0.75)' :
            lo >= 1   ? 'rgba(245,158,11,0.55)' :
            lo >= -1  ? 'rgba(100,150,255,0.45)' :
            lo >= -2  ? 'rgba(245,158,11,0.55)' :
                        'rgba(16,185,129,0.75)');
        return {
            type: 'bar',
            data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 9 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, stepSize: 1 },
                         grid: { color: 'rgba(255,255,255,0.04)' } }
                },
                plugins: { legend: { display: false } }
            }
        };
    }, [rows]);

    // === Narrative ===
    const n = rows.length;
    const pctOf = (x) => n ? ((x / n) * 100).toFixed(0) + '%' : 'n/a';
    const narrative = [
        { icon: '\u25B2', text: 'Trend mix: <strong class="pos">' + trendCounts.Uptrend + '</strong> uptrend, '
            + '<strong>' + trendCounts.Sideways + '</strong> sideways, '
            + '<strong class="neg">' + trendCounts.Downtrend + '</strong> downtrend '
            + '(' + pctOf(trendCounts.Uptrend) + ' of book trending up).' },
        { icon: '\u25C6', text: 'RSI: <strong class="neg">' + overbought + '</strong> overbought (≥70), '
            + '<strong class="pos">' + oversold + '</strong> oversold (≤30), mean = <span class="mono">'
            + (meanRsi != null ? meanRsi.toFixed(1) : 'n/a') + '</span>.' },
        { icon: '\u25C8', text: 'Z-20D: <strong class="neg">' + extremeHigh + '</strong> stretched (Z≥2), '
            + '<strong class="pos">' + extremeLow + '</strong> depressed (Z≤-2) '
            + '\u2022 Vol regime: <strong>' + volCounts.High + '</strong> high, '
            + '<strong>' + volCounts.Elevated + '</strong> elevated, '
            + '<strong>' + volCounts.Normal + '</strong> normal, '
            + '<strong>' + volCounts.Low + '</strong> low.' }
    ];

    const cols = [
        { key: 'symbol',                label: 'Ticker' },
        { key: 'current_price',         label: 'Price' },
        { key: 'price_regime',          label: 'Trend' },
        { key: 'vol_regime',            label: 'Vol Regime' },
        { key: 'rsi_14',                label: 'RSI-14' },
        { key: 'zscore_20d',            label: 'Z-20D' },
        { key: 'mean_reversion_signal', label: 'Mean-Rev' },
        { key: 'momentum_pct_rank_20d', label: '20D Range %' },
        { key: 'atr_14',                label: 'ATR-14' },
        { key: 'bb_width',              label: 'BB Width' },
        { key: 'pct_off_52w_high',      label: 'Off 52W Hi' },
        { key: 'annualised_vol_20d',    label: 'Vol-20D (ann)' },
    ];

    const sorted = [...rows].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = (typeof av === 'number' || !isNaN(Number(av)))
            ? Number(av) - Number(bv)
            : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const onHeaderClick = (k) => {
        if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        else { setSortKey(k); setSortDir('desc'); }
    };

    return React.createElement('div', null,
        React.createElement(NarrativeStrip, { items: narrative }),

        // Distribution charts
        React.createElement('div', { className: 'grid-2' },
            React.createElement('div', { className: 'card' },
                React.createElement('div', { className: 'card-title' }, 'RSI-14 Distribution'),
                React.createElement('div', { className: 'chart-pane' },
                    React.createElement('canvas', { ref: rsiRef }))
            ),
            React.createElement('div', { className: 'card' },
                React.createElement('div', { className: 'card-title' }, 'Z-Score (20D) Distribution'),
                React.createElement('div', { className: 'chart-pane' },
                    React.createElement('canvas', { ref: zRef }))
            )
        ),

        React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title' },
            'Per-Position Signals (' + rows.length + ')'),
        React.createElement('div', { style: { overflowX: 'auto' } },
            React.createElement('table', { className: 'data-table' },
                React.createElement('thead', null,
                    React.createElement('tr', null,
                        cols.map(c => React.createElement('th', {
                            key: c.key,
                            onClick: () => onHeaderClick(c.key),
                            style: { cursor: 'pointer', userSelect: 'none' }
                        }, c.label + (sortKey === c.key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''))))),
                React.createElement('tbody', null,
                    sorted.map(d => React.createElement('tr', { key: d.symbol },
                        React.createElement('td', { style: { fontWeight: 600, color: '#00d4ff' } }, d.symbol),
                        React.createElement('td', null, fmtCurrency(d.current_price)),
                        React.createElement('td', null,
                            React.createElement('span', { className: 'badge ' + badgeCls(d.price_regime) }, d.price_regime || '\u2014')),
                        React.createElement('td', null,
                            React.createElement('span', { className: 'badge ' + badgeCls(d.vol_regime) }, d.vol_regime || '\u2014')),
                        React.createElement('td', null,
                            React.createElement('div', { className: 'rsi-gauge' },
                                React.createElement('span', { style: { minWidth: 30, display: 'inline-block' } },
                                    d.rsi_14 != null ? Number(d.rsi_14).toFixed(0) : '\u2014'),
                                React.createElement('div', { className: 'rsi-track' },
                                    React.createElement('div', { className: 'rsi-fill', style: rsiFillStyle(d.rsi_14) })))),
                        React.createElement('td', { className: cls(d.zscore_20d) }, fmt(d.zscore_20d)),
                        React.createElement('td', null,
                            React.createElement('span', { className: 'badge ' + badgeCls(d.mean_reversion_signal) },
                                d.mean_reversion_signal || '\u2014')),
                        React.createElement('td', null, d.momentum_pct_rank_20d != null
                            ? fmt(d.momentum_pct_rank_20d, 1) + '%' : '\u2014'),
                        React.createElement('td', null, d.atr_14 != null ? fmt(d.atr_14, 2) : '\u2014'),
                        React.createElement('td', null, d.bb_width != null ? fmt(Number(d.bb_width) * 100, 1) + '%' : '\u2014'),
                        React.createElement('td', { className: cls(-Number(d.pct_off_52w_high || 0)) },
                            d.pct_off_52w_high != null ? fmt(Number(d.pct_off_52w_high) * 100, 1) + '%' : '\u2014'),
                        React.createElement('td', null, d.annualised_vol_20d != null
                            ? fmt(Number(d.annualised_vol_20d) * 100, 1) + '%' : '\u2014')
                    )))
            )
        ))
    );
}
