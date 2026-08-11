// ATLAS Trade — Pane C, coherence. Spec §5.
//
// Reads the stored family vector and renders the three numbers, the radial
// plot, the tension statement, the family table, the size reconciliation and
// the armed triggers. Advisory throughout: submit is never disabled by
// anything on this pane (§5.5).

import React from 'react';
import { e, Card, Row, Missing, fNum, fSigned, fPct, fMoney, DASH, toneOf } from './shared.js';
import { FAMILY_LABELS, POSTURE_LABELS, reconcileSize } from '../../lib/trade/coherence.js';

const RADIAL_ORDER = ['trend', 'flow', 'macro', 'valuation', 'stretch', 'vol_regime'];

export function PaneCoherence({
    symbol, coherence, asOfDate, requested, price, triggers,
    onApplyAdjusted, onArmTriggers, arming,
}) {
    if (!coherence || coherence.insufficient) {
        return e(Card, { title: 'C · COHERENCE' },
            e(Missing, { title: 'NO FAMILY VECTOR ON FILE' },
                (coherence && coherence.reason) || `No signal scores have been written for ${symbol}.`,
                e('div', { style: { marginTop: 10 } },
                    'Layer 3 is deliberately silent rather than neutral here: a score of zero would read as ',
                    '"the families disagree", which is a different and much stronger claim than "nobody has ',
                    'looked". Run ', e('code', null, '/api/trade-sync?job=signals'), ' to populate it.')));
    }

    const adj = reconcileSize({
        requestedPct: requested.pctOfEquity,
        requestedQty: requested.qty,
        requestedNotional: requested.notional,
        sizeMultiplier: coherence.sizeMultiplier,
        price,
    });

    return e(Card, { title: `C · COHERENCE · AS AT ${fmtDate(asOfDate)}` },
        e(ThreeNumbers, { coherence }),
        e(Posture, { coherence }),
        e(RadialPlot, { coherence }),
        e('div', { className: 'tr-note', style: { marginTop: -4, textAlign: 'center' } },
            'Dot size is conviction, opacity is confidence, distance from the dashed ring is score. ',
            'A shape that stays outside the ring agrees with itself.',
            crossings(coherence) ? ` This one crosses it ${crossings(coherence)}.` : ''),

        e('div', { className: 'tr-tension' }, coherence.tension),

        e(FamilyTable, { coherence }),

        e('div', { className: 'tr-lbl' }, 'SIZE RECONCILIATION'),
        e(Row, {
            label: 'Requested',
            value: `${fPct(requested.pctOfEquity, 2)} · ${requested.qty ?? DASH} sh · ${fMoney(requested.notional, 0)}`,
        }),
        e(Row, { label: 'Alignment multiplier', value: '×' + fNum(coherence.sizeMultiplier, 2), tone: 'tr-am' }),
        e(Row, {
            label: 'Coherence-adjusted',
            value: `${fPct(adj.pctOfEquity, 2)} · ${adj.qty ?? DASH} sh · ${fMoney(adj.notional, 0)}`,
            tone: 'tr-cy',
        }),
        e('button', {
            className: 'tr-submit alt', style: { marginTop: 9 }, type: 'button',
            onClick: () => onApplyAdjusted(adj),
            disabled: !adj.qty,
        }, 'APPLY ADJUSTED SIZE'),
        e('div', { className: 'tr-note' },
            'Advisory. Submit is never disabled by coherence. Only eligibility gates disable it.'),

        e(Triggers, { coherence, triggers, onArmTriggers, arming, symbol }));
}

function fmtDate(d) {
    if (!d) return 'TODAY';
    const dt = new Date(d + 'T00:00:00Z');
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
}

function crossings(coh) {
    const n = coh.families.filter((f) => f.score < 0).length;
    const p = coh.families.filter((f) => f.score > 0).length;
    if (!n || !p) return null;
    const fewer = Math.min(n, p);
    return fewer === 1 ? 'once' : fewer === 2 ? 'twice' : `${fewer} times`;
}

// ── The three numbers (§5.3) ─────────────────────────────────────────────────

