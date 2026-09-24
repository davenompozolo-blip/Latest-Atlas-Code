// ============================================================
// Equity Research · EQ-7 — the competitive-positioning view shape.
//
// PURE. No transport, no React: a loader hands its `vw_company_peer_cohort`
// rows here, the split `institutionView.js`, `clusterView.js` and
// `segmentView.js` already use.
//
// THE COHORT IS NAMED FOR THE VENDOR TAXONOMY IT COMES FROM, NEVER "industry"
// OR "sector". EQ-7 measured why: `equity_screener_universe.industry` is a
// COPY of `sector` (896 rows identical, 0 rows where both are present and
// differ), and the 46 buckets it does carry are Finnhub's single-level
// `finnhubIndustry` taxonomy, which mixes GICS *sector* names (Technology,
// Energy, Utilities) with GICS *industry* names (Semiconductors, Banking,
// Biotechnology). It is neither level cleanly, so a bare "Industry" heading
// invites a comparison the data does not support -- the `fwd_pe` rule in a
// cohort label. `cohort_basis` travels on every row and is rendered.
//
// POLARITY COMES FROM THE ROW. `higher_is_better` is the database's
// classification and is never re-derived here: a second copy in JS is how two
// surfaces start disagreeing about whether a low EV/EBITDA is good news.
//
// A METRIC IS ABSENT WHEN IT CANNOT BE READ, not null and not zero, so a
// renderer cannot print a figure nobody measured. Coverage is genuinely uneven
// and that is a measured property, not noise: `ev_ebitda` is 0 of 63 on
// Banking (a bank has no EV), Biotechnology carries `forward_pe` on 18 of 44
// (a pre-revenue biotech has no meaningful forward multiple), JPM carries
// `roic_pct` alone and TGT three of twenty.
// ============================================================

export const POS_LOADED     = 'loaded';
export const POS_NOT_LOADED = 'not_loaded';
export const POS_NO_COHORT  = 'no_cohort';
export const POS_FAILED     = 'failed';

/**
 * The fewest peers a percentile may be published on.
 *
 * `vw_company_peer_cohort` deliberately bakes in NO floor -- EQ-2's rule, that
 * the right one is a display decision per metric -- and publishes `peer_count`
 * so the surface can decide. This is that decision, in ONE place.
 *
 * 5, not 2: a percentile over one peer can only be 0 or 1, and over four it
 * moves in steps of 25 points, which reads as precision it does not have. The
 * MEDIAN is still shown below this, because a median of three is a weak
 * statistic rather than a degenerate one; only the percentile is withheld.
 */
export const MIN_PEERS_FOR_PERCENTILE = 5;

/** A cohort smaller than this is not a peer group. EQ-7 measured 30 of 46
 *  buckets at 8+ members, covering 854 of 913 symbols. */
export const MIN_COHORT_MEMBERS = 8;

// `Number(null)` is 0, and so are `Number('')`, `Number(false)` and
// `Number([])` -- so a finiteness check ALONE reads an absent value as a
// measured zero, which is the whole thing this module exists to prevent.
// `institutionView.js` guards `v != null && v !== ''`; this is tighter still,
// admitting only a number or a numeric string. Found by the test, not by
// reading: the first draft published an unmeasured metric as 0.
function fin(v) {
    if (typeof v !== 'number' && typeof v !== 'string') return null;
    if (v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function int(v) {
    return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}

/**
 * One metric's shape. Keys are assigned only when there is something to
 * assign, so `'percentile' in m` is a real question.
 */
function metricShape(row) {
    const value = fin(row && row.value);
    if (value === null) return null;          // nothing measured for the subject

    const out = { metric: String(row.metric), value: value };

    // The database's polarity, read and not re-derived. Absent rather than
    // defaulted: a metric whose direction nobody recorded must not be drawn
    // with a good/bad tone.
    if (typeof row.higher_is_better === 'boolean') out.higherIsBetter = row.higher_is_better;

    const peers = int(row.peer_count);
    if (peers !== null) out.peerCount = peers;

    const median = fin(row.peer_median);
    if (median !== null) out.peerMedian = median;

    const vs = fin(row.vs_peer_median);
    if (vs !== null) out.vsPeerMedian = vs;

    // THE PERCENTILE IS GATED ON THE PEER COUNT, and says why when withheld.
    const pct = fin(row.peer_percentile);
    if (pct !== null && peers !== null && peers >= MIN_PEERS_FOR_PERCENTILE) {
        out.percentile = pct;
    } else if (pct !== null && peers !== null) {
        out.percentileWithheld = 'too_few_peers';
    }

    if (row.peer_withheld) out.peerWithheld = String(row.peer_withheld);
    return out;
}

/**
 * @param {?Array} rows   `vw_company_peer_cohort` rows for ONE symbol
 * @param {string} state  POS_LOADED / POS_NOT_LOADED / POS_FAILED
 * @returns {object}      the render shape
 */
export function buildPositioningView(rows, state) {
    if (state === POS_FAILED)     return { state: POS_FAILED };
    if (state === POS_NOT_LOADED) return { state: POS_NOT_LOADED };

    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return { state: POS_NOT_LOADED };

    const first = list[0];
    const out = {
        state: POS_LOADED,
        symbol: String(first.symbol),
        // Named for the taxonomy, always. No fallback to a prettier word.
        cohortKey: first.cohort_key ? String(first.cohort_key) : null,
        cohortBasis: first.cohort_basis ? String(first.cohort_basis) : null,
        metrics: [],
    };
    if (first.company_name) out.companyName = String(first.company_name);
    if (first.market_cap_bucket) out.marketCapBucket = String(first.market_cap_bucket);

    const cap = fin(first.market_cap_usd);
    if (cap !== null) out.marketCapUsd = cap;

    // The cohort's own size, taken as the widest peer count on offer: every
    // metric counts only members with a MEASURED value, so no single metric
    // is the cohort size.
    let widest = null;
    for (const r of list) {
        const p = int(r.peer_count);
        if (p !== null && (widest === null || p > widest)) widest = p;
    }
    if (widest !== null) out.cohortPeers = widest;

    for (const r of list) {
        const m = metricShape(r);
        if (m) out.metrics.push(m);
    }

    // STATE ITS DENOMINATOR. `offered` is what the cohort layer had a row for;
    // `measured` is what this company could actually be measured on. JPM
    // carries one of twenty, and a surface that does not say so implies the
    // other nineteen are unremarkable rather than absent.
    out.measuredCount = out.metrics.length;
    out.offeredCount  = list.length;
    if (out.offeredCount > out.measuredCount) {
        out.withheldMetrics = list
            .filter(r => fin(r.value) === null)
            .map(r => String(r.metric));
    }

    // A cohort too thin to be a peer group is its own answer, not a loaded
    // one: the comparison is what the tab is for.
    if (widest !== null && widest + 1 < MIN_COHORT_MEMBERS) {
        out.state = POS_NO_COHORT;
        out.cohortTooSmall = true;
    }
    if (!out.measuredCount) {
        out.state = POS_NO_COHORT;
        out.nothingMeasured = true;
    }

    return out;
}

export default buildPositioningView;
