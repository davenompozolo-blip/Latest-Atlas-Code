// ============================================================
// ATLAS — Performance level 2, the segment view (three-level spec §2)
// ------------------------------------------------------------
// Reads `segment_verdicts`, the nightly history written by
// `atlas_write_segment_verdicts`, and shapes it for the BETS screen.
//
// ## The stored columns are FRACTIONS, whatever their names say
//
// `excess_vs_book_pct`, `dispersion`, `selection_effect_pct` and friends all
// carry a fraction: AMD's stored selection effect is `1.604`, which is
// +160.4pp. The `_pct` suffix is a lie the schema has told since the engine
// shipped and is not worth a cascade to rename, so every read goes through
// `pp()` here and no surface multiplies by 100 on its own. One place to be
// wrong is better than nine.
//
// ## Effective bets is a property of the GROUPING, not of the book
//
// It is 1/Σs² over segment risk shares, so regrouping changes it: 5.07 under
// BY BET, 4.49 under BY THEME on the 2026-09-07 book. `book_risk_daily`
// stores a single figure computed over the partition only, so rendering that
// beside BY THEME rows would put a partition statistic under a theme heading
// — the mixed-basis failure this module keeps catching. Computed here, per
// grouping, from the rows actually on screen.
//
// ## Insight sentences are templates, never generated
//
// §2.5 fixes the thresholds and the priority order. A sentence that varies
// between renders cannot be tested or trusted, so there is no LLM call and no
// randomness: same rows in, same words out. At most two per segment.
//
// `sub_threshold` is absent on purpose — §2.4's field list still names it,
// §2.3 deletes the concept, and the later correction wins. Do not add a
// sentence for it.
// ============================================================

/** The two groupings. Never mixed on one screen; each is labelled. */
export const GROUPING_BET = 'bet';
export const GROUPING_THEME = 'theme';

/**
 * BY THEME is the default view. 44 segments with 37 singletons is a list;
 * 13 is a set of bets. The partition remains the analytical basis — this is
 * only which view opens, and BY BET is one tap away.
 */
export const DEFAULT_GROUPING = GROUPING_THEME;

export const GROUPING_LABEL = {
    bet:   'BY BET',
    theme: 'BY THEME',
};

/** What the grouping means, said on screen so neither is mistaken for the other. */
export const GROUPING_HINT = {
    bet:   'Grouped on the correlation partition, falling back to theme, then unpaired',
    theme: 'Grouped on the hand-kept theme taxonomy; names with no theme group as Unpaired',
};

/** Rows rendered in full before the tail collapses (§2.3b). */
export const FULL_ROWS = 8;

function num(v) {
    if (v == null) return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
}

/**
 * A stored fraction as points. Returns null rather than 0 for a missing
 * value — a segment that could not be measured must not render as flat.
 */
export function pp(v) {
    const n = num(v);
    return n == null ? null : n * 100;
}

export async function loadSegments(sb, asOf) {
    if (!sb) return null;
    try {
        let q = sb
            .from('segment_verdicts')
            .select('as_of, logic_version, grouping, segment_id, segment_kind, segment_label, ' +
                    'member_count, members, members_measured, members_withheld, withheld_symbols, ' +
                    'weight_share, risk_share, return_contribution_share, net_pnl_usd, ' +
                    'traded_mwr_pct, cf_mwr_pct, excess_vs_book_pct, cf_status, cf_reason, ' +
                    'dispersion, best_member, best_member_excess_pct, ' +
                    'worst_member, worst_member_excess_pct, dispersion_basis, ' +
                    'thesis_coverage, verdict_counts')
            .order('risk_share', { ascending: false, nullsFirst: false })
            .limit(200);
        if (asOf) q = q.eq('as_of', asOf);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
    } catch (e) {
        // Loudly. A swallowed read renders as "no bets", which reads as a book
        // with no structure rather than as a failed query.
        console.error('[ATLAS] segment_verdicts read failed:', e.message);
        return null;
    }
}

/** The most recent as_of present in a row set. Levels 2 and 3 must share it. */
export function latestAsOf(rows) {
    let best = null;
    (rows || []).forEach(function (r) {
        if (r && r.as_of && (best == null || r.as_of > best)) best = r.as_of;
    });
    return best;
}

