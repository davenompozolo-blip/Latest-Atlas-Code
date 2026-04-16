// ============================================================
// ATLAS Terminal — Equity Research Dashboard (Module B, Stage 1)
// ------------------------------------------------------------
// Buy-side single-ticker workstation. Stage 1 delivers:
//   • Ticker search bar (enter key + button)
//   • Left summary panel (company info, price, 52W range,
//     drawdown, performance badges, volatility, analyst
//     consensus, price sparkline)
//   • Right panel placeholder (Financial Analysis / Valuation /
//     Risk / Peers / DCF) — filled in Stage 2
//
// Data: /api/equity?symbol=XYZ  (Alpha Vantage proxy, server-side
// key). Reference: ui/pages/equity_research.py (Streamlit v11).
// ============================================================

import { fmt, fmtPct, fmtCurrency, cls, useChart } from './utils.js';
import { Loading, EmptyState } from './components.js';

const { useState, useEffect, useRef, useCallback } = React;

// ------------------------------------------------------------
// Derivations from the Alpha Vantage raw payloads
// ------------------------------------------------------------

// Parse AV "Time Series (Daily)" object into ascending [{ date, close }]
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

// Compute return over `days` trading days back (null if not enough history)
function retBack(series, days) {
    const n = series.length;
    if (n <= days) return null;
    const end = series[n - 1].close;
    const start = series[n - 1 - days].close;
    if (!start) return null;
    return (end / start) - 1;
}

// Annualised volatility of last `window` daily returns (null if not enough)
function volWindow(series, window) {
    const n = series.length;
    if (n <= window) return null;
    let sum = 0, sumSq = 0, count = 0;
    for (let i = n - window; i < n; i++) {
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
    // Use last ~252 closes for 52W window (calendar-year trading days)
    const window = series.slice(-252);
    let high = -Infinity, low = Infinity, peak = -Infinity, drawdown = 0;
    for (const r of window) {
        if (r.close > high) high = r.close;
        if (r.close < low) low = r.close;
    }
    for (const r of window) {
        if (r.close > peak) peak = r.close;
    }
    // Current drawdown from rolling peak
    drawdown = peak > 0 ? (current - peak) / peak : null;
    return {
        current,
        high52: isFinite(high) ? high : null,
        low52: isFinite(low) ? low : null,
        drawdown,
        ret1D: retBack(series, 1),
        ret1W: retBack(series, 5),
        ret1M: retBack(series, 21),
        ret3M: retBack(series, 63),
        ret1Y: retBack(series, 252) || retBack(series, series.length - 1),
        vol30d: volWindow(series, 30),
        vol90d: volWindow(series, 90),
    };
}

function parseOverview(o) {
    if (!o || !o.Symbol) return null;
    const num = (k) => { const v = Number(o[k]); return isFinite(v) ? v : null; };
    const ratingCount = num('AnalystRatingStrongBuy') != null ? {
        strongBuy: num('AnalystRatingStrongBuy') || 0,
        buy:       num('AnalystRatingBuy') || 0,
        hold:      num('AnalystRatingHold') || 0,
        sell:      num('AnalystRatingSell') || 0,
        strongSell: num('AnalystRatingStrongSell') || 0,
    } : null;
    return {
        symbol: o.Symbol,
        name: o.Name || o.Symbol,
        description: o.Description || '',
        exchange: o.Exchange || '',
        currency: o.Currency || 'USD',
        sector: o.Sector || '\u2014',
        industry: o.Industry || '\u2014',
        marketCap: num('MarketCapitalization'),
        peRatio: num('PERatio'),
        pegRatio: num('PEGRatio'),
        beta: num('Beta'),
        eps: num('EPS'),
        dividendYield: num('DividendYield'),
        analystTarget: num('AnalystTargetPrice'),
        ratingCount,
    };
}

// ------------------------------------------------------------
// Small atoms
// ------------------------------------------------------------

function MetricTile({ label, value, sub, color }) {
    return React.createElement('div', { className: 'metric-card' },
        React.createElement('div', { className: 'label' }, label),
        React.createElement('div', { className: 'value', style: color ? { color } : null }, value),
        sub ? React.createElement('div', { className: 'sub' }, sub) : null
    );
}

function PerfBadge({ label, value }) {
    const bg = value == null ? 'rgba(255,255,255,0.04)'
             : value > 0 ? 'rgba(16,185,129,0.12)'
             : value < 0 ? 'rgba(239,68,68,0.12)'
             : 'rgba(255,255,255,0.04)';
    const color = value == null ? 'var(--text-muted)'
                : value > 0 ? 'var(--green)'
                : value < 0 ? 'var(--red)'
                : 'var(--text-sec)';
    const txt = value == null ? '\u2014' : (value > 0 ? '+' : '') + (value * 100).toFixed(2) + '%';
    return React.createElement('div', { style: { textAlign: 'center', flex: 1, minWidth: 64 } },
        React.createElement('div', { style: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.42)', marginBottom: 4 } }, label),
        React.createElement('div', { style: { fontWeight: 600, fontSize: 13, padding: '4px 8px', borderRadius: 6, background: bg, color: color } }, txt)
    );
}

function RangeBar({ low, high, current }) {
    if (low == null || high == null || current == null || high <= low) {
        return React.createElement('div', { style: { color: 'var(--text-muted)' } }, '\u2014');
    }
    const pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
    return React.createElement('div', null,
        React.createElement('div', { style: { position: 'relative', height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 6, marginBottom: 4 } },
            React.createElement('div', { style: { position: 'absolute', top: -3, left: pct + '%', transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: '50%', background: '#00d4ff', boxShadow: '0 0 8px rgba(0,212,255,0.6)' } })
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.42)' } },
            React.createElement('span', null, fmtCurrency(low)),
            React.createElement('span', null, fmtCurrency(high))
        )
    );
}

function ConsensusBar({ rating }) {
    if (!rating) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, '\u2014');
    const total = rating.strongBuy + rating.buy + rating.hold + rating.sell + rating.strongSell;
    if (total <= 0) return React.createElement('div', { style: { color: 'var(--text-muted)' } }, '\u2014');
    const seg = (w, c) => React.createElement('div', { style: { width: (w / total * 100) + '%', background: c, height: '100%' } });
    return React.createElement('div', null,
        React.createElement('div', { style: { display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', marginBottom: 6 } },
            seg(rating.strongBuy, '#10b981'),
            seg(rating.buy, '#34d399'),
            seg(rating.hold, '#f59e0b'),
            seg(rating.sell, '#fb923c'),
            seg(rating.strongSell, '#ef4444')
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.52)' } },
            React.createElement('span', null, 'Buy ' + (rating.strongBuy + rating.buy)),
            React.createElement('span', null, 'Hold ' + rating.hold),
            React.createElement('span', null, 'Sell ' + (rating.sell + rating.strongSell))
        )
    );
}

function Sparkline({ series }) {
    const ref = useRef(null);
    useChart(ref, function() {
        if (!series || !series.length) return null;
        return {
            type: 'line',
            data: {
                labels: series.map(d => d.date),
                datasets: [{
                    data: series.map(d => d.close),
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0,212,255,0.08)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true } },
                scales: {
                    x: { display: false },
                    y: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 }, maxTicksLimit: 4 }, grid: { color: 'rgba(255,255,255,0.04)' } },
                }
            }
        };
    }, [series]);
    return React.createElement('div', { style: { height: 160 } }, React.createElement('canvas', { ref: ref }));
}

