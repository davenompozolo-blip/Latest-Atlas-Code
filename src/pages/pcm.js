import React from 'react';
// ============================================================
// ATLAS Terminal — Portfolio Construction Module (PCM)
// 7-Layer Decision Engine — Vite build
// ============================================================

import { sb, loadView } from './config.js';
import {
    MOCK_PCM_IPS, MOCK_PCM_ALLOCATION, MOCK_PCM_FACTORS,
    MOCK_PCM_RISK, MOCK_PCM_DRIFT,
} from './config.js';
import { fmtCurrency } from './utils.js';
import { Loading } from './components.js';
import {
    computeFactorScores, computePortfolioMetrics,
    buildOptimizerInputs, runOptimizer,
} from './pcm-optimizer.js';

const { useState, useEffect, useRef } = React;
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

const OPTIMIZER_MODES = [
    { id: 'mvo',    label: 'Max Sharpe (MVO)'         },
    { id: 'erc',    label: 'Equal Risk (ERC)'          },
    { id: 'minvar', label: 'Min Variance'              },
    { id: 'maxdiv', label: 'Max Diversification'       },
    { id: 'bench',  label: 'Benchmark-Constrained'     },
];

// ─── Layer tab bar ───────────────────────────────────────────────────────────
function LayerTabBar({ layerStatus, activeLayer, setActive }) {
    return h('div', { style: { display: 'flex', gap: 2, marginBottom: 20,
                                borderBottom: '1px solid var(--border-2)', overflowX: 'auto' } },
        LAYERS.map(function(layer) {
            const status   = layerStatus[layer.id] || 'incomplete';
            const isActive = layer.id === activeLayer;
            const dotColor = status === 'complete' ? 'var(--green)'
                           : status === 'active'   ? 'var(--teal)'
                           : 'var(--text-3)';
            return h('button', {
                key: layer.id,
                onClick: function() { if (status !== 'locked') setActive(layer.id); },
                style: {
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    padding: '8px 14px 10px', border: 'none',
                    borderBottom: '2px solid ' + (isActive ? 'var(--teal)' : 'transparent'),
                    background: 'transparent', cursor: status === 'locked' ? 'not-allowed' : 'pointer',
                    opacity: status === 'locked' ? 0.4 : 1, transition: 'all 0.15s', marginBottom: -1,
                    whiteSpace: 'nowrap', flexShrink: 0,
                }
            },
                h('div', { style: { fontSize: 9, color: dotColor, marginBottom: 2,
                                     fontFamily: 'var(--font-mono)', letterSpacing: '0.10em' } }, layer.id),
                h('div', { style: { fontSize: 10, fontWeight: 600,
                                     color: isActive ? 'var(--text-1)' : 'var(--text-3)',
                                     fontFamily: 'var(--font-mono)' } }, layer.label)
            );
        })
    );
}

