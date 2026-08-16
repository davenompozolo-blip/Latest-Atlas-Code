// ATLAS Trade — /trade/ticket/:symbol. Spec §4.
//
// Three panes replace the current two: order construction, book impact, and
// coherence in the slot the Fundamentals panel used to occupy (with
// fundamentals collapsed beneath it, §8).

import React from 'react';
import { e, Card, Missing, fNum, fPct, fMoney, DASH, toneOf } from './shared.js';
import { PaneOrder } from './PaneOrder.js';
import { PaneBook } from './PaneBook.js';
import { PaneCoherence } from './PaneCoherence.js';
import { size, detectOverride } from '../../lib/trade/sizing.js';
import { computeBookImpact, volDrift, DEFAULT_CORR_THRESHOLD } from '../../lib/trade/bookImpact.js';
import { assessCoherence } from '../../lib/trade/coherence.js';
import { PERIODS } from '../../lib/trade/performance.js';
import { covarianceMatrix, portfolioVol, marginalContributions } from '../../lib/trade/stats.js';
import * as data from '../../lib/trade/tradeData.js';

const { useState, useEffect, useMemo, useCallback } = React;

export function TradeTicket({ symbol, universeContext, onNavigate }) {
    const [book, setBook] = useState(null);
    const [risk, setRisk] = useState(null);
    const [scores, setScores] = useState(null);
    const [claims, setClaims] = useState([]);
    const [triggers, setTriggers] = useState([]);
    const [driftSeries, setDrift] = useState(null);
    const [instrument, setInstrument] = useState(null);
    const [quote, setQuote] = useState(null);
    const [loading, setLoading] = useState(true);

    const [side, setSide] = useState('buy');
    const [method, setMethod] = useState('percent_of_portfolio');
    const [input, setInput] = useState(0.02);
    const [orderType, setOrderType] = useState('market');
    const [limitPrice, setLimitPrice] = useState(null);
    const [claim, setClaim] = useState({ claimText: '', falsifierText: '', reviewBy: '' });
    const [overrideReason, setOverrideReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitResult, setSubmitResult] = useState(null);
    const [arming, setArming] = useState(false);
    const [modelQty, setModelQty] = useState(null);

    // ── Load ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        let live = true;
        setLoading(true);
        Promise.all([
            data.loadBook(),
            data.loadRiskLayer(),
            data.loadSignalScores(symbol),
            data.loadClaims(symbol),
            data.loadTriggers({ symbol, status: null }),
            data.loadVolDrift(),
            data.loadInstrumentSnapshot(symbol),
        ]).then(([b, r, s, c, t, d, inst]) => {
            if (!live) return;
            setBook(b); setRisk(r); setScores(s); setClaims(c); setTriggers(t); setDrift(d);
            setInstrument(inst);
            setLoading(false);
        }).catch(() => { if (live) setLoading(false); });
        return () => { live = false; };
    }, [symbol]);

    // Live quote from the existing Alpaca proxy.
    useEffect(() => {
        let live = true;
        fetch('/api/trading?action=quote&symbol=' + encodeURIComponent(symbol))
            .then((r) => (r.ok ? r.json() : null))
            .then((q) => { if (live) setQuote(q); })
            .catch(() => {});
        return () => { live = false; };
    }, [symbol]);

    const positions = book && book.positions ? book.positions : [];
    const account = book ? book.account : null;
    const equity = account ? account.equity : null;
    const price = quote && quote.last != null
        ? quote.last
        : (risk && risk.lastClose ? risk.lastClose[symbol] : null);

    const held = positions.find((p) => p.symbol === symbol) || null;
    const sectorOf = useCallback((s) => {
        const p = positions.find((x) => x.symbol === s);
        return p ? p.sector : null;
    }, [positions]);

    // ── The incremental-vol closure the sizing engine solves against ─────────
    // Built once per book/risk change, not per keystroke (§4.1).
    const volFns = useMemo(() => {
        if (!risk || !risk.available || !equity || !price) return { incrementalVolFn: null, mctrFn: null };

        const symbols = [];
        const baseW = [];
        for (const p of positions) {
            if (!p.marketValue) continue;
            symbols.push(p.symbol);
            baseW.push(p.marketValue / equity);
        }
        let idx = symbols.indexOf(symbol);
        if (idx < 0) { symbols.push(symbol); baseW.push(0); idx = symbols.length - 1; }

        const { matrix } = covarianceMatrix(symbols, risk.vols, risk.rho, { fallbackRho: 0 });
        const base = portfolioVol(baseW, matrix);
        const dir = side === 'sell' ? -1 : 1;

        const volAt = (qty) => {
            const w = baseW.slice();
            w[idx] = w[idx] + (dir * qty * price) / equity;
            return portfolioVol(w, matrix);
        };

        return {
            incrementalVolFn: (qty) => volAt(qty) - base,
            mctrFn: (qty) => {
                const w = baseW.slice();
                w[idx] = w[idx] + (dir * qty * price) / equity;
                const m = marginalContributions(w, matrix);
                return m[idx];
            },
        };
    }, [risk, positions, equity, price, symbol, side]);

    const atr = useMemo(() => {
        // ATR proxy from the cached daily vol: σ_daily × price is the average
        // absolute move, which is what an ATR stop is really pricing.
        if (!risk || !risk.available) return null;
        const st = risk.vols[symbol];
        if (st == null || !price) return null;
        return (st / Math.sqrt(252)) * price;
    }, [risk, symbol, price]);

    const sizingCtx = {
        price, equity,
        longMarketValue: account ? account.long_market_value : null,
        atr,
        incrementalVolFn: volFns.incrementalVolFn,
        mctrFn: volFns.mctrFn,
    };

    const derived = useMemo(() => size(method, input, sizingCtx),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [method, input, price, equity, atr, volFns, account]);

    const signedQty = derived.qty == null ? null : (side === 'sell' ? -derived.qty : derived.qty);

    const impact = useMemo(() => {
        if (!equity || !price || !risk) return null;
        return computeBookImpact({
            symbol, positions, equity, account, price,
            deltaQty: signedQty || 0,
            rho: risk.rho || (() => null),
            vols: risk.vols || {},
            betas: risk.betas || {},
            clusters: risk.clusters || null,
            sectorOf,
            corrThreshold: DEFAULT_CORR_THRESHOLD,
            volHistory: driftSeries ? volDrift(driftSeries) : null,
            existing: held,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [symbol, positions, equity, account, price, signedQty, risk, driftSeries, held, sectorOf]);

    const coherence = useMemo(() => {
        if (!scores || !scores.available) {
            return { insufficient: true, reason: scores ? scores.reason : null };
        }
        // The tension statement is prose, and prose is more convincing when it
        // cites the reading it is arguing from (§5.4).
        const val = scores.families.find((f) => f.code === 'valuation');
        const fwd = val && val.inputs ? val.inputs.forward_pe : null;
        const str = scores.families.find((f) => f.code === 'stretch');
        const coh = assessCoherence(scores.families, {
            side,
            context: {
                valuationDetail: fwd
                    ? `at ${Math.round(fwd)}× forward earnings`
                    + (val.inputs.sector_median ? ` against a sector median near ${Math.round(val.inputs.sector_median)}×` : '')
                    : null,
                stretchDetail: str && str.inputs && str.inputs.z_to_vwap != null && str.inputs.z_to_vwap < 0
                    ? 'after the move left price below VWAP' : null,
            },
        });
        return { ...coh, proposedTriggers: proposeTriggers(coh, { symbol, price, scores }) };
    }, [scores, side, symbol, price]);

    // ── The claim gate (§4.2) ────────────────────────────────────────────────
    const existingClaim = claims.length ? claims[0] : null;
    const hasClaim = claim.claimText.trim().length > 0 || (existingClaim && existingClaim.claim_text);
    const claimState = { softGate: true, hasClaim };

    const gate = useMemo(() => {
        if (!equity || !price) {
            return { canSubmit: false, label: 'SUBMIT · NO PRICE', message: 'No price or equity on file — the ticket cannot size a trade it cannot value.' };
        }
        if (!derived.qty) {
            return { canSubmit: false, label: 'SUBMIT · SIZE IS ZERO', message: 'The current inputs derive a quantity of zero.' };
        }
        if (!hasClaim) {
            return { canSubmit: false, label: 'SUBMIT · CLAIM REQUIRED', message: 'No claim on file. State the thesis to enable.' };
        }
        return { canSubmit: true };
    }, [equity, price, derived.qty, hasClaim]);

    const override = detectOverride({
        modelQty: modelQty != null ? modelQty : derived.qty,
        submittedQty: derived.qty,
        method,
    });

    // ── Actions ──────────────────────────────────────────────────────────────

    const applyAdjusted = useCallback((adj) => {
        if (!adj.qty) return;
        setModelQty(derived.qty);
        setMethod('manual');
        setInput({ qty: adj.qty });
        setOverrideReason((prev) => prev || `Applied the coherence-adjusted size (×${fNum(adj.multiplier, 2)} on alignment).`);
    }, [derived.qty]);

    const armTriggers = useCallback(async () => {
        setArming(true);
        try {
            const decisionId = await data.recordDeferredDecision({
                symbol,
                decision_type: 'deferred',
                intent: side === 'sell' ? 'trim' : 'add',
                rationale: coherence.tension,
                signal_snapshot: coherence.familyVector,
                sizing_method: method,
                pct_of_equity: derived.pctOfEquity,
                pct_of_gross: derived.pctOfGross,
                model_qty: derived.qty,
                submitted_qty: 0,
                is_override: false,
                coherence_net: round(coherence.net),
                coherence_alignment: round(coherence.alignment),
                coherence_dispersion: round(coherence.dispersion),
                size_multiplier: round(coherence.sizeMultiplier),
                multiplier_applied: false,
                book_impact: impact ? summariseImpact(impact) : null,
                universe_context: universeContext || null,
            });
            await data.armTriggers({
                symbol,
                triggers: coherence.proposedTriggers,
                decisionId,
                intentPayload: {
                    side, method, input, pct_of_equity: derived.pctOfEquity,
                    qty: derived.qty, price,
                    coherence: { net: coherence.net, alignment: coherence.alignment, posture: coherence.posture },
                },
            });
            const t = await data.loadTriggers({ symbol, status: null });
            setTriggers(t);
            setSubmitResult({ ok: true, message: `${coherence.proposedTriggers.length} trigger(s) armed and logged as a deferred decision.` });
        } catch (err) {
            setSubmitResult({ ok: false, message: 'Could not arm triggers: ' + (err.message || err) });
        } finally {
            setArming(false);
        }
    }, [symbol, side, method, input, derived, coherence, impact, universeContext, price]);

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
        setSubmitResult(null);
        try {
            let claimId = existingClaim ? existingClaim.id : null;
            if (claim.claimText.trim()) {
                claimId = await data.upsertClaim({
                    symbol,
                    claimText: claim.claimText.trim(),
                    falsifierText: claim.falsifierText.trim() || null,
                    reviewBy: claim.reviewBy || null,
                    existingId: existingClaim ? existingClaim.id : null,
                });
            }

            const body = {
                symbol, side,
                qty: derived.qty,
                type: orderType === 'staged' ? 'market' : orderType,
                tif: 'day',
                limitPrice: orderType === 'limit' ? limitPrice : undefined,
                stopPrice: orderType === 'stop' ? limitPrice : undefined,
                ledger: {
                    intent: side === 'sell' ? 'trim' : 'add',
                    rationale: claim.claimText.trim() || (existingClaim ? existingClaim.claim_text : null),
                    snapshot: coherence.insufficient ? null : coherence.familyVector,
                    conviction: coherence.insufficient ? null : Math.round(Math.abs(coherence.net) * 100),
                    trade: {
                        sizing_method: method,
                        pct_of_equity: derived.pctOfEquity,
                        pct_of_gross: derived.pctOfGross,
                        risk_budget_bps: method === 'fixed_fractional' ? Number(input) : null,
                        model_qty: modelQty != null ? modelQty : derived.qty,
                        submitted_qty: derived.qty,
                        is_override: override.isOverride,
                        override_reason: override.isOverride ? (overrideReason || null) : null,
                        coherence_net: round(coherence.net),
                        coherence_alignment: round(coherence.alignment),
                        coherence_dispersion: round(coherence.dispersion),
                        size_multiplier: round(coherence.sizeMultiplier),
                        multiplier_applied: modelQty != null,
                        claim_id: claimId,
                        book_impact: impact ? summariseImpact(impact) : null,
                        universe_context: universeContext || null,
                    },
                },
            };

            const r = await fetch('/api/trading?action=order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || j.message || 'HTTP ' + r.status);

            setSubmitResult({
                ok: true,
                message: `Order away: ${side} ${derived.qty} ${symbol}. Intent, coherence vector and book impact stored on the ledger row.`,
            });
        } catch (err) {
            setSubmitResult({ ok: false, message: err.message || String(err) });
        } finally {
            setSubmitting(false);
        }
    }, [gate, existingClaim, claim, symbol, side, derived, orderType, limitPrice, coherence, method, input, modelQty, override, overrideReason, impact, universeContext]);

    // ── Render ───────────────────────────────────────────────────────────────
    if (loading) {
        return e('div', { className: 'tr-wrap' }, e('div', { className: 'tr-sub' }, `Loading ${symbol}…`));
    }

    return e('div', { className: 'tr-wrap' },
        e(QuoteHeader, { symbol, quote, account, price, risk, scores, instrument }),

        e('div', { className: 'tr-tgrid' },
            e(PaneOrder, {
                side, setSide, method, setMethod, input, setInput,
                derived, orderType, setOrderType, limitPrice, setLimitPrice,
                claim, setClaim, claimState, gate, onSubmit: submit, submitting, submitResult,
                price, existingClaim, overrideReason, setOverrideReason,
                isOverride: override.isOverride,
            }),
            e(PaneBook, {
                impact, symbol, riskLayer: risk,
                volDrift: driftSeries ? volDrift(driftSeries) : null,
                corrThreshold: DEFAULT_CORR_THRESHOLD,
            }),
            e(PaneCoherence, {
                symbol, coherence, asOfDate: scores ? scores.asOfDate : null,
                requested: {
                    // What you asked for, not what whole shares rounded it to —
                    // the reconciliation is between the request and the
                    // coherence-adjusted size, so the request is the anchor.
                    pctOfEquity: derived.requestedPctOfEquity != null ? derived.requestedPctOfEquity : derived.pctOfEquity,
                    qty: derived.qty,
                    notional: derived.filledNotional,
                },
                price, triggers,
                onApplyAdjusted: applyAdjusted,
                onArmTriggers: armTriggers,
                arming,
            })),

        e(Fundamentals, { symbol, scores }),

        e('div', { className: 'tr-ann' },
            e('b', null, 'WHAT GETS STORED ON SUBMIT'),
            'The full family vector, all three coherence numbers, the size multiplier and whether it was applied, ',
            'every before-and-after book figure, the claim, and the universe context that surfaced the name. ',
            'Immutable, on the intent row. In six months that table answers whether your high-alignment trades ',
            'actually beat your low-alignment ones, and whether your overrides beat the model.'));
}

const round = (x) => (x == null || !isFinite(x) ? null : Number(x.toFixed(4)));

function summariseImpact(i) {
    return {
        position: i.position,
        effective_exposure: i.effectiveExposure ? {
            threshold: i.effectiveExposure.threshold,
            peers: i.effectiveExposure.peers,
            cluster_weight_before: i.effectiveExposure.clusterWeightBefore,
            cluster_weight_after: i.effectiveExposure.clusterWeightAfter,
        } : null,
        cluster_exposure: i.clusterExposure,
        concentration: {
            top5_before: i.concentration.before.top5Weight,
            top5_after: i.concentration.after.top5Weight,
            hhi_before: i.concentration.before.hhi,
            hhi_after: i.concentration.after.hhi,
            sectors_after: i.concentration.after.sectors,
        },
        risk: i.risk,
        margin: i.margin,
        delta_notional: i.deltaNotional,
        delta_qty: i.deltaQty,
    };
}

/**
 * Propose the triggers a non-Act posture owes (§5.7). Each is evaluable by the
 * nightly job, not prose.
 */
function proposeTriggers(coh, { symbol, price, scores }) {
    if (!coh || coh.insufficient || coh.posture === 'act') return [];
    const out = [];
    const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    const trend = coh.families.find((f) => f.code === 'trend');
    if (price && trend) {
        const level = Number((price * 1.03).toFixed(2));
        out.push({
            type: 'price',
            condition: {
                metric: 'close', op: '>=', threshold: level,
                confirm: { metric: 'volume_vs_adv', op: '>=', threshold: 1.2 },
            },
            description: `Close above $${level} on volume ≥1.2× ADV`,
            detail: 'Trend confirmation',
            expiresAt: in14,
        });
    }

    const event = (coh.suppressors || [])[0];
    if (event && event.inputs && event.inputs.days_to_earnings != null) {
        const d = new Date(Date.now() + event.inputs.days_to_earnings * 86400000).toISOString().slice(0, 10);
        out.push({
            type: 'event',
            condition: { metric: 'date', on: d },
            description: `Next print, ${d}`,
            detail: 'Confidence suppression lifts either way',
            expiresAt: null,
        });
    }

    const val = coh.families.find((f) => f.code === 'valuation');
    if (val && val.score < -0.3 && val.inputs && val.inputs.forward_pe) {
        const target = Math.round(val.inputs.forward_pe * 0.75);
        out.push({
            type: 'valuation',
            condition: { metric: 'forward_pe', op: '<=', threshold: target },
            description: `Forward P/E below ${target}× on revision`,
            detail: 'Valuation family re-scores',
            expiresAt: null,
        });
    }

    return out;
}

// ── Quote header ─────────────────────────────────────────────────────────────

function QuoteHeader({ symbol, quote, account, price, risk, scores, instrument }) {
    const stat = risk && risk.available ? { adv: risk.advs ? risk.advs[symbol] : null } : {};
    const ev = scores && scores.available ? scores.families.find((f) => f.isSuppressor) : null;
    const dte = ev && ev.inputs ? ev.inputs.days_to_earnings : null;
    return e('div', { className: 'tr-quote' },
        e('div', null,
            e('div', { className: 'tr-lbl', style: { margin: '0 0 2px' } },
                symbol + (instrument && instrument.name ? ' · ' + instrument.name.toUpperCase() : '')),
            e(InstrumentStrip, { instrument }),
            e('div', { className: 'tr-px' }, price == null ? DASH : fMoney(price))),
        quote && quote.change != null
            ? e('div', { className: 'tr-mono ' + toneOf(quote.change), style: { fontSize: 'var(--tr-fs-5)' } },
                (quote.change >= 0 ? '▲ +' : '▼ −') + Math.abs(quote.change).toFixed(2)
                + ' (' + (quote.changePct >= 0 ? '+' : '−') + Math.abs(quote.changePct).toFixed(2) + '%)')
            : null,
        e('div', { className: 'tr-mono tr-dim', style: { fontSize: 'var(--tr-fs-2)' } },
            [
                quote && quote.vwap ? 'VWAP ' + fMoney(quote.vwap) : null,
                stat.adv ? 'ADV ' + (stat.adv >= 1e9 ? '$' + (stat.adv / 1e9).toFixed(1) + 'b' : '$' + (stat.adv / 1e6).toFixed(0) + 'm') : null,
                dte != null ? 'EARNINGS IN ' + Math.round(dte) + 'D' : null,
            ].filter(Boolean).join('  ·  ')),
        account
            ? e('div', { style: { marginLeft: 'auto' }, className: 'tr-mono tr-dim' },
                'EQUITY ', e('span', { style: { color: 'var(--tr-tx)' } }, fMoney(account.equity, 0)), '   ',
                'CASH ', e('span', { className: toneOf(account.cash) }, fMoney(account.cash, 0)), '   ',
                'GROSS ', e('span', { className: 'tr-am' },
                    account.equity ? fNum(account.long_market_value / account.equity, 2) + '×' : DASH))
            : null);
}

/**
 * The identity and period-performance strip: sector, geography, and
 * day / WTD / MTD / YTD. Sits between the name and the price, so you read what
 * the instrument IS and how it has been travelling before you read what it
 * costs. A period with no history behind it prints an em dash — the strip never
 * shows 0.00% for a return it cannot measure.
 */
function InstrumentStrip({ instrument }) {
    if (!instrument) return null;
    const p = instrument.performance || {};
    const meta = [instrument.sector, instrument.geography, instrument.exchange].filter(Boolean);

    return e('div', { className: 'tr-istrip' },
        meta.length
            ? e('div', { className: 'tr-imeta' },
                meta.map((m, i) => e('span', { key: i }, m)))
            : null,
        e('div', { className: 'tr-iperf' },
            PERIODS.map(({ key, label }) => {
                const v = p[key];
                return e('span', { key, className: 'tr-ip', title: periodTitle(key, p) },
                    e('span', { className: 'tr-ipl' }, label),
                    e('span', { className: 'tr-ipv ' + toneOf(v) },
                        v == null ? DASH : fPct(v, 2, { signed: true })));
            })));
}

function periodTitle(key, p) {
    if (p[key] == null) return 'Not measurable — no close on file before this period opened';
    const from = { day: 'the previous close', wtd: 'the close before this week opened', mtd: 'the last close of the previous month', ytd: 'the last close of the previous year' }[key];
    return `Measured from ${from}${p.asOf ? ', as at ' + p.asOf : ''}`;
}

// ── Fundamentals, collapsed beneath coherence (§4.3, §8) ─────────────────────

function Fundamentals({ symbol, scores }) {
    const [open, setOpen] = useState(false);
    const val = scores && scores.available ? scores.families.find((f) => f.code === 'valuation') : null;

    return e('div', { style: { marginTop: 14 } },
        e('button', {
            className: 'tr-chip', type: 'button', onClick: () => setOpen((x) => !x),
        }, (open ? '▾ ' : '▸ ') + 'FUNDAMENTALS'),
        open
            ? e('div', { className: 'tr-card', style: { marginTop: 8 } },
                e('div', { className: 'tr-cb' },
                    e('div', { className: 'tr-note', style: { marginTop: 0, marginBottom: 8 } },
                        'Promoted to the coherence layer as scored inputs rather than displayed facts. ',
                        'A 274× forward P/E is not a number to note, it is a valuation score arguing with your trend score.'),
                    val
                        ? e('table', { className: 'tr-ftable' },
                            e('tbody', null,
                                Object.entries(val.inputs || {})
                                    .filter(([k, v]) => k !== 'sub_scores' && v != null && typeof v !== 'object')
                                    .map(([k, v]) =>
                                        e('tr', { key: k },
                                            e('td', null, k.replace(/_/g, ' ')),
                                            e('td', null, typeof v === 'number' ? fNum(v, 2) : String(v))))))
                        : e('div', { className: 'tr-dim3', style: { fontSize: 'var(--tr-fs-4)' } },
                            'No valuation inputs on file for ' + symbol + '.')))
            : null);
}
