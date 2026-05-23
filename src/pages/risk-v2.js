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

// ── Additional math utilities ──────────────────────────────────────────────────
function ulcerIndex(drawdownSeries) {
    var sumSq = 0;
    for (var i = 0; i < drawdownSeries.length; i++) sumSq += drawdownSeries[i] * drawdownSeries[i];
    return Math.sqrt(sumSq / drawdownSeries.length) * 100;
}

function calmarRatio(portfolioReturns, maxDrawdown) {
    if (!portfolioReturns.length) return 0;
    var totalReturn = portfolioReturns.reduce(function(acc, r) { return acc * (1 + r); }, 1) - 1;
    var years = portfolioReturns.length / 252;
    var annReturn = years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0;
    return maxDrawdown !== 0 ? annReturn / Math.abs(maxDrawdown) : 0;
}

function skewness(arr) {
    var m = mean(arr), s = std(arr);
    if (s === 0) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += Math.pow((arr[i] - m) / s, 3);
    return sum / arr.length;
}

function excessKurtosis(arr) {
    var m = mean(arr), s = std(arr);
    if (s === 0) return 0;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += Math.pow((arr[i] - m) / s, 4);
    return (sum / arr.length) - 3;
}

function buildHistogram(returns, numBins) {
    if (!returns.length) return { bins: [], binWidth: 0 };
    var min = Math.min.apply(null, returns);
    var max = Math.max.apply(null, returns);
    var binWidth = (max - min) / numBins || 0.001;
    var bins = [];
    for (var b = 0; b < numBins; b++) {
        bins.push({ lo: min + b * binWidth, hi: min + (b + 1) * binWidth, count: 0, mid: min + (b + 0.5) * binWidth });
    }
    returns.forEach(function(r) {
        var idx = Math.min(numBins - 1, Math.floor((r - min) / binWidth));
        if (idx >= 0) bins[idx].count++;
    });
    return { bins: bins, binWidth: binWidth };
}

function drawdownEvents(navData) {
    var hwm = 0, inDD = false, events = [], current = null;
    navData.forEach(function(row, i) {
        var nav = parseFloat(row.nav);
        if (nav > hwm) {
            hwm = nav;
            if (inDD && current) {
                current.recovered = row.price_date;
                current.duration = i - current.startIdx;
                events.push(current);
                current = null; inDD = false;
            }
        } else if (!inDD) {
            inDD = true;
            current = { start: row.price_date, startIdx: i, trough: nav, troughDate: row.price_date, depth: nav / hwm - 1 };
        } else if (current && nav < current.trough) {
            current.trough = nav; current.troughDate = row.price_date; current.depth = nav / hwm - 1;
        }
    });
    if (inDD && current) { current.recovered = null; current.duration = navData.length - current.startIdx; events.push(current); }
    return events;
}

function worstDayIndices(portfolioReturns, pct) {
    var n = Math.max(1, Math.floor(portfolioReturns.length * pct));
    var indexed = portfolioReturns.map(function(r, i) { return { r: r, i: i }; });
    indexed.sort(function(a, b) { return a.r - b.r; });
    var worst = {};
    for (var k = 0; k < n; k++) worst[indexed[k].i] = true;
    return worst;
}

function pearsonCorrSubset(a, b, indices) {
    var sub_a = [], sub_b = [];
    var keys = Object.keys(indices);
    for (var k = 0; k < keys.length; k++) {
        var i = parseInt(keys[k]);
        if (i < a.length && i < b.length) { sub_a.push(a[i]); sub_b.push(b[i]); }
    }
    return pearsonCorr(sub_a, sub_b);
}

function computeConditionalCorr(returnsBySymbol, equitySyms, portfolioReturns) {
    var worstIdx = worstDayIndices(portfolioReturns, 0.10);
    var fullCorrs = [], stressCorrs = [];
    for (var i = 0; i < equitySyms.length; i++) {
        for (var j = i + 1; j < equitySyms.length; j++) {
            var a = returnsBySymbol[equitySyms[i]] || [];
            var b = returnsBySymbol[equitySyms[j]] || [];
            if (a.length > 5 && b.length > 5) {
                fullCorrs.push(pearsonCorr(a, b));
                stressCorrs.push(pearsonCorrSubset(a, b, worstIdx));
            }
        }
    }
    if (!fullCorrs.length) return null;
    var fp = mean(fullCorrs), sp = mean(stressCorrs);
    return { fullPeriod: fp, stressDays: sp, surge: fp !== 0 ? (sp - fp) / Math.abs(fp) * 100 : 0, n: Math.max(1, Math.floor(portfolioReturns.length * 0.10)) };
}

function rollingAvgCorr(returnsBySymbol, equitySyms, windowSize) {
    var firstSym = equitySyms[0];
    var n = firstSym ? (returnsBySymbol[firstSym] || []).length : 0;
    var result = new Array(n).fill(null);
    for (var d = windowSize - 1; d < n; d++) {
        var corrs = [];
        for (var i = 0; i < equitySyms.length; i++) {
            for (var j = i + 1; j < equitySyms.length; j++) {
                var a = (returnsBySymbol[equitySyms[i]] || []).slice(d - windowSize + 1, d + 1);
                var b = (returnsBySymbol[equitySyms[j]] || []).slice(d - windowSize + 1, d + 1);
                if (a.length >= 5) corrs.push(pearsonCorr(a, b));
            }
        }
        result[d] = corrs.length ? mean(corrs) : null;
    }
    return result;
}

function computeComponentVaR(equitySyms, returnsBySymbol, portfolioReturns, riskView, nav) {
    var mvMap = {};
    riskView.forEach(function(r) { mvMap[r.symbol] = parseFloat(r.market_value) || 0; });
    var results = [];
    equitySyms.forEach(function(sym) {
        var posRets = returnsBySymbol[sym] || [];
        var mv = mvMap[sym] || 0;
        if (posRets.length < 5 || mv === 0) return;
        var len = Math.min(posRets.length, portfolioReturns.length);
        var posAligned  = posRets.slice(posRets.length - len);
        var portAligned = portfolioReturns.slice(portfolioReturns.length - len);
        var standaloneVaR    = histVaR(posAligned, mv, 0.95);
        var corrWithPortfolio = pearsonCorr(posAligned, portAligned);
        var componentVaR     = corrWithPortfolio * standaloneVaR;
        results.push({ symbol: sym, mv: mv, standaloneVaR: standaloneVaR, corrWithPortfolio: corrWithPortfolio, componentVaR: componentVaR });
    });
    var portVaR = histVaR(portfolioReturns, nav, 0.95);
    results.forEach(function(r) { r.riskContributionPct = portVaR > 0 ? (r.componentVaR / portVaR) * 100 : 0; });
    results.sort(function(a, b) { return b.componentVaR - a.componentVaR; });
    return { positions: results, portVaR: portVaR };
}

