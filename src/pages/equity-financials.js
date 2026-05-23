import React from 'react';
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
    // Beat streak: count from most recent (index 0 = most recent) until first miss
    var streak = 0;
    for (var i = 0; i < quarterly.length; i++) {
        if (quarterly[i].actual != null && quarterly[i].estimate != null && quarterly[i].actual >= quarterly[i].estimate) streak++;
        else break;
    }
    return React.createElement('div', null,
        React.createElement('div', { style: { display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' } },
            React.createElement('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.7)' } },
                'Beat rate: ', React.createElement('strong', { style: { color: beats === quarterly.length ? '#10b981' : '#f59e0b' } }, beats + '/' + quarterly.length), ' quarters'),
            streak >= 2 && React.createElement('div', {
                style: { padding: '3px 10px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#22c55e', fontFamily: mono }
            }, '🔥 ' + streak + '-quarter beat streak')
        ),
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

// --- Sub-tab 4a: Earnings Quality (upgraded) ---------------
// (EarningsPanel replaced below)

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

// --- Quality Scorecard: Piotroski F-Score + Altman Z-Score -

var mono = "'JetBrains Mono', ui-monospace, monospace";
var green = '#22c55e', red = '#ef4444', gold = '#f59e0b';

function piotroskiScore(overview, snapshot) {
    if (!overview || !snapshot) return null;
    var score = 0;
    var signals = [];

    function n(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }

    var roa       = n(overview.ReturnOnAssetsTTM);
    var ocf       = n(snapshot.operatingCashflow);
    var totalAssets = n(snapshot.totalAssets) || 1;
    var rev       = n(overview.RevenueTTM) || n(snapshot.totalRevenue) || 1;
    var grossProfit = n(overview.GrossProfitTTM) || n(snapshot.grossProfits) || 0;
    var gm        = grossProfit / rev;
    var ltDebt    = n(snapshot.longTermDebt) || 0;
    var cr        = n(snapshot.currentRatio);

    // Profitability
    var s1 = roa != null && roa > 0;
    score += s1 ? 1 : 0;
    signals.push({ label: 'ROA Positive', pass: s1, value: roa != null ? (roa * 100).toFixed(1) + '%' : '—', group: 'Profitability' });

    var s2 = ocf != null && ocf > 0;
    score += s2 ? 1 : 0;
    signals.push({ label: 'CFO Positive', pass: s2, value: ocf != null ? '$' + (Math.abs(ocf) / 1e9).toFixed(1) + 'B' : '—', group: 'Profitability' });

    var accrualRatio = ocf != null && roa != null ? ocf / totalAssets - roa : null;
    var s3 = accrualRatio != null && accrualRatio > 0;
    if (accrualRatio !== null) score += s3 ? 1 : 0;
    signals.push({ label: 'CFO > Net Income', pass: accrualRatio !== null ? s3 : null, skippable: accrualRatio === null, group: 'Profitability' });

    // Gross margin proxy pass: > 30%
    var s4 = gm > 0.30;
    score += s4 ? 1 : 0;
    signals.push({ label: 'Gross Margin > 30%', pass: s4, value: (gm * 100).toFixed(1) + '%', group: 'Profitability' });

    // Leverage / Liquidity
    var debtRatio = ltDebt / totalAssets;
    var s5 = debtRatio < 0.50;
    score += s5 ? 1 : 0;
    signals.push({ label: 'Debt Ratio < 50%', pass: s5, value: (debtRatio * 100).toFixed(1) + '%', group: 'Leverage' });

    var s6 = cr != null && cr > 1.0;
    if (cr !== null) score += s6 ? 1 : 0;
    signals.push({ label: 'Current Ratio > 1', pass: cr !== null ? s6 : null, skippable: cr === null, value: cr != null ? cr.toFixed(2) : '—', group: 'Leverage' });

    var shares = n(overview.SharesOutstanding);
    var s7 = shares != null && shares > 0; // proxy — no dilution check without prior year
    if (shares !== null) score += s7 ? 1 : 0;
    signals.push({ label: 'Shares Outstanding', pass: shares !== null ? s7 : null, skippable: false, value: shares != null ? (shares / 1e9).toFixed(2) + 'B' : '—', group: 'Leverage' });

    // Efficiency
    var at = rev / totalAssets;
    var s8 = at > 0.5;
    score += s8 ? 1 : 0;
    signals.push({ label: 'Asset Turnover > 0.5', pass: s8, value: at.toFixed(2) + 'x', group: 'Efficiency' });

    var roe = n(overview.ReturnOnEquityTTM);
    var s9 = roe != null && roe > 0.10;
    score += (roe !== null && s9) ? 1 : 0;
    signals.push({ label: 'ROE > 10%', pass: roe !== null ? s9 : null, skippable: roe === null, value: roe != null ? (roe * 100).toFixed(1) + '%' : '—', group: 'Efficiency' });

    var grade = score >= 7 ? 'STRONG' : score >= 4 ? 'NEUTRAL' : 'WEAK';
    var gradeColor = score >= 7 ? green : score >= 4 ? gold : red;
    return { score: score, signals: signals, grade: grade, gradeColor: gradeColor };
}

function altmanZ(overview, snapshot) {
    if (!overview || !snapshot) return null;
    function n(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }
    var ta   = n(snapshot.totalAssets) || 1;
    var wc   = n(snapshot.totalCurrentAssets) - n(snapshot.totalCurrentLiabilities);
    var re   = n(snapshot.retainedEarnings);
    var ebit = n(overview.EBITDA) || n(snapshot.ebitda) || 0;
    var mve  = n(overview.MarketCapitalization);
    var tl   = n(snapshot.totalLiabilities) || n(snapshot.totalDebt) || 1;
    var rev  = n(overview.RevenueTTM) || n(snapshot.totalRevenue) || 0;
    var x1 = wc / ta, x2 = re / ta, x3 = ebit / ta, x4 = mve / tl, x5 = rev / ta;
    var z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5;
    var zone = z > 2.99 ? { label: 'Safe Zone', color: green }
             : z > 1.81 ? { label: 'Grey Zone', color: gold }
             :             { label: 'Distress',  color: red };
    return { z: z, zone: zone };
}

function QualityPanel(props) {
    var o = props.overview, s = props.snapshot;
    if (!o && !s) return React.createElement('div', { style: { color: 'rgba(255,255,255,0.4)' } }, 'No data for quality scorecard.');

    var fScore = piotroskiScore(o, s);
    var zScore = altmanZ(o, s);

    function SigCard(sig) {
        var passColor = sig.pass === null ? 'rgba(255,255,255,0.25)' : sig.pass ? green : red;
        var bg = sig.pass === null ? 'rgba(255,255,255,0.02)' : sig.pass ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)';
        return React.createElement('div', {
            key: sig.label,
            style: { background: bg, border: '1px solid ' + (sig.pass === null ? 'rgba(255,255,255,0.06)' : sig.pass ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'), borderRadius: 8, padding: '10px 12px' }
        },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
                React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.7)' } }, sig.label),
                React.createElement('div', { style: { fontSize: 14, fontWeight: 700, color: passColor } }, sig.pass === null ? '—' : sig.pass ? '✓' : '✗')
            ),
            sig.value && React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: mono, marginTop: 4 } }, sig.value)
        );
    }

    return React.createElement('div', null,
        // F-Score + Z-Score badges
        React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 16 } },
            fScore && React.createElement('div', {
                style: { flex: 1, textAlign: 'center', padding: '16px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid ' + fScore.gradeColor + '44', borderRadius: 10 }
            },
                React.createElement('div', { style: { fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontFamily: mono, marginBottom: 6 } }, 'Piotroski F-Score'),
                React.createElement('div', { style: { fontSize: 40, fontWeight: 800, fontFamily: mono, color: fScore.gradeColor } }, fScore.score + '/9'),
                React.createElement('div', { style: { fontSize: 11, fontWeight: 700, color: fScore.gradeColor, marginTop: 4 } }, fScore.grade)
            ),
            zScore && React.createElement('div', {
                style: { flex: 1, textAlign: 'center', padding: '16px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid ' + zScore.zone.color + '44', borderRadius: 10 }
            },
                React.createElement('div', { style: { fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontFamily: mono, marginBottom: 6 } }, 'Altman Z-Score'),
                React.createElement('div', { style: { fontSize: 40, fontWeight: 800, fontFamily: mono, color: zScore.zone.color } }, zScore.z.toFixed(2)),
                React.createElement('div', { style: { fontSize: 11, fontWeight: 700, color: zScore.zone.color, marginTop: 4 } }, zScore.zone.label)
            )
        ),
        // Signal grid 3×3
        fScore && React.createElement('div', null,
            ['Profitability', 'Leverage', 'Efficiency'].map(function(group) {
                var groupSigs = fScore.signals.filter(function(s) { return s.group === group; });
                return React.createElement('div', { key: group },
                    React.createElement('div', { style: { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', fontFamily: mono, marginBottom: 8, marginTop: 12 } }, group),
                    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 } },
                        groupSigs.map(SigCard)
                    )
                );
            })
        )
    );
}

