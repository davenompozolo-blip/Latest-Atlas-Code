// ============================================================
// ATLAS Terminal — Market Watch
// ------------------------------------------------------------
// Full market overview tab replicating Streamlit market_watch:
//   OVERVIEW  — Regime pulse bar + global asset universe
//   SECTORS   — GICS sector ETF performance + bar chart
//   REGIME    — Macro quadrant (reuses macro-regime panel)
//   CROSS-ASSET — Heatmap + credit + barometer (reuses macro-markets)
//
// Data: /api/macro (same endpoint as MacroDashboard)
// ============================================================

import { fmt, fmtPct, fmtCurrency, useChart } from './utils.js';
import { Loading, EmptyState, HeroCard, NarrativeStrip } from './components.js';
import { RegimePanel } from './macro-regime.js';
import { MarketsPanel } from './macro-markets.js';

var useState = React.useState, useEffect = React.useEffect, useRef = React.useRef, useMemo = React.useMemo;
var h = React.createElement;

// ---- Asset registry ----
var ASSET_GROUPS = [
    {
        label: 'US EQUITIES',
        symbols: ['SPY', 'QQQ', 'IWM'],
        names: { SPY: 'S&P 500', QQQ: 'Nasdaq 100', IWM: 'Russell 2K' },
    },
    {
        label: 'GLOBAL',
        symbols: ['EFA', 'EEM', 'EWJ', 'EWG', 'EWU'],
        names: { EFA: 'MSCI EAFE', EEM: 'Emerging Mkts', EWJ: 'Japan', EWG: 'Germany', EWU: 'UK' },
    },
    {
        label: 'FIXED INCOME',
        symbols: ['TLT', 'HYG', 'LQD'],
        names: { TLT: '20Y Treasury', HYG: 'HY Corp Bonds', LQD: 'IG Corp Bonds' },
    },
    {
        label: 'ALTERNATIVES',
        symbols: ['GLD', 'USO', 'UUP'],
        names: { GLD: 'Gold', USO: 'Crude Oil', UUP: 'USD Index' },
    },
];

// ---- Helpers ----
function findQ(market, sym) { return (market || []).find(function(q) { return q.symbol === sym; }) || null; }
function chCol(v) { return v == null ? 'rgba(255,255,255,0.5)' : v > 0 ? '#10b981' : v < 0 ? '#ef4444' : 'rgba(255,255,255,0.6)'; }
function heatBg(pct) {
    if (pct == null) return 'rgba(255,255,255,0.04)';
    var i = Math.min(Math.abs(pct) / 3, 1);
    return pct > 0 ? 'rgba(16,185,129,' + (0.07 + i * 0.22) + ')' : 'rgba(239,68,68,' + (0.07 + i * 0.22) + ')';
}
function fN(n, d) { return n != null && isFinite(n) ? Number(n).toFixed(d != null ? d : 2) : '—'; }
function chStr(v) { return v == null ? '—' : (v >= 0 ? '+' : '') + fN(v) + '%'; }
function latestVal(arr) { return arr && arr.length ? arr[arr.length - 1].value : null; }

// ============================================================
// 1. TradingView index chart (iframe embed)
// ============================================================
function TVIndexChart(p) {
    var intervalMap = { '1D': '5', '5D': '15', '1M': 'D', '3M': 'D', '6M': 'W', '1Y': 'W' };
    var rangeMap    = { '1D': '1D', '5D': '5D', '1M': '1M', '3M': '3M', '6M': '6M', '1Y': '12M' };
    var src = 'https://www.tradingview.com/widgetembed/?symbol=' + encodeURIComponent(p.symbol) +
        '&interval=' + (intervalMap[p.period] || 'D') +
        '&range='     + (rangeMap[p.period]    || '3M') +
        '&theme=dark&style=1&locale=en&hide_side_toolbar=1&allow_symbol_change=0' +
        '&save_image=0&details=0&hotlist=0&calendar=0';
    return h('div', { style: { borderRadius: 8, overflow: 'hidden', background: '#0b1120', height: 220, border: '1px solid rgba(255,255,255,0.06)' } },
        h('iframe', { key: p.symbol + '_' + p.period, src: src, style: { width: '100%', height: '100%', border: 'none', display: 'block' }, scrolling: 'no', title: p.symbol })
    );
}