function effectiveN(componentVarPositions, portVaR) {
    if (portVaR === 0) return 0;
    var sumSq = 0;
    componentVarPositions.forEach(function(r) { var rc = r.componentVaR / portVaR; sumSq += rc * rc; });
    return sumSq > 0 ? 1 / sumSq : 0;
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
    var navData          = d.navData || [];

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

    // ── Drawdown analytics ────────────────────────────────────────────────────
    var ddAnalytics = useMemo(function() {
        if (!drawdownSeries.values.length || !portfolioReturns.length) return null;
        var ui     = ulcerIndex(drawdownSeries.values);
        var calmar = calmarRatio(portfolioReturns, drawdownSeries.maxDD);
        var sinceHWM = 0;
        for (var i = drawdownSeries.values.length - 1; i >= 0; i--) {
            if (drawdownSeries.values[i] < 0) sinceHWM++; else break;
        }
        var currentDepth = drawdownSeries.values[drawdownSeries.values.length - 1] * 100;
        var events = navData.length ? drawdownEvents(navData) : [];
        return { ulcer: ui, calmar: calmar, currentDepth: currentDepth, sinceHWM: sinceHWM, events: events };
    }, [drawdownSeries, portfolioReturns, navData]);

    // ── Rolling 60D VaR ───────────────────────────────────────────────────────
    var rolling60VaRData = useMemo(function() {
        if (portfolioReturns.length < 60) return { dates: [], values: [] };
        var vals    = rollingWindow(portfolioReturns, 60, function(w) { return histVaR(w, nav, 0.95); });
        var ddDates = portfolioDates.slice(portfolioDates.length - portfolioReturns.length);
        return { dates: ddDates, values: vals };
    }, [portfolioReturns, portfolioDates, nav]);

    // ── Return distribution ───────────────────────────────────────────────────
    var histData = useMemo(function() {
        if (!portfolioReturns.length) return null;
        var hist   = buildHistogram(portfolioReturns, 20);
        var m = mean(portfolioReturns), s = std(portfolioReturns);
        var normalCurve = hist.bins.map(function(bin) {
            return s > 0 ? (1 / Math.sqrt(2 * Math.PI * s * s)) * Math.exp(-(bin.mid - m) * (bin.mid - m) / (2 * s * s)) * portfolioReturns.length * hist.binWidth : 0;
        });
        return {
            bins: hist.bins, binWidth: hist.binWidth, normalCurve: normalCurve,
            sk: skewness(portfolioReturns), ek: excessKurtosis(portfolioReturns),
            n: portfolioReturns.length,
            varReturn:  -histVaR(portfolioReturns, 1, 0.95),
            cvarReturn: -histCVaR(portfolioReturns, 1, 0.95),
        };
    }, [portfolioReturns]);

    // ── Chart refs ────────────────────────────────────────────────────────────
    var ddCanvasRef    = useRef(null);
    var ddChartRef     = useRef(null);
    var sharpCanvasRef = useRef(null);
    var sharpChartRef  = useRef(null);
    var scatCanvasRef  = useRef(null);
    var scatChartRef   = useRef(null);
    var varCanvasRef   = useRef(null);
    var varChartRef    = useRef(null);
    var histCanvasRef  = useRef(null);
    var histChartRef   = useRef(null);

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

    // Rolling 60D VaR chart
    useEffect(function() {
        if (!varCanvasRef.current || !rolling60VaRData.dates.length) return;
        if (varChartRef.current) { varChartRef.current.destroy(); varChartRef.current = null; }
        var portVaRNow = kpis ? kpis.var95 : 0;
        varChartRef.current = new Chart(varCanvasRef.current, {
            type: 'line',
            data: {
                labels: rolling60VaRData.dates,
                datasets: [
                    {
                        label: '60D Rolling VaR ($)', data: rolling60VaRData.values,
                        borderColor: T.red, borderWidth: 1.5, fill: true,
                        backgroundColor: 'rgba(239,68,68,0.08)', tension: 0.3,
                        pointRadius: 0, spanGaps: true,
                    },
                    {
                        label: 'Current VaR', type: 'line',
                        data: rolling60VaRData.dates.map(function() { return portVaRNow; }),
                        borderColor: 'rgba(239,68,68,0.4)', borderWidth: 1,
                        borderDash: [4, 4], pointRadius: 0, fill: false,
                    },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        titleFont: { family: T.mono, size: 10 }, bodyFont: { family: T.mono, size: 11 },
                        callbacks: { label: function(ctx) { return ctx.datasetIndex === 0 ? ' Rolling VaR: $' + (ctx.parsed.y || 0).toFixed(0) : ' Current VaR: $' + portVaRNow.toFixed(0); } },
                    },
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, maxTicksLimit: 8 }, border: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, callback: function(v) { return '$' + v.toFixed(0); } }, border: { display: false } },
                },
            },
        });
        return function() { if (varChartRef.current) { varChartRef.current.destroy(); varChartRef.current = null; } };
    }, [rolling60VaRData, kpis]);

    // Return distribution histogram
    useEffect(function() {
        if (!histCanvasRef.current || !histData || !histData.bins.length) return;
        if (histChartRef.current) { histChartRef.current.destroy(); histChartRef.current = null; }
        var varLinePlugin = {
            id: 'varLines',
            afterDraw: function(chart) {
                var ctx = chart.ctx;
                var xScale = chart.scales.x;
                if (!xScale) return;
                [[histData.varReturn, T.red, 'VaR 95%'], [histData.cvarReturn, '#ff6b6b', 'CVaR 95%']].forEach(function(item) {
                    var xPx = xScale.getPixelForValue(item[0] * 100);
                    if (isNaN(xPx)) return;
                    ctx.save();
                    ctx.strokeStyle = item[1];
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([4, 3]);
                    ctx.beginPath();
                    ctx.moveTo(xPx, chart.chartArea.top);
                    ctx.lineTo(xPx, chart.chartArea.bottom);
                    ctx.stroke();
                    ctx.fillStyle = item[1];
                    ctx.font = '9px ' + T.mono;
                    ctx.fillText(item[2], xPx + 3, chart.chartArea.top + 12);
                    ctx.restore();
                });
            },
        };
        histChartRef.current = new Chart(histCanvasRef.current, {
            type: 'bar',
            data: {
                labels: histData.bins.map(function(b) { return (b.mid * 100).toFixed(1) + '%'; }),
                datasets: [
                    {
                        type: 'bar', label: 'Daily Returns',
                        data: histData.bins.map(function(b) { return b.count; }),
                        backgroundColor: 'rgba(100,116,139,0.5)', borderColor: '#64748b', borderWidth: 1,
                    },
                    {
                        type: 'line', label: 'Normal Dist.',
                        data: histData.normalCurve, borderColor: T.amber,
                        borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.4,
                    },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    varLines: {},
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        titleFont: { family: T.mono, size: 10 }, bodyFont: { family: T.mono, size: 11 },
                    },
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: T.t3, font: { family: T.mono, size: 8 }, maxTicksLimit: 10 }, border: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 } }, border: { display: false } },
                },
            },
            plugins: [varLinePlugin],
        });
        return function() { if (histChartRef.current) { histChartRef.current.destroy(); histChartRef.current = null; } };
    }, [histData]);

    if (!kpis) return h('div', { style: card }, 'Insufficient return history (need 30+ days).');

    // Legend for scatter
    var scatLegend = h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 8 } },
        Object.keys(T.sectors).map(function(sec) {
            return h('div', { key: sec, style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.t2, fontFamily: T.mono } },
                h('span', { style: { width: 8, height: 8, background: sectorColor(sec), borderRadius: 2, display: 'inline-block', flexShrink: 0 } }),
                sec
            );
        })
    );

    return h('div', null,
        h(ModuleLabel, { label: 'Module 1 · Portfolio Risk Command Center', color: T.teal }),

        // Drawdown — full width
        h('div', { style: card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 } },
                h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1 } }, 'Underwater Drawdown — HWM Tracker'),
                h('div', { style: { fontSize: 8.5, letterSpacing: 0.8, color: T.t3, fontFamily: T.mono } },
                    drawdownSeries.maxDD ? 'Max: ' + (drawdownSeries.maxDD * 100).toFixed(1) + '% · ' + drawdownSeries.maxDDDate : ''
                )
            ),
            h('div', { style: { display: 'flex', gap: 14, marginBottom: 8, flexWrap: 'wrap' } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.t2, fontFamily: T.mono } },
                    h('span', { style: { width: 14, height: 2, background: T.red, display: 'inline-block' } }),
                    'Drawdown from HWM'
                ),
                drawdownSeries.maxDD && h('span', { style: { fontSize: 8.5, color: T.red, fontFamily: T.mono } },
                    'Max: ' + (drawdownSeries.maxDD * 100).toFixed(1) + '% (' + drawdownSeries.maxDDDate + ')'
                ),
                drawdownSeries.values.length && h('span', { style: { fontSize: 8.5, color: T.green, fontFamily: T.mono } },
                    'Current: ' + (drawdownSeries.values[drawdownSeries.values.length - 1] * 100).toFixed(1) + '%'
                )
            ),
            h(ChartCanvas, { canvasRef: ddCanvasRef, height: 150 })
        ),

        // 2-col: Rolling Sharpe | Risk/Return Scatter
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, marginBottom: 16 } },
            h('div', { style: Object.assign({}, card, { marginBottom: 0 }) },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
                    h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1 } }, 'Rolling Sharpe Ratio'),
                    h('div', { style: { fontSize: 8.5, color: T.t3, fontFamily: T.mono } }, '30D / 90D')
                ),
                h('div', { style: { display: 'flex', gap: 14, marginBottom: 8 } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.teal, fontFamily: T.mono } },
                        h('span', { style: { width: 14, height: 2, background: T.teal, display: 'inline-block' } }), '30D Sharpe'),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.gold, fontFamily: T.mono } },
                        h('span', { style: { width: 14, height: 2, borderTop: '2px dashed ' + T.gold, display: 'inline-block' } }), '90D Sharpe')
                ),
                h(ChartCanvas, { canvasRef: sharpCanvasRef, height: 140 })
            ),
            h('div', { style: Object.assign({}, card, { marginBottom: 0 }) },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
                    h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1 } }, 'Risk vs Return — Position Map'),
                    h('div', { style: { fontSize: 8.5, color: T.t3, fontFamily: T.mono } }, 'ANN. VOL (X) vs TOTAL RETURN (Y)')
                ),
                scatLegend,
                h(ChartCanvas, { canvasRef: scatCanvasRef, height: 140 })
            )
        ),

        // Drawdown Analytics card
        ddAnalytics && h('div', { style: card },
            h('div', { style: cardTitle }, 'DRAWDOWN ANALYTICS'),
            h('div', { style: { display: 'flex', gap: 0, marginBottom: 16 } },
                [
                    { label: 'Ulcer Index', value: ddAnalytics.ulcer.toFixed(1) + '%', color: T.amber, sub: 'RMS sustained pain' },
                    { label: 'Calmar Ratio', value: ddAnalytics.calmar.toFixed(2), color: ddAnalytics.calmar > 1 ? T.green : ddAnalytics.calmar > 0.5 ? T.amber : T.red, sub: ddAnalytics.calmar > 1 ? 'Strong' : ddAnalytics.calmar > 0.5 ? 'Adequate' : 'Weak' },
                    { label: 'Current Depth', value: ddAnalytics.currentDepth.toFixed(1) + '%', color: ddAnalytics.currentDepth < 0 ? T.red : T.green, sub: 'vs high water mark' },
                    { label: 'Days Since HWM', value: ddAnalytics.sinceHWM + 'd', color: ddAnalytics.sinceHWM > 30 ? T.red : ddAnalytics.sinceHWM > 10 ? T.amber : T.green, sub: 'consecutive underwater' },
                ].map(function(tile, idx) {
                    return h('div', { key: tile.label, style: { flex: 1, padding: '12px 16px', borderRight: idx < 3 ? '1px solid ' + T.border : 'none' } },
                        h('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, fontFamily: T.mono, marginBottom: 5 } }, tile.label),
                        h('div', { style: { fontSize: 20, fontWeight: 700, fontFamily: T.mono, color: tile.color } }, tile.value),
                        h('div', { style: { fontSize: 8, color: T.t2, fontFamily: T.mono, marginTop: 3 } }, tile.sub)
                    );
                })
            ),
            ddAnalytics.events.length > 0 && h('div', { style: { overflowX: 'auto' } },
                h('div', { style: { fontSize: 9, color: T.t3, fontFamily: T.mono, letterSpacing: 1, marginBottom: 8 } }, 'DRAWDOWN EVENTS'),
                h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                    h('thead', null,
                        h('tr', null,
                            ['#', 'Start', 'Trough', 'Depth', 'Duration', 'Recovered'].map(function(col, ci) {
                                return h('th', { key: col, style: Object.assign({}, th, { textAlign: ci > 2 ? 'right' : 'left' }) }, col);
                            })
                        )
                    ),
                    h('tbody', null,
                        ddAnalytics.events.map(function(ev, idx) {
                            return h('tr', { key: idx },
                                h('td', { style: Object.assign({}, td, { color: T.t3 }) }, idx + 1),
                                h('td', { style: td }, ev.start),
                                h('td', { style: td }, ev.troughDate),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: T.red }) }, (ev.depth * 100).toFixed(1) + '%'),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: T.t2 }) }, ev.duration + 'd'),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right' }) },
                                    ev.recovered
                                        ? h('span', { style: { color: T.green } }, '✓ ' + ev.recovered)
                                        : h('span', { style: { color: T.amber } }, 'Ongoing')
                                )
                            );
                        })
                    )
                )
            )
        ),

        // Rolling 60D VaR chart
        rolling60VaRData.dates.length > 0 && h('div', { style: card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
                h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1 } }, 'Rolling 60D Portfolio VaR'),
                h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.red, fontFamily: T.mono } },
                        h('span', { style: { width: 14, height: 2, background: T.red, display: 'inline-block' } }), '60D Rolling'),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.t3, fontFamily: T.mono } },
                        h('span', { style: { width: 14, height: 2, borderTop: '2px dashed rgba(239,68,68,0.5)', display: 'inline-block' } }), 'Current'),
                    h('div', { style: { fontSize: 8.5, color: T.t3, fontFamily: T.mono } }, '60-day window · 95% confidence')
                )
            ),
            h(ChartCanvas, { canvasRef: varCanvasRef, height: 160 })
        ),

        // Return distribution histogram
        histData && h('div', { style: card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 } },
                h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1 } }, 'Daily Return Distribution'),
                h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.slate, fontFamily: T.mono } },
                        h('span', { style: { width: 10, height: 10, background: 'rgba(100,116,139,0.5)', border: '1px solid #64748b', display: 'inline-block', borderRadius: 2 } }), 'Returns'),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.amber, fontFamily: T.mono } },
                        h('span', { style: { width: 14, height: 2, background: T.amber, display: 'inline-block' } }), 'Normal dist.')
                )
            ),
            h(ChartCanvas, { canvasRef: histCanvasRef, height: 180 }),
            histData.ek > 1.5 && h('div', { style: { marginTop: 8, padding: '6px 10px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 5, fontSize: 9, color: T.amber, fontFamily: T.mono } },
                '⚠ Fat tails detected (excess kurtosis ' + histData.ek.toFixed(2) + ') — historical VaR may understate tail risk'
            ),
            h('div', { style: { display: 'flex', gap: 0, marginTop: 10 } },
                [
                    { label: 'Skewness', value: (histData.sk >= 0 ? '+' : '') + histData.sk.toFixed(2), color: histData.sk < -0.5 ? T.red : T.t1, sub: histData.sk < -0.5 ? 'Negative skew' : histData.sk > 0.5 ? 'Positive skew' : 'Near-symmetric' },
                    { label: 'Excess Kurtosis', value: (histData.ek >= 0 ? '+' : '') + histData.ek.toFixed(2), color: histData.ek > 1.5 ? T.amber : T.t1, sub: histData.ek > 1.5 ? 'Fat tails' : 'Normal-ish tails' },
                    { label: 'n', value: histData.n, color: T.t2, sub: 'trading days' },
                ].map(function(tile, idx) {
                    return h('div', { key: tile.label, style: { flex: 1, padding: '8px 14px', borderRight: idx < 2 ? '1px solid ' + T.border : 'none' } },
                        h('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, fontFamily: T.mono, marginBottom: 4 } }, tile.label),
                        h('div', { style: { fontSize: 17, fontWeight: 700, fontFamily: T.mono, color: tile.color } }, tile.value),
                        h('div', { style: { fontSize: 8, color: T.t2, fontFamily: T.mono, marginTop: 2 } }, tile.sub)
                    );
                })
            )
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
    var portfolioReturns = d.portfolioReturns || [];
    var portfolioDates   = d.portfolioDates || [];

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

    // ── Conditional correlation ────────────────────────────────────────────────
    var condCorr = useMemo(function() {
        if (!equitySyms.length || !portfolioReturns.length) return null;
        return computeConditionalCorr(returnsBySymbol, equitySyms, portfolioReturns);
    }, [returnsBySymbol, equitySyms, portfolioReturns]);

    // ── Rolling 20D avg correlation ───────────────────────────────────────────
    var rollingAvgCorrData = useMemo(function() {
        if (equitySyms.length < 2) return { dates: [], values: [], baseline: 0 };
        var vals    = rollingAvgCorr(returnsBySymbol, equitySyms.slice(0, 20), 20);
        var ddDates = portfolioDates.slice(portfolioDates.length - vals.length);
        var baseline = corrStats ? corrStats.avgCorr : 0;
        return { dates: ddDates, values: vals, baseline: baseline };
    }, [returnsBySymbol, equitySyms, portfolioDates, corrStats]);

    var rolAvgCanvasRef = useRef(null);
    var rolAvgChartRef  = useRef(null);

    useEffect(function() {
        if (!rolAvgCanvasRef.current || !rollingAvgCorrData.dates.length) return;
        if (rolAvgChartRef.current) { rolAvgChartRef.current.destroy(); rolAvgChartRef.current = null; }
        var baseline = rollingAvgCorrData.baseline;
        rolAvgChartRef.current = new Chart(rolAvgCanvasRef.current, {
            type: 'line',
            data: {
                labels: rollingAvgCorrData.dates,
                datasets: [
                    {
                        label: '20D Avg Corr', data: rollingAvgCorrData.values,
                        borderColor: T.amber, borderWidth: 1.5, fill: true,
                        backgroundColor: 'rgba(245,158,11,0.06)', tension: 0.3,
                        pointRadius: 0, spanGaps: true,
                    },
                    {
                        label: 'Full-period Baseline', type: 'line',
                        data: rollingAvgCorrData.dates.map(function() { return baseline; }),
                        borderColor: 'rgba(245,158,11,0.4)', borderWidth: 1,
                        borderDash: [4, 4], pointRadius: 0, fill: false,
                    },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        titleFont: { family: T.mono, size: 10 }, bodyFont: { family: T.mono, size: 11 },
                        callbacks: { label: function(ctx) { return ctx.datasetIndex === 0 ? ' 20D Avg Corr: ' + (ctx.parsed.y || 0).toFixed(3) : ' Baseline: ' + baseline.toFixed(3); } },
                    },
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, maxTicksLimit: 8 }, border: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: T.t3, font: { family: T.mono, size: 9 }, callback: function(v) { return v.toFixed(2); } }, border: { display: false } },
                },
            },
        });
        return function() { if (rolAvgChartRef.current) { rolAvgChartRef.current.destroy(); rolAvgChartRef.current = null; } };
    }, [rollingAvgCorrData]);

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

    // ── Contextual note generator for redundancy pairs ────────────────────────
    var GOLD_MINERS = ['AU', 'GDX', 'SBSW', 'RGLD', 'HMY', 'AEM', 'NEM', 'GOLD'];
    function pairNote(symA, symB, corr) {
        var rA = riskMap[symA] || {}, rB = riskMap[symB] || {};
        var secA = rA.sector || '', secB = rB.sector || '';
        var aGold = GOLD_MINERS.indexOf(symA) >= 0, bGold = GOLD_MINERS.indexOf(symB) >= 0;
        if (aGold && bGold) return 'Gold mining pair — near-identical factor loading';
        if (secA === secB && secA) return 'Both in ' + secA + ' — correlated sector exposure';
        if (secA === 'Energy' || secB === 'Energy') return 'Energy cycle plays — correlated macro exposure';
        if ((secA === 'Technology' || secB === 'Technology') && corr > 0.70) return 'High-beta tech — correlated on risk-on/off moves';
        return secA + ' / ' + secB + ' cross-sector pair';
    }

    return h('div', null,
        h(ModuleLabel, { label: 'Module 2 · Correlation Intelligence', color: T.amber }),

        // ── Priority 1: Conditional Correlation Panel ─────────────────────────
        condCorr && h('div', { style: Object.assign({}, card, { marginBottom: 12 }) },
            h('div', { style: cardTitle }, 'CONDITIONAL CORRELATION — NORMAL DAYS vs STRESS DAYS'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 0, marginBottom: 12 } },
                h('div', { style: { flex: 1, textAlign: 'center', padding: '14px 10px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8 } },
                    h('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, fontFamily: T.mono, marginBottom: 6 } }, 'Full Period Avg Correlation'),
                    h('div', { style: { fontSize: 28, fontWeight: 700, fontFamily: T.mono, color: T.green } }, condCorr.fullPeriod.toFixed(3)),
                    h('div', { style: { fontSize: 8, color: T.t2, fontFamily: T.mono, marginTop: 4 } }, 'all trading days')
                ),
                h('div', { style: { padding: '0 16px', textAlign: 'center' } },
                    h('div', { style: { fontSize: 18, color: T.red } }, '→'),
                    h('div', { style: { fontSize: 9, fontWeight: 700, fontFamily: T.mono, color: T.red, marginTop: 2 } }, '+' + condCorr.surge.toFixed(0) + '%')
                ),
                h('div', { style: { flex: 1, textAlign: 'center', padding: '14px 10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8 } },
                    h('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, fontFamily: T.mono, marginBottom: 6 } }, 'Stress Days Avg Correlation'),
                    h('div', { style: { fontSize: 28, fontWeight: 700, fontFamily: T.mono, color: T.red } }, condCorr.stressDays.toFixed(3)),
                    h('div', { style: { fontSize: 8, color: T.t2, fontFamily: T.mono, marginTop: 4 } }, 'worst ' + condCorr.n + ' days only')
                )
            ),
            h('div', { style: { padding: '10px 14px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, fontSize: 10, color: T.t2, fontFamily: T.mono, lineHeight: 1.6 } },
                'Correlation rises from ' + condCorr.fullPeriod.toFixed(2) + ' to ' + condCorr.stressDays.toFixed(2) + ' on the portfolio\'s worst ' + condCorr.n + ' days — a ' + condCorr.surge.toFixed(0) + '% surge. The diversification benefit shown in the Decomposition tab assumes the full-period figure. On stress days it is materially smaller.'
            )
        ),

        // ── Priority 5: Rolling 20D Avg Correlation ───────────────────────────
        rollingAvgCorrData.dates.length > 0 && h('div', { style: Object.assign({}, card, { marginBottom: 12 }) },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1 } }, 'Rolling 20D Average Pairwise Correlation'),
                h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.amber, fontFamily: T.mono } },
                        h('span', { style: { width: 14, height: 2, background: T.amber, display: 'inline-block' } }), '20D Avg'),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.t3, fontFamily: T.mono } },
                        h('span', { style: { width: 14, height: 2, borderTop: '2px dashed rgba(245,158,11,0.4)', display: 'inline-block' } }), 'Baseline')
                )
            ),
            h(ChartCanvas, { canvasRef: rolAvgCanvasRef, height: 140 }),
            h('div', { style: { marginTop: 6, fontSize: 8.5, color: T.t3, fontFamily: T.mono, fontStyle: 'italic' } },
                'Rising above baseline = diversification benefit is eroding · Top 20 positions by market value'
            )
        ),

        // Stats strip — compact horizontal style
        corrStats && h('div', {
            style: {
                display: 'flex', background: T.bg, border: '1px solid ' + T.border,
                borderRadius: 8, overflow: 'hidden', marginBottom: 12,
            }
        },
            [
                { label: 'Avg Pairwise Corr.',       value: corrStats.avgCorr.toFixed(2), color: corrStats.avgCorr > 0.6 ? T.red : corrStats.avgCorr > 0.4 ? T.amber : T.green, sub: corrStats.avgCorr > 0.6 ? 'High concentration' : corrStats.avgCorr > 0.4 ? 'Moderate' : 'Well diversified' },
                { label: 'Diversification Score',    value: (corrStats.divScore * 100).toFixed(0) + ' / 100', color: corrStats.divScore > 0.6 ? T.green : corrStats.divScore > 0.4 ? T.amber : T.red, sub: '0 = crowded · 1 = pure alpha' },
                { label: 'Redundant Pairs (>0.80)',  value: corrStats.redundant.length + ' pairs', color: corrStats.redundant.length > 3 ? T.red : corrStats.redundant.length > 1 ? T.amber : T.green, sub: corrStats.redundant.length > 0 ? 'All in ' + ((riskMap[corrStats.redundant[0].symA] || {}).sector || 'same') + ' cluster' : 'No redundancy detected' },
                { label: 'Auto-Detected Cluster',    value: corrStats.clusters.length > 0 ? '⚠ ' + corrStats.clusters[0].symbols.slice(0, 2).join('/') + '…' : 'None', color: corrStats.clusters.length > 0 ? T.red : T.green, sub: corrStats.clusters.length > 0 ? corrStats.clusters[0].symbols.length + ' pos · effectively one factor bet' : 'No clusters detected' },
            ].map(function(item, idx) {
                return h('div', {
                    key: item.label,
                    style: { flex: 1, padding: '10px 14px', borderRight: idx < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }
                },
                    h('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, marginBottom: 3, fontFamily: T.mono } }, item.label),
                    h('div', { style: { fontSize: 13, fontWeight: 500, fontFamily: T.mono, color: item.color } }, item.value),
                    h('div', { style: { fontSize: 8, color: T.t2, marginTop: 1, fontFamily: T.mono } }, item.sub)
                );
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

        // Redundancy pairs + matrix in 2-col layout matching mockup
        corrStats && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1.8fr', gap: 13, marginBottom: 16 } },
            // Redundancy flags column
            h('div', { style: Object.assign({}, card, { marginBottom: 0 }) },
                h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1, marginBottom: 3 } }, 'Redundancy Alerts'),
                h('div', { style: { fontSize: 8.5, letterSpacing: 0.8, color: T.t3, fontFamily: T.mono, marginBottom: 11 } }, 'PAIRS CORR > 0.70'),
                corrStats.redundant.length === 0
                    ? h('div', { style: { color: T.t3, fontSize: 11, fontFamily: T.mono } }, 'No redundant pairs detected.')
                    : h('div', null,
                        corrStats.redundant.map(function(p, idx) {
                            var c = p.corr >= 0.80 ? T.red : T.amber;
                            var note = pairNote(p.symA, p.symB, p.corr);
                            return h('div', {
                                key: idx,
                                style: {
                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                    padding: '7px 9px', marginBottom: 6,
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid ' + c + '44', borderRadius: 5,
                                }
                            },
                                h('div', { style: { flexShrink: 0 } },
                                    h('div', { style: { fontSize: 9.5, fontWeight: 700, color: c, fontFamily: T.mono } }, p.corr.toFixed(2))
                                ),
                                h('div', null,
                                    h('div', { style: { fontSize: 9.5, fontWeight: 600, color: T.t1, marginBottom: 2, fontFamily: T.mono } }, p.symA + ' ↔ ' + p.symB),
                                    h('div', { style: { fontSize: 8.5, color: T.t2, lineHeight: 1.4, fontFamily: T.mono } }, note)
                                )
                            );
                        })
                    )
            ),

            // Correlation matrix column
            h('div', { style: Object.assign({}, card, { marginBottom: 0, overflow: 'hidden' }) },
                h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1, marginBottom: 3 } }, 'Pairwise Correlation Matrix'),
                h('div', { style: { fontSize: 8.5, letterSpacing: 0.8, color: T.t3, fontFamily: T.mono, marginBottom: 10 } }, 'TOP 12 BY MARKET VALUE · PEARSON 90D'),
        h('div', { style: { overflowX: 'auto', overflowY: 'auto', maxHeight: 400 } },
            h('table', { style: { borderCollapse: 'collapse', fontSize: 8, fontFamily: T.mono } },
                h('thead', null,
                    h('tr', null,
                        h('th', { style: Object.assign({}, th, { width: 60, minWidth: 60, position: 'sticky', left: 0, background: '#07091a', zIndex: 2, fontSize: 7.5 }) }, ''),
                        matrixSyms.map(function(sym) {
                            return h('th', {
                                key: sym,
                                style: Object.assign({}, th, {
                                    textAlign: 'center', minWidth: 30, width: 30, writingMode: 'vertical-lr',
                                    transform: 'rotate(180deg)', height: 60, paddingBottom: 6, fontSize: 7.5,
                                    color: sectorColor((riskMap[sym] || {}).sector),
                                })
                            }, sym);
                        })
                    )
                ),
                h('tbody', null,
                    matrixSyms.map(function(symA, i) {
                        return h('tr', { key: symA },
                            h('td', { style: Object.assign({}, td, { fontWeight: 600, position: 'sticky', left: 0, background: '#07091a', zIndex: 1, minWidth: 60, fontSize: 7.5 }) },
                                symLabel(symA)
                            ),
                            matrixSyms.map(function(symB, j) {
                                var v = corrMatrix[i] ? corrMatrix[i][j] : 0;
                                var isDiag = i === j;
                                return h('td', {
                                    key: symB,
                                    style: {
                                        background:   cellBg(v, isDiag),
                                        textAlign:    'center',
                                        padding:      '3px 1px',
                                        fontSize:     7.5,
                                        fontFamily:   T.mono,
                                        color:        isDiag ? T.teal : v > 0.55 ? T.t1 : T.t2,
                                        fontWeight:   v > 0.70 || isDiag ? 700 : 400,
                                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                                        minWidth:     30,
                                        border:       '1px solid rgba(255,255,255,0.03)',
                                        borderRadius: 2,
                                    }
                                }, isDiag ? '—' : v.toFixed(2));
                            })
                        );
                    })
                )
            )
        )
            ) // end matrix card
        ) // end 2-col grid
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

    // ── Component VaR ─────────────────────────────────────────────────────────
    var componentVarResult = useMemo(function() {
        if (!equitySyms.length || !portfolioReturns.length) return null;
        return computeComponentVaR(equitySyms, returnsBySymbol, portfolioReturns, riskView, nav);
    }, [equitySyms, returnsBySymbol, portfolioReturns, riskView, nav]);

    var effN = useMemo(function() {
        if (!componentVarResult) return 0;
        return effectiveN(componentVarResult.positions, componentVarResult.portVaR);
    }, [componentVarResult]);

    // Build lookup map for component VaR by symbol
    var compVarMap = useMemo(function() {
        var m = {};
        if (componentVarResult) componentVarResult.positions.forEach(function(r) { m[r.symbol] = r; });
        return m;
    }, [componentVarResult]);

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
    var compVarCanvasRef = useRef(null);
    var compVarChartRef  = useRef(null);
    var sectorCanvasRef = useRef(null);
    var sectorChartRef  = useRef(null);
    var wvCanvasRef     = useRef(null);
    var wvChartRef      = useRef(null);

    // Component VaR horizontal bar (signed)
    useEffect(function() {
        if (!compVarCanvasRef.current || !componentVarResult || !componentVarResult.positions.length) return;
        if (compVarChartRef.current) { compVarChartRef.current.destroy(); compVarChartRef.current = null; }
        var top15 = componentVarResult.positions.slice(0, 15);
        var barColors  = top15.map(function(r) { return r.componentVaR >= 0 ? 'rgba(239,68,68,0.45)' : 'rgba(34,197,94,0.45)'; });
        var borderColors = top15.map(function(r) { return r.componentVaR >= 0 ? '#ef4444' : '#22c55e'; });
        compVarChartRef.current = new Chart(compVarCanvasRef.current, {
            type: 'bar',
            data: {
                labels: top15.map(function(r) { return r.symbol; }),
                datasets: [{
                    data: top15.map(function(r) { return r.componentVaR; }),
                    backgroundColor: barColors, borderColor: borderColors, borderWidth: 1.5, borderRadius: 4,
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
                        titleFont: { family: T.mono, size: 10 }, bodyFont: { family: T.mono, size: 11 },
                        callbacks: {
                            label: function(ctx) {
                                var v = ctx.parsed.x;
                                return v >= 0 ? ' Risk contributor: +$' + v.toFixed(0) : ' Risk reducer: −$' + Math.abs(v).toFixed(0);
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: T.t3, font: { family: T.mono, size: 9 }, callback: function(v) { return (v >= 0 ? '$' : '−$') + Math.abs(v).toFixed(0); } },
                        border: { display: false },
                    },
                    y: { grid: { display: false }, ticks: { color: T.t1, font: { family: T.mono, size: 9 } }, border: { display: false } },
                },
            },
        });
        return function() { if (compVarChartRef.current) { compVarChartRef.current.destroy(); compVarChartRef.current = null; } };
    }, [componentVarResult]);

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
        h(ModuleLabel, { label: 'Module 3 · Risk Decomposition', color: T.blue }),

        // Component VaR + Effective N
        componentVarResult && h('div', { style: card },
            h('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 0 } },
                // Component VaR bar chart
                h('div', null,
                    h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1, marginBottom: 3 } }, 'Component VaR — Signed Risk Contributions'),
                    h('div', { style: { fontSize: 8.5, color: T.t2, fontFamily: T.mono, marginBottom: 8 } },
                        'Green bars = risk reducers (negative component VaR). Sum ≈ Portfolio VaR.'
                    ),
                    h(ChartCanvas, { canvasRef: compVarCanvasRef, height: 240 }),
                    // Validation line
                    h('div', { style: { marginTop: 6, fontSize: 8.5, color: T.t3, fontFamily: T.mono } },
                        (function() {
                            var sumComp = componentVarResult.positions.reduce(function(s, r) { return s + r.componentVaR; }, 0);
                            var delta   = componentVarResult.portVaR > 0 ? Math.abs((sumComp - componentVarResult.portVaR) / componentVarResult.portVaR) * 100 : 0;
                            return 'Sum of component VaRs: $' + sumComp.toFixed(0) + ' · Portfolio VaR: $' + componentVarResult.portVaR.toFixed(0) + ' · Δ: ' + delta.toFixed(1) + '%' + (delta > 10 ? ' ⚠ alignment issue' : '');
                        })()
                    )
                ),
                // Effective N + Diversifiers
                h('div', null,
                    h('div', {
                        style: Object.assign({}, { padding: '16px', background: 'rgba(0,212,184,0.04)', border: '1px solid rgba(0,212,184,0.25)', borderRadius: 8, marginBottom: 12 })
                    },
                        h('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, fontFamily: T.mono, marginBottom: 6 } }, 'Effective N'),
                        h('div', { style: { fontSize: 36, fontWeight: 700, fontFamily: T.mono, color: T.teal } }, Math.round(effN)),
                        h('div', { style: { fontSize: 9, color: T.t2, fontFamily: T.mono, marginTop: 4 } },
                            'of ' + componentVarResult.positions.length + ' positions'
                        ),
                        h('div', { style: { fontSize: 8, color: T.t3, fontFamily: T.mono, marginTop: 8, lineHeight: 1.5 } },
                            '1/Σ(rc²) where rc = component VaR ÷ portfolio VaR. You have ' + componentVarResult.positions.length + ' line items but ' + Math.round(effN) + ' independent risk bets.'
                        )
                    ),
                    h('div', { style: { fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: T.t3, fontFamily: T.mono, marginBottom: 8 } }, 'True Diversifiers'),
                    h('div', null,
                        componentVarResult.positions.filter(function(r) { return r.componentVaR < 0; }).slice(0, 3).map(function(r, idx) {
                            return h('div', {
                                key: r.symbol,
                                style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', marginBottom: 5, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 5 }
                            },
                                h('div', null,
                                    h('div', { style: { fontSize: 10, fontWeight: 700, fontFamily: T.mono, color: T.green } }, r.symbol),
                                    h('div', { style: { fontSize: 8, color: T.t3, fontFamily: T.mono } }, 'ρ=' + r.corrWithPortfolio.toFixed(2))
                                ),
                                h('div', { style: { fontSize: 9, fontFamily: T.mono, color: T.green } }, '−$' + Math.abs(r.componentVaR).toFixed(0))
                            );
                        })
                    )
                )
            )
        ),

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
                            h('th', { style: Object.assign({}, th, { textAlign: 'right', color: T.teal }) }, 'ρ (port)'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right', color: T.teal }) }, 'Component VaR'),
                            h('th', { style: Object.assign({}, th, { textAlign: 'right' }) }, 'Weight')
                        )
                    ),
                    h('tbody', null,
                        equityRisk.map(function(r, idx) {
                            var mv   = marginalVaR[r.symbol];
                            var cv   = compVarMap[r.symbol];
                            var tier = r.risk_tier || '';
                            var tc   = tier === 'High Risk' ? T.red : tier === 'Moderate Risk' ? T.amber : T.green;
                            var rhoColor = cv ? (cv.corrWithPortfolio < 0 ? T.green : cv.corrWithPortfolio < 0.4 ? T.t3 : cv.corrWithPortfolio < 0.7 ? T.amber : T.red) : T.t3;
                            var cvColor  = cv ? (cv.componentVaR < 0 ? T.green : T.t1) : T.t3;
                            return h('tr', { key: r.symbol + idx },
                                h('td', { style: Object.assign({}, td, { color: T.teal, fontWeight: 600 }) }, r.symbol),
                                h('td', { style: Object.assign({}, td, { color: T.t2 }) }, r.sector || '—'),
                                h('td', { style: Object.assign({}, td, { color: tc, fontSize: 9 }) }, tier.replace(' Risk', '')),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right' }) }, (Number(r.annual_vol) * 100).toFixed(1) + '%'),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: T.red }) }, '$' + Number(r.dollar_var_95_daily).toFixed(0)),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: mv != null ? (mv > 0 ? T.amber : T.green) : T.t3 }) },
                                    mv != null ? (mv >= 0 ? '+' : '') + '$' + Math.abs(mv).toFixed(0) : '—'
                                ),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: rhoColor }) },
                                    cv ? cv.corrWithPortfolio.toFixed(2) : '—'
                                ),
                                h('td', { style: Object.assign({}, td, { textAlign: 'right', color: cvColor, background: cv && cv.componentVaR < 0 ? 'rgba(34,197,94,0.06)' : 'transparent' }) },
                                    cv ? (cv.componentVaR >= 0 ? '+$' : '−$') + Math.abs(cv.componentVaR).toFixed(0) : '—'
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

// ── Module section label (coloured left bar + uppercase label) ─────────────────
function ModuleLabel(props) {
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 } },
        h('div', { style: { width: 3, height: 14, borderRadius: 2, background: props.color || T.teal, flexShrink: 0 } }),
        h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', color: T.t2, fontFamily: T.mono } }, props.label)
    );
}