// --- Capital Allocation Dashboard --------------------------

function capitalAllocation(overview, snapshot) {
    if (!overview || !snapshot) return null;
    function n(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }
    var mktCap   = n(overview.MarketCapitalization) || 1;
    var fcf      = n(snapshot.freeCashflow);
    var opCF     = n(snapshot.operatingCashflow);
    var capEx    = n(snapshot.capitalExpenditures);
    if (fcf == null && opCF != null && capEx != null) fcf = opCF - Math.abs(capEx);
    var fcfYield = fcf != null ? fcf / mktCap : null;

    var netIncome = n(snapshot.netIncome) || 0;
    var equity    = n(snapshot.totalShareholderEquity) || n(snapshot.totalEquity) || 1;
    var ltDebt    = n(snapshot.longTermDebt) || 0;
    var ic        = equity + ltDebt;
    var roic      = ic > 0 ? netIncome / ic : null;

    var beta = n(overview.Beta) || 1;
    var rf = 0.045, erp = 0.055;
    var wacc = rf + beta * erp;
    var roicSpread = roic != null ? roic - wacc : null;

    var divYield = n(overview.DividendYield);

    return { fcfYield, divYield, roic, wacc, roicSpread, fcf, mktCap };
}

function CapitalAllocationPanel(props) {
    var o = props.overview, s = props.snapshot;
    var data = capitalAllocation(o, s);
    if (!data) return React.createElement('div', { style: { color: 'rgba(255,255,255,0.4)' } }, 'No data for capital allocation.');

    function StatTile(t) {
        return React.createElement('div', {
            key: t.label,
            style: { flex: 1, padding: '14px 0', textAlign: 'center', borderRight: t.last ? 'none' : '1px solid rgba(255,255,255,0.07)' }
        },
            React.createElement('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', fontFamily: mono, marginBottom: 6 } }, t.label),
            React.createElement('div', { style: { fontSize: 22, fontWeight: 700, fontFamily: mono, color: t.color || 'rgba(255,255,255,0.88)' } }, t.value),
            t.sub && React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.45)', fontFamily: mono, marginTop: 4 } }, t.sub)
        );
    }

    var fcfColor   = data.fcfYield == null ? null : data.fcfYield > 0.04 ? green : data.fcfYield > 0.01 ? gold : red;
    var roicColor  = data.roic == null ? null : data.roic > data.wacc ? green : data.roic > 0 ? gold : red;
    var spreadColor = data.roicSpread == null ? null : data.roicSpread > 0 ? green : red;

    var spreadInsight = data.roicSpread != null
        ? (data.roicSpread > 0 ? 'ROIC exceeds WACC by ' + (data.roicSpread * 100).toFixed(1) + '%p — creating economic value.' : 'ROIC trails WACC by ' + (Math.abs(data.roicSpread) * 100).toFixed(1) + '%p — priced for future returns.')
        : null;

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title' }, 'CAPITAL ALLOCATION'),
        React.createElement('div', { style: { display: 'flex', background: 'rgba(255,255,255,0.02)', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 12 } },
            StatTile({ label: 'FCF Yield', value: data.fcfYield != null ? (data.fcfYield * 100).toFixed(2) + '%' : '—', color: fcfColor, sub: data.fcf != null ? '$' + (Math.abs(data.fcf) / 1e9).toFixed(1) + 'B FCF' : null }),
            StatTile({ label: 'Dividend Yield', value: data.divYield != null ? (data.divYield * 100).toFixed(2) + '%' : 'No Div.', color: data.divYield > 0 ? green : 'rgba(255,255,255,0.4)' }),
            StatTile({ label: 'ROIC', value: data.roic != null ? (data.roic * 100).toFixed(1) + '%' : '—', color: roicColor }),
            StatTile({ label: 'WACC Proxy', value: (data.wacc * 100).toFixed(1) + '%', sub: 'β=' + (parseFloat(o.Beta) || 1).toFixed(2), last: true }),
        ),
        data.roicSpread != null && React.createElement('div', {
            style: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', background: data.roicSpread > 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', border: '1px solid ' + (data.roicSpread > 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'), borderRadius: 8 }
        },
            React.createElement('div', { style: { fontSize: 18, fontWeight: 700, fontFamily: mono, color: spreadColor } },
                (data.roicSpread > 0 ? '+' : '') + (data.roicSpread * 100).toFixed(1) + '%p'
            ),
            React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.6)' } },
                React.createElement('span', { style: { fontWeight: 700, color: spreadColor } }, 'ROIC – WACC Spread · '),
                spreadInsight
            )
        )
    );
}

// --- Main export -------------------------------------------

var TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'revenue', label: 'Revenue & Earnings' },
    { id: 'margins', label: 'Margins & Returns' },
    { id: 'earnings', label: 'Earnings Quality' },
    { id: 'quality', label: 'Quality Score' },
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
    if (tab === 'quality')    content = React.createElement('div', null,
        React.createElement(QualityPanel, { overview: overview, snapshot: s }),
        React.createElement(CapitalAllocationPanel, { overview: overview, snapshot: s })
    );
    if (tab === 'valuation')  content = React.createElement(ValuationPanel, { s: s, overview: overview });

    return React.createElement('div', null,
        React.createElement(SubTab, { tabs: TABS, active: tab, onSelect: setTab }),
        content
    );
}
