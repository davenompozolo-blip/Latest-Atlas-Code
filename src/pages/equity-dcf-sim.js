import React from 'react';
import { fmt, fmtPct, fmtCurrency, useChart } from './utils.js';
import { runMonteCarlo, runSensitivity, Tile, Slider, fN } from './dcf-engine.js';

var useState = React.useState, useRef = React.useRef, useMemo = React.useMemo;
var h = React.createElement;

function heatColor(value, price) {
    if (value == null || !price) return 'rgba(255,255,255,0.04)';
    var pct = (value - price) / price;
    var intensity = Math.min(Math.abs(pct) * 2, 1);
    if (pct > 0) return 'rgba(16,185,129,' + (intensity * 0.4) + ')';
    return 'rgba(239,68,68,' + (intensity * 0.4) + ')';
}

function McHistChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.bins || !p.bins.length) return null;
        return {
            type: 'bar',
            data: { labels: p.bins.map(function(x) { return '$' + x.mid.toFixed(0); }),
                datasets: [{ label: 'Frequency', data: p.bins.map(function(x) { return x.count; }),
                    backgroundColor: 'rgba(0,212,255,0.6)', borderColor: '#00d4ff', borderWidth: 1 }] },
            options: { responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: 'rgba(255,255,255,0.6)', maxRotation: 45, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } } } }
        };
    }, [p.bins]);
    return h('div', { style: { height: 220 } }, h('canvas', { ref: ref }));
}

function MonteCarloCard(p) {
    var defaults = p.defaults, price = p.price;
    var _r = useState(500), mcRuns = _r[0], setMcRuns = _r[1];
    var mc = useMemo(function() {
        return runMonteCarlo(defaults, defaults.wacc, 0.025, defaults.revGrowth, defaults.fcfMargin, 5, mcRuns);
    }, [defaults, mcRuns]);

    return h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Monte Carlo Simulation'),
        h(Slider, { label: 'Simulations', min: 100, max: 2000, step: 100, value: mcRuns,
            onChange: setMcRuns, fmt: function(v) { return v; } }),
        !mc ? h('div', { style: { color: 'var(--text-muted)', textAlign: 'center', padding: 16 } }, 'Insufficient data.') :
        h('div', null,
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 } },
                h(Tile, { label: 'Mean', value: fmtCurrency(mc.mean) }),
                h(Tile, { label: 'Median (P50)', value: fmtCurrency(mc.p50) }),
                h(Tile, { label: 'P10 (Bear)', value: fmtCurrency(mc.p10), color: '#ef4444' }),
                h(Tile, { label: 'P90 (Bull)', value: fmtCurrency(mc.p90), color: '#10b981' })
            ),
            h(McHistChart, { bins: mc.bins }),
            h('div', { style: { fontSize: 10, color: 'var(--text-sec)', marginTop: 8, textAlign: 'center' } },
                'Current Price: ' + fmtCurrency(price) + ' · Sims: ' + mc.n)
        )
    );
}

function SensitivityCard(p) {
    var defaults = p.defaults, price = p.price;
    var sens = useMemo(function() {
        return runSensitivity(defaults, defaults.revGrowth, defaults.fcfMargin, 5);
    }, [defaults]);

    if (!sens) return h('div', { className: 'card', style: { color: 'var(--text-muted)', padding: 24 } }, 'Insufficient data.');

    var thStyle = { padding: '6px 4px', color: 'rgba(255,255,255,0.6)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' };
    var tdStyle = { padding: '6px 4px', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.9)', fontFamily: "'JetBrains Mono', monospace" };

    return h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Sensitivity (WACC × Terminal Growth)'),
        h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            h('thead', null,
                h('tr', null,
                    h('th', { style: thStyle }, 'TG \\ WACC'),
                    sens.waccRange.map(function(w, i) {
                        return h('th', { key: i, style: thStyle }, (w * 100).toFixed(0) + '%');
                    })
                )
            ),
            h('tbody', null,
                sens.rows.map(function(row, ri) {
                    return h('tr', { key: ri },
                        h('td', { style: Object.assign({}, thStyle, { fontWeight: 600 }) }, (row.tg * 100).toFixed(1) + '%'),
                        row.cells.map(function(cell, ci) {
                            return h('td', { key: ci, style: Object.assign({}, tdStyle, { backgroundColor: heatColor(cell, price) }) },
                                cell != null ? '$' + cell.toFixed(0) : '\u2014');
                        })
                    );
                })
            )
        ),
        h('div', { style: { fontSize: 10, color: 'var(--text-sec)', marginTop: 8, textAlign: 'center' } },
            'Green = upside vs current price · Red = downside')
    );
}

export function SimPanel(p) {
    var defaults = p.defaults, price = p.price;
    if (!defaults || !defaults.revenue || !defaults.shares) {
        return h('div', { className: 'card', style: { color: 'var(--text-muted)', textAlign: 'center', padding: 24 } },
            'Simulation requires revenue and shares data.');
    }
    return h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } },
        h(MonteCarloCard, { defaults: defaults, price: price }),
        h(SensitivityCard, { defaults: defaults, price: price })
    );
}
