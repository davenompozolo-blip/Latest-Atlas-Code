// ============================================================
// ATLAS — the verdict card (memo v2 close-out §5.3)
// ------------------------------------------------------------
// One card per open position, and in it the TIER SLOT: the comparison that
// actually applies to this position, in the same place on every card.
//
//   Tier 1 (19 of 57)  own return against the median of its correlated peers
//   Tier 2 (37 of 57)  own return against the rest of the book at prevailing
//                      weights
//   neither (1)        the reason it could not be measured
//
// ## Why one slot instead of a cluster panel on every card
//
// Only ~19 of 57 positions are cluster-eligible. A peer ranking on every card
// leaves two-thirds carrying a conspicuous empty region where the densest
// element should be, and an empty region reads as a broken feature rather than
// an honest absence. So the slot holds whichever tier applies and NAMES it.
// The full peer rankings live one level up, on the CLUSTERS tab.
//
// ## The basis trap, twice
//
// Each tier's own-return is derived against ITS OWN reference:
//
//   cluster   own = cf_median_return_pct   + selection_effect_pct
//   book      own = cf_book_return_pct     + excess_vs_book_pct
//
// Never from `position_mwr_pct`. That column is ANNUALISED — GILD is +87.67%
// over 242 days held and +158.43% annualised, AMD +180.96% and +721.94% — and
// putting it beside a period-basis comparator invents the difference between
// the two. Both derivations are exact: the effect column is DEFINED as own
// less reference, so adding the reference back recovers own to the last digit.
//
// The two tiers' numbers are also not interchangeable with each other. A
// cluster edge is measured against substitutes; a book edge against the rest
// of the portfolio. The card says which every time, and `edge` never carries a
// value whose basis is not printed beside it.
// ============================================================

const PCT = 100;