function CompanyHero({ overview, symbol }) {
    if (!overview) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { style: { fontSize: 22, fontWeight: 700 } }, symbol),
            React.createElement('div', { style: { color: 'var(--text-muted)', marginTop: 6 } }, 'Company profile unavailable')
        );
    }
    return React.createElement('div', { className: 'card' },
        React.createElement('div', { style: { fontSize: 22, fontWeight: 700 } },
            overview.name, ' ',
            React.createElement('span', { style: { color: '#00d4ff', fontSize: 18 } }, '(' + overview.symbol + ')')
        ),
        React.createElement('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.52)', marginTop: 4 } },
            [overview.exchange, overview.sector, overview.industry].filter(Boolean).join(' \u00B7 ')
        ),
        overview.description
            ? React.createElement('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.62)', marginTop: 10, lineHeight: 1.5, maxHeight: 72, overflow: 'hidden' } },
                overview.description.length > 320 ? overview.description.slice(0, 320) + '\u2026' : overview.description)
            : null
    );
}

// ------------------------------------------------------------
// Stage-2 placeholder for the right-hand analysis panel
// ------------------------------------------------------------

function RightPanelPlaceholder({ symbol }) {
    const tabs = ['Financial Analysis', 'Valuation Engine', 'Risk View', 'Peer Comparison', 'DCF Engine'];
    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title' }, 'Analysis Modules'),
        React.createElement('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 } },
            tabs.map(function(t, i) {
                return React.createElement('span', {
                    key: t,
                    className: 'badge ' + (i === 0 ? 'blue' : 'amber'),
                    style: { fontSize: 11, padding: '4px 10px', opacity: 0.8 }
                }, t);
            })
        ),
        React.createElement('div', { style: { color: 'rgba(255,255,255,0.62)', fontSize: 13, lineHeight: 1.6 } },
            'Financial statements, valuation engine, risk view, peer comparison, and DCF modules for ',
            React.createElement('strong', { style: { color: '#00d4ff' } }, symbol || 'selected ticker'),
            ' land in Stage 2. Stage 1 proves the Alpha Vantage proxy round-trip and the left-panel summary.'
        )
    );
}

