import React from 'react';
import { fmt, fmtCurrency, cls, useChart } from './utils.js';
import { Loading, EmptyState } from './components.js';
import { sb } from './config.js';
import {
    VerdictStrip, ThesisTab, ValuationTab, QualityTab,
    CapitalTab, FactorTab, TechnicalsAndPeersTab, parseInputs,
} from './equity-research-panels.js';

const { useState, useEffect, useCallback } = React;

// ── Data parsing ────────────────────────────────────────────────────────────

function parseDaily(dailyRaw) {
    if (!dailyRaw) return [];
    const ts = dailyRaw['Time Series (Daily)'];
    if (!ts) return [];
    const rows = [];
    for (const date in ts) {
        const row = ts[date];
        const close = Number(row['4. close']);
        if (!isNaN(close)) rows.push({ date, close });
    }
    rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    return rows;
}

function retBack(series, days) {
    const n = series.length;
    if (n <= days) return null;
    const end = series[n - 1].close;
    const start = series[n - 1 - days].close;
    if (!start) return null;
    return (end / start) - 1;
}

function volWindow(series, w) {
    const n = series.length;
    if (n <= w) return null;
    let sum = 0, sumSq = 0, count = 0;
    for (let i = n - w; i < n; i++) {
        const r = series[i].close / series[i - 1].close - 1;
        sum += r; sumSq += r * r; count++;
    }
    if (count < 2) return null;
    const mean = sum / count;
    const variance = (sumSq / count) - mean * mean;
    return Math.sqrt(Math.max(variance, 0)) * Math.sqrt(252);
}

function deriveMetrics(series) {
    if (!series || series.length < 2) return null;
    const current = series[series.length - 1].close;
    const window = series.slice(-252);
    let high = -Infinity, low = Infinity, peak = -Infinity;
    for (const r of window) {
        if (r.close > high) high = r.close;
        if (r.close < low) low = r.close;
        if (r.close > peak) peak = r.close;
    }
    return {
        current,
        high52: isFinite(high) ? high : null,
        low52:  isFinite(low)  ? low  : null,
        drawdown: peak > 0 ? (current - peak) / peak : null,
        ret1D: retBack(series, 1),
        ret1W: retBack(series, 5),
        ret1M: retBack(series, 21),
        ret3M: retBack(series, 63),
        ret1Y: retBack(series, 252) || retBack(series, series.length - 1),
        vol30d: volWindow(series, 30),
    };
}

function parseOverview(o) {
    if (!o || !o.Symbol) return null;
    const num = (k) => { const v = Number(o[k]); return isFinite(v) ? v : null; };
    return {
        symbol: o.Symbol, name: o.Name || o.Symbol,
        exchange: o.Exchange || '', sector: o.Sector || '—', industry: o.Industry || '—',
        marketCap: num('MarketCapitalization'), peRatio: num('PERatio'),
        pegRatio: num('PEGRatio'), beta: num('Beta'), eps: num('EPS'),
        dividendYield: num('DividendYield'), analystTarget: num('AnalystTargetPrice'),
    };
}

// ── Sidebar components ──────────────────────────────────────────────────────

function CompanyHeader({ rawOverview, current, ret1D }) {
    if (!rawOverview) return null;
    const exchange = rawOverview.Exchange || '';
    const sector   = rawOverview.Sector || '';
    const industry = rawOverview.Industry || '';
    const name     = rawOverview.Name || rawOverview.Symbol || '';
    const tickerLine = [exchange, sector, industry].filter(Boolean).join(' · ');
    const changeAmt  = ret1D != null && current ? ret1D * current : null;
    const changeColor = ret1D == null ? 'rgba(255,255,255,0.4)' : ret1D >= 0 ? '#22c55e' : '#ef4444';
    return React.createElement('div', null,
        tickerLine && React.createElement('div', {
            style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 5 }
        }, tickerLine),
        React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 2 } },
            React.createElement('div', { style: { fontSize: 24, fontWeight: 700, letterSpacing: -0.5, color: 'rgba(255,255,255,0.95)' } },
                current ? '$' + current.toFixed(2) : '—'),
            changeAmt != null && React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: changeColor } },
                (changeAmt >= 0 ? '+' : '') + '$' + Math.abs(changeAmt).toFixed(2) +
                ' ' + (ret1D >= 0 ? '+' : '') + (ret1D * 100).toFixed(2) + '%')
        ),
        React.createElement('div', { style: { fontSize: 9.5, color: 'rgba(255,255,255,0.38)', lineHeight: 1.4 } }, name)
    );
}

