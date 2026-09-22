// ============================================================
// Equity Research — Valuation tab.
//
// Four panels, in the order the brief asks for them:
//
//   1. COST OF CAPITAL, for THIS company. The panel it replaces ran
//      every reverse DCF at a hardcoded 8.5% WACC (`parseInputs`), so
//      a verdict about what the market expects was really a verdict
//      about a constant. This reads the engine's own CAPM + credit
//      spread + market-value weights, and when the engine did not run
//      it says so rather than falling back.
//
//   2. THE SGR GATE. Where the sustainable growth rate sits against
//      the cost of capital, and — when it sits above — a refusal with
//      the reason, plus retention and ROE controls so the reader can
//      impute a hypothetical SGR and see what it would take. Nothing
//      is published from an untouched override.
//
//   3. SOURCE DISCIPLINE. Every engine input beside the statement
//      layer's own figure for the same quantity. Nothing is
//      substituted; the gap is named.
//
//   4. REVERSE DCF + VERDICT. Solved at the company's own WACC, with
//      the value bridge, and a verdict whose every clause comes from a
//      measurement. The clause that could not be formed is listed as
//      withheld rather than silently dropped.
// ============================================================
import React from 'react';
import { loadStatementLayer, STATE_LOADED, STATE_FAILED } from './equity/equityStatements.js';
import {
    sgrGate, applySgrOverride, retentionForGrowth, roeForGrowth,
    costOfCapital, reconcileInputs, reverseDcf, reverseDcfVerdict,
    deliveredRecord, sensitivityGrid, driverSweep,
    SGR_STATUS, MIN_TV_SPREAD, VERDICT_BANDS,
} from './equity/valuationReconcile.js';

const { useState, useEffect, useMemo } = React;
const h = React.createElement;

var T = {
    text: '#e6edf5', muted: '#8aa0bb', muted2: '#63748c',
    green: '#22c55e', red: '#ef4444', cyan: '#22d3ee', amber: '#f59e0b',
    card: 'rgba(17,23,31,.97)', card2: 'rgba(20,27,37,.97)',
    border: 'rgba(255,255,255,.08)', border2: 'rgba(255,255,255,.13)',
    mono: "'JetBrains Mono',monospace", display: "'Syne','DM Sans',sans-serif",
};

function Card(p) {
    return h('div', {
        style: Object.assign({
            border: '1px solid ' + T.border, borderRadius: 13,
            background: T.card, padding: 20,
        }, p.style || {}),
    },
        (p.title || p.badge) && h('div', {
            style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
        },
            p.title && h('div', {
                style: { fontFamily: T.display, fontSize: 13, fontWeight: 700, letterSpacing: '.02em', color: T.text },
            }, p.title),
            p.badge && h('span', {
                style: {
                    fontFamily: T.mono, fontSize: 9, letterSpacing: '.1em', padding: '2px 7px',
                    borderRadius: 4, background: 'rgba(34,211,238,.12)', color: T.cyan,
                    border: '1px solid rgba(34,211,238,.25)',
                },
            }, p.badge),
            p.meta && h('span', {
                style: { marginLeft: 'auto', fontFamily: T.mono, fontSize: 10, color: T.muted2 },
            }, p.meta)
        ),
        p.children
    );
}

function Stat(p) {
    return h('div', {
        style: {
            border: '1px solid ' + T.border, borderRadius: 9, padding: '11px 13px',
            background: T.card2, minWidth: 0,
        },
    },
        h('div', {
            style: { fontFamily: T.mono, fontSize: 9, letterSpacing: '.09em', color: T.muted2, textTransform: 'uppercase', marginBottom: 6 },
        }, p.label),
        // ABSENT, not an em dash in a slot that looks like every other slot:
        // the value node is not rendered at all when there is no measurement.
        p.value != null
            ? h('div', { style: { fontFamily: T.mono, fontSize: p.big ? 21 : 16, fontWeight: 600, color: p.color || T.text, lineHeight: 1.15 } }, p.value)
            : h('div', { style: { fontFamily: T.mono, fontSize: 10.5, color: T.muted2, fontStyle: 'italic', lineHeight: 1.5 } }, p.absent || 'not measurable'),
        p.sub && h('div', { style: { fontFamily: T.mono, fontSize: 9.5, color: T.muted2, marginTop: 5, lineHeight: 1.45 } }, p.sub)
    );
}

function Row(p) {
    return h('div', { style: Object.assign({ display: 'grid', gap: 10 }, p.style || {}) }, p.children);
}

