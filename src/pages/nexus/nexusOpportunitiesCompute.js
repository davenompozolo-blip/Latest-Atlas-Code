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

// ============================================================
// v2 — the marginal-dollar ledger. A candidate is scored on its OWN
// merit AND on fit with what's already held, so a cheap-but-redundant
// name demotes below a moderately-cheap diversifier. The endpoint
// assembles candidates (valuation + scrapbook + cortex) with the book
// context (held set, correlation to book, marginal VaR); these pure
// functions score and rank them. See api/nexus-opportunities.js.
// ============================================================

// How good the name looks in isolation: winsorised upside, trust-gated,
// nudged by conviction. Only upside is merit; downside names aren't longs.
export function isolatedMerit(c) {
    const raw = Number(c.fvGapPct) || 0;
    if (raw <= 0) return 0;
    // Trusted upside winsorises at 60%; untrusted (bare DCF / extreme) caps far
    // lower AND is dampened — a +150% model artifact can't masquerade as a
    // +150% edge, so it sinks to the "verify" tail rather than topping the ledger.
    const cap = c.fvTrustworthy ? 60 : 25;
    const gap = Math.min(cap, raw);
    const trust = c.fvTrustworthy ? 1 : 0.6;
    const conv = c.conviction != null ? (0.6 + (Number(c.conviction) || 0) / 250) : 0.8;
    return +(gap * trust * conv).toFixed(2);
}

// additive (diversifies) | redundant (piles into a held cluster) | neutral,
// from correlation to the book and the name's excess (vs-sector) VaR.
export function portfolioFit(c) {
    const corr = c.maxCorrToBook == null ? null : Number(c.maxCorrToBook);
    const excess = c.excessVar == null ? null : Number(c.excessVar);
    const redundant = (corr != null && corr >= 0.6) || (excess != null && excess > 0.5);
    const additive = (corr == null || corr < 0.4) && (excess == null || excess <= 0);
    return redundant ? 'redundant' : additive ? 'additive' : 'neutral';
}

const FIT_MULT = { additive: 1.3, neutral: 1.0, redundant: 0.5 };

// Fit-adjusted score — what actually orders the ledger.
export function scoreOpportunity(c) {
    const fit = c.fit || portfolioFit(c);
    return +(isolatedMerit(c) * (FIT_MULT[fit] || 1)).toFixed(2);
}

// The cleanest place to source the dollars: the richest, lowest-conviction
// held name (the rich, low-conviction tail). Ticker or null.
export function fundability(held) {
    const rich = (held || []).filter(h => Number(h.fvGapPct) < -5);
    if (!rich.length) return null;
    return rich
        .map(h => ({ tk: h.tk, s: (-Number(h.fvGapPct)) * (1 - (Number(h.conviction) || 0) / 200) }))
        .sort((a, b) => b.s - a.s)[0].tk;
}

// Score + rank the candidate set, attaching fit and a funding source.
export function rankLedger(candidates, held) {
    return (candidates || []).map(c => {
        const fit = portfolioFit(c);
        return {
            ...c,
            fit,
            isolatedMerit: isolatedMerit(c),
            score: scoreOpportunity({ ...c, fit }),
            fundFrom: fit === 'redundant' ? null : fundability(held),
        };
    }).sort((a, b) => b.score - a.score);
}

// Coarse stance from the scrapbook's LLM prose (sector_verdict / relative_value).
export function extractStance(text) {
    const s = String(text || '').toLowerCase();
    if (/overweight|constructive|asymmetric upside|compelling|attractive entry|\bcheap\b/.test(s)) return 'cheap';
    if (/underweight|\brich\b|stretched|\blate\b|overvalued|unattractive|expensive|full(?:y)? valued/.test(s)) return 'rich';
    return 'neutral';
}

// Sector playbook stance pitted against your actual weight → a tilt decision.
export function sectorTilts(sectorNotes, sectorWeights, avgWeight = 8) {
    const wOf = sec => Number((sectorWeights || {})[sec] != null ? sectorWeights[sec] : (sectorWeights || {})[String(sec || '').toLowerCase()] || 0);
    return (sectorNotes || []).map(n => {
        const stance = extractStance(String(n.sector_verdict || '') + ' ' + String(n.relative_value || ''));
        const w = wOf(n.sector);
        let tilt = 'hold';
        if (stance === 'cheap' && w < avgWeight) tilt = 'up';
        else if (stance === 'rich' && w > avgWeight) tilt = 'down';
        return { sector: n.sector, yourWeightPct: +w.toFixed(1), stance, tilt, verdict: n.sector_verdict, tickers: n.company_tickers || [] };
    });
}
