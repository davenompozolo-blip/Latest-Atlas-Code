// AdvancedChart.jsx — ATLAS Terminal Advanced Charting Module
// Full-featured multi-asset comparison chart with technical overlays and subplots.
// Follows the ATLAS Terminal UI Design Specification (Revision 1.0).

import { useEffect, useRef, useState, useCallback } from 'react';
import Plotly from 'plotly.js-dist-min';
import '../styles/AdvancedChart.css';

// ── Design Constants ──────────────────────────────────────────────────────────

const SERIES_PALETTE = [
  '#00d4aa', // teal      — always first / primary
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

const TIMEFRAMES = ['1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y'];

const MAX_SERIES = 8;

const ASSET_CATALOG = {
  Portfolio:      [{ id: 'portfolio',  label: 'ATLAS Portfolio', locked: true }],
  Benchmarks:     [
    { id: 'msci-world', label: 'MSCI World'  },
    { id: 'sp500',      label: 'S&P 500'     },
    { id: 'alsi40',     label: 'ALSI 40'     },
    { id: 'nasdaq100',  label: 'Nasdaq 100'  },
    { id: 'msci-em',    label: 'MSCI EM'     },
  ],
  Commodities:    [{ id: 'xauusd',    label: 'Gold (XAU/USD)'       }],
  Crypto:         [{ id: 'btcusd',    label: 'Bitcoin (BTC/USD)'    }],
  Equities:       [
    { id: 'nvda', label: 'NVDA'           },
    { id: 'aapl', label: 'AAPL'           },
    { id: 'msft', label: 'MSFT'           },
    { id: 'npn',  label: 'Naspers (NPN)'  },
    { id: 'ang',  label: 'AngloGold (ANG)'},
    { id: 'sol',  label: 'Sasol (SOL)'   },
  ],
  FX:             [{ id: 'usdzar',    label: 'USD/ZAR'              }],
  'Fixed Income': [{ id: 'usagg',     label: 'US Agg Bond'          }],
  Funds: [
    { id: 'satrix40', label: 'Satrix 40 ETF'          },
    { id: 'coro20',   label: 'Coronation Top 20'      },
    { id: 'inv-sa',   label: 'Ninety One SA Equity'   },
    { id: 'psg-bal',  label: 'PSG Balanced'            },
  ],
};

// Per-asset mock data seeds and start prices (deterministic, no external calls)
const MOCK_META = {
  portfolio:  { seed: 42,  start: 100    },
  'msci-world':{ seed: 7,  start: 95     },
  sp500:      { seed: 13,  start: 110    },
  alsi40:     { seed: 99,  start: 80     },
  nasdaq100:  { seed: 55,  start: 130    },
  'msci-em':  { seed: 31,  start: 70     },
  xauusd:     { seed: 77,  start: 1800   },
  btcusd:     { seed: 11,  start: 28000  },
  nvda:       { seed: 22,  start: 220    },
  aapl:       { seed: 33,  start: 150    },
  msft:       { seed: 44,  start: 280    },
  npn:        { seed: 66,  start: 3200   },
  ang:        { seed: 88,  start: 320    },
  sol:        { seed: 19,  start: 185    },
  usdzar:     { seed: 3,   start: 18     },
  usagg:      { seed: 5,   start: 90     },
  satrix40:   { seed: 14,  start: 76     },
  coro20:     { seed: 28,  start: 42     },
  'inv-sa':   { seed: 37,  start: 65     },
  'psg-bal':  { seed: 51,  start: 58     },
};

// ── Mock Data Generation ──────────────────────────────────────────────────────

function genOHLC(days = 365 * 5, startPrice = 100, seed = 1) {
  const data = [];
  let price = startPrice;
  let rng = seed;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) & 0xffffffff;
    return (rng >>> 0) / 0xffffffff;
  };
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const chg   = (rand() - 0.48) * 0.022;
    const open  = price;
    const close = price * (1 + chg);
    const high  = Math.max(open, close) * (1 + rand() * 0.01);
    const low   = Math.min(open, close) * (1 - rand() * 0.01);
    const volume = Math.floor(500_000 + rand() * 2_000_000);
    data.push({
      date:   d.toISOString().slice(0, 10),
      open:   +open.toFixed(4),
      high:   +high.toFixed(4),
      low:    +low.toFixed(4),
      close:  +close.toFixed(4),
      volume,
    });
    price = close;
  }
  return data;
}