function PortfolioChip({ pos, perf }) {
    if (!pos) return null;
    const weight   = pos.weight != null ? (pos.weight * 100).toFixed(2) + '% weight' : null;
    const mv       = pos.market_value != null ? pos.market_value : null;
    const plDollar = perf && perf.total_return_pct != null && mv != null
        ? (mv / (1 + perf.total_return_pct)) * perf.total_return_pct : null;
    const plColor  = plDollar == null ? '#22c55e' : plDollar >= 0 ? '#22c55e' : '#ef4444';
    const entryStr = perf && perf.entry_price
        ? 'Entry $' + Number(perf.entry_price).toFixed(2)
          + (perf.days_held ? ' · ' + perf.days_held + 'd' : '')
          + (perf.total_return_pct != null
              ? ' · ' + (perf.total_return_pct >= 0 ? '+' : '') + (perf.total_return_pct * 100).toFixed(1) + '%'
              : '')
        : null;
    return React.createElement('div', {
        style: { background: 'rgba(0,212,184,0.08)', border: '1px solid rgba(0,212,184,0.28)', borderRadius: 7, padding: '9px 10px' }
    },
        React.createElement('div', {
            style: { fontSize: 7.5, letterSpacing: 1.2, textTransform: 'uppercase', color: '#00d4b8', marginBottom: 6 }
        }, '◈ In Portfolio · Atlas Position'),
        React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }
        },
            React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)' } }, weight || '—'),
            plDollar != null && React.createElement('div', { style: { fontSize: 13, fontWeight: 700, color: plColor } },
                (plDollar >= 0 ? '+' : '') + '$' + Math.abs(plDollar).toFixed(0))
        ),
        entryStr && React.createElement('div', { style: { fontSize: 8, color: 'rgba(255,255,255,0.35)' } }, entryStr)
    );
}

function SidebarMetricTiles({ rawOverview, m }) {
    const nf = (v) => { const x = parseFloat(v); return isFinite(x) ? x : null; };
    const beta  = nf(rawOverview && rawOverview.Beta);
    const vol   = m && m.vol30d;
    const ma50  = nf(rawOverview && rawOverview['50DayMovingAverage']);
    const ma200 = nf(rawOverview && rawOverview['200DayMovingAverage']);
    const curr  = m && m.current;
    const vs50  = ma50 > 0 && curr ? (curr - ma50) / ma50 : null;
    const vs200 = ma200 > 0 && curr ? (curr - ma200) / ma200 : null;

    const betaColor = beta == null ? null : beta > 1.5 ? '#ef4444' : beta > 1.0 ? '#f59e0b' : '#22c55e';
    const volColor  = vol  == null ? null : vol  > 0.50 ? '#ef4444' : vol  > 0.25 ? '#f59e0b' : '#22c55e';
    const pctColor  = (v) => v == null ? null : v >= 0 ? '#22c55e' : '#ef4444';
    const pctFmt    = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';

    const tiles = [
        { label: 'Beta',      value: beta != null ? beta.toFixed(2) : '—', color: betaColor },
        { label: 'Ann. Vol',  value: vol  != null ? (vol * 100).toFixed(1) + '%' : '—', color: volColor },
        { label: 'vs 50DMA',  value: pctFmt(vs50),  color: pctColor(vs50) },
        { label: 'vs 200DMA', value: pctFmt(vs200), color: pctColor(vs200) },
    ];

    return React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 } },
        tiles.map(function(t) {
            return React.createElement('div', {
                key: t.label,
                style: { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, padding: '7px 8px' }
            },
                React.createElement('div', {
                    style: { fontSize: 7.5, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 3 }
                }, t.label),
                React.createElement('div', {
                    style: { fontSize: 12, fontWeight: 600, color: t.color || 'rgba(255,255,255,0.88)' }
                }, t.value)
            );
        })
    );
}

