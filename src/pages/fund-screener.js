import React from 'react';
import { sb } from './config.js';

// ============================================================
// ATLAS Terminal — Fund Research Screener
// Landing page for the Fund Research module.
// Two tabs: ETFs | SA Funds (segmented control).
// Tab + filters persisted in URL (#fund-screener?tab=etf&...).
// Row click → onSelect({ type, symbol/fund_id }) to open dossier.
// ============================================================

var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo;
var h = React.createElement;

// ── Design tokens ─────────────────────────────────────────────────────────────
var T = {
    bg:      '#07091a',
    card:    'rgba(255,255,255,0.03)',
    border:  'rgba(255,255,255,0.07)',
    border2: 'rgba(255,255,255,0.12)',
    text:    'rgba(255,255,255,0.92)',
    muted:   'rgba(255,255,255,0.42)',
    muted2:  'rgba(255,255,255,0.25)',
    cyan:    '#22d3ee',
    cyanDim: 'rgba(34,211,238,0.08)',
    amber:   '#f5b53d',
    green:   '#41d18a',
    red:     '#f76d6d',
    violet:  '#a78bfa',
    mono:    'JetBrains Mono, monospace',
    sans:    'Inter, DM Sans, sans-serif',
};

function fin(v) { return v != null && isFinite(Number(v)); }
function fmtB(v) {
    if (!fin(v)) return '—';
    var n = Number(v);
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9)  return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6)  return '$' + (n / 1e6).toFixed(0) + 'M';
    return '$' + n.toFixed(0);
}
function fmtPct(v) {
    if (!fin(v)) return '—';
    return (Number(v) >= 0 ? '+' : '') + Number(v).toFixed(2) + '%';
}

function SortableHeader(p) {
    var active = p.sort.col === p.col;
    return h('th', {
        onClick: function() { p.onSort(p.col); },
        style: {
            padding: '9px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1.4,
            color: active ? T.cyan : T.muted2, textTransform: 'uppercase',
            cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
            textAlign: p.right ? 'right' : 'left',
            borderBottom: '1px solid ' + T.border2,
            fontFamily: T.mono, background: 'rgba(0,0,0,0.3)',
            position: 'sticky', top: 0, zIndex: 2,
        }
    }, p.label + (active ? (p.sort.asc ? ' ↑' : ' ↓') : ''));
}

function Chip(p) {
    return h('button', {
        onClick: p.onClick,
        style: {
            background: p.active ? (p.color ? p.color + '22' : T.cyanDim) : 'rgba(255,255,255,0.04)',
            color: p.active ? (p.color || T.cyan) : T.muted,
            border: '1px solid ' + (p.active ? (p.color || T.cyan) : T.border),
            borderRadius: 4, padding: '4px 10px',
            fontSize: 11, fontWeight: p.active ? 700 : 500, fontFamily: T.mono,
            cursor: 'pointer', letterSpacing: 0.5, transition: 'all 0.12s',
        }
    }, p.label);
}

function EmptyState(p) {
    return h('div', {
        style: {
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '60px 20px', gap: 12,
        }
    },
        h('div', { style: { fontSize: 32, marginBottom: 4 } }, p.icon || '📂'),
        h('div', { style: { color: T.text, fontSize: 15, fontWeight: 600 } }, p.title),
        h('div', { style: { color: T.muted, fontSize: 12, textAlign: 'center', maxWidth: 380, lineHeight: 1.6 } }, p.body),
        p.count != null && h('div', {
            style: {
                marginTop: 16, padding: '8px 18px',
                background: 'rgba(245,181,61,0.08)', border: '1px solid rgba(245,181,61,0.3)',
                borderRadius: 6, color: T.amber, fontSize: 11, fontFamily: T.mono,
            }
        }, 'Universe seeding in progress — ' + p.count + ' funds loaded')
    );
}

