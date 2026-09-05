// ============================================================
// attributionEngine.js — shared Brinson-Fachler attribution.
// ------------------------------------------------------------
// Single source for the sector attribution compute, consumed by
// BOTH surfaces (same pattern as valuationEngine.js):
//   • PERF → Positions → Brinson Analysis (full 12-sector table)
//   • Nexus beat 07 — Decision scorecard (engine mapping + verdicts)
// Do not fork the maths: if either surface needs a change, it lands
// here so the two can never disagree.
//
// Pure ES module — no React, no DOM, no IO.
//
// ## The return basis is the CALLER's to declare (2026-09-05)
//
// This engine used to reach into the row itself:
//
//     var ret = Number(p.total_return_pct || p.unrealised_return_pct || 0);
//
// Three things wrong with that, in increasing order of severity.
//
// **It falls back across bases.** `total_return_pct` is return since the first
// fill; `unrealised_return_pct` is the mark on average cost. They disagree in
// sign on 8 of 61 holdings. A shared engine silently choosing between them is
// the defect `src/lib/nexusReturnBasis.js` exists to prevent, one layer down —
// and it was missed by that sweep because the sweep grepped `row.`/`h.`/`r.`
// and this file uses `p.`.
//
// **`||` is not `??`.** A genuine 0.00% return is falsy, so a flat position
// fell through to the other basis. The two are then indistinguishable.
//
// **A missing return became a real 0%.** That is the live bug. KMTUY has no
// `total_return_pct` (feed 176 days dark, `verdict_status = not_measurable`)
// and is 1 of 3 Industrials names. Nexus beat 07 passes rows unfiltered, so
// KMTUY entered attribution as a genuine 0.00% return and pulled the sector
// with it — benchmark sector return 0.13% against a true 0.19%, portfolio
// sector return 0.17% against a true 0.27%. Performance pre-filtered and got
// the right answer. Same engine, same benchmark, two answers, neither
// surface saying so.
//
// So `returnOf` is now a REQUIRED argument. The caller names the basis; rows
// it cannot measure are EXCLUDED rather than counted as zero, and the count of
// what was withheld comes back on the result so a surface can say what it
// dropped instead of quietly shrinking its own denominator.
//
// ## Why Brinson does not follow the MWR toggle
//
// It was tempting to make this basis-aware in the fullest sense — let
// `atlas.return.basis.v1` swing it to MWR alongside the return columns. That
// is wrong, and the reason is structural rather than a matter of taste.
//
// `benchmarkSectorReturn` is computed from the PORTFOLIO'S OWN positions — a
// simple average of the position returns inside each sector. That is what
// makes it a counterfactual: same names, equal weighting instead of yours, so
// `selection = wb x (rp - rb)` measures your sizing against a neutral sizing
// of the same book. Feed money-weighted returns in and the "benchmark" becomes
// an average of YOUR cash-flow-timed returns, so selection would measure your
// trading against your own trading and the comparison collapses.
//
// Two supporting facts, both checked rather than assumed. Holding periods in
// `vw_performance_suite` run **4 to 250 days**, so a money-weighted rate per
// position adds a second axis of incomparability on top of the heterogeneous
// windows the since-entry basis already carries. And `vw_performance_suite`
// carries no MWR column at all — re-basing is a schema change, not a toggle.
//
// SINCE ENTRY is therefore Brinson's basis by construction, not pending work.
// The badge on the panel says exactly that.
// ============================================================

/**
 * The basis every current caller uses: return since the first fill.
 *
 * Returns null — never 0 — when the position has no measurable return, so the
 * engine can exclude it rather than average a fabricated flat return into its
 * sector.
 */
export function RETURN_SINCE_ENTRY(p) {
    if (!p || p.total_return_pct == null || p.total_return_pct === '') return null;
    var n = Number(p.total_return_pct);
    return isFinite(n) ? n : null;
}

/**
 * The mark against average cost on what is still held.
 *
 * Not used by either surface today. It exists so that a caller who wants this
 * basis has to ASK for it by name, which is the whole point — the alternative
 * is an engine that picks for you and tells no one.
 */
