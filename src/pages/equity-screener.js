import React from 'react';
import { sb } from './config.js';

// ============================================================
// ATLAS Terminal — Equity Research Screener
// Landing page for the Equity Research module.
// Shows a filterable/sortable universe drawn from
// equity_screener_universe (Supabase view over equity_cache).
// Row click → onSelect(symbol) to open the deep-dive.
// ============================================================

var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo, useRef = React.useRef;
var h = React.createElement;

// ── Design tokens (match global terminal) ─────────────────────────────────────
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
    mono:    'JetBrains Mono, monospace',
    sans:    'Inter, DM Sans, sans-serif',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fin(v) { return v != null && isFinite(Number(v)); }
function fmtB(v) {
    if (!fin(v)) return '—';
    var n = Number(v);
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9)  return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6)  return '$' + (n / 1e6).toFixed(0) + 'M';
    return '$' + n.toFixed(0);
}
function fmtX(v, dec) { return fin(v) ? Number(v).toFixed(dec != null ? dec : 1) + 'x' : '—'; }
function fmtPct(v, dec) {
    if (!fin(v)) return '—';
    var n = Number(v);
    return (n >= 0 ? '+' : '') + n.toFixed(dec != null ? dec : 1) + '%';
}
function retColor(v) {
    if (!fin(v)) return T.muted;
    return Number(v) >= 0 ? T.green : T.red;
}
function peColor(v) {
    if (!fin(v)) return T.muted;
    var n = Number(v);
    return n < 15 ? T.green : n > 40 ? T.red : T.text;
}

