import React from 'react';
import { Chart, registerables } from 'chart.js';
import { useChart } from './utils.js';

Chart.register(...registerables);

var useState  = React.useState;
var useEffect = React.useEffect;
var useRef    = React.useRef;
var useMemo   = React.useMemo;
var h         = React.createElement;

var mono = "'JetBrains Mono', ui-monospace, monospace";
var T = {
    teal: '#00d4b8', green: '#22c55e', red: '#ef4444',
    amber: '#f59e0b', blue: '#3b82f6', slate: '#64748b',
    t1: 'rgba(255,255,255,0.88)', t2: 'rgba(255,255,255,0.5)',
    t3: 'rgba(255,255,255,0.25)', border: 'rgba(255,255,255,0.08)',
    bg: 'rgba(255,255,255,0.025)',
};

var card = { background: T.bg, border: '1px solid ' + T.border, borderRadius: 10, padding: '16px 18px', marginBottom: 14 };

// ── Technical computation ──────────────────────────────────────────────────────
function computeTechnicals(series) {
    if (!series || series.length < 30) return null;
    var closes = series.map(function(d) { return parseFloat(d['4. close'] || d.close); });
    var n = closes.length;

    function sma(prices, period) {
        return prices.map(function(_, i) {
            if (i < period - 1) return null;
            var s = 0;
            for (var j = i - period + 1; j <= i; j++) s += prices[j];
            return s / period;
        });
    }

    function ema(prices, period) {
        var k = 2 / (period + 1);
        var result = new Array(prices.length).fill(null);
        var start = period - 1;
        if (start >= prices.length) return result;
        var sum = 0;
        for (var i = 0; i < period; i++) sum += prices[i];
        result[start] = sum / period;
        for (var i = start + 1; i < prices.length; i++) {
            result[i] = prices[i] * k + result[i - 1] * (1 - k);
        }
        return result;
    }

    function calcRSI(prices, period) {
        var rsi = new Array(prices.length).fill(null);
        if (prices.length < period + 1) return rsi;
        var gains = 0, losses = 0;
        for (var i = 1; i <= period; i++) {
            var ch = prices[i] - prices[i - 1];
            if (ch > 0) gains += ch; else losses -= ch;
        }
        var avgGain = gains / period, avgLoss = losses / period;
        rsi[period] = 100 - 100 / (1 + avgGain / (avgLoss || 0.0001));
        for (var i = period + 1; i < prices.length; i++) {
            var ch = prices[i] - prices[i - 1];
            avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period;
            rsi[i] = 100 - 100 / (1 + avgGain / (avgLoss || 0.0001));
        }
        return rsi;
    }

    var rsi14   = calcRSI(closes, 14);
    var ema12   = ema(closes, 12);
    var ema26   = ema(closes, 26);
    var macdRaw = ema12.map(function(v, i) { return v !== null && ema26[i] !== null ? v - ema26[i] : null; });

    // Signal line: EMA-9 of MACD — compute on valid slice then re-align
    var macdValid = macdRaw.filter(function(v) { return v !== null; });
    var signalRaw = ema(macdValid, 9);
    // Re-align signal to full-length array
    var firstValid = macdRaw.indexOf(macdRaw.find(function(v) { return v !== null; }));
    var signalFull = new Array(closes.length).fill(null);
    signalRaw.forEach(function(v, i) { signalFull[firstValid + i] = v; });

    var histogram = macdRaw.map(function(v, i) { return v !== null && signalFull[i] !== null ? v - signalFull[i] : null; });

    var sma50  = sma(closes, 50);
    var sma200 = sma(closes, 200);

    var currentPrice = closes[n - 1];
    var currentRSI   = rsi14[n - 1];
    var current50    = sma50[n - 1];
    var current200   = sma200[n - 1];

    var window252 = closes.slice(Math.max(0, n - 252));
    var high52 = Math.max.apply(null, window252);
    var low52  = Math.min.apply(null, window252);
    var pct52  = high52 > low52 ? (currentPrice - low52) / (high52 - low52) * 100 : 50;

    // Detect last 200DMA upward crossover
    var crossover200 = null;
    for (var i = 1; i < n; i++) {
        if (sma200[i] !== null && sma200[i - 1] !== null && closes[i - 1] < sma200[i - 1] && closes[i] >= sma200[i]) {
            crossover200 = series[i].date || ('Day ' + i);
        }
    }

    var dates = series.map(function(d) { return d.date; });

    return {
        rsi14: rsi14, macdLine: macdRaw, signalLine: signalFull, histogram: histogram,
        sma50: sma50, sma200: sma200, closes: closes, dates: dates,
        currentRSI: currentRSI, current50: current50, current200: current200,
        currentPrice: currentPrice, pct52: pct52, high52: high52, low52: low52,
        crossover200: crossover200,
    };
}

