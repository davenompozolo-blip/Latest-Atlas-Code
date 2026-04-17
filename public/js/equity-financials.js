// ============================================================
// ATLAS Terminal — Equity Financials (Module B, Stage 2a)
// ------------------------------------------------------------
// Financial Analysis panel with 5 sub-tabs:
//   1. Overview  — key financial metrics grid
//   2. Revenue & Earnings  — 4-year trend bar chart
//   3. Margins & Returns   — margin bars + ROE/ROA
//   4. Earnings Quality    — quarterly EPS beat/miss
//   5. Valuation           — multiples grid (P/E, PEG, etc.)
//
// Data: payload.financials from /api/equity (Yahoo financialData
// + defaultKeyStatistics + earnings modules).
// ============================================================

import { fmt, fmtCurrency, fmtPct, cls, useChart } from './utils.js';

const { useState, useRef } = React;

// --- Helpers ------------------------------------------------

function fmtB(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    var abs = Math.abs(n);
    if (abs >= 1e12) return (n < 0 ? '-' : '') + '$' + (abs / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9)  return (n < 0 ? '-' : '') + '$' + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6)  return (n < 0 ? '-' : '') + '$' + (abs / 1e6).toFixed(1) + 'M';
    return fmtCurrency(n);
}

function pct(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    return (n * 100).toFixed(1) + '%';
}

function Tile({ label, value, sub, color }) {
    return React.createElement('div', { className: 'metric-card' },
        React.createElement('div', { className: 'label' }, label),
        React.createElement('div', { className: 'value', style: color ? { color: color } : null }, value),
        sub ? React.createElement('div', { className: 'sub' }, sub) : null
    );
}

function SubTab({ tabs, active, onSelect }) {
    return React.createElement('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 } },
        tabs.map(function(t) {
            var isActive = t.id === active;
            return React.createElement('button', {
                key: t.id,
                onClick: function() { onSelect(t.id); },
                style: {
                    background: isActive ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                    color: isActive ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                    border: '1px solid ' + (isActive ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                    borderRadius: 6, padding: '6px 14px', fontSize: 11,
                    fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: 0.8,
                }
            }, t.label);
        })
    );
}

// --- Sub-tab 1: Overview -----------------------------------

function OverviewPanel({ s }) {
    if (!s) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'No financial data available.');
    return React.createElement('div', null,
        React.createElement('div', { className: 'metrics-row' },
            React.createElement(Tile, { label: 'Revenue (TTM)', value: fmtB(s.totalRevenue), sub: s.revenueGrowth != null ? pct(s.revenueGrowth) + ' YoY' : null, color: s.revenueGrowth > 0 ? '#10b981' : s.revenueGrowth < 0 ? '#ef4444' : null }),
            React.createElement(Tile, { label: 'EBITDA', value: fmtB(s.ebitda) }),
            React.createElement(Tile, { label: 'Net Income', value: fmtB(s.netIncome), sub: s.earningsGrowth != null ? pct(s.earningsGrowth) + ' YoY' : null, color: s.earningsGrowth > 0 ? '#10b981' : s.earningsGrowth < 0 ? '#ef4444' : null }),
            React.createElement(Tile, { label: 'Free Cash Flow', value: fmtB(s.freeCashflow) })
        ),
        React.createElement('div', { className: 'metrics-row', style: { marginTop: 12 } },
            React.createElement(Tile, { label: 'Operating Cash Flow', value: fmtB(s.operatingCashflow) }),
            React.createElement(Tile, { label: 'Total Cash', value: fmtB(s.totalCash) }),
            React.createElement(Tile, { label: 'Total Debt', value: fmtB(s.totalDebt) }),
            React.createElement(Tile, { label: 'Debt / Equity', value: s.debtToEquity != null ? fmt(s.debtToEquity, 1) + '%' : '\u2014' })
        )
    );
}

// --- Sub-tab 2: Revenue & Earnings -------------------------

