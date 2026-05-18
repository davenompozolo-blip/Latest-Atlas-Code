import * as LightweightCharts from 'lightweight-charts';
import Chart from 'chart.js/auto';
import React from 'react';
// ============================================================
// ATLAS Terminal — Performance Suite: Overview & Returns Panels
// ------------------------------------------------------------
// React 18 UMD, no JSX. Chart.js for visualizations.
// ============================================================

import { fmt, fmtPct, fmtCurrency, cls, useChart, sharpeStatus, volStatus, returnStatus, ddStatus, calmarStatus } from './utils.js';
import { HeroCard } from './components.js';
import {
    computePortfolioMetrics, computeDrawdownSeries, computeReturnsBins,
    computeMonthlyReturns, computeCumulativeReturns, computePeriodReturns,
    computePositionContributions
} from './perf-engine.js';

var useRef = React.useRef, useEffect = React.useEffect, useMemo = React.useMemo, useState = React.useState;
var h = React.createElement;

// ─── Position-entry helpers (used by the equity curve overlay) ───────────────
// Normalises raw transaction rows from vw_transactions into a chart-ready
// marker set + a decision-useful summary (winners, losers, hit rate).
function normaliseTx(t) {
    var sym  = t.symbol || t.ticker;
    var date = t.transaction_date || t.date || t.trade_date || t.filled_at;
    var side = (t.side || t.transaction_type || '').toString().toUpperCase();
    var qty  = Math.abs(Number(t.quantity || t.qty || t.shares || 0));
    var px   = Number(t.price || t.fill_price || t.avg_price || 0);
    if (date && date.length > 10) date = date.slice(0, 10);
    return { symbol: sym, date: date, side: side, qty: qty, price: px, notional: qty * px };
}

function buildEntryMarkers(navSeries, txData, positions, mode) {
    var empty = { markers: [], summary: null, totalTrades: 0 };
    if (!Array.isArray(navSeries) || navSeries.length < 2 || !Array.isArray(txData) || !txData.length) return empty;

    var navDates = navSeries.map(function(d) { return (d.price_date || '').slice(0, 10); });
    var navByDate = {};
    navSeries.forEach(function(d, i) { navByDate[navDates[i]] = d.nav; });
    var firstNav  = navSeries[0].nav;
    var latestNav = navSeries[navSeries.length - 1].nav;

    // Snap any trade date to the nearest NAV date on or after it (markets closed → next session)
    function snapToNav(d) {
        if (navByDate[d]) return d;
        for (var i = 0; i < navDates.length; i++) if (navDates[i] >= d) return navDates[i];
        return null;
    }

    var clean = txData.map(normaliseTx).filter(function(t) {
        return t.symbol && t.date && (t.side.indexOf('BUY') >= 0 || t.side.indexOf('SELL') >= 0);
    });

    // First-entry mode: keep only the earliest BUY per symbol
    if (mode === 'first-entry') {
        var firstSeen = {};
        clean = clean.filter(function(t) {
            if (t.side.indexOf('BUY') < 0) return false;
            if (firstSeen[t.symbol] && firstSeen[t.symbol] <= t.date) return false;
            firstSeen[t.symbol] = t.date;
            return true;
        });
    }

    // Notable mode: keep only trades ≥ 0.5% of latest NAV
    if (mode === 'notable' && latestNav > 0) {
        var threshold = latestNav * 0.005;
        clean = clean.filter(function(t) { return t.notional >= threshold; });
    }

    // Group by snapped NAV date, separate BUY vs SELL
    var grouped = {};
    clean.forEach(function(t) {
        var snapped = snapToNav(t.date);
        if (!snapped) return;
        var key = snapped + '|' + (t.side.indexOf('BUY') >= 0 ? 'BUY' : 'SELL');
        if (!grouped[key]) grouped[key] = { date: snapped, side: t.side.indexOf('BUY') >= 0 ? 'BUY' : 'SELL', items: [], notional: 0 };
        grouped[key].items.push(t);
        grouped[key].notional += t.notional;
    });

    var markers = Object.keys(grouped).map(function(k) {
        var g = grouped[k];
        var isBuy = g.side === 'BUY';
        var topSyms = g.items.slice().sort(function(a, b) { return b.notional - a.notional; })
            .slice(0, 2).map(function(t) { return t.symbol; });
        var label = topSyms.join('/');
        if (g.items.length > topSyms.length) label += '+' + (g.items.length - topSyms.length);
        return {
            time:     g.date,
            position: isBuy ? 'belowBar' : 'aboveBar',
            color:    isBuy ? '#10b981' : '#ef4444',
            shape:    isBuy ? 'arrowUp' : 'arrowDown',
            text:     label,
        };
    }).sort(function(a, b) { return a.time < b.time ? -1 : 1; });

    // Decision-useful summary: P&L since entry for each grouped trade
    var posMap = {};
    (positions || []).forEach(function(p) { posMap[p.symbol] = p; });

    var rows = Object.keys(grouped).map(function(k) {
        var g = grouped[k];
        var navAtEntry = navByDate[g.date] || firstNav;
        var navReturn  = (latestNav - navAtEntry) / navAtEntry;
        // Per-symbol return since entry (only for first-entry/notable buy aggregates)
        var primarySym = g.items.slice().sort(function(a, b) { return b.notional - a.notional; })[0].symbol;
        var pos = posMap[primarySym];
        var posReturn = pos && pos.unrealised_return_pct != null ? Number(pos.unrealised_return_pct) : null;
        return {
            date: g.date, side: g.side, primarySym: primarySym, itemCount: g.items.length,
            notional: g.notional, navReturnSince: navReturn, posReturn: posReturn,
        };
    });

    var buyRows = rows.filter(function(r) { return r.side === 'BUY'; });
    var winners = buyRows.filter(function(r) { return r.posReturn != null && r.posReturn > 0; });
    var losers  = buyRows.filter(function(r) { return r.posReturn != null && r.posReturn < 0; });
    var hitRate = (winners.length + losers.length) > 0 ? winners.length / (winners.length + losers.length) : null;
    var avgReturn = buyRows.length ? buyRows.reduce(function(s, r) { return s + (r.posReturn || 0); }, 0) / buyRows.length : null;
    var topWin  = winners.slice().sort(function(a, b) { return (b.posReturn || 0) - (a.posReturn || 0); })[0];
    var topLoss = losers.slice().sort(function(a, b) { return (a.posReturn || 0) - (b.posReturn || 0); })[0];

    return {
        markers: markers,
        totalTrades: txData.length,
        summary: {
            shown: markers.length, buys: buyRows.length, sells: rows.length - buyRows.length,
            hitRate: hitRate, avgReturn: avgReturn,
            topWin: topWin, topLoss: topLoss,
        },
    };
}

