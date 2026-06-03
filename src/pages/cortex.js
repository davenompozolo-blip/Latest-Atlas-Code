import React from 'react';
import { sb } from './config.js';

const h = React.createElement;
const { useState, useEffect, useCallback, useRef } = React;

// ── Formatters ────────────────────────────────────────────────
const pct  = (v, d=1) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d) + '%';
const usd  = (v, d=0) => v == null ? '—' : 'R ' + Number(v).toLocaleString('en-ZA', { minimumFractionDigits: d, maximumFractionDigits: d });
const num  = (v, d=2) => v == null ? '—' : Number(v).toFixed(d);

// ── Colour helpers ────────────────────────────────────────────
const CLASS_COLOURS = {
    thesis: 'var(--nx-blue)',
    gap:    'var(--nx-teal)',
    risk:   'var(--nx-red)',
};
const CONV_COLOURS = {
    high:   'var(--nx-green)',
    medium: 'var(--nx-amber)',
    low:    'var(--nx-text3)',
};

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
        const { data, error } = await sb.functions.invoke('cortex_pretrade_risk', {
            body: { ticker },
        });
        if (error) throw error;
        return data;
    } catch (e) {
        console.error('pretrade risk', e);
        return null;
    }
}

async function runSignalEngine(opts = {}) {
    if (!sb) return null;
    try {
        const { data, error } = await sb.functions.invoke('generate_cortex_signals', {
            body: opts,
        });
        if (error) throw error;
        return data;
    } catch (e) {
        console.error('signal engine', e);
        return null;
    }
}

