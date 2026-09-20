// ============================================================
// ATLAS — cluster identity (H-2)
// ------------------------------------------------------------
// A risk cluster used to render as `RISK CLUSTER 196` — an integer from an
// average-linkage partition, with nothing on screen saying what was in it or
// what moves it. This module supplies the two missing halves:
//
//   COMPOSITION — what the bucket is, from the curated `position_themes`
//   taxonomy where it exists and the vendor sector only where it does not.
//   The basis travels with the label because they are different claims:
//   `position_themes` is hand-kept and `assets.sector` reads "Other" for a
//   large part of this universe. Sector is not theme, and this codebase has
//   already had to correct one surface that showed the first under a heading
//   naming the second.
//
//   EXPOSURE — which regime axis the cluster actually loads on, from the
//   nightly multivariate fit in `cluster_identity`. That is the bridge the
//   regime layer needs: a signal on `dollar` is only actionable if you can
//   say which of your buckets moves with the dollar.
//
// ## Three rules this module enforces by construction
//
// 1. AN AXIS THAT DID NOT CLEAR |t| > 2 IS ABSENT, NOT SMALL. `axisBeta` and
//    `axisT` are not present on the shape at all when no axis was named — a
//    renderer cannot print a number it was never handed. Printing 0.0005
//    beside a cluster asserts a small exposure, which is a different claim
//    from no measurable exposure and is the one the data does not support.
//    (A2's rule, same construction as `nexusReturnBasis.js`.)
//
// 2. THE SIGN TRAVELS WITH THE AXIS. An axis key alone says which axis a
//    cluster belongs to and not which way it pushes it, so a reader shown a
//    bare `concentration` tag can conclude the exact reverse of the loading.
//    That is the defect F-5 caught on the tape; here the sentence is built
//    from `positive_means` and the sign together, never from the key.
//
// 3. `marginal` IS NOT A GATE. It means the component barely cleared the
//    Marchenko-Pastur noise edge — a property of the PCA, not of this
//    cluster. `dollar` is marginal AND the book's most significant exposure.
//    It is carried as provenance and never consulted when deciding whether
//    to publish.
// ============================================================

/** |t| above which a coefficient is reported. Bound to the DB's own rule. */
export const T_SIGNIFICANT = 2;

/** What a cluster with no axis clearing the bar says instead of a number. */
export const NO_AXIS_TEXT = 'No measurable axis exposure';

/** What a cluster the fit could not reach says. */
export const FIT_TEXT = {
    measured:              null,
    insufficient_history:  'Too little shared history to fit',
    singular:              'Regressors collinear — no identity to publish',
};

