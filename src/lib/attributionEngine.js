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
// ============================================================

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
export function computeBrinsonAttribution(positions, benchmarkWeights) {
    if (!positions || !positions.length) return null;
    var totalMv = positions.reduce(function(s, p) { return s + Math.abs(Number(p.market_value) || 0); }, 0);
    if (!totalMv) return null;

    var useEqualWeight = !benchmarkWeights;

    // Group by sector
    var bySector = {};
    positions.forEach(function(p) {
        var sec = p.sector || 'Other';
        var mv  = Math.abs(Number(p.market_value) || 0);
        var ret = Number(p.total_return_pct || p.unrealised_return_pct || 0);
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
            var ret = Number(p.total_return_pct || p.unrealised_return_pct || 0);
            sumWR += (mv / s.mv) * ret;
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
