import * as LightweightCharts from 'lightweight-charts';
import Plotly from 'plotly.js-dist-min';
import Chart from 'chart.js/auto';
import React from 'react';
// ============================================================
// ATLAS Terminal — Advanced Charting Module
// ------------------------------------------------------------
// Portfolio equity curve vs real comparison assets.
//
// Data sources:
//   Portfolio  — vw_portfolio_nav_daily (real, passed as prop)
//   All others — price_history via Supabase (fetched on-demand)
//
// Depends on: Plotly (CDN global), React (CDN global), sb (config)
// ============================================================

import { sb } from './config.js';

var h           = React.createElement;
var useState    = React.useState;
var useEffect   = React.useEffect;
var useRef      = React.useRef;

// ── Constants ─────────────────────────────────────────────────────────────────

var SERIES_PALETTE = [
    '#00d4ff', // cyan      — portfolio / primary
    '#f59e0b', // gold
    '#8b5cf6', // violet
    '#06b6d4', // teal
    '#f43f5e', // rose
    '#10b981', // emerald
    '#fb923c', // orange
    '#a78bfa', // lavender
    '#fbbf24', // amber
    '#34d399', // mint
];

var TIMEFRAMES = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'];
var MAX_SERIES  = 8;

// ── Data helpers ──────────────────────────────────────────────────────────────

function navToOHLC(navSeries) {
    // Portfolio NAV has no intraday data — close = nav for all OHLC fields
    return navSeries
        .slice()
        .sort(function(a, b) { return new Date(a.price_date) - new Date(b.price_date); })
        .map(function(d) {
            var v = parseFloat(d.nav);
            return { date: d.price_date, open: v, high: v, low: v, close: v, volume: 0 };
        });
}

function priceRowToOHLC(d) {
    return {
        date:   d.price_date,
        open:   parseFloat(d.open)                        || 0,
        high:   parseFloat(d.high)                        || 0,
        low:    parseFloat(d.low)                         || 0,
        close:  parseFloat(d.close || d.adjusted_close)   || 0,
        volume: parseInt(d.volume)                        || 0,
    };
}

function sliceByTimeframe(data, tf) {
    var now    = new Date();
    var cutoff = new Date(now);
    if      (tf === '1M')  { cutoff.setMonth(cutoff.getMonth() - 1); }
    else if (tf === '3M')  { cutoff.setMonth(cutoff.getMonth() - 3); }
    else if (tf === '6M')  { cutoff.setMonth(cutoff.getMonth() - 6); }
    else if (tf === 'YTD') { cutoff.setMonth(0); cutoff.setDate(1);  }
    else if (tf === '1Y')  { cutoff.setFullYear(cutoff.getFullYear() - 1); }
    else if (tf === '3Y')  { cutoff.setFullYear(cutoff.getFullYear() - 3); }
    else if (tf === '5Y')  { cutoff.setFullYear(cutoff.getFullYear() - 5); }
    else                   { return data; }
    return data.filter(function(d) { return new Date(d.date) >= cutoff; });
}

function normaliseData(sliced) {
    if (!sliced.length) return sliced;
    var base = sliced[0].close;
    if (!base) return sliced;
    return sliced.map(function(d) {
        return {
            date: d.date,
            open:   +(d.open   / base * 100).toFixed(4),
            high:   +(d.high   / base * 100).toFixed(4),
            low:    +(d.low    / base * 100).toFixed(4),
            close:  +(d.close  / base * 100).toFixed(4),
            volume: d.volume,
        };
    });
}

// ── Technical indicators ──────────────────────────────────────────────────────

function sma(prices, period) {
    return prices.map(function(_, i) {
        if (i < period - 1) return null;
        var sum = 0;
        for (var j = i - period + 1; j <= i; j++) sum += prices[j];
        return sum / period;
    });
}

function ema(prices, period) {
    var k      = 2 / (period + 1);
    var result = new Array(prices.length).fill(null);
    var prev   = null;
    prices.forEach(function(v, i) {
        if (i < period - 1) return;
        if (prev === null) {
            prev = 0;
            for (var j = 0; j < period; j++) prev += prices[j];
            prev /= period;
            result[i] = prev;
            return;
        }
        prev = v * k + prev * (1 - k);
        result[i] = prev;
    });
    return result;
}

