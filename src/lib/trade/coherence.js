// ATLAS Trade — Layer 3, coherence. Spec §5.
//
// The thing this deliberately is not (§5.1): a single composite score with a
// threshold. "Trade score 78, GO" collapses the exact information the module
// exists to preserve, and it is wrong in a way you cannot interrogate.
//
// What it is instead: three numbers that answer three different questions, a
// posture read off the net × alignment grid, a size multiplier, and a sentence
// that names the trade for what it is.

import { clamp, isNum, num, weightedMean, weightedStdev } from './stats.js';

export const FAMILY_ORDER = ['trend', 'flow', 'macro', 'valuation', 'stretch', 'vol_regime'];

export const FAMILY_LABELS = {
    trend: 'Trend',
    flow: 'Flow',
    macro: 'Macro',
    valuation: 'Valuation',
    stretch: 'Stretch',
    vol_regime: 'Vol regime',
    event: 'Event proximity',
};

/**
 * Posture thresholds. Exported and named rather than buried as literals,
 * because §5.5 defines the postures verbally and someone will eventually want
 * to argue with the numbers. They should be able to find them.
 */
export const POSTURE_THRESHOLDS = {
    // Net pointing against the intended side by more than this is a stand down.
    opposeNet: 0.15,
    // Act needs both agreement and a net worth acting on.
    actAlignment: 0.60,
    actNet: 0.25,
    // Scale in on moderate agreement…
    scaleAlignment: 0.35,
    // …or on a genuinely positive net that the families disagree broadly about.
    // "High dispersion with positive net" in §5.5 has to mean meaningfully
    // positive: read as merely > 0 it would promote a +0.06 net at alignment
    // 0.10 to scale-in, which is the case the worked example calls WAIT.
    dispersionScaleNet: 0.25,
    highDispersion: 0.50,
};

/**
 * Apply suppressor families to the directional ones.
 *
 * §5.2: "Event proximity is mostly a confidence suppressor rather than a
 * directional score. Three days before earnings, every other family's
 * confidence should drop, because you are about to trade into a variance
 * event, and that is a statement about knowability, not direction."
 *
 * Suppression is multiplicative and compounds across suppressors. It touches
 * confidence only — never conviction, never score. A suppressed family has not
 * changed its mind, it has become less worth listening to.
 */
export function applySuppression(families) {
    const suppressors = families.filter((f) => f.isSuppressor && isNum(f.suppression) && f.suppression > 0);
    const factor = suppressors.reduce((a, f) => a * (1 - f.suppression), 1);
    const directional = families
        .filter((f) => !f.isSuppressor)
        .map((f) => ({
            ...f,
            confidenceRaw: f.confidence,
            confidence: clamp(f.confidence * factor, 0, 1),
        }));
    return {
        directional,
        suppressors,
        suppressionFactor: factor,
        suppressionPct: 1 - factor,
    };
}

/**
 * The three numbers (§5.3).
 *
 *   w          = conviction × confidence
 *   net        = Σ(w·s) / Σw
 *   alignment  = |Σ(w·s)| / Σ(w·|s|)
 *   dispersion = weighted stdev of s, weighted by w
 *
 * No static family priors (§10 decision 4). Every family enters at its own
 * conviction and confidence; nothing is pre-privileged. Fitted weights come
 * later, from the outcome dataset, once there is enough of it to fit anything
 * honestly.
 */
