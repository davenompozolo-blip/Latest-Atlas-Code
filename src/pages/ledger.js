// ATLAS Ledger — provenance & calibration page
// Reads from: decisions, decision_outcomes, vw_ledger_integrity
// Shows: integrity badge, KPI strip, decision table, calibration plot

import React from 'react';
import { sb } from './config.js';

const { useState, useEffect, useRef, useMemo } = React;
const e = React.createElement;

// ── palette (matches nexus-theme.css vars) ─────────────────────
const C = {
    bg1: '#070814', bg2: '#0b0d1a', bg3: '#0f1120', bg4: '#141627',
    blue: '#00d4ff', purple: '#a855f7', teal: '#14b8a6', amber: '#f59e0b',
    red: '#ef4444', green: '#22c55e', text1: '#f0f4ff', text2: '#a8b2d0', text3: '#4a5478',
    border: 'rgba(255,255,255,.07)',
};

const mono = { fontFamily: "'JetBrains Mono','Fira Code',monospace" };
const card = { background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8 };

// ── helpers ────────────────────────────────────────────────────
function fmt(n, dec = 0) {
    if (n == null) return '—';
    return Number(n).toFixed(dec);
}
function fmtPct(n) { return n == null ? '—' : (n >= 0 ? '+' : '') + fmt(n, 1) + '%'; }
function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Integrity Badge ────────────────────────────────────────────
function IntegrityBadge({ integrity }) {
    if (!integrity) return e('div', { style: { ...mono, fontSize: 10, color: C.text3 } }, 'loading chain…');
    const ok = integrity.chain_ok;
    return e('div', {
        style: {
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 20,
            background: ok ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
            border: `1px solid ${ok ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
        }
    },
        e('div', { style: { width: 7, height: 7, borderRadius: '50%', background: ok ? C.green : C.red, boxShadow: `0 0 6px ${ok ? C.green : C.red}` } }),
        e('span', { style: { ...mono, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: ok ? C.green : C.red } },
            ok ? 'CHAIN VERIFIED' : 'CHAIN BROKEN'),
        e('span', { style: { ...mono, fontSize: 9, color: C.text3 } }, `${integrity.total} records`)
    );
}

// ── KPI strip ─────────────────────────────────────────────────
function KpiStrip({ stats }) {
    const items = [
        { label: 'Total Decisions', value: stats.total ?? '—', color: C.blue },
        { label: 'Executed', value: stats.executed ?? '—', color: C.teal },
        { label: 'Passed', value: stats.passed ?? '—', color: C.text2 },
        { label: 'Accuracy (30d)', value: stats.acc30 != null ? fmt(stats.acc30 * 100, 0) + '%' : '—', color: stats.acc30 >= 0.5 ? C.green : C.amber },
        { label: 'Avg Alpha (30d)', value: fmtPct(stats.avgAlpha30), color: stats.avgAlpha30 >= 0 ? C.green : C.red },
        { label: 'Brier Score', value: stats.brier != null ? fmt(stats.brier, 3) : '—', color: stats.brier != null && stats.brier < 0.25 ? C.green : C.amber },
    ];
    return e('div', {
        style: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }
    },
        items.map(function(item) {
            return e('div', { key: item.label, style: { ...card, padding: '12px 14px' } },
                e('div', { style: { ...mono, fontSize: 18, fontWeight: 700, color: item.color, marginBottom: 4 } }, item.value),
                e('div', { style: { fontSize: 9, letterSpacing: 1, color: C.text3, textTransform: 'uppercase' } }, item.label)
            );
        })
    );
}

// ── Calibration Plot — DB-driven (vw_calibration) ─────────────
function CalibrationPlot({ calBins, horizon }) {
    const W = 320, H = 200, PAD = 38;
    const bins = (calBins || []).filter(b => b.horizon_days === horizon);
    const iW = W - PAD * 2, iH = H - PAD * 2;
    const px = prob => PAD + Number(prob) * iW;
    const py = acc  => PAD + (1 - Number(acc)) * iH;
    const colFor = flag => flag === 'calibrated' ? C.green : flag === 'over-confident' ? C.amber : C.purple;

    return e('svg', { width: W, height: H },
        // 45° perfect calibration line
        e('line', { x1: px(0), y1: py(0), x2: px(1), y2: py(1), stroke: C.border, strokeWidth: 1, strokeDasharray: '4,3' }),
        // axes
        e('line', { x1: px(0), y1: py(1), x2: px(0), y2: py(0), stroke: C.text3, strokeWidth: 1 }),
        e('line', { x1: px(0), y1: py(0), x2: px(1), y2: py(0), stroke: C.text3, strokeWidth: 1 }),
        // axis labels
        e('text', { x: px(0.5), y: H - 4, textAnchor: 'middle', fontSize: 8, fill: C.text3 }, 'Predicted (conviction / 100)'),
        e('text', { x: 10, y: py(0.5), textAnchor: 'middle', fontSize: 8, fill: C.text3, transform: `rotate(-90,10,${py(0.5)})` }, 'Actual'),
        [0, 0.25, 0.5, 0.75, 1].map(v => [
            e('text', { key: 'x'+v, x: px(v), y: py(0)+11, textAnchor: 'middle', fontSize: 7, fill: C.text3 }, v),
            e('text', { key: 'y'+v, x: px(0)-4, y: py(v)+3, textAnchor: 'end', fontSize: 7, fill: C.text3 }, v),
        ]),
        // data points sized by n
        bins.length === 0
            ? e('text', { x: W/2, y: H/2, textAnchor: 'middle', fontSize: 10, fill: C.text3 }, 'No outcome data yet')
            : bins.map(function(bin) {
                const r = Math.max(4, Math.min(12, Number(bin.n) * 1.2));
                const col = colFor(bin.calibration_flag);
                return e('g', { key: bin.bin_low },
                    e('circle', { cx: px(bin.mid_prob), cy: py(bin.actual_accuracy), r,
                        fill: col, fillOpacity: 0.65, stroke: col, strokeWidth: 1.5 }),
                    e('title', null,
                        `${bin.bin_low}–${bin.bin_high} conv · predicted ${Number(bin.mid_prob*100).toFixed(0)}% · actual ${Number(bin.actual_accuracy*100).toFixed(0)}% · n=${bin.n} · ${bin.calibration_flag}`)
                );
            })
    );
}

// ── Brier Trend — DB-driven (vw_brier_trend) ──────────────────
function BrierTrend({ brierTrend, horizon }) {
    const W = 340, H = 100, PAD = 24;
    const pts = useMemo(function() {
        return (brierTrend || [])
            .filter(r => r.horizon_days === horizon)
            .sort((a, b) => a.month < b.month ? -1 : 1);
    }, [brierTrend, horizon]);

    if (!pts.length) return e('div', { style: { color: C.text3, fontSize: 10, textAlign: 'center', paddingTop: 28 } }, 'No Brier trend yet');
    const scores = pts.map(p => Number(p.brier_score));
    const maxS = Math.max(...scores, 0.4);
    const iW = W - PAD * 2, iH = H - PAD * 2;
    const px = i  => PAD + (i / Math.max(1, pts.length - 1)) * iW;
    const py = s  => PAD + (1 - s / maxS) * iH;
    const d  = pts.map((p, i) => (i === 0 ? 'M' : 'L') + px(i) + ',' + py(Number(p.brier_score))).join(' ');
    const threshold25 = py(0.25);
    return e('svg', { width: W, height: H },
        e('path', { d, fill: 'none', stroke: C.blue, strokeWidth: 1.5 }),
        e('line', { x1: PAD, y1: threshold25, x2: W-PAD, y2: threshold25, stroke: C.amber, strokeWidth: 1, strokeDasharray: '3,3' }),
        e('text', { x: W-PAD+2, y: threshold25+3, fontSize: 7, fill: C.amber }, '0.25'),
        pts.map((p, i) => e('circle', { key: i, cx: px(i), cy: py(Number(p.brier_score)), r: 3,
            fill: Number(p.brier_score) < 0.25 ? C.green : C.amber })),
        e('text', { x: px(0), y: H-4, textAnchor: 'middle', fontSize: 7, fill: C.text3 }, pts[0]?.month?.slice(0,7)),
        pts.length > 1 && e('text', { x: px(pts.length-1), y: H-4, textAnchor: 'middle', fontSize: 7, fill: C.text3 }, pts[pts.length-1]?.month?.slice(0,7))
    );
}

// ── Drift Monitor strip ────────────────────────────────────────
function DriftMonitor({ brierTrend, calBins }) {
    const horizons = [30, 60, 90, 0];
    return e('div', { style: { ...card, padding: '14px 16px', marginBottom: 20 } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 } },
            e('span', { style: { ...mono, fontSize: 11, fontWeight: 700, color: C.text1 } }, 'DRIFT MONITOR'),
            e('span', { style: { fontSize: 9, color: C.text3, letterSpacing: 1 } }, '— Brier score and over-confidence by horizon')
        ),
        e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 } },
            horizons.map(function(h) {
                const trend = (brierTrend || []).filter(r => r.horizon_days === h).sort((a,b) => a.month < b.month ? -1 : 1);
                const latest = trend[trend.length - 1];
                const prev   = trend[trend.length - 2];
                const brier  = latest ? Number(latest.brier_score) : null;
                const delta  = (latest && prev) ? brier - Number(prev.brier_score) : null;
                const overConf = (calBins || []).filter(b => b.horizon_days === h && b.calibration_flag === 'over-confident').length;
                const label  = h === 0 ? 'To-date' : `${h}d`;
                const color  = brier == null ? C.text3 : brier < 0.25 ? C.green : brier < 0.33 ? C.amber : C.red;
                return e('div', { key: h, style: { background: C.bg3, borderRadius: 6, padding: '10px 12px' } },
                    e('div', { style: { ...mono, fontSize: 9, letterSpacing: 1, color: C.text3, marginBottom: 6 } }, label),
                    e('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6 } },
                        e('span', { style: { ...mono, fontSize: 18, fontWeight: 700, color } }, brier != null ? brier.toFixed(3) : '—'),
                        delta != null && e('span', { style: { ...mono, fontSize: 9, color: delta <= 0 ? C.green : C.red } },
                            (delta > 0 ? '+' : '') + delta.toFixed(3))
                    ),
                    e('div', { style: { ...mono, fontSize: 9, color: C.text3, marginTop: 4 } },
                        overConf > 0
                            ? e('span', { style: { color: C.amber } }, `⚠ ${overConf} over-confident bin${overConf > 1 ? 's' : ''}`)
                            : e('span', { style: { color: C.green } }, '✓ well-calibrated bins')
                    )
                );
            })
        )
    );
}

// ── Devil's Advocate panel ─────────────────────────────────────
function DevilAdvocate({ devil }) {
    const worstCalls = (devil || []).filter(r => r.section === 'worst_calls');
    const bias       = (devil || []).filter(r => r.section === 'bias');

    return e('div', { style: { ...card, overflow: 'hidden', marginBottom: 20 } },
        e('div', {
            style: {
                padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', gap: 10
            }
        },
            e('span', { style: { ...mono, fontSize: 11, fontWeight: 700, color: C.red } }, '⚔ DEVIL\'S ADVOCATE'),
            e('span', { style: { fontSize: 9, color: C.text3, letterSpacing: 1 } }, '— worst calls + systematic bias')
        ),
        e('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 0 } },
            // worst calls table
            e('div', { style: { borderRight: `1px solid ${C.border}` } },
                e('div', { style: { ...mono, fontSize: 9, color: C.text3, letterSpacing: 1, padding: '8px 14px', borderBottom: `1px solid ${C.border}` } }, 'WORST CALLS BY ALPHA'),
                e('table', { style: { width: '100%', borderCollapse: 'collapse' } },
                    e('thead', null,
                        e('tr', { style: { borderBottom: `1px solid ${C.border}` } },
                            ['#', 'Symbol', 'Intent', 'Calls', 'Accuracy', 'Avg Alpha', 'Overconf'].map(h =>
                                e('th', { key: h, style: { ...mono, fontSize: 8, color: C.text3, padding: '5px 10px', textAlign: h === 'Avg Alpha' || h === 'Accuracy' || h === 'Overconf' ? 'right' : 'left', letterSpacing: 1 } }, h)
                            )
                        )
                    ),
                    e('tbody', null,
                        worstCalls.length === 0
                            ? e('tr', null, e('td', { colSpan: 7, style: { textAlign: 'center', padding: 20, color: C.text3, fontSize: 10 } }, 'Insufficient data'))
                            : worstCalls.map(function(r) {
                                const overConf = Number(r.overconfidence_gap_pct);
                                return e('tr', { key: r.alpha_rank, style: { borderBottom: `1px solid ${C.border}` } },
                                    e('td', { style: { ...mono, fontSize: 9, color: C.text3, padding: '6px 10px' } }, r.alpha_rank),
                                    e('td', { style: { ...mono, fontSize: 11, fontWeight: 700, color: C.text1, padding: '6px 10px' } }, r.symbol),
                                    e('td', { style: { ...mono, fontSize: 9, color: { add: C.green, trim: C.amber, exit: C.red }[r.intent] || C.text2, padding: '6px 10px', textTransform: 'uppercase', letterSpacing: 1 } }, r.intent),
                                    e('td', { style: { ...mono, fontSize: 9, color: C.text2, padding: '6px 10px' } }, r.calls),
                                    e('td', { style: { ...mono, fontSize: 9, color: C.text2, padding: '6px 10px', textAlign: 'right' } }, r.accuracy_pct + '%'),
                                    e('td', { style: { ...mono, fontSize: 10, fontWeight: 600, color: C.red, padding: '6px 10px', textAlign: 'right' } }, fmtPct(r.avg_alpha_pct)),
                                    e('td', { style: { ...mono, fontSize: 9, color: overConf > 10 ? C.amber : C.text3, padding: '6px 10px', textAlign: 'right' } },
                                        overConf > 0 ? '+' + overConf + 'pp' : overConf + 'pp')
                                );
                            })
                    )
                )
            ),
            // bias summary
            e('div', { style: { padding: '8px 14px' } },
                e('div', { style: { ...mono, fontSize: 9, color: C.text3, letterSpacing: 1, marginBottom: 12 } }, 'STANCE BIAS'),
                bias.length === 0
                    ? e('div', { style: { color: C.text3, fontSize: 10 } }, 'No data')
                    : bias.map(function(r) {
                        const overConf = Number(r.overconfidence_gap_pct);
                        const color = Math.abs(overConf) > 5 ? C.amber : C.green;
                        return e('div', { key: r.stance, style: { marginBottom: 14, padding: '10px 12px', background: C.bg3, borderRadius: 6 } },
                            e('div', { style: { ...mono, fontSize: 9, letterSpacing: 1, color: r.stance === 'bullish' ? C.teal : C.purple, textTransform: 'uppercase', marginBottom: 6 } }, r.stance),
                            e('div', { style: { ...mono, fontSize: 14, fontWeight: 700, color: C.text1, marginBottom: 2 } }, r.accuracy_pct + '%', e('span', { style: { fontSize: 9, color: C.text3, marginLeft: 4 } }, 'accuracy')),
                            e('div', { style: { ...mono, fontSize: 9, color: C.text3, marginBottom: 2 } }, 'Avg conviction: ' + r.avg_conviction),
                            e('div', { style: { ...mono, fontSize: 10, color } },
                                overConf > 0
                                    ? `+${overConf}pp over-confident`
                                    : `${Math.abs(overConf)}pp under-confident`
                            ),
                            e('div', { style: { ...mono, fontSize: 8, color: C.text3, marginTop: 4 } }, r.calls + ' outcomes scored')
                        );
                    })
            )
        )
    );
}

// ── Decision row ───────────────────────────────────────────────
function DecisionRow({ d, open, onToggle }) {
    const isBuy = d.intent === 'add';
    const isExec = d.decision_type === 'executed';
    const intentColor = { add: C.green, trim: C.amber, exit: C.red, hold: C.text3, avoid: C.red }[d.intent] || C.text2;
    return e(React.Fragment, null,
        e('tr', {
            onClick: onToggle,
            style: {
                cursor: 'pointer', borderBottom: `1px solid ${C.border}`,
                background: open ? C.bg3 : 'transparent',
                transition: 'background .1s'
            }
        },
            e('td', { style: { ...mono, fontSize: 10, color: C.text3, padding: '7px 10px', whiteSpace: 'nowrap' } }, fmtDate(d.created_at)),
            e('td', { style: { ...mono, fontSize: 11, fontWeight: 700, color: C.text1, padding: '7px 10px' } }, d.symbol),
            e('td', { style: { ...mono, fontSize: 10, color: intentColor, padding: '7px 10px', textTransform: 'uppercase', letterSpacing: 1 } }, d.intent || '—'),
            e('td', { style: { ...mono, fontSize: 10, padding: '7px 10px' } },
                e('span', {
                    style: {
                        padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600, letterSpacing: 1,
                        background: isExec ? 'rgba(0,212,255,.12)' : 'rgba(100,116,139,.12)',
                        color: isExec ? C.blue : C.text3,
                        textTransform: 'uppercase'
                    }
                }, d.decision_type)
            ),
            e('td', { style: { ...mono, fontSize: 10, color: C.text2, padding: '7px 10px', textAlign: 'right' } },
                d.conviction != null ? d.conviction : '—'),
            e('td', { style: { ...mono, fontSize: 10, color: C.text2, padding: '7px 10px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                d.rationale || '—'),
            e('td', { style: { ...mono, fontSize: 9, color: C.text3, padding: '7px 10px' } },
                open ? '▾' : '▸')
        ),
        open && e('tr', { style: { background: C.bg3 } },
            e('td', { colSpan: 7, style: { padding: '10px 16px' } },
                e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: 10 } },
                    e('div', null,
                        e('div', { style: { color: C.text3, letterSpacing: 1, fontSize: 9, marginBottom: 4 } }, 'RATIONALE'),
                        e('div', { style: { ...mono, color: C.text1 } }, d.rationale || '—')
                    ),
                    e('div', null,
                        e('div', { style: { color: C.text3, letterSpacing: 1, fontSize: 9, marginBottom: 4 } }, 'HASH'),
                        e('div', { style: { ...mono, color: C.text3, fontSize: 9, wordBreak: 'break-all' } }, d.content_hash || '—')
                    ),
                    e('div', null,
                        e('div', { style: { color: C.text3, letterSpacing: 1, fontSize: 9, marginBottom: 4 } }, 'PREV HASH'),
                        e('div', { style: { ...mono, color: C.text3, fontSize: 9, wordBreak: 'break-all' } }, d.prev_hash || '(genesis)')
                    )
                )
            )
        )
    );
}

// ── Decision Table ─────────────────────────────────────────────
function DecisionTable({ decisions, loading }) {
    const [openId, setOpenId] = useState(null);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');

    const filtered = useMemo(function() {
        let rows = decisions;
        if (filter !== 'all') rows = rows.filter(d => d.decision_type === filter);
        if (search) rows = rows.filter(d => d.symbol.toLowerCase().includes(search.toLowerCase()));
        return rows;
    }, [decisions, filter, search]);

    return e('div', { style: { ...card, overflow: 'hidden' } },
        e('div', {
            style: {
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderBottom: `1px solid ${C.border}`
            }
        },
            e('span', { style: { ...mono, fontSize: 11, fontWeight: 700, color: C.text1, flex: 1 } }, 'DECISION LEDGER'),
            ['all', 'executed', 'passed', 'considered'].map(function(f) {
                const active = filter === f;
                return e('button', {
                    key: f, onClick: () => setFilter(f),
                    style: {
                        ...mono, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
                        padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                        background: active ? 'rgba(0,212,255,.15)' : 'transparent',
                        color: active ? C.blue : C.text3,
                    }
                }, f);
            }),
            e('input', {
                value: search, onChange: ev => setSearch(ev.target.value),
                placeholder: 'symbol…',
                style: {
                    ...mono, fontSize: 9, padding: '3px 8px', borderRadius: 4,
                    border: `1px solid ${C.border}`, background: C.bg1, color: C.text1, width: 80,
                    outline: 'none'
                }
            })
        ),
        loading
            ? e('div', { style: { padding: 24, textAlign: 'center', color: C.text3, fontSize: 10 } }, 'Loading…')
            : e('div', { style: { overflowX: 'auto', maxHeight: 420 } },
                e('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 10 } },
                    e('thead', null,
                        e('tr', { style: { borderBottom: `1px solid ${C.border}` } },
                            ['Date', 'Symbol', 'Intent', 'Type', 'Conviction', 'Rationale', ''].map(h =>
                                e('th', {
                                    key: h,
                                    style: { ...mono, fontSize: 8, letterSpacing: 1, color: C.text3, padding: '6px 10px', textAlign: h === 'Conviction' ? 'right' : 'left', textTransform: 'uppercase' }
                                }, h)
                            )
                        )
                    ),
                    e('tbody', null,
                        filtered.length === 0
                            ? e('tr', null, e('td', { colSpan: 7, style: { textAlign: 'center', padding: 24, color: C.text3, fontSize: 10 } }, 'No decisions recorded yet.'))
                            : filtered.map(d =>
                                e(DecisionRow, {
                                    key: d.id, d,
                                    open: openId === d.id,
                                    onToggle: () => setOpenId(openId === d.id ? null : d.id)
                                })
                            )
                    )
                )
            )
    );
}

// ── Outcomes Table ─────────────────────────────────────────────
function OutcomesPanel({ outcomes }) {
    const recent = useMemo(() => [...outcomes].sort((a, b) => new Date(b.snapshot_at) - new Date(a.snapshot_at)).slice(0, 50), [outcomes]);
    return e('div', { style: { ...card, overflow: 'hidden' } },
        e('div', { style: { padding: '10px 14px', borderBottom: `1px solid ${C.border}` } },
            e('span', { style: { ...mono, fontSize: 11, fontWeight: 700, color: C.text1 } }, 'OUTCOME SNAPSHOTS')
        ),
        e('div', { style: { overflowX: 'auto', maxHeight: 280 } },
            e('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 10 } },
                e('thead', null,
                    e('tr', { style: { borderBottom: `1px solid ${C.border}` } },
                        ['Snapshot', 'Symbol', 'Horizon', 'Entity Ret', 'Benchmark', 'Alpha', 'Correct'].map(h =>
                            e('th', { key: h, style: { ...mono, fontSize: 8, letterSpacing: 1, color: C.text3, padding: '6px 10px', textTransform: 'uppercase' } }, h)
                        )
                    )
                ),
                e('tbody', null,
                    recent.length === 0
                        ? e('tr', null, e('td', { colSpan: 7, style: { textAlign: 'center', padding: 24, color: C.text3, fontSize: 10 } }, 'No outcome snapshots yet.'))
                        : recent.map(function(o) {
                            return e('tr', { key: o.id, style: { borderBottom: `1px solid ${C.border}` } },
                                e('td', { style: { ...mono, fontSize: 9, color: C.text3, padding: '6px 10px', whiteSpace: 'nowrap' } }, fmtDate(o.snapshot_at)),
                                e('td', { style: { ...mono, fontSize: 11, fontWeight: 700, color: C.text1, padding: '6px 10px' } }, o.symbol || o.decision_id?.slice(0, 8)),
                                e('td', { style: { ...mono, fontSize: 9, color: C.text2, padding: '6px 10px' } }, o.horizon_days === 0 ? 'to-date' : o.horizon_days + 'd'),
                                e('td', { style: { ...mono, fontSize: 10, color: o.entity_return >= 0 ? C.green : C.red, padding: '6px 10px' } }, fmtPct(o.entity_return ? o.entity_return * 100 : null)),
                                e('td', { style: { ...mono, fontSize: 10, color: C.text2, padding: '6px 10px' } }, fmtPct(o.benchmark_return ? o.benchmark_return * 100 : null)),
                                e('td', { style: { ...mono, fontSize: 10, color: o.alpha >= 0 ? C.green : C.red, padding: '6px 10px' } }, fmtPct(o.alpha ? o.alpha * 100 : null)),
                                e('td', { style: { ...mono, fontSize: 10, padding: '6px 10px', color: o.correct === true ? C.green : o.correct === false ? C.red : C.text3 } },
                                    o.correct === true ? '✓' : o.correct === false ? '✗' : '—')
                            );
                        })
                )
            )
        )
    );
}

// ── Main Ledger Page ───────────────────────────────────────────
export function LedgerPage() {
    const [integrity, setIntegrity]   = useState(null);
    const [decisions, setDecisions]   = useState([]);
    const [outcomes, setOutcomes]     = useState([]);
    const [calBins, setCalBins]       = useState([]);
    const [brierTrend, setBrierTrend] = useState([]);
    const [devil, setDevil]           = useState([]);
    const [loading, setLoading]       = useState(true);
    const [horizon, setHorizon]       = useState(30);

    useEffect(function() {
        if (!sb) return;
        Promise.all([
            sb.from('vw_ledger_integrity').select('*').single(),
            sb.from('decisions').select('*').order('seq', { ascending: false }).limit(500),
            sb.from('decision_outcomes').select('*, decisions(symbol,conviction,intent)').order('snapshot_at', { ascending: false }).limit(2000),
            sb.from('vw_calibration').select('*'),
            sb.from('vw_brier_trend').select('*'),
            sb.from('vw_devil_advocate').select('*'),
        ]).then(function([intRes, decRes, outRes, calRes, brierRes, devilRes]) {
            if (intRes.data)   setIntegrity(intRes.data);
            if (decRes.data)   setDecisions(decRes.data);
            if (outRes.data)   setOutcomes(outRes.data.map(o => ({
                ...o, symbol: o.decisions?.symbol,
                conviction: o.decisions?.conviction, intent: o.decisions?.intent,
            })));
            if (calRes.data)   setCalBins(calRes.data);
            if (brierRes.data) setBrierTrend(brierRes.data);
            if (devilRes.data) setDevil(devilRes.data);
            setLoading(false);
        });
    }, []);

    const stats = useMemo(function() {
        const total    = decisions.length;
        const executed = decisions.filter(d => d.decision_type === 'executed').length;
        const passed   = decisions.filter(d => d.decision_type === 'passed').length;
        const cal30    = calBins.filter(b => b.horizon_days === 30);
        const acc30    = cal30.length
            ? cal30.reduce((s,b) => s + Number(b.actual_accuracy) * Number(b.n), 0) / cal30.reduce((s,b) => s + Number(b.n), 0)
            : null;
        const alpha30  = cal30.length
            ? cal30.reduce((s,b) => s + Number(b.avg_alpha_pct) * Number(b.n), 0) / cal30.reduce((s,b) => s + Number(b.n), 0)
            : null;
        const brier30  = cal30.length
            ? cal30.reduce((s,b) => s + Number(b.brier) * Number(b.n), 0) / cal30.reduce((s,b) => s + Number(b.n), 0)
            : null;
        return { total, executed, passed, acc30, avgAlpha30: alpha30, brier: brier30 };
    }, [decisions, calBins]);

    const horizonBtn = function(h, label) {
        const active = horizon === h;
        return e('button', {
            key: h, onClick: () => setHorizon(h),
            style: {
                ...mono, fontSize: 9, letterSpacing: 1, padding: '3px 8px', borderRadius: 4,
                border: 'none', cursor: 'pointer', textTransform: 'uppercase',
                background: active ? 'rgba(0,212,255,.15)' : 'transparent',
                color: active ? C.blue : C.text3,
            }
        }, label);
    };

    return e('div', {
        style: { padding: '20px 24px', background: C.bg1, minHeight: '100%', color: C.text1, ...mono }
    },
        // header
        e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 } },
            e('div', null,
                e('div', { style: { fontSize: 18, fontWeight: 800, letterSpacing: 2, color: C.blue, marginBottom: 2 } }, 'ATLAS LEDGER'),
                e('div', { style: { fontSize: 9, letterSpacing: 2, color: C.text3, textTransform: 'uppercase' } }, 'Provenance · Calibration · Integrity · Devil\'s Advocate')
            ),
            e(IntegrityBadge, { integrity })
        ),

        // KPI strip
        e('div', { style: { marginBottom: 20 } }, e(KpiStrip, { stats })),

        // Drift monitor
        e(DriftMonitor, { brierTrend, calBins }),

        // Horizon selector + charts row
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 } },
            e('span', { style: { fontSize: 9, color: C.text3, letterSpacing: 1, marginRight: 4 } }, 'HORIZON:'),
            horizonBtn(30, '30d'),
            horizonBtn(60, '60d'),
            horizonBtn(90, '90d'),
            horizonBtn(0,  'to-date')
        ),
        e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 } },
            e('div', { style: { ...card, padding: '14px 16px' } },
                e('div', { style: { fontSize: 9, letterSpacing: 1, color: C.text3, textTransform: 'uppercase', marginBottom: 8 } }, 'Calibration Plot'),
                e('div', { style: { display: 'flex', justifyContent: 'center' } },
                    e(CalibrationPlot, { calBins, horizon })
                ),
                e('div', { style: { display: 'flex', gap: 12, marginTop: 8, justifyContent: 'center' } },
                    [['calibrated', C.green], ['over-confident', C.amber], ['under-confident', C.purple]].map(([label, col]) =>
                        e('div', { key: label, style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: C.text3 } },
                            e('div', { style: { width: 7, height: 7, borderRadius: '50%', background: col } }),
                            label
                        )
                    )
                )
            ),
            e('div', { style: { ...card, padding: '14px 16px' } },
                e('div', { style: { fontSize: 9, letterSpacing: 1, color: C.text3, textTransform: 'uppercase', marginBottom: 8 } }, 'Brier Score Trend'),
                e('div', { style: { display: 'flex', justifyContent: 'center' } },
                    e(BrierTrend, { brierTrend, horizon })
                ),
                e('div', { style: { fontSize: 8, color: C.text3, marginTop: 6, textAlign: 'center' } },
                    e('span', { style: { color: C.amber } }, '— 0.25 threshold'), ' · Lower = better · Skill threshold ~0.25')
            )
        ),

        // Devil's advocate
        e(DevilAdvocate, { devil }),

        // Decision table
        e('div', { style: { marginBottom: 20 } },
            e(DecisionTable, { decisions, loading })
        ),

        // Outcomes table
        !loading && e(OutcomesPanel, { outcomes }),

        // Phase note
        e('div', { style: { marginTop: 24, padding: '10px 14px', background: C.bg3, borderRadius: 6, fontSize: 9, color: C.text3, letterSpacing: 1 } },
            'LEDGER PHASE 3 LIVE · Calibration binned from DB (vw_calibration), Brier trend from vw_brier_trend, drift monitor, devil\'s advocate. Phase 4: forward-test shadow NAV.'
        )
    );
}
