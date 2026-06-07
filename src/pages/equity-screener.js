import React from 'react';
// ============================================================
// ATLAS Terminal — Equity Research Screener (landing page)
// Pre-loaded universe so you pick from what's available rather
// than guessing tickers. Portfolio mode reads vw_screener;
// Market mode reads /api/screener-market (Alpha Vantage universe).
// Props: onPick(symbol) — opens the full research dossier.
// ============================================================

import { sb } from './config.js';
import {
    h, fmtN, retColor, retStr, selStyle, SortableHeader, PlainHeader,
    CatBadge, cmp, HoverRow,
} from './screener-kit.js';

const { useState, useEffect, useMemo, useRef } = React;

// Style buckets mirror the valuation screener so the two feel consistent
const STYLE_COLORS = {
    Value:      { bg: 'rgba(94,161,42,0.12)',  text: '#7ec648', border: 'rgba(94,161,42,0.3)' },
    Growth:     { bg: 'rgba(74,159,212,0.12)', text: '#6bb8e8', border: 'rgba(74,159,212,0.3)' },
    Momentum:   { bg: 'rgba(212,134,42,0.12)', text: '#e8a84a', border: 'rgba(212,134,42,0.3)' },
    Quality:    { bg: 'rgba(139,92,246,0.12)', text: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
    Dividend:   { bg: 'rgba(29,158,117,0.12)', text: '#1D9E75', border: 'rgba(29,158,117,0.3)' },
    Contrarian: { bg: 'rgba(239,68,68,0.12)',  text: '#f87171', border: 'rgba(239,68,68,0.3)' },
};
const STYLE_ABBR = { Value: 'Val', Growth: 'Gro', Momentum: 'Mom', Quality: 'Qual', Dividend: 'Div', Contrarian: 'Cnt' };
const ALL_STYLES = ['All', 'Value', 'Growth', 'Momentum', 'Quality', 'Dividend', 'Contrarian'];

function StyleBadge({ style }) {
    const c = STYLE_COLORS[style];
    if (!c) return null;
    return h('span', {
        style: {
            background: c.bg, color: c.text, border: '1px solid ' + c.border,
            borderRadius: 3, padding: '1px 6px', fontSize: 9, fontWeight: 700,
            letterSpacing: 0.8, fontFamily: 'JetBrains Mono, monospace',
        }
    }, STYLE_ABBR[style] || style);
}

function peColor(v) {
    if (v == null) return 'rgba(255,255,255,0.7)';
    if (v < 15) return '#10b981';
    if (v > 35) return '#ef4444';
    return 'rgba(255,255,255,0.7)';
}

// ── Row ─────────────────────────────────────────────────────────────────────────
function EquityRow({ s, onPick }) {
    const numTd = function(val, color, weight) {
        return h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: color || 'rgba(255,255,255,0.7)', fontWeight: weight || 400 } }, val);
    };
    return h(HoverRow, null,
        h('td', { style: { padding: '8px 10px', minWidth: 220 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                h('span', { style: { fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#fff', letterSpacing: 0.5, flexShrink: 0 } }, s.symbol),
                (s.name && s.name !== s.symbol) && h('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 190 } }, s.name)
            )
        ),
        h('td', { style: { padding: '8px 10px', minWidth: 120 } }, h(CatBadge, { label: s.sector })),
        numTd(s.current_price != null ? '$' + Number(s.current_price).toFixed(2) : '—', '#00d4ff', 600),
        numTd(s.pe_ratio != null ? fmtN(s.pe_ratio, 1, 'x') : '—', peColor(s.pe_ratio)),
        numTd(s.ev_ebitda != null ? fmtN(s.ev_ebitda, 1, 'x') : '—'),
        numTd((s.div_yield_pct || 0) > 0 ? fmtN(s.div_yield_pct, 2, '%') : '—', (s.div_yield_pct || 0) > 0 ? '#1D9E75' : 'rgba(255,255,255,0.25)'),
        numTd(retStr(s.return_1m_pct), retColor(s.return_1m_pct), 600),
        numTd(retStr(s.return_3m_pct), retColor(s.return_3m_pct), 600),
        numTd(retStr(s.return_ytd_pct), retColor(s.return_ytd_pct), 600),
        h('td', { style: { padding: '8px 10px' } },
            h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
                (s.style_tags || []).slice(0, 2).map(function(st) { return h(StyleBadge, { key: st, style: st }); })
            )
        ),
        h('td', { style: { padding: '8px 10px', textAlign: 'right' } },
            h('button', {
                onClick: function() { onPick(s.symbol); },
                style: {
                    background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.35)',
                    color: '#00d4ff', borderRadius: 5, padding: '5px 12px', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', letterSpacing: 0.5,
                }
            }, 'Research →')
        )
    );
}

// ── Main ────────────────────────────────────────────────────────────────────────
export function EquityScreener({ onPick }) {
    const [universe, setUniverse]   = useState('portfolio');
    const [data, setData]           = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [enrichProg, setEnrichProg] = useState(null);
    const [search, setSearch]       = useState('');
    const [activeStyle, setStyle]   = useState('All');
    const [filters, setFilters]     = useState({ sector: 'All', div: 'All' });
    const [sort, setSort]           = useState({ col: 'return_3m_pct', asc: false });

    useEffect(function() {
        setData([]); setError(null); setLoading(true); setEnrichProg(null);
        if (universe === 'portfolio') {
            if (!sb) { setLoading(false); return; }
            sb.from('vw_screener').select('*').then(function(res) {
                setLoading(false);
                if (res.error) { setError(res.error.message); return; }
                setData(res.data || []);
            });
        } else {
            fetch('/api/screener-market')
                .then(function(r) { return r.json(); })
                .then(function(json) {
                    setLoading(false);
                    if (json.error) { setError(json.error); return; }
                    setData(json.stocks || []);
                })
                .catch(function(err) { setLoading(false); setError(err.message); });
        }
    }, [universe]);

    // Progressive enrichment of rows missing a real company name / fundamentals
    const cancelRef = useRef(false);
    useEffect(function() {
        if (data.length === 0) return;
        const needs = data.filter(function(s) { return !s.name || s.name === s.symbol || s.pe_ratio == null; });
        if (!needs.length) return;
        cancelRef.current = false;
        var idx = 0;
        setEnrichProg({ done: 0, total: needs.length });
        function next() {
            if (cancelRef.current || idx >= needs.length) { setEnrichProg(null); return; }
            var sym = needs[idx].symbol; idx++;
            fetch('/api/equity?symbol=' + encodeURIComponent(sym) + '&endpoint=overview')
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(j) {
                    if (cancelRef.current) return;
                    var ov = j && (j.overview || j);
                    if (ov && ov.Name) {
                        setData(function(prev) {
                            return prev.map(function(s) {
                                if (s.symbol !== sym) return s;
                                return Object.assign({}, s, {
                                    name:          ov.Name !== sym ? ov.Name : s.name,
                                    sector:        ov.Sector || s.sector,
                                    pe_ratio:      parseFloat(ov.PERatio) || s.pe_ratio,
                                    ev_ebitda:     parseFloat(ov.EVToEBITDA) || s.ev_ebitda,
                                    div_yield_pct: ov.DividendYield ? parseFloat(ov.DividendYield) * 100 : s.div_yield_pct,
                                });
                            });
                        });
                    }
                    setEnrichProg(function(p) { return p ? { done: p.done + 1, total: p.total } : null; });
                    setTimeout(next, 800);
                })
                .catch(function() {
                    setEnrichProg(function(p) { return p ? { done: p.done + 1, total: p.total } : null; });
                    setTimeout(next, 800);
                });
        }
        next();
        return function() { cancelRef.current = true; };
    }, [universe, data.length > 0 && data[0] && data[0].symbol]);

    const sectors = useMemo(function() { return ['All'].concat(Array.from(new Set(data.map(function(s) { return s.sector; }).filter(Boolean))).sort()); }, [data]);

    const filtered = useMemo(function() {
        return data.filter(function(s) {
            if (search) {
                const q = search.toLowerCase();
                if (!s.symbol.toLowerCase().includes(q) && !(s.name || '').toLowerCase().includes(q)) return false;
            }
            if (activeStyle !== 'All' && !(s.style_tags || []).includes(activeStyle)) return false;
            if (filters.sector !== 'All' && s.sector !== filters.sector) return false;
            if (filters.div === 'Yes' && (s.div_yield_pct || 0) <= 0) return false;
            if (filters.div === 'No' && (s.div_yield_pct || 0) > 0) return false;
            return true;
        }).sort(function(a, b) { return cmp(a, b, sort.col, sort.asc); });
    }, [data, search, activeStyle, filters, sort]);

    function handleSort(col) { setSort(function(p) { return { col: col, asc: p.col === col ? !p.asc : false }; }); }
    function setFilter(k, v) { setFilters(function(p) { return Object.assign({}, p, { [k]: v }); }); }

    if (loading) {
        return h('div', { style: { padding: 60, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' } },
            universe === 'market' ? 'Fetching market universe…' : 'Loading screener…');
    }
    if (!sb && universe === 'portfolio') {
        return h('div', { style: { padding: 60, textAlign: 'center' } },
            h('div', { style: { fontSize: 24, marginBottom: 12, opacity: 0.3 } }, '◈'),
            h('div', { style: { fontSize: 14, color: 'rgba(255,255,255,0.5)' } }, 'Connect Supabase to load the screener'));
    }
    if (error) return h('div', { style: { padding: 40, color: '#ef4444', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' } }, 'Error: ' + error);

    return h('div', { style: { display: 'flex', flexDirection: 'column' } },
        // Header
        h('div', { style: { padding: '14px 4px 12px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' } },
            h('div', null,
                h('div', { style: { fontSize: 13, fontWeight: 700, color: '#00d4ff', letterSpacing: 2, fontFamily: 'JetBrains Mono, monospace' } }, '◈ EQUITY SCREENER'),
                h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 } }, 'Pick a name to open its research dossier')
            ),
            // Universe toggle
            h('div', { style: { display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 3 } },
                ['portfolio', 'market'].map(function(u) {
                    const active = universe === u;
                    return h('button', {
                        key: u, onClick: function() { setUniverse(u); setSearch(''); setStyle('All'); setFilters({ sector: 'All', div: 'All' }); },
                        style: {
                            background: active ? 'rgba(0,212,255,0.15)' : 'transparent',
                            border: '1px solid ' + (active ? 'rgba(0,212,255,0.45)' : 'transparent'),
                            color: active ? '#00d4ff' : 'rgba(255,255,255,0.45)',
                            borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: active ? 700 : 400,
                            cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5,
                        }
                    }, u === 'portfolio' ? '◈ Portfolio' : '⊕ Market');
                })
            ),
            h('div', { style: { flex: 1 } }),
            enrichProg && h('div', { style: { fontSize: 10, color: '#00d4ff', fontFamily: 'JetBrains Mono, monospace', opacity: 0.8 } },
                'Enriching ' + enrichProg.done + ' / ' + enrichProg.total),
            h('input', {
                type: 'text', value: search, onChange: function(e) { setSearch(e.target.value); },
                placeholder: 'Search ticker or name…',
                style: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#fff', padding: '7px 12px', fontSize: 12, width: 200, outline: 'none', fontFamily: 'JetBrains Mono, monospace' }
            }),
            h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' } }, filtered.length + ' / ' + data.length)
        ),

        // Style pills
        h('div', { style: { padding: '4px 4px 10px', display: 'flex', gap: 8, flexWrap: 'wrap' } },
            ALL_STYLES.map(function(style) {
                const active = activeStyle === style;
                const c = STYLE_COLORS[style];
                return h('button', {
                    key: style, onClick: function() { setStyle(style); },
                    style: {
                        background: active ? (c ? c.bg : 'rgba(0,212,255,0.15)') : 'rgba(255,255,255,0.04)',
                        border: '1px solid ' + (active ? (c ? c.border : 'rgba(0,212,255,0.4)') : 'rgba(255,255,255,0.1)'),
                        color: active ? (c ? c.text : '#00d4ff') : 'rgba(255,255,255,0.5)',
                        borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: active ? 700 : 400,
                        cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5,
                    }
                }, style);
            })
        ),

        // Filters
        h('div', { style: { padding: '0 4px 10px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' } },
            h('span', { style: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace' } }, 'Filter:'),
            h('select', { value: filters.sector, onChange: function(e) { setFilter('sector', e.target.value); }, style: selStyle },
                sectors.map(function(s) { return h('option', { key: s, value: s }, s === 'All' ? 'All sectors' : s); })),
            h('select', { value: filters.div, onChange: function(e) { setFilter('div', e.target.value); }, style: selStyle },
                h('option', { value: 'All' }, 'All dividends'),
                h('option', { value: 'Yes' }, 'Dividend payers'),
                h('option', { value: 'No' }, 'No dividend'))
        ),

        // Table
        h('div', { style: { overflowX: 'auto' } },
            filtered.length === 0
                ? h('div', { style: { padding: '40px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 } }, 'No names match your filters.')
                : h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 980 } },
                    h('thead', null,
                        h('tr', null,
                            h(PlainHeader, { label: 'Company', align: 'left' }),
                            h(SortableHeader, { label: 'Sector', col: 'sector', sort, onSort: handleSort, align: 'left' }),
                            h(SortableHeader, { label: 'Price', col: 'current_price', sort, onSort: handleSort }),
                            h(SortableHeader, { label: 'P/E', col: 'pe_ratio', sort, onSort: handleSort }),
                            h(SortableHeader, { label: 'EV/EBITDA', col: 'ev_ebitda', sort, onSort: handleSort }),
                            h(SortableHeader, { label: 'Div %', col: 'div_yield_pct', sort, onSort: handleSort }),
                            h(SortableHeader, { label: '1M', col: 'return_1m_pct', sort, onSort: handleSort }),
                            h(SortableHeader, { label: '3M', col: 'return_3m_pct', sort, onSort: handleSort }),
                            h(SortableHeader, { label: 'YTD', col: 'return_ytd_pct', sort, onSort: handleSort }),
                            h(PlainHeader, { label: 'Style', align: 'left' }),
                            h(PlainHeader, { label: 'Action', align: 'right' })
                        )
                    ),
                    h('tbody', null,
                        filtered.map(function(s) { return h(EquityRow, { key: s.symbol, s: s, onPick: onPick }); })
                    )
                )
        )
    );
}