function shape(row) {
    const counts = row.verdict_counts || null;
    let labelled = null;
    if (counts) {
        labelled = 0;
        Object.keys(counts).forEach(function (k) { labelled += Number(counts[k]) || 0; });
    }
    return {
        grouping:      row.grouping,
        segmentId:     row.segment_id,
        kind:          row.segment_kind,
        label:         row.segment_label,
        memberCount:   Number(row.member_count) || 0,
        members:       row.members || [],
        measured:      Number(row.members_measured) || 0,
        withheld:      Number(row.members_withheld) || 0,
        withheldSymbols: row.withheld_symbols || [],
        weightShare:   num(row.weight_share),
        riskShare:     num(row.risk_share),
        returnShare:   num(row.return_contribution_share),
        netPnlUsd:     num(row.net_pnl_usd),
        excessPp:      pp(row.excess_vs_book_pct),
        tradedPp:      pp(row.traded_mwr_pct),
        cfPp:          pp(row.cf_mwr_pct),
        cfStatus:      row.cf_status,
        cfReason:      row.cf_reason,
        dispersionPp:  pp(row.dispersion),
        dispersionBasis: row.dispersion_basis,
        bestMember:    row.best_member,
        bestMemberPp:  pp(row.best_member_excess_pct),
        worstMember:   row.worst_member,
        worstMemberPp: pp(row.worst_member_excess_pct),
        thesisCoverage: num(row.thesis_coverage),
        verdictCounts: counts,
        // Published so a surface can say why a count is missing rather than
        // rendering a smaller book. The job asserts these sum to memberCount.
        labelledCount: labelled,
        asOf:          row.as_of,
    };
}

/** 1/Σs² over the risk shares actually present. A property of the grouping. */
export function effectiveBets(segments) {
    let sum = 0;
    (segments || []).forEach(function (s) {
        const w = s.riskShare;
        if (w != null) sum += w * w;
    });
    return sum > 0 ? 1 / sum : null;
}

