import React from 'react';
// ============================================================
// ATLAS Terminal — Fund Research Screener (landing page)
// Duality: switch between the ETF universe (etf_universe seed,
// live-enriched via /api/equity) and the SA Fund universe
// (fund_prices_raw — ~5,600 ASISA funds with TER/TC/TIC).
// Props: onPick(symbolOrName, kind) — opens the research dossier.
// ============================================================

import { sb } from './config.js';
import {
    h, fmtN, retColor, retStr, costColor, fmtVol, selStyle,
    SortableHeader, PlainHeader, CatBadge, cmp, HoverRow,
} from './screener-kit.js';

const { useState, useEffect, useMemo, useRef } = React;

const ETF_PAGE = 229;   // full seeded universe
const SA_LIMIT = 6000;  // pull the whole fund_prices_raw cost table

// ── ETF row ───────────────────────────────────────────────────────────────────
function EtfRow({ s, onPick }) {
    const numTd = function(val, color, weight) {
        return h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: color || 'rgba(255,255,255,0.7)', fontWeight: weight || 400 } }, val);
    };
    return h(HoverRow, null,
        h('td', { style: { padding: '8px 10px', minWidth: 230 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                h('span', { style: { fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#fff', letterSpacing: 0.5, flexShrink: 0 } }, s.symbol),
                s.name && h('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 } }, s.name)
            )
        ),
        h('td', { style: { padding: '8px 10px', minWidth: 150 } }, h(CatBadge, { label: s.category })),
        numTd(s.current_price != null ? '$' + Number(s.current_price).toFixed(2) : '—', '#00d4ff', 600),
        numTd(retStr(s.return_1m_pct), retColor(s.return_1m_pct), 600),
        numTd(retStr(s.return_3m_pct), retColor(s.return_3m_pct), 600),
        numTd(retStr(s.return_ytd_pct), retColor(s.return_ytd_pct), 600),
        numTd(fmtVol(s.avg_volume), 'rgba(255,255,255,0.55)'),
        h('td', { style: { padding: '8px 10px', textAlign: 'right' } },
            h('button', {
                onClick: function() { onPick(s.symbol, 'etf'); },
                style: { background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.35)', color: '#00d4ff', borderRadius: 5, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', letterSpacing: 0.5 }
            }, 'Open →')
        )
    );
}

// ── SA Fund row ─────────────────────────────────────────────────────────────────
function SaFundRow({ s, onPick }) {
    const numTd = function(val, color, weight) {
        return h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: color || 'rgba(255,255,255,0.7)', fontWeight: weight || 400 } }, val);
    };
    return h(HoverRow, null,
        h('td', { style: { padding: '8px 10px', minWidth: 320 } },
            h('span', { style: { fontSize: 12, color: 'rgba(255,255,255,0.92)', fontWeight: 600 } }, s.fund_name || '—')
        ),
        h('td', { style: { padding: '8px 10px', minWidth: 140 } }, h(CatBadge, { label: s.asisa_category || 'Uncategorised' })),
        numTd(s.ter != null ? fmtN(s.ter, 2, '%') : '—', costColor(s.ter)),
        numTd(s.tc != null ? fmtN(s.tc, 2, '%') : '—'),
        numTd(s.tic != null ? fmtN(s.tic, 2, '%') : '—', costColor(s.tic, 2.25, 3.5)),
        h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(255,255,255,0.45)' } }, s.price_date || '—'),
        h('td', { style: { padding: '8px 10px', textAlign: 'right' } },
            h('button', {
                onClick: function() { onPick(s.fund_name, 'sa_fund'); },
                style: { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', borderRadius: 5, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', letterSpacing: 0.5 }
            }, 'Open →')
        )
    );
}

// ── Main ────────────────────────────────────────────────────────────────────────
export function FundScreener({ onPick }) {
    const [kind, setKind]       = useState('etf');     // 'etf' | 'sa_fund'
    const [etf, setEtf]         = useState([]);
    const [sa, setSa]           = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [search, setSearch]   = useState('');
    const [cat, setCat]         = useState('All');
    const [enrichProg, setEnrichProg] = useState(null);
    const [etfSort, setEtfSort] = useState({ col: 'avg_volume', asc: false });
    const [saSort, setSaSort]   = useState({ col: 'tic', asc: false });

    // Load whichever universe is active (cached after first fetch)
    useEffect(function() {
        if (!sb) { setLoading(false); return; }
        if (kind === 'etf' && etf.length) { setLoading(false); return; }
        if (kind === 'sa_fund' && sa.length) { setLoading(false); return; }
        setLoading(true); setError(null);
        if (kind === 'etf') {
            sb.from('etf_universe').select('symbol,name,category,avg_volume').order('avg_volume', { ascending: false }).limit(ETF_PAGE)
                .then(function(res) {
                    setLoading(false);
                    if (res.error) { setError(res.error.message); return; }
                    setEtf((res.data || []).map(function(r) { return Object.assign({}, r); }));
                });
        } else {
            sb.from('fund_prices_raw').select('fund_name,asisa_category,ter,tc,tic,price_date')
                .eq('source', 'funddata_public').order('tic', { ascending: false, nullsFirst: false }).limit(SA_LIMIT)
                .then(function(res) {
                    setLoading(false);
                    if (res.error) { setError(res.error.message); return; }
                    // numeric coercion (REST returns numeric as string)
                    setSa((res.data || []).map(function(r) {
                        return {
                            fund_name: r.fund_name, asisa_category: r.asisa_category,
                            ter: r.ter != null ? Number(r.ter) : null,
                            tc:  r.tc  != null ? Number(r.tc)  : null,
                            tic: r.tic != null ? Number(r.tic) : null,
                            price_date: r.price_date,
                        };
                    }));
                });
        }
    }, [kind]);

    // Optional live ETF price/return enrichment (user-triggered to respect rate limits)
    const cancelRef = useRef(false);
    function loadEtfPrices() {
        const needs = etf.filter(function(s) { return s.current_price == null; });
        if (!needs.length) return;
        cancelRef.current = false;
        var idx = 0;
        setEnrichProg({ done: 0, total: needs.length });
        function next() {
            if (cancelRef.current || idx >= needs.length) { setEnrichProg(null); return; }
            var sym = needs[idx].symbol; idx++;
            fetch('/api/equity?symbol=' + encodeURIComponent(sym))
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(j) {
                    if (cancelRef.current) return;
                    var ts = j && j.daily && j.daily['Time Series (Daily)'];
                    if (ts) {
                        var dates = Object.keys(ts).sort();
                        var closes = dates.map(function(d) { return Number(ts[d]['4. close']); }).filter(function(x) { return !isNaN(x); });
                        var n = closes.length;
                        if (n > 1) {
                            var cur = closes[n - 1];
                            var back = function(days) { return n > days ? (cur / closes[n - 1 - days] - 1) * 100 : null; };
                            var ytdIdx = dates.findIndex(function(d) { return d >= (new Date().getFullYear()) + '-01-01'; });
                            var ytd = ytdIdx > 0 ? (cur / closes[ytdIdx] - 1) * 100 : null;
                            setEtf(function(prev) {
                                return prev.map(function(s) {
                                    if (s.symbol !== sym) return s;
                                    return Object.assign({}, s, { current_price: cur, return_1m_pct: back(21), return_3m_pct: back(63), return_ytd_pct: ytd });
                                });
                            });
                        }
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
    }
    useEffect(function() { return function() { cancelRef.current = true; }; }, []);

    const rows = kind === 'etf' ? etf : sa;
    const categories = useMemo(function() {
        const key = kind === 'etf' ? 'category' : 'asisa_category';
        return ['All'].concat(Array.from(new Set(rows.map(function(r) { return r[key]; }).filter(Boolean))).sort());
    }, [rows, kind]);

    const filtered = useMemo(function() {
        const sort = kind === 'etf' ? etfSort : saSort;
        const nameKey = kind === 'etf' ? 'name' : 'fund_name';
        const catKey  = kind === 'etf' ? 'category' : 'asisa_category';
        return rows.filter(function(r) {
            if (search) {
                const q = search.toLowerCase();
                const sym = (r.symbol || '').toLowerCase();
                const nm  = (r[nameKey] || '').toLowerCase();
                if (!sym.includes(q) && !nm.includes(q)) return false;
            }
            if (cat !== 'All' && r[catKey] !== cat) return false;
            return true;
        }).sort(function(a, b) { return cmp(a, b, sort.col, sort.asc); });
    }, [rows, kind, search, cat, etfSort, saSort]);

    function handleSort(col) {
        if (kind === 'etf') setEtfSort(function(p) { return { col: col, asc: p.col === col ? !p.asc : false }; });
        else setSaSort(function(p) { return { col: col, asc: p.col === col ? !p.asc : false }; });
    }
    const sort = kind === 'etf' ? etfSort : saSort;

    function switchKind(k) { setKind(k); setSearch(''); setCat('All'); setEnrichProg(null); cancelRef.current = true; }

    if (!sb) {
        return h('div', { style: { padding: 60, textAlign: 'center' } },
            h('div', { style: { fontSize: 24, marginBottom: 12, opacity: 0.3 } }, '◈'),
            h('div', { style: { fontSize: 14, color: 'rgba(255,255,255,0.5)' } }, 'Connect Supabase to load the fund universe'));
    }

    return h('div', { style: { display: 'flex', flexDirection: 'column' } },
        // Header
        h('div', { style: { padding: '14px 4px 12px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' } },
            h('div', null,
                h('div', { style: { fontSize: 13, fontWeight: 700, color: '#00d4ff', letterSpacing: 2, fontFamily: 'JetBrains Mono, monospace' } }, '◈ FUND SCREENER'),
                h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 } },
                    kind === 'etf' ? 'Curated ETF universe · live-enriched' : 'SA ASISA fund universe · cost registry (TER / TC / TIC)')
            ),
            // ETF ⟷ SA Fund toggle
            h('div', { style: { display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 3 } },
                [['etf', '▤ ETFs'], ['sa_fund', '▦ SA Funds']].map(function(pair) {
                    const id = pair[0]; const label = pair[1]; const active = kind === id;
                    return h('button', {
                        key: id, onClick: function() { switchKind(id); },
                        style: {
                            background: active ? 'rgba(0,212,255,0.15)' : 'transparent',
                            border: '1px solid ' + (active ? 'rgba(0,212,255,0.45)' : 'transparent'),
                            color: active ? '#00d4ff' : 'rgba(255,255,255,0.45)',
                            borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: active ? 700 : 400,
                            cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5,
                        }
                    }, label);
                })
            ),
            h('div', { style: { flex: 1 } }),
            // ETF live-price loader
            kind === 'etf' && (enrichProg
                ? h('div', { style: { fontSize: 10, color: '#00d4ff', fontFamily: 'JetBrains Mono, monospace', opacity: 0.8 } }, 'Loading prices ' + enrichProg.done + ' / ' + enrichProg.total)
                : h('button', {
                    onClick: loadEtfPrices,
                    style: { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5 }
                }, '↻ Load live prices')),
            h('input', {
                type: 'text', value: search, onChange: function(e) { setSearch(e.target.value); },
                placeholder: kind === 'etf' ? 'Search ticker or name…' : 'Search fund name…',
                style: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#fff', padding: '7px 12px', fontSize: 12, width: 220, outline: 'none', fontFamily: 'JetBrains Mono, monospace' }
            }),
            h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' } }, filtered.length + ' / ' + rows.length)
        ),

        // Category filter
        h('div', { style: { padding: '0 4px 10px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' } },
            h('span', { style: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace' } }, 'Category:'),
            h('select', { value: cat, onChange: function(e) { setCat(e.target.value); }, style: Object.assign({}, selStyle, { maxWidth: 280 }) },
                categories.map(function(c) { return h('option', { key: c, value: c }, c === 'All' ? (kind === 'etf' ? 'All categories' : 'All ASISA categories') : c); }))
        ),

        // Table
        loading
            ? h('div', { style: { padding: 60, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' } }, 'Loading universe…')
            : error
                ? h('div', { style: { padding: 40, color: '#ef4444', fontSize: 13, fontFamily: 'JetBrains Mono, monospace' } }, 'Error: ' + error)
                : h('div', { style: { overflowX: 'auto' } },
                    filtered.length === 0
                        ? h('div', { style: { padding: '40px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13 } }, 'No funds match your filters.')
                        : kind === 'etf'
                            ? h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 880 } },
                                h('thead', null,
                                    h('tr', null,
                                        h(SortableHeader, { label: 'ETF', col: 'symbol', sort, onSort: handleSort, align: 'left' }),
                                        h(SortableHeader, { label: 'Category', col: 'category', sort, onSort: handleSort, align: 'left' }),
                                        h(SortableHeader, { label: 'Price', col: 'current_price', sort, onSort: handleSort }),
                                        h(SortableHeader, { label: '1M', col: 'return_1m_pct', sort, onSort: handleSort }),
                                        h(SortableHeader, { label: '3M', col: 'return_3m_pct', sort, onSort: handleSort }),
                                        h(SortableHeader, { label: 'YTD', col: 'return_ytd_pct', sort, onSort: handleSort }),
                                        h(SortableHeader, { label: 'Avg Vol', col: 'avg_volume', sort, onSort: handleSort }),
                                        h(PlainHeader, { label: 'Action', align: 'right' })
                                    )
                                ),
                                h('tbody', null, filtered.map(function(s) { return h(EtfRow, { key: s.symbol, s: s, onPick: onPick }); }))
                            )
                            : h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 880 } },
                                h('thead', null,
                                    h('tr', null,
                                        h(SortableHeader, { label: 'Fund', col: 'fund_name', sort, onSort: handleSort, align: 'left' }),
                                        h(SortableHeader, { label: 'ASISA Category', col: 'asisa_category', sort, onSort: handleSort, align: 'left' }),
                                        h(SortableHeader, { label: 'TER', col: 'ter', sort, onSort: handleSort }),
                                        h(SortableHeader, { label: 'TC', col: 'tc', sort, onSort: handleSort }),
                                        h(SortableHeader, { label: 'TIC', col: 'tic', sort, onSort: handleSort }),
                                        h(SortableHeader, { label: 'As Of', col: 'price_date', sort, onSort: handleSort }),
                                        h(PlainHeader, { label: 'Action', align: 'right' })
                                    )
                                ),
                                h('tbody', null, filtered.map(function(s, i) { return h(SaFundRow, { key: (s.fund_name || '') + i, s: s, onPick: onPick }); }))
                            )
                )
    );
}
