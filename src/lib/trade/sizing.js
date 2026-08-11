// ATLAS Trade — Layer 2, the sizing engine. Spec §4.1.
//
// Principle 1 (§2): "Size is an output, not an input. You never type a quantity
// first. You express a risk budget and the system derives quantity. Override is
// always available and always logged as an override."
//
// The single most important interaction detail in the pane (§4.1): whichever
// method is active, ALL FIVE derived values render simultaneously. "The method
// chosen changes which field you type in, not what you get to see." That is why
// every method here returns the same complete shape — the UI never has to ask
// which numbers are available for the current method, because the answer is
// always all of them.
//
// DENOMINATOR RULE, without exception (§4.1): equity. Every percent in the
// sizing pane, the book impact pane and the stored intent is a percent of
// equity. Gross appears exactly twice, as a read-only second reading, and
// nothing is ever computed from it.

import { isNum, num, solveMonotone } from './stats.js';

export const SIZING_METHODS = [
    { code: 'percent_of_portfolio', label: 'Percent of portfolio', input: 'pctOfEquity',   isDefault: true },
    { code: 'incremental_risk',     label: 'Incremental risk',     input: 'targetVolBps' },
    { code: 'fixed_fractional',     label: 'Fixed fractional',     input: 'riskBudgetBps' },
    { code: 'equal_risk',           label: 'Equal risk contribution', input: 'matchSleeve' },
    { code: 'manual',               label: 'Manual',               input: 'qty', isOverride: true },
];

export const DEFAULT_STEP_PCT = 0.0025;   // 0.25% steps (§4.1)
export const DEFAULT_ATR_MULT = 2;        // stop defaults to an ATR multiple (§4.1)

/**
 * Fractional shares are not assumed. Alpaca supports notional orders, but the
 * ticket quotes a whole-share quantity because that is what the book will show
 * afterwards, and a size you cannot actually be filled at is a lie in a pane
 * whose entire job is to stop you lying to yourself about size.
 */
function sharesFor(notional, price, { allowFractional = false } = {}) {
    if (!isNum(notional) || !isNum(price) || price <= 0) return null;
    const raw = notional / price;
    return allowFractional ? raw : Math.floor(Math.abs(raw)) * Math.sign(raw || 1);
}

/**
 * Derive every quantity the pane shows, from a share count.
 *
 * Returns the full five-value set regardless of which method produced qty:
 *   notional, shares, filled notional, incremental vol, stop-implied risk
 * plus the two percent readings (equity, and gross for context only).
 */
export function deriveAll(qty, ctx) {
    const {
        price, equity, longMarketValue,
        atr, atrMult = DEFAULT_ATR_MULT,
        incrementalVolFn,
    } = ctx;

    const shares = isNum(qty) ? qty : null;
    const filledNotional = isNum(shares) && isNum(price) ? shares * price : null;

    const pctOfEquity = isNum(filledNotional) && isNum(equity) && equity > 0
        ? filledNotional / equity : null;
    // Display only. Nothing downstream reruns on this figure (§4.1).
    const pctOfGross = isNum(filledNotional) && isNum(longMarketValue) && longMarketValue > 0
        ? filledNotional / longMarketValue : null;

    const incrementalVol = typeof incrementalVolFn === 'function' && isNum(shares)
        ? incrementalVolFn(shares) : null;

    // Stop-implied risk: what a stop at atrMult × ATR would cost if it filled.
    const stopRisk = isNum(shares) && isNum(atr) ? Math.abs(shares) * atr * atrMult : null;
    const stopRiskBps = isNum(stopRisk) && isNum(equity) && equity > 0
        ? (stopRisk / equity) * 10000 : null;

    // §4.1: "Risk per rand deployed: incremental portfolio vol divided by
    // notional. The single most useful number on the screen and the one nothing
    // in ATLAS currently produces."
    const riskPerThousandBps = isNum(incrementalVol) && isNum(filledNotional) && filledNotional !== 0
        ? (incrementalVol / Math.abs(filledNotional)) * 1000 * 10000 : null;

    return {
        qty: shares,
        notional: filledNotional,
        filledNotional,
        pctOfEquity,
        pctOfGross,
        incrementalVol,
        stopRisk,
        stopRiskBps,
        stopMult: atrMult,
        riskPerThousandBps,
    };
}

