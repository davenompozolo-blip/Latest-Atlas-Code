// ============================================================
// ATLAS Terminal — Portfolio Construction Module (PCM)
// Decision Engine · 7-Layer Pipeline
// ============================================================

import { sb, loadView } from './config.js';
import {
    MOCK_PCM_IPS, MOCK_PCM_ALLOCATION, MOCK_PCM_FACTORS,
    MOCK_PCM_RISK, MOCK_PCM_DRIFT,
} from './config.js';
import { fmtPct, fmtCurrency } from './utils.js';
import { Loading, EmptyState } from './components.js';

var _R        = React;
var useState  = _R.useState;
var useEffect = _R.useEffect;
var h         = _R.createElement;

// ─── Layer metadata ───────────────────────────────────────────────────────────
var LAYERS = [
    { id: 'L1', label: 'IPS',         full: 'IPS Builder',         sub: 'Investment Policy Statement'     },
    { id: 'L2', label: 'SAA',         full: 'SAA / TAA Engine',    sub: 'Strategic & Tactical Allocation' },
    { id: 'L3', label: 'FACTOR',      full: 'Factor Exposure',     sub: 'Factor Tilts · Active Share'     },
    { id: 'L4', label: 'RISK',        full: 'Risk Budget Console', sub: 'Marginal Risk · Correlation'     },
    { id: 'L5', label: 'OPTIMIZER',   full: 'Portfolio Optimizer', sub: 'MVO · ERC · Constraints'         },
    { id: 'L6', label: 'REBALANCING', full: 'Rebalancing Engine',  sub: 'Drift · Trade Generation'        },
    { id: 'L7', label: 'REPORT',      full: 'Construction Report', sub: 'AI Synthesis · Decision Output'  },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────
function layerDot(status) {
    var color = status === 'complete' ? 'var(--green)'
              : status === 'active'   ? 'var(--cyan)'
              : 'rgba(255,255,255,0.2)';
    return h('span', {
        style: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                 background: color, marginTop: 4 },
    });
}

function fieldLabel(label) {
    return h('div', {
        style: { fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                 textTransform: 'uppercase', letterSpacing: 2,
                 color: 'var(--text-muted)', marginBottom: 6 },
    }, label);
}

var inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--card-border)', borderRadius: 6,
    padding: '8px 12px', color: 'var(--text)',
    fontFamily: "'JetBrains Mono',monospace", fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
};

var selectStyle = {
    width: '100%', background: 'var(--card)',
    border: '1px solid var(--card-border)', borderRadius: 6,
    padding: '8px 12px', color: 'var(--text)',
    fontFamily: "'JetBrains Mono',monospace", fontSize: 13,
    outline: 'none',
};

function btnPrimary(label, onClick) {
    return h('button', {
        onClick: onClick,
        style: {
            background: 'var(--cyan)', color: '#000', border: 'none', borderRadius: 6,
            padding: '9px 20px', fontFamily: "'JetBrains Mono',monospace",
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: 1, cursor: 'pointer',
        },
    }, label);
}

