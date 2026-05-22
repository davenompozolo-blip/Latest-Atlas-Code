import React from 'react';
import { Chart, registerables } from 'chart.js';
import { sb } from './config.js';
import { Loading } from './components.js';

Chart.register(...registerables);

var useState  = React.useState;
var useEffect = React.useEffect;
var useRef    = React.useRef;
var useMemo   = React.useMemo;
var h         = React.createElement;

// ── Design tokens ──────────────────────────────────────────────────────────────
var T = {
    bg:      'rgba(255,255,255,0.025)',
    border:  'rgba(255,255,255,0.07)',
    teal:    '#00d4b8',
    gold:    '#f4b942',
    green:   '#22c55e',
    red:     '#ef4444',
    blue:    '#3b82f6',
    purple:  '#a855f7',
    amber:   '#f59e0b',
    slate:   '#64748b',
    t1:      'rgba(255,255,255,0.88)',
    t2:      'rgba(255,255,255,0.45)',
    t3:      'rgba(255,255,255,0.22)',
    mono:    "'JetBrains Mono', ui-monospace, monospace",
    sectors: {
        'Technology':             '#3b82f6',
        'Materials':              '#f59e0b',
        'Consumer Discretionary': '#a855f7',
        'International':          '#00d4b8',
        'Energy':                 '#22c55e',
        'Financials':             '#64748b',
        'Healthcare':             '#ec4899',
        'Industrials':            '#6366f1',
        'Other':                  '#475569',
    },
};

var REGIME_WINDOWS = [
    { name: 'Goldilocks',   start: '2026-01-02', end: '2026-02-04', color: '#10b981' },
    { name: 'Tariff Shock', start: '2026-02-05', end: '2026-03-08', color: '#ef4444' },
    { name: 'Reflation',    start: '2026-03-09', end: '2026-05-21', color: '#f59e0b' },
];

