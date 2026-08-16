// ============================================================
// Nexus — Quick Ticket
// ------------------------------------------------------------
// Click a counter in the Holdings table, get a ticket.
//
// This is deliberately NOT a second trading path. It imports the same
// three engines the Trade module's full ticket uses:
//
//   sizing.js      sizeByPercent / deriveAll   — the five derived quantities
//   coherence.js   assessCoherence             — posture + size multiplier
//   tradeData.js   loadSignalScores / loadBook — the same inputs
//
// and posts the same `ledger` payload to the same endpoint. If the
// methodology changes in the Trade module it changes here, because there is
// only one copy of it. What is dropped is depth, not rigour: no book-impact
// pane, no trigger arming, no staged clips. Anything the quick ticket cannot
// show, it says it cannot show, and links to the full ticket.
//
// The gates are the same gates. A quick ticket that could be submitted in
// situations the full ticket blocks would be a hole in the methodology, not
// a convenience.
// ============================================================

import React from 'react';
import { sizeByPercent, deriveAll, DEFAULT_STEP_PCT } from '../../lib/trade/sizing.js';
import { assessCoherence, POSTURE_LABELS, reconcileSize, requiresTrigger } from '../../lib/trade/coherence.js';
import * as data from '../../lib/trade/tradeData.js';

const { useState, useEffect, useMemo, useCallback, useRef } = React;
const e = React.createElement;

