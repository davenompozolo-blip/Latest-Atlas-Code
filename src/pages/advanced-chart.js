import Plotly from 'plotly.js-dist-min';
import React from 'react';
// ============================================================
// ATLAS Terminal — Advanced Charting Module (PERF → Charts)
// ------------------------------------------------------------
// Portfolio equity curve vs real comparison assets.
//
// Thin renderer over src/lib/chartSeriesEngine.js — the SAME engine
// Nexus beat 08 (Evidence) uses. Series fetching stays here (Supabase
// access), but all alignment, rebasing and metrics come from the
// engine, so the two chart surfaces can never drift apart:
//   • union date axis = portfolio calendar, assets left-joined + ffilled
//   • normalise rebases every series at the COMMON start date
//   • engine warnings (truncated history, ffill, dropped tickers) are
//     rendered under the chart, not swallowed
//   • per-series stats are computed on the displayed window, with beta
//     and correlation vs the portfolio
//
// Data sources:
//   Portfolio  — vw_portfolio_nav_daily (real, passed as prop)
//   All others — price_history via Supabase (fetched on-demand)
// ============================================================

import { sb } from './config.js';
import {
    alignSeries, computeMetrics, makeRequestGate, TIMEFRAMES,
    sma, ema, bollingerBands, rsi, macd,
} from '../lib/chartSeriesEngine.js';

var h           = React.createElement;
var useState    = React.useState;
var useEffect   = React.useEffect;
var useRef      = React.useRef;
var useMemo     = React.useMemo;

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

var MAX_SERIES = 8;

// ── Data helpers ──────────────────────────────────────────────────────────────