// ------------------------------------------------------------
// Main component
// ------------------------------------------------------------

export function EquityResearch() {
    const [input, setInput] = useState('AAPL');
    const [symbol, setSymbol] = useState(null);    // committed symbol that triggers fetch
    const [status, setStatus] = useState('idle');   // idle | loading | ready | error
    const [errMsg, setErrMsg] = useState(null);
    const [payload, setPayload] = useState(null);

    const analyse = useCallback(function(raw) {
        const s = (raw || '').trim().toUpperCase();
        if (!s) return;
        if (!/^[A-Z0-9.\-]{1,12}$/.test(s)) {
            setErrMsg('Ticker must be 1\u201312 characters of A\u2013Z / 0\u20139 / . / -');
            setStatus('error');
            return;
        }
        setSymbol(s);
    }, []);

    useEffect(function() {
        if (!symbol) return;
        let cancelled = false;
        setStatus('loading'); setErrMsg(null); setPayload(null);
        fetch('/api/equity?symbol=' + encodeURIComponent(symbol))
            .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, status: r.status, body: j }; }); })
            .then(function(res) {
                if (cancelled) return;
                if (!res.ok) {
                    setErrMsg((res.body && res.body.error) || 'Request failed (HTTP ' + res.status + ')');
                    setStatus('error');
                    return;
                }
                setPayload(res.body);
                setStatus('ready');
            })
            .catch(function(e) {
                if (cancelled) return;
                setErrMsg((e && e.message) || 'Network error');
                setStatus('error');
            });
        return function() { cancelled = true; };
    }, [symbol]);

    // Header + search bar (rendered for every state)
    const header = React.createElement('div', null,
        React.createElement('div', { className: 'page-title' }, 'Equity Research'),
        React.createElement('div', { className: 'card', style: { display: 'flex', gap: 12, alignItems: 'center', padding: 14 } },
            React.createElement('input', {
                type: 'text',
                value: input,
                onChange: function(e) { setInput(e.target.value); },
                onKeyDown: function(e) { if (e.key === 'Enter') analyse(input); },
                placeholder: 'Enter ticker (e.g. AAPL, MSFT, BRK.B)',
                spellCheck: false,
                style: {
                    flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: '10px 14px', color: 'rgba(255,255,255,0.92)',
                    fontFamily: 'inherit', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1
                }
            }),
            React.createElement('button', {
                onClick: function() { analyse(input); },
                disabled: status === 'loading',
                style: {
                    background: 'linear-gradient(135deg, #00d4ff, #6366f1)', color: '#fff',
                    border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600,
                    cursor: status === 'loading' ? 'not-allowed' : 'pointer', opacity: status === 'loading' ? 0.6 : 1,
                    letterSpacing: 1, textTransform: 'uppercase', fontSize: 12
                }
            }, status === 'loading' ? 'Loading\u2026' : 'Analyse')
        )
    );

    if (status === 'idle') {
        return React.createElement('div', null, header,
            React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } },
                'Enter a ticker above to fetch company fundamentals, price history, and performance metrics.'
            )
        );
    }
    if (status === 'loading') {
        return React.createElement('div', null, header, React.createElement(Loading, null));
    }
    if (status === 'error') {
        return React.createElement('div', null, header,
            React.createElement('div', { className: 'card', style: { borderColor: 'rgba(239,68,68,0.3)' } },
                React.createElement('div', { className: 'card-title', style: { color: 'var(--red)' } }, 'Request failed'),
                React.createElement('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.7)' } }, errMsg || 'Unknown error'),
                React.createElement('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 8 } },
                    'Data source: Yahoo Finance. If you hit a rate-limit, wait a few seconds and retry. Class-share tickers (e.g. BRK.B) are auto-translated to Yahoo format (BRK-B).')
            )
        );
    }

    // Ready state
    const series = parseDaily(payload && payload.daily);
    const metrics = deriveMetrics(series);
    const overview = parseOverview(payload && payload.overview);

    if (!metrics && !overview) {
        return React.createElement('div', null, header, React.createElement(EmptyState, null));
    }

    const m = metrics || {};
    const priceColor = m.ret1D == null ? null : m.ret1D >= 0 ? '#10b981' : '#ef4444';
    const targetUpside = overview && overview.analystTarget && m.current
        ? (overview.analystTarget - m.current) / m.current : null;

    return React.createElement('div', null, header,
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(320px, 2fr) 3fr', gap: 16, marginTop: 16 } },
            // --- LEFT PANEL --------------------------------------------
            React.createElement('div', null,
                React.createElement(CompanyHero, { overview: overview, symbol: symbol }),
                React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 12 } },
                    React.createElement(MetricTile, {
                        label: 'Current Price',
                        value: fmtCurrency(m.current),
                        sub: m.ret1D != null ? ((m.ret1D > 0 ? '+' : '') + (m.ret1D * 100).toFixed(2) + '% today') : null,
                        color: priceColor
                    }),
                    React.createElement(MetricTile, {
                        label: 'Market Cap',
                        value: overview && overview.marketCap ? fmtCurrency(overview.marketCap) : '\u2014'
                    }),
                    React.createElement(MetricTile, {
                        label: 'Drawdown (from 52W peak)',
                        value: m.drawdown != null ? (m.drawdown * 100).toFixed(2) + '%' : '\u2014',
                        color: m.drawdown != null && m.drawdown < 0 ? '#ef4444' : null
                    }),
                    React.createElement(MetricTile, {
                        label: 'Beta',
                        value: overview && overview.beta != null ? fmt(overview.beta) : '\u2014'
                    })
                ),
                React.createElement('div', { className: 'card', style: { marginTop: 12 } },
                    React.createElement('div', { className: 'card-title' }, '52-Week Range'),
                    React.createElement(RangeBar, { low: m.low52, high: m.high52, current: m.current })
                ),
                React.createElement('div', { className: 'card', style: { marginTop: 12 } },
                    React.createElement('div', { className: 'card-title' }, 'Performance'),
                    React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                        React.createElement(PerfBadge, { label: '1D', value: m.ret1D }),
                        React.createElement(PerfBadge, { label: '1W', value: m.ret1W }),
                        React.createElement(PerfBadge, { label: '1M', value: m.ret1M }),
                        React.createElement(PerfBadge, { label: '3M', value: m.ret3M }),
                        React.createElement(PerfBadge, { label: '1Y', value: m.ret1Y })
                    )
                ),
                React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 12 } },
                    React.createElement(MetricTile, {
                        label: 'Vol 30D (ann.)',
                        value: m.vol30d != null ? (m.vol30d * 100).toFixed(1) + '%' : '\u2014'
                    }),
                    React.createElement(MetricTile, {
                        label: 'Vol 90D (ann.)',
                        value: m.vol90d != null ? (m.vol90d * 100).toFixed(1) + '%' : '\u2014'
                    }),
                    React.createElement(MetricTile, {
                        label: 'P/E Ratio',
                        value: overview && overview.peRatio != null ? fmt(overview.peRatio) : '\u2014'
                    }),
                    React.createElement(MetricTile, {
                        label: 'Dividend Yield',
                        value: overview && overview.dividendYield != null ? fmtPct(overview.dividendYield) : '\u2014'
                    })
                ),
                overview && (overview.analystTarget != null || overview.ratingCount)
                    ? React.createElement('div', { className: 'card', style: { marginTop: 12 } },
                        React.createElement('div', { className: 'card-title' }, 'Analyst Consensus'),
                        overview.analystTarget != null
                            ? React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 } },
                                React.createElement('span', { style: { color: 'rgba(255,255,255,0.52)' } }, 'Target Price'),
                                React.createElement('span', { style: { fontWeight: 600 } },
                                    fmtCurrency(overview.analystTarget),
                                    targetUpside != null
                                        ? React.createElement('span', {
                                            className: cls(targetUpside),
                                            style: { marginLeft: 8, fontSize: 12 }
                                        }, '(' + (targetUpside > 0 ? '+' : '') + (targetUpside * 100).toFixed(1) + '%)')
                                        : null
                                )
                            )
                            : null,
                        React.createElement(ConsensusBar, { rating: overview.ratingCount })
                    )
                    : null,
                React.createElement('div', { className: 'card', style: { marginTop: 12 } },
                    React.createElement('div', { className: 'card-title' }, 'Price History \u2014 1Y'),
                    React.createElement(Sparkline, { series: series.slice(-252) })
                )
            ),
            // --- RIGHT PANEL (Stage 2 placeholder) ---------------------
            React.createElement('div', null,
                React.createElement(RightPanelPlaceholder, { symbol: symbol })
            )
        )
    );
}
