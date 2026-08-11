// ATLAS Trade — Pane B, book impact before and after. Spec §4.1.
//
// "This is the pane that answers 'I did not even know how much exposure I
// already have'. Every row shows current, delta, resulting."
//
// Two ideas do the heavy lifting here and both are easy to get subtly wrong:
//
//   Effective exposure. Buying NVDA when you already hold AVGO, MU and SMH is
//   not a 2% position. The pairwise ρ>0.75 rule is a V1 scaffold; cluster
//   membership is the destination; BOTH are reported so you can see the two
//   methods disagree (§4.1, §10 decision 2).
//
//   Three separate vol quantities. Current, incremental and resulting are not
//   one number. The strategic band is deliberately absent at V1 (§4.1) —
//   hardcoding a target now "would silently import an assumption the book has
//   never agreed to". What ships instead is the drift indicator from §10
//   residual question 1: vol at 90/60/30 days ago against today, so the book
//   drifting upward one sensible-looking increment at a time becomes visible
//   before it needs to be a decision.

import {
    isNum, num, clamp, hhi, covarianceMatrix, portfolioVol,
    marginalContributions, parametricVaR,
} from './stats.js';

export const DEFAULT_CORR_THRESHOLD = 0.75;   // §10 decision 2, configurable
export const DEFAULT_CORR_WINDOW = 120;

/**
 * Build the position vector for the book plus the candidate, in weights of
 * EQUITY (never gross — §4.1).
 */
function weightVector(positions, equity, candidate) {
    const symbols = [];
    const before = [];
    const after = [];
    let found = false;

    for (const p of positions) {
        const mv = num(p.marketValue);
        if (!isNum(mv) || mv === 0) continue;
        symbols.push(p.symbol);
        const w = mv / equity;
        before.push(w);
        if (candidate && p.symbol === candidate.symbol) {
            found = true;
            after.push((mv + candidate.deltaNotional) / equity);
        } else {
            after.push(w);
        }
    }

    if (candidate && !found && isNum(candidate.deltaNotional) && candidate.deltaNotional !== 0) {
        symbols.push(candidate.symbol);
        before.push(0);
        after.push(candidate.deltaNotional / equity);
    }

    return { symbols, before, after };
}

/**
 * Effective exposure by the pairwise rule: the sum of correlation-weighted
 * weights across names with ρ above the threshold to the candidate over the
 * trailing window. Retains the raw correlations so the threshold can be
 * calibrated against the real book rather than trusted (§4.1).
 */
export function effectiveExposure({ symbol, positions, equity, rho, threshold = DEFAULT_CORR_THRESHOLD, deltaNotional = 0 }) {
    const peers = [];
    let clusterWeightBefore = 0;

    for (const p of positions) {
        const mv = num(p.marketValue);
        if (!isNum(mv) || mv === 0) continue;
        const w = mv / equity;
        if (p.symbol === symbol) { clusterWeightBefore += w; continue; }
        const r = rho(symbol, p.symbol);
        if (isNum(r) && r >= threshold) {
            peers.push({ symbol: p.symbol, rho: r, weight: w, weighted: r * w });
            clusterWeightBefore += w;
        }
    }

    peers.sort((a, b) => b.rho - a.rho);
    const deltaWeight = isNum(deltaNotional) && equity > 0 ? deltaNotional / equity : 0;

    return {
        threshold,
        peers,
        // Plain sum of weights in the correlated group, including the candidate's
        // own existing weight. This is the number the ticket headlines, because
        // "a 2% add to a third of the book that moves together" is the sentence
        // the pane exists to be able to say.
        clusterWeightBefore,
        clusterWeightAfter: clusterWeightBefore + deltaWeight,
        // Correlation-weighted version, which discounts a 0.76 peer relative to
        // a 0.95 one instead of counting both in full.
        correlationWeighted: peers.reduce((a, p) => a + p.weighted, 0),
        peerCount: peers.length,
    };
}

/**
 * Cluster-level exposure — the destination architecture from §4.1. Uses the
 * derived cluster the candidate belongs to rather than pairwise distance from
 * it, so a name at 0.73 that belongs to the group is counted and one at 0.76
 * that does not is excluded.
 */
export function clusterExposure({ symbol, positions, equity, clusters, deltaNotional = 0 }) {
    if (!clusters || !clusters.length) return null;
    const home = clusters.find((c) => c.members.includes(symbol));
    if (!home) return null;

    const members = [];
    let weight = 0;
    for (const p of positions) {
        const mv = num(p.marketValue);
        if (!isNum(mv) || mv === 0) continue;
        if (!home.members.includes(p.symbol)) continue;
        const w = mv / equity;
        weight += w;
        members.push({ symbol: p.symbol, weight: w });
    }
    const deltaWeight = isNum(deltaNotional) && equity > 0 ? deltaNotional / equity : 0;
    return {
        clusterId: home.clusterId,
        size: home.size,
        avgIntraRho: home.avgIntraRho,
        heldMembers: members.sort((a, b) => b.weight - a.weight),
        weightBefore: weight,
        weightAfter: weight + deltaWeight,
    };
}

