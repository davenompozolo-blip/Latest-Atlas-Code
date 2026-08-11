// ATLAS Trade — the family scoring layer. Spec §5.2 and §10 residual question 2.
//
// Each family emits three values, not two, and keeping them apart is the whole
// point:
//
//   score      [-1,+1]  which way does this family point?
//   conviction [0,1]    how strongly does the evidence WITHIN this family
//                       support that direction?
//   confidence [0,1]    how much should we trust the observation at all?
//
// §5.2: "A trend family can be highly convinced of a weak signal (every
// indicator agrees the trend is mildly positive) or weakly convinced of a
// strong one (one indicator screams, the rest are silent). Collapsing the two
// into a single weight destroys the distinction and, more practically, makes it
// impossible to later diagnose whether a family failed because its evidence was
// thin or because its data was bad."
//
// Those two sentences are testable, and the conviction rule below is written to
// satisfy them literally: six mild agreeing inputs give conviction ≈ 1, one
// screaming input among five silent ones gives conviction ≈ 0.2.

import { clamp, isNum, num, mean, percentileRank } from './stats.js';

/** An input is "silent" below this magnitude — present, but not saying anything. */
export const SILENT_BELOW = 0.10;

/** Squash an unbounded reading into [-1,1] with a soft knee at `scale`. */
export function squash(x, scale) {
    if (!isNum(x) || !isNum(scale) || scale === 0) return null;
    return clamp(Math.tanh(x / scale), -1, 1);
}

/** Map a percentile (0–100) onto [-1,1], 50 → 0. */
export function fromPercentile(p) {
    if (!isNum(p)) return null;
    return clamp((p - 50) / 50, -1, 1);
}

/**
 * Conviction for the multi-input families: the fraction of AVAILABLE inputs
 * whose direction agrees with the family's net direction, where an input below
 * the silence threshold agrees with nothing (§10.2: "conviction is the weighted
 * fraction of those inputs agreeing with the family's net direction").
 */
export function convictionFromAgreement(subScores, netScore) {
    const present = subScores.filter((s) => isNum(s.value));
    if (!present.length || !isNum(netScore) || netScore === 0) return 0;
    const dir = Math.sign(netScore);
    let agreeW = 0, totalW = 0;
    for (const s of present) {
        const w = isNum(s.weight) ? s.weight : 1;
        totalW += w;
        if (Math.sign(s.value) === dir && Math.abs(s.value) >= SILENT_BELOW) agreeW += w;
    }
    return totalW > 0 ? clamp(agreeW / totalW, 0, 1) : 0;
}

/**
 * Conviction for the single-observation families, from extremity within the
 * observation's own trailing distribution (§10 residual question 2).
 *
 *   conviction = min(1, |percentile − 50| / 45)
 *
 * Provisional and flagged as such in signal_families.conviction_method: a
 * multiple at its historical median produces no conviction, one at the 98th
 * percentile produces near-full conviction. It is a defensible statement about
 * how unusual the reading is, and it is honestly not the same thing as
 * evidential strength, which is why it is temporary.
 */
export function convictionFromExtremity(percentile) {
    if (!isNum(percentile)) return 0;
    return clamp(Math.min(1, Math.abs(percentile - 50) / 45), 0, 1);
}

/**
 * Confidence: coverage of the family's expected inputs, decayed by the age of
 * the data behind them. Falls with stale, incomplete or thin data (§5.2).
 */
export function confidenceFrom({ available, expected, ageDays = 0, maxAgeDays = 5, thinSample = false }) {
    if (!expected) return 0;
    const coverage = clamp(available / expected, 0, 1);
    // Full confidence up to maxAgeDays, then linear decay to zero at 4× that.
    const overAge = Math.max(0, (ageDays || 0) - maxAgeDays);
    const freshness = clamp(1 - overAge / (maxAgeDays * 3), 0, 1);
    const thin = thinSample ? 0.6 : 1;
    return clamp(coverage * freshness * thin, 0, 1);
}

