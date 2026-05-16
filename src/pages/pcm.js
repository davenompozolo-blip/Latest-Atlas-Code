import React from 'react';
// ============================================================
// ATLAS Terminal — Portfolio Construction Module (PCM)
// 7-Layer Decision Engine — Vite build
// Uses canonical Vite design classes from src/styles/globals.css:
//   .atlas-page-header / .atlas-module-tag / .atlas-page-title / .atlas-page-subtitle
//   .pcm-layout / .pcm-layer-card (with .active/.locked/.complete/.error)
//   .atlas-card (with .gold/.purple/.red/.green accent stripes)
//   .atlas-sidebar-card / .atlas-sidebar-card-title
//   .kpi-grid / .kpi-grid-N / .kpi-cell / .kpi-label / .kpi-value / .kpi-sub
//   .atlas-table / .data-table
//   .btn / .btn-primary / .btn-ghost / .btn-action
//   .chip / .chip-teal / .chip-green / .chip-gold / .chip-red / .chip-muted
//   .atlas-input / .atlas-form-label
// ============================================================

import { sb, loadView } from './config.js';
import {
    MOCK_PCM_IPS, MOCK_PCM_ALLOCATION, MOCK_PCM_FACTORS,
    MOCK_PCM_RISK, MOCK_PCM_DRIFT,
} from './config.js';
import { fmtCurrency } from './utils.js';
import { Loading } from './components.js';

const { useState, useEffect } = React;
const h = React.createElement;

// ─── Layer metadata ──────────────────────────────────────────────────────────
const LAYERS = [
    { id: 'L1', label: 'IPS',         full: 'IPS Builder',         sub: 'Investment Policy Statement'     },
    { id: 'L2', label: 'SAA',         full: 'SAA / TAA Engine',    sub: 'Strategic & Tactical Allocation' },
    { id: 'L3', label: 'FACTOR',      full: 'Factor Exposure',     sub: 'Factor Tilts · Active Share'     },
    { id: 'L4', label: 'RISK',        full: 'Risk Budget Console', sub: 'Marginal Risk · Correlation'     },
    { id: 'L5', label: 'OPTIMIZER',   full: 'Portfolio Optimizer', sub: 'MVO · ERC · Constraints'         },
    { id: 'L6', label: 'REBALANCING', full: 'Rebalancing Engine',  sub: 'Drift · Trade Generation'        },
    { id: 'L7', label: 'REPORT',      full: 'Construction Report', sub: 'AI Synthesis · Decision Output'  },
];