export function computeCoherence(rawFamilies, { side = 'buy' } = {}) {
    const families = (rawFamilies || []).filter((f) => f && f.code);
    const { directional, suppressors, suppressionFactor, suppressionPct } = applySuppression(families);

    const scored = directional
        .filter((f) => isNum(f.score) && isNum(f.conviction) && isNum(f.confidence))
        .map((f) => ({ ...f, weight: f.conviction * f.confidence }))
        .filter((f) => f.weight > 0);

    if (!scored.length) {
        return {
            net: null, alignment: null, dispersion: null,
            posture: null, sizeMultiplier: null, dominantFamily: null,
            families: directional, suppressors,
            suppressionFactor, suppressionPct,
            sumWeight: 0, coverage: 0,
            insufficient: true,
        };
    }

    const s = scored.map((f) => f.score);
    const w = scored.map((f) => f.weight);
    const sumW = w.reduce((a, b) => a + b, 0);
    const sumWS = scored.reduce((a, f) => a + f.weight * f.score, 0);
    const sumWAbsS = scored.reduce((a, f) => a + f.weight * Math.abs(f.score), 0);

    const net = sumWS / sumW;
    const alignment = sumWAbsS > 0 ? Math.abs(sumWS) / sumWAbsS : 0;
    const dispersion = weightedStdev(s, w);

    // The heaviest voice in the room: largest |w·s|, not largest score. A loud
    // family with no conviction behind it is not dominant.
    const dominant = scored.reduce(
        (best, f) => (best == null || Math.abs(f.weight * f.score) > Math.abs(best.weight * best.score) ? f : best),
        null,
    );

    const posture = derivePosture({ net, alignment, dispersion, side });
    const sizeMultiplier = sizeMultiplierFor(alignment);

    return {
        net,
        alignment,
        dispersion,
        posture,
        postureLabel: POSTURE_LABELS[posture],
        sizeMultiplier,
        dominantFamily: dominant ? dominant.code : null,
        families: scored,
        suppressors,
        suppressionFactor,
        suppressionPct,
        sumWeight: sumW,
        coverage: scored.length / FAMILY_ORDER.length,
        insufficient: false,
        side,
    };
}

export const POSTURE_LABELS = {
    act: 'ACT',
    scale_in: 'SCALE IN',
    wait_for_trigger: 'WAIT FOR TRIGGER',
    stand_down: 'STAND DOWN',
};

/**
 * Posture from the net × alignment grid (§5.5), never from a threshold on a
 * single value. Even stand down is advisory: the submit control never disables
 * on coherence, only eligibility gates disable it.
 */
export function derivePosture({ net, alignment, dispersion, side = 'buy' }) {
    if (!isNum(net) || !isNum(alignment)) return null;
    const T = POSTURE_THRESHOLDS;
    const dir = side === 'sell' ? -1 : 1;
    const signed = net * dir;             // net expressed relative to intent

    if (signed <= -T.opposeNet) return 'stand_down';
    if (alignment >= T.actAlignment && signed >= T.actNet) return 'act';
    if (alignment >= T.scaleAlignment && signed > 0) return 'scale_in';
    if (isNum(dispersion) && dispersion >= T.highDispersion && signed >= T.dispersionScaleNet) return 'scale_in';
    return 'wait_for_trigger';
}

/**
 * §5.6, the size link:  clamp(0.25 + 0.75 × alignment, 0.25, 1.0)
 *
 * Disagreement shrinks the position. It never refuses it. A conflicted signal
 * set at 40% of model size is a real trade, taken deliberately, at a size that
 * reflects what you actually know.
 */
export function sizeMultiplierFor(alignment) {
    if (!isNum(alignment)) return null;
    return clamp(0.25 + 0.75 * alignment, 0.25, 1.0);
}

/** Any posture other than Act must emit at least one monitorable trigger (§5.7). */
export function requiresTrigger(posture) {
    return posture != null && posture !== 'act';
}

// ── The tension statement (§5.4) ─────────────────────────────────────────────

function pctText(x, digits = 0) { return `${(x * 100).toFixed(digits)}%`; }

