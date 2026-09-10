// ============================================================
// ATLAS Nexus — intermarket axis state (A2). Pure transforms.
// ------------------------------------------------------------
// Everything here is driven by rows from the database. There is no axis
// list, no pair list, no sign, no label and no threshold-per-axis in this
// file. If a fourth axis is added to `factor_axes` the panel grows by
// itself; if a re-estimate flips an axis's significance the cell changes
// with no code edit. That is asserted in nexusAxesCompute.test.mjs rather
// than trusted.
//
// The one rule that matters (§2): an axis whose latest beta is not
// significant renders "no measurable exposure", never the number. This is
// not a carve-out for `cyclical` — it is the general rule, read off the
// `significant` flag, because a re-estimate can flip any axis either way.
// Printing 0.0005 would be read as a small exposure, which is a different
// claim from no measurable exposure and is the claim the data does not
// support.
//
// The beta is therefore ABSENT from the row shape when it is not
// measured, not merely flagged. A renderer cannot print a number it was
// never handed — the same reasoning as nexusReturnBasis.js, where the
// substitution is impossible to write rather than discouraged.
// ============================================================

// ── Constants the spec fixes ─────────────────────────────────
// §4: a 20d reading below this magnitude counts as quiet.
//
// NOTE, and this is a real caveat rather than a nicety: `score_20d` is a
// ROLLING 20-SESSION SUM of the daily axis score (see
// atlas_refresh_factor_scores), not a sigma-scaled level. Mean |score_20d|
// over the full history is 5.1 (concentration) to 5.8 (cyclical), so 0.5
// sits around a tenth of a typical reading. Backtested over the 4,116
// sessions carrying both non-marginal axes, this threshold yields
// aligned 52.8%, contested 46.6%, quiet 0.53% (22 days).
// The threshold is the spec's and is applied as written; it lives here as
// one named constant so re-deciding it is a one-line change.
export const QUIET_SIGMA = 0.5;

// §5: the score date may trail the series close by at most this many
// trading sessions before the panel calls itself stale.
export const STALE_MAX_LAG_SESSIONS = 1;

// §6: the coherence read ships off. Roadmap v2 gates it on one month of
// the panel live.
export const READ_FLAG_KEY = 'atlas.regime.read.v1';

export function readBlockEnabled(storage) {
    // Default off, and off on any environment that cannot answer — a
    // read that appears because localStorage threw is not "default off".
    try {
        const s = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        return !!s && s.getItem(READ_FLAG_KEY) === 'on';
    } catch (_) {
        return false;
    }
}

const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

// ── Latest estimate set ──────────────────────────────────────
// book_factor_betas is append-only and holds more than one set. Always
// the newest by estimated_at; a set is taken whole, never row by row,
// so a row can never be paired with another vintage's window.
export function latestEstimateSet(betaRows) {
    const rows = (betaRows || []).filter(r => r && r.estimated_at);
    if (!rows.length) return null;
    let newest = rows[0].estimated_at;
    for (const r of rows) if (String(r.estimated_at) > String(newest)) newest = r.estimated_at;
    const set = rows.filter(r => String(r.estimated_at) === String(newest));
    const head = set[0];
    return {
        estimatedAt: newest,
        windowStart: head.window_start || null,
        windowEnd: head.window_end || null,
        nObs: num(head.n_obs),
        rSquared: num(head.r_squared),
        byFactor: set.reduce((m, r) => { m[r.factor] = r; return m; }, {}),
    };
}

// ── Rows ─────────────────────────────────────────────────────
// `alpha` and `market` live in book_factor_betas but are not rows of
// factor_axes, so joining on axis_key drops them without naming them.
// That is deliberate: the exclusion is structural, not a deny-list.
export function buildAxisRows({ axes, loadings, scores, betas }) {
    const est = latestEstimateSet(betas);
    const scoreByAxis = {};
    for (const s of scores || []) {
        const k = s.axis_key;
        if (!scoreByAxis[k] || String(s.date) > String(scoreByAxis[k].date)) scoreByAxis[k] = s;
    }
    const pairsByAxis = {};
    for (const l of loadings || []) (pairsByAxis[l.axis_key] = pairsByAxis[l.axis_key] || []).push(l);

    return (axes || [])
        .slice()
        .sort((a, b) => Number(a.pc_rank) - Number(b.pc_rank))
        .map(a => {
            const s = scoreByAxis[a.axis_key] || null;
            const b = est && est.byFactor[a.axis_key] ? est.byFactor[a.axis_key] : null;
            const measured = !!(b && b.significant === true);

            const row = {
                axisKey: a.axis_key,
                label: a.label,
                pcRank: Number(a.pc_rank),
                varianceExplained: num(a.variance_explained),
                marginal: a.marginal === true,
                // §3: direction is read from the data, never inferred from
                // the key. `concentration` reads backwards from its raw
                // component — positive means leadership NARROWING.
                positiveMeans: a.positive_means || null,
                pcSignFlipped: a.pc_sign_flipped === true,

                scoreDate: s ? s.date : null,
                score: s ? num(s.score) : null,
                score20d: s ? num(s.score_20d) : null,
                score60d: s ? num(s.score_60d) : null,
                pairsUsed: s ? num(s.pairs_used) : null,

                pairs: (pairsByAxis[a.axis_key] || [])
                    .map(l => ({ pairKey: l.pair_key, loading: num(l.loading) }))
                    .sort((x, y) => Math.abs(y.loading) - Math.abs(x.loading)),

                exposure: {
                    measured,
                    // Present only when measured. See the header note.
                    ...(measured ? { beta: num(b.beta), stdError: num(b.std_error), tStat: num(b.t_stat) } : {}),
                    // The t-stat is the evidence for "no measurable
                    // exposure", so it is carried even when the beta is not.
                    tStatWhenUnmeasured: measured ? null : (b ? num(b.t_stat) : null),
                    reason: measured ? null : (b ? 'not_significant' : 'not_estimated'),
                },
            };
            return row;
        });
}