function RevenuePanel({ yearly }) {
    var chartRef = useRef(null);
    useChart(chartRef, function() {
        if (!yearly || !yearly.length) return null;
        return {
            type: 'bar',
            data: {
                labels: yearly.map(function(r) { return 'FY ' + r.year; }),
                datasets: [
                    { label: 'Revenue', data: yearly.map(function(r) { return r.revenue; }), backgroundColor: 'rgba(0,212,255,0.5)', borderColor: '#00d4ff', borderWidth: 1, borderRadius: 4 },
                    { label: 'Net Income', data: yearly.map(function(r) { return r.earnings; }), backgroundColor: 'rgba(139,92,246,0.5)', borderColor: '#8b5cf6', borderWidth: 1, borderRadius: 4 },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, callback: function(v) { return '$' + (v / 1e9).toFixed(0) + 'B'; } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [yearly]);

    if (!yearly || !yearly.length) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'No yearly data available.');
    return React.createElement('div', null,
        React.createElement('div', { style: { height: 220 } }, React.createElement('canvas', { ref: chartRef })),
        React.createElement('table', { className: 'data-table', style: { marginTop: 16 } },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    ['Year', 'Revenue', 'Net Income', 'Net Margin', 'Rev YoY'].map(function(h) { return React.createElement('th', { key: h }, h); }))),
            React.createElement('tbody', null,
                yearly.map(function(r, i) {
                    var margin = r.revenue && r.earnings ? r.earnings / r.revenue : null;
                    var prevRev = i > 0 ? yearly[i - 1].revenue : null;
                    var revYoY = prevRev && r.revenue ? (r.revenue / prevRev - 1) : null;
                    return React.createElement('tr', { key: r.year },
                        React.createElement('td', { style: { fontWeight: 600, color: '#00d4ff' } }, 'FY ' + r.year),
                        React.createElement('td', null, fmtB(r.revenue)),
                        React.createElement('td', null, fmtB(r.earnings)),
                        React.createElement('td', { className: cls(margin) }, margin != null ? pct(margin) : '\u2014'),
                        React.createElement('td', { className: cls(revYoY) }, revYoY != null ? pct(revYoY) : '\u2014')
                    );
                })
            )
        )
    );
}

// --- Sub-tab 3: Margins & Returns --------------------------

function MarginsPanel({ s }) {
    if (!s) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'No margin data available.');
    var margins = [
        { label: 'Gross', value: s.grossMargins },
        { label: 'EBITDA', value: s.ebitdaMargins },
        { label: 'Operating', value: s.operatingMargins },
        { label: 'Net', value: s.profitMargins },
    ];
    function marginBar(m) {
        var w = m.value != null ? Math.max(0, Math.min(100, m.value * 100)) : 0;
        return React.createElement('div', { key: m.label, style: { marginBottom: 10 } },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 } },
                React.createElement('span', { style: { color: 'rgba(255,255,255,0.52)' } }, m.label + ' Margin'),
                React.createElement('span', { style: { fontWeight: 600 } }, m.value != null ? pct(m.value) : '\u2014')
            ),
            React.createElement('div', { style: { height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' } },
                React.createElement('div', { style: { height: '100%', width: w + '%', borderRadius: 4, background: 'linear-gradient(90deg, #00d4ff, #8b5cf6)', transition: 'width 0.6s ease' } })
            )
        );
    }
    return React.createElement('div', null,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Margins'),
            margins.map(marginBar)
        ),
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 12 } },
            React.createElement(Tile, { label: 'Return on Equity', value: s.returnOnEquity != null ? pct(s.returnOnEquity) : '\u2014', color: s.returnOnEquity > 0.15 ? '#10b981' : null }),
            React.createElement(Tile, { label: 'Return on Assets', value: s.returnOnAssets != null ? pct(s.returnOnAssets) : '\u2014', color: s.returnOnAssets > 0.10 ? '#10b981' : null })
        )
    );
}

// --- Sub-tab 4: Earnings Quality ---------------------------

function EarningsPanel({ quarterly }) {
    var chartRef = useRef(null);
    useChart(chartRef, function() {
        if (!quarterly || !quarterly.length) return null;
        return {
            type: 'bar',
            data: {
                labels: quarterly.map(function(q) { return q.quarter; }),
                datasets: [
                    { label: 'Actual EPS', data: quarterly.map(function(q) { return q.actual; }), backgroundColor: quarterly.map(function(q) { return q.actual >= q.estimate ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'; }), borderRadius: 4 },
                    { label: 'Estimate', data: quarterly.map(function(q) { return q.estimate; }), backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, borderDash: [4, 4], type: 'line', pointRadius: 4, pointBackgroundColor: 'rgba(255,255,255,0.5)', fill: false },
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, callback: function(v) { return '$' + v.toFixed(2); } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                }
            }
        };
    }, [quarterly]);

    if (!quarterly || !quarterly.length) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'No quarterly earnings data.');
    var beats = quarterly.filter(function(q) { return q.actual >= q.estimate; }).length;
    return React.createElement('div', null,
        React.createElement('div', { style: { fontSize: 13, marginBottom: 12, color: 'rgba(255,255,255,0.7)' } },
            'Beat rate: ', React.createElement('strong', { style: { color: beats === quarterly.length ? '#10b981' : '#f59e0b' } }, beats + '/' + quarterly.length), ' quarters'),
        React.createElement('div', { style: { height: 200 } }, React.createElement('canvas', { ref: chartRef })),
        React.createElement('table', { className: 'data-table', style: { marginTop: 16 } },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    ['Quarter', 'Actual', 'Estimate', 'Surprise', 'Result'].map(function(h) { return React.createElement('th', { key: h }, h); }))),
            React.createElement('tbody', null,
                quarterly.map(function(q) {
                    var surprise = q.actual != null && q.estimate ? (q.actual - q.estimate) / Math.abs(q.estimate) : null;
                    var beat = q.actual >= q.estimate;
                    return React.createElement('tr', { key: q.quarter },
                        React.createElement('td', { style: { fontWeight: 600 } }, q.quarter),
                        React.createElement('td', null, '$' + fmt(q.actual)),
                        React.createElement('td', null, '$' + fmt(q.estimate)),
                        React.createElement('td', { className: cls(surprise) }, surprise != null ? (surprise > 0 ? '+' : '') + (surprise * 100).toFixed(1) + '%' : '\u2014'),
                        React.createElement('td', null, React.createElement('span', { className: 'badge ' + (beat ? 'green' : 'red') }, beat ? 'BEAT' : 'MISS'))
                    );
                })
            )
        )
    );
}

