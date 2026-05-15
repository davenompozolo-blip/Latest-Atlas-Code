import React from 'react';
import { fmt, fmtCurrency, fmtPct, cls, useChart } from './utils.js';

const { useState, useRef, useEffect } = React;

function SubTab(p) {
    return React.createElement('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 } },
        p.tabs.map(function(t) {
            var a = t.id === p.active;
            return React.createElement('button', {
                key: t.id, onClick: function() { p.onSelect(t.id); },
                style: {
                    background: a ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                    color: a ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                    border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                    borderRadius: 6, padding: '6px 14px', fontSize: 11,
                    fontWeight: a ? 600 : 400, cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: 0.8,
                }
            }, t.label);
        })
    );
}

function fN(n, d) { return n != null && isFinite(n) ? Number(n).toFixed(d != null ? d : 2) : '\u2014'; }
function fB(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return fmtCurrency(n);
}
function fPct(n) { return n != null && isFinite(n) ? (n * 100).toFixed(1) + '%' : '\u2014'; }

function fetchPeer(symbol) {
    return fetch('/api/equity?symbol=' + encodeURIComponent(symbol) + '&endpoint=overview')
        .then(function(r) { return r.json(); })
        .then(function(j) {
            if (j.error) return null;
            return {
                symbol: symbol,
                name: j.overview && j.overview.Name || symbol,
                overview: j.overview || {},
                snap: j.financials && j.financials.snapshot || {},
            };
        })
        .catch(function() { return null; });
}

// ---- Sub-tab 1: Comparison Table ----

function CompTable(p) {
    var all = p.peers;
    if (!all.length) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'No peer data loaded.');

    var rows = [
        { label: 'Market Cap', fn: function(d) { return fB(d.overview.MarketCapitalization ? Number(d.overview.MarketCapitalization) : null); } },
        { label: 'P/E Ratio', fn: function(d) { return fN(d.overview.PERatio ? Number(d.overview.PERatio) : null, 1) + 'x'; } },
        { label: 'Forward P/E', fn: function(d) { return fN(d.snap.forwardPE, 1) + 'x'; } },
        { label: 'PEG Ratio', fn: function(d) { return fN(d.snap.pegRatio); } },
        { label: 'Price / Book', fn: function(d) { return fN(d.snap.priceToBook, 1) + 'x'; } },
        { label: 'EV / EBITDA', fn: function(d) { return fN(d.snap.evToEbitda, 1) + 'x'; } },
        { label: 'EV / Revenue', fn: function(d) { return fN(d.snap.evToRevenue, 1) + 'x'; } },
        { label: 'Gross Margin', fn: function(d) { return fPct(d.snap.grossMargins); } },
        { label: 'Operating Margin', fn: function(d) { return fPct(d.snap.operatingMargins); } },
        { label: 'Net Margin', fn: function(d) { return fPct(d.snap.profitMargins); } },
        { label: 'ROE', fn: function(d) { return fPct(d.snap.returnOnEquity); } },
        { label: 'ROA', fn: function(d) { return fPct(d.snap.returnOnAssets); } },
        { label: 'Revenue Growth', fn: function(d) { return fPct(d.snap.revenueGrowth); } },
        { label: 'Earnings Growth', fn: function(d) { return fPct(d.snap.earningsGrowth); } },
        { label: 'Debt / Equity', fn: function(d) { return d.snap.debtToEquity != null ? fN(d.snap.debtToEquity, 1) + '%' : '\u2014'; } },
        { label: 'Dividend Yield', fn: function(d) { return d.overview.DividendYield ? (Number(d.overview.DividendYield) * 100).toFixed(2) + '%' : '\u2014'; } },
    ];

    return React.createElement('div', { style: { overflowX: 'auto' } },
        React.createElement('table', { className: 'data-table', style: { minWidth: 500 } },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    React.createElement('th', null, 'Metric'),
                    all.map(function(d) {
                        return React.createElement('th', { key: d.symbol, style: { textAlign: 'center', color: d.isTarget ? '#00d4ff' : 'var(--text-muted)' } }, d.symbol);
                    })
                )
            ),
            React.createElement('tbody', null,
                rows.map(function(row) {
                    return React.createElement('tr', { key: row.label },
                        React.createElement('td', { style: { fontWeight: 500 } }, row.label),
                        all.map(function(d) {
                            return React.createElement('td', { key: d.symbol, style: { textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", background: d.isTarget ? 'rgba(0,212,255,0.04)' : 'transparent' } }, row.fn(d));
                        })
                    );
                })
            )
        )
    );
}

// ---- Sub-tab 2: Relative Multiples Chart ----

