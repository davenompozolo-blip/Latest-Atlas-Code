// ============================================================
// ATLAS — the per-position trading-effect drill-down (memo v2 close-out §5.1)
// ------------------------------------------------------------
// §5.1 gave the do-nothing baseline first-class billing at BOOK level and said
// the per-row figure stays available underneath. This reads that layer.
//
// ## Rank on dollars. The rate column is a trap.
//
// The book number is an MWR over pooled cash flows, so no weighting of the
// per-position rates recovers it. Adding them up on today's book gives
// **−160.76pp** against a book effect of **−1.03pp** — a factor of 156. The
// dollar column, traded gain minus frozen gain, IS additive and sums to
// −$4,033.49 against the book's own −$4,033.51.
//
// So `rankedByDollars` is the ordering and `naiveRateSumPp` is published for
// the surface to show as the thing NOT to do. Both are in the builder rather
// than the panel because the choice of sort key is the substantive decision
// here, and it belongs somewhere a test can pin it.
//
// This is the `regret_vs_best_pct` rule again: there, ranking on the wrong
// column graded leverage; here it would grade capital deployed.
//
// ## Structural zeros are not small numbers
//
// Fourteen positions were bought once and never touched. Their frozen path is
// their traded path, so the effect is zero by construction — the view snaps
// the solver's ~1e-7 residue away. They are excluded from `helped`/`hurt`
// entirely: a position with no trading did not "hurt by 0.00pp", it was never
// in the comparison. Counting them would put 14 rows on whichever side of the
// tally a floating-point sign happened to land.
//
// ## The alignment gate
//
// The tile above reads `book_risk_daily`, a nightly history. This reads the
// live engine. On an ordinary day they describe the same night; the day the
// nightly job misses, they do not, and a drill-down silently one session ahead
// of the headline it explains is the mixed-basis failure in a new place.
//
// `alignment` compares the two dates and says which is which. It never
// reconciles them and never hides one — the two figures are computed on
// different substrates, and the honest handling is to publish both dates.
// ============================================================

/** Rows whose two units point opposite ways are expected, not errors. */
export const KINDS = ['exit', 'resized', 'untouched'];

/** What each trade kind means, in one line. */
export const KIND_READ = {
    exit:      'sold out — the frozen book still holds it',
    resized:   'added to or trimmed after the opening buy',
    untouched: 'bought once, never touched — no trading to measure',
};

function num(v) {
    if (v == null) return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
}

function isoDay(v) {
    if (!v) return null;
    const s = String(v);
    return s.length >= 10 ? s.slice(0, 10) : null;
}

/**
 * The whole drill-down: 86 rows, one per position the return engine knows.
 *
 * Ordered explicitly rather than left to the server. It is well under
 * PostgREST's 1,000-row ceiling today, but an unordered read of a set that
 * grows with the book is the shape that bit `api/nexus-bench.js` — and here a
 * truncation would drop positions out of a total that is presented as
 * complete, which is worse than a short list.
 */
export async function loadTradingEffect(sb) {
    if (!sb) return null;
    try {
        const { data, error } = await sb
            .from('vw_position_trading_effect')
            .select('symbol, position_state, as_of, trade_kind, n_buys, n_sells, ' +
                    'first_buy_date, last_trade_date, comparable, unmeasurable_reason, ' +
                    'unmeasurable_detail, traded_capital_usd, frozen_capital_usd, ' +
                    'traded_gain_usd, frozen_gain_usd, trading_effect_usd, ' +
                    'traded_return_pct, frozen_return_pct, trading_effect_pct, ' +
                    'effects_disagree, structural_zero_breach')
            .order('trading_effect_usd', { ascending: true, nullsFirst: false })
            .limit(500);
        if (error) throw error;
        return data || [];
    } catch (e) {
        // Loudly. A swallowed read here renders as "nothing to decompose",
        // which reads as a book that never traded rather than as a failure.
        console.error('[ATLAS] vw_position_trading_effect read failed:', e.message);
        return null;
    }
}

function shape(row) {
    return {
        symbol:        row.symbol,
        state:         row.position_state,
        kind:          row.trade_kind,
        buys:          num(row.n_buys),
        sells:         num(row.n_sells),
        firstBuy:      isoDay(row.first_buy_date),
        lastTrade:     isoDay(row.last_trade_date),
        comparable:    row.comparable === true,
        reason:        row.unmeasurable_reason || null,
        detail:        row.unmeasurable_detail || null,
        tradedCapital: num(row.traded_capital_usd),
        frozenCapital: num(row.frozen_capital_usd),
        tradedGain:    num(row.traded_gain_usd),
        frozenGain:    num(row.frozen_gain_usd),
        // The additive one. Dollars, not points.
        effectUsd:     num(row.trading_effect_usd),
        // The engine's rate, in percentage POINTS once scaled. Never summed.
        effectPp:      num(row.trading_effect_pct) == null ? null : num(row.trading_effect_pct) * 100,
        tradedPct:     num(row.traded_return_pct) == null ? null : num(row.traded_return_pct) * 100,
        frozenPct:     num(row.frozen_return_pct) == null ? null : num(row.frozen_return_pct) * 100,
        disagree:      row.effects_disagree === true,
        breach:        row.structural_zero_breach === true,
    };
}