function fPct(v, dp) { return v == null || !isFinite(v) ? null : (v * 100).toFixed(dp == null ? 1 : dp) + '%'; }
function fNum(v, dp) { return v == null || !isFinite(v) ? null : Number(v).toFixed(dp == null ? 2 : dp); }
function fUsd(v) {
    if (v == null || !isFinite(v)) return null;
    const a = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(2) + 'T';   // inputs are $M
    if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(2) + 'B';
    return sign + '$' + a.toFixed(0) + 'M';
}
function fByUnit(v, unit) {
    if (v == null || !isFinite(v)) return null;
    if (unit === 'pct') return fPct(v, 2);
    if (unit === 'ratio') return fNum(v, 3);
    if (unit === 'musd') return fUsd(v);
    if (unit === 'usd') return '$' + Number(v).toFixed(2);
    if (unit === 'm') return Number(v).toFixed(0) + 'M';
    return fNum(v);
}

// ── 1. Cost of capital ───────────────────────────────────────

function CostOfCapitalPanel(p) {
    const c = p.coc;
    if (!c) {
        return h(Card, { title: 'Cost of capital' },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.amber, lineHeight: 1.65 } },
                'The valuation engine did not resolve for this symbol, so there is no cost of capital '
              + 'derived from its beta, credit spread and capital structure. Every model below needs one, '
              + 'and none of them is run against a placeholder.'));
    }
    return h(Card, {
        title: 'Cost of capital', badge: 'THIS COMPANY',
        meta: 'CAPM on the reported beta · Damodaran spread on debt/EBITDA · market-value weights',
    },
        h(Row, { style: { gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))' } },
            h(Stat, { label: 'Cost of equity', value: fPct(c.re, 2), big: true, color: T.cyan,
                      sub: 'rf ' + fPct(c.rf, 2) + ' + β ' + fNum(c.beta) + ' × ERP ' + fPct(c.erp, 1) }),
            h(Stat, { label: 'WACC', value: fPct(c.wacc, 2), big: true, color: T.cyan,
                      absent: 'no capital structure on file',
                      sub: c.wd != null ? 'debt weight ' + fPct(c.wd, 1) + ' · tax ' + fPct(c.tax, 1) : null }),
            h(Stat, { label: 'Cost of debt', value: fPct(c.rd, 2) }),
            h(Stat, { label: 'Terminal spread floor', value: fPct(MIN_TV_SPREAD, 1),
                      sub: 'below this the perpetuity is refused' })
        ),
        h('div', { style: { marginTop: 13, fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.7 } },
            'Every figure on this tab is discounted at these rates. The previous panel ran a fixed 8.5% '
          + 'WACC for every symbol in the universe, which made its reverse DCF a statement about that '
          + 'constant rather than about this company.')
    );
}

// ── 2. The SGR gate ──────────────────────────────────────────

