import React from 'react';
// ============================================================
// ATLAS Terminal — Quant Panel: Drawdown Map
// ------------------------------------------------------------
// Consumes vw_quant_drawdown — current drawdown from peak.
// Auto-detects percent vs decimal scale, renders waterfall chart,
// tier summary strip, narrative, and detailed per-position table.
// ============================================================

import { fmtCurrency, cls, badgeCls, isPercentScale, toRatio, useChart } from './utils.js';
import { NarrativeStrip } from './components.js';

const { useState, useRef } = React;

export function DrawdownPanel({ rows }) {
    const [sortKey, setSortKey] = useState('current_drawdown_pct');
    const [sortDir, setSortDir] = useState('asc');  // most negative first
    const waterfallRef = useRef(null);

    if (!rows || !rows.length) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'empty-state' },
                'No drawdown data available.'));
    }

    const sample = rows[0] || {};
    const recoveryKey = 'recovery_needed_pct' in sample ? 'recovery_needed_pct'
                      : 'recovery_needed'     in sample ? 'recovery_needed'
                      : 'recovery_pct'        in sample ? 'recovery_pct'
                      : null;
    const regimeKey   = 'drawdown_regime'     in sample ? 'drawdown_regime'
                      : 'dd_regime'           in sample ? 'dd_regime'
                      : 'regime'              in sample ? 'regime'
                      : null;
    const peakDateKey = 'peak_date'           in sample ? 'peak_date'
                      : 'peak_price_date'     in sample ? 'peak_price_date'
                      : null;
    const peakPriceKey = 'peak_price'         in sample ? 'peak_price' : null;

    // Auto-detect scale: percent (-76.43) vs decimal (-0.7643)
    const ddIsPct  = isPercentScale(rows.map(r => r.current_drawdown_pct));
    const recIsPct = recoveryKey ? isPercentScale(rows.map(r => r[recoveryKey])) : false;
    const ddRatio  = (r) => toRatio(r.current_drawdown_pct, ddIsPct);
    const recRatio = (r) => recoveryKey ? toRatio(r[recoveryKey], recIsPct) : null;

    // Bucketing using ratios so thresholds are scale-correct
    const tier = (d) => d == null ? null
                      : d >= -0.005 ? 'peak'
                      : d > -0.10   ? 'moderate'
                      : d > -0.20   ? 'severe'
                      : 'deep';

    const buckets = { peak: 0, moderate: 0, severe: 0, deep: 0 };
    rows.forEach(r => { const t = tier(ddRatio(r)); if (t) buckets[t]++; });

    const worst = rows.reduce((w, r) =>
        (ddRatio(r) ?? 0) < (ddRatio(w) ?? 0) ? r : w, rows[0]);
    const worstDD = ddRatio(worst);

    const inDD = rows.filter(r => (ddRatio(r) ?? 0) < -0.005);
    const avgRecovery = inDD.length && recoveryKey
        ? inDD.reduce((s, r) => s + (recRatio(r) ?? 0), 0) / inDD.length : null;
    const medianDD = (() => {
        const vals = rows.map(ddRatio).filter(v => v != null).sort((a, b) => a - b);
        return vals.length ? vals[Math.floor(vals.length / 2)] : null;
    })();

    const sorted = [...rows].sort((a, b) => {
        let av, bv;
        if (sortKey === 'current_drawdown_pct') { av = ddRatio(a); bv = ddRatio(b); }
        else if (sortKey === recoveryKey)        { av = recRatio(a); bv = recRatio(b); }
        else { av = a[sortKey]; bv = b[sortKey]; }
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
        else { setSortKey(k); setSortDir(k === 'symbol' ? 'asc' : 'desc'); }
    };

    // === Waterfall chart (Chart.js) ===
    // Sort by drawdown ascending (worst first), cap at 30 names
    useChart(
        waterfallRef,
        () => {
            const top = [...rows]
                .map(r => ({ symbol: r.symbol, dd: (ddRatio(r) ?? 0) * 100 }))
                .sort((a, b) => a.dd - b.dd)
                .slice(0, 30);
            if (!top.length) return null;
            const colors = top.map(p =>
                p.dd <= -20 ? 'rgba(239,68,68,0.85)' :
                p.dd <= -10 ? 'rgba(239,68,68,0.55)' :
                p.dd <= -5  ? 'rgba(245,158,11,0.7)' :
                p.dd <  -0.5 ? 'rgba(245,158,11,0.45)' :
                               'rgba(16,185,129,0.55)'
            );
            return {
                type: 'bar',
                data: {
                    labels: top.map(p => p.symbol),
                    datasets: [{
                        data: top.map(p => p.dd),
                        backgroundColor: colors,
                        borderRadius: 3,
                        borderSkipped: false,
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            ticks: { color: 'rgba(255,255,255,0.4)', callback: v => v + '%', font: { size: 10 } },
                            grid: { color: 'rgba(255,255,255,0.04)' },
                            suggestedMin: Math.min(-25, Math.floor(top[0].dd / 5) * 5),
                            suggestedMax: 0
                        },
                        y: {
                            ticks: { color: 'rgba(255,255,255,0.6)', font: { family: 'JetBrains Mono', size: 10 } },
                            grid: { display: false }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: ctx => ctx.parsed.x.toFixed(2) + '%' } }
                    }
                }
            };
        },
        [rows, ddIsPct]
    );

    // === Narrative ===
    const pctStr = (v, d) => v == null ? 'n/a' : (v * 100).toFixed(d != null ? d : 1) + '%';
    const narrative = [
        {
            icon: '\u25C7',
            text: '<strong>' + buckets.deep + '</strong> position(s) are in <span class="neg">deep drawdown (worse than -20%)</span>, ' +
                  '<strong>' + buckets.severe + '</strong> in severe (-10% to -20%), and ' +
                  '<strong>' + (buckets.peak + buckets.moderate) + '</strong> within 10% of peak.'
        },
        {
            icon: '\u25BC',
            text: 'Worst position: <span class="mono neg">' + worst.symbol + '</span> at <span class="neg">' + pctStr(worstDD, 2) + '</span>' +
                  (recoveryKey && recRatio(worst) != null ? ', requiring <span class="mono">' + pctStr(recRatio(worst), 1) + '</span> recovery to make new highs.' : '.')
        },
        {
            icon: '\u25C8',
            text: 'Median position drawdown: <span class="mono">' + pctStr(medianDD, 2) + '</span>' +
                  (avgRecovery != null
                      ? '. Average recovery needed across in-drawdown names: <span class="mono">' + pctStr(avgRecovery, 1) + '</span>.'
                      : '.')
        }
    ];

    return React.createElement('div', null,
        React.createElement(NarrativeStrip, { items: narrative }),

        // Tier summary strip
        React.createElement('div', { className: 'metrics-row' },
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'At / Near Peak'),
                React.createElement('div', { className: 'value positive' }, buckets.peak),
                React.createElement('div', { className: 'sub' }, 'within 0.5% of high')),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Moderate (-0.5 to -10%)'),
                React.createElement('div', { className: 'value' }, buckets.moderate)),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Severe (-10 to -20%)'),
                React.createElement('div', { className: 'value neutral' }, buckets.severe)),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Deep (\u2264 -20%)'),
                React.createElement('div', { className: 'value negative' }, buckets.deep)),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Worst Position'),
                React.createElement('div', { className: 'value negative' }, worst.symbol),
                React.createElement('div', { className: 'sub' }, pctStr(worstDD, 2)))
        ),

        // Waterfall chart card
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' },
                'Drawdown Waterfall — Top 30 by Severity'),
            React.createElement('div', { className: 'chart-pane tall' },
                React.createElement('canvas', { ref: waterfallRef }))
        ),

        // Detailed table
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' },
                'Position-Level Drawdown (' + rows.length + ')'),
            React.createElement('div', { style: { overflowX: 'auto' } },
                React.createElement('table', { className: 'data-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            [
                                { key: 'symbol', label: 'Ticker' },
                                peakPriceKey ? { key: peakPriceKey, label: 'Peak $' } : null,
                                peakDateKey  ? { key: peakDateKey,  label: 'Peak Date' } : null,
                                { key: 'current_price', label: 'Current $' },
                                { key: 'current_drawdown_pct', label: 'Drawdown' },
                                recoveryKey ? { key: recoveryKey, label: 'Recovery Needed' } : null,
                                regimeKey   ? { key: regimeKey,   label: 'Regime' } : null,
                            ].filter(Boolean).map(c => React.createElement('th', {
                                key: c.key,
                                onClick: () => onHeaderClick(c.key),
                                style: { cursor: 'pointer', userSelect: 'none' }
                            }, c.label + (sortKey === c.key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''))))),
                    React.createElement('tbody', null,
                        sorted.map(r => {
                            const dd = ddRatio(r) ?? 0;
                            const magnitude = Math.abs(dd);
                            const barWidth = Math.min(100, (magnitude / 0.30) * 100);  // anchor scale at -30%
                            const cells = [
                                React.createElement('td', { key: 's', style: { fontWeight: 600, color: '#00d4ff' } }, r.symbol),
                            ];
                            if (peakPriceKey) cells.push(
                                React.createElement('td', { key: 'pp' }, fmtCurrency(r[peakPriceKey])));
                            if (peakDateKey) cells.push(
                                React.createElement('td', { key: 'pd', style: { fontFamily: 'Figtree' } },
                                    r[peakDateKey] ? new Date(r[peakDateKey]).toLocaleDateString() : '\u2014'));
                            cells.push(
                                React.createElement('td', { key: 'cp' }, fmtCurrency(r.current_price)));
                            cells.push(
                                React.createElement('td', { key: 'dd', className: cls(dd) },
                                    (dd * 100).toFixed(2) + '%',
                                    React.createElement('span', { className: 'dd-bar-wrap' },
                                        React.createElement('span', { className: 'dd-bar', style: { width: barWidth.toFixed(1) + '%' } })
                                    )));
                            if (recoveryKey) {
                                const rec = recRatio(r);
                                cells.push(React.createElement('td', { key: 'rn' },
                                    rec != null ? (rec * 100).toFixed(2) + '%' : '\u2014'));
                            }
                            if (regimeKey) cells.push(
                                React.createElement('td', { key: 'rg' },
                                    React.createElement('span', { className: 'badge ' + badgeCls(r[regimeKey]) },
                                        r[regimeKey] || '\u2014')));
                            return React.createElement('tr', { key: r.symbol }, cells);
                        })
                    )
                )
            )
        )
    );
}