function Sidebar52WRange({ low, high, current }) {
    if (low == null || high == null || current == null || high <= low) return null;
    const pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
    return React.createElement('div', {
        style: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, padding: '9px 10px' }
    },
        React.createElement('div', {
            style: { fontSize: 7.5, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }
        }, '52-Week Range · ' + Math.round(pct) + 'th Percentile'),
        React.createElement('div', {
            style: { position: 'relative', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, margin: '0 0 6px' }
        },
            React.createElement('div', {
                style: { position: 'absolute', top: 0, left: 0, height: '100%', width: pct + '%', borderRadius: 3, background: 'linear-gradient(90deg,rgba(34,197,94,0.4),rgba(0,212,184,0.6))' }
            }),
            React.createElement('div', {
                style: { position: 'absolute', top: -5, left: pct + '%', width: 16, height: 16, borderRadius: '50%', background: '#00d4b8', border: '2px solid #07091a', marginLeft: -8, boxShadow: '0 0 8px rgba(0,212,184,0.5)' }
            })
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 7.5 } },
            React.createElement('span', { style: { color: 'rgba(255,255,255,0.3)' } }, '$' + low.toFixed(2)),
            React.createElement('span', { style: { color: '#00d4b8', fontWeight: 600 } }, '$' + current.toFixed(0)),
            React.createElement('span', { style: { color: 'rgba(255,255,255,0.3)' } }, '$' + high.toFixed(2))
        )
    );
}

function SidebarPerfBadges({ m }) {
    if (!m) return null;
    const periods = [
        { label: '1D', value: m.ret1D }, { label: '1W', value: m.ret1W },
        { label: '1M', value: m.ret1M }, { label: '3M', value: m.ret3M },
        { label: '1Y', value: m.ret1Y },
    ];
    return React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4 } },
        periods.map(function(p) {
            const v = p.value;
            const bg    = v == null ? 'rgba(255,255,255,0.04)' : v >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
            const color = v == null ? 'rgba(255,255,255,0.35)' : v >= 0 ? '#22c55e' : '#ef4444';
            const txt   = v == null ? p.label + ' —'
                : p.label + ' ' + (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
            return React.createElement('div', {
                key: p.label,
                style: { fontSize: 7.5, padding: '3px 6px', borderRadius: 4, fontWeight: 600, background: bg, color }
            }, txt);
        })
    );
}

