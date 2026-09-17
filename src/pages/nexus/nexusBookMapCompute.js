// ============================================================
// Nexus — the book universe map (G-3)
// ------------------------------------------------------------
// Places the book and every candidate it can be compared against on ONE pair
// of axes, so "what would adding this do" starts from a picture rather than a
// search box.
//
// THE AXES ARE THE WHOLE DESIGN, and the constraint on them is that both must
// be computable for a name WHETHER OR NOT IT IS HELD. Plot held names on one
// measure and candidates on another and the chart is two experiments sharing
// a frame -- the mixed-basis failure this codebase has caught repeatedly.
//
//   x   rho to book     weight-weighted mean correlation_simple to the CURRENT
//                       book, the name's own weight excluded. Left is
//                       differentiated, right is more of what you already own.
//   y   annualised vol  from the SAME snapshot and the SAME 120-session window
//                       the correlations were estimated on.
//
// So the quadrants mean something without a legend: bottom-left is a quiet
// diversifier, top-right is more of the same and louder.
//
// WHAT IS NOT RANKED. `mv_book_candidate_map` publishes is_inverse and
// is_levered from MEASURED beta_spy. 198 of 423 rows carry one or the other,
// and the unfiltered "most diversifying" list was SPDN, SH, RWM, PSQ, QID --
// five inverse ETFs, which are negatively correlated by construction rather
// than by being a differentiated bet. They are plotted and badged; they are
// never ranked. Exactly why `regret_vs_best_pct` is display-only.
//
// This module is pure and IO-free. The fetch and the DOM live in
// NexusBookMap.js; the book-impact arithmetic is NOT reimplemented here --
// `src/lib/trade/bookImpact.js` owns it and the drawer calls that.
// ============================================================

const isNum = (v) => typeof v === 'number' && isFinite(v);
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
};

/** A name is placeable only if it carries BOTH axes. One axis is not a point. */
export function isPlaceable(row) {
    return isNum(row.rhoToBook) && isNum(row.volAnnual);
}

/** Normalise one `mv_book_candidate_map` row into the shape the map plots. */
export function normaliseRow(r) {
    return {
        symbol: r.symbol,
        name: r.name || null,
        sector: r.sector || null,
        assetClass: r.asset_class || null,
        held: r.held === true,
        weightPct: num(r.weight_pct),
        rhoToBook: num(r.rho_to_book),
        maxRhoToBook: num(r.max_rho_to_book),
        measuredWeightPct: num(r.measured_weight_pct),
        measuredAgainst: num(r.measured_against),
        absentFromMatrix: r.absent_from_matrix === true,
        absenceReason: r.absence_reason || null,
        volAnnual: num(r.vol_annual),
        betaSpy: num(r.beta_spy),
        // Measured from beta, never matched on a name. Null beta means we do
        // not know, which is NOT the same as "not levered" -- a row with no
        // beta is excluded from the ranking for that reason instead.
        isInverse: r.is_inverse === true,
        isLevered: r.is_levered === true,
        advUsd: num(r.adv_usd),
        lastClose: num(r.last_close),
        lastPriceDate: r.last_price_date || null,
        obsDays: num(r.obs_days),
        clusterId: r.cluster_id == null ? null : Number(r.cluster_id),
        clusterLabel: r.cluster_label || null,
        asOfDate: r.as_of_date || null,
    };
}

/** True when a row may appear in a RANKED list rather than merely on the map. */
export function isRankable(row) {
    if (!isPlaceable(row)) return false;
    if (row.isInverse || row.isLevered) return false;
    // No beta at all is not evidence of no leverage. Refusing here is the same
    // rule as refusing a verdict on an unmeasurable position.
    return isNum(row.betaSpy);
}

export const ABSENCE_TEXT = {
    option_contract: 'an option contract — it expires, so there is no stable series to correlate',
    no_risk_stats: 'no risk statistics on file — its price feed is dark',
    no_correlation_pairs: 'in the risk snapshot but sharing no measurable pair with the book',
};