// ─── Layer tab bar ───────────────────────────────────────────────────────────
function LayerTabBar({ layerStatus, activeLayer, setActive }) {
    return h('div', { className: 'atlas-card', style: { padding: 0, marginBottom: 16 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' } },
            LAYERS.map(function(layer, i) {
                const status   = layerStatus[layer.id] || 'incomplete';
                const isActive = layer.id === activeLayer;
                const dotColor = status === 'complete' ? 'var(--green)' : isActive ? 'var(--teal)' : 'var(--text-3)';
                return h('button', {
                    key: layer.id,
                    onClick: function() { if (status !== 'locked') setActive(layer.id); },
                    className: 'btn',
                    style: {
                        padding: '12px 6px',
                        background: isActive ? 'var(--teal-glow)' : 'transparent',
                        color: isActive ? 'var(--teal)' : 'var(--text-2)',
                        borderRight: i < 6 ? '1px solid var(--border-2)' : 'none',
                        borderRadius: 0,
                        borderTop: isActive ? '2px solid var(--teal)' : '2px solid transparent',
                        cursor: status === 'locked' ? 'not-allowed' : 'pointer',
                        opacity: status === 'locked' ? 0.4 : 1,
                        letterSpacing: '0.08em',
                    },
                },
                    h('div', { style: { fontSize: 9, color: dotColor, marginBottom: 4 } }, layer.id),
                    h('div', { style: { fontSize: 10, color: isActive ? 'var(--text-1)' : 'var(--text-3)' } }, layer.label)
                );
            })
        )
    );
}

// ─── Form helpers ────────────────────────────────────────────────────────────
function field(label, control) {
    return h('div', { style: { marginBottom: 14 } },
        h('label', { className: 'atlas-form-label' }, label),
        control
    );
}

// ─── Layer 1: IPS Form ───────────────────────────────────────────────────────
function IPSForm({ ips, setIps, onSave, saved }) {
    function patch(key, val) {
        const next = Object.assign({}, ips); next[key] = val; setIps(next);
    }
    const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };
    return h('div', null,
        h('div', { style: grid2 },
            field('Risk Tolerance (1–10)',
                h('div', null,
                    h('input', {
                        type: 'range', min: 1, max: 10, step: 1,
                        value: ips.risk_tolerance || 5,
                        onChange: function(e) {
                            const v = parseInt(e.target.value);
                            patch('risk_tolerance', v);
                            patch('risk_label', v <= 3 ? 'Conservative' : v <= 6 ? 'Moderate' : 'Aggressive');
                        },
                    }),
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 9,
                                         color: 'var(--text-3)', marginTop: 4,
                                         fontFamily: 'var(--font-mono)' } },
                        h('span', null, 'CONSERVATIVE'),
                        h('span', { style: { color: 'var(--teal)' } },
                            (ips.risk_tolerance || 5) + ' / 10 · ' + (ips.risk_label || 'MODERATE').toUpperCase()
                        ),
                        h('span', null, 'AGGRESSIVE')
                    )
                )
            ),
            field('Annual Return Target (%)',
                h('input', { className: 'atlas-input', type: 'number', step: 0.5,
                    value: ips.return_target || '',
                    onChange: function(e) { patch('return_target', parseFloat(e.target.value)); },
                })
            )
        ),
        h('div', { style: grid2 },
            field('Time Horizon',
                h('select', {
                    className: 'atlas-input',
                    value: ips.time_horizon || '10 Years',
                    onChange: function(e) { patch('time_horizon', e.target.value); },
                }, ['1 Year','3 Years','5 Years','10 Years','20+ Years'].map(function(o) {
                    return h('option', { key: o, value: o }, o);
                }))
            ),
            field('Benchmark',
                h('select', {
                    className: 'atlas-input',
                    value: ips.benchmark || 'SPY',
                    onChange: function(e) { patch('benchmark', e.target.value); },
                }, ['SPY','MSCI World','MSCI EM','Custom'].map(function(o) {
                    return h('option', { key: o, value: o }, o);
                }))
            )
        ),
        h('div', { style: grid2 },
            field('Max Single Position (%)',
                h('input', { className: 'atlas-input', type: 'number', step: 1, min: 1, max: 100,
                    value: ips.concentration_limit || '',
                    onChange: function(e) { patch('concentration_limit', parseFloat(e.target.value)); },
                })
            ),
            field('Liquidity Need',
                h('select', {
                    className: 'atlas-input',
                    value: ips.liquidity_need || 'Medium',
                    onChange: function(e) { patch('liquidity_need', e.target.value); },
                }, ['Low','Medium','High'].map(function(o) {
                    return h('option', { key: o, value: o }, o);
                }))
            )
        ),
        h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 } },
            h('button', { className: 'btn btn-primary', onClick: onSave }, 'Save IPS'),
            h('button', { className: 'btn btn-ghost', onClick: function() { setIps(MOCK_PCM_IPS); } }, 'Reset'),
            saved && h('span', { className: 'chip chip-green' }, '✓ Saved · ' + new Date().toLocaleDateString())
        )
    );
}

