// ============================================================
// ATLAS — the cluster view (memo v2 close-out §5.3)
// ------------------------------------------------------------
// "One level up": the cluster-eligible positions grouped by cluster with
// their rankings, and — beside them, not on another screen — the count of
// positions with no close comparable.
//
// ## Why the ranking is here and not on the card
//
// The measurement decided it. Only ~19 of 57 positions are cluster-eligible,
// so a peer ranking on every position card would leave two-thirds of cards
// with a conspicuous hole where the densest element should be. An empty
// region reads as a broken feature, not as an honest absence.
//
// ## Why the complement belongs on the same screen
//
// 26 positions have no correlate above 0.65. That is not a data gap to be
// tucked away — it is a property of the book, and it is the complement of
// the clusters shown above it. Reading "19 positions rank against peers"
// without "26 have no peer to rank against" would overstate how much of the
// book this tier actually covers.
//
// ## Two different cluster objects, and only one of them groups
//
// `cluster_id` is the PARTITION (universe_clusters, one bucket per name).
// `cluster_size` is the position's own NEIGHBOURHOOD — every name at rho >=
// 0.75, overlapping and per-position. They are deliberately not merged.
//
// So within one displayed group, each row carries its own peer-set size and
// its own rank denominator: AMD is #3 of 13 while ASML in the same group is
// #5 of 18. The group header must never present a single "cluster size", and
// this module keeps the two apart by construction — `heldCount` on the group,
// `field` on the row.
// ============================================================

/** Rank/median/effect are all on the PERIOD basis. Percent, not fraction. */
const PCT = 100;