function SgrPanel(p) {
    const base = p.base;
    const eff = p.effective;
    const refused = eff.status === SGR_STATUS.REFUSED;
    const unmeasurable = eff.status === SGR_STATUS.UNMEASURABLE;

    const statusColor = refused ? T.red : unmeasurable ? T.muted2 : T.green;
    const statusText = refused ? 'ABSOLUTE MODELS REFUSED'
                     : unmeasurable ? 'SUSTAINABLE GROWTH NOT MEASURABLE'
                     : 'ABSOLUTE MODELS AVAILABLE';

    const reasonText = {
        growth_exceeds_discount_rate:
            'The sustainable growth rate is at or above the discount rate. A perpetuity '
          + 'v = D(1+g)/(r−g) is undefined at g = r and NEGATIVE past it, so there is no fair '
          + 'value to publish — not a large one, not a small one.',
        spread_below_terminal_floor:
            'The sustainable growth rate sits within ' + fPct(MIN_TV_SPREAD, 1) + ' of the discount rate. '
          + 'The perpetuity is finite but explodes: essentially all of the value lands in the terminal '
          + 'term, which is the engine\'s own MIN_TV_SPREAD refusal.',
        no_growth_rate:
            'The sustainable growth rate needs both an ROE and a retention ratio. The statement layer '
          + 'publishes retention as NULL where the vendor\'s dividend line is absent, because that line '
          + 'is unreliable in both directions and absence cannot be read as "paid nothing".',
        no_discount_rate: 'No cost of capital was resolved for this company.',
    }[eff.reason] || null;

    return h(Card, {
        title: 'Sustainable growth against the cost of capital',
        badge: 'GATE',
        meta: 'SGR = ROE × retention',
    },
        h('div', {
            style: {
                display: 'inline-block', fontFamily: T.mono, fontSize: 10, letterSpacing: '.1em',
                padding: '4px 10px', borderRadius: 5, marginBottom: 14,
                color: statusColor, border: '1px solid ' + statusColor + '55',
                background: statusColor + '14',
            },
        }, statusText),

        h(Row, { style: { gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))' } },
            h(Stat, {
                label: eff.applied ? 'SGR (imputed)' : 'Sustainable growth',
                value: fPct(eff.sgr, 2), big: true,
                color: refused ? T.red : T.text,
                absent: 'ROE or retention absent',
                sub: eff.applied && base.sgr != null ? 'reported ' + fPct(base.sgr, 2) : null,
            }),
            h(Stat, { label: 'ROE', value: fPct(eff.roe, 2),
                      sub: eff.overrodeRoe ? 'overridden' : 'as reported' }),
            h(Stat, { label: 'Retention (b)', value: fNum(eff.retention, 3),
                      sub: eff.overrodeRetention ? 'overridden' : 'as reported' }),
            h(Stat, { label: 'Headroom to cost of equity',
                      value: eff.headroomEquity != null ? fPct(eff.headroomEquity, 2) : null,
                      color: eff.headroomEquity != null && eff.headroomEquity < MIN_TV_SPREAD ? T.red : T.green,
                      absent: 'no SGR' }),
            h(Stat, { label: 'Headroom to WACC',
                      value: eff.headroomFirm != null ? fPct(eff.headroomFirm, 2) : null,
                      color: eff.headroomFirm != null && eff.headroomFirm < MIN_TV_SPREAD ? T.red : T.green,
                      absent: 'no SGR' })
        ),

        reasonText && h('div', {
            style: {
                marginTop: 14, padding: '11px 13px', borderRadius: 8,
                border: '1px solid ' + (refused ? 'rgba(239,68,68,.28)' : T.border),
                background: refused ? 'rgba(239,68,68,.07)' : T.card2,
                fontFamily: T.mono, fontSize: 10.5, color: refused ? '#ffb4b4' : T.muted, lineHeight: 1.7,
            },
        }, reasonText),

        // The override. Pre-loaded with the reported inputs, publishing
        // nothing until one of them is moved.
        h('div', { style: { marginTop: 16, paddingTop: 14, borderTop: '1px solid ' + T.border } },
            h('div', {
                style: { fontFamily: T.mono, fontSize: 10, letterSpacing: '.09em', color: T.muted, textTransform: 'uppercase', marginBottom: 4 },
            }, 'Impute a hypothetical SGR'),
            h('div', {
                style: { fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.7, marginBottom: 12 },
            },
                'Move retention, ROE, or both. A reported ROE is often consolidated — a group figure '
              + 'covering segments that earn very different returns — so the number that refuses the '
              + 'model may be papering over the very mix you want to test. Nothing here is published '
              + 'until you move a control, and the imputed SGR is labelled as imputed wherever it is used.'),

            h(Row, { style: { gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' } },
                h(Slider, {
                    label: 'Retention ratio (b)', value: p.retentionOverride,
                    fallback: base.retention, min: 0, max: 1, step: 0.01,
                    fmt: function (v) { return fNum(v, 2); },
                    onChange: p.onRetention,
                }),
                h(Slider, {
                    label: 'Return on equity', value: p.roeOverride,
                    fallback: base.roe, min: 0, max: 1, step: 0.005,
                    fmt: function (v) { return fPct(v, 1); },
                    onChange: p.onRoe,
                })
            ),

            p.targets && h('div', {
                style: { marginTop: 13, fontFamily: T.mono, fontSize: 10, color: T.muted, lineHeight: 1.8 },
            },
                'To clear the cost of equity with ' + fPct(MIN_TV_SPREAD, 1) + ' of terminal spread, '
              + 'the SGR has to come to ' + fPct(p.targets.growth, 2) + ' — which is '
              + (p.targets.retention != null
                    ? 'retention ' + fNum(p.targets.retention, 3) + ' at the current ROE'
                    : 'unreachable at the current ROE at any retention')
              + (p.targets.roe != null
                    ? ', or ROE ' + fPct(p.targets.roe, 2) + ' at the current retention.'
                    : '.')),

            eff.applied && h('button', {
                onClick: p.onReset,
                style: {
                    marginTop: 12, fontFamily: T.mono, fontSize: 10, color: T.muted,
                    background: 'transparent', border: '1px solid ' + T.border2,
                    borderRadius: 6, padding: '5px 11px', cursor: 'pointer',
                },
            }, 'Reset to reported')
        )
    );
}

function Slider(p) {
    const overridden = p.value != null;
    const shown = overridden ? p.value : p.fallback;
    return h('div', {
        style: { border: '1px solid ' + T.border, borderRadius: 9, padding: '11px 13px', background: T.card2 },
    },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 } },
            h('span', { style: { fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.08em', color: T.muted2, textTransform: 'uppercase' } }, p.label),
            h('span', {
                style: { fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: overridden ? T.amber : T.text },
            }, shown != null ? p.fmt(shown) : 'not reported')
        ),
        h('input', {
            type: 'range', min: p.min, max: p.max, step: p.step,
            value: shown != null ? shown : p.min,
            onChange: function (e) { p.onChange(Number(e.target.value)); },
            style: { width: '100%', accentColor: overridden ? T.amber : T.cyan, cursor: 'pointer' },
        }),
        h('div', {
            style: { fontFamily: T.mono, fontSize: 9, color: T.muted2, marginTop: 4 },
        }, overridden ? 'IMPUTED' : (shown != null ? 'as reported' : 'no reported value — move to impute one'))
    );
}

// ── 3. Source discipline ─────────────────────────────────────

const AGREEMENT_LABEL = {
    agree: 'agree', differs: 'differ',
    engine_only: 'engine only', statement_only: 'statements only', neither: 'neither',
};
const AGREEMENT_COLOR = {
    agree: '#22c55e', differs: '#f59e0b',
    engine_only: '#8aa0bb', statement_only: '#8aa0bb', neither: '#63748c',
};

function ReconcilePanel(p) {
    const rec = p.reconciliation;
    if (!rec) {
        return h(Card, { title: 'Source discipline' },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted, lineHeight: 1.7 } },
                'No statement-layer row for this symbol, so the engine\'s inputs cannot be checked '
              + 'against the filings. The engine still runs on the vendor snapshot; nothing here is '
              + 'substituted for it either way.'));
    }
    const c = rec.counts;
    return h(Card, {
        title: 'Source discipline', badge: 'ENGINE vs FILINGS',
        meta: 'FY' + (rec.statementFiscalYear != null ? rec.statementFiscalYear : '—')
            + ' · agree within ' + (rec.tolerance * 100).toFixed(0) + '%',
    },
        h('div', {
            style: { fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.7, marginBottom: 14 },
        },
            'Two measurements of the same quantity: the engine hydrates from the vendor snapshot, the '
          + 'statement layer derives from the filings. NOTHING below is substituted — a disagreement is '
          + 'reported, because a silently preferred source is how a number reaches the screen that '
          + 'nobody can trace back. '
          + c.agree + ' agree, ' + c.differs + ' differ, '
          + (c.engine_only + c.statement_only) + ' carried by one source only, '
          + c.neither + ' by neither.'),

        h('div', { style: { overflowX: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', fontFamily: T.mono, fontSize: 11 } },
                h('thead', null,
                    h('tr', null,
                        ['Input', 'Engine', 'Filings', 'Gap', ''].map(function (label, i) {
                            return h('th', {
                                key: i,
                                style: {
                                    textAlign: i === 0 ? 'left' : i === 4 ? 'left' : 'right',
                                    padding: '7px 10px', borderBottom: '1px solid ' + T.border2,
                                    fontSize: 9, letterSpacing: '.09em', color: T.muted2,
                                    textTransform: 'uppercase', fontWeight: 500, whiteSpace: 'nowrap',
                                },
                            }, label);
                        })
                    )
                ),
                h('tbody', null,
                    rec.rows.map(function (r) {
                        const col = AGREEMENT_COLOR[r.agreement];
                        return h('tr', { key: r.key, title: r.note || '' },
                            h('td', { style: { padding: '7px 10px', color: T.text, borderBottom: '1px solid ' + T.border, whiteSpace: 'nowrap' } }, r.label),
                            h('td', { style: { padding: '7px 10px', textAlign: 'right', color: r.engine != null ? T.text : T.muted2, borderBottom: '1px solid ' + T.border } },
                                r.engine != null ? fByUnit(r.engine, r.unit) : '·'),
                            h('td', { style: { padding: '7px 10px', textAlign: 'right', color: r.statement != null ? T.text : T.muted2, borderBottom: '1px solid ' + T.border } },
                                r.statement != null ? fByUnit(r.statement, r.unit) : '·'),
                            h('td', { style: { padding: '7px 10px', textAlign: 'right', color: col, borderBottom: '1px solid ' + T.border } },
                                r.divergence != null ? (r.divergence >= 0 ? '+' : '') + (r.divergence * 100).toFixed(1) + '%' : '·'),
                            h('td', { style: { padding: '7px 10px', color: col, fontSize: 9.5, borderBottom: '1px solid ' + T.border, whiteSpace: 'nowrap' } },
                                AGREEMENT_LABEL[r.agreement])
                        );
                    })
                )
            )
        )
    );
}

