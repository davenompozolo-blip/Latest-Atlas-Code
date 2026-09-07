// ============================================================
// ATLAS — Performance level 3, the counters (three-level spec §4, handoff §3)
// ------------------------------------------------------------
// The tiles inside one segment. Front face is what already ships on the flat
// VERDICTS grid; the back face is the detail that used to have nowhere to go.
//
// ## Two gates, and they disagree on purpose
//
// `cluster_id` decides which SEGMENT a position is in. `cluster_eligible`
// decides which COUNTERFACTUAL its card is measured against. They are not the
// same question — a pair at rho 0.8 is plainly one bet, but a median over two
// names is noise — so a segment can be a cluster while a card inside it reads
// TIER 2 · REST OF BOOK.
//
// Cluster 199 is exactly that case today: 8 members, 7 cluster-eligible, and
// MRVL on Tier 2 with a cluster_size of 3. That will look like a bug to anyone
// who assumes one gate governs both. It is not. `tierSlot` reads `peer_basis`
// and never infers the tier from which columns happen to be populated.
//
// ## The header sentence is computed, not copied
//
// The mockup reads "All four are leaders and three rank top-three in their
// cluster." The real cluster 199 has eight members ranked #1, #1, #2, #3, #9,
// #9, #14 and one unranked. A sentence that ships as a string is wrong the
// first day the book moves, so the reading is templated from counts.
// ============================================================

import { toCard, tierSlot, STATUS_TEXT } from './verdictCard.js';

function num(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}
const toPct = (v) => (num(v) == null ? null : num(v) * 100);

/** Columns level 3 needs beyond what the flat grid reads. */
const COUNTER_COLUMNS =
    'as_of, logic_version, symbol, position_state, side, verdict_status, ' +
    'status_reason, price_days_old, days_held, capital_deployed_usd, ' +
    'peer_basis, cluster_id, cluster_size, cluster_members, avg_intra_rho, cluster_dispersion, ' +
    'rank_in_cluster, cf_median_return_pct, cf_best_symbol, cf_best_return_pct, ' +
    'cf_basket_return_pct, selection_effect_pct, selection_effect_vol_adj, ' +
    'allocation_effect_pct, regret_vs_best_pct, cf_book_return_pct, ' +
    'excess_vs_book_pct, best_correlate_symbol, best_correlate_rho, ' +
    'position_mwr_pct, cluster_eligible, verdict_label, suggested_reason_code, ' +
    'evidence_staleness_days, thesis_state, thesis_state_as_of, conviction_at_entry';

export async function loadCounters(sb, asOf, logicVersion) {
    if (!sb) return null;
    try {
        let q = sb.from('position_verdicts').select(COUNTER_COLUMNS);
        if (asOf) q = q.eq('as_of', asOf);
        if (logicVersion) q = q.eq('logic_version', logicVersion);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('[ATLAS] position_verdicts (counters) read failed:', e.message);
        return null;
    }
}

/** Which segment each position is in, both groupings. */
export async function loadMembership(sb) {
    if (!sb) return null;
    try {
        const { data, error } = await sb
            .from('vw_position_segments')
            .select('symbol, grouping, segment_id, segment_kind, segment_label')
            .limit(500);
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('[ATLAS] vw_position_segments read failed:', e.message);
        return null;
    }
}

/**
 * The action a card offers, from the reason code the engine already chose.
 *
 * Never invented here: `switch_to_cluster_leader` is gated on measured
 * volatility upstream precisely so this layer cannot offer "switch to SOXL",
 * and re-deriving the action from the label would route around that gate.
 */
export const ACTION_FOR_REASON = {
    switch_to_cluster_leader:        'Switch to cluster leader ↗',
    cut_underperforming_comparables: 'Cut against comparables ↗',
    trim_concentration:              'Trim on concentration ↗',
};

/**
 * The back face.
 *
 * The three-bar block is suppressed on a single-transaction position: with one
 * fill there is no "on the same dates" to run a peer against that differs from
 * simply holding, so the three bars would be three renderings of one number.
 * `singleTransaction` is supplied by the caller from the trading-effect view's
 * `trade_kind = 'untouched'` — the engine already classifies it structurally
 * rather than by a magnitude threshold.
 */