// ─── Layer 1: IPS Form ───────────────────────────────────────────────────────
function IPSForm({ ips, setIps, onSave, saved }) {
    function field(label, key, type, opts) {
        return h('div', { key: key, style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            h('label', { className: 'atlas-form-label' }, label),
            type === 'select'
                ? h('select', { className: 'atlas-input', value: ips[key] || '',
                                 onChange: function(e) { setIps(Object.assign({}, ips, { [key]: e.target.value })); } },
                    (opts || []).map(function(o) { return h('option', { key: o, value: o }, o); })
                  )
                : h('input', { className: 'atlas-input', type: type || 'number',
                                value: ips[key] != null ? ips[key] : '',
                                onChange: function(e) {
                                    var v = type === 'text' ? e.target.value : parseFloat(e.target.value);
                                    setIps(Object.assign({}, ips, { [key]: v }));
                                }
                              })
        );
    }
    return h('div', null,
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 } },
            field('Risk Tolerance (1–10)', 'risk_tolerance', 'number'),
            field('Risk Label', 'risk_label', 'select',
                ['Conservative', 'Moderate', 'Balanced', 'Growth', 'Aggressive']),
            field('Annual Return Target (%)', 'return_target', 'number'),
            field('Time Horizon', 'time_horizon', 'select',
                ['1–3 Years', '3–5 Years', '5–10 Years', '10 Years', '10+ Years']),
            field('Benchmark', 'benchmark', 'select',
                ['SPY', 'QQQ', 'IWM', 'AGG', 'Custom', 'None']),
            field('Max Single Position (%)', 'concentration_limit', 'number'),
            field('Liquidity Need', 'liquidity_need', 'select',
                ['Low', 'Medium', 'High', 'Very High'])
        ),
        h('div', { style: { display: 'flex', gap: 10 } },
            h('button', { className: 'btn btn-primary', onClick: onSave },
                saved ? '✓ IPS Saved · Update' : 'Save IPS & Unlock L2'),
            h('button', { className: 'btn btn-ghost',
                           onClick: function() { setIps(MOCK_PCM_IPS); } }, 'Reset')
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
            const mid    = (row.saa_floor + row.saa_ceil) / 2;
            const diff   = row.current_weight - mid;
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
function FactorGrid({ factors, loading, activeShare }) {
    if (loading) return h(Loading, { text: 'Computing factor exposures…' });
    return h('div', null,
        h('div', { className: 'kpi-grid kpi-grid-4' },
            factors.map(function(f) {
                const colorCls = f.score > 0.3  ? 'positive'
                               : f.score > 0    ? ''
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
        ),
        h('div', { className: 'atlas-card', style: { marginTop: 14, display: 'flex',
                                                      alignItems: 'center', gap: 24 } },
            h('div', { style: { textAlign: 'center', minWidth: 90 } },
                h('div', { style: { fontFamily: 'var(--font-display)', fontSize: 32,
                                     fontWeight: 800, color: 'var(--teal)' } },
                    activeShare != null ? activeShare.toFixed(0) + '%' : '—'),
                h('div', { className: 'kpi-label', style: { marginTop: 2 } }, 'Active Share vs EW')
            ),
            h('div', { style: { flex: 1 } },
                h('div', { style: { height: 6, background: 'var(--navy-3)',
                                     borderRadius: 3, overflow: 'hidden' } },
                    h('div', { style: { height: '100%',
                                         width: (activeShare || 0) + '%',
                                         background: 'linear-gradient(to right, var(--teal), var(--green))',
                                         borderRadius: 3 } })
                ),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 4,
                                     fontSize: 9, fontFamily: 'var(--font-mono)',
                                     color: 'var(--text-3)', letterSpacing: '0.10em' } },
                    h('span', null, '0% INDEX'),
                    h('span', null, '60% GENUINELY ACTIVE'),
                    h('span', null, '100% CONCENTRATED')
                )
            ),
            h('span', { className: 'chip ' + (activeShare >= 60 ? 'chip-green' : activeShare >= 30 ? 'chip-teal' : 'chip-gold') },
                activeShare >= 60 ? '✓ GENUINELY ACTIVE'
                : activeShare >= 30 ? 'SEMI-ACTIVE'
                : 'INDEX-LIKE'
            )
        )
    );
}