/** Sector and concentration readings, before and after. */
export function concentration({ positions, equity, candidate, sectorOf }) {
    const rows = positions
        .map((p) => ({ symbol: p.symbol, mv: num(p.marketValue) || 0, sector: sectorOf(p.symbol) }))
        .filter((r) => r.mv !== 0);

    const apply = (useAfter) => {
        const adjusted = rows.map((r) => ({
            ...r,
            mv: useAfter && candidate && r.symbol === candidate.symbol ? r.mv + candidate.deltaNotional : r.mv,
        }));
        if (useAfter && candidate && !rows.some((r) => r.symbol === candidate.symbol) && candidate.deltaNotional) {
            adjusted.push({ symbol: candidate.symbol, mv: candidate.deltaNotional, sector: sectorOf(candidate.symbol) });
        }
        const total = adjusted.reduce((a, r) => a + Math.abs(r.mv), 0);
        const weights = adjusted.map((r) => (equity > 0 ? r.mv / equity : 0));
        const sorted = adjusted.slice().sort((a, b) => Math.abs(b.mv) - Math.abs(a.mv));
        const top5 = sorted.slice(0, 5).reduce((a, r) => a + Math.abs(r.mv), 0);
        const bySector = {};
        for (const r of adjusted) {
            const k = r.sector || 'Unclassified';
            bySector[k] = (bySector[k] || 0) + r.mv;
        }
        return {
            top5Weight: equity > 0 ? top5 / equity : null,
            // HHI on shares of the book, which is the standard reading, rather
            // than on weights of equity — at 1.5× gross those differ materially.
            hhi: total > 0 ? hhi(adjusted.map((r) => Math.abs(r.mv) / total)) : null,
            sectors: Object.fromEntries(Object.entries(bySector).map(([k, v]) => [k, equity > 0 ? v / equity : null])),
            positionCount: adjusted.length,
            weights,
        };
    };

    return { before: apply(false), after: apply(true) };
}

/**
 * Margin and buying power (§4.1): "permanently visible, not buried".
 *
 * Distance to a maintenance call is computed against the broker's OWN
 * maintenance requirement rather than a textbook 25% or 50%, because that
 * number is the one that will actually generate the call.
 */
export function marginPicture({ account, notional }) {
    const equity = num(account?.equity);
    const lmv = num(account?.long_market_value);
    const maint = num(account?.maintenance_margin);
    const bp = num(account?.buyingPower ?? account?.buying_power);

    const maintRate = isNum(maint) && isNum(lmv) && lmv > 0 ? maint / lmv : null;
    // Solve equity − LMV·f = rate · LMV · (1 − f) for f, the uniform fall in
    // the long book that would put the account on the maintenance line.
    let fallToCall = null;
    if (isNum(equity) && isNum(lmv) && lmv > 0 && isNum(maintRate) && maintRate < 1) {
        const f = (equity - maintRate * lmv) / (lmv * (1 - maintRate));
        fallToCall = isFinite(f) ? clamp(f, 0, 1) : null;
    }

    return {
        equity,
        cash: num(account?.cash),
        longMarketValue: lmv,
        grossLeverage: isNum(lmv) && isNum(equity) && equity > 0 ? lmv / equity : null,
        buyingPowerConsumed: isNum(notional) ? Math.abs(notional) : null,
        buyingPowerRemaining: isNum(bp) && isNum(notional) ? bp - Math.abs(notional) : bp,
        maintenanceMargin: maint,
        maintenanceRate: maintRate,
        fallToMaintenanceCall: fallToCall,
    };
}

/**
 * The whole of Pane B for one candidate trade.
 *
 * `rho(a, b)` and `vols` come from the nightly universe_correlations /
 * universe_risk_stats snapshot — §4.1 is explicit that this must not be
 * recomputed per keystroke, so the caller passes cached lookups and this runs
 * pure matrix arithmetic on them.
 */