// ── Signal tile ────────────────────────────────────────────────────────────────
function SignalTile(props) {
    return h('div', { style: Object.assign({}, card, { marginBottom: 0, textAlign: 'center', minWidth: 0 }) },
        h('div', { style: { fontSize: 8.5, letterSpacing: 1.3, textTransform: 'uppercase', color: T.t3, fontFamily: mono, marginBottom: 6 } }, props.label),
        h('div', { style: { fontSize: 22, fontWeight: 700, fontFamily: mono, color: props.color || T.t1 } }, props.value),
        props.sub && h('div', { style: { fontSize: 9, color: props.subColor || T.t2, fontFamily: mono, marginTop: 4 } }, props.sub)
    );
}

// ── RSI Chart ─────────────────────────────────────────────────────────────────
function RSIChart(props) {
    var tech  = props.tech;
    var ref   = useRef(null);
    var chartRef = useRef(null);

    useEffect(function() {
        if (!ref.current || !tech) return;
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

        var window90 = 90;
        var n = tech.dates.length;
        var labels = tech.dates.slice(Math.max(0, n - window90));
        var data   = tech.rsi14.slice(Math.max(0, n - window90));

        chartRef.current = new Chart(ref.current, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    data: data, borderColor: T.teal, borderWidth: 1.5,
                    fill: false, tension: 0.3, pointRadius: 0, spanGaps: true,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: T.border, borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        titleFont: { family: mono, size: 10 }, bodyFont: { family: mono, size: 11 },
                        callbacks: { label: function(ctx) { return ' RSI-14: ' + (ctx.parsed.y || 0).toFixed(1); } },
                    },
                    annotation: {},
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: T.t3, font: { family: mono, size: 9 }, maxTicksLimit: 8 }, border: { display: false } },
                    y: {
                        min: 0, max: 100,
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        ticks: { color: T.t3, font: { family: mono, size: 9 }, callback: function(v) { return v; } },
                        border: { display: false },
                    },
                },
            },
            plugins: [{
                id: 'rsiZones',
                afterDraw: function(chart) {
                    var ctx = chart.ctx;
                    var yScale = chart.scales.y;
                    var area = chart.chartArea;
                    var y70 = yScale.getPixelForValue(70);
                    var y30 = yScale.getPixelForValue(30);
                    ctx.save();
                    ctx.strokeStyle = 'rgba(239,68,68,0.5)';
                    ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
                    ctx.beginPath(); ctx.moveTo(area.left, y70); ctx.lineTo(area.right, y70); ctx.stroke();
                    ctx.strokeStyle = 'rgba(34,197,94,0.5)';
                    ctx.beginPath(); ctx.moveTo(area.left, y30); ctx.lineTo(area.right, y30); ctx.stroke();
                    ctx.fillStyle = 'rgba(239,68,68,0.4)'; ctx.font = '9px ' + mono;
                    ctx.fillText('70 Overbought', area.left + 4, y70 - 4);
                    ctx.fillStyle = 'rgba(34,197,94,0.4)';
                    ctx.fillText('30 Oversold', area.left + 4, y30 + 12);
                    ctx.restore();
                },
            }],
        });
        return function() { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    }, [tech]);

    return h('div', { style: { height: 180, width: '100%', position: 'relative' } }, h('canvas', { ref: ref }));
}

// ── MACD Chart ────────────────────────────────────────────────────────────────
function MACDChart(props) {
    var tech = props.tech;
    var ref  = useRef(null);
    var chartRef = useRef(null);

    useEffect(function() {
        if (!ref.current || !tech) return;
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

        var window90 = 90;
        var n = tech.dates.length;
        var labels = tech.dates.slice(Math.max(0, n - window90));
        var macd   = tech.macdLine.slice(Math.max(0, n - window90));
        var signal = tech.signalLine.slice(Math.max(0, n - window90));
        var hist   = tech.histogram.slice(Math.max(0, n - window90));

        chartRef.current = new Chart(ref.current, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'bar', label: 'Histogram', data: hist,
                        backgroundColor: hist.map(function(v) { return v !== null && v >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'; }),
                        borderColor: hist.map(function(v) { return v !== null && v >= 0 ? '#22c55e' : '#ef4444'; }),
                        borderWidth: 1, borderRadius: 2,
                    },
                    {
                        type: 'line', label: 'MACD', data: macd,
                        borderColor: T.teal, borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.2, spanGaps: true,
                    },
                    {
                        type: 'line', label: 'Signal', data: signal,
                        borderColor: T.amber, borderWidth: 1.5, borderDash: [3, 2], pointRadius: 0, fill: false, tension: 0.2, spanGaps: true,
                    },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: T.border, borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        titleFont: { family: mono, size: 10 }, bodyFont: { family: mono, size: 11 },
                    },
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: T.t3, font: { family: mono, size: 9 }, maxTicksLimit: 8 }, border: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: T.t3, font: { family: mono, size: 9 } }, border: { display: false } },
                },
            },
        });
        return function() { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    }, [tech]);

    return h('div', { style: { height: 160, width: '100%', position: 'relative' } }, h('canvas', { ref: ref }));
}