function SidebarAnalystCard({ rawOverview, current }) {
    if (!rawOverview || !current) return null;
    const nf = (v) => { const x = parseFloat(v); return isFinite(x) && x > 0 ? x : null; };
    const target = nf(rawOverview.AnalystTargetPrice);
    if (!target) return null;
    const buys  = (nf(rawOverview.AnalystRatingStrongBuy) || 0) + (nf(rawOverview.AnalystRatingBuy) || 0);
    const holds = nf(rawOverview.AnalystRatingHold) || 0;
    const sells = (nf(rawOverview.AnalystRatingSell) || 0) + (nf(rawOverview.AnalystRatingStrongSell) || 0);
    const total = buys + holds + sells;
    const upside = (target / current - 1) * 100;
    const upsideColor = upside >= 10 ? '#22c55e' : upside >= 0 ? '#f59e0b' : '#ef4444';
    const rangeLow  = Math.min(current * 0.80, target * 0.80);
    const rangeHigh = Math.max(current * 1.10, target * 1.10);
    const span = rangeHigh - rangeLow;
    const barPos = (v) => Math.max(1, Math.min(99, (v - rangeLow) / span * 100));
    const curPos = barPos(current);
    const tgtPos = barPos(target);

    return React.createElement('div', {
        style: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, padding: '9px 10px' }
    },
        React.createElement('div', {
            style: { fontSize: 7.5, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 7 }
        }, 'Analyst Consensus' + (total > 0 ? ' · ' + total + ' Analysts' : '')),
        total > 0 && React.createElement('div', {
            style: { display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 2, marginBottom: 6 }
        },
            buys  > 0 && React.createElement('div', { style: { flex: buys,  background: '#22c55e', borderRadius: 3 } }),
            holds > 0 && React.createElement('div', { style: { flex: holds, background: '#f59e0b', borderRadius: 3 } }),
            sells > 0 && React.createElement('div', { style: { flex: Math.max(sells, 0.5), background: '#ef4444', borderRadius: 3 } })
        ),
        total > 0 && React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', fontSize: 7.5, color: 'rgba(255,255,255,0.3)', marginBottom: 8 }
        },
            React.createElement('span', null, buys + ' Buy'),
            React.createElement('span', null, holds + ' Hold'),
            React.createElement('span', null, sells + ' Sell')
        ),
        React.createElement('div', { style: { fontSize: 8.5, color: 'rgba(255,255,255,0.35)' } },
            'Mean target ',
            React.createElement('span', { style: { color: upsideColor, fontWeight: 600 } }, '$' + target.toFixed(2)),
            React.createElement('span', { style: { color: 'rgba(255,255,255,0.25)' } },
                ' · ' + (upside >= 0 ? '+' : '') + upside.toFixed(1) + '% upside')
        ),
        React.createElement('div', {
            style: { position: 'relative', height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginTop: 8 }
        },
            React.createElement('div', {
                style: { position: 'absolute', top: 0, left: Math.min(curPos, tgtPos) + '%', width: Math.abs(tgtPos - curPos) + '%', height: '100%', background: 'rgba(34,197,94,0.3)', borderRadius: 2 }
            }),
            React.createElement('div', {
                style: { position: 'absolute', top: -5, left: curPos + '%', width: 2, height: 14, background: '#00d4b8', borderRadius: 1 }
            }),
            React.createElement('div', {
                style: { position: 'absolute', top: -5, left: tgtPos + '%', width: 2, height: 14, background: '#22c55e', borderRadius: 1 }
            })
        ),
        React.createElement('div', {
            style: { display: 'flex', justifyContent: 'space-between', fontSize: 7.5, color: 'rgba(255,255,255,0.2)', marginTop: 6 }
        },
            React.createElement('span', null, '$' + Math.round(rangeLow) + ' low'),
            React.createElement('span', { style: { color: '#00d4b8' } }, '$' + current.toFixed(0) + ' now'),
            React.createElement('span', { style: { color: '#22c55e' } }, '$' + target.toFixed(0) + ' target')
        )
    );
}

// ── Legacy EarningsSummary kept for possible reuse ──────────────────────────

function EarningsSummary({ quarterly, snapshot }) {
    if (!quarterly || !quarterly.length) {
        return React.createElement('div', { className: 'card', style: { color: 'var(--text-muted)' } }, 'No earnings data available.');
    }
    let streak = 0;
    for (let i = 0; i < quarterly.length; i++) {
        if (quarterly[i].actual != null && quarterly[i].estimate != null && quarterly[i].actual >= quarterly[i].estimate) streak++;
        else break;
    }
    const title = 'Earnings Quality' + (streak >= 2 ? ' — ' + streak + ' Consecutive Beats' : '') + ' · Live Data';
    const recent = quarterly.slice(0, 2);
    const revGrowth = snapshot && parseFloat(snapshot.revenueGrowth);
    const epsGrowth = snapshot && parseFloat(snapshot.earningsGrowth || snapshot.trailingEpsGrowth);

    function EqCard(cp) {
        return React.createElement('div', {
            style: { flex: 1, borderRadius: 6, padding: '10px 12px', background: cp.bg, border: '1px solid ' + cp.bdr }
        },
            React.createElement('div', { style: { fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', color: cp.lc, marginBottom: 5 } }, cp.label),
            React.createElement('div', { style: { fontSize: 22, fontWeight: 700, color: cp.color, lineHeight: 1 } }, cp.value),
            cp.sub1 && React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 4 } }, cp.sub1),
            cp.sub2 && React.createElement('div', { style: { fontSize: 10, fontWeight: 600, color: cp.color, marginTop: 3 } }, cp.sub2)
        );
    }

    function makeQCard(q, key) {
        if (!q) return null;
        const beat = q.actual >= q.estimate;
        const color = beat ? '#22c55e' : '#ef4444';
        const surprise = q.estimate ? ((q.actual - q.estimate) / Math.abs(q.estimate) * 100) : null;
        return React.createElement(EqCard, {
            key,
            color, lc: beat ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)',
            label: q.quarter,
            value: '$' + fmt(q.actual),
            sub1: 'vs $' + fmt(q.estimate) + ' est',
            sub2: surprise != null ? (beat ? 'Beat +' : 'Miss ') + Math.abs(surprise).toFixed(1) + '%' : null,
            bg:  beat ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
            bdr: beat ? 'rgba(34,197,94,0.2)'  : 'rgba(239,68,68,0.2)',
        });
    }

    const revValid = isFinite(revGrowth) && revGrowth;
    const epsValid = isFinite(epsGrowth) && epsGrowth;

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title' }, title),
        React.createElement('div', { className: 'card-sub' }, 'Quarterly EPS vs Estimate · Revenue Growth'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 } },
            makeQCard(recent[0], 'q0'),
            makeQCard(recent[1], 'q1'),
            React.createElement(EqCard, {
                key: 'rev',
                color: '#00d4b8', lc: 'rgba(0,212,184,0.7)',
                label: 'Revenue Growth YoY',
                value: revValid ? (revGrowth >= 0 ? '+' : '') + (revGrowth * 100).toFixed(1) + '%' : '—',
                sub1: snapshot && snapshot.totalRevenue
                    ? '$' + (parseFloat(snapshot.totalRevenue) / 1e9).toFixed(1) + 'B TTM revenue' : null,
                sub2: epsValid ? 'EPS growth ' + (epsGrowth >= 0 ? '+' : '') + (epsGrowth * 100).toFixed(1) + '%' : null,
                bg: 'rgba(0,212,184,0.05)', bdr: 'rgba(0,212,184,0.18)',
            })
        )
    );
}

