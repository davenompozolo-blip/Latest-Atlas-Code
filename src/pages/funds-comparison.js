import React from 'react';
// ============================================================
// ATLAS Terminal — Fund Comparison Sub-Panel
// ------------------------------------------------------------
// Side-by-side comparison of up to 4 funds against a primary
// ticker. Grouped bar charts for returns and risk metrics.
//
// Data: /api/funds?symbol=XYZ
// ============================================================

import { fmt, fmtPct, fmtCurrency, useChart } from './utils.js';

var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;
var h = React.createElement;

// --- Styles ---

var thStyle = { padding: '8px 12px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(255,255,255,0.06)', textTransform: 'uppercase', letterSpacing: 0.5 };
var tdStyle = { padding: '8px 12px', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.85)' };

var COLORS = ['#00d4ff', '#10b981', '#f59e0b', '#a78bfa', '#ef4444'];
var SUGGESTIONS = ['SPY', 'QQQ', 'AGG', 'GLD'];

var chipStyle = {
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.6)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '4px 12px',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: 0.5
};

// --- Helpers ---

function bestIdx(values, lower) {
    var best = null, idx = -1;
    for (var i = 0; i < values.length; i++) {
        if (values[i] == null) continue;
        if (best == null || (lower ? values[i] < best : values[i] > best)) { best = values[i]; idx = i; }
    }
    return idx;
}

function extractFund(symbol, data) {
    var meta = data.meta || {};
    var metrics = data.metrics || {};
    return {
        symbol: symbol,
        category: meta.category || null,
        expense: meta.expense,
        price: metrics.current || meta.price,
        // API (computeMetrics) emits lowercase ret1m/ret3m/ret6m/ret1y; reading
        // ret1M/ret3M/ret6M/ret1Y returned undefined, so every period-return row
        // and the Returns Comparison bar chart showed "—" (FD-01). The risk
        // metrics below were already correctly cased, which is why they worked.
        ret1M: metrics.ret1m,
        ret3M: metrics.ret3m,
        ret6M: metrics.ret6m,
        ret1Y: metrics.ret1y,
        annReturn: metrics.annReturn,
        annVol: metrics.annVol,
        sharpe: metrics.sharpe,
        sortino: metrics.sortino,
        maxDD: metrics.maxDD != null ? metrics.maxDD : metrics.maxDrawdown,
        calmar: metrics.calmar
    };
}

function fetchFund(symbol) {
    return fetch('/api/funds?symbol=' + encodeURIComponent(symbol))
        .then(function(r) { return r.json(); })
        .then(function(j) {
            if (j.error) return null;
            return extractFund(symbol, j);
        })
        .catch(function() { return null; });
}

function fR(v) {
    if (v == null || !isFinite(v)) return '\u2014';
    return (v > 0 ? '+' : '') + (v * 100).toFixed(2) + '%';
}

// --- Comparison Input ---

function CompInput(p) {
    var _i = useState('');
    var input = _i[0], setInput = _i[1];

    function doAdd(sym) {
        var s = (sym || '').trim().toUpperCase();
        if (!s || p.symbols.length >= 4) return;
        if (p.symbols.indexOf(s) >= 0 || s === p.primary) return;
        p.onAdd(s);
        setInput('');
    }

    var suggestions = SUGGESTIONS.filter(function(s) {
        return s !== p.primary && p.symbols.indexOf(s) < 0;
    });

    return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Add Comparison Funds'),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 } },
            h('input', {
                type: 'text',
                value: input,
                onChange: function(e) { setInput(e.target.value); },
                onKeyDown: function(e) { if (e.key === 'Enter') doAdd(input); },
                placeholder: 'Ticker (e.g. VOO)',
                spellCheck: false,
                style: {
                    flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6, padding: '8px 12px', color: 'rgba(255,255,255,0.9)',
                    fontFamily: 'inherit', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8
                }
            }),
            h('button', {
                onClick: function() { doAdd(input); },
                disabled: p.symbols.length >= 4,
                style: {
                    background: 'rgba(0,212,255,0.15)', color: '#00d4ff',
                    border: '1px solid rgba(0,212,255,0.3)', borderRadius: 6,
                    padding: '8px 14px', fontSize: 11, fontWeight: 600,
                    cursor: p.symbols.length >= 4 ? 'not-allowed' : 'pointer',
                    letterSpacing: 0.5, textTransform: 'uppercase'
                }
            }, 'Add')
        ),
        suggestions.length > 0 ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.35)', alignSelf: 'center', marginRight: 4 } }, 'Suggestions:'),
            suggestions.map(function(s) {
                return h('button', {
                    key: s, onClick: function() { doAdd(s); },
                    style: chipStyle
                }, s);
            })
        ) : null,
        p.symbols.length > 0 ? h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 } },
            p.symbols.map(function(s) {
                return h('span', {
                    key: s,
                    style: {
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'rgba(0,212,255,0.1)', color: '#00d4ff',
                        border: '1px solid rgba(0,212,255,0.25)', borderRadius: 14,
                        padding: '4px 10px', fontSize: 11, fontWeight: 600
                    }
                },
                    s,
                    h('button', {
                        onClick: function() { p.onRemove(s); },
                        style: {
                            background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                            cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1
                        }
                    }, '\u00d7')
                );
            })
        ) : null
    );
}