// ── SA Funds tab ──────────────────────────────────────────────────────────────
function SAFundsTab(p) {
    var [funds, setFunds]   = useState([]);
    var [loading, setLoad]  = useState(true);
    var [search, setSearch] = useState('');
    var [manager, setManager] = useState('All');
    var [reg28, setReg28]   = useState(false);
    var [sort, setSort]     = useState({ col: 'aum', asc: false });

    useEffect(function() {
        if (!sb) { setLoad(false); return; }
        sb.from('funds')
            .select('id,name,isin,manager,asisa_category,reg28_compliant,aum,currency,inception_date,is_listed')
            .eq('is_listed', false)
            .limit(300)
            .then(function(res) {
                setLoad(false);
                if (res.data) setFunds(res.data);
            })
            .catch(function() { setLoad(false); });
    }, []);

    var managers = useMemo(function() {
        var seen = {};
        funds.forEach(function(f) { if (f.manager) seen[f.manager] = true; });
        return Object.keys(seen).sort();
    }, [funds]);

    var visible = useMemo(function() {
        return funds
            .filter(function(f) {
                if (manager !== 'All' && f.manager !== manager) return false;
                if (reg28 && !f.reg28_compliant) return false;
                if (search) {
                    var q = search.toLowerCase();
                    if (!(f.name || '').toLowerCase().includes(q) && !(f.manager || '').toLowerCase().includes(q)) return false;
                }
                return true;
            })
            .sort(function(a, b) {
                var va = a[sort.col], vb = b[sort.col];
                if (va == null && vb == null) return 0;
                if (va == null) return 1;
                if (vb == null) return -1;
                if (typeof va === 'string') return sort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
                return sort.asc ? va - vb : vb - va;
            });
    }, [funds, manager, reg28, search, sort]);

    function onSort(col) {
        setSort(function(s) { return s.col === col ? { col: col, asc: !s.asc } : { col: col, asc: false }; });
    }

    if (loading) return h('div', { style: { padding: 60, textAlign: 'center', color: T.muted, fontFamily: T.mono } }, 'Loading SA funds…');

    if (funds.length === 0) return h(EmptyState, {
        icon: '🇿🇦',
        title: 'SA Fund universe not yet seeded',
        body: 'The FundsData ingestion pipeline will populate this universe automatically once the first daily snapshot runs. In the meantime, use the ticker bar in the Fund Analysis module to research any fund directly.',
        count: 0,
    });

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        // Filters
        h('div', { style: { padding: '12px 20px', flexShrink: 0, borderBottom: '1px solid ' + T.border } },
            h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
                h('input', {
                    value: search, onChange: function(e) { setSearch(e.target.value); },
                    placeholder: 'Filter by fund or manager…',
                    style: { background: 'rgba(255,255,255,0.04)', border: '1px solid ' + T.border, borderRadius: 4, padding: '5px 10px', color: T.text, fontSize: 11, fontFamily: T.sans, width: 220, outline: 'none' }
                }),
                h('div', { style: { width: 1, height: 20, background: T.border } }),
                h(Chip, { label: 'Reg 28', active: reg28, color: T.green, onClick: function() { setReg28(function(v) { return !v; }); } }),
                h('div', { style: { width: 1, height: 20, background: T.border } }),
                h('select', {
                    value: manager,
                    onChange: function(e) { setManager(e.target.value); },
                    style: { background: 'rgba(255,255,255,0.06)', border: '1px solid ' + T.border2, borderRadius: 4, padding: '5px 10px', color: T.text, fontSize: 11, fontFamily: T.mono, outline: 'none', cursor: 'pointer' }
                },
                    h('option', { value: 'All' }, 'All Managers'),
                    managers.map(function(m) { return h('option', { key: m, value: m }, m); })
                ),
                h('div', { style: { flex: 1 } }),
                funds.length > 0 && h('div', {
                    style: { padding: '4px 10px', background: 'rgba(245,181,61,0.08)', border: '1px solid rgba(245,181,61,0.25)', borderRadius: 4, color: T.amber, fontSize: 10, fontFamily: T.mono }
                }, 'Seeding · ' + funds.length + ' funds loaded'),
                h('span', { style: { fontSize: 10, color: T.muted, fontFamily: T.mono } }, visible.length + ' / ' + funds.length + ' shown')
            )
        ),
        // Table
        h('div', { style: { flex: 1, overflow: 'auto', minHeight: 0 } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
                h('thead', null, h('tr', null,
                    [
                        { label: 'Fund', col: 'name', right: false },
                        { label: 'Manager', col: 'manager', right: false },
                        { label: 'ASISA Category', col: 'asisa_category', right: false },
                        { label: 'AUM', col: 'aum', right: true },
                        { label: 'Reg 28', col: 'reg28_compliant', right: true },
                        { label: 'Inception', col: 'inception_date', right: true },
                    ].map(function(col) {
                        return h(SortableHeader, { key: col.col, label: col.label, col: col.col, sort: sort, onSort: onSort, right: col.right });
                    }),
                    h('th', { key: '_action', style: { borderBottom: '1px solid ' + T.border2, background: 'rgba(0,0,0,0.3)', position: 'sticky', top: 0, zIndex: 2 } })
                )),
                h('tbody', null, visible.map(function(f) {
                    return h(SAFundRow, { key: f.id, fund: f, onSelect: p.onSelect });
                }))
            )
        )
    );
}

