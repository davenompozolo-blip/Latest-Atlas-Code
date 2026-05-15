import React from 'react';
// ============================================================
// ATLAS Terminal — Quant Panel: Rolling Returns Matrix
// ------------------------------------------------------------
// Consumes vw_quant_rolling_returns — per-position 1D…1Y / YTD
// returns. Renders period tab selector, leaders/laggards bar,
// heatmap matrix, and narrative.
// ============================================================

import { detectReturnCols, isPercentScale, toRatio, useChart } from './utils.js';
import { NarrativeStrip } from './components.js';

const { useState, useRef } = React;

export function RollingPanel({ rows }) {
    const sample = rows && rows[0] ? rows[0] : {};
    const periodCols = detectReturnCols(sample);
    // Per-column scale detection
    const scales = {};
    periodCols.forEach(c => { scales[c.key] = isPercentScale((rows || []).map(r => r[c.key])); });

    // Pick a reasonable default "anchor" period: prefer 1M, else 3M, else first
    const preferred = ['1M', '3M', '1W', '1D', '6M', 'YTD', '1Y'];
    const defaultCol = preferred
        .map(lbl => periodCols.find(c => c.label === lbl))
        .find(Boolean) || periodCols[0] || { key: null, label: '—' };

    const [anchorKey, setAnchorKey] = useState(defaultCol.key);
    const [sortKey, setSortKey] = useState(defaultCol.key || 'symbol');
    const [sortDir, setSortDir] = useState('desc');
    const leadersRef = useRef(null);

    if (!rows || !rows.length) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'empty-state' },
                'No rolling-return data available.'));
    }
    if (!periodCols.length) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'empty-state' },
                'No return-period columns detected in vw_quant_rolling_returns.'));
    }

    const headerKey = anchorKey || defaultCol.key;
    const headerLabel = periodCols.find(c => c.key === headerKey)?.label || defaultCol.label;
    const headerIsPct = !!scales[headerKey];
    const ratio = (v, isPct) => toRatio(v, isPct);

    const ranked = [...rows]
        .filter(r => r[headerKey] != null)
        .map(r => ({ ...r, __r: ratio(r[headerKey], headerIsPct) }))
        .filter(r => r.__r != null)
        .sort((a, b) => b.__r - a.__r);
    const winners = ranked.slice(0, 8);
    const losers  = ranked.slice(-8).reverse();

    // === Leaders & Laggards horizontal bar ===
    useChart(leadersRef, () => {
        if (!ranked.length) return null;
        const N = 10;
        const top = ranked.slice(0, N);
        const bot = ranked.slice(-Math.min(N, Math.max(0, ranked.length - N))).reverse();
        const combined = [...top, ...bot];
        if (!combined.length) return null;
        return {
            type: 'bar',
            data: {
                labels: combined.map(p => p.symbol),
                datasets: [{
                    data: combined.map(p => +(p.__r * 100).toFixed(3)),
                    backgroundColor: combined.map(p =>
                        p.__r >= 0.05 ? 'rgba(16,185,129,0.85)' :
                        p.__r >  0    ? 'rgba(16,185,129,0.45)' :
                        p.__r > -0.05 ? 'rgba(239,68,68,0.45)' :
                                        'rgba(239,68,68,0.85)'),
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
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.6)', font: { family: 'JetBrains Mono', size: 10 } },
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => (ctx.parsed.x > 0 ? '+' : '') + ctx.parsed.x.toFixed(2) + '%' } }
                }
            }
        };
    }, [rows, anchorKey, headerIsPct]);

    const sorted = [...rows].sort((a, b) => {
        let av, bv;
        if (sortKey === 'symbol' || sortKey === 'name') { av = a[sortKey]; bv = b[sortKey]; }
        else {
            av = ratio(a[sortKey], !!scales[sortKey]);
            bv = ratio(b[sortKey], !!scales[sortKey]);
        }
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = (typeof av === 'number') ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
    });
    const onHeaderClick = (k) => {
        if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        else { setSortKey(k); setSortDir('desc'); }
    };

    // === Heatmap cell colour ===
    const heatBg = (r) => {
        if (r == null) return 'transparent';
        const mag = Math.min(Math.abs(r) / 0.15, 1); // saturate at ±15%
        return r >= 0
            ? 'rgba(16,185,129,' + (0.08 + mag * 0.55).toFixed(2) + ')'
            : 'rgba(239,68,68,' + (0.08 + mag * 0.55).toFixed(2) + ')';
    };

    // === Narrative ===
    const posN = ranked.filter(r => r.__r > 0).length;
    const negN = ranked.filter(r => r.__r < 0).length;
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    const median = ranked.length
        ? ranked[Math.floor(ranked.length / 2)].__r : null;
    const avg = ranked.length
        ? ranked.reduce((s, r) => s + r.__r, 0) / ranked.length : null;

    const pctStr = (v, d) => v == null ? 'n/a' : (v > 0 ? '+' : '') + (v * 100).toFixed(d != null ? d : 2) + '%';
    const narrative = ranked.length ? [
        { icon: '\u25B2', text: 'Over the <strong>' + headerLabel + '</strong> window, '
            + '<strong class="pos">' + posN + '</strong> position(s) are positive and '
            + '<strong class="neg">' + negN + '</strong> are negative. '
            + 'Portfolio breadth: <span class="mono">' + (ranked.length ? ((posN / ranked.length) * 100).toFixed(0) + '%' : 'n/a') + '</span> positive.' },
        { icon: '\u2726', text: 'Best: <span class="mono">' + best.symbol + '</span> at <span class="pos">' + pctStr(best.__r) + '</span>'
            + ' \u2022 Worst: <span class="mono">' + worst.symbol + '</span> at <span class="neg">' + pctStr(worst.__r) + '</span>' },
        { icon: '\u25C8', text: 'Median position: <span class="mono">' + pctStr(median) + '</span>'
            + ' \u2022 Mean: <span class="mono">' + pctStr(avg) + '</span>'
            + ' \u2022 Dispersion (best \u2212 worst): <span class="mono">' + pctStr(best.__r - worst.__r, 1) + '</span>' }
    ] : [];

    return React.createElement('div', null,
        React.createElement(NarrativeStrip, { items: narrative }),

        // Anchor period selector
        React.createElement('div', { className: 'view-tabs', style: { marginBottom: 12 } },
            periodCols.map(c => React.createElement('button', {
                key: c.key,
                className: 'view-tab' + (c.key === anchorKey ? ' active' : ''),
                onClick: () => { setAnchorKey(c.key); setSortKey(c.key); setSortDir('desc'); }
            }, c.label))
        ),

        // Leaders & laggards chart
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' },
                'Leaders & Laggards \u2014 ' + headerLabel + ' return'),
            React.createElement('div', { className: 'chart-pane tall' },
                React.createElement('canvas', { ref: leadersRef }))
        ),

        // Full matrix as heatmap table
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' },
                'Rolling Returns Matrix \u2014 ' + rows.length + ' positions'),
            React.createElement('div', { style: { overflowX: 'auto' } },
                React.createElement('table', { className: 'data-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null, [
                            React.createElement('th', {
                                key: 'symbol',
                                onClick: () => onHeaderClick('symbol'),
                                style: { cursor: 'pointer', userSelect: 'none' }
                            }, 'Ticker' + (sortKey === 'symbol' ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '')),
                            React.createElement('th', { key: 'name' }, 'Name')
                        ].concat(periodCols.map(c => React.createElement('th', {
                            key: c.key,
                            onClick: () => onHeaderClick(c.key),
                            style: { cursor: 'pointer', userSelect: 'none', textAlign: 'center' }
                        }, c.label + (sortKey === c.key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '')))))),
                    React.createElement('tbody', null,
                        sorted.map(r => React.createElement('tr', { key: r.symbol }, [
                            React.createElement('td', { key: 's', style: { fontWeight: 600, color: '#00d4ff' } }, r.symbol),
                            React.createElement('td', { key: 'n', style: { color: 'var(--text-sec)' } }, r.name || '\u2014')
                        ].concat(periodCols.map(c => {
                            const rt = ratio(r[c.key], !!scales[c.key]);
                            return React.createElement('td', {
                                key: c.key,
                                style: {
                                    textAlign: 'center',
                                    background: heatBg(rt),
                                    fontFamily: 'JetBrains Mono',
                                    fontSize: 11,
                                    color: rt == null ? 'var(--text-muted)' : rt > 0 ? 'var(--green)' : rt < 0 ? 'var(--red)' : 'var(--text-sec)',
                                    fontWeight: 600
                                }
                            }, rt == null ? '\u2014' : (rt > 0 ? '+' : '') + (rt * 100).toFixed(2) + '%');
                        }))))
                    )
                )
            )
        )
    );
}
