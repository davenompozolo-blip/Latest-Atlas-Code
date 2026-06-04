import React from 'react';
import { sb } from './config.js';

const h = React.createElement;
const { useState, useEffect, useCallback, useRef } = React;

// inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('cortex-kf')) {
    const s = document.createElement('style');
    s.id = 'cortex-kf';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}';
    document.head.appendChild(s);
}

// ── Formatters (USD — international book traded via Alpaca) ────
const usd  = (v, d=0) => v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct  = (v, d=1) => v == null ? '—' : (v >= 0 ? '+' : '') + Number(v).toFixed(d) + '%';
const pctU = (v, d=1) => v == null ? '—' : Number(v).toFixed(d) + '%';   // unsigned
const num  = (v, d=2) => v == null ? '—' : Number(v).toFixed(d);
const n2   = (v) => v == null ? null : Number(v);

// ── Colour maps ───────────────────────────────────────────────
const CLASS_COL = {
    thesis: { fg: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.22)', glow: '0 0 18px rgba(59,130,246,0.18)', label: 'THESIS EXTENDER' },
    gap:    { fg: '#14b8a6', bg: 'rgba(20,184,166,0.09)',  border: 'rgba(20,184,166,0.22)', glow: '0 0 18px rgba(20,184,166,0.18)', label: 'GAP FILLER' },
    risk:   { fg: '#ef4444', bg: 'rgba(239,68,68,0.09)',   border: 'rgba(239,68,68,0.22)',  glow: '0 0 18px rgba(239,68,68,0.18)',  label: 'RISK FLAG' },
};
const FALLBACK_COL = { fg: 'var(--nx-text3)', bg: 'transparent', border: 'var(--nx-border)', glow: 'none', label: 'SIGNAL' };

const CONV_COL = {
    high:   { fg: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.22)'  },
    medium: { fg: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.22)' },
    low:    { fg: '#7e95b0', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)' },
};

// ── Supabase helpers ──────────────────────────────────────────
async function fetchSignals(classFilter = null) {
    if (!sb) return [];
    let q = sb.from('cortex_signals').select('*').eq('is_muted', false).order('relevance', { ascending: false });
    if (classFilter) q = q.eq('signal_class', classFilter);
    const { data, error } = await q;
    if (error) { console.error('cortex signals', error); return []; }
    return data || [];
}

async function fetchControls() {
    if (!sb) return [];
    const { data } = await sb.from('cortex_signal_controls').select('*');
    return data || [];
}

async function fetchHeldSymbols() {
    if (!sb) return [];
    const { data } = await sb.from('vw_risk_analysis').select('symbol');
    return (data || []).map(r => r.symbol);
}

async function saveControl(signal_class, patch) {
    if (!sb) return;
    const { error } = await sb.from('cortex_signal_controls')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('signal_class', signal_class);
    if (error) console.error('saveControl', error);
}

async function fetchWatchlist() {
    if (!sb) return [];
    const { data, error } = await sb.from('cortex_watchlist').select('*').order('sort_order');
    if (error) { console.error('watchlist', error); return []; }
    return data || [];
}

async function fetchScreener({ search } = {}) {
    if (!sb) return [];
    // Load the whole screenable universe once (≈2k rows) and filter client-side,
    // so the sector dropdown can be derived from the real (Finnhub) taxonomy.
    let q = sb.from('vw_cortex_screener')
        .select('symbol,name,sector,exchange,market_cap,ev_ebitda,rev_growth,net_margin,p_fcf,roic,roe,debt_equity,net_debt_ebitda,div_growth_5y,ret_1m');
    if (search) q = q.ilike('symbol', search + '%');
    q = q.order('symbol').limit(4000);
    const { data, error } = await q;
    if (error) { console.error('screener', error); return []; }
    return data || [];
}

async function fetchPretradeRisk(ticker) {
    if (!sb) return null;
    try {
        const { data, error } = await sb.functions.invoke('cortex_pretrade_risk', { body: { ticker } });
        if (error) throw error;
        return data;
    } catch (e) { console.error('pretrade risk', e); return null; }
}

async function runSignalEngine(opts = {}) {
    if (!sb) return null;
    try {
        const { data, error } = await sb.functions.invoke('generate_cortex_signals', { body: opts });
        if (error) throw error;
        return data;
    } catch (e) { console.error('signal engine', e); return null; }
}

// Helper: coerce jsonb fields that may arrive as strings
function asObject(v) {
    if (v == null) return {};
    if (typeof v === 'object') return v;
    try { const p = JSON.parse(v); return (p && typeof p === 'object') ? p : {}; } catch { return {}; }
}
function asArray(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
    return [];
}

