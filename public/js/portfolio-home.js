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
import { Loading, HeroCard, NarrativeStrip } from './components.js';
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

var TICKER_SECTORS = {
    // Technology
    'AAPL':'Technology','MSFT':'Technology','GOOGL':'Technology','GOOG':'Technology',
    'AMZN':'Technology','META':'Technology','NVDA':'Technology','AMD':'Technology',
    'INTC':'Technology','QCOM':'Technology','AVGO':'Technology','ORCL':'Technology',
    'CRM':'Technology','ADBE':'Technology','NOW':'Technology','TSM':'Technology',
    'ASML':'Technology','MU':'Technology','AMAT':'Technology',
    // Financials
    'JPM':'Financials','GS':'Financials','MS':'Financials','BAC':'Financials',
    'C':'Financials','WFC':'Financials','BLK':'Financials','SCHW':'Financials',
    // Healthcare
    'JNJ':'Healthcare','UNH':'Healthcare','PFE':'Healthcare','ABBV':'Healthcare',
    'MRK':'Healthcare','LLY':'Healthcare','BIIB':'Healthcare','GILD':'Healthcare',
    'AMGN':'Healthcare','REGN':'Healthcare','VRTX':'Healthcare',
    // Energy
    'XOM':'Energy','CVX':'Energy','HAL':'Energy','OXY':'Energy',
    'COP':'Energy','SLB':'Energy','PBR':'Energy','BP':'Energy','SHEL':'Energy',
    // Industrials
    'BA':'Industrials','CAT':'Industrials','GE':'Industrials','LMT':'Industrials',
    'RTX':'Industrials','HON':'Industrials',
    // Consumer Discretionary
    'TSLA':'Consumer Disc.','TGT':'Consumer Disc.','HD':'Consumer Disc.',
    'NKE':'Consumer Disc.','SBUX':'Consumer Disc.','MCD':'Consumer Disc.',
    // Consumer Staples
    'WMT':'Consumer Staples','COST':'Consumer Staples','PG':'Consumer Staples',
    'KO':'Consumer Staples','PEP':'Consumer Staples',
    // Precious Metals & Mining
    'NEM':'Precious Metals','AEM':'Precious Metals','HMY':'Precious Metals',
    'AU':'Precious Metals','WPM':'Precious Metals','RGLD':'Precious Metals',
    'GLD':'Precious Metals ETF','SLV':'Precious Metals ETF','IAU':'Precious Metals ETF',
    'GDX':'Precious Metals ETF','GDXJ':'Precious Metals ETF',
    // Real Estate
    'AMT':'Real Estate','PLD':'Real Estate','EQIX':'Real Estate',
    'SPG':'Real Estate','PSA':'Real Estate','VNQ':'Real Estate ETF',
    // Broad Market ETFs
    'SPY':'Broad Market ETF','QQQ':'Broad Market ETF','IWM':'Broad Market ETF',
    'VTI':'Broad Market ETF','VOO':'Broad Market ETF','DIA':'Broad Market ETF',
    // International ETFs
    'EWY':'Intl Equity ETF','EEM':'Intl Equity ETF','FXI':'Intl Equity ETF',
    'EFA':'Intl Equity ETF','AVEE':'Intl Equity ETF','AVDV':'Intl Equity ETF',
    // Fixed Income ETFs
    'TLT':'Fixed Income ETF','HYG':'Fixed Income ETF','LQD':'Fixed Income ETF',
    // Other
    'BITO':'Crypto ETF',
};

var TICKER_TYPES = {
    'SPY':'ETF','QQQ':'ETF','IWM':'ETF','VTI':'ETF','VOO':'ETF','DIA':'ETF',
    'GLD':'ETF','SLV':'ETF','IAU':'ETF','GDX':'ETF','GDXJ':'ETF',
    'EWY':'ETF','EEM':'ETF','FXI':'ETF','EFA':'ETF','AVEE':'ETF','AVDV':'ETF',
    'TLT':'ETF','HYG':'ETF','LQD':'ETF','VNQ':'ETF','BITO':'ETF',
    'RGLD':'MINE','WPM':'MINE','NEM':'MINE','AEM':'MINE','HMY':'MINE','AU':'MINE',
    'AMT':'REIT','PLD':'REIT','EQIX':'REIT','SPG':'REIT','PSA':'REIT',
};

// Region classification — defaults to 'US' for unlisted symbols
var TICKER_REGIONS = {
    // Emerging Markets
    'EEM':'EM','FXI':'EM','EWY':'EM','AVEE':'EM','VWO':'EM',
    'PBR':'EM','BABA':'EM','JD':'EM','HMY':'EM','AU':'EM',
    // International Developed
    'TSM':'INTL','ASML':'INTL','EFA':'INTL','AVDV':'INTL',
    'BP':'INTL','SHEL':'INTL','AEM':'INTL','WPM':'INTL','VALE':'INTL',
};
function getRegion(symbol) { return TICKER_REGIONS[symbol] || 'US'; }

// Filter groups — each entry has id (used in state), label (displayed), and a match fn
var FILTER_GROUPS = [
    {
        label: 'REGION',
        color: '#00d4ff',
        filters: [
            { id: 'R:US',   label: 'US'   },
            { id: 'R:INTL', label: 'Intl' },
            { id: 'R:EM',   label: 'EM'   },
        ],
    },
    {
        label: 'SECTOR',
        color: '#8b5cf6',
        filters: [
            { id: 'S:Technology',        label: 'Tech'    },
            { id: 'S:Financials',        label: 'Fin'     },
            { id: 'S:Healthcare',        label: 'Health'  },
            { id: 'S:Energy',            label: 'Energy'  },
            { id: 'S:Precious Metals',   label: 'Metals'  },
            { id: 'S:Consumer Disc.',    label: 'Cons'    },
            { id: 'S:Industrials',       label: 'Indust'  },
        ],
    },
    {
        label: 'TYPE',
        color: '#10b981',
        filters: [
            { id: 'T:EQ',   label: 'EQ'   },
            { id: 'T:ETF',  label: 'ETF'  },
            { id: 'T:REIT', label: 'REIT' },
            { id: 'T:MINE', label: 'Mine' },
        ],
    },
    {
        label: 'LENS',
        color: '#f59e0b',
        filters: [
            { id: 'L:WIN',  label: '+ Gains'    },
            { id: 'L:LOSS', label: '- Losses'   },
            { id: 'L:HQ',   label: '★ Hi-Q'      },
            { id: 'L:MOM',  label: '▲ Momentum'  },
            { id: 'L:TOP',  label: 'Top 10'     },
            { id: 'L:RISK', label: '⚠ At Risk'   },
        ],
    },
];