// --- Comparison Table ---

function CompTable(p) {
    var funds = p.funds;

    var rows = [
        { label: 'Category',       fn: function(f) { return f.category || '\u2014'; }, type: 'text' },
        { label: 'Expense Ratio',  fn: function(f) { return f.expense; }, fmt: function(v) { return v != null ? (v * 100).toFixed(2) + '%' : '\u2014'; }, lower: true },
        { label: 'Price',          fn: function(f) { return f.price; }, fmt: function(v) { return v != null ? fmtCurrency(v) : '\u2014'; }, type: 'text' },
        { label: '1M Return',     fn: function(f) { return f.ret1M; }, fmt: fR, lower: false },
        { label: '3M Return',     fn: function(f) { return f.ret3M; }, fmt: fR, lower: false },
        { label: '6M Return',     fn: function(f) { return f.ret6M; }, fmt: fR, lower: false },
        { label: '1Y Return',     fn: function(f) { return f.ret1Y; }, fmt: fR, lower: false },
        { label: 'Ann. Return',   fn: function(f) { return f.annReturn; }, fmt: fR, lower: false },
        { label: 'Ann. Volatility', fn: function(f) { return f.annVol; }, fmt: function(v) { return v != null ? (v * 100).toFixed(1) + '%' : '\u2014'; }, lower: true },
        { label: 'Sharpe',        fn: function(f) { return f.sharpe; }, fmt: function(v) { return v != null ? fmt(v, 2) : '\u2014'; }, lower: false },
        { label: 'Sortino',       fn: function(f) { return f.sortino; }, fmt: function(v) { return v != null ? fmt(v, 2) : '\u2014'; }, lower: false },
        { label: 'Max Drawdown',  fn: function(f) { return f.maxDD; }, fmt: function(v) { return v != null ? (v * 100).toFixed(2) + '%' : '\u2014'; }, lower: false },  // least negative = best, so higher is better
        { label: 'Calmar',        fn: function(f) { return f.calmar; }, fmt: function(v) { return v != null ? fmt(v, 2) : '\u2014'; }, lower: false }
    ];

    return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Side-by-Side Comparison'),
        funds.length <= 1
            ? h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '12px 0' } }, 'Add funds above to compare side-by-side.')
            : null,
        h('div', { style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                h('thead', null,
                    h('tr', null,
                        h('th', { style: thStyle }, 'Metric'),
                        funds.map(function(f, i) {
                            return h('th', {
                                key: f.symbol,
                                style: Object.assign({}, thStyle, { textAlign: 'center', color: i === 0 ? '#00d4ff' : 'rgba(255,255,255,0.5)' })
                            }, f.symbol);
                        })
                    )
                ),
                h('tbody', null,
                    rows.map(function(row) {
                        var values = funds.map(function(f) { return row.fn(f); });
                        var best = row.type === 'text' ? -1 : bestIdx(values, row.lower);
                        return h('tr', { key: row.label },
                            h('td', { style: Object.assign({}, tdStyle, { fontWeight: 500, fontFamily: 'inherit', color: 'rgba(255,255,255,0.6)' }) }, row.label),
                            funds.map(function(f, i) {
                                var v = values[i];
                                var display = row.type === 'text' ? v : row.fmt(v);
                                var isBest = i === best && funds.length > 1;
                                return h('td', {
                                    key: f.symbol,
                                    style: Object.assign({}, tdStyle, {
                                        textAlign: 'center',
                                        color: isBest ? '#00d4ff' : tdStyle.color,
                                        fontWeight: isBest ? 600 : 400,
                                        background: i === 0 ? 'rgba(0,212,255,0.03)' : 'transparent'
                                    })
                                }, display);
                            })
                        );
                    })
                )
            )
        )
    );
}