function num(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
const toPct = (v) => (num(v) == null ? null : num(v) * PCT);

/** Human form of a verdict_status that is not 'measured'. */
export const STATUS_TEXT = {
    stale_mark:        'price too old to mark',
    ledger_mismatch:   'ledger disagrees with broker',
    incomplete_ledger: 'ledger predates the position',
    basis_mismatch:    'ledger and tape price different shares',
    one_sided:         'no comparison available',
};

/**
 * The tier slot for one verdict row.
 *
 * `basis` is read from `peer_basis`, never inferred from which columns happen
 * to be populated: a Tier 2 row can carry a cluster_id, and five do.
 */
export function tierSlot(row) {
    if (!row) return { basis: 'none', reason: 'no verdict row' };

    const status = row.verdict_status || null;
    if (status && status !== 'measured') {
        return {
            basis: 'none',
            reason: STATUS_TEXT[status] || status.replace(/_/g, ' '),
            status: status,
            staleDays: num(row.price_days_old),
        };
    }

    if (row.peer_basis === 'cluster') {
        const median = toPct(row.cf_median_return_pct);
        const edge   = toPct(row.selection_effect_pct);
        const size   = num(row.cluster_size);
        return {
            basis: 'cluster',
            label: 'vs cluster median',
            // n peers at rho >= 0.75 that actually produced a counterfactual.
            detail: size == null ? null : size + ' peers at ρ ≥ 0.75',
            own: (median == null || edge == null) ? null : median + edge,
            reference: median,
            referenceLabel: 'peer median',
            edge: edge,
            rank: num(row.rank_in_cluster),
            field: size == null ? null : size + 1,
            dispersion: num(row.cluster_dispersion),
            avgRho: num(row.avg_intra_rho),
            // Display only. Never a sort key, never on the bar: the best peer
            // is a 3x leveraged fund for five of the nineteen, so its scale is
            // a fact about leverage rather than about this position.
            bestSymbol: row.cf_best_symbol || null,
            regret: toPct(row.regret_vs_best_pct),
        };
    }

    if (row.peer_basis === 'book') {
        const bookRet = toPct(row.cf_book_return_pct);
        const edge    = toPct(row.excess_vs_book_pct);
        const rho     = num(row.best_correlate_rho);
        return {
            basis: 'book',
            label: 'vs rest of book',
            // Why this position is on Tier 2 at all. Stating it turns "no
            // cluster shown" from an omission into a measurement.
            detail: rho == null
                ? 'no correlate measured'
                : 'closest held name ' + (row.best_correlate_symbol || '—') + ' at ρ ' + rho.toFixed(2),
            own: (bookRet == null || edge == null) ? null : bookRet + edge,
            reference: bookRet,
            referenceLabel: 'book without it',
            edge: edge,
            bestCorrelate: row.best_correlate_symbol || null,
            bestRho: rho,
        };
    }

    return {
        basis: 'none',
        reason: 'no comparison available',
        status: status,
    };
}

/** One card, normalised. */
export function toCard(row) {
    return {
        symbol:      row.symbol,
        state:       row.position_state || null,
        side:        row.side || null,
        status:      row.verdict_status || null,
        statusReason: row.status_reason || null,
        label:       row.verdict_label || null,
        reasonCode:  row.suggested_reason_code || null,
        daysHeld:    num(row.days_held),
        capital:     num(row.capital_deployed_usd),
        staleDays:   num(row.evidence_staleness_days),
        // §5.2 lands here next; NULL on every row until the Bench feed is wired.
        thesisState: row.thesis_state || null,
        thesisAsOf:  row.thesis_state_as_of ? String(row.thesis_state_as_of).slice(0, 10) : null,
        slot:        tierSlot(row),
    };
}

/**
 * Shared bar scale across every card.
 *
 * One scale, not one per tier: bar length then means the same number of
 * percentage points wherever it appears, and a reader comparing two cards is
 * comparing like with like. The alternative — scaling each tier to its own
 * range — makes equal-length bars mean different magnitudes, which is worse
 * than a squashed bar.
 *
 * Anchored on the 90th percentile of |edge| rather than the maximum, because
 * AMD's +144.83pp is 8x the next largest and would flatten every other card to
 * a sliver. Bars past the anchor are clipped and marked; the exact figure is
 * printed on every card regardless, so the clip costs nothing but the visual.
 */
export function barScale(cards) {
    const mags = (cards || [])
        .map((c) => (c.slot && c.slot.edge != null ? Math.abs(c.slot.edge) : null))
        .filter((v) => v != null)
        .sort((a, b) => a - b);
    if (!mags.length) return 1;
    const idx = Math.min(mags.length - 1, Math.floor(mags.length * 0.9));
    return Math.max(mags[idx], 1);
}

/** Fraction of the track a bar fills, and whether it was clipped. */
export function barGeometry(edge, scale) {
    if (edge == null || !scale) return { frac: 0, clipped: false };
    const raw = Math.abs(edge) / scale;
    return { frac: Math.min(raw, 1), clipped: raw > 1 };
}

/** Newest night, one card per position, ordered by the tier's own score. */
export function buildVerdictCards(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
        return { asOf: null, logicVersion: null, cards: [], counts: { cluster: 0, book: 0, none: 0 }, scale: 1 };
    }

    const cards = list.map(toCard).sort(function (a, b) {
        const ae = a.slot.edge, be = b.slot.edge;
        if (ae == null && be == null) return a.symbol < b.symbol ? -1 : 1;
        if (ae == null) return 1;
        if (be == null) return -1;
        return be - ae;
    });

    const counts = { cluster: 0, book: 0, none: 0 };
    cards.forEach(function (c) { counts[c.slot.basis] = (counts[c.slot.basis] || 0) + 1; });

    return {
        asOf: list[0].as_of ? String(list[0].as_of).slice(0, 10) : null,
        logicVersion: list[0].logic_version || null,
        cards: cards,
        counts: counts,
        scale: barScale(cards),
    };
}

/** Newest night of verdict rows, everything the card needs. */
export async function loadVerdictRows(sb) {
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
            .select('as_of, logic_version, symbol, position_state, side, verdict_status, ' +
                    'status_reason, price_days_old, days_held, capital_deployed_usd, ' +
                    'peer_basis, cluster_size, avg_intra_rho, cluster_dispersion, ' +
                    'rank_in_cluster, cf_median_return_pct, cf_best_symbol, ' +
                    'selection_effect_pct, regret_vs_best_pct, cf_book_return_pct, ' +
                    'excess_vs_book_pct, best_correlate_symbol, best_correlate_rho, ' +
                    'verdict_label, suggested_reason_code, evidence_staleness_days, ' +
                    'thesis_state, thesis_state_as_of')
            .eq('as_of', latest[0].as_of);
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('[ATLAS] position_verdicts read failed:', e.message);
        return [];
    }
}