/**
 * Split the roster into what can be drawn and what cannot, with the reasons
 * kept apart. An option contract is not measurable BY CONSTRUCTION; a dark
 * feed is a gap that could close. Collapsing the two reads as a data problem
 * when half of it is a category.
 */
export function placement(rows) {
    const placed = [], withheld = [];
    for (const r of rows) (isPlaceable(r) ? placed : withheld).push(r);

    const byReason = {};
    for (const r of withheld) {
        const k = r.absenceReason || 'no_correlation_pairs';
        (byReason[k] = byReason[k] || []).push(r.symbol);
    }
    const heldWithheld = withheld.filter((r) => r.held);
    return {
        placed,
        withheld,
        withheldByReason: byReason,
        // The book's own withheld weight, so the map can state how much of what
        // you own is NOT on screen rather than quietly showing a smaller book.
        heldWithheldSymbols: heldWithheld.map((r) => r.symbol),
        heldWithheldWeightPct: heldWithheld.reduce((a, r) => a + (r.weightPct || 0), 0),
    };
}

/** Axis extents with a margin, computed from what is actually drawn. */
export function extents(placed) {
    if (!placed.length) return null;
    const xs = placed.map((r) => r.rhoToBook);
    const ys = placed.map((r) => r.volAnnual);
    const pad = (lo, hi, frac) => {
        const span = hi - lo;
        const m = span > 0 ? span * frac : Math.abs(hi || 1) * frac || 0.05;
        return [lo - m, hi + m];
    };
    const [x0, x1] = pad(Math.min(...xs), Math.max(...xs), 0.06);
    const [, y1] = pad(Math.min(...ys), Math.max(...ys), 0.06);
    // Volatility has a true zero and the axis should show it, or a book of
    // 40-90% vol names renders as though the differences were the whole story.
    return { x0, x1, y0: 0, y1 };
}

/**
 * The book's own centre of gravity on the same axes — weight-weighted, so it
 * is where the book actually sits rather than where its names average out.
 * Drawn as a crosshair: a candidate is only "diversifying" relative to this.
 */
export function bookCentroid(placed) {
    const held = placed.filter((r) => r.held && isNum(r.weightPct) && r.weightPct > 0);
    if (!held.length) return null;
    const w = held.reduce((a, r) => a + r.weightPct, 0);
    if (!(w > 0)) return null;
    return {
        rhoToBook: held.reduce((a, r) => a + r.weightPct * r.rhoToBook, 0) / w,
        volAnnual: held.reduce((a, r) => a + r.weightPct * r.volAnnual, 0) / w,
        weightPct: w,
        count: held.length,
    };
}

export const QUADRANT = {
    diversifier: 'Quiet diversifier',
    hedgeish: 'Differentiated, but volatile',
    crowding: 'Correlated and calm',
    doubling: 'More of the same, louder',
};

/** Which quadrant a row falls in, relative to the BOOK rather than to zero. */
export function quadrantOf(row, centroid) {
    if (!centroid || !isPlaceable(row)) return null;
    const right = row.rhoToBook >= centroid.rhoToBook;
    const up = row.volAnnual >= centroid.volAnnual;
    if (right && up) return 'doubling';
    if (right && !up) return 'crowding';
    if (!right && up) return 'hedgeish';
    return 'diversifier';
}

/**
 * Candidates ranked as genuine alternatives: unheld, placeable, and neither
 * inverse nor levered. Sorted by rho ascending — least like what you own
 * first — with vol as the tiebreak so a quieter name wins a tie.
 */