// --- Returns Comparison Chart ---

function ReturnsChart(p) {
    var ref = useRef(null);
    var funds = p.funds;

    useChart(ref, function() {
        if (funds.length < 2) return null;
        var periods = [
            { label: '1M', fn: function(f) { return f.ret1M != null ? f.ret1M * 100 : 0; } },
            { label: '3M', fn: function(f) { return f.ret3M != null ? f.ret3M * 100 : 0; } },
            { label: '6M', fn: function(f) { return f.ret6M != null ? f.ret6M * 100 : 0; } },
            { label: '1Y', fn: function(f) { return f.ret1Y != null ? f.ret1Y * 100 : 0; } }
        ];

        var datasets = funds.map(function(f, i) {
            return {
                label: f.symbol,
                data: periods.map(function(pr) { return pr.fn(f); }),
                backgroundColor: COLORS[i % COLORS.length] + '99',
                borderColor: COLORS[i % COLORS.length],
                borderWidth: 1,
                borderRadius: 4
            };
        });

        return {
            type: 'bar',
            data: { labels: periods.map(function(pr) { return pr.label; }), datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, callback: function(v) { return v.toFixed(1) + '%'; } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [funds]);

    if (funds.length < 2) return null;
    return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Returns Comparison'),
        h('div', { style: { height: 240 } }, h('canvas', { ref: ref }))
    );
}

// --- Risk Comparison Chart ---

function RiskChart(p) {
    var ref = useRef(null);
    var funds = p.funds;

    useChart(ref, function() {
        if (funds.length < 2) return null;
        var metrics = [
            { label: 'Volatility', fn: function(f) { return f.annVol != null ? f.annVol * 100 : 0; } },
            { label: 'Max DD', fn: function(f) { return f.maxDD != null ? Math.abs(f.maxDD) * 100 : 0; } },
            { label: 'Sharpe', fn: function(f) { return f.sharpe != null ? f.sharpe : 0; } },
            { label: 'Sortino', fn: function(f) { return f.sortino != null ? f.sortino : 0; } }
        ];

        var datasets = funds.map(function(f, i) {
            return {
                label: f.symbol,
                data: metrics.map(function(m) { return m.fn(f); }),
                backgroundColor: COLORS[i % COLORS.length] + '99',
                borderColor: COLORS[i % COLORS.length],
                borderWidth: 1,
                borderRadius: 4
            };
        });

        return {
            type: 'bar',
            data: { labels: metrics.map(function(m) { return m.label; }), datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [funds]);

    if (funds.length < 2) return null;
    return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Risk Comparison'),
        h('div', { style: { height: 200 } }, h('canvas', { ref: ref }))
    );
}

// --- Main Export ---

export function FundComparison(p) {
    var _s = useState([]);
    var compSymbols = _s[0], setCompSymbols = _s[1];
    var _d = useState([]);
    var compData = _d[0], setCompData = _d[1];
    var _l = useState(false);
    var loading = _l[0], setLoading = _l[1];

    var primary = extractFund(p.symbol, p.data);

    function handleAdd(sym) {
        if (compSymbols.length >= 4) return;
        var next = compSymbols.concat([sym]);
        setCompSymbols(next);
        setLoading(true);
        fetchFund(sym).then(function(result) {
            if (result) {
                setCompData(function(prev) { return prev.concat([result]); });
            }
            setLoading(false);
        });
    }

    function handleRemove(sym) {
        setCompSymbols(function(prev) { return prev.filter(function(s) { return s !== sym; }); });
        setCompData(function(prev) { return prev.filter(function(d) { return d.symbol !== sym; }); });
    }

    var allFunds = [primary].concat(compData);

    return h('div', null,
        h(CompInput, {
            primary: p.symbol,
            symbols: compSymbols,
            onAdd: handleAdd,
            onRemove: handleRemove
        }),
        loading
            ? h('div', { style: { textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.5)', fontSize: 12 } }, 'Fetching fund data\u2026')
            : null,
        h(CompTable, { funds: allFunds }),
        h(ReturnsChart, { funds: allFunds }),
        h(RiskChart, { funds: allFunds })
    );
}