// ── MarketRibbon ──────────────────────────────────────────────
function MarketRibbon() {
    const [cells, setCells] = useState([]);

    useEffect(() => {
        if (!sb) return;
        async function load() {
            // Pull key macro metrics from vw_risk_analysis aggregates + snapshot
            const { data: risk } = await sb.from('vw_risk_analysis').select('symbol,annual_vol,dollar_var_95_daily,weight');
            const { data: snap } = await sb.from('account_snapshots').select('equity,cash').order('as_of', { ascending: false }).limit(1);

            if (!risk || !snap?.[0]) return;

            const nav    = snap[0].equity || 0;
            const cash   = snap[0].cash   || 0;
            const totalVar = risk.reduce((s, r) => s + (r.dollar_var_95_daily || 0), 0);
            const wAvgVol  = risk.reduce((s, r) => s + (r.annual_vol || 0) * (r.weight || 0), 0) / 100;
            const n        = risk.length;

            setCells([
                { label: 'NAV',         value: usd(nav) },
                { label: 'Cash',        value: usd(cash) },
                { label: 'Positions',   value: n },
                { label: 'Port Vol',    value: pct(wAvgVol * 100, 1) },
                { label: 'VaR 95 1D',   value: usd(Math.abs(totalVar)) },
                { label: 'VaR / NAV',   value: nav ? pct(Math.abs(totalVar) / nav * 100, 2) : '—' },
                { label: 'Cash / NAV',  value: nav ? pct(cash / nav * 100, 1) : '—' },
                { label: 'Eff N',       value: n > 0 ? num(1 / risk.reduce((s, r) => s + Math.pow((r.weight||0)/100, 2), 0), 1) : '—' },
            ]);
        }
        load();
    }, []);

    return h('div', {
        style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: '1px',
            background: 'var(--nx-border)',
            borderBottom: '1px solid var(--nx-border-md)',
        }
    },
        cells.map((c, i) => h('div', {
            key: i,
            style: {
                padding: '8px 12px',
                background: 'var(--nx-bg3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
            }
        },
            h('span', { style: { fontSize: 9, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.06em' } }, c.label),
            h('span', { style: { fontSize: 13, color: 'var(--nx-text1)', fontFamily: 'var(--nx-fm)', fontWeight: 600 } }, c.value)
        ))
    );
}

// ── RelevanceBar ──────────────────────────────────────────────
function RelevanceBar({ value, colour }) {
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
        h('div', { style: { flex: 1, height: 3, background: 'var(--nx-border)', borderRadius: 2 } },
            h('div', { style: { width: value + '%', height: '100%', background: colour, borderRadius: 2, transition: 'width 0.4s' } })
        ),
        h('span', { style: { fontSize: 10, color: 'var(--nx-text3)', minWidth: 24 } }, value)
    );
}

// ── CandidateChip ─────────────────────────────────────────────
function CandidateChip({ c, onClick }) {
    return h('button', {
        onClick: () => onClick && onClick(c),
        style: {
            background: 'transparent',
            border: '1px solid var(--nx-border-md)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            color: 'var(--nx-text2)',
            cursor: 'pointer',
            fontFamily: 'var(--nx-fm)',
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
    let newVol = null, newVar = null;
    if (data) {
        const { sigma_p, sigma_c, cov_cp, total_nav } = data;
        const variance_new = Math.pow(1 - a, 2) * sigma_p * sigma_p + Math.pow(a, 2) * sigma_c * sigma_c + 2 * a * (1 - a) * cov_cp;
        newVol = Math.sqrt(variance_new);
        newVar = 1.645 * newVol * (total_nav || 0);
    }

    const row = (label, val) => h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--nx-border)' } },
        h('span', { style: { fontSize: 11, color: 'var(--nx-text3)' } }, label),
        h('span', { style: { fontSize: 11, color: 'var(--nx-text1)', fontFamily: 'var(--nx-fm)' } }, val)
    );

    return h('div', {
        style: {
            position: 'fixed', inset: 0, zIndex: 9000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)',
        },
        onClick: onClose,
    },
        h('div', {
            style: {
                background: '#0b0d1a',
                border: '1px solid var(--nx-border-md)',
                borderRadius: 8,
                padding: 24,
                width: 380,
                maxHeight: '80vh',
                overflowY: 'auto',
            },
            onClick: e => e.stopPropagation(),
        },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 16 } },
                h('span', { style: { color: 'var(--nx-text1)', fontWeight: 700, fontSize: 14 } }, 'Pre-trade Risk — ' + ticker),
                h('button', { onClick: onClose, style: { background: 'none', border: 'none', color: 'var(--nx-text3)', cursor: 'pointer', fontSize: 16 } }, '✕')
            ),
            loading
                ? h('div', { style: { color: 'var(--nx-text3)', fontSize: 12 } }, 'Computing…')
                : !data
                    ? h('div', { style: { color: 'var(--nx-red)', fontSize: 12 } }, 'Error fetching risk data.')
                    : h('div', null,
                        h('div', { style: { marginBottom: 12 } },
                            h('label', { style: { fontSize: 11, color: 'var(--nx-text3)' } }, 'Allocation % (0–100)'),
                            h('input', {
                                type: 'range', min: 1, max: 20, value: pctStr,
                                onChange: e => setPctStr(e.target.value),
                                style: { width: '100%', margin: '4px 0' }
                            }),
                            h('span', { style: { fontSize: 12, color: 'var(--nx-text1)', fontFamily: 'var(--nx-fm)' } }, pctStr + '%')
                        ),
                        h('div', { style: { marginBottom: 8 } },
                            h('div', { style: { fontSize: 10, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 } }, 'Current Portfolio'),
                            row('Port Daily Vol (σ)', pct(data.sigma_p * 100, 3)),
                            row('Port VaR 95 1D', usd(data.var_95_daily_zar)),
                            row('Effective N', num(data.effective_n, 1)),
                            row('Observations', data.obs + ' days'),
                        ),
                        h('div', { style: { marginBottom: 8 } },
                            h('div', { style: { fontSize: 10, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 } }, 'Candidate'),
                            row('Cand Daily Vol (σ)', pct(data.sigma_c * 100, 3)),
                            row('Cand Beta', num(data.beta_c, 2)),
                            row('Sector', data.candidate_sector || '—'),
                            row('Sector Weight', pct((data.candidate_sector_weight || 0) * 100, 1)),
                        ),
                        newVol != null && h('div', { style: { marginBottom: 8 } },
                            h('div', { style: { fontSize: 10, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 } }, 'Pro-forma @ ' + pctStr + '%'),
                            row('New Port Vol (σ)', pct(newVol * 100, 3)),
                            row('ΔVol', pct((newVol - data.sigma_p) * 100, 3)),
                            row('New VaR 95 1D', usd(1.645 * newVol * (data.total_nav || 0))),
                            row('ΔVaR', usd(1.645 * newVol * (data.total_nav || 0) - data.var_95_daily_zar)),
                        ),
                        h('div', { style: { marginTop: 16, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, fontSize: 10, color: 'var(--nx-text3)' } },
                            'Parametric normal, 95% CI, 1D horizon. Covariance from last ' + data.obs + ' trading days of price history.'
                        )
                    )
        )
    );
}