export function rankCandidates(rows, { limit = 10 } = {}) {
    const eligible = rows.filter((r) => !r.held && isRankable(r));
    const excluded = rows.filter((r) => !r.held && isPlaceable(r) && !isRankable(r));
    const ranked = eligible
        .slice()
        .sort((a, b) => a.rhoToBook - b.rhoToBook || a.volAnnual - b.volAnnual
            || String(a.symbol).localeCompare(String(b.symbol)))
        .slice(0, limit);
    return {
        ranked,
        // Named, not silently dropped: the reader should see that 198 of the
        // universe were held out of the ranking and why.
        excludedCount: excluded.length,
        excludedInverse: excluded.filter((r) => r.isInverse).length,
        excludedLevered: excluded.filter((r) => r.isLevered).length,
        excludedNoBeta: excluded.filter((r) => !isNum(r.betaSpy)).length,
        eligibleCount: eligible.length,
    };
}

/** Facet counts for the map's filter row, in a fixed order. */
export const MAP_FACETS = [
    { key: 'held', label: 'In the book', test: (r) => r.held },
    { key: 'candidate', label: 'Candidates', test: (r) => !r.held && isRankable(r) },
    { key: 'levered', label: 'Levered', test: (r) => r.isLevered },
    { key: 'inverse', label: 'Inverse', test: (r) => r.isInverse },
];

export function facetCounts(rows) {
    return MAP_FACETS
        .map((f) => ({ key: f.key, label: f.label, count: rows.filter(f.test).length }))
        // A facet with no members gets no tile: an empty tile invites a click
        // that finds nothing. Same rule as the holdings facets.
        .filter((f) => f.count > 0);
}

export function applyMapFilters(rows, { facets, sectors, search }) {
    const f = facets instanceof Set ? facets : new Set(facets || []);
    const s = sectors instanceof Set ? sectors : new Set(sectors || []);
    const q = (search || '').trim().toUpperCase();
    return rows.filter((r) => {
        // An empty Set is "no filter", never "match nothing".
        if (f.size) {
            const defs = MAP_FACETS.filter((d) => f.has(d.key));
            if (!defs.some((d) => d.test(r))) return false;
        }
        if (s.size && !s.has(r.sector || 'Unclassified')) return false;
        if (q && !(String(r.symbol).toUpperCase().includes(q)
            || String(r.name || '').toUpperCase().includes(q))) return false;
        return true;
    });
}

export function sectorOptions(rows) {
    const seen = new Map();
    for (const r of rows) {
        const k = r.sector || 'Unclassified';
        seen.set(k, (seen.get(k) || 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([label, count]) => ({ label, count }));
}

/**
 * The one sentence the map can say about a candidate before the drawer opens
 * any engine. It is a statement about CORRELATION only, and says so — the
 * risk answer needs the covariance matrix and comes from computeBookImpact.
 */
export function candidateLine(row, centroid) {
    if (!isPlaceable(row)) {
        const why = ABSENCE_TEXT[row.absenceReason] || 'not measurable against the book';
        return `${row.symbol} cannot be placed: ${why}.`;
    }
    const q = quadrantOf(row, centroid);
    const rel = centroid
        ? (row.rhoToBook < centroid.rhoToBook ? 'less correlated to the book than the book’s own centre'
            : 'more correlated to the book than the book’s own centre')
        : 'measured against the book';
    const lev = row.isLevered ? ' Levered (β ' + row.betaSpy.toFixed(2) + '), so it is plotted but never ranked.'
        : row.isInverse ? ' Inverse (β ' + row.betaSpy.toFixed(2) + '), negatively correlated by construction rather than by being a different bet.'
            : '';
    const denom = isNum(row.measuredWeightPct) && row.measuredWeightPct < 99.5
        ? ` Measured against ${row.measuredWeightPct.toFixed(0)}% of book weight.` : '';
    return `ρ ${row.rhoToBook.toFixed(2)} to the book, vol ${(row.volAnnual * 100).toFixed(0)}% — `
        + `${rel}.${q ? ' ' + QUADRANT[q] + '.' : ''}${lev}${denom}`;
}