// ── New 6-tab main panel ─────────────────────────────────────────────────────

var MAIN_TABS = [
    { id: 'thesis',  label: 'Thesis' },
    { id: 'val',     label: 'Valuation' },
    { id: 'qual',    label: 'Quality & Forensics' },
    { id: 'cap',     label: 'Capital Allocation' },
    { id: 'factor',  label: 'Factor Lens',  isNew: true },
    { id: 'tech',    label: 'Technicals & Peers' },
];

function MainPanel({ symbol, financials, rawOverview, overview, series, peers, derived }) {
    const [tab,       setTab]      = useState('thesis');
    const [blendedFV, setBlendedFV]= useState(null);
    const [ev_pw,     setEVPW]     = useState(null);

    const price = series && series.length ? series[series.length - 1].close : null;
    const snap  = financials && financials.snapshot;
    const inp   = parseInputs(rawOverview, snap, price);

    var tabContent = null;
    if (tab === 'thesis')  tabContent = React.createElement(ThesisTab,  { inputs: inp, price, onBlendedFV: setBlendedFV, onEVPW: setEVPW });
    if (tab === 'val')     tabContent = React.createElement(ValuationTab, { inputs: inp, price });
    if (tab === 'qual')    tabContent = React.createElement(QualityTab,  { inputs: inp, derived, snap });
    if (tab === 'cap')     tabContent = React.createElement(CapitalTab,  { inputs: inp, derived });
    if (tab === 'factor')  tabContent = React.createElement(FactorTab,   { inputs: inp, derived });
    if (tab === 'tech')    tabContent = React.createElement(TechnicalsAndPeersTab, { inputs: inp, price, series, rawOverview, peers, symbol });

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 } },
        // verdict strip
        React.createElement(VerdictStrip, { inputs: inp, price, ev_pw, derived, style: { margin: '8px 14px 0' } }),
        // tab bar
        React.createElement('div', {
            style: { display: 'flex', background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, flexWrap: 'wrap' }
        },
            MAIN_TABS.map(function(t) {
                var active = t.id === tab;
                return React.createElement('div', {
                    key: t.id,
                    onClick: function() { setTab(t.id); },
                    style: {
                        fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
                        color: active ? '#22d3ee' : 'rgba(255,255,255,0.25)',
                        padding: '9px 15px',
                        borderBottom: '2px solid ' + (active ? '#22d3ee' : 'transparent'),
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: 4,
                    }
                },
                    t.label,
                    t.isNew && React.createElement('span', {
                        style: { fontSize: 7, background: 'rgba(34,211,238,0.15)', color: '#22d3ee', padding: '1px 5px', borderRadius: 6, letterSpacing: 0 }
                    }, 'NEW')
                );
            })
        ),
        // panel
        React.createElement('div', { style: { flex: 1, overflowY: 'auto', padding: '14px 16px' } },
            tabContent
        )
    );
}