// ── SignalCard ────────────────────────────────────────────────
function SignalCard({ signal, onTradeClick, onValueClick }) {
    const [expanded, setExpanded] = useState(false);
    const cls   = signal.signal_class;
    const colour = CLASS_COLOURS[cls] || 'var(--nx-text3)';
    const convColour = CONV_COLOURS[signal.conviction] || 'var(--nx-text3)';
    const candidates = Array.isArray(signal.candidates) ? signal.candidates : [];
    const setup      = signal.setup_json || {};

    return h('div', {
        style: {
            background: '#0b0d1a',
            border: '1px solid var(--nx-border)',
            borderLeft: '3px solid ' + colour,
            borderRadius: 6,
            padding: '14px 16px',
            marginBottom: 8,
        }
    },
        // Header row
        h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 } },
            h('span', {
                style: {
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: colour, border: '1px solid ' + colour, borderRadius: 3,
                    padding: '1px 5px', whiteSpace: 'nowrap', marginTop: 1,
                }
            }, cls),
            h('div', { style: { flex: 1 } },
                h('div', {
                    style: { fontSize: 13, fontWeight: 600, color: 'var(--nx-text1)', cursor: 'pointer', lineHeight: 1.3 },
                    onClick: () => setExpanded(x => !x),
                }, signal.title),
                h('div', { style: { marginTop: 4 } },
                    h(RelevanceBar, { value: signal.relevance || 0, colour })
                )
            ),
            h('span', {
                style: { fontSize: 10, color: convColour, fontWeight: 600, whiteSpace: 'nowrap', marginTop: 2 }
            }, (signal.conviction || '').toUpperCase())
        ),

        // Thesis (always visible, truncated if not expanded)
        signal.thesis_md && h('div', {
            style: {
                fontSize: 12, color: 'var(--nx-text2)', lineHeight: 1.5, marginBottom: 8,
                display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 3,
                WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }
        }, signal.thesis_md),

        // Setup grid (expanded only)
        expanded && Object.keys(setup).length > 0 && h('div', {
            style: {
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '4px 12px', marginBottom: 8,
            }
        },
            Object.entries(setup).map(([k, v]) => h('div', { key: k, style: { display: 'flex', justifyContent: 'space-between' } },
                h('span', { style: { fontSize: 10, color: 'var(--nx-text3)' } }, k),
                h('span', { style: { fontSize: 10, color: 'var(--nx-text1)', fontFamily: 'var(--nx-fm)' } }, String(v))
            ))
        ),

        // Candidate chips
        candidates.length > 0 && h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 } },
            candidates.map((c, i) => h(CandidateChip, {
                key: i, c,
                onClick: t => onTradeClick && onTradeClick(t.ticker || t),
            }))
        ),

        // Action row
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
            candidates.length > 0 && h('button', {
                onClick: () => onTradeClick && onTradeClick(candidates[0].ticker || candidates[0]),
                style: {
                    padding: '4px 12px', fontSize: 11, fontWeight: 600,
                    background: colour, color: '#fff', border: 'none',
                    borderRadius: 4, cursor: 'pointer',
                }
            }, 'Trade ▸'),
            candidates.length > 0 && h('button', {
                onClick: () => onValueClick && onValueClick(candidates[0].ticker || candidates[0]),
                style: {
                    padding: '4px 12px', fontSize: 11,
                    background: 'transparent', color: 'var(--nx-text2)',
                    border: '1px solid var(--nx-border-md)', borderRadius: 4, cursor: 'pointer',
                }
            }, 'Value'),
            h('button', {
                onClick: () => setExpanded(x => !x),
                style: {
                    marginLeft: 'auto', padding: '4px 8px', fontSize: 10,
                    background: 'transparent', color: 'var(--nx-text3)',
                    border: 'none', cursor: 'pointer',
                }
            }, expanded ? '▲ less' : '▼ more'),
            signal.origin_metric && h('span', {
                style: { fontSize: 10, color: 'var(--nx-text3)', marginLeft: 4 }
            }, signal.origin_metric)
        )
    );
}

