import React from 'react';
import { sb } from './config.js';

const h = React.createElement;
const { useState, useEffect, useCallback, useRef } = React;

// inject spin keyframe once
if (typeof document !== 'undefined' && !document.getElementById('cortex-kf')) {
    const s = document.createElement('style');
    s.id = 'cortex-kf';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
}

// ── Formatters ────────────────────────────────────────────────
const pct  = (v, d=1) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d) + '%';
const usd  = (v, d=0) => v == null ? '—' : 'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: d, maximumFractionDigits: d });
const num  = (v, d=2) => v == null ? '—' : Number(v).toFixed(d);

// ── Colour maps ───────────────────────────────────────────────
const CLASS_COL = {
    thesis: { fg: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.22)', glow: '0 0 18px rgba(59,130,246,0.18)' },
    gap:    { fg: '#14b8a6', bg: 'rgba(20,184,166,0.09)',  border: 'rgba(20,184,166,0.22)', glow: '0 0 18px rgba(20,184,166,0.18)' },
    risk:   { fg: '#ef4444', bg: 'rgba(239,68,68,0.09)',   border: 'rgba(239,68,68,0.22)',  glow: '0 0 18px rgba(239,68,68,0.18)'  },
};
const FALLBACK_COL = { fg: 'var(--nx-text3)', bg: 'transparent', border: 'var(--nx-border)', glow: 'none' };