function num(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * The position's own return on the basis the cluster median is computed on.
 *
 * Derived as median + selection effect rather than read from
 * `position_mwr_pct`, which is the ANNUALISED figure and would be a
 * mixed-basis comparison: AMD is +180.96% over its holding period and
 * +721.94% annualised. Putting the second beside a period-basis cluster
 * median would invent an outperformance of several hundred points.
 *
 * The arithmetic is exact, not an approximation — `selection_effect_pct` is
 * defined as own-period-return less the median, so adding the median back
 * recovers the original to the last digit. Verified against
 * `mv_position_tier1.own_return` for all 19 rows.
 */
export function ownPeriodReturn(row) {
    const med = num(row.cf_median_return_pct);
    const sel = num(row.selection_effect_pct);
    if (med == null || sel == null) return null;
    return (med + sel) * PCT;
}

/** One position, normalised for display. */
function toMember(row) {
    const size = num(row.cluster_size);
    const rank = num(row.rank_in_cluster);
    return {
        symbol:        row.symbol,
        // The tier that actually graded this position. Read, never inferred
        // from the presence of `cluster_id`: a Tier 2 row can carry one (JPM,
        // AVGO, KMI, BKNG and XLRE all do) because the partition assigns every
        // name a bucket whether or not its neighbourhood was big enough to
        // rank against. Inferring the basis from the id labels those five
        // "cluster" when the rest of the book is what they were measured on.
        peerBasis:     row.peer_basis || null,
        clusterId:     num(row.cluster_id),
        rank:          rank,
        // The position sits among its peers, so the field is peers + itself.
        field:         size == null ? null : size + 1,
        ownPct:        ownPeriodReturn(row),
        medianPct:     num(row.cf_median_return_pct) == null ? null : num(row.cf_median_return_pct) * PCT,
        // THE score on this tier. Sorting key. Percentage points.
        selPp:         num(row.selection_effect_pct) == null ? null : num(row.selection_effect_pct) * PCT,
        avgRho:        num(row.avg_intra_rho),
        dispersion:    num(row.cluster_dispersion),
        // Display only, NEVER a sort key — see sortMembers below.
        bestSymbol:    row.cf_best_symbol || null,
        regretPp:      num(row.regret_vs_best_pct) == null ? null : num(row.regret_vs_best_pct) * PCT,
        label:         row.verdict_label || null,
        reasonCode:    row.suggested_reason_code || null,
        bestCorrelate: row.best_correlate_symbol || null,
        bestRho:       num(row.best_correlate_rho),
        status:        row.verdict_status || null,
    };
}

/**
 * Within a cluster, order by the score — own return against the peer median.
 *
 * Explicitly NOT by `regret_vs_best_pct`. Regret is measured against the
 * single best peer, which on any tape that rose is whichever member carries
 * the most leverage: `cf_best_symbol` is SOXL, a 3x semiconductor fund, for
 * five of the nineteen. Sorting on it would rank the book by how levered its
 * comparables happen to be.
 */
export function sortMembers(members) {
    return members.slice().sort(function (a, b) {
        if (a.selPp == null && b.selPp == null) return a.symbol < b.symbol ? -1 : 1;
        if (a.selPp == null) return 1;
        if (b.selPp == null) return -1;
        return b.selPp - a.selPp;
    });
}

/** Does this row have any close comparable in the open book? (§2.5) */
export function hasCloseComparable(row) {
    const rho = num(row.best_correlate_rho);
    return rho != null && rho >= 0.65;
}

/**
 * The whole surface, from one night's verdict rows.
 *
 * Reads the verdict HISTORY rather than the live matview: the history is what
 * the module publishes, it is stamped with the night it describes, and it is
 * the only source carrying `verdict_label` alongside the ranking inputs.
 */
export function buildClusterView(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
        return {
            asOf: null, logicVersion: null, clusters: [], eligible: [],
            noComparable: [], unmeasurable: [], eligibleCount: 0,
            noComparableCount: 0, totalCount: 0, ranksRecorded: false,
        };
    }

    const asOf = list[0].as_of ? String(list[0].as_of).slice(0, 10) : null;

    const eligibleRows = list.filter(function (r) { return r.peer_basis === 'cluster'; });
    const eligible = eligibleRows.map(toMember);

    // Group by the PARTITION id. A group of one is not a mistake: it says the
    // book holds a single name out of that risk bucket, which is worth seeing.
    const byCluster = {};
    eligible.forEach(function (m) {
        const key = m.clusterId == null ? 'unassigned' : String(m.clusterId);
        if (!byCluster[key]) byCluster[key] = [];
        byCluster[key].push(m);
    });

    const clusters = Object.keys(byCluster).map(function (key) {
        const members = sortMembers(byCluster[key]);
        return {
            clusterId: key === 'unassigned' ? null : Number(key),
            members: members,
            // Held names in this bucket — NOT a peer-set size. Each member
            // carries its own `field`, and they differ within a group.
            heldCount: members.length,
        };
    }).sort(function (a, b) {
        if (b.heldCount !== a.heldCount) return b.heldCount - a.heldCount;
        return (a.clusterId || 0) - (b.clusterId || 0);
    });

    // The complement. Scoped to the OPEN BOOK on purpose: §2.5 asks how
    // differentiated the book is, and a name you do not hold is not an
    // alternative you are carrying. (Tier 1's peer set is scoped to the whole
    // matrix instead — a substitute you could have bought counts whether or
    // not you owned it. Opposite scoping, deliberately.)
    //
    // A position can therefore be cluster-eligible AND have no close
    // comparable: ADBE ranks against 7 peers from the matrix while its best
    // correlate inside the book is 0.447. Both statements are true.
    const noComparable = list.filter(function (r) { return !hasCloseComparable(r); }).map(toMember);

    // Separated from the above: "no peer above 0.65" and "we could not measure
    // this position at all" are different facts and must not be pooled.
    const unmeasurable = list.filter(function (r) {
        return r.verdict_status && r.verdict_status !== 'measured';
    }).map(toMember);

    return {
        asOf: asOf,
        logicVersion: list[0].logic_version || null,
        clusters: clusters,
        eligible: eligible,
        noComparable: noComparable,
        unmeasurable: unmeasurable,
        eligibleCount: eligible.length,
        noComparableCount: noComparable.length,
        totalCount: list.length,
        // Rankings were not written before 2026-08-31. A night without them
        // shows the reason, never a fabricated order.
        ranksRecorded: eligible.some(function (m) { return m.rank != null; }),
    };
}

/** Newest night of verdicts. Ordered DESC then filtered to that as_of. */
export async function loadClusterVerdicts(sb) {
    if (!sb) return [];
    try {
        const { data: latest, error: e1 } = await sb
            .from('position_verdicts')
            .select('as_of')
            .order('as_of', { ascending: false })
            .limit(1);
        if (e1) throw e1;
        if (!latest || !latest.length) return [];

        const { data, error } = await sb
            .from('position_verdicts')
            .select('as_of, logic_version, symbol, peer_basis, verdict_status, verdict_label, ' +
                    'suggested_reason_code, cluster_id, cluster_size, avg_intra_rho, ' +
                    'cluster_dispersion, rank_in_cluster, cf_median_return_pct, ' +
                    'selection_effect_pct, cf_best_symbol, regret_vs_best_pct, ' +
                    'best_correlate_symbol, best_correlate_rho')
            .eq('as_of', latest[0].as_of);
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('[ATLAS] position_verdicts read failed:', e.message);
        return [];
    }
}
