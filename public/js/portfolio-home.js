// ============================================================
// ATLAS Terminal — Portfolio Home Page
// ------------------------------------------------------------
// Consumes vw_portfolio_home, vw_command_centre, vw_portfolio_nav_daily.
// Renders metrics row, positions table (with column manager),
// donut of top holdings, benchmark line, P&L contributors, sector
// P&L attribution.
// ============================================================

import { loadView, MOCK_POSITIONS, MOCK_COMMAND } from './config.js';
import {
    fmt, fmtPct, fmtCurrency, cls,
    DEFAULT_COLS, ALL_COLS, getVisibleCols,
    cellValue, cellClass, cellStyle, qualityPill
} from './utils.js';
import { Loading, HeroCard } from './components.js';
import { returnStatus } from './utils.js';

const { useState, useEffect, useRef, useMemo } = React;

var MOVER_COLORS = { gain: '#10b981', loss: '#ef4444', neutral: 'rgba(255,255,255,0.4)' };

var TICKER_NAMES = {
    'AAPL':'Apple Inc.','MSFT':'Microsoft Corp.','GOOGL':'Alphabet Inc.','GOOG':'Alphabet Inc.',
    'AMZN':'Amazon.com Inc.','META':'Meta Platforms','NVDA':'NVIDIA Corp.','TSLA':'Tesla Inc.',
    'AMD':'Advanced Micro Devices','INTC':'Intel Corp.','QCOM':'Qualcomm Inc.','AVGO':'Broadcom Inc.',
    'ORCL':'Oracle Corp.','CRM':'Salesforce Inc.','ADBE':'Adobe Inc.','NOW':'ServiceNow Inc.',
    'JPM':'JPMorgan Chase','GS':'Goldman Sachs','MS':'Morgan Stanley','BAC':'Bank of America',
    'C':'Citigroup Inc.','WFC':'Wells Fargo','BLK':'BlackRock Inc.','SCHW':'Charles Schwab',
    'JNJ':'Johnson & Johnson','UNH':'UnitedHealth Group','PFE':'Pfizer Inc.','ABBV':'AbbVie Inc.',
    'MRK':'Merck & Co.','LLY':'Eli Lilly & Co.','BIIB':'Biogen Inc.','GILD':'Gilead Sciences',
    'AMGN':'Amgen Inc.','REGN':'Regeneron Pharma','VRTX':'Vertex Pharma',
    'XOM':'Exxon Mobil Corp.','CVX':'Chevron Corp.','HAL':'Halliburton Co.',
    'OXY':'Occidental Petroleum','COP':'ConocoPhillips','SLB':'Schlumberger Ltd.',
    'PBR':'Petrobras ADR','BP':'BP p.l.c.','SHEL':'Shell p.l.c.',
    'BA':'Boeing Co.','CAT':'Caterpillar Inc.','GE':'GE Aerospace','LMT':'Lockheed Martin',
    'RTX':'RTX Corp.','HON':'Honeywell Intl.','TGT':'Target Corp.','WMT':'Walmart Inc.',
    'COST':'Costco Wholesale','HD':'Home Depot','NKE':'Nike Inc.','SBUX':'Starbucks Corp.',
    'MCD':'McDonald\'s Corp.','TSM':'Taiwan Semiconductor','ASML':'ASML Holding',
    'MU':'Micron Technology','AMAT':'Applied Materials',
    'GLD':'SPDR Gold Trust','SLV':'iShares Silver Trust',
    'GDX':'VanEck Gold Miners ETF','GDXJ':'VanEck Jr Gold Miners',
    'RGLD':'Royal Gold Inc.','WPM':'Wheaton Precious Metals',
    'NEM':'Newmont Corp.','AEM':'Agnico Eagle Mines','HMY':'Harmony Gold Mining','AU':'AngloGold Ashanti',
    'SPY':'SPDR S&P 500 ETF','QQQ':'Invesco QQQ Trust','IWM':'iShares Russell 2000',
    'VTI':'Vanguard Total Market','VOO':'Vanguard S&P 500',
    'EWY':'iShares MSCI S.Korea','EEM':'iShares Emerging Markets','FXI':'iShares China Large-Cap',
    'EFA':'iShares MSCI EAFE','AVEE':'Avantis EM Small-Cap Value','AVDV':'Avantis Intl Small-Cap',
    'IAU':'iShares Gold Trust','TLT':'iShares 20Y+ Treasury','HYG':'iShares HY Bond',
    'LQD':'iShares IG Corp Bond','AMT':'American Tower REIT','PLD':'Prologis REIT',
    'EQIX':'Equinix REIT','SPG':'Simon Property REIT','PSA':'Public Storage REIT',
    'VNQ':'Vanguard Real Estate ETF',
};

var TICKER_TYPES = {
    'SPY':'ETF','QQQ':'ETF','IWM':'ETF','VTI':'ETF','VOO':'ETF','DIA':'ETF',
    'GLD':'ETF','SLV':'ETF','IAU':'ETF','GDX':'ETF','GDXJ':'ETF',
    'EWY':'ETF','EEM':'ETF','FXI':'ETF','EFA':'ETF','AVEE':'ETF','AVDV':'ETF',
    'TLT':'ETF','HYG':'ETF','LQD':'ETF','VNQ':'ETF','BITO':'ETF',
    'RGLD':'MINE','WPM':'MINE','NEM':'MINE','AEM':'MINE','HMY':'MINE','AU':'MINE',
    'AMT':'REIT','PLD':'REIT','EQIX':'REIT','SPG':'REIT','PSA':'REIT',
};

var TYPE_STYLE = {
    'EQ':   { bg:'rgba(0,212,255,0.08)',   color:'#00d4ff',  border:'rgba(0,212,255,0.22)' },
    'ETF':  { bg:'rgba(99,102,241,0.10)',  color:'#a5b4fc',  border:'rgba(99,102,241,0.28)' },
    'REIT': { bg:'rgba(245,158,11,0.10)',  color:'#fbbf24',  border:'rgba(245,158,11,0.28)' },
    'MINE': { bg:'rgba(251,191,36,0.10)',  color:'#fcd34d',  border:'rgba(251,191,36,0.28)' },
    'FI':   { bg:'rgba(52,211,153,0.10)',  color:'#34d399',  border:'rgba(52,211,153,0.28)' },
};