// ── SignalFeed ────────────────────────────────────────────────
function SignalFeed({ signals, loading, classFilter, onClassFilter, onTradeClick, onValueClick, onRefresh, refreshing }) {
    const CLASSES = ['all', 'thesis', 'gap', 'risk'];

    const filtered = classFilter === 'all' ? signals : signals.filter(s => s.signal_class === classFilter);

    return h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } },
        // Toolbar
        h('div', {
            style: {
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
                borderBottom: '1px solid var(--nx-border)',
            }
        },
            h('span', { style: { fontSize: 11, color: 'var(--nx-text3)', marginRight: 4 } }, 'FILTER:'),
            CLASSES.map(cls => h('button', {
                key: cls,
                onClick: () => onClassFilter(cls),
                style: {
                    padding: '3px 10px', fontSize: 11, borderRadius: 12, cursor: 'pointer',
                    border: classFilter === cls
                        ? '1px solid ' + (CLASS_COLOURS[cls] || 'var(--nx-text1)')
                        : '1px solid var(--nx-border)',
                    background: classFilter === cls ? (CLASS_COLOURS[cls] ? CLASS_COLOURS[cls] + '22' : 'rgba(255,255,255,0.06)') : 'transparent',
                    color: classFilter === cls ? (CLASS_COLOURS[cls] || 'var(--nx-text1)') : 'var(--nx-text3)',
                    fontWeight: classFilter === cls ? 700 : 400,
                }
            }, cls.toUpperCase())),
            h('span', { style: { marginLeft: 'auto', fontSize: 11, color: 'var(--nx-text3)' } }, filtered.length + ' signal' + (filtered.length !== 1 ? 's' : '')),
            h('button', {
                onClick: onRefresh,
                disabled: refreshing,
                style: {
                    marginLeft: 8, padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
                    background: 'transparent', border: '1px solid var(--nx-border-md)',
                    color: refreshing ? 'var(--nx-text3)' : 'var(--nx-text1)',
                }
            }, refreshing ? '⟳ Running…' : '⟳ Run Engine')
        ),

        // Card list
        h('div', { style: { flex: 1, overflowY: 'auto', padding: '12px 16px' } },
            loading
                ? h('div', { style: { color: 'var(--nx-text3)', fontSize: 12, padding: 20 } }, 'Loading signals…')
                : filtered.length === 0
                    ? h('div', { style: { color: 'var(--nx-text3)', fontSize: 12, padding: 20 } },
                        'No signals. Click "Run Engine" to generate.')
                    : filtered.map(s => h(SignalCard, {
                        key: s.id, signal: s,
                        onTradeClick, onValueClick,
                    }))
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

    return h('div', { style: { marginBottom: 16 } },
        h('div', { style: { fontSize: 10, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 } }, 'Top Exposures'),
        rows.map((r, i) => h('div', {
            key: r.symbol,
            style: {
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, cursor: 'pointer',
            },
            onClick: () => window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'equity', symbol: r.symbol } })),
        },
            h('span', { style: { fontSize: 11, color: 'var(--nx-text2)', minWidth: 50, fontFamily: 'var(--nx-fm)' } }, r.symbol),
            h('div', { style: { flex: 1, height: 4, background: 'var(--nx-border)', borderRadius: 2, overflow: 'hidden' } },
                h('div', { style: { width: Math.min(100, r.portfolio_weight || 0) + '%', height: '100%', background: 'var(--nx-blue)', borderRadius: 2 } })
            ),
            h('span', { style: { fontSize: 10, color: 'var(--nx-text3)', minWidth: 36, textAlign: 'right' } }, pct(r.portfolio_weight, 1))
        ))
    );
}

