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

// ── Calibration Plot (SVG) ─────────────────────────────────────
function CalibrationPlot({ outcomes }) {
    // Bin by conviction decile → compute accuracy
    const W = 320, H = 200, PAD = 36;
    const bins = useMemo(function() {
        if (!outcomes.length) return [];
        const bmap = {};
        outcomes.forEach(function(o) {
            const c = o.conviction;
            if (c == null || o.correct == null) return;
            const b = Math.min(9, Math.floor(c / 10));
            if (!bmap[b]) bmap[b] = { sum: 0, n: 0 };
            bmap[b].sum += o.correct ? 1 : 0;
            bmap[b].n++;
        });
        return Object.entries(bmap).map(function([b, v]) {
            return { b: +b, midProb: (+b * 10 + 5) / 100, acc: v.sum / v.n, n: v.n };
        });
    }, [outcomes]);

    const iW = W - PAD * 2, iH = H - PAD * 2;
    function px(prob) { return PAD + prob * iW; }
    function py(acc) { return PAD + (1 - acc) * iH; }

    return e('svg', { width: W, height: H, style: { ...mono } },
        // 45° perfect calibration line
        e('line', { x1: px(0), y1: py(0), x2: px(1), y2: py(1), stroke: C.border, strokeWidth: 1, strokeDasharray: '4,3' }),
        // axes
        e('line', { x1: px(0), y1: py(0), x2: px(0), y2: py(1), stroke: C.text3, strokeWidth: 1 }),
        e('line', { x1: px(0), y1: py(0), x2: px(1), y2: py(0), stroke: C.text3, strokeWidth: 1 }),
        // axis labels
        e('text', { x: px(0.5), y: H - 6, textAnchor: 'middle', fontSize: 8, fill: C.text3 }, 'Predicted probability (conviction / 100)'),
        e('text', { x: 10, y: py(0.5), textAnchor: 'middle', fontSize: 8, fill: C.text3, transform: `rotate(-90,10,${py(0.5)})` }, 'Actual accuracy'),
        // tick labels
        [0, 0.25, 0.5, 0.75, 1].map(function(v) {
            return [
                e('text', { key: 'x' + v, x: px(v), y: py(0) + 12, textAnchor: 'middle', fontSize: 7, fill: C.text3 }, v),
                e('text', { key: 'y' + v, x: px(0) - 4, y: py(v) + 3, textAnchor: 'end', fontSize: 7, fill: C.text3 }, v),
            ];
        }),
        // data points
        bins.map(function(bin) {
            const r = Math.max(3, Math.min(10, bin.n * 1.5));
            const col = Math.abs(bin.acc - bin.midProb) < 0.1 ? C.green : C.amber;
            return e('circle', {
                key: bin.b, cx: px(bin.midProb), cy: py(bin.acc), r,
                fill: col, fillOpacity: 0.7, stroke: col, strokeWidth: 1
            });
        }),
        bins.length === 0 &&
            e('text', { x: W / 2, y: H / 2, textAnchor: 'middle', fontSize: 10, fill: C.text3 }, 'No outcome data yet')
    );
}