// ── Sector colour palette ──────────────────────────────────────────────────────
var SECTOR_COLORS = {
    'Technology':           { bg: 'rgba(34,211,238,0.10)',  text: '#22d3ee', border: 'rgba(34,211,238,0.25)' },
    'Health Care':          { bg: 'rgba(65,209,138,0.10)',  text: '#41d18a', border: 'rgba(65,209,138,0.25)' },
    'Financials':           { bg: 'rgba(245,181,61,0.10)',  text: '#f5b53d', border: 'rgba(245,181,61,0.25)' },
    'Consumer Discretionary':{ bg:'rgba(167,139,250,0.10)', text: '#a78bfa', border: 'rgba(167,139,250,0.25)' },
    'Communication Services':{ bg:'rgba(96,165,250,0.10)',  text: '#60a5fa', border: 'rgba(96,165,250,0.25)' },
    'Industrials':          { bg: 'rgba(251,146,60,0.10)',  text: '#fb923c', border: 'rgba(251,146,60,0.25)' },
    'Consumer Staples':     { bg: 'rgba(52,211,153,0.10)',  text: '#34d399', border: 'rgba(52,211,153,0.25)' },
    'Energy':               { bg: 'rgba(250,204,21,0.10)',  text: '#facc15', border: 'rgba(250,204,21,0.25)' },
    'Materials':            { bg: 'rgba(163,230,53,0.10)',  text: '#a3e635', border: 'rgba(163,230,53,0.25)' },
    'Real Estate':          { bg: 'rgba(244,114,182,0.10)', text: '#f472b6', border: 'rgba(244,114,182,0.25)' },
    'Utilities':            { bg: 'rgba(129,140,248,0.10)', text: '#818cf8', border: 'rgba(129,140,248,0.25)' },
};
function sectorColor(s) {
    return SECTOR_COLORS[s] || { bg: 'rgba(255,255,255,0.05)', text: T.muted, border: T.border };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectorBadge(p) {
    var c = sectorColor(p.sector);
    return h('span', {
        style: {
            display: 'inline-block',
            background: c.bg, color: c.text, border: '1px solid ' + c.border,
            borderRadius: 3, padding: '2px 7px',
            fontSize: 9.5, fontWeight: 600, letterSpacing: 0.5,
            fontFamily: T.mono, whiteSpace: 'nowrap',
        }
    }, p.sector || '—');
}

function McapBadge(p) {
    var colors = { Mega: T.cyan, Large: T.amber, Mid: T.green, Small: T.muted };
    var col = colors[p.bucket] || T.muted;
    return h('span', {
        style: {
            display: 'inline-block',
            border: '1px solid ' + col, color: col,
            borderRadius: 3, padding: '1px 5px',
            fontSize: 9, fontWeight: 700, letterSpacing: 0.8, fontFamily: T.mono,
        }
    }, p.bucket || '—');
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

function Week52Bar(p) {
    var lo = p.low, hi = p.high, cur = p.current;
    if (!fin(lo) || !fin(hi) || !fin(cur) || hi <= lo) return h('span', { style: { color: T.muted } }, '—');
    var pct = Math.max(0, Math.min(100, ((cur - lo) / (hi - lo)) * 100));
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' } },
        h('span', { style: { fontSize: 10, color: T.muted, fontFamily: T.mono, minWidth: 28, textAlign: 'right' } }, Math.round(pct) + '%'),
        h('div', { style: { width: 52, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 3, position: 'relative', flexShrink: 0 } },
            h('div', { style: { position: 'absolute', left: 0, top: 0, height: '100%', width: pct + '%', background: pct > 70 ? T.green : pct < 30 ? T.red : T.amber, borderRadius: 3 } })
        )
    );
}

function ScreenerRow(p) {
    var s = p.stock;
    var [hov, setHov] = useState(false);
    return h('tr', {
        onClick: function() { p.onSelect(s.symbol); },
        onMouseEnter: function() { setHov(true); },
        onMouseLeave: function() { setHov(false); },
        style: {
            background: hov ? 'rgba(34,211,238,0.04)' : 'transparent',
            borderBottom: '1px solid ' + T.border,
            cursor: 'pointer', transition: 'background 0.1s',
        }
    },
        // Symbol + Name
        h('td', { style: { padding: '9px 12px', minWidth: 200 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                h('span', { style: { fontSize: 12, fontWeight: 700, fontFamily: T.mono, color: hov ? T.cyan : T.text, letterSpacing: 0.5 } }, s.symbol),
                s.company_name && s.company_name !== s.symbol && h('span', { style: { fontSize: 11, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 } }, s.company_name)
            )
        ),
        // Sector
        h('td', { style: { padding: '9px 10px' } }, h(SectorBadge, { sector: s.sector })),
        // Mkt Cap
        h('td', { style: { padding: '9px 10px', textAlign: 'right', fontFamily: T.mono, fontSize: 12 } },
            h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 } },
                s.market_cap_bucket && h(McapBadge, { bucket: s.market_cap_bucket }),
                h('span', { style: { color: T.text } }, fmtB(s.market_cap_usd))
            )
        ),
        // P/E
        h('td', { style: { padding: '9px 10px', textAlign: 'right', fontFamily: T.mono, fontSize: 12, color: peColor(s.pe_ratio) } },
            fmtX(s.pe_ratio)
        ),
        // EV/EBITDA
        h('td', { style: { padding: '9px 10px', textAlign: 'right', fontFamily: T.mono, fontSize: 12, color: T.muted } },
            fmtX(s.ev_ebitda)
        ),
        // ROE
        h('td', { style: { padding: '9px 10px', textAlign: 'right', fontFamily: T.mono, fontSize: 12, color: fin(s.roe_ttm) ? (s.roe_ttm > 15 ? T.green : s.roe_ttm < 0 ? T.red : T.text) : T.muted } },
            fin(s.roe_ttm) ? s.roe_ttm.toFixed(1) + '%' : '—'
        ),
        // Div Yield
        h('td', { style: { padding: '9px 10px', textAlign: 'right', fontFamily: T.mono, fontSize: 12, color: fin(s.div_yield_pct) && s.div_yield_pct > 0 ? T.green : T.muted } },
            fin(s.div_yield_pct) && s.div_yield_pct > 0 ? s.div_yield_pct.toFixed(2) + '%' : '—'
        ),
        // 52w position
        h('td', { style: { padding: '9px 10px' } },
            h(Week52Bar, { low: s.week52_low, high: s.week52_high, current: s.current_price })
        ),
        // Analyse arrow
        h('td', { style: { padding: '9px 12px', textAlign: 'right' } },
            h('span', { style: { fontSize: 11, color: hov ? T.cyan : T.muted2, fontFamily: T.mono, fontWeight: 700, letterSpacing: 1 } }, 'ANALYSE →')
        )
    );
}

// ── Filter chip ───────────────────────────────────────────────────────────────
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