export function RETURN_ON_COST(p) {
    if (!p || p.unrealised_return_pct == null || p.unrealised_return_pct === '') return null;
    var n = Number(p.unrealised_return_pct);
    return isFinite(n) ? n : null;
}

function requireAccessor(returnOf, fnName) {
    if (typeof returnOf !== 'function') {
        throw new Error(
            fnName + ' requires an explicit return accessor (RETURN_SINCE_ENTRY / RETURN_ON_COST). ' +
            'The engine no longer guesses which of the two return columns to use.');
    }
}

// GICS sector weights for the benchmark swap. Approximate weights as of
// Q1 2026; sector names match the assets.sector mapping. Shared so both
// surfaces offer exactly the same three benchmarks with the same weights.
export var BENCHMARKS = {
    equal: { label: 'Equal Wt', desc: 'Equal weight across portfolio sectors', weights: null },
    spy: {
        label: 'S&P 500', desc: 'S&P 500 GICS sector weights (approx.)',
        weights: {
            'Technology': 0.295, 'Financials': 0.135, 'Healthcare': 0.115,
            'Consumer Discretionary': 0.105, 'Communication': 0.090,
            'Industrials': 0.085, 'Consumer Staples': 0.060,
            'Energy': 0.035, 'Real Estate': 0.025, 'Materials': 0.025, 'Utilities': 0.025,
        }
    },
    qqq: {
        label: 'NASDAQ-100', desc: 'NASDAQ-100 GICS sector weights (approx.)',
        weights: {
            'Technology': 0.520, 'Communication': 0.170,
            'Consumer Discretionary': 0.130, 'Healthcare': 0.060,
            'Industrials': 0.040, 'Consumer Staples': 0.030,
            'Financials': 0.025, 'Materials': 0.010,
            'Energy': 0.005, 'Real Estate': 0.005, 'Utilities': 0.005,
        }
    },
};

