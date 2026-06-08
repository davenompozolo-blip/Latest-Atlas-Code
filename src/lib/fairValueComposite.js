// ============================================================
// Fair-Value Composite — deterministic blend with outlier trim
// ------------------------------------------------------------
// Replaces the naive arithmetic mean that the LLM was echoing back
// as `blended_fair_value` (the prompt handed it the average and it
// copied it, which is why avg_fair_value tied to the mean every
// time). The composite number is now computed deterministically in
// code; the LLM is left to write the narrative only.
//
// Governing rule (matches the pipeline brief): when an input can't
// be trusted, drop it. If nothing survives, return null — never
// fabricate a number.
//
// Pure module: no React, no Supabase, no imports.
// ============================================================

export const COMPOSITE_CONFIG = {
    // A method survives only if its implied price sits within [1/R, R]×
    // a TRUSTED current price. R = 2.5 keeps a realistic ±150% valuation
    // gap while dropping the order-of-magnitude blowups (NVDA $3,607,
    // BMY $388) and the all-broken cases (ABEV3.SA 8–27 vs $3.13).
    bandRatio: 2.5,
    // When there is no trusted price to anchor against, fall back to a
    // median ± k·MAD trim and require a real cluster, else null.
    madK: 3,
    minSurvivorsNoAnchor: 3,
};

const isPos = v => typeof v === 'number' && isFinite(v) && v > 0;

function median(xs) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mean(xs) {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * Blend per-method implied prices into a single trustworthy fair value.
 *
 * @param {Array<number|{implied_price:number, method?:string}>} impliedPrices
 * @param {?number} trustedPrice  vetted current price, or null if untrusted
 * @param {typeof COMPOSITE_CONFIG} [config]
 * @returns {null | {
 *   blended_fair_value: number, fair_value_low: number, fair_value_high: number,
 *   used: number[], dropped: number[], anchored: boolean
 * }}  null when nothing survives (the whole name is untrustworthy)
 */
export function computeComposite(impliedPrices, trustedPrice, config = COMPOSITE_CONFIG) {
    const raw = (impliedPrices || [])
        .map(p => (typeof p === 'number' ? p : p && Number(p.implied_price)))
        .filter(isPos);

    if (!raw.length) return null;

    let used, dropped, anchored;

    if (isPos(trustedPrice)) {
        // Price-anchored band gate — the primary, most discriminating filter.
        anchored = true;
        const R = config.bandRatio;
        used = [];
        dropped = [];
        for (const v of raw) {
            const ratio = v / trustedPrice;
            (ratio >= 1 / R && ratio <= R ? used : dropped).push(v);
        }
    } else {
        // No trusted anchor → median ± k·MAD, and demand a real cluster.
        anchored = false;
        const med = median(raw);
        const mad = median(raw.map(v => Math.abs(v - med))) || 0;
        const lo = med - config.madK * mad;
        const hi = med + config.madK * mad;
        used = raw.filter(v => v >= lo && v <= hi);
        dropped = raw.filter(v => !(v >= lo && v <= hi));
        if (used.length < config.minSurvivorsNoAnchor) return null;
    }

    if (!used.length) return null;

    return {
        blended_fair_value: +mean(used).toFixed(2),
        fair_value_low: +Math.min(...used).toFixed(2),
        fair_value_high: +Math.max(...used).toFixed(2),
        used,
        dropped,
        anchored,
    };
}