const CONV_COL = {
    high:   { fg: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.22)'  },
    medium: { fg: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.22)' },
    low:    { fg: '#46586a', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' },
};
const FALLBACK_CONV = CONV_COL.low;

// ── Supabase helpers ──────────────────────────────────────────
async function fetchSignals(classFilter = null) {
    if (!sb) return [];
    let q = sb.from('cortex_signals').select('*').order('generated_at', { ascending: false });
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

// ── MarketRibbon ──────────────────────────────────────────────
function MarketRibbon() {
    const [cells, setCells] = useState([]);

    useEffect(() => {
        if (!sb) return;
        async function load() {
            const { data: risk } = await sb.from('vw_risk_analysis').select('symbol,annual_vol,dollar_var_95_daily,weight');
            const { data: snap } = await sb.from('account_snapshots').select('equity,cash').order('as_of', { ascending: false }).limit(1);
            if (!risk || !snap?.[0]) return;

            const nav     = snap[0].equity || 0;
            const cash    = snap[0].cash   || 0;
            const totalVar = risk.reduce((s, r) => s + (r.dollar_var_95_daily || 0), 0);
            const wAvgVol  = risk.reduce((s, r) => s + (r.annual_vol || 0) * (r.weight || 0), 0) / 100;
            const n        = risk.length;
            const effN     = n > 0 ? 1 / risk.reduce((s, r) => s + Math.pow((r.weight||0)/100, 2), 0) : 0;
            const cashPct  = nav ? cash / nav * 100 : 0;
            const varPct   = nav ? Math.abs(totalVar) / nav * 100 : 0;

            setCells([
                { label: 'NAV',       value: usd(nav),               accent: null },
                { label: 'Cash',      value: usd(cash),              accent: cash < 0 ? '#ef4444' : '#22c55e' },
                { label: 'Positions', value: n,                      accent: null },
                { label: 'Port Vol',  value: pct(wAvgVol * 100, 1),  accent: wAvgVol > 0.015 ? '#f59e0b' : null },
                { label: 'VaR 95 1D', value: usd(Math.abs(totalVar)), accent: '#ef4444' },
                { label: 'VaR / NAV', value: pct(varPct, 2),         accent: varPct > 3 ? '#ef4444' : varPct > 1.5 ? '#f59e0b' : null },
                { label: 'Cash / NAV',value: pct(cashPct, 1),        accent: cashPct < -10 ? '#ef4444' : cashPct < 0 ? '#f59e0b' : null },
                { label: 'Eff N',     value: num(effN, 1),            accent: effN < 10 ? '#f59e0b' : null },
            ]);
        }
        load();
    }, []);

    return h('div', { style: { flexShrink: 0 } },
        h('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(8,1fr)',
                gap: '1px',
                background: 'var(--nx-border)',
            }
        },
            cells.map((c, i) => h('div', {
                key: i,
                style: {
                    padding: '9px 14px',
                    background: 'var(--nx-bg1)',
                    display: 'flex', flexDirection: 'column', gap: 3,
                }
            },
                h('span', { style: { fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--nx-fb)' } }, c.label),
                h('span', {
                    style: {
                        fontSize: 14, fontFamily: 'var(--nx-fd)', fontWeight: 800, lineHeight: 1,
                        color: c.accent || 'var(--nx-text)',
                    }
                }, c.value)
            ))
        ),
        h('div', { style: { height: 2, background: 'linear-gradient(90deg,transparent,rgba(59,130,246,0.6),rgba(139,92,246,0.6),transparent)' } })
    );
}

// ── RelevanceArc ──────────────────────────────────────────────
function RelevanceArc({ value, colour }) {
    const r = 18, stroke = 4;
    const circ = 2 * Math.PI * r;
    const filled = (value / 100) * circ;
    return h('div', { style: { position: 'relative', width: 44, height: 44, flexShrink: 0 } },
        h('svg', { width: 44, height: 44, viewBox: '0 0 44 44' },
            h('circle', { cx: 22, cy: 22, r, fill: 'none', stroke: 'rgba(255,255,255,0.05)', strokeWidth: stroke }),
            h('circle', {
                cx: 22, cy: 22, r, fill: 'none',
                stroke: colour, strokeWidth: stroke,
                strokeDasharray: `${filled} ${circ}`,
                strokeLinecap: 'round',
                transform: 'rotate(-90 22 22)',
                style: { filter: `drop-shadow(0 0 4px ${colour})` },
            })
        ),
        h('span', {
            style: {
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, fontFamily: 'var(--nx-fd)', color: colour,
            }
        }, value)
    );
}

// ── CandidateChip ─────────────────────────────────────────────
function CandidateChip({ c, colour, onClick }) {
    const [hov, setHov] = useState(false);
    return h('button', {
        onClick: () => onClick && onClick(c),
        onMouseEnter: () => setHov(true),
        onMouseLeave: () => setHov(false),
        style: {
            background: hov ? colour + '22' : 'rgba(255,255,255,0.03)',
            border: '1px solid ' + (hov ? colour + '66' : 'rgba(255,255,255,0.08)'),
            borderRadius: 4,
            padding: '3px 9px',
            fontSize: 11, fontWeight: 600,
            color: hov ? colour : 'var(--nx-text2)',
            cursor: 'pointer',
            fontFamily: 'var(--nx-fm)',
            transition: 'all 0.15s',
        }
    }, c.ticker || c);
}

// ── PretradePanel ─────────────────────────────────────────────
function PretradePanel({ ticker, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [pctStr, setPctStr] = useState('5');

    useEffect(() => {
        setLoading(true);
        fetchPretradeRisk(ticker).then(d => { setData(d); setLoading(false); });
    }, [ticker]);

    const a = parseFloat(pctStr) / 100 || 0.05;
    let newVol = null, newVar = null, dVol = null, dVar = null;
    if (data) {
        const { sigma_p, sigma_c, cov_cp, total_nav } = data;
        const var_new = Math.pow(1-a,2)*sigma_p*sigma_p + Math.pow(a,2)*sigma_c*sigma_c + 2*a*(1-a)*cov_cp;
        newVol = Math.sqrt(var_new);
        newVar = 1.645 * newVol * (total_nav || 0);
        dVol   = (newVol - sigma_p) * 100;
        dVar   = newVar - data.var_95_daily_zar;
    }

    const row = (label, val, delta) => {
        const isPos = delta != null && delta > 0;
        const isNeg = delta != null && delta < 0;
        return h('div', {
            style: {
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }
        },
            h('span', { style: { fontSize: 11, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)' } }, label),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                delta != null && h('span', {
                    style: {
                        fontSize: 10, fontWeight: 700, fontFamily: 'var(--nx-fm)',
                        color: isPos ? '#ef4444' : isNeg ? '#22c55e' : 'var(--nx-text3)',
                        background: isPos ? 'rgba(239,68,68,0.1)' : isNeg ? 'rgba(34,197,94,0.1)' : 'transparent',
                        padding: '1px 5px', borderRadius: 3,
                    }
                }, (delta > 0 ? '+' : '') + delta.toFixed(3) + '%'),
                h('span', { style: { fontSize: 12, color: 'var(--nx-text)', fontFamily: 'var(--nx-fm)', fontWeight: 600 } }, val)
            )
        );
    };

    const SectionHead = ({ label }) => h('div', {
        style: {
            fontSize: 9, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.1em',
            fontFamily: 'var(--nx-fb)', fontWeight: 700,
            marginBottom: 6, marginTop: 14, display: 'flex', alignItems: 'center', gap: 8,
        }
    },
        h('div', { style: { flex: 1, height: 1, background: 'var(--nx-border)' } }),
        label,
        h('div', { style: { flex: 1, height: 1, background: 'var(--nx-border)' } }),
    );

    return h('div', {
        style: { position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' },
        onClick: onClose,
    },
        h('div', {
            style: {
                background: '#0a0d1a',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 12,
                padding: '22px 24px',
                width: 400,
                maxHeight: '80vh',
                overflowY: 'auto',
                boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.1)',
            },
            onClick: e => e.stopPropagation(),
        },
            // Title
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 } },
                h('div', null,
                    h('div', { style: { fontSize: 9, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--nx-fb)', marginBottom: 3 } }, 'Pre-trade Risk Analysis'),
                    h('div', { style: { fontSize: 17, fontWeight: 800, fontFamily: 'var(--nx-fd)', color: 'var(--nx-text)' } }, ticker)
                ),
                h('button', { onClick: onClose, style: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--nx-text3)', cursor: 'pointer', fontSize: 14, width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, '✕')
            ),

            loading
                ? h('div', { style: { color: 'var(--nx-text3)', fontSize: 12, textAlign: 'center', padding: '24px 0' } }, 'Computing risk metrics…')
                : !data
                    ? h('div', { style: { color: '#ef4444', fontSize: 12 } }, 'Error fetching risk data.')
                    : h('div', null,
                        // Slider
                        h('div', { style: { background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, padding: '12px 14px', marginBottom: 4 } },
                            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                                h('span', { style: { fontSize: 11, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)' } }, 'Allocation size'),
                                h('span', { style: { fontSize: 18, fontWeight: 800, fontFamily: 'var(--nx-fd)', color: '#3b82f6' } }, pctStr + '%')
                            ),
                            h('input', {
                                type: 'range', min: 1, max: 20, value: pctStr,
                                onChange: e => setPctStr(e.target.value),
                                style: { width: '100%', accentColor: '#3b82f6' }
                            })
                        ),

                        h(SectionHead, { label: 'Current Portfolio' }),
                        row('Daily Vol (σ)', pct(data.sigma_p * 100, 3)),
                        row('VaR 95 1D', usd(data.var_95_daily_zar)),
                        row('Effective N', num(data.effective_n, 1)),
                        row('Observations', data.obs + ' days'),

                        h(SectionHead, { label: 'Candidate — ' + ticker }),
                        row('Daily Vol (σ)', pct(data.sigma_c * 100, 3)),
                        row('Beta vs Portfolio', num(data.beta_c, 2)),
                        row('Sector', data.candidate_sector || '—'),
                        row('Sector Weight', pct((data.candidate_sector_weight || 0) * 100, 1)),

                        newVol != null && h('div', null,
                            h(SectionHead, { label: 'Pro-forma @ ' + pctStr + '%' }),
                            row('New Port Vol (σ)', pct(newVol * 100, 3), dVol),
                            row('New VaR 95 1D', usd(newVar), null),
                            row('ΔVaR', usd(dVar), null),
                        ),

                        h('div', { style: { marginTop: 16, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: 10, color: 'var(--nx-text3)', lineHeight: 1.6, borderLeft: '2px solid rgba(255,255,255,0.06)' } },
                            'Parametric normal, 95% CI, 1D horizon. Covariance estimated from last ', h('strong', { style: { color: 'var(--nx-text2)' } }, data.obs + ' trading days'), ' of common price history.'
                        )
                    )
        )
    );
}

// ── SignalCard ────────────────────────────────────────────────
function SignalCard({ signal, onTradeClick, onValueClick }) {
    const [expanded, setExpanded] = useState(false);
    const [hov, setHov] = useState(false);
    const cls      = signal.signal_class;
    const cc       = CLASS_COL[cls] || FALLBACK_COL;
    const conv     = (signal.conviction || 'low').toLowerCase();
    const vc       = CONV_COL[conv] || FALLBACK_CONV;
    const cands    = Array.isArray(signal.candidates) ? signal.candidates : [];
    const setup    = signal.setup_json || {};

    return h('div', {
        onMouseEnter: () => setHov(true),
        onMouseLeave: () => setHov(false),
        style: {
            background: hov ? cc.bg : 'rgba(255,255,255,0.02)',
            border: '1px solid ' + (hov ? cc.border : 'rgba(255,255,255,0.06)'),
            borderLeft: '3px solid ' + cc.fg,
            borderRadius: 8,
            padding: '14px 16px',
            marginBottom: 8,
            boxShadow: hov ? cc.glow : 'none',
            transition: 'all 0.2s',
        }
    },
        // Header
        h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 } },
            h(RelevanceArc, { value: signal.relevance || 0, colour: cc.fg }),
            h('div', { style: { flex: 1, minWidth: 0 } },
                // badges
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' } },
                    // class badge
                    h('span', {
                        style: {
                            fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
                            padding: '2px 7px', borderRadius: 4,
                            background: cc.bg, color: cc.fg, border: '1px solid ' + cc.border,
                            fontFamily: 'var(--nx-fb)',
                        }
                    }, cls),
                    // conviction badge
                    h('span', {
                        style: {
                            fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                            padding: '2px 7px', borderRadius: 4,
                            background: vc.bg, color: vc.fg, border: '1px solid ' + vc.border,
                            fontFamily: 'var(--nx-fb)',
                        }
                    }, conv + ' conviction'),
                    // origin metric if present
                    signal.origin_metric && h('span', {
                        style: {
                            fontSize: 9, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fm)',
                            padding: '2px 6px', background: 'rgba(255,255,255,0.03)',
                            borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)',
                        }
                    }, signal.origin_metric)
                ),
                // title
                h('div', {
                    style: { fontSize: 13, fontWeight: 700, color: 'var(--nx-text)', cursor: 'pointer', lineHeight: 1.35, fontFamily: 'var(--nx-fb)' },
                    onClick: () => setExpanded(x => !x),
                }, signal.title)
            )
        ),

        // Thesis
        signal.thesis_md && h('div', {
            style: {
                fontSize: 12, color: 'var(--nx-text2)', lineHeight: 1.6, marginBottom: 10,
                display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 3,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
                paddingLeft: 4, borderLeft: '2px solid ' + cc.fg + '44',
                fontFamily: 'var(--nx-fb)',
            }
        }, signal.thesis_md),

        // Setup grid (expanded)
        expanded && Object.keys(setup).length > 0 && h('div', {
            style: {
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))',
                gap: '4px 16px', marginBottom: 10,
                padding: '10px 12px', background: 'rgba(255,255,255,0.02)',
                borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)',
            }
        },
            Object.entries(setup).map(([k, v]) => h('div', { key: k, style: { display: 'flex', justifyContent: 'space-between', gap: 6 } },
                h('span', { style: { fontSize: 10, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)' } }, k),
                h('span', { style: { fontSize: 10, color: 'var(--nx-text)', fontFamily: 'var(--nx-fm)', fontWeight: 600 } }, String(v))
            ))
        ),

        // Candidate chips
        cands.length > 0 && h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 } },
            cands.map((c, i) => h(CandidateChip, { key: i, c, colour: cc.fg, onClick: t => onTradeClick && onTradeClick(t.ticker || t) }))
        ),

        // Action row
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            cands.length > 0 && h('button', {
                onClick: () => onTradeClick && onTradeClick(cands[0].ticker || cands[0]),
                style: {
                    padding: '5px 14px', fontSize: 11, fontWeight: 700,
                    background: cc.fg, color: '#fff', border: 'none',
                    borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--nx-fb)',
                    boxShadow: '0 2px 10px ' + cc.fg + '44',
                    letterSpacing: '0.03em',
                }
            }, 'Trade ▶'),
            cands.length > 0 && h('button', {
                onClick: () => onValueClick && onValueClick(cands[0].ticker || cands[0]),
                style: {
                    padding: '5px 14px', fontSize: 11, fontWeight: 600,
                    background: 'rgba(255,255,255,0.04)', color: 'var(--nx-text2)',
                    border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, cursor: 'pointer',
                    fontFamily: 'var(--nx-fb)',
                }
            }, 'Value'),
            h('button', {
                onClick: () => setExpanded(x => !x),
                style: {
                    marginLeft: 'auto', padding: '4px 10px', fontSize: 10,
                    background: 'transparent', color: 'var(--nx-text3)',
                    border: '1px solid transparent', borderRadius: 4, cursor: 'pointer',
                    fontFamily: 'var(--nx-fb)',
                }
            }, expanded ? '▲ less' : '▼ more')
        )
    );
}