// ── SignalControlsReadOnly ────────────────────────────────────
function SignalControlsReadOnly() {
    const [controls, setControls] = useState([]);
    useEffect(() => { fetchControls().then(setControls); }, []);

    if (!controls.length) return null;

    return h('div', null,
        h('div', { style: { fontSize: 10, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 } }, 'Signal Controls'),
        controls.map(c => h('div', {
            key: c.signal_class,
            style: {
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
                padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 4,
            }
        },
            h('span', {
                style: {
                    width: 8, height: 8, borderRadius: '50%',
                    background: c.enabled ? 'var(--nx-green)' : 'var(--nx-text3)',
                    flexShrink: 0,
                }
            }),
            h('span', { style: { flex: 1, fontSize: 11, color: c.enabled ? 'var(--nx-text1)' : 'var(--nx-text3)' } }, c.signal_class.toUpperCase()),
            h('span', { style: { fontSize: 10, color: 'var(--nx-text3)', fontFamily: 'var(--nx-fm)' } }, 'w=' + (c.feed_weight || 0).toFixed(2))
        ))
    );
}

// ── RightRail ─────────────────────────────────────────────────
function RightRail() {
    return h('div', {
        style: {
            width: 240, flexShrink: 0,
            borderLeft: '1px solid var(--nx-border)',
            padding: '16px 14px',
            overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 0,
        }
    },
        h(ExposureSnapshot),
        h('div', { style: { height: 1, background: 'var(--nx-border)', margin: '8px 0 12px' } }),
        h(SignalControlsReadOnly)
    );
}

// ── Toast ─────────────────────────────────────────────────────
function Toast({ message, onDone }) {
    useEffect(() => {
        const t = setTimeout(onDone, 3000);
        return () => clearTimeout(t);
    }, [message]);
    return h('div', {
        style: {
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            background: '#1a1f3a', border: '1px solid var(--nx-border-md)',
            borderRadius: 6, padding: '10px 16px',
            fontSize: 12, color: 'var(--nx-text1)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }
    }, message);
}

// ── CortexPage ────────────────────────────────────────────────
function CortexPage() {
    const [signals,      setSignals]      = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [classFilter,  setClassFilter]  = useState('all');
    const [refreshing,   setRefreshing]   = useState(false);
    const [pretradeFor,  setPretradeFor]  = useState(null);  // ticker string
    const [toast,        setToast]        = useState(null);

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

    function handleTradeClick(ticker) {
        setPretradeFor(ticker);
    }

    function handleValueClick(ticker) {
        window.dispatchEvent(new CustomEvent('atlas:navigate', { detail: { tab: 'valuation', symbol: ticker } }));
    }

    return h('div', {
        style: {
            display: 'flex', flexDirection: 'column', height: '100%',
            background: '#070814', color: 'var(--nx-text1)',
            fontFamily: 'var(--nx-fm, monospace)',
        }
    },
        // Header
        h('div', {
            style: {
                padding: '12px 16px',
                borderBottom: '1px solid var(--nx-border-md)',
                display: 'flex', alignItems: 'center', gap: 12,
            }
        },
            h('span', { style: { fontSize: 15, fontWeight: 700, letterSpacing: '0.05em' } }, 'CORTEX'),
            h('span', { style: { fontSize: 10, color: 'var(--nx-text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 } }, 'Signal & Idea Engine'),
        ),

        // Market ribbon
        h(MarketRibbon),

        // Body: signal feed + right rail
        h('div', { style: { flex: 1, display: 'flex', overflow: 'hidden' } },
            h(SignalFeed, {
                signals, loading, classFilter,
                onClassFilter: setClassFilter,
                onTradeClick: handleTradeClick,
                onValueClick: handleValueClick,
                onRefresh: handleRunEngine,
                refreshing,
            }),
            h(RightRail)
        ),

        // Pretrade overlay
        pretradeFor && h(PretradePanel, {
            ticker: pretradeFor,
            onClose: () => setPretradeFor(null),
        }),

        // Toast
        toast && h(Toast, { message: toast, onDone: () => setToast(null) })
    );
}

export { CortexPage };
