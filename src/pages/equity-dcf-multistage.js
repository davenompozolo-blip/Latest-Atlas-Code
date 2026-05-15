import React from 'react';
// ============================================================
// ATLAS Terminal — Multi-Stage FCFF DCF Panel
// ------------------------------------------------------------
// Implements a 2-stage or 3-stage FCFF DCF with per-stage
// growth interpolation and a full year-by-year projection table.
// Mirrors analytics/multistage_dcf.py (MultiStageProjectionEngine).
//
// Exports: MultiStagePanel, TrapBanner
// ============================================================

import { fmt, fmtPct, fmtCurrency, useChart } from './utils.js';
import { runMultiStageFCFF, detectTraps, Tile, Slider, fN, fB } from './dcf-engine.js';

const { useState, useRef, useMemo } = React;
const h = React.createElement;

// ---- Severity colours ----
var SEV_COLOR = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', INFO: '#6366f1' };
var SEV_BG    = { CRITICAL: 'rgba(239,68,68,0.08)', HIGH: 'rgba(249,115,22,0.08)', MEDIUM: 'rgba(245,158,11,0.08)', INFO: 'rgba(99,102,241,0.08)' };

// ============================================================
// TrapBanner — institutional DCF quality check warnings
// Props: defaults, wacc, tg, fcfMargin, dcfResult
// ============================================================

export function TrapBanner(p) {
    var warnings = detectTraps(p.defaults, p.wacc, p.tg, p.fcfMargin, p.dcfResult);
    if (!warnings || !warnings.length) {
        return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'rgba(16,185,129,0.08)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)', marginBottom: 16, fontSize: 11, color: '#10b981' } },
            h('span', null, '✓'),
            h('span', null, 'No institutional quality flags detected for these assumptions.')
        );
    }

    var maxSev = warnings.reduce(function(m, w) {
        var order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, INFO: 1 };
        return (order[w.severity] || 0) > (order[m] || 0) ? w.severity : m;
    }, 'INFO');

    return h('div', { style: { marginBottom: 16 } },
        h('div', { style: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: SEV_COLOR[maxSev], marginBottom: 8, fontWeight: 600 } },
            warnings.length + ' Quality Flag' + (warnings.length > 1 ? 's' : '') + ' Detected'
        ),
        warnings.map(function(w) {
            return h('div', { key: w.id, style: {
                padding: '10px 14px', borderRadius: 8, marginBottom: 8,
                background: SEV_BG[w.severity] || 'rgba(255,255,255,0.04)',
                border: '1px solid ' + (SEV_COLOR[w.severity] || 'rgba(255,255,255,0.1)') + '44',
            }},
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 } },
                    h('span', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: SEV_COLOR[w.severity] } }, w.severity),
                    h('span', { style: { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)' } }, w.title),
                    h('span', { style: { marginLeft: 'auto', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: SEV_COLOR[w.severity] } }, w.metric)
                ),
                h('div', { style: { fontSize: 11, color: 'rgba(255,255,255,0.62)', marginBottom: 4, lineHeight: 1.5 } }, w.description),
                h('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.42)', fontStyle: 'italic' } }, w.recommendation)
            );
        })
    );
}

// ============================================================
// Projection Table — full line-item view per year
// ============================================================

function ProjectionTable(p) {
    var rows = p.projections;
    if (!rows || !rows.length) return null;

    var th = { padding: '6px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'rgba(255,255,255,0.45)', textAlign: 'right', whiteSpace: 'nowrap' };
    var td = function(val, color) {
        return h('td', { style: { padding: '5px 8px', fontSize: 11, fontFamily: "'JetBrains Mono',monospace", textAlign: 'right', color: color || 'rgba(255,255,255,0.88)' } }, val);
    };
    var pctFmt = function(v) { return v != null ? (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%' : '—'; };

    return h('div', { style: { overflowX: 'auto' } },
        h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } },
            h('thead', null,
                h('tr', null,
                    h('th', { style: Object.assign({}, th, { textAlign: 'left' }) }, 'Year'),
                    h('th', { style: th }, 'Stage'),
                    h('th', { style: th }, 'Revenue'),
                    h('th', { style: th }, 'Rev. G'),
                    h('th', { style: th }, 'EBIT Margin'),
                    h('th', { style: th }, 'NOPAT'),
                    h('th', { style: th }, 'D&A'),
                    h('th', { style: th }, 'CapEx'),
                    h('th', { style: th }, 'ΔNWC'),
                    h('th', { style: th }, 'SBC'),
                    h('th', { style: Object.assign({}, th, { color: '#00d4ff' }) }, 'FCFF'),
                    h('th', { style: th }, 'PV(FCFF)')
                )
            ),
            h('tbody', null,
                rows.map(function(r) {
                    var bg = rows.indexOf(r) % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
                    return h('tr', { key: r.year, style: { background: bg, borderBottom: '1px solid rgba(255,255,255,0.04)' } },
                        h('td', { style: { padding: '5px 8px', fontWeight: 700, color: '#00d4ff', fontSize: 11 } }, 'Y' + r.year),
                        h('td', { style: { padding: '5px 8px', fontSize: 10, color: 'rgba(255,255,255,0.5)' } }, r.stage),
                        td(fB(r.revenue)),
                        td(pctFmt(r.revGrowth), r.revGrowth > 0 ? '#10b981' : '#ef4444'),
                        td((r.ebitMargin * 100).toFixed(1) + '%'),
                        td(fB(r.nopat)),
                        td(fB(r.da), 'rgba(255,255,255,0.55)'),
                        td(fB(r.capex), '#ef4444'),
                        td(fB(r.nwcChange), 'rgba(255,255,255,0.55)'),
                        td(fB(r.sbc), 'rgba(255,255,255,0.55)'),
                        td(fB(r.fcff), r.fcff >= 0 ? '#10b981' : '#ef4444'),
                        td(fB(r.pvFcf), 'rgba(255,255,255,0.7)')
                    );
                })
            )
        )
    );
}