function sliceByTimeframe(data, tf) {
  const now = new Date();
  const cutoff = new Date(now);
  switch (tf) {
    case '1M':  cutoff.setMonth(cutoff.getMonth() - 1);       break;
    case '3M':  cutoff.setMonth(cutoff.getMonth() - 3);       break;
    case '6M':  cutoff.setMonth(cutoff.getMonth() - 6);       break;
    case 'YTD': cutoff.setMonth(0); cutoff.setDate(1);        break;
    case '1Y':  cutoff.setFullYear(cutoff.getFullYear() - 1); break;
    case '3Y':  cutoff.setFullYear(cutoff.getFullYear() - 3); break;
    case '5Y':  cutoff.setFullYear(cutoff.getFullYear() - 5); break;
    default:    return data;
  }
  return data.filter(d => new Date(d.date) >= cutoff);
}

function normaliseData(sliced) {
  if (!sliced.length) return sliced;
  const base = sliced[0].close;
  return sliced.map(d => ({
    ...d,
    open:  +(d.open  / base * 100).toFixed(4),
    high:  +(d.high  / base * 100).toFixed(4),
    low:   +(d.low   / base * 100).toFixed(4),
    close: +(d.close / base * 100).toFixed(4),
  }));
}

// ── Technical Indicator Calculations ─────────────────────────────────────────

function sma(prices, period) {
  return prices.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += prices[j];
    return sum / period;
  });
}

function ema(prices, period) {
  const k      = 2 / (period + 1);
  const result = new Array(prices.length).fill(null);
  let prev     = null;
  prices.forEach((v, i) => {
    if (i < period - 1) return;
    if (prev === null) {
      prev = prices.slice(0, period).reduce((s, x) => s + x, 0) / period;
      result[i] = prev;
      return;
    }
    prev = v * k + prev * (1 - k);
    result[i] = prev;
  });
  return result;
}

function bollingerBands(prices, period = 20, mult = 2) {
  const mid = sma(prices, period);
  return prices.map((_, i) => {
    if (mid[i] === null) return { upper: null, mid: null, lower: null };
    const slice   = prices.slice(Math.max(0, i - period + 1), i + 1);
    const avg     = mid[i];
    const variance = slice.reduce((s, v) => s + (v - avg) ** 2, 0) / slice.length;
    const std     = Math.sqrt(variance);
    return { upper: avg + mult * std, mid: avg, lower: avg - mult * std };
  });
}

function rsi(closes, period = 14) {
  const gains  = [];
  const losses = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  const result = [null];
  let avgGain  = gains.slice(0, period).reduce((s, v) => s + v, 0) / period;
  let avgLoss  = losses.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = 0; i < gains.length; i++) {
    if (i < period) { result.push(null); continue; }
    avgGain = (avgGain * (period - 1) + gains[i])  / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast  = ema(closes, fast);
  const emaSlow  = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? emaFast[i] - emaSlow[i] : null
  );
  // EMA of MACD for signal — feed zeros where null to preserve length
  const signalLine = ema(macdLine.map(v => v ?? 0), signal);
  const histogram  = macdLine.map((v, i) =>
    v !== null && signalLine[i] !== null ? v - signalLine[i] : null
  );
  return { macdLine, signalLine, histogram };
}

// ── Performance Statistics ────────────────────────────────────────────────────