function EntryDecisionStrip(props) {
    var s = props.summary;
    if (!s) return null;
    function stat(label, value, color) {
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
            h('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono', letterSpacing: 0.8, textTransform: 'uppercase' } }, label),
            h('div', { style: { fontSize: 13, fontWeight: 700, color: color || 'rgba(255,255,255,0.85)', fontFamily: 'JetBrains Mono' } }, value)
        );
    }
    var hr = s.hitRate != null ? (s.hitRate * 100).toFixed(0) + '%' : '—';
    var hrColor = s.hitRate == null ? null : s.hitRate >= 0.6 ? '#10b981' : s.hitRate >= 0.4 ? '#f59e0b' : '#ef4444';
    var ar = s.avgReturn != null ? (s.avgReturn >= 0 ? '+' : '') + (s.avgReturn * 100).toFixed(1) + '%' : '—';
    var arColor = s.avgReturn == null ? null : s.avgReturn >= 0 ? '#10b981' : '#ef4444';

    return h('div', {
        style: {
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14,
            marginTop: 12, padding: '12px 14px',
            background: 'rgba(0,212,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6,
        }
    },
        stat('Entries Shown', s.shown + ' (' + s.buys + ' buy · ' + s.sells + ' sell)'),
        stat('Hit Rate', hr, hrColor),
        stat('Avg Return Since Entry', ar, arColor),
        stat('Top Win',  s.topWin  ? s.topWin.primarySym  + ' +' + ((s.topWin.posReturn  || 0) * 100).toFixed(1) + '%' : '—', '#10b981'),
        stat('Top Loss', s.topLoss ? s.topLoss.primarySym + ' '  + ((s.topLoss.posReturn || 0) * 100).toFixed(1) + '%' : '—', '#ef4444')
    );
}

// --- Helpers -------------------------------------------------