// ── SignalFeed ────────────────────────────────────────────────
function SignalFeed({ signals, loading, classFilter, onClassFilter, onTradeClick, onValueClick, onRefresh, refreshing }) {
    const CLASSES = ['all', 'thesis', 'gap', 'risk'];
    const filtered = classFilter === 'all' ? signals : signals.filter(s => s.signal_class === classFilter);

    const lastGen = signals.length > 0 ? signals[0].generated_at : null;
    const lastGenStr = lastGen ? new Date(lastGen).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

    return h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
        // Toolbar
        h('div', {
            style: {
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                borderBottom: '1px solid var(--nx-border)',
                background: 'rgba(255,255,255,0.01)',
                flexShrink: 0,
            }
        },
            h('span', { style: { fontSize: 9, color: 'var(--nx-text3)', marginRight: 4, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--nx-fb)', fontWeight: 700 } }, 'Filter'),
            CLASSES.map(cls => {
                const active = classFilter === cls;
                const cc = CLASS_COL[cls];
                return h('button', {
                    key: cls,
                    onClick: () => onClassFilter(cls),
                    style: {
                        padding: '4px 12px', fontSize: 10, borderRadius: 20, cursor: 'pointer',
                        fontFamily: 'var(--nx-fb)', fontWeight: active ? 700 : 500,
                        border: '1px solid ' + (active ? (cc ? cc.border : 'rgba(255,255,255,0.2)') : 'rgba(255,255,255,0.07)'),
                        background: active ? (cc ? cc.bg : 'rgba(255,255,255,0.07)') : 'transparent',
                        color: active ? (cc ? cc.fg : 'var(--nx-text)') : 'var(--nx-text3)',
                        boxShadow: active && cc ? cc.glow : 'none',
                        letterSpacing: '0.04em',
                        transition: 'all 0.15s',
                    }
                }, cls.toUpperCase());
            }),
            h('span', { style: { marginLeft: 'auto', fontSize: 10, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fm)' } }, filtered.length + ' signal' + (filtered.length !== 1 ? 's' : '')),
            lastGenStr && h('span', { style: { fontSize: 9, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fb)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 6px' } }, 'Generated ' + lastGenStr),
            h('button', {
                onClick: onRefresh, disabled: refreshing,
                style: {
                    marginLeft: 10, padding: '5px 14px', fontSize: 10, borderRadius: 5, cursor: refreshing ? 'not-allowed' : 'pointer',
                    background: refreshing ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.12)',
                    border: '1px solid rgba(59,130,246,' + (refreshing ? '0.15' : '0.35') + ')',
                    color: refreshing ? 'var(--nx-text3)' : '#3b82f6',
                    fontFamily: 'var(--nx-fb)', fontWeight: 700, letterSpacing: '0.04em',
                    transition: 'all 0.15s',
                }
            }, refreshing ? '⟳  Running…' : '⟳  Run Engine')
        ),

        // Card list
        h('div', { style: { flex: 1, overflowY: 'auto', padding: '14px 16px' } },
            loading
                ? h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 12 } },
                    h('div', { style: { width: 32, height: 32, border: '2px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' } }),
                    h('span', { style: { color: 'var(--nx-text3)', fontSize: 12 } }, 'Loading signals…')
                )
                : filtered.length === 0
                    ? h('div', { style: { textAlign: 'center', padding: '60px 20px' } },
                        h('div', { style: { fontSize: 32, marginBottom: 12, opacity: 0.3 } }, '✦'),
                        h('div', { style: { color: 'var(--nx-text3)', fontSize: 13, fontFamily: 'var(--nx-fb)' } }, 'No signals yet.'),
                        h('div', { style: { color: 'var(--nx-text3)', fontSize: 11, marginTop: 4 } }, 'Click "Run Engine" to generate.')
                    )
                    : filtered.map(s => h(SignalCard, { key: s.id, signal: s, onTradeClick, onValueClick }))
        )
    );
}

// ── ExposureSnapshot ─────────────────────────────────────────
function ExposureSnapshot() {
    const [rows, setRows] = useState([]);
    useEffect(() => {
        if (!sb) return;
        sb.from('vw_portfolio_home')
            .select('symbol,portfolio_weight,annualised_vol,sector')
            .order('portfolio_weight', { ascending: false })
            .limit(10)
            .then(({ data }) => setRows(data || []));
    }, []);

    const maxW = rows.length ? Math.max(...rows.map(r => r.portfolio_weight || 0)) : 1;

    return h('div', null,
        h('div', {
            style: {
                fontSize: 9, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.1em',
                fontFamily: 'var(--nx-fb)', fontWeight: 700, marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 6,
            }
        },
            h('div', { style: { width: 14, height: 1, background: 'var(--nx-border-md)' } }),
            'Top Exposures',
            h('div', { style: { flex: 1, height: 1, background: 'var(--nx-border)' } })
        ),
        rows.map((r, i) => h('div', {
            key: r.symbol,
            style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' },
            onClick: () => window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol: r.symbol } })),
        },
            h('span', { style: { fontSize: 10, color: 'var(--nx-text2)', minWidth: 44, fontFamily: 'var(--nx-fm)', fontWeight: 600 } }, r.symbol),
            h('div', { style: { flex: 1, height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: 3, overflow: 'hidden' } },
                h('div', {
                    style: {
                        width: Math.min(100, (r.portfolio_weight || 0) / maxW * 100) + '%',
                        height: '100%',
                        background: 'linear-gradient(90deg,rgba(59,130,246,0.7),rgba(59,130,246,1))',
                        borderRadius: 3,
                    }
                })
            ),
            h('span', { style: { fontSize: 10, color: 'var(--nx-text3)', minWidth: 34, textAlign: 'right', fontFamily: 'var(--nx-fm)' } }, pct(r.portfolio_weight, 1))
        ))
    );
}