// ============================================================
// 2. Index charts section with period selector
// ============================================================
function IndexChartsSection() {
    var _p = useState('3M');
    var period = _p[0], setPeriod = _p[1];
    var PERIODS = ['1D', '5D', '1M', '3M', '6M', '1Y'];
    var INDICES = [
        { symbol: 'SPY', label: 'S&P 500 (SPY)' },
        { symbol: 'QQQ', label: 'Nasdaq 100 (QQQ)' },
        { symbol: 'DIA', label: 'Dow Jones (DIA)' },
        { symbol: 'IWM', label: 'Russell 2000 (IWM)' },
    ];
    return h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
            h('div', { className: 'card-title', style: { marginBottom: 0 } }, 'Major Indices'),
            h('div', { style: { display: 'flex', gap: 4 } },
                PERIODS.map(function(pd) {
                    var a = pd === period;
                    return h('button', {
                        key: pd, onClick: function() { setPeriod(pd); },
                        style: { padding: '3px 9px', fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: a ? 700 : 400, borderRadius: 4, border: '1px solid ' + (a ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.1)'), background: a ? 'rgba(0,212,255,0.12)' : 'transparent', color: a ? '#00d4ff' : 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'all 0.1s' }
                    }, pd);
                })
            )
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 } },
            INDICES.map(function(idx) {
                return h('div', { key: idx.symbol },
                    h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono', marginBottom: 4, letterSpacing: 0.5 } }, idx.label),
                    h(TVIndexChart, { symbol: idx.symbol, period: period })
                );
            })
        )
    );
}

// ============================================================
// 3. Market movers + cap spectrum (fetches /api/movers)
// ============================================================
function MoversSection() {
    var _d = useState(null), moversData = _d[0], setMoversData = _d[1];
    var _s = useState('loading'), mStatus = _s[0], setMStatus = _s[1];
    var _t = useState('top'), mTab = _t[0], setMTab = _t[1];

    useEffect(function() {
        fetch('/api/movers').then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(d) { setMoversData(d); setMStatus('ready'); })
          .catch(function() { setMStatus('error'); });
    }, []);

    if (mStatus === 'error') return null;
    if (mStatus === 'loading') return h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
        h('div', { className: 'card', style: { padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11 } }, 'Loading movers…'),
        h('div', { className: 'card', style: { padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11 } }, 'Loading cap spectrum…')
    );

    var topMovers    = (moversData && moversData.top)         || [];
    var bottomMovers = (moversData && moversData.bottom)      || [];
    var capSpectrum  = (moversData && moversData.capSpectrum) || [];
    var displayMovers = mTab === 'top' ? topMovers : bottomMovers;

    var maxCapAbs = Math.max.apply(null, capSpectrum.map(function(c) { return Math.abs(c.changePct || 0); })) || 1;

    return h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 } },
        // Movers table
        h('div', { className: 'card' },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
                h('div', { className: 'card-title', style: { marginBottom: 0 } }, 'Market Movers'),
                h('div', { style: { display: 'flex', gap: 0, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, overflow: 'hidden' } },
                    h('button', {
                        onClick: function() { setMTab('top'); },
                        style: { padding: '3px 12px', fontSize: 10, border: 'none', background: mTab === 'top' ? 'rgba(16,185,129,0.18)' : 'transparent', color: mTab === 'top' ? '#10b981' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontWeight: mTab === 'top' ? 700 : 400 }
                    }, '▲ TOP'),
                    h('button', {
                        onClick: function() { setMTab('bottom'); },
                        style: { padding: '3px 12px', fontSize: 10, border: 'none', background: mTab === 'bottom' ? 'rgba(239,68,68,0.18)' : 'transparent', color: mTab === 'bottom' ? '#ef4444' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontWeight: mTab === 'bottom' ? 700 : 400 }
                    }, '▼ BOTTOM')
                )
            ),
            h('div', { style: { overflowX: 'auto' } },
                h('table', { className: 'data-table' },
                    h('thead', null,
                        h('tr', null,
                            h('th', null, 'Symbol'),
                            h('th', null, 'Name'),
                            h('th', { style: { textAlign: 'right' } }, 'Price'),
                            h('th', { style: { textAlign: 'right' } }, 'Change')
                        )
                    ),
                    h('tbody', null,
                        displayMovers.map(function(item) {
                            var col = (item.changePct || 0) >= 0 ? '#10b981' : '#ef4444';
                            return h('tr', { key: item.symbol },
                                h('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: '#f1f5f9' } }, item.symbol),
                                h('td', { style: { fontSize: 11, color: 'rgba(255,255,255,0.55)' } }, item.name || item.symbol),
                                h('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: '#f1f5f9', textAlign: 'right' } }, item.price != null ? '$' + fN(item.price) : '—'),
                                h('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: col, textAlign: 'right' } }, chStr(item.changePct))
                            );
                        })
                    )
                )
            )
        ),
        // Cap spectrum
        h('div', { className: 'card' },
            h('div', { className: 'card-title' }, 'Cap Spectrum  ·  Daily Return'),
            capSpectrum.length === 0
                ? h('div', { style: { color: 'rgba(255,255,255,0.3)', fontSize: 11, padding: '20px 0', textAlign: 'center' } }, 'No data')
                : capSpectrum.map(function(item) {
                    var col = (item.changePct || 0) >= 0 ? '#10b981' : '#ef4444';
                    var barPct = Math.min(Math.abs(item.changePct || 0) / maxCapAbs * 100, 100);
                    return h('div', { key: item.symbol, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
                        h('div', { style: { width: 34, fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.75)', flexShrink: 0 } }, item.symbol),
                        h('div', { style: { flex: 1, fontSize: 10, color: 'rgba(255,255,255,0.38)' } }, item.label),
                        h('div', { style: { width: 70, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 } },
                            h('div', { style: { height: '100%', width: barPct.toFixed(1) + '%', background: col, borderRadius: 2 } })
                        ),
                        h('div', { style: { width: 52, fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: col, textAlign: 'right', flexShrink: 0 } }, chStr(item.changePct))
                    );
                })
        )
    );
}

// ============================================================
// 4. Asset tile
// ============================================================
function AssetTile(p) {
    var q = p.q;
    if (!q) return h('div', { style: { flex: 1, minWidth: 120, padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', minHeight: 78 } });
    return h('div', {
        style: {
            flex: 1, minWidth: 120, padding: '12px 14px', borderRadius: 8,
            background: heatBg(q.changePct),
            border: '1px solid rgba(255,255,255,0.06)',
        }
    },
        h('div', { style: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 2, fontFamily: 'JetBrains Mono' } }, q.symbol),
        h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 6, fontFamily: 'DM Sans' } }, p.name || q.symbol),
        h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 2 } },
            q.price != null ? '$' + fN(q.price) : '—'
        ),
        h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: chCol(q.changePct) } }, chStr(q.changePct))
    );
}