export function backFace(row, opts) {
    const slot = tierSlot(row);
    const single = !!(opts && opts.singleTransaction);

    const bars = [];
    if (!single && slot.basis === 'cluster') {
        const best = toPct(row.cf_best_return_pct);
        const med  = toPct(row.cf_median_return_pct);
        const own  = slot.own;
        // Spec order: best peer, peer median, what you did — last one heavier.
        if (best != null) bars.push({ key: 'best',   name: 'best peer',    value: best, tone: 'mid' });
        if (med  != null) bars.push({ key: 'median', name: 'peer median',  value: med,  tone: 'dim' });
        if (own  != null) bars.push({ key: 'own',    name: 'what you did', value: own,  tone: 'you' });
    } else if (!single && slot.basis === 'book') {
        const book = slot.reference;
        const own  = slot.own;
        if (book != null) bars.push({ key: 'book', name: 'book without it', value: book, tone: 'dim' });
        if (own  != null) bars.push({ key: 'own',  name: 'what you did',    value: own,  tone: 'you' });
    }

    // Scale the bars against the largest magnitude present, so the three are
    // comparable to each other. Never against a global scale — this block is a
    // within-position comparison and borrowing the grid's scale would flatten it.
    let scale = 0;
    bars.forEach(function (b) { scale = Math.max(scale, Math.abs(b.value)); });
    bars.forEach(function (b) { b.frac = scale > 0 ? Math.abs(b.value) / scale : 0; });

    // A metric slot always renders. When the figure does not exist it says so
    // in words — never blank, never a fabricated 0. `allocation_effect_pct`
    // and `interaction_effect_pct` are columns on `position_verdicts` that
    // `atlas_write_verdicts` has never populated (0 of 59 rows), so the
    // Allocation slot the mockup shows filled is structurally empty today.
    // `short` is what the tile prints; `absentReason` is the full sentence
    // behind it. They differ because "the engine never writes this column" and
    // "this position cannot be measured" are different facts, and printing
    // "not computed" for both would flatten them into one.
    const metric = (key, label, value, unit, absent) => ({
        key: key, label: label, unit: unit,
        value: value,
        available: value != null,
        absentShort: value == null ? ((absent && absent.short) || 'not measured') : null,
        absentReason: value == null
            ? ((absent && absent.reason) || 'not measurable for this position') : null,
    });

    const NOT_COMPUTED = { short: 'not computed',
                           reason: 'not computed — the engine has never written this column' };

    const metrics = [];
    if (slot.basis === 'cluster') {
        metrics.push(metric('selection', 'Selection', toPct(row.selection_effect_pct), 'pp'));
        metrics.push(metric('allocation', 'Allocation', toPct(row.allocation_effect_pct), 'pp', NOT_COMPUTED));
        metrics.push(metric('voladj', 'Vol-adj', toPct(row.selection_effect_vol_adj), 'pp',
                            { short: 'no peer vol', reason: 'no volatility measured for the peer set' }));
    } else if (slot.basis === 'book') {
        metrics.push(metric('excess', 'vs book', toPct(row.excess_vs_book_pct), 'pp'));
        metrics.push(metric('mwr', 'MWR', toPct(row.position_mwr_pct), '%'));
        // Not 'Best ρ': the label is uppercased on the card, and a capital
        // rho renders as a Latin P — the tile read "BEST P".
        metrics.push(metric('rho', 'Best corr', num(row.best_correlate_rho), '',
                            { short: 'not in matrix', reason: 'absent from the correlation matrix' }));
    }

    return {
        symbol:    row.symbol,
        basis:     slot.basis,
        peerNote:  slot.basis === 'cluster' && row.cluster_size != null
                       ? 'ρ≥0.75 · ' + row.cluster_size + ' peers'
                       : (slot.detail || null),
        capital:   num(row.capital_deployed_usd),
        bars:      bars,
        barsSuppressed: single,
        barsSuppressedReason: single
            ? 'bought once and never traded — there is no alternative path to draw'
            : null,
        metrics:   metrics,
        // A thesis nobody has judged IS untested — that is the honest reading
        // of a NULL here, not a substitution, and it is why the state is
        // rendered muted rather than warning-coloured. 19 of 59 carry a state.
        thesis:    row.thesis_state || 'untested',
        thesisRecorded: row.thesis_state != null,
        // `conviction_at_entry` is 0 of 59: the column exists and is never
        // written. The mockup says "not captured" and that is exactly right.
        conviction: row.conviction_at_entry == null ? 'not captured' : String(row.conviction_at_entry),
        convictionRecorded: row.conviction_at_entry != null,
        action:    ACTION_FOR_REASON[row.suggested_reason_code] || null,
        reasonCode: row.suggested_reason_code || null,
    };
}

/**
 * Tiles for one segment, plus the header the segment gets.
 *
 * `rows` is every verdict row; `symbols` is the segment's membership. Rows are
 * matched by symbol and any member with no verdict row is carried as an
 * explicit absence, never dropped — a segment of 8 that renders 7 tiles with
 * nothing saying why is the shrinking-denominator failure again.
 */
