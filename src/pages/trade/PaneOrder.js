// ATLAS Trade — Pane A, order construction. Spec §4.1 and §4.2.
//
// Two rules govern this pane:
//
//   All five derived values render at once, whatever method is active. "The
//   method you pick changes which field you type in, never what you get to
//   see." (§4.1)
//
//   Equity is the denominator everywhere. Gross appears twice, read-only, and
//   nothing is computed from it. (§4.1)

import React from 'react';
import { e, Card, Missing, fNum, fPct, fMoney, fBps, DASH } from './shared.js';
import { SIZING_METHODS, DEFAULT_STEP_PCT, stageClips } from '../../lib/trade/sizing.js';

const { useState } = React;

const ORDER_TYPES = [
    { code: 'market', label: 'Market' },
    { code: 'limit', label: 'Limit' },
    { code: 'stop', label: 'Stop' },
    { code: 'staged', label: 'Stage ×3' },
];

export function PaneOrder({
    side, setSide, method, setMethod, input, setInput,
    derived, orderType, setOrderType, limitPrice, setLimitPrice,
    claim, setClaim, claimState, gate, onSubmit, submitting, submitResult,
    price, existingClaim, overrideReason, setOverrideReason, isOverride,
}) {
    const activeMethod = SIZING_METHODS.find((m) => m.code === method) || SIZING_METHODS[0];
    const clips = orderType === 'staged' && derived.qty ? stageClips(derived.qty, 3, { price, side }) : [];

    return e(Card, { title: 'A · ORDER CONSTRUCTION' },
        e('div', { className: 'tr-sidebtn' },
            e('button', { className: side === 'buy' ? 'on buy' : '', onClick: () => setSide('buy'), type: 'button' }, 'BUY'),
            e('button', { className: side === 'sell' ? 'on sell' : '', onClick: () => setSide('sell'), type: 'button' }, 'SELL')),

        e('div', { className: 'tr-lbl' }, 'SIZING METHOD'),
        e('div', { className: 'tr-methods' },
            SIZING_METHODS.map((m) =>
                e('button', {
                    key: m.code, type: 'button',
                    className: 'tr-mth' + (method === m.code ? ' on' : ''),
                    onClick: () => setMethod(m.code),
                },
                    m.label,
                    m.isDefault ? e('span', { className: 'tr-tag' }, 'DEFAULT') : null,
                    m.isOverride ? e('span', { className: 'tr-tag' }, 'LOGGED') : null))),

        e(MethodInput, { method, input, setInput, price }),

        // Both readings, side by side. This is what tells you whether a 2% add
        // is 2% of what you own or 1.3% of what you control.
        e('div', {
            style: {
                display: 'flex', justifyContent: 'space-between', marginTop: 6,
                fontFamily: 'var(--tr-mono)', fontSize: 'var(--tr-fs-3)',
            },
        },
            e('span', { className: 'tr-cy' }, fPct(derived.pctOfEquity, 2, { signed: true }) + ' equity'),
            e('span', { className: 'tr-dim3' }, fPct(derived.pctOfGross, 2, { signed: true }) + ' gross')),

        e('div', { className: 'tr-note' },
            method === 'percent_of_portfolio' ? '0.25% steps. Free entry accepted. ' : '',
            e('b', null, 'Equity is the denominator everywhere'),
            ', for every input and every calculation. Gross is shown for context only and nothing is computed from it.'),

        e(DerivedBlock, { derived }),
        e('div', { className: 'tr-note' },
            'All five render at once. The method you pick changes which field you type in, never what you get to see.'),

        e('div', { className: 'tr-lbl' }, 'ORDER TYPE'),
        e('div', { className: 'tr-chips' },
            ORDER_TYPES.map((t) =>
                e('button', {
                    key: t.code, type: 'button',
                    className: 'tr-chip' + (orderType === t.code ? ' on' : ''),
                    onClick: () => setOrderType(t.code),
                }, t.label))),

        (orderType === 'limit' || orderType === 'stop')
            ? e('div', { style: { marginTop: 8 } },
                e('input', {
                    type: 'number', step: '0.01', value: limitPrice ?? '',
                    onChange: (ev) => setLimitPrice(ev.target.value === '' ? null : Number(ev.target.value)),
                    placeholder: orderType === 'limit' ? 'Limit price' : 'Stop price',
                    style: {
                        width: '100%', background: 'var(--tr-card-2)', border: '1px solid var(--tr-line-2)',
                        borderRadius: 4, color: 'var(--tr-tx)', fontFamily: 'var(--tr-mono)',
                        fontSize: 'var(--tr-fs-4)', padding: '8px 10px',
                    },
                }))
            : null,

        clips.length
            ? e('div', { className: 'tr-derived', style: { marginTop: 8 } },
                clips.map((c) =>
                    e('div', { key: c.clip, className: 'tr-dr' },
                        e('span', { className: 'tr-k' }, `CLIP ${c.clip}`),
                        e('span', { className: 'tr-v' }, `${c.qty} sh @ ${fMoney(c.limitPrice)}`))),
                e('div', { className: 'tr-note', style: { marginTop: 4 } },
                    'Staged entry, 1% apart. Layer 3 returns "scale in" more often than "act now".'))
            : null,

        isOverride
            ? e('div', { style: { marginTop: 10 } },
                e('div', { className: 'tr-lbl', style: { marginTop: 0 } }, 'OVERRIDE REASON · LOGGED'),
                e('textarea', {
                    value: overrideReason || '',
                    onChange: (ev) => setOverrideReason(ev.target.value),
                    placeholder: 'Why this size rather than the model size.',
                    style: {
                        width: '100%', background: 'var(--tr-card-2)', border: '1px solid var(--tr-line-2)',
                        borderRadius: 4, color: 'var(--tr-tx)', fontFamily: 'var(--tr-body)',
                        fontSize: 'var(--tr-fs-4)', padding: '8px 10px', minHeight: 38, resize: 'vertical',
                    },
                }))
            : null,

        e('button', {
            className: 'tr-submit', type: 'button', disabled: !gate.canSubmit || submitting,
            onClick: onSubmit,
        }, submitting ? 'SUBMITTING…' : gate.canSubmit ? `SUBMIT · ${side.toUpperCase()} ${derived.qty ?? 0} ${symbolWord(derived.qty)}` : gate.label),

        gate.canSubmit
            ? null
            : e('div', { className: 'tr-gatemsg' }, '⚠ ' + gate.message),

        submitResult
            ? e('div', { className: submitResult.ok ? 'tr-okmsg' : 'tr-gatemsg' },
                submitResult.ok ? '✓ ' + submitResult.message : '⚠ ' + submitResult.message)
            : null,

        e(ClaimForm, { claim, setClaim, claimState, existingClaim }));
}