// ============================================================
// 5. Sector bar chart
// ============================================================
function SectorBarChart(p) {
    var ref = useRef(null);
    useChart(ref, function() {
        var rows = p.rows;
        if (!rows || !rows.length) return null;
        return {
            type: 'bar',
            data: {
                labels: rows.map(function(r) { return r.symbol; }),
                datasets: [{
                    data: rows.map(function(r) { return r.changePct || 0; }),
                    backgroundColor: rows.map(function(r) {
                        return (r.changePct || 0) >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)';
                    }),
                    borderWidth: 0, borderRadius: 3,
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 10 }, callback: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; } },
                        grid: { color: 'rgba(255,255,255,0.04)' },
                        border: { display: false },
                    },
                    y: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 10 } }, grid: { display: false } }
                }
            }
        };
    }, [p.rows]);
    return h('div', { style: { height: 280 } }, h('canvas', { ref: ref }));
}

// ============================================================
// 6. Overview panel
// ============================================================
function OverviewPanel(p) {
    var data    = p.data || {};
    var market  = data.market || [];
    var credit  = data.credit || {};
    var yields  = data.yields || {};
    var regime  = data.regime || {};
    var all     = data._allQuotes || market; // enriched list includes global ETFs

    var hyVal      = latestVal(credit.hySpreads);
    var nfciVal    = latestVal(credit.nfci);
    var spread2s10s = yields.curve ? yields.curve.spread2s10s : null;
    var dgs10val   = latestVal(yields.dgs10);
    var spy        = findQ(market, 'SPY');

    var hl  = { fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontFamily: 'DM Sans' };
    var hb  = { display: 'flex', flexDirection: 'column', justifyContent: 'center' };
    var sep = { width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 20px', flexShrink: 0 };

    var regColor    = regime.color || '#6366f1';
    var spreadColor = spread2s10s != null ? (spread2s10s < 0 ? '#ef4444' : spread2s10s < 0.5 ? '#f59e0b' : '#10b981') : 'rgba(255,255,255,0.5)';
    var hyColor     = hyVal != null ? (hyVal > 6 ? '#ef4444' : hyVal > 4 ? '#f59e0b' : '#10b981') : 'rgba(255,255,255,0.5)';
    var nfciColor   = nfciVal != null ? (nfciVal > 0 ? '#ef4444' : nfciVal > -0.25 ? '#f59e0b' : '#10b981') : 'rgba(255,255,255,0.5)';
    var spyColor    = spy && spy.changePct != null ? chCol(spy.changePct) : 'rgba(255,255,255,0.85)';

    var mono = function(sz, col) { return { fontFamily: 'JetBrains Mono', fontSize: sz || 18, fontWeight: 700, color: col || 'rgba(255,255,255,0.85)' }; };
    var sub  = function(txt, col) { return h('div', { style: { fontSize: 10, color: col || 'rgba(255,255,255,0.3)', marginTop: 2, fontFamily: 'JetBrains Mono' } }, txt); };

    // Regime KPI pulse bar (red-accent for macro risk)
    var kpiBar = h('div', {
        style: {
            background: 'linear-gradient(135deg,rgba(99,102,241,0.05),rgba(0,212,255,0.04))',
            border: '1px solid rgba(99,102,241,0.15)',
            borderRadius: 10, padding: '14px 22px', marginBottom: 16,
            display: 'flex', alignItems: 'center',
        }
    },
        h('div', { style: hb },
            h('div', { style: hl }, 'Macro Regime'),
            h('div', { style: mono(20, regColor) }, regime.label || 'Assessing'),
            sub('Growth / Inflation quadrant')
        ),
        h('div', { style: sep }),
        h('div', { style: hb },
            h('div', { style: hl }, 'S&P 500'),
            h('div', { style: mono(22, spyColor) }, spy && spy.price != null ? '$' + fN(spy.price) : '—'),
            sub(spy && spy.changePct != null ? chStr(spy.changePct) + ' today' : 'Daily change', spyColor)
        ),
        h('div', { style: sep }),
        h('div', { style: hb },
            h('div', { style: hl }, '10Y Yield'),
            h('div', { style: mono(18) }, dgs10val != null ? fN(dgs10val) + '%' : '—'),
            sub('US 10-year treasury')
        ),
        h('div', { style: sep }),
        h('div', { style: hb },
            h('div', { style: hl }, 'Curve 2s10s'),
            h('div', { style: mono(18, spreadColor) }, spread2s10s != null ? (spread2s10s >= 0 ? '+' : '') + fN(spread2s10s, 2) + '%' : '—'),
            sub(spread2s10s == null ? 'Loading...' : spread2s10s < 0 ? 'Inverted' : spread2s10s < 0.5 ? 'Flat' : 'Normal slope', spreadColor)
        ),
        h('div', { style: sep }),
        h('div', { style: hb },
            h('div', { style: hl }, 'HY OAS'),
            h('div', { style: mono(18, hyColor) }, hyVal != null ? fN(hyVal) + '%' : '—'),
            sub(hyVal != null && hyVal > 6 ? 'Stress elevated' : hyVal != null && hyVal > 4 ? 'Spreads wide' : 'Spreads contained', hyColor)
        ),
        h('div', { style: sep }),
        h('div', { style: hb },
            h('div', { style: hl }, 'NFCI'),
            h('div', { style: mono(18, nfciColor) }, nfciVal != null ? fN(nfciVal) : '—'),
            sub(nfciVal != null && nfciVal > 0 ? 'Tight conditions' : 'Loose conditions', nfciColor)
        )
    );

    // Narrative
    var narr = [];
    if (spy && spy.changePct != null) narr.push({
        icon: '◆',
        text: '<strong>S&P 500 ' + chStr(spy.changePct) + '</strong> — ' + (spy.changePct > 0 ? 'risk appetite supported' : 'risk-off tone today') +
            '  ·  Regime: <strong style="color:' + regColor + '">' + (regime.label || 'Assessing') + '</strong>'
    });
    if (spread2s10s != null) narr.push({
        icon: '≋',
        text: 'Yield curve <strong>' + (spread2s10s >= 0 ? '+' : '') + fN(spread2s10s, 2) + '%</strong> (2s10s) — ' +
            (spread2s10s < 0 ? '<span style="color:#ef4444">inverted, historical recession signal</span>' : spread2s10s < 0.5 ? 'flat curve, growth caution' : 'normal, no inversion')
    });
    if (hyVal != null) narr.push({
        icon: '◈',
        text: 'Credit: HY OAS <strong>' + fN(hyVal) + '%</strong>' + (nfciVal != null ? ', NFCI <strong>' + fN(nfciVal) + '</strong>' : '') +
            ' — ' + (hyVal > 6 ? '<span style="color:#ef4444">credit stress, risk-off caution</span>' : hyVal > 4 ? 'spreads elevated, watch credit' : 'credit markets stable')
    });

    // Asset universe grid
    var assetCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'Global Asset Universe'),
        ASSET_GROUPS.map(function(g) {
            return h('div', { key: g.label, style: { marginBottom: 14 } },
                h('div', { style: { fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 8 } }, g.label),
                h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                    g.symbols.map(function(sym) {
                        return h(AssetTile, { key: sym, q: findQ(all, sym), name: (g.names || {})[sym] });
                    })
                )
            );
        })
    );

    // Intermarket signals
    var tlt = findQ(market, 'TLT');
    var gld = findQ(market, 'GLD');
    var uup = findQ(market, 'UUP');

    function imRow(label, text, color) {
        return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' } },
            h('span', { style: { fontSize: 12, color: 'rgba(255,255,255,0.65)' } }, label),
            h('span', { style: { fontSize: 12, fontWeight: 700, color: color, fontFamily: 'JetBrains Mono' } }, text)
        );
    }

    var svbText = '—', svbColor = 'rgba(255,255,255,0.5)';
    if (spy && tlt && spy.changePct != null && tlt.changePct != null) {
        if (spy.changePct > 0 && tlt.changePct < 0) { svbText = '▲ Risk-On rotation'; svbColor = '#10b981'; }
        else if (spy.changePct < 0 && tlt.changePct > 0) { svbText = '▼ Flight to safety'; svbColor = '#ef4444'; }
        else if (spy.changePct > 0 && tlt.changePct > 0) { svbText = '▲ Broad rally'; svbColor = '#00d4ff'; }
        else { svbText = '▼ Broad selloff'; svbColor = '#f59e0b'; }
    }
    var raText = '—', raColor = 'rgba(255,255,255,0.5)';
    if (spy && gld && spy.changePct != null && gld.changePct != null) {
        if (spy.changePct > 0 && gld.changePct <= 0) { raText = '▲ Risk-seeking'; raColor = '#10b981'; }
        else if (spy.changePct <= 0 && gld.changePct > 0) { raText = '▼ Defensive'; raColor = '#ef4444'; }
        else { raText = '◆ Mixed signals'; raColor = '#f59e0b'; }
    }
    var dolText = '—', dolColor = 'rgba(255,255,255,0.5)';
    if (uup && uup.changePct != null) {
        dolColor = chCol(uup.changePct);
        dolText = (uup.changePct > 0 ? '▲ Strengthening ' : uup.changePct < 0 ? '▼ Weakening ' : '◆ Flat ') + chStr(uup.changePct);
    }

    var imCard = h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Intermarket Signals'),
        imRow('Stocks vs Bonds', svbText, svbColor),
        imRow('Risk Appetite (SPY vs GLD)', raText, raColor),
        imRow('US Dollar (UUP)', dolText, dolColor)
    );

    return h('div', null,
        kpiBar,
        h(NarrativeStrip, { items: narr }),
        h(IndexChartsSection, null),
        h(MoversSection, null),
        assetCard,
        imCard
    );
}