// ── Main component ────────────────────────────────────────────────────────────
export function EquityScreener(p) {
    // p.onSelect(symbol), p.initialInput, p.onDirectInput

    var [rows, setRows]           = useState([]);
    var [loading, setLoading]     = useState(true);
    var [search, setSearch]       = useState('');
    var [sector, setSector]       = useState('All');
    var [mcap, setMcap]           = useState('All');
    var [divOnly, setDivOnly]     = useState(false);
    var [sort, setSort]           = useState({ col: 'market_cap_usd', asc: false });
    var [directInput, setDirectInput] = useState(p.initialInput || '');
    var inputRef = useRef(null);

    // Load universe from Supabase view
    useEffect(function() {
        if (!sb) { setLoading(false); return; }
        sb.from('equity_screener_universe')
            .select('symbol,ticker,company_name,sector,exchange,current_price,market_cap_usd,market_cap_bucket,pe_ratio,ev_ebitda,roe_ttm,div_yield_pct,week52_high,week52_low,piotroski_f,roic_pct')
            .order('market_cap_usd', { ascending: false, nullsFirst: false })
            .limit(600)
            .then(function(res) {
                setLoading(false);
                if (res.data && res.data.length) setRows(res.data);
            })
            .catch(function() { setLoading(false); });
    }, []);

    // Derive sector list
    var sectors = useMemo(function() {
        var seen = {};
        rows.forEach(function(r) { if (r.sector) seen[r.sector] = (seen[r.sector] || 0) + 1; });
        return Object.entries(seen).sort(function(a, b) { return b[1] - a[1]; }).map(function(e) { return e[0]; }).slice(0, 12);
    }, [rows]);

    // Filter + sort
    var visible = useMemo(function() {
        var out = rows.filter(function(r) {
            if (sector !== 'All' && r.sector !== sector) return false;
            if (mcap !== 'All' && r.market_cap_bucket !== mcap) return false;
            if (divOnly && !(r.div_yield_pct > 0)) return false;
            if (search) {
                var q = search.toLowerCase();
                if (!(r.symbol || '').toLowerCase().includes(q) && !(r.company_name || '').toLowerCase().includes(q)) return false;
            }
            return true;
        });
        out.sort(function(a, b) {
            var va = a[sort.col], vb = b[sort.col];
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            return sort.asc ? va - vb : vb - va;
        });
        return out;
    }, [rows, sector, mcap, divOnly, search, sort]);

    function onSort(col) {
        setSort(function(s) { return s.col === col ? { col: col, asc: !s.asc } : { col: col, asc: false }; });
    }

    function handleDirectAnalyse() {
        var sym = directInput.trim().toUpperCase();
        if (!sym) return;
        if (p.onDirectInput) p.onDirectInput(sym);
        else if (p.onSelect) p.onSelect(sym);
    }

    var MCAP_OPTS = ['All', 'Mega', 'Large', 'Mid', 'Small'];
    var MCAP_COLORS = { Mega: T.cyan, Large: T.amber, Mid: T.green, Small: T.muted };

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },

        // ── Header ─────────────────────────────────────────────────────
        h('div', { style: { padding: '14px 20px 0', flexShrink: 0 } },
            // Title row + direct-entry shortcut
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 } },
                h('div', { style: { fontFamily: T.mono, fontSize: 11, letterSpacing: 2, color: T.muted2, textTransform: 'uppercase' } }, '◈ Equity Research'),
                h('div', { style: { flex: 1 } }),
                // Direct ticker shortcut
                h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                    h('input', {
                        ref: inputRef,
                        value: directInput,
                        onChange: function(e) { setDirectInput(e.target.value.toUpperCase()); },
                        onKeyDown: function(e) { if (e.key === 'Enter') handleDirectAnalyse(); },
                        placeholder: 'Quick-enter ticker…',
                        style: {
                            background: 'rgba(255,255,255,0.04)', border: '1px solid ' + T.border2,
                            borderRadius: 4, padding: '6px 10px', color: T.text,
                            fontSize: 12, fontFamily: T.mono, width: 180,
                            outline: 'none',
                        }
                    }),
                    h('button', {
                        onClick: handleDirectAnalyse,
                        style: {
                            background: T.cyanDim, color: T.cyan, border: '1px solid ' + T.cyan,
                            borderRadius: 4, padding: '6px 14px', cursor: 'pointer',
                            fontSize: 11, fontWeight: 700, fontFamily: T.mono, letterSpacing: 1,
                        }
                    }, 'ANALYSE →')
                )
            ),

            // ── Filter row ─────────────────────────────────────────────
            h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid ' + T.border } },
                // Search
                h('input', {
                    value: search,
                    onChange: function(e) { setSearch(e.target.value); },
                    placeholder: 'Filter by name or ticker…',
                    style: {
                        background: 'rgba(255,255,255,0.04)', border: '1px solid ' + T.border,
                        borderRadius: 4, padding: '5px 10px', color: T.text,
                        fontSize: 11, fontFamily: T.sans, width: 200, outline: 'none',
                    }
                }),
                h('div', { style: { width: 1, height: 20, background: T.border, margin: '0 2px' } }),
                // Market cap filter
                MCAP_OPTS.map(function(opt) {
                    return h(Chip, {
                        key: opt, label: opt, active: mcap === opt,
                        color: MCAP_COLORS[opt],
                        onClick: function() { setMcap(opt); },
                    });
                }),
                h('div', { style: { width: 1, height: 20, background: T.border, margin: '0 2px' } }),
                // Dividend filter
                h(Chip, { label: 'Dividend', active: divOnly, color: T.green, onClick: function() { setDivOnly(function(v) { return !v; }); } }),
                h('div', { style: { flex: 1 } }),
                // Count badge
                h('span', { style: { fontSize: 10, color: T.muted, fontFamily: T.mono } },
                    visible.length + ' / ' + rows.length + ' names'
                )
            ),

            // ── Sector chips ───────────────────────────────────────────
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 } },
                h(Chip, { label: 'All Sectors', active: sector === 'All', onClick: function() { setSector('All'); } }),
                sectors.map(function(s) {
                    return h(Chip, {
                        key: s, label: s, active: sector === s,
                        color: sectorColor(s).text,
                        onClick: function() { setSector(sector === s ? 'All' : s); }
                    });
                })
            )
        ),

        // ── Table ───────────────────────────────────────────────────────
        h('div', { style: { flex: 1, overflow: 'auto', minHeight: 0 } },
            loading
                ? h('div', { style: { padding: 60, textAlign: 'center', color: T.muted, fontFamily: T.mono, fontSize: 13 } }, 'Loading universe…')
                : rows.length === 0
                    ? h('div', { style: { padding: 60, textAlign: 'center' } },
                        h('div', { style: { color: T.muted, fontSize: 13, fontFamily: T.mono, marginBottom: 8 } }, 'No cached equity data'),
                        h('div', { style: { color: T.muted2, fontSize: 11 } }, 'Enter a ticker above to analyse any symbol directly')
                      )
                    : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
                        h('thead', null,
                            h('tr', null,
                                [
                                    { label: 'Company',    col: 'company_name', right: false },
                                    { label: 'Sector',     col: 'sector',       right: false },
                                    { label: 'Mkt Cap',    col: 'market_cap_usd', right: true },
                                    { label: 'P/E',        col: 'pe_ratio',     right: true },
                                    { label: 'EV/EBITDA',  col: 'ev_ebitda',    right: true },
                                    { label: 'ROE',        col: 'roe_ttm',      right: true },
                                    { label: 'Div Yld',    col: 'div_yield_pct', right: true },
                                    { label: '52w Pos',    col: 'week52_high',  right: true },
                                    { label: '',           col: null,           right: false },
                                ].map(function(col) {
                                    return col.col
                                        ? h(SortableHeader, { key: col.col, label: col.label, col: col.col, sort: sort, onSort: onSort, right: col.right })
                                        : h('th', { key: '_action', style: { borderBottom: '1px solid ' + T.border2, background: 'rgba(0,0,0,0.3)', position: 'sticky', top: 0, zIndex: 2 } });
                                })
                            )
                        ),
                        h('tbody', null,
                            visible.length === 0
                                ? h('tr', null, h('td', { colSpan: 9, style: { padding: 40, textAlign: 'center', color: T.muted, fontFamily: T.mono } }, 'No results match current filters'))
                                : visible.map(function(s) {
                                    return h(ScreenerRow, { key: s.symbol, stock: s, onSelect: p.onSelect });
                                })
                        )
                    )
        )
    );
}