// ─── Layer 1: IPS Form ────────────────────────────────────────────────────────
function IPSForm(_a) {
    var ips    = _a.ips;
    var setIps = _a.setIps;
    var onSave = _a.onSave;

    function patch(key, val) {
        var next = Object.assign({}, ips); next[key] = val; setIps(next);
    }

    var grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 };

    return h('div', null,
        h('div', { style: grid2 },
            // Risk slider
            h('div', { style: { marginBottom: 16 } },
                fieldLabel('Risk Tolerance (1–10)'),
                h('input', {
                    type: 'range', min: 1, max: 10, step: 1,
                    value: ips.risk_tolerance || 5,
                    onChange: function(e) {
                        var v = parseInt(e.target.value);
                        patch('risk_tolerance', v);
                        patch('risk_label', v <= 3 ? 'Conservative' : v <= 6 ? 'Moderate' : 'Aggressive');
                    },
                    style: { width: '100%', accentColor: 'var(--cyan)' },
                }),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10,
                                     color: 'var(--text-muted)', marginTop: 4,
                                     fontFamily: "'JetBrains Mono',monospace" } },
                    h('span', null, 'Conservative'),
                    h('span', { style: { color: 'var(--cyan)' } },
                        (ips.risk_tolerance || 5) + ' / 10 — ' + (ips.risk_label || 'Moderate')
                    ),
                    h('span', null, 'Aggressive')
                )
            ),
            // Return target
            h('div', { style: { marginBottom: 16 } },
                fieldLabel('Annual Return Target (%)'),
                h('input', Object.assign({}, { type: 'number', step: 0.5 }, inputStyle, {
                    value: ips.return_target || '',
                    onChange: function(e) { patch('return_target', parseFloat(e.target.value)); },
                    style: inputStyle,
                }))
            )
        ),
        h('div', { style: grid2 },
            h('div', { style: { marginBottom: 16 } },
                fieldLabel('Time Horizon'),
                h('select', {
                    value: ips.time_horizon || '10 Years',
                    onChange: function(e) { patch('time_horizon', e.target.value); },
                    style: selectStyle,
                }, ['1 Year','3 Years','5 Years','10 Years','20+ Years'].map(function(o) {
                    return h('option', { key: o, value: o }, o);
                }))
            ),
            h('div', { style: { marginBottom: 16 } },
                fieldLabel('Benchmark'),
                h('select', {
                    value: ips.benchmark || 'SPY',
                    onChange: function(e) { patch('benchmark', e.target.value); },
                    style: selectStyle,
                }, ['SPY','MSCI World','MSCI EM','Custom'].map(function(o) {
                    return h('option', { key: o, value: o }, o);
                }))
            )
        ),
        h('div', { style: grid2 },
            h('div', { style: { marginBottom: 16 } },
                fieldLabel('Max Single Position (%)'),
                h('input', {
                    type: 'number', step: 1, min: 1, max: 100,
                    value: ips.concentration_limit || '',
                    onChange: function(e) { patch('concentration_limit', parseFloat(e.target.value)); },
                    style: inputStyle,
                })
            ),
            h('div', { style: { marginBottom: 16 } },
                fieldLabel('Liquidity Need'),
                h('select', {
                    value: ips.liquidity_need || 'Medium',
                    onChange: function(e) { patch('liquidity_need', e.target.value); },
                    style: selectStyle,
                }, ['Low','Medium','High'].map(function(o) {
                    return h('option', { key: o, value: o }, o);
                }))
            )
        ),
        h('div', { style: { marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' } },
            btnPrimary('Save IPS', onSave),
            h('button', {
                onClick: function() { setIps(MOCK_PCM_IPS); },
                style: {
                    background: 'transparent', color: 'var(--text-sec)',
                    border: '1px solid var(--card-border)', borderRadius: 6,
                    padding: '8px 16px', fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 11, cursor: 'pointer',
                },
            }, 'Reset to Demo')
        )
    );
}