// ============================================================
// 7. Sectors panel
// ============================================================
function SectorsPanel(p) {
    var sectors = p.data && p.data.sectors ? p.data.sectors : [];

    if (!sectors.length) {
        return h('div', { className: 'card', style: { padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)' } },
            'Sector data unavailable — check Finnhub API key.');
    }

    // Count positive/negative
    var up   = sectors.filter(function(s) { return (s.changePct || 0) > 0; }).length;
    var down = sectors.filter(function(s) { return (s.changePct || 0) < 0; }).length;
    var best = sectors[0];
    var worst = sectors[sectors.length - 1];

    // Hero tiles
    var heroRow = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 } },
        h(HeroCard, { icon: '▲', label: 'SECTORS ADVANCING', value: String(up), color: '#10b981', accent: 'green' }),
        h(HeroCard, { icon: '▼', label: 'SECTORS DECLINING', value: String(down), color: '#ef4444', accent: 'red' }),
        h(HeroCard, { icon: '◆', label: 'BEST SECTOR', value: best ? best.name : '—', sub: best ? chStr(best.changePct) : null, color: '#10b981', accent: 'green' }),
        h(HeroCard, { icon: '▽', label: 'WORST SECTOR', value: worst ? worst.name : '—', sub: worst ? chStr(worst.changePct) : null, color: '#ef4444', accent: 'red' })
    );

    // Bar chart
    var barCard = h('div', { className: 'card', style: { marginBottom: 16 } },
        h('div', { className: 'card-title' }, 'GICS Sector Performance (Daily)'),
        h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 8 } },
            'SPDR Sector ETFs — sorted by daily % change'),
        h(SectorBarChart, { rows: sectors })
    );

    // Ranked sector cards
    var maxAbs = Math.max.apply(null, sectors.map(function(s) { return Math.abs(s.changePct || 0); })) || 1;
    var sectorCards = h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Sector Rankings  ·  ' + sectors.length + ' GICS sectors'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 } },
            sectors.map(function(s, idx) {
                var isPos = (s.changePct || 0) >= 0;
                var col   = isPos ? '#10b981' : '#ef4444';
                var bg    = isPos ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)';
                var brd   = isPos ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
                var barPct = Math.abs(s.changePct || 0) / maxAbs * 100;
                var rankBg = idx === 0 ? '#22c55e' : idx === 1 ? '#94a3b8' : idx === 2 ? '#f59e0b' : 'rgba(255,255,255,0.08)';
                return h('div', {
                    key: s.symbol,
                    style: { background: bg, border: '1px solid ' + brd, borderRadius: 10, padding: '12px 14px', position: 'relative', overflow: 'hidden' }
                },
                    h('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: col } }),
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 } },
                        h('span', { style: { fontSize: 12, fontWeight: 700, color: '#f8fafc' } }, s.name),
                        h('span', { style: { background: rankBg, color: idx < 3 ? '#0f172a' : 'rgba(255,255,255,0.6)', padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700 } },
                            '#' + (idx + 1))
                    ),
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 } },
                        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.45)' } }, s.symbol),
                        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700, color: col } }, chStr(s.changePct))
                    ),
                    h('div', { style: { height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' } },
                        h('div', { style: { height: '100%', width: barPct.toFixed(1) + '%', background: col, borderRadius: 2 } })
                    )
                );
            })
        )
    );

    return h('div', null, heroRow, barCard, sectorCards);
}