export function computeBookImpact({
    symbol,
    positions,
    equity,
    account,
    price,
    deltaQty,
    rho,
    vols,
    betas = {},
    clusters = null,
    sectorOf = () => null,
    corrThreshold = DEFAULT_CORR_THRESHOLD,
    volHistory = null,
    existing = null,
}) {
    const deltaNotional = isNum(deltaQty) && isNum(price) ? deltaQty * price : 0;
    const candidate = { symbol, deltaNotional };

    const { symbols, before, after } = weightVector(positions, equity, candidate);
    const { matrix, missingPairs, totalPairs } = covarianceMatrix(symbols, vols, rho, { fallbackRho: 0 });

    const volBefore = portfolioVol(before, matrix);
    const volAfter = portfolioVol(after, matrix);
    const incrementalVol = volAfter - volBefore;

    const idx = symbols.indexOf(symbol);
    const mctrAfter = marginalContributions(after, matrix);
    const mctrPosition = idx >= 0 ? mctrAfter[idx] : null;

    const varBefore = parametricVaR(volBefore, equity);
    const varAfter = parametricVaR(volAfter, equity);

    const betaBefore = before.reduce((a, w, i) => a + w * (num(betas[symbols[i]]) ?? 0), 0);
    const betaAfter = after.reduce((a, w, i) => a + w * (num(betas[symbols[i]]) ?? 0), 0);

    const held = existing || positions.find((p) => p.symbol === symbol) || null;
    const heldQty = num(held?.quantity) || 0;
    const heldMv = num(held?.marketValue) || 0;
    const heldAvgCost = num(held?.averageCost);

    const newQty = heldQty + (isNum(deltaQty) ? deltaQty : 0);
    const newAvgCost = (isNum(heldAvgCost) && heldQty > 0 && isNum(deltaQty) && deltaQty > 0 && isNum(price))
        ? (heldAvgCost * heldQty + price * deltaQty) / newQty
        : heldAvgCost;

    const conc = concentration({ positions, equity, candidate, sectorOf });
    const eff = effectiveExposure({ symbol, positions, equity, rho, threshold: corrThreshold, deltaNotional });
    const clu = clusterExposure({ symbol, positions, equity, clusters, deltaNotional });
    const margin = marginPicture({ account, notional: deltaNotional });
    const gross = margin.longMarketValue;

    return {
        position: {
            sharesBefore: heldQty,
            sharesAfter: newQty,
            avgCostBefore: heldAvgCost,
            avgCostAfter: newAvgCost,
            marketValueBefore: heldMv,
            marketValueAfter: heldMv + deltaNotional,
            unrealised: isNum(heldAvgCost) && heldQty > 0 && isNum(price)
                ? (price - heldAvgCost) * heldQty : null,
            unrealisedPct: isNum(heldAvgCost) && heldAvgCost > 0 && isNum(price)
                ? price / heldAvgCost - 1 : null,
            weightOfEquityBefore: equity > 0 ? heldMv / equity : null,
            weightOfEquityAfter: equity > 0 ? (heldMv + deltaNotional) / equity : null,
            // Display only, both of them (§4.1).
            weightOfGrossBefore: isNum(gross) && gross > 0 ? heldMv / gross : null,
            weightOfGrossAfter: isNum(gross) && gross > 0 ? (heldMv + deltaNotional) / gross : null,
        },
        effectiveExposure: eff,
        clusterExposure: clu,
        concentration: conc,
        risk: {
            currentVol: volBefore,
            incrementalVol,
            resultingVol: volAfter,
            // §4.1: deliberately absent at V1. Rendered as NOT SET, not as zero.
            strategicBand: null,
            drift: volHistory || null,
            mctrPosition,
            mctrPositionPct: volAfter > 0 && isNum(mctrPosition) ? mctrPosition / volAfter : null,
            riskPerThousandBps: isNum(incrementalVol) && deltaNotional !== 0
                ? (incrementalVol / Math.abs(deltaNotional)) * 1000 * 10000 : null,
            varBefore,
            varAfter,
            incrementalVaR: isNum(varAfter) && isNum(varBefore) ? varAfter - varBefore : null,
            betaBefore,
            betaAfter,
            // Honesty about the matrix: how much of it was filled with a
            // fallback because no correlation was on file.
            covarianceCoverage: totalPairs > 0 ? 1 - missingPairs / totalPairs : null,
            missingPairs,
            totalPairs,
        },
        margin,
        deltaNotional,
        deltaQty,
    };
}

/**
 * Portfolio vol as it stood 30 / 60 / 90 days ago against today (§10 residual
 * question 1). Not a limit, not a block — "just a line that makes the trend
 * visible before it needs to be a decision".
 */
export function volDrift(series) {
    if (!series || !series.length) return null;
    const pick = (daysAgo) => {
        const target = Date.now() - daysAgo * 86400000;
        let best = null, bestGap = Infinity;
        for (const p of series) {
            const t = new Date(p.date).getTime();
            const gap = Math.abs(t - target);
            if (gap < bestGap) { bestGap = gap; best = p; }
        }
        // Beyond a week from the anchor the point is not that anchor any more.
        return best && bestGap <= 7 * 86400000 ? best.vol : null;
    };
    return {
        d90: pick(90),
        d60: pick(60),
        d30: pick(30),
        now: series[series.length - 1] ? series[series.length - 1].vol : null,
    };
}