function navToSeries(navSeries) {
    // Portfolio NAV has no intraday data — close = nav for all OHLC fields
    return navSeries
        .slice()
        .sort(function(a, b) { return new Date(a.price_date) - new Date(b.price_date); })
        .map(function(d) {
            var v = parseFloat(d.nav);
            return { date: d.price_date, open: v, high: v, low: v, close: v, volume: 0 };
        })
        .filter(function(d) { return isFinite(d.close) && d.close > 0; });
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

// ── Plotly config builder — renders ALIGNED data from the engine ──────────────

var AXIS_BASE = {
    gridcolor:     'rgba(255,255,255,0.04)',
    linecolor:     'rgba(255,255,255,0.06)',
    tickfont:      { color: 'rgba(255,255,255,0.28)', size: 10, family: "'JetBrains Mono',monospace" },
    zerolinecolor: 'rgba(255,255,255,0.08)',
    showgrid:      true,
    zeroline:      false,
};

function buildPlotlyConfig(opts) {
    var aligned  = opts.aligned;   // { dates, series } from alignSeries
    var labels   = opts.labels;    // { id → label }
    var overlays = opts.overlays, subplots = opts.subplots;
    var chartType = opts.chartType;
    var dates    = aligned.dates;
    var traces   = [], shapes = [];

    // Subplot domain allocation
    var spDefs = [];
    if (subplots.volume) spDefs.push({ key: 'volume', frac: 0.12 });
    if (subplots.rsi)    spDefs.push({ key: 'rsi',    frac: 0.15 });
    if (subplots.macd)   spDefs.push({ key: 'macd',   frac: 0.18 });
    var GAP = 0.015;
    var totalFrac  = spDefs.reduce(function(s, sp) { return s + sp.frac + GAP; }, 0);
    var currentBottom = 0, spDomains = {};
    spDefs.forEach(function(sp) {
        spDomains[sp.key] = [currentBottom, currentBottom + sp.frac - GAP];
        currentBottom += sp.frac;
    });
    var yaxes = { yaxis: Object.assign({}, AXIS_BASE, { domain: [totalFrac, 1.0] }) };

    var primary = aligned.series[0] || null;

    aligned.series.forEach(function(s, idx) {
        var colour = SERIES_PALETTE[idx % SERIES_PALETTE.length];
        var label  = labels[s.id] || s.id;

        if (chartType === 'candlestick' && idx === 0 && aligned.series.length === 1) {
            traces.push({
                type: 'candlestick', name: label, x: dates,
                open:  s.ohlc.map(function(o) { return o && o.open;  }),
                high:  s.ohlc.map(function(o) { return o && o.high;  }),
                low:   s.ohlc.map(function(o) { return o && o.low;   }),
                close: s.ohlc.map(function(o) { return o && o.close; }),
                increasing: { line: { color: '#00d4ff', width: 1 }, fillcolor: 'rgba(0,212,255,0.45)' },
                decreasing: { line: { color: '#ef4444', width: 1 }, fillcolor: 'rgba(239,68,68,0.45)'  },
                yaxis: 'y', xaxis: 'x',
            });
        } else {
            traces.push({
                type: 'scatter', mode: 'lines', name: label, x: dates, y: s.values,
                line:      { color: colour, width: 2 },
                fill:      chartType === 'area' && idx === 0 ? 'tozeroy' : 'none',
                fillcolor: chartType === 'area' && idx === 0 ? colour + '18' : undefined,
                connectgaps: false,
                yaxis: 'y', xaxis: 'x',
            });
        }

        // Overlays on primary series only
        if (idx === 0) {
            var prices = s.values.map(function(v) { return v == null ? NaN : v; });
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

    // Volume subplot (primary series)
    if (subplots.volume && primary) {
        var vCloses = primary.values;
        traces.push({
            type: 'bar', name: 'Volume', x: dates,
            y: primary.ohlc.map(function(o) { return o ? o.volume : null; }),
            marker: { color: vCloses.map(function(c, i) {
                return i === 0 || c == null || vCloses[i-1] == null || c >= vCloses[i-1] ? 'rgba(0,212,255,0.38)' : 'rgba(239,68,68,0.38)';
            }) },
            yaxis: 'y2', xaxis: 'x',
        });
        yaxes['yaxis2'] = Object.assign({}, AXIS_BASE, { domain: spDomains.volume || [0, 0.12], showticklabels: false });
    }

    // RSI subplot
    if (subplots.rsi && primary) {
        var rCloses = primary.values.map(function(v) { return v == null ? NaN : v; });
        traces.push({
            type:'scatter', mode:'lines', name:'RSI',
            x: dates, y: rsi(rCloses),
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
    if (subplots.macd && primary) {
        var mCloses = primary.values.map(function(v) { return v == null ? NaN : v; });
        var mCalc   = macd(mCloses);
        traces.push(
            { type:'bar',     name:'MACD Hist', x:dates, y:mCalc.histogram,
              marker:{ color: mCalc.histogram.map(function(v) { return (v||0)>=0 ? 'rgba(0,212,255,0.5)' : 'rgba(239,68,68,0.5)'; }) },
              yaxis:'y4', xaxis:'x' },
            { type:'scatter', mode:'lines', name:'MACD',   x:dates, y:mCalc.macdLine,   line:{ color:'#00d4ff', width:1.3 }, yaxis:'y4', xaxis:'x' },
            { type:'scatter', mode:'lines', name:'Signal', x:dates, y:mCalc.signalLine, line:{ color:'#f59e0b', width:1.3 }, yaxis:'y4', xaxis:'x' }
        );
        yaxes['yaxis4'] = Object.assign({}, AXIS_BASE, {
            domain: spDomains.macd || [0, 0.18],
            title: { text: 'MACD', font: { color: 'rgba(255,255,255,0.28)', size: 9 } },
        });
    }

    // Anchor area chart to data range (prevents fill drawing to absolute zero)
    if (chartType === 'area' && aligned.series.length > 0) {
        var allCloses = [];
        aligned.series.forEach(function(s) {
            s.values.forEach(function(v) { if (v != null) allCloses.push(v); });
        });
        if (allCloses.length > 0) {
            var minC = Math.min.apply(null, allCloses);
            var maxC = Math.max.apply(null, allCloses);
            var pad  = (maxC - minC) * 0.06 || 1;
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
        xaxis:         Object.assign({}, AXIS_BASE, { showspikes: true, spikecolor: 'rgba(0,212,255,0.3)', spikethickness: 1, domain: [0, 1], rangeslider: { visible: false } }),
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
                title: o.reason || o.label,
                disabled: !!o.disabled,
                style: o.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : null,
                onClick: o.disabled ? undefined : function() { props.onChange(o.value); },
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
    if (props.insufficient) {
        return h('div', { className: 'ac-stat-card' },
            h('div', { className: 'ac-stat-card-label' }, props.label),
            h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'JetBrains Mono',monospace", padding: '6px 0' } },
                'insufficient history in this window (' + props.obs + ' obs, need 20)')
        );
    }
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
                h('div', { className: 'ac-stat-val neu' }, fmt(props.vol)),
                h('div', { className: 'ac-stat-key' }, 'Volatility')
            ),
            h('div', { className: 'ac-stat-cell' },
                h('div', { className: 'ac-stat-val ' + cls(props.maxDD) }, fmt(props.maxDD)),
                h('div', { className: 'ac-stat-key' }, 'Max DD')
            ),
            h('div', { className: 'ac-stat-cell' },
                h('div', { className: 'ac-stat-val neu' }, props.beta == null ? '—' : props.beta.toFixed(2)),
                h('div', { className: 'ac-stat-key' }, 'Beta vs Port')
            ),
            h('div', { className: 'ac-stat-cell' },
                h('div', { className: 'ac-stat-val neu' }, props.corr == null ? '—' : props.corr.toFixed(2)),
                h('div', { className: 'ac-stat-key' }, 'Corr vs Port')
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
                    // Tickers that already failed a price-history fetch are
                    // disabled with the reason shown — they never silently
                    // select-and-render-nothing again (§6.1 #1).
                    var dead = props.deadTickers[item.id];
                    return h('div', {
                        key: item.id,
                        className: 'ac-catalog-item',
                        title: dead ? item.id + ': ' + dead : item.label,
                        style: dead ? { opacity: 0.4, cursor: 'not-allowed', textDecoration: 'line-through' } : null,
                        onMouseDown: function(e) {
                            e.preventDefault(); // keep input focus until click fires
                            if (dead) return;
                            props.onAdd(item);
                        },
                    }, item.label + (dead ? '  (' + dead + ')' : ''));
                })
            );
        })
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AdvancedChart(props) {
    var navSeries  = props.navSeries || [];
    var chartRef   = useRef(null);
    var gate       = useRef(makeRequestGate());

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

    // Raw fetched data lives in state (not a ref) so alignment re-runs
    // deterministically when a fetch lands — no manual dataVersion bumps.
    var _raw = useState({});
    var rawById = _raw[0], setRawById = _raw[1];

    // Tickers whose price_history fetch came back empty/errored, with reason.
    var _dead = useState({});
    var deadTickers = _dead[0], setDeadTickers = _dead[1];

    // Fetch-level warnings (engine warnings are computed per render).
    var _fw = useState([]);
    var fetchWarnings = _fw[0], setFetchWarnings = _fw[1];

    // Catalog built from DB
    var _cat = useState({});
    var catalog = _cat[0], setCatalog = _cat[1];

    var _cl = useState(true);
    var catalogLoading = _cl[0], setCatalogLoading = _cl[1];

    // Sync navSeries into raw data whenever it changes (handles late-loading data)
    useEffect(function() {
        if (navSeries && navSeries.length) {
            var s = navToSeries(navSeries);
            setRawById(function(prev) { return Object.assign({}, prev, { portfolio: s }); });
        }
    }, [navSeries]);

    // On mount: build asset catalog
    useEffect(function() {
        if (!sb) { setCatalogLoading(false); return; }
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

            function byLabel(a, b) { return a.id < b.id ? -1 : 1; }
            holdings.sort(byLabel);
            others.sort(byLabel);

            var built = {};
            if (holdings.length) built['My Holdings'] = holdings;
            if (others.length)   built['All Assets']  = others;
            setCatalog(built);
            setCatalogLoading(false);
        }).catch(function() { setCatalogLoading(false); });
    }, []);

    // ── Aligned data + metrics from the shared engine ─────────────────────────
    var ids = useMemo(function() { return series.map(function(s) { return s.id; }); }, [series]);
    var aligned = useMemo(function() {
        return alignSeries({ raw: rawById, ids: ids, timeframe: timeframe, normalise: normalise });
    }, [rawById, ids, timeframe, normalise]);
    var metrics = useMemo(function() {
        return computeMetrics({ dates: aligned.dates, series: aligned.series, referenceId: 'portfolio', rf: 0.045 });
    }, [aligned]);

    var labelById = useMemo(function() {
        var m = {};
        series.forEach(function(s) { m[s.id] = s.label; });
        return m;
    }, [series]);

    // Candle only makes sense for a single series — disabled with reason
    // instead of silently rendering the others as lines.
    var candleDisabled = aligned.series.length > 1;
    useEffect(function() {
        if (candleDisabled && chartType === 'candlestick') setChartType('line');
    }, [candleDisabled, chartType]);

    // ── Draw ──────────────────────────────────────────────────────────────────
    var active = props.active !== false;
    useEffect(function() {
        if (!chartRef.current) return;
        var cfg = buildPlotlyConfig({
            aligned: aligned, labels: labelById,
            overlays: overlays, subplots: subplots, chartType: chartType,
        });
        Plotly.react(chartRef.current, cfg.traces, cfg.layout, { responsive: true, displayModeBar: false });
    }, [aligned, labelById, overlays, subplots, chartType]);

    // The parent keeps this panel mounted but hidden (display:none) when
    // another Performance tab is active. While hidden the container measures
    // 0px, so on re-reveal Plotly must re-measure.
    useEffect(function() {
        if (!active || !chartRef.current) return;
        requestAnimationFrame(function() {
            if (!chartRef.current) return;
            if (Plotly.Plots && Plotly.Plots.resize) Plotly.Plots.resize(chartRef.current);
        });
    }, [active]);

    function handleModeChange(newMode) {
        setMode(newMode);
        if (newMode === 'portfolio-vs-benchmark') {
            setSeries(function(prev) {
                var rest = prev.filter(function(s) { return s.id !== 'portfolio'; });
                return [{ id: 'portfolio', label: 'ATLAS Portfolio', locked: true }].concat(rest);
            });
        }
    }

    function addSeries(item) {
        setSeries(function(prev) {
            if (prev.length >= MAX_SERIES) return prev;
            if (prev.find(function(s) { return s.id === item.id; })) return prev;
            return prev.concat([{ id: item.id, label: item.label, locked: false, assetId: item.assetId }]);
        });

        // Fetch price history from Supabase if not already cached.
        // 6 years descending (most recent first) to avoid the 1000-row
        // default cap silently truncating to stale data, then reverse.
        if (!rawById[item.id] && item.assetId && sb) {
            var token = gate.current.next();
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
                  // Empty or errored fetch fails LOUD: the series is removed,
                  // the ticker is marked unavailable in search, and a warning
                  // renders under the chart (§6.1 #1 — the old code logged to
                  // console and rendered nothing).
                  if (res.error || !res.data || !res.data.length) {
                      if (!gate.current.isCurrent(token)) return;
                      var reason = res.error ? 'price fetch failed' : 'no price history';
                      setSeries(function(prev) { return prev.filter(function(s) { return s.id !== item.id; }); });
                      setDeadTickers(function(prev) { var n = Object.assign({}, prev); n[item.id] = reason; return n; });
                      setFetchWarnings(function(prev) {
                          return prev.concat([item.id + ': ' + reason + (res.error ? ' — ' + res.error.message : ' in the database — not plotted')]);
                      });
                      return;
                  }
                  var seriesData = res.data.slice().reverse().map(priceRowToOHLC);
                  setRawById(function(prev) { return Object.assign({}, prev, { [item.id]: seriesData }); });
              })
              .catch(function(err) {
                  if (!gate.current.isCurrent(token)) return;
                  setSeries(function(prev) { return prev.filter(function(s) { return s.id !== item.id; }); });
                  setFetchWarnings(function(prev) { return prev.concat([item.id + ': price fetch failed — ' + (err && err.message)]); });
              });
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

    // Warnings: engine (alignment) + fetch failures, rendered — not swallowed.
    // no_data engine warnings are dropped here: a series with no raw data is
    // either still fetching (transient) or already failed its fetch — and the
    // fetch handler removed it and reported the reason via fetchWarnings.
    var allWarnings = aligned.warnings
        .filter(function(w) { return w.kind !== 'no_data'; })
        .map(function(w) { return w.text; })
        .concat(fetchWarnings);

    var modeOptions      = [{ value:'portfolio-vs-benchmark', label:'Portfolio vs Benchmark' }, { value:'asset-vs-asset', label:'Asset vs Asset' }];
    var chartTypeOptions = [
        { value:'area', label:'Area' },
        { value:'line', label:'Line' },
        { value:'candlestick', label:'Candle', disabled: candleDisabled,
          reason: candleDisabled ? 'Candles need exactly one series — remove the others first.' : 'OHLC candles' },
    ];
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
            h(Toggle, { on: normalise, onToggle: function() { setNormalise(function(n) { return !n; }); }, label: 'Normalise' }),
            normalise && aligned.commonStart
                ? h('span', { style: { fontSize: 9, letterSpacing: 1, color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 3, padding: '2px 6px', fontFamily: "'JetBrains Mono',monospace", marginLeft: 8 } },
                    'REBASED TO COMMON START · ' + aligned.commonStart)
                : null
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
                    series.map(function(s, idx) {
                        return h(SeriesItem, { key: s.id, item: s, idx: idx, onRemove: removeSeries });
                    }),
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
                            deadTickers:  deadTickers,
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

                // Performance stats — computed on the DISPLAYED window by the
                // shared engine, beta/corr vs portfolio included.
                h('div', { className: 'ac-sb-sec', style: { borderBottom: 'none' } },
                    h('div', { className: 'ac-sb-title', style: { marginBottom: 8 } }, 'Performance · ' + timeframe + ' window'),
                    metrics.length
                        ? metrics.map(function(m) {
                            return h(StatCard, Object.assign({ key: m.id, label: labelById[m.id] || m.id }, m));
                        })
                        : h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.28)', paddingTop: 4 } }, 'Add a series to see stats')
                )
            ),

            // Chart canvas + warnings
            h('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 } },
                h('div', { ref: chartRef, className: 'ac-canvas', style: { flex: 1 } }),
                allWarnings.length ? h('div', {
                    style: { padding: '6px 10px', fontSize: 10, color: '#f59e0b', fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.6 }
                }, allWarnings.slice(0, 6).map(function(w, i) { return h('div', { key: i }, '⚠ ' + w); })) : null
            )
        )
    );
}
