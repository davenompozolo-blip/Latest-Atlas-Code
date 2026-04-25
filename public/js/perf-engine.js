/**
 * perf-engine.js — Pure computation layer for ATLAS Terminal Performance Suite.
 * No React, no DOM, no Chart.js. ES modules with named exports only.
 */

export function computePortfolioMetrics(navSeries) {
    if (!navSeries || navSeries.length < 2) return null;
    var n = navSeries.length;
    var first = navSeries[0], last = navSeries[n - 1];
    var totalReturn = (last.nav - first.nav) / first.nav;
    var days = Math.max((new Date(last.price_date) - new Date(first.price_date)) / 86400000, 1);
    var annReturn = Math.pow(1 + totalReturn, 365.25 / days) - 1;

    var returns = [];
    for (var i = 0; i < n; i++) {
        var r = navSeries[i].daily_return;
        if (r == null && i > 0) r = (navSeries[i].nav - navSeries[i-1].nav) / navSeries[i-1].nav;
        if (r != null && isFinite(r)) returns.push({ date: navSeries[i].price_date, value: r });
    }
    if (!returns.length) return null;

    var vals = returns.map(function(r) { return r.value; });
    var mean = vals.reduce(function(s,v){return s+v;}, 0) / vals.length;
    var variance = vals.reduce(function(s,v){return s+(v-mean)*(v-mean);}, 0) / vals.length;
    var annVol = Math.sqrt(variance) * Math.sqrt(252);
    var sharpe = annVol > 0 ? (annReturn - 0.045) / annVol : null;

    var downVals = vals.filter(function(v){return v < 0;});
    var downVar = downVals.length > 0 ? downVals.reduce(function(s,v){return s+v*v;}, 0) / downVals.length : 0;
    var downsideDev = Math.sqrt(downVar) * Math.sqrt(252);
    var sortino = downsideDev > 0 ? (annReturn - 0.045) / downsideDev : null;

    var peak = navSeries[0].nav, maxDD = 0, currentDD = 0;
    for (var j = 0; j < n; j++) {
        if (navSeries[j].nav > peak) peak = navSeries[j].nav;
        var dd = (navSeries[j].nav - peak) / peak;
        if (dd < maxDD) maxDD = dd;
    }
    currentDD = (last.nav - peak) / peak;
    var calmar = maxDD < 0 ? annReturn / Math.abs(maxDD) : null;

    var sorted = vals.slice().sort(function(a,b){return a-b;});
    var var95Idx = Math.floor(sorted.length * 0.05);
    var var95 = sorted[var95Idx];
    var cvar95 = sorted.slice(0, var95Idx + 1).reduce(function(s,v){return s+v;}, 0) / (var95Idx + 1);

    var wins = vals.filter(function(v){return v > 0;}).length;
    var winRate = wins / vals.length;

    var bestIdx = 0, worstIdx = 0;
    for (var k = 1; k < returns.length; k++) {
        if (returns[k].value > returns[bestIdx].value) bestIdx = k;
        if (returns[k].value < returns[worstIdx].value) worstIdx = k;
    }

    return {
        totalReturn: totalReturn, annReturn: annReturn, annVol: annVol,
        sharpe: sharpe, sortino: sortino, maxDD: maxDD, currentDD: currentDD,
        calmar: calmar, var95: var95, cvar95: cvar95, winRate: winRate,
        bestDay: { date: returns[bestIdx].date, value: returns[bestIdx].value },
        worstDay: { date: returns[worstIdx].date, value: returns[worstIdx].value },
        avgDailyReturn: mean, daysOfHistory: n,
        startDate: first.price_date, endDate: last.price_date,
        startNav: first.nav, endNav: last.nav,
    };
}

export function computeDrawdownSeries(navSeries) {
    if (!navSeries || !navSeries.length) return [];
    var peak = navSeries[0].nav, result = [];
    for (var i = 0; i < navSeries.length; i++) {
        if (navSeries[i].nav > peak) peak = navSeries[i].nav;
        result.push({ date: navSeries[i].price_date, dd: (navSeries[i].nav - peak) / peak });
    }
    return result;
}