function SAFundRow(p) {
    var f = p.fund;
    var [hov, setHov] = useState(false);
    return h('tr', {
        onClick: function() { p.onSelect({ type: 'fund', id: f.id, symbol: f.isin || f.name }); },
        onMouseEnter: function() { setHov(true); },
        onMouseLeave: function() { setHov(false); },
        style: { background: hov ? T.cyanDim : 'transparent', borderBottom: '1px solid ' + T.border, cursor: 'pointer', transition: 'background 0.1s' }
    },
        h('td', { style: { padding: '9px 12px', color: hov ? T.cyan : T.text, fontWeight: 600, maxWidth: 280 } }, f.name || '—'),
        h('td', { style: { padding: '9px 10px', color: T.muted, fontSize: 11 } }, f.manager || '—'),
        h('td', { style: { padding: '9px 10px' } },
            f.asisa_category
                ? h('span', { style: { background: 'rgba(167,139,250,0.1)', color: T.violet, border: '1px solid rgba(167,139,250,0.25)', borderRadius: 3, padding: '2px 7px', fontSize: 9.5, fontFamily: T.mono } }, f.asisa_category)
                : h('span', { style: { color: T.muted2 } }, '—')
        ),
        h('td', { style: { padding: '9px 10px', textAlign: 'right', fontFamily: T.mono, color: T.text } }, fmtB(f.aum)),
        h('td', { style: { padding: '9px 10px', textAlign: 'right', fontFamily: T.mono } },
            f.reg28_compliant
                ? h('span', { style: { color: T.green, fontWeight: 700 } }, '✓')
                : h('span', { style: { color: T.muted2 } }, '—')
        ),
        h('td', { style: { padding: '9px 10px', textAlign: 'right', color: T.muted, fontFamily: T.mono, fontSize: 11 } }, f.inception_date ? f.inception_date.slice(0, 10) : '—'),
        h('td', { style: { padding: '9px 12px', textAlign: 'right' } },
            h('span', { style: { fontSize: 11, color: hov ? T.cyan : T.muted2, fontFamily: T.mono, fontWeight: 700 } }, 'VIEW →')
        )
    );
}

// ── ETF tab ───────────────────────────────────────────────────────────────────
function ETFTab(p) {
    var [etfs, setEtfs]     = useState([]);
    var [loading, setLoad]  = useState(true);
    var [search, setSearch] = useState('');
    var [sort, setSort]     = useState({ col: 'market_cap_usd', asc: false });

    useEffect(function() {
        if (!sb) { setLoad(false); return; }
        // Reads ETFs from assets table (US/global) or funds (JSE listed ETFs)
        // JSE ETFs are `is_listed=true` in funds; global ETFs in assets with asset_type='ETF'
        Promise.all([
            sb.from('assets').select('symbol,name,asset_type,exchange,currency').eq('asset_type', 'ETF').limit(200),
            sb.from('funds').select('id,name,isin,manager,asisa_category,aum,currency,inception_date,is_listed').eq('is_listed', true).limit(200),
        ]).then(function(results) {
            setLoad(false);
            var assetEtfs = (results[0].data || []).map(function(a) {
                return { id: a.symbol, symbol: a.symbol, name: a.name, source: 'assets', exchange: a.exchange, currency: a.currency };
            });
            var jseEtfs = (results[1].data || []).map(function(f) {
                return { id: f.id, symbol: f.isin || f.name, name: f.name, source: 'funds', manager: f.manager, asisa_category: f.asisa_category, aum: f.aum, currency: f.currency };
            });
            setEtfs(assetEtfs.concat(jseEtfs));
        }).catch(function() { setLoad(false); });
    }, []);

    var visible = useMemo(function() {
        return etfs.filter(function(e) {
            if (!search) return true;
            var q = search.toLowerCase();
            return (e.symbol || '').toLowerCase().includes(q) || (e.name || '').toLowerCase().includes(q);
        });
    }, [etfs, search]);

    if (loading) return h('div', { style: { padding: 60, textAlign: 'center', color: T.muted, fontFamily: T.mono } }, 'Loading ETF universe…');

    if (etfs.length === 0) return h(EmptyState, {
        icon: '📊',
        title: 'ETF universe not yet seeded',
        body: 'JSE-listed ETFs populate automatically via FundsData ingestion. US/global ETFs are available once AlphaVantage ETF profiles are cached. Enter a ticker in the Fund Analysis module to research any ETF directly.',
        count: 0,
    });

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        h('div', { style: { padding: '12px 20px', flexShrink: 0, borderBottom: '1px solid ' + T.border } },
            h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                h('input', {
                    value: search, onChange: function(e) { setSearch(e.target.value); },
                    placeholder: 'Filter ETFs…',
                    style: { background: 'rgba(255,255,255,0.04)', border: '1px solid ' + T.border, borderRadius: 4, padding: '5px 10px', color: T.text, fontSize: 11, fontFamily: T.sans, width: 220, outline: 'none' }
                }),
                h('div', { style: { flex: 1 } }),
                h('span', { style: { fontSize: 10, color: T.muted, fontFamily: T.mono } }, visible.length + ' ETFs')
            )
        ),
        h('div', { style: { flex: 1, overflow: 'auto', minHeight: 0 } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
                h('thead', null, h('tr', null,
                    ['Ticker / ISIN', 'Name', 'Exchange', 'Category', 'AUM', ''].map(function(label, i) {
                        return h('th', {
                            key: i,
                            style: {
                                padding: '9px 10px', fontSize: 9, letterSpacing: 1.4, color: T.muted2,
                                textTransform: 'uppercase', textAlign: i > 1 ? 'right' : 'left',
                                borderBottom: '1px solid ' + T.border2, fontFamily: T.mono,
                                background: 'rgba(0,0,0,0.3)', position: 'sticky', top: 0, zIndex: 2,
                            }
                        }, label);
                    })
                )),
                h('tbody', null, visible.map(function(e) {
                    return h(ETFRow, { key: e.id, etf: e, onSelect: p.onSelect });
                }))
            )
        )
    );
}