function matchFilter(p, filtId, allPositions) {
    if (!filtId || filtId === 'ALL') return true;
    if (filtId.startsWith('R:')) return getRegion(p.symbol) === filtId.slice(2);
    if (filtId.startsWith('S:')) {
        var sec = getSector(p.symbol, p);
        return sec === filtId.slice(2) || sec.startsWith(filtId.slice(2));
    }
    if (filtId.startsWith('T:')) return getType(p.symbol, p) === filtId.slice(2);
    if (filtId === 'L:WIN')  return Number(p.unrealised_return_pct) > 0;
    if (filtId === 'L:LOSS') return Number(p.unrealised_return_pct) < 0;
    if (filtId === 'L:HQ')   return Number(p.quality_score || 0) >= 60;
    if (filtId === 'L:MOM')  return Number(p.daily_change_pct) > 0 && Number(p.unrealised_return_pct) > 0;
    if (filtId === 'L:RISK') return Number(p.unrealised_return_pct) < -0.10;
    if (filtId === 'L:TOP') {
        var sorted = allPositions.slice().sort(function(a, b) {
            return Math.abs(Number(b.market_value) || 0) - Math.abs(Number(a.market_value) || 0);
        });
        return sorted.slice(0, 10).some(function(x) { return x.symbol === p.symbol; });
    }
    return true;
}

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
function getSector(symbol, pos) {
    if (pos.sector && pos.sector !== 'Other' && pos.sector !== 'other' && pos.sector !== 'N/A') return pos.sector;
    return TICKER_SECTORS[symbol] || (pos.sector && pos.sector !== 'Other' ? pos.sector : 'Other');
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

// ── QuickTradePanel — slide-in order ticket from the holdings table ──────────

function fN2(v, d) {
    if (v == null || !isFinite(Number(v))) return '—';
    return Number(v).toFixed(d != null ? d : 2);
}
function fLargeP(v) {
    if (v == null || !isFinite(v)) return '—';
    var abs = Math.abs(v);
    if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'k';
    return '$' + v.toFixed(2);
}

function QuickTradePanel(p) {
    var pos = p.pos;
    var _side = useState('sell'); var side = _side[0]; var setSide = _side[1];
    var _mode = useState('pct');  var mode = _mode[0]; var setMode = _mode[1];
    var _qty  = useState('25');   var qty  = _qty[0];  var setQty  = _qty[1];
    var _otype = useState('market'); var otype = _otype[0]; var setOtype = _otype[1];
    var _lp   = useState('');     var lp   = _lp[0];   var setLp   = _lp[1];
    var _conf = useState(false);  var conf = _conf[0]; var setConf = _conf[1];
    var _res  = useState(null);   var result = _res[0]; var setResult = _res[1];
    var _busy = useState(false);  var busy = _busy[0]; var setBusy = _busy[1];

    // Reset on new position
    useEffect(function () {
        setSide('sell'); setMode('pct'); setQty('25'); setOtype('market');
        setLp(''); setConf(false); setResult(null);
    }, [pos && pos.symbol]);

    if (!pos) return null;

    var price  = Number(pos.current_price) || 0;
    var shares = Number(pos.quantity || pos.qty || pos.shares || 0);
    var mv     = Number(pos.market_value || 0);
    var ret    = pos.unrealised_return_pct != null ? Number(pos.unrealised_return_pct) : null;
    var dayChg = pos.daily_change_pct != null ? Number(pos.daily_change_pct) : null;

    function computeShares() {
        var v = parseFloat(qty) || 0;
        if (mode === 'shares')   return v;
        if (mode === 'notional') return price > 0 ? v / price : 0;
        if (mode === 'pct')      return shares * (v / 100);
        return 0;
    }

    var estShares = computeShares();
    var estCost   = price > 0 && estShares > 0 ? estShares * price : null;
    var sideCol   = side === 'buy' ? '#10b981' : '#ef4444';

    function inputS() {
        return { width: '100%', padding: '7px 10px', fontSize: 12, boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 5, color: 'rgba(255,255,255,0.92)', fontFamily: 'JetBrains Mono', outline: 'none' };
    }
    function labelS() {
        return { fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
            letterSpacing: 1, marginBottom: 4, display: 'block' };
    }
    function pillBtn(active, col) {
        return { flex: 1, padding: '5px 0', borderRadius: 5, fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.5, cursor: 'pointer',
            background: active ? col + '22' : 'transparent',
            border: '1px solid ' + (active ? col + '55' : 'rgba(255,255,255,0.08)'),
            color: active ? col : 'rgba(255,255,255,0.4)' };
    }

    function submit() {
        if (!estShares || estShares <= 0) { setResult({ success: false, error: 'Quantity must be > 0' }); return; }
        setBusy(true); setResult(null);
        var body = { symbol: pos.symbol, side: side, type: otype, tif: 'day' };
        if (mode === 'notional') {
            body.notional = parseFloat(qty);
        } else {
            body.qty = Math.round(estShares * 10000) / 10000;
        }
        if (otype === 'limit' && lp) body.limitPrice = parseFloat(lp);
        fetch('/api/trading?action=order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
            .then(function (r) { return r.json(); })
            .then(function (j) { setResult(j); setBusy(false); setConf(false); })
            .catch(function (e) { setResult({ success: false, error: e.message }); setBusy(false); setConf(false); });
    }

    // Pct shortcut buttons
    var PCT_QUICK = [10, 25, 50, 100];

    return React.createElement('div', {
        style: {
            position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 500,
            display: 'flex', pointerEvents: 'none',
        }
    },
        // Backdrop
        React.createElement('div', {
            onClick: p.onClose,
            style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', pointerEvents: 'auto' }
        }),
        // Panel
        React.createElement('div', {
            style: {
                position: 'relative', width: 320, height: '100%',
                background: '#080b15', borderLeft: '1px solid rgba(255,255,255,0.09)',
                overflowY: 'auto', pointerEvents: 'auto',
                display: 'flex', flexDirection: 'column', gap: 14, padding: 20,
                boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
            }
        },
            // Header
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
                React.createElement('div', null,
                    React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 } }, 'Quick Trade'),
                    React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 800, color: '#00d4ff' } }, pos.symbol),
                    price > 0 && React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 } },
                        '$' + fN2(price, 2),
                        dayChg != null && React.createElement('span', {
                            style: { marginLeft: 8, fontSize: 11, color: dayChg >= 0 ? '#10b981' : '#ef4444' }
                        }, (dayChg >= 0 ? '▲ +' : '▼ ') + (Math.abs(dayChg) * 100).toFixed(2) + '%')
                    )
                ),
                React.createElement('button', {
                    onClick: p.onClose,
                    style: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1 }
                }, '×')
            ),

            // Position strip
            React.createElement('div', {
                style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 12px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: 7, border: '1px solid rgba(255,255,255,0.06)' }
            },
                React.createElement('div', null,
                    React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 } }, 'Shares Held'),
                    React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.88)' } },
                        shares > 0 ? fN2(shares, shares % 1 === 0 ? 0 : 4) : '—')
                ),
                React.createElement('div', null,
                    React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 } }, 'Mkt Value'),
                    React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.88)' } }, fLargeP(mv))
                ),
                React.createElement('div', null,
                    React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 } }, 'Unrealised P&L'),
                    React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600, color: ret == null ? 'rgba(255,255,255,0.4)' : ret >= 0 ? '#10b981' : '#ef4444' } },
                        ret == null ? '—' : (ret >= 0 ? '+' : '') + (ret * 100).toFixed(2) + '%')
                ),
                React.createElement('div', null,
                    React.createElement('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 } }, 'Cost Basis'),
                    React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, color: 'rgba(255,255,255,0.65)' } },
                        pos.cost_basis ? '$' + fN2(Number(pos.cost_basis), 2) : '—')
                )
            ),

            // Buy / Sell
            React.createElement('div', { style: { display: 'flex', gap: 6 } },
                React.createElement('button', { onClick: function () { setSide('buy'); setConf(false); setResult(null); }, style: pillBtn(side === 'buy', '#10b981') }, 'Buy'),
                React.createElement('button', { onClick: function () { setSide('sell'); setConf(false); setResult(null); }, style: pillBtn(side === 'sell', '#ef4444') }, 'Sell')
            ),

            // Qty mode
            React.createElement('div', null,
                React.createElement('label', { style: labelS() }, 'Quantity Mode'),
                React.createElement('div', { style: { display: 'flex', gap: 5, marginBottom: 8 } },
                    [['shares', 'Shares'], ['notional', '$ Amount'], ['pct', '% Position']].map(function (pair) {
                        var active = mode === pair[0];
                        return React.createElement('button', {
                            key: pair[0],
                            onClick: function () { setMode(pair[0]); setQty(''); },
                            style: { flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 10, fontWeight: 600,
                                cursor: 'pointer', background: active ? '#6366f133' : 'transparent',
                                border: '1px solid ' + (active ? '#6366f166' : 'rgba(255,255,255,0.08)'),
                                color: active ? '#a5b4fc' : 'rgba(255,255,255,0.38)' }
                        }, pair[1]);
                    })
                ),
                // Pct quick-picks
                mode === 'pct' && React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 6 } },
                    PCT_QUICK.map(function (v) {
                        return React.createElement('button', {
                            key: v,
                            onClick: function () { setQty(String(v)); },
                            style: { flex: 1, padding: '3px 0', borderRadius: 3, fontSize: 10, cursor: 'pointer',
                                fontFamily: 'JetBrains Mono', fontWeight: 600,
                                background: qty === String(v) ? sideCol + '22' : 'rgba(255,255,255,0.04)',
                                border: '1px solid ' + (qty === String(v) ? sideCol + '44' : 'rgba(255,255,255,0.06)'),
                                color: qty === String(v) ? sideCol : 'rgba(255,255,255,0.4)' }
                        }, v + '%');
                    })
                ),
                React.createElement('input', {
                    type: 'number', value: qty, min: 0,
                    step: mode === 'pct' ? 1 : mode === 'notional' ? 100 : 1,
                    onChange: function (e) { setQty(e.target.value); },
                    placeholder: mode === 'shares' ? 'Shares' : mode === 'notional' ? 'Dollar amount' : '% of position (0–100)',
                    style: inputS(),
                }),
                // Preview
                estShares > 0 && React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 4, fontFamily: 'JetBrains Mono' } },
                    mode !== 'shares' ? '≈ ' + fN2(estShares, estShares >= 1 ? 2 : 4) + ' shares' : '',
                    estCost != null ? (mode !== 'shares' ? ' · ' : '') + 'Est. ' + (side === 'buy' ? 'cost' : 'proceeds') + ': ' + fLargeP(estCost) : ''
                )
            ),

            // Order type
            React.createElement('div', null,
                React.createElement('label', { style: labelS() }, 'Order Type'),
                React.createElement('select', {
                    value: otype, onChange: function (e) { setOtype(e.target.value); },
                    style: Object.assign({}, inputS(), { cursor: 'pointer' }),
                },
                    React.createElement('option', { value: 'market' }, 'Market'),
                    React.createElement('option', { value: 'limit'  }, 'Limit')
                )
            ),
            otype === 'limit' && React.createElement('div', null,
                React.createElement('label', { style: labelS() }, 'Limit Price'),
                React.createElement('input', {
                    type: 'number', value: lp, step: '0.01',
                    placeholder: price > 0 ? '$' + fN2(price, 2) : '0.00',
                    onChange: function (e) { setLp(e.target.value); },
                    style: inputS(),
                })
            ),

            // Submit
            React.createElement('div', { style: { marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 } },
                !conf
                    ? React.createElement('button', {
                        onClick: function () { setConf(true); setResult(null); },
                        disabled: busy || !estShares || estShares <= 0,
                        style: { padding: '11px 0', borderRadius: 6, fontSize: 13, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer',
                            background: sideCol + '22', border: '1px solid ' + sideCol + '66', color: sideCol,
                            opacity: (!estShares || estShares <= 0) ? 0.4 : 1 },
                    }, side.toUpperCase() + ' ' + pos.symbol + (estShares > 0 ? ' · ' + fN2(estShares, 2) + ' sh' : ''))
                    : React.createElement('div', { style: { display: 'flex', gap: 8 } },
                        React.createElement('button', {
                            onClick: submit, disabled: busy,
                            style: { flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 12, fontWeight: 700,
                                cursor: 'pointer', background: sideCol + '33', border: '1px solid ' + sideCol, color: sideCol },
                        }, busy ? 'Sending…' : '✓ Confirm'),
                        React.createElement('button', {
                            onClick: function () { setConf(false); },
                            style: { flex: 1, padding: '10px 0', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                                background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)' },
                        }, 'Cancel')
                    ),
                result && React.createElement('div', {
                    style: { padding: '8px 10px', borderRadius: 6, fontSize: 11,
                        background: result.success ? '#10b98118' : '#ef444418',
                        border: '1px solid ' + (result.success ? '#10b98144' : '#ef444444'),
                        color: result.success ? '#10b981' : '#ef4444' }
                }, result.success
                    ? '✓ Order submitted · ' + (result.order && result.order.id ? result.order.id.slice(0, 8) + '…' : '')
                    : '✗ ' + (result.error || 'Error'))
            )
        )
    );
}

// ── Shared mini helpers ───────────────────────────────────────

var C = {
    green: '#10b981', red: '#ef4444', blue: '#00d4ff',
    amber: '#f59e0b', purple: '#8b5cf6', muted: 'rgba(255,255,255,0.3)',
    sec: 'rgba(255,255,255,0.55)', text: 'rgba(255,255,255,0.88)',
    border: 'rgba(255,255,255,0.07)', card: '#0d1117',
};