export function computeRollingMetrics(navSeries, window) {
    window = window || 90;
    if (!navSeries || navSeries.length < window + 1) return [];
    var returns = [];
    for (var i = 1; i < navSeries.length; i++) {
        var r = navSeries[i].daily_return;
        if (r == null) r = (navSeries[i].nav - navSeries[i-1].nav) / navSeries[i-1].nav;
        returns.push({ date: navSeries[i].price_date, value: r || 0 });
    }
    var result = [];
    for (var j = window - 1; j < returns.length; j++) {
        var slice = [];
        for (var k = j - window + 1; k <= j; k++) slice.push(returns[k].value);
        var mean = slice.reduce(function(s,v){return s+v;},0) / slice.length;
        var variance = slice.reduce(function(s,v){return s+(v-mean)*(v-mean);},0) / slice.length;
        var vol = Math.sqrt(variance) * Math.sqrt(252);
        var annRet = mean * 252;
        var sharpe = vol > 0 ? (annRet - 0.045) / vol : 0;
        result.push({ date: returns[j].date, sharpe: sharpe, vol: vol });
    }
    return result;
}

export function computeReturnsBins(navSeries, binCount) {
    binCount = binCount || 40;
    var returns = [];
    for (var i = 1; i < navSeries.length; i++) {
        var r = navSeries[i].daily_return;
        if (r == null) r = (navSeries[i].nav - navSeries[i-1].nav) / navSeries[i-1].nav;
        if (r != null && isFinite(r)) returns.push(r);
    }
    if (!returns.length) return [];
    var min = returns.reduce(function(a,b){return Math.min(a,b);});
    var max = returns.reduce(function(a,b){return Math.max(a,b);});
    var bw = (max - min) / binCount;
    if (bw === 0) return [];
    var bins = [];
    for (var b = 0; b < binCount; b++) {
        var lo = min + b * bw, ct = 0;
        for (var j = 0; j < returns.length; j++) if (returns[j] >= lo && returns[j] < lo + bw) ct++;
        bins.push({ mid: (lo + bw/2) * 100, count: ct });
    }
    return bins;
}

export function computeMonthlyReturns(navSeries) {
    if (!navSeries || navSeries.length < 22) return [];
    var months = {};
    for (var i = 0; i < navSeries.length; i++) {
        var ym = navSeries[i].price_date.slice(0, 7);
        if (!months[ym]) months[ym] = { first: navSeries[i].nav, last: navSeries[i].nav, date: navSeries[i].price_date };
        months[ym].last = navSeries[i].nav;
    }
    var keys = Object.keys(months).sort();
    var result = [];
    for (var j = 1; j < keys.length; j++) {
        var prev = months[keys[j-1]];
        var cur = months[keys[j]];
        result.push({
            year: parseInt(keys[j].slice(0,4)),
            month: parseInt(keys[j].slice(5,7)),
            ret: (cur.last - prev.last) / prev.last,
        });
    }
    return result;
}

export function computeDrawdownPeriods(navSeries, top) {
    top = top || 5;
    if (!navSeries || navSeries.length < 2) return [];
    var peak = navSeries[0].nav, peakDate = navSeries[0].price_date;
    var periods = [], current = null;
    for (var i = 0; i < navSeries.length; i++) {
        var nav = navSeries[i].nav;
        if (nav >= peak) {
            if (current) { current.endDate = navSeries[i].price_date; current.recovered = true; periods.push(current); current = null; }
            peak = nav; peakDate = navSeries[i].price_date;
        } else {
            var dd = (nav - peak) / peak;
            if (!current) current = { startDate: peakDate, peakNav: peak, troughNav: nav, troughDate: navSeries[i].price_date, dd: dd, recovered: false };
            if (dd < current.dd) { current.dd = dd; current.troughNav = nav; current.troughDate = navSeries[i].price_date; }
        }
    }
    if (current) { current.endDate = navSeries[navSeries.length-1].price_date; periods.push(current); }
    periods.sort(function(a,b){return a.dd - b.dd;});
    return periods.slice(0, top);
}

export function computeCumulativeReturns(navSeries) {
    if (!navSeries || !navSeries.length) return [];
    var base = navSeries[0].nav;
    return navSeries.map(function(d) { return { date: d.price_date, value: (d.nav - base) / base }; });
}

