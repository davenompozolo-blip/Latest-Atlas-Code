import React from 'react';
// ============================================================
// ATLAS Terminal — Funds Dashboard (Module)
// ------------------------------------------------------------
// ETF / mutual-fund single-ticker workstation.
//   • Ticker search bar (enter key + button)
//   • Left summary panel (fund info, price, category, expense
//     ratio, 52W range, performance badges, risk metrics,
//     price sparkline)
//   • Right panel: Profile & Risk / Performance / Comparison
//
// Data: /api/funds?symbol=XYZ
// ============================================================

import { fmt, fmtPct, fmtCurrency, cls, useChart } from './utils.js';
import { Loading, EmptyState } from './components.js';
import { FundProfile } from './funds-profile.js';
import { FundPerformance } from './funds-performance.js';
import { FundComparison } from './funds-comparison.js';
import { FundScreener } from './fund-screener.js';

var useState = React.useState, useEffect = React.useEffect, useCallback = React.useCallback, useRef = React.useRef;
var h = React.createElement;

// ------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------

function PerfBadge(p) {
    var bg = p.value == null ? 'rgba(255,255,255,0.04)' : p.value > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
    var color = p.value == null ? 'var(--text-muted)' : p.value > 0 ? '#10b981' : '#ef4444';
    var txt = p.value == null ? '\u2014' : (p.value > 0 ? '+' : '') + (p.value * 100).toFixed(2) + '%';
    return h('div', { style: { textAlign: 'center', flex: 1 } },
        h('div', { style: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.42)', marginBottom: 4 } }, p.label),
        h('div', { style: { fontWeight: 600, fontSize: 13, padding: '4px 8px', borderRadius: 6, background: bg, color: color } }, txt));
}

function RangeBar(p) {
    if (p.low == null || p.high == null || p.current == null || p.high <= p.low) {
        return h('div', { style: { color: 'var(--text-muted)' } }, '\u2014');
    }
    var pct = Math.max(0, Math.min(100, ((p.current - p.low) / (p.high - p.low)) * 100));
    return h('div', null,
        h('div', { style: { position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 6, marginBottom: 4 } },
            h('div', { style: { position: 'absolute', top: -3, left: pct + '%', transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: '50%', background: '#00d4ff', boxShadow: '0 0 8px rgba(0,212,255,0.6)' } })
        ),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.42)' } },
            h('span', null, fmtCurrency(p.low)),
            h('span', null, fmtCurrency(p.high))
        )
    );
}

function Sparkline(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        if (!p.series || p.series.length < 2) return null;
        return {
            type: 'line',
            data: { labels: p.series.map(function(s) { return ''; }),
                    datasets: [{ data: p.series.map(function(s) { return s.close; }),
                                 borderColor: '#00d4ff', borderWidth: 1.5, pointRadius: 0,
                                 fill: true, backgroundColor: 'rgba(0,212,255,0.08)' }] },
            options: { responsive: true, maintainAspectRatio: false,
                       plugins: { legend: { display: false }, tooltip: { enabled: false } },
                       scales: { x: { display: false }, y: { display: false } } }
        };
    }, [p.series]);
    return h('div', { style: { height: p.height || 120 } }, h('canvas', { ref: ref }));
}

function MetricTile(p) {
    return h('div', { className: 'metric-card' },
        h('div', { className: 'label' }, p.label),
        h('div', { className: 'value', style: p.color ? { color: p.color } : null }, p.value),
        p.sub ? h('div', { className: 'sub' }, p.sub) : null
    );
}

// ------------------------------------------------------------
// Right-panel tab definitions
// ------------------------------------------------------------

var TABS = [
    { id: 'profile', label: 'Profile & Risk' },
    { id: 'performance', label: 'Performance' },
    { id: 'comparison', label: 'Comparison' },
];

function AnalysisTabs(p) {
    var _t = useState('profile');
    var tab = _t[0], setTab = _t[1];

    var content = null;
    if (tab === 'profile') content = h(FundProfile, { data: p.data });
    else if (tab === 'performance') content = h(FundPerformance, { data: p.data });
    else if (tab === 'comparison') content = h(FundComparison, { symbol: p.symbol, data: p.data });

    return h('div', null,
        h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 } },
            TABS.map(function(t) {
                var active = t.id === tab;
                return h('button', {
                    key: t.id,
                    onClick: function() { setTab(t.id); },
                    style: {
                        background: active ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                        color: active ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                        border: '1px solid ' + (active ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                        borderRadius: 8, padding: '8px 16px', fontSize: 12,
                        fontWeight: active ? 600 : 400, cursor: 'pointer',
                        letterSpacing: 0.5,
                    }
                }, t.label);
            })
        ),
        content
    );
}