function SnapCard(p) {
    return React.createElement('div', {
        style: Object.assign({ background: C.card, borderRadius: 10, border: '1px solid ' + C.border,
            padding: '16px 18px' }, p.style || {})
    }, p.children);
}

function SnapLabel(p) {
    return React.createElement('div', { style: { fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase',
        color: C.muted, marginBottom: p.mb != null ? p.mb : 10, fontFamily: 'DM Sans' } }, p.children);
}

function MiniStat(p) {
    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1 } },
        React.createElement('div', { style: { fontSize: 9, color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'DM Sans', textAlign: 'center' } }, p.label),
        React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: p.size || 20, fontWeight: 800, color: p.color || C.text, lineHeight: 1.1 } }, p.value),
        p.sub && React.createElement('div', { style: { fontSize: 9, color: C.muted, fontFamily: 'DM Sans' } }, p.sub)
    );
}

function GaugeDial(p) {
    // SVG arc gauge: value 0-100, colour by value
    var pct = Math.max(0, Math.min(100, p.value || 0));
    var r = 48, cx = 60, cy = 60, strokeW = 9;
    var arcLen = Math.PI * r; // half circle
    var filled = (pct / 100) * arcLen;
    var dasharray = filled + ' ' + arcLen;
    var col = pct >= 65 ? C.green : pct >= 40 ? C.amber : C.red;
    return React.createElement('svg', { width: 120, height: 68, viewBox: '0 0 120 70' },
        React.createElement('path', { d: 'M 12 60 A 48 48 0 0 1 108 60',
            fill: 'none', stroke: 'rgba(255,255,255,0.07)', strokeWidth: strokeW, strokeLinecap: 'round' }),
        React.createElement('path', { d: 'M 12 60 A 48 48 0 0 1 108 60',
            fill: 'none', stroke: col, strokeWidth: strokeW, strokeLinecap: 'round',
            strokeDasharray: dasharray, strokeDashoffset: 0 }),
        React.createElement('text', { x: 60, y: 52, textAnchor: 'middle', fontFamily: 'JetBrains Mono',
            fontSize: 18, fontWeight: 800, fill: col }, Math.round(pct)),
        React.createElement('text', { x: 60, y: 63, textAnchor: 'middle', fontFamily: 'DM Sans',
            fontSize: 8, fill: C.muted }, p.label || 'score')
    );
}

// ── Performance Snapshot ──────────────────────────────────────

function PerformanceSnapshot(p) {
    var positions = p.positions || [];
    var navData   = p.navData   || [];

    // Win rate
    var withRet = positions.filter(function(pos) { return pos.unrealised_return_pct != null && isFinite(Number(pos.unrealised_return_pct)); });
    var winners = withRet.filter(function(pos) { return Number(pos.unrealised_return_pct) > 0; });
    var winRate = withRet.length > 0 ? (winners.length / withRet.length) * 100 : 0;

    // Return distribution buckets
    var buckets = { '< -20%': 0, '-20 to -10%': 0, '-10 to 0%': 0, '0 to +10%': 0, '+10 to +20%': 0, '> +20%': 0 };
    var bucketColors = ['#dc2626','#ef4444','#f87171','#4ade80','#16a34a','#15803d'];
    withRet.forEach(function(pos) {
        var r = Number(pos.unrealised_return_pct) * 100;
        if (r < -20) buckets['< -20%']++;
        else if (r < -10) buckets['-20 to -10%']++;
        else if (r < 0)   buckets['-10 to 0%']++;
        else if (r < 10)  buckets['0 to +10%']++;
        else if (r < 20)  buckets['+10 to +20%']++;
        else              buckets['> +20%']++;
    });
    var bucketKeys = Object.keys(buckets);
    var bucketMax = Math.max.apply(null, bucketKeys.map(function(k) { return buckets[k]; })) || 1;

    // Portfolio median return
    var sortedRets = withRet.map(function(pos) { return Number(pos.unrealised_return_pct) * 100; }).sort(function(a,b){return a-b;});
    var medianRet = sortedRets.length ? sortedRets[Math.floor(sortedRets.length / 2)] : 0;

    // Top alpha captures (return above portfolio median, weighted by mktval)
    var totalMv = positions.reduce(function(s, pos) { return s + Math.abs(Number(pos.market_value) || 0); }, 0);
    var alphaPositions = withRet.map(function(pos) {
        var ret = Number(pos.unrealised_return_pct) * 100;
        var wt  = totalMv > 0 ? Math.abs(Number(pos.market_value) || 0) / totalMv : 0;
        return { symbol: pos.symbol, ret: ret, excess: ret - medianRet, wt: wt,
            wtdContrib: (ret - medianRet) * wt };
    }).sort(function(a, b) { return b.wtdContrib - a.wtdContrib; });
    var topAlpha = alphaPositions.slice(0, 5);
    var botAlpha = alphaPositions.slice(-5).reverse();

    // Momentum: positions where day% direction matches overall return direction
    var withMom = positions.filter(function(pos) {
        return pos.daily_change_pct != null && pos.unrealised_return_pct != null;
    });
    var aligned = withMom.filter(function(pos) {
        var d = Number(pos.daily_change_pct), r = Number(pos.unrealised_return_pct);
        return (d >= 0 && r >= 0) || (d < 0 && r < 0);
    });
    var momPct = withMom.length > 0 ? (aligned.length / withMom.length) * 100 : 0;

    // NAV-based performance
    var navSorted = navData.slice().sort(function(a,b){return new Date(a.price_date)-new Date(b.price_date);});
    var nav30ago = navSorted.length > 22 ? navSorted[navSorted.length - 22] : navSorted[0];
    var navNow   = navSorted.length ? navSorted[navSorted.length - 1] : null;
    var ret30d   = nav30ago && navNow && nav30ago.nav > 0 ? ((navNow.nav - nav30ago.nav) / nav30ago.nav) * 100 : null;

    var h = React.createElement;

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },

        // Row 1: KPI strip
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 } },
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 } },
                h(GaugeDial, { value: winRate, label: 'win rate' }),
                h('div', { style: { fontSize: 10, color: C.muted, textAlign: 'center', fontFamily: 'DM Sans' } },
                    winners.length + ' of ' + withRet.length + ' positions profitable')
            ),
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 } },
                h(SnapLabel, { mb: 6 }, 'Momentum Alignment'),
                h(GaugeDial, { value: momPct, label: 'aligned' }),
                h('div', { style: { fontSize: 10, color: C.muted, textAlign: 'center', fontFamily: 'DM Sans' } },
                    'Day direction = total return direction')
            ),
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 } },
                h(SnapLabel, { mb: 4 }, 'Median Position Return'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 32, fontWeight: 800,
                    color: medianRet >= 0 ? C.green : C.red } },
                    (medianRet >= 0 ? '+' : '') + medianRet.toFixed(1) + '%'),
                h('div', { style: { fontSize: 10, color: C.muted, fontFamily: 'DM Sans' } }, 'Mid-point of all positions')
            ),
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 } },
                h(SnapLabel, { mb: 4 }, '30-Day Portfolio Return'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 32, fontWeight: 800,
                    color: ret30d == null ? C.muted : ret30d >= 0 ? C.green : C.red } },
                    ret30d == null ? '—' : (ret30d >= 0 ? '+' : '') + ret30d.toFixed(2) + '%'),
                h('div', { style: { fontSize: 10, color: C.muted, fontFamily: 'DM Sans' } }, 'vs 22 trading days ago')
            )
        ),

        // Row 2: Return distribution + alpha capture
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
            h(SnapCard, null,
                h(SnapLabel, null, 'Return Distribution'),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                    bucketKeys.map(function(key, i) {
                        var count = buckets[key];
                        var barW = (count / bucketMax) * 100;
                        var col = bucketColors[i];
                        return h('div', { key: key, style: { display: 'flex', alignItems: 'center', gap: 8 } },
                            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 9, color: C.muted, minWidth: 84, textAlign: 'right' } }, key),
                            h('div', { style: { flex: 1, height: 18, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden', position: 'relative' } },
                                h('div', { style: { width: barW + '%', height: '100%', background: col, borderRadius: 3, opacity: 0.75 } }),
                                count > 0 && h('span', { style: { position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                                    fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(255,255,255,0.8)', fontWeight: 700 } }, count)
                            )
                        );
                    })
                )
            ),
            h(SnapCard, null,
                h(SnapLabel, null, 'Excess Return vs Portfolio Median (weighted)'),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 0 } },
                    h('div', { style: { display: 'flex', gap: 8, marginBottom: 8 } },
                        h('div', { style: { flex: 1 } },
                            h('div', { style: { fontSize: 9, color: C.green, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'DM Sans', marginBottom: 4 } }, '▲ Top alpha'),
                            topAlpha.map(function(pos) {
                                return h('div', { key: pos.symbol, style: { display: 'flex', justifyContent: 'space-between',
                                    padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center' } },
                                    h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: C.blue } }, pos.symbol),
                                    h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: C.green } },
                                        '+' + pos.excess.toFixed(1) + '%')
                                );
                            })
                        ),
                        h('div', { style: { width: 1, background: 'rgba(255,255,255,0.05)' } }),
                        h('div', { style: { flex: 1 } },
                            h('div', { style: { fontSize: 9, color: C.red, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'DM Sans', marginBottom: 4, paddingLeft: 8 } }, '▼ Laggards'),
                            botAlpha.map(function(pos) {
                                return h('div', { key: pos.symbol, style: { display: 'flex', justifyContent: 'space-between',
                                    padding: '4px 0 4px 8px', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center' } },
                                    h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, color: C.blue } }, pos.symbol),
                                    h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: C.red } },
                                        pos.excess.toFixed(1) + '%')
                                );
                            })
                        )
                    )
                )
            )
        ),

        // Row 3: full return ladder
        h(SnapCard, null,
            h(SnapLabel, null, 'Position Return Ladder — sorted by total return'),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' } },
                withRet.slice().sort(function(a,b){return Number(b.unrealised_return_pct)-Number(a.unrealised_return_pct);})
                .map(function(pos) {
                    var ret = Number(pos.unrealised_return_pct) * 100;
                    var wt  = totalMv > 0 ? Math.abs(Number(pos.market_value)||0) / totalMv * 100 : 0;
                    var col = ret > 0 ? C.green : C.red;
                    var barW = Math.min(Math.abs(ret) / 50, 1) * 100;
                    return h('div', { key: pos.symbol, style: { display: 'flex', alignItems: 'center', gap: 8 } },
                        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: C.blue, minWidth: 48 } }, pos.symbol),
                        h('span', { style: { fontSize: 9, color: C.muted, minWidth: 34, textAlign: 'right', fontFamily: 'JetBrains Mono' } }, wt.toFixed(1) + '%'),
                        h('div', { style: { flex: 1, height: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 2, overflow: 'hidden', position: 'relative' } },
                            h('div', { style: { position: 'absolute',
                                left: ret >= 0 ? '50%' : (50 - barW/2) + '%',
                                width: barW/2 + '%', height: '100%', background: col, opacity: 0.65, borderRadius: 2 } }),
                            h('div', { style: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.12)' } })
                        ),
                        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: col, minWidth: 56, textAlign: 'right', fontWeight: 600 } },
                            (ret >= 0 ? '+' : '') + ret.toFixed(1) + '%')
                    );
                })
            )
        )
    );
}