// ============================================================
// 8. News Panel
// ============================================================
function NewsPanel() {
    var _d = useState(null), newsData = _d[0], setNewsData = _d[1];
    var _s = useState('loading'), status = _s[0], setStatus = _s[1];
    var _f = useState('ALL'), srcFilter = _f[0], setSrcFilter = _f[1];

    var SOURCE_COLORS = { MarketWatch: '#10b981', CNBC: '#00a0dd', Reuters: '#f59e0b', 'Yahoo Finance': '#8b5cf6' };

    function load(nocache) {
        setStatus('loading');
        fetch('/api/news' + (nocache ? '?nocache=1' : '')).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(d) {
            setNewsData(d);
            setStatus('ready');
        }).catch(function() { setStatus('error'); });
    }

    useEffect(function() { load(false); }, []);

    if (status === 'loading') return h(Loading, null);
    if (status === 'error') return h('div', { className: 'card', style: { padding: 32, textAlign: 'center' } },
        h('div', { style: { color: '#ef4444', marginBottom: 10 } }, 'News unavailable'),
        h('button', { onClick: function() { load(true); }, style: { background: 'rgba(0,212,255,0.12)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 6, padding: '7px 18px', cursor: 'pointer', fontSize: 12 } }, 'Retry')
    );

    var items = (newsData && newsData.items) || [];
    var sources = (newsData && newsData.sources) || [];
    var filtered = srcFilter === 'ALL' ? items : items.filter(function(i) { return i.source === srcFilter; });

    // Source filter bar
    var filterBar = h('div', { style: { display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' } },
        h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Sans', marginRight: 4 } }, 'SOURCE:'),
        [{ name: 'ALL', color: '#00d4ff', count: items.length }].concat(sources).map(function(src) {
            var a = srcFilter === src.name;
            var col = src.color || '#00d4ff';
            return h('button', {
                key: src.name, onClick: function() { setSrcFilter(src.name); },
                style: { background: a ? col + '22' : 'rgba(255,255,255,0.04)', color: a ? col : 'rgba(255,255,255,0.45)', border: '1px solid ' + (a ? col + '55' : 'rgba(255,255,255,0.07)'), borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: a ? 700 : 400, cursor: 'pointer', fontFamily: 'DM Sans' }
            }, src.name + ' (' + (src.count != null ? src.count : items.length) + ')');
        }),
        h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
            h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono' } },
                newsData && newsData._ts ? 'Updated ' + new Date(newsData._ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''),
            h('button', { onClick: function() { load(true); }, style: { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '4px 10px', fontSize: 10, cursor: 'pointer' } }, '↻ Refresh')
        )
    );

    if (!filtered.length) return h('div', null, filterBar, h('div', { className: 'card', style: { padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.35)' } }, 'No headlines found.'));

    // 2-column news grid
    var cardGrid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 12 } },
        filtered.map(function(item, idx) {
            var col = SOURCE_COLORS[item.source] || item.color || '#6366f1';
            return h('a', {
                key: idx,
                href: item.link,
                target: '_blank',
                rel: 'noopener noreferrer',
                style: { textDecoration: 'none', display: 'block' }
            },
                h('div', {
                    style: {
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.07), rgba(15,23,42,0.97))',
                        border: '1px solid rgba(99,102,241,0.18)',
                        borderRadius: 12, padding: '14px 16px',
                        position: 'relative', overflow: 'hidden',
                        transition: 'border-color 0.15s',
                    }
                },
                    h('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,' + col + ',#6366f1)', opacity: 0.85 } }),
                    item.thumbnail ? h('div', { style: { margin: '-14px -16px 12px -16px', height: 148, overflow: 'hidden', borderRadius: '11px 11px 0 0' } },
                        h('img', { src: item.thumbnail, alt: '', loading: 'lazy', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' }, onError: function(e) { e.target.parentNode.style.display = 'none'; } })
                    ) : null,
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                        h('span', { style: { background: col, color: '#0f172a', padding: '2px 8px', borderRadius: 6, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' } }, item.source),
                        h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono' } }, item.timeAgo)
                    ),
                    h('div', { style: { fontSize: 13, fontWeight: 600, color: '#f1f5f9', lineHeight: 1.45, marginBottom: 7, fontFamily: 'DM Sans' } }, item.title),
                    item.summary ? h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.55, marginBottom: 8, fontFamily: 'DM Sans' } }, item.summary) : null,
                    h('span', { style: { fontSize: 10.5, color: col, fontWeight: 500, fontFamily: 'DM Sans' } }, 'Read More →')
                )
            );
        })
    );

    return h('div', null, filterBar, cardGrid);
}