function assemble(code, subScores, { convictionMethod = 'input_agreement', percentile = null, confidence, inputs = {}, expected }) {
    const present = subScores.filter((s) => isNum(s.value));
    const score = present.length
        ? clamp(mean(present.map((s) => s.value * (isNum(s.weight) ? s.weight : 1))) /
                (mean(present.map((s) => (isNum(s.weight) ? s.weight : 1))) || 1), -1, 1)
        : null;

    const conviction = score == null ? 0
        : convictionMethod === 'distribution_extremity'
            ? convictionFromExtremity(percentile)
            : convictionFromAgreement(subScores, score);

    return {
        code,
        score,
        conviction,
        confidence: confidence != null ? confidence : confidenceFrom({ available: present.length, expected }),
        convictionMethod,
        inputs: { ...inputs, sub_scores: Object.fromEntries(subScores.map((s) => [s.key, s.value])) },
        available: present.length,
        expected,
    };
}

// ── Trend ────────────────────────────────────────────────────────────────────
// MA structure, price vs 20/50/200, higher-high/higher-low state, RS vs sector
// and index (§5.2). The family with no source at all before this build.

export function trendFamily({ closes, spyCloses, sectorCloses, ageDays = 0 }) {
    const c = (closes || []).filter(isNum);
    const last = c[c.length - 1];
    const sma = (n) => (c.length >= n ? mean(c.slice(-n)) : null);
    const s20 = sma(20), s50 = sma(50), s200 = sma(200);

    const rel = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? a / b - 1 : null);

    // Higher-high / higher-low state over the last 60 sessions against the 60
    // before it. Structure, not momentum: a series can be above its averages
    // and still be carving lower highs.
    let structure = null;
    if (c.length >= 120) {
        const recent = c.slice(-60), prior = c.slice(-120, -60);
        const hh = Math.max(...recent) > Math.max(...prior);
        const hl = Math.min(...recent) > Math.min(...prior);
        structure = hh && hl ? 1 : !hh && !hl ? -1 : 0;
    }

    const relStrength = (series) => {
        const s = (series || []).filter(isNum);
        if (s.length < 63 || c.length < 63) return null;
        const own = c[c.length - 1] / c[c.length - 63] - 1;
        const bench = s[s.length - 1] / s[s.length - 63] - 1;
        return squash(own - bench, 0.10);
    };

    const subs = [
        { key: 'px_vs_sma20',  value: squash(rel(last, s20), 0.05),  weight: 1 },
        { key: 'px_vs_sma50',  value: squash(rel(last, s50), 0.10),  weight: 1 },
        { key: 'px_vs_sma200', value: squash(rel(last, s200), 0.20), weight: 1 },
        { key: 'ma_structure', value: squash(rel(s20, s50), 0.05),   weight: 1 },
        { key: 'hh_hl_state',  value: structure,                     weight: 1 },
        { key: 'rs_vs_index',  value: relStrength(spyCloses),        weight: 1 },
        { key: 'rs_vs_sector', value: relStrength(sectorCloses),     weight: 1 },
    ];

    return assemble('trend', subs, {
        expected: subs.length,
        confidence: confidenceFrom({
            available: subs.filter((s) => isNum(s.value)).length,
            expected: subs.length,
            ageDays,
            thinSample: c.length < 200,
        }),
        inputs: { last_close: last, sma20: s20, sma50: s50, sma200: s200, bars: c.length },
    });
}

// ── Stretch ──────────────────────────────────────────────────────────────────
// z-score to VWAP and 20d MA, RSI, distance to bands, gap statistics (§5.2).
// Stretched high points AGAINST a long: this family is the mean-reversion voice.

