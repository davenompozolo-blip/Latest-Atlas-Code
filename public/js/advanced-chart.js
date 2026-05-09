// ============================================================
// ATLAS Terminal — Advanced Charting Module
// ------------------------------------------------------------
// Full-featured multi-asset comparison chart with technical
// overlays and stacked subplots.
//
// Follows the ATLAS Terminal UI Design Specification Rev 1.0.
//
// Depends on: Plotly (CDN global), React (CDN global)
// ============================================================

var h              = React.createElement;
var useState       = React.useState;
var useEffect      = React.useEffect;
var useRef         = React.useRef;
var useCallback    = React.useCallback;
var useMemo        = React.useMemo;

// ── Design constants ──────────────────────────────────────────────────────────

var SERIES_PALETTE = [
    '#00d4ff', // cyan      — always first / primary (matches terminal brand)
    '#f59e0b', // gold
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#f43f5e', // rose
    '#10b981', // emerald
    '#fb923c', // orange
    '#a78bfa', // lavender
    '#fbbf24', // amber
    '#34d399', // mint
];

var TIMEFRAMES = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'];
var MAX_SERIES  = 8;

var ASSET_CATALOG = {
    'Portfolio':      [{ id: 'portfolio',   label: 'ATLAS Portfolio', locked: true }],
    'Benchmarks':     [
        { id: 'msci-world', label: 'MSCI World'   },
        { id: 'sp500',      label: 'S&P 500'      },
        { id: 'alsi40',     label: 'ALSI 40'      },
        { id: 'nasdaq100',  label: 'Nasdaq 100'   },
        { id: 'msci-em',    label: 'MSCI EM'      },
    ],
    'Commodities':    [{ id: 'xauusd',    label: 'Gold (XAU/USD)'      }],
    'Crypto':         [{ id: 'btcusd',    label: 'Bitcoin (BTC/USD)'   }],
    'Equities':       [
        { id: 'nvda', label: 'NVDA'            },
        { id: 'aapl', label: 'AAPL'            },
        { id: 'msft', label: 'MSFT'            },
        { id: 'npn',  label: 'Naspers (NPN)'   },
        { id: 'ang',  label: 'AngloGold (ANG)' },
        { id: 'sol',  label: 'Sasol (SOL)'     },
    ],
    'FX':             [{ id: 'usdzar', label: 'USD/ZAR'      }],
    'Fixed Income':   [{ id: 'usagg',  label: 'US Agg Bond'  }],
    'Funds': [
        { id: 'satrix40', label: 'Satrix 40 ETF'        },
        { id: 'coro20',   label: 'Coronation Top 20'    },
        { id: 'inv-sa',   label: 'Ninety One SA Equity' },
        { id: 'psg-bal',  label: 'PSG Balanced'         },
    ],
};

// Per-asset mock data seeds and start prices
var MOCK_META = {
    'portfolio':   { seed: 42,  start: 100    },
    'msci-world':  { seed: 7,   start: 95     },
    'sp500':       { seed: 13,  start: 110    },
    'alsi40':      { seed: 99,  start: 80     },
    'nasdaq100':   { seed: 55,  start: 130    },
    'msci-em':     { seed: 31,  start: 70     },
    'xauusd':      { seed: 77,  start: 1800   },
    'btcusd':      { seed: 11,  start: 28000  },
    'nvda':        { seed: 22,  start: 220    },
    'aapl':        { seed: 33,  start: 150    },
    'msft':        { seed: 44,  start: 280    },
    'npn':         { seed: 66,  start: 3200   },
    'ang':         { seed: 88,  start: 320    },
    'sol':         { seed: 19,  start: 185    },
    'usdzar':      { seed: 3,   start: 18     },
    'usagg':       { seed: 5,   start: 90     },
    'satrix40':    { seed: 14,  start: 76     },
    'coro20':      { seed: 28,  start: 42     },
    'inv-sa':      { seed: 37,  start: 65     },
    'psg-bal':     { seed: 51,  start: 58     },
};

// ── Mock OHLC generator ───────────────────────────────────────────────────────

