// ============================================================
// ATLAS Terminal — Valuation House Screener
// Landing page that helps surface which companies to value.
// Portfolio mode: reads from vw_screener (Supabase view).
// Market mode: reads from /api/screener-market (Alpha Vantage).
// Props: onNavigate(symbol) — called when user clicks "Value →"
// ============================================================

import { sb } from './config.js';

const { useState, useEffect, useMemo } = React;
const h = React.createElement;

// ── Style definitions ─────────────────────────────────────────────────────────
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

const REGIME_COLORS = {
    Uptrend:   { bg: 'rgba(29,158,117,0.15)',  text: '#1D9E75',  border: 'rgba(29,158,117,0.3)' },
    Downtrend: { bg: 'rgba(239,68,68,0.15)',   text: '#f87171',  border: 'rgba(239,68,68,0.3)' },
    Sideways:  { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b',  border: 'rgba(245,158,11,0.3)' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtN(v, dec, sfx) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(dec != null ? dec : 1) + (sfx || '');
}
function rsiColor(rsi) {
    if (rsi == null) return 'rgba(255,255,255,0.3)';
    if (rsi >= 70)   return '#E24B4A';
    if (rsi <= 30)   return '#5ea12a';
    if (rsi > 60)    return '#BA7517';
    return '#1D9E75';
}
function retColor(v) {
    if (v == null) return 'rgba(255,255,255,0.35)';
    return v >= 0 ? '#10b981' : '#ef4444';
}
function retStr(v) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}
function peColor(v) {
    if (v == null) return 'rgba(255,255,255,0.7)';
    if (v < 15)  return '#10b981';
    if (v > 35)  return '#ef4444';
    return 'rgba(255,255,255,0.7)';
}

// ── Bucket strip card data ────────────────────────────────────────────────────
const BUCKET_META = [
    { style: 'Value',      icon: '◆', desc: 'Low multiples' },
    { style: 'Growth',     icon: '▲', desc: 'Revenue & price momentum' },
    { style: 'Momentum',   icon: '→', desc: 'Uptrend + RSI > 50' },
    { style: 'Quality',    icon: '★', desc: 'High ROE / low vol' },
    { style: 'Dividend',   icon: '⬤', desc: 'Yield > 1.5%' },
    { style: 'Contrarian', icon: '↓', desc: 'Deep drawdown > 20%' },
];

// ── Sub-components ────────────────────────────────────────────────────────────
function StyleBadge({ style }) {
    const c = STYLE_COLORS[style];
    if (!c) return null;
    return h('span', {
        style: {
            background: c.bg, color: c.text,
            border: '1px solid ' + c.border,
            borderRadius: 3, padding: '1px 6px',
            fontSize: 9, fontWeight: 700,
            letterSpacing: 0.8, fontFamily: 'DM Mono, monospace',
        }
    }, STYLE_ABBR[style] || style);
}

function RegimeBadge({ regime }) {
    const c = REGIME_COLORS[regime] || { bg: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.4)', border: 'rgba(255,255,255,0.12)' };
    return h('span', {
        style: {
            background: c.bg, color: c.text,
            border: '1px solid ' + c.border,
            borderRadius: 3, padding: '2px 7px',
            fontSize: 10, fontWeight: 600,
            fontFamily: 'DM Mono, monospace',
        }
    }, regime || '—');
}

function RSIBar({ rsi }) {
    if (rsi == null) return h('span', { style: { color: 'rgba(255,255,255,0.3)', fontSize: 11 } }, '—');
    const pct = Math.min(100, Math.max(0, rsi));
    const col = rsiColor(rsi);
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        h('div', { style: { width: 44, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 } },
            h('div', { style: { width: pct + '%', height: '100%', background: col, borderRadius: 3 } })
        ),
        h('span', { style: { fontSize: 11, color: col, fontFamily: 'DM Mono, monospace', fontWeight: 600 } }, rsi.toFixed(0))
    );
}