// ─── Layer 2: Allocation Gap ─────────────────────────────────────────────────
function AllocationGap({ rows }) {
    function bar(pct, color) {
        return h('div', { style: { height: 6, borderRadius: 3, width: '100%',
                                    background: 'var(--navy-3)', overflow: 'hidden', marginBottom: 3 } },
            h('div', { style: { height: '100%', width: Math.min(pct, 100) + '%',
                                 background: color, borderRadius: 3,
                                 transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' } })
        );
    }
    return h('div', null,
        h('div', { style: { display: 'flex', gap: 18, fontSize: 9, color: 'var(--text-3)',
                             fontFamily: 'var(--font-mono)', letterSpacing: '0.10em',
                             textTransform: 'uppercase', marginBottom: 14 } },
            [['Current', 'var(--text-3)'], ['SAA Target', 'var(--teal)'], ['TAA Tilt', 'var(--gold)']].map(function(p) {
                return h('span', { key: p[0] },
                    h('span', { style: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                          background: p[1], marginRight: 6 } }),
                    p[0]
                );
            })
        ),
        rows.map(function(row) {
            const mid = (row.saa_floor + row.saa_ceil) / 2;
            const diff = row.current_weight - mid;
            const inBand = row.current_weight >= row.saa_floor && row.current_weight <= row.saa_ceil;
            const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '% ' + (diff >= 0 ? 'OW' : 'UW');
            return h('div', { key: row.asset_class,
                style: { display: 'grid', gridTemplateColumns: '140px 1fr 110px',
                         alignItems: 'center', gap: 14, marginBottom: 14 } },
                h('div', { style: { fontSize: 10, fontFamily: 'var(--font-mono)',
                                     color: 'var(--text-2)', letterSpacing: '0.08em' } },
                    row.asset_class.replace('_', ' ')
                ),
                h('div', null,
                    bar(row.current_weight, 'var(--text-3)'),
                    bar(mid, 'var(--teal)'),
                    bar(row.taa_target, 'var(--gold)')
                ),
                h('span', { className: 'chip ' + (inBand ? 'chip-green' : 'chip-gold') },
                    inBand ? 'IN BAND' : diffStr
                )
            );
        })
    );
}

// ─── Layer 3: Factor Grid ────────────────────────────────────────────────────
function FactorGrid({ factors }) {
    return h('div', { className: 'kpi-grid kpi-grid-4' },
        factors.map(function(f) {
            const colorCls = f.score > 0.5  ? 'positive'
                           : f.score > 0    ? 'positive'
                           : f.score > -0.3 ? ''
                           : 'negative';
            return h('div', { key: f.factor, className: 'kpi-cell', style: { textAlign: 'center' } },
                h('div', { className: 'kpi-label' }, f.factor),
                h('div', { className: 'kpi-value ' + colorCls, style: { fontSize: 26 } },
                    (f.score >= 0 ? '+' : '') + f.score.toFixed(2)
                ),
                h('div', { className: 'kpi-sub' }, f.direction)
            );
        })
    );
}

// ─── Layer 4: Risk Table ─────────────────────────────────────────────────────
function RiskTable({ rows }) {
    return h('table', { className: 'atlas-table' },
        h('thead', null,
            h('tr', null, ['Ticker','Weight','Vol 90d','MRC','% Risk','Risk Bar'].map(function(th) {
                return h('th', { key: th }, th);
            }))
        ),
        h('tbody', null,
            rows.map(function(r) {
                const warn = r.prc > 15;
                return h('tr', { key: r.ticker },
                    h('td', { className: 'cell-ticker' }, r.ticker),
                    h('td', null, r.weight.toFixed(1) + '%'),
                    h('td', null, r.vol_90d.toFixed(1) + '%'),
                    h('td', null, r.mrc.toFixed(3)),
                    h('td', { className: warn ? 'neg' : '' }, r.prc.toFixed(1) + '%'),
                    h('td', { style: { width: 110 } },
                        h('div', { style: { height: 4, background: 'var(--navy-3)',
                                             borderRadius: 2, overflow: 'hidden' } },
                            h('div', { style: { height: '100%', borderRadius: 2,
                                                 background: warn ? 'var(--red)' : 'var(--gold)',
                                                 width: Math.min(r.prc * 4, 100) + '%' } })
                        )
                    )
                );
            })
        )
    );
}

// ─── Trade List ──────────────────────────────────────────────────────────────
function TradeList({ trades, onExecute }) {
    return h('table', { className: 'atlas-table' },
        h('thead', null,
            h('tr', null, ['Ticker','Action','Δ Shares','Est. Value','Rationale', onExecute ? '' : null]
                .filter(Boolean).map(function(th) { return h('th', { key: th || 'x' }, th); })
            )
        ),
        h('tbody', null,
            trades.map(function(t, i) {
                return h('tr', { key: t.ticker + i },
                    h('td', { className: 'cell-ticker' }, t.ticker),
                    h('td', null, h('span', { className: 'chip ' + (t.action === 'BUY' ? 'chip-green' : 'chip-red') }, t.action)),
                    h('td', { className: t.action === 'BUY' ? 'pos' : 'neg' },
                        t.delta_shares != null ? (t.action === 'BUY' ? '+' : '') + t.delta_shares : '—'
                    ),
                    h('td', null, t.est_value ? fmtCurrency(t.est_value) : '—'),
                    h('td', { style: { color: 'var(--text-2)', fontSize: 11 } }, t.rationale),
                    onExecute && h('td', null,
                        h('button', { className: 'btn btn-ghost', style: { padding: '4px 10px' },
                                       onClick: function() { onExecute(t); } }, 'Execute')
                    )
                );
            })
        )
    );
}

// ─── Layer 7: AI Report ──────────────────────────────────────────────────────
function AIReport({ ips, allocation, factors, risk, drift }) {
    const [report, setReport]   = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    function generate() {
        setLoading(true); setError(null);
        fetch('/api/claude-analyse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'pcm_report',
                context: { ips: ips, allocation: allocation, factors: factors,
                           top_risk: risk.slice(0, 5), drift: drift },
            }),
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            let result = data.result || data;
            if (typeof result === 'string') {
                try { result = JSON.parse(result.replace(/```json|```/g, '').trim()); }
                catch (e) { result = { executive_summary: result }; }
            }
            setReport(result);
            setLoading(false);
        })
        .catch(function(e) { setError('Report generation failed: ' + e.message); setLoading(false); });
    }

    if (loading) return h(Loading, { text: 'Synthesising portfolio construction report…' });

    if (!report) {
        return h('div', { style: { textAlign: 'center', padding: '40px 0' } },
            h('div', { style: { fontSize: 36, opacity: 0.25, marginBottom: 12, color: 'var(--teal)' } }, '⬡'),
            h('div', { style: { color: 'var(--text-2)', fontSize: 12, marginBottom: 20 } },
                'Synthesise the 6 prior layers into an investment committee memo.'
            ),
            error && h('div', { className: 'chip chip-red', style: { marginBottom: 14 } }, error),
            h('button', { className: 'btn btn-primary', onClick: generate },
                '⬡  Generate ATLAS Intelligence Report'
            )
        );
    }

    return h('div', null,
        h('div', { style: { background: 'var(--teal-glow)', border: '1px solid var(--teal-dim)',
                             borderRadius: 8, padding: '18px 20px', marginBottom: 16 } },
            h('div', { className: 'atlas-module-tag' }, 'ATLAS Intelligence · Construction Report'),
            h('div', { style: { fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7,
                                 fontFamily: 'var(--font-body)' } }, report.executive_summary)
        ),
        report.risk_commentary && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 } },
            h('div', { className: 'atlas-card red' },
                h('div', { className: 'card-title' }, 'Key Risks'),
                h('ul', { style: { paddingLeft: 18, margin: 0 } },
                    (report.risk_commentary.key_risks || []).map(function(r, i) {
                        return h('li', { key: i, style: { color: 'var(--text-2)', fontSize: 12, marginBottom: 6 } }, r);
                    })
                )
            ),
            h('div', { className: 'atlas-card green' },
                h('div', { className: 'card-title' }, 'Mitigants'),
                h('ul', { style: { paddingLeft: 18, margin: 0 } },
                    (report.risk_commentary.mitigants || []).map(function(m, i) {
                        return h('li', { key: i, style: { color: 'var(--text-2)', fontSize: 12, marginBottom: 6 } }, m);
                    })
                )
            )
        ),
        report.trade_recommendations && report.trade_recommendations.length > 0 &&
            h('div', { className: 'atlas-card' },
                h('div', { className: 'card-title' }, 'Trade Recommendations'),
                h(TradeList, {
                    trades: report.trade_recommendations.map(function(t) {
                        return { ticker: t.ticker, action: t.action, delta_shares: null,
                                 est_value: null, rationale: t.rationale };
                    }),
                    onExecute: null,
                })
            ),
        h('div', { style: { marginTop: 12 } },
            h('button', { className: 'btn btn-ghost', onClick: function() { setReport(null); } }, 'Regenerate')
        )
    );
}