export function stretchFamily({ closes, vwap, vol20d, zMove, ageDays = 0 }) {
    const c = (closes || []).filter(isNum);
    const last = c[c.length - 1];
    const s20 = c.length >= 20 ? mean(c.slice(-20)) : null;
    const sd20 = c.length >= 20 ? Math.sqrt(mean(c.slice(-20).map((x) => (x - s20) ** 2))) : null;

    const zTo20 = isNum(last) && isNum(s20) && isNum(sd20) && sd20 > 0 ? (last - s20) / sd20 : null;
    const zToVwap = isNum(last) && isNum(vwap) && isNum(vol20d) && vol20d > 0
        ? (last / vwap - 1) / vol20d : null;

    // Wilder RSI(14) on the close series.
    let rsi = null;
    if (c.length >= 15) {
        let g = 0, l = 0;
        for (let i = c.length - 14; i < c.length; i++) {
            const d = c[i] - c[i - 1];
            if (d >= 0) g += d; else l -= d;
        }
        const rs = l === 0 ? Infinity : g / l;
        rsi = 100 - 100 / (1 + rs);
    }

    const bandPos = isNum(zTo20) ? clamp(zTo20 / 2, -1, 1) : null;   // 2σ Bollinger

    const subs = [
        { key: 'z_to_sma20',  value: isNum(zTo20) ? -clamp(zTo20 / 2, -1, 1) : null, weight: 1 },
        { key: 'z_to_vwap',   value: isNum(zToVwap) ? -squash(zToVwap, 1.5) : null,  weight: 1 },
        { key: 'rsi',         value: isNum(rsi) ? -clamp((rsi - 50) / 30, -1, 1) : null, weight: 1 },
        { key: 'band_dist',   value: isNum(bandPos) ? -bandPos : null,               weight: 1 },
        { key: 'z_move_1d',   value: isNum(zMove) ? -squash(zMove, 2.5) : null,      weight: 0.5 },
    ];

    return assemble('stretch', subs, {
        expected: subs.length,
        confidence: confidenceFrom({
            available: subs.filter((s) => isNum(s.value)).length,
            expected: subs.length,
            ageDays,
        }),
        inputs: { z_to_sma20: zTo20, z_to_vwap: zToVwap, rsi, vwap, vol_20d: vol20d, z_move: zMove },
    });
}

// ── Volatility regime ────────────────────────────────────────────────────────
// Realised vs implied, IV rank, vol-of-vol, vol_dispersion_daily sector spread.
//
// vol_dispersion_daily is empty in production (see the Phase 0a note in the PR).
// That input therefore resolves to null, which lowers coverage and so lowers
// this family's CONFIDENCE — the gap shows up as reduced trust rather than
// being silently assumed away. That is the mechanism working as designed.

export function volRegimeFamily({ vol20d, volHistory, atmIv, frontIv, backIv, ivRank, dispersionSpread, ageDays = 0 }) {
    const realisedPct = isNum(vol20d) && volHistory && volHistory.length
        ? percentileRank(vol20d, volHistory) : null;

    // Implied above realised is a paid-for cushion; realised above implied is
    // the market being caught out. Positive = benign regime for a long.
    const rvIv = isNum(atmIv) && isNum(vol20d) && vol20d > 0 ? atmIv / vol20d - 1 : null;

    // Vol of vol from the dispersion of the trailing vol series.
    let volOfVol = null;
    if (volHistory && volHistory.length >= 20) {
        const m = mean(volHistory);
        volOfVol = m > 0 ? Math.sqrt(mean(volHistory.map((v) => (v - m) ** 2))) / m : null;
    }

    const termSlope = isNum(frontIv) && isNum(backIv) && backIv > 0 ? backIv / frontIv - 1 : null;

    const subs = [
        { key: 'realised_percentile', value: isNum(realisedPct) ? -fromPercentile(realisedPct) : null, weight: 1 },
        { key: 'implied_vs_realised', value: isNum(rvIv) ? squash(rvIv, 0.30) : null,                  weight: 1 },
        { key: 'iv_rank',             value: isNum(ivRank) ? -fromPercentile(ivRank) : null,           weight: 1 },
        { key: 'vol_of_vol',          value: isNum(volOfVol) ? -squash(volOfVol, 0.35) : null,         weight: 0.5 },
        { key: 'term_slope',          value: isNum(termSlope) ? squash(termSlope, 0.15) : null,        weight: 0.5 },
        { key: 'sector_dispersion',   value: isNum(dispersionSpread) ? -squash(dispersionSpread, 0.08) : null, weight: 0.5 },
    ];

    return assemble('vol_regime', subs, {
        expected: subs.length,
        confidence: confidenceFrom({
            available: subs.filter((s) => isNum(s.value)).length,
            expected: subs.length,
            ageDays,
        }),
        inputs: {
            vol_20d: vol20d, atm_iv: atmIv, iv_rank: ivRank, front_iv: frontIv, back_iv: backIv,
            dispersion_spread: dispersionSpread,
            dispersion_available: isNum(dispersionSpread),
        },
    });
}

// ── Flow and positioning ─────────────────────────────────────────────────────