function getName(symbol, pos) {
    var n = pos.asset_name || pos.name;
    if (n && n !== symbol) return n;
    return TICKER_NAMES[symbol] || symbol;
}
function getType(symbol, pos) {
    if (pos.asset_type) return String(pos.asset_type).toUpperCase().slice(0,4);
    if (pos.instrument_type) return String(pos.instrument_type).toUpperCase().slice(0,4);
    return TICKER_TYPES[symbol] || 'EQ';
}
function TypeBadge(p) {
    var s = TYPE_STYLE[p.type] || TYPE_STYLE['EQ'];
    return React.createElement('span', { style: {
        background: s.bg, color: s.color, border: '1px solid ' + s.border,
        borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700,
        fontFamily: 'JetBrains Mono', letterSpacing: 0.5,
    }}, p.type);
}

function MoverRow(p) {
    var chg = Number(p.pos.daily_change_pct) || 0;
    var chgDollar = Number(p.pos.daily_change_dollar) || 0;
    var color = chg > 0 ? MOVER_COLORS.gain : chg < 0 ? MOVER_COLORS.loss : MOVER_COLORS.neutral;
    var arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '—';
    return React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }
    },
        React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, color: '#00d4ff', minWidth: 52 } }, p.pos.symbol),
        React.createElement('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.5)', flex: 1, paddingLeft: 8 } }, getName(p.pos.symbol, p.pos)),
        React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.6)', minWidth: 64, textAlign: 'right' } },
            p.pos.current_price ? '$' + Number(p.pos.current_price).toFixed(2) : '—'),
        React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, color: color, minWidth: 72, textAlign: 'right', fontWeight: 600 } },
            arrow + ' ' + (Math.abs(chg) * 100).toFixed(2) + '%'),
        React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: color, minWidth: 72, textAlign: 'right', opacity: 0.8 } },
            chgDollar !== 0 ? (chgDollar > 0 ? '+' : '') + fmtCurrency(chgDollar) : '')
    );
}

function TodayMovers(p) {
    var positions = p.positions;
    if (!positions || !positions.length) return null;
    var withChg = positions.filter(function(pos) { return pos.daily_change_pct != null && isFinite(Number(pos.daily_change_pct)); });
    if (!withChg.length) return null;
    withChg.sort(function(a, b) { return Number(b.daily_change_pct) - Number(a.daily_change_pct); });
    var gainers = withChg.slice(0, 4);
    var losers = withChg.slice(-4).reverse();
    var colStyle = { flex: 1, minWidth: 0 };
    var titleStyle = { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 4, fontFamily: 'DM Sans' };
    return React.createElement('div', { className: 'card', style: { marginBottom: 16 } },
        React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 } }, "TODAY'S MOVERS"),
        React.createElement('div', { style: { display: 'flex', gap: 24 } },
            React.createElement('div', { style: colStyle },
                React.createElement('div', { style: titleStyle }, '▲ Top Gainers'),
                gainers.map(function(pos) { return React.createElement(MoverRow, { key: pos.symbol, pos: pos }); })
            ),
            React.createElement('div', { style: { width: 1, background: 'rgba(255,255,255,0.06)', flexShrink: 0 } }),
            React.createElement('div', { style: colStyle },
                React.createElement('div', { style: titleStyle }, '▼ Top Losers'),
                losers.map(function(pos) { return React.createElement(MoverRow, { key: pos.symbol, pos: pos }); })
            )
        )
    );
}

// ---- Earnings Calendar card ----------------------------------------

function EarningsCalendar({ data }) {
    if (!data || !data.length) {
        return React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' } }, 'UPCOMING EARNINGS'),
            React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '24px 0' } },
                'No earnings data cached. Earnings dates populate as tickers are looked up in Equity Research.')
        );
    }

    // Show all — those with dates first (already ordered by SQL)
    var rows = data.slice(0, 20);

    return React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title', style: { fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' } }, 'EARNINGS CALENDAR'),
        React.createElement('table', { className: 'data-table' },
            React.createElement('thead', null,
                React.createElement('tr', null,
                    ['Ticker', 'Name', 'Wt%', 'Earnings Date', 'Days', 'Ex-Div', 'Target'].map(function(h) {
                        return React.createElement('th', { key: h }, h);
                    })
                )
            ),
            React.createElement('tbody', null,
                rows.map(function(r) {
                    var days = r.days_to_earnings;
                    var daysColor = days == null ? 'var(--text-muted)'
                        : days <= 7 ? '#ef4444'
                        : days <= 30 ? '#f59e0b' : 'var(--text)';
                    var daysText = days == null ? '—' : days <= 0 ? 'Today / Past' : days + 'd';

                    var target = r.analyst_target ? '$' + Number(r.analyst_target).toFixed(2) : '—';

                    return React.createElement('tr', { key: r.symbol },
                        React.createElement('td', { style: { fontWeight: 600, color: '#00d4ff' } }, r.symbol),
                        React.createElement('td', { style: { color: 'rgba(255,255,255,0.6)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif' } },
                            r.name || '—'),
                        React.createElement('td', null, r.weight_pct != null ? (r.weight_pct * 100).toFixed(1) + '%' : '—'),
                        React.createElement('td', null, r.earnings_date || '—'),
                        React.createElement('td', { style: { color: daysColor, fontWeight: days != null && days <= 30 ? 600 : 400 } }, daysText),
                        React.createElement('td', { style: { color: 'var(--text-sec)' } }, r.ex_div_date || '—'),
                        React.createElement('td', { style: { color: 'var(--text-sec)' } }, target)
                    );
                })
            )
        )
    );
}