function ETFRow(p) {
    var e = p.etf;
    var [hov, setHov] = useState(false);
    return h('tr', {
        onClick: function() { p.onSelect({ type: 'etf', symbol: e.symbol, id: e.id }); },
        onMouseEnter: function() { setHov(true); },
        onMouseLeave: function() { setHov(false); },
        style: { background: hov ? T.cyanDim : 'transparent', borderBottom: '1px solid ' + T.border, cursor: 'pointer', transition: 'background 0.1s' }
    },
        h('td', { style: { padding: '9px 12px', fontFamily: T.mono, fontSize: 12, fontWeight: 700, color: hov ? T.cyan : T.text } }, e.symbol || '—'),
        h('td', { style: { padding: '9px 10px', color: T.muted, maxWidth: 280 } }, e.name || '—'),
        h('td', { style: { padding: '9px 10px', textAlign: 'right', color: T.muted, fontFamily: T.mono, fontSize: 11 } }, e.exchange || '—'),
        h('td', { style: { padding: '9px 10px', textAlign: 'right' } },
            e.asisa_category
                ? h('span', { style: { background: 'rgba(167,139,250,0.1)', color: T.violet, border: '1px solid rgba(167,139,250,0.25)', borderRadius: 3, padding: '2px 7px', fontSize: 9.5, fontFamily: T.mono } }, e.asisa_category)
                : h('span', { style: { color: T.muted2 } }, '—')
        ),
        h('td', { style: { padding: '9px 10px', textAlign: 'right', fontFamily: T.mono, color: T.text } }, fmtB(e.aum)),
        h('td', { style: { padding: '9px 12px', textAlign: 'right' } },
            h('span', { style: { fontSize: 11, color: hov ? T.cyan : T.muted2, fontFamily: T.mono, fontWeight: 700 } }, 'VIEW →')
        )
    );
}

// ── Root: FundScreener ────────────────────────────────────────────────────────
export function FundScreener(p) {
    // p.onSelect({ type, symbol, id })
    // p.initialTab — 'etf' | 'sa'
    var [tab, setTab] = useState(p.initialTab || 'sa');

    function SegBtn(sp) {
        var active = tab === sp.id;
        return h('button', {
            onClick: function() { setTab(sp.id); },
            style: {
                background: active ? T.cyanDim : 'transparent',
                color: active ? T.cyan : T.muted,
                border: 'none', borderBottom: '2px solid ' + (active ? T.cyan : 'transparent'),
                padding: '10px 22px', cursor: 'pointer',
                fontSize: 12, fontWeight: active ? 700 : 500, fontFamily: T.mono,
                letterSpacing: 0.8, transition: 'all 0.12s',
            }
        }, sp.label);
    }

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        // Header
        h('div', { style: { padding: '14px 20px 0', flexShrink: 0 } },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, letterSpacing: 2, color: T.muted2, textTransform: 'uppercase', marginBottom: 14 } }, '◈ Fund Research'),
            // Segmented control
            h('div', { style: { display: 'flex', borderBottom: '1px solid ' + T.border, marginBottom: 0 } },
                h(SegBtn, { id: 'sa', label: 'SA Funds' }),
                h(SegBtn, { id: 'etf', label: 'ETFs' })
            )
        ),
        // Tab content
        h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } },
            tab === 'sa'  ? h(SAFundsTab, { onSelect: p.onSelect }) : null,
            tab === 'etf' ? h(ETFTab,     { onSelect: p.onSelect }) : null
        )
    );
}