export function flowFamily({ volume, adv, pcVol, pcOi, skew25d, oiShift, ageDays = 0 }) {
    const volVsAdv = isNum(volume) && isNum(adv) && adv > 0 ? volume / adv - 1 : null;

    // Put/call around 1.0 is neutral; heavy puts read as hedged/negative
    // positioning, heavy calls as crowded/positive. Bounded either way.
    const pcScore = (x) => (isNum(x) && x > 0 ? clamp((1 - x) / 0.6, -1, 1) : null);

    const subs = [
        { key: 'volume_vs_adv', value: isNum(volVsAdv) ? squash(volVsAdv, 0.60) : null,  weight: 1 },
        { key: 'pc_volume',     value: pcScore(pcVol),                                    weight: 1 },
        { key: 'pc_open_int',   value: pcScore(pcOi),                                      weight: 1 },
        { key: 'skew_25d',      value: isNum(skew25d) ? -squash(skew25d, 0.06) : null,     weight: 0.75 },
        { key: 'oi_shift',      value: isNum(oiShift) ? squash(oiShift, 0.25) : null,      weight: 0.5 },
    ];

    return assemble('flow', subs, {
        expected: subs.length,
        confidence: confidenceFrom({
            available: subs.filter((s) => isNum(s.value)).length,
            expected: subs.length,
            ageDays,
        }),
        inputs: { volume, adv, pc_vol: pcVol, pc_oi: pcOi, skew_25d: skew25d },
    });
}

// ── Valuation ────────────────────────────────────────────────────────────────
// §4.3: "274x forward P/E is not a fact to be noted, it is a valuation family
// score of roughly -0.8 that should be arguing with your trend score."
//
// Single-observation family, so conviction comes from extremity (§10.2). The
// percentile is computed against the sector cross-section, and against the
// name's own history where a history is available — cheapness relative to a
// peer group and relative to a name's own past are different claims and the
// inputs are kept separate so you can see which one is carrying the score.

export function valuationFamily({
    forwardPe, sectorForwardPes, ownForwardPeHistory,
    evEbitda, sectorEvEbitdas, peg,
    pctEvEbitdaZ, pctPeg, pctFcfYield, revisionBreadth,
    ageDays = 0,
}) {
    const cheapFromPercentile = (value, sample) => {
        const p = percentileRank(value, sample);
        // Low multiple = cheap = positive. Percentile of the multiple inverts.
        return isNum(p) ? { score: -fromPercentile(p), percentile: p } : { score: null, percentile: null };
    };

    const vsSector = cheapFromPercentile(forwardPe, sectorForwardPes || []);
    const vsOwn = cheapFromPercentile(forwardPe, ownForwardPeHistory || []);
    const evVsSector = cheapFromPercentile(evEbitda, sectorEvEbitdas || []);

    // equity_fundamentals_derived stores these already inverted: a HIGH
    // percentile means cheap (see compute_ticker_derived's pctEst(..., true)).
    const derived = (p) => (isNum(p) ? fromPercentile(p) : null);

    const subs = [
        { key: 'fwd_pe_vs_sector',  value: vsSector.score,          weight: 1.25 },
        { key: 'fwd_pe_vs_own',     value: vsOwn.score,             weight: 1 },
        { key: 'ev_ebitda_vs_sector', value: evVsSector.score,      weight: 0.75 },
        { key: 'pct_ev_ebitda_z',   value: derived(pctEvEbitdaZ),   weight: 0.75 },
        { key: 'pct_peg',           value: derived(pctPeg),         weight: 0.5 },
        { key: 'pct_fcf_yield',     value: derived(pctFcfYield),    weight: 0.5 },
        { key: 'revision_breadth',  value: isNum(revisionBreadth) ? squash(revisionBreadth, 0.25) : null, weight: 0.75 },
    ];

    // Extremity is taken from the strongest available percentile reading — the
    // one the score is actually leaning on.
    const percentile = [vsOwn.percentile, vsSector.percentile, evVsSector.percentile]
        .filter(isNum)
        .sort((a, b) => Math.abs(b - 50) - Math.abs(a - 50))[0] ?? null;

    return assemble('valuation', subs, {
        convictionMethod: 'distribution_extremity',
        percentile,
        expected: subs.length,
        confidence: confidenceFrom({
            available: subs.filter((s) => isNum(s.value)).length,
            expected: subs.length,
            ageDays,
            maxAgeDays: 30,
            // A cross-section thinner than a handful of peers is not a
            // distribution, it is an anecdote.
            thinSample: (sectorForwardPes || []).length < 6,
        }),
        inputs: {
            forward_pe: forwardPe,
            ev_ebitda: evEbitda,
            peg,
            sector_sample: (sectorForwardPes || []).length,
            own_history_sample: (ownForwardPeHistory || []).length,
            percentile_used: percentile,
        },
    });
}