// ============================================================
// 9. Calendar Panel
// ============================================================
function CalendarPanel() {
    var _d = useState(null), calData = _d[0], setCalData = _d[1];
    var _s = useState('loading'), status = _s[0], setStatus = _s[1];
    var _imp = useState({ High: true, Medium: true, Low: false }), imp = _imp[0], setImp = _imp[1];

    function load(nocache) {
        setStatus('loading');
        fetch('/api/calendar' + (nocache ? '?nocache=1' : '')).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function(d) {
            setCalData(d);
            setStatus('ready');
        }).catch(function() { setStatus('error'); });
    }

    useEffect(function() { load(false); }, []);

    if (status === 'loading') return h(Loading, null);
    if (status === 'error') return h('div', { className: 'card', style: { padding: 32, textAlign: 'center' } },
        h('div', { style: { color: '#ef4444', marginBottom: 10 } }, 'Calendar unavailable'),
        h('button', { onClick: function() { load(true); }, style: { background: 'rgba(0,212,255,0.12)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 6, padding: '7px 18px', cursor: 'pointer', fontSize: 12 } }, 'Retry')
    );

    var events = (calData && calData.events) || [];
    var filtered = events.filter(function(e) { return imp[e.importance]; });
    var upcoming = filtered.filter(function(e) { return e.daysUntil >= 0; });
    var highCount = upcoming.filter(function(e) { return e.importance === 'High'; }).length;
    var next3 = filtered.filter(function(e) { return e.daysUntil >= 0; }).slice(0, 3);

    // Import classification colours
    function impCol(i) { return i === 'High' ? '#ef4444' : i === 'Medium' ? '#f59e0b' : '#10b981'; }
    function impBg(i)  { return i === 'High' ? 'rgba(239,68,68,0.12)' : i === 'Medium' ? 'rgba(245,158,11,0.10)' : 'rgba(16,185,129,0.08)'; }
    function impBrd(i) { return i === 'High' ? 'rgba(239,68,68,0.28)' : i === 'Medium' ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.2)'; }

    // Top upcoming alert cards
    var alertRow = next3.length ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 16 } },
        next3.map(function(e, i) {
            var col = impCol(e.importance);
            return h('div', { key: i, style: { background: impBg(e.importance), border: '1px solid ' + impBrd(e.importance), borderRadius: 12, padding: '14px 16px', position: 'relative', overflow: 'hidden' } },
                h('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,' + col + ',transparent)' } }),
                h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'JetBrains Mono', marginBottom: 4 } },
                    e.date + (e.time ? '  ·  ' + e.time : '')),
                h('div', { style: { fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 4, fontFamily: 'DM Sans', lineHeight: 1.3 } }, e.event),
                h('div', { style: { fontSize: 11, color: col, fontWeight: 600, fontFamily: 'JetBrains Mono' } },
                    e.daysUntil === 0 ? 'Today' : e.daysUntil === 1 ? 'Tomorrow' : 'In ' + e.daysUntil + ' days')
            );
        })
    ) : null;

    // KPI row
    var kpiRow = h('div', { style: { display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' } },
        h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Sans' } },
            'Showing ' + filtered.length + ' events over next ' + ((calData && calData.window) ? '60 days' : '—')),
        h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8 } },
            ['High', 'Medium', 'Low'].map(function(level) {
                var on = imp[level];
                var col = impCol(level);
                return h('button', {
                    key: level,
                    onClick: function() { setImp(Object.assign({}, imp, { [level]: !on })); },
                    style: { background: on ? col + '18' : 'rgba(255,255,255,0.04)', color: on ? col : 'rgba(255,255,255,0.3)', border: '1px solid ' + (on ? col + '44' : 'rgba(255,255,255,0.07)'), borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: on ? 700 : 400, cursor: 'pointer', fontFamily: 'DM Sans' }
                }, level + ' Impact');
            })
        )
    );

    // Events table
    var table = h('div', { className: 'card' },
        h('div', { className: 'card-title' }, 'Upcoming Economic Events'),
        h('div', { style: { overflowX: 'auto' } },
            h('table', { className: 'data-table' },
                h('thead', null,
                    h('tr', null,
                        ['Date', 'Time', 'Event', 'Category', 'Days', 'Impact'].map(function(col) {
                            return h('th', { key: col }, col);
                        })
                    )
                ),
                h('tbody', null,
                    filtered.slice(0, 80).map(function(e, idx) {
                        var col = impCol(e.importance);
                        var isPast = e.daysUntil < 0;
                        var isToday = e.daysUntil === 0;
                        var rowOpacity = isPast ? 0.45 : 1;
                        return h('tr', { key: idx, style: { opacity: rowOpacity } },
                            h('td', { style: { fontFamily: 'JetBrains Mono', color: isToday ? '#00d4ff' : 'rgba(255,255,255,0.75)', fontWeight: isToday ? 700 : 400 } }, e.date),
                            h('td', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: 'rgba(255,255,255,0.4)' } }, e.time || '—'),
                            h('td', { style: { fontWeight: 600, color: '#f1f5f9' } }, e.event),
                            h('td', { style: { color: 'rgba(255,255,255,0.5)', fontSize: 11 } }, e.category),
                            h('td', { style: { fontFamily: 'JetBrains Mono', color: e.daysUntil === 0 ? '#00d4ff' : e.daysUntil > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)', fontWeight: e.daysUntil === 0 ? 700 : 400 } },
                                isPast ? 'Past' : isToday ? 'TODAY' : e.daysUntil + 'd'),
                            h('td', null,
                                h('span', { style: { background: col + '18', color: col, border: '1px solid ' + col + '44', borderRadius: 4, padding: '2px 7px', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, fontFamily: 'JetBrains Mono' } }, e.importance)
                            )
                        );
                    })
                )
            )
        )
    );

    return h('div', null, alertRow, kpiRow, table);
}