// ----------------------------------------------------------------
// computeBrinsonAttribution
// Brinson-Fachler model with swappable benchmark.
//   benchmarkWeights: optional { sectorName: weight } map (sum ≤ 1).
//     null  → equal weight across portfolio sectors (default)
//     object → use provided weights (normalised to portfolio sectors)
//   Benchmark sector return = equal-weight avg return within sector
//   Allocation  = (wp - wb) × (rb_sector - Rb_total)
//   Selection   = wb × (rp_sector - rb_sector)
//   Interaction = (wp - wb) × (rp_sector - rb_sector)
// ----------------------------------------------------------------
export function computeBrinsonAttribution(positions, benchmarkWeights, returnOf) {
    requireAccessor(returnOf, 'computeBrinsonAttribution');
    if (!positions || !positions.length) return null;

    // Excluded, not zeroed. A position whose return cannot be measured has no
    // place in an average of returns; counting it as 0.00% is a fabricated
    // observation that drags its sector both ways at once (the benchmark
    // simple-average AND the value-weighted portfolio return).
    var withheld = [];
    var measured = positions.filter(function(p) {
        if (returnOf(p) != null) return true;
        withheld.push(p && p.symbol);
        return false;
    });
    if (!measured.length) return null;

    var totalMv = measured.reduce(function(s, p) { return s + Math.abs(Number(p.market_value) || 0); }, 0);
    if (!totalMv) return null;

    var useEqualWeight = !benchmarkWeights;

    // Group by sector
    var bySector = {};
    measured.forEach(function(p) {
        var sec = p.sector || 'Other';
        var mv  = Math.abs(Number(p.market_value) || 0);
        var ret = returnOf(p);
        if (!bySector[sec]) bySector[sec] = { mv: 0, sumRet: 0, count: 0, positions: [] };
        bySector[sec].mv     += mv;
        bySector[sec].sumRet += ret;
        bySector[sec].count  += 1;
        bySector[sec].positions.push(p);
    });

    var sectors = Object.keys(bySector);
    var N = sectors.length;

    // Normalise benchmark weights to the sectors that appear in the portfolio
    var rawBenchTotal = useEqualWeight ? 1 :
        sectors.reduce(function(s, sec) { return s + (benchmarkWeights[sec] || 0); }, 0);
    var normFactor = rawBenchTotal > 0 ? rawBenchTotal : 1;

    sectors.forEach(function(sec) {
        var s = bySector[sec];
        s.portfolioWeight = s.mv / totalMv;
        s.benchmarkWeight = useEqualWeight ? (1 / N) : (benchmarkWeights[sec] || 0) / normFactor;
        // Portfolio sector return = value-weighted avg return
        var sumWR = 0;
        s.positions.forEach(function(p) {
            var mv  = Math.abs(Number(p.market_value) || 0);
            sumWR += (mv / s.mv) * returnOf(p);
        });
        s.portfolioSectorReturn = sumWR;
        // Benchmark sector return = simple avg return within sector
        s.benchmarkSectorReturn = s.sumRet / s.count;
    });

    var portfolioReturn = sectors.reduce(function(sum, sec) {
        var s = bySector[sec];
        return sum + s.portfolioWeight * s.portfolioSectorReturn;
    }, 0);

    var benchmarkReturn = sectors.reduce(function(sum, sec) {
        var s = bySector[sec];
        return sum + s.benchmarkWeight * s.benchmarkSectorReturn;
    }, 0);

    // Brinson-Fachler decomposition
    var attribution = sectors.map(function(sec) {
        var s   = bySector[sec];
        var wp  = s.portfolioWeight;
        var wb  = s.benchmarkWeight;
        var rp  = s.portfolioSectorReturn;
        var rb  = s.benchmarkSectorReturn;
        var Rb  = benchmarkReturn;
        var alloc    = (wp - wb) * (rb - Rb);
        var select   = wb * (rp - rb);
        var interact = (wp - wb) * (rp - rb);
        return {
            sector:            sec,
            portfolioWeight:   wp,
            benchmarkWeight:   wb,
            activeWeight:      wp - wb,
            portfolioReturn:   rp,
            benchmarkReturn:   rb,
            allocationEffect:  alloc,
            selectionEffect:   select,
            interactionEffect: interact,
            totalEffect:       alloc + select + interact,
            positionCount:     s.count,
        };
    });

    attribution.sort(function(a, b) { return Math.abs(b.totalEffect) - Math.abs(a.totalEffect); });

    var totals = attribution.reduce(function(acc, a) {
        acc.allocation  += a.allocationEffect;
        acc.selection   += a.selectionEffect;
        acc.interaction += a.interactionEffect;
        acc.total       += a.totalEffect;
        return acc;
    }, { allocation: 0, selection: 0, interaction: 0, total: 0 });

    return {
        sectors:         attribution,
        totals:          totals,
        portfolioReturn: portfolioReturn,
        benchmarkReturn: benchmarkReturn,
        activeReturn:    portfolioReturn - benchmarkReturn,
        // What this decomposition is actually over. Published so a surface can
        // state its denominator instead of implying it covered the book.
        measuredCount:   measured.length,
        withheldCount:   withheld.length,
        withheldSymbols: withheld,
    };
}

// ----------------------------------------------------------------
// verdictForEffect — beat 07 badge logic (§4.3 of the realized-layer
// spec). Kept in the engine so the grading rule is testable and both
// surfaces could render it identically if PERF ever adopts badges.
//   effect: the current effect value (fraction)
//   trailing: array of the same effect over trailing weeks (fractions),
//             from attribution_history. null/short → no verdict.
// Returns 'WORKING' | 'DRAG' | 'FLAT' | null (null → render '—').
// ----------------------------------------------------------------
export function verdictForEffect(effect, trailing) {
    if (effect == null || !isFinite(effect)) return null;
    if (effect < 0) return 'DRAG';
    if (!trailing || trailing.length < 12) return null; // no trailing history → '—'
    var vals = trailing.filter(function(v) { return v != null && isFinite(v); }).slice().sort(function(a, b) { return a - b; });
    if (vals.length < 12) return null;
    var median = vals.length % 2
        ? vals[(vals.length - 1) / 2]
        : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
    return effect > median ? 'WORKING' : 'FLAT';
}