function MultiplesChart(p) {
    var all = p.peers;
    var ref = useRef(null);

    useChart(ref, function() {
        if (all.length < 2) return null;
        var metrics = [
            { key: 'pe', label: 'P/E', fn: function(d) { return d.overview.PERatio ? Number(d.overview.PERatio) : null; } },
            { key: 'fpe', label: 'Fwd P/E', fn: function(d) { return d.snap.forwardPE; } },
            { key: 'pb', label: 'P/B', fn: function(d) { return d.snap.priceToBook; } },
            { key: 'eve', label: 'EV/EBITDA', fn: function(d) { return d.snap.evToEbitda; } },
            { key: 'evr', label: 'EV/Rev', fn: function(d) { return d.snap.evToRevenue; } },
        ];

        var colors = ['#00d4ff', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
        var datasets = all.map(function(d, i) {
            return {
                label: d.symbol,
                data: metrics.map(function(m) { var v = m.fn(d); return v != null && isFinite(v) ? v : 0; }),
                backgroundColor: (d.isTarget ? 'rgba(0,212,255,0.6)' : colors[i % colors.length].replace(')', ',0.4)').replace('rgb', 'rgba')),
                borderColor: d.isTarget ? '#00d4ff' : colors[i % colors.length],
                borderWidth: d.isTarget ? 2 : 1,
                borderRadius: 4,
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
    }, [all]);

    if (all.length < 2) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Need at least 2 companies to compare.');
    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title' }, 'Relative Valuation Multiples'),
        React.createElement('div', { style: { height: 320 } }, React.createElement('canvas', { ref: ref }))
    );
}

// ---- Sub-tab 3: Margins & Profitability Chart ----

function MarginsChart(p) {
    var all = p.peers;
    var ref = useRef(null);

    useChart(ref, function() {
        if (all.length < 2) return null;
        var metrics = [
            { label: 'Gross', fn: function(d) { var v = d.snap.grossMargins; return v != null ? v * 100 : null; } },
            { label: 'Operating', fn: function(d) { var v = d.snap.operatingMargins; return v != null ? v * 100 : null; } },
            { label: 'Net', fn: function(d) { var v = d.snap.profitMargins; return v != null ? v * 100 : null; } },
            { label: 'ROE', fn: function(d) { var v = d.snap.returnOnEquity; return v != null ? v * 100 : null; } },
            { label: 'ROA', fn: function(d) { var v = d.snap.returnOnAssets; return v != null ? v * 100 : null; } },
        ];

        var colors = ['#00d4ff', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];
        var datasets = all.map(function(d, i) {
            return {
                label: d.symbol,
                data: metrics.map(function(m) { var v = m.fn(d); return v != null && isFinite(v) ? v : 0; }),
                backgroundColor: d.isTarget ? 'rgba(0,212,255,0.6)' : colors[i % colors.length].replace(')', ',0.4)').replace('rgb', 'rgba'),
                borderColor: d.isTarget ? '#00d4ff' : colors[i % colors.length],
                borderWidth: d.isTarget ? 2 : 1,
                borderRadius: 4,
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
                    y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, callback: function(v) { return v + '%'; } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [all]);

    if (all.length < 2) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'Need at least 2 companies to compare.');
    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title' }, 'Margins & Profitability Comparison'),
        React.createElement('div', { style: { height: 320 } }, React.createElement('canvas', { ref: ref }))
    );
}

// ---- Main export ----

var TABS = [
    { id: 'table', label: 'Comparison' },
    { id: 'multiples', label: 'Relative Multiples' },
    { id: 'margins', label: 'Margins & Returns' },
];

export function PeerComparison(p) {
    var _t = useState('table');
    var tab = _t[0], setTab = _t[1];

    var _d = useState([]);
    var peerData = _d[0], setPeerData = _d[1];
    var _l = useState(true);
    var loading = _l[0], setLoading = _l[1];

    var peerList = p.peers || [];
    var targetSnap = p.financials && p.financials.snapshot || {};

    useEffect(function() {
        if (!peerList.length) { setLoading(false); return; }
        setLoading(true);
        var toFetch = peerList.slice(0, 5);
        Promise.all(toFetch.map(fetchPeer)).then(function(results) {
            var valid = results.filter(function(r) { return r != null; });
            setPeerData(valid);
            setLoading(false);
        });
    }, [peerList.join(',')]);

    if (loading) return React.createElement('div', { className: 'card', style: { padding: 32, textAlign: 'center', color: 'var(--text-sec)' } }, 'Loading peer data\u2026');

    if (!peerList.length) {
        return React.createElement('div', { className: 'card', style: { padding: 32, color: 'var(--text-muted)' } }, 'No peer companies identified for this ticker.');
    }

    var target = {
        symbol: p.symbol,
        name: p.overview && p.overview.Name || p.symbol,
        overview: p.overview || {},
        snap: targetSnap,
        isTarget: true,
    };

    var all = [target].concat(peerData);

    var content = null;
    if (tab === 'table') content = React.createElement(CompTable, { peers: all });
    if (tab === 'multiples') content = React.createElement(MultiplesChart, { peers: all });
    if (tab === 'margins') content = React.createElement(MarginsChart, { peers: all });

    return React.createElement('div', null,
        React.createElement('div', { style: { fontSize: 12, color: 'var(--text-sec)', marginBottom: 12 } },
            'Comparing ', React.createElement('strong', { style: { color: '#00d4ff' } }, p.symbol),
            ' against ', peerData.length, ' peers: ',
            peerData.map(function(d) { return d.symbol; }).join(', ')
        ),
        React.createElement(SubTab, { tabs: TABS, active: tab, onSelect: setTab }),
        content
    );
}