// --- Sub-tab 5: Valuation ----------------------------------

function ValuationPanel({ s, overview }) {
    if (!s) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, 'No valuation data.');
    var pe = overview && overview.PERatio ? Number(overview.PERatio) : null;
    var items = [
        { label: 'Trailing P/E', value: pe, fmt: function(v) { return fmt(v, 1) + 'x'; } },
        { label: 'Forward P/E', value: s.forwardPE, fmt: function(v) { return fmt(v, 1) + 'x'; } },
        { label: 'PEG Ratio', value: s.pegRatio, fmt: function(v) { return fmt(v, 2); } },
        { label: 'Price / Book', value: s.priceToBook, fmt: function(v) { return fmt(v, 1) + 'x'; } },
        { label: 'EV / Revenue', value: s.evToRevenue, fmt: function(v) { return fmt(v, 1) + 'x'; } },
        { label: 'EV / EBITDA', value: s.evToEbitda, fmt: function(v) { return fmt(v, 1) + 'x'; } },
    ];
    return React.createElement('div', null,
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(3, 1fr)' } },
            items.map(function(it) {
                return React.createElement(Tile, { key: it.label, label: it.label, value: it.value != null ? it.fmt(it.value) : '\u2014' });
            })
        ),
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12 } },
            React.createElement(Tile, { label: 'Enterprise Value', value: fmtB(s.enterpriseValue) }),
            React.createElement(Tile, { label: 'Trailing EPS', value: s.trailingEps != null ? '$' + fmt(s.trailingEps) : '\u2014' }),
            React.createElement(Tile, { label: 'Forward EPS', value: s.forwardEps != null ? '$' + fmt(s.forwardEps) : '\u2014' }),
            React.createElement(Tile, { label: 'Book Value / Share', value: s.bookValue != null ? '$' + fmt(s.bookValue) : '\u2014' })
        )
    );
}

// --- Main export -------------------------------------------

var TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'revenue', label: 'Revenue & Earnings' },
    { id: 'margins', label: 'Margins & Returns' },
    { id: 'earnings', label: 'Earnings Quality' },
    { id: 'valuation', label: 'Valuation' },
];

export function FinancialAnalysis({ financials, overview, overviewError }) {
    var _t = useState('overview');
    var tab = _t[0];
    var setTab = _t[1];

    if (!financials) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { style: { color: 'var(--text-muted)', marginBottom: overviewError ? 8 : 0 } }, 'Financial data unavailable \u2014 data providers could not be reached.'),
            overviewError ? React.createElement('div', { style: { fontSize: 11, color: 'rgba(239,68,68,0.7)', fontFamily: 'monospace' } }, overviewError) : null,
            React.createElement('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 8 } }, 'Fundamentals are cached for 24h once fetched successfully. Try again later.')
        );
    }
    var s = financials.snapshot;
    var content = null;
    if (tab === 'overview')   content = React.createElement(OverviewPanel, { s: s });
    if (tab === 'revenue')    content = React.createElement(RevenuePanel, { yearly: financials.yearly });
    if (tab === 'margins')    content = React.createElement(MarginsPanel, { s: s });
    if (tab === 'earnings')   content = React.createElement(EarningsPanel, { quarterly: financials.quarterly });
    if (tab === 'valuation')  content = React.createElement(ValuationPanel, { s: s, overview: overview });

    return React.createElement('div', null,
        React.createElement(SubTab, { tabs: TABS, active: tab, onSelect: setTab }),
        content
    );
}