// ── Brier trend (mini sparkline) ───────────────────────────────
function BrierTrend({ outcomes }) {
    const W = 320, H = 80, PAD = 20;
    const pts = useMemo(function() {
        if (!outcomes.length) return [];
        const sorted = [...outcomes].sort((a, b) => new Date(a.snapshot_at) - new Date(b.snapshot_at));
        const running = [];
        let ss = 0;
        sorted.forEach(function(o, i) {
            if (o.conviction == null || o.correct == null) return;
            const p = o.conviction / 100;
            ss += (p - (o.correct ? 1 : 0)) ** 2;
            running.push({ i: running.length, score: ss / (running.length + 1) });
        });
        return running;
    }, [outcomes]);

    if (!pts.length) return e('div', { style: { color: C.text3, fontSize: 10, textAlign: 'center', paddingTop: 20 } }, 'No Brier data yet');
    const maxS = Math.max(...pts.map(p => p.score), 0.5);
    const iW = W - PAD * 2, iH = H - PAD * 2;
    const px = i => PAD + (i / Math.max(1, pts.length - 1)) * iW;
    const py = s => PAD + (1 - s / maxS) * iH;
    const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + px(i) + ',' + py(p.score)).join(' ');
    return e('svg', { width: W, height: H },
        e('path', { d, fill: 'none', stroke: C.blue, strokeWidth: 1.5 }),
        e('line', { x1: PAD, y1: py(0.25), x2: W - PAD, y2: py(0.25), stroke: C.amber, strokeWidth: 1, strokeDasharray: '3,3' }),
        e('text', { x: W - PAD + 2, y: py(0.25) + 3, fontSize: 7, fill: C.amber }, '0.25')
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
    const [integrity, setIntegrity] = useState(null);
    const [decisions, setDecisions] = useState([]);
    const [outcomes, setOutcomes] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(function() {
        if (!sb) return;
        Promise.all([
            sb.from('vw_ledger_integrity').select('*').single(),
            sb.from('decisions').select('*').order('seq', { ascending: false }).limit(500),
            // conviction & intent live on the parent decision, not the outcome row —
            // pull them through so the calibration plot and Brier score can bin by conviction
            sb.from('decision_outcomes').select('*, decisions(symbol, conviction, intent)').order('snapshot_at', { ascending: false }).limit(2000),
        ]).then(function([intRes, decRes, outRes]) {
            if (intRes.data) setIntegrity(intRes.data);
            if (decRes.data) setDecisions(decRes.data);
            if (outRes.data) {
                setOutcomes(outRes.data.map(o => ({
                    ...o,
                    symbol: o.decisions?.symbol,
                    conviction: o.decisions?.conviction,
                    intent: o.decisions?.intent,
                })));
            }
            setLoading(false);
        });
    }, []);

    const stats = useMemo(function() {
        const total = decisions.length;
        const executed = decisions.filter(d => d.decision_type === 'executed').length;
        const passed = decisions.filter(d => d.decision_type === 'passed').length;
        const out30 = outcomes.filter(o => o.horizon_days === 30 && o.correct != null);
        const acc30 = out30.length ? out30.filter(o => o.correct).length / out30.length : null;
        const avgAlpha30 = out30.length ? out30.reduce((s, o) => s + (o.alpha || 0), 0) / out30.length * 100 : null;
        let brier = null;
        const withConv = outcomes.filter(o => o.conviction != null && o.correct != null);
        if (withConv.length) {
            brier = withConv.reduce((s, o) => s + (o.conviction / 100 - (o.correct ? 1 : 0)) ** 2, 0) / withConv.length;
        }
        return { total, executed, passed, acc30, avgAlpha30, brier };
    }, [decisions, outcomes]);

    return e('div', {
        style: {
            padding: '20px 24px', background: C.bg1, minHeight: '100%',
            color: C.text1, ...mono
        }
    },
        // header row
        e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 } },
            e('div', null,
                e('div', { style: { fontSize: 18, fontWeight: 800, letterSpacing: 2, color: C.blue, marginBottom: 2 } }, 'ATLAS LEDGER'),
                e('div', { style: { fontSize: 9, letterSpacing: 2, color: C.text3, textTransform: 'uppercase' } }, 'Provenance · Calibration · Integrity')
            ),
            e(IntegrityBadge, { integrity })
        ),

        // KPI strip
        e('div', { style: { marginBottom: 20 } }, e(KpiStrip, { stats })),

        // Charts row
        e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 } },
            e('div', { style: { ...card, padding: '14px 16px' } },
                e('div', { style: { fontSize: 9, letterSpacing: 1, color: C.text3, textTransform: 'uppercase', marginBottom: 10 } }, 'Calibration Plot'),
                e('div', { style: { display: 'flex', justifyContent: 'center' } },
                    e(CalibrationPlot, { outcomes })
                ),
                e('div', { style: { fontSize: 8, color: C.text3, marginTop: 6, textAlign: 'center' } }, 'Dots near the diagonal = well-calibrated. Size = sample count.')
            ),
            e('div', { style: { ...card, padding: '14px 16px' } },
                e('div', { style: { fontSize: 9, letterSpacing: 1, color: C.text3, textTransform: 'uppercase', marginBottom: 10 } }, 'Brier Score Trend'),
                e('div', { style: { display: 'flex', justifyContent: 'center' } },
                    e(BrierTrend, { outcomes })
                ),
                e('div', { style: { fontSize: 8, color: C.text3, marginTop: 6, textAlign: 'center' } },
                    e('span', { style: { color: C.amber } }, '— 0.25 threshold'), ' · Lower = better · Skill threshold ~0.25')
            )
        ),

        // Decision table
        e('div', { style: { marginBottom: 20 } },
            e(DecisionTable, { decisions, loading })
        ),

        // Outcomes table
        !loading && e(OutcomesPanel, { outcomes }),

        // Phase note
        e('div', { style: { marginTop: 24, padding: '10px 14px', background: C.bg3, borderRadius: 6, fontSize: 9, color: C.text3, letterSpacing: 1 } },
            'LEDGER PHASE 2 LIVE · Decisions are scored vs SPY at 30/60/90-day and to-date horizons as each matures. Calibration (predicted vs realized) lands in Phase 3.'
        )
    );
}