export function computePeriodReturns(navSeries) {
    if (!navSeries || navSeries.length < 2) return {};
    var n = navSeries.length, last = navSeries[n-1].nav;
    function retBack(days) {
        if (n <= days) return null;
        return last / navSeries[n - 1 - days].nav - 1;
    }
    var lastDate = navSeries[n-1].price_date;
    var mtdStart = lastDate.slice(0,8) + '01';
    var ytdStart = lastDate.slice(0,5) + '01-01';
    function retFrom(startStr) {
        for (var i = 0; i < n; i++) {
            if (navSeries[i].price_date >= startStr) return last / navSeries[i].nav - 1;
        }
        return null;
    }
    return {
        ret1d: retBack(1), ret1w: retBack(5), ret1m: retBack(21),
        ret3m: retBack(63), ret6m: retBack(126), ret1y: retBack(252),
        mtd: retFrom(mtdStart), ytd: retFrom(ytdStart),
        inception: (last - navSeries[0].nav) / navSeries[0].nav,
    };
}

// ----------------------------------------------------------------
// computePositionContributions
// Returns each position's contribution to portfolio return,
// sorted descending by absolute contribution.
// ----------------------------------------------------------------
export function computePositionContributions(positions) {
    if (!positions || !positions.length) return [];
    var totalMv = positions.reduce(function(s, p) { return s + Math.abs(Number(p.market_value) || 0); }, 0);
    if (!totalMv) return [];
    var out = positions.map(function(p) {
        var mv  = Math.abs(Number(p.market_value) || 0);
        var ret = Number(p.total_return_pct || p.unrealised_return_pct || 0);
        var wt  = mv / totalMv;
        var contrib = wt * ret;
        return {
            symbol: p.symbol,
            name: p.asset_name || p.name || p.symbol,
            sector: p.sector || 'Other',
            weight: wt,
            ret: ret,
            contribution: contrib,
            marketValue: mv,
        };
    });
    out.sort(function(a, b) { return b.contribution - a.contribution; });
    return out;
}

// ----------------------------------------------------------------
// computeBrinsonAttribution
// Brinson-Fachler model using the portfolio itself as reference.
//   Benchmark weights = equal weight across sectors (1/N_sectors)
//   Benchmark sector return = equal-weight avg return within sector
//   Allocation  = (wp - wb) × (rb_sector - Rb_total)
//   Selection   = wb × (rp_sector - rb_sector)
//   Interaction = (wp - wb) × (rp_sector - rb_sector)
// ----------------------------------------------------------------
export function computeBrinsonAttribution(positions) {
    if (!positions || !positions.length) return null;
    var totalMv = positions.reduce(function(s, p) { return s + Math.abs(Number(p.market_value) || 0); }, 0);
    if (!totalMv) return null;

    // Group by sector
    var bySector = {};
    positions.forEach(function(p) {
        var sec = p.sector || 'Other';
        var mv  = Math.abs(Number(p.market_value) || 0);
        var ret = Number(p.total_return_pct || p.unrealised_return_pct || 0);
        if (!bySector[sec]) bySector[sec] = { mv: 0, sumRet: 0, count: 0, positions: [] };
        bySector[sec].mv    += mv;
        bySector[sec].sumRet += ret;
        bySector[sec].count += 1;
        bySector[sec].positions.push(p);
    });

    var sectors = Object.keys(bySector);
    var N = sectors.length;
    var benchWeight = 1 / N;    // equal weight benchmark

    // Compute portfolio weight + portfolio sector return (value-weighted)
    // and benchmark sector return (equal-weight avg within sector)
    sectors.forEach(function(sec) {
        var s = bySector[sec];
        s.portfolioWeight = s.mv / totalMv;
        // Portfolio sector return = value-weighted avg return of positions in sector
        var sumWR = 0;
        s.positions.forEach(function(p) {
            var mv  = Math.abs(Number(p.market_value) || 0);
            var ret = Number(p.total_return_pct || p.unrealised_return_pct || 0);
            sumWR += (mv / s.mv) * ret;
        });
        s.portfolioSectorReturn = sumWR;
        // Benchmark sector return = simple average return within sector
        s.benchmarkSectorReturn = s.sumRet / s.count;
    });

    // Total portfolio return (value-weighted across all positions)
    var portfolioReturn = sectors.reduce(function(sum, sec) {
        var s = bySector[sec];
        return sum + s.portfolioWeight * s.portfolioSectorReturn;
    }, 0);

    // Total benchmark return (equal-weight of benchmark sector returns)
    var benchmarkReturn = sectors.reduce(function(sum, sec) {
        return sum + benchWeight * bySector[sec].benchmarkSectorReturn;
    }, 0);

    // Brinson-Fachler decomposition
    var attribution = sectors.map(function(sec) {
        var s   = bySector[sec];
        var wp  = s.portfolioWeight;
        var wb  = benchWeight;
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