// ── Risk Snapshot ─────────────────────────────────────────────

function RiskSnapshot(p) {
    var positions = p.positions || [];
    var h = React.createElement;

    var totalMv = positions.reduce(function(s, pos) { return s + Math.abs(Number(pos.market_value)||0); }, 0);

    // Stress temperature: composite score from concentration, leverage signal, drawdown exposure
    var sorted = positions.slice().sort(function(a,b){return Math.abs(Number(b.market_value)||0)-Math.abs(Number(a.market_value)||0);});
    var top5wt  = sorted.slice(0,5).reduce(function(s,pos){return s + Math.abs(Number(pos.market_value)||0);},0) / (totalMv||1);
    var hhi = positions.reduce(function(s,pos){var w=totalMv?Math.abs(Number(pos.market_value)||0)/totalMv:0; return s+w*w;},0);
    var pctUnderwater = positions.filter(function(pos){return pos.unrealised_return_pct!=null&&Number(pos.unrealised_return_pct)<0;}).length / (positions.length||1);
    var stressScore = Math.min(100, Math.round(
        top5wt * 35 +       // concentration up to 35pts
        hhi * 25 * 100 +    // HHI signal
        pctUnderwater * 40  // underwater positions
    ));
    var stressCol = stressScore > 65 ? C.red : stressScore > 40 ? C.amber : C.green;
    var stressLabel = stressScore > 65 ? 'Elevated' : stressScore > 40 ? 'Moderate' : 'Low';

    // Drawdown exposure: positions most at risk (negative ret × weight)
    var drawdownPositions = positions.map(function(pos) {
        var ret = pos.unrealised_return_pct != null ? Number(pos.unrealised_return_pct) : 0;
        var mv  = Math.abs(Number(pos.market_value)||0);
        var wt  = totalMv > 0 ? mv / totalMv : 0;
        var exposure = ret < 0 ? Math.abs(ret) * wt * 100 : 0;
        return { symbol: pos.symbol, ret: ret * 100, wt: wt * 100, exposure: exposure, mv: mv };
    }).filter(function(pos) { return pos.ret < 0; })
      .sort(function(a,b) { return b.exposure - a.exposure; }).slice(0, 8);

    // Sector risk budget (simple: warn any sector > 30% of portfolio)
    var bySector = {};
    positions.forEach(function(pos) {
        var sec = getSector(pos.symbol, pos);
        bySector[sec] = (bySector[sec] || 0) + Math.abs(Number(pos.market_value)||0);
    });
    var sectorRisk = Object.keys(bySector).map(function(sec) {
        var wt = totalMv > 0 ? bySector[sec] / totalMv * 100 : 0;
        return { sec: sec, wt: wt, breach: wt > 30 };
    }).sort(function(a,b){return b.wt-a.wt;});

    // Volatility proxy: positions with highest absolute day change
    var volPositions = positions.filter(function(pos){return pos.daily_change_pct!=null;})
        .map(function(pos){ return { symbol: pos.symbol, absDayChg: Math.abs(Number(pos.daily_change_pct))*100,
            dayChg: Number(pos.daily_change_pct)*100, wt: totalMv>0?Math.abs(Number(pos.market_value)||0)/totalMv*100:0 }; })
        .sort(function(a,b){return b.absDayChg-a.absDayChg;}).slice(0,6);

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },

        // Row 1: stress gauge + tail metrics
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 } },
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, gridColumn: 'span 1' } },
                h(SnapLabel, { mb: 4 }, 'Portfolio Stress'),
                h(GaugeDial, { value: stressScore, label: stressLabel }),
                h('div', { style: { fontSize: 10, textAlign: 'center', color: stressCol, fontFamily: 'DM Sans', fontWeight: 600 } }, stressLabel + ' risk profile')
            ),
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 } },
                h(SnapLabel, { mb: 4 }, 'Underwater Positions'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 32, fontWeight: 800,
                    color: pctUnderwater > 0.5 ? C.red : pctUnderwater > 0.3 ? C.amber : C.green } },
                    Math.round(pctUnderwater * 100) + '%'),
                h('div', { style: { fontSize: 10, color: C.muted, fontFamily: 'DM Sans', textAlign: 'center' } },
                    positions.filter(function(pos){return Number(pos.unrealised_return_pct||0)<0;}).length + ' of ' + positions.length + ' positions')
            ),
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 } },
                h(SnapLabel, { mb: 4 }, 'Top-5 Concentration'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 32, fontWeight: 800,
                    color: top5wt > 0.6 ? C.red : top5wt > 0.45 ? C.amber : C.green } },
                    (top5wt * 100).toFixed(0) + '%'),
                h('div', { style: { fontSize: 10, color: C.muted, fontFamily: 'DM Sans', textAlign: 'center' } }, 'of portfolio in top 5')
            ),
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 } },
                h(SnapLabel, { mb: 4 }, 'HHI Concentration'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 32, fontWeight: 800,
                    color: hhi > 0.25 ? C.red : hhi > 0.15 ? C.amber : C.green } },
                    Math.round(hhi * 10000)),
                h('div', { style: { fontSize: 10, color: C.muted, fontFamily: 'DM Sans', textAlign: 'center' } }, '< 1500 diversified · > 2500 concentrated')
            )
        ),

        // Row 2: sector risk budget + volatility leaders
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
            h(SnapCard, null,
                h(SnapLabel, null, 'Sector Risk Budget (30% threshold)'),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 7 } },
                    sectorRisk.map(function(s) {
                        var col = s.breach ? C.red : s.wt > 20 ? C.amber : C.green;
                        return h('div', { key: s.sec },
                            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3 } },
                                h('span', { style: { fontSize: 11, color: s.breach ? C.red : C.sec, fontFamily: 'DM Sans',
                                    display: 'flex', alignItems: 'center', gap: 5 } },
                                    s.breach && h('span', { style: { color: C.red, fontSize: 10 } }, '⚠ '),
                                    s.sec),
                                h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: col, fontWeight: 700 } },
                                    s.wt.toFixed(1) + '%')
                            ),
                            h('div', { style: { height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 2, overflow: 'hidden', position: 'relative' } },
                                h('div', { style: { width: Math.min(s.wt, 100) + '%', height: '100%', background: col, borderRadius: 2, opacity: 0.75 } }),
                                h('div', { style: { position: 'absolute', left: '30%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.2)' } })
                            )
                        );
                    })
                )
            ),
            h(SnapCard, null,
                h(SnapLabel, null, 'Today\'s Highest-Volatility Positions'),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 0 } },
                    volPositions.map(function(pos) {
                        var col = pos.dayChg >= 0 ? C.green : C.red;
                        return h('div', { key: pos.symbol,
                            style: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
                            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, color: C.blue, minWidth: 52 } }, pos.symbol),
                            h('span', { style: { fontSize: 10, color: C.muted, flex: 1, fontFamily: 'DM Sans' } }, pos.wt.toFixed(1) + '% of portfolio'),
                            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 12, color: col, fontWeight: 700, minWidth: 60, textAlign: 'right' } },
                                (pos.dayChg >= 0 ? '▲ +' : '▼ ') + pos.absDayChg.toFixed(2) + '%')
                        );
                    })
                )
            )
        ),

        // Row 3: drawdown exposure table
        drawdownPositions.length > 0 && h(SnapCard, null,
            h(SnapLabel, null, 'Weighted Drawdown Exposure — underwater positions ranked by portfolio impact'),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                drawdownPositions.map(function(pos) {
                    var barW = Math.min(pos.exposure / (drawdownPositions[0].exposure || 1), 1) * 100;
                    return h('div', { key: pos.symbol, style: { display: 'flex', alignItems: 'center', gap: 10 } },
                        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: C.blue, minWidth: 48 } }, pos.symbol),
                        h('span', { style: { fontSize: 9, color: C.muted, minWidth: 34, textAlign: 'right', fontFamily: 'JetBrains Mono' } }, pos.wt.toFixed(1) + '%'),
                        h('div', { style: { flex: 1, height: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 2, overflow: 'hidden' } },
                            h('div', { style: { width: barW + '%', height: '100%', background: C.red, opacity: 0.55, borderRadius: 2 } })
                        ),
                        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: C.red, minWidth: 56, textAlign: 'right' } },
                            pos.ret.toFixed(1) + '%'),
                        h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 9, color: 'rgba(239,68,68,0.5)', minWidth: 40, textAlign: 'right' } },
                            pos.exposure.toFixed(2) + 'pp')
                    );
                })
            )
        )
    );
}

// ── Portfolio Management Snapshot ─────────────────────────────

function calcHHI(pList, mv) {
    return pList.reduce(function(s,pos){var w=mv?Math.abs(Number(pos.market_value)||0)/mv:0; return s+w*w;},0);
}