// ─── Right sidebar ──────────────────────────────────────────────────────────
function LayerSidebar({ layerStatus, ips, activeLayer, setActive }) {
    const completeCount = Object.values(layerStatus).filter(function(s) { return s === 'complete'; }).length;
    return h('div', null,
        h('div', { className: 'atlas-sidebar-card' },
            h('div', { className: 'atlas-sidebar-card-title' }, 'Active IPS'),
            ips ? [
                ['Risk',       (ips.risk_tolerance || '—') + ' / 10 · ' + (ips.risk_label || '')],
                ['Target',     (ips.return_target  || '—') + '% p.a.'],
                ['Horizon',    ips.time_horizon   || '—'],
                ['Benchmark',  ips.benchmark      || '—'],
                ['Max Pos.',   (ips.concentration_limit || '—') + '%'],
            ].map(function(pair) {
                return h('div', { key: pair[0], style: { display: 'flex', justifyContent: 'space-between',
                                                          padding: '6px 0', borderBottom: '1px solid var(--border-2)' } },
                    h('span', { style: { fontSize: 9, fontFamily: 'var(--font-mono)',
                                          color: 'var(--text-3)', letterSpacing: '0.10em',
                                          textTransform: 'uppercase' } }, pair[0]),
                    h('span', { style: { fontSize: 11, fontFamily: 'var(--font-mono)',
                                          color: 'var(--teal)', fontWeight: 600 } }, pair[1])
                );
            }) : h('div', { style: { color: 'var(--text-3)', fontSize: 11 } }, 'No IPS saved yet')
        ),
        h('div', { className: 'atlas-sidebar-card' },
            h('div', { className: 'atlas-sidebar-card-title' }, 'Layer Progress'),
            LAYERS.map(function(layer) {
                const status   = layerStatus[layer.id] || 'incomplete';
                const isActive = layer.id === activeLayer;
                const chipCls  = status === 'complete' ? 'chip-green'
                               : status === 'active'   ? 'chip-teal'
                               : 'chip-muted';
                return h('div', { key: layer.id,
                    onClick: function() { if (status !== 'locked') setActive(layer.id); },
                    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                             padding: '7px 0', borderBottom: '1px solid var(--border-2)',
                             cursor: status === 'locked' ? 'not-allowed' : 'pointer',
                             opacity: status === 'locked' ? 0.5 : 1 } },
                    h('span', { style: { fontSize: 10, fontFamily: 'var(--font-mono)',
                                          color: isActive ? 'var(--teal)' : 'var(--text-2)' } },
                        layer.id + ' · ' + layer.label
                    ),
                    h('span', { className: 'chip ' + chipCls },
                        status === 'complete' ? 'DONE' : status === 'active' ? 'NOW' : 'LOCKED'
                    )
                );
            }),
            h('div', { style: { marginTop: 12 } },
                h('div', { style: { height: 4, background: 'var(--navy-3)', borderRadius: 2, overflow: 'hidden' } },
                    h('div', { style: { height: '100%', borderRadius: 2,
                                         background: 'linear-gradient(to right, var(--teal), var(--green))',
                                         width: (completeCount / 7 * 100) + '%',
                                         transition: 'width 0.6s ease' } })
                ),
                h('div', { style: { fontSize: 9, fontFamily: 'var(--font-mono)',
                                     color: 'var(--text-3)', marginTop: 4, textAlign: 'right' } },
                    completeCount + ' / 7 LAYERS COMPLETE'
                )
            )
        )
    );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function PortfolioConstruction() {
    const [ips, setIps]                 = useState(MOCK_PCM_IPS);
    const [ipsSaved, setIpsSaved]       = useState(false);
    const [alloc, setAlloc]             = useState(MOCK_PCM_ALLOCATION);
    const [factors, setFactors]         = useState(MOCK_PCM_FACTORS);
    const [risk, setRisk]               = useState(MOCK_PCM_RISK);
    const [drift, setDrift]             = useState(MOCK_PCM_DRIFT);
    const [activeLayer, setActiveLayer] = useState('L1');
    const [layerStatus, setLayerStatus] = useState({
        L1: 'active', L2: 'locked', L3: 'locked',
        L4: 'locked', L5: 'locked', L6: 'locked', L7: 'locked',
    });

    useEffect(function() {
        loadView('vw_pcm_allocation', MOCK_PCM_ALLOCATION).then(function(rows) {
            if (rows && rows.length) setAlloc(rows);
        });
        loadView('vw_pcm_risk', MOCK_PCM_RISK).then(function(rows) {
            if (rows && rows.length) setRisk(rows);
        });
        loadView('vw_pcm_drift', null).then(function(rows) {
            if (rows && rows.length) setDrift(rows[0]);
        });
    }, []);

    function completeLayer(layerId) {
        const idx  = LAYERS.findIndex(function(l) { return l.id === layerId; });
        const next = LAYERS[idx + 1];
        const updated = Object.assign({}, layerStatus, { [layerId]: 'complete' });
        if (next) { updated[next.id] = 'active'; setActiveLayer(next.id); }
        setLayerStatus(updated);
    }

    function saveIPS() {
        setIpsSaved(true);
        if (sb) {
            sb.from('portfolio_ips').upsert([{
                risk_tolerance:      ips.risk_tolerance,
                risk_label:          ips.risk_label,
                return_target:       ips.return_target,
                time_horizon:        ips.time_horizon,
                benchmark:           ips.benchmark,
                concentration_limit: ips.concentration_limit,
                liquidity_need:      ips.liquidity_need,
            }]).then(function(r) { if (r.error) console.warn('[PCM] IPS save:', r.error); });
        }
        completeLayer('L1');
    }

    function nextBtn(layerId) {
        const idx  = LAYERS.findIndex(function(l) { return l.id === layerId; });
        const next = LAYERS[idx + 1];
        return h('div', { style: { marginTop: 18 } },
            h('button', { className: 'btn btn-primary',
                onClick: function() { completeLayer(layerId); } },
                'Mark Complete → Unlock ' + (next ? next.id : 'Report')
            )
        );
    }

    function renderLayer() {
        const status = layerStatus[activeLayer] || 'incomplete';
        if (status === 'locked') {
            return h('div', { style: { textAlign: 'center', padding: '40px 0' } },
                h('div', { style: { fontSize: 24, opacity: 0.25, marginBottom: 10 } }, '🔒'),
                h('div', { style: { color: 'var(--text-3)', fontSize: 12 } },
                    'Complete prior layers to unlock ' + activeLayer
                )
            );
        }

        if (activeLayer === 'L1') return h(IPSForm, { ips: ips, setIps: setIps, onSave: saveIPS, saved: ipsSaved });

        if (activeLayer === 'L2') return h('div', null, h(AllocationGap, { rows: alloc }), nextBtn('L2'));

        if (activeLayer === 'L3') return h('div', null,
            h(FactorGrid, { factors: factors }),
            h('div', { className: 'atlas-card', style: { marginTop: 14, display: 'flex',
                                                          alignItems: 'center', gap: 24 } },
                h('div', { style: { textAlign: 'center', minWidth: 90 } },
                    h('div', { style: { fontFamily: 'var(--font-display)', fontSize: 32,
                                         fontWeight: 800, color: 'var(--teal)' } }, '68%'),
                    h('div', { className: 'kpi-label', style: { marginTop: 2 } }, 'Active Share vs SPY')
                ),
                h('div', { style: { flex: 1 } },
                    h('div', { style: { height: 6, background: 'var(--navy-3)',
                                         borderRadius: 3, overflow: 'hidden' } },
                        h('div', { style: { height: '100%', width: '68%',
                                             background: 'linear-gradient(to right, var(--teal), var(--green))',
                                             borderRadius: 3 } })
                    ),
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 4,
                                         fontSize: 9, fontFamily: 'var(--font-mono)',
                                         color: 'var(--text-3)', letterSpacing: '0.10em' } },
                        h('span', null, '0% INDEX'),
                        h('span', null, '60% GENUINE'),
                        h('span', null, '100% CONCENTRATED')
                    )
                ),
                h('span', { className: 'chip chip-green' }, '✓ GENUINELY ACTIVE')
            ),
            nextBtn('L3')
        );

        if (activeLayer === 'L4') return h('div', null,
            h('div', { className: 'kpi-grid kpi-grid-4', style: { marginBottom: 16 } },
                [
                    { label: 'Portfolio Vol (Ann.)',   value: '18.4%', sub: '90-day realised',           cls: 'warning'  },
                    { label: 'Diversification Ratio',  value: '1.34',  sub: 'Weighted avg / port vol',  cls: 'positive' },
                    { label: 'Risk HHI',               value: '0.18',  sub: 'Top 3 = 47% of risk',      cls: 'negative' },
                    { label: 'Tracking Error',         value: '8.2%',  sub: 'vs SPY · budget 10%',      cls: ''         },
                ].map(function(k) {
                    return h('div', { key: k.label, className: 'kpi-cell' },
                        h('div', { className: 'kpi-label' }, k.label),
                        h('div', { className: 'kpi-value ' + k.cls }, k.value),
                        h('div', { className: 'kpi-sub' }, k.sub)
                    );
                })
            ),
            h('div', { className: 'atlas-card' },
                h('div', { className: 'card-title' }, 'Marginal Risk Contribution'),
                h(RiskTable, { rows: risk })
            ),
            nextBtn('L4')
        );

        if (activeLayer === 'L5') return h('div', null,
            h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' } },
                ['Max Sharpe (MVO)', 'Equal Risk (ERC)', 'Min Variance', 'Max Diversification', 'Benchmark-Constrained']
                .map(function(mode, i) {
                    return h('button', { key: mode,
                        className: 'btn ' + (i === 0 ? 'btn-primary' : 'btn-ghost'),
                        style: { padding: '7px 12px' },
                    }, mode);
                })
            ),
            h('div', { className: 'kpi-grid kpi-grid-3', style: { marginBottom: 16 } },
                [
                    { label: 'Expected Sharpe', value: '1.42',  cls: 'positive' },
                    { label: 'Expected Return', value: '14.8%', cls: 'positive' },
                    { label: 'Expected Vol',    value: '10.4%', cls: 'warning'  },
                ].map(function(k) {
                    return h('div', { key: k.label, className: 'kpi-cell' },
                        h('div', { className: 'kpi-label' }, k.label),
                        h('div', { className: 'kpi-value ' + k.cls }, k.value)
                    );
                })
            ),
            nextBtn('L5')
        );

        if (activeLayer === 'L6') return h('div', null,
            drift.trigger_fired && h('div', { className: 'atlas-card red',
                style: { display: 'flex', alignItems: 'center', gap: 16 } },
                h('div', { style: { fontSize: 22 } }, '⚠'),
                h('div', null,
                    h('div', { style: { fontFamily: 'var(--font-display)', fontSize: 16,
                                         fontWeight: 700, color: 'var(--red)' } }, 'Rebalancing Triggered'),
                    h('div', { style: { fontSize: 11, color: 'var(--text-3)',
                                         fontFamily: 'var(--font-mono)' } },
                        'Aggregate drift ' + drift.aggregate_drift.toFixed(1) + '% exceeds threshold'
                    )
                ),
                h('div', { style: { marginLeft: 'auto', fontFamily: 'var(--font-display)',
                                     fontSize: 32, fontWeight: 800, color: 'var(--red)' } },
                    drift.aggregate_drift.toFixed(1) + '%'
                )
            ),
            h('div', { className: 'atlas-card' },
                h('div', { className: 'card-title' }, 'Proposed Trades · Review Before Executing'),
                h(TradeList, {
                    trades: drift.trades,
                    onExecute: function(t) { console.log('[PCM] Execute trade:', t); },
                })
            ),
            nextBtn('L6')
        );

        if (activeLayer === 'L7') return h(AIReport, {
            ips: ips, allocation: alloc, factors: factors, risk: risk, drift: drift,
        });

        return null;
    }

    const currentLayer  = LAYERS.find(function(l) { return l.id === activeLayer; });
    const currentStatus = layerStatus[activeLayer] || 'incomplete';
    const accentMod = currentStatus === 'complete' ? ' green'
                    : currentStatus === 'active'   ? ''
                    : '';

    return h('div', null,
        // Page header
        h('div', { className: 'atlas-page-header' },
            h('div', { className: 'atlas-module-tag' }, 'CONSTRUCT · 7-LAYER DECISION ENGINE'),
            h('div', { className: 'atlas-page-title' }, 'Portfolio Construction'),
            h('div', { className: 'atlas-page-subtitle' },
                'IPS → Allocation → Factors → Risk → Optimizer → Rebalancing → Report'
            )
        ),
        // Layer tab bar
        h(LayerTabBar, { layerStatus: layerStatus, activeLayer: activeLayer, setActive: setActiveLayer }),
        // Two-column layout
        h('div', { className: 'pcm-layout' },
            // Active layer card
            h('div', { className: 'atlas-card' + accentMod },
                h('div', { style: { display: 'flex', alignItems: 'center',
                                     justifyContent: 'space-between', marginBottom: 16 } },
                    h('div', null,
                        h('div', { style: { fontFamily: 'var(--font-display)', fontSize: 17,
                                             fontWeight: 700, color: 'var(--text-1)' } },
                            currentLayer ? currentLayer.full : activeLayer
                        ),
                        h('div', { style: { fontSize: 11, color: 'var(--text-3)',
                                             fontFamily: 'var(--font-mono)', marginTop: 2 } },
                            currentLayer ? currentLayer.sub : ''
                        )
                    ),
                    currentStatus !== 'locked' &&
                        h('span', { className: 'chip ' + (currentStatus === 'complete' ? 'chip-green' : 'chip-teal') },
                            currentStatus === 'complete' ? 'COMPLETE' : 'IN PROGRESS'
                        )
                ),
                renderLayer()
            ),
            // Right sidebar
            h(LayerSidebar, {
                layerStatus: layerStatus, ips: ipsSaved ? ips : null,
                activeLayer: activeLayer, setActive: setActiveLayer,
            })
        )
    );
}