// ============================================================
// Main export
// ============================================================
export function MarketWatch() {
    var _t = useState('overview');
    var tab = _t[0], setTab = _t[1];
    var _d = useState(null);
    var data = _d[0], setData = _d[1];
    var _s = useState('loading');
    var status = _s[0], setStatus = _s[1];

    useEffect(function() {
        fetch('/api/macro').then(function(r) {
            if (!r.ok) throw new Error('API ' + r.status);
            return r.json();
        }).then(function(d) {
            d._allQuotes = d.market || [];
            setData(d);
            setStatus('ready');
        }).catch(function() {
            setStatus('error');
        });
    }, []);

    // Macro data required for overview/sectors/regime/crossasset tabs
    var macroReady = status === 'ready';
    var macroLoading = status === 'loading';

    var TABS = [
        { id: 'overview',    label: 'OVERVIEW',    sub: 'Market Snapshot' },
        { id: 'sectors',     label: 'SECTORS',     sub: 'GICS Performance' },
        { id: 'news',        label: 'NEWS',         sub: 'Market Headlines' },
        { id: 'calendar',    label: 'CALENDAR',    sub: 'Economic Events' },
        { id: 'regime',      label: 'REGIME',      sub: 'Macro Quadrant' },
        { id: 'crossasset',  label: 'CROSS-ASSET', sub: 'Heatmap & Credit' },
    ];

    var tabBar = h('div', { style: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap' } },
        TABS.map(function(t) {
            var a = t.id === tab;
            return h('button', {
                key: t.id, onClick: function() { setTab(t.id); },
                style: { padding: '10px 24px 12px', border: 'none', borderBottom: '2px solid ' + (a ? '#00d4ff' : 'transparent'), background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, transition: 'all 0.15s ease', marginBottom: -1 }
            },
                h('span', { style: { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, fontFamily: 'JetBrains Mono', color: a ? '#00d4ff' : 'rgba(255,255,255,0.42)' } }, t.label),
                h('span', { style: { fontSize: 9.5, color: a ? 'rgba(0,212,255,0.55)' : 'rgba(255,255,255,0.2)', fontFamily: 'DM Sans' } }, t.sub)
            );
        })
    );

    // NEWS and CALENDAR don't need macro data; render them independently
    if (tab === 'news')     return h('div', null, h('div', { className: 'page-title' }, 'Market Watch'), tabBar, h(NewsPanel, null));
    if (tab === 'calendar') return h('div', null, h('div', { className: 'page-title' }, 'Market Watch'), tabBar, h(CalendarPanel, null));

    // Macro-dependent tabs need macro data
    if (macroLoading) return h('div', null, h('div', { className: 'page-title' }, 'Market Watch'), tabBar, h(Loading, null));
    if (status === 'error') return h('div', null, h('div', { className: 'page-title' }, 'Market Watch'), tabBar,
        h('div', { className: 'card', style: { padding: 32, textAlign: 'center', color: '#ef4444' } },
            'Market data unavailable. Check /api/macro or FRED/Finnhub API keys.'));

    var panel;
    switch (tab) {
        case 'overview':   panel = h(OverviewPanel, { data: data }); break;
        case 'sectors':    panel = h(SectorsPanel,  { data: data }); break;
        case 'regime':     panel = h(RegimePanel,   { data: data }); break;
        case 'crossasset': panel = h(MarketsPanel,  { data: data }); break;
        default:           panel = h(OverviewPanel, { data: data });
    }

    return h('div', null,
        h('div', { className: 'page-title' }, 'Market Watch'),
        tabBar,
        panel
    );
}