// ─── Layer 4: Risk Table + KPIs ──────────────────────────────────────────────
function RiskTable({ rows }) {
    return h('table', { className: 'atlas-table' },
        h('thead', null,
            h('tr', null, ['Ticker', 'Weight', 'Vol 90d', 'MRC', '% Risk', 'Risk Bar'].map(function(th) {
                return h('th', { key: th }, th);
            }))
        ),
        h('tbody', null,
            rows.map(function(r) {
                const warn = r.prc > 15;
                return h('tr', { key: r.ticker },
                    h('td', { className: 'cell-ticker' }, r.ticker),
                    h('td', null, r.weight.toFixed(1) + '%'),
                    h('td', null, r.vol_90d != null ? r.vol_90d.toFixed(1) + '%' : '—'),
                    h('td', null, r.mrc     != null ? r.mrc.toFixed(3) : '—'),
                    h('td', { className: warn ? 'neg' : '' }, r.prc != null ? r.prc.toFixed(1) + '%' : '—'),
                    h('td', { style: { width: 110 } },
                        h('div', { style: { height: 4, background: 'var(--navy-3)',
                                             borderRadius: 2, overflow: 'hidden' } },
                            h('div', { style: { height: '100%', borderRadius: 2,
                                                 background: warn ? 'var(--red)' : 'var(--gold)',
                                                 width: Math.min((r.prc || 0) * 4, 100) + '%' } })
                        )
                    )
                );
            })
        )
    );
}