// ── SignalControlsReadOnly ────────────────────────────────────
function SignalControlsReadOnly() {
    const [controls, setControls] = useState([]);
    useEffect(() => { fetchControls().then(setControls); }, []);

    if (!controls.length) return null;

    return h('div', null,
        h('div', {
            style: {
                fontSize: 9, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.1em',
                fontFamily: 'var(--nx-fb)', fontWeight: 700, marginBottom: 10,
                display: 'flex', alignItems: 'center', gap: 6,
            }
        },
            h('div', { style: { width: 14, height: 1, background: 'var(--nx-border-md)' } }),
            'Signal Controls',
            h('div', { style: { flex: 1, height: 1, background: 'var(--nx-border)' } })
        ),
        controls.map(c => {
            const cc = CLASS_COL[c.signal_class];
            const fg = cc ? cc.fg : 'var(--nx-text3)';
            return h('div', {
                key: c.signal_class,
                style: {
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                    padding: '7px 10px',
                    background: c.enabled ? (cc ? cc.bg : 'rgba(255,255,255,0.03)') : 'rgba(255,255,255,0.01)',
                    border: '1px solid ' + (c.enabled ? (cc ? cc.border : 'rgba(255,255,255,0.08)') : 'rgba(255,255,255,0.04)'),
                    borderRadius: 6,
                }
            },
                // dot with glow
                h('div', {
                    style: {
                        width: 7, height: 7, borderRadius: '50%',
                        background: c.enabled ? fg : 'rgba(255,255,255,0.12)',
                        boxShadow: c.enabled ? '0 0 6px ' + fg : 'none',
                        flexShrink: 0,
                    }
                }),
                h('span', { style: { flex: 1, fontSize: 11, fontFamily: 'var(--nx-fb)', fontWeight: 600, color: c.enabled ? 'var(--nx-text)' : 'var(--nx-text3)' } }, (c.signal_class || '').toUpperCase()),
                h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 } },
                    h('span', { style: { fontSize: 8, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.06em' } }, 'WEIGHT'),
                    h('span', { style: { fontSize: 11, fontFamily: 'var(--nx-fm)', fontWeight: 700, color: c.enabled ? fg : 'var(--nx-text3)' } }, (c.feed_weight || 0).toFixed(2))
                )
            );
        })
    );
}