/**
 * Compare the drill-down's valuation date against the book tile's night.
 *
 * Returns `{ state, reason }` where state is 'aligned', 'drill_ahead',
 * 'drill_behind' or 'unknown'. Never null — an unknowable alignment is a state
 * the surface has to render, not an absence it can skip.
 */
export function alignment(drillAsOf, baselineAsOf) {
    const a = isoDay(drillAsOf), b = isoDay(baselineAsOf);
    if (!a || !b) {
        return { state: 'unknown', reason: 'one of the two dates is missing — cannot say whether they describe the same night' };
    }
    if (a === b) return { state: 'aligned', reason: 'same valuation date as the book figure above' };
    if (a > b) {
        return {
            state: 'drill_ahead',
            reason: 'this reads the live engine at ' + a + '; the book figure above is last written for ' + b,
        };
    }
    return {
        state: 'drill_behind',
        reason: 'this marks to ' + a + ' while the book figure above is dated ' + b,
    };
}

/**
 * Roll the rows up into what the panel renders.
 *
 * @param {array}  rows      from loadTradingEffect
 * @param {object} baseline  the readBookBaseline() result, for the date check
 */
export function buildTradingView(rows, baseline) {
    const all = (rows || []).map(shape);
    const measured = all.filter(function (r) { return r.comparable && r.effectUsd != null; });
    const unmeasurable = all.filter(function (r) { return !r.comparable; });

    // Structural zeros sit outside the tally. See the header: a position with
    // no trading is not a position whose trading did nothing measurable.
    const inPlay = measured.filter(function (r) { return r.kind !== 'untouched'; });

    const byKind = KINDS.map(function (kind) {
        const rs = measured.filter(function (r) { return r.kind === kind; });
        return {
            kind: kind,
            read: KIND_READ[kind],
            count: rs.length,
            usd: rs.reduce(function (s, r) { return s + r.effectUsd; }, 0),
            rows: rs,
        };
    });

    const totalUsd = measured.reduce(function (s, r) { return s + r.effectUsd; }, 0);

    // The number the surface shows as a warning, not as an explanation.
    const naiveRateSumPp = measured.reduce(function (s, r) {
        return r.effectPp == null ? s : s + r.effectPp;
    }, 0);

    let viewAsOf = null;
    for (let i = 0; i < (rows || []).length; i++) {
        const d = isoDay(rows[i].as_of);
        if (d) { viewAsOf = d; break; }
    }

    return {
        asOf: viewAsOf,
        align: alignment(viewAsOf, baseline && baseline.asOf),
        bookEffectPp: baseline ? baseline.effectPp : null,

        totalCount: all.length,
        measuredCount: measured.length,
        unmeasurableCount: unmeasurable.length,
        unmeasurable: unmeasurable,

        totalUsd: totalUsd,
        naiveRateSumPp: naiveRateSumPp,

        byKind: byKind,
        // Ranked by absolute dollar effect: the biggest movers of the book
        // number, whichever way they moved it.
        rankedByDollars: inPlay.slice().sort(function (a, b) {
            return Math.abs(b.effectUsd) - Math.abs(a.effectUsd);
        }),
        tradedCount: inPlay.length,
        helped: inPlay.filter(function (r) { return r.effectUsd > 0; }).length,
        hurt:   inPlay.filter(function (r) { return r.effectUsd < 0; }).length,
        // Traded, and it changed nothing. A third outcome, not a rounding of
        // the other two — without it the header's tally is short of the table
        // it introduces, which is how the count on screen stops matching the
        // list under it.
        unchanged: inPlay.filter(function (r) { return r.effectUsd === 0; }).length,
        untouchedCount: measured.filter(function (r) { return r.kind === 'untouched'; }).length,

        // Rows where dollars and rate point opposite ways. Published so the
        // surface can mark them rather than letting a reader assume the two
        // columns are two views of one answer.
        disagreements: inPlay.filter(function (r) { return r.disagree; }),
        breaches: all.filter(function (r) { return r.breach; }),
    };
}

/**
 * One-line read of the decomposition, for the panel header.
 *
 * Names the kind that dominates by MAGNITUDE, not the most negative one — on a
 * book where trading paid, the sentence has to name what did the paying.
 */
export function tradingVerdict(view) {
    if (!view || !view.measuredCount) return 'Nothing to decompose';
    if (Math.abs(view.totalUsd) < 1) return 'Trading was a wash in dollars too';

    const driver = view.byKind.slice().sort(function (a, b) {
        return Math.abs(b.usd) - Math.abs(a.usd);
    })[0];
    const dir = view.totalUsd < 0 ? 'cost' : 'added';
    return 'Trading ' + dir + ' $' + Math.abs(view.totalUsd).toFixed(0)
         + ', almost all of it in ' + driver.kind + 's';
}
