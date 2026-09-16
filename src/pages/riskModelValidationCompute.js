// ============================================================
// F-3 / B5 — "Does the risk model work?" · pure transforms
// ------------------------------------------------------------
// Every number on the Model validation section comes out of
// var_backtest_runs and vw_var_backtest_distribution. There is no
// confidence list, no threshold and no verdict string keyed to a
// particular level in this file: a re-estimate that moves which level
// passes must move the panel with it.
//
// Nothing here recomputes VaR. Standardising the model series by its own
// predicted sd puts the three thresholds at exactly the Gaussian
// quantiles, so the panel marks constants rather than deriving a bound
// the backtest could disagree with.
// ============================================================

// Gaussian quantiles for the three confidences the backtest supports.
// On the standardised axis these ARE the VaR thresholds — see the view's
// comment. Keyed by confidence so an unsupported level resolves to
// undefined rather than to a neighbour.
export const VAR_Z = {
    '0.90': 1.2815515655446004,
    '0.95': 1.6448536269514722,
    '0.99': 2.3263478740408408,
};

export const confKey = (c) => Number(c).toFixed(2);

// ── Run selection ────────────────────────────────────────────────────
// var_backtest_runs is append-only and carries every as_of. The panel
// shows one vintage; mixing two would compare two estimates.
export function latestRunSet(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    let asOf = null;
    for (const r of rows) if (!asOf || r.as_of > asOf) asOf = r.as_of;
    const sameDate = rows.filter((r) => r.as_of === asOf);
    // A single as_of should carry one logic_version. If it ever carries
    // two, take the lexically greatest and report it, never blend.
    let lv = null;
    for (const r of sameDate) if (!lv || r.logic_version > lv) lv = r.logic_version;
    const rowsOut = sameDate.filter((r) => r.logic_version === lv);
    return {
        asOf,
        logicVersion: lv,
        rows: rowsOut,
        logicVersionsSeen: [...new Set(sameDate.map((r) => r.logic_version))].sort(),
    };
}

// ── Tail shape (model leg) ───────────────────────────────────────────
// The model leg isolates the distributional assumption: b'x over the
// whole factor history, where predicted and realised sd agree, so any
// exception miscount is shape and not scale.
export function tailShapeRows(rows) {
    return (rows || [])
        .filter((r) => r.leg === 'model' && r.basis === 'unconditional')
        .map((r) => {
            const obs = Number(r.exceptions);
            const exp = Number(r.expected_exceptions);
            const ratio = exp > 0 ? obs / exp : null;
            const rejects = r.kupiec_reject_05 === true;
            // Direction is DERIVED, never keyed to a confidence level.
            let direction;
            if (!rejects) direction = 'passes — observed and expected agree';
            else if (ratio != null && ratio < 1) direction = 'too few — body too wide';
            else direction = 'too many — tail too thin';
            return {
                conf: Number(r.conf),
                confLabel: (Number(r.conf) * 100).toFixed(0) + '%',
                observed: obs,
                expected: exp,
                ratio,
                direction,
                passes: !rejects,
                kupiecLr: r.kupiec_lr == null ? null : Number(r.kupiec_lr),
                reject05: r.kupiec_reject_05 === true,
                reject01: r.kupiec_reject_01 === true,
                nObs: Number(r.n_obs),
                z: VAR_Z[confKey(r.conf)] ?? null,
            };
        })
        .sort((a, b) => a.conf - b.conf);
}

// One sentence naming the pattern. Without it a reader sees one pass and
// two fails with no way to know they are one finding. The sentence is
// derived from the shape of the set — if a future re-estimate stops
// producing the crossing pattern, this stops claiming it.
export function patternSentence(tailRows) {
    if (!tailRows || tailRows.length < 2) return null;
    const lo = tailRows[0];
    const hi = tailRows[tailRows.length - 1];
    const passing = tailRows.filter((r) => r.passes);
    const bodyTooFew = lo.ratio != null && lo.ratio < 1 && !lo.passes;
    const tailTooMany = hi.ratio != null && hi.ratio > 1 && !hi.passes;

    if (bodyTooFew && tailTooMany) {
        const mid = passing.length === 1 ? passing[0].confLabel : null;
        return 'Too few exceptions in the body and too many in the tail: this is one '
            + 'leptokurtic distribution, not three separate results.'
            + (mid
                ? ' ' + mid + ' passes because it is where the two errors cross — reading it '
                  + 'alone would certify the assumption the other two refute.'
                : '');
    }
    if (tailRows.every((r) => r.passes)) {
        return 'All three levels are within their expected exception counts; the Gaussian '
            + 'assumption is not refuted on this sample.';
    }
    return 'The three levels do not fail in one direction — read each on its own rather '
        + 'than as a single pattern.';
}