/**
 * Percent of portfolio — the default (§4.1), "because it is how you actually
 * think about the book, and because it works identically for adds, trims and
 * initiations".
 *
 *   Δnotional    = pct_of_equity × equity
 *   qty          = Δnotional / price
 *   pct_of_gross = Δnotional / long_market_value      display only
 */
export function sizeByPercent(pctOfEquity, ctx) {
    const { price, equity } = ctx;
    const targetNotional = isNum(pctOfEquity) && isNum(equity) ? pctOfEquity * equity : null;
    const qty = sharesFor(targetNotional, price, ctx);
    return {
        method: 'percent_of_portfolio',
        requestedPctOfEquity: pctOfEquity,
        targetNotional,
        ...deriveAll(qty, ctx),
    };
}

/**
 * Incremental risk — express the trade as the additional portfolio volatility
 * you are willing to take on, in basis points (§4.1).
 *
 * The closed form in the spec is the first-order approximation:
 *   qty ≈ (target_Δσ_p × equity) / (β_asset,portfolio × σ_asset_daily × √h × price)
 * but §4.1 then says to "solve numerically against the covariance matrix rather
 * than analytically, since the marginal relationship is not linear once the
 * position is a meaningful weight". So the closed form is used only as a
 * starting bracket, and the answer comes from the real Σ.
 */
export function sizeByIncrementalRisk(targetVolBps, ctx) {
    const { price, equity, incrementalVolFn, maxPctOfEquity = 0.25 } = ctx;
    const target = isNum(targetVolBps) ? targetVolBps / 10000 : null;

    if (!isNum(target) || typeof incrementalVolFn !== 'function' || !isNum(price) || price <= 0) {
        return { method: 'incremental_risk', requestedVolBps: targetVolBps, targetNotional: null, ...deriveAll(null, ctx) };
    }

    const maxQty = Math.max(1, Math.floor((maxPctOfEquity * equity) / price));
    // Continuous solve, then floor to whole shares. Bisection needs a monotone
    // function: incremental vol is monotone in qty for a long add, which is the
    // case this method exists for.
    const solved = solveMonotone((q) => incrementalVolFn(q), target, 0, maxQty);
    const qty = isNum(solved) ? Math.max(0, Math.floor(solved)) : null;

    return {
        method: 'incremental_risk',
        requestedVolBps: targetVolBps,
        targetNotional: isNum(qty) ? qty * price : null,
        solvedQtyContinuous: solved,
        ...deriveAll(qty, ctx),
    };
}

/**
 * Fixed fractional — risk a set bps of equity to a defined stop, stop defaults
 * to an ATR multiple (§4.1).
 *
 *   risk_currency = bps/10000 × equity
 *   qty           = risk_currency / (atrMult × ATR)
 */
export function sizeByFixedFractional(riskBudgetBps, ctx) {
    const { equity, atr, atrMult = DEFAULT_ATR_MULT, price } = ctx;
    const riskCurrency = isNum(riskBudgetBps) && isNum(equity) ? (riskBudgetBps / 10000) * equity : null;
    const perShareRisk = isNum(atr) ? atr * atrMult : null;
    const qty = isNum(riskCurrency) && isNum(perShareRisk) && perShareRisk > 0
        ? Math.floor(riskCurrency / perShareRisk) : null;
    return {
        method: 'fixed_fractional',
        requestedRiskBps: riskBudgetBps,
        riskCurrency,
        perShareRisk,
        targetNotional: isNum(qty) && isNum(price) ? qty * price : null,
        ...deriveAll(qty, ctx),
    };
}

/**
 * Equal risk contribution — size so the new position's marginal risk
 * contribution matches a nominated existing sleeve (§4.1).
 */
