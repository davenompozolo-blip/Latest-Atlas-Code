// ============================================================
// Nexus Opportunities — mispricing transforms (pure, IO-free)
// ------------------------------------------------------------
// Where price and fair value diverge most. Opportunities is the
// single-name valuation lens: rank the book by fair-value gap, split
// cheap vs rich, and surface the best long (cheap × convicted, composite
// preferred) and the clearest trim (rich × unconvicted / deteriorating).
// Everything reads the resolved model holdings — fvGapPct is composite-
// first (trusted) with a DCF fallback; valuationTrusted flags which.
// ============================================================

const sgnPct = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');

// Winsorise the gap so a single noisy DCF outlier (e.g. a beaten-down ADR at
// +150%) can't dominate the ranking — matches the map's ±60% clamp.
const clampGap = g => Math.max(-60, Math.min(60, g));

// A long is better the cheaper it is, the higher the conviction, and when
// OUR composite backs the number (not a bare DCF).
function longScore(h) {
    return clampGap(h.fvGapPct) * (0.5 + (Number(h.conviction) || 0) / 200) * (h.valuationTrusted ? 1.15 : 1);
}
// A trim is clearer the richer it is, the lower the conviction, and when the
// Cortex tone is deteriorating.
function trimScore(h) {
    return (-clampGap(h.fvGapPct)) * (1 - (Number(h.conviction) || 0) / 200) * (h.signalTone === 'deteriorating' ? 1.2 : 1);
}

export function buildOpportunities(holdings) {
    const valued = (holdings || []).filter(h => h.fvGapPct != null && isFinite(Number(h.fvGapPct)) && !h.stale);
    const cheap = valued.filter(h => h.fvGapPct > 0).sort((a, b) => b.fvGapPct - a.fvGapPct);
    const rich = valued.filter(h => h.fvGapPct < 0).sort((a, b) => a.fvGapPct - b.fvGapPct);
    const bestLong = cheap.slice().sort((a, b) => longScore(b) - longScore(a))[0] || null;
    const bestTrim = rich.slice().sort((a, b) => trimScore(b) - trimScore(a))[0] || null;
    return {
        valued: valued.length,
        cheapCount: cheap.length,
        richCount: rich.length,
        cheap,
        rich,
        bestLong,
        bestTrim,
    };
}

// The opportunities read — best long + clearest trim, with the why.
export function opportunitiesRead(opp) {
    const src = h => (h.valuationTrusted ? 'composite' : 'model');
    const longTxt = opp.bestLong
        ? opp.bestLong.tk + ' — ' + sgnPct(opp.bestLong.fvGapPct) + ' to fair value (' + src(opp.bestLong) + '), conviction ' + Math.round(Number(opp.bestLong.conviction) || 0)
        : null;
    const trimTxt = opp.bestTrim
        ? opp.bestTrim.tk + ' — ' + sgnPct(opp.bestTrim.fvGapPct) + ' vs fair value' + (opp.bestTrim.signalTone === 'deteriorating' ? ', and deteriorating' : '')
        : null;
    let text;
    if (longTxt && trimTxt) text = 'Best long: ' + longTxt + '. Clearest trim: ' + trimTxt + '.';
    else if (longTxt) text = 'Best long: ' + longTxt + '.';
    else if (trimTxt) text = 'Clearest trim: ' + trimTxt + '.';
    else text = 'No clear valuation edge in the trusted set yet.';
    return { text, longTk: opp.bestLong ? opp.bestLong.tk : null, trimTk: opp.bestTrim ? opp.bestTrim.tk : null };
}