// ── 4. Reverse DCF, the bridge and the verdict ───────────────

function ReverseDcfPanel(p) {
    const rd = p.reverse;
    const verdict = p.verdict;

    if (!rd || !rd.solved) {
        const why = rd && rd.missing && rd.missing.length
            ? 'These inputs are missing: ' + rd.missing.join(', ') + '.'
            : rd && rd.reason === 'outside_solver_bounds'
                ? 'No growth rate between ' + (rd.bounds.growthLo * 100).toFixed(0) + '% and '
                  + (rd.bounds.growthHi * 100).toFixed(0) + '% reproduces the current enterprise value, '
                  + 'so the price is not explained by a growth assumption inside any sane range. The '
                  + 'solver returns nothing rather than its own bound.'
                : 'The reverse DCF could not be solved.';
        return h(Card, { title: 'Reverse DCF — what the price is asking for' },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.amber, lineHeight: 1.7 } }, why));
    }

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        h(Card, {
            title: 'Reverse DCF — what the price is asking for',
            badge: 'SOLVED AT THIS COMPANY\'S WACC',
            meta: 'WACC ' + fPct(rd.wacc, 2) + ' · terminal g ' + fPct(rd.terminalGrowth, 1) + ' · ' + rd.years + 'yr',
        },
            h(Row, { style: { gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' } },
                h(Stat, { label: 'Implied revenue growth', value: fPct(rd.impliedGrowth, 2), big: true, color: T.cyan,
                          sub: p.delivered && p.delivered.revenueCagr != null
                              ? 'delivered ' + fPct(p.delivered.revenueCagr, 1) + ' over ' + (p.delivered.periods - 1) + 'y'
                              : 'no delivered growth on file' }),
                h(Stat, { label: 'Implied margin at delivered growth',
                          value: fPct(rd.impliedMarginAtDeliveredGrowth, 2), big: true,
                          absent: 'needs a delivered growth rate',
                          sub: p.delivered && p.delivered.currentMargin != null
                              ? 'current ' + fPct(p.delivered.currentMargin, 1)
                                + (p.delivered.bestMargin != null ? ' · best ' + fPct(p.delivered.bestMargin, 1) : '')
                              : null }),
                h(Stat, { label: 'Enterprise value priced', value: fUsd(rd.targetEv) }),
                h(Stat, { label: 'Value beyond the window',
                          value: rd.terminalShare != null ? (rd.terminalShare * 100).toFixed(0) + '%' : null,
                          color: rd.terminalShare != null && rd.terminalShare >= VERDICT_BANDS.terminalHeavy ? T.amber : T.text })
            ),

            // The bridge: where the value comes from.
            rd.terminalShare != null && h('div', { style: { marginTop: 16 } },
                h('div', {
                    style: { display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 9.5, color: T.muted2, marginBottom: 6, letterSpacing: '.06em' },
                },
                    h('span', null, 'PV OF THE EXPLICIT ' + rd.years + ' YEARS · ' + fUsd(rd.pvExplicit)),
                    h('span', null, 'TERMINAL VALUE · ' + fUsd(rd.pvTerminal))
                ),
                h('div', {
                    style: { display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', border: '1px solid ' + T.border2 },
                },
                    h('div', {
                        style: {
                            width: ((1 - rd.terminalShare) * 100).toFixed(1) + '%',
                            background: 'rgba(34,211,238,.20)', borderRight: '2px solid ' + T.cyan,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: T.mono, fontSize: 10, color: T.cyan, minWidth: 0,
                        },
                    }, ((1 - rd.terminalShare) * 100).toFixed(0) + '%'),
                    h('div', {
                        style: {
                            flex: 1, background: 'rgba(245,158,11,.16)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: T.mono, fontSize: 10, color: T.amber, minWidth: 0,
                        },
                    }, (rd.terminalShare * 100).toFixed(0) + '%')
                ),
                h('div', {
                    style: { display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 9.5, color: T.muted2, marginTop: 8, letterSpacing: '.05em' },
                },
                    h('span', null, 'EV ' + fUsd(rd.targetEv)),
                    h('span', null, '− net debt ' + fUsd(rd.netDebt)),
                    h('span', { style: { color: T.text } }, '= equity ' + fUsd(rd.equityValue))
                )
            )
        ),

        h(Card, { title: 'Verdict — market expectations against the record', badge: 'DERIVED' },
            verdict.clauses.length === 0
                ? h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.muted, lineHeight: 1.7 } },
                    'Nothing here can be said from the data on file. '
                  + verdict.withheld.map(function (w) { return w.id + ' needs ' + w.needs; }).join('; ') + '.')
                : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 11 } },
                    verdict.clauses.map(function (c) {
                        const col = c.tone === 'demanding' ? T.amber : c.tone === 'cheap' ? T.green : T.muted;
                        return h('div', {
                            key: c.id,
                            style: {
                                display: 'flex', gap: 11, alignItems: 'flex-start',
                                paddingLeft: 11, borderLeft: '2px solid ' + col,
                            },
                        },
                            h('span', {
                                style: { fontFamily: T.mono, fontSize: 9, letterSpacing: '.1em', color: col, textTransform: 'uppercase', minWidth: 62, paddingTop: 2 },
                            }, c.id),
                            h('span', { style: { fontFamily: T.mono, fontSize: 11, color: T.text, lineHeight: 1.75 } }, c.text)
                        );
                    })
                ),
            verdict.withheld.length > 0 && verdict.clauses.length > 0 && h('div', {
                style: { marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + T.border, fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.7 },
            },
                verdict.measured + ' of ' + (verdict.measured + verdict.withheld.length)
              + ' readings could be formed. Withheld: '
              + verdict.withheld.map(function (w) { return w.id + ' (needs ' + w.needs + ')'; }).join(', ')
              + '. A clause with no measurement behind it is absent rather than hedged.')
        )
    );
}