export function buildCounters(rows, symbols, opts) {
    const bySymbol = {};
    (rows || []).forEach(function (r) { bySymbol[r.symbol] = r; });

    const single = (opts && opts.singleTransaction) || {};
    const tiles = [];
    const missing = [];

    (symbols || []).forEach(function (sym) {
        const row = bySymbol[sym];
        if (!row) { missing.push(sym); return; }
        const card = toCard(row);
        card.clusterEligible = !!row.cluster_eligible;
        card.back = backFace(row, { singleTransaction: !!single[sym] });
        tiles.push(card);
    });

    // Measured first, by the tier's own score; then the gated ones, which
    // still render with their reason rather than being hidden.
    tiles.sort(function (a, b) {
        const ae = a.slot.edge, be = b.slot.edge;
        if (ae == null && be == null) return a.symbol < b.symbol ? -1 : 1;
        if (ae == null) return 1;
        if (be == null) return -1;
        return be - ae;
    });

    return { tiles: tiles, missing: missing };
}

/**
 * Verdict order for a sub-grouped segment. Fixed, not data-driven: a reader
 * scanning two segments must find the same band in the same place.
 */
export const VERDICT_ORDER = ['leader', 'holding_own', 'lagging', 'cut_candidate', 'unlabelled'];

/**
 * Split a segment's tiles into verdict bands (§6, edge case 1).
 *
 * Unpaired is 17 positions under BY THEME — 27% of the book by weight. As one
 * block it is a wall, which is the thing this whole build exists to remove;
 * banding it by verdict turns "capital with no story" into four short answers.
 *
 * Empty bands are dropped, and `unlabelled` is a band rather than a silent
 * omission: a position the engine could not label still holds weight, and
 * hiding it would shrink the denominator on screen.
 */
export function groupByVerdict(tiles) {
    const bands = {};
    (tiles || []).forEach(function (t) {
        const k = t.label || 'unlabelled';
        (bands[k] = bands[k] || []).push(t);
    });
    return VERDICT_ORDER
        .filter(function (k) { return bands[k] && bands[k].length; })
        .map(function (k) { return { label: k, tiles: bands[k], count: bands[k].length }; });
}

function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
function countWord(n) {
    return ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
            'eight', 'nine', 'ten'][n] || String(n);
}

/**
 * The segment's reading sentence, templated from counts.
 *
 * Deterministic, same rule as §2.5: a sentence that varies between renders
 * cannot be tested. Two clauses at most — what the tiles say, then what that
 * means for the segment.
 */
export function segmentReading(tiles, segment) {
    const measured = tiles.filter(function (t) { return t.slot.basis !== 'none'; });
    if (!measured.length) {
        return {
            text: 'No member of this segment can be measured today.',
            emphasis: null,
        };
    }

    const leaders = measured.filter(function (t) { return t.label === 'leader'; }).length;
    const topThree = measured.filter(function (t) {
        return t.slot.rank != null && t.slot.rank <= 3;
    }).length;
    const cuts = measured.filter(function (t) { return t.label === 'cut_candidate'; }).length;

    let first;
    if (leaders === measured.length) {
        first = 'All ' + countWord(measured.length) + ' are leaders';
    } else if (leaders === 0) {
        first = 'No member leads its comparison';
    } else {
        first = countWord(leaders) + ' of ' + countWord(measured.length) + ' ' +
                plural(leaders, 'is a leader', 'are leaders');
    }
    if (topThree > 0) {
        first += ' and ' + countWord(topThree) + ' ' +
                 plural(topThree, 'ranks', 'rank') + ' top-three in ' +
                 plural(topThree, 'its', 'their') + ' cluster';
    }
    first += '.';

    // The second clause is about the SEGMENT, and it is the counterfactual
    // that decides it — never an average of the tiles above, which sit on
    // different bases.
    let second = null, emphasis = null;
    const ex = segment && segment.excessPp;
    if (ex != null && segment.riskShare != null && segment.weightShare != null) {
        if (ex > 0 && segment.riskShare > segment.weightShare * 1.3) {
            second = 'The segment is working — the question it raises is size, not selection.';
        } else if (ex > 0) {
            second = 'The segment is ahead of the book without it.';
        } else if (segment.riskShare < segment.weightShare * 0.5) {
            second = 'Behind the book without it, on a fraction of its risk — which is what it was bought for.';
        } else {
            second = 'Behind the book without it, and carrying its share of the risk to be there.';
        }
        emphasis = second;
    }
    if (cuts > 0 && !second) {
        second = countWord(cuts) + ' ' + plural(cuts, 'name is', 'names are') +
                 ' a cut candidate against ' + plural(cuts, 'its', 'their') + ' comparison.';
        emphasis = second;
    }

    return { text: second ? first + ' ' + second : first, first: first, emphasis: emphasis };
}

export { STATUS_TEXT };