// ── BucketStrip ───────────────────────────────────────────────────────────────
function BucketStrip({ data, filters, activeStyle, onStyleClick }) {
    const baseFiltered = useMemo(function() {
        return data.filter(function(s) {
            if (filters.sector !== 'All' && s.sector !== filters.sector) return false;
            if (filters.geo !== 'All' && s.country !== filters.geo) return false;
            if (filters.div === 'Yes' && (s.div_yield_pct || 0) <= 0) return false;
            if (filters.div === 'No' && (s.div_yield_pct || 0) > 0) return false;
            if (filters.regime !== 'All' && s.price_regime !== filters.regime) return false;
            if (filters.mcap !== 'All' && s.market_cap_bucket !== filters.mcap) return false;
            return true;
        });
    }, [data, filters]);

    return h('div', {
        style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 10,
            padding: '0 20px 16px',
        }
    },
        BUCKET_META.map(function(b) {
            const count = baseFiltered.filter(function(s) { return s.style_tags && s.style_tags.includes(b.style); }).length;
            const active = activeStyle === b.style;
            const c = STYLE_COLORS[b.style];
            return h('button', {
                key: b.style,
                onClick: function() { onStyleClick(active ? 'All' : b.style); },
                style: {
                    background: active ? c.bg : 'rgba(255,255,255,0.03)',
                    border: '1px solid ' + (active ? c.border : 'rgba(255,255,255,0.08)'),
                    borderRadius: 8, padding: '10px 12px',
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                }
            },
                h('div', { style: { fontSize: 16, marginBottom: 4, color: active ? c.text : 'rgba(255,255,255,0.4)' } }, b.icon),
                h('div', { style: { fontSize: 18, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: active ? c.text : '#fff', lineHeight: 1.1 } }, count),
                h('div', { style: { fontSize: 10, color: active ? c.text : 'rgba(255,255,255,0.5)', marginTop: 2, fontWeight: active ? 700 : 400, letterSpacing: 0.5 } }, b.style),
                h('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 } }, b.desc)
            );
        })
    );
}

// ── SortableHeader ────────────────────────────────────────────────────────────
function SortableHeader({ label, col, sort, onSort, align }) {
    const active = sort.col === col;
    return h('th', {
        onClick: function() { onSort(col); },
        style: {
            padding: '8px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
            color: active ? '#00d4ff' : 'rgba(255,255,255,0.35)',
            textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none',
            whiteSpace: 'nowrap', textAlign: align || 'right',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            fontFamily: 'DM Mono, monospace',
        }
    }, label + (active ? (sort.asc ? ' ↑' : ' ↓') : ''));
}

// ── ScreenerRow ───────────────────────────────────────────────────────────────
function ScreenerRow({ s, onNavigate }) {
    const [hov, setHov] = useState(false);
    return h('tr', {
        onMouseEnter: function() { setHov(true); },
        onMouseLeave: function() { setHov(false); },
        style: {
            background: hov ? 'rgba(0,212,255,0.04)' : 'transparent',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            transition: 'background 0.1s',
        }
    },
        // Ticker + Full Name (side by side)
        h('td', { style: { padding: '8px 10px', minWidth: 200 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                h('span', {
                    style: {
                        fontSize: 12, fontWeight: 700, fontFamily: 'DM Mono, monospace',
                        color: '#fff', letterSpacing: 0.5, flexShrink: 0,
                    }
                }, s.symbol),
                h('span', {
                    style: {
                        fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'Inter, sans-serif',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180,
                    }
                }, s.name || '')
            )
        ),
        // Sector
        h('td', { style: { padding: '8px 10px', minWidth: 120 } },
            h('span', {
                style: {
                    fontSize: 10, color: 'rgba(255,255,255,0.45)',
                    fontFamily: 'DM Mono, monospace',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 3, padding: '2px 6px',
                    whiteSpace: 'nowrap',
                }
            }, s.sector || '—')
        ),
        // Price
        h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#00d4ff', fontWeight: 600 } },
            s.current_price != null ? '$' + Number(s.current_price).toFixed(2) : '—'
        ),
        // P/E
        h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 12, color: peColor(s.pe_ratio) } },
            s.pe_ratio != null ? fmtN(s.pe_ratio, 1, 'x') : '—'
        ),
        // EV/EBITDA
        h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'rgba(255,255,255,0.7)' } },
            s.ev_ebitda != null ? fmtN(s.ev_ebitda, 1, 'x') : '—'
        ),
        // Div %
        h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 12, color: (s.div_yield_pct || 0) > 0 ? '#1D9E75' : 'rgba(255,255,255,0.25)' } },
            (s.div_yield_pct || 0) > 0 ? fmtN(s.div_yield_pct, 2, '%') : '—'
        ),
        // RSI
        h('td', { style: { padding: '8px 10px', textAlign: 'right' } },
            h(RSIBar, { rsi: s.rsi_14 != null ? Number(s.rsi_14) : null })
        ),
        // 1M
        h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 12, color: retColor(s.return_1m_pct), fontWeight: 600 } },
            retStr(s.return_1m_pct)
        ),
        // 3M
        h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 12, color: retColor(s.return_3m_pct), fontWeight: 600 } },
            retStr(s.return_3m_pct)
        ),
        // YTD
        h('td', { style: { padding: '8px 10px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 12, color: retColor(s.return_ytd_pct), fontWeight: 600 } },
            retStr(s.return_ytd_pct)
        ),
        // Regime
        h('td', { style: { padding: '8px 10px' } },
            h(RegimeBadge, { regime: s.price_regime })
        ),
        // Style tags (max 2)
        h('td', { style: { padding: '8px 10px' } },
            h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
                (s.style_tags || []).slice(0, 2).map(function(st) { return h(StyleBadge, { key: st, style: st }); })
            )
        ),
        // Action
        h('td', { style: { padding: '8px 10px', textAlign: 'right' } },
            h('button', {
                onClick: function() { onNavigate(s.symbol); },
                style: {
                    background: 'rgba(0,212,255,0.1)',
                    border: '1px solid rgba(0,212,255,0.35)',
                    color: '#00d4ff', borderRadius: 5,
                    padding: '5px 12px', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'DM Mono, monospace',
                    whiteSpace: 'nowrap', letterSpacing: 0.5,
                }
            }, 'Value →')
        )
    );
}