// ─── Layer 5: Optimizer ──────────────────────────────────────────────────────
function OptimizerPanel({ positions, histBySymbol, ips, onResult, optimizerResult, dataReady }) {
    const [mode, setMode]         = useState('mvo');
    const [running, setRunning]   = useState(false);
    const [error, setError]       = useState(null);

    function run() {
        setRunning(true); setError(null);
        setTimeout(function() {
            try {
                const inputs = buildOptimizerInputs(positions, histBySymbol);
                if (!inputs || inputs.symbols.length < 2) {
                    setError('Insufficient price history to optimize. Need at least 2 positions with 30+ days of data.');
                    setRunning(false); return;
                }
                const result = runOptimizer(mode, inputs, ips ? ips.concentration_limit : null);
                onResult(result);
            } catch (e) {
                setError('Optimizer error: ' + e.message);
            }
            setRunning(false);
        }, 50); // yield to browser before heavy compute
    }

    if (!dataReady) return h('div', { style: { textAlign: 'center', padding: '30px 0', color: 'var(--text-3)' } },
        h(Loading, { text: 'Loading price history for optimization…' })
    );

    return h('div', null,
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' } },
            OPTIMIZER_MODES.map(function(m) {
                return h('button', { key: m.id,
                    className: 'btn ' + (mode === m.id ? 'btn-primary' : 'btn-ghost'),
                    style: { padding: '7px 12px' },
                    onClick: function() { setMode(m.id); },
                }, m.label);
            })
        ),
        error && h('div', { className: 'chip chip-red', style: { marginBottom: 12 } }, error),
        optimizerResult && h('div', null,
            h('div', { className: 'kpi-grid kpi-grid-3', style: { marginBottom: 16 } },
                [
                    { label: 'Expected Sharpe', value: optimizerResult.metrics.sharpe,           cls: 'positive' },
                    { label: 'Expected Return', value: optimizerResult.metrics.expectedReturn + '%', cls: 'positive' },
                    { label: 'Expected Vol',    value: optimizerResult.metrics.expectedVol + '%',    cls: 'warning'  },
                ].map(function(k) {
                    return h('div', { key: k.label, className: 'kpi-cell' },
                        h('div', { className: 'kpi-label' }, k.label),
                        h('div', { className: 'kpi-value ' + k.cls }, k.value)
                    );
                })
            ),
            h('div', { className: 'atlas-card', style: { marginBottom: 12 } },
                h('div', { className: 'card-title', style: { marginBottom: 10 } }, 'Optimal Weight Changes'),
                h('table', { className: 'atlas-table' },
                    h('thead', null,
                        h('tr', null, ['Ticker', 'Current', 'Optimal', 'Δ Weight', 'Action'].map(function(th) {
                            return h('th', { key: th }, th);
                        }))
                    ),
                    h('tbody', null,
                        optimizerResult.symbols.map(function(sym, i) {
                            const pos = positions.find(function(p) { return p.symbol === sym; });
                            const totalMv = positions.reduce(function(s, p) { return s + (p.market_value || 0); }, 0);
                            const curW = pos && totalMv > 0 ? (pos.market_value / totalMv * 100) : 0;
                            const optW = optimizerResult.weights[i] * 100;
                            const delta = optW - curW;
                            return h('tr', { key: sym },
                                h('td', { className: 'cell-ticker' }, sym),
                                h('td', null, curW.toFixed(1) + '%'),
                                h('td', null, optW.toFixed(1) + '%'),
                                h('td', { className: delta > 0.5 ? 'pos' : delta < -0.5 ? 'neg' : '' },
                                    (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%'),
                                h('td', null,
                                    Math.abs(delta) < 0.5 ? h('span', { className: 'chip chip-muted' }, 'HOLD')
                                    : h('span', { className: 'chip ' + (delta > 0 ? 'chip-green' : 'chip-red') },
                                        delta > 0 ? 'ADD' : 'TRIM')
                                )
                            );
                        })
                    )
                )
            )
        ),
        h('div', { style: { display: 'flex', gap: 10 } },
            h('button', { className: 'btn btn-primary', onClick: run, disabled: running },
                running ? 'Running…' : (optimizerResult ? '↺ Re-run ' : '▶ Run ') + OPTIMIZER_MODES.find(function(m) { return m.id === mode; }).label
            )
        )
    );
}

// ─── Layer 6: Rebalancing Engine ─────────────────────────────────────────────
function TradeList({ trades, onExecute }) {
    return h('table', { className: 'atlas-table' },
        h('thead', null,
            h('tr', null,
                ['Ticker', 'Action', onExecute ? 'Δ Shares' : 'Δ Weight', 'Est. Value', 'Rationale', onExecute ? '' : null]
                    .filter(Boolean).map(function(th) { return h('th', { key: th || 'x' }, th); })
            )
        ),
        h('tbody', null,
            trades.map(function(t, i) {
                return h('tr', { key: t.ticker + i },
                    h('td', { className: 'cell-ticker' }, t.ticker),
                    h('td', null, h('span', { className: 'chip ' + (t.action === 'BUY' ? 'chip-green' : 'chip-red') }, t.action)),
                    h('td', { className: t.action === 'BUY' ? 'pos' : 'neg' },
                        t.delta_shares != null ? (t.action === 'BUY' ? '+' : '') + t.delta_shares
                        : t.delta_pct   != null ? (t.delta_pct >= 0 ? '+' : '') + t.delta_pct.toFixed(1) + '%'
                        : '—'
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

function RebalancingPanel({ positions, drift, optimizerResult }) {
    // If L5 ran, generate ticker-level trades from optimizer output
    if (optimizerResult && optimizerResult.symbols && optimizerResult.symbols.length > 0) {
        const totalMv = positions.reduce(function(s, p) { return s + (p.market_value || 0); }, 0);
        const trades = optimizerResult.symbols.map(function(sym, i) {
            const pos   = positions.find(function(p) { return p.symbol === sym; });
            const curW  = pos && totalMv > 0 ? pos.market_value / totalMv : 0;
            const optW  = optimizerResult.weights[i];
            const delta = optW - curW;
            if (Math.abs(delta) < 0.003) return null; // skip tiny drifts
            const deltaValue = delta * totalMv;
            const price = pos ? pos.market_value / Math.max(pos.quantity || 1, 0.001) : 0;
            const deltaShares = price > 0 ? Math.round(deltaValue / price) : null;
            return {
                ticker:       sym,
                action:       delta > 0 ? 'BUY' : 'SELL',
                delta_shares: deltaShares,
                delta_pct:    delta * 100,
                est_value:    Math.abs(deltaValue),
                rationale:    'Optimizer Δ: ' + (delta >= 0 ? '+' : '') + (delta * 100).toFixed(1) + '% vs current',
            };
        }).filter(Boolean).sort(function(a, b) { return Math.abs(b.est_value) - Math.abs(a.est_value); });

        const totalTrades = Math.abs(trades.reduce(function(s, t) {
            return s + (t.action === 'SELL' ? -t.est_value : t.est_value);
        }, 0));

        return h('div', null,
            h('div', { className: 'chip chip-teal', style: { marginBottom: 14, display: 'inline-block' } },
                '⬡ ATLAS Optimizer · ' + trades.length + ' trades · ~' + fmtCurrency(totalTrades / 2) + ' turnover'
            ),
            h('div', { className: 'atlas-card' },
                h('div', { className: 'card-title' }, 'Proposed Trades · Review Before Executing'),
                trades.length > 0
                    ? h(TradeList, { trades: trades, onExecute: function(t) { console.log('[PCM] Execute:', t); } })
                    : h('div', { style: { color: 'var(--text-3)', padding: '20px 0', textAlign: 'center' } },
                        'Portfolio is already close to optimal. No significant trades required.')
            )
        );
    }

    // Fallback: asset-class level drift from vw_pcm_drift
    return h('div', null,
        drift && drift.trigger_fired && h('div', { className: 'atlas-card red',
            style: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 } },
            h('div', { style: { fontSize: 22 } }, '⚠'),
            h('div', null,
                h('div', { style: { fontFamily: 'var(--font-display)', fontSize: 16,
                                     fontWeight: 700, color: 'var(--red)' } }, 'Rebalancing Triggered'),
                h('div', { style: { fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' } },
                    'Aggregate drift ' + (drift.aggregate_drift || 0).toFixed(1) + '% exceeds threshold'
                )
            ),
            h('div', { style: { marginLeft: 'auto', fontFamily: 'var(--font-display)',
                                 fontSize: 32, fontWeight: 800, color: 'var(--red)' } },
                (drift.aggregate_drift || 0).toFixed(1) + '%'
            )
        ),
        h('div', { className: 'atlas-card' },
            h('div', { className: 'card-title' }, 'Asset-Class Drift · Run L5 Optimizer for Ticker-Level Trades'),
            drift && drift.trades && drift.trades.length > 0
                ? h(TradeList, { trades: drift.trades.map(function(t) {
                    return Object.assign({}, t, {
                        delta_pct: t.delta_pct || null,
                        est_value: null,
                    });
                  })})
                : h('div', { style: { color: 'var(--text-3)', padding: 20, textAlign: 'center' } },
                    'No drift data. Complete L5 to generate ticker-level trades.')
        ),
        h('div', { className: 'chip chip-muted', style: { marginTop: 12, display: 'inline-block' } },
            '💡 Complete Layer 5 to unlock ticker-level trade recommendations'
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
            var result = data.result || data;
            if (typeof result === 'string') {
                try { result = JSON.parse(result.replace(/```json|```/g, '').trim()); }
                catch (e) { result = { executive_summary: result }; }
            }
            setReport(result); setLoading(false);
        })
        .catch(function(e) { setError('Report generation failed: ' + e.message); setLoading(false); });
    }

    if (loading) return h(Loading, { text: 'Synthesising portfolio construction report…' });

    if (!report) return h('div', { style: { textAlign: 'center', padding: '40px 0' } },
        h('div', { style: { fontSize: 36, opacity: 0.25, marginBottom: 12, color: 'var(--teal)' } }, '⬡'),
        h('div', { style: { color: 'var(--text-2)', fontSize: 12, marginBottom: 20 } },
            'Synthesise the 6 prior layers into an investment committee memo.'
        ),
        error && h('div', { className: 'chip chip-red', style: { marginBottom: 14 } }, error),
        h('button', { className: 'btn btn-primary', onClick: generate },
            '⬡  Generate ATLAS Intelligence Report')
    );

    return h('div', null,
        h('div', { style: { background: 'var(--teal-glow)', border: '1px solid var(--teal-dim)',
                             borderRadius: 8, padding: '18px 20px', marginBottom: 16 } },
            h('div', { className: 'atlas-module-tag' }, 'ATLAS Intelligence · Construction Report'),
            h('div', { style: { fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7,
                                 fontFamily: 'var(--font-body)' } }, report.executive_summary)
        ),
        report.risk_commentary && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr',
                                                        gap: 14, marginBottom: 16 } },
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

// ─── Right sidebar ────────────────────────────────────────────────────────────
function LayerSidebar({ layerStatus, ips, activeLayer, setActive }) {
    const completeCount = Object.values(layerStatus).filter(function(s) { return s === 'complete'; }).length;
    return h('div', null,
        h('div', { className: 'atlas-sidebar-card' },
            h('div', { className: 'atlas-sidebar-card-title' }, 'Active IPS'),
            ips ? [
                ['Risk',      (ips.risk_tolerance || '—') + ' / 10 · ' + (ips.risk_label || '')],
                ['Target',    (ips.return_target  || '—') + '% p.a.'],
                ['Horizon',   ips.time_horizon   || '—'],
                ['Benchmark', ips.benchmark      || '—'],
                ['Max Pos.',  (ips.concentration_limit || '—') + '%'],
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
                const status  = layerStatus[layer.id] || 'incomplete';
                const isActive = layer.id === activeLayer;
                const chipCls = status === 'complete' ? 'chip-green'
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
    const [ips, setIps]                     = useState(MOCK_PCM_IPS);
    const [ipsSaved, setIpsSaved]           = useState(false);
    const [alloc, setAlloc]                 = useState(MOCK_PCM_ALLOCATION);
    const [factors, setFactors]             = useState(MOCK_PCM_FACTORS);
    const [factorLoading, setFactorLoading] = useState(false);
    const [risk, setRisk]                   = useState(MOCK_PCM_RISK);
    const [drift, setDrift]                 = useState(MOCK_PCM_DRIFT);
    const [portfolioMetrics, setPortfolioMetrics] = useState(null);
    const [activeLayer, setActiveLayer]     = useState('L1');
    const [layerStatus, setLayerStatus]     = useState({
        L1: 'active', L2: 'locked', L3: 'locked',
        L4: 'locked', L5: 'locked', L6: 'locked', L7: 'locked',
    });
    const [optimizerResult, setOptimizerResult] = useState(null);

    // Price history cache for L3/L4/L5
    const histRef   = useRef({});   // { SYMBOL: [{ close }] }
    const posRef    = useRef([]);   // current positions snapshot
    const [histReady, setHistReady] = useState(false);

    // ── Load IPS from DB on mount ─────────────────────────────────────────────
    useEffect(function() {
        if (!sb) return;
        sb.from('portfolio_ips').select('*').limit(1).then(function(res) {
            if (res.data && res.data.length) {
                const saved = res.data[0];
                setIps({
                    risk_tolerance:      saved.risk_tolerance,
                    risk_label:          saved.risk_label,
                    return_target:       saved.return_target,
                    time_horizon:        saved.time_horizon,
                    benchmark:           saved.benchmark,
                    concentration_limit: saved.concentration_limit,
                    liquidity_need:      saved.liquidity_need,
                });
                setIpsSaved(true);
                // If IPS exists, unlock L2 automatically
                setLayerStatus(function(prev) {
                    return Object.assign({}, prev, { L1: 'complete', L2: 'active' });
                });
            }
        });
    }, []);

    // ── Load PCM view data ────────────────────────────────────────────────────
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

    // ── Load positions + price history for L3/L4/L5 ──────────────────────────
    useEffect(function() {
        if (!sb) { setHistReady(true); return; }
        setFactorLoading(true);

        // 1. Get positions with asset info
        Promise.all([
            sb.from('positions').select('asset_id, quantity, market_value, average_cost'),
            sb.from('assets').select('id, symbol, name'),
        ]).then(function(results) {
            const positions = results[0].data || [];
            const assets    = results[1].data || [];
            const assetMap  = {};
            assets.forEach(function(a) { assetMap[a.id] = a; });

            const posWithSymbol = positions
                .filter(function(p) { return p.market_value > 0 && assetMap[p.asset_id]; })
                .map(function(p) {
                    const a = assetMap[p.asset_id];
                    return { symbol: a.symbol, asset_id: p.asset_id,
                             market_value: p.market_value, quantity: p.quantity,
                             average_cost: p.average_cost };
                });
            posRef.current = posWithSymbol;

            if (!posWithSymbol.length) {
                setHistReady(true); setFactorLoading(false); return;
            }

            const assetIds   = posWithSymbol.map(function(p) { return p.asset_id; });
            const cutoffDate = new Date();
            cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
            const cutoff = cutoffDate.toISOString().slice(0, 10);

            // 2. Fetch price history for all positions in one query
            return sb.from('price_history')
                .select('asset_id, price_date, close')
                .in('asset_id', assetIds)
                .gte('price_date', cutoff)
                .order('price_date', { ascending: true })
                .limit(posWithSymbol.length * 260)
                .then(function(ph) {
                    // Group by asset_id → symbol
                    const byAsset = {};
                    (ph.data || []).forEach(function(row) {
                        if (!byAsset[row.asset_id]) byAsset[row.asset_id] = [];
                        byAsset[row.asset_id].push({ close: parseFloat(row.close) });
                    });
                    const bySymbol = {};
                    posWithSymbol.forEach(function(p) {
                        if (byAsset[p.asset_id]) bySymbol[p.symbol] = byAsset[p.asset_id];
                    });
                    histRef.current = bySymbol;
                    setHistReady(true);

                    // Compute factors
                    const fs = computeFactorScores(posWithSymbol, bySymbol);
                    if (fs) setFactors(fs);
                    setFactorLoading(false);

                    // Compute portfolio metrics (needs equity snapshots too)
                    return sb.from('account_snapshots')
                        .select('as_of, equity')
                        .order('as_of', { ascending: true })
                        .limit(252)
                        .then(function(snaps) {
                            const metrics = computePortfolioMetrics(posWithSymbol, bySymbol, snaps.data || []);
                            if (metrics) setPortfolioMetrics(metrics);
                        });
                });
        }).catch(function(err) {
            console.warn('[PCM] price history load failed:', err);
            setHistReady(true); setFactorLoading(false);
        });
    }, []);

    // ── Active Share vs equal-weight benchmark ────────────────────────────────
    const activeShare = (function() {
        const pos = posRef.current;
        if (!pos.length) return null;
        const totalMv = pos.reduce(function(s, p) { return s + (p.market_value || 0); }, 0);
        const ewTarget = 1 / pos.length;
        const sumDiff = pos.reduce(function(s, p) {
            return s + Math.abs((p.market_value || 0) / totalMv - ewTarget);
        }, 0);
        return Math.min(sumDiff * 50, 100); // 0.5 scale factor to normalise
    }());

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
            sb.from('portfolio_ips').upsert([Object.assign({ id: 1 }, {
                risk_tolerance:      ips.risk_tolerance,
                risk_label:          ips.risk_label,
                return_target:       ips.return_target,
                time_horizon:        ips.time_horizon,
                benchmark:           ips.benchmark,
                concentration_limit: ips.concentration_limit,
                liquidity_need:      ips.liquidity_need,
            })], { onConflict: 'id' }).then(function(r) {
                if (r.error) console.warn('[PCM] IPS save:', r.error);
            });
        }
        completeLayer('L1');
    }

    function nextBtn(layerId) {
        const idx  = LAYERS.findIndex(function(l) { return l.id === layerId; });
        const next = LAYERS[idx + 1];
        return h('div', { style: { marginTop: 18 } },
            h('button', { className: 'btn btn-primary',
                onClick: function() { completeLayer(layerId); } },
                'Mark Complete → Unlock ' + (next ? next.id + ' · ' + next.label : 'Report')
            )
        );
    }

    function renderLayer() {
        const status = layerStatus[activeLayer] || 'incomplete';
        if (status === 'locked') {
            return h('div', { style: { textAlign: 'center', padding: '40px 0' } },
                h('div', { style: { fontSize: 24, opacity: 0.25, marginBottom: 10 } }, '🔒'),
                h('div', { style: { color: 'var(--text-3)', fontSize: 12 } },
                    'Complete prior layers to unlock ' + activeLayer)
            );
        }

        if (activeLayer === 'L1') return h(IPSForm, { ips: ips, setIps: setIps, onSave: saveIPS, saved: ipsSaved });

        if (activeLayer === 'L2') return h('div', null,
            h(AllocationGap, { rows: alloc }),
            nextBtn('L2')
        );

        if (activeLayer === 'L3') return h('div', null,
            h(FactorGrid, { factors: factors, loading: factorLoading, activeShare: activeShare }),
            nextBtn('L3')
        );

        if (activeLayer === 'L4') {
            const m = portfolioMetrics;
            const kpis = [
                { label: 'Portfolio Vol (Ann.)',    value: m && m.portfolioVol ? m.portfolioVol + '%' : '—',
                  sub: '90-day realised', cls: m && parseFloat(m.portfolioVol) > 25 ? 'negative' : 'warning' },
                { label: 'Diversification Ratio',  value: m && m.diversificationRatio ? m.diversificationRatio : '—',
                  sub: 'Weighted avg vol / port vol', cls: m && parseFloat(m.diversificationRatio) > 1.2 ? 'positive' : '' },
                { label: 'Risk HHI',                value: m ? m.riskHHI : '—',
                  sub: 'Lower = more diversified', cls: m && parseFloat(m.riskHHI) > 0.05 ? 'negative' : 'positive' },
                { label: 'Weighted Avg Vol',        value: m && m.weightedAvgVol ? m.weightedAvgVol + '%' : '—',
                  sub: 'Individual position vols', cls: '' },
            ];
            return h('div', null,
                h('div', { className: 'kpi-grid kpi-grid-4', style: { marginBottom: 16 } },
                    kpis.map(function(k) {
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
        }

        if (activeLayer === 'L5') return h('div', null,
            h(OptimizerPanel, {
                positions:      posRef.current,
                histBySymbol:   histRef.current,
                ips:            ips,
                onResult:       function(r) { setOptimizerResult(r); },
                optimizerResult: optimizerResult,
                dataReady:      histReady,
            }),
            optimizerResult && nextBtn('L5')
        );

        if (activeLayer === 'L6') return h('div', null,
            h(RebalancingPanel, {
                positions:       posRef.current,
                drift:           drift,
                optimizerResult: optimizerResult,
            }),
            nextBtn('L6')
        );

        if (activeLayer === 'L7') return h(AIReport, {
            ips: ips, allocation: alloc, factors: factors, risk: risk, drift: drift,
        });

        return null;
    }

    const currentLayer  = LAYERS.find(function(l) { return l.id === activeLayer; });
    const currentStatus = layerStatus[activeLayer] || 'incomplete';
    const accentMod = currentStatus === 'complete' ? ' green' : '';

    return h('div', null,
        h('div', { className: 'atlas-page-header' },
            h('div', { className: 'atlas-module-tag' }, 'CONSTRUCT · 7-LAYER DECISION ENGINE'),
            h('div', { className: 'atlas-page-title' }, 'Portfolio Construction'),
            h('div', { className: 'atlas-page-subtitle' },
                'IPS → Allocation → Factors → Risk → Optimizer → Rebalancing → Report'
            )
        ),
        h(LayerTabBar, { layerStatus: layerStatus, activeLayer: activeLayer, setActive: setActiveLayer }),
        h('div', { className: 'pcm-layout' },
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
            h(LayerSidebar, {
                layerStatus:  layerStatus,
                ips:          ipsSaved ? ips : null,
                activeLayer:  activeLayer,
                setActive:    setActiveLayer,
            })
        )
    );
}