function computeStats(sliced) {
  if (!sliced || sliced.length < 2) return null;
  const closes = sliced.map(d => d.close);
  const first  = closes[0];
  const last   = closes[closes.length - 1];
  const days   = sliced.length;

  const totalReturn = last / first - 1;
  const annReturn   = (1 + totalReturn) ** (252 / days) - 1;

  const logReturns = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
  const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / logReturns.length;
  const volatility = Math.sqrt(variance * 252);

  let peak = closes[0];
  let maxDD = 0;
  closes.forEach(c => {
    if (c > peak) peak = c;
    const dd = (c - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  });

  return { totalReturn, annReturn, volatility, maxDD };
}

// ── Plotly Configuration Builder ──────────────────────────────────────────────

const AXIS_BASE = {
  gridcolor:     'rgba(255,255,255,0.04)',
  linecolor:     'rgba(255,255,255,0.06)',
  tickfont:      { color: '#3d5280', size: 10, family: "'SF Mono','Fira Code',monospace" },
  zerolinecolor: 'rgba(255,255,255,0.08)',
  showgrid:      true,
  zeroline:      false,
};

function buildPlotlyConfig({ series, seriesData, overlays, subplots, timeframe, normalise, chartType }) {
  const traces = [];
  const shapes = [];

  // ── Subplot domain allocation (stacked bottom-up) ──
  const spDefs = [];
  if (subplots.volume) spDefs.push({ key: 'volume', frac: 0.12, yRef: 'y2' });
  if (subplots.rsi)    spDefs.push({ key: 'rsi',    frac: 0.15, yRef: 'y3' });
  if (subplots.macd)   spDefs.push({ key: 'macd',   frac: 0.18, yRef: 'y4' });

  const GAP  = 0.015;
  const totalSubFrac = spDefs.reduce((s, sp) => s + sp.frac + GAP, 0);
  const mainDomain   = [totalSubFrac, 1.0];

  let currentBottom = 0;
  const spDomains   = {};
  spDefs.forEach(sp => {
    spDomains[sp.key] = [currentBottom, currentBottom + sp.frac - GAP];
    currentBottom += sp.frac;
  });

  const yaxes = {
    yaxis: { ...AXIS_BASE, domain: mainDomain },
  };

  // ── Primary series and overlays ──
  series.forEach((s, idx) => {
    const raw = seriesData[s.id];
    if (!raw) return;
    const sliced = sliceByTimeframe(raw, timeframe);
    const disp   = normalise ? normaliseData(sliced) : sliced;
    const colour = SERIES_PALETTE[idx % SERIES_PALETTE.length];
    const dates  = disp.map(d => d.date);
    const closes = disp.map(d => d.close);

    if (chartType === 'candlestick' && idx === 0) {
      traces.push({
        type:       'candlestick',
        name:       s.label,
        x:          dates,
        open:       disp.map(d => d.open),
        high:       disp.map(d => d.high),
        low:        disp.map(d => d.low),
        close:      closes,
        increasing: { line: { color: '#00d4aa', width: 1 }, fillcolor: 'rgba(0,212,170,0.45)' },
        decreasing: { line: { color: '#ef4444', width: 1 }, fillcolor: 'rgba(239,68,68,0.45)'  },
        yaxis:      'y',
        xaxis:      'x',
      });
    } else {
      traces.push({
        type:      'scatter',
        mode:      'lines',
        name:      s.label,
        x:         dates,
        y:         closes,
        line:      { color: colour, width: 2 },
        fill:      chartType === 'area' ? 'tozeroy' : 'none',
        fillcolor: chartType === 'area' ? colour + '18' : undefined,
        yaxis:     'y',
        xaxis:     'x',
      });
    }

    // Technical overlays apply only to the primary series (idx === 0)
    if (idx === 0) {
      const prices = disp.map(d => d.close);

      if (overlays.ma20) {
        traces.push({
          type: 'scatter', mode: 'lines', name: 'MA 20', x: dates, y: sma(prices, 20),
          line: { color: '#fbbf24', width: 1.3, dash: 'dash' }, yaxis: 'y', xaxis: 'x',
        });
      }
      if (overlays.ma50) {
        traces.push({
          type: 'scatter', mode: 'lines', name: 'MA 50', x: dates, y: sma(prices, 50),
          line: { color: '#a78bfa', width: 1.3, dash: 'dash' }, yaxis: 'y', xaxis: 'x',
        });
      }
      if (overlays.ma200) {
        traces.push({
          type: 'scatter', mode: 'lines', name: 'MA 200', x: dates, y: sma(prices, 200),
          line: { color: '#fb923c', width: 1.3, dash: 'dot' }, yaxis: 'y', xaxis: 'x',
        });
      }
      if (overlays.ema12) {
        traces.push({
          type: 'scatter', mode: 'lines', name: 'EMA 12', x: dates, y: ema(prices, 12),
          line: { color: '#34d399', width: 1.3 }, yaxis: 'y', xaxis: 'x',
        });
      }
      if (overlays.ema26) {
        traces.push({
          type: 'scatter', mode: 'lines', name: 'EMA 26', x: dates, y: ema(prices, 26),
          line: { color: '#60a5fa', width: 1.3 }, yaxis: 'y', xaxis: 'x',
        });
      }
      if (overlays.bb) {
        const bb     = bollingerBands(prices, 20, 2);
        const upper  = bb.map(b => b.upper);
        const bbMid  = bb.map(b => b.mid);
        const lower  = bb.map(b => b.lower);
        traces.push(
          {
            type: 'scatter', mode: 'lines', name: 'BB Upper', x: dates, y: upper,
            line: { color: 'rgba(148,163,184,0.35)', width: 1, dash: 'dot' },
            fill: 'none', yaxis: 'y', xaxis: 'x',
          },
          {
            type: 'scatter', mode: 'lines', name: 'BB Mid', x: dates, y: bbMid,
            line: { color: 'rgba(100,116,139,0.6)', width: 1 },
            fill: 'none', yaxis: 'y', xaxis: 'x',
          },
          {
            type: 'scatter', mode: 'lines', name: 'BB Lower', x: dates, y: lower,
            line: { color: 'rgba(148,163,184,0.35)', width: 1, dash: 'dot' },
            fill: 'tonexty', fillcolor: 'rgba(148,163,184,0.07)',
            yaxis: 'y', xaxis: 'x',
          }
        );
      }
    }
  });

  // ── Volume subplot ──
  if (subplots.volume && series.length > 0) {
    const raw    = seriesData[series[0].id];
    const sliced = sliceByTimeframe(raw || [], timeframe);
    const closes = sliced.map(d => d.close);
    traces.push({
      type: 'bar', name: 'Volume',
      x: sliced.map(d => d.date),
      y: sliced.map(d => d.volume),
      marker: {
        color: closes.map((c, i) =>
          i === 0 || c >= closes[i - 1]
            ? 'rgba(0,212,170,0.38)'
            : 'rgba(239,68,68,0.38)'
        ),
      },
      yaxis: 'y2', xaxis: 'x',
    });
    yaxes['yaxis2'] = {
      ...AXIS_BASE,
      domain:          spDomains.volume || [0, 0.12],
      showticklabels:  false,
    };
  }

  // ── RSI subplot ──
  if (subplots.rsi && series.length > 0) {
    const raw    = seriesData[series[0].id];
    const sliced = sliceByTimeframe(raw || [], timeframe);
    const closes = sliced.map(d => d.close);
    const dates  = sliced.map(d => d.date);
    const rsiVals = rsi(closes);
    traces.push({
      type: 'scatter', mode: 'lines', name: 'RSI',
      x: dates, y: rsiVals,
      line:  { color: '#8b5cf6', width: 1.5 },
      yaxis: 'y3', xaxis: 'x',
    });
    const rsiDomain = spDomains.rsi || [0, 0.15];
    yaxes['yaxis3'] = {
      ...AXIS_BASE,
      domain: rsiDomain,
      range:  [0, 100],
      title:  { text: 'RSI', font: { color: '#3d5280', size: 9 } },
    };
    // Reference lines at 70 and 30
    shapes.push(
      {
        type: 'line', xref: 'paper', yref: 'y3',
        x0: 0, x1: 1, y0: 70, y1: 70,
        line: { color: 'rgba(239,68,68,0.4)', width: 1, dash: 'dash' },
      },
      {
        type: 'line', xref: 'paper', yref: 'y3',
        x0: 0, x1: 1, y0: 30, y1: 30,
        line: { color: 'rgba(0,212,170,0.4)', width: 1, dash: 'dash' },
      }
    );
  }

  // ── MACD subplot ──
  if (subplots.macd && series.length > 0) {
    const raw    = seriesData[series[0].id];
    const sliced = sliceByTimeframe(raw || [], timeframe);
    const closes = sliced.map(d => d.close);
    const dates  = sliced.map(d => d.date);
    const { macdLine, signalLine, histogram } = macd(closes);
    traces.push(
      {
        type: 'bar', name: 'MACD Hist', x: dates, y: histogram,
        marker: {
          color: histogram.map(v => (v ?? 0) >= 0
            ? 'rgba(0,212,170,0.5)'
            : 'rgba(239,68,68,0.5)'
          ),
        },
        yaxis: 'y4', xaxis: 'x',
      },
      {
        type: 'scatter', mode: 'lines', name: 'MACD',
        x: dates, y: macdLine,
        line: { color: '#00d4aa', width: 1.3 },
        yaxis: 'y4', xaxis: 'x',
      },
      {
        type: 'scatter', mode: 'lines', name: 'Signal',
        x: dates, y: signalLine,
        line: { color: '#f59e0b', width: 1.3 },
        yaxis: 'y4', xaxis: 'x',
      }
    );
    yaxes['yaxis4'] = {
      ...AXIS_BASE,
      domain: spDomains.macd || [0, 0.18],
      title:  { text: 'MACD', font: { color: '#3d5280', size: 9 } },
    };
  }

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'rgba(255,255,255,0.012)',
    margin:        { l: 8, r: 68, t: 8, b: 30 },
    font:          { color: '#94a3b8', size: 10, family: "'SF Mono','Fira Code',monospace" },
    hoverlabel:    {
      bgcolor:     '#0d1835',
      bordercolor: 'rgba(0,212,170,0.28)',
      font:        { color: '#e2e8f0', size: 11, family: "'SF Mono',monospace" },
    },
    legend: {
      bgcolor:     'transparent',
      font:        { color: '#64748b', size: 10 },
      orientation: 'h',
      y:           -0.09,
      x:           0,
    },
    xaxis: {
      ...AXIS_BASE,
      showspikes:     true,
      spikecolor:     'rgba(0,212,170,0.3)',
      spikethickness: 1,
      domain:         [0, 1],
    },
    annotations: [
      {
        text:       'ATLAS',
        xref:       'paper',
        yref:       'paper',
        x:          0.5,
        y:          0.5,
        showarrow:  false,
        font:       { color: 'rgba(0,212,170,0.05)', size: 52, family: 'monospace' },
        textangle:  0,
      },
    ],
    shapes,
    ...yaxes,
  };

  return { traces, layout };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PillGroup({ options, value, onChange }) {
  return (
    <div className="pill-group">
      {options.map(o => (
        <button
          key={o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TfButton({ label, active, onClick }) {
  return (
    <button className={`tf-btn${active ? ' on' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

function Toggle({ on, onToggle, label }) {
  return (
    <div className="tog-wrap" onClick={onToggle}>
      <div className={`tog-track${on ? ' on' : ''}`}>
        <div className="tog-thumb" />
      </div>
      <span className="tog-label">{label}</span>
    </div>
  );
}

function IndCheckbox({ on, onChange, label, colour }) {
  return (
    <label className="ind-row">
      <div className={`ind-box${on ? ' on' : ''}`} onClick={onChange} />
      {colour && <span className="ind-swatch" style={{ background: colour }} />}
      <span className="ind-label">{label}</span>
    </label>
  );
}

function SeriesItem({ item, idx, onRemove }) {
  const colour = SERIES_PALETTE[idx % SERIES_PALETTE.length];
  return (
    <div className="ser-item">
      <span className="ser-dot" style={{ background: colour }} />
      <span className="ser-name" title={item.label}>{item.label}</span>
      {item.locked
        ? <span className="ser-locked">LOCKED</span>
        : <button className="ser-remove" onClick={() => onRemove(item.id)}>×</button>
      }
    </div>
  );
}

function StatCard({ label, totalReturn, annReturn, volatility, maxDD }) {
  const fmt = (v, pct = true) =>
    v == null ? '—' : pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(2);
  const cls = v =>
    v == null ? 'neu' : v > 0.001 ? 'pos' : v < -0.001 ? 'neg' : 'neu';

  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-grid">
        <div className="stat-cell">
          <div className={`stat-val ${cls(totalReturn)}`}>{fmt(totalReturn)}</div>
          <div className="stat-key">Total Return</div>
        </div>
        <div className="stat-cell">
          <div className={`stat-val ${cls(annReturn)}`}>{fmt(annReturn)}</div>
          <div className="stat-key">Ann. Return</div>
        </div>
        <div className="stat-cell">
          <div className="stat-val neu">{fmt(volatility)}</div>
          <div className="stat-key">Volatility</div>
        </div>
        <div className="stat-cell">
          <div className={`stat-val ${cls(maxDD)}`}>{fmt(maxDD)}</div>
          <div className="stat-key">Max DD</div>
        </div>
      </div>
    </div>
  );
}

function AddPanel({ catalog, activeSeries, onAdd, onClose }) {
  const [search, setSearch] = useState('');
  const activeIds = new Set(activeSeries.map(s => s.id));
  const term      = search.toLowerCase();

  return (
    <div className="add-panel">
      <div className="sb-sec" style={{ borderBottom: 'none', paddingBottom: 6 }}>
        <input
          className="srch-inp"
          placeholder="Search assets…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div className="add-panel-list">
        {Object.entries(catalog).map(([cat, items]) => {
          const filtered = items.filter(
            i => !activeIds.has(i.id) && i.label.toLowerCase().includes(term)
          );
          if (!filtered.length) return null;
          return (
            <div key={cat} className="sb-sec" style={{ paddingBottom: 4 }}>
              <div className="sb-title" style={{ marginBottom: 4 }}>{cat}</div>
              {filtered.map(item => (
                <div
                  key={item.id}
                  className="catalog-item"
                  onClick={() => { onAdd(item); onClose(); }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AdvancedChart() {
  const chartRef   = useRef(null);
  const seriesData = useRef({});

  const [mode,      setMode]      = useState('portfolio-vs-benchmark');
  const [chartType, setChartType] = useState('area');
  const [timeframe, setTimeframe] = useState('1Y');
  const [normalise, setNormalise] = useState(false);
  const [series,    setSeries]    = useState([
    { id: 'portfolio', label: 'ATLAS Portfolio', locked: true },
  ]);
  const [overlays,  setOverlays]  = useState({
    ma20: false, ma50: false, ma200: false, ema12: false, ema26: false, bb: false,
  });
  const [subplots,  setSubplots]  = useState({
    volume: false, rsi: false, macd: false,
  });
  const [showAdd,   setShowAdd]   = useState(false);

  // Generate all mock OHLC data once on mount
  useEffect(() => {
    Object.entries(MOCK_META).forEach(([id, { seed, start }]) => {
      seriesData.current[id] = genOHLC(365 * 5, start, seed);
    });
    // Trigger initial draw
    drawChart();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const drawChart = useCallback(() => {
    if (!chartRef.current || !Object.keys(seriesData.current).length) return;
    const { traces, layout } = buildPlotlyConfig({
      series, seriesData: seriesData.current,
      overlays, subplots, timeframe, normalise, chartType,
    });
    Plotly.react(chartRef.current, traces, layout, {
      responsive:     true,
      displayModeBar: false,
    });
  }, [series, overlays, subplots, timeframe, normalise, chartType]);

  useEffect(() => { drawChart(); }, [drawChart]);

  const handleModeChange = useCallback(newMode => {
    setMode(newMode);
    if (newMode === 'portfolio-vs-benchmark') {
      // Reset to just the locked portfolio series
      setSeries([{ id: 'portfolio', label: 'ATLAS Portfolio', locked: true }]);
    }
  }, []);

  const addSeries = useCallback(item => {
    setSeries(prev => {
      if (prev.length >= MAX_SERIES)            return prev;
      if (prev.find(s => s.id === item.id))    return prev;
      return [...prev, { id: item.id, label: item.label, locked: false }];
    });
  }, []);

  const removeSeries = useCallback(id => {
    setSeries(prev => prev.filter(s => s.id !== id));
  }, []);

  const toggleOverlay = useCallback(key => {
    setOverlays(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleSubplot = useCallback(key => {
    setSubplots(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Per-series performance stats over the selected timeframe
  const stats = series.map(s => {
    const raw = seriesData.current[s.id];
    if (!raw) return null;
    return { id: s.id, label: s.label, ...computeStats(sliceByTimeframe(raw, timeframe)) };
  }).filter(Boolean);

  // Catalog exposed depending on mode
  const addCatalog = mode === 'portfolio-vs-benchmark'
    ? {
        Benchmarks:     ASSET_CATALOG.Benchmarks,
        Commodities:    ASSET_CATALOG.Commodities,
        Crypto:         ASSET_CATALOG.Crypto,
        'Fixed Income': ASSET_CATALOG['Fixed Income'],
        Funds:          ASSET_CATALOG.Funds,
      }
    : ASSET_CATALOG;

  const modeOptions = [
    { value: 'portfolio-vs-benchmark', label: 'Portfolio vs Benchmark' },
    { value: 'asset-vs-asset',         label: 'Asset vs Asset'         },
  ];
  const chartTypeOptions = [
    { value: 'area',        label: 'Area'   },
    { value: 'line',        label: 'Line'   },
    { value: 'candlestick', label: 'Candle' },
  ];
  const overlayConfig = [
    { key: 'ma20',  label: 'MA 20',          colour: '#fbbf24'                 },
    { key: 'ma50',  label: 'MA 50',          colour: '#a78bfa'                 },
    { key: 'ma200', label: 'MA 200',         colour: '#fb923c'                 },
    { key: 'ema12', label: 'EMA 12',         colour: '#34d399'                 },
    { key: 'ema26', label: 'EMA 26',         colour: '#60a5fa'                 },
    { key: 'bb',    label: 'Bollinger (20,2)', colour: 'rgba(148,163,184,0.6)' },
  ];
  const subplotConfig = [
    { key: 'volume', label: 'Volume'        },
    { key: 'rsi',    label: 'RSI (14)'      },
    { key: 'macd',   label: 'MACD (12,26,9)'},
  ];

  return (
    <div className="atlas-chart">

      {/* ── Topbar ── */}
      <div className="chart-topbar">
        <PillGroup options={modeOptions}     value={mode}      onChange={handleModeChange} />
        <div className="topbar-div" />
        <PillGroup options={chartTypeOptions} value={chartType} onChange={setChartType}    />
        <div className="topbar-div" />
        <div className="tf-row">
          {TIMEFRAMES.map(tf => (
            <TfButton
              key={tf}
              label={tf}
              active={timeframe === tf}
              onClick={() => setTimeframe(tf)}
            />
          ))}
        </div>
        <div className="topbar-div" />
        <Toggle on={normalise} onToggle={() => setNormalise(n => !n)} label="Normalise" />
      </div>

      {/* ── Body ── */}
      <div className="chart-body">

        {/* ── Sidebar ── */}
        <div className="chart-sidebar">

          {/* Series section */}
          <div className="sb-sec">
            <div className="sb-header">
              <span className="sb-title">Series</span>
              {series.length < MAX_SERIES && (
                <button className="add-btn" onClick={() => setShowAdd(v => !v)}>
                  {showAdd ? 'Close' : '+ Add'}
                </button>
              )}
            </div>

            {showAdd && (
              <AddPanel
                catalog={addCatalog}
                activeSeries={series}
                onAdd={addSeries}
                onClose={() => setShowAdd(false)}
              />
            )}

            {series.map((s, idx) => (
              <SeriesItem key={s.id} item={s} idx={idx} onRemove={removeSeries} />
            ))}
          </div>

          {/* Overlays section */}
          <div className="sb-sec">
            <div className="sb-title" style={{ marginBottom: 8 }}>Overlays</div>
            {overlayConfig.map(o => (
              <IndCheckbox
                key={o.key}
                on={overlays[o.key]}
                onChange={() => toggleOverlay(o.key)}
                label={o.label}
                colour={o.colour}
              />
            ))}
          </div>

          {/* Subplots section */}
          <div className="sb-sec">
            <div className="sb-title" style={{ marginBottom: 8 }}>Subplots</div>
            {subplotConfig.map(s => (
              <IndCheckbox
                key={s.key}
                on={subplots[s.key]}
                onChange={() => toggleSubplot(s.key)}
                label={s.label}
              />
            ))}
          </div>

          {/* Performance stats section */}
          <div className="sb-sec" style={{ borderBottom: 'none' }}>
            <div className="sb-title" style={{ marginBottom: 8 }}>Performance</div>
            {stats.map(st => (
              <StatCard key={st.id} {...st} />
            ))}
          </div>

        </div>

        {/* ── Chart Canvas ── */}
        <div ref={chartRef} className="chart-canvas" />

      </div>
    </div>
  );
}