// ── Main export ────────────────────────────────────────────────────────────────
export function TechnicalsTab(props) {
    var series  = props.series || [];
    var overview = props.overview || {};

    var tech = useMemo(function() {
        return computeTechnicals(series);
    }, [series]);

    if (!tech) {
        return h('div', { style: card }, h('div', { style: { color: T.t2, textAlign: 'center', padding: 24 } }, 'Need at least 30 days of price history to compute technical indicators.'));
    }

    // Override with AV overview fields where available (more precise)
    var cur50  = parseFloat(overview['50DayMovingAverage'])  || tech.current50  || 0;
    var cur200 = parseFloat(overview['200DayMovingAverage']) || tech.current200 || 0;
    var price  = tech.currentPrice;
    var rsi    = tech.currentRSI;

    var rsiColor  = rsi >= 70 ? T.amber : rsi <= 30 ? T.red : T.green;
    var rsiLabel  = rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral';
    var vs50color = price > cur50  ? T.green : T.red;
    var vs200color = price > cur200 ? T.green : T.red;
    var vs50pct   = cur50  > 0 ? ((price / cur50  - 1) * 100) : 0;
    var vs200pct  = cur200 > 0 ? ((price / cur200 - 1) * 100) : 0;

    var trend = price > cur200 ? 'confirmed uptrend (above 200DMA)' : 'below 200DMA — trend concern';
    var insight = 'RSI at ' + (rsi || 0).toFixed(1) + ' — ' + rsiLabel.toLowerCase() + '. Price is in a ' + trend + '.';
    if (tech.crossover200) insight += ' 200DMA crossover confirmed on ' + tech.crossover200 + '.';

    return h('div', null,
        // Signal tiles
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 } },
            h(SignalTile, { label: 'RSI-14', value: rsi != null ? rsi.toFixed(1) : '—', color: rsiColor, sub: rsiLabel }),
            h(SignalTile, {
                label: 'vs 50DMA',
                value: cur50 > 0 ? (vs50pct >= 0 ? '+' : '') + vs50pct.toFixed(1) + '%' : '—',
                color: vs50color,
                sub: cur50 > 0 ? '$' + cur50.toFixed(2) : 'N/A',
            }),
            h(SignalTile, {
                label: 'vs 200DMA',
                value: cur200 > 0 ? (vs200pct >= 0 ? '+' : '') + vs200pct.toFixed(1) + '%' : '—',
                color: vs200color,
                sub: cur200 > 0 ? '$' + cur200.toFixed(2) : 'N/A',
            }),
            h(SignalTile, {
                label: '52W Position',
                value: tech.pct52.toFixed(0) + 'th %ile',
                color: tech.pct52 > 80 ? T.amber : tech.pct52 > 40 ? T.teal : T.green,
                sub: '$' + tech.low52.toFixed(0) + ' – $' + tech.high52.toFixed(0),
            })
        ),

        // Insight banner
        h('div', { style: { padding: '10px 14px', background: 'rgba(0,212,184,0.05)', border: '1px solid rgba(0,212,184,0.2)', borderLeft: '3px solid ' + T.teal, borderRadius: '0 8px 8px 0', marginBottom: 14, fontSize: 11, color: T.t2, fontFamily: mono, lineHeight: 1.6 } }, insight),

        // RSI chart
        h('div', { style: card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1 } }, 'RSI-14 — Relative Strength Index'),
                h('div', { style: { display: 'flex', gap: 12 } },
                    h('div', { style: { fontSize: 8.5, color: 'rgba(239,68,68,0.7)', fontFamily: mono } }, '── 70 Overbought'),
                    h('div', { style: { fontSize: 8.5, color: 'rgba(34,197,94,0.7)', fontFamily: mono } }, '── 30 Oversold')
                )
            ),
            h(RSIChart, { tech: tech })
        ),

        // MACD chart
        h('div', { style: card },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                h('div', { style: { fontSize: 11, fontWeight: 600, color: T.t1 } }, 'MACD (12, 26, 9)'),
                h('div', { style: { display: 'flex', gap: 14 } },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.teal, fontFamily: mono } },
                        h('span', { style: { width: 12, height: 2, background: T.teal, display: 'inline-block' } }), 'MACD'),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 8.5, color: T.amber, fontFamily: mono } },
                        h('span', { style: { width: 12, height: 2, borderTop: '2px dashed ' + T.amber, display: 'inline-block' } }), 'Signal'),
                    h('div', { style: { fontSize: 8.5, color: T.t3, fontFamily: mono } }, 'Histogram: green=bullish · red=bearish')
                )
            ),
            h(MACDChart, { tech: tech })
        )
    );
}