function retColor(v) {
    if (v == null) return 'rgba(255,255,255,0.5)';
    return v >= 0 ? '#10b981' : '#ef4444';
}

function volColor(v) {
    if (v == null) return 'rgba(255,255,255,0.5)';
    if (v < 0.15) return '#10b981';
    if (v < 0.25) return '#f59e0b';
    return '#ef4444';
}

function ratioColor(v) {
    if (v == null) return 'rgba(255,255,255,0.5)';
    if (v > 1) return '#10b981';
    if (v > 0) return '#f59e0b';
    return '#ef4444';
}

function sharpeLabel(v) {
    if (v == null) return '';
    if (v > 1.5) return 'Excellent';
    if (v > 1) return 'Good';
    if (v > 0) return 'Fair';
    return 'Poor';
}

function calendarColor(ret) {
    if (ret == null) return 'rgba(255,255,255,0.02)';
    var i = Math.min(Math.abs(ret) * 8, 1);
    if (ret > 0) return 'rgba(16,185,129,' + (0.1 + i * 0.5) + ')';
    return 'rgba(239,68,68,' + (0.1 + i * 0.5) + ')';
}

// Tile is kept as a thin alias to HeroCard so callers don't change.
function Tile(p) {
    return h(HeroCard, { label: p.label, value: p.value, color: p.color, accent: p.accent || 'cyan', badge: p.badge, sub: p.sub, icon: p.icon });
}

// =============================================================
// Export 1: OverviewPanel
// =============================================================

