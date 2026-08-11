// ATLAS Trade — Layer 1, the universe. Spec §3.
//
// The through-line from §0: eligibility is binary and runs first, ranking is
// continuous and runs second. Conflating those two is why screeners built for
// other modules cannot serve this one, so they are separate functions here and
// the ranking function refuses to see an ineligible name at all.
//
// §3.2: "Gate failures are shown, not hidden." Every rejection carries a reason
// code and survives into the snapshot, because a shrinking opportunity set must
// never be silent.

import { clamp, isNum, num, percentileRank } from './stats.js';

export const EXCLUSION = {
    NOT_TRADEABLE:   'NOT BROKER TRADEABLE',
    HALTED:          'HALTED',
    DELISTING:       'DELISTING',
    ADV_FLOOR:       'ADV BELOW FLOOR',
    SPREAD_CEILING:  'SPREAD ABOVE CEILING',
    CLIP_TOO_LARGE:  'CLIP > MAX % OF ADV',
    PRICE_STALE:     'PRICE DATA STALE',
    HISTORY_SHORT:   'AGE DATA MISSING',
    FIELD_MISSING:   'REQUIRED FIELD MISSING',
    NOT_SHORTABLE:   'NOT SHORTABLE',
    BLACKOUT:        'MANUAL BLACKOUT',
};

/** Gate stages, in the order the funnel bar renders them. */
export const GATE_STAGES = [
    { code: 'candidates',      label: 'US LISTED' },
    { code: 'broker_tradeable', label: 'BROKER TRADEABLE' },
    { code: 'liquidity_floor', label: 'LIQUIDITY FLOOR' },
    { code: 'data_integrity',  label: 'DATA INTEGRITY GATE' },
    { code: 'eligible',        label: 'ELIGIBLE TODAY' },
];

export const DEFAULT_GATE_PARAMS = {
    minAdvUsd: 10_000_000,
    maxSpreadBps: 25,
    maxClipPctOfAdv: 0.05,
    maxPriceAgeDays: 4,
    minHistoryDays: 120,
    requiredFields: ['close', 'sector'],
    blackout: [],
};

/**
 * Apply the hard gates to one candidate. Binary and non-negotiable (§3.2).
 *
 * Returns the FIRST failure with its stage, so the funnel can attribute each
 * drop to exactly one step rather than double-counting a name that fails two
 * gates at once.
 */
export function applyGates(row, params = {}, { side = 'buy', intendedClipUsd = null } = {}) {
    const p = { ...DEFAULT_GATE_PARAMS, ...params };

    if (p.blackout && p.blackout.includes(row.symbol)) {
        return { eligible: false, stage: 'broker_tradeable', code: EXCLUSION.BLACKOUT, detail: 'flagged manually' };
    }
    if (row.tradeable === false) {
        return { eligible: false, stage: 'broker_tradeable', code: EXCLUSION.NOT_TRADEABLE, detail: 'not supported by the execution venue' };
    }
    if (row.halted) {
        return { eligible: false, stage: 'broker_tradeable', code: EXCLUSION.HALTED, detail: 'trading halted' };
    }
    if (row.listingStatus && /delist/i.test(row.listingStatus)) {
        return { eligible: false, stage: 'broker_tradeable', code: EXCLUSION.DELISTING, detail: row.listingStatus };
    }
    if (side === 'sell_short' && row.shortable === false) {
        return { eligible: false, stage: 'broker_tradeable', code: EXCLUSION.NOT_SHORTABLE, detail: 'no borrow' };
    }

    if (!isNum(row.advUsd) || row.advUsd < p.minAdvUsd) {
        return {
            eligible: false, stage: 'liquidity_floor', code: EXCLUSION.ADV_FLOOR,
            detail: isNum(row.advUsd) ? `$${(row.advUsd / 1e6).toFixed(1)}m ADV` : 'no ADV on file',
        };
    }
    if (isNum(row.spreadBps) && row.spreadBps > p.maxSpreadBps) {
        return { eligible: false, stage: 'liquidity_floor', code: EXCLUSION.SPREAD_CEILING, detail: `${row.spreadBps.toFixed(0)}bps` };
    }
    if (isNum(intendedClipUsd) && isNum(row.advUsd) && row.advUsd > 0
        && intendedClipUsd / row.advUsd > p.maxClipPctOfAdv) {
        return {
            eligible: false, stage: 'liquidity_floor', code: EXCLUSION.CLIP_TOO_LARGE,
            detail: `${((intendedClipUsd / row.advUsd) * 100).toFixed(1)}% of ADV`,
        };
    }

    // Data integrity (§3.2). "This is where the SNDK / MU / MRVL age-data gap
    // you already found gets enforced instead of just noted."
    if (isNum(row.priceAgeDays) && row.priceAgeDays > p.maxPriceAgeDays) {
        return { eligible: false, stage: 'data_integrity', code: EXCLUSION.PRICE_STALE, detail: `${row.priceAgeDays}d old` };
    }
    if (!isNum(row.priceAgeDays)) {
        return { eligible: false, stage: 'data_integrity', code: EXCLUSION.PRICE_STALE, detail: 'no price on file' };
    }
    if (!isNum(row.historyDays) || row.historyDays < p.minHistoryDays) {
        return {
            eligible: false, stage: 'data_integrity', code: EXCLUSION.HISTORY_SHORT,
            detail: isNum(row.historyDays) ? `${row.historyDays}d of history, ${p.minHistoryDays} required` : 'no history',
        };
    }
    for (const f of p.requiredFields) {
        if (row[f] == null || row[f] === '') {
            return { eligible: false, stage: 'data_integrity', code: EXCLUSION.FIELD_MISSING, detail: f };
        }
    }

    return { eligible: true, stage: 'eligible', code: null, detail: null };
}