// ── Scale (book leg) ─────────────────────────────────────────────────
// A multiplicative chain: predicted sd → window ran hot → no idiosyncratic
// term → realised sd. Each factor is computed from stored columns, never
// hardcoded, and each carries its cause in words.
export function scaleChain(rows) {
    const r = (rows || []).find((x) => x.leg === 'book' && x.basis === 'unconditional');
    if (!r) return null;

    const sdPred = num(r.sd_pred_daily);
    const sdReal = num(r.sd_realised_daily);
    const sdFactor = num(r.sd_factor_window);
    const sdResid = num(r.sd_residual_window);

    // An absent measurement is absent, not zero. Without both decomposition
    // columns there is no chain to draw and the panel says so.
    if (sdPred == null || sdReal == null || sdPred <= 0) return null;
    const total = sdReal / sdPred;
    if (sdFactor == null || sdResid == null || sdFactor <= 0) {
        return { total, sdPred, sdReal, steps: null, reason: 'decomposition columns not stored for this run' };
    }

    const hot = sdFactor / sdPred;
    const idio = Math.sqrt(sdFactor * sdFactor + sdResid * sdResid) / sdFactor;
    const product = hot * idio;
    // The chain reproduces the total to within the residual's small
    // non-orthogonality over the window; publish the gap rather than
    // rounding it away.
    const gap = total / product - 1;

    return {
        sdPred,
        sdReal,
        total,
        product,
        gap,
        steps: [
            {
                factor: hot,
                label: 'the window ran hot',
                cause: 'Σ is an average over the whole factor history. Over this window the '
                     + 'factor return ran ' + pct(hot - 1) + ' hotter than that average.',
            },
            {
                factor: idio,
                label: 'no idiosyncratic variance',
                cause: "b′Σb carries no stock-specific risk at all — "
                     + share(sdResid, sdFactor) + ' of book variance has no representation in it.',
            },
        ],
    };
}

// The closing line states the magnitude and that neither cause is the tail.
export function scaleClosing(chain) {
    if (!chain) return null;
    if (!chain.steps) {
        return 'Realised daily volatility is ' + mult(chain.total) + ' the predicted figure. '
             + 'The decomposition is not available for this run (' + chain.reason + ').';
    }
    return 'Realised daily volatility is ' + mult(chain.total) + ' the predicted figure. '
        + 'Neither cause is the tail: both are structural and both have separate fixes — a '
        + 'residual variance term, and a shorter or weighted covariance window. A single '
        + 'multiplier on the predicted volatility would be recalibrated by any change in either.';
}

// ── Distribution overlay ─────────────────────────────────────────────
// Expected counts under the standard normal for each stored bin. This is a
// reference curve, not a bound: it uses only the bin geometry and n.
export function normalOverlay(bins) {
    if (!Array.isArray(bins) || !bins.length) return [];
    const n = Number(bins[0].n_obs) || 0;
    return bins.map((b) => {
        const mid = Number(b.bin_mid);
        const w = Number(b.bin_hi) - Number(b.bin_lo);
        return (Math.exp(-(mid * mid) / 2) / Math.sqrt(2 * Math.PI)) * w * n;
    });
}

// A bin is in the 99% tail when the whole bin sits beyond the threshold —
// a bin straddling it is not shaded, so the shading never overstates.
export function tailBinFlags(bins, z) {
    if (!Array.isArray(bins) || z == null) return [];
    return bins.map((b) => Number(b.bin_hi) <= -z);
}

// The panel must be able to say it is describing the run it renders beside.
// The distribution recomputes b'x from the CURRENT betas; the run row was
// written against the betas of its own night.
export function vintageAgrees(runRow, distRow) {
    if (!runRow || !distRow) return null;
    const a = runRow.betas_estimated_at, b = distRow.betas_estimated_at;
    if (a == null || b == null) return null;
    return new Date(a).getTime() === new Date(b).getTime();
}

// ── formatting helpers ───────────────────────────────────────────────
function num(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
const mult = (x) => x.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + '×';
const pct = (x) => (x * 100).toFixed(1) + '%';
function share(sdResid, sdFactor) {
    const tot = sdFactor * sdFactor + sdResid * sdResid;
    return tot > 0 ? ((sdResid * sdResid) / tot * 100).toFixed(1) + '%' : '—';
}
export { mult as formatMultiple };