function num(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * One row of `vw_cluster_identity` as a shape a panel can render.
 *
 * `axisBeta` / `axisT` / `axisSign` are OMITTED when `primary_axis` is null.
 * Not null — absent. See rule 1 in the header.
 */
export function shapeIdentity(row) {
    if (!row) return null;
    const axis = row.primary_axis || null;
    const out = {
        clusterId:    num(row.cluster_id),
        asOf:         row.as_of_date ? String(row.as_of_date).slice(0, 10) : null,
        logicVersion: row.logic_version || null,
        clusterSize:  num(row.cluster_size),
        heldCount:    num(row.held_count) || 0,
        heldSymbols:  Array.isArray(row.held_symbols) ? row.held_symbols.slice() : [],
        avgIntraRho:  num(row.avg_intra_rho),

        label:            row.composition_label || null,
        labelBasis:       row.composition_basis || null,
        labelCoverage:    num(row.composition_coverage),

        fitStatus:    row.fit_status || null,
        nObs:         num(row.n_obs),
        rSquared:     num(row.r_squared),
        betaMarket:   num(row.beta_market),
        tMarket:      num(row.t_market),
        // The DB binds this flag to its own statistic; it is read, not
        // re-derived, so a surface cannot be shown a flag that disagrees
        // with the number beside it.
        marketSignificant: row.market_significant === true,

        axis: axis,
        // Provenance only — never a gate. Rule 3.
        axisMarginal: row.primary_axis_marginal === true,
        axisLabel:        axis ? (row.primary_axis_label || null) : null,
        axisPositiveMeans: axis ? (row.primary_axis_positive_means || null) : null,
    };
    if (axis) {
        out.axisSign = num(row.primary_axis_sign);
        out.axisBeta = num(row.primary_axis_beta);
        out.axisT    = num(row.primary_axis_t);
    }
    return out;
}

/**
 * The cluster's display name.
 *
 * Falls back to the id when the composition could not be established —
 * never to a sector string dressed as a theme, and never to a neighbouring
 * cluster's label.
 */
export function identityTitle(s) {
    if (!s) return null;
    if (s.label && s.labelBasis && s.labelBasis !== 'unclassified') return s.label;
    return s.clusterId == null ? null : 'Cluster ' + s.clusterId;
}

/**
 * Where the name came from, and how much of the bucket it speaks for.
 *
 * Published rather than hidden: a 34-name cluster labelled from the 8 members
 * that carry a curated theme is a real label with a real limit, and the
 * reader is entitled to both halves.
 */
export function compositionNote(s) {
    if (!s || !s.label || s.labelBasis === 'unclassified' || !s.labelBasis) return null;
    const src = s.labelBasis === 'curated_theme' ? 'curated theme' : 'vendor sector';
    if (s.labelCoverage == null) return 'from ' + src;
    return 'from ' + src + ', ' + Math.round(s.labelCoverage * 100) + '% of members';
}

/**
 * The axis sentence, built from `positive_means` and the SIGN together.
 *
 * "Rises with" / "Falls with" rather than a bare tag, because the tag alone
 * asserts membership and says nothing about direction. Rule 2.
 */
export function axisSentence(s) {
    if (!s) return null;
    if (!s.axis) return NO_AXIS_TEXT;
    if (!s.axisPositiveMeans) return null;
    const dir = s.axisSign != null && s.axisSign < 0 ? 'Falls with ' : 'Rises with ';
    return dir + s.axisPositiveMeans;
}

/** The compact header token: axis plus the direction, never the axis alone. */
export function axisTag(s) {
    if (!s || !s.axis) return null;
    if (s.axisSign == null) return s.axis.toUpperCase();
    return s.axis.toUpperCase() + ' ' + (s.axisSign < 0 ? '−' : '+');
}

/**
 * The market sentence, published ONLY when the market beta cleared the bar.
 *
 * Market is a CONTROL in this regression, not a finding — without it every
 * cluster loads on everything, because the market factor dominates a daily
 * equity return. It is shown so a reader can see how much of the cluster's
 * movement the axis is adding to, and withheld when it is not measurable.
 */
export function marketSentence(s) {
    if (!s || !s.marketSignificant || s.betaMarket == null) return null;
    return 'Beta to SPY ' + s.betaMarket.toFixed(2);
}

/** Why a cluster carries no fit. Null when it does. */
export function fitNote(s) {
    if (!s || !s.fitStatus) return null;
    return FIT_TEXT[s.fitStatus] || null;
}

/**
 * Index a list of shaped rows by cluster id, for a panel that already has
 * its own grouping and only needs the identity attached.
 */
export function byClusterId(shapes) {
    const out = new Map();
    (shapes || []).forEach(function (s) {
        if (s && s.clusterId != null) out.set(s.clusterId, s);
    });
    return out;
}

const PAGE = 1000;
const MAX_PAGES = 16;

/**
 * Read `vw_cluster_identity`.
 *
 * PAGED, though the universe is 206 clusters today. `limit` is a request and
 * so is no limit — PostgREST caps at 1,000 rows whatever is asked, and this
 * codebase has now found that in five separate layers. The universe grows.
 */
export async function loadClusterIdentity(sb) {
    if (!sb) return [];
    const out = [];
    try {
        for (let page = 0, from = 0; ; page++, from += PAGE) {
            if (page >= MAX_PAGES) {
                console.error('[ATLAS] cluster_identity paging hit its page cap at '
                    + out.length + ' rows; the identity set is incomplete.');
                break;
            }
            const { data, error } = await sb
                .from('vw_cluster_identity')
                .select('as_of_date, logic_version, cluster_id, cluster_size, held_count, '
                    + 'avg_intra_rho, composition_label, composition_basis, '
                    + 'composition_coverage, fit_status, n_obs, r_squared, beta_market, '
                    + 't_market, market_significant, primary_axis, primary_axis_sign, '
                    + 'primary_axis_t, primary_axis_beta, primary_axis_label, '
                    + 'primary_axis_positive_means, primary_axis_marginal, held_symbols')
                .order('cluster_id', { ascending: true })
                .range(from, from + PAGE - 1);
            if (error) throw error;
            const batch = data || [];
            out.push.apply(out, batch);
            if (batch.length < PAGE) break;
        }
        return out.map(shapeIdentity).filter(Boolean);
    } catch (e) {
        // Never let a transport failure render as a statement about the data.
        console.error('[ATLAS] vw_cluster_identity read failed:', e.message);
        return [];
    }
}
