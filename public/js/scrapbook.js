// ============================================================
// ATLAS Terminal — Valuation Scrapbook
// Persistent research layer on top of Valuation House.
// Handles both the company log grid and the full profile view.
// Uses sb (anon Supabase client) for reads and writes —
// tables have anon RLS policies. Claude calls go through
// /api/claude-analyse (API key lives server-side only).
// ============================================================

import { sb } from './config.js';
import { fmtCurrency, fmtPct } from './utils.js';

const { useState, useEffect, useCallback, useRef } = React;
const h = React.createElement;

// ── Conviction badge colours ──────────────────────────────────────────────────
function convColor(rating) {
    if (!rating) return '#6b7280';
    if (rating === 'Strong Buy') return '#10b981';
    if (rating === 'Buy')        return '#34d399';
    if (rating === 'Hold')       return '#f59e0b';
    if (rating === 'Avoid')      return '#ef4444';
    return '#8b5cf6';
}

function ConvictionBadge({ rating }) {
    if (!rating) return null;
    return h('span', {
        style: {
            background: convColor(rating) + '22',
            color: convColor(rating),
            border: '1px solid ' + convColor(rating) + '55',
            borderRadius: 4,
            padding: '2px 10px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.8,
            fontFamily: 'DM Mono, monospace',
        }
    }, rating.toUpperCase());
}

function UpsidePill({ pct }) {
    if (pct == null) return h('span', { style: { color: '#6b7280', fontSize: 11 } }, '—');
    const pos = pct >= 0;
    return h('span', {
        style: {
            background: pos ? '#10b98122' : '#ef444422',
            color: pos ? '#10b981' : '#ef4444',
            border: '1px solid ' + (pos ? '#10b98155' : '#ef444455'),
            borderRadius: 4,
            padding: '1px 8px',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'DM Mono, monospace',
        }
    }, (pos ? '+' : '') + (pct * 100).toFixed(1) + '%');
}

function MethodBadge({ method }) {
    const colors = {
        DCF: '#00d4ff', DDM: '#8b5cf6', EV_EBITDA: '#f59e0b',
        Residual_Income: '#10b981', Monte_Carlo: '#ec4899',
    };
    const c = colors[method] || '#6b7280';
    return h('span', {
        style: {
            background: c + '22', color: c,
            border: '1px solid ' + c + '55',
            borderRadius: 3, padding: '1px 7px',
            fontSize: 10, fontWeight: 700,
            letterSpacing: 0.5, fontFamily: 'DM Mono, monospace',
        }
    }, method.replace('_', ' '));
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ children, style }) {
    return h('div', {
        style: Object.assign({
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            padding: 20,
        }, style || {})
    }, children);
}

function SectionHeader({ label, sub, action }) {
    return h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 } },
        h('div', null,
            h('div', { style: { fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Mono, monospace', textTransform: 'uppercase' } }, label),
            sub && h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 } }, sub)
        ),
        action || null
    );
}

// ── Typewriter text ───────────────────────────────────────────────────────────
function TypewriterText({ text, speed = 8 }) {
    const [displayed, setDisplayed] = useState('');
    const idx = useRef(0);
    useEffect(() => {
        idx.current = 0;
        setDisplayed('');
        if (!text) return;
        const iv = setInterval(() => {
            idx.current += speed;
            if (idx.current >= text.length) {
                setDisplayed(text);
                clearInterval(iv);
            } else {
                setDisplayed(text.slice(0, idx.current));
            }
        }, 16);
        return () => clearInterval(iv);
    }, [text]);
    return h('span', null, displayed);
}