function genOHLC(days, startPrice, seed) {
    var data  = [];
    var price = startPrice;
    var rng   = seed;
    function rand() {
        rng = (rng * 1664525 + 1013904223) & 0xffffffff;
        return (rng >>> 0) / 0xffffffff;
    }
    var now = new Date();
    for (var i = days; i >= 0; i--) {
        var d = new Date(now);
        d.setDate(d.getDate() - i);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        var chg    = (rand() - 0.48) * 0.022;
        var open   = price;
        var close  = price * (1 + chg);
        var high   = Math.max(open, close) * (1 + rand() * 0.01);
        var low    = Math.min(open, close) * (1 - rand() * 0.01);
        var volume = Math.floor(500000 + rand() * 2000000);
        data.push({
            date:   d.toISOString().slice(0, 10),
            open:   +open.toFixed(4),
            high:   +high.toFixed(4),
            low:    +low.toFixed(4),
            close:  +close.toFixed(4),
            volume: volume,
        });
        price = close;
    }
    return data;
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
    return sliced.map(function(d) {
        return {
            date:   d.date,
            open:   +(d.open  / base * 100).toFixed(4),
            high:   +(d.high  / base * 100).toFixed(4),
            low:    +(d.low   / base * 100).toFixed(4),
            close:  +(d.close / base * 100).toFixed(4),
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
    period = period || 20;
    mult   = mult   || 2;
    var mid = sma(prices, period);
    return prices.map(function(_, i) {
        if (mid[i] === null) return { upper: null, mid: null, lower: null };
        var slice = prices.slice(Math.max(0, i - period + 1), i + 1);
        var avg   = mid[i];
        var variance = 0;
        slice.forEach(function(v) { variance += (v - avg) * (v - avg); });
        variance /= slice.length;
        var std = Math.sqrt(variance);
        return { upper: avg + mult * std, mid: avg, lower: avg - mult * std };
    });
}

function rsi(closes, period) {
    period = period || 14;
    var gains = [], losses = [];
    for (var i = 1; i < closes.length; i++) {
        var diff = closes[i] - closes[i - 1];
        gains.push(diff  > 0 ?  diff : 0);
        losses.push(diff < 0 ? -diff : 0);
    }
    var result  = [null];
    var avgGain = 0, avgLoss = 0;
    for (var j = 0; j < period; j++) { avgGain += gains[j]; avgLoss += losses[j]; }
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
    fast   = fast   || 12;
    slow   = slow   || 26;
    signal = signal || 9;
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
    var first  = closes[0];
    var last   = closes[closes.length - 1];
    var days   = sliced.length;

    var totalReturn = last / first - 1;
    var annReturn   = Math.pow(1 + totalReturn, 252 / days) - 1;

    var logReturns = [], mean = 0;
    for (var i = 1; i < closes.length; i++) {
        var lr = Math.log(closes[i] / closes[i - 1]);
        logReturns.push(lr);
        mean += lr;
    }
    mean /= logReturns.length;
    var variance = 0;
    logReturns.forEach(function(v) { variance += (v - mean) * (v - mean); });
    variance /= logReturns.length;
    var volatility = Math.sqrt(variance * 252);

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
    var series    = opts.series;
    var allData   = opts.allData;
    var overlays  = opts.overlays;
    var subplots  = opts.subplots;
    var timeframe = opts.timeframe;
    var normalise = opts.normalise;
    var chartType = opts.chartType;

    var traces = [], shapes = [];

    // Subplot domain allocation
    var spDefs = [];
    if (subplots.volume) spDefs.push({ key: 'volume', frac: 0.12, yKey: 'yaxis2' });
    if (subplots.rsi)    spDefs.push({ key: 'rsi',    frac: 0.15, yKey: 'yaxis3' });
    if (subplots.macd)   spDefs.push({ key: 'macd',   frac: 0.18, yKey: 'yaxis4' });

    var GAP = 0.015;
    var totalFrac = spDefs.reduce(function(s, sp) { return s + sp.frac + GAP; }, 0);
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
        if (!raw) return;
        var sliced = sliceByTimeframe(raw, timeframe);
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
                var bb    = bollingerBands(prices, 20, 2);
                var upper = bb.map(function(b) { return b.upper; });
                var bbMid = bb.map(function(b) { return b.mid;   });
                var lower = bb.map(function(b) { return b.lower; });
                traces.push(
                    { type:'scatter',mode:'lines',name:'BB Upper',x:dates,y:upper,line:{color:'rgba(148,163,184,0.35)',width:1,dash:'dot'},fill:'none',yaxis:'y',xaxis:'x' },
                    { type:'scatter',mode:'lines',name:'BB Mid',  x:dates,y:bbMid,line:{color:'rgba(100,116,139,0.6)', width:1},           fill:'none',yaxis:'y',xaxis:'x' },
                    { type:'scatter',mode:'lines',name:'BB Lower',x:dates,y:lower,line:{color:'rgba(148,163,184,0.35)',width:1,dash:'dot'},fill:'tonexty',fillcolor:'rgba(148,163,184,0.07)',yaxis:'y',xaxis:'x' }
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
                return i === 0 || c >= vCloses[i - 1] ? 'rgba(0,212,255,0.38)' : 'rgba(239,68,68,0.38)';
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
        var rDates  = rSliced.map(function(d) { return d.date;  });
        var rVals   = rsi(rCloses);
        traces.push({
            type:'scatter', mode:'lines', name:'RSI',
            x: rDates, y: rVals,
            line: { color: '#8b5cf6', width: 1.5 },
            yaxis: 'y3', xaxis: 'x',
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
              marker:{ color: mCalc.histogram.map(function(v) { return (v||0) >= 0 ? 'rgba(0,212,255,0.5)' : 'rgba(239,68,68,0.5)'; }) },
              yaxis:'y4', xaxis:'x' },
            { type:'scatter', mode:'lines', name:'MACD',   x:mDates, y:mCalc.macdLine,   line:{ color:'#00d4ff', width:1.3 }, yaxis:'y4', xaxis:'x' },
            { type:'scatter', mode:'lines', name:'Signal', x:mDates, y:mCalc.signalLine, line:{ color:'#f59e0b', width:1.3 }, yaxis:'y4', xaxis:'x' }
        );
        yaxes['yaxis4'] = Object.assign({}, AXIS_BASE, {
            domain: spDomains.macd || [0, 0.18],
            title: { text: 'MACD', font: { color: 'rgba(255,255,255,0.28)', size: 9 } },
        });
    }

    // Anchor area chart to data range — prevents fill drawing all the way to absolute zero
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

function AddPanel(props) {
    var _s = useState('');
    var search = _s[0], setSearch = _s[1];
    var activeIds = {};
    props.activeSeries.forEach(function(s) { activeIds[s.id] = true; });
    var term = search.toLowerCase();

    return h('div', { className: 'ac-add-panel' },
        h('div', { className: 'ac-sb-sec', style: { borderBottom: 'none', paddingBottom: 6 } },
            h('input', {
                className: 'ac-srch-inp',
                placeholder: 'Search assets…',
                value: search,
                onChange: function(e) { setSearch(e.target.value); },
                autoFocus: true,
            })
        ),
        h('div', { className: 'ac-add-panel-list' },
            Object.keys(props.catalog).map(function(cat) {
                var items = props.catalog[cat].filter(function(i) {
                    return !activeIds[i.id] && i.label.toLowerCase().indexOf(term) !== -1;
                });
                if (!items.length) return null;
                return h('div', { key: cat, className: 'ac-sb-sec', style: { paddingBottom: 4 } },
                    h('div', { className: 'ac-sb-title', style: { marginBottom: 4 } }, cat),
                    items.map(function(item) {
                        return h('div', {
                            key: item.id,
                            className: 'ac-catalog-item',
                            onClick: function() { props.onAdd(item); props.onClose(); },
                        }, item.label);
                    })
                );
            })
        )
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdvancedChart() {
    var chartRef  = useRef(null);
    var allDataRef = useRef({});
    var ready      = useRef(false);

    var _m = useState('portfolio-vs-benchmark');
    var mode = _m[0], setMode = _m[1];

    var _ct = useState('area');
    var chartType = _ct[0], setChartType = _ct[1];

    var _tf = useState('1Y');
    var timeframe = _tf[0], setTimeframe = _tf[1];

    var _n = useState(false);
    var normalise = _n[0], setNormalise = _n[1];

    var _s = useState([{ id: 'portfolio', label: 'ATLAS Portfolio', locked: true }]);
    var series = _s[0], setSeries = _s[1];

    var _ov = useState({ ma20:false, ma50:false, ma200:false, ema12:false, ema26:false, bb:false });
    var overlays = _ov[0], setOverlays = _ov[1];

    var _sp = useState({ volume:false, rsi:false, macd:false });
    var subplots = _sp[0], setSubplots = _sp[1];

    var _sa = useState(false);
    var showAdd = _sa[0], setShowAdd = _sa[1];

    // Generate all mock data once
    useEffect(function() {
        Object.keys(MOCK_META).forEach(function(id) {
            var m = MOCK_META[id];
            allDataRef.current[id] = genOHLC(365 * 5, m.start, m.seed);
        });
        ready.current = true;
        draw();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    function draw() {
        if (!chartRef.current || !ready.current) return;
        var cfg = buildPlotlyConfig({
            series: series, allData: allDataRef.current,
            overlays: overlays, subplots: subplots,
            timeframe: timeframe, normalise: normalise, chartType: chartType,
        });
        Plotly.react(chartRef.current, cfg.traces, cfg.layout, { responsive: true, displayModeBar: false });
    }

    useEffect(function() { draw(); }, [series, overlays, subplots, timeframe, normalise, chartType]); // eslint-disable-line react-hooks/exhaustive-deps

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
            return prev.concat([{ id: item.id, label: item.label, locked: false }]);
        });
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

    // Per-series stats
    var stats = series.map(function(s) {
        var raw = allDataRef.current[s.id];
        if (!raw) return null;
        var st = computeStats(sliceByTimeframe(raw, timeframe));
        return st ? Object.assign({ id: s.id, label: s.label }, st) : null;
    }).filter(Boolean);

    var addCatalog = mode === 'portfolio-vs-benchmark'
        ? { 'Benchmarks': ASSET_CATALOG['Benchmarks'], 'Commodities': ASSET_CATALOG['Commodities'],
            'Crypto': ASSET_CATALOG['Crypto'], 'Fixed Income': ASSET_CATALOG['Fixed Income'],
            'Funds': ASSET_CATALOG['Funds'] }
        : ASSET_CATALOG;

    var modeOptions      = [{ value:'portfolio-vs-benchmark', label:'Portfolio vs Benchmark' }, { value:'asset-vs-asset', label:'Asset vs Asset' }];
    var chartTypeOptions = [{ value:'area', label:'Area' }, { value:'line', label:'Line' }, { value:'candlestick', label:'Candle' }];

    var overlayConfig = [
        { key:'ma20',  label:'MA 20',           colour:'#fbbf24'                  },
        { key:'ma50',  label:'MA 50',            colour:'#a78bfa'                  },
        { key:'ma200', label:'MA 200',           colour:'#fb923c'                  },
        { key:'ema12', label:'EMA 12',           colour:'#34d399'                  },
        { key:'ema26', label:'EMA 26',           colour:'#60a5fa'                  },
        { key:'bb',    label:'Bollinger (20,2)', colour:'rgba(148,163,184,0.6)'   },
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

                // Series
                h('div', { className: 'ac-sb-sec' },
                    h('div', { className: 'ac-sb-header' },
                        h('span', { className: 'ac-sb-title' }, 'Series'),
                        series.length < MAX_SERIES
                            ? h('button', { className: 'ac-add-btn', onClick: function() { setShowAdd(function(v) { return !v; }); } }, showAdd ? 'Close' : '+ Add')
                            : null
                    ),
                    showAdd ? h(AddPanel, { catalog: addCatalog, activeSeries: series, onAdd: addSeries, onClose: function() { setShowAdd(false); } }) : null,
                    series.map(function(s, idx) { return h(SeriesItem, { key: s.id, item: s, idx: idx, onRemove: removeSeries }); })
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

                // Stats
                h('div', { className: 'ac-sb-sec', style: { borderBottom: 'none' } },
                    h('div', { className: 'ac-sb-title', style: { marginBottom: 8 } }, 'Performance'),
                    stats.map(function(st) { return h(StatCard, Object.assign({ key: st.id }, st)); })
                )
            ),

            // Chart canvas
            h('div', { ref: chartRef, className: 'ac-canvas' })
        )
    );
}
