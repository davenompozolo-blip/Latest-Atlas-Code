import React from 'react';
// ============================================================
// ATLAS Terminal — Quant Panel: Correlation Matrix
// ------------------------------------------------------------
// Consumes vw_quant_correlation — pairwise 252d Pearson.
// Renders distribution histogram + redundant pairs table +
// heatmap + narrative.
// ============================================================

import { corrBg, corrTextColor, detectSymbolPair, detectCorrelationCol, useChart } from './utils.js';
import { NarrativeStrip } from './components.js';

const { useRef } = React;

export function CorrelationPanel({ rows }) {
    const distRef = useRef(null);

    if (!rows || !rows.length) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'empty-state' },
                'No correlation data available — needs at least ~60 shared trading days per pair.'));
    }

    // Defensive schema detection
    const [sa, sb] = detectSymbolPair(rows[0]);
    const corrCol = detectCorrelationCol(rows[0]);
    if (!sa || !sb || !corrCol) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'empty-state' },
                'Could not detect symbol/correlation columns in vw_quant_correlation. Found keys: ' +
                Object.keys(rows[0]).join(', ')));
    }

    const symbolSet = new Set();
    rows.forEach(r => { symbolSet.add(r[sa]); symbolSet.add(r[sb]); });
    const symbols = Array.from(symbolSet).sort();

    const lookup = {};
    rows.forEach(r => {
        const v = Number(r[corrCol]);
        if (!isNaN(v)) lookup[r[sa] + '|' + r[sb]] = v;
    });
    const getCorr = (a, b) => {
        if (a === b) return 1;
        return lookup[a + '|' + b] ?? lookup[b + '|' + a] ?? null;
    };

    // Dedupe unordered pairs: build canonical list of unique pair correlations
    const uniqueSeen = new Set();
    const uniquePairs = [];
    rows.forEach(r => {
        if (r[sa] === r[sb]) return;
        const v = Number(r[corrCol]);
        if (isNaN(v)) return;
        const k = [r[sa], r[sb]].sort().join('|');
        if (uniqueSeen.has(k)) return;
        uniqueSeen.add(k);
        uniquePairs.push({ a: r[sa], b: r[sb], c: v });
    });
    const sortedDesc = [...uniquePairs].sort((x, y) => y.c - x.c);
    const topRedundant   = sortedDesc.slice(0, 8);
    const topDiversifying = sortedDesc.slice(-5).reverse();

    const meanCorr = uniquePairs.length
        ? uniquePairs.reduce((s, p) => s + p.c, 0) / uniquePairs.length : 0;
    const highCorr = uniquePairs.filter(p => p.c >= 0.70).length;
    const negCorr  = uniquePairs.filter(p => p.c < 0).length;

    // === Distribution histogram ===
    useChart(distRef, () => {
        if (!uniquePairs.length) return null;
        const bins = [-1.0, -0.8, -0.6, -0.4, -0.2, 0.0, 0.2, 0.4, 0.6, 0.8, 1.01];
        const counts = new Array(bins.length - 1).fill(0);
        uniquePairs.forEach(p => {
            for (let i = 0; i < bins.length - 1; i++) {
                if (p.c >= bins[i] && p.c < bins[i + 1]) { counts[i]++; break; }
            }
        });
        const labels = [];
        for (let i = 0; i < bins.length - 1; i++) {
            labels.push(bins[i].toFixed(1) + ' \u2192 ' + (bins[i + 1] >= 1 ? '1.0' : bins[i + 1].toFixed(1)));
        }
        const colors = bins.slice(0, -1).map(lo => corrBg(lo + 0.1));
        return {
            type: 'bar',
            data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, stepSize: 1 },
                         grid: { color: 'rgba(255,255,255,0.04)' }, title: { display: true, text: 'Pair count', color: 'rgba(255,255,255,0.5)' } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ctx.parsed.y + ' pair(s)' } }
                }
            }
        };
    }, [rows]);

    // Warn if the matrix is too large to render cleanly
    const tooLarge = symbols.length > 40;

    // === Narrative ===
    const mc = meanCorr;
    const regimeText = mc > 0.5 ? '<span class="neg">high co-movement regime</span> \u2014 diversification is <em>limited</em>'
                     : mc > 0.3 ? '<span class="neu">moderate co-movement</span> \u2014 some diversification benefit'
                     : mc > 0.1 ? '<span class="pos">mild co-movement</span> \u2014 healthy diversification'
                     : '<span class="pos">low co-movement</span> \u2014 strong diversification across names';

    const narrative = uniquePairs.length ? [
        { icon: '\u25C6', text: 'Across <strong>' + uniquePairs.length + '</strong> unique pair(s), mean ρ is <span class="mono">' + mc.toFixed(3) + '</span> \u2014 ' + regimeText + '.' },
        { icon: '\u25B2', text: '<strong class="neg">' + highCorr + '</strong> pair(s) with ρ ≥ 0.70 (redundancy risk)'
            + (topRedundant[0] ? '. Highest: <span class="mono">' + topRedundant[0].a + ' / ' + topRedundant[0].b + '</span> at <span class="neg">ρ = ' + topRedundant[0].c.toFixed(3) + '</span>' : '') + '.' },
        { icon: '\u25BC', text: '<strong class="pos">' + negCorr + '</strong> pair(s) with negative ρ (genuine diversifiers)'
            + (topDiversifying[0] ? '. Most negative: <span class="mono">' + topDiversifying[0].a + ' / ' + topDiversifying[0].b + '</span> at <span class="pos">ρ = ' + topDiversifying[0].c.toFixed(3) + '</span>' : '') + '.' }
    ] : [];

    return React.createElement('div', null,
        React.createElement(NarrativeStrip, { items: narrative }),

        // Pair-correlation distribution histogram
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' },
                'Pairwise Correlation Distribution \u2014 ' + uniquePairs.length + ' pairs (252d)'),
            React.createElement('div', { className: 'chart-pane' },
                React.createElement('canvas', { ref: distRef }))
        ),

        // Redundant pairs card
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' },
                'Most Redundant Pairs (ρ highest — potential concentration risk)'),
            topRedundant.length === 0
                ? React.createElement('div', { className: 'empty-state', style: { padding: 20 } },
                    'No positive-correlation pairs detected.')
                : React.createElement('table', { className: 'data-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            ['Asset A', 'Asset B', 'ρ (252d)', 'Severity'].map(h =>
                                React.createElement('th', { key: h }, h)))),
                    React.createElement('tbody', null,
                        topRedundant.map(p => React.createElement('tr', { key: p.a + '_' + p.b },
                            React.createElement('td', { style: { fontWeight: 600, color: '#00d4ff' } },
                                React.createElement('span', {
                                    title: 'Open in Equity Research', style: { cursor: 'pointer', borderBottom: '1px dotted rgba(0,212,255,0.4)' },
                                    onClick: function() { window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol: p.a } })); }
                                }, p.a)),
                            React.createElement('td', { style: { fontWeight: 600, color: '#00d4ff' } },
                                React.createElement('span', {
                                    title: 'Open in Equity Research', style: { cursor: 'pointer', borderBottom: '1px dotted rgba(0,212,255,0.4)' },
                                    onClick: function() { window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol: p.b } })); }
                                }, p.b)),
                            React.createElement('td', { style: { color: p.c >= 0.85 ? 'var(--red)' : p.c >= 0.7 ? 'var(--amber)' : 'var(--text)' } },
                                p.c.toFixed(3)),
                            React.createElement('td', null,
                                React.createElement('span', {
                                    className: 'badge ' + (p.c >= 0.85 ? 'red' : p.c >= 0.7 ? 'amber' : 'blue')
                                }, p.c >= 0.85 ? 'High' : p.c >= 0.7 ? 'Moderate' : 'Low')
                            )
                        ))
                    )
                )
        ),

        // Full heatmap
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' },
                'Correlation Heatmap — ' + symbols.length + ' assets (252d window)'),
            tooLarge
                ? React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 } },
                    'Showing first 40 of ' + symbols.length + ' tickers. Use the redundant-pairs table above to drill into specific relationships.')
                : null,
            React.createElement('div', { className: 'corr-heatmap-wrap' },
                React.createElement('table', { className: 'corr-heatmap' },
                    React.createElement('thead', null,
                        React.createElement('tr', null, [
                            React.createElement('th', { key: 'corner', className: 'row-label' }, ''),
                        ].concat(symbols.slice(0, 40).map(s =>
                            React.createElement('th', { key: s }, s))))),
                    React.createElement('tbody', null,
                        symbols.slice(0, 40).map(rowSym =>
                            React.createElement('tr', { key: rowSym }, [
                                React.createElement('td', { key: 'label', className: 'row-label' }, rowSym),
                            ].concat(symbols.slice(0, 40).map(colSym => {
                                const v = getCorr(rowSym, colSym);
                                if (rowSym === colSym) {
                                    return React.createElement('td', { key: colSym, className: 'diag' }, '\u2014');
                                }
                                return React.createElement('td', {
                                    key: colSym,
                                    style: {
                                        background: corrBg(v),
                                        color: corrTextColor(v)
                                    },
                                    title: rowSym + ' vs ' + colSym + ': ρ = ' + (v != null ? v.toFixed(3) : 'n/a')
                                }, v != null ? v.toFixed(2) : '\u2014');
                            }))))
                    )
                )
            ),
            // Legend
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 11, color: 'var(--text-muted)' } },
                React.createElement('span', null, 'Legend:'),
                React.createElement('span', { style: { background: corrBg(-0.8), padding: '2px 10px', borderRadius: 3, color: '#fff' } }, '-0.8'),
                React.createElement('span', { style: { background: corrBg(-0.3), padding: '2px 10px', borderRadius: 3 } }, '-0.3'),
                React.createElement('span', { style: { background: corrBg(0),    padding: '2px 10px', borderRadius: 3, border: '1px solid var(--card-border)' } }, '0'),
                React.createElement('span', { style: { background: corrBg(0.3),  padding: '2px 10px', borderRadius: 3 } }, '+0.3'),
                React.createElement('span', { style: { background: corrBg(0.8),  padding: '2px 10px', borderRadius: 3, color: '#fff' } }, '+0.8'),
                React.createElement('span', { style: { marginLeft: 16 } }, 'Low/negative ρ = better diversification')
            )
        )
    );
}
