import { fmt, fmtPct, fmtCurrency, useChart } from './utils.js';

var useState = React.useState, useRef = React.useRef;
var h = React.createElement;

// ---- Helpers ----

function Tile(p) {
    return h('div', { className: 'metric-card' },
        h('div', { className: 'label' }, p.label),
        h('div', { className: 'value', style: p.color ? { color: p.color } : null }, p.value),
        p.sub ? h('div', { className: 'sub' }, p.sub) : null
    );
}

function volColor(v) {
    if (v == null) return null;
    return v < 0.15 ? '#10b981' : v < 0.25 ? '#f59e0b' : '#ef4444';
}

function ratioColor(v) {
    if (v == null) return null;
    return v > 1 ? '#10b981' : v > 0 ? '#f59e0b' : '#ef4444';
}

function expenseColor(v) {
    if (v == null) return null;
    return v < 0.002 ? '#10b981' : v < 0.005 ? '#f59e0b' : '#ef4444';
}

function signColor(v) {
    if (v == null) return null;
    return v > 0 ? '#10b981' : v < 0 ? '#ef4444' : null;
}

// ---- Style Box inference ----

var EQUITY_KEYWORDS = ['equity', 'stock', 'blend', 'value', 'growth', 'large', 'mid', 'small', 'cap'];

function inferStyleBox(category) {
    if (!category) return { row: 0, col: 1 };
    var c = category.toLowerCase();
    var row = c.includes('small') ? 2 : c.includes('mid') ? 1 : 0;
    var col = c.includes('value') ? 0 : c.includes('growth') ? 2 : 1;
    return { row: row, col: col };
}

function isEquityStyle(category) {
    if (!category) return true;
    var c = category.toLowerCase();
    return EQUITY_KEYWORDS.some(function(k) { return c.includes(k); });
}

function StyleBox(p) {
    var pos = inferStyleBox(p.category);
    var rowLabels = ['Large', 'Mid', 'Small'];
    var colLabels = ['Value', 'Blend', 'Growth'];

    var header = h('tr', null,
        h('td', { style: { width: 50 } }),
        colLabels.map(function(l, ci) {
            return h('td', { key: ci, style: { textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.5)', padding: '0 0 4px' } }, l);
        })
    );
    var rows = rowLabels.map(function(rl, ri) {
        return h('tr', { key: ri },
            h('td', { style: { fontSize: 10, color: 'rgba(255,255,255,0.5)', paddingRight: 6, textAlign: 'right' } }, rl),
            colLabels.map(function(_, ci) {
                var active = ri === pos.row && ci === pos.col;
                return h('td', { key: ci },
                    h('div', {
                        style: {
                            width: 44, height: 44, borderRadius: 4,
                            background: active ? 'rgba(0,212,255,0.35)' : 'rgba(255,255,255,0.04)',
                            border: '1px solid ' + (active ? '#00d4ff' : 'rgba(255,255,255,0.08)'),
                            margin: 2
                        }
                    })
                );
            })
        );
    });

    return h('table', { style: { borderCollapse: 'collapse' } }, h('tbody', null, header, rows));
}

// ---- Price Chart ----

function PriceChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.series || !p.series.length) return null;
        var labels = p.series.map(function(d) { return d.date; });
        var data = p.series.map(function(d) { return d.close; });
        var thin = labels.map(function(l, i) { return i % 50 === 0 ? l : ''; });
        return {
            type: 'line',
            data: {
                labels: thin,
                datasets: [{
                    data: data, borderColor: '#00d4ff', borderWidth: 1.5, pointRadius: 0,
                    fill: true, backgroundColor: 'rgba(0,212,255,0.08)', tension: 0.2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.6)', callback: function(v) { return '$' + v.toFixed(2); } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', maxRotation: 0 }, grid: { display: false } }
                }
            }
        };
    }, [p.series]);
    return h('div', { style: { height: 260 } }, h('canvas', { ref: ref }));
}

// ---- Drawdown Chart ----

function DrawdownChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.ddSeries || !p.ddSeries.length) return null;
        var labels = p.ddSeries.map(function(_, i) { return p.dates && p.dates[i] ? p.dates[i] : i; });
        var thin = labels.map(function(l, i) { return i % 50 === 0 ? l : ''; });
        return {
            type: 'line',
            data: {
                labels: thin,
                datasets: [{
                    data: p.ddSeries, borderColor: '#ef4444', borderWidth: 1.5, pointRadius: 0,
                    fill: true, backgroundColor: 'rgba(239,68,68,0.3)', tension: 0.2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            callback: function(v) { return (v * 100).toFixed(1) + '%'; }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: { ticks: { color: 'rgba(255,255,255,0.5)', maxRotation: 0 }, grid: { display: false } }
                }
            }
        };
    }, [p.ddSeries]);
    return h('div', { style: { height: 200 } }, h('canvas', { ref: ref }));
}

// ---- Main Export ----

export function FundProfile(p) {
    var data = p.data;
    if (!data) {
        return h('div', { className: 'card', style: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' } },
            'No fund data available.');
    }

    var profile = data.profile || {};
    var meta = data.meta || {};
    var metrics = data.metrics || {};
    var category = (meta.category || profile.finnhubIndustry || null);

    // ---- 1. Fund Details Card ----
    var expVal = meta.expense != null ? meta.expense : null;
    var detailsCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Fund Details'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 } },
            h(Tile, { label: 'Category', value: category || '\u2014' }),
            h(Tile, {
                label: 'Expense Ratio',
                value: expVal != null ? (expVal * 100).toFixed(2) + '%' : '\u2014',
                color: expenseColor(expVal)
            }),
            h(Tile, { label: 'Exchange', value: profile.exchange || '\u2014' })
        )
    );

    // ---- 2. Risk Metrics Card ----
    var riskCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Risk Profile'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 } },
            h(Tile, { label: 'Ann. Return', value: fmtPct(metrics.annReturn), color: signColor(metrics.annReturn) }),
            h(Tile, { label: 'Ann. Volatility', value: fmtPct(metrics.annVol), color: volColor(metrics.annVol) }),
            h(Tile, { label: 'Sharpe Ratio', value: fmt(metrics.sharpe, 2), color: ratioColor(metrics.sharpe) }),
            h(Tile, { label: 'Sortino Ratio', value: fmt(metrics.sortino, 2), color: ratioColor(metrics.sortino) }),
            h(Tile, { label: 'Max Drawdown', value: fmtPct(metrics.maxDD), color: '#ef4444' }),
            h(Tile, { label: 'Calmar Ratio', value: fmt(metrics.calmar, 2), color: metrics.calmar != null && metrics.calmar > 1 ? '#10b981' : null })
        )
    );

    // ---- 3. Price Chart ----
    var priceCard = data.series && data.series.length
        ? h('div', { className: 'card', style: { marginBottom: 16 } },
            h('div', { className: 'card-title' }, 'Price History (1Y)'),
            h(PriceChart, { series: data.series })
        )
        : null;

    // ---- 4. Drawdown Chart ----
    var ddDates = data.series && data.ddSeries && data.series.length === data.ddSeries.length
        ? data.series.map(function(d) { return d.date; })
        : null;
    var ddCard = data.ddSeries && data.ddSeries.length
        ? h('div', { className: 'card', style: { marginBottom: 16 } },
            h('div', { className: 'card-title' }, 'Underwater (Drawdown)'),
            h(DrawdownChart, { ddSeries: data.ddSeries, dates: ddDates })
        )
        : null;

    // ---- 5. Style Box or Asset Class badge ----
    var styleSection;
    if (category && !isEquityStyle(category)) {
        styleSection = h('div', { className: 'card', style: { marginBottom: 16, padding: 16 } },
            h('span', {
                style: {
                    display: 'inline-block', background: 'rgba(0,212,255,0.12)',
                    color: '#00d4ff', border: '1px solid rgba(0,212,255,0.3)',
                    borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600
                }
            }, 'Asset Class: ' + category)
        );
    } else {
        styleSection = h('div', { className: 'card', style: { marginBottom: 16 } },
            h('div', { className: 'card-title' }, 'Style Box'),
            h('div', { style: { display: 'flex', justifyContent: 'center', padding: '8px 0' } },
                h(StyleBox, { category: category })
            )
        );
    }

    return h('div', null, detailsCard, riskCard, priceCard, ddCard, styleSection);
}