const isNum = (v) => typeof v === 'number' && isFinite(v);
const money = (v, d = 0) => (isNum(v) ? '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const pct = (v, d = 2) => (isNum(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(d) + '%' : '—');
const pctPlain = (v, d = 2) => (isNum(v) ? (v * 100).toFixed(d) + '%' : '—');

const POSTURE_TONE = {
    act: 'qt-ok', scale_in: 'qt-warn', wait_for_trigger: 'qt-warn',
    stand_aside: 'qt-bad', oppose: 'qt-bad',
};

export function NexusQuickTicket({ holding, equityHint, onClose }) {
    const symbol = holding && holding.tk;
    const [side, setSide] = useState(holding && holding.tradeSide === 'sell' ? 'sell' : 'buy');
    const [pctInput, setPctInput] = useState(0.005);   // 0.50% of equity
    const [loading, setLoading] = useState(true);
    const [signals, setSignals] = useState(null);
    const [book, setBook] = useState(null);
    const [claims, setClaims] = useState([]);
    const [claimText, setClaimText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [ack, setAck] = useState(false);      // acknowledge a non-Act posture
    const closeRef = useRef(null);

    // ── Load the same inputs the full ticket loads ────────────
    useEffect(() => {
        if (!symbol) return undefined;
        let alive = true;
        setLoading(true);
        Promise.all([
            data.loadSignalScores(symbol).catch(() => null),
            data.loadBook().catch(() => null),
            data.loadClaims(symbol).catch(() => []),
        ]).then(([sig, bk, cl]) => {
            if (!alive) return;
            setSignals(sig);
            setBook(bk);
            setClaims(cl || []);
            setLoading(false);
        });
        return () => { alive = false; };
    }, [symbol]);

    // Escape closes; focus lands on the close button so the modal is keyboard-usable.
    useEffect(() => {
        const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        if (closeRef.current) closeRef.current.focus();
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const price = holding && isNum(holding.price) ? holding.price : null;
    const equity = (book && book.account && isNum(Number(book.account.equity)))
        ? Number(book.account.equity)
        : (isNum(equityHint) ? equityHint : null);
    const longMarketValue = book && book.account && isNum(Number(book.account.long_market_value))
        ? Number(book.account.long_market_value) : null;

    // ── Coherence: the same call the full ticket makes ────────
    const coherence = useMemo(() => {
        if (!signals || !signals.available || !signals.families.length) {
            return { insufficient: true, reason: signals ? (signals.reason || 'no signal scores on file') : null };
        }
        return assessCoherence(signals.families, { side, context: { symbol } });
    }, [signals, side, symbol]);

    const ctx = useMemo(() => ({
        price, equity, longMarketValue,
        atr: null,
        allowFractional: false,
    }), [price, equity, longMarketValue]);

    // Model size, then the coherence multiplier applied exactly as §5.6 has it.
    const sized = useMemo(() => {
        if (!isNum(price) || !isNum(equity)) return null;
        return sizeByPercent(pctInput, ctx);
    }, [pctInput, ctx, price, equity]);

    const reconciled = useMemo(() => {
        if (!sized || coherence.insufficient) return sized;
        const r = reconcileSize({
            requestedPct: pctInput,
            requestedQty: sized.qty,
            sizeMultiplier: coherence.sizeMultiplier,
            price,
        });
        return { ...sized, ...deriveAll(r.qty, ctx), modelQty: sized.qty, multiplierApplied: true };
    }, [sized, coherence, pctInput, price, ctx]);

    const derived = reconciled || sized;
    const existingClaim = claims && claims.length ? claims[0] : null;
    const posture = coherence.insufficient ? null : coherence.posture;
    const needsAck = !!posture && posture !== 'act';

    // ── Gate — the same conditions as the full ticket ─────────
    const gate = useMemo(() => {
        if (loading) return { canSubmit: false, label: 'LOADING…' };
        if (!isNum(price) || !isNum(equity)) {
            return { canSubmit: false, label: 'NO PRICE', message: 'No price or equity on file — the ticket cannot size a trade it cannot value.' };
        }
        if (!derived || !isNum(derived.qty) || derived.qty === 0) {
            return { canSubmit: false, label: 'SIZE IS ZERO', message: 'These inputs derive a quantity of zero.' };
        }
        if (!existingClaim && !claimText.trim()) {
            return { canSubmit: false, label: 'CLAIM REQUIRED', message: 'No claim on file for ' + symbol + '. State the thesis to enable the ticket.' };
        }
        if (needsAck && !ack) {
            return {
                canSubmit: false, label: 'POSTURE: ' + (POSTURE_LABELS[posture] || posture).toUpperCase(),
                message: 'The signal set does not say act. Acknowledge that you are trading against the read, or open the full ticket to arm a trigger instead.',
            };
        }
        return { canSubmit: true };
    }, [loading, price, equity, derived, existingClaim, claimText, needsAck, ack, posture, symbol]);

    const submit = useCallback(async () => {
        if (!gate.canSubmit) return;
        if (existingClaim && ['bending', 'broken'].includes(existingClaim.status)) {
            const ok = window.confirm(
                `The claim on ${symbol} is ${existingClaim.status.toUpperCase()}:\n\n"${existingClaim.claim_text}"\n\n`
                + 'Adding to a position whose claim is already in trouble is exactly the trade the claim gate exists to slow down. Continue?',
            );
            if (!ok) return;
        }
        setSubmitting(true);
        setResult(null);
        try {
            let claimId = existingClaim ? existingClaim.id : null;
            if (claimText.trim()) {
                claimId = await data.upsertClaim({
                    symbol, claimText: claimText.trim(), falsifierText: null, reviewBy: null,
                    existingId: existingClaim ? existingClaim.id : null,
                });
            }
            const body = {
                symbol, side,
                qty: Math.abs(derived.qty),
                type: 'market',
                tif: 'day',
                ledger: {
                    intent: side === 'sell' ? 'trim' : 'add',
                    rationale: claimText.trim() || (existingClaim ? existingClaim.claim_text : null),
                    snapshot: coherence.insufficient ? null : coherence.familyVector,
                    conviction: coherence.insufficient ? null : Math.round(Math.abs(coherence.net) * 100),
                    trade: {
                        // Marked so the blotter can tell a quick ticket from a full
                        // one — same methodology, less context on screen at the time.
                        source: 'nexus_quick_ticket',
                        sizing_method: 'percent_of_portfolio',
                        pct_of_equity: derived.pctOfEquity,
                        pct_of_gross: derived.pctOfGross,
                        model_qty: derived.modelQty != null ? derived.modelQty : derived.qty,
                        submitted_qty: derived.qty,
                        is_override: false,
                        coherence_net: coherence.insufficient ? null : round4(coherence.net),
                        coherence_alignment: coherence.insufficient ? null : round4(coherence.alignment),
                        coherence_dispersion: coherence.insufficient ? null : round4(coherence.dispersion),
                        size_multiplier: coherence.insufficient ? null : round4(coherence.sizeMultiplier),
                        multiplier_applied: !coherence.insufficient,
                        posture: posture || null,
                        posture_acknowledged: needsAck ? true : null,
                        claim_id: claimId,
                        // Honest about what this ticket did NOT measure.
                        book_impact: null,
                        book_impact_omitted: 'quick ticket — open the full ticket for effective exposure and marginal risk',
                    },
                },
            };
            const r = await fetch('/api/trading?action=order', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || j.message || 'HTTP ' + r.status);
            setResult({ ok: true, message: `Order away: ${side} ${Math.abs(derived.qty)} ${symbol}. Intent and coherence vector stored on the ledger row.` });
        } catch (err) {
            setResult({ ok: false, message: err.message || String(err) });
        } finally {
            setSubmitting(false);
        }
    }, [gate, existingClaim, claimText, symbol, side, derived, coherence, posture, needsAck]);

    if (!holding) return null;

    const stepDown = () => setPctInput(v => Math.max(DEFAULT_STEP_PCT, +(v - DEFAULT_STEP_PCT).toFixed(5)));
    const stepUp = () => setPctInput(v => +(v + DEFAULT_STEP_PCT).toFixed(5));

    return e('div', { className: 'qt-overlay', onClick: onClose },
        e('div', { className: 'qt-modal', onClick: ev => ev.stopPropagation(), role: 'dialog', 'aria-label': 'Quick ticket ' + symbol },

            // ── Header ────────────────────────────────────────
            e('div', { className: 'qt-head' },
                e('div', null,
                    e('span', { className: 'qt-tk' }, symbol),
                    holding.name ? e('span', { className: 'qt-name' }, holding.name) : null),
                e('div', { className: 'qt-headright' },
                    e('span', { className: 'qt-px' }, money(price, 2)),
                    e('button', { className: 'qt-x', onClick: onClose, ref: closeRef, 'aria-label': 'Close' }, '✕'))),

            e('div', { className: 'qt-sub' },
                (holding.sector || '—') + ' · ' + (holding.theme || 'Unclassified')
                + ' · now ' + (isNum(holding.currentWeightPct) ? holding.currentWeightPct.toFixed(2) : '—') + '% of equity'),

            // ── Side ──────────────────────────────────────────
            e('div', { className: 'qt-row' },
                e('div', { className: 'qt-side' },
                    ['buy', 'sell'].map(s => e('button', {
                        key: s, className: 'qt-sidebtn ' + s + (side === s ? ' active' : ''),
                        onClick: () => setSide(s),
                    }, s.toUpperCase()))),
                e('div', { className: 'qt-sizer' },
                    e('button', { className: 'qt-step', onClick: stepDown, 'aria-label': 'Smaller' }, '−'),
                    e('span', { className: 'qt-pct' }, (pctInput * 100).toFixed(2) + '%'),
                    e('button', { className: 'qt-step', onClick: stepUp, 'aria-label': 'Larger' }, '+'),
                    e('span', { className: 'qt-pctlbl' }, 'of equity'))),

            // ── Coherence read ────────────────────────────────
            loading
                ? e('div', { className: 'qt-note' }, 'Loading the signal set…')
                : coherence.insufficient
                    ? e('div', { className: 'qt-note qt-warn' },
                        'No coherence read: ' + (coherence.reason || 'insufficient signal families') + '. '
                        + 'The ticket will size at your requested percent with no multiplier applied, and the ledger row will record that no read existed.')
                    : e('div', { className: 'qt-coh' },
                        e('div', { className: 'qt-cohhead' },
                            e('span', { className: 'qt-posture ' + (POSTURE_TONE[posture] || '') },
                                (POSTURE_LABELS[posture] || posture || '').toUpperCase()),
                            e('span', { className: 'qt-cohnums' },
                                'net ' + coherence.net.toFixed(2)
                                + ' · align ' + coherence.alignment.toFixed(2)
                                + ' · ×' + coherence.sizeMultiplier.toFixed(2))),
                        coherence.tension
                            ? e('div', { className: 'qt-tension' }, coherence.tension)
                            : null),

            // ── Derived size ──────────────────────────────────
            e('div', { className: 'qt-derived' },
                derivedRow('Shares', derived && isNum(derived.qty) ? Math.abs(derived.qty).toLocaleString('en-US') : '—'),
                derivedRow('Notional', derived ? money(derived.notional) : '—'),
                derivedRow('% of equity', derived ? pctPlain(derived.pctOfEquity) : '—'),
                derived && derived.modelQty != null && derived.modelQty !== derived.qty
                    ? derivedRow('Model said', Math.abs(derived.modelQty).toLocaleString('en-US') + ' — cut to ' + Math.abs(derived.qty) + ' by the ×' + coherence.sizeMultiplier.toFixed(2) + ' multiplier', 'qt-cut')
                    : null),

            // ── Claim ─────────────────────────────────────────
            existingClaim
                ? e('div', { className: 'qt-claim' },
                    e('span', { className: 'qt-claimtag ' + (existingClaim.status || '') }, (existingClaim.status || 'untested').toUpperCase()),
                    e('span', { className: 'qt-claimtext' }, existingClaim.claim_text))
                : e('textarea', {
                    className: 'qt-claiminput', rows: 2,
                    placeholder: 'No claim on file for ' + symbol + '. What has to be true for this to work?',
                    value: claimText, onChange: ev => setClaimText(ev.target.value),
                }),

            // ── Posture acknowledgement ───────────────────────
            needsAck
                ? e('label', { className: 'qt-ack' },
                    e('input', { type: 'checkbox', checked: ack, onChange: ev => setAck(ev.target.checked) }),
                    e('span', null,
                        'The read says ', e('b', null, (POSTURE_LABELS[posture] || posture)),
                        requiresTrigger(posture)
                            ? ' — the full ticket would arm a trigger instead. I am trading anyway, and this is logged.'
                            : ' — I am trading against it, and this is logged.'))
                : null,

            // ── Submit ────────────────────────────────────────
            e('button', {
                className: 'qt-submit' + (side === 'sell' ? ' sell' : ''),
                disabled: !gate.canSubmit || submitting,
                onClick: submit,
            }, submitting ? 'SUBMITTING…'
                : gate.canSubmit
                    ? `${side.toUpperCase()} ${Math.abs(derived.qty)} ${symbol}`
                    : gate.label),

            gate.message && !gate.canSubmit ? e('div', { className: 'qt-gatemsg' }, gate.message) : null,
            result ? e('div', { className: result.ok ? 'qt-okmsg' : 'qt-gatemsg' },
                (result.ok ? '✓ ' : '⚠ ') + result.message) : null,

            // ── What this ticket does not do ──────────────────
            e('div', { className: 'qt-foot' },
                'Quick ticket: same sizing, coherence and claim gate as the Trade module. It does ',
                e('b', null, 'not'),
                ' show effective exposure, marginal risk or margin, and it cannot arm triggers or stage clips. ',
                e('a', { href: '#/trade?symbol=' + encodeURIComponent(symbol), className: 'qt-link' },
                    'Open the full ticket →'))));
}

function derivedRow(label, value, cls) {
    return e('div', { className: 'qt-drow' + (cls ? ' ' + cls : '') },
        e('span', null, label), e('span', { className: 'qt-dval' }, value));
}

function round4(v) { return isNum(v) ? Math.round(v * 10000) / 10000 : null; }