export function OverviewPanel(p) {
    var m = useMemo(function() { return computePortfolioMetrics(p.navSeries); }, [p.navSeries]);
    var ddSeries = useMemo(function() { return computeDrawdownSeries(p.navSeries); }, [p.navSeries]);

    if (!m) {
        return h('div', { className: 'card', style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 } },
            'Insufficient data for performance overview.'
        );
    }

    // Canonical overrides from cmdData
    var cmd = p.cmdData || {};
    var sharpe = cmd.sharpe_ratio != null ? cmd.sharpe_ratio : m.sharpe;
    var sortino = cmd.sortino_ratio != null ? cmd.sortino_ratio : m.sortino;
    var maxDD = cmd.drawdown_pct != null ? cmd.drawdown_pct : m.maxDD;

    // A. Hero Metrics
    var heroGrid = h('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 } },
        h(Tile, {
            icon: m.totalReturn >= 0 ? '▲' : '▽',
            label: 'Total Return', value: fmtPct(m.totalReturn),
            color: retColor(m.totalReturn), accent: m.totalReturn >= 0 ? 'green' : 'red',
            badge: returnStatus(m.totalReturn)
        }),
        h(Tile, {
            icon: '◆',
            label: 'Ann. Return', value: fmtPct(m.annReturn),
            color: retColor(m.annReturn), accent: m.annReturn >= 0 ? 'green' : 'red',
            badge: returnStatus(m.annReturn)
        }),
        h(Tile, {
            icon: '≋',
            label: 'Ann. Volatility', value: fmtPct(m.annVol),
            color: volColor(m.annVol), accent: 'amber',
            badge: volStatus(m.annVol)
        }),
        h(Tile, {
            icon: '✦',
            label: 'Sharpe Ratio', value: fmt(sharpe, 2),
            color: ratioColor(sharpe), accent: 'cyan',
            badge: sharpeStatus(sharpe)
        }),
        h(Tile, {
            icon: '◈',
            label: 'Sortino Ratio', value: fmt(sortino, 2),
            color: ratioColor(sortino), accent: 'violet',
            badge: sharpeStatus(sortino)
        }),
        h(Tile, {
            icon: '▽',
            label: 'Max Drawdown', value: fmtPct(maxDD),
            color: '#ef4444', accent: 'red',
            badge: ddStatus(maxDD)
        }),
        h(Tile, {
            icon: '≡',
            label: 'Calmar Ratio', value: fmt(m.calmar, 2),
            color: m.calmar != null && m.calmar > 1 ? '#10b981' : 'rgba(255,255,255,0.85)',
            accent: 'indigo', badge: calmarStatus(m.calmar)
        }),
        h(Tile, {
            icon: '◉',
            label: 'Win Rate', value: fmtPct(m.winRate),
            color: m.winRate > 0.55 ? '#10b981' : 'rgba(255,255,255,0.85)',
            accent: m.winRate > 0.55 ? 'green' : 'amber',
            badge: m.winRate > 0.6 ? 'Strong' : m.winRate > 0.5 ? 'Positive' : 'Fair'
        })
    );

    // B. Narrative insight strip
    var cmd = p.cmdData || {};
    var sharpe = cmd.sharpe_ratio != null ? cmd.sharpe_ratio : m.sharpe;
    var maxDD  = cmd.drawdown_pct  != null ? cmd.drawdown_pct  : m.maxDD;
    var insights = [];
    if (m.totalReturn > 0.15) {
        insights.push({ icon: '▲', text: 'Strong performance since inception — up ' + (m.totalReturn * 100).toFixed(2) + '%, annualising at ' + (m.annReturn * 100).toFixed(1) + '% p.a.' });
    } else if (m.totalReturn >= 0) {
        insights.push({ icon: '◆', text: 'Positive since inception — up ' + (m.totalReturn * 100).toFixed(2) + '% total, annualised return ' + (m.annReturn * 100).toFixed(1) + '% p.a.' });
    } else {
        insights.push({ icon: '▽', text: 'Below inception level — down ' + Math.abs(m.totalReturn * 100).toFixed(2) + '%. Review positioning.' });
    }
    if (sharpe != null) {
        if (sharpe > 2) insights.push({ icon: '✦', text: 'Exceptional risk-adjusted returns — Sharpe ' + sharpe.toFixed(2) + ', Sortino ' + (m.sortino || 0).toFixed(2) + '. Win rate ' + (m.winRate * 100).toFixed(0) + '% of trading days.' });
        else if (sharpe > 1) insights.push({ icon: '≋', text: 'Good risk-adjusted profile — Sharpe ' + sharpe.toFixed(2) + ', vol ' + (m.annVol * 100).toFixed(1) + '% annualised. Best day: ' + (m.bestDay.value * 100).toFixed(2) + '% on ' + m.bestDay.date + '.' });
        else insights.push({ icon: '⚡', text: 'Below-target Sharpe of ' + sharpe.toFixed(2) + ' — vol at ' + (m.annVol * 100).toFixed(1) + '% annualised. Consider risk reduction.' });
    }
    if (Math.abs(m.currentDD) > 0.03) {
        insights.push({ icon: '▽', text: 'Currently in a ' + (m.currentDD * 100).toFixed(2) + '% drawdown from peak. Max historical: ' + (maxDD * 100).toFixed(2) + '%.' });
    } else {
        insights.push({ icon: '◉', text: 'Near all-time highs — drawdown only ' + (m.currentDD * 100).toFixed(2) + '%. Max historical drawdown: ' + (maxDD * 100).toFixed(2) + '%.' });
    }
    var narrativeStrip = h('div', { className: 'narrative-strip', style: { marginBottom: 16 } },
        insights.map(function(ins, i) {
            return h('div', { key: i, className: 'narrative-line' },
                h('span', { className: 'narrative-icon' }, ins.icon),
                h('span', { className: 'narrative-text' }, ins.text)
            );
        })
    );

    // B2. Equity Curve — lightweight-charts with optional position-entry markers
    var _se = useState(true);
    var showEntries = _se[0], setShowEntries = _se[1];
    var _ef = useState('notable');
    var entryFilter = _ef[0], setEntryFilter = _ef[1];

    // Build entry markers from raw transactions, aligned to the equity curve
    var entryMarkers = useMemo(function() {
        return buildEntryMarkers(p.navSeries, p.txData, p.positions, entryFilter);
    }, [p.navSeries, p.txData, p.positions, entryFilter]);

    var eqRef = useRef(null);
    var eqChartRef = useRef(null);
    var eqSeriesRef = useRef(null);
    var markersRef = useRef(null);

    useEffect(function() {
        if (!p.navSeries || !p.navSeries.length || !eqRef.current) return;
        if (eqChartRef.current) { eqChartRef.current.remove(); eqChartRef.current = null; }
        var series = p.navSeries;
        var first = series[0].nav;
        var lastRet = (series[series.length - 1].nav / first - 1) * 100;
        var lineColor = lastRet >= 0 ? '#10b981' : '#ef4444';
        var topFill   = lastRet >= 0 ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)';
        var chart = LightweightCharts.createChart(eqRef.current, {
            width: eqRef.current.clientWidth || 700, height: 300,
            layout: { background: { type: 'solid', color: 'transparent' }, textColor: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono', fontSize: 10 },
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
            rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
            timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
            crosshair: { vertLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 3 }, horzLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 3 } },
            handleScroll: false, handleScale: false,
        });
        eqChartRef.current = chart;
        var areaSeries = chart.addSeries(LightweightCharts.AreaSeries, {
            lineColor: lineColor, topColor: topFill, bottomColor: 'rgba(0,0,0,0)',
            lineWidth: 2, crosshairMarkerVisible: true,
            priceFormat: { type: 'custom', formatter: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; } },
        });
        areaSeries.setData(series.map(function(d) {
            return { time: d.price_date, value: +((d.nav / first - 1) * 100).toFixed(3) };
        }));
        eqSeriesRef.current = areaSeries;
        chart.timeScale().fitContent();
        return function() {
            markersRef.current = null;
            eqSeriesRef.current = null;
            if (eqChartRef.current) { eqChartRef.current.remove(); eqChartRef.current = null; }
        };
    }, [p.navSeries]);

    // Attach / refresh entry markers as toggle and filter change
    useEffect(function() {
        if (!eqSeriesRef.current || !LightweightCharts.createSeriesMarkers) return;
        var markers = showEntries ? entryMarkers.markers : [];
        if (markersRef.current) {
            markersRef.current.setMarkers(markers);
        } else {
            markersRef.current = LightweightCharts.createSeriesMarkers(eqSeriesRef.current, markers);
        }
    }, [showEntries, entryMarkers]);

    var headerControls = h('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
        h('label', {
            style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                      fontSize: 10, fontFamily: 'JetBrains Mono', letterSpacing: 0.5,
                      color: showEntries ? 'rgba(0,212,255,0.85)' : 'rgba(255,255,255,0.35)' }
        },
            h('input', { type: 'checkbox', checked: showEntries,
                onChange: function(e) { setShowEntries(e.target.checked); },
                style: { cursor: 'pointer', accentColor: '#00d4ff' } }),
            'SHOW ENTRIES'
        ),
        showEntries && h('select', {
            value: entryFilter, onChange: function(e) { setEntryFilter(e.target.value); },
            style: { background: 'rgba(0,0,0,0.4)', color: 'rgba(255,255,255,0.75)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
                      padding: '3px 8px', fontSize: 10, fontFamily: 'JetBrains Mono', cursor: 'pointer' }
        },
            h('option', { value: 'notable' },      'Notable trades (≥0.5% NAV)'),
            h('option', { value: 'first-entry' },  'First entries only'),
            h('option', { value: 'all' },          'All trades')
        ),
        showEntries && h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono' } },
            entryMarkers.markers.length + ' shown · ' + entryMarkers.totalTrades + ' total'
        )
    );

    var equityCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 16, flexWrap: 'wrap' } },
            h('div', { className: 'card-title', style: { margin: 0 } }, 'PORTFOLIO EQUITY CURVE'),
            headerControls
        ),
        h('div', { ref: eqRef, style: { height: 300 } }),
        showEntries && entryMarkers.summary && h(EntryDecisionStrip, { summary: entryMarkers.summary })
    );

    // C. Underwater Chart
    var ddRef = useRef(null);
    useChart(ddRef, function() {
        if (!ddSeries.length) return null;
        return {
            type: 'line',
            data: {
                labels: ddSeries.map(function(d) { return d.date; }),
                datasets: [{
                    data: ddSeries.map(function(d) { return d.dd; }),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239,68,68,0.25)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 12, maxRotation: 0 },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            callback: function(v) { return (v * 100).toFixed(1) + '%'; }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        };
    }, [ddSeries]);

    var underwaterCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Drawdown (Underwater)'),
        h('div', { style: { height: 180 } }, h('canvas', { ref: ddRef }))
    );

    // D. Best / Worst Day Card
    var bestWorst = h('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
        h(HeroCard, { icon: '▲', label: 'Best Day', value: fmtPct(m.bestDay.value), color: '#10b981', accent: 'green', sub: m.bestDay.date }),
        h(HeroCard, { icon: '▽', label: 'Worst Day', value: fmtPct(m.worstDay.value), color: '#ef4444', accent: 'red', sub: m.worstDay.date })
    );

    return h('div', null, heroGrid, narrativeStrip, equityCard, underwaterCard, bestWorst);
}