// ── Macro regime ─────────────────────────────────────────────────────────────

export function macroFamily({ regime, regimePercentile, beta, sectorTilt, ageDays = 0 }) {
    const risk = regime && /risk[- ]?on|expansion|recovery/i.test(regime.name || regime.label || '')
        ? 1
        : regime && /risk[- ]?off|contraction|stress|crisis/i.test(regime.name || regime.label || '')
            ? -1
            : 0;

    // A high-beta name gains more from a risk-on regime and loses more in
    // risk-off; the regime reading is scaled by how exposed the name is to it.
    const betaScaled = isNum(beta) ? clamp(risk * clamp(beta / 1.2, 0.4, 1.6), -1, 1) : risk;

    const subs = [
        { key: 'regime_direction', value: risk === 0 ? null : betaScaled,               weight: 1 },
        { key: 'sector_tilt',      value: isNum(sectorTilt) ? clamp(sectorTilt, -1, 1) : null, weight: 0.5 },
    ];

    return assemble('macro', subs, {
        convictionMethod: 'distribution_extremity',
        percentile: isNum(regimePercentile) ? regimePercentile : (risk === 0 ? 50 : risk > 0 ? 75 : 25),
        expected: subs.length,
        confidence: confidenceFrom({
            available: subs.filter((s) => isNum(s.value)).length,
            expected: subs.length,
            ageDays,
            maxAgeDays: 30,
        }),
        inputs: { regime: regime ? (regime.name || regime.label) : null, beta, sector_tilt: sectorTilt },
    });
}

// ── Event proximity (suppressor) ─────────────────────────────────────────────
// §5.2: "mostly a confidence suppressor rather than a directional score… you
// are about to trade into a variance event, and that is a statement about
// knowability, not direction."

export const EVENT_MAX_SUPPRESSION = 0.40;
export const EVENT_DECAY_DAYS = 7.4;

/**
 * Exponential decay calibrated so a print a fortnight out costs about six
 * points of confidence — the reading in the worked example — while one inside
 * the week costs 25 to 40, and anything beyond a month costs nothing.
 */
export function eventSuppression(daysToEvent) {
    if (!isNum(daysToEvent) || daysToEvent < 0 || daysToEvent > 45) return 0;
    return clamp(EVENT_MAX_SUPPRESSION * Math.exp(-daysToEvent / EVENT_DECAY_DAYS), 0, 1);
}

export function eventFamily({ daysToEarnings, daysToExDiv, ageDays = 0 }) {
    const earn = eventSuppression(daysToEarnings);
    const div = isNum(daysToExDiv) ? eventSuppression(daysToExDiv) * 0.3 : 0;
    const suppression = clamp(1 - (1 - earn) * (1 - div), 0, 1);

    const reason = isNum(daysToEarnings) && daysToEarnings <= 45
        ? `earnings in ${Math.round(daysToEarnings)} day${Math.round(daysToEarnings) === 1 ? '' : 's'}`
        : isNum(daysToExDiv) && daysToExDiv <= 45
            ? `ex-dividend in ${Math.round(daysToExDiv)} days`
            : null;

    return {
        code: 'event',
        isSuppressor: true,
        score: null,
        conviction: null,
        confidence: confidenceFrom({ available: isNum(daysToEarnings) ? 1 : 0, expected: 1, ageDays }),
        suppression,
        reason,
        convictionMethod: 'none',
        inputs: { days_to_earnings: daysToEarnings, days_to_ex_div: daysToExDiv },
    };
}

/** Assemble the whole vector for one symbol from already-fetched raw inputs. */
export function buildFamilyVector(raw) {
    return [
        trendFamily(raw.trend || {}),
        flowFamily(raw.flow || {}),
        macroFamily(raw.macro || {}),
        valuationFamily(raw.valuation || {}),
        stretchFamily(raw.stretch || {}),
        volRegimeFamily(raw.volRegime || {}),
        eventFamily(raw.event || {}),
    ];
}