// ── Compact horizontal KPI strip (always visible above tabs) ──────────────────
function HeaderKpiStrip(props) {
    var kpis = props.kpis;
    if (!kpis) return null;
    var fD = function(v) {
        var abs = Math.abs(v);
        return (v < 0 ? '−' : '+') + '$' + (abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : abs.toFixed(0));
    };
    var items = [
        { label: 'Portfolio VaR 95% 1D',    value: fD(-kpis.var95),  color: T.red,   sub: 'Historical simulation' },
        { label: 'CVaR 95% 1D',             value: fD(-kpis.cvar95), color: T.red,   sub: 'Expected shortfall' },
        { label: 'Portfolio Vol',            value: (kpis.annVol * 100).toFixed(1) + '% ann.', color: T.amber, sub: 'Weighted blended' },
        { label: 'Diversification Benefit',  value: '+$' + Math.abs(kpis.benefit).toFixed(0) + '/day', color: T.green, sub: '$' + kpis.sumIndivVaR.toFixed(0) + ' sum − $' + kpis.var95.toFixed(0) + ' port.' },
        { label: 'Vol Regime',               value: kpis.regime, color: kpis.regimeColor, sub: '30D: ' + (kpis.vol30 * 100).toFixed(1) + '% · 90D: ' + (kpis.vol90 * 100).toFixed(1) + '%' },
    ];
    return h('div', {
        style: {
            display: 'flex', borderBottom: '1px solid ' + T.border,
            background: 'rgba(5,7,15,0.6)', marginBottom: 0,
        }
    },
        items.map(function(item, idx) {
            return h('div', {
                key: item.label,
                style: {
                    flex: 1, padding: '8px 14px 8px ' + (idx === 0 ? '20px' : '12px'),
                    borderRight: idx < items.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }
            },
                h('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, marginBottom: 3, fontFamily: T.mono } }, item.label),
                h('div', { style: { fontSize: 13, fontWeight: 500, fontFamily: T.mono, color: item.color } }, item.value),
                h('div', { style: { fontSize: 8, color: T.t2, marginTop: 1, fontFamily: T.mono } }, item.sub)
            );
        })
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

    // Compute header KPIs from loaded data (shown above all tabs)
    var headerKpis = useMemo(function() {
        if (!data || !data.portfolioReturns || !data.portfolioReturns.length) return null;
        var pr  = data.portfolioReturns;
        var nav = data.nav;
        var rv  = data.riskView || [];
        var var95  = histVaR(pr, nav, 0.95);
        var cvar95 = histCVaR(pr, nav, 0.95);
        var annVol = std(pr) * Math.sqrt(252);
        var sumIndivVaR = rv.reduce(function(s, r) { return s + (Number(r.dollar_var_95_daily) || 0); }, 0);
        var benefit = sumIndivVaR - var95;
        var vol30   = std(pr.slice(-30))  * Math.sqrt(252);
        var vol90   = std(pr.slice(-90))  * Math.sqrt(252);
        var regime  = vol30 > vol90 * 1.2 ? 'ELEVATED' : vol30 < vol90 * 0.8 ? 'COMPRESSED' : 'NORMAL';
        var regimeColor = regime === 'ELEVATED' ? T.red : regime === 'COMPRESSED' ? T.green : T.amber;
        return { var95, cvar95, annVol, sumIndivVaR, benefit, regime, regimeColor, vol30, vol90 };
    }, [data]);

    var TABS = [
        { id: 'command', label: 'COMMAND CENTER', sub: 'VaR · Drawdown · Scatter' },
        { id: 'corr',    label: 'CORRELATION',    sub: 'Matrix · Clusters',         badge: 'NEW', badgeColor: T.teal },
        { id: 'decomp',  label: 'DECOMPOSITION',  sub: 'Marginal VaR · Attribution', badge: 'NEW', badgeColor: T.teal },
        { id: 'stress',  label: 'STRESS ENGINE',  sub: 'Regime Replay · Shocks',     badge: 'SIG', badgeColor: T.amber },
        { id: 'greeks',  label: 'GREEKS',         sub: 'Δ Γ Θ ν · Options',          badge: 'SIG', badgeColor: T.purple },
    ];

    var tabBar = h('div', {
        style: {
            display: 'flex', gap: 0, marginBottom: 20,
            background: 'rgba(255,255,255,0.015)',
            borderBottom: '1px solid ' + T.border, overflowX: 'auto',
        }
    },
        TABS.map(function(t) {
            var active = t.id === tab;
            return h('button', {
                key: t.id,
                onClick: function() { setTab(t.id); },
                style: {
                    padding: '9px 15px', border: 'none', background: 'transparent', cursor: 'pointer',
                    borderBottom: '2px solid ' + (active ? T.teal : 'transparent'),
                    display: 'flex', alignItems: 'center', gap: 5,
                    transition: 'all 0.12s', marginBottom: -1, flexShrink: 0,
                },
            },
                h('span', {
                    style: { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontFamily: T.mono, color: active ? T.teal : T.t2 }
                }, t.label),
                t.badge && h('span', {
                    style: {
                        fontSize: 7.5, padding: '1px 5px', borderRadius: 8, fontFamily: T.mono, fontWeight: 700,
                        background: t.badgeColor + '28', color: t.badgeColor, letterSpacing: 0.5,
                    }
                }, t.badge)
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
        // Title row
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, padding: '16px 20px 0' } },
            h('div', { style: { fontSize: 15, fontWeight: 700, color: T.t1, fontFamily: T.mono } }, 'Risk Analysis'),
            h('div', { style: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: T.t3, fontFamily: T.mono } }, 'v2.0 · Five-Module Architecture')
        ),
        // Always-visible KPI strip
        h(HeaderKpiStrip, { kpis: headerKpis }),
        // Tab bar + content
        h('div', { style: { padding: '0 20px' } },
            h('div', { style: { marginTop: 0 } }, tabBar),
            content
        )
    );
}