// ─── Layer 2: SAA / TAA Allocation Gap ───────────────────────────────────────
function AllocationGap(_a) {
    var rows = _a.rows;

    function miniBar(pct, color) {
        return h('div', {
            style: { height: 6, borderRadius: 3, width: '100%',
                     background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: 3 },
        },
            h('div', { style: { height: '100%', width: Math.min(pct, 100) + '%', background: color,
                                 borderRadius: 3, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)' } })
        );
    }

    return h('div', null,
        h('div', { style: { display: 'flex', gap: 16, fontSize: 10, color: 'var(--text-muted)',
                             fontFamily: "'JetBrains Mono',monospace", marginBottom: 12 } },
            ['Current|rgba(255,255,255,0.3)', 'SAA Target|var(--cyan)', 'TAA Tilt|var(--amber)'].map(function(pair) {
                var parts = pair.split('|');
                return h('span', { key: parts[0] },
                    h('span', { style: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                          background: parts[1], marginRight: 5 } }),
                    parts[0]
                );
            })
        ),
        rows.map(function(row) {
            var mid = (row.saa_floor + row.saa_ceil) / 2;
            var diff = row.current_weight - mid;
            var inBand = row.current_weight >= row.saa_floor && row.current_weight <= row.saa_ceil;
            var diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '% ' + (diff >= 0 ? 'OW' : 'UW');
            return h('div', {
                key: row.asset_class,
                style: { display: 'grid', gridTemplateColumns: '130px 1fr 110px',
                         alignItems: 'center', gap: 14, marginBottom: 14 },
            },
                h('div', { style: { fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
                                     color: 'var(--text-sec)' } },
                    row.asset_class.replace('_', ' ')
                ),
                h('div', null,
                    miniBar(row.current_weight, 'rgba(255,255,255,0.3)'),
                    miniBar(mid, 'var(--cyan)'),
                    miniBar(row.taa_target, 'var(--amber)')
                ),
                h('span', { className: 'badge ' + (inBand ? 'green' : 'amber') },
                    inBand ? 'In Band' : diffStr
                )
            );
        })
    );
}

// ─── Layer 3: Factor Grid ─────────────────────────────────────────────────────
function FactorGrid(_a) {
    var factors = _a.factors;

    return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 } },
        factors.map(function(f) {
            var color = f.score > 0.5  ? 'var(--green)'
                      : f.score > 0    ? 'var(--cyan)'
                      : f.score > -0.3 ? 'var(--text-sec)'
                      : 'var(--red)';
            return h('div', { key: f.factor, className: 'metric-card',
                               style: { textAlign: 'center', padding: '16px 12px' } },
                h('div', { className: 'label' }, f.factor),
                h('div', { className: 'value', style: { color: color, fontSize: 28 } },
                    (f.score >= 0 ? '+' : '') + f.score.toFixed(2)
                ),
                h('div', { className: 'sub' }, f.direction)
            );
        })
    );
}

// ─── Layer 4: Risk Budget Table ───────────────────────────────────────────────
function RiskTable(_a) {
    var rows = _a.rows;
    return h('table', { className: 'data-table', style: { width: '100%' } },
        h('thead', null,
            h('tr', null, ['Ticker','Weight','Vol 90d','MRC','% Risk','Risk Bar'].map(function(th) {
                return h('th', { key: th }, th);
            }))
        ),
        h('tbody', null,
            rows.map(function(r) {
                var warn = r.prc > 15;
                return h('tr', { key: r.ticker },
                    h('td', { style: { color: 'var(--cyan)', fontWeight: 700 } }, r.ticker),
                    h('td', null, r.weight.toFixed(1) + '%'),
                    h('td', null, r.vol_90d.toFixed(1) + '%'),
                    h('td', null, r.mrc.toFixed(3)),
                    h('td', { style: { color: warn ? 'var(--red)' : 'var(--text)' } }, r.prc.toFixed(1) + '%'),
                    h('td', { style: { width: 100 } },
                        h('div', { style: { height: 4, background: 'rgba(255,255,255,0.08)',
                                             borderRadius: 2, overflow: 'hidden' } },
                            h('div', { style: { height: '100%', borderRadius: 2,
                                                 background: warn ? 'var(--red)' : 'var(--amber)',
                                                 width: Math.min(r.prc * 4, 100) + '%' } })
                        )
                    )
                );
            })
        )
    );
}

// ─── Trade List (shared by L6 + L7) ──────────────────────────────────────────
function TradeList(_a) {
    var trades    = _a.trades;
    var onExecute = _a.onExecute;

    return h('table', { className: 'data-table', style: { width: '100%' } },
        h('thead', null,
            h('tr', null, ['Ticker','Action','Δ Shares','Est. Value','Rationale',''].map(function(th) {
                return h('th', { key: th }, th);
            }))
        ),
        h('tbody', null,
            trades.map(function(t) {
                return h('tr', { key: t.ticker + t.action },
                    h('td', { style: { color: 'var(--cyan)', fontWeight: 700 } }, t.ticker),
                    h('td', null,
                        h('span', { className: 'badge ' + (t.action === 'BUY' ? 'green' : 'red') }, t.action)
                    ),
                    h('td', { style: { color: t.action === 'BUY' ? 'var(--green)' : 'var(--red)' } },
                        (t.action === 'BUY' ? '+' : '') + (t.delta_shares || 0)
                    ),
                    h('td', null, t.est_value ? fmtCurrency(t.est_value) : '—'),
                    h('td', { style: { color: 'var(--text-sec)', fontSize: 11 } }, t.rationale),
                    onExecute && h('td', null,
                        h('button', {
                            onClick: function() { onExecute(t); },
                            style: {
                                background: 'rgba(16,185,129,0.15)', color: 'var(--green)',
                                border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4,
                                padding: '3px 10px', fontFamily: "'JetBrains Mono',monospace",
                                fontSize: 10, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1,
                            },
                        }, 'Execute')
                    )
                );
            })
        )
    );
}