// ── Shared styles ──────────────────────────────────────────────────────────────
var card = { background: T.bg, border: '1px solid ' + T.border, borderRadius: 10, padding: '18px 20px', marginBottom: 16 };
var cardTitle = { fontSize: 10, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: T.t2, fontFamily: T.mono, marginBottom: 14 };
var th = { padding: '6px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, fontFamily: T.mono, borderBottom: '1px solid ' + T.border, textAlign: 'left', whiteSpace: 'nowrap' };
var td = { padding: '7px 10px', fontSize: 11, fontFamily: T.mono, borderBottom: '1px solid rgba(255,255,255,0.04)', color: T.t1 };

function sectorColor(sec) { return T.sectors[sec] || T.slate; }

function isOption(sym) {
    if (!sym) return false;
    return /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(sym) || (sym.length > 10 && /\d{6}/.test(sym));
}

// ── Math utilities ─────────────────────────────────────────────────────────────
function mean(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
}

function std(arr) {
    if (arr.length < 2) return 0;
    var m = mean(arr), s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(s / (arr.length - 1));
}

function pearsonCorr(a, b) {
    var n = Math.min(a.length, b.length);
    if (n < 5) return 0;
    var ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
    var num = 0, da = 0, db = 0;
    for (var i = 0; i < n; i++) {
        var ai = a[i] - ma, bi = b[i] - mb;
        num += ai * bi; da += ai * ai; db += bi * bi;
    }
    var denom = Math.sqrt(da * db);
    return denom > 0 ? num / denom : 0;
}

function histVaR(returns, nav, confidence) {
    if (!returns.length) return 0;
    var sorted = returns.slice().sort(function(a, b) { return a - b; });
    var idx = Math.max(0, Math.floor(sorted.length * (1 - confidence)) - 1);
    return -sorted[idx] * nav;
}

function histCVaR(returns, nav, confidence) {
    if (!returns.length) return 0;
    var sorted = returns.slice().sort(function(a, b) { return a - b; });
    var cutoff = Math.max(1, Math.floor(sorted.length * (1 - confidence)));
    var tail = sorted.slice(0, cutoff);
    return -mean(tail) * nav;
}

function rollingWindow(arr, window, fn) {
    var out = new Array(arr.length).fill(null);
    for (var i = window - 1; i < arr.length; i++) {
        out[i] = fn(arr.slice(i - window + 1, i + 1));
    }
    return out;
}

// ── Data loading ───────────────────────────────────────────────────────────────
function loadRiskData(onDone, onErr) {
    if (!sb) { onErr('No Supabase connection'); return; }

    Promise.all([
        sb.from('vw_portfolio_nav_daily').select('price_date,nav,daily_return').order('price_date'),
        sb.from('vw_risk_analysis').select('*'),
        sb.from('vw_performance_suite').select('symbol,sector,total_return_pct,annualised_return'),
    ]).then(function(results) {
        var navData  = (results[0].data || []);
        var riskView = (results[1].data || []);
        var perfView = (results[2].data || []);

        // equity symbols for price batch fetch
        var equitySyms = riskView
            .filter(function(r) { return r.weight > 0 && !isOption(r.symbol); })
            .sort(function(a, b) { return b.market_value - a.market_value; })
            .map(function(r) { return r.symbol; });

        // batch fetch vw_position_nav_daily in chunks of 20
        var CHUNK = 20;
        var chunks = [];
        for (var i = 0; i < equitySyms.length; i += CHUNK) {
            chunks.push(equitySyms.slice(i, i + CHUNK));
        }

        Promise.all(chunks.map(function(chunk) {
            return sb.from('vw_position_nav_daily')
                .select('symbol,price_date,close_price')
                .in('symbol', chunk)
                .order('price_date')
                .limit(chunk.length * 120);
        })).then(function(chunkResults) {
            var bySymbol = {};
            chunkResults.forEach(function(res) {
                (res.data || []).forEach(function(row) {
                    if (!bySymbol[row.symbol]) bySymbol[row.symbol] = [];
                    bySymbol[row.symbol].push({ date: row.price_date, close: parseFloat(row.close_price) });
                });
            });

            // Build per-symbol daily return series (aligned to shared dates)
            var allDates = {};
            navData.forEach(function(r) { allDates[r.price_date] = true; });
            var dates = Object.keys(allDates).sort();

            var returnsBySymbol = {};
            equitySyms.forEach(function(sym) {
                var hist = bySymbol[sym] || [];
                var priceMap = {};
                hist.forEach(function(d) { priceMap[d.date] = d.close; });
                var rets = [];
                for (var i = 1; i < dates.length; i++) {
                    var p0 = priceMap[dates[i - 1]], p1 = priceMap[dates[i]];
                    rets.push(p0 && p1 && p0 > 0 ? (p1 - p0) / p0 : 0);
                }
                returnsBySymbol[sym] = rets;
            });

            // Portfolio daily returns from vw_portfolio_nav_daily
            var portfolioReturns = navData
                .map(function(r) { return r.daily_return != null ? Number(r.daily_return) : 0; })
                .filter(function(r) { return isFinite(r) && Math.abs(r) < 0.5; });

            var portfolioDates = navData.map(function(r) { return r.price_date; });
            var nav = navData.length ? Number(navData[navData.length - 1].nav) : 101152;

            onDone({
                navData:          navData,
                nav:              nav,
                portfolioReturns: portfolioReturns,
                portfolioDates:   portfolioDates,
                riskView:         riskView,
                perfView:         perfView,
                returnsBySymbol:  returnsBySymbol,
                equitySyms:       equitySyms,
                dates:            dates,
            });
        }).catch(onErr);
    }).catch(onErr);
}

// ── Shared KPI pill ────────────────────────────────────────────────────────────
function KpiPill(props) {
    return h('div', {
        style: {
            background: T.bg, border: '1px solid ' + T.border, borderRadius: 8,
            padding: '12px 18px', minWidth: 120, flex: 1,
        }
    },
        h('div', { style: { fontSize: 9, color: T.t3, fontFamily: T.mono, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 } }, props.label),
        h('div', { style: { fontSize: 20, fontWeight: 700, fontFamily: T.mono, color: props.color || T.t1 } }, props.value),
        props.sub && h('div', { style: { fontSize: 9, color: T.t2, fontFamily: T.mono, marginTop: 4 } }, props.sub)
    );
}

// ── Shared ChartCanvas wrapper ─────────────────────────────────────────────────
function ChartCanvas(props) {
    return h('div', { style: { height: props.height || 240, width: '100%', position: 'relative' } },
        h('canvas', { ref: props.canvasRef })
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1 — COMMAND CENTER
// ═══════════════════════════════════════════════════════════════════════════════
export function CommandCenterTab(props) {
    var d = props.data;
    if (!d) return h(Loading, { text: 'Computing portfolio risk…' });

    var portfolioReturns = d.portfolioReturns;
    var portfolioDates   = d.portfolioDates;
    var nav              = d.nav;
    var riskView         = d.riskView;

    // ── KPIs ─────────────────────────────────────────────────────────────────
    var kpis = useMemo(function() {
        if (!portfolioReturns.length) return null;
        var var95  = histVaR(portfolioReturns, nav, 0.95);
        var cvar95 = histCVaR(portfolioReturns, nav, 0.95);
        var annVol = std(portfolioReturns) * Math.sqrt(252);
        var sumIndivVaR = riskView.reduce(function(s, r) { return s + (Number(r.dollar_var_95_daily) || 0); }, 0);
        var benefit = sumIndivVaR - var95;

        // Vol regime: 30D vs 90D
        var recent = portfolioReturns.slice(-30);
        var baseline = portfolioReturns.slice(-90);
        var vol30  = std(recent)   * Math.sqrt(252);
        var vol90  = std(baseline) * Math.sqrt(252);
        var regime = vol30 > vol90 * 1.2 ? 'ELEVATED' : vol30 < vol90 * 0.8 ? 'COMPRESSED' : 'NORMAL';
        var regimeColor = regime === 'ELEVATED' ? T.red : regime === 'COMPRESSED' ? T.green : T.amber;

        return { var95, cvar95, annVol, sumIndivVaR, benefit, regime, regimeColor, vol30, vol90 };
    }, [portfolioReturns, nav, riskView]);

    // ── Drawdown series ───────────────────────────────────────────────────────
    var drawdownSeries = useMemo(function() {
        if (!portfolioReturns.length) return { dates: [], values: [], maxDD: 0, maxDDDate: '' };
        var cum = 1;
        var hwm = 1;
        var vals = [];
        var maxDD = 0, maxDDIdx = 0;
        for (var i = 0; i < portfolioReturns.length; i++) {
            cum *= (1 + portfolioReturns[i]);
            if (cum > hwm) hwm = cum;
            var dd = (cum - hwm) / hwm;
            vals.push(dd);
            if (dd < maxDD) { maxDD = dd; maxDDIdx = i; }
        }
        var ddDates = portfolioDates.slice(portfolioDates.length - portfolioReturns.length);
        return { dates: ddDates, values: vals, maxDD: maxDD, maxDDDate: ddDates[maxDDIdx] || '' };
    }, [portfolioReturns, portfolioDates]);

    // ── Rolling Sharpe ────────────────────────────────────────────────────────
    var rollingSharpe = useMemo(function() {
        if (portfolioReturns.length < 30) return { dates: [], s30: [], s90: [] };
        var rf = 0.05 / 252;
        var s30 = rollingWindow(portfolioReturns, 30, function(w) {
            var v = std(w) * Math.sqrt(252);
            return v > 0 ? (mean(w) * 252 - 0.05) / v : null;
        });
        var s90 = rollingWindow(portfolioReturns, 90, function(w) {
            var v = std(w) * Math.sqrt(252);
            return v > 0 ? (mean(w) * 252 - 0.05) / v : null;
        });
        var ddDates = portfolioDates.slice(portfolioDates.length - portfolioReturns.length);
        return { dates: ddDates, s30: s30, s90: s90 };
    }, [portfolioReturns, portfolioDates]);

    // ── Chart refs ────────────────────────────────────────────────────────────
    var ddCanvasRef    = useRef(null);
    var ddChartRef     = useRef(null);
    var sharpCanvasRef = useRef(null);
    var sharpChartRef  = useRef(null);
    var scatCanvasRef  = useRef(null);
    var scatChartRef   = useRef(null);

    // Drawdown chart
    useEffect(function() {
        if (!ddCanvasRef.current || !drawdownSeries.dates.length) return;
        if (ddChartRef.current) { ddChartRef.current.destroy(); ddChartRef.current = null; }
        ddChartRef.current = new Chart(ddCanvasRef.current, {
            type: 'line',
            data: {
                labels: drawdownSeries.dates,
                datasets: [{
                    data:            drawdownSeries.values,
                    fill:            true,
                    backgroundColor: 'rgba(239,68,68,0.18)',
                    borderColor:     T.red,
                    borderWidth:     1.5,
                    tension:         0.2,
                    pointRadius:     0,
                    pointHoverRadius: 4,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        titleFont: { family: T.mono, size: 10 }, bodyFont: { family: T.mono, size: 11 },
                        callbacks: { label: function(ctx) { return ' Drawdown: ' + (ctx.parsed.y * 100).toFixed(2) + '%'; } },
                    },
                    annotation: {},
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, maxTicksLimit: 8 }, border: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, callback: function(v) { return (v * 100).toFixed(1) + '%'; } }, border: { display: false } },
                },
            },
        });
        return function() { if (ddChartRef.current) { ddChartRef.current.destroy(); ddChartRef.current = null; } };
    }, [drawdownSeries]);

    // Rolling Sharpe chart
    useEffect(function() {
        if (!sharpCanvasRef.current || !rollingSharpe.dates.length) return;
        if (sharpChartRef.current) { sharpChartRef.current.destroy(); sharpChartRef.current = null; }
        sharpChartRef.current = new Chart(sharpCanvasRef.current, {
            type: 'line',
            data: {
                labels: rollingSharpe.dates,
                datasets: [
                    { label: '30D Sharpe', data: rollingSharpe.s30, borderColor: T.teal, borderWidth: 1.5, borderDash: [], tension: 0.3, pointRadius: 0, fill: false, spanGaps: true },
                    { label: '90D Sharpe', data: rollingSharpe.s90, borderColor: T.gold, borderWidth: 1.5, borderDash: [4, 3], tension: 0.3, pointRadius: 0, fill: false, spanGaps: true },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        titleFont: { family: T.mono, size: 10 }, bodyFont: { family: T.mono, size: 11 },
                        callbacks: { label: function(ctx) { return ' ' + ctx.dataset.label + ': ' + (ctx.parsed.y != null ? ctx.parsed.y.toFixed(2) : '—'); } },
                    },
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, maxTicksLimit: 8 }, border: { display: false } },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: T.t3, font: { family: T.mono, size: 9 }, callback: function(v) { return v.toFixed(1); } },
                        border: { display: false },
                    },
                },
            },
        });
        return function() { if (sharpChartRef.current) { sharpChartRef.current.destroy(); sharpChartRef.current = null; } };
    }, [rollingSharpe]);

    // Risk/Return scatter
    useEffect(function() {
        if (!scatCanvasRef.current || !d.perfView || !d.riskView) return;
        if (scatChartRef.current) { scatChartRef.current.destroy(); scatChartRef.current = null; }

        var perfMap = {};
        d.perfView.forEach(function(p) { perfMap[p.symbol] = p; });

        var maxMv = 0;
        d.riskView.forEach(function(r) { if (r.market_value > maxMv) maxMv = r.market_value; });

        var equities = d.riskView.filter(function(r) { return !isOption(r.symbol) && r.annual_vol > 0; });
        var points = equities.map(function(r) {
            var perf = perfMap[r.symbol];
            return {
                x:      Number(r.annual_vol) * 100,
                y:      perf ? Number(perf.total_return_pct) * 100 : 0,
                label:  r.symbol,
                sector: r.sector || 'Other',
                mv:     Number(r.market_value) || 0,
            };
        });

        var datasets = Object.keys(T.sectors).map(function(sec) {
            var pts = points.filter(function(p) { return p.sector === sec; });
            if (!pts.length) return null;
            return {
                label:           sec,
                data:            pts.map(function(p) { return { x: p.x, y: p.y, label: p.label, mv: p.mv }; }),
                backgroundColor: sectorColor(sec) + 'cc',
                borderColor:     sectorColor(sec),
                borderWidth:     1,
                pointRadius:     pts.map(function(p) { return Math.max(4, Math.sqrt(p.mv / maxMv) * 22); }),
                pointHoverRadius: pts.map(function(p) { return Math.max(6, Math.sqrt(p.mv / maxMv) * 26); }),
            };
        }).filter(Boolean);

        scatChartRef.current = new Chart(scatCanvasRef.current, {
            type: 'scatter',
            data: { datasets: datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        titleFont: { family: T.mono, size: 10 }, bodyFont: { family: T.mono, size: 11 },
                        callbacks: {
                            title: function(items) { return items[0] ? items[0].raw.label : ''; },
                            label: function(ctx) { return ' Vol: ' + ctx.parsed.x.toFixed(1) + '% · Ret: ' + (ctx.parsed.y >= 0 ? '+' : '') + ctx.parsed.y.toFixed(1) + '%'; },
                        },
                    },
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Annualised Volatility (%)', color: T.t2, font: { family: T.mono, size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 } }, border: { display: false },
                    },
                    y: {
                        title: { display: true, text: 'Total Return (%)', color: T.t2, font: { family: T.mono, size: 10 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, callback: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(0) + '%'; } }, border: { display: false },
                    },
                },
            },
        });
        return function() { if (scatChartRef.current) { scatChartRef.current.destroy(); scatChartRef.current = null; } };
    }, [d]);

    if (!kpis) return h('div', { style: card }, 'Insufficient return history (need 30+ days).');

    var fmtDollar = function(v) {
        if (!isFinite(v)) return '—';
        var abs = Math.abs(v);
        var s = abs >= 1000 ? '$' + (abs / 1000).toFixed(1) + 'k' : '$' + abs.toFixed(0);
        return v < 0 ? '-' + s : s;
    };

    // Legend for scatter
    var scatLegend = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8 } },
        Object.keys(T.sectors).map(function(sec) {
            return h('div', { key: sec, style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: T.t2, fontFamily: T.mono } },
                h('span', { style: { width: 8, height: 8, background: sectorColor(sec), borderRadius: 8, display: 'inline-block', flexShrink: 0 } }),
                sec
            );
        })
    );

    return h('div', null,
        // KPI strip
        h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 } },
            h(KpiPill, { label: 'Portfolio VaR 95% 1D', value: fmtDollar(kpis.var95), color: T.red, sub: (kpis.var95 / nav * 100).toFixed(2) + '% of NAV' }),
            h(KpiPill, { label: 'CVaR 95% 1D',          value: fmtDollar(kpis.cvar95), color: T.red }),
            h(KpiPill, { label: 'Ann. Volatility',       value: (kpis.annVol * 100).toFixed(1) + '%', color: T.amber }),
            h(KpiPill, { label: 'Diversification Benefit', value: fmtDollar(kpis.benefit), color: T.green, sub: 'vs sum of individual VaRs' }),
            h(KpiPill, { label: 'Vol Regime', value: kpis.regime, color: kpis.regimeColor, sub: '30D ' + (kpis.vol30 * 100).toFixed(1) + '% vs 90D ' + (kpis.vol90 * 100).toFixed(1) + '%' })
        ),

        // Underwater chart
        h('div', { style: card },
            h('div', { style: cardTitle }, 'UNDERWATER DRAWDOWN' + (drawdownSeries.maxDD ? ' — MAX ' + (drawdownSeries.maxDD * 100).toFixed(1) + '% (' + drawdownSeries.maxDDDate + ')' : '')),
            h(ChartCanvas, { canvasRef: ddCanvasRef, height: 200 })
        ),

        // Rolling Sharpe
        h('div', { style: card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 } },
                h('div', { style: cardTitle }, 'ROLLING SHARPE RATIO'),
                h('div', { style: { display: 'flex', gap: 14 } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: T.teal, fontFamily: T.mono } },
                        h('span', { style: { width: 18, height: 2, background: T.teal, display: 'inline-block' } }), '30D'),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: T.gold, fontFamily: T.mono } },
                        h('span', { style: { width: 18, height: 2, background: T.gold, borderTop: '2px dashed ' + T.gold, display: 'inline-block' } }), '90D')
                )
            ),
            h(ChartCanvas, { canvasRef: sharpCanvasRef, height: 200 })
        ),

        // Risk/Return scatter
        h('div', { style: card },
            h('div', { style: cardTitle }, 'RISK vs RETURN — POSITION MAP'),
            h('div', { style: { marginBottom: 6, fontSize: 9, color: T.t3, fontFamily: T.mono } },
                'Point size = position size · X = annualised vol · Y = total return'
            ),
            h(ChartCanvas, { canvasRef: scatCanvasRef, height: 320 }),
            scatLegend
        )
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 2 — CORRELATION INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════
export function CorrelationTab(props) {
    var d = props.data;
    if (!d) return h(Loading, { text: 'Computing correlation matrix…' });

    var equitySyms      = d.equitySyms || [];
    var returnsBySymbol = d.returnsBySymbol || {};
    var riskView        = d.riskView || [];

    // ── Limit to top 20 by market value for matrix readability ───────────────
    var matrixSyms = useMemo(function() {
        var sorted = riskView
            .filter(function(r) { return !isOption(r.symbol) && returnsBySymbol[r.symbol]; })
            .sort(function(a, b) { return b.market_value - a.market_value; })
            .slice(0, 20)
            .map(function(r) { return r.symbol; });
        return sorted;
    }, [riskView, returnsBySymbol]);

    // ── Correlation matrix computation ────────────────────────────────────────
    var corrMatrix = useMemo(function() {
        var n = matrixSyms.length;
        var matrix = [];
        for (var i = 0; i < n; i++) {
            var row = [];
            for (var j = 0; j < n; j++) {
                if (i === j) { row.push(1); continue; }
                row.push(pearsonCorr(returnsBySymbol[matrixSyms[i]] || [], returnsBySymbol[matrixSyms[j]] || []));
            }
            matrix.push(row);
        }
        return matrix;
    }, [matrixSyms, returnsBySymbol]);

    // ── Summary stats ─────────────────────────────────────────────────────────
    var corrStats = useMemo(function() {
        var n = matrixSyms.length;
        if (n < 2) return null;
        var offDiag = [];
        for (var i = 0; i < n; i++) {
            for (var j = i + 1; j < n; j++) {
                offDiag.push({ i: i, j: j, v: corrMatrix[i][j] });
            }
        }
        var vals = offDiag.map(function(x) { return x.v; });
        var avgCorr = mean(vals);
        var divScore = 1 - avgCorr;

        // Redundancy: pairs with corr > 0.80
        var redundant = offDiag
            .filter(function(x) { return x.v > 0.80; })
            .sort(function(a, b) { return b.v - a.v; })
            .slice(0, 8)
            .map(function(x) { return { symA: matrixSyms[x.i], symB: matrixSyms[x.j], corr: x.v }; });

        // Cluster detection: groups of 3+ with mutual corr > 0.75
        var clusters = [];
        var visited = {};
        for (var ii = 0; ii < n; ii++) {
            if (visited[ii]) continue;
            var group = [ii];
            for (var jj = ii + 1; jj < n; jj++) {
                if (visited[jj]) continue;
                // check corr with all current group members
                var ok = true;
                for (var kk = 0; kk < group.length; kk++) {
                    if (corrMatrix[group[kk]][jj] < 0.75) { ok = false; break; }
                }
                if (ok) group.push(jj);
            }
            if (group.length >= 3) {
                // avg pairwise corr within group
                var pairVals = [];
                for (var gi = 0; gi < group.length; gi++) {
                    for (var gj = gi + 1; gj < group.length; gj++) {
                        pairVals.push(corrMatrix[group[gi]][group[gj]]);
                    }
                }
                clusters.push({
                    symbols: group.map(function(idx) { return matrixSyms[idx]; }),
                    avgCorr: mean(pairVals),
                });
                group.forEach(function(idx) { visited[idx] = true; });
            }
        }

        return { avgCorr: avgCorr, divScore: divScore, redundant: redundant, clusters: clusters };
    }, [corrMatrix, matrixSyms]);

    function cellBg(v, isDiag) {
        if (isDiag) return 'rgba(0,212,184,0.20)';
        if (v >= 0.85) return 'rgba(239,68,68,0.70)';
        if (v >= 0.70) return 'rgba(239,68,68,0.40)';
        if (v >= 0.55) return 'rgba(245,158,11,0.38)';
        if (v >= 0.35) return 'rgba(245,158,11,0.16)';
        if (v >= 0.10) return 'rgba(255,255,255,0.04)';
        return 'rgba(34,197,94,0.10)'; // low / negative = slight green
    }

    var riskMap = {};
    riskView.forEach(function(r) { riskMap[r.symbol] = r; });

    // ── Sector color dot for row/col labels ───────────────────────────────────
    function symLabel(sym) {
        var r = riskMap[sym];
        var sc = r ? sectorColor(r.sector) : T.t3;
        return h('div', { style: { display: 'flex', alignItems: 'center', gap: 4 } },
            h('span', { style: { width: 6, height: 6, background: sc, borderRadius: 6, display: 'inline-block', flexShrink: 0 } }),
            h('span', null, sym)
        );
    }

    return h('div', null,
        // Stats strip
        corrStats && h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 } },
            h(KpiPill, {
                label: 'Avg Pairwise Correlation', value: corrStats.avgCorr.toFixed(3),
                color: corrStats.avgCorr > 0.6 ? T.red : corrStats.avgCorr > 0.4 ? T.amber : T.green,
                sub: corrStats.avgCorr > 0.6 ? 'Crowded — high systematic risk' : corrStats.avgCorr > 0.4 ? 'Moderate correlation' : 'Well diversified',
            }),
            h(KpiPill, {
                label: 'Diversification Score', value: (corrStats.divScore * 100).toFixed(0) + ' / 100',
                color: corrStats.divScore > 0.6 ? T.green : corrStats.divScore > 0.4 ? T.amber : T.red,
                sub: '0 = perfectly correlated · 100 = uncorrelated',
            }),
            h(KpiPill, {
                label: 'Redundant Pairs (>0.80)', value: corrStats.redundant.length.toString(),
                color: corrStats.redundant.length > 5 ? T.red : corrStats.redundant.length > 2 ? T.amber : T.green,
            }),
            h(KpiPill, {
                label: 'Tight Clusters (≥3)', value: corrStats.clusters.length.toString(),
                color: corrStats.clusters.length > 0 ? T.amber : T.green,
            })
        ),

        // Cluster alerts
        corrStats && corrStats.clusters.length > 0 && h('div', { style: { marginBottom: 16 } },
            corrStats.clusters.map(function(cl, idx) {
                var alertColor = cl.avgCorr > 0.80 ? T.red : T.amber;
                return h('div', {
                    key: idx,
                    style: {
                        background:   alertColor === T.red ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                        border:       '1px solid ' + alertColor + '55',
                        borderLeft:   '3px solid ' + alertColor,
                        borderRadius: '0 8px 8px 0',
                        padding:      '10px 14px',
                        marginBottom: 8,
                        fontFamily:   T.mono,
                    }
                },
                    h('div', { style: { fontSize: 10, color: alertColor, fontWeight: 700, marginBottom: 4 } },
                        (cl.avgCorr > 0.80 ? '⚠ CRITICAL' : '◈ WARNING') + ' — Tight Cluster Detected'
                    ),
                    h('div', { style: { fontSize: 11, color: T.t1, marginBottom: 3 } },
                        cl.symbols.join(' · ') + '  —  avg corr ' + cl.avgCorr.toFixed(2)
                    ),
                    h('div', { style: { fontSize: 10, color: T.t2 } },
                        cl.symbols.length + ' positions effectively one factor bet. Consider reducing redundancy.'
                    )
                );
            })
        ),

        // Redundancy list
        corrStats && corrStats.redundant.length > 0 && h('div', { style: Object.assign({}, card, { marginBottom: 16 }) },
            h('div', { style: cardTitle }, 'REDUNDANT PAIRS — CORRELATION > 0.80'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
                corrStats.redundant.map(function(p, idx) {
                    var intensity = p.corr >= 0.90 ? T.red : T.amber;
                    return h('div', {
                        key: idx,
                        style: {
                            padding: '6px 12px', borderRadius: 6, fontSize: 10, fontFamily: T.mono,
                            border: '1px solid ' + intensity + '55', background: intensity + '12',
                            color: T.t1,
                        }
                    }, p.symA + ' ↔ ' + p.symB + '  ' + (p.corr * 100).toFixed(0) + '%');
                })
            )
        ),

        // Correlation matrix table
        h('div', { style: card },
            h('div', { style: cardTitle }, 'PAIRWISE CORRELATION MATRIX — TOP 20 BY POSITION SIZE'),
            h('div', { style: { overflowX: 'auto', overflowY: 'auto', maxHeight: 560 } },
                h('table', { style: { borderCollapse: 'collapse', fontSize: 9, fontFamily: T.mono } },
                    // Header row
                    h('thead', null,
                        h('tr', null,
                            h('th', { style: Object.assign({}, th, { width: 70, minWidth: 70, position: 'sticky', left: 0, background: '#0a0e1a', zIndex: 2 }) }, ''),
                            matrixSyms.map(function(sym) {
                                return h('th', {
                                    key: sym,
                                    style: Object.assign({}, th, {
                                        textAlign: 'center', minWidth: 38, width: 38, writingMode: 'vertical-lr',
                                        transform: 'rotate(180deg)', height: 72, paddingBottom: 6,
                                        color: sectorColor((riskMap[sym] || {}).sector),
                                    })
                                }, sym);
                            })
                        )
                    ),
                    h('tbody', null,
                        matrixSyms.map(function(symA, i) {
                            return h('tr', { key: symA },
                                h('td', { style: Object.assign({}, td, { fontWeight: 600, position: 'sticky', left: 0, background: '#0a0e1a', zIndex: 1, minWidth: 70 }) },
                                    symLabel(symA)
                                ),
                                matrixSyms.map(function(symB, j) {
                                    var v = corrMatrix[i] ? corrMatrix[i][j] : 0;
                                    var isDiag = i === j;
                                    return h('td', {
                                        key: symB,
                                        style: {
                                            background:  cellBg(v, isDiag),
                                            textAlign:   'center',
                                            padding:     '4px 2px',
                                            fontSize:    9,
                                            fontFamily:  T.mono,
                                            color:       isDiag ? T.teal : v > 0.55 ? T.t1 : T.t2,
                                            fontWeight:  v > 0.70 || isDiag ? 700 : 400,
                                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                                            minWidth:    38,
                                        }
                                    }, isDiag ? '—' : v.toFixed(2));
                                })
                            );
                        })
                    )
                )
            )
        )
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 3 — RISK DECOMPOSITION
// ═══════════════════════════════════════════════════════════════════════════════
export function DecompositionTab(props) {
    var d = props.data;
    if (!d) return h(Loading, { text: 'Computing risk decomposition…' });

    var riskView         = d.riskView || [];
    var portfolioReturns = d.portfolioReturns || [];
    var nav              = d.nav;
    var returnsBySymbol  = d.returnsBySymbol || {};
    var equitySyms       = d.equitySyms || [];

    // equity-only riskView, sorted by VaR
    var equityRisk = useMemo(function() {
        return riskView
            .filter(function(r) { return !isOption(r.symbol) && r.dollar_var_95_daily > 0; })
            .sort(function(a, b) { return b.dollar_var_95_daily - a.dollar_var_95_daily; });
    }, [riskView]);

    var sumIndivVaR = useMemo(function() {
        return equityRisk.reduce(function(s, r) { return s + Number(r.dollar_var_95_daily); }, 0);
    }, [equityRisk]);

    var portfolioVaR = useMemo(function() {
        return histVaR(portfolioReturns, nav, 0.95);
    }, [portfolioReturns, nav]);

    var benefit = sumIndivVaR - portfolioVaR;

    // ── Marginal VaR via brute-force removal ──────────────────────────────────
    var marginalVaR = useMemo(function() {
        var syms = equitySyms.filter(function(s) { return returnsBySymbol[s] && returnsBySymbol[s].length >= 20; });
        if (!syms.length || !portfolioReturns.length) return {};

        var weightMap = {};
        riskView.forEach(function(r) { weightMap[r.symbol] = Number(r.weight) || 0; });

        var nDays = portfolioReturns.length;
        var result = {};

        syms.forEach(function(removeSym) {
            // Weights without this position, renormalised
            var others = syms.filter(function(s) { return s !== removeSym; });
            var othersW = others.reduce(function(s, sym) { return s + (weightMap[sym] || 0); }, 0);
            if (othersW <= 0) { result[removeSym] = 0; return; }

            // Reconstruct portfolio returns without this position
            var retLen = Math.min(nDays, Math.min.apply(null, others.map(function(s) { return (returnsBySymbol[s] || []).length; })));
            var withoutReturns = new Array(retLen).fill(0);
            others.forEach(function(sym) {
                var w = (weightMap[sym] || 0) / othersW;
                var rets = returnsBySymbol[sym] || [];
                for (var i = 0; i < retLen; i++) {
                    withoutReturns[i] += w * (rets[rets.length - retLen + i] || 0);
                }
            });

            var varWithout = histVaR(withoutReturns, nav, 0.95);
            result[removeSym] = portfolioVaR - varWithout;
        });

        return result;
    }, [equitySyms, riskView, returnsBySymbol, portfolioReturns, portfolioVaR, nav]);

    // ── Sector VaR aggregation ────────────────────────────────────────────────
    var sectorVaR = useMemo(function() {
        var byS = {};
        equityRisk.forEach(function(r) {
            var s = r.sector || 'Other';
            byS[s] = (byS[s] || 0) + Number(r.dollar_var_95_daily);
        });
        return Object.keys(byS)
            .map(function(s) { return { sector: s, varDollar: byS[s] }; })
            .sort(function(a, b) { return b.varDollar - a.varDollar; });
    }, [equityRisk]);

    // ── Chart refs ────────────────────────────────────────────────────────────
    var sectorCanvasRef = useRef(null);
    var sectorChartRef  = useRef(null);
    var wvCanvasRef     = useRef(null);
    var wvChartRef      = useRef(null);

    // Sector VaR horizontal bar
    useEffect(function() {
        if (!sectorCanvasRef.current || !sectorVaR.length) return;
        if (sectorChartRef.current) { sectorChartRef.current.destroy(); sectorChartRef.current = null; }
        sectorChartRef.current = new Chart(sectorCanvasRef.current, {
            type: 'bar',
            data: {
                labels: sectorVaR.map(function(s) { return s.sector; }),
                datasets: [{
                    data:            sectorVaR.map(function(s) { return s.varDollar; }),
                    backgroundColor: sectorVaR.map(function(s) { return sectorColor(s.sector) + 'cc'; }),
                    borderColor:     sectorVaR.map(function(s) { return sectorColor(s.sector); }),
                    borderWidth:     1.5, borderRadius: 4,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        callbacks: { label: function(ctx) { return ' Daily VaR: $' + ctx.parsed.x.toFixed(0); } },
                    },
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, callback: function(v) { return '$' + v.toFixed(0); } }, border: { display: false } },
                    y: { grid: { display: false }, ticks: { color: T.t1, font: { family: T.mono, size: 10 } }, border: { display: false } },
                },
            },
        });
        return function() { if (sectorChartRef.current) { sectorChartRef.current.destroy(); sectorChartRef.current = null; } };
    }, [sectorVaR]);

    // Weight vs Marginal VaR grouped bar
    useEffect(function() {
        if (!wvCanvasRef.current || !equityRisk.length) return;
        if (wvChartRef.current) { wvChartRef.current.destroy(); wvChartRef.current = null; }

        var top = equityRisk.slice(0, 18);
        var totalW   = top.reduce(function(s, r) { return s + Number(r.weight); }, 0) || 1;
        var totalMVaR = Object.values(marginalVaR).reduce(function(s, v) { return s + Math.max(v, 0); }, 0) || 1;

        var labels   = top.map(function(r) { return r.symbol; });
        var weights  = top.map(function(r) { return (Number(r.weight) / totalW) * 100; });
        var varShares = top.map(function(r) {
            var mv = marginalVaR[r.symbol];
            return mv != null ? (Math.max(mv, 0) / totalMVaR) * 100 : (Number(r.dollar_var_95_daily) / sumIndivVaR) * 100;
        });

        wvChartRef.current = new Chart(wvCanvasRef.current, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Portfolio Weight %', data: weights,  backgroundColor: T.blue + 'aa',  borderColor: T.blue,  borderWidth: 1, borderRadius: 3 },
                    { label: 'VaR Contribution %',  data: varShares, backgroundColor: T.red + 'aa',   borderColor: T.red,   borderWidth: 1, borderRadius: 3 },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: true, labels: { color: T.t2, font: { family: T.mono, size: 9 }, boxWidth: 10 } },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        callbacks: { label: function(ctx) { return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%'; } },
                    },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: T.t3, font: { family: T.mono, size: 8 } }, border: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, callback: function(v) { return v.toFixed(0) + '%'; } }, border: { display: false } },
                },
            },
        });
        return function() { if (wvChartRef.current) { wvChartRef.current.destroy(); wvChartRef.current = null; } };
    }, [equityRisk, marginalVaR, sumIndivVaR]);

    var fmtD = function(v) { return '$' + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(1) + 'k' : Math.abs(v).toFixed(0)); };

    return h('div', null,
        // Diversification benefit 3-panel card
        h('div', { style: Object.assign({}, card, { marginBottom: 16 }) },
            h('div', { style: cardTitle }, 'DIVERSIFICATION BENEFIT — PORTFOLIO CONSTRUCTION VALUE'),
            h('div', { style: { display: 'flex', gap: 0 } },
                h('div', { style: { flex: 1, textAlign: 'center', padding: '12px 0', borderRight: '1px solid ' + T.border } },
                    h('div', { style: { fontSize: 9, color: T.t3, fontFamily: T.mono, letterSpacing: 1.2, marginBottom: 8 } }, 'SUM OF INDIVIDUAL VAR'),
                    h('div', { style: { fontSize: 26, fontWeight: 700, fontFamily: T.mono, color: T.red } }, fmtD(sumIndivVaR)),
                    h('div', { style: { fontSize: 9, color: T.t2, fontFamily: T.mono, marginTop: 4 } }, 'if fully correlated')
                ),
                h('div', { style: { flex: 1, textAlign: 'center', padding: '12px 0', borderRight: '1px solid ' + T.border } },
                    h('div', { style: { fontSize: 9, color: T.t3, fontFamily: T.mono, letterSpacing: 1.2, marginBottom: 8 } }, 'ACTUAL PORTFOLIO VAR'),
                    h('div', { style: { fontSize: 26, fontWeight: 700, fontFamily: T.mono, color: T.amber } }, fmtD(portfolioVaR)),
                    h('div', { style: { fontSize: 9, color: T.t2, fontFamily: T.mono, marginTop: 4 } }, '95% confidence, 1 day')
                ),
                h('div', { style: { flex: 1, textAlign: 'center', padding: '12px 0' } },
                    h('div', { style: { fontSize: 9, color: T.t3, fontFamily: T.mono, letterSpacing: 1.2, marginBottom: 8 } }, 'DIVERSIFICATION BENEFIT'),
                    h('div', { style: { fontSize: 26, fontWeight: 700, fontFamily: T.mono, color: T.green } }, fmtD(benefit)),
                    h('div', { style: { fontSize: 9, color: T.t2, fontFamily: T.mono, marginTop: 4 } },
                        benefit > 0 ? ((benefit / sumIndivVaR * 100).toFixed(0) + '% reduction in daily risk') : 'negative diversification'
                    )
                )
            )
        ),

        // Sector VaR chart
        h('div', { style: card },
            h('div', { style: cardTitle }, 'SECTOR VAR ATTRIBUTION — DAILY 95% ($)'),
            h(ChartCanvas, { canvasRef: sectorCanvasRef, height: 220 })
        ),

        // Weight vs VaR grouped bar
        h('div', { style: card },
            h('div', { style: cardTitle }, 'WEIGHT vs VAR CONTRIBUTION — TOP 18 POSITIONS'),
            h('div', { style: { fontSize: 9, color: T.t2, fontFamily: T.mono, marginBottom: 10 } },
                'Red bars above blue = punching above weight in risk. Flag: VaR share > 1.5× weight share.'
            ),
            h(ChartCanvas, { canvasRef: wvCanvasRef, height: 280 }),

            // Flagged positions
            h('div', { style: { marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 } },
                equityRisk.slice(0, 18).filter(function(r) {
                    var totalW    = equityRisk.reduce(function(s, x) { return s + Number(x.weight); }, 0) || 1;
                    var mv = marginalVaR[r.symbol];
                    var totalMVaR = Object.values(marginalVaR).reduce(function(s, v) { return s + Math.max(v, 0); }, 0) || 1;
                    var wShare    = Number(r.weight) / totalW;
                    var vShare    = mv != null ? Math.max(mv, 0) / totalMVaR : Number(r.dollar_var_95_daily) / sumIndivVaR;
                    return vShare > wShare * 1.5;
                }).map(function(r, idx) {
                    return h('div', {
                        key: idx,
                        style: {
                            padding: '4px 10px', borderRadius: 5, fontSize: 9, fontFamily: T.mono,
                            border: '1px solid ' + T.red + '66', background: T.red + '14', color: T.red,
                        }
                    }, '⚑ ' + r.symbol);
                })
            )
        ),

        // Per-position VaR table
        h('div', { style: card },
            h('div', { style: cardTitle }, 'POSITION RISK TABLE'),
            h('div', { style: { overflowX: 'auto' } },
                h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                    h('thead', null,
                        h('tr', null,
                            h('th', { style: th }, 'Symbol'),
                            h('th', { style: th }, 'Sector'),
                            h('th', { style: th }, 'Tier'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right' }) }, 'Ann. Vol'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right' }) }, 'Standalone VaR'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right' }) }, 'Marginal VaR'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right' }) }, 'Weight')
                        )
                    ),
                    h('tbody', null,
                        equityRisk.map(function(r, idx) {
                            var mv   = marginalVaR[r.symbol];
                            var tier = r.risk_tier || '';
                            var tc   = tier === 'High Risk' ? T.red : tier === 'Moderate Risk' ? T.amber : T.green;
                            return h('tr', { key: r.symbol + idx },
                                h('td', { style: Object.assign({}, td, { color: T.teal, fontWeight: 600 }) }, r.symbol),
                                h('td', { style: Object.assign({}, td, { color: T.t2 }) }, r.sector || '—'),
                                h('td', { style: Object.assign({}, td, { color: tc, fontSize: 9 }) }, tier.replace(' Risk', '')),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right' }) }, (Number(r.annual_vol) * 100).toFixed(1) + '%'),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: T.red }) }, '$' + Number(r.dollar_var_95_daily).toFixed(0)),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: mv != null ? (mv > 0 ? T.amber : T.green) : T.t3 }) },
                                    mv != null ? (mv >= 0 ? '+' : '') + '$' + Math.abs(mv).toFixed(0) : '—'
                                ),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: T.t2 }) }, (Number(r.weight) * 100).toFixed(2) + '%')
                            );
                        })
                    )
                )
            )
        )
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 4 — STRESS ENGINE  (Regime Replay + Factor Shock Sliders)
// ═══════════════════════════════════════════════════════════════════════════════
export function StressEngineTab(props) {
    var d = props.data;
    if (!d) return h(Loading, { text: 'Loading stress engine…' });

    var riskView        = d.riskView   || [];
    var returnsBySymbol = d.returnsBySymbol || {};
    var nav             = d.nav;

    // ── Regime replay ─────────────────────────────────────────────────────────
    var regimeResults = useMemo(function() {
        return REGIME_WINDOWS.map(function(win) {
            var total = 0, count = 0;
            riskView.filter(function(r) { return !isOption(r.symbol) && Number(r.weight) > 0; }).forEach(function(r) {
                var rets = returnsBySymbol[r.symbol] || [];
                var hist = d.dates || [];
                var startIdx = -1, endIdx = -1;
                for (var i = 0; i < hist.length; i++) {
                    if (hist[i] >= win.start && startIdx === -1) startIdx = i;
                    if (hist[i] <= win.end) endIdx = i;
                }
                if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) return;
                var retOffset = rets.length - hist.length;
                var cumRet = 0;
                for (var j = startIdx; j < endIdx && (j + retOffset) < rets.length; j++) {
                    cumRet += (rets[j + retOffset] || 0);
                }
                total += Number(r.weight) * cumRet;
                count++;
            });
            return { name: win.name, color: win.color, portfolioReturn: total, dollarPnL: total * nav, start: win.start, end: win.end };
        });
    }, [riskView, returnsBySymbol, d, nav]);

    // ── Factor shock sliders ──────────────────────────────────────────────────
    var SECTORS_LIST = ['Technology', 'Energy', 'Materials', 'Consumer Discretionary', 'International', 'Financials', 'Healthcare', 'Industrials'];

    var _shocks = useState(function() {
        var init = {};
        SECTORS_LIST.forEach(function(s) { init[s] = 0; });
        return init;
    });
    var shocks = _shocks[0], setShocks = _shocks[1];

    var shockImpact = useMemo(function() {
        var total = 0;
        riskView.filter(function(r) { return !isOption(r.symbol); }).forEach(function(r) {
            var shock = shocks[r.sector] || 0;
            total += Number(r.weight) * (shock / 100);
        });
        return { pct: total, dollar: total * nav };
    }, [shocks, riskView, nav]);

    // Regime chart
    var regCanvasRef = useRef(null);
    var regChartRef  = useRef(null);
    useEffect(function() {
        if (!regCanvasRef.current || !regimeResults.length) return;
        if (regChartRef.current) { regChartRef.current.destroy(); regChartRef.current = null; }
        regChartRef.current = new Chart(regCanvasRef.current, {
            type: 'bar',
            data: {
                labels: regimeResults.map(function(r) { return r.name; }),
                datasets: [{
                    data:            regimeResults.map(function(r) { return r.portfolioReturn * 100; }),
                    backgroundColor: regimeResults.map(function(r) { return r.portfolioReturn >= 0 ? T.green + 'cc' : T.red + 'cc'; }),
                    borderColor:     regimeResults.map(function(r) { return r.color; }),
                    borderWidth: 2, borderRadius: 6,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        callbacks: {
                            label: function(ctx) {
                                var r = regimeResults[ctx.dataIndex];
                                return [
                                    ' Return: ' + (r.portfolioReturn >= 0 ? '+' : '') + (r.portfolioReturn * 100).toFixed(2) + '%',
                                    ' P&L: ' + (r.dollarPnL >= 0 ? '+' : '-') + '$' + Math.abs(r.dollarPnL).toFixed(0),
                                ];
                            },
                        },
                    },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: T.t1, font: { family: T.mono, size: 11 } }, border: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, callback: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; } }, border: { display: false } },
                },
            },
        });
        return function() { if (regChartRef.current) { regChartRef.current.destroy(); regChartRef.current = null; } };
    }, [regimeResults]);

    var impactColor = shockImpact.dollar >= 0 ? T.green : T.red;

    return h('div', null,
        // Regime replay
        h('div', { style: card },
            h('div', { style: cardTitle }, 'REGIME REPLAY — PORTFOLIO P&L BY MACRO WINDOW'),
            h('div', { style: { display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap' } },
                regimeResults.map(function(r) {
                    return h('div', { key: r.name, style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: T.t2, fontFamily: T.mono } },
                        h('span', { style: { width: 8, height: 8, background: r.color, borderRadius: 2, display: 'inline-block' } }),
                        h('span', { style: { color: r.color } }, r.name), ' ', r.start, ' → ', r.end
                    );
                })
            ),
            h(ChartCanvas, { canvasRef: regCanvasRef, height: 220 })
        ),

        // Factor shock sliders
        h('div', { style: card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 } },
                h('div', { style: cardTitle }, 'FACTOR SHOCK — SECTOR STRESS TEST'),
                h('div', { style: { textAlign: 'right' } },
                    h('div', { style: { fontSize: 9, color: T.t3, fontFamily: T.mono, letterSpacing: 1.2, marginBottom: 4 } }, 'ESTIMATED IMPACT'),
                    h('div', { style: { fontSize: 22, fontWeight: 700, fontFamily: T.mono, color: impactColor } },
                        (shockImpact.dollar >= 0 ? '+' : '') + '$' + Math.abs(shockImpact.dollar).toFixed(0)
                    ),
                    h('div', { style: { fontSize: 9, color: T.t2, fontFamily: T.mono } },
                        (shockImpact.pct >= 0 ? '+' : '') + (shockImpact.pct * 100).toFixed(2) + '% of NAV'
                    )
                )
            ),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 } },
                SECTORS_LIST.map(function(sec) {
                    var shock = shocks[sec] || 0;
                    var secW = riskView
                        .filter(function(r) { return r.sector === sec && !isOption(r.symbol); })
                        .reduce(function(s, r) { return s + Number(r.weight); }, 0);
                    if (secW < 0.001) return null;
                    return h('div', { key: sec, style: { background: 'rgba(255,255,255,0.02)', border: '1px solid ' + T.border, borderRadius: 8, padding: '12px 14px' } },
                        h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 } },
                            h('div', { style: { fontSize: 10, color: sectorColor(sec), fontFamily: T.mono, fontWeight: 700 } }, sec),
                            h('div', { style: { fontSize: 10, fontFamily: T.mono, color: shock === 0 ? T.t2 : shock > 0 ? T.green : T.red, fontWeight: 700 } },
                                (shock > 0 ? '+' : '') + shock + '%'
                            )
                        ),
                        h('div', { style: { fontSize: 9, color: T.t3, fontFamily: T.mono, marginBottom: 6 } },
                            'Weight: ' + (secW * 100).toFixed(1) + '% · Impact: ' + ((shock / 100) * secW * nav >= 0 ? '+' : '') + '$' + Math.abs((shock / 100) * secW * nav).toFixed(0)
                        ),
                        h('input', {
                            type: 'range', min: -50, max: 50, step: 5, value: shock,
                            onChange: (function(s) { return function(e) {
                                var v = parseInt(e.target.value);
                                setShocks(function(prev) { var next = Object.assign({}, prev); next[s] = v; return next; });
                            }; })(sec),
                            style: { width: '100%', accentColor: sectorColor(sec), cursor: 'pointer' },
                        }),
                        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 8, color: T.t3, fontFamily: T.mono, marginTop: 3 } },
                            h('span', null, '−50%'), h('span', null, '0'), h('span', null, '+50%')
                        )
                    );
                }).filter(Boolean)
            ),
            h('button', {
                onClick: function() {
                    var reset = {};
                    SECTORS_LIST.forEach(function(s) { reset[s] = 0; });
                    setShocks(reset);
                },
                style: { marginTop: 14, padding: '5px 14px', borderRadius: 5, fontSize: 9, fontFamily: T.mono, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: T.t2 },
            }, '↺ Reset All Shocks')
        )
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 5 — OPTIONS GREEKS  (placeholder ready for live option positions)
// ═══════════════════════════════════════════════════════════════════════════════
export function GreeksTab(props) {
    var d = props.data;
    if (!d) return h(Loading, { text: 'Loading Greeks data…' });

    var riskView = d.riskView || [];

    function parseOCC(sym) {
        var m = sym.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
        if (!m) return null;
        return {
            underlying: m[1],
            expiry: '20' + m[2].slice(0, 2) + '-' + m[2].slice(2, 4) + '-' + m[2].slice(4, 6),
            type: m[3] === 'C' ? 'call' : 'put',
            strike: parseInt(m[4]) / 1000,
        };
    }

    function normalCDF(x) {
        var t = 1 / (1 + 0.2316419 * Math.abs(x));
        var poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
        var result = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-x * x / 2) * poly;
        return x >= 0 ? result : 1 - result;
    }

    function blackScholes(S, K, T_years, r, sigma, type) {
        if (T_years <= 0 || sigma <= 0 || S <= 0) return null;
        var d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T_years) / (sigma * Math.sqrt(T_years));
        var d2 = d1 - sigma * Math.sqrt(T_years);
        var sqrtT = Math.sqrt(T_years);
        var npd1 = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
        if (type === 'call') {
            return {
                price:  S * normalCDF(d1) - K * Math.exp(-r * T_years) * normalCDF(d2),
                delta:  normalCDF(d1),
                gamma:  npd1 / (S * sigma * sqrtT),
                theta:  (-(S * sigma * npd1) / (2 * sqrtT) - r * K * Math.exp(-r * T_years) * normalCDF(d2)) / 365,
                vega:   S * sqrtT * npd1 / 100,
            };
        }
        return {
            price:  K * Math.exp(-r * T_years) * normalCDF(-d2) - S * normalCDF(-d1),
            delta:  normalCDF(d1) - 1,
            gamma:  npd1 / (S * sigma * sqrtT),
            theta:  (-(S * sigma * npd1) / (2 * sqrtT) + r * K * Math.exp(-r * T_years) * normalCDF(-d2)) / 365,
            vega:   S * sqrtT * npd1 / 100,
        };
    }

    var today = '2026-05-22';

    var optionPositions = useMemo(function() {
        return riskView.filter(function(r) { return isOption(r.symbol); });
    }, [riskView]);

    var greeksRows = useMemo(function() {
        if (!optionPositions.length) return [];
        var returnsBySymbol = (d.returnsBySymbol) || {};
        var RF = 0.045;

        return optionPositions.map(function(r) {
            var parsed = parseOCC(r.symbol);
            if (!parsed) return null;

            var underlying = parsed.underlying;
            var expiryDate = parsed.expiry;
            var todayDate  = new Date(today);
            var expDate    = new Date(expiryDate);
            var T_years    = Math.max(0, (expDate - todayDate) / (365 * 24 * 3600 * 1000));

            // IV proxy: 30D realised vol of underlying
            var undRets = returnsBySymbol[underlying] || [];
            var vol30 = undRets.length >= 20 ? std(undRets.slice(-30)) * Math.sqrt(252) : 0.35;

            var S = Number(r.market_value) / (Math.abs(Number(r.weight || 0.01)) * (d.nav || 101152));
            var K = parsed.strike;
            var qty = Math.round(Math.abs(Number(r.market_value)) / Math.max(K, 1) / 100) || 1;

            var bs = blackScholes(K * 1.05, K, T_years, RF, vol30, parsed.type);

            return bs ? {
                symbol:     r.symbol,
                underlying: underlying,
                type:       parsed.type,
                strike:     K,
                expiry:     expiryDate,
                qty:        qty,
                vol:        vol30,
                T_years:    T_years,
                delta:      bs.delta * qty * 100,
                gamma:      bs.gamma * qty * 100,
                theta:      bs.theta * qty * 100,
                vega:       bs.vega  * qty * 100,
            } : null;
        }).filter(Boolean);
    }, [optionPositions, d]);

    var netGreeks = useMemo(function() {
        return greeksRows.reduce(function(acc, g) {
            acc.delta += g.delta; acc.gamma += g.gamma;
            acc.theta += g.theta; acc.vega  += g.vega;
            return acc;
        }, { delta: 0, gamma: 0, theta: 0, vega: 0 });
    }, [greeksRows]);

    if (!optionPositions.length) {
        return h('div', { style: card },
            h('div', { style: cardTitle }, 'OPTIONS GREEKS LAYER'),
            h('div', { style: { padding: '32px 0', textAlign: 'center', color: T.t2, fontFamily: T.mono, fontSize: 13 } },
                'No active option positions detected in the current book.'
            ),
            h('div', { style: { padding: '0 0 24px', textAlign: 'center', color: T.t3, fontFamily: T.mono, fontSize: 10 } },
                'When options are added, this module will auto-parse OCC tickers and display Black-Scholes Greeks.',
                h('br', null),
                'Format: SYMBOL + YYMMDD + C/P + strike×1000  →  AMD250117C00150000'
            )
        );
    }

    var fmtG = function(v, dec) { return (v >= 0 ? '+' : '') + v.toFixed(dec != null ? dec : 2); };

    return h('div', null,
        // Net Greeks strip
        h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 } },
            h(KpiPill, { label: 'Net Book Delta (shares)', value: fmtG(netGreeks.delta, 0), color: T.teal,   sub: 'delta-adjusted equity exposure' }),
            h(KpiPill, { label: 'Net Gamma',              value: fmtG(netGreeks.gamma, 1), color: T.blue,   sub: 'convexity per $1 move' }),
            h(KpiPill, { label: 'Daily Theta ($)',        value: fmtG(netGreeks.theta, 0), color: netGreeks.theta < 0 ? T.red : T.green, sub: 'time decay per day' }),
            h(KpiPill, { label: 'Vega (per 1% IV)',      value: fmtG(netGreeks.vega, 0),  color: T.purple,  sub: 'vol exposure' })
        ),

        // Position Greeks table
        h('div', { style: card },
            h('div', { style: cardTitle }, 'POSITION GREEKS — BLACK-SCHOLES (REALISED VOL PROXY)'),
            h('div', { style: { fontSize: 9, color: T.amber, fontFamily: T.mono, marginBottom: 10 } },
                '⚠ Greeks computed using 30D realised vol as IV proxy — approximate, not market-implied.'
            ),
            h('div', { style: { overflowX: 'auto' } },
                h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                    h('thead', null,
                        h('tr', null,
                            h('th', { style: th }, 'Symbol'),
                            h('th', { style: th }, 'Und.'),
                            h('th', { style: th }, 'Type'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right' }) }, 'Strike'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right' }) }, 'Expiry'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right' }) }, 'Vol Proxy'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right', color: T.teal   }) }, 'Δ Delta'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right', color: T.blue   }) }, 'Γ Gamma'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right', color: T.red    }) }, 'Θ Theta/d'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right', color: T.purple }) }, 'ν Vega')
                        )
                    ),
                    h('tbody', null,
                        greeksRows.map(function(g, idx) {
                            return h('tr', { key: g.symbol + idx },
                                h('td', { style: Object.assign({}, td, { color: T.teal, fontWeight: 600, fontSize: 9 }) }, g.symbol),
                                h('td', { style: Object.assign({}, td, { color: T.t2 }) }, g.underlying),
                                h('td', { style: Object.assign({}, td, { color: g.type === 'call' ? T.green : T.red }) }, g.type.toUpperCase()),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right' }) }, '$' + g.strike.toFixed(2)),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: T.t2 }) }, g.expiry),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: T.t2 }) }, (g.vol * 100).toFixed(1) + '%'),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: T.teal, fontWeight: 600 }) }, fmtG(g.delta, 1)),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: T.blue }) }, g.gamma.toFixed(3)),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: g.theta < 0 ? T.red : T.green }) }, fmtG(g.theta, 2)),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: T.purple }) }, fmtG(g.vega, 1))
                            );
                        })
                    )
                )
            )
        )
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT — RiskAnalysisV2
// ═══════════════════════════════════════════════════════════════════════════════
export function RiskAnalysisV2() {
    var _data    = useState(null);
    var data     = _data[0],    setData     = _data[1];
    var _loading = useState(true);
    var loading  = _loading[0], setLoading  = _loading[1];
    var _err     = useState(null);
    var err      = _err[0],     setErr      = _err[1];
    var _tab     = useState('command');
    var tab      = _tab[0],     setTab      = _tab[1];

    useEffect(function() {
        function load() {
            setLoading(true); setErr(null);
            loadRiskData(function(result) {
                setData(result);
                setLoading(false);
            }, function(e) {
                setErr(String(e));
                setLoading(false);
            });
        }
        load();
        window.addEventListener('atlas:refresh', load);
        return function() { window.removeEventListener('atlas:refresh', load); };
    }, []);

    var TABS = [
        { id: 'command',  label: 'COMMAND CENTER', sub: 'VaR · Drawdown · Scatter' },
        { id: 'corr',     label: 'CORRELATION',    sub: 'Matrix · Clusters' },
        { id: 'decomp',   label: 'DECOMPOSITION',  sub: 'Marginal VaR · Attribution' },
        { id: 'stress',   label: 'STRESS ENGINE',  sub: 'Regime Replay · Shocks' },
        { id: 'greeks',   label: 'GREEKS',         sub: 'Δ Γ Θ ν · Options' },
    ];

    var tabBar = h('div', {
        style: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid ' + T.border, overflowX: 'auto' }
    },
        TABS.map(function(t) {
            var active = t.id === tab;
            return h('button', {
                key: t.id,
                onClick: function() { setTab(t.id); },
                style: {
                    padding: '10px 22px 12px', border: 'none', background: 'transparent', cursor: 'pointer',
                    borderBottom: '2px solid ' + (active ? T.teal : 'transparent'),
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    transition: 'all 0.12s', marginBottom: -1, flexShrink: 0,
                },
            },
                h('span', { style: { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, fontFamily: T.mono, color: active ? T.teal : T.t2 } }, t.label),
                h('span', { style: { fontSize: 9, color: active ? T.teal + 'aa' : T.t3, fontFamily: T.mono } }, t.sub)
            );
        })
    );

    if (loading) return h('div', null,
        h('div', { style: { fontSize: 14, color: T.t2, fontFamily: T.mono, marginBottom: 8 } }, 'Risk Analysis v2.0'),
        h(Loading, { text: 'Loading portfolio risk data…' })
    );

    if (err) return h('div', { style: card },
        h('div', { style: { color: T.red, fontFamily: T.mono, fontSize: 12 } }, 'Error loading risk data: ' + err)
    );

    var content;
    if (tab === 'command') content = h(CommandCenterTab,  { data: data });
    if (tab === 'corr')    content = h(CorrelationTab,    { data: data });
    if (tab === 'decomp')  content = h(DecompositionTab,  { data: data });
    if (tab === 'stress')  content = h(StressEngineTab,   { data: data });
    if (tab === 'greeks')  content = h(GreeksTab,         { data: data });

    return h('div', null,
        h('div', { style: { fontSize: 14, fontWeight: 700, color: T.t1, fontFamily: T.mono, letterSpacing: 0.5, marginBottom: 16 } },
            'RISK ANALYSIS  ',
            h('span', { style: { fontSize: 9, color: T.teal, letterSpacing: 1.4, verticalAlign: 'middle' } }, 'v2.0')
        ),
        tabBar,
        content
    );
}