// ── UniverseToggle ────────────────────────────────────────────────────────────
function UniverseToggle({ universe, onChange }) {
    const btn = function(id, label, icon) {
        const active = universe === id;
        return h('button', {
            key: id,
            onClick: function() { onChange(id); },
            style: {
                background: active ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                border: '1px solid ' + (active ? 'rgba(0,212,255,0.45)' : 'rgba(255,255,255,0.1)'),
                color: active ? '#00d4ff' : 'rgba(255,255,255,0.45)',
                borderRadius: 6, padding: '5px 14px',
                fontSize: 11, fontWeight: active ? 700 : 400,
                cursor: 'pointer', fontFamily: 'DM Mono, monospace',
                letterSpacing: 0.5, transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 5,
            }
        }, icon, label);
    };
    return h('div', {
        style: {
            display: 'flex', gap: 4,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: 3,
        }
    },
        btn('portfolio', 'Portfolio', '◈ '),
        btn('market',    'Market',    '⊕ ')
    );
}

// ── Main ValuationScreener ────────────────────────────────────────────────────
export function ValuationScreener({ onNavigate }) {
    const [universe, setUniverse]   = useState('portfolio');
    const [data, setData]           = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [marketMeta, setMarketMeta] = useState(null);
    const [search, setSearch]       = useState('');
    const [activeStyle, setStyle]   = useState('All');
    const [filters, setFilters]     = useState({ sector: 'All', geo: 'All', div: 'All', regime: 'All', mcap: 'All' });
    const [sort, setSort]           = useState({ col: 'return_3m_pct', asc: false });

    useEffect(function() {
        setData([]);
        setError(null);
        setLoading(true);

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
                    setMarketMeta({ total: json.total_universe, enriched: json.enriched, hasKey: json.has_av_key });
                })
                .catch(function(err) {
                    setLoading(false);
                    setError(err.message);
                });
        }
    }, [universe]);

    // Derived filter options
    const sectors = useMemo(function() { return ['All', ...new Set(data.map(s => s.sector).filter(Boolean))].sort(); }, [data]);
    const geos    = useMemo(function() { return ['All', ...new Set(data.map(s => s.country).filter(Boolean))].sort(); }, [data]);
    const regimes = useMemo(function() { return ['All', ...new Set(data.map(s => s.price_regime).filter(Boolean))].sort(); }, [data]);

    const filtered = useMemo(function() {
        return data
            .filter(function(s) {
                if (search) {
                    const q = search.toLowerCase();
                    if (!s.symbol.toLowerCase().includes(q) && !(s.name || '').toLowerCase().includes(q)) return false;
                }
                if (activeStyle !== 'All' && !(s.style_tags || []).includes(activeStyle)) return false;
                if (filters.sector !== 'All' && s.sector !== filters.sector) return false;
                if (filters.geo !== 'All' && s.country !== filters.geo) return false;
                if (filters.div === 'Yes' && (s.div_yield_pct || 0) <= 0) return false;
                if (filters.div === 'No' && (s.div_yield_pct || 0) > 0) return false;
                if (filters.regime !== 'All' && s.price_regime !== filters.regime) return false;
                if (filters.mcap !== 'All' && s.market_cap_bucket !== filters.mcap) return false;
                return true;
            })
            .sort(function(a, b) {
                const av = a[sort.col] != null ? a[sort.col] : (sort.asc ? Infinity : -Infinity);
                const bv = b[sort.col] != null ? b[sort.col] : (sort.asc ? Infinity : -Infinity);
                return sort.asc ? av - bv : bv - av;
            });
    }, [data, search, activeStyle, filters, sort]);

    function handleSort(col) {
        setSort(function(prev) { return { col, asc: prev.col === col ? !prev.asc : false }; });
    }
    function setFilter(key, val) {
        setFilters(function(prev) { return Object.assign({}, prev, { [key]: val }); });
    }
    function resetFilters() {
        setSearch('');
        setStyle('All');
        setFilters({ sector: 'All', geo: 'All', div: 'All', regime: 'All', mcap: 'All' });
    }

    const selStyle = {
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 5, color: 'rgba(255,255,255,0.8)',
        padding: '5px 10px', fontSize: 11,
        fontFamily: 'DM Mono, monospace', cursor: 'pointer', outline: 'none',
    };

    // ── Loading / error states ────────────────────────────────────────────────
    if (loading) {
        return h('div', { style: { padding: 60, textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13, fontFamily: 'DM Mono, monospace' } },
            universe === 'market' ? 'Fetching market data from Alpha Vantage…' : 'Loading screener data…'
        );
    }
    if (!sb && universe === 'portfolio') {
        return h('div', { style: { padding: 60, textAlign: 'center' } },
            h('div', { style: { fontSize: 24, marginBottom: 12, opacity: 0.3 } }, '◈'),
            h('div', { style: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 6 } }, 'Connect Supabase to load screener data')
        );
    }
    if (error) {
        return h('div', { style: { padding: 40, color: '#ef4444', fontSize: 13, fontFamily: 'DM Mono, monospace' } }, 'Error loading screener: ' + error);
    }
    if (data.length === 0 && universe === 'portfolio') {
        return h('div', { style: { padding: 60, textAlign: 'center' } },
            h('div', { style: { fontSize: 24, marginBottom: 12, opacity: 0.3 } }, '◈'),
            h('div', { style: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 6 } }, 'No positions in your portfolio yet'),
            h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.3)' } }, 'Add holdings via the portfolio sync function.')
        );
    }

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },

        // ── Header bar ────────────────────────────────────────────────────────
        h('div', {
            style: {
                padding: '14px 20px 12px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.2)',
                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }
        },
            h('div', null,
                h('div', { style: { fontSize: 13, fontWeight: 700, color: '#00d4ff', letterSpacing: 2, fontFamily: 'DM Mono, monospace' } }, '◈ VALUATION SCREENER'),
                h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 } }, 'Discover which companies to value next')
            ),
            // Universe toggle
            h(UniverseToggle, { universe, onChange: function(u) { setUniverse(u); resetFilters(); } }),
            h('div', { style: { flex: 1 } }),
            // Market mode info banner
            universe === 'market' && marketMeta && h('div', {
                style: { fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Mono, monospace', textAlign: 'right' }
            },
                (marketMeta.enriched || 0) + ' / ' + (marketMeta.total || 0) + ' enriched from Alpha Vantage'
                + (!marketMeta.hasKey ? ' · add ALPHA_VANTAGE_API_KEY to Vercel to load fundamentals' : '')
            ),
            // Search
            h('input', {
                type: 'text', value: search,
                onChange: function(e) { setSearch(e.target.value); },
                placeholder: 'Search ticker or name…',
                style: {
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6, color: '#fff',
                    padding: '7px 12px', fontSize: 12, width: 200,
                    outline: 'none', fontFamily: 'DM Mono, monospace',
                }
            }),
            h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' } },
                filtered.length + ' / ' + data.length + ' stocks'
            )
        ),

        // ── Style pill row ────────────────────────────────────────────────────
        h('div', { style: { padding: '12px 20px 8px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
            ALL_STYLES.map(function(style) {
                const active = activeStyle === style;
                const c = STYLE_COLORS[style];
                return h('button', {
                    key: style, onClick: function() { setStyle(style); },
                    style: {
                        background: active ? (c ? c.bg : 'rgba(0,212,255,0.15)') : 'rgba(255,255,255,0.04)',
                        border: '1px solid ' + (active ? (c ? c.border : 'rgba(0,212,255,0.4)') : 'rgba(255,255,255,0.1)'),
                        color: active ? (c ? c.text : '#00d4ff') : 'rgba(255,255,255,0.5)',
                        borderRadius: 20, padding: '5px 14px', fontSize: 11,
                        fontWeight: active ? 700 : 400, cursor: 'pointer',
                        fontFamily: 'DM Mono, monospace', letterSpacing: 0.5, transition: 'all 0.15s',
                    }
                }, style);
            })
        ),

        // ── Filter row ────────────────────────────────────────────────────────
        h('div', { style: { padding: '8px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
            h('span', { style: { fontSize: 9, letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', fontFamily: 'DM Mono, monospace' } }, 'Filter:'),
            h('select', { value: filters.sector, onChange: function(e) { setFilter('sector', e.target.value); }, style: selStyle },
                sectors.map(function(s) { return h('option', { key: s, value: s }, s === 'All' ? 'All sectors' : s); })
            ),
            h('select', { value: filters.geo, onChange: function(e) { setFilter('geo', e.target.value); }, style: selStyle },
                geos.map(function(g) { return h('option', { key: g, value: g }, g === 'All' ? 'All countries' : g); })
            ),
            h('select', { value: filters.div, onChange: function(e) { setFilter('div', e.target.value); }, style: selStyle },
                h('option', { value: 'All' }, 'All dividends'),
                h('option', { value: 'Yes' }, 'Dividend payers'),
                h('option', { value: 'No' }, 'No dividend')
            ),
            h('select', { value: filters.regime, onChange: function(e) { setFilter('regime', e.target.value); }, style: selStyle },
                regimes.map(function(r) { return h('option', { key: r, value: r }, r === 'All' ? 'All regimes' : r); })
            ),
            h('select', { value: filters.mcap, onChange: function(e) { setFilter('mcap', e.target.value); }, style: selStyle },
                h('option', { value: 'All' }, 'All caps'),
                h('option', { value: 'Mega' }, 'Mega cap'),
                h('option', { value: 'Large' }, 'Large cap'),
                h('option', { value: 'Mid' }, 'Mid cap'),
                h('option', { value: 'Small' }, 'Small cap')
            ),
            h('button', {
                onClick: resetFilters,
                style: Object.assign({}, selStyle, { color: 'rgba(255,255,255,0.4)', background: 'transparent', borderColor: 'transparent' })
            }, 'Reset')
        ),

        // ── Bucket strip ──────────────────────────────────────────────────────
        h('div', { style: { padding: '12px 20px 0' } },
            h(BucketStrip, { data, filters, activeStyle, onStyleClick: setStyle })
        ),

        // ── Table ─────────────────────────────────────────────────────────────
        h('div', { style: { flex: 1, overflowY: 'auto', overflowX: 'auto' } },
            filtered.length === 0
                ? h('div', { style: { padding: '40px 20px', textAlign: 'center' } },
                    h('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 10 } }, 'No stocks match your current filters.'),
                    h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.25)', marginBottom: 16 } }, 'Try broadening the sector or style selection.'),
                    h('button', {
                        onClick: resetFilters,
                        style: {
                            background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
                            color: '#00d4ff', borderRadius: 5, padding: '7px 20px',
                            fontSize: 12, cursor: 'pointer', fontFamily: 'DM Mono, monospace',
                        }
                    }, 'Reset filters')
                )
                : h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 1060 } },
                    h('thead', null,
                        h('tr', { style: { borderBottom: '1px solid rgba(255,255,255,0.08)' } },
                            h('th', { style: { padding: '8px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: 'DM Mono, monospace' } }, 'Company'),
                            h(SortableHeader, { label: 'Sector', col: 'sector', sort, onSort: handleSort, align: 'left' }),
                            h(SortableHeader, { label: 'Price', col: 'current_price', sort, onSort: handleSort }),
                            h(SortableHeader, { label: 'P/E', col: 'pe_ratio', sort, onSort: handleSort }),
                            h(SortableHeader, { label: 'EV/EBITDA', col: 'ev_ebitda', sort, onSort: handleSort }),
                            h(SortableHeader, { label: 'Div %', col: 'div_yield_pct', sort, onSort: handleSort }),
                            h('th', { style: { padding: '8px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: 'DM Mono, monospace' } }, 'RSI'),
                            h(SortableHeader, { label: '1M', col: 'return_1m_pct', sort, onSort: handleSort }),
                            h(SortableHeader, { label: '3M', col: 'return_3m_pct', sort, onSort: handleSort }),
                            h(SortableHeader, { label: 'YTD', col: 'return_ytd_pct', sort, onSort: handleSort }),
                            h('th', { style: { padding: '8px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: 'DM Mono, monospace' } }, 'Regime'),
                            h('th', { style: { padding: '8px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: 'DM Mono, monospace' } }, 'Style'),
                            h('th', { style: { padding: '8px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.08)', fontFamily: 'DM Mono, monospace' } }, 'Action')
                        )
                    ),
                    h('tbody', null,
                        filtered.map(function(s) { return h(ScreenerRow, { key: s.symbol, s, onNavigate }); })
                    )
                )
        )
    );
}