// How the exposure cell must read. One place, so no surface can invent
// its own phrasing for the unmeasured case.
export function exposureLabel(row) {
    if (!row || !row.exposure) return 'not estimated';
    if (row.exposure.measured) return null;          // caller renders the value
    return row.exposure.reason === 'not_estimated'
        ? 'not estimated'
        : 'no measurable exposure';
}

// ── Dispersion (§4) ──────────────────────────────────────────
// A STATE, not a score. Computed only over non-marginal axes. Scores are
// never averaged and disagreement is never resolved: the disagreement is
// the signal.
export function dispersionState(rows, opts) {
    const threshold = (opts && opts.threshold != null) ? opts.threshold : QUIET_SIGMA;
    const included = (rows || []).filter(r => !r.marginal && r.score20d != null);
    const excluded = (rows || []).filter(r => r.marginal).map(r => r.axisKey);

    if (included.length < 2) {
        return {
            state: 'insufficient_axes',
            label: 'insufficient axes',
            included: included.map(r => r.axisKey),
            excluded,
            twoWay: false,
            note: 'fewer than two non-marginal axes carry a 20d score',
        };
    }

    const mags = included.map(r => Math.abs(r.score20d));
    const signs = included.map(r => (r.score20d > 0 ? 1 : r.score20d < 0 ? -1 : 0));
    const anyLoud = mags.some(m => m >= threshold);
    const allQuiet = mags.every(m => m < threshold);
    const sameSign = signs.every(s => s === signs[0]);

    let state, note;
    if (allQuiet) {
        state = 'quiet';
        note = 'every included axis is inside ' + threshold + 'σ';
    } else if (sameSign && anyLoud) {
        state = 'aligned';
        note = 'included axes share a sign and at least one is at or past ' + threshold + 'σ';
    } else {
        state = 'contested';
        note = 'included axes disagree in sign';
    }

    return {
        state,
        label: state,
        included: included.map(r => r.axisKey),
        excluded,
        // With two included axes this is a two-way comparison. It is not a
        // robust consensus and must not be described as one.
        twoWay: included.length === 2,
        note,
        readings: included.map(r => ({ axisKey: r.axisKey, score20d: r.score20d })),
    };
}

// ── Vintage and staleness (§5) ───────────────────────────────
// Three separate dates, all surfaced. `sessions` is the recent trading
// calendar taken from market_prices itself, newest first — a calendar
// comparison would call a Saturday stale.
export function vintage({ seriesClose, scoreDate, estimate, sessions }) {
    const list = (sessions || []).map(String);
    const iSeries = list.indexOf(String(seriesClose));
    const iScore = list.indexOf(String(scoreDate));

    let lagSessions = null;
    if (iSeries >= 0 && iScore >= 0) lagSessions = iScore - iSeries;   // newest first
    const unknown = scoreDate == null || seriesClose == null || lagSessions == null;

    return {
        seriesClose: seriesClose || null,
        scoreDate: scoreDate || null,
        betaWindowEnd: estimate ? estimate.windowEnd : null,
        betaWindowStart: estimate ? estimate.windowStart : null,
        nObs: estimate ? estimate.nObs : null,
        estimatedAt: estimate ? estimate.estimatedAt : null,
        lagSessions,
        // Unknown counts as stale. The score tables had no writer at all
        // until C4; this panel has to be able to say it is looking at old
        // numbers rather than presenting them as current.
        stale: unknown || lagSessions > STALE_MAX_LAG_SESSIONS,
        staleReason: unknown
            ? 'score date could not be placed on the trading calendar'
            : (lagSessions > STALE_MAX_LAG_SESSIONS
                ? 'scores trail the series close by ' + lagSessions + ' sessions'
                : null),
    };
}

// ── The read block (§6) — built, shipped off ─────────────────
// Per-axis prose pairing market state against book exposure. Never
// interprets a beta it was not given.
export function axisRead(rows, dispersion) {
    const lines = (rows || []).map(r => {
        const dir = r.score20d == null ? null : (r.score20d > 0 ? 'positive' : 'negative');
        const loud = r.score20d != null && Math.abs(r.score20d) >= QUIET_SIGMA;
        const qualifier = r.marginal ? ' (marginal axis)' : '';

        if (!r.exposure.measured) {
            // Never receives an interpretation of its beta.
            if (!loud) {
                return r.axisKey + qualifier + ': quiet, and no measurable exposure to the axis — nothing to read there.';
            }
            return r.axisKey + qualifier + ': moving ' + dir + ' at ' + fmt(r.score20d)
                + ' over 20 sessions, with no measurable exposure to the axis. A positioning observation, not a book effect.';
        }

        const withBook = (r.exposure.beta > 0) === (r.score20d > 0);
        return r.axisKey + qualifier + ': ' + dir + ' at ' + fmt(r.score20d)
            + ' over 20 sessions against a book beta of ' + fmt(r.exposure.beta, 6)
            + (withBook ? ' — the book leans with the move.' : ' — the book leans against the move.');
    });

    if (dispersion && dispersion.state === 'contested') {
        lines.push('Axes disagree in sign, so the cross-axis state is not established.');
    }
    if (dispersion && dispersion.twoWay) {
        lines.push('Two axes included: a two-way comparison, not a consensus.');
    }

    return {
        lines,
        derivation: 'derived from axis scores × book factor betas · no regime label asserted',
    };
}

function fmt(v, dp) {
    if (v == null) return '—';
    return Number(v).toFixed(dp == null ? 2 : dp);
}