// ── RightRail ─────────────────────────────────────────────────
function RightRail() {
    return h('div', {
        style: {
            width: 248, flexShrink: 0,
            borderLeft: '1px solid var(--nx-border)',
            padding: '16px 14px',
            overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 16,
            background: 'rgba(255,255,255,0.006)',
        }
    },
        h(ExposureSnapshot),
        h(SignalControlsReadOnly)
    );
}

// ── Toast ─────────────────────────────────────────────────────
function Toast({ message, onDone }) {
    useEffect(() => {
        const t = setTimeout(onDone, 3500);
        return () => clearTimeout(t);
    }, [message]);
    return h('div', {
        style: {
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            background: '#0d1a2e',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 8,
            padding: '12px 18px',
            fontSize: 12, color: 'var(--nx-text)',
            fontFamily: 'var(--nx-fb)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.1)',
            display: 'flex', alignItems: 'center', gap: 10,
            maxWidth: 320,
        }
    },
        h('span', { style: { width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', flexShrink: 0 } }),
        message
    );
}

// ── CortexPage ────────────────────────────────────────────────
function CortexPage() {
    const [signals,     setSignals]     = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [classFilter, setClassFilter] = useState('all');
    const [refreshing,  setRefreshing]  = useState(false);
    const [pretradeFor, setPretradeFor] = useState(null);
    const [toast,       setToast]       = useState(null);

    const loadSignals = useCallback(async (cls = null) => {
        setLoading(true);
        const data = await fetchSignals(cls === 'all' ? null : cls);
        setSignals(data);
        setLoading(false);
    }, []);

    useEffect(() => { loadSignals(); }, []);

    async function handleRunEngine() {
        setRefreshing(true);
        const result = await runSignalEngine({});
        setRefreshing(false);
        if (result) {
            setToast('Signal engine complete — ' + (result.inserted || 0) + ' signals written.');
            loadSignals();
        } else {
            setToast('Engine error — check Edge Function logs.');
        }
    }

    return h('div', {
        style: {
            display: 'flex', flexDirection: 'column', height: '100%',
            background: 'var(--nx-bg)', color: 'var(--nx-text)',
            fontFamily: 'var(--nx-fb)',
        }
    },
        // ── Page header
        h('div', {
            style: {
                padding: '14px 20px',
                borderBottom: '1px solid var(--nx-border)',
                display: 'flex', alignItems: 'center', gap: 14,
                flexShrink: 0,
            }
        },
            h('div', null,
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10 } },
                    h('span', { style: { fontSize: 18, fontWeight: 900, letterSpacing: '0.06em', fontFamily: 'var(--nx-fd)', color: 'var(--nx-text)' } }, 'CORTEX'),
                    h('span', { style: { fontSize: 9, color: 'rgba(59,130,246,0.8)', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 } }, 'LIVE')
                ),
                h('div', { style: { fontSize: 10, color: 'var(--nx-text3)', marginTop: 1 } }, 'Signal & Idea Engine')
            ),
        ),

        // ── Market ribbon
        h(MarketRibbon),

        // ── Body
        h('div', { style: { flex: 1, display: 'flex', overflow: 'hidden' } },
            h(SignalFeed, {
                signals, loading, classFilter,
                onClassFilter: setClassFilter,
                onTradeClick: setPretradeFor,
                onValueClick: ticker => window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'valuation', symbol: ticker } })),
                onRefresh: handleRunEngine,
                refreshing,
            }),
            h(RightRail)
        ),

        pretradeFor && h(PretradePanel, { ticker: pretradeFor, onClose: () => setPretradeFor(null) }),
        toast && h(Toast, { message: toast, onDone: () => setToast(null) })
    );
}

export { CortexPage };