// ── 5. Sensitivity and the driver sweep ──────────────────────

function heat(v, lo, hi) {
    if (v == null || hi <= lo) return 'transparent';
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    // One hue, varying alpha: the grid reads as a magnitude, and colour is
    // not being asked to carry a second meaning.
    return 'rgba(34,211,238,' + (0.06 + t * 0.30).toFixed(3) + ')';
}

function SensitivityPanel(p) {
    const g = p.grid;
    if (!g) return null;
    const flat = [];
    g.cells.forEach(function (row) { row.forEach(function (v) { if (v != null) flat.push(v); }); });
    if (!flat.length) {
        return h(Card, { title: 'Sensitivity' },
            h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.amber, lineHeight: 1.7 } },
                'No cell in this grid produces a valuation — every combination leaves the terminal '
              + 'spread below the ' + fPct(MIN_TV_SPREAD, 1) + ' floor, so the perpetuity is refused throughout.'));
    }
    const lo = Math.min.apply(null, flat), hi = Math.max.apply(null, flat);
    const refused = g.cells.reduce(function (a, row) {
        return a + row.filter(function (v) { return v == null; }).length;
    }, 0);

    return h(Card, {
        title: 'Sensitivity — fair value per share', badge: 'CENTRED ON THIS WACC',
        meta: 'WACC (rows) × terminal growth (columns)',
    },
        h('div', { style: { overflowX: 'auto' } },
            h('div', {
                style: {
                    display: 'grid',
                    gridTemplateColumns: '62px repeat(' + g.growths.length + ',minmax(58px,1fr))',
                    gap: 3, minWidth: 380,
                },
            },
                [h('div', { key: 'corner' })].concat(g.growths.map(function (gg, j) {
                    return h('div', {
                        key: 'gh' + j,
                        style: {
                            fontFamily: T.mono, fontSize: 9, color: j === g.centreIndex ? T.cyan : T.muted2,
                            textAlign: 'center', padding: '4px 0', letterSpacing: '.04em',
                        },
                    }, fPct(gg, 1));
                })),
                g.waccs.map(function (w, i) {
                    return [
                        h('div', {
                            key: 'wh' + i,
                            style: {
                                fontFamily: T.mono, fontSize: 9, color: i === g.centreIndex ? T.cyan : T.muted2,
                                display: 'flex', alignItems: 'center', letterSpacing: '.04em',
                            },
                        }, fPct(w, 1)),
                    ].concat(g.cells[i].map(function (v, j) {
                        const centre = i === g.centreIndex && j === g.centreIndex;
                        return h('div', {
                            key: 'c' + i + '_' + j,
                            style: {
                                fontFamily: T.mono, fontSize: 10, textAlign: 'center', padding: '7px 3px',
                                borderRadius: 4, background: heat(v, lo, hi),
                                border: centre ? '1px solid ' + T.cyan : '1px solid transparent',
                                color: v == null ? T.muted2 : T.text, minWidth: 0,
                            },
                        }, v == null ? 'refused' : '$' + v.toFixed(0));
                    }));
                })
            )
        ),
        h('div', { style: { marginTop: 12, fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.7 } },
            'The outlined cell is this company\'s own cost of capital and terminal growth, so the grid '
          + 'brackets the valuation above rather than a fixed 7.5–9.5% range that a company at a '
          + fPct(g.waccs[g.centreIndex], 1) + ' WACC never occupies.'
          + (refused > 0
                ? '  ' + refused + ' of ' + (g.waccs.length * g.growths.length) + ' cells are REFUSED: '
                  + 'the terminal spread falls below ' + fPct(MIN_TV_SPREAD, 1) + ' there, and a refused '
                  + 'perpetuity is not a low valuation — it is no valuation.'
                : ''))
    );
}