function median(xs) {
    const v = xs.filter(function (x) { return x != null; }).slice().sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function pct1(x) { return (x == null ? '—' : x.toFixed(1) + '%'); }
function ppStr(x) {
    if (x == null) return '—';
    return (x >= 0 ? '+' : '') + x.toFixed(2) + 'pp';
}

function joinNames(names) {
    const n = (names || []).slice();
    if (!n.length) return '';
    if (n.length === 1) return n[0];
    return n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
}

/**
 * §2.5, verbatim thresholds, in the spec's priority order, capped at two.
 *
 * `ctx` carries what a sentence needs beyond one row: the median dispersion
 * across the grouping, and the id of the widest segment. The dispersion
 * sentence says "widest dispersion in the book", so it fires only for the
 * actual widest — several segments can clear 2x the median, and calling three
 * of them the widest would be false on two.
 *
 * `members` is optional; without it the slot-holder sentence cannot fire,
 * which is correct — it is a claim about a specific position.
 */
export function insightSentences(seg, ctx, members) {
    const out = [];
    const w = seg.weightShare, r = seg.riskShare, ret = seg.returnShare;
    const wPct = w == null ? null : w * 100;
    const rPct = r == null ? null : r * 100;
    const retPct = ret == null ? null : ret * 100;

    // 1 — carrying more risk than weight
    if (w != null && r != null && r > w * 1.3) {
        out.push({
            key: 'risk_over_weight',
            text: pct1(wPct) + ' of the book, ' + pct1(rPct) + ' of the risk' +
                  (retPct != null ? ', ' + pct1(retPct) + ' of the return.' : '.'),
            emphasis: pct1(rPct) + ' of the risk',
        });
    }

    // 2 — a big concentrated segment is one bet
    if (w != null && w > 0.20 && seg.memberCount <= 4 && seg.memberCount > 1) {
        out.push({
            key: 'one_bet',
            text: joinNames(seg.members) + ' are one bet, not ' + seg.memberCount + '.',
            emphasis: 'one bet, not ' + seg.memberCount,
        });
    }

    // 4 — widest dispersion (3 was sub_threshold, deleted by §2.3)
    if (out.length < 2 && seg.dispersionPp != null && ctx &&
        ctx.medianDispersionPp != null && ctx.widestSegmentId === seg.segmentId &&
        seg.dispersionPp > 2 * ctx.medianDispersionPp) {
        out.push({
            key: 'dispersion',
            text: 'Widest dispersion in the book — ' + seg.bestMember + ' ' +
                  ppStr(seg.bestMemberPp) + ' against ' + seg.worstMember + ' ' +
                  ppStr(seg.worstMemberPp) + '. One name is the segment.',
            emphasis: seg.bestMember + ' ' + ppStr(seg.bestMemberPp) + ' against ' +
                      seg.worstMember + ' ' + ppStr(seg.worstMemberPp),
        });
    }

    // 5 — the hedge case: paying weight for very little risk
    if (out.length < 2 && w != null && r != null && r < w * 0.5) {
        out.push({
            key: 'risk_under_weight',
            text: pct1(wPct) + ' of the book for ' + pct1(rPct) + ' of the risk. ' +
                  'Doing what it was bought to do, and costing return to do it.',
            emphasis: 'Doing what it was bought to do, and costing return to do it.',
        });
    }

    // 6 — a member holding a slot without earning it
    if (out.length < 2 && members && members.length) {
        const idle = members.filter(function (m) {
            return m && m.excessPp != null && Math.abs(m.excessPp) < 1 &&
                   m.daysHeld != null && m.daysHeld > 180;
        });
        if (idle.length) {
            const m = idle[0];
            out.push({
                key: 'slot_holder',
                text: m.symbol + ' has added ' + ppStr(m.excessPp) + ' in ' + m.daysHeld +
                      ' days — holding a slot, not earning one.',
                emphasis: 'holding a slot, not earning one',
            });
        }
    }

    // 7 — unpaired
    if (out.length < 2 && seg.kind === 'unpaired') {
        out.push({
            key: 'unpaired',
            text: 'No close comparable at any threshold and no theme on file. ' +
                  pct1(wPct) + ' of capital with no story attached.',
            emphasis: pct1(wPct) + ' of capital with no story attached',
        });
    }

    return out.slice(0, 2);
}

/**
 * The level-2 view model for one grouping.
 *
 * Rows are ranked by risk share and split at FULL_ROWS; the tail is one
 * expandable row carrying its own totals. The RISK STRIP is built from ALL
 * segments, not the visible eight — collapsing the tail must not make the
 * book look more concentrated than it is.
 */
export function buildBetsView(rows, grouping, membersBySegment) {
    const all = (rows || [])
        .map(shape)
        .filter(function (s) { return s.grouping === grouping; })
        .sort(function (a, b) { return (b.riskShare || 0) - (a.riskShare || 0); });

    if (!all.length) return null;

    const dispersions = all.map(function (s) { return s.dispersionPp; });
    let widest = null, widestVal = null;
    all.forEach(function (s) {
        if (s.dispersionPp != null && (widestVal == null || s.dispersionPp > widestVal)) {
            widestVal = s.dispersionPp;
            widest = s.segmentId;
        }
    });
    const ctx = { medianDispersionPp: median(dispersions), widestSegmentId: widest };

    all.forEach(function (s) {
        s.insights = insightSentences(s, ctx, membersBySegment && membersBySegment[s.segmentId]);
    });

    const full = all.slice(0, FULL_ROWS);
    const tail = all.slice(FULL_ROWS);

    const sum = function (xs, k) {
        let t = 0, any = false;
        xs.forEach(function (x) { if (x[k] != null) { t += x[k]; any = true; } });
        return any ? t : null;
    };

    return {
        grouping:      grouping,
        groupingLabel: GROUPING_LABEL[grouping],
        groupingHint:  GROUPING_HINT[grouping],
        asOf:          latestAsOf(rows),
        segments:      all,
        full:          full,
        tail:          tail,
        // The strip is every segment, always.
        strip:         all.map(function (s) {
                           return { id: s.segmentId, label: s.label, share: s.riskShare || 0 };
                       }),
        segmentCount:  all.length,
        positionCount: all.reduce(function (t, s) { return t + s.memberCount; }, 0),
        singletonCount: all.filter(function (s) { return s.memberCount === 1; }).length,
        effectiveBets: effectiveBets(all),
        tailSummary:   tail.length ? {
                           count:       tail.length,
                           weightShare: sum(tail, 'weightShare'),
                           riskShare:   sum(tail, 'riskShare'),
                           singletons:  tail.filter(function (s) { return s.memberCount === 1; }).length,
                       } : null,
        // A segment whose counterfactual could not resolve is carried, not
        // dropped: it still holds weight and risk, and the reason is the point.
        gated:         all.filter(function (s) { return s.cfStatus !== 'measured'; }),
        withheldTotal: all.reduce(function (t, s) { return t + s.withheld; }, 0),
    };
}

/** Colour ramp for the risk strip, in rank order. Deterministic. */
export const STRIP_COLORS = [
    '#3ad6e0', '#43d68a', '#8b7ff0', '#f5a623', '#f2645a',
    'rgba(255,255,255,.34)', 'rgba(255,255,255,.26)', 'rgba(255,255,255,.2)',
];
export function stripColor(i, total) {
    if (i < STRIP_COLORS.length) return STRIP_COLORS[i];
    // Everything past the named ramp is one muted tone; the tail is a mass,
    // not eight more distinguishable bets.
    return 'rgba(255,255,255,.12)';
}

/**
 * The glow that goes under a risk bar of the same rank.
 *
 * A companion ramp rather than a colour derived at the call site: the palette
 * mixes hex and rgba, so there is no one expression that dims both, and a
 * "clever" string rewrite silently produced an invalid box-shadow.
 */
const STRIP_GLOWS = [
    'rgba(58,214,224,.40)', 'rgba(67,214,138,.40)', 'rgba(139,127,240,.40)',
    'rgba(245,166,35,.40)', 'rgba(242,100,90,.40)',
    'rgba(255,255,255,.18)', 'rgba(255,255,255,.14)', 'rgba(255,255,255,.12)',
];
export function stripGlow(i) {
    return i < STRIP_GLOWS.length ? STRIP_GLOWS[i] : 'rgba(255,255,255,.08)';
}