// =============================================================
// Export 2: ReturnsPanel
// =============================================================

export function ReturnsPanel(p) {
    var periods  = useMemo(function() { return computePeriodReturns(p.navSeries); }, [p.navSeries]);
    var contribs = useMemo(function() { return computePositionContributions(p.perfData || []); }, [p.perfData]);
    var cumReturns = useMemo(function() { return computeCumulativeReturns(p.navSeries); }, [p.navSeries]);
    var bins = useMemo(function() { return computeReturnsBins(p.navSeries, 40); }, [p.navSeries]);
    var monthly = useMemo(function() { return computeMonthlyReturns(p.navSeries); }, [p.navSeries]);

    if (!p.navSeries || p.navSeries.length < 2) {
        return h('div', { className: 'card', style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 32 } },
            'Insufficient data for returns analysis.'
        );
    }

    // A. Period Returns — visual bar grid
    var periodRows = [
        { label: '1 Day',      value: periods.ret1d },
        { label: '1 Week',     value: periods.ret1w },
        { label: '1 Month',    value: periods.ret1m },
        { label: '3 Month',    value: periods.ret3m },
        { label: '6 Month',    value: periods.ret6m },
        { label: '1 Year',     value: periods.ret1y },
        { label: 'MTD',        value: periods.mtd },
        { label: 'YTD',        value: periods.ytd },
        { label: 'Inception',  value: periods.inception },
    ];
    var maxAbsPct = Math.max.apply(null, periodRows.map(function(r) { return r.value != null ? Math.abs(r.value * 100) : 0; }).concat([0.01]));

    var periodTable = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
            h('div', { className: 'card-title', style: { margin: 0 } }, 'PERIOD RETURNS'),
            h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'Figtree' } }, 'Bar scaled to max absolute return')
        ),
        periodRows.map(function(r, i) {
            var val = r.value, pctNum = val != null ? val * 100 : null;
            var chipColor = val == null ? 'rgba(255,255,255,0.22)' : val >= 0 ? '#10b981' : '#ef4444';
            var barPct = pctNum != null ? Math.min(Math.abs(pctNum) / maxAbsPct, 1) * 100 : 0;
            var barColor = val != null && val >= 0 ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)';
            var text = pctNum != null ? (pctNum >= 0 ? '+' : '') + pctNum.toFixed(2) + '%' : '—';
            return h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < periodRows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' } },
                h('span', { style: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontFamily: 'Figtree', minWidth: 90 } }, r.label),
                h('div', { style: { flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' } },
                    h('div', { style: { width: barPct + '%', height: '100%', background: barColor, borderRadius: 2 } })
                ),
                h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: chipColor, minWidth: 72, textAlign: 'right' } }, text)
            );
        })
    );


    // B. Cumulative Returns Chart
    var cumRef = useRef(null);
    useChart(cumRef, function() {
        if (!cumReturns.length) return null;
        return {
            type: 'line',
            data: {
                labels: cumReturns.map(function(d) { return d.date; }),
                datasets: [{
                    data: cumReturns.map(function(d) { return d.value; }),
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0,212,255,0.08)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 12, maxRotation: 0 },
                        grid: { display: false }
                    },
                    y: {
                        ticks: {
                            color: 'rgba(255,255,255,0.6)',
                            callback: function(v) { return (v * 100).toFixed(0) + '%'; }
                        },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        };
    }, [cumReturns]);

    var cumCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Cumulative Returns'),
        h('div', { style: { height: 240 } }, h('canvas', { ref: cumRef }))
    );

    // C. Returns Distribution Histogram
    var histRef = useRef(null);
    useChart(histRef, function() {
        if (!bins.length) return null;
        return {
            type: 'bar',
            data: {
                labels: bins.map(function(b) { return b.mid.toFixed(2) + '%'; }),
                datasets: [{
                    data: bins.map(function(b) { return b.count; }),
                    backgroundColor: bins.map(function(b) { return b.mid >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'; }),
                    borderColor: bins.map(function(b) { return b.mid >= 0 ? '#10b981' : '#ef4444'; }),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 8, maxRotation: 0 },
                        grid: { display: false }
                    },
                    y: {
                        ticks: { color: 'rgba(255,255,255,0.6)' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        };
    }, [bins]);

    var histCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Daily Returns Distribution'),
        h('div', { style: { height: 220 } }, h('canvas', { ref: histRef }))
    );

    // D. Monthly Returns Heatmap Calendar
    var years = {};
    monthly.forEach(function(m) {
        if (!years[m.year]) years[m.year] = {};
        years[m.year][m.month] = m.ret;
    });
    var yearKeys = Object.keys(years).sort();
    var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    var cellBase = {
        width: 50, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 3, fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
        color: 'rgba(255,255,255,0.85)', cursor: 'default'
    };
    var headerCell = {
        width: 50, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase'
    };
    var yearLabel = {
        width: 40, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        paddingRight: 8, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600,
        fontFamily: 'JetBrains Mono, monospace'
    };

    var heatmapContent;
    if (!monthly.length) {
        heatmapContent = h('div', { style: { color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24, fontSize: 13 } },
            'Insufficient data for monthly calendar.'
        );
    } else {
        // Header row
        var headerRow = h('div', { style: { display: 'flex', gap: 2, marginLeft: 48 } },
            MONTHS.map(function(m, i) { return h('div', { key: 'h' + i, style: headerCell }, m); })
        );
        // Year rows
        var rows = yearKeys.map(function(yr) {
            var cells = [];
            for (var mi = 0; mi < 12; mi++) {
                var ret = years[yr][mi + 1];
                var text = ret != null ? (ret * 100).toFixed(1) + '%' : '';
                cells.push(h('div', {
                    key: mi,
                    style: Object.assign({}, cellBase, { background: calendarColor(ret) })
                }, text));
            }
            return h('div', { key: yr, style: { display: 'flex', gap: 2 } },
                h('div', { style: yearLabel }, yr),
                cells
            );
        });
        heatmapContent = h('div', null, headerRow, h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } }, rows));
    }

    var heatmapCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Monthly Returns Calendar'),
        heatmapContent
    );

    // A0. Position return contribution dashboard
    var topContrib = contribs.slice(0, 8);
    var botContrib = contribs.slice(-5).reverse();
    var maxAbsContrib = Math.max.apply(null, contribs.map(function(c) { return Math.abs(c.contribution); }).concat([0.001]));
    var totalPortRet  = contribs.reduce(function(s, c) { return s + c.contribution; }, 0);

    function contribRow(c, i) {
        var barW  = Math.min(Math.abs(c.contribution) / maxAbsContrib, 1) * 100;
        var col   = c.contribution >= 0 ? '#10b981' : '#ef4444';
        var barcol= c.contribution >= 0 ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)';
        var retTxt= (c.ret >= 0 ? '+' : '') + (c.ret * 100).toFixed(1) + '%';
        var cTxt  = (c.contribution >= 0 ? '+' : '') + (c.contribution * 100).toFixed(2) + '%';
        return h('div', { key: c.symbol + i, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: '#00d4ff', minWidth: 52 } }, c.symbol),
            h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'Figtree', minWidth: 30, textAlign: 'right' } }, (c.weight * 100).toFixed(1) + '%'),
            h('div', { style: { flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' } },
                h('div', { style: { width: barW + '%', height: '100%', background: barcol, borderRadius: 2 } })
            ),
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(255,255,255,0.5)', minWidth: 52, textAlign: 'right' } }, retTxt),
            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: col, minWidth: 64, textAlign: 'right' } }, cTxt)
        );
    }

    var contribCard = contribs.length ? h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
            h('div', { className: 'card-title', style: { margin: 0 } }, 'RETURN ATTRIBUTION BY POSITION'),
            h('div', { style: { display: 'flex', gap: 20, alignItems: 'center' } },
                h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'Figtree' } }, 'Wt%  ·  Bar = contribution magnitude'),
                h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: totalPortRet >= 0 ? '#10b981' : '#ef4444' } },
                    'Total: ' + (totalPortRet >= 0 ? '+' : '') + (totalPortRet * 100).toFixed(2) + '%')
            )
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px' } },
            h('div', null,
                h('div', { style: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'Figtree' } }, '▲ Top Contributors'),
                topContrib.map(contribRow)
            ),
            h('div', null,
                h('div', { style: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'Figtree' } }, '▼ Top Detractors'),
                botContrib.map(function(c, i) { return contribRow(c, i + 100); })
            )
        )
    ) : null;

    return h('div', null, contribCard, periodTable, cumCard, histCard, heatmapCard);
}