function symbolWord(q) { return Math.abs(q || 0) === 1 ? 'SHARE' : 'SHARES'; }

// ── Method input ─────────────────────────────────────────────────────────────

function MethodInput({ method, input, setInput, price }) {
    if (method === 'percent_of_portfolio') {
        const pct = Number(input) || 0;
        const step = (d) => setInput(Math.max(-1, Math.round((pct + d) * 10000) / 10000));
        return e('div', null,
            e('div', { className: 'tr-lbl' }, 'CHANGE IN PORTFOLIO WEIGHT'),
            e('div', { className: 'tr-stepper' },
                e('button', { type: 'button', 'aria-label': 'Decrease by 0.25 percent', onClick: () => step(-DEFAULT_STEP_PCT) }, '−'),
                e('input', {
                    className: 'tr-val', type: 'number', step: 0.25, value: (pct * 100).toFixed(2),
                    'aria-label': 'Change in portfolio weight, percent of equity',
                    onChange: (ev) => setInput(ev.target.value === '' ? 0 : Number(ev.target.value) / 100),
                }),
                e('button', { type: 'button', 'aria-label': 'Increase by 0.25 percent', onClick: () => step(DEFAULT_STEP_PCT) }, '+')));
    }

    const cfg = {
        incremental_risk: { label: 'ADDITIONAL PORTFOLIO VOL', unit: 'bps', step: 1 },
        fixed_fractional: { label: 'RISK BUDGET TO STOP', unit: 'bps', step: 1 },
        equal_risk: { label: 'TARGET MARGINAL RISK CONTRIBUTION', unit: 'bps of vol', step: 1 },
        manual: { label: 'SHARES', unit: 'sh', step: 1 },
    }[method];

    const value = method === 'manual' ? (input && input.qty != null ? input.qty : '') : (input ?? '');

    return e('div', null,
        e('div', { className: 'tr-lbl' }, cfg.label),
        e('div', { className: 'tr-stepper' },
            e('button', {
                type: 'button', 'aria-label': 'Decrease',
                onClick: () => setInput(method === 'manual' ? { qty: Math.max(0, (Number(value) || 0) - cfg.step) } : Math.max(0, (Number(value) || 0) - cfg.step)),
            }, '−'),
            e('input', {
                className: 'tr-val', type: 'number', step: cfg.step, value,
                'aria-label': cfg.label,
                onChange: (ev) => {
                    const v = ev.target.value === '' ? null : Number(ev.target.value);
                    setInput(method === 'manual' ? { qty: v } : v);
                },
            }),
            e('button', {
                type: 'button', 'aria-label': 'Increase',
                onClick: () => setInput(method === 'manual' ? { qty: (Number(value) || 0) + cfg.step } : (Number(value) || 0) + cfg.step),
            }, '+')),
        e('div', { className: 'tr-dim3', style: { fontFamily: 'var(--tr-mono)', fontSize: 'var(--tr-fs-2)', marginTop: 4 } }, cfg.unit));
}