// ─── Layer 7: AI Report ───────────────────────────────────────────────────────
function AIReport(_a) {
    var ips        = _a.ips;
    var allocation = _a.allocation;
    var factors    = _a.factors;
    var risk       = _a.risk;
    var drift      = _a.drift;

    var _s1 = useState(null);  var report  = _s1[0]; var setReport  = _s1[1];
    var _s2 = useState(false); var loading = _s2[0]; var setLoading = _s2[1];
    var _s3 = useState(null);  var error   = _s3[0]; var setError   = _s3[1];

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
                try { result = JSON.parse(result.replace(/```json|```/g, '').trim()); } catch(e) {
                    result = { executive_summary: result };
                }
            }
            setReport(result);
            setLoading(false);
        })
        .catch(function(e) {
            setError('Report generation failed: ' + e.message);
            setLoading(false);
        });
    }

    if (loading) return h(Loading, null);

    if (!report) {
        return h('div', { style: { textAlign: 'center', padding: '48px 0' } },
            h('div', { style: { fontSize: 36, opacity: 0.2, marginBottom: 12 } }, '⬡'),
            h('div', { style: { color: 'var(--text-sec)', fontSize: 13, marginBottom: 20 } },
                'Complete all 6 prior layers before generating the AI synthesis report.'
            ),
            error && h('div', { style: { color: 'var(--red)', fontSize: 12, marginBottom: 16,
                                          fontFamily: "'JetBrains Mono',monospace" } }, error),
            btnPrimary('⬡  Generate ATLAS Intelligence Report', generate)
        );
    }

    return h('div', null,
        // Executive summary callout
        h('div', { style: {
            background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 10, padding: '20px 24px', marginBottom: 20,
        } },
            h('div', { style: { fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                                 color: 'var(--cyan)', textTransform: 'uppercase',
                                 letterSpacing: 2, marginBottom: 8 } },
                'ATLAS Intelligence · Portfolio Construction Report'
            ),
            h('div', { style: { fontSize: 14, color: 'var(--text)', lineHeight: 1.7 } },
                report.executive_summary
            )
        ),
        // Risks / mitigants
        report.risk_commentary && h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 } },
            h('div', { className: 'card' },
                h('div', { className: 'card-title' }, 'Key Risks'),
                h('ul', { style: { paddingLeft: 18, margin: 0 } },
                    (report.risk_commentary.key_risks || []).map(function(r, i) {
                        return h('li', { key: i, style: { color: 'var(--text-sec)', fontSize: 12, marginBottom: 6 } }, r);
                    })
                )
            ),
            h('div', { className: 'card' },
                h('div', { className: 'card-title' }, 'Mitigants'),
                h('ul', { style: { paddingLeft: 18, margin: 0 } },
                    (report.risk_commentary.mitigants || []).map(function(m, i) {
                        return h('li', { key: i, style: { color: 'var(--text-sec)', fontSize: 12, marginBottom: 6 } }, m);
                    })
                )
            )
        ),
        // AI trade recommendations
        report.trade_recommendations && report.trade_recommendations.length > 0 &&
            h('div', { className: 'card' },
                h('div', { className: 'card-title' }, 'Trade Recommendations'),
                h(TradeList, {
                    trades: report.trade_recommendations.map(function(t) {
                        return { ticker: t.ticker, action: t.action, delta_shares: null,
                                 est_value: null, rationale: t.rationale };
                    }),
                    onExecute: null,
                })
            ),
        // Regenerate button
        h('div', { style: { marginTop: 16 } },
            h('button', {
                onClick: function() { setReport(null); },
                style: {
                    background: 'transparent', color: 'var(--text-sec)',
                    border: '1px solid var(--card-border)', borderRadius: 6,
                    padding: '8px 16px', fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 10, cursor: 'pointer',
                },
            }, 'Regenerate Report')
        )
    );
}