// ------------------------------------------------------------
// Main component
// ------------------------------------------------------------

export function FundsDashboard() {
    var _i = useState('SPY'), input = _i[0], setInput = _i[1];
    var _sym = useState(null), symbol = _sym[0], setSymbol = _sym[1];
    var _st = useState('idle'), status = _st[0], setStatus = _st[1];
    var _err = useState(null), errMsg = _err[0], setErrMsg = _err[1];
    var _data = useState(null), data = _data[0], setData = _data[1];

    var analyse = useCallback(function(raw) {
        var s = (raw || '').trim().toUpperCase();
        if (!s) return;
        if (!/^[A-Z0-9.\-]{1,12}$/.test(s)) {
            setErrMsg('Ticker must be 1\u201312 characters of A\u2013Z / 0\u20139 / . / -');
            setStatus('error');
            return;
        }
        setSymbol(s);
    }, []);

    // Data fetch
    useEffect(function() {
        if (!symbol) return;
        var cancelled = false;
        setStatus('loading'); setErrMsg(null); setData(null);
        fetch('/api/funds?symbol=' + encodeURIComponent(symbol))
            .then(function(r) { if (!r.ok) throw new Error('API returned ' + r.status); return r.json(); })
            .then(function(d) { if (!cancelled) { setData(d); setStatus('ready'); } })
            .catch(function(e) { if (!cancelled) { setErrMsg(e.message); setStatus('error'); } });
        return function() { cancelled = true; };
    }, [symbol]);

    // Search bar (visible when a symbol is loaded)
    var header = h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 } },
            h('button', {
                onClick: function() { setSymbol(null); setStatus('idle'); setData(null); setInput(''); },
                style: {
                    background: 'transparent', color: 'rgba(255,255,255,0.45)',
                    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5,
                    padding: '5px 10px', cursor: 'pointer', fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5,
                }
            }, '← Screener'),
            h('div', { className: 'page-title', style: { margin: 0 } }, 'Fund Research')
        ),
        h('div', { className: 'card', style: { display: 'flex', gap: 12, alignItems: 'center', padding: 14 } },
            h('input', {
                type: 'text',
                value: input,
                onChange: function(e) { setInput(e.target.value); },
                onKeyDown: function(e) { if (e.key === 'Enter') analyse(input); },
                placeholder: 'Enter fund ticker (e.g. SPY, QQQ, VTI)',
                spellCheck: false,
                style: {
                    flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: '10px 14px', color: 'rgba(255,255,255,0.92)',
                    fontFamily: 'inherit', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1
                }
            }),
            h('button', {
                onClick: function() { analyse(input); },
                disabled: status === 'loading',
                style: {
                    background: 'linear-gradient(135deg, #00d4ff, #6366f1)', color: '#fff',
                    border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600,
                    cursor: status === 'loading' ? 'not-allowed' : 'pointer', opacity: status === 'loading' ? 0.6 : 1,
                    letterSpacing: 1, textTransform: 'uppercase', fontSize: 12
                }
            }, status === 'loading' ? 'Loading\u2026' : 'Analyse')
        )
    );

    // Idle state → show screener
    if (status === 'idle') {
        return h(FundScreener, {
            onSelect: function(sel) {
                // sel = { type, symbol, id }
                var sym = sel.symbol || sel.id;
                if (sym) { setInput(String(sym)); analyse(String(sym)); }
            },
        });
    }
    // Loading state
    if (status === 'loading') {
        return h('div', null, header, h(Loading, null));
    }
    // Error state
    if (status === 'error') {
        return h('div', null, header,
            h('div', { className: 'card', style: { borderColor: 'rgba(239,68,68,0.3)' } },
                h('div', { className: 'card-title', style: { color: 'var(--red)' } }, 'Request failed'),
                h('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.7)' } }, errMsg || 'Unknown error'),
                h('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 } },
                    'Fund data sourced via Yahoo Finance. Responses are cached for 4h so repeat lookups are instant.')
            )
        );
    }

    // Ready state — extract fields
    var profile = data.profile || {};
    var meta = data.meta || {};
    var metrics = data.metrics || {};
    var series = data.series || [];

    var fundName = profile.name || meta.name || symbol;
    var price = metrics.current || meta.price;
    var change = metrics.ret1D;
    var priceColor = change == null ? null : change >= 0 ? '#10b981' : '#ef4444';
    var category = meta.category;
    var expense = meta.expense;

    return h('div', null, header,
        h('div', { style: { display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, marginTop: 16 } },
            // --- LEFT PANEL ---
            h('div', null,
                // Fund name + symbol
                h('div', { className: 'card' },
                    h('div', { style: { fontSize: 22, fontWeight: 700 } },
                        fundName, ' ',
                        h('span', { style: { color: '#00d4ff', fontSize: 18 } }, '(' + symbol + ')')
                    ),
                    category ? h('div', { style: { marginTop: 6 } },
                        h('span', { style: { fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(99,102,241,0.15)', color: '#818cf8', letterSpacing: 0.5 } }, category)
                    ) : null,
                    expense != null ? h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.52)', marginTop: 8 } },
                        'Expense Ratio: ', h('span', { style: { fontWeight: 600, color: 'rgba(255,255,255,0.85)' } }, (expense * 100).toFixed(2) + '%')
                    ) : null,
                    // Cross-module actions
                    h('div', { style: { display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' } },
                        h('button', {
                            onClick: function() { window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol: symbol } })); },
                            title: 'Deep-dive equity research for ' + symbol,
                            style: { background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff', borderRadius: 5, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'Figtree' }
                        }, '◈ Research'),
                        h('button', {
                            onClick: function() { window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'valuation', symbol: symbol } })); },
                            title: 'Run valuation models for ' + symbol,
                            style: { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', borderRadius: 5, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'Figtree' }
                        }, '◆ Value'),
                        h('button', {
                            onClick: function() { window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'trading', symbol: symbol } })); },
                            title: 'Open order ticket for ' + symbol,
                            style: { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', borderRadius: 5, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, fontFamily: 'Figtree' }
                        }, '▶ Trade')
                    )
                ),
                // Price tile
                h('div', { className: 'metrics-row', style: { gridTemplateColumns: '1fr', marginTop: 12 } },
                    h(MetricTile, {
                        label: 'Current Price',
                        value: price != null ? fmtCurrency(price) : '\u2014',
                        sub: change != null ? ((change > 0 ? '+' : '') + (change * 100).toFixed(2) + '% today') : null,
                        color: priceColor
                    })
                ),
                // 52W Range
                h('div', { className: 'card', style: { marginTop: 12 } },
                    h('div', { className: 'card-title' }, '52-Week Range'),
                    h(RangeBar, { low: metrics.low52, high: metrics.high52, current: price })
                ),
                // Performance badges
                h('div', { className: 'card', style: { marginTop: 12 } },
                    h('div', { className: 'card-title' }, 'Performance'),
                    h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                        h(PerfBadge, { label: '1M', value: metrics.ret1M }),
                        h(PerfBadge, { label: '3M', value: metrics.ret3M }),
                        h(PerfBadge, { label: '6M', value: metrics.ret6M }),
                        h(PerfBadge, { label: '1Y', value: metrics.ret1Y })
                    )
                ),
                // Risk metrics
                h('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12 } },
                    h(MetricTile, { label: 'Sharpe', value: metrics.sharpe != null ? fmt(metrics.sharpe) : '\u2014' }),
                    h(MetricTile, { label: 'Max Drawdown', value: metrics.maxDrawdown != null ? (metrics.maxDrawdown * 100).toFixed(2) + '%' : '\u2014', color: metrics.maxDrawdown != null && metrics.maxDrawdown < 0 ? '#ef4444' : null }),
                    h(MetricTile, { label: 'Volatility', value: metrics.volatility != null ? (metrics.volatility * 100).toFixed(1) + '%' : '\u2014' })
                ),
                // Sparkline
                h('div', { className: 'card', style: { marginTop: 12 } },
                    h('div', { className: 'card-title' }, 'Price \u2014 Last 252 Days'),
                    h(Sparkline, { series: series.slice(-252), height: 120 })
                )
            ),
            // --- RIGHT PANEL ---
            h('div', null,
                h(AnalysisTabs, { symbol: symbol, data: data })
            )
        )
    );
}