function bollingerBands(prices, period, mult) {
    period = period || 20; mult = mult || 2;
    var mid = sma(prices, period);
    return prices.map(function(_, i) {
        if (mid[i] === null) return { upper: null, mid: null, lower: null };
        var slice = prices.slice(Math.max(0, i - period + 1), i + 1);
        var avg   = mid[i];
        var variance = 0;
        slice.forEach(function(v) { variance += (v - avg) * (v - avg); });
        var std = Math.sqrt(variance / slice.length);
        return { upper: avg + mult * std, mid: avg, lower: avg - mult * std };
    });
}

function rsi(closes, period) {
    period = period || 14;
    var gains = [], losses = [];
    for (var i = 1; i < closes.length; i++) {
        var diff = closes[i] - closes[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? -diff : 0);
    }
    var result = [null];
    var avgGain = 0, avgLoss = 0;
    for (var j = 0; j < period && j < gains.length; j++) { avgGain += gains[j]; avgLoss += losses[j]; }
    avgGain /= period; avgLoss /= period;
    for (var k = 0; k < gains.length; k++) {
        if (k < period) { result.push(null); continue; }
        avgGain = (avgGain * (period - 1) + gains[k])  / period;
        avgLoss = (avgLoss * (period - 1) + losses[k]) / period;
        result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return result;
}

function macd(closes, fast, slow, signal) {
    fast = fast || 12; slow = slow || 26; signal = signal || 9;
    var emaFast  = ema(closes, fast);
    var emaSlow  = ema(closes, slow);
    var macdLine = closes.map(function(_, i) {
        return emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null;
    });
    var signalLine = ema(macdLine.map(function(v) { return v !== null ? v : 0; }), signal);
    var histogram  = macdLine.map(function(v, i) {
        return v !== null && signalLine[i] !== null ? v - signalLine[i] : null;
    });
    return { macdLine: macdLine, signalLine: signalLine, histogram: histogram };
}

// ── Performance stats ─────────────────────────────────────────────────────────

function computeStats(sliced) {
    if (!sliced || sliced.length < 2) return null;
    var closes = sliced.map(function(d) { return d.close; });
    var first  = closes[0], last = closes[closes.length - 1], days = sliced.length;
    var totalReturn = last / first - 1;
    var annReturn   = Math.pow(1 + totalReturn, 252 / days) - 1;
    var logReturns  = [], mean = 0;
    for (var i = 1; i < closes.length; i++) {
        var lr = Math.log(closes[i] / closes[i - 1]);
        logReturns.push(lr); mean += lr;
    }
    mean /= logReturns.length;
    var variance = 0;
    logReturns.forEach(function(v) { variance += (v - mean) * (v - mean); });
    var volatility = Math.sqrt(variance / logReturns.length * 252);
    var peak = closes[0], maxDD = 0;
    closes.forEach(function(c) {
        if (c > peak) peak = c;
        var dd = (c - peak) / peak;
        if (dd < maxDD) maxDD = dd;
    });
    return { totalReturn: totalReturn, annReturn: annReturn, volatility: volatility, maxDD: maxDD };
}

// ── Plotly config builder ─────────────────────────────────────────────────────

var AXIS_BASE = {
    gridcolor:     'rgba(255,255,255,0.04)',
    linecolor:     'rgba(255,255,255,0.06)',
    tickfont:      { color: 'rgba(255,255,255,0.28)', size: 10, family: "'JetBrains Mono',monospace" },
    zerolinecolor: 'rgba(255,255,255,0.08)',
    showgrid:      true,
    zeroline:      false,
};

function buildPlotlyConfig(opts) {
    var series    = opts.series,   allData   = opts.allData;
    var overlays  = opts.overlays, subplots  = opts.subplots;
    var timeframe = opts.timeframe, normalise = opts.normalise;
    var chartType = opts.chartType;
    var traces    = [], shapes    = [];

    // Subplot domain allocation
    var spDefs = [];
    if (subplots.volume) spDefs.push({ key: 'volume', frac: 0.12, yKey: 'yaxis2' });
    if (subplots.rsi)    spDefs.push({ key: 'rsi',    frac: 0.15, yKey: 'yaxis3' });
    if (subplots.macd)   spDefs.push({ key: 'macd',   frac: 0.18, yKey: 'yaxis4' });
    var GAP = 0.015;
    var totalFrac  = spDefs.reduce(function(s, sp) { return s + sp.frac + GAP; }, 0);
    var mainDomain = [totalFrac, 1.0];
    var currentBottom = 0, spDomains = {};
    spDefs.forEach(function(sp) {
        spDomains[sp.key] = [currentBottom, currentBottom + sp.frac - GAP];
        currentBottom += sp.frac;
    });
    var yaxes = { yaxis: Object.assign({}, AXIS_BASE, { domain: mainDomain }) };

    // Primary series + overlays
    series.forEach(function(s, idx) {
        var raw = allData[s.id];
        if (!raw || !raw.length) return;
        var sliced = sliceByTimeframe(raw, timeframe);
        if (!sliced.length) return;
        var disp   = normalise ? normaliseData(sliced) : sliced;
        var colour = SERIES_PALETTE[idx % SERIES_PALETTE.length];
        var dates  = disp.map(function(d) { return d.date; });
        var closes = disp.map(function(d) { return d.close; });

        if (chartType === 'candlestick' && idx === 0) {
            traces.push({
                type: 'candlestick', name: s.label, x: dates,
                open:  disp.map(function(d) { return d.open;  }),
                high:  disp.map(function(d) { return d.high;  }),
                low:   disp.map(function(d) { return d.low;   }),
                close: closes,
                increasing: { line: { color: '#00d4ff', width: 1 }, fillcolor: 'rgba(0,212,255,0.45)' },
                decreasing: { line: { color: '#ef4444', width: 1 }, fillcolor: 'rgba(239,68,68,0.45)'  },
                yaxis: 'y', xaxis: 'x',
            });
        } else {
            traces.push({
                type: 'scatter', mode: 'lines', name: s.label, x: dates, y: closes,
                line:      { color: colour, width: 2 },
                fill:      chartType === 'area' ? 'tozeroy' : 'none',
                fillcolor: chartType === 'area' ? colour + '18' : undefined,
                yaxis: 'y', xaxis: 'x',
            });
        }

        // Overlays on primary series only
        if (idx === 0) {
            var prices = closes;
            if (overlays.ma20)  traces.push({ type:'scatter', mode:'lines', name:'MA 20',  x:dates, y:sma(prices,20),  line:{color:'#fbbf24',width:1.3,dash:'dash'}, yaxis:'y',xaxis:'x' });
            if (overlays.ma50)  traces.push({ type:'scatter', mode:'lines', name:'MA 50',  x:dates, y:sma(prices,50),  line:{color:'#a78bfa',width:1.3,dash:'dash'}, yaxis:'y',xaxis:'x' });
            if (overlays.ma200) traces.push({ type:'scatter', mode:'lines', name:'MA 200', x:dates, y:sma(prices,200), line:{color:'#fb923c',width:1.3,dash:'dot'},  yaxis:'y',xaxis:'x' });
            if (overlays.ema12) traces.push({ type:'scatter', mode:'lines', name:'EMA 12', x:dates, y:ema(prices,12),  line:{color:'#34d399',width:1.3},             yaxis:'y',xaxis:'x' });
            if (overlays.ema26) traces.push({ type:'scatter', mode:'lines', name:'EMA 26', x:dates, y:ema(prices,26),  line:{color:'#60a5fa',width:1.3},             yaxis:'y',xaxis:'x' });
            if (overlays.bb) {
                var bb = bollingerBands(prices, 20, 2);
                traces.push(
                    { type:'scatter',mode:'lines',name:'BB Upper',x:dates,y:bb.map(function(b){return b.upper;}),line:{color:'rgba(148,163,184,0.35)',width:1,dash:'dot'},fill:'none',yaxis:'y',xaxis:'x' },
                    { type:'scatter',mode:'lines',name:'BB Mid',  x:dates,y:bb.map(function(b){return b.mid;  }),line:{color:'rgba(100,116,139,0.6)', width:1         },fill:'none',yaxis:'y',xaxis:'x' },
                    { type:'scatter',mode:'lines',name:'BB Lower',x:dates,y:bb.map(function(b){return b.lower;}),line:{color:'rgba(148,163,184,0.35)',width:1,dash:'dot'},fill:'tonexty',fillcolor:'rgba(148,163,184,0.07)',yaxis:'y',xaxis:'x' }
                );
            }
        }
    });

    // Volume subplot
    if (subplots.volume && series.length > 0) {
        var vRaw    = allData[series[0].id];
        var vSliced = sliceByTimeframe(vRaw || [], timeframe);
        var vCloses = vSliced.map(function(d) { return d.close; });
        traces.push({
            type: 'bar', name: 'Volume',
            x: vSliced.map(function(d) { return d.date; }),
            y: vSliced.map(function(d) { return d.volume; }),
            marker: { color: vCloses.map(function(c, i) {
                return i === 0 || c >= vCloses[i-1] ? 'rgba(0,212,255,0.38)' : 'rgba(239,68,68,0.38)';
            }) },
            yaxis: 'y2', xaxis: 'x',
        });
        yaxes['yaxis2'] = Object.assign({}, AXIS_BASE, { domain: spDomains.volume || [0, 0.12], showticklabels: false });
    }

    // RSI subplot
    if (subplots.rsi && series.length > 0) {
        var rRaw    = allData[series[0].id];
        var rSliced = sliceByTimeframe(rRaw || [], timeframe);
        var rCloses = rSliced.map(function(d) { return d.close; });
        traces.push({
            type:'scatter', mode:'lines', name:'RSI',
            x: rSliced.map(function(d) { return d.date; }), y: rsi(rCloses),
            line: { color: '#8b5cf6', width: 1.5 }, yaxis: 'y3', xaxis: 'x',
        });
        yaxes['yaxis3'] = Object.assign({}, AXIS_BASE, {
            domain: spDomains.rsi || [0, 0.15], range: [0, 100],
            title: { text: 'RSI', font: { color: 'rgba(255,255,255,0.28)', size: 9 } },
        });
        shapes.push(
            { type:'line', xref:'paper', yref:'y3', x0:0, x1:1, y0:70, y1:70, line:{ color:'rgba(239,68,68,0.4)',  width:1, dash:'dash' } },
            { type:'line', xref:'paper', yref:'y3', x0:0, x1:1, y0:30, y1:30, line:{ color:'rgba(0,212,255,0.4)', width:1, dash:'dash' } }
        );
    }

    // MACD subplot
    if (subplots.macd && series.length > 0) {
        var mRaw    = allData[series[0].id];
        var mSliced = sliceByTimeframe(mRaw || [], timeframe);
        var mCloses = mSliced.map(function(d) { return d.close; });
        var mDates  = mSliced.map(function(d) { return d.date;  });
        var mCalc   = macd(mCloses);
        traces.push(
            { type:'bar',     name:'MACD Hist', x:mDates, y:mCalc.histogram,
              marker:{ color: mCalc.histogram.map(function(v) { return (v||0)>=0 ? 'rgba(0,212,255,0.5)' : 'rgba(239,68,68,0.5)'; }) },
              yaxis:'y4', xaxis:'x' },
            { type:'scatter', mode:'lines', name:'MACD',   x:mDates, y:mCalc.macdLine,   line:{ color:'#00d4ff', width:1.3 }, yaxis:'y4', xaxis:'x' },
            { type:'scatter', mode:'lines', name:'Signal', x:mDates, y:mCalc.signalLine, line:{ color:'#f59e0b', width:1.3 }, yaxis:'y4', xaxis:'x' }
        );
        yaxes['yaxis4'] = Object.assign({}, AXIS_BASE, {
            domain: spDomains.macd || [0, 0.18],
            title: { text: 'MACD', font: { color: 'rgba(255,255,255,0.28)', size: 9 } },
        });
    }

    // Anchor area chart to data range (prevents fill drawing to absolute zero)
    if (chartType === 'area' && series.length > 0) {
        var allCloses = [];
        series.forEach(function(s) {
            var raw = allData[s.id];
            if (!raw) return;
            var sl = normalise ? normaliseData(sliceByTimeframe(raw, timeframe)) : sliceByTimeframe(raw, timeframe);
            sl.forEach(function(d) { allCloses.push(d.close); });
        });
        if (allCloses.length > 0) {
            var minC = Math.min.apply(null, allCloses);
            var maxC = Math.max.apply(null, allCloses);
            var pad  = (maxC - minC) * 0.06;
            yaxes['yaxis'].range     = [minC - pad, maxC + pad];
            yaxes['yaxis'].autorange = false;
        }
    }

    var layout = Object.assign({
        paper_bgcolor: 'transparent',
        plot_bgcolor:  'rgba(255,255,255,0.012)',
        margin:        { l: 8, r: 68, t: 8, b: 30 },
        font:          { color: 'rgba(255,255,255,0.42)', size: 10, family: "'JetBrains Mono',monospace" },
        hoverlabel:    { bgcolor: '#0d0f1a', bordercolor: 'rgba(0,212,255,0.28)', font: { color: 'rgba(255,255,255,0.92)', size: 11, family: "'JetBrains Mono',monospace" } },
        legend:        { bgcolor: 'transparent', font: { color: 'rgba(255,255,255,0.42)', size: 10 }, orientation: 'h', y: -0.09, x: 0 },
        xaxis:         Object.assign({}, AXIS_BASE, { showspikes: true, spikecolor: 'rgba(0,212,255,0.3)', spikethickness: 1, domain: [0, 1] }),
        annotations:   [{ text: 'ATLAS', xref: 'paper', yref: 'paper', x: 0.5, y: 0.5, showarrow: false,
                          font: { color: 'rgba(0,212,255,0.04)', size: 52, family: "'JetBrains Mono',monospace" } }],
        shapes: shapes,
    }, yaxes);

    return { traces: traces, layout: layout };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PillGroup(props) {
    return h('div', { className: 'ac-pill-group' },
        props.options.map(function(o) {
            return h('button', {
                key: o.value,
                className: 'ac-pill' + (props.value === o.value ? ' on' : ''),
                onClick: function() { props.onChange(o.value); },
            }, o.label);
        })
    );
}

function TfButton(props) {
    return h('button', {
        className: 'ac-tf-btn' + (props.active ? ' on' : ''),
        onClick: props.onClick,
    }, props.label);
}

function Toggle(props) {
    return h('div', { className: 'ac-tog-wrap', onClick: props.onToggle },
        h('div', { className: 'ac-tog-track' + (props.on ? ' on' : '') },
            h('div', { className: 'ac-tog-thumb' })
        ),
        h('span', { className: 'ac-tog-label' }, props.label)
    );
}

function IndCheckbox(props) {
    return h('label', { className: 'ac-ind-row' },
        h('div', { className: 'ac-ind-box' + (props.on ? ' on' : ''), onClick: props.onChange }),
        props.colour ? h('span', { className: 'ac-ind-swatch', style: { background: props.colour } }) : null,
        h('span', { className: 'ac-ind-label' }, props.label)
    );
}

function SeriesItem(props) {
    var colour = SERIES_PALETTE[props.idx % SERIES_PALETTE.length];
    return h('div', { className: 'ac-ser-item' },
        h('span', { className: 'ac-ser-dot', style: { background: colour } }),
        h('span', { className: 'ac-ser-name', title: props.item.label }, props.item.label),
        props.item.locked
            ? h('span', { className: 'ac-ser-locked' }, 'LOCKED')
            : h('button', { className: 'ac-ser-remove', onClick: function() { props.onRemove(props.item.id); } }, '×')
    );
}

function StatCard(props) {
    function fmt(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }
    function cls(v) { return v == null ? 'neu' : v > 0.001 ? 'pos' : v < -0.001 ? 'neg' : 'neu'; }
    return h('div', { className: 'ac-stat-card' },
        h('div', { className: 'ac-stat-card-label' }, props.label),
        h('div', { className: 'ac-stat-grid' },
            h('div', { className: 'ac-stat-cell' },
                h('div', { className: 'ac-stat-val ' + cls(props.totalReturn) }, fmt(props.totalReturn)),
                h('div', { className: 'ac-stat-key' }, 'Total Return')
            ),
            h('div', { className: 'ac-stat-cell' },
                h('div', { className: 'ac-stat-val ' + cls(props.annReturn) }, fmt(props.annReturn)),
                h('div', { className: 'ac-stat-key' }, 'Ann. Return')
            ),
            h('div', { className: 'ac-stat-cell' },
                h('div', { className: 'ac-stat-val neu' }, fmt(props.volatility)),
                h('div', { className: 'ac-stat-key' }, 'Volatility')
            ),
            h('div', { className: 'ac-stat-cell' },
                h('div', { className: 'ac-stat-val ' + cls(props.maxDD) }, fmt(props.maxDD)),
                h('div', { className: 'ac-stat-key' }, 'Max DD')
            )
        )
    );
}

function InlineSearchResults(props) {
    var activeIds = {};
    props.activeSeries.forEach(function(s) { activeIds[s.id] = true; });
    var term = (props.query || '').toLowerCase().trim();

    var sections = [];
    Object.keys(props.catalog).forEach(function(cat) {
        var items = props.catalog[cat].filter(function(i) {
            if (activeIds[i.id]) return false;
            if (!term) return true;
            return i.label.toLowerCase().indexOf(term) !== -1;
        });
        if (items.length) sections.push({ cat: cat, items: items.slice(0, 20) });
    });

    if (!sections.length) {
        return h('div', { className: 'ac-add-panel' },
            h('div', { style: { padding: '8px 10px', fontSize: 11, color: 'rgba(255,255,255,0.3)' } },
                term ? 'No matches for "' + term + '"' : 'No assets available')
        );
    }

    return h('div', { className: 'ac-add-panel' },
        sections.map(function(sec) {
            return h('div', { key: sec.cat },
                h('div', { className: 'ac-sb-title', style: { padding: '6px 10px 2px', fontSize: 9, letterSpacing: 1.2 } }, sec.cat),
                sec.items.map(function(item) {
                    return h('div', {
                        key: item.id,
                        className: 'ac-catalog-item',
                        onMouseDown: function(e) {
                            e.preventDefault(); // keep input focus until click fires
                            props.onAdd(item);
                        },
                    }, item.label);
                })
            );
        })
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdvancedChart(props) {
    var navSeries  = props.navSeries || [];
    var chartRef   = useRef(null);
    var allDataRef = useRef({});
    var ready      = useRef(false);

    var _m  = useState('portfolio-vs-benchmark');
    var mode = _m[0], setMode = _m[1];

    var _ct = useState('area');
    var chartType = _ct[0], setChartType = _ct[1];

    var _tf = useState('1Y');
    var timeframe = _tf[0], setTimeframe = _tf[1];

    var _n = useState(true);
    var normalise = _n[0], setNormalise = _n[1];

    var _s = useState([{ id: 'portfolio', label: 'ATLAS Portfolio', locked: true }]);
    var series = _s[0], setSeries = _s[1];

    var _ov = useState({ ma20:false, ma50:false, ma200:false, ema12:false, ema26:false, bb:false });
    var overlays = _ov[0], setOverlays = _ov[1];

    var _sp = useState({ volume:false, rsi:false, macd:false });
    var subplots = _sp[0], setSubplots = _sp[1];

    var _sa = useState(false);
    var showAdd = _sa[0], setShowAdd = _sa[1];

    var _srch = useState('');
    var searchQuery = _srch[0], setSearchQuery = _srch[1];

    // dataVersion bumps after async fetches complete to trigger a redraw
    var _dv = useState(0);
    var dataVersion = _dv[0], setDataVersion = _dv[1];

    // Catalog built from DB
    var _cat = useState({});
    var catalog = _cat[0], setCatalog = _cat[1];

    var _cl = useState(true);
    var catalogLoading = _cl[0], setCatalogLoading = _cl[1];

    // Sync navSeries into allDataRef whenever it changes (handles late-loading data)
    useEffect(function() {
        if (navSeries && navSeries.length) {
            allDataRef.current['portfolio'] = navToOHLC(navSeries);
            if (ready.current) draw();
        }
    }, [navSeries]); // eslint-disable-line react-hooks/exhaustive-deps

    // On mount: build asset catalog and trigger first draw once layout is painted
    useEffect(function() {
        ready.current = true;

        // 2. Build asset catalog from Supabase
        if (sb) {
            Promise.all([
                sb.from('assets').select('id, symbol, name, asset_class'),
                sb.from('positions').select('asset_id'),
            ]).then(function(results) {
                var assets  = results[0].data || [];
                var posSet  = {};
                (results[1].data || []).forEach(function(p) { if (p.asset_id) posSet[p.asset_id] = true; });

                var holdings = [], others = [];
                assets.forEach(function(a) {
                    if (!a.symbol) return;
                    var label = a.symbol + (a.name && a.name !== a.symbol ? '  –  ' + a.name : '');
                    var item  = { id: a.symbol, label: label, assetId: a.id };
                    if (posSet[a.id]) holdings.push(item);
                    else others.push(item);
                });

                // Sort alphabetically within each group
                function byLabel(a, b) { return a.id < b.id ? -1 : 1; }
                holdings.sort(byLabel);
                others.sort(byLabel);

                var built = {};
                if (holdings.length) built['My Holdings'] = holdings;
                if (others.length)   built['All Assets']  = others;
                setCatalog(built);
                setCatalogLoading(false);
            }).catch(function() { setCatalogLoading(false); });
        } else {
            setCatalogLoading(false);
        }

        // rAF ensures the canvas has been laid out before Plotly measures its dimensions
        requestAnimationFrame(function() { draw(); });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Redraw whenever series/options or newly-fetched data changes
    useEffect(function() { draw(); },
        [series, overlays, subplots, timeframe, normalise, chartType, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

    // The parent keeps this panel mounted but hidden (display:none) when another
    // Performance tab is active, so selections/data survive tab switches. While
    // hidden the container measures 0px, so on re-reveal Plotly must re-measure —
    // force a redraw + resize once we become active again. `active` defaults to
    // true when the prop is omitted (standalone use).
    var active = props.active !== false;
    useEffect(function() {
        if (!active || !ready.current || !chartRef.current) return;
        requestAnimationFrame(function() {
            if (!chartRef.current) return;
            draw();
            if (Plotly.Plots && Plotly.Plots.resize) Plotly.Plots.resize(chartRef.current);
        });
    }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

    function draw() {
        if (!chartRef.current || !ready.current) return;
        var cfg = buildPlotlyConfig({
            series: series, allData: allDataRef.current,
            overlays: overlays, subplots: subplots,
            timeframe: timeframe, normalise: normalise, chartType: chartType,
        });
        Plotly.react(chartRef.current, cfg.traces, cfg.layout, { responsive: true, displayModeBar: false });
    }

    function handleModeChange(newMode) {
        setMode(newMode);
        if (newMode === 'portfolio-vs-benchmark') {
            setSeries([{ id: 'portfolio', label: 'ATLAS Portfolio', locked: true }]);
        }
    }

    function addSeries(item) {
        setSeries(function(prev) {
            if (prev.length >= MAX_SERIES) return prev;
            if (prev.find(function(s) { return s.id === item.id; })) return prev;
            return prev.concat([{ id: item.id, label: item.label, locked: false, assetId: item.assetId }]);
        });

        // Fetch price history from Supabase if not already cached.
        // Fetch 6 years descending (most recent first) to avoid the 1000-row
        // default cap silently truncating to stale data, then reverse on client.
        if (!allDataRef.current[item.id] && item.assetId && sb) {
            var sixYearsAgo = new Date();
            sixYearsAgo.setFullYear(sixYearsAgo.getFullYear() - 6);
            var cutoffDate = sixYearsAgo.toISOString().slice(0, 10);
            sb.from('price_history')
              .select('price_date, open, high, low, close, adjusted_close, volume')
              .eq('asset_id', item.assetId)
              .gte('price_date', cutoffDate)
              .order('price_date', { ascending: false })
              .limit(1600)
              .then(function(res) {
                  if (res.error) {
                      console.warn('[ATLAS chart] price_history fetch error:', res.error.message);
                      return;
                  }
                  if (res.data && res.data.length) {
                      // Reverse to restore chronological order
                      allDataRef.current[item.id] = res.data.slice().reverse().map(priceRowToOHLC);
                      setDataVersion(function(v) { return v + 1; });
                  }
              })
              .catch(function(err) { console.warn('[ATLAS chart] price_history:', err); });
        }
    }

    function removeSeries(id) {
        setSeries(function(prev) { return prev.filter(function(s) { return s.id !== id; }); });
    }

    function toggleOverlay(key) {
        setOverlays(function(prev) { var n = Object.assign({}, prev); n[key] = !n[key]; return n; });
    }

    function toggleSubplot(key) {
        setSubplots(function(prev) { var n = Object.assign({}, prev); n[key] = !n[key]; return n; });
    }

    // Per-series stats over the selected timeframe
    var stats = series.map(function(s) {
        var raw = allDataRef.current[s.id];
        if (!raw || !raw.length) return null;
        var st = computeStats(sliceByTimeframe(raw, timeframe));
        return st ? Object.assign({ id: s.id, label: s.label }, st) : null;
    }).filter(Boolean);

    var modeOptions      = [{ value:'portfolio-vs-benchmark', label:'Portfolio vs Benchmark' }, { value:'asset-vs-asset', label:'Asset vs Asset' }];
    var chartTypeOptions = [{ value:'area', label:'Area' }, { value:'line', label:'Line' }, { value:'candlestick', label:'Candle' }];
    var overlayConfig    = [
        { key:'ma20',  label:'MA 20',           colour:'#fbbf24'                 },
        { key:'ma50',  label:'MA 50',            colour:'#a78bfa'                 },
        { key:'ma200', label:'MA 200',           colour:'#fb923c'                 },
        { key:'ema12', label:'EMA 12',           colour:'#34d399'                 },
        { key:'ema26', label:'EMA 26',           colour:'#60a5fa'                 },
        { key:'bb',    label:'Bollinger (20,2)', colour:'rgba(148,163,184,0.6)'  },
    ];
    var subplotConfig = [
        { key:'volume', label:'Volume'         },
        { key:'rsi',    label:'RSI (14)'       },
        { key:'macd',   label:'MACD (12,26,9)' },
    ];

    return h('div', { className: 'ac-root' },

        // Topbar
        h('div', { className: 'ac-topbar' },
            h(PillGroup, { options: modeOptions,      value: mode,      onChange: handleModeChange }),
            h('div', { className: 'ac-topbar-div' }),
            h(PillGroup, { options: chartTypeOptions, value: chartType, onChange: setChartType }),
            h('div', { className: 'ac-topbar-div' }),
            h('div', { className: 'ac-tf-row' },
                TIMEFRAMES.map(function(tf) {
                    return h(TfButton, { key: tf, label: tf, active: timeframe === tf, onClick: function() { setTimeframe(tf); } });
                })
            ),
            h('div', { className: 'ac-topbar-div' }),
            h(Toggle, { on: normalise, onToggle: function() { setNormalise(function(n) { return !n; }); }, label: 'Normalise' })
        ),

        // Body
        h('div', { className: 'ac-body' },

            // Sidebar
            h('div', { className: 'ac-sidebar' },

                // Series + inline search
                h('div', { className: 'ac-sb-sec' },
                    h('div', { className: 'ac-sb-header' },
                        h('span', { className: 'ac-sb-title' }, 'Series'),
                        series.length >= MAX_SERIES
                            ? h('span', { style: { fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: "'JetBrains Mono',monospace" } }, 'MAX')
                            : null
                    ),
                    // Active series list
                    series.map(function(s, idx) {
                        return h(SeriesItem, { key: s.id, item: s, idx: idx, onRemove: removeSeries });
                    }),
                    // Inline search — always visible if room for more series
                    series.length < MAX_SERIES ? h('div', { style: { marginTop: 8, position: 'relative' } },
                        h('input', {
                            className: 'ac-srch-inp',
                            placeholder: catalogLoading ? 'Loading assets…' : 'Search assets & benchmarks…',
                            value: searchQuery,
                            disabled: catalogLoading,
                            onChange: function(e) { setSearchQuery(e.target.value); setShowAdd(true); },
                            onFocus: function() { setShowAdd(true); },
                            onBlur: function() { setTimeout(function() { setShowAdd(false); }, 150); },
                        }),
                        showAdd && !catalogLoading ? h(InlineSearchResults, {
                            catalog:      catalog,
                            query:        searchQuery,
                            activeSeries: series,
                            onAdd:        function(item) {
                                addSeries(item);
                                setSearchQuery('');
                                setShowAdd(false);
                            },
                        }) : null
                    ) : null
                ),

                // Overlays
                h('div', { className: 'ac-sb-sec' },
                    h('div', { className: 'ac-sb-title', style: { marginBottom: 8 } }, 'Overlays'),
                    overlayConfig.map(function(o) {
                        return h(IndCheckbox, { key: o.key, on: overlays[o.key], onChange: function() { toggleOverlay(o.key); }, label: o.label, colour: o.colour });
                    })
                ),

                // Subplots
                h('div', { className: 'ac-sb-sec' },
                    h('div', { className: 'ac-sb-title', style: { marginBottom: 8 } }, 'Subplots'),
                    subplotConfig.map(function(s) {
                        return h(IndCheckbox, { key: s.key, on: subplots[s.key], onChange: function() { toggleSubplot(s.key); }, label: s.label });
                    })
                ),

                // Performance stats
                h('div', { className: 'ac-sb-sec', style: { borderBottom: 'none' } },
                    h('div', { className: 'ac-sb-title', style: { marginBottom: 8 } }, 'Performance'),
                    stats.length
                        ? stats.map(function(st) { return h(StatCard, Object.assign({ key: st.id }, st)); })
                        : h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.28)', paddingTop: 4 } }, 'Add a series to see stats')
                )
            ),

            // Chart canvas
            h('div', { ref: chartRef, className: 'ac-canvas' })
        )
    );
}