// ============================================================
// Stage editor row
// ============================================================

function StageRow(p) {
    var s = p.stage, idx = p.idx, onChange = p.onChange;
    var fmtPt = function(v) { return (v * 100).toFixed(1) + '%'; };

    var field = function(label, key, min, max, step) {
        return h('div', { style: { flex: 1, minWidth: 100 } },
            h('div', { style: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, color: 'rgba(255,255,255,0.42)', marginBottom: 3 } }, label),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                h('input', {
                    type: 'range', min: min, max: max, step: step, value: s[key],
                    onChange: function(e) { onChange(idx, key, parseFloat(e.target.value)); },
                    style: { flex: 1, accentColor: '#6366f1' }
                }),
                h('span', { style: { fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: '#6366f1', minWidth: 40, textAlign: 'right' } },
                    fmtPt(s[key]))
            )
        );
    };

    return h('div', { style: {
        padding: '14px 16px', borderRadius: 10,
        background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
        marginBottom: 12,
    }},
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 } },
            h('div', { style: { fontSize: 12, fontWeight: 700, color: '#6366f1', minWidth: 80 } }, s.name),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { fontSize: 10, color: 'rgba(255,255,255,0.45)' } }, 'Years:'),
                h('input', {
                    type: 'range', min: 1, max: 10, step: 1, value: s.years,
                    onChange: function(e) { onChange(idx, 'years', parseInt(e.target.value)); },
                    style: { width: 100, accentColor: '#6366f1' }
                }),
                h('span', { style: { fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: '#6366f1', minWidth: 20 } }, s.years)
            )
        ),
        h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
            field('Rev. Growth Start', 'revGrowthStart', -0.10, 0.40, 0.01),
            field('Rev. Growth End', 'revGrowthEnd', -0.05, 0.30, 0.01),
            field('EBIT Margin', 'ebitMargin', 0.01, 0.60, 0.005),
            field('CapEx %', 'capexPct', 0.01, 0.25, 0.005),
            field('D&A %', 'daPct', 0.01, 0.15, 0.005)
        )
    );
}

// ============================================================
// MultiStagePanel — main exported component
// ============================================================