export function PortfolioHome() {
    var _p = useState(null), positions = _p[0], setPositions = _p[1];
    var _c = useState(null), command = _c[0], setCommand = _c[1];
    var _l = useState(true), loading = _l[0], setLoading = _l[1];
    var _n = useState(null), navData = _n[0], setNavData = _n[1];
    var _vc = useState(getVisibleCols), visCols = _vc[0], setVisCols = _vc[1];
    var _cm = useState(false), showCols = _cm[0], setShowCols = _cm[1];
    var _ec = useState(null), earningsData = _ec[0], setEarningsData = _ec[1];
    var _tx = useState([]), txData = _tx[0], setTxData = _tx[1];
    var _sq = useState(''), srch = _sq[0], setSrch = _sq[1];
    var _tf = useState('ALL'), tFilt = _tf[0], setTFilt = _tf[1];
    var _sk = useState('market_value'), sortK = _sk[0], setSortK = _sk[1];
    var _sd = useState('desc'), sortD = _sd[0], setSortD = _sd[1];
    var donutRef = useRef(null);
    var donutInst = useRef(null);
    var navPlotRef = useRef(null);
    var _nr = useState('ALL'), navRange = _nr[0], setNavRange = _nr[1];
    var pnlRef = useRef(null);
    var pnlInst = useRef(null);
    var sectorRef = useRef(null);
    var heatRef = useRef(null);
    var _hm = useState('day'), heatMode = _hm[0], setHeatMode = _hm[1];

    useEffect(function() {
        Promise.all([
            loadView('vw_portfolio_home', MOCK_POSITIONS),
            loadView('vw_command_centre', [MOCK_COMMAND]),
            loadView('vw_portfolio_nav_daily', []),
            loadView('vw_earnings_calendar', []),
            loadView('vw_transactions', []),
        ]).then(function(res) {
            setPositions(res[0]);
            setCommand(res[1][0] || MOCK_COMMAND);
            setNavData(res[2]);
            setEarningsData(res[3]);
            setTxData(res[4] || []);
            setLoading(false);
        });
    }, []);

    // Column toggle handler
    function toggleCol(key) {
        setVisCols(function(prev) {
            var next = prev.indexOf(key) >= 0 ? prev.filter(function(k) { return k !== key; }) : prev.concat([key]);
            try { localStorage.setItem('atlas_cols', JSON.stringify(next)); } catch(e) {}
            return next;
        });
    }
    function resetCols() {
        setVisCols(DEFAULT_COLS);
        try { localStorage.setItem('atlas_cols', JSON.stringify(DEFAULT_COLS)); } catch(e) {}
    }

    // Donut chart
    useEffect(function() {
        if (!positions || !donutRef.current) return;
        if (donutInst.current) donutInst.current.destroy();
        var top10 = positions.slice(0, 10);
        donutInst.current = new Chart(donutRef.current, {
            type: 'doughnut',
            data: {
                labels: top10.map(function(p) { return p.symbol; }),
                datasets: [{ data: top10.map(function(p) { return Math.abs(Number(p.market_value) || 0); }),
                    backgroundColor: ['#00d4ff', '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#a855f7'],
                    borderWidth: 0 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.55)', font: { size: 10, family: 'DM Sans' }, padding: 6, boxWidth: 10, usePointStyle: true } }
                }
            },
            plugins: [{ id: 'centerText', beforeDraw: function(chart) {
                var ctx = chart.ctx, w = chart.width, h = chart.height;
                ctx.save();
                ctx.font = '700 18px JetBrains Mono';
                ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                var totalMv = top10.reduce(function(s, p) { return s + Math.abs(Number(p.market_value) || 0); }, 0);
                ctx.fillText(fmtCurrency(totalMv), w / 2, h / 2 - 4);
                ctx.restore();
            }}]
        });
        return function() { if (donutInst.current) donutInst.current.destroy(); };
    }, [positions]);

    // Plotly NAV chart
    useEffect(function() {
        if (!navData || !navData.length || !navPlotRef.current) return;
        var sorted = navData.slice().sort(function(a, b) { return new Date(a.price_date) - new Date(b.price_date); });
        var cutoff = null;
        var now = new Date();
        if (navRange === '1W') cutoff = new Date(now - 7 * 864e5);
        else if (navRange === '1M') cutoff = new Date(now - 30 * 864e5);
        else if (navRange === '3M') cutoff = new Date(now - 90 * 864e5);
        var slice = cutoff ? sorted.filter(function(d) { return new Date(d.price_date) >= cutoff; }) : sorted;
        if (!slice.length) slice = sorted;
        var baseNav = slice[0].nav;
        var xs = slice.map(function(d) { return d.price_date; });
        var ys = slice.map(function(d) { return +((d.nav / baseNav - 1) * 100).toFixed(2); });
        var lastY = ys[ys.length - 1];
        var fillColor = lastY >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
        var lineColor = lastY >= 0 ? '#10b981' : '#ef4444';
        // Build entry-point scatter trace from transactions
        var traces = [{
            x: xs, y: ys,
            type: 'scatter', mode: 'lines',
            fill: 'tozeroy', fillcolor: fillColor,
            line: { color: lineColor, width: 2, shape: 'spline' },
            hovertemplate: '%{x}<br><b>%{y:.2f}%</b><extra></extra>',
            name: 'ATLAS NAV',
        }];
        if (txData && txData.length) {
            // Map NAV by date for Y lookup
            var navByDate = {};
            slice.forEach(function(d) { navByDate[d.price_date] = ((d.nav / baseNav - 1) * 100); });
            var sliceStart = slice[0].price_date;
            var sliceEnd = slice[slice.length - 1].price_date;
            // Group buys: profitable vs underwater using positions current P&L
            var posMap = {};
            if (positions) positions.forEach(function(p) { posMap[p.symbol] = p; });
            var txInRange = txData.filter(function(t) {
                var d = t.transaction_date || t.date || t.trade_date;
                return d && d >= sliceStart && d <= sliceEnd && (t.side || t.transaction_type || '').toUpperCase().indexOf('BUY') >= 0;
            });
            var txGood = [], txBad = [], txLabels = [];
            txInRange.forEach(function(t) {
                var d = t.transaction_date || t.date || t.trade_date;
                var sym = t.symbol || t.ticker;
                var pos = posMap[sym];
                var ret = pos && pos.unrealised_return_pct != null ? Number(pos.unrealised_return_pct) : null;
                // Find nearest nav Y for this date
                var navY = navByDate[d];
                if (navY == null) {
                    // Find closest date in navByDate
                    var dates = Object.keys(navByDate);
                    var closest = dates.reduce(function(a, b) { return Math.abs(new Date(b) - new Date(d)) < Math.abs(new Date(a) - new Date(d)) ? b : a; });
                    navY = navByDate[closest];
                }
                if (ret === null || ret >= 0) { txGood.push({ x: d, y: navY, sym: sym, ret: ret }); }
                else { txBad.push({ x: d, y: navY, sym: sym, ret: ret }); }
            });
            if (txGood.length) traces.push({
                x: txGood.map(function(t) { return t.x; }),
                y: txGood.map(function(t) { return t.y; }),
                text: txGood.map(function(t) { return t.sym + (t.ret != null ? ' +' + (t.ret * 100).toFixed(1) + '%' : ''); }),
                type: 'scatter', mode: 'markers', name: 'Entry (profitable)',
                marker: { color: '#10b981', size: 8, symbol: 'triangle-up', line: { color: 'rgba(16,185,129,0.6)', width: 1 } },
                hovertemplate: '<b>%{text}</b><br>%{x}<extra>Entry</extra>',
            });
            if (txBad.length) traces.push({
                x: txBad.map(function(t) { return t.x; }),
                y: txBad.map(function(t) { return t.y; }),
                text: txBad.map(function(t) { return t.sym + (t.ret != null ? ' ' + (t.ret * 100).toFixed(1) + '%' : ''); }),
                type: 'scatter', mode: 'markers', name: 'Entry (underwater)',
                marker: { color: '#ef4444', size: 8, symbol: 'triangle-down', line: { color: 'rgba(239,68,68,0.6)', width: 1 } },
                hovertemplate: '<b>%{text}</b><br>%{x}<extra>Entry</extra>',
            });
        }
        Plotly.react(navPlotRef.current, traces, {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 48, r: 12, t: 8, b: 32 },
            xaxis: { showgrid: false, tickfont: { color: 'rgba(255,255,255,0.3)', size: 10, family: 'JetBrains Mono' }, tickformat: '%b %d', nticks: 6 },
            yaxis: { gridcolor: 'rgba(255,255,255,0.05)', zeroline: true, zerolinecolor: 'rgba(255,255,255,0.1)', zerolinewidth: 1, tickfont: { color: 'rgba(255,255,255,0.3)', size: 10, family: 'JetBrains Mono' }, ticksuffix: '%' },
            showlegend: false,
            font: { family: 'DM Sans', color: 'rgba(255,255,255,0.5)' },
        }, { responsive: true, displayModeBar: false });
    }, [navData, navRange, txData, positions]);

    // P&L contributors chart
    useEffect(function() {
        if (!positions || !positions.length || !pnlRef.current) return;
        if (pnlInst.current) pnlInst.current.destroy();
        var withPnl = positions.map(function(p) {
            var pnl = p.total_gain_loss_dollar != null ? Number(p.total_gain_loss_dollar) :
                (Number(p.current_price || 0) - Number(p.cost_basis || 0)) * Number(p.quantity || 0);
            return { symbol: p.symbol, pnl: pnl };
        }).filter(function(p) { return isFinite(p.pnl); });
        withPnl.sort(function(a, b) { return b.pnl - a.pnl; });
        var top5 = withPnl.slice(0, 5);
        var bottom5 = withPnl.slice(-5).reverse();
        var chartItems = top5.concat(bottom5);
        var seen = {};
        chartItems = chartItems.filter(function(item) {
            if (seen[item.symbol]) return false;
            seen[item.symbol] = true;
            return true;
        });
        pnlInst.current = new Chart(pnlRef.current, {
            type: 'bar',
            data: {
                labels: chartItems.map(function(p) { return p.symbol; }),
                datasets: [{
                    data: chartItems.map(function(p) { return p.pnl; }),
                    backgroundColor: chartItems.map(function(p) { return p.pnl >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'; }),
                    borderWidth: 0,
                    borderRadius: 3
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: 'JetBrains Mono' }, callback: function(v) { return '$' + (v / 1000).toFixed(1) + 'k'; } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11, family: 'JetBrains Mono' } }, grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
        return function() { if (pnlInst.current) pnlInst.current.destroy(); };
    }, [positions]);

    // Sector P&L waterfall (Plotly)
    useEffect(function() {
        if (!positions || !positions.length || !sectorRef.current) return;
        var bySector = {};
        positions.forEach(function(p) {
            var sec = p.sector || 'Other';
            var pnl = p.total_gain_loss_dollar != null ? Number(p.total_gain_loss_dollar) :
                (Number(p.current_price || 0) - Number(p.cost_basis || 0)) * Number(p.quantity || 0);
            if (!isFinite(pnl)) return;
            bySector[sec] = (bySector[sec] || 0) + pnl;
        });
        var sectors = Object.keys(bySector).sort(function(a, b) { return bySector[b] - bySector[a]; });
        var sectorPnl = sectors.map(function(s) { return bySector[s]; });
        var total = sectorPnl.reduce(function(s, v) { return s + v; }, 0);
        var labels = sectors.concat(['Total']);
        var measures = sectors.map(function() { return 'relative'; }).concat(['total']);
        var values = sectorPnl.concat([total]);
        var textValues = values.map(function(v) { return (v >= 0 ? '+' : '') + '$' + (v / 1000).toFixed(1) + 'k'; });
        Plotly.react(sectorRef.current, [{
            type: 'waterfall',
            orientation: 'v',
            measure: measures,
            x: labels,
            y: values,
            text: textValues,
            textposition: 'outside',
            textfont: { color: 'rgba(255,255,255,0.7)', size: 10, family: 'JetBrains Mono' },
            connector: { line: { color: 'rgba(255,255,255,0.1)', width: 1 } },
            increasing: { marker: { color: 'rgba(16,185,129,0.75)' } },
            decreasing: { marker: { color: 'rgba(239,68,68,0.75)' } },
            totals: { marker: { color: 'rgba(0,212,255,0.75)' } },
            hovertemplate: '<b>%{x}</b><br>P&L: %{y:$,.0f}<extra></extra>',
        }], {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 48, r: 12, t: 8, b: 60 },
            xaxis: { tickfont: { color: 'rgba(255,255,255,0.5)', size: 10, family: 'DM Sans' }, tickangle: -30, showgrid: false },
            yaxis: { gridcolor: 'rgba(255,255,255,0.05)', zeroline: true, zerolinecolor: 'rgba(255,255,255,0.15)', tickfont: { color: 'rgba(255,255,255,0.3)', size: 10, family: 'JetBrains Mono' }, tickprefix: '$', tickformat: ',.0f' },
            showlegend: false,
        }, { responsive: true, displayModeBar: false });
    }, [positions]);


    // Portfolio heatmap (treemap)
    useEffect(function() {
        if (!positions || !positions.length || !heatRef.current) return;
        var colorKey = heatMode === 'day' ? 'daily_change_pct' : 'unrealised_return_pct';
        var labels = [], values = [], colors = [], texts = [], hovers = [];
        positions.forEach(function(p) {
            var mv = Math.abs(Number(p.market_value) || 0);
            if (!mv) return;
            var chg = p[colorKey] != null ? Number(p[colorKey]) : 0;
            var chgPct = (chg * 100).toFixed(2);
            labels.push(p.symbol);
            values.push(mv);
            colors.push(chg);
            texts.push(p.symbol + '<br>' + (chg >= 0 ? '+' : '') + chgPct + '%');
            hovers.push('<b>' + p.symbol + '</b><br>' + getName(p.symbol, p) +
                '<br>' + (heatMode === 'day' ? 'Day' : 'Total') + ': ' + (chg >= 0 ? '+' : '') + chgPct + '%' +
                '<br>Mkt Value: $' + Number(mv).toLocaleString('en-US', { maximumFractionDigits: 0 }) +
                '<extra></extra>');
        });
        Plotly.react(heatRef.current, [{
            type: 'treemap',
            labels: labels,
            parents: labels.map(function() { return ''; }),
            values: values,
            text: texts,
            customdata: hovers,
            textinfo: 'text',
            hovertemplate: '%{customdata}',
            textfont: { family: 'JetBrains Mono', size: 11, color: 'rgba(255,255,255,0.92)' },
            marker: {
                colors: colors,
                colorscale: [
                    [0,    'rgba(185,28,28,0.92)'],
                    [0.35, 'rgba(127,29,29,0.7)'],
                    [0.48, 'rgba(15,23,42,0.85)'],
                    [0.52, 'rgba(15,23,42,0.85)'],
                    [0.65, 'rgba(6,78,59,0.7)'],
                    [1,    'rgba(5,150,105,0.92)'],
                ],
                cmid: 0,
                showscale: false,
                line: { width: 1.5, color: 'rgba(0,0,0,0.6)' },
            },
            tiling: { pad: 2 },
        }], {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 0, r: 0, t: 0, b: 0 },
        }, { responsive: true, displayModeBar: false });
    }, [positions, heatMode]);

    var filtPosns = useMemo(function() {
        if (!positions) return [];
        var q = srch.toLowerCase();
        var out = positions.filter(function(p) {
            var matchQ = !q || p.symbol.toLowerCase().indexOf(q) >= 0 ||
                getName(p.symbol, p).toLowerCase().indexOf(q) >= 0 ||
                (p.sector || '').toLowerCase().indexOf(q) >= 0;
            var matchT = tFilt === 'ALL' || getType(p.symbol, p) === tFilt;
            return matchQ && matchT;
        });
        out.sort(function(a, b) {
            var av = a[sortK] != null ? Number(a[sortK]) : (sortD === 'desc' ? -1e15 : 1e15);
            var bv = b[sortK] != null ? Number(b[sortK]) : (sortD === 'desc' ? -1e15 : 1e15);
            return sortD === 'desc' ? bv - av : av - bv;
        });
        return out;
    }, [positions, srch, tFilt, sortK, sortD]);

    if (loading) return React.createElement(Loading, null);
    var c = command || MOCK_COMMAND;
    var activeCols = ALL_COLS.filter(function(col) { return visCols.indexOf(col.key) >= 0; });
    var wqSum = 0, wqMv = 0;
    positions.forEach(function(p) { var mv = Math.abs(Number(p.market_value) || 0); wqSum += (Number(p.quality_score) || 0) * mv; wqMv += mv; });
    var avgQuality = wqMv > 0 ? Math.round(wqSum / wqMv) : null;
    var qualColor = avgQuality == null ? 'rgba(255,255,255,0.4)' : avgQuality >= 60 ? '#10b981' : avgQuality >= 40 ? '#f59e0b' : '#ef4444';
    var retPct = Number(c.unrealised_return_pct);
    var retColor = retPct >= 0 ? '#10b981' : '#ef4444';
    var div = { width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 20px', flexShrink: 0 };
    var hb = { display: 'flex', flexDirection: 'column', justifyContent: 'center' };
    var hl = { fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 4, fontFamily: 'DM Sans' };

    var pnlPositive = (c.unrealised_pnl || 0) >= 0;
    var leverageSub = c.gross_leverage != null ? 'Leverage: ' + Number(c.gross_leverage).toFixed(2) + 'x' : '\u2014';

    return React.createElement('div', null,
        // Hero Pulse Bar
        React.createElement('div', { style: { background: 'linear-gradient(135deg,rgba(0,212,255,0.04),rgba(99,102,241,0.04))', border: '1px solid rgba(0,212,255,0.12)', borderRadius: 10, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center' } },
            React.createElement('div', { style: hb },
                React.createElement('div', { style: hl }, 'Portfolio NAV'),
                React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 700, color: 'rgba(255,255,255,0.95)' } }, fmtCurrency(c.portfolio_nav)),
                React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, fontFamily: 'JetBrains Mono' } }, (c.position_count || positions.length) + ' positions')
            ),
            React.createElement('div', { style: div }),
            React.createElement('div', { style: hb },
                React.createElement('div', { style: hl }, 'Unrealised P&L'),
                React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: Number(c.unrealised_pnl) >= 0 ? '#10b981' : '#ef4444' } }, fmtCurrency(c.unrealised_pnl)),
                React.createElement('div', { style: { fontSize: 10, color: retColor, marginTop: 3, fontFamily: 'JetBrains Mono' } }, (retPct >= 0 ? '+' : '') + (retPct * 100).toFixed(2) + '% total return')
            ),
            React.createElement('div', { style: div }),
            React.createElement('div', { style: hb },
                React.createElement('div', { style: hl }, 'Cash Balance'),
                React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: Number(c.cash_balance) < 0 ? '#ef4444' : 'rgba(255,255,255,0.85)' } }, fmtCurrency(c.cash_balance)),
                React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, fontFamily: 'JetBrains Mono' } }, c.gross_leverage != null ? 'Leverage ' + Number(c.gross_leverage).toFixed(2) + '\u00d7' : 'No leverage')
            ),
            React.createElement('div', { style: div }),
            React.createElement('div', { style: hb },
                React.createElement('div', { style: hl }, 'Cost Basis'),
                React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.85)' } }, fmtCurrency(c.total_invested)),
                React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, fontFamily: 'JetBrains Mono' } }, 'Initial equity ' + fmtCurrency(c.initial_equity || 100000))
            ),
            React.createElement('div', { style: div }),
            React.createElement('div', { style: hb },
                React.createElement('div', { style: hl }, 'Wtd. Quality'),
                React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 28, fontWeight: 700, color: qualColor } }, avgQuality != null ? String(avgQuality) : '\u2014'),
                React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, fontFamily: 'JetBrains Mono' } }, '/ 100 \u00b7 wt. avg')
            ),
            React.createElement('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 } },
                React.createElement('span', { style: { width: 7, height: 7, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981', display: 'inline-block' } }),
                React.createElement('span', { style: { fontSize: 9, letterSpacing: 1.5, color: '#10b981', fontFamily: 'DM Sans', textTransform: 'uppercase' } }, 'Live')
            )
        ),
        // Charts Row (3fr 2fr) — NAV chart dominant, donut alongside
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 } },
            React.createElement('div', { className: 'card' },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 } },
                    React.createElement('div', { className: 'card-title', style: { margin: 0 } }, 'PORTFOLIO NAV HISTORY'),
                    React.createElement('div', { style: { display: 'flex', gap: 4 } },
                        ['1W', '1M', '3M', 'ALL'].map(function(r) {
                            var a = navRange === r;
                            return React.createElement('button', { key: r, onClick: function() { setNavRange(r); }, style: { background: a ? 'rgba(0,212,255,0.15)' : 'transparent', color: a ? '#00d4ff' : 'rgba(255,255,255,0.3)', border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.07)'), borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'JetBrains Mono' } }, r);
                        })
                    )
                ),
                React.createElement('div', { ref: navPlotRef, style: { height: 260 } })
            ),
            React.createElement('div', { className: 'card' },
                React.createElement('div', { className: 'card-title' }, 'TOP HOLDINGS'),
                React.createElement('div', { style: { height: 260 } }, React.createElement('canvas', { ref: donutRef }))
            )
        ),
        // Today's Movers
        React.createElement(TodayMovers, { positions: positions }),
        // Attribution Row
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
            React.createElement('div', { className: 'card' },
                React.createElement('div', { className: 'card-title' }, 'P&L CONTRIBUTORS & DETRACTORS'),
                React.createElement('div', { style: { height: 300 } }, React.createElement('canvas', { ref: pnlRef }))
            ),
            React.createElement('div', { className: 'card' },
                React.createElement('div', { className: 'card-title' }, 'SECTOR P&L ATTRIBUTION'),
                React.createElement('div', { ref: sectorRef, style: { height: 300 } })
            )
        ),
        // Portfolio Heatmap
        React.createElement('div', { className: 'card', style: { padding: '16px 20px', marginBottom: 16 } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } },
                React.createElement('div', { className: 'card-title', style: { margin: 0 } }, 'PORTFOLIO HEATMAP'),
                React.createElement('div', { style: { display: 'flex', gap: 4, alignItems: 'center' } },
                    React.createElement('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Sans', marginRight: 6 } }, 'Sized by NAV weight · Coloured by'),
                    ['day', 'total'].map(function(m) {
                        var a = heatMode === m;
                        return React.createElement('button', { key: m, onClick: function() { setHeatMode(m); }, style: {
                            background: a ? 'rgba(0,212,255,0.12)' : 'transparent',
                            color: a ? '#00d4ff' : 'rgba(255,255,255,0.3)',
                            border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                            borderRadius: 4, padding: '3px 9px', fontSize: 10, fontFamily: 'JetBrains Mono',
                            fontWeight: a ? 700 : 400, cursor: 'pointer', letterSpacing: 0.5
                        }}, m === 'day' ? 'Day %' : 'Total Return');
                    }),
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 4, marginLeft: 10 } },
                        React.createElement('div', { style: { width: 32, height: 8, background: 'linear-gradient(to right, rgba(185,28,28,0.9), rgba(15,23,42,0.8), rgba(5,150,105,0.9))', borderRadius: 2 } }),
                        React.createElement('span', { style: { fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'JetBrains Mono' } }, '− / +')
                    )
                )
            ),
            React.createElement('div', { ref: heatRef, style: { height: 280 } })
        ),
        // Portfolio Intelligence Row
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
            // Concentration Risk card
            (function() {
                var sorted = positions.slice().sort(function(a, b) { return Math.abs(Number(b.market_value)||0) - Math.abs(Number(a.market_value)||0); });
                var totalMv = sorted.reduce(function(s, p) { return s + Math.abs(Number(p.market_value)||0); }, 0);
                var top10 = sorted.slice(0, 10);
                // Herfindahl-Hirschman Index (sum of squared weights)
                var hhi = sorted.reduce(function(s, p) { var w = totalMv ? Math.abs(Number(p.market_value)||0) / totalMv : 0; return s + w * w; }, 0);
                var hhiPct = Math.round(hhi * 10000);
                var hhiColor = hhi > 0.25 ? '#ef4444' : hhi > 0.15 ? '#f59e0b' : '#10b981';
                var maxPos = top10[0];
                var maxWt = totalMv && maxPos ? Math.abs(Number(maxPos.market_value)||0) / totalMv : 0;
                return React.createElement('div', { className: 'card' },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 } },
                        React.createElement('div', { className: 'card-title', style: { margin: 0 } }, 'CONCENTRATION RISK'),
                        React.createElement('div', { style: { textAlign: 'right' } },
                            React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700, color: hhiColor } }, hhiPct),
                            React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase' } }, 'HHI Score')
                        )
                    ),
                    top10.map(function(p) {
                        var wt = totalMv ? Math.abs(Number(p.market_value)||0) / totalMv : 0;
                        var wtPct = (wt * 100).toFixed(1);
                        var barW = Math.min(wt / (maxWt || 0.01), 1) * 100;
                        var type = getType(p.symbol, p);
                        var ts = TYPE_STYLE[type] || TYPE_STYLE['EQ'];
                        return React.createElement('div', { key: p.symbol, style: { marginBottom: 7 } },
                            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 } },
                                React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
                                    React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: '#00d4ff', minWidth: 48 } }, p.symbol),
                                    React.createElement('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans' } }, getName(p.symbol, p))
                                ),
                                React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 } }, wtPct + '%')
                            ),
                            React.createElement('div', { style: { height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' } },
                                React.createElement('div', { style: { width: barW + '%', height: '100%', background: ts.color, borderRadius: 2, opacity: 0.8 } })
                            )
                        );
                    }),
                    React.createElement('div', { style: { marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between' } },
                        React.createElement('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Sans' } }, 'Top 5: ' + top10.slice(0,5).reduce(function(s,p) { return s + Math.abs(Number(p.market_value)||0); }, 0) / totalMv * 100 < 50 ? 'Diversified' : 'Concentrated'),
                        React.createElement('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'JetBrains Mono' } }, 'Max: ' + (maxWt * 100).toFixed(1) + '% ' + (maxPos ? maxPos.symbol : ''))
                    )
                );
            })(),
            // Exposure Matrix card
            (function() {
                var totalMv = positions.reduce(function(s, p) { return s + Math.abs(Number(p.market_value)||0); }, 0);
                // By sector
                var bySector = {};
                positions.forEach(function(p) {
                    var sec = p.sector || 'Other';
                    bySector[sec] = (bySector[sec] || 0) + Math.abs(Number(p.market_value)||0);
                });
                var sectors = Object.keys(bySector).sort(function(a, b) { return bySector[b] - bySector[a]; }).slice(0, 8);
                // By type
                var byType = {};
                positions.forEach(function(p) {
                    var t = getType(p.symbol, p);
                    byType[t] = (byType[t] || 0) + Math.abs(Number(p.market_value)||0);
                });
                var types = Object.keys(byType).sort(function(a, b) { return byType[b] - byType[a]; });
                var SECTOR_COLORS = ['#00d4ff','#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6'];
                return React.createElement('div', { className: 'card' },
                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
                        React.createElement('div', { className: 'card-title', style: { margin: 0 } }, 'EXPOSURE MATRIX'),
                        React.createElement('div', { style: { display: 'flex', gap: 6 } },
                            types.map(function(t) {
                                var ts = TYPE_STYLE[t] || TYPE_STYLE['EQ'];
                                var wt = totalMv ? (byType[t] / totalMv * 100).toFixed(0) : 0;
                                return React.createElement('div', { key: t, style: { background: ts.bg, border: '1px solid ' + ts.border, borderRadius: 4, padding: '2px 7px', fontSize: 10, color: ts.color, fontFamily: 'JetBrains Mono', fontWeight: 700 } }, t + ' ' + wt + '%');
                            })
                        )
                    ),
                    sectors.map(function(sec, i) {
                        var wt = totalMv ? bySector[sec] / totalMv : 0;
                        var wtPct = (wt * 100).toFixed(1);
                        var color = SECTOR_COLORS[i % SECTOR_COLORS.length];
                        // Count positions in sector
                        var count = positions.filter(function(p) { return (p.sector || 'Other') === sec; }).length;
                        return React.createElement('div', { key: sec, style: { marginBottom: 8 } },
                            React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 } },
                                React.createElement('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.7)', fontFamily: 'DM Sans', display: 'flex', alignItems: 'center', gap: 6 } },
                                    React.createElement('span', { style: { width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 } }),
                                    sec),
                                React.createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
                                    React.createElement('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Sans' } }, count + (count === 1 ? ' pos' : ' pos')),
                                    React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.75)', minWidth: 36, textAlign: 'right' } }, wtPct + '%')
                                )
                            ),
                            React.createElement('div', { style: { height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' } },
                                React.createElement('div', { style: { width: (wt * 100) + '%', height: '100%', background: color, borderRadius: 2, opacity: 0.75 } })
                            )
                        );
                    })
                );
            })()
        ),
        // Interactive Holdings Table
        React.createElement('div', { className: 'card', style: { padding: '16px 20px' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' } },
                React.createElement('div', { className: 'card-title', style: { fontSize: 14, fontFamily: 'Syne', fontWeight: 700, letterSpacing: 1, margin: 0, flex: 'none' } },
                    'HOLDINGS ' + (filtPosns.length !== positions.length ? '(' + filtPosns.length + '/' + positions.length + ')' : '(' + positions.length + ')')),
                React.createElement('input', { value: srch, onChange: function(e) { setSrch(e.target.value); },
                    placeholder: '\u{1F50D}  symbol, name, sector…',
                    style: { flex: 1, minWidth: 160, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, padding: '5px 10px', color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' } }),
                React.createElement('div', { style: { display: 'flex', gap: 4 } },
                    ['ALL','EQ','ETF','MINE','REIT'].map(function(t) {
                        var a = tFilt === t;
                        return React.createElement('button', { key: t, onClick: function() { setTFilt(t); }, style: {
                            background: a ? 'rgba(0,212,255,0.12)' : 'transparent',
                            color: a ? '#00d4ff' : 'rgba(255,255,255,0.3)',
                            border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                            borderRadius: 4, padding: '3px 9px', fontSize: 10, fontFamily: 'JetBrains Mono',
                            fontWeight: a ? 700 : 400, cursor: 'pointer', letterSpacing: 0.5
                        }}, t);
                    })
                )
            ),
            React.createElement('div', { style: { overflowY: 'auto', maxHeight: 420, overflowX: 'auto', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' } },
                React.createElement('table', { style: { borderCollapse: 'collapse', width: '100%', minWidth: 700 } },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            [
                                { key: 'symbol', label: 'Ticker', col: null, align: 'left' },
                                { key: 'name', label: 'Name / Type', col: null, align: 'left' },
                                { key: 'current_price', label: 'Price', col: 'current_price', align: 'right' },
                                { key: 'daily_change_pct', label: 'Day %', col: 'daily_change_pct', align: 'right' },
                                { key: 'market_value', label: 'Mkt Value', col: 'market_value', align: 'right' },
                                { key: 'wt', label: 'Weight', col: 'weight_equity_pct', align: 'right' },
                                { key: 'unrealised_return_pct', label: 'Return', col: 'unrealised_return_pct', align: 'right' },
                                { key: 'quality_score', label: 'Quality', col: 'quality_score', align: 'right' },
                            ].map(function(h) {
                                var isSorted = h.col !== null && h.col === sortK;
                                return React.createElement('th', { key: h.key,
                                    onClick: h.col ? (function(col, sorted) { return function() {
                                        if (sorted) setSortD(function(d) { return d === 'desc' ? 'asc' : 'desc'; });
                                        else { setSortK(col); setSortD('desc'); }
                                    }; })(h.col, isSorted) : undefined,
                                    style: { position: 'sticky', top: 0, zIndex: 1, background: '#0b0f1a',
                                        padding: '9px 10px', fontSize: 10, whiteSpace: 'nowrap',
                                        color: isSorted ? '#00d4ff' : 'rgba(255,255,255,0.38)',
                                        borderBottom: '1px solid rgba(255,255,255,0.07)',
                                        cursor: h.col ? 'pointer' : 'default', userSelect: 'none',
                                        textTransform: 'uppercase', letterSpacing: 0.8,
                                        textAlign: h.align, fontFamily: 'DM Sans'
                                    }
                                }, h.label, isSorted ? (sortD === 'desc' ? ' ↓' : ' ↑') : null);
                            })
                        )
                    ),
                    React.createElement('tbody', null,
                        filtPosns.map(function(p) {
                            var type = getType(p.symbol, p);
                            var dayChg = p.daily_change_pct != null ? Number(p.daily_change_pct) : null;
                            var ret = p.unrealised_return_pct != null ? Number(p.unrealised_return_pct) : null;
                            var wt = Number(p.weight_equity_pct || p.portfolio_weight || 0);
                            var q = p.quality_score != null ? Number(p.quality_score) : null;
                            var qCol = q == null ? 'rgba(255,255,255,0.3)' : q >= 60 ? '#10b981' : q >= 40 ? '#f59e0b' : '#ef4444';
                            return React.createElement('tr', { key: p.symbol,
                                style: { borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.12s' },
                                onMouseEnter: function(e) { e.currentTarget.style.background = 'rgba(0,212,255,0.03)'; },
                                onMouseLeave: function(e) { e.currentTarget.style.background = 'transparent'; }
                            },
                                React.createElement('td', { style: { padding: '7px 10px', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#00d4ff', whiteSpace: 'nowrap' } }, p.symbol),
                                React.createElement('td', { style: { padding: '7px 10px', maxWidth: 220 } },
                                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 } },
                                        React.createElement('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'DM Sans' } }, getName(p.symbol, p)),
                                        React.createElement(TypeBadge, { type: type })
                                    )
                                ),
                                React.createElement('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.78)' } },
                                    p.current_price ? '$' + Number(p.current_price).toFixed(2) : '—'),
                                React.createElement('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600,
                                    color: dayChg == null ? 'rgba(255,255,255,0.25)' : dayChg > 0 ? '#10b981' : dayChg < 0 ? '#ef4444' : 'rgba(255,255,255,0.4)' } },
                                    dayChg == null ? '—' : (dayChg > 0 ? '▲ ' : dayChg < 0 ? '▼ ' : '') + (Math.abs(dayChg) * 100).toFixed(2) + '%'),
                                React.createElement('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.82)' } }, fmtCurrency(p.market_value)),
                                React.createElement('td', { style: { padding: '7px 10px', textAlign: 'right' } },
                                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 } },
                                        React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.65)' } }, wt > 0 ? (wt * 100).toFixed(1) + '%' : '—'),
                                        React.createElement('div', { style: { width: 36, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 } },
                                            React.createElement('div', { style: { width: Math.min(wt * 8, 1) * 100 + '%', height: '100%', background: '#00d4ff', borderRadius: 2 } })
                                        )
                                    )
                                ),
                                React.createElement('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11,
                                    color: ret == null ? 'rgba(255,255,255,0.25)' : ret >= 0 ? '#10b981' : '#ef4444' } },
                                    ret == null ? '—' : (ret >= 0 ? '+' : '') + (ret * 100).toFixed(1) + '%'),
                                React.createElement('td', { style: { padding: '7px 10px', textAlign: 'right' } },
                                    q != null
                                        ? React.createElement('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: qCol } }, String(q))
                                        : React.createElement('span', { style: { color: 'rgba(255,255,255,0.2)' } }, '—')
                                )
                            );
                        })
                    )
                )
            )
        ),
        // Earnings Calendar
        React.createElement(EarningsCalendar, { data: earningsData })
    );
}