// ── Main export ─────────────────────────────────────────────────────────────

export function EquityResearch(props) {
    const [input,  setInput]  = useState('AAPL');
    const [symbol, setSymbol] = useState(null);
    const [status, setStatus] = useState('idle');
    const [errMsg, setErrMsg] = useState(null);
    const [payload, setPayload] = useState(null);
    const [derived, setDerived] = useState(null);
    const [portfolioPos,  setPortfolioPos]  = useState(null);
    const [portfolioPerf, setPortfolioPerf] = useState(null);

    const analyse = useCallback(function(raw) {
        const s = (raw || '').trim().toUpperCase();
        if (!s) return;
        if (!/^[A-Z0-9.\-]{1,12}$/.test(s)) {
            setErrMsg('Ticker must be 1–12 characters of A–Z / 0–9 / . / -');
            setStatus('error'); return;
        }
        setSymbol(s);
    }, []);

    useEffect(function() {
        const sym = props && props.initialSymbol;
        if (!sym) return;
        setInput(sym); analyse(sym);
    }, [props && props.initialSymbol]);

    useEffect(function() {
        if (!symbol) return;
        let cancelled = false;
        setStatus('loading'); setErrMsg(null); setPayload(null);
        fetch('/api/equity?symbol=' + encodeURIComponent(symbol))
            .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, status: r.status, body: j }; }); })
            .then(function(res) {
                if (cancelled) return;
                if (!res.ok) { setErrMsg((res.body && res.body.error) || 'HTTP ' + res.status); setStatus('error'); return; }
                setPayload(res.body); setStatus('ready');
            })
            .catch(function(e) { if (!cancelled) { setErrMsg((e && e.message) || 'Network error'); setStatus('error'); } });
        return function() { cancelled = true; };
    }, [symbol]);

    useEffect(function() {
        setPortfolioPos(null); setPortfolioPerf(null); setDerived(null);
        if (!symbol || !sb) return;
        sb.from('vw_risk_analysis').select('symbol,market_value,weight,dollar_var_95_daily').eq('symbol', symbol).maybeSingle()
            .then(function(res) { if (res.data) setPortfolioPos(res.data); });
        sb.from('vw_performance_suite').select('symbol,total_return_pct,entry_price,days_held').eq('symbol', symbol).maybeSingle()
            .then(function(res) { if (res.data) setPortfolioPerf(res.data); });
        // Load precomputed quality/forensic scores — gracefully absent until sync_fundamentals runs
        sb.from('equity_fundamentals_derived')
            .select('*').eq('ticker', symbol).order('fiscal_year', { ascending: false }).limit(1).maybeSingle()
            .then(function(res) { if (res.data) setDerived(res.data); });
    }, [symbol]);

    function saveToScrapbook() {
        if (!symbol) return;
        window.dispatchEvent(new CustomEvent('atlas:open-scrapbook', { detail: { ticker: symbol } }));
    }

    const searchBar = React.createElement('div', {
        style: { display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', flexShrink: 0 }
    },
        React.createElement('div', { className: 'page-title', style: { margin: 0, flexShrink: 0 } }, 'Equity Research'),
        React.createElement('input', {
            type: 'text', value: input,
            onChange: function(e) { setInput(e.target.value); },
            onKeyDown: function(e) { if (e.key === 'Enter') analyse(input); },
            placeholder: 'Ticker — AAPL, MSFT, AMD…',
            spellCheck: false,
            style: {
                flex: 1, background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                padding: '8px 12px', color: 'rgba(255,255,255,0.92)',
                fontFamily: 'inherit', fontSize: 13,
                textTransform: 'uppercase', letterSpacing: 1,
            }
        }),
        React.createElement('button', {
            onClick: function() { analyse(input); },
            disabled: status === 'loading',
            style: {
                background: 'linear-gradient(135deg,#00d4b8,#6366f1)', color: '#fff',
                border: 'none', borderRadius: 6, padding: '8px 18px',
                fontWeight: 600, cursor: status === 'loading' ? 'not-allowed' : 'pointer',
                opacity: status === 'loading' ? 0.6 : 1,
                fontSize: 12, textTransform: 'uppercase', letterSpacing: 1,
            }
        }, status === 'loading' ? 'Loading…' : 'Analyse'),
        status === 'ready' && symbol && React.createElement('button', {
            onClick: saveToScrapbook,
            style: {
                background: 'rgba(139,92,246,0.15)', color: '#8b5cf6',
                border: '1px solid rgba(139,92,246,0.35)', borderRadius: 6,
                padding: '8px 14px', fontWeight: 600, cursor: 'pointer',
                fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8,
            }
        }, '📒 Scrapbook')
    );

    if (status === 'idle') {
        return React.createElement('div', null, searchBar,
            React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } },
                'Enter a ticker above to fetch fundamentals, valuation, and technicals.'));
    }
    if (status === 'loading') return React.createElement('div', null, searchBar, React.createElement(Loading, null));
    if (status === 'error') {
        return React.createElement('div', null, searchBar,
            React.createElement('div', { className: 'card', style: { borderColor: 'rgba(239,68,68,0.3)' } },
                React.createElement('div', { className: 'card-title', style: { color: 'var(--red)' } }, 'Request failed'),
                React.createElement('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.7)' } }, errMsg || 'Unknown error')
            )
        );
    }

    // ── Ready state ───────────────────────────────────────────────────────────
    const series      = parseDaily(payload && payload.daily);
    const metrics     = deriveMetrics(series);
    const overview    = parseOverview(payload && payload.overview); // parsed — DCFEngine compat
    const rawOverview = payload && payload.overview;               // raw AV fields — panels

    if (!metrics && !overview) return React.createElement('div', null, searchBar, React.createElement(EmptyState, null));

    const m = metrics || {};

    // Sidebar footer quick-stats strip
    const mktCap   = parseFloat(rawOverview && rawOverview.MarketCapitalization);
    const eps      = parseFloat(rawOverview && rawOverview.EPS);
    const revTTM   = parseFloat(rawOverview && rawOverview.RevenueTTM);
    const insiders = parseFloat(rawOverview && rawOverview.PercentInsiders);
    const footerParts = [];
    if (isFinite(mktCap) && mktCap > 0) footerParts.push('Cap $' + (mktCap / 1e9).toFixed(1) + 'B');
    if (isFinite(eps))                   footerParts.push('EPS $' + eps.toFixed(2));
    if (isFinite(revTTM) && revTTM > 0)  footerParts.push('Rev $' + (revTTM / 1e9).toFixed(1) + 'B');
    if (isFinite(insiders))              footerParts.push('Ins. ' + insiders.toFixed(2) + '%');

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
        searchBar,
        React.createElement('div', { style: { display: 'flex', flex: 1, minHeight: 0 } },

            // ── SIDEBAR ────────────────────────────────────────────────────
            React.createElement('div', {
                style: {
                    width: 210, flexShrink: 0,
                    borderRight: '1px solid rgba(255,255,255,0.07)',
                    padding: '14px 13px', overflowY: 'auto',
                    background: 'rgba(3,5,12,0.5)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                }
            },
                React.createElement(CompanyHeader, { rawOverview, current: m.current, ret1D: m.ret1D }),
                React.createElement(PortfolioChip, { pos: portfolioPos, perf: portfolioPerf }),
                React.createElement(SidebarMetricTiles, { rawOverview, m }),
                m.low52 != null
                    ? React.createElement(Sidebar52WRange, { low: m.low52, high: m.high52, current: m.current })
                    : null,
                React.createElement(SidebarPerfBadges, { m }),
                React.createElement(SidebarAnalystCard, { rawOverview, current: m.current }),
                footerParts.length > 0 && React.createElement('div', {
                    style: { fontSize: 7.5, color: 'rgba(255,255,255,0.18)', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.7 }
                }, footerParts.join(' · '))
            ),

            // ── MAIN AREA ──────────────────────────────────────────────────
            React.createElement(MainPanel, {
                symbol,
                financials: payload && payload.financials,
                rawOverview,
                overview,
                series,
                peers: payload && payload.peers,
                derived,
            })
        )
    );
}