function TornadoPanel(p) {
    const sw = p.sweep;
    if (!sw) return null;
    return h(Card, {
        title: 'What the valuation rests on', badge: 'DRIVER SWING',
        meta: 'fair value ' + '$' + sw.base.toFixed(2) + ' at the base case',
    },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 9 } },
            sw.rows.map(function (r) {
                const scale = sw.maxSwing > 0 ? 100 / sw.maxSwing : 0;
                const upW = r.up != null ? Math.abs(r.up) * scale / 2 : 0;
                const dnW = r.down != null ? Math.abs(r.down) * scale / 2 : 0;
                return h('div', { key: r.id, style: { display: 'flex', alignItems: 'center', gap: 10 } },
                    h('span', {
                        style: { fontFamily: T.mono, fontSize: 10, color: T.muted, width: 128, flexShrink: 0 },
                    }, r.label + ' ±' + (r.delta * 100).toFixed(1) + 'pp'),
                    h('div', { style: { flex: 1, display: 'flex', alignItems: 'center', height: 16, minWidth: 0 } },
                        h('div', { style: { flex: 1, display: 'flex', justifyContent: 'flex-end' } },
                            h('div', { style: { width: dnW + '%', height: 14, background: 'rgba(239,68,68,.35)', borderRadius: '3px 0 0 3px' } })),
                        h('div', { style: { width: 1, height: 16, background: T.border2 } }),
                        h('div', { style: { flex: 1 } },
                            h('div', { style: { width: upW + '%', height: 14, background: 'rgba(34,197,94,.35)', borderRadius: '0 3px 3px 0' } }))
                    ),
                    h('span', {
                        style: { fontFamily: T.mono, fontSize: 10, color: T.muted2, width: 104, textAlign: 'right', flexShrink: 0 },
                    }, r.refused > 0
                        ? r.refused + ' side refused'
                        : '±$' + (r.swing / 2).toFixed(1))
                );
            })
        ),
        h('div', { style: { marginTop: 12, fontFamily: T.mono, fontSize: 10, color: T.muted2, lineHeight: 1.7 } },
            'Ranked by total swing. A side marked REFUSED is a shock that takes the terminal spread '
          + 'below the floor — not a driver that does not matter, which is what a zero would read as.')
    );
}