// ─── Layer Tab Bar ────────────────────────────────────────────────────────────
function LayerTabBar(_a) {
    var layerStatus = _a.layerStatus;
    var activeLayer = _a.activeLayer;
    var setActive   = _a.setActive;

    return h('div', {
        style: {
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
            background: 'var(--card)', borderRadius: 10,
            border: '1px solid var(--card-border)', marginBottom: 24, overflow: 'hidden',
        },
    },
        LAYERS.map(function(layer, i) {
            var status   = layerStatus[layer.id] || 'incomplete';
            var isActive = layer.id === activeLayer;
            var dotColor = status === 'complete' ? 'var(--green)' : isActive ? 'var(--cyan)' : 'rgba(255,255,255,0.2)';
            return h('div', {
                key: layer.id,
                onClick: function() { if (status !== 'locked') setActive(layer.id); },
                style: {
                    padding: '12px 8px', textAlign: 'center',
                    borderRight: i < 6 ? '1px solid var(--card-border)' : 'none',
                    background: isActive ? 'rgba(0,212,255,0.06)' : 'transparent',
                    cursor: status === 'locked' ? 'default' : 'pointer',
                    borderBottom: isActive ? '2px solid var(--cyan)' : '2px solid transparent',
                    opacity: status === 'locked' ? 0.4 : 1,
                    transition: 'background 0.15s',
                },
            },
                h('div', { style: { fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
                                     fontWeight: 700, color: dotColor, letterSpacing: 1 } }, layer.id),
                h('div', { style: { fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                                     color: isActive ? 'var(--text)' : 'var(--text-muted)',
                                     marginTop: 3, letterSpacing: 0.5 } }, layer.label),
                layerDot(isActive ? 'active' : status)
            );
        })
    );
}