function ThreeNumbers({ coherence }) {
    const cell = (value, label, tone, title) => e('div', { title },
        e('div', { className: 'tr-n ' + (tone || '') }, value),
        e('div', { className: 'tr-l' }, label));

    return e('div', { className: 'tr-three' },
        cell(fSigned(coherence.net), 'NET',
            Math.abs(coherence.net) < 0.15 ? 'tr-dim' : toneOf(coherence.net),
            'Σ(w·s)/Σw — which way the families lean, weighted by conviction × confidence'),
        cell(fNum(coherence.alignment, 2), 'ALIGNMENT',
            coherence.alignment < 0.35 ? 'tr-am' : coherence.alignment > 0.6 ? 'tr-pos' : '',
            '|Σ(w·s)|/Σ(w·|s|) — how much the families agree'),
        cell(fNum(coherence.dispersion, 2), 'DISPERSION', '',
            'Weighted stdev of s — whether disagreement is broad or comes from one dissenting family'));
}

function Posture({ coherence }) {
    return e('div', { className: 'tr-posture ' + coherence.posture },
        e('span', { className: 'tr-p' }, POSTURE_LABELS[coherence.posture] || DASH),
        e('span', { className: 'tr-m' }, 'SIZE ×' + fNum(coherence.sizeMultiplier, 2)));
}

// ── Radial plot (§5.4) ───────────────────────────────────────────────────────
// One spoke per family, position by score, dot size by conviction, opacity by
// confidence, dashed ring at zero. Agreement looks like a shape.

function RadialPlot({ coherence }) {
    const CX = 150, CY = 150, ZERO_R = 55, MAX_R = 105, MIN_R = 18;
    const byCode = new Map(coherence.families.map((f) => [f.code, f]));
    const codes = RADIAL_ORDER.filter((c) => byCode.has(c));
    if (codes.length < 3) {
        return e('div', { className: 'tr-note', style: { textAlign: 'center', padding: '18px 0' } },
            'Fewer than three families are scoring today — too few for the shape to mean anything.');
    }

    const angle = (i) => (-90 + (360 / codes.length) * i) * (Math.PI / 180);
    const radius = (score) => {
        const r = ZERO_R + score * (MAX_R - ZERO_R);
        return Math.max(MIN_R, Math.min(MAX_R + 8, r));
    };
    const pt = (i, score) => {
        const a = angle(i), r = radius(score);
        return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    };
    const labelPt = (i) => {
        const a = angle(i), r = MAX_R + 28;
        return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    };

    const poly = codes.map((c, i) => pt(i, byCode.get(c).score).join(',')).join(' ');

    return e('svg', {
        viewBox: '0 0 300 300', role: 'img',
        'aria-label': `Radial plot of ${codes.length} signal families against a zero ring`,
    },
        e('circle', { cx: CX, cy: CY, r: MAX_R, fill: 'none', stroke: 'rgba(255,255,255,.05)' }),
        e('circle', { cx: CX, cy: CY, r: 80, fill: 'none', stroke: 'rgba(255,255,255,.035)' }),
        e('circle', { cx: CX, cy: CY, r: 30, fill: 'none', stroke: 'rgba(255,255,255,.035)' }),
        e('circle', { cx: CX, cy: CY, r: ZERO_R, fill: 'none', stroke: '#5a6675', strokeWidth: 1.2, strokeDasharray: '2 3' }),
        e('g', { stroke: 'rgba(255,255,255,.05)' },
            codes.map((c, i) => {
                const a = angle(i);
                return e('line', {
                    key: c, x1: CX, y1: CY,
                    x2: CX + MAX_R * Math.cos(a), y2: CY + MAX_R * Math.sin(a),
                });
            })),
        e('polygon', {
            points: poly, fill: '#3ad6e0', fillOpacity: '.07',
            stroke: '#3ad6e0', strokeOpacity: '.5', strokeWidth: 1.4,
        }),
        e('g', null, codes.map((c, i) => {
            const f = byCode.get(c);
            const [x, y] = pt(i, f.score);
            return e('circle', {
                key: c, cx: x, cy: y,
                r: 2.5 + (f.conviction || 0) * 5,
                fill: f.score >= 0 ? '#26d0a5' : '#ff5f52',
                fillOpacity: 0.35 + (f.confidence || 0) * 0.55,
            }, e('title', null,
                `${FAMILY_LABELS[c] || c}: score ${fSigned(f.score)}, conviction ${fNum(f.conviction, 2)}, confidence ${fNum(f.confidence, 2)}`));
        })),
        e('g', { fontFamily: 'JetBrains Mono', fontSize: '9', fill: '#8b98a8', textAnchor: 'middle' },
            codes.map((c, i) => {
                const [x, y] = labelPt(i);
                return e('text', { key: c, x, y: y + 3 }, (FAMILY_LABELS[c] || c).toUpperCase());
            })),
        e('text', {
            x: CX, y: CY, fontFamily: 'JetBrains Mono', fontSize: '7.5',
            fill: '#5a6675', textAnchor: 'middle', dy: -(ZERO_R + 3),
        }, 'ZERO'));
}