// ─────────────────────────────────────────────────────────────────────────────
// ScrapbookLog — company grid
// ─────────────────────────────────────────────────────────────────────────────
function ScrapbookLog({ onSelect }) {
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);

    useEffect(() => {
        if (!sb) { setLoading(false); return; }
        sb.from('scrapbook_companies')
            .select('*')
            .order('last_run_at', { ascending: false })
            .then(({ data, error: e }) => {
                setLoading(false);
                if (e) { setError(e.message); return; }
                setCompanies(data || []);
            });
    }, []);

    if (loading) return h('div', { style: { padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 13 } }, 'Loading scrapbook…');
    if (error)   return h('div', { style: { padding: 40, color: '#ef4444', fontSize: 13 } }, 'Error: ' + error);

    if (companies.length === 0) {
        return h('div', { style: { padding: 60, textAlign: 'center' } },
            h('div', { style: { fontSize: 32, marginBottom: 16, opacity: 0.3 } }, '📒'),
            h('div', { style: { fontSize: 16, color: 'rgba(255,255,255,0.5)', marginBottom: 8 } }, 'No companies saved yet'),
            h('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.3)' } },
                'Run a valuation in Valuation House and click Save & Analyse to begin building your research scrapbook.')
        );
    }

    return h('div', { style: { padding: 24 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 } },
            companies.map(co =>
                h('div', {
                    key: co.id,
                    onClick: () => onSelect(co.ticker),
                    style: {
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10,
                        padding: 20,
                        cursor: 'pointer',
                        transition: 'border-color 0.15s, background 0.15s',
                    },
                    onMouseEnter: e => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.35)'; e.currentTarget.style.background = 'rgba(0,212,255,0.04)'; },
                    onMouseLeave: e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; },
                },
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 } },
                        h('div', null,
                            h('div', { style: { fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: 'DM Mono, monospace', letterSpacing: 1 } }, co.ticker),
                            h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 } }, co.company_name || '—')
                        ),
                        h(ConvictionBadge, { rating: co.conviction_rating })
                    ),
                    h('div', { style: { display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' } },
                        co.exchange && h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '2px 7px' } }, co.exchange),
                        co.sector   && h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '2px 7px' } }, co.sector)
                    ),
                    h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 } },
                        h('div', null,
                            h('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 } }, 'Avg Fair Value'),
                            h('div', { style: { fontSize: 16, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#00d4ff' } },
                                co.avg_fair_value ? fmtCurrency(co.avg_fair_value) : '—')
                        ),
                        h('div', null,
                            h('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 } }, 'Implied Upside'),
                            co.avg_fair_value && co.current_price
                                ? h(UpsidePill, { pct: (co.avg_fair_value - co.current_price) / co.current_price })
                                : h('span', { style: { color: '#6b7280', fontSize: 11 } }, '—')
                        )
                    ),
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)' } },
                        h('span', null, co.run_count + ' method' + (co.run_count !== 1 ? 's' : '') + ' saved'),
                        co.last_run_at && h('span', null, new Date(co.last_run_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))
                    )
                )
            )
        )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ScrapbookProfile — full research note for one company