// ── MarketRibbon (portfolio-state, USD) ───────────────────────
function MarketRibbon() {
    const [cells, setCells] = useState([]);

    useEffect(() => {
        if (!sb) return;
        async function load() {
            const { data: risk } = await sb.from('vw_risk_analysis').select('symbol,annual_vol,dollar_var_95_daily,weight');
            const { data: snap } = await sb.from('account_snapshots').select('equity,cash').order('as_of', { ascending: false }).limit(1);
            if (!risk || !snap?.[0]) return;

            const nav      = snap[0].equity || 0;
            const cash     = snap[0].cash   || 0;
            const totalVar = risk.reduce((s, r) => s + (r.dollar_var_95_daily || 0), 0);
            const wAvgVol  = risk.reduce((s, r) => s + (r.annual_vol || 0) * (r.weight || 0), 0) / 100;
            const n        = risk.length;
            const effN     = n > 0 ? 1 / risk.reduce((s, r) => s + Math.pow((r.weight||0)/100, 2), 0) : 0;
            const cashPct  = nav ? cash / nav * 100 : 0;
            const varPct   = nav ? Math.abs(totalVar) / nav * 100 : 0;

            setCells([
                { label: 'NAV',        value: usd(nav),                accent: null },
                { label: 'Cash',       value: usd(cash),               accent: cash < 0 ? '#ef4444' : '#22c55e' },
                { label: 'Positions',  value: n,                       accent: null },
                { label: 'Port Vol',   value: pct(wAvgVol * 100, 1),   accent: wAvgVol > 0.015 ? '#f59e0b' : null },
                { label: 'VaR 95 1D',  value: usd(Math.abs(totalVar)), accent: '#ef4444' },
                { label: 'VaR / NAV',  value: pct(varPct, 2),          accent: varPct > 3 ? '#ef4444' : varPct > 1.5 ? '#f59e0b' : null },
                { label: 'Cash / NAV', value: pct(cashPct, 1),         accent: cashPct < -10 ? '#ef4444' : cashPct < 0 ? '#f59e0b' : null },
                { label: 'Eff N',      value: num(effN, 1),            accent: effN < 10 ? '#f59e0b' : null },
            ]);
        }
        load();
    }, []);

    return h('div', { style: { flexShrink: 0 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '1px', background: 'var(--nx-border)' } },
            cells.map((c, i) => h('div', { key: i, style: { padding: '9px 14px', background: 'var(--nx-bg1)', display: 'flex', flexDirection: 'column', gap: 3 } },
                h('span', { style: { fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--nx-fb)' } }, c.label),
                h('span', { style: { fontSize: 14, fontFamily: 'var(--nx-fd)', fontWeight: 800, lineHeight: 1, color: c.accent || 'var(--nx-text)' } }, c.value)
            ))
        ),
        h('div', { style: { height: 2, background: 'linear-gradient(90deg,transparent,rgba(59,130,246,0.6),rgba(139,92,246,0.6),transparent)' } })
    );
}

// ── RelevanceBar (top-right of card) ──────────────────────────
function RelevanceBar({ value, colour }) {
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('span', { style: { fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--nx-fb)', fontWeight: 700 } }, 'Relevance'),
        h('span', { style: { fontSize: 12, fontWeight: 800, fontFamily: 'var(--nx-fd)', color: colour, minWidth: 20, textAlign: 'right' } }, value),
        h('div', { style: { width: 56, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' } },
            h('div', { style: { width: Math.min(100, value) + '%', height: '100%', background: colour, borderRadius: 2, boxShadow: '0 0 6px ' + colour } })
        )
    );
}

// ── MetricCell (the grid under a card title) ──────────────────
function MetricCell({ label, value, accent, sub }) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px', minWidth: 0 } },
        h('span', { style: { fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--nx-fb)', fontWeight: 700 } }, label),
        h('span', { style: { fontSize: 15, fontWeight: 800, fontFamily: 'var(--nx-fd)', lineHeight: 1, color: accent || 'var(--nx-text)' } }, value),
        sub && h('span', { style: { fontSize: 9, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)' } }, sub)
    );
}

// Build the per-class metric grid from setup_json
function buildMetrics(cls, setup, conv) {
    const convCell = { label: 'Conviction', value: (conv || 'low').toUpperCase(), accent: (CONV_COL[conv] || CONV_COL.low).fg };
    if (cls === 'thesis') {
        const from = n2(setup.theme_weight_from), to = n2(setup.theme_weight_to), size = n2(setup.suggested_size_pct), head = n2(setup.headroom_pct);
        return [
            { label: 'Theme Weight', value: (from!=null?pctU(from):'—') + (to!=null? ' → ' + pctU(to) : ''), accent: '#3b82f6' },
            { label: 'Suggested Size', value: size!=null ? pct(size) + ' NAV' : '—', accent: '#22c55e' },
            { label: 'Headroom', value: head!=null ? pctU(head) : '—', sub: 'to 25% ceiling' },
            convCell,
        ];
    }
    if (cls === 'gap') {
        const gap = n2(setup.gap_pct), cur = n2(setup.current_weight_pct), tgt = n2(setup.saa_target_pct), size = n2(setup.suggested_size_pct);
        return [
            { label: 'Active Weight', value: gap!=null ? pct(gap) : '—', accent: gap!=null && gap<0 ? '#ef4444' : '#14b8a6' },
            { label: 'To Target', value: size!=null ? pct(size) + ' NAV' : '—', accent: '#22c55e' },
            { label: 'SAA Target', value: tgt!=null ? pctU(tgt) : '—', sub: cur!=null ? 'now ' + pctU(cur) : null },
            convCell,
        ];
    }
    // risk
    const vshare = n2(setup.var_share_pct), vol = n2(setup.annual_vol_pct), trim = n2(setup.suggested_reduction_pct), w = n2(setup.portfolio_weight_pct);
    return [
        { label: 'VaR Share', value: vshare!=null ? pctU(vshare) : '—', accent: '#ef4444', sub: 'of portfolio VaR' },
        { label: 'Annual Vol', value: vol!=null ? pctU(vol) : '—', accent: vol!=null && vol>40 ? '#ef4444' : '#f59e0b' },
        { label: 'Suggested Trim', value: trim!=null ? '-' + pctU(trim) + ' NAV' : '—', accent: '#f59e0b', sub: w!=null ? 'from ' + pctU(w) : null },
        { label: 'Conviction', value: (conv || 'low').toUpperCase(), accent: (CONV_COL[conv] || CONV_COL.low).fg },
    ];
}

// ── CandidateChip ─────────────────────────────────────────────
function CandidateChip({ c, colour, onClick }) {
    const [hov, setHov] = useState(false);
    const cand = typeof c === 'string' ? { ticker: c } : c;
    const label = cand.ticker;
    return h('button', {
        onClick: () => onClick && onClick(cand),
        onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false),
        title: [cand.name, cand.sector].filter(Boolean).join(' · ') || '',
        style: {
            background: hov ? colour + '22' : 'rgba(255,255,255,0.03)',
            border: '1px solid ' + (hov ? colour + '66' : 'rgba(255,255,255,0.08)'),
            borderRadius: 4, padding: '3px 9px', fontSize: 11, fontWeight: 600,
            color: hov ? colour : 'var(--nx-text2)', cursor: 'pointer', fontFamily: 'var(--nx-fm)', transition: 'all 0.15s',
        }
    }, label);
}

// ── CandidateRow (per-name: identity, sizing, rationale, actions) ─────
function CandidateRow({ c, cc, cls, signalSize, onTradeClick, onValueClick, onTradeExec }) {
    const [hov, setHov] = useState(false);
    const sizePct = (c.suggested_size_pct != null ? Number(c.suggested_size_pct) : signalSize);
    const side = cls === 'risk' ? 'sell' : 'buy';
    const cand = { ...c, suggested_size_pct: sizePct, side };
    const why = c.why || c.rationale || null;
    const btn = (label, col, onClick) => h('button', {
        onClick,
        style: { padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--nx-fb)', borderRadius: 4, border: '1px solid ' + col + '55', background: col + '18', color: col, whiteSpace: 'nowrap' }
    }, label);
    return h('div', { onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false),
        style: { padding: '8px 10px', borderRadius: 7, border: '1px solid ' + (hov ? cc.border : 'rgba(255,255,255,0.06)'), background: hov ? cc.bg : 'rgba(255,255,255,0.015)', transition: 'all 0.15s' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { fontSize: 12, fontWeight: 800, fontFamily: 'var(--nx-fm)', color: cc.fg } }, cand.ticker),
            c.name && h('span', { style: { fontSize: 11, color: 'var(--nx-text2)', fontFamily: 'var(--nx-fb)' } }, c.name),
            c.sector && h('span', { style: { fontSize: 9, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)' } }, '· ' + c.sector),
            sizePct != null && h('span', { style: { marginLeft: 'auto', fontSize: 10, fontWeight: 700, fontFamily: 'var(--nx-fm)', color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 4, padding: '1px 7px' } },
                (side === 'sell' ? 'Trim ' : 'Size ') + sizePct.toFixed(1) + '% NAV')
        ),
        why && h('div', { style: { fontSize: 10.5, color: 'var(--nx-text2)', lineHeight: 1.5, marginTop: 5, fontFamily: 'var(--nx-fb)' } }, why),
        h('div', { style: { display: 'flex', gap: 5, marginTop: 7 } },
            btn('→ Risk',  cc.fg,     () => onTradeClick && onTradeClick(cand)),
            btn('Value',   '#8b5cf6', () => onValueClick && onValueClick(cand)),
            btn('Trade',   '#22c55e', () => onTradeExec  && onTradeExec(cand))
        )
    );
}

// ── SignalCard ────────────────────────────────────────────────
function SignalCard({ signal, onTradeClick, onValueClick, onMute, onTradeExec }) {
    const [expanded, setExpanded] = useState(false);
    const [hov, setHov] = useState(false);
    const cls   = signal.signal_class;
    const cc    = CLASS_COL[cls] || FALLBACK_COL;
    const conv  = (signal.conviction || 'low').toLowerCase();
    const cands = asArray(signal.candidates);
    const setup = asObject(signal.setup_json);
    const metrics = buildMetrics(cls, setup, conv);

    return h('div', {
        onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false),
        style: {
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid ' + (hov ? cc.border : 'rgba(255,255,255,0.06)'),
            borderRadius: 10, marginBottom: 12, overflow: 'hidden',
            boxShadow: hov ? cc.glow : 'none', transition: 'all 0.2s',
        }
    },
        // accent top strip
        h('div', { style: { height: 2, background: 'linear-gradient(90deg,' + cc.fg + ',transparent)' } }),

        h('div', { style: { padding: '14px 18px' } },
            // header: badge + relevance
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 } },
                h('span', { style: {
                    fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
                    padding: '3px 9px', borderRadius: 5, background: cc.bg, color: cc.fg, border: '1px solid ' + cc.border, fontFamily: 'var(--nx-fb)',
                } }, cc.label),
                h('span', { style: {
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    padding: '3px 8px', borderRadius: 5,
                    background: (CONV_COL[conv]||CONV_COL.low).bg, color: (CONV_COL[conv]||CONV_COL.low).fg,
                    border: '1px solid ' + (CONV_COL[conv]||CONV_COL.low).border, fontFamily: 'var(--nx-fb)',
                } }, conv + ' conviction'),
                h('div', { style: { marginLeft: 'auto' } }, h(RelevanceBar, { value: signal.relevance || 0, colour: cc.fg }))
            ),

            // title
            h('div', { style: { fontSize: 16, fontWeight: 800, color: 'var(--nx-text)', lineHeight: 1.3, marginBottom: 8, fontFamily: 'var(--nx-fd)' } }, signal.title),

            // thesis
            signal.thesis_md && h('div', { style: {
                fontSize: 12.5, color: 'var(--nx-text2)', lineHeight: 1.6, marginBottom: 12, fontFamily: 'var(--nx-fb)',
                display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            } }, signal.thesis_md),

            // metric grid
            h('div', { style: {
                display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1px',
                background: 'var(--nx-border)', border: '1px solid var(--nx-border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12,
            } },
                metrics.map((m, i) => h('div', { key: i, style: { background: 'var(--nx-bg1)' } }, h(MetricCell, m)))
            ),

            // sizing rationale (risk-budgeted conviction sizing)
            (cls === 'thesis' || cls === 'gap') && setup.sizing_rationale && h('div', { style: {
                fontSize: 9.5, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)', marginBottom: 12, marginTop: -4,
                display: 'flex', alignItems: 'center', gap: 6,
            } },
                h('span', { style: { fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: cc.fg, background: cc.bg, border: '1px solid ' + cc.border, borderRadius: 3, padding: '1px 5px' } }, 'Sizing'),
                h('span', null, setup.sizing_rationale)),

            // candidates — each with its name + (when present) per-candidate sizing & rationale
            cands.length > 0
                ? h('div', { style: { marginBottom: 12 } },
                    h('span', { style: { fontSize: 9, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--nx-fb)', fontWeight: 700, display: 'block', marginBottom: 6 } }, 'Candidates'),
                    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                        cands.slice(0, 6).map((c, i) => h(CandidateRow, { key: i, c, cc, cls, signalSize: n2(setup.suggested_size_pct), onTradeClick, onValueClick, onTradeExec })),
                        cands.length > 6 && h('span', { style: { fontSize: 10, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fm)' } }, '+' + (cands.length - 6) + ' more')
                    )
                )
                : h('div', { style: { fontSize: 10, color: 'var(--nx-text3)', fontStyle: 'italic', marginBottom: 12 } }, 'No candidate tickers for this signal yet.'),

            // actions
            h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                h('button', {
                    onClick: () => onMute && onMute(signal.id),
                    style: { padding: '6px 12px', fontSize: 11, fontWeight: 600, background: 'transparent', color: 'var(--nx-text3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--nx-fb)' } }, 'Mute'),
                signal.thesis_md && h('button', {
                    onClick: () => setExpanded(x => !x),
                    style: { marginLeft: 'auto', padding: '6px 10px', fontSize: 10, background: 'transparent', color: 'var(--nx-text3)', border: 'none', cursor: 'pointer', fontFamily: 'var(--nx-fb)' } }, expanded ? '▲ less' : '▼ more')
            )
        )
    );
}

// ── SignalFeed ────────────────────────────────────────────────
function SignalFeed({ signals, loading, classFilter, onClassFilter, onTradeClick, onValueClick, onMute, onRefresh, refreshing, onTradeExec }) {
    const CLASSES = ['all', 'thesis', 'gap', 'risk'];
    const filtered = classFilter === 'all' ? signals : signals.filter(s => s.signal_class === classFilter);
    const lastGen = signals.length > 0 ? signals[0].generated_at : null;
    const lastGenStr = lastGen ? new Date(lastGen).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

    return h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--nx-border)', background: 'rgba(255,255,255,0.01)', flexShrink: 0 } },
            h('span', { style: { fontSize: 9, color: 'var(--nx-text3)', marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--nx-fb)', fontWeight: 700 } }, 'Filter'),
            CLASSES.map(cls => {
                const active = classFilter === cls; const cc = CLASS_COL[cls];
                return h('button', { key: cls, onClick: () => onClassFilter(cls), style: {
                    padding: '4px 12px', fontSize: 10, borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--nx-fb)', fontWeight: active ? 700 : 500,
                    border: '1px solid ' + (active ? (cc ? cc.border : 'rgba(255,255,255,0.2)') : 'rgba(255,255,255,0.07)'),
                    background: active ? (cc ? cc.bg : 'rgba(255,255,255,0.07)') : 'transparent',
                    color: active ? (cc ? cc.fg : 'var(--nx-text)') : 'var(--nx-text3)',
                    boxShadow: active && cc ? cc.glow : 'none', letterSpacing: '0.04em', transition: 'all 0.15s',
                } }, cls.toUpperCase());
            }),
            h('span', { style: { marginLeft: 'auto', fontSize: 10, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fm)' } }, filtered.length + ' signal' + (filtered.length !== 1 ? 's' : '')),
            lastGenStr && h('span', { style: { fontSize: 9, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 6px' } }, 'Generated ' + lastGenStr),
            h('button', { onClick: onRefresh, disabled: refreshing, style: {
                marginLeft: 10, padding: '5px 14px', fontSize: 10, borderRadius: 5, cursor: refreshing ? 'not-allowed' : 'pointer',
                background: refreshing ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,' + (refreshing ? '0.15' : '0.35') + ')',
                color: refreshing ? 'var(--nx-text3)' : '#3b82f6', fontFamily: 'var(--nx-fb)', fontWeight: 700, letterSpacing: '0.04em',
            } }, refreshing ? '⟳  Running…' : '⟳  Run Engine')
        ),

        h('div', { style: { flex: 1, overflowY: 'auto', padding: '14px 16px' } },
            loading
                ? h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 12 } },
                    h('div', { style: { width: 32, height: 32, border: '2px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' } }),
                    h('span', { style: { color: 'var(--nx-text3)', fontSize: 12 } }, 'Loading signals…'))
                : filtered.length === 0
                    ? h('div', { style: { textAlign: 'center', padding: '60px 20px' } },
                        h('div', { style: { fontSize: 32, marginBottom: 12, opacity: 0.3 } }, '✦'),
                        h('div', { style: { color: 'var(--nx-text3)', fontSize: 13, fontFamily: 'var(--nx-fb)' } }, 'No signals in this view.'),
                        h('div', { style: { color: 'var(--nx-text3)', fontSize: 11, marginTop: 4 } }, 'Click "Run Engine" to generate.'))
                    : filtered.map(s => h(SignalCard, { key: s.id, signal: s, onTradeClick, onValueClick, onMute, onTradeExec }))
        )
    );
}

// ── Screener ──────────────────────────────────────────────────
const SCREENER_SECTORS = ['all', 'Technology', 'Healthcare', 'Financials', 'Energy', 'Materials', 'Consumer Discretionary', 'International', 'Fixed Income'];

function Screener({ onTradeClick, onValueClick, onEquityClick, onTradeExec }) {
    const [mode, setMode]     = useState('add');   // 'add' | 'trim'
    const [sector, setSector] = useState('all');
    const [search, setSearch] = useState('');
    const [rows, setRows]     = useState([]);
    const [loading, setLoading] = useState(true);
    const [held, setHeld]     = useState([]);
    const [sectorW, setSectorW] = useState({});

    // load held symbols + sector weights once
    useEffect(() => {
        if (!sb) return;
        fetchHeldSymbols().then(setHeld);
        sb.from('vw_portfolio_home').select('sector,portfolio_weight').then(({ data }) => {
            const agg = {};
            (data || []).forEach(r => { if (r.sector) agg[r.sector] = (agg[r.sector] || 0) + (r.portfolio_weight || 0); });
            setSectorW(agg);
        });
    }, []);

    useEffect(() => {
        if (!sb) return;
        let cancelled = false;
        setLoading(true);
        async function load() {
            if (mode === 'trim') {
                // Held book ranked by VaR / vol — trim candidates
                let q = sb.from('vw_risk_analysis')
                    .select('symbol,name,weight,annual_vol,dollar_var_95_daily,risk_tier')
                    .order('dollar_var_95_daily', { ascending: false }).limit(60);
                const { data } = await q;
                if (cancelled) return;
                let r = (data || []);
                if (search) r = r.filter(x => (x.symbol || '').toUpperCase().startsWith(search.toUpperCase()));
                setRows(r);
            } else {
                // Universe — addition ideas (not held)
                let q = sb.from('assets')
                    .select('symbol,name,sector,asset_class,exchange,currency')
                    .in('asset_class', ['Stock', 'us_equity', 'equity', 'etf'])
                    .order('symbol').limit(300);
                if (sector !== 'all') q = q.eq('sector', sector);
                if (search) q = q.ilike('symbol', search + '%');
                const { data } = await q;
                if (cancelled) return;
                const heldSet = new Set(held);
                const r = (data || []).filter(x => !heldSet.has(x.symbol)).slice(0, 80);
                setRows(r);
            }
            setLoading(false);
        }
        load();
        return () => { cancelled = true; };
    }, [mode, sector, search, held]);

    const fitFor = (sec) => {
        const w = sectorW[sec] || 0;
        return Math.max(0, Math.min(100, Math.round((0.25 - w) * 400)));   // portfolio_weight is a NAV fraction; 0.25 = 25% ceiling
    };

    const ACCENT = mode === 'trim' ? '#ef4444' : '#14b8a6';

    return h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
        // toolbar
        h('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--nx-border)', background: 'rgba(255,255,255,0.01)', flexShrink: 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
                h('span', { style: { fontSize: 11, fontWeight: 800, fontFamily: 'var(--nx-fd)', color: 'var(--nx-text)', letterSpacing: '0.04em' } }, 'IDEA SCREENER'),
                // mode presets
                [['add', 'Add Ideas', '#14b8a6'], ['trim', 'Trim Candidates', '#ef4444']].map(([m, label, col]) => {
                    const active = mode === m;
                    return h('button', { key: m, onClick: () => setMode(m), style: {
                        padding: '4px 12px', fontSize: 10, borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--nx-fb)', fontWeight: active ? 700 : 500,
                        border: '1px solid ' + (active ? col + '55' : 'rgba(255,255,255,0.07)'),
                        background: active ? col + '1e' : 'transparent', color: active ? col : 'var(--nx-text3)',
                        boxShadow: active ? '0 0 14px ' + col + '33' : 'none', letterSpacing: '0.04em',
                    } }, label);
                }),
                h('span', { style: { marginLeft: 'auto', fontSize: 10, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fm)' } }, rows.length + ' result' + (rows.length !== 1 ? 's' : ''))
            ),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('input', {
                    value: search, placeholder: 'Search ticker…', onChange: e => setSearch(e.target.value.toUpperCase()),
                    style: { width: 140, padding: '5px 10px', fontSize: 11, fontFamily: 'var(--nx-fm)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, color: 'var(--nx-text)' }
                }),
                mode === 'add' && h('select', {
                    value: sector, onChange: e => setSector(e.target.value),
                    style: { padding: '5px 10px', fontSize: 11, fontFamily: 'var(--nx-fb)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, color: 'var(--nx-text)' }
                }, SCREENER_SECTORS.map(s => h('option', { key: s, value: s }, s === 'all' ? 'All sectors' : s)))
            )
        ),

        // table
        h('div', { style: { flex: 1, overflowY: 'auto' } },
            loading
                ? h('div', { style: { display: 'flex', justifyContent: 'center', padding: '50px 0' } },
                    h('div', { style: { width: 28, height: 28, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' } }))
                : rows.length === 0
                    ? h('div', { style: { textAlign: 'center', padding: '50px', color: 'var(--nx-text3)', fontSize: 12 } }, 'No matches.')
                    : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--nx-fb)' } },
                        h('thead', null,
                            h('tr', { style: { position: 'sticky', top: 0, background: 'var(--nx-bg)', zIndex: 1 } },
                                (mode === 'trim'
                                    ? ['Ticker', 'Name', 'Weight', 'Annual Vol', 'VaR 95 1D', 'Tier', 'Actions']
                                    : ['Ticker', 'Name', 'Sector', 'Exchange', 'Portfolio Fit', 'Actions']
                                ).map((c, i, arr) => h('th', { key: i, style: { textAlign: i===0?'left':(i===arr.length-1?'right':i>=2?'right':'left'), padding: '8px 14px', fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, borderBottom: '1px solid var(--nx-border)' } }, c))
                            )
                        ),
                        h('tbody', null,
                            rows.map((r, i) => mode === 'trim'
                                ? h(TrimRow, { key: r.symbol + i, r, onTradeClick, onValueClick, onEquityClick, onTradeExec })
                                : h(AddRow,  { key: r.symbol + i, r, fit: fitFor(r.sector), onTradeClick, onValueClick, onEquityClick, onTradeExec })
                            )
                        )
                    )
        )
    );
}

function cellTd(content, opts = {}) {
    return h('td', { style: { padding: '9px 14px', fontSize: 11, color: opts.color || 'var(--nx-text2)', textAlign: opts.align || 'left', fontFamily: opts.mono ? 'var(--nx-fm)' : 'var(--nx-fb)', fontWeight: opts.weight || 400, borderBottom: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' } }, content);
}

// Shared mini action buttons for screener rows
function RowActions({ cand, hov, accent, onTradeClick, onValueClick, onEquityClick, onTradeExec }) {
    const btn = (label, col, onClick) => h('button', {
        onClick, title: label,
        style: { padding: '3px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--nx-fb)', borderRadius: 4, border: '1px solid ' + col + '44', background: hov ? col + '22' : 'rgba(255,255,255,0.03)', color: col, transition: 'all 0.12s', whiteSpace: 'nowrap' }
    }, label);
    return h('td', { style: { padding: '9px 10px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
        h('div', { style: { display: 'flex', gap: 5, justifyContent: 'flex-end', alignItems: 'center' } },
            btn('Risk',   accent,    () => onTradeClick  && onTradeClick(cand)),
            btn('Value',  '#8b5cf6', () => onValueClick  && onValueClick(cand)),
            btn('Equity', '#f59e0b', () => onEquityClick && onEquityClick(cand)),
            btn('Trade',  '#22c55e', () => onTradeExec   && onTradeExec(cand)),
        )
    );
}

function AddRow({ r, fit, onTradeClick, onValueClick, onEquityClick, onTradeExec }) {
    const [hov, setHov] = useState(false);
    const cand = { ticker: r.symbol, name: r.name, sector: r.sector };
    const fitCol = fit >= 60 ? '#22c55e' : fit >= 30 ? '#f59e0b' : 'var(--nx-text3)';
    return h('tr', { onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false), style: { background: hov ? 'rgba(20,184,166,0.04)' : 'transparent' } },
        cellTd(r.symbol, { color: '#14b8a6', weight: 700, mono: true }),
        cellTd(r.name || '—', { color: 'var(--nx-text2)' }),
        cellTd(r.sector || '—', { color: 'var(--nx-text3)' }),
        cellTd(r.exchange || '—', { color: 'var(--nx-text3)' }),
        h('td', { style: { padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
            h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' } },
                h('div', { style: { width: 40, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' } },
                    h('div', { style: { width: fit + '%', height: '100%', background: fitCol, borderRadius: 2 } })),
                h('span', { style: { fontSize: 11, fontFamily: 'var(--nx-fd)', fontWeight: 700, color: fitCol, minWidth: 18 } }, fit))),
        h(RowActions, { cand, hov, accent: '#14b8a6', onTradeClick, onValueClick, onEquityClick, onTradeExec })
    );
}

function TrimRow({ r, onTradeClick, onValueClick, onEquityClick, onTradeExec }) {
    const [hov, setHov] = useState(false);
    const vol = (r.annual_vol || 0) * 100;
    const cand = { ticker: r.symbol, name: r.name, sector: r.sector, side: 'sell' };
    return h('tr', { onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false), style: { background: hov ? 'rgba(239,68,68,0.04)' : 'transparent' } },
        cellTd(r.symbol, { color: '#ef4444', weight: 700, mono: true }),
        cellTd(r.name || '—', { color: 'var(--nx-text2)' }),
        cellTd(pctU(r.weight, 1), { align: 'right', mono: true, color: 'var(--nx-text)' }),
        cellTd(pctU(vol, 1), { align: 'right', mono: true, color: vol > 40 ? '#ef4444' : '#f59e0b' }),
        cellTd(usd(r.dollar_var_95_daily), { align: 'right', mono: true, color: '#ef4444' }),
        cellTd(r.risk_tier || '—', { align: 'right', color: 'var(--nx-text3)' }),
        h(RowActions, { cand, hov, accent: '#ef4444', onTradeClick, onValueClick, onEquityClick, onTradeExec })
    );
}

// ── Advanced Screener ─────────────────────────────────────────
// Preset strategy chips snap the filter bars to a strategy profile. Fundamentals
// come from vw_cortex_screener (Finnhub/AlphaVantage cache); rows with missing
// data show "—" and only fail a filter when that filter is actively engaged.
// Filter defaults — sentinels meaning "off"
const ADV_DEFAULTS = { mktCapMin: 0, sector: 'all', fcfMarginMin: null, revGrowthMin: null, roicMin: null, netDebtEbitdaMax: null, evEbitdaMax: null };

const ADV_PRESETS = [
    { key: 'ai_hw',     label: 'Quality AI Hardware',   sector: 'Technology', roicMin: 12, revGrowthMin: 15 },
    { key: 'hc_fill',   label: 'Healthcare fill SAA',   sector: 'Healthcare', fcfMarginMin: 8 },
    { key: 'deep_val',  label: 'Deep Value',            evEbitdaMax: 8, fcfMarginMin: 5 },
    { key: 'garp',      label: 'GARP',                  revGrowthMin: 10, roicMin: 10, evEbitdaMax: 18 },
    { key: 'fcf_yield', label: 'High FCF Yield',        fcfMarginMin: 15 },
    { key: 'mom_qual',  label: 'Momentum + Quality',    roicMin: 12 },
    { key: 'div_grow',  label: 'Dividend Growth',       fcfMarginMin: 10 },
];

function numCell(v, { suffix = '', d = 1, color, signed = false } = {}) {
    if (v == null || isNaN(Number(v))) return cellTd('—', { align: 'right', color: 'var(--nx-text3)', mono: true });
    const n = Number(v);
    const txt = (signed && n >= 0 ? '+' : '') + n.toFixed(d) + suffix;
    return cellTd(txt, { align: 'right', mono: true, color: color || 'var(--nx-text2)' });
}

function AdvancedRow({ r, fit, onTradeClick, onValueClick, onEquityClick, onTradeExec }) {
    const [hov, setHov] = useState(false);
    const cand = { ticker: r.symbol, name: r.name, sector: r.sector };
    const fitCol = fit >= 60 ? '#22c55e' : fit >= 30 ? '#f59e0b' : 'var(--nx-text3)';
    const retCol = r.ret_1m == null ? 'var(--nx-text3)' : r.ret_1m >= 0 ? '#22c55e' : '#ef4444';
    return h('tr', { onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false), style: { background: hov ? 'rgba(59,130,246,0.04)' : 'transparent' } },
        cellTd(r.symbol, { color: '#3b82f6', weight: 700, mono: true }),
        cellTd(r.name || '—', { color: 'var(--nx-text2)' }),
        cellTd(r.sector || '—', { color: 'var(--nx-text3)' }),
        numCell(r.ev_ebitda, { suffix: '×', color: 'var(--nx-text)' }),
        numCell(r.rev_growth, { suffix: '%', signed: true, color: r.rev_growth >= 0 ? '#22c55e' : '#ef4444' }),
        numCell(r.net_margin, { suffix: '%', color: 'var(--nx-text)' }),
        numCell(r.roic, { suffix: '%', color: r.roic >= 12 ? '#22c55e' : 'var(--nx-text)' }),
        numCell(r.ret_1m, { suffix: '%', signed: true, color: retCol }),
        h('td', { style: { padding: '9px 14px', textAlign: 'right', borderBottom: '1px solid rgba(255,255,255,0.04)' } },
            h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' } },
                h('div', { style: { width: 36, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' } },
                    h('div', { style: { width: fit + '%', height: '100%', background: fitCol, borderRadius: 2 } })),
                h('span', { style: { fontSize: 11, fontFamily: 'var(--nx-fd)', fontWeight: 700, color: fitCol, minWidth: 16 } }, fit))),
        h(RowActions, { cand, hov, accent: '#3b82f6', onTradeClick, onValueClick, onEquityClick, onTradeExec })
    );
}

function FilterField({ label, value, suffix, onChange, placeholder }) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
        h('span', { style: { fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--nx-fb)', fontWeight: 700 } }, label),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, padding: '3px 7px' } },
            h('input', { type: 'number', value: value == null ? '' : value, placeholder: placeholder || 'any',
                onChange: e => onChange(e.target.value === '' ? null : parseFloat(e.target.value)),
                style: { width: 46, background: 'transparent', border: 'none', color: 'var(--nx-text)', fontSize: 11, fontFamily: 'var(--nx-fm)', outline: 'none' } }),
            suffix && h('span', { style: { fontSize: 9, color: 'var(--nx-text3)' } }, suffix))
    );
}

function AdvancedScreener({ onTradeClick, onValueClick, onEquityClick, onTradeExec }) {
    const [filters, setFilters] = useState(ADV_DEFAULTS);
    const [activePreset, setActivePreset] = useState(null);
    const [search, setSearch]   = useState('');
    const [rows, setRows]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [sectorW, setSectorW] = useState({});
    const [showAdv, setShowAdv] = useState(false);

    useEffect(() => {
        if (!sb) return;
        sb.from('vw_portfolio_home').select('sector,portfolio_weight').then(({ data }) => {
            const agg = {};
            (data || []).forEach(r => { if (r.sector) agg[r.sector] = (agg[r.sector] || 0) + (r.portfolio_weight || 0); });
            setSectorW(agg);
        });
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchScreener({ search }).then(data => {
            if (cancelled) return;
            setRows(data);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [search]);

    // Sector options derived from the live data (Finnhub industry taxonomy)
    const sectorOptions = ['all', ...Array.from(new Set(rows.map(r => r.sector).filter(Boolean))).sort()];

    const applyPreset = (p) => {
        if (activePreset === p.key) { setActivePreset(null); setFilters(ADV_DEFAULTS); return; }
        setActivePreset(p.key);
        setFilters({ ...ADV_DEFAULTS,
            sector:          p.sector          ?? 'all',
            fcfMarginMin:    p.fcfMarginMin    ?? null,
            revGrowthMin:    p.revGrowthMin    ?? null,
            roicMin:         p.roicMin         ?? null,
            evEbitdaMax:     p.evEbitdaMax     ?? null,
            netDebtEbitdaMax: p.netDebtEbitdaMax ?? null,
        });
    };

    const setF = (patch) => { setFilters(f => ({ ...f, ...patch })); setActivePreset(null); };

    const fitFor = (sec) => {
        const w = sectorW[sec] || 0;
        return Math.max(0, Math.min(100, Math.round((0.25 - w) * 400)));
    };

    // Apply numeric filters client-side; null metric only fails an *engaged* filter
    const filtered = rows.filter(r => {
        if (filters.sector !== 'all' && r.sector !== filters.sector) return false;
        if (filters.mktCapMin && (r.market_cap == null || r.market_cap < filters.mktCapMin * 1e9)) return false;
        if (filters.fcfMarginMin != null) { if (r.net_margin == null || r.net_margin < filters.fcfMarginMin) return false; }
        if (filters.revGrowthMin != null) { if (r.rev_growth == null || r.rev_growth < filters.revGrowthMin) return false; }
        if (filters.roicMin != null)      { if (r.roic == null || r.roic < filters.roicMin) return false; }
        if (filters.evEbitdaMax != null)  { if (r.ev_ebitda == null || r.ev_ebitda > filters.evEbitdaMax) return false; }
        if (filters.netDebtEbitdaMax != null) { if (r.net_debt_ebitda == null || r.net_debt_ebitda > filters.netDebtEbitdaMax) return false; }
        return true;
    });
    // sort: portfolio fit desc, then 1M return desc
    const sorted = filtered.map(r => ({ r, fit: fitFor(r.sector) }))
        .sort((a, b) => (b.fit - a.fit) || ((b.r.ret_1m ?? -999) - (a.r.ret_1m ?? -999)))
        .slice(0, 120);

    const COL = '#3b82f6';
    return h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
        // toolbar
        h('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--nx-border)', background: 'rgba(255,255,255,0.01)', flexShrink: 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
                h('span', { style: { fontSize: 11, fontWeight: 800, fontFamily: 'var(--nx-fd)', color: 'var(--nx-text)', letterSpacing: '0.04em' } }, 'ADVANCED SCREENER'),
                h('span', { style: { marginLeft: 'auto', fontSize: 10, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fm)' } }, sorted.length + ' result' + (sorted.length !== 1 ? 's' : ''))
            ),
            // preset strategy chips
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 } },
                ADV_PRESETS.map(p => {
                    const active = activePreset === p.key;
                    return h('button', { key: p.key, onClick: () => applyPreset(p), style: {
                        padding: '4px 11px', fontSize: 10, borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--nx-fb)', fontWeight: active ? 700 : 500,
                        border: '1px solid ' + (active ? COL + '66' : 'rgba(255,255,255,0.09)'),
                        background: active ? COL + '1e' : 'rgba(255,255,255,0.02)', color: active ? COL : 'var(--nx-text2)',
                        boxShadow: active ? '0 0 14px ' + COL + '33' : 'none', letterSpacing: '0.02em', transition: 'all 0.15s',
                    } }, p.label);
                })
            ),
            // filter bars
            h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' } },
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
                    h('span', { style: { fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--nx-fb)', fontWeight: 700 } }, 'Search'),
                    h('input', { value: search, placeholder: 'Ticker…', onChange: e => setSearch(e.target.value.toUpperCase()),
                        style: { width: 100, padding: '4px 9px', fontSize: 11, fontFamily: 'var(--nx-fm)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, color: 'var(--nx-text)' } })),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
                    h('span', { style: { fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--nx-fb)', fontWeight: 700 } }, 'Sector'),
                    h('select', { value: filters.sector, onChange: e => setF({ sector: e.target.value }),
                        style: { padding: '4px 9px', fontSize: 11, fontFamily: 'var(--nx-fb)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, color: 'var(--nx-text)', maxWidth: 180 } },
                        sectorOptions.map(s => h('option', { key: s, value: s }, s === 'all' ? 'All sectors' : s)))),
                h(FilterField, { label: 'MktCap ≥', value: filters.mktCapMin || null, suffix: 'B', onChange: v => setF({ mktCapMin: v || 0 }) }),
                h(FilterField, { label: 'Rev Growth ≥', value: filters.revGrowthMin, suffix: '%', onChange: v => setF({ revGrowthMin: v }) }),
                h(FilterField, { label: 'Net Margin ≥', value: filters.fcfMarginMin, suffix: '%', onChange: v => setF({ fcfMarginMin: v }) }),
                h(FilterField, { label: 'ROIC ≥', value: filters.roicMin, suffix: '%', onChange: v => setF({ roicMin: v }) }),
                showAdv && h(FilterField, { label: 'EV/EBITDA ≤', value: filters.evEbitdaMax, suffix: '×', onChange: v => setF({ evEbitdaMax: v }) }),
                showAdv && h(FilterField, { label: 'Debt/Equity ≤', value: filters.netDebtEbitdaMax, suffix: '×', onChange: v => setF({ netDebtEbitdaMax: v }) }),
                h('button', { onClick: () => setShowAdv(x => !x), style: { padding: '5px 11px', fontSize: 10, fontWeight: 600, background: 'rgba(255,255,255,0.03)', color: 'var(--nx-text2)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--nx-fb)' } }, showAdv ? '− Advanced Filters' : '+ Advanced Filters'),
                (activePreset || filters.mktCapMin || filters.revGrowthMin != null || filters.fcfMarginMin != null || filters.roicMin != null || filters.evEbitdaMax != null || filters.netDebtEbitdaMax != null || filters.sector !== 'all')
                    && h('button', { onClick: () => { setFilters(ADV_DEFAULTS); setActivePreset(null); }, style: { padding: '5px 11px', fontSize: 10, fontWeight: 600, background: 'transparent', color: 'var(--nx-text3)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--nx-fb)' } }, 'Clear')
            )
        ),
        // table
        h('div', { style: { flex: 1, overflowY: 'auto' } },
            loading
                ? h('div', { style: { display: 'flex', justifyContent: 'center', padding: '50px 0' } },
                    h('div', { style: { width: 28, height: 28, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: COL, borderRadius: '50%', animation: 'spin 0.8s linear infinite' } }))
                : sorted.length === 0
                    ? h('div', { style: { textAlign: 'center', padding: '50px', color: 'var(--nx-text3)', fontSize: 12 } }, 'No matches for these filters.')
                    : h('table', { style: { width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--nx-fb)' } },
                        h('thead', null,
                            h('tr', { style: { position: 'sticky', top: 0, background: 'var(--nx-bg)', zIndex: 1 } },
                                ['Ticker', 'Name', 'Sector', 'EV/EBITDA', 'Rev Growth', 'Net Margin', 'ROIC', '1M', 'Portfolio Fit', 'Actions'].map((c, i) =>
                                    h('th', { key: i, style: { textAlign: i < 3 ? 'left' : 'right', padding: '8px 14px', fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, borderBottom: '1px solid var(--nx-border)', whiteSpace: 'nowrap' } }, c))
                            )
                        ),
                        h('tbody', null,
                            sorted.map(({ r, fit }, i) => h(AdvancedRow, { key: r.symbol + i, r, fit, onTradeClick, onValueClick, onEquityClick, onTradeExec }))
                        )
                    )
        )
    );
}

// ── PretradePanel ─────────────────────────────────────────────
function PretradePanel({ cand, onClose, onTradeExec }) {
    const ticker = typeof cand === 'string' ? cand : cand.ticker;
    const name   = typeof cand === 'string' ? null : cand.name;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pctStr, setPctStr] = useState(typeof cand === 'object' && cand.suggested_size_pct != null ? String(cand.suggested_size_pct) : '5');

    useEffect(() => { setLoading(true); fetchPretradeRisk(ticker).then(d => { setData(d); setLoading(false); }); }, [ticker]);

    const a = parseFloat(pctStr) / 100 || 0.05;
    let newVol = null, newVar = null, dVol = null, dVar = null;
    if (data) {
        const { sigma_p, sigma_c, cov_cp, total_nav } = data;
        const var_new = Math.pow(1-a,2)*sigma_p*sigma_p + Math.pow(a,2)*sigma_c*sigma_c + 2*a*(1-a)*cov_cp;
        newVol = Math.sqrt(var_new);
        newVar = 1.645 * newVol * (total_nav || 0);
        dVol = (newVol - sigma_p) * 100;
        dVar = newVar - data.var_95_daily_zar;
    }

    const row = (label, val, delta) => {
        const isPos = delta != null && delta > 0, isNeg = delta != null && delta < 0;
        return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' } },
            h('span', { style: { fontSize: 11, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)' } }, label),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                delta != null && h('span', { style: { fontSize: 10, fontWeight: 700, fontFamily: 'var(--nx-fm)', color: isPos ? '#ef4444' : isNeg ? '#22c55e' : 'var(--nx-text3)', background: isPos ? 'rgba(239,68,68,0.1)' : isNeg ? 'rgba(34,197,94,0.1)' : 'transparent', padding: '1px 5px', borderRadius: 3 } }, (delta > 0 ? '+' : '') + delta.toFixed(3) + '%'),
                h('span', { style: { fontSize: 12, color: 'var(--nx-text)', fontFamily: 'var(--nx-fm)', fontWeight: 600 } }, val)
            )
        );
    };
    const SectionHead = ({ label }) => h('div', { style: { fontSize: 9, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--nx-fb)', fontWeight: 700, marginBottom: 6, marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 } },
        h('div', { style: { flex: 1, height: 1, background: 'var(--nx-border)' } }), label, h('div', { style: { flex: 1, height: 1, background: 'var(--nx-border)' } }));

    return h('div', { style: { position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }, onClick: onClose },
        h('div', { onClick: e => e.stopPropagation(), style: { background: '#0a0d1a', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 12, padding: '22px 24px', width: 400, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 } },
                h('div', null,
                    h('div', { style: { fontSize: 9, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--nx-fb)', marginBottom: 3 } }, 'Pre-trade Risk Analysis'),
                    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                        h('span', { style: { fontSize: 17, fontWeight: 800, fontFamily: 'var(--nx-fd)', color: 'var(--nx-text)' } }, ticker),
                        name && h('span', { style: { fontSize: 12, color: 'var(--nx-text2)', fontFamily: 'var(--nx-fb)' } }, name))),
                h('button', { onClick: onClose, style: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--nx-text3)', cursor: 'pointer', fontSize: 14, width: 28, height: 28, borderRadius: 6 } }, '✕')),
            loading
                ? h('div', { style: { color: 'var(--nx-text3)', fontSize: 12, textAlign: 'center', padding: '24px 0' } }, 'Computing risk metrics…')
                : !data
                    ? h('div', { style: { color: '#ef4444', fontSize: 12 } }, 'Error fetching risk data.')
                    : h('div', null,
                        h('div', { style: { background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, padding: '12px 14px', marginBottom: 4 } },
                            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                                h('span', { style: { fontSize: 11, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)' } }, 'Allocation size'),
                                h('span', { style: { fontSize: 18, fontWeight: 800, fontFamily: 'var(--nx-fd)', color: '#3b82f6' } }, pctStr + '%')),
                            h('input', { type: 'range', min: 1, max: 20, value: pctStr, onChange: e => setPctStr(e.target.value), style: { width: '100%', accentColor: '#3b82f6' } })),
                        h(SectionHead, { label: 'Current Portfolio' }),
                        row('Daily Vol (σ)', pctU(data.sigma_p * 100, 3)),
                        row('VaR 95 1D', usd(data.var_95_daily_zar)),
                        row('Effective N', num(data.effective_n, 1)),
                        row('Observations', data.obs + ' days'),
                        h(SectionHead, { label: 'Candidate — ' + ticker }),
                        row('Daily Vol (σ)', pctU(data.sigma_c * 100, 3)),
                        row('Beta vs Portfolio', num(data.beta_c, 2)),
                        row('Sector', data.candidate_sector || '—'),
                        row('Sector Weight', pctU((data.candidate_sector_weight || 0) * 100, 1)),
                        newVol != null && h('div', null,
                            h(SectionHead, { label: 'Pro-forma @ ' + pctStr + '%' }),
                            row('New Port Vol (σ)', pctU(newVol * 100, 3), dVol),
                            row('New VaR 95 1D', usd(newVar)),
                            row('ΔVaR', usd(dVar))),
                        h('div', { style: { marginTop: 16, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: 10, color: 'var(--nx-text3)', lineHeight: 1.6, borderLeft: '2px solid rgba(255,255,255,0.06)' } },
                            'Parametric normal, 95% CI, 1D horizon, USD. Covariance from last ', h('strong', { style: { color: 'var(--nx-text2)' } }, data.obs + ' trading days'), ' of common price history.'),
                        onTradeExec && h('button', {
                            onClick: () => onTradeExec({ ticker, name, suggested_size_pct: parseFloat(pctStr) || undefined, side: 'buy' }),
                            style: { marginTop: 14, width: '100%', padding: '10px', fontSize: 12, fontWeight: 700, background: '#22c55e', color: '#04140a', border: 'none', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--nx-fb)', letterSpacing: '0.03em' } },
                            'Proceed to Trade ' + ticker + ' @ ' + pctStr + '% NAV →'))
        )
    );
}

// ── TradeTicket (adjust quantum + execute via Alpaca) ─────────
async function fetchNav() {
    if (!sb) return 0;
    const { data } = await sb.from('account_snapshots').select('equity').order('as_of', { ascending: false }).limit(1);
    return data?.[0]?.equity || 0;
}
async function fetchQuote(ticker) {
    try {
        const r = await fetch('/api/trading?action=quote&symbol=' + encodeURIComponent(ticker));
        const j = await r.json();
        return j.price ?? j.last ?? j.ask ?? j.bid ?? null;
    } catch { return null; }
}

function TradeTicket({ cand, onClose, onDone }) {
    const ticker = cand.ticker;
    const [side, setSide]     = useState(cand.side === 'sell' ? 'sell' : 'buy');
    const [mode, setMode]     = useState('notional');   // 'notional' | 'shares'
    const [nav, setNav]       = useState(0);
    const [price, setPrice]   = useState(null);
    const [amount, setAmount] = useState('');           // the quantum the user edits
    const [busy, setBusy]     = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        let live = true;
        fetchNav().then(v => { if (live) setNav(v); });
        fetchQuote(ticker).then(p => { if (live) setPrice(p); });
        return () => { live = false; };
    }, [ticker]);

    // Initialise notional from suggested size once NAV is known
    useEffect(() => {
        if (nav > 0 && amount === '' && mode === 'notional') {
            const sz = cand.suggested_size_pct != null ? Number(cand.suggested_size_pct) : 2;
            setAmount(String(Math.round(nav * sz / 100)));
        }
    }, [nav]);

    const amt = parseFloat(amount) || 0;
    const estShares   = mode === 'notional' ? (price ? amt / price : null) : amt;
    const estNotional = mode === 'notional' ? amt : (price ? amt * price : null);
    const navPct = nav > 0 && estNotional != null ? (estNotional / nav * 100) : null;

    const setPct = (p) => { if (nav > 0) { setMode('notional'); setAmount(String(Math.round(nav * p / 100))); } };

    function submit() {
        setBusy(true); setResult(null);
        const body = { symbol: ticker, side, type: 'market', tif: 'day' };
        if (mode === 'notional') body.notional = Math.round(amt * 100) / 100;
        else body.qty = Math.round(amt * 10000) / 10000;
        fetch('/api/trading?action=order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            .then(r => r.json())
            .then(j => {
                // API wraps the Alpaca response under j.order — unwrap it so success checks work
                const r = (j && j.order) ? { ...j.order, success: j.success } : j;
                setResult(r);
                setBusy(false); setConfirm(false);
                if (r && (r.id || r.status === 'accepted' || r.success) && onDone) onDone();
            })
            .catch(e => { setResult({ success: false, error: e.message }); setBusy(false); setConfirm(false); });
    }

    const sideCol = side === 'buy' ? '#22c55e' : '#ef4444';
    const inputStyle = { flex: 1, padding: '8px 11px', fontSize: 14, fontFamily: 'var(--nx-fm)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'var(--nx-text)', outline: 'none' };

    return h('div', { style: { position: 'fixed', inset: 0, zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)' }, onClick: onClose },
        h('div', { onClick: e => e.stopPropagation(), style: { background: '#080b15', border: '1px solid ' + sideCol + '44', borderRadius: 12, padding: '22px 24px', width: 400, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' } },
            // header
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 } },
                h('div', null,
                    h('div', { style: { fontSize: 9, color: sideCol, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--nx-fb)', marginBottom: 3 } }, 'Trade Ticket'),
                    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 } },
                        h('span', { style: { fontSize: 18, fontWeight: 800, fontFamily: 'var(--nx-fd)', color: 'var(--nx-text)' } }, ticker),
                        cand.name && h('span', { style: { fontSize: 12, color: 'var(--nx-text2)' } }, cand.name))),
                h('button', { onClick: onClose, style: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--nx-text3)', cursor: 'pointer', fontSize: 14, width: 28, height: 28, borderRadius: 6 } }, '✕')),

            // buy/sell + context
            h('div', { style: { display: 'flex', gap: 6, marginBottom: 14 } },
                ['buy', 'sell'].map(s => h('button', { key: s, onClick: () => setSide(s), style: {
                    flex: 1, padding: '7px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', fontFamily: 'var(--nx-fb)', borderRadius: 6,
                    border: '1px solid ' + (side === s ? (s === 'buy' ? '#22c55e' : '#ef4444') + '88' : 'rgba(255,255,255,0.1)'),
                    background: side === s ? (s === 'buy' ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)') : 'transparent',
                    color: side === s ? (s === 'buy' ? '#22c55e' : '#ef4444') : 'var(--nx-text3)',
                } }, s))),

            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)', marginBottom: 12 } },
                h('span', null, 'Last ', h('strong', { style: { color: 'var(--nx-text)', fontFamily: 'var(--nx-fm)' } }, price != null ? usd(price, 2) : '—')),
                h('span', null, 'NAV ', h('strong', { style: { color: 'var(--nx-text)', fontFamily: 'var(--nx-fm)' } }, usd(nav)))),

            // mode toggle
            h('div', { style: { display: 'flex', gap: 6, marginBottom: 8 } },
                [['notional', 'Notional ($)'], ['shares', 'Shares']].map(([m, lbl]) => h('button', { key: m, onClick: () => { setMode(m); setAmount(''); }, style: {
                    flex: 1, padding: '5px', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--nx-fb)', borderRadius: 5,
                    border: '1px solid ' + (mode === m ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)'),
                    background: mode === m ? 'rgba(59,130,246,0.14)' : 'transparent', color: mode === m ? '#3b82f6' : 'var(--nx-text3)',
                } }, lbl))),

            // quantum input
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 } },
                mode === 'notional' && h('span', { style: { fontSize: 14, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fm)' } }, '$'),
                h('input', { type: 'number', value: amount, placeholder: mode === 'notional' ? 'amount' : 'shares', onChange: e => setAmount(e.target.value), style: inputStyle })),

            // % NAV quick buttons
            h('div', { style: { display: 'flex', gap: 5, marginBottom: 10 } },
                [1, 2, 3, 5].map(p => h('button', { key: p, onClick: () => setPct(p), style: {
                    flex: 1, padding: '4px', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--nx-fb)', borderRadius: 4,
                    border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)', color: 'var(--nx-text2)',
                } }, p + '%'))),

            // estimate line
            h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11, fontFamily: 'var(--nx-fm)', color: 'var(--nx-text2)', padding: '9px 11px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, marginBottom: 14 } },
                h('span', null, '≈ ', estShares != null ? num(estShares, 2) + ' sh' : '—'),
                h('span', null, estNotional != null ? usd(estNotional) : '—'),
                h('span', { style: { color: navPct != null && navPct > 5 ? '#f59e0b' : 'var(--nx-text3)' } }, navPct != null ? navPct.toFixed(1) + '% NAV' : '')),

            // result / confirm / submit
            result
                ? h('div', { style: { padding: '12px', borderRadius: 7, fontSize: 12, fontFamily: 'var(--nx-fb)', background: (result.id || result.status) ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: '1px solid ' + ((result.id || result.status) ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'), color: (result.id || result.status) ? '#22c55e' : '#ef4444' } },
                    (result.id || result.status)
                        ? '✓ Order ' + (result.status || 'submitted') + (result.id ? ' · ' + String(result.id).slice(0, 8) : '')
                        : '✗ ' + (result.error || 'Order failed'))
                : confirm
                    ? h('div', { style: { display: 'flex', gap: 8 } },
                        h('button', { onClick: submit, disabled: busy, style: { flex: 2, padding: '11px', fontSize: 12, fontWeight: 800, background: sideCol, color: '#04140a', border: 'none', borderRadius: 7, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--nx-fb)', textTransform: 'uppercase', letterSpacing: '0.05em' } },
                            busy ? 'Submitting…' : 'Confirm ' + side + ' ' + ticker),
                        h('button', { onClick: () => setConfirm(false), disabled: busy, style: { flex: 1, padding: '11px', fontSize: 11, background: 'transparent', color: 'var(--nx-text3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, cursor: 'pointer', fontFamily: 'var(--nx-fb)' } }, 'Back'))
                    : h('button', { onClick: () => setConfirm(true), disabled: !(amt > 0), style: { width: '100%', padding: '11px', fontSize: 12, fontWeight: 700, background: amt > 0 ? sideCol : 'rgba(255,255,255,0.06)', color: amt > 0 ? '#04140a' : 'var(--nx-text3)', border: 'none', borderRadius: 7, cursor: amt > 0 ? 'pointer' : 'not-allowed', fontFamily: 'var(--nx-fb)', textTransform: 'uppercase', letterSpacing: '0.05em' } },
                        'Review ' + side + ' order'),

            h('div', { style: { marginTop: 12, fontSize: 9, color: 'var(--nx-text3)', textAlign: 'center', lineHeight: 1.5 } },
                'Market order · day · routed to Alpaca' + (cand.suggested_size_pct != null ? ' · suggested ' + Number(cand.suggested_size_pct).toFixed(1) + '% NAV' : ''))
        )
    );
}

// ── RightRail ─────────────────────────────────────────────────
function ExposureSnapshot() {
    const [rows, setRows] = useState([]);
    useEffect(() => {
        if (!sb) return;
        sb.from('vw_portfolio_home').select('symbol,portfolio_weight,annualised_vol,sector').order('portfolio_weight', { ascending: false }).limit(10).then(({ data }) => setRows(data || []));
    }, []);
    const maxW = rows.length ? Math.max(...rows.map(r => r.portfolio_weight || 0)) : 1;
    return h('div', null,
        h('div', { style: { fontSize: 9, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--nx-fb)', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 } },
            h('div', { style: { width: 14, height: 1, background: 'var(--nx-border-md)' } }), 'Top Exposures', h('div', { style: { flex: 1, height: 1, background: 'var(--nx-border)' } })),
        rows.map(r => h('div', { key: r.symbol, style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }, onClick: () => window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol: r.symbol } })) },
            h('span', { style: { fontSize: 10, color: 'var(--nx-text2)', minWidth: 44, fontFamily: 'var(--nx-fm)', fontWeight: 600 } }, r.symbol),
            h('div', { style: { flex: 1, height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' } },
                h('div', { style: { width: Math.min(100, (r.portfolio_weight || 0) / maxW * 100) + '%', height: '100%', background: 'linear-gradient(90deg,rgba(59,130,246,0.7),rgba(59,130,246,1))', borderRadius: 3 } })),
            h('span', { style: { fontSize: 10, color: 'var(--nx-text3)', minWidth: 34, textAlign: 'right', fontFamily: 'var(--nx-fm)' } }, pct(r.portfolio_weight, 1))))
    );
}

const CLASS_LABELS = { thesis: 'THESIS Extenders', gap: 'GAP Fillers', risk: 'RISK Flags' };
const CLASS_ORDER  = ['thesis', 'gap', 'risk'];

function SignalControls({ onChange }) {
    const [controls, setControls] = useState([]);
    const [saving, setSaving]     = useState(null);

    useEffect(() => { fetchControls().then(rows => {
        const byClass = {};
        rows.forEach(r => { byClass[r.signal_class] = r; });
        setControls(CLASS_ORDER.map(cls => byClass[cls] || { signal_class: cls, enabled: true, feed_weight: 0.5 }));
    }); }, []);

    const update = useCallback((cls, patch) => {
        setControls(cs => cs.map(c => c.signal_class === cls ? { ...c, ...patch } : c));
    }, []);

    const persist = useCallback(async (cls, patch) => {
        setSaving(cls);
        await saveControl(cls, patch);
        setSaving(null);
        if (onChange) onChange();
    }, [onChange]);

    if (!controls.length) return null;

    return h('div', null,
        h('div', { style: { fontSize: 9, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--nx-fb)', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 } },
            h('div', { style: { width: 14, height: 1, background: 'var(--nx-border-md)' } }), 'Signal Controls', h('div', { style: { flex: 1, height: 1, background: 'var(--nx-border)' } })),
        controls.map(c => {
            const cc = CLASS_COL[c.signal_class]; const fg = cc ? cc.fg : 'var(--nx-text3)';
            const fw = Number(c.feed_weight ?? 0.5);
            return h('div', { key: c.signal_class, style: { marginBottom: 8, padding: '9px 11px', background: c.enabled ? (cc ? cc.bg : 'rgba(255,255,255,0.03)') : 'rgba(255,255,255,0.01)', border: '1px solid ' + (c.enabled ? (cc ? cc.border : 'rgba(255,255,255,0.08)') : 'rgba(255,255,255,0.04)'), borderRadius: 7, transition: 'all 0.2s' } },
                // header row: dot + label + toggle
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                    h('div', { style: { width: 7, height: 7, borderRadius: '50%', background: c.enabled ? fg : 'rgba(255,255,255,0.12)', boxShadow: c.enabled ? '0 0 6px ' + fg : 'none', animation: c.enabled ? 'pulse 2.5s ease-in-out infinite' : 'none', flexShrink: 0 } }),
                    h('span', { style: { flex: 1, fontSize: 11, fontFamily: 'var(--nx-fb)', fontWeight: 600, color: c.enabled ? 'var(--nx-text)' : 'var(--nx-text3)' } }, CLASS_LABELS[c.signal_class] || (c.signal_class || '').toUpperCase()),
                    // toggle switch
                    h('button', {
                        onClick: () => { const nv = !c.enabled; update(c.signal_class, { enabled: nv }); persist(c.signal_class, { enabled: nv }); },
                        title: c.enabled ? 'Enabled — click to mute class' : 'Muted — click to enable',
                        style: { width: 32, height: 18, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative', background: c.enabled ? fg : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0, padding: 0 }
                    }, h('div', { style: { position: 'absolute', top: 2, left: c.enabled ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' } }))
                ),
                // feed weight slider
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, opacity: c.enabled ? 1 : 0.4 } },
                    h('span', { style: { fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 38 } }, 'Feed Wt'),
                    h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: fw, disabled: !c.enabled,
                        onChange: e => update(c.signal_class, { feed_weight: parseFloat(e.target.value) }),
                        onMouseUp: e => persist(c.signal_class, { feed_weight: parseFloat(e.target.value) }),
                        onTouchEnd: e => persist(c.signal_class, { feed_weight: parseFloat(e.target.value) }),
                        style: { flex: 1, accentColor: fg, cursor: c.enabled ? 'pointer' : 'not-allowed' } }),
                    h('span', { style: { fontSize: 11, fontFamily: 'var(--nx-fm)', fontWeight: 700, color: c.enabled ? fg : 'var(--nx-text3)', minWidth: 28, textAlign: 'right' } }, fw.toFixed(2)),
                    saving === c.signal_class && h('span', { style: { fontSize: 8, color: 'var(--nx-text3)' } }, '⟳')
                )
            );
        })
    );
}

// ── Watchlist · Pinned ────────────────────────────────────────
const WATCH_STATUS = {
    active:    { fg: '#22c55e', label: 'Active' },
    stale:     { fg: '#ef4444', label: 'Stale'  },
    candidate: { fg: '#3b82f6', label: 'Candidate' },
};

function WatchlistPanel({ onTradeClick }) {
    const [rows, setRows] = useState([]);
    useEffect(() => { fetchWatchlist().then(setRows); }, []);
    if (!rows.length) return null;
    return h('div', null,
        h('div', { style: { fontSize: 9, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--nx-fb)', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 } },
            h('div', { style: { width: 14, height: 1, background: 'var(--nx-border-md)' } }), 'Watchlist · Pinned', h('div', { style: { flex: 1, height: 1, background: 'var(--nx-border)' } })),
        rows.map(r => {
            const st = WATCH_STATUS[r.status] || WATCH_STATUS.candidate;
            return h('div', { key: r.id || r.symbol, onClick: () => onTradeClick && onTradeClick(r.symbol),
                style: { marginBottom: 7, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s' } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
                    h('div', { style: { width: 7, height: 7, borderRadius: '50%', background: st.fg, boxShadow: '0 0 6px ' + st.fg, flexShrink: 0 } }),
                    h('span', { style: { fontSize: 12, fontFamily: 'var(--nx-fm)', fontWeight: 700, color: 'var(--nx-text)' } }, r.symbol),
                    h('span', { style: { marginLeft: 'auto', fontSize: 8, fontFamily: 'var(--nx-fb)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: st.fg, background: st.fg + '1c', border: '1px solid ' + st.fg + '33', borderRadius: 4, padding: '1px 6px' } }, st.label)
                ),
                r.note && h('div', { style: { fontSize: 9.5, color: 'var(--nx-text3)', lineHeight: 1.45, marginTop: 5, fontFamily: 'var(--nx-fb)' } }, r.note)
            );
        })
    );
}

function RightRail({ onControlsChange, onTradeClick }) {
    return h('div', { style: { width: 248, flexShrink: 0, borderLeft: '1px solid var(--nx-border)', padding: '16px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, background: 'rgba(255,255,255,0.006)' } },
        h(SignalControls, { onChange: onControlsChange }),
        h(WatchlistPanel, { onTradeClick }),
        h(ExposureSnapshot));
}

// ── Toast ─────────────────────────────────────────────────────
function Toast({ message, onDone }) {
    useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [message]);
    return h('div', { style: { position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: '#0d1a2e', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, padding: '12px 18px', fontSize: 12, color: 'var(--nx-text)', fontFamily: 'var(--nx-fb)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 320 } },
        h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', flexShrink: 0 } }), message);
}

// ── CortexPage ────────────────────────────────────────────────
function CortexPage() {
    const [view,        setView]        = useState('signals');  // 'signals' | 'screener' | 'advanced'
    const [signals,     setSignals]     = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [classFilter, setClassFilter] = useState('all');
    const [refreshing,  setRefreshing]  = useState(false);
    const [pretradeFor, setPretradeFor] = useState(null);
    const [tradeFor,    setTradeFor]    = useState(null);
    const [toast,       setToast]       = useState(null);
    const [controls,    setControls]    = useState({});  // signal_class → { enabled, feed_weight }

    const loadSignals = useCallback(async () => {
        setLoading(true);
        setSignals(await fetchSignals());
        setLoading(false);
    }, []);

    const loadControls = useCallback(async () => {
        const rows = await fetchControls();
        const map = {};
        rows.forEach(r => { map[r.signal_class] = { enabled: r.enabled, feed_weight: Number(r.feed_weight ?? 0.5) }; });
        setControls(map);
    }, []);

    useEffect(() => { loadSignals(); loadControls(); }, []);

    // Apply Signal Controls: drop muted classes, weight ordering by feed_weight
    const effectiveSignals = signals
        .filter(s => controls[s.signal_class]?.enabled !== false)
        .map(s => ({ s, score: (s.relevance || 0) * (controls[s.signal_class]?.feed_weight ?? 0.5) }))
        .sort((a, b) => b.score - a.score)
        .map(x => x.s);

    async function handleRunEngine() {
        setRefreshing(true);
        const result = await runSignalEngine({});
        setRefreshing(false);
        if (result) {
            const b = result.breakdown || {};
            setToast('Engine complete — ' + (result.inserted || 0) + ' signals (' + (b.thesis||0) + ' thesis · ' + (b.gap||0) + ' gap · ' + (b.risk||0) + ' risk).');
            loadSignals();
        } else {
            setToast('Engine error — check Edge Function logs.');
        }
    }

    async function handleMute(id) {
        if (!sb) return;
        await sb.from('cortex_signals').update({ is_muted: true }).eq('id', id);
        setSignals(s => s.filter(x => x.id !== id));
    }

    const tk = c => (typeof c === 'string' ? c : c && c.ticker);
    const onValueClick  = c => window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'valuation', symbol: tk(c) } }));
    const onEquityClick = c => window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity',    symbol: tk(c) } }));
    const onTradeExec   = c => setTradeFor(typeof c === 'string' ? { ticker: c } : c);

    const TabBtn = ({ id, label }) => {
        const active = view === id;
        return h('button', { onClick: () => setView(id), style: {
            padding: '6px 16px', fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--nx-fb)',
            background: 'transparent', border: 'none', borderBottom: '2px solid ' + (active ? '#3b82f6' : 'transparent'),
            color: active ? 'var(--nx-text)' : 'var(--nx-text3)', letterSpacing: '0.04em',
        } }, label);
    };

    return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--nx-bg)', color: 'var(--nx-text)', fontFamily: 'var(--nx-fb)' } },
        // header
        h('div', { style: { padding: '14px 20px 0', borderBottom: '1px solid var(--nx-border)', flexShrink: 0 } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 } },
                h('div', null,
                    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10 } },
                        h('span', { style: { fontSize: 18, fontWeight: 900, letterSpacing: '0.06em', fontFamily: 'var(--nx-fd)', color: 'var(--nx-text)' } }, 'CORTEX'),
                        h('span', { style: { fontSize: 9, color: 'rgba(59,130,246,0.8)', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 } }, 'LIVE')),
                    h('div', { style: { fontSize: 10, color: 'var(--nx-text3)', marginTop: 1 } }, 'Signal & Idea Engine · USD · via Alpaca'))
            ),
            h('div', { style: { display: 'flex', gap: 4 } },
                h(TabBtn, { id: 'signals', label: 'SIGNAL FEED' }),
                h(TabBtn, { id: 'screener', label: 'IDEA SCREENER' }),
                h(TabBtn, { id: 'advanced', label: 'ADVANCED SCREENER' }))
        ),

        h(MarketRibbon),

        h('div', { style: { flex: 1, display: 'flex', overflow: 'hidden' } },
            view === 'signals'
                ? h(SignalFeed, { signals: effectiveSignals, loading, classFilter, onClassFilter: setClassFilter, onTradeClick: setPretradeFor, onValueClick, onMute: handleMute, onRefresh: handleRunEngine, refreshing, onTradeExec })
                : view === 'advanced'
                    ? h(AdvancedScreener, { onTradeClick: setPretradeFor, onValueClick, onEquityClick, onTradeExec })
                    : h(Screener, { onTradeClick: setPretradeFor, onValueClick, onEquityClick, onTradeExec }),
            h(RightRail, { onControlsChange: loadControls, onTradeClick: setPretradeFor })
        ),

        pretradeFor && h(PretradePanel, { cand: pretradeFor, onClose: () => setPretradeFor(null), onTradeExec: c => { setPretradeFor(null); onTradeExec(c); } }),
        tradeFor && h(TradeTicket, { cand: tradeFor, onClose: () => setTradeFor(null), onDone: () => setToast('Order submitted for ' + tradeFor.ticker + '.') }),
        toast && h(Toast, { message: toast, onDone: () => setToast(null) })
    );
}

export { CortexPage };