function PortfolioMgmtSnapshot(p) {
    var positions = p.positions || [];
    var txData    = p.txData    || [];
    var h = React.createElement;

    var totalMv = positions.reduce(function(s, pos) { return s + Math.abs(Number(pos.market_value)||0); }, 0);
    var totalCost = positions.reduce(function(s, pos) { return s + Math.abs(Number(pos.cost_basis||0) * Number(pos.quantity||0)); }, 0);

    // Position aging: map buys from txData to first seen date
    var firstBuy = {};
    var today = new Date();
    txData.forEach(function(t) {
        var sym = t.symbol || t.ticker;
        var d   = t.transaction_date || t.date || t.trade_date;
        var side = (t.side || t.transaction_type || '').toUpperCase();
        if (!sym || !d || side.indexOf('BUY') < 0) return;
        if (!firstBuy[sym] || d < firstBuy[sym]) firstBuy[sym] = d;
    });

    var positionsWithAge = positions.map(function(pos) {
        var entryDate = firstBuy[pos.symbol];
        var ageDays = entryDate ? Math.round((today - new Date(entryDate)) / 864e5) : null;
        var mv  = Math.abs(Number(pos.market_value)||0);
        var cb  = Number(pos.cost_basis||0) * Number(pos.quantity||0);
        var pnl = mv - (cb || mv);
        var ret = pos.unrealised_return_pct != null ? Number(pos.unrealised_return_pct)*100 : null;
        var wt  = totalMv > 0 ? mv / totalMv * 100 : 0;
        return { symbol: pos.symbol, mv: mv, cb: cb, pnl: pnl, ret: ret, wt: wt, ageDays: ageDays };
    });

    // Rebalancing drift: positions where weight deviates strongly from equal-weight target
    var eqTarget = positions.length > 0 ? 100 / positions.length : 0;
    var driftPositions = positionsWithAge.map(function(pos) {
        return Object.assign({}, pos, { drift: pos.wt - eqTarget });
    }).sort(function(a,b){return Math.abs(b.drift)-Math.abs(a.drift);}).slice(0,10);

    // Cost efficiency: P&L per $ invested, sorted
    var efficiencyPositions = positionsWithAge.filter(function(pos){return pos.cb > 0;})
        .sort(function(a,b){return (b.pnl/b.cb)-(a.pnl/a.cb);});

    // Portfolio construction score (simple heuristic)
    var nPositions = positions.length;
    var divScore = Math.min(100, nPositions * 3.5);   // more positions = more diversified (cap 100)
    var hhiScore = Math.max(0, 100 - calcHHI(positions, totalMv) * 500); // lower HHI = better
    var qualScores = positions.filter(function(pos){return pos.quality_score!=null;}).map(function(pos){return Number(pos.quality_score);});
    var avgQual = qualScores.length ? qualScores.reduce(function(s,v){return s+v;},0)/qualScores.length : 50;
    var constructionScore = Math.round((divScore * 0.3 + hhiScore * 0.4 + avgQual * 0.3));

    // Aged positions (> 365 days) — review candidates
    var longHeld = positionsWithAge.filter(function(pos){return pos.ageDays!=null && pos.ageDays > 365;})
        .sort(function(a,b){return b.ageDays-a.ageDays;});

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },

        // Row 1: construction score + summary KPIs
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 } },
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 } },
                h(SnapLabel, { mb: 4 }, 'Construction Score'),
                h(GaugeDial, { value: constructionScore, label: 'score' }),
                h('div', { style: { fontSize: 9, color: C.muted, textAlign: 'center', fontFamily: 'DM Sans' } },
                    'Diversity + concentration + quality')
            ),
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 } },
                h(SnapLabel, { mb: 4 }, 'Unrealised P&L'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 28, fontWeight: 800,
                    color: (totalMv - totalCost) >= 0 ? C.green : C.red } },
                    ((totalMv - totalCost) >= 0 ? '+' : '') +
                    (Math.abs(totalMv - totalCost) >= 1e6
                        ? '$' + ((totalMv-totalCost)/1e6).toFixed(2) + 'M'
                        : '$' + ((totalMv-totalCost)/1e3).toFixed(1) + 'k')
                ),
                h('div', { style: { fontSize: 10, color: C.muted, fontFamily: 'DM Sans', textAlign: 'center' } }, 'across ' + positions.length + ' positions')
            ),
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 } },
                h(SnapLabel, { mb: 4 }, 'Positions With Age Data'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 28, fontWeight: 800, color: C.blue } },
                    positionsWithAge.filter(function(pos){return pos.ageDays!=null;}).length),
                h('div', { style: { fontSize: 10, color: C.muted, fontFamily: 'DM Sans', textAlign: 'center' } },
                    longHeld.length + ' held > 1 year')
            ),
            h(SnapCard, { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 } },
                h(SnapLabel, { mb: 4 }, 'Equal-Weight Deviation'),
                h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 28, fontWeight: 800, color: C.amber } },
                    driftPositions.length > 0 ? Math.abs(driftPositions[0].drift).toFixed(1) + '%' : '—'),
                h('div', { style: { fontSize: 10, color: C.muted, fontFamily: 'DM Sans', textAlign: 'center' } }, 'max drift from ' + eqTarget.toFixed(1) + '% eq. target')
            )
        ),

        // Row 2: rebalancing drift + cost efficiency
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
            h(SnapCard, null,
                h(SnapLabel, null, 'Weight Drift vs Equal-Weight Target'),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 5 } },
                    driftPositions.map(function(pos) {
                        var col = pos.drift > 0 ? C.blue : C.amber;
                        var barW = Math.min(Math.abs(pos.drift) / (Math.abs(driftPositions[0].drift)||1), 1) * 45;
                        return h('div', { key: pos.symbol, style: { display: 'flex', alignItems: 'center', gap: 6 } },
                            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: C.blue, minWidth: 48 } }, pos.symbol),
                            h('div', { style: { flex: 1, height: 14, position: 'relative', background: 'rgba(255,255,255,0.02)', borderRadius: 2 } },
                                h('div', { style: { position: 'absolute',
                                    left: pos.drift >= 0 ? '50%' : (50 - barW) + '%',
                                    width: barW + '%', height: '100%', background: col, opacity: 0.65, borderRadius: 2 } }),
                                h('div', { style: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.15)' } })
                            ),
                            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: col, minWidth: 52, textAlign: 'right' } },
                                (pos.drift >= 0 ? '+' : '') + pos.drift.toFixed(1) + '%')
                        );
                    })
                )
            ),
            h(SnapCard, null,
                h(SnapLabel, null, 'Capital Efficiency — return per $ invested'),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 0 } },
                    efficiencyPositions.slice(0, 10).map(function(pos) {
                        var eff = pos.cb > 0 ? (pos.pnl / pos.cb) * 100 : 0;
                        var col = eff >= 0 ? C.green : C.red;
                        return h('div', { key: pos.symbol,
                            style: { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' } },
                            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: C.blue, minWidth: 48 } }, pos.symbol),
                            h('div', { style: { flex: 1, height: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 2, overflow: 'hidden' } },
                                h('div', { style: { width: Math.min(Math.abs(eff), 100) + '%', height: '100%', background: col, opacity: 0.6, borderRadius: 2 } })
                            ),
                            h('span', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: col, minWidth: 52, textAlign: 'right', fontWeight: 600 } },
                                (eff >= 0 ? '+' : '') + eff.toFixed(1) + '%')
                        );
                    })
                )
            )
        ),

        // Row 3: Position aging (when data available)
        positionsWithAge.some(function(pos){return pos.ageDays!=null;}) && h(SnapCard, null,
            h(SnapLabel, null, 'Position Age & Unrealised Return — oldest to newest (from transaction history)'),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                positionsWithAge.filter(function(pos){return pos.ageDays!=null;})
                    .sort(function(a,b){return b.ageDays-a.ageDays;})
                    .map(function(pos) {
                        var ageYrs = pos.ageDays / 365;
                        var intensity = Math.min(ageYrs / 3, 1);
                        var retCol = pos.ret == null ? C.muted : pos.ret >= 0 ? C.green : C.red;
                        return h('div', { key: pos.symbol, style: {
                            background: 'rgba(0,212,255,' + (0.04 + intensity * 0.12) + ')',
                            border: '1px solid rgba(0,212,255,' + (0.1 + intensity * 0.2) + ')',
                            borderRadius: 6, padding: '8px 10px', minWidth: 90,
                        } },
                            h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color: C.blue } }, pos.symbol),
                            h('div', { style: { fontSize: 9, color: C.muted, fontFamily: 'DM Sans', marginTop: 2 } },
                                pos.ageDays >= 365
                                    ? (ageYrs).toFixed(1) + ' yrs'
                                    : pos.ageDays + 'd'),
                            pos.ret != null && h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 10, color: retCol, marginTop: 2, fontWeight: 600 } },
                                (pos.ret >= 0 ? '+' : '') + pos.ret.toFixed(1) + '%')
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
    var navChartRef = useRef(null);
    var _nr = useState('ALL'), navRange = _nr[0], setNavRange = _nr[1];
    var pnlRef = useRef(null);
    var pnlInst = useRef(null);
    var sectorRef = useRef(null);
    var heatRef = useRef(null);
    var _hm = useState('day'), heatMode = _hm[0], setHeatMode = _hm[1];
    var _qtp = useState(null), qtPos = _qtp[0], setQtPos = _qtp[1];
    var _am = useState('dollar'), attrMode = _am[0], setAttrMode = _am[1];
    var _sv = useState('overview'), subView = _sv[0], setSubView = _sv[1];

    useEffect(function() {
        function load() {
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
        }
        load();
        window.addEventListener('atlas:refresh', load);
        return function() { window.removeEventListener('atlas:refresh', load); };
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
        var top10 = positions.slice().sort(function(a, b) {
            return Math.abs(Number(b.market_value) || 0) - Math.abs(Number(a.market_value) || 0);
        }).slice(0, 10);
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

    // lightweight-charts NAV chart
    useEffect(function() {
        if (!navData || !navData.length || !navPlotRef.current) return;
        if (navChartRef.current) { navChartRef.current.remove(); navChartRef.current = null; }
        var sorted = navData.slice().sort(function(a, b) { return new Date(a.price_date) - new Date(b.price_date); });
        var cutoff = null, now = new Date();
        if (navRange === '1W') cutoff = new Date(now - 7 * 864e5);
        else if (navRange === '1M') cutoff = new Date(now - 30 * 864e5);
        else if (navRange === '3M') cutoff = new Date(now - 90 * 864e5);
        var slice = cutoff ? sorted.filter(function(d) { return new Date(d.price_date) >= cutoff; }) : sorted;
        if (!slice.length) slice = sorted;
        var baseNav = slice[0].nav;
        var lastY = (slice[slice.length - 1].nav / baseNav - 1) * 100;
        var lineColor = lastY >= 0 ? '#10b981' : '#ef4444';
        var topFill   = lastY >= 0 ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)';
        var chart = LightweightCharts.createChart(navPlotRef.current, {
            width:  navPlotRef.current.clientWidth || 600,
            height: 260,
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: 'rgba(255,255,255,0.3)',
                fontFamily: 'JetBrains Mono',
                fontSize: 10,
            },
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
            rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
            timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
            crosshair: {
                vertLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 3 },
                horzLine: { color: 'rgba(255,255,255,0.15)', width: 1, style: 3 },
            },
            handleScroll: false,
            handleScale: false,
        });
        navChartRef.current = chart;
        var areaSeries = chart.addSeries(LightweightCharts.AreaSeries, {
            lineColor: lineColor,
            topColor: topFill,
            bottomColor: 'rgba(0,0,0,0)',
            lineWidth: 2,
            lineStyle: 0,
            crosshairMarkerVisible: true,
            priceFormat: { type: 'custom', formatter: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(2) + '%'; } },
        });
        areaSeries.setData(slice.map(function(d) {
            return { time: d.price_date, value: +((d.nav / baseNav - 1) * 100).toFixed(3) };
        }));
        if (txData && txData.length) {
            var navByDate = {};
            slice.forEach(function(d) { navByDate[d.price_date] = (d.nav / baseNav - 1) * 100; });
            var sliceStart = slice[0].price_date, sliceEnd = slice[slice.length - 1].price_date;
            var posMap = {};
            if (positions) positions.forEach(function(p) { posMap[p.symbol] = p; });
            var markers = [];
            txData.forEach(function(t) {
                var d = t.transaction_date || t.date || t.trade_date;
                if (!d || d < sliceStart || d > sliceEnd) return;
                if ((t.side || t.transaction_type || '').toUpperCase().indexOf('BUY') < 0) return;
                var sym = t.symbol || t.ticker;
                var pos = posMap[sym];
                var ret = pos && pos.unrealised_return_pct != null ? Number(pos.unrealised_return_pct) : null;
                var good = ret === null || ret >= 0;
                markers.push({
                    time: d,
                    position: 'belowBar',
                    color: good ? '#10b981' : '#ef4444',
                    shape: good ? 'arrowUp' : 'arrowDown',
                    text: sym + (ret != null ? (ret >= 0 ? ' +' : ' ') + (ret * 100).toFixed(1) + '%' : ''),
                    size: 1,
                });
            });
            if (markers.length) {
                markers.sort(function(a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
                LightweightCharts.createSeriesMarkers(areaSeries, markers);
            }
        }
        chart.timeScale().fitContent();
        return function() { if (navChartRef.current) { navChartRef.current.remove(); navChartRef.current = null; } };
    }, [navData, navRange, txData, positions]);

    // P&L contributors chart
    useEffect(function() {
        if (!positions || !positions.length || !pnlRef.current) return;
        if (pnlInst.current) pnlInst.current.destroy();
        var totalPortMv2 = positions.reduce(function(s, p) { return s + Math.abs(Number(p.market_value) || 0); }, 0);
        var withPnl = positions.map(function(p) {
            var pnl = p.total_gain_loss_dollar != null ? Number(p.total_gain_loss_dollar) :
                (Number(p.current_price || 0) - Number(p.cost_basis || 0)) * Number(p.quantity || 0);
            var pct = attrMode === 'pct' && totalPortMv2 > 0 ? (pnl / totalPortMv2) * 100 : pnl;
            return { symbol: p.symbol, pnl: pnl, val: pct };
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
        var isPct = attrMode === 'pct';
        pnlInst.current = new Chart(pnlRef.current, {
            type: 'bar',
            data: {
                labels: chartItems.map(function(p) { return p.symbol; }),
                datasets: [{
                    data: chartItems.map(function(p) { return p.val; }),
                    backgroundColor: chartItems.map(function(p) { return p.pnl >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(239,68,68,0.7)'; }),
                    borderWidth: 0,
                    borderRadius: 3
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: 'JetBrains Mono' },
                        callback: function(v) { return isPct ? v.toFixed(1) + '%' : '$' + (v / 1000).toFixed(1) + 'k'; } },
                        grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: 'rgba(255,255,255,0.7)', font: { size: 11, family: 'JetBrains Mono' } }, grid: { display: false } }
                },
                plugins: { legend: { display: false } }
            }
        });
        return function() { if (pnlInst.current) pnlInst.current.destroy(); };
    }, [positions, attrMode]);

    // Sector P&L waterfall (Plotly)
    useEffect(function() {
        if (!positions || !positions.length || !sectorRef.current) return;
        var totalPortMv = positions.reduce(function(s, p) { return s + Math.abs(Number(p.market_value) || 0); }, 0);
        var bySector = {};
        positions.forEach(function(p) {
            var sec = getSector(p.symbol, p);
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
        var isPct = attrMode === 'pct';
        var scale = isPct && totalPortMv > 0 ? 100 / totalPortMv : 1;
        var values = sectorPnl.concat([total]).map(function(v) { return v * scale; });
        var textValues = values.map(function(v) {
            return isPct
                ? (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
                : (v >= 0 ? '+' : '') + '$' + (v / 1000).toFixed(1) + 'k';
        });
        Plotly.react(sectorRef.current, [{
            type: 'waterfall',
            orientation: 'v',
            measure: measures,
            x: labels,
            y: values,
            text: textValues,
            textposition: 'inside',
            textfont: { color: 'rgba(255,255,255,0.85)', size: 10, family: 'JetBrains Mono' },
            connector: { line: { color: 'rgba(255,255,255,0.1)', width: 1 } },
            increasing: { marker: { color: 'rgba(16,185,129,0.75)' } },
            decreasing: { marker: { color: 'rgba(239,68,68,0.75)' } },
            totals: { marker: { color: 'rgba(0,212,255,0.75)' } },
            hovertemplate: isPct ? '<b>%{x}</b><br>Attribution: %{y:.2f}%<extra></extra>' : '<b>%{x}</b><br>P&L: %{y:$,.0f}<extra></extra>',
        }], {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            margin: { l: 52, r: 12, t: 12, b: 64 },
            xaxis: { tickfont: { color: 'rgba(255,255,255,0.5)', size: 10, family: 'DM Sans' }, tickangle: -30, showgrid: false },
            yaxis: { gridcolor: 'rgba(255,255,255,0.05)', zeroline: true, zerolinecolor: 'rgba(255,255,255,0.15)',
                tickfont: { color: 'rgba(255,255,255,0.3)', size: 10, family: 'JetBrains Mono' },
                tickprefix: isPct ? '' : '$', ticksuffix: isPct ? '%' : '', tickformat: isPct ? '.1f' : ',.0f' },
            showlegend: false,
        }, { responsive: true, displayModeBar: false });
    }, [positions, attrMode]);


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
                (p.sector || '').toLowerCase().indexOf(q) >= 0 ||
                getRegion(p.symbol).toLowerCase().indexOf(q) >= 0;
            var matchT = matchFilter(p, tFilt, positions);
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

    // Derive Account Equity, Portfolio NAV, and Cash/Margin from loaded data.
    // Priority for displayed equity:
    //   1. c.portfolio_nav from vw_command_centre — sourced from account_snapshots.equity
    //      (written by sync_alpaca_positions, so as current as the last position sync).
    //   2. Latest value from vw_portfolio_nav_daily — nightly equity history fallback.
    var _navSorted = navData ? navData.slice().sort(function(a,b){ return new Date(a.price_date) - new Date(b.price_date); }) : [];
    var navHistoryEquity = _navSorted.length ? _navSorted[_navSorted.length - 1].nav : null;
    var accountEquity = (c.portfolio_nav != null && c.portfolio_nav > 0) ? c.portfolio_nav : navHistoryEquity;
    var portfolioLongMV = positions.reduce(function(s, p) { return s + (Number(p.market_value) || 0); }, 0);
    var cashBalance = c.cash_balance != null ? Number(c.cash_balance)
        : (accountEquity != null ? accountEquity - portfolioLongMV : null);
    var leverageRatio = accountEquity && accountEquity > 0 ? portfolioLongMV / accountEquity : null;
    var cashColor = cashBalance == null ? 'rgba(255,255,255,0.5)' : cashBalance >= 0 ? '#10b981' : '#ef4444';
    var cashSub = cashBalance == null ? 'Unavailable'
        : cashBalance >= 0 ? 'Cash on hand'
        : 'Margin \u00b7 ' + (leverageRatio != null ? leverageRatio.toFixed(2) + '\u00d7 leverage' : 'leveraged');

    return React.createElement('div', null,
        // Hero Pulse Bar
        React.createElement('div', { style: { background: 'linear-gradient(135deg,rgba(0,212,255,0.04),rgba(99,102,241,0.04))', border: '1px solid rgba(0,212,255,0.12)', borderRadius: 10, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 0' } },
            React.createElement('div', { style: hb },
                React.createElement('div', { style: hl }, 'Account Equity'),
                React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 22, fontWeight: 700, color: '#00d4ff' } }, accountEquity != null ? fmtCurrency(accountEquity) : '\u2014'),
                React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, fontFamily: 'JetBrains Mono' } }, 'Cash + longs \u2212 margin')
            ),
            React.createElement('div', { style: div }),
            React.createElement('div', { style: hb },
                React.createElement('div', { style: hl }, 'Long Exposure'),
                React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.88)' } }, fmtCurrency(portfolioLongMV || c.long_market_value)),
                React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 3, fontFamily: 'JetBrains Mono' } }, (c.position_count || positions.length) + ' long positions')
            ),
            React.createElement('div', { style: div }),
            React.createElement('div', { style: hb },
                React.createElement('div', { style: hl }, 'Cash / Margin'),
                React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: cashColor } }, cashBalance != null ? fmtCurrency(cashBalance) : '\u2014'),
                React.createElement('div', { style: { fontSize: 10, color: cashColor, marginTop: 3, fontFamily: 'JetBrains Mono', opacity: 0.8 } }, cashSub)
            ),
            React.createElement('div', { style: div }),
            React.createElement('div', { style: hb },
                React.createElement('div', { style: hl }, 'Unrealised P&L'),
                React.createElement('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, color: Number(c.unrealised_pnl) >= 0 ? '#10b981' : '#ef4444' } }, fmtCurrency(c.unrealised_pnl)),
                React.createElement('div', { style: { fontSize: 10, color: retColor, marginTop: 3, fontFamily: 'JetBrains Mono' } }, (retPct >= 0 ? '+' : '') + (retPct * 100).toFixed(2) + '% total return')
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
        // Sub-view tab bar
        React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 0 } },
            [
                { id: 'overview',    label: 'Overview',    icon: '◎' },
                { id: 'performance', label: 'Performance', icon: '▲' },
                { id: 'risk',        label: 'Risk',        icon: '△' },
                { id: 'portfolio',   label: 'Portfolio Mgmt', icon: '◈' },
            ].map(function(tab) {
                var a = subView === tab.id;
                return React.createElement('button', { key: tab.id, onClick: function() { setSubView(tab.id); },
                    style: { padding: '8px 18px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        background: 'transparent', border: 'none', letterSpacing: 0.8,
                        borderBottom: '2px solid ' + (a ? '#00d4ff' : 'transparent'),
                        color: a ? '#00d4ff' : 'rgba(255,255,255,0.35)',
                        transition: 'color 0.15s', marginBottom: -1, fontFamily: 'DM Sans',
                        textTransform: 'uppercase' } },
                    tab.icon + ' ' + tab.label);
            })
        ),
        subView === 'overview' && React.createElement(React.Fragment, null,

        // === Portfolio Intelligence — Hero Cards ===
        (function() {
            var totalMv = positions.reduce(function(s, p) { return s + Math.abs(Number(p.market_value)||0); }, 0);
            var withRet = positions.filter(function(p) { return p.unrealised_return_pct != null && isFinite(Number(p.unrealised_return_pct)); });
            var winners = withRet.filter(function(p) { return Number(p.unrealised_return_pct) > 0; });
            var losers  = withRet.filter(function(p) { return Number(p.unrealised_return_pct) < 0; });
            var today   = positions.filter(function(p) { return p.daily_change_pct != null && isFinite(Number(p.daily_change_pct)); });
            var todayUp = today.filter(function(p) { return Number(p.daily_change_pct) > 0; }).length;
            var todayDn = today.filter(function(p) { return Number(p.daily_change_pct) < 0; }).length;
            var sortedByMv = positions.slice().sort(function(a,b){ return Math.abs(Number(b.market_value)||0)-Math.abs(Number(a.market_value)||0); });
            var top1 = sortedByMv[0];
            var maxWt = top1 && totalMv > 0 ? (Math.abs(Number(top1.market_value)||0) / totalMv) * 100 : 0;
            var sortedByRet = withRet.slice().sort(function(a,b){ return Number(b.unrealised_return_pct)-Number(a.unrealised_return_pct); });
            var bestPos = sortedByRet[0];
            var worstPos = sortedByRet[sortedByRet.length-1];
            var inDeepDD = positions.filter(function(p){ return p.unrealised_return_pct != null && Number(p.unrealised_return_pct) < -0.10; }).length;
            var winRatePct = withRet.length > 0 ? Math.round(winners.length / withRet.length * 100) : 0;
            var winAccent = winRatePct >= 60 ? 'green' : winRatePct >= 45 ? 'amber' : 'red';
            var todayAccent = todayUp > todayDn ? 'green' : todayDn > todayUp ? 'red' : 'amber';
            var concAccent = maxWt > 25 ? 'red' : maxWt > 15 ? 'amber' : 'green';
            var riskAccent = inDeepDD > 3 ? 'red' : inDeepDD > 0 ? 'amber' : 'green';
            return React.createElement('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 16 } },
                React.createElement(HeroCard, { icon: '◉', label: 'POSITIONS', accent: 'cyan',
                    value: String(positions.length),
                    sub: winners.length + ' winners · ' + losers.length + ' losers' }),
                React.createElement(HeroCard, { icon: '▲', label: 'TODAY  UP / DOWN', accent: todayAccent,
                    value: todayUp + ' / ' + todayDn,
                    color: todayUp > todayDn ? 'var(--green)' : todayDn > todayUp ? 'var(--red)' : 'var(--amber)' }),
                React.createElement(HeroCard, { icon: '✦', label: 'WIN RATE', accent: winAccent,
                    value: winRatePct + '%',
                    color: winRatePct >= 60 ? 'var(--green)' : winRatePct >= 45 ? 'var(--amber)' : 'var(--red)',
                    sub: winners.length + ' of ' + withRet.length + ' profitable' }),
                React.createElement(HeroCard, { icon: '◆', label: 'TOP CONCENTRATION', accent: concAccent,
                    value: top1 ? top1.symbol : '—',
                    color: concAccent === 'red' ? 'var(--red)' : concAccent === 'amber' ? 'var(--amber)' : 'var(--green)',
                    sub: maxWt.toFixed(1) + '% of portfolio' }),
                React.createElement(HeroCard, { icon: '▽', label: 'AT RISK  (>10% DD)', accent: riskAccent,
                    value: String(inDeepDD),
                    color: inDeepDD > 3 ? 'var(--red)' : inDeepDD > 0 ? 'var(--amber)' : 'var(--green)',
                    sub: inDeepDD > 0 ? 'positions down >10%' : 'No deep drawdowns' }),
                React.createElement(HeroCard, { icon: '★', label: 'BEST / WORST', accent: 'indigo',
                    value: bestPos ? bestPos.symbol : '—',
                    sub: bestPos ? (Number(bestPos.unrealised_return_pct)*100).toFixed(1) + '% · Worst: ' + (worstPos ? worstPos.symbol + ' ' + (Number(worstPos.unrealised_return_pct)*100).toFixed(1) + '%' : '—') : '—' })
            );
        })(),

        // === Portfolio Narrative Strip ===
        React.createElement(NarrativeStrip, { items: (function() {
            var items = [];
            var totalMv = positions.reduce(function(s, p) { return s + Math.abs(Number(p.market_value)||0); }, 0);
            var withRet = positions.filter(function(p) { return p.unrealised_return_pct != null && isFinite(Number(p.unrealised_return_pct)); });
            var winners = withRet.filter(function(p) { return Number(p.unrealised_return_pct) > 0; });
            var losers  = withRet.filter(function(p) { return Number(p.unrealised_return_pct) < 0; });
            var winPct  = withRet.length > 0 ? Math.round(winners.length / withRet.length * 100) : 0;
            // 1. Overall health line
            var sortedByRet = withRet.slice().sort(function(a,b){ return Number(b.unrealised_return_pct)-Number(a.unrealised_return_pct); });
            var best  = sortedByRet[0];
            var worst = sortedByRet[sortedByRet.length-1];
            items.push({ icon: '◆',
                text: '<strong>' + winners.length + '/' + withRet.length + ' positions</strong> profitable (' + winPct + '% win rate)' +
                    (best  ? ' · Best: <strong style="color:#10b981">' + best.symbol  + ' +' + (Number(best.unrealised_return_pct)*100).toFixed(1)  + '%</strong>' : '') +
                    (worst ? ' · Worst: <strong style="color:#ef4444">' + worst.symbol + ' ' + (Number(worst.unrealised_return_pct)*100).toFixed(1) + '%</strong>' : '')
            });
            // 2. Today's movers
            var withDay = positions.filter(function(p){ return p.daily_change_pct != null && isFinite(Number(p.daily_change_pct)); });
            if (withDay.length) {
                var dayUp = withDay.filter(function(p){ return Number(p.daily_change_pct) > 0; });
                var dayDn = withDay.filter(function(p){ return Number(p.daily_change_pct) < 0; });
                var sortedDay = withDay.slice().sort(function(a,b){ return Number(b.daily_change_pct)-Number(a.daily_change_pct); });
                var topMover = sortedDay[0];
                var botMover = sortedDay[sortedDay.length-1];
                items.push({ icon: '▲',
                    text: 'Today: <strong style="color:#10b981">' + dayUp.length + ' up</strong> · <strong style="color:#ef4444">' + dayDn.length + ' down</strong>' +
                        (topMover ? ' · Leader: <strong style="color:#10b981">' + topMover.symbol + ' +' + (Number(topMover.daily_change_pct)*100).toFixed(2) + '%</strong>' : '') +
                        (botMover && Number(botMover.daily_change_pct) < 0 ? ' · Laggard: <strong style="color:#ef4444">' + botMover.symbol + ' ' + (Number(botMover.daily_change_pct)*100).toFixed(2) + '%</strong>' : '')
                });
            }
            // 3. Concentration
            var sorted = positions.slice().sort(function(a,b){ return Math.abs(Number(b.market_value)||0)-Math.abs(Number(a.market_value)||0); });
            var top5wt = sorted.slice(0,5).reduce(function(s,p){ return s + Math.abs(Number(p.market_value)||0); }, 0) / (totalMv||1) * 100;
            var top1 = sorted[0];
            var top1wt = totalMv > 0 && top1 ? Math.abs(Number(top1.market_value)||0) / totalMv * 100 : 0;
            items.push({ icon: '◉',
                text: 'Top 5 holdings = <strong>' + top5wt.toFixed(1) + '%</strong> of portfolio' +
                    (top1wt > 20 ? ' — <span style="color:#ef4444">⚠ ' + top1.symbol + ' at ' + top1wt.toFixed(1) + '% is a concentrated position</span>' :
                    top1wt > 12 ? ' — <span style="color:#f59e0b">' + top1.symbol + ' at ' + top1wt.toFixed(1) + '% · monitor</span>' :
                    ' — <span style="color:#10b981">well-diversified across top holdings</span>')
            });
            // 4. Deep drawdown alert
            var inDeepDD = withRet.filter(function(p){ return Number(p.unrealised_return_pct) < -0.10; });
            if (inDeepDD.length > 0) {
                items.push({ icon: '▽',
                    text: '<strong style="color:#ef4444">' + inDeepDD.length + ' position' + (inDeepDD.length > 1 ? 's' : '') + ' in deep drawdown (>10%):</strong> ' +
                        inDeepDD.slice(0,5).map(function(p){ return '<span style="color:#fca5a5">' + p.symbol + ' ' + (Number(p.unrealised_return_pct)*100).toFixed(1) + '%</span>'; }).join(' · ')
                });
            }
            return items;
        })() }),

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
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } },
                    React.createElement('div', { className: 'card-title', style: { margin: 0 } }, 'P&L CONTRIBUTORS'),
                    React.createElement('div', { style: { display: 'flex', gap: 3 } },
                        [['dollar', '$'], ['pct', '%']].map(function(pair) {
                            var a = attrMode === pair[0];
                            return React.createElement('button', { key: pair[0], onClick: function() { setAttrMode(pair[0]); },
                                style: { padding: '2px 8px', borderRadius: 3, fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 700,
                                    cursor: 'pointer', background: a ? 'rgba(0,212,255,0.12)' : 'transparent',
                                    border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                                    color: a ? '#00d4ff' : 'rgba(255,255,255,0.3)' } }, pair[1]);
                        })
                    )
                ),
                React.createElement('div', { style: { height: 320 } }, React.createElement('canvas', { ref: pnlRef }))
            ),
            React.createElement('div', { className: 'card' },
                React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 } },
                    React.createElement('div', { className: 'card-title', style: { margin: 0 } }, 'SECTOR P&L ATTRIBUTION'),
                    React.createElement('div', { style: { display: 'flex', gap: 3 } },
                        [['dollar', '$'], ['pct', '%']].map(function(pair) {
                            var a = attrMode === pair[0];
                            return React.createElement('button', { key: pair[0], onClick: function() { setAttrMode(pair[0]); },
                                style: { padding: '2px 8px', borderRadius: 3, fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 700,
                                    cursor: 'pointer', background: a ? 'rgba(0,212,255,0.12)' : 'transparent',
                                    border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                                    color: a ? '#00d4ff' : 'rgba(255,255,255,0.3)' } }, pair[1]);
                        })
                    )
                ),
                React.createElement('div', { ref: sectorRef, style: { height: 320 } })
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
                    var sec = getSector(p.symbol, p);
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
                        var count = positions.filter(function(p) { return getSector(p.symbol, p) === sec; }).length;
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
            // Title + search row
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 } },
                React.createElement('div', { className: 'card-title', style: { fontSize: 14, fontFamily: 'Syne', fontWeight: 700, letterSpacing: 1, margin: 0, flex: 'none' } },
                    'HOLDINGS ' + (filtPosns.length !== positions.length ? '(' + filtPosns.length + '/' + positions.length + ')' : '(' + positions.length + ')')),
                React.createElement('input', { value: srch, onChange: function(e) { setSrch(e.target.value); },
                    placeholder: '🔍  symbol, name, sector…',
                    style: { flex: 1, minWidth: 160, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, padding: '5px 10px', color: 'rgba(255,255,255,0.8)', fontSize: 11, fontFamily: 'DM Sans', outline: 'none' } }),
                // ALL reset pill
                React.createElement('button', {
                    onClick: function() { setTFilt('ALL'); },
                    style: {
                        background: tFilt === 'ALL' ? 'rgba(255,255,255,0.10)' : 'transparent',
                        color: tFilt === 'ALL' ? '#fff' : 'rgba(255,255,255,0.28)',
                        border: '1px solid ' + (tFilt === 'ALL' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'),
                        borderRadius: 4, padding: '3px 10px', fontSize: 10, fontFamily: 'JetBrains Mono',
                        fontWeight: tFilt === 'ALL' ? 700 : 400, cursor: 'pointer', letterSpacing: 0.8, flexShrink: 0,
                    }
                }, 'ALL')
            ),
            // Multi-group filter strip
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 0, marginBottom: 12, flexWrap: 'wrap', rowGap: 6 } },
                FILTER_GROUPS.map(function(group, gi) {
                    return React.createElement('div', { key: group.label, style: { display: 'flex', alignItems: 'center', gap: 3, paddingRight: 10, marginRight: 6, borderRight: gi < FILTER_GROUPS.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' } },
                        React.createElement('span', { style: { fontSize: 8, letterSpacing: 1.6, color: 'rgba(255,255,255,0.2)', fontFamily: 'DM Sans', textTransform: 'uppercase', marginRight: 4, flexShrink: 0 } }, group.label),
                        group.filters.map(function(f) {
                            var active = tFilt === f.id;
                            // Count matching positions for badge
                            var count = positions.filter(function(p) { return matchFilter(p, f.id, positions); }).length;
                            return React.createElement('button', {
                                key: f.id,
                                onClick: function() { setTFilt(active ? 'ALL' : f.id); },
                                title: count + ' positions',
                                style: {
                                    background: active ? 'rgba(' + (group.color === '#00d4ff' ? '0,212,255' : group.color === '#8b5cf6' ? '139,92,246' : group.color === '#10b981' ? '16,185,129' : '245,158,11') + ',0.14)' : 'transparent',
                                    color: active ? group.color : 'rgba(255,255,255,0.3)',
                                    border: '1px solid ' + (active ? group.color.replace(')', ',0.35)').replace('rgb', 'rgba') : 'rgba(255,255,255,0.06)'),
                                    borderRadius: 4, padding: '3px 8px', fontSize: 10, fontFamily: 'JetBrains Mono',
                                    fontWeight: active ? 700 : 400, cursor: 'pointer', letterSpacing: 0.4,
                                    display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                                }
                            },
                                f.label,
                                React.createElement('span', { style: { fontSize: 8, opacity: active ? 0.8 : 0.4, fontWeight: 400 } }, count)
                            );
                        })
                    );
                })
            ),
            React.createElement('div', { style: { overflowY: 'auto', maxHeight: 420, overflowX: 'auto', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' } },
                React.createElement('table', { style: { borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 800 } },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            [
                                { key: 'symbol', label: 'Ticker', col: null, align: 'left' },
                                { key: 'name', label: 'Name / Type', col: null, align: 'left' },
                                { key: 'sector', label: 'Sector', col: null, align: 'left' },
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
                                    style: { position: 'sticky', top: 0, zIndex: 2, background: '#0b0f1a',
                                        padding: '9px 10px', fontSize: 10, whiteSpace: 'nowrap',
                                        color: isSorted ? '#00d4ff' : 'rgba(255,255,255,0.38)',
                                        boxShadow: '0 1px 0 rgba(255,255,255,0.07)',
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
                            // Stale price: >4 days old (covers Fri→Tue with Mon holiday).
                            // Matches the 96h dead threshold in data_freshness() — consistent semantics.
                            var priceDate = p.price_date ? new Date(p.price_date) : null;
                            var isStale = priceDate ? (Date.now() - priceDate) / 86_400_000 > 4 : false;
                            var staleTooltip = isStale
                                ? 'Price data from ' + (p.price_date || 'unknown') + ' — Alpaca’s IEX feed doesn’t cover this ticker'
                                : null;
                            return React.createElement('tr', { key: p.symbol,
                                style: {
                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                    transition: 'background 0.12s', cursor: 'pointer',
                                    opacity: isStale ? 0.6 : 1,
                                },
                                onClick: (function(pos) { return function() { setQtPos(pos); }; })(p),
                                onMouseEnter: function(e) { e.currentTarget.style.background = 'rgba(0,212,255,0.05)'; },
                                onMouseLeave: function(e) { e.currentTarget.style.background = 'transparent'; },
                                title: staleTooltip || ('Click to trade ' + p.symbol),
                            },
                                React.createElement('td', { style: { padding: '7px 10px', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#00d4ff', whiteSpace: 'nowrap' } },
                                    React.createElement('span', null, p.symbol),
                                    isStale
                                        ? React.createElement('span', {
                                            title: staleTooltip,
                                            style: { marginLeft: 5, fontSize: 10, color: '#f59e0b', cursor: 'help', verticalAlign: 'middle' }
                                          }, '⚠')
                                        : null
                                ),
                                React.createElement('td', { style: { padding: '7px 10px', maxWidth: 220 } },
                                    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 } },
                                        React.createElement('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'DM Sans' } }, getName(p.symbol, p)),
                                        React.createElement(TypeBadge, { type: type })
                                    )
                                ),
                                React.createElement('td', { style: { padding: '7px 10px', maxWidth: 140, fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: 'DM Sans', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                                    getSector(p.symbol, p)),
                                React.createElement('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'rgba(255,255,255,0.78)' } },
                                    p.current_price ? '$' + Number(p.current_price).toFixed(2) : '—'),
                                React.createElement('td', { style: { padding: '7px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600,
                                    color: isStale || dayChg == null ? 'rgba(255,255,255,0.25)' : dayChg > 0 ? '#10b981' : dayChg < 0 ? '#ef4444' : 'rgba(255,255,255,0.4)' } },
                                    isStale ? '—' : dayChg == null ? '—' : (dayChg > 0 ? '▲ ' : dayChg < 0 ? '▼ ' : '') + (Math.abs(dayChg) * 100).toFixed(2) + '%'),
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
        ), // end overview Fragment
        subView === 'performance' && React.createElement(PerformanceSnapshot, { positions: positions, navData: navData }),
        subView === 'risk'        && React.createElement(RiskSnapshot,        { positions: positions, navData: navData }),
        subView === 'portfolio'   && React.createElement(PortfolioMgmtSnapshot, { positions: positions, txData: txData }),
        // Quick Trade Panel (slides in from right on row click)
        qtPos && React.createElement(QuickTradePanel, {
            pos: qtPos,
            onClose: function() { setQtPos(null); }
        })
    );
}