// ─────────────────────────────────────────────────────────────────────────────
function ScrapbookProfile({ ticker, onBack }) {
    const [company, setCompany]     = useState(null);
    const [snapshots, setSnapshots] = useState([]);
    const [narrative, setNarrative] = useState(null);
    const [loading, setLoading]     = useState(true);
    const [analysing, setAnalysing] = useState(false);
    const [error, setError]         = useState(null);
    const [toast, setToast]         = useState(null);
    const [expanded, setExpanded]   = useState({});

    const showToast = useCallback((msg, type = 'info') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    const loadProfile = useCallback(async () => {
        if (!sb) { setLoading(false); return; }
        setLoading(true);
        try {
            const { data: co, error: e1 } = await sb
                .from('scrapbook_companies')
                .select('*')
                .eq('ticker', ticker)
                .single();
            if (e1) throw e1;
            setCompany(co);

            const [{ data: snaps, error: e2 }, { data: narr, error: e3 }] = await Promise.all([
                sb.from('scrapbook_snapshots')
                    .select('*')
                    .eq('company_id', co.id)
                    .order('created_at', { ascending: false }),
                sb.from('scrapbook_narratives')
                    .select('*')
                    .eq('company_id', co.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
            ]);
            if (e2) throw e2;
            setSnapshots(snaps || []);
            setNarrative(narr || null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [ticker]);

    useEffect(() => { loadProfile(); }, [loadProfile]);

    const handleRegenerate = useCallback(async () => {
        if (!company || snapshots.length === 0) return;
        setAnalysing(true);
        try {
            // Optionally enrich with portfolio context
            const [{ data: quant }, { data: rolling }, { data: earnings }] = await Promise.all([
                sb.from('vw_quant_dashboard').select('*').eq('symbol', ticker).maybeSingle(),
                sb.from('vw_quant_rolling_returns').select('*').eq('symbol', ticker).maybeSingle(),
                sb.from('vw_earnings_calendar').select('*').eq('symbol', ticker).maybeSingle(),
            ]);
            const portfolioContext = (quant || rolling || earnings) ? {
                price_regime: quant?.price_regime,
                vol_regime: quant?.vol_regime,
                rsi_14: quant?.rsi_14,
                annualised_vol_20d: quant?.annualised_vol_20d,
                return_1m_pct: rolling?.return_1m_pct,
                return_3m_pct: rolling?.return_3m_pct,
                return_1y_pct: rolling?.return_1y_pct,
                earnings_date: earnings?.earnings_date,
                analyst_target: earnings?.analyst_target,
            } : null;

            const resp = await fetch('/api/claude-analyse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company: { ticker: company.ticker, company_name: company.company_name, exchange: company.exchange, sector: company.sector, currency: company.currency, current_price: company.current_price },
                    snapshots,
                    portfolioContext,
                }),
            });
            const result = await resp.json();
            if (!resp.ok || result.error) throw new Error(result.error || 'Analysis failed');

            const methods = [...new Set(snapshots.map(s => s.method))];
            const { data: newNarr, error: ne } = await sb
                .from('scrapbook_narratives')
                .insert({
                    company_id: company.id,
                    snapshot_ids: snapshots.map(s => s.id),
                    methods_included: methods,
                    snapshot_count: snapshots.length,
                    thesis: result.thesis || null,
                    value_drivers: result.value_drivers || null,
                    destroyers: result.destroyers || null,
                    bull_case: result.bull_case || null,
                    bear_case: result.bear_case || null,
                    key_sensitivities: result.key_sensitivities || null,
                    method_reconciliation: result.method_reconciliation || null,
                    investment_verdict: result.investment_verdict || null,
                    conviction_rating: result.conviction_rating || 'Under Review',
                    blended_fair_value: result.blended_fair_value || null,
                    implied_range_low: result.implied_range_low || null,
                    implied_range_high: result.implied_range_high || null,
                    avg_upside_pct: result.avg_upside_pct || null,
                    model_used: 'claude-sonnet-4-6',
                    input_token_est: result.input_token_est || null,
                })
                .select()
                .single();
            if (ne) throw ne;

            // Update company conviction + thesis summary
            await sb.from('scrapbook_companies').update({
                conviction_rating: result.conviction_rating || null,
                thesis_summary: result.thesis ? result.thesis.slice(0, 220) : null,
                avg_fair_value: result.blended_fair_value || null,
                updated_at: new Date().toISOString(),
            }).eq('id', company.id);

            setNarrative(newNarr);
            setCompany(prev => ({
                ...prev,
                conviction_rating: result.conviction_rating || prev.conviction_rating,
                thesis_summary: result.thesis ? result.thesis.slice(0, 220) : prev.thesis_summary,
            }));
            showToast('Thesis regenerated', 'success');
        } catch (e) {
            console.error('Regenerate error:', e);
            showToast('Analysis failed — ' + e.message, 'error');
        } finally {
            setAnalysing(false);
        }
    }, [company, snapshots, ticker, showToast]);

    if (loading) return h('div', { style: { padding: 40, color: 'rgba(255,255,255,0.4)', fontSize: 13 } }, 'Loading profile…');
    if (error)   return h('div', { style: { padding: 40, color: '#ef4444', fontSize: 13 } }, 'Error: ' + error);
    if (!company) return null;

    const upside = company.avg_fair_value && company.current_price
        ? (company.avg_fair_value - company.current_price) / company.current_price
        : null;

    return h('div', { style: { padding: 24, maxWidth: 1100, position: 'relative' } },

        // Toast
        toast && h('div', {
            style: {
                position: 'fixed', top: 72, right: 24, zIndex: 9999,
                background: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#10b981' : '#00d4ff',
                color: '#000', borderRadius: 6, padding: '10px 18px',
                fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }
        }, toast.msg),

        // Back button
        h('button', {
            onClick: onBack,
            style: { background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', padding: '6px 14px', fontSize: 12, cursor: 'pointer', marginBottom: 20, fontFamily: 'DM Mono, monospace' },
        }, '← Back to Scrapbook'),

        // ── Company header ────────────────────────────────────────────────────
        h('div', {
            style: {
                background: 'linear-gradient(135deg, rgba(0,212,255,0.06), rgba(139,92,246,0.04))',
                border: '1px solid rgba(0,212,255,0.2)',
                borderRadius: 12,
                padding: '24px 28px',
                marginBottom: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: 16,
            }
        },
            h('div', null,
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 } },
                    h('span', { style: { fontSize: 28, fontWeight: 800, fontFamily: 'DM Mono, monospace', color: '#00d4ff', letterSpacing: 2 } }, company.ticker),
                    h('span', { style: { fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 500 } }, company.company_name || '')
                ),
                h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                    company.exchange && h('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.07)', borderRadius: 3, padding: '2px 8px' } }, company.exchange),
                    company.sector   && h('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.07)', borderRadius: 3, padding: '2px 8px' } }, company.sector),
                    company.currency && h('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.07)', borderRadius: 3, padding: '2px 8px' } }, company.currency)
                )
            ),
            h('div', { style: { textAlign: 'right' } },
                h(ConvictionBadge, { rating: company.conviction_rating }),
                company.fair_value_low && company.fair_value_high && h('div', {
                    style: { marginTop: 10, fontSize: 20, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#fff' }
                }, fmtCurrency(company.fair_value_low) + ' – ' + fmtCurrency(company.fair_value_high)),
                h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 } }, 'Fair value range across all methods')
            )
        ),

        // ── Metric cards ──────────────────────────────────────────────────────
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 } },
            h(Card, { style: { padding: 16 } },
                h('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 } }, 'Current Price'),
                h('div', { style: { fontSize: 20, fontWeight: 700, fontFamily: 'DM Mono, monospace' } }, company.current_price ? fmtCurrency(company.current_price) : '—')
            ),
            h(Card, { style: { padding: 16 } },
                h('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 } }, 'Avg Fair Value'),
                h('div', { style: { fontSize: 20, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#00d4ff' } }, company.avg_fair_value ? fmtCurrency(company.avg_fair_value) : '—'),
                upside != null && h('div', { style: { marginTop: 4 } }, h(UpsidePill, { pct: upside }))
            ),
            h(Card, { style: { padding: 16 } },
                h('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 } }, 'Methods Saved'),
                h('div', { style: { fontSize: 20, fontWeight: 700, fontFamily: 'DM Mono, monospace' } }, company.run_count || 0),
                h('div', { style: { display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' } },
                    [...new Set(snapshots.map(s => s.method))].map(m => h(MethodBadge, { key: m, method: m }))
                )
            ),
            h(Card, { style: { padding: 16 } },
                h('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 } }, 'Last Updated'),
                h('div', { style: { fontSize: 13, fontWeight: 600, fontFamily: 'DM Mono, monospace' } },
                    company.last_run_at ? new Date(company.last_run_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
            )
        ),

        // ── Investment Thesis ─────────────────────────────────────────────────
        h(Card, { style: { marginBottom: 16 } },
            h(SectionHeader, {
                label: 'Investment Thesis',
                sub: narrative ? 'Revised ' + new Date(narrative.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
                action: h('button', {
                    onClick: handleRegenerate,
                    disabled: analysing || snapshots.length === 0,
                    style: {
                        background: analysing ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.15)',
                        border: '1px solid rgba(0,212,255,0.4)',
                        color: '#00d4ff',
                        borderRadius: 6,
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: analysing ? 'default' : 'pointer',
                        fontFamily: 'DM Mono, monospace',
                        opacity: snapshots.length === 0 ? 0.4 : 1,
                    },
                    title: snapshots.length === 0 ? 'Save a valuation run first.' : '',
                }, analysing ? '⟳ Analysing…' : 'Regenerate ✦')
            }),
            narrative && !narrative.parse_error
                ? h('div', { style: { fontSize: 13, lineHeight: 1.8, color: 'rgba(255,255,255,0.8)', whiteSpace: 'pre-line' } },
                    analysing ? h(TypewriterText, { text: narrative.thesis || '' }) : (narrative.thesis || 'No thesis generated.')
                  )
                : h('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' } },
                    narrative?.parse_error
                        ? h('span', null, '⚠ Parse error — raw response: ', h('code', { style: { fontSize: 11 } }, narrative.raw_text || ''))
                        : 'No thesis yet — click Regenerate ✦ to synthesise all saved methods.'
                  ),
            narrative?.investment_verdict && h('div', {
                style: {
                    marginTop: 16, padding: '10px 14px',
                    background: 'rgba(0,212,255,0.06)',
                    border: '1px solid rgba(0,212,255,0.2)',
                    borderRadius: 6,
                    fontSize: 13, fontWeight: 600, color: '#00d4ff',
                    fontStyle: 'italic',
                }
            }, '"' + narrative.investment_verdict + '"')
        ),

        // ── Method Reconciliation ─────────────────────────────────────────────
        narrative?.method_reconciliation && h(Card, { style: { marginBottom: 16 } },
            h(SectionHeader, { label: 'Method Reconciliation' }),
            h('div', { style: { fontSize: 13, lineHeight: 1.8, color: 'rgba(255,255,255,0.75)' } },
                narrative.method_reconciliation)
        ),

        // ── Valuation Summary Table ───────────────────────────────────────────
        snapshots.length > 0 && h(Card, { style: { marginBottom: 16 } },
            h(SectionHeader, { label: 'Valuation Summary' }),
            h('div', { style: { overflowX: 'auto' } },
                h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
                    h('thead', null,
                        h('tr', null,
                            ['Method', 'Date', 'Implied Price', 'Upside', 'Key Assumption', 'Note'].map(col =>
                                h('th', { key: col, style: { textAlign: 'left', padding: '8px 12px', fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap' } }, col)
                            )
                        )
                    ),
                    h('tbody', null,
                        snapshots.map((snap, i) => {
                            const keyAssump = snap.assumptions && Object.values(snap.assumptions)[0] || '—';
                            return h('tr', {
                                key: snap.id,
                                style: { borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }
                            },
                                h('td', { style: { padding: '10px 12px' } }, h(MethodBadge, { method: snap.method })),
                                h('td', { style: { padding: '10px 12px', color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Mono, monospace', fontSize: 11 } }, snap.run_date),
                                h('td', { style: { padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontWeight: 700, color: '#fff' } }, fmtCurrency(snap.implied_price)),
                                h('td', { style: { padding: '10px 12px' } }, h(UpsidePill, { pct: snap.upside_pct })),
                                h('td', { style: { padding: '10px 12px', color: 'rgba(255,255,255,0.55)', fontSize: 11, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, String(keyAssump).slice(0, 80)),
                                h('td', { style: { padding: '10px 12px', color: 'rgba(255,255,255,0.45)', fontSize: 11, fontStyle: snap.analyst_note ? 'normal' : 'italic' } }, snap.analyst_note || '—')
                            );
                        })
                    )
                )
            )
        ),

        // ── Value Drivers & Destroyers ────────────────────────────────────────
        narrative && (narrative.value_drivers || narrative.destroyers) && h(Card, { style: { marginBottom: 16 } },
            h(SectionHeader, { label: 'Value Drivers & Destroyers' }),
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } },
                h('div', null,
                    h('div', { style: { fontSize: 11, color: '#10b981', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, fontWeight: 700 } }, '▲ What Creates Value'),
                    (narrative.value_drivers || []).map((d, i) =>
                        h('div', { key: i, style: { marginBottom: 12, display: 'flex', gap: 10 } },
                            h('span', { style: { color: '#10b981', marginTop: 2, fontSize: 10 } }, '●'),
                            h('div', null,
                                h('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginBottom: 2 } }, d.driver),
                                h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 } }, d.evidence)
                            )
                        )
                    )
                ),
                h('div', null,
                    h('div', { style: { fontSize: 11, color: '#ef4444', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, fontWeight: 700 } }, '▼ What Destroys Value'),
                    (narrative.destroyers || []).map((d, i) =>
                        h('div', { key: i, style: { marginBottom: 12, display: 'flex', gap: 10 } },
                            h('span', { style: { color: '#ef4444', marginTop: 2, fontSize: 10 } }, '●'),
                            h('div', null,
                                h('div', { style: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginBottom: 2 } }, d.risk),
                                h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 } }, d.impact)
                            )
                        )
                    )
                )
            )
        ),

        // ── Bull / Bear cases ─────────────────────────────────────────────────
        narrative && (narrative.bull_case || narrative.bear_case) && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 } },
            narrative.bull_case && h(Card, null,
                h(SectionHeader, { label: 'Bull Case' }),
                h('div', { style: { fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.75)' } }, narrative.bull_case)
            ),
            narrative.bear_case && h(Card, null,
                h(SectionHeader, { label: 'Bear Case' }),
                h('div', { style: { fontSize: 13, lineHeight: 1.7, color: 'rgba(255,255,255,0.75)' } }, narrative.bear_case)
            )
        ),

        // ── Key Sensitivities ─────────────────────────────────────────────────
        narrative?.key_sensitivities && h(Card, { style: { marginBottom: 16 } },
            h(SectionHeader, { label: 'Key Sensitivities' }),
            h('div', { style: { fontSize: 13, lineHeight: 1.8, color: 'rgba(255,255,255,0.75)' } }, narrative.key_sensitivities)
        ),

        // ── Saved Runs Accordion ──────────────────────────────────────────────
        snapshots.length > 0 && h(Card, { style: { marginBottom: 16 } },
            h(SectionHeader, { label: 'Saved Runs', sub: snapshots.length + ' total' }),
            snapshots.map(snap =>
                h('div', { key: snap.id, style: { marginBottom: 8, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, overflow: 'hidden' } },
                    h('div', {
                        onClick: () => setExpanded(prev => ({ ...prev, [snap.id]: !prev[snap.id] })),
                        style: {
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                            cursor: 'pointer', background: expanded[snap.id] ? 'rgba(255,255,255,0.04)' : 'transparent',
                        }
                    },
                        h(MethodBadge, { method: snap.method }),
                        h('span', { style: { fontSize: 12, color: 'rgba(255,255,255,0.7)', flex: 1 } }, snap.method_label || snap.method),
                        h('span', { style: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'DM Mono, monospace' } }, snap.run_date),
                        h('span', { style: { marginLeft: 8 } }, h(UpsidePill, { pct: snap.upside_pct })),
                        h('span', { style: { marginLeft: 8, color: 'rgba(255,255,255,0.3)', fontSize: 12 } }, expanded[snap.id] ? '▲' : '▼')
                    ),
                    expanded[snap.id] && h('div', { style: { padding: '12px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' } },
                        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 } },
                            Object.entries(snap.inputs || {}).map(([k, v]) =>
                                h('div', { key: k },
                                    h('div', { style: { fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 } }, k.replace(/_/g, ' ')),
                                    h('div', { style: { fontSize: 12, fontFamily: 'DM Mono, monospace', color: 'rgba(255,255,255,0.8)' } }, String(v))
                                )
                            )
                        ),
                        snap.analyst_note && h('div', { style: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', marginTop: 6, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 } },
                            '"' + snap.analyst_note + '"')
                    )
                )
            )
        )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ScrapbookSaveBar — injected at bottom of each Valuation House method panel
// ─────────────────────────────────────────────────────────────────────────────
export function ScrapbookSaveBar({ method, methodLabel, ticker, companyName, exchange, sector, currency, currentPrice, impliedPrice, inputs, assumptions, terminalValue, impliedEV, onSaved }) {
    const [note, setNote]         = useState('');
    const [saving, setSaving]     = useState(false);
    const [analysing, setAnalysing] = useState(false);
    const [toast, setToast]       = useState(null);

    const showToast = (msg, type = 'info') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const doSave = useCallback(async (andAnalyse = false) => {
        if (!sb || !ticker || impliedPrice == null) return;
        andAnalyse ? setAnalysing(true) : setSaving(true);
        try {
            // 1. Upsert company
            const { data: co, error: e1 } = await sb
                .from('scrapbook_companies')
                .upsert({
                    ticker: ticker.toUpperCase(),
                    company_name: companyName || null,
                    exchange: exchange || null,
                    sector: sector || null,
                    currency: currency || 'USD',
                    current_price: currentPrice || null,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'ticker' })
                .select()
                .single();
            if (e1) throw e1;

            const upside = currentPrice && impliedPrice ? (impliedPrice - currentPrice) / currentPrice : null;

            // 2. Insert snapshot
            const { data: snap, error: e2 } = await sb
                .from('scrapbook_snapshots')
                .insert({
                    company_id: co.id,
                    method,
                    method_label: methodLabel || method,
                    inputs: inputs || {},
                    assumptions: assumptions || {},
                    implied_price: impliedPrice,
                    current_price_at_save: currentPrice || null,
                    upside_pct: upside,
                    terminal_value: terminalValue || null,
                    implied_ev: impliedEV || null,
                    analyst_note: note.trim() || null,
                    run_date: new Date().toISOString().slice(0, 10),
                })
                .select()
                .single();
            if (e2) throw e2;

            // 3. Update company aggregates
            await sb.rpc('update_scrapbook_company_aggregates', { p_company_id: co.id });

            if (!andAnalyse) {
                showToast('Run saved to Scrapbook', 'success');
                if (onSaved) onSaved({ company: co, snapshot: snap, navigate: false });
                return;
            }

            // 4. Fetch all snapshots for this company
            const { data: allSnaps } = await sb
                .from('scrapbook_snapshots')
                .select('*')
                .eq('company_id', co.id)
                .order('created_at', { ascending: false });

            // 5. Fetch portfolio context
            const [{ data: quant }, { data: rolling }, { data: earnings }] = await Promise.all([
                sb.from('vw_quant_dashboard').select('*').eq('symbol', ticker).maybeSingle(),
                sb.from('vw_quant_rolling_returns').select('*').eq('symbol', ticker).maybeSingle(),
                sb.from('vw_earnings_calendar').select('*').eq('symbol', ticker).maybeSingle(),
            ]);
            const portfolioContext = (quant || rolling || earnings) ? {
                price_regime: quant?.price_regime,
                vol_regime: quant?.vol_regime,
                rsi_14: quant?.rsi_14,
                annualised_vol_20d: quant?.annualised_vol_20d,
                return_1m_pct: rolling?.return_1m_pct,
                return_3m_pct: rolling?.return_3m_pct,
                return_1y_pct: rolling?.return_1y_pct,
                earnings_date: earnings?.earnings_date,
                analyst_target: earnings?.analyst_target,
            } : null;

            // 6. Call Claude
            const resp = await fetch('/api/claude-analyse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company: { ticker: co.ticker, company_name: co.company_name, exchange: co.exchange, sector: co.sector, currency: co.currency, current_price: co.current_price },
                    snapshots: allSnaps || [snap],
                    portfolioContext,
                }),
            });
            const result = await resp.json();
            if (!resp.ok || result.error) throw new Error(result.error || 'Analysis failed');

            // 7. Insert narrative
            const methods = [...new Set((allSnaps || [snap]).map(s => s.method))];
            const { data: narr, error: e3 } = await sb
                .from('scrapbook_narratives')
                .insert({
                    company_id: co.id,
                    snapshot_ids: (allSnaps || [snap]).map(s => s.id),
                    methods_included: methods,
                    snapshot_count: (allSnaps || [snap]).length,
                    thesis: result.thesis || null,
                    value_drivers: result.value_drivers || null,
                    destroyers: result.destroyers || null,
                    bull_case: result.bull_case || null,
                    bear_case: result.bear_case || null,
                    key_sensitivities: result.key_sensitivities || null,
                    method_reconciliation: result.method_reconciliation || null,
                    investment_verdict: result.investment_verdict || null,
                    conviction_rating: result.conviction_rating || 'Under Review',
                    blended_fair_value: result.blended_fair_value || null,
                    implied_range_low: result.implied_range_low || null,
                    implied_range_high: result.implied_range_high || null,
                    avg_upside_pct: result.avg_upside_pct || null,
                    model_used: 'claude-sonnet-4-6',
                    input_token_est: result.input_token_est || null,
                })
                .select()
                .single();
            if (e3) throw e3;

            // 8. Update company
            await sb.from('scrapbook_companies').update({
                conviction_rating: result.conviction_rating || null,
                thesis_summary: result.thesis ? result.thesis.slice(0, 220) : null,
                avg_fair_value: result.blended_fair_value || null,
                updated_at: new Date().toISOString(),
            }).eq('id', co.id);

            // 9. Back-link snapshot to narrative
            await sb.from('scrapbook_snapshots').update({ narrative_id: narr.id }).eq('id', snap.id);

            showToast('Saved & analysed — opening profile', 'success');
            if (onSaved) onSaved({ company: co, snapshot: snap, narrative: narr, navigate: true });

        } catch (e) {
            console.error('ScrapbookSaveBar error:', e);
            showToast((andAnalyse ? 'Analysis failed: ' : 'Save failed: ') + e.message, 'error');
        } finally {
            setSaving(false);
            setAnalysing(false);
        }
    }, [sb, ticker, impliedPrice, currentPrice, method, methodLabel, inputs, assumptions, terminalValue, impliedEV, companyName, exchange, sector, currency, note, onSaved]);

    if (!ticker || impliedPrice == null) return null;

    const upside = currentPrice && impliedPrice ? (impliedPrice - currentPrice) / currentPrice : null;
    const busy = saving || analysing;

    return h('div', { style: { position: 'relative' } },
        toast && h('div', {
            style: {
                position: 'absolute', bottom: '100%', right: 0, marginBottom: 8, zIndex: 999,
                background: toast.type === 'error' ? '#ef4444' : toast.type === 'success' ? '#10b981' : '#00d4ff',
                color: '#000', borderRadius: 6, padding: '8px 16px',
                fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }
        }, toast.msg),

        h('div', {
            style: {
                background: 'linear-gradient(90deg, rgba(0,212,255,0.08), rgba(139,92,246,0.06))',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 8,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
            }
        },
            h('div', { style: { flex: 1, minWidth: 200 } },
                h('div', { style: { fontSize: 10, color: 'rgba(0,212,255,0.7)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 } }, 'Active Run · ' + (methodLabel || method)),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                    h('span', { style: { fontSize: 14, fontWeight: 700, fontFamily: 'DM Mono, monospace' } }, ticker),
                    h('span', { style: { fontSize: 13, fontFamily: 'DM Mono, monospace', color: '#00d4ff', fontWeight: 600 } }, fmtCurrency(impliedPrice)),
                    upside != null && h(UpsidePill, { pct: upside })
                )
            ),
            h('input', {
                value: note,
                onChange: e => setNote(e.target.value),
                placeholder: 'Analyst note (optional)…',
                disabled: busy,
                style: {
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 5,
                    color: '#fff',
                    padding: '6px 12px',
                    fontSize: 12,
                    width: 220,
                    outline: 'none',
                    fontFamily: 'DM Sans, sans-serif',
                }
            }),
            h('button', {
                onClick: () => doSave(false),
                disabled: busy,
                style: {
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'rgba(255,255,255,0.8)',
                    borderRadius: 6,
                    padding: '7px 16px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: busy ? 'default' : 'pointer',
                    fontFamily: 'DM Mono, monospace',
                    opacity: busy ? 0.5 : 1,
                }
            }, saving ? '…saving' : 'Save run'),
            h('button', {
                onClick: () => doSave(true),
                disabled: busy,
                style: {
                    background: busy ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.2)',
                    border: '1px solid rgba(0,212,255,0.5)',
                    color: '#00d4ff',
                    borderRadius: 6,
                    padding: '7px 16px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: busy ? 'default' : 'pointer',
                    fontFamily: 'DM Mono, monospace',
                    opacity: busy ? 0.7 : 1,
                }
            }, analysing ? '⟳ Analysing…' : 'Save & Analyse ✦')
        )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Scrapbook export — handles routing between Log and Profile
// ─────────────────────────────────────────────────────────────────────────────
export function Scrapbook({ initialTicker }) {
    const [view, setView] = useState(initialTicker ? { mode: 'profile', ticker: initialTicker } : { mode: 'log' });

    return h('div', { style: { minHeight: '100%', display: 'flex', flexDirection: 'column' } },
        // Header bar
        h('div', {
            style: {
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                padding: '14px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(0,0,0,0.2)',
            }
        },
            h('div', { style: { fontSize: 13, fontWeight: 700, color: 'var(--cyan, #00d4ff)', letterSpacing: 2, fontFamily: 'DM Mono, monospace' } }, '📒 VALUATION SCRAPBOOK'),
            h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.4)' } }, '— persistent research layer'),
            view.mode === 'profile' && h('span', { style: { marginLeft: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'DM Mono, monospace' } }, '/ ' + view.ticker)
        ),
        h('div', { style: { flex: 1, overflowY: 'auto' } },
            view.mode === 'log'
                ? h(ScrapbookLog, { onSelect: ticker => setView({ mode: 'profile', ticker }) })
                : h(ScrapbookProfile, { ticker: view.ticker, onBack: () => setView({ mode: 'log' }) })
        )
    );
}