/**
 * Build the funnel exactly as the universe bar renders it. Each name is
 * attributed to the single stage that dropped it.
 */
export function buildFunnel(results) {
    const dropped = { broker_tradeable: 0, liquidity_floor: 0, data_integrity: 0 };
    let eligible = 0;
    for (const r of results) {
        if (r.gate.eligible) eligible++;
        else if (dropped[r.gate.stage] != null) dropped[r.gate.stage]++;
    }
    const total = results.length;
    const afterBroker = total - dropped.broker_tradeable;
    const afterLiquidity = afterBroker - dropped.liquidity_floor;

    return [
        { stage: 'candidates',       label: 'US LISTED',           count: total,          dropped: null },
        { stage: 'broker_tradeable', label: 'BROKER TRADEABLE',    count: afterBroker,    dropped: dropped.broker_tradeable },
        { stage: 'liquidity_floor',  label: 'LIQUIDITY FLOOR',     count: afterLiquidity, dropped: dropped.liquidity_floor },
        { stage: 'data_integrity',   label: 'DATA INTEGRITY GATE', count: eligible,       dropped: dropped.data_integrity, isGate: true },
        { stage: 'eligible',         label: 'ELIGIBLE TODAY',      count: eligible,       dropped: null, isFinal: true },
    ];
}

/**
 * Descriptive axes (§3.3). These filter the VIEW; they never make a name
 * ineligible. Kept structurally separate from applyGates for that reason.
 */
export function matchesAxes(row, axes) {
    if (!axes) return true;
    const inSet = (v, set) => !set || !set.length || set.includes(v);

    if (!inSet(row.geography, axes.geography)) return false;
    if (!inSet(row.sector, axes.sector)) return false;
    if (!inSet(row.marketCapBucket, axes.marketCap)) return false;
    if (!inSet(row.volBand, axes.realisedVol)) return false;
    if (!inSet(row.momentumBand, axes.momentum)) return false;
    if (!inSet(row.bookState, axes.bookState)) return false;

    if (axes.minAdvUsd && (!isNum(row.advUsd) || row.advUsd < axes.minAdvUsd)) return false;

    if (axes.options && axes.options.length) {
        const ok = axes.options.some((o) => {
            if (o === 'listed') return row.optionsListed === true;
            if (o === 'iv_lt_40') return isNum(row.ivRank) && row.ivRank < 40;
            if (o === 'iv_gt_60') return isNum(row.ivRank) && row.ivRank > 60;
            return true;
        });
        if (!ok) return false;
    }

    if (axes.earnings && axes.earnings.length) {
        const d = row.daysToEarnings;
        const ok = axes.earnings.some((b) => {
            if (b === 'lt5d') return isNum(d) && d < 5;
            if (b === '5_30d') return isNum(d) && d >= 5 && d <= 30;
            if (b === 'gt30d') return !isNum(d) || d > 30;
            return true;
        });
        if (!ok) return false;
    }

    return true;
}