function joinNames(names) {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Generate the tension statement in plain words, from whichever families sit
 * furthest apart.
 *
 * §5.4: "That sentence is the deliverable. It names the trade for what it is.
 * It does not stop you." It is prose in DM Sans, not a stat block, because it
 * is an argument and it should read like one (§8).
 */
export function tensionStatement(coh, ctx = {}) {
    if (!coh || coh.insufficient) {
        return 'Not enough of the family vector is present today to say anything honest about coherence. '
             + 'That is a statement about the data, not about the trade.';
    }

    const fams = coh.families.slice().sort((a, b) => Math.abs(b.weight * b.score) - Math.abs(a.weight * a.score));
    const longs = fams.filter((f) => f.score > 0.05);
    const shorts = fams.filter((f) => f.score < -0.05);
    const label = (f) => (FAMILY_LABELS[f.code] || f.code).toLowerCase();
    const parts = [];

    if (longs.length) {
        // Name the two that carry the argument, not everything with a positive
        // sign. A tension statement that lists six families is a stat block in
        // sentence form, which is the thing §8 says this must not be.
        const lead = longs.slice(0, 2);
        const names = joinNames(lead.map(label));
        parts.push(
            lead.length > 1
                ? `${cap(names)} point long, and ${label(longs[0])} carries the strongest evidence of the two.`
                : `${cap(names)} points long.`,
        );
    }

    if (shorts.length) {
        const heaviest = fams[0];
        const heaviestIsShort = heaviest.score < 0;
        const shortNames = joinNames(shorts.slice(0, 3).map(label));
        if (heaviestIsShort) {
            const detail = ctx.valuationDetail && heaviest.code === 'valuation' ? `, ${ctx.valuationDetail}` : '';
            parts.push(`${cap(label(heaviest))} is the heaviest single voice in the room and it points the other way${detail}.`);
            const others = shorts.filter((f) => f.code !== heaviest.code);
            if (others.length) {
                const detail = ctx.stretchDetail && others.some((f) => f.code === 'stretch')
                    ? ` ${ctx.stretchDetail}` : '';
                parts.push(`${cap(joinNames(others.slice(0, 2).map(label)))} ${others.length > 1 ? 'agree' : 'agrees'} with ${label(heaviest)}${detail}.`);
            }
        } else {
            parts.push(`${cap(shortNames)} ${shorts.length > 1 ? 'point' : 'points'} the other way.`);
        }
    }

    if (coh.suppressionPct > 0.001 && coh.suppressors.length) {
        const why = coh.suppressors[0].reason || 'an event in the window';
        parts.push(`${cap(why)} has cut every family's confidence by ${pctText(coh.suppressionPct, 0)}.`);
    }

    // Name the trade. This is the sentence that does the work.
    const trendish = fams.find((f) => (f.code === 'trend' || f.code === 'flow') && f.score > 0.05);
    const fundamental = fams.find((f) => f.code === 'valuation' && f.score < -0.05);
    if (trendish && fundamental) {
        parts.push('This is a momentum trade taken against fundamentals.');
    } else if (!longs.length && shorts.length) {
        parts.push('Nothing in the vector supports the long side today.');
    } else if (coh.alignment >= POSTURE_THRESHOLDS.actAlignment) {
        parts.push('The families are saying the same thing, which is the rarer and more actionable case.');
    }

    parts.push(closingLine(coh.posture));
    return parts.join(' ');
}

function closingLine(posture) {
    switch (posture) {
        case 'act':              return 'Nothing here argues for holding back.';
        case 'scale_in':         return 'Nothing here says no. It says smaller.';
        case 'wait_for_trigger': return 'Nothing here says no. It says smaller, or later.';
        case 'stand_down':       return 'This one argues against the side you have chosen. It still does not block you.';
        default:                 return '';
    }
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/**
 * Reconcile the requested size against the coherence-adjusted one (§5.6).
 * Advisory: this returns what the model would do, never what it will do.
 */
export function reconcileSize({ requestedPct, requestedQty, requestedNotional, sizeMultiplier, price }) {
    const m = isNum(sizeMultiplier) ? sizeMultiplier : 1;
    const pct = isNum(requestedPct) ? requestedPct * m : null;
    const notional = isNum(requestedNotional) ? requestedNotional * m : null;
    const qty = isNum(price) && isNum(notional) && price > 0
        ? Math.floor(notional / price)
        : (isNum(requestedQty) ? Math.floor(requestedQty * m) : null);
    return {
        multiplier: m,
        pctOfEquity: pct,
        notional: isNum(qty) && isNum(price) ? qty * price : notional,
        qty,
        shrinkPct: 1 - m,
    };
}

/**
 * The whole of Layer 3 for one candidate, in the shape the ticket renders and
 * the shape opportunity_assessments stores.
 */
export function assessCoherence(rawFamilies, { side = 'buy', context = {} } = {}) {
    const coh = computeCoherence(rawFamilies, { side });
    return {
        ...coh,
        tension: tensionStatement(coh, context),
        requiresTrigger: requiresTrigger(coh.posture),
        familyVector: Object.fromEntries(
            (coh.families || []).map((f) => [f.code, {
                score: f.score,
                conviction: f.conviction,
                confidence: f.confidence,
                confidence_raw: f.confidenceRaw != null ? f.confidenceRaw : f.confidence,
                weight: f.weight,
                inputs: f.inputs || {},
            }]).concat(
                (coh.suppressors || []).map((f) => [f.code, {
                    score: null,
                    conviction: null,
                    confidence: f.confidence,
                    suppression: f.suppression,
                    reason: f.reason || null,
                    inputs: f.inputs || {},
                }]),
            ),
        ),
    };
}