// ── The five derived values ──────────────────────────────────────────────────

function DerivedBlock({ derived }) {
    const row = (k, v, tone, title, cls) => e('div', { className: 'tr-dr' + (cls ? ' ' + cls : ''), title },
        e('span', { className: 'tr-k' }, k),
        e('span', { className: 'tr-v ' + (tone || '') }, v));

    // All six rows in their original order. SHARES carries `hero` because the
    // size is the decision and it was reading as one row among six — the
    // weight moves, the order does not.
    return e('div', { className: 'tr-derived' },
        row('NOTIONAL', fMoney(derived.targetNotional ?? derived.notional)),
        row('SHARES', derived.qty == null ? DASH : String(derived.qty), '', null, 'hero'),
        row('FILLED NOTIONAL', fMoney(derived.filledNotional)),
        row('INCREMENTAL VOL', derived.incrementalVol == null ? DASH : fPct(derived.incrementalVol, 2, { signed: true }),
            'tr-am', 'What this trade adds to portfolio volatility, from the cached covariance matrix'),
        row(`STOP-IMPLIED RISK (${derived.stopMult || 2}×ATR)`,
            derived.stopRisk == null ? DASH : `${fMoney(derived.stopRisk, 0)} · ${fBps(derived.stopRiskBps, 0)}`),
        row('RISK PER $1,000', derived.riskPerThousandBps == null ? DASH : fBps(derived.riskPerThousandBps, 1),
            'tr-cy', 'Incremental portfolio vol divided by notional — what makes two trades of the same size comparable'));
}

// ── The claim gate (§4.2) ────────────────────────────────────────────────────

export function ClaimForm({ claim, setClaim, claimState, existingClaim }) {
    const set = (k) => (ev) => setClaim({ ...claim, [k]: ev.target.value });

    return e('div', { className: 'tr-claim' },
        existingClaim
            ? e('div', {
                className: 'tr-note',
                style: { marginTop: 12, borderLeft: '2px solid var(--tr-amber)', paddingLeft: 8 },
            },
                e('b', { className: 'tr-am' }, `EXISTING CLAIM · ${String(existingClaim.status).toUpperCase()}`),
                e('div', { style: { marginTop: 3 } }, existingClaim.claim_text),
                existingClaim.falsifier_text ? e('div', { className: 'tr-dim3', style: { marginTop: 3 } }, 'Falsifier: ' + existingClaim.falsifier_text) : null,
                ['bending', 'broken'].includes(existingClaim.status)
                    ? e('div', { className: 'tr-am', style: { marginTop: 4 } },
                        'Adding to a position whose claim is ' + existingClaim.status.toUpperCase() + ' requires a confirmation on submit.')
                    : null)
            : null,

        e('div', { className: 'tr-cl' }, 'WHAT MUST BE TRUE'),
        e('textarea', {
            value: claim.claimText, onChange: set('claimText'),
            placeholder: 'Data-centre revenue growth holds above 40% y/y through the next two prints.',
        }),
        e('div', { className: 'tr-cl' }, 'WHAT WOULD FALSIFY IT'),
        e('textarea', {
            value: claim.falsifierText, onChange: set('falsifierText'),
            placeholder: 'Hyperscaler capex guidance cut, or gross margin below 70%.',
        }),
        e('div', { className: 'tr-cl' }, 'BY WHEN'),
        e('input', {
            type: 'date', value: claim.reviewBy || '',
            onChange: (ev) => setClaim({ ...claim, reviewBy: ev.target.value }),
            style: {
                width: '100%', background: 'var(--tr-card-2)', border: '1px solid var(--tr-line-2)',
                borderRadius: 4, color: 'var(--tr-tx)', fontFamily: 'var(--tr-mono)',
                fontSize: 'var(--tr-fs-4)', padding: '8px 10px',
            },
        }),

        claimState.softGate
            ? e('div', { className: 'tr-note' },
                'Soft gate for the first two weeks: you can submit without a claim, and skipping is logged with a reason. ',
                'Hard on day one and you would route around it in a fast market, and the habit never forms.')
            : null);
}