/** Quartile band label from a percentile. */
export function bandOf(pct) {
    if (!isNum(pct)) return null;
    return pct < 25 ? 'Q1' : pct < 50 ? 'Q2' : pct < 75 ? 'Q3' : 'Q4';
}

/**
 * Attach the percentile axes the field view plots against, computed across the
 * ELIGIBLE set only. A percentile against a population that includes names you
 * cannot trade is a percentile against a fiction.
 */
export function attachPercentiles(rows) {
    const eligible = rows.filter((r) => r.eligible);
    const mom = eligible.map((r) => r.momentum).filter(isNum);
    const vol = eligible.map((r) => r.realisedVol).filter(isNum);
    const liq = eligible.map((r) => r.advUsd).filter(isNum);

    return rows.map((r) => {
        if (!r.eligible) return r;
        const momentumPct = percentileRank(r.momentum, mom);
        const volPct = percentileRank(r.realisedVol, vol);
        return {
            ...r,
            momentumPct,
            volPct,
            liquidityPct: percentileRank(r.advUsd, liq),
            momentumBand: bandOf(momentumPct),
            volBand: bandOf(volPct),
        };
    });
}

/**
 * Rank the eligible set (§3.4). The composite is "a display convenience, not a
 * verdict" — which is why `rankBy` exists: the UI can order by any single
 * family instead of the blend, and the worked example in the mockup depends on
 * being able to see that a name ranks fifth on net and last on alignment.
 */
export function rankUniverse(rows, { rankBy = 'composite' } = {}) {
    const eligible = rows.filter((r) => r.eligible);

    const scored = eligible.map((r) => {
        // Composite deliberately blends the three coherence numbers rather than
        // re-scoring: net says which way, alignment says how much the families
        // agree, liquidity breaks ties among names that are otherwise equal.
        const netPart = isNum(r.net) ? r.net : 0;
        const alignPart = isNum(r.alignment) ? r.alignment : 0;
        const composite = netPart * (0.5 + 0.5 * alignPart);
        return { ...r, composite };
    });

    const key = (r) => {
        switch (rankBy) {
            case 'net':        return isNum(r.net) ? r.net : -Infinity;
            case 'alignment':  return isNum(r.alignment) ? r.alignment : -Infinity;
            case 'adv':        return isNum(r.advUsd) ? r.advUsd : -Infinity;
            case 'momentum':   return isNum(r.momentumPct) ? r.momentumPct : -Infinity;
            case 'vol':        return isNum(r.volPct) ? r.volPct : -Infinity;
            default:
                if (rankBy && rankBy.startsWith('family:')) {
                    const code = rankBy.slice(7);
                    const f = r.families && r.families[code];
                    return f && isNum(f.score) ? f.score : -Infinity;
                }
                return r.composite;
        }
    };

    scored.sort((a, b) => key(b) - key(a) || String(a.symbol).localeCompare(String(b.symbol)));
    return scored.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * One pass: gate, band, rank. Returns everything the universe screen and the
 * daily snapshot both need, including the excluded rows — which are the point,
 * not a by-product.
 */
export function buildUniverse(candidates, { gateParams, side = 'buy', rankBy = 'composite', intendedClipUsd = null } = {}) {
    const gated = candidates.map((row) => ({
        ...row,
        gate: applyGates(row, gateParams, { side, intendedClipUsd }),
    }));

    const funnel = buildFunnel(gated);

    const withFlags = gated.map((r) => ({
        ...r,
        eligible: r.gate.eligible,
        exclusionCode: r.gate.code,
        exclusionDetail: r.gate.detail,
        gateStage: r.gate.stage,
    }));

    const withPct = attachPercentiles(withFlags);
    const ranked = rankUniverse(withPct, { rankBy });
    const rankBySymbol = new Map(ranked.map((r) => [r.symbol, r]));

    const members = withPct.map((r) => rankBySymbol.get(r.symbol) || r);
    const excluded = members.filter((r) => !r.eligible);

    return {
        members,
        eligible: ranked,
        excluded,
        funnel,
        counts: {
            candidates: candidates.length,
            eligible: ranked.length,
            excluded: excluded.length,
            dataGate: excluded.filter((r) => r.gateStage === 'data_integrity').length,
        },
    };
}