// ── Family table ─────────────────────────────────────────────────────────────

function FamilyTable({ coherence }) {
    return e('table', { className: 'tr-ftable' },
        e('thead', null, e('tr', null,
            e('th', null, 'FAMILY'), e('th', null, 'SCORE'), e('th', null, 'CONV'),
            e('th', null, 'CONF'), e('th', null, 'W'))),
        e('tbody', null,
            coherence.families.map((f) =>
                e('tr', { key: f.code, title: describeInputs(f) },
                    e('td', null, FAMILY_LABELS[f.code] || f.code),
                    e('td', { className: toneOf(f.score) }, fSigned(f.score)),
                    e('td', null, fNum(f.conviction, 2)),
                    e('td', null, fNum(f.confidence, 2)),
                    e('td', { className: f.weight === maxWeight(coherence) ? 'tr-am' : '' }, fNum(f.weight, 2)))),
            (coherence.suppressors || []).map((s) =>
                e('tr', { key: s.code, className: 'tr-dim3', title: s.reason || '' },
                    e('td', { className: 'tr-dim3' }, FAMILY_LABELS[s.code] || s.code),
                    e('td', { className: 'tr-dim3' }, DASH),
                    e('td', { className: 'tr-dim3' }, DASH),
                    e('td', { className: 'tr-dim3' }, s.suppression ? '−' + fNum(s.suppression * 100, 0) + '%' : DASH),
                    e('td', { className: 'tr-dim3' }, 'SUPPR')))));
}

function maxWeight(coh) {
    return coh.families.reduce((m, f) => Math.max(m, f.weight), 0);
}

function describeInputs(f) {
    const subs = f.inputs && f.inputs.sub_scores ? f.inputs.sub_scores : null;
    if (!subs) return '';
    const present = Object.entries(subs).filter(([, v]) => v != null);
    const missing = Object.entries(subs).filter(([, v]) => v == null).map(([k]) => k);
    return `${present.length} of ${Object.keys(subs).length} inputs present`
        + (missing.length ? ` · missing: ${missing.join(', ')}` : '')
        + (f.convictionMethod ? ` · conviction by ${f.convictionMethod.replace(/_/g, ' ')}` : '');
}

// ── Triggers (§5.7) ──────────────────────────────────────────────────────────

function Triggers({ coherence, triggers, onArmTriggers, arming, symbol }) {
    const armed = (triggers || []).filter((t) => t.status === 'armed');
    const proposed = coherence.proposedTriggers || [];
    const needed = coherence.requiresTrigger;

    return e('div', null,
        e('div', { className: 'tr-lbl' }, armed.length ? 'TRIGGERS · ARMED' : 'TRIGGERS · ARMED ON SUBMIT'),

        armed.map((t) =>
            e('div', { key: t.id, className: 'tr-trig' },
                e('span', { className: 'tr-st' }, String(t.trigger_type).toUpperCase().replace('RELATIVE_STRENGTH', 'RS')),
                e('span', { className: 'tr-tx' },
                    e('span', { className: 'tr-w' }, t.description),
                    e('br'),
                    e('span', { className: 'tr-s' },
                        (t.detail || '') + (t.expires_at ? ` · expires ${t.expires_at}` : ' · no expiry')))))
            ,

        !armed.length && proposed.map((t, i) =>
            e('div', { key: i, className: 'tr-trig' },
                e('span', { className: 'tr-st' }, t.type.toUpperCase()),
                e('span', { className: 'tr-tx' },
                    e('span', { className: 'tr-w' }, t.description),
                    e('br'),
                    e('span', { className: 'tr-s' }, (t.detail || '') + (t.expiresAt ? ` · expires ${t.expiresAt}` : ' · no expiry'))))),

        needed && !armed.length && proposed.length
            ? e('button', {
                className: 'tr-submit alt', type: 'button', style: { marginTop: 9 },
                onClick: onArmTriggers, disabled: arming,
            }, arming ? 'ARMING…' : `ARM ${proposed.length} TRIGGER${proposed.length === 1 ? '' : 'S'} · LOG AS DEFERRED`)
            : null,

        e('div', { className: 'tr-note' },
            needed
                ? 'Each fires a notification and reopens this ticket with the intent pre-filled. "Not yet" becomes an object with a lifecycle instead of a hesitation you forget by Thursday.'
                : 'Posture is Act, so no trigger is owed. Arming one anyway is still available from the blotter.'));
}