// ── the tab ──────────────────────────────────────────────────

export function ValuationTab(p) {
    const symbol = p.symbol;
    const inputs = p.inputs;
    const engine = p.engine;

    const [state, setState] = useState({ state: 'loading', rows: [] });
    const [roeOverride, setRoeOverride] = useState(null);
    const [retentionOverride, setRetentionOverride] = useState(null);

    useEffect(function () {
        let live = true;
        setState({ state: 'loading', rows: [] });
        setRoeOverride(null);
        setRetentionOverride(null);
        if (!symbol) return undefined;
        loadStatementLayer(symbol, 'annual').then(function (r) { if (live) setState(r); });
        return function () { live = false; };
    }, [symbol]);

    const rows = state.state === STATE_LOADED ? state.rows : [];
    const latest = rows[0] || null;

    const coc = useMemo(function () { return costOfCapital(engine); }, [engine]);
    const delivered = useMemo(function () { return deliveredRecord(rows); }, [rows]);

    // The gate reads the STATEMENT layer's ROE and retention where it has
    // them — those are derived from the filings rather than from a vendor
    // composite, and the engine's own ROE falls back to a sector default
    // (0.145) when unhydrated, which would make the gate a statement about
    // the default. Falls through to the engine only when the statements
    // carry nothing, and the reconciliation table above shows both.
    const engineState = engine && engine.state;
    const baseRoe = latest && latest.roe != null ? Number(latest.roe)
                  : (engineState && engineState.ri ? engineState.ri.ROE : null);
    const baseRetention = latest && latest.retention_ratio != null ? Number(latest.retention_ratio)
                        : (engineState && engineState.mult ? engineState.mult.b : null);

    const base = useMemo(function () {
        return sgrGate({
            roe: baseRoe, retention: baseRetention,
            costOfEquity: coc && coc.re, wacc: coc && coc.wacc,
        });
    }, [baseRoe, baseRetention, coc]);

    const effective = useMemo(function () {
        return applySgrOverride(base, { roe: roeOverride, retention: retentionOverride });
    }, [base, roeOverride, retentionOverride]);

    const targets = useMemo(function () {
        if (!coc || coc.re == null) return null;
        const g = coc.re - MIN_TV_SPREAD;
        return {
            growth: g,
            retention: retentionForGrowth(effective.roe, g),
            roe: roeForGrowth(effective.retention, g),
        };
    }, [coc, effective.roe, effective.retention]);

    const reconciliation = useMemo(function () {
        if (!engineState || !latest) return null;
        return reconcileInputs(engineState, latest);
    }, [engineState, latest]);

    const reverse = useMemo(function () {
        if (!inputs || !coc || coc.wacc == null) return null;
        return reverseDcf({
            price: p.price,
            shares: inputs.shares,
            netDebt: inputs.netDebt,
            revenue: inputs.revenue,
            // The operating margin the filings report, where they do: the
            // vendor snapshot's margin and the filings' can disagree, and
            // the reconciliation table names which is which.
            margin: latest && latest.operating_margin != null ? Number(latest.operating_margin) : inputs.operM,
            tax: latest && latest.effective_tax_rate != null ? Number(latest.effective_tax_rate) : inputs.taxRate,
            wacc: coc.wacc,
            terminalGrowth: engineState && engineState.fcf ? engineState.fcf.gL : null,
            years: inputs.horizon,
            deliveredGrowth: delivered.revenueCagr,
        });
    }, [inputs, coc, p.price, latest, engineState, delivered.revenueCagr]);

    // The sensitivity grid and the driver sweep run on the SOLVED growth, so
    // their centre cell reproduces the reverse DCF above them rather than a
    // separate valuation the reader has to reconcile by eye.
    const dcfArgs = useMemo(function () {
        if (!reverse || !reverse.solved || !inputs) return null;
        return {
            revenue: inputs.revenue, growth: reverse.impliedGrowth, margin: reverse.margin,
            tax: latest && latest.effective_tax_rate != null ? Number(latest.effective_tax_rate) : inputs.taxRate,
            wacc: reverse.wacc, terminalGrowth: reverse.terminalGrowth, years: reverse.years,
            shares: inputs.shares, netDebt: inputs.netDebt,
        };
    }, [reverse, inputs, latest]);

    const grid = useMemo(function () { return dcfArgs ? sensitivityGrid(dcfArgs) : null; }, [dcfArgs]);
    const sweep = useMemo(function () { return dcfArgs ? driverSweep(dcfArgs) : null; }, [dcfArgs]);

    const verdict = useMemo(function () {
        return reverseDcfVerdict({
            impliedGrowth: reverse && reverse.solved ? reverse.impliedGrowth : null,
            deliveredGrowth: delivered.revenueCagr,
            deliveredPeriods: delivered.periods,
            impliedMarginAtDeliveredGrowth: reverse && reverse.solved ? reverse.impliedMarginAtDeliveredGrowth : null,
            currentMargin: delivered.currentMargin,
            bestObservedMargin: delivered.bestMargin,
            marginPeriods: delivered.marginPeriods,
            sgr: effective.sgr,
            terminalShare: reverse && reverse.solved ? reverse.terminalShare : null,
        });
    }, [reverse, delivered, effective.sgr]);

    if (!inputs) {
        return h('div', { style: { padding: 18, fontFamily: T.mono, fontSize: 11, color: T.muted } }, 'No data loaded.');
    }

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
        h(CostOfCapitalPanel, { coc: coc }),
        h(SgrPanel, {
            base: base, effective: effective, targets: targets,
            roeOverride: roeOverride, retentionOverride: retentionOverride,
            onRoe: setRoeOverride, onRetention: setRetentionOverride,
            onReset: function () { setRoeOverride(null); setRetentionOverride(null); },
        }),
        h(ReverseDcfPanel, { reverse: reverse, verdict: verdict, delivered: delivered }),
        grid && h(SensitivityPanel, { grid: grid }),
        sweep && h(TornadoPanel, { sweep: sweep }),
        state.state === STATE_FAILED
            ? h(Card, { title: 'Source discipline' },
                h('div', { style: { fontFamily: T.mono, fontSize: 11, color: T.red, lineHeight: 1.7 } },
                    'The statement feed did not answer, so the engine\'s inputs could not be checked '
                  + 'against the filings. That is a transport failure, not a statement about the data.'))
            : h(ReconcilePanel, { reconciliation: reconciliation })
    );
}

export default ValuationTab;