export function MultiStagePanel(p) {
    var defaults = p.defaults, price = p.price;

    var DEFAULT_STAGES_2 = [
        { name: 'High Growth',  years: 5, revGrowthStart: Math.min(defaults.revGrowth || 0.12, 0.35), revGrowthEnd: 0.07, ebitMargin: Math.max(defaults.fcfMargin * 1.3, 0.10), capexPct: defaults.capexPct || 0.05, daPct: defaults.daPct || 0.04, nwcPct: defaults.nwcPct || 0.02, sbcPct: defaults.sbcPct || 0.02 },
        { name: 'Transition',   years: 5, revGrowthStart: 0.07, revGrowthEnd: 0.03, ebitMargin: Math.max(defaults.fcfMargin * 1.1, 0.08), capexPct: defaults.capexPct || 0.05, daPct: defaults.daPct || 0.04, nwcPct: defaults.nwcPct || 0.02, sbcPct: defaults.sbcPct || 0.02 },
    ];
    var DEFAULT_STAGES_3 = DEFAULT_STAGES_2.concat([
        { name: 'Maturity',     years: 5, revGrowthStart: 0.04, revGrowthEnd: 0.025, ebitMargin: Math.max(defaults.fcfMargin || 0.10, 0.08), capexPct: defaults.capexPct || 0.05, daPct: defaults.daPct || 0.04, nwcPct: defaults.nwcPct || 0.02, sbcPct: defaults.sbcPct || 0.02 },
    ]);

    var _m = useState('two'), mode = _m[0], setMode = _m[1];
    var _s = useState(DEFAULT_STAGES_2), stages = _s[0], setStages = _s[1];
    var _tg = useState(0.025), tg = _tg[0], setTg = _tg[1];
    var _show = useState(false), showTable = _show[0], setShowTable = _show[1];

    function switchMode(m) {
        setMode(m);
        setStages(m === 'three' ? DEFAULT_STAGES_3 : DEFAULT_STAGES_2);
    }

    function handleStageChange(idx, key, val) {
        var next = stages.map(function(s, i) {
            if (i !== idx) return s;
            var upd = Object.assign({}, s);
            upd[key] = val;
            return upd;
        });
        setStages(next);
    }

    var result = useMemo(function() {
        return runMultiStageFCFF(defaults, stages, tg);
    }, [defaults, stages, tg]);

    if (!defaults || !defaults.revenue || !defaults.shares) {
        return h('div', { className: 'card', style: { padding: 32, color: 'var(--text-muted)', textAlign: 'center' } },
            'Multi-Stage DCF requires revenue and shares outstanding data.');
    }

    // Mode selector
    var modeBar = h('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
        ['two', 'three'].map(function(m) {
            var a = mode === m;
            return h('button', { key: m, onClick: function() { switchMode(m); }, style: {
                padding: '6px 16px', borderRadius: 6, fontSize: 11, fontWeight: a ? 600 : 400, cursor: 'pointer',
                background: a ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                color: a ? '#6366f1' : 'rgba(255,255,255,0.6)',
                border: '1px solid ' + (a ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'),
                textTransform: 'uppercase', letterSpacing: 0.8,
            }}, m === 'two' ? '2-Stage' : '3-Stage');
        }),
        h('div', { style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 } },
            h('span', { style: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-sec)' } }, 'Terminal Growth'),
            h('input', { type: 'range', min: 0.005, max: 0.04, step: 0.0025, value: tg, onChange: function(e) { setTg(parseFloat(e.target.value)); }, style: { width: 100, accentColor: '#00d4ff' } }),
            h('span', { style: { fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: '#00d4ff', minWidth: 36 } }, (tg * 100).toFixed(2) + '%')
        )
    );

    // Stage editors
    var stageEditors = stages.map(function(s, i) {
        return h(StageRow, { key: i, stage: s, idx: i, onChange: handleStageChange });
    });

    // Results
    var resultSection = null;
    if (result) {
        var fmtPt = function(v) { return v != null ? (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%' : '—'; };
        var upsideColor = result.upside > 0 ? '#10b981' : (result.upside < 0 ? '#ef4444' : null);

        resultSection = h('div', null,
            // Trap banner
            h(TrapBanner, { defaults: defaults, wacc: result.wacc, tg: tg, fcfMargin: defaults.fcfMargin, dcfResult: result }),

            // Summary tiles
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 } },
                h(Tile, { label: 'Intrinsic / Share', value: fmtCurrency(result.perShare), color: upsideColor }),
                h(Tile, { label: 'Current Price', value: price ? fmtCurrency(price) : '—' }),
                h(Tile, { label: 'Upside', value: fmtPt(result.upside), color: upsideColor }),
                h(Tile, { label: 'TV % of EV', value: (result.tvPct * 100).toFixed(0) + '%', color: result.tvPct > 0.75 ? '#f59e0b' : null })
            ),

            // Valuation bridge
            h('div', { className: 'card', style: { marginBottom: 16 } },
                h('div', { className: 'card-title' }, 'Valuation Bridge'),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' } }, h('span', { style: { color: 'var(--text-sec)' } }, 'PV of Explicit FCF'), h('span', null, fB(result.pvFcfSum))),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' } }, h('span', { style: { color: 'var(--text-sec)' } }, 'PV of Terminal Value'), h('span', null, fB(result.pvTv))),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)' } }, h('span', null, 'Enterprise Value'), h('span', null, fB(result.evTotal))),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' } }, h('span', { style: { color: 'var(--text-sec)' } }, 'Less: Net Debt (est.)'), h('span', null, fB(result.evTotal - result.eqValue))),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 700, color: '#00d4ff' } }, h('span', null, 'Per-Share Value'), h('span', null, fmtCurrency(result.perShare)))
            ),

            // Projection table toggle
            h('div', { className: 'card' },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showTable ? 16 : 0 } },
                    h('div', { className: 'card-title', style: { marginBottom: 0 } }, 'Year-by-Year Projection Table'),
                    h('button', {
                        onClick: function() { setShowTable(!showTable); },
                        style: { fontSize: 10, padding: '4px 12px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }
                    }, showTable ? 'Hide' : 'Show')
                ),
                showTable ? h(ProjectionTable, { projections: result.projections }) : null
            )
        );
    } else {
        resultSection = h('div', { className: 'card', style: { color: 'var(--text-muted)', padding: 24, textAlign: 'center' } },
            'Insufficient data — add revenue and shares outstanding.');
    }

    return h('div', null,
        modeBar,
        h('div', { style: { marginBottom: 16 } }, stageEditors),
        resultSection
    );
}