export function sizeByEqualRisk(targetMctr, ctx) {
    const { price, equity, mctrFn, maxPctOfEquity = 0.25 } = ctx;
    if (!isNum(targetMctr) || typeof mctrFn !== 'function' || !isNum(price) || price <= 0) {
        return { method: 'equal_risk', requestedMctr: targetMctr, targetNotional: null, ...deriveAll(null, ctx) };
    }
    const maxQty = Math.max(1, Math.floor((maxPctOfEquity * equity) / price));
    const solved = solveMonotone((q) => mctrFn(q), targetMctr, 0, maxQty);
    const qty = isNum(solved) ? Math.max(0, Math.floor(solved)) : null;
    return {
        method: 'equal_risk',
        requestedMctr: targetMctr,
        targetNotional: isNum(qty) ? qty * price : null,
        ...deriveAll(qty, ctx),
    };
}

/** Manual — explicit share or notional entry, flagged and logged as an override (§4.1). */
export function sizeManual({ qty, notional }, ctx) {
    const { price } = ctx;
    const shares = isNum(qty) ? Math.floor(qty) : sharesFor(notional, price, ctx);
    return {
        method: 'manual',
        isOverride: true,
        targetNotional: isNum(notional) ? notional : (isNum(shares) && isNum(price) ? shares * price : null),
        ...deriveAll(shares, ctx),
    };
}

/**
 * One entry point. `input` carries whichever field the active method types in;
 * the returned object always holds the complete set of derived values, so the
 * pane can render all five no matter which method is selected.
 */
export function size(method, input, ctx) {
    switch (method) {
        case 'incremental_risk': return sizeByIncrementalRisk(num(input), ctx);
        case 'fixed_fractional': return sizeByFixedFractional(num(input), ctx);
        case 'equal_risk':       return sizeByEqualRisk(num(input), ctx);
        case 'manual':           return sizeManual(typeof input === 'object' && input ? input : { qty: num(input) }, ctx);
        case 'percent_of_portfolio':
        default:                 return sizeByPercent(num(input), ctx);
    }
}

/**
 * Staged entry (§4.1): split into n clips with defined spacing, "because Layer 3
 * will frequently return 'scale in' rather than 'act now'".
 *
 * Remainder shares go to the first clip rather than being silently dropped, so
 * the clips always sum to the size you agreed to.
 */
export function stageClips(totalQty, n, { price, spacingPct = 0.01, side = 'buy' } = {}) {
    if (!isNum(totalQty) || !isNum(n) || n < 1) return [];
    const base = Math.floor(Math.abs(totalQty) / n);
    const rem = Math.abs(totalQty) - base * n;
    const dir = side === 'sell' ? 1 : -1;   // buys step down into weakness, sells step up
    return Array.from({ length: n }, (_, i) => {
        const qty = base + (i === 0 ? rem : 0);
        const limit = isNum(price) ? price * (1 + dir * spacingPct * i) : null;
        return {
            clip: i + 1,
            qty,
            limitPrice: isNum(limit) ? Math.round(limit * 100) / 100 : null,
            notional: isNum(limit) ? qty * limit : null,
        };
    }).filter((c) => c.qty > 0);
}

/**
 * Did the human depart from the model size? §6 wants this measured, because
 * "whether your manual overrides beat the model size" is "a genuinely
 * uncomfortable and genuinely valuable number".
 */
export function detectOverride({ modelQty, submittedQty, method, tolerance = 0 }) {
    if (method === 'manual') return { isOverride: true, deltaQty: null, deltaPct: null };
    if (!isNum(modelQty) || !isNum(submittedQty)) return { isOverride: false, deltaQty: null, deltaPct: null };
    const delta = submittedQty - modelQty;
    const isOverride = Math.abs(delta) > tolerance;
    return {
        isOverride,
        deltaQty: delta,
        deltaPct: modelQty !== 0 ? delta / Math.abs(modelQty) : null,
    };
}