// ─── Right Sidebar ────────────────────────────────────────────────────────────
function LayerSidebar(_a) {
    var layerStatus = _a.layerStatus;
    var ips         = _a.ips;
    var activeLayer = _a.activeLayer;
    var setActive   = _a.setActive;

    var completeCount = Object.values(layerStatus).filter(function(s) { return s === 'complete'; }).length;

    return h('div', { style: { width: 280, flexShrink: 0 } },
        // IPS summary
        h('div', { className: 'card', style: { marginBottom: 16, padding: '16px 18px' } },
            h('div', { className: 'card-title' }, 'Active IPS'),
            ips
                ? [
                    ['Risk Tolerance', (ips.risk_tolerance || '—') + ' / 10 — ' + (ips.risk_label || '')],
                    ['Return Target',  (ips.return_target  || '—') + '% p.a.'],
                    ['Time Horizon',   ips.time_horizon   || '—'],
                    ['Benchmark',      ips.benchmark      || '—'],
                    ['Max Position',   (ips.concentration_limit || '—') + '%'],
                  ].map(function(pair) {
                      return h('div', { key: pair[0], style: { display: 'flex', justifyContent: 'space-between',
                                                                borderBottom: '1px solid var(--card-border)',
                                                                padding: '7px 0', alignItems: 'baseline' } },
                          h('span', { style: { fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                                                textTransform: 'uppercase', letterSpacing: 1,
                                                color: 'var(--text-muted)' } }, pair[0]),
                          h('span', { style: { fontSize: 12, fontFamily: "'JetBrains Mono',monospace",
                                                color: 'var(--cyan)', fontWeight: 600 } }, pair[1])
                      );
                  })
                : h('div', { style: { color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' } },
                    'No IPS saved yet'
                  )
        ),
        // Layer progress
        h('div', { className: 'card', style: { marginBottom: 16, padding: '16px 18px' } },
            h('div', { className: 'card-title' }, 'Layer Progress'),
            LAYERS.map(function(layer) {
                var status   = layerStatus[layer.id] || 'incomplete';
                var isActive = layer.id === activeLayer;
                return h('div', {
                    key: layer.id,
                    onClick: function() { if (status !== 'locked') setActive(layer.id); },
                    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                             padding: '8px 0', borderBottom: '1px solid var(--card-border)',
                             cursor: status === 'locked' ? 'default' : 'pointer',
                             opacity: status === 'locked' ? 0.4 : 1 },
                },
                    h('span', { style: { fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
                                          color: isActive ? 'var(--cyan)' : 'var(--text-sec)' } },
                        layer.id + ' · ' + layer.label
                    ),
                    h('span', { className: 'badge ' + (status === 'complete' ? 'green' : status === 'active' ? 'blue' : '') },
                        status === 'complete' ? 'Done' : status === 'active' ? 'Active' : 'Locked'
                    )
                );
            }),
            h('div', { style: { marginTop: 12 } },
                h('div', { style: { height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' } },
                    h('div', { style: { height: '100%', borderRadius: 2,
                                         background: 'linear-gradient(to right,var(--cyan),var(--green))',
                                         width: (completeCount / 7 * 100) + '%',
                                         transition: 'width 0.6s ease' } })
                ),
                h('div', { style: { fontSize: 10, fontFamily: "'JetBrains Mono',monospace",
                                     color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' } },
                    completeCount + ' / 7 layers'
                )
            )
        )
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function PortfolioConstructionModule() {
    var _s1 = useState(MOCK_PCM_IPS);       var ips       = _s1[0]; var setIps       = _s1[1];
    var _s2 = useState(false);              var ipsSaved  = _s2[0]; var setIpsSaved  = _s2[1];
    var _s3 = useState(MOCK_PCM_ALLOCATION); var alloc    = _s3[0]; var setAlloc     = _s3[1];
    var _s4 = useState(MOCK_PCM_FACTORS);   var factors   = _s4[0]; var setFactors   = _s4[1];
    var _s5 = useState(MOCK_PCM_RISK);      var risk      = _s5[0]; var setRisk      = _s5[1];
    var _s6 = useState(MOCK_PCM_DRIFT);     var drift     = _s6[0]; var setDrift     = _s6[1];
    var _s7 = useState('L1');               var activeLayer = _s7[0]; var setActiveLayer = _s7[1];
    var _s8 = useState({
        L1: 'active', L2: 'locked', L3: 'locked',
        L4: 'locked', L5: 'locked', L6: 'locked', L7: 'locked',
    });
    var layerStatus = _s8[0]; var setLayerStatus = _s8[1];

    // Try to load live data where available
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
        var idx  = LAYERS.findIndex(function(l) { return l.id === layerId; });
        var next = LAYERS[idx + 1];
        var updated = Object.assign({}, layerStatus);
        updated[layerId] = 'complete';
        if (next) { updated[next.id] = 'active'; setActiveLayer(next.id); }
        setLayerStatus(updated);
    }

    function saveIPS() {
        setIpsSaved(true);
        if (sb) {
            sb.from('portfolio_ips').upsert([{
                risk_tolerance:     ips.risk_tolerance,
                risk_label:         ips.risk_label,
                return_target:      ips.return_target,
                time_horizon:       ips.time_horizon,
                benchmark:          ips.benchmark,
                concentration_limit: ips.concentration_limit,
                liquidity_need:     ips.liquidity_need,
            }]).then(function(r) { if (r.error) console.warn('[ATLAS] IPS save:', r.error); });
        }
        completeLayer('L1');
    }

    // ── Complete-layer button ──────────────────────────────────────────────────
    function nextBtn(layerId) {
        var idx  = LAYERS.findIndex(function(l) { return l.id === layerId; });
        var next = LAYERS[idx + 1];
        return h('div', { style: { marginTop: 20 } },
            btnPrimary('Mark Complete → Unlock ' + (next ? next.id : 'Done'),
                function() { completeLayer(layerId); }
            )
        );
    }

    // ── Layer content ──────────────────────────────────────────────────────────
    function renderLayer() {
        var status = layerStatus[activeLayer] || 'incomplete';
        if (status === 'locked') {
            return h('div', { style: { textAlign: 'center', padding: '48px 0' } },
                h('div', { style: { fontSize: 28, opacity: 0.2, marginBottom: 12 } }, '🔒'),
                h('div', { style: { color: 'var(--text-muted)', fontSize: 13 } },
                    'Complete prior layers to unlock ' + activeLayer
                )
            );
        }

        if (activeLayer === 'L1') return h('div', null,
            h(IPSForm, { ips: ips, setIps: setIps, onSave: saveIPS }),
            ipsSaved && h('div', { style: { marginTop: 12, fontSize: 12,
                                             color: 'var(--green)',
                                             fontFamily: "'JetBrains Mono',monospace" } },
                '✓ IPS saved · ' + new Date().toLocaleDateString()
            )
        );

        if (activeLayer === 'L2') return h('div', null,
            h(AllocationGap, { rows: alloc }),
            nextBtn('L2')
        );

        if (activeLayer === 'L3') return h('div', null,
            h(FactorGrid, { factors: factors }),
            h('div', { className: 'card', style: { marginTop: 16, display: 'flex', alignItems: 'center', gap: 24 } },
                h('div', { style: { textAlign: 'center', minWidth: 80 } },
                    h('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: 36,
                                         fontWeight: 800, color: 'var(--cyan)' } }, '68%'),
                    h('div', { className: 'label', style: { marginTop: 4 } }, 'Active Share vs SPY')
                ),
                h('div', { style: { flex: 1 } },
                    h('div', { style: { height: 6, background: 'rgba(255,255,255,0.08)',
                                         borderRadius: 3, overflow: 'hidden' } },
                        h('div', { style: { height: '100%', width: '68%',
                                             background: 'linear-gradient(to right,var(--cyan),var(--green))',
                                             borderRadius: 3 } })
                    ),
                    h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 4,
                                         fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
                                         color: 'var(--text-muted)' } },
                        h('span', null, '0% Index'),
                        h('span', null, '60% Genuine'),
                        h('span', null, '100% Concentrated')
                    )
                ),
                h('span', { className: 'badge green' }, '✓ Genuinely Active')
            ),
            nextBtn('L3')
        );

        if (activeLayer === 'L4') return h('div', null,
            h('div', { className: 'metrics-row', style: { marginBottom: 20 } },
                [
                    { label: 'Portfolio Vol (Ann.)',  value: '18.4%', sub: '90-day realised',             color: 'var(--amber)'  },
                    { label: 'Diversification Ratio', value: '1.34',  sub: 'Weighted avg / port vol',     color: 'var(--cyan)'   },
                    { label: 'Risk HHI',              value: '0.18',  sub: 'Top 3 = 47% of risk',         color: 'var(--red)'    },
                    { label: 'Tracking Error',        value: '8.2%',  sub: 'vs SPY · budget 10%',         color: 'var(--indigo)' },
                ].map(function(kpi) {
                    return h('div', { key: kpi.label, className: 'metric-card' },
                        h('div', { className: 'label' }, kpi.label),
                        h('div', { className: 'value', style: { color: kpi.color } }, kpi.value),
                        h('div', { className: 'sub' }, kpi.sub)
                    );
                })
            ),
            h('div', { className: 'card' },
                h('div', { className: 'card-title' }, 'Marginal Risk Contribution'),
                h(RiskTable, { rows: risk })
            ),
            nextBtn('L4')
        );

        if (activeLayer === 'L5') return h('div', null,
            h('div', { style: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' } },
                ['Max Sharpe (MVO)', 'Equal Risk (ERC)', 'Min Variance', 'Max Diversification', 'Benchmark-Constrained'].map(function(mode, i) {
                    var active = i === 0;
                    return h('button', { key: mode, style: {
                        background: active ? 'rgba(0,212,255,0.15)' : 'transparent',
                        color: active ? 'var(--cyan)' : 'var(--text-sec)',
                        border: '1px solid ' + (active ? 'rgba(0,212,255,0.4)' : 'var(--card-border)'),
                        borderRadius: 5, padding: '7px 14px',
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 10, cursor: 'pointer',
                    } }, mode);
                })
            ),
            h('div', { className: 'metrics-row', style: { marginBottom: 20 } },
                [
                    { label: 'Expected Sharpe',  value: '1.42',  color: 'var(--cyan)'  },
                    { label: 'Expected Return',  value: '14.8%', color: 'var(--green)' },
                    { label: 'Expected Vol',     value: '10.4%', color: 'var(--amber)' },
                ].map(function(k) {
                    return h('div', { key: k.label, className: 'metric-card' },
                        h('div', { className: 'label' }, k.label),
                        h('div', { className: 'value', style: { color: k.color } }, k.value)
                    );
                })
            ),
            nextBtn('L5')
        );

        if (activeLayer === 'L6') return h('div', null,
            drift.trigger_fired && h('div', { style: {
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '14px 18px', marginBottom: 20,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
            } },
                h('div', { style: { fontSize: 22 } }, '⚠'),
                h('div', null,
                    h('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: 16,
                                         fontWeight: 700, color: 'var(--red)' } }, 'Rebalancing Triggered'),
                    h('div', { style: { fontSize: 11, color: 'var(--text-muted)',
                                         fontFamily: "'JetBrains Mono',monospace" } },
                        'Aggregate drift ' + drift.aggregate_drift.toFixed(1) + '% exceeds threshold'
                    )
                ),
                h('div', { style: { marginLeft: 'auto', fontFamily: "'Syne',sans-serif",
                                     fontSize: 36, fontWeight: 800, color: 'var(--red)' } },
                    drift.aggregate_drift.toFixed(1) + '%'
                )
            ),
            h('div', { className: 'card' },
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

        return h(EmptyState, { message: 'Unknown layer: ' + activeLayer });
    }

    // ── Layer card wrapper ─────────────────────────────────────────────────────
    var currentLayer = LAYERS.find(function(l) { return l.id === activeLayer; });
    var currentStatus = layerStatus[activeLayer] || 'incomplete';

    return h('div', null,
        // Page header
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 24 } },
            h('div', { className: 'page-title' }, 'PORTFOLIO CONSTRUCTION'),
            h('div', { style: { fontSize: 12, color: 'var(--text-muted)',
                                 fontFamily: "'JetBrains Mono',monospace" } },
                'IPS → Allocation → Factors → Risk → Optimizer → Rebalancing → Report'
            )
        ),
        // 7-layer tab bar
        h(LayerTabBar, { layerStatus: layerStatus, activeLayer: activeLayer, setActive: setActiveLayer }),
        // Content + sidebar
        h('div', { style: { display: 'flex', gap: 20, alignItems: 'flex-start' } },
            h('div', { className: 'card', style: { flex: 1 } },
                h('div', { style: { display: 'flex', alignItems: 'center',
                                     justifyContent: 'space-between', marginBottom: 20 } },
                    h('div', null,
                        h('div', { style: { fontFamily: "'Syne',sans-serif", fontSize: 18,
                                             fontWeight: 700, color: 'var(--text)' } },
                            currentLayer ? currentLayer.full : activeLayer
                        ),
                        h('div', { style: { fontSize: 11, color: 'var(--text-muted)',
                                             fontFamily: "'JetBrains Mono',monospace", marginTop: 2 } },
                            currentLayer ? currentLayer.sub : ''
                        )
                    ),
                    currentStatus !== 'locked' &&
                        h('span', { className: 'badge ' + (currentStatus === 'complete' ? 'green' : 'blue') },
                            currentStatus === 'complete' ? 'Complete' : 'In Progress'
                        )
                ),
                renderLayer()
            ),
            h(LayerSidebar, {
                layerStatus: layerStatus, ips: ipsSaved ? ips : null,
                activeLayer: activeLayer, setActive: setActiveLayer,
            })
        )
    );
}
