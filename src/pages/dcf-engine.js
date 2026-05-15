import React from 'react';
import { fmt, fmtCurrency, cls, useChart } from './utils.js';

const { useState, useRef, useEffect } = React;

// ---- Shared UI atoms ----

function Tile(p) {
    return React.createElement('div', { className: 'metric-card' },
        React.createElement('div', { className: 'label' }, p.label),
        React.createElement('div', { className: 'value', style: p.color ? { color: p.color } : null }, p.value),
        p.sub ? React.createElement('div', { className: 'sub' }, p.sub) : null
    );
}

function SubTab(p) {
    return React.createElement('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 } },
        p.tabs.map(function(t) {
            var a = t.id === p.active;
            return React.createElement('button', {
                key: t.id, onClick: function() { p.onSelect(t.id); },
                style: {
                    background: a ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                    color: a ? '#00d4ff' : 'rgba(255,255,255,0.6)',
                    border: '1px solid ' + (a ? 'rgba(0,212,255,0.3)' : 'rgba(255,255,255,0.06)'),
                    borderRadius: 6, padding: '6px 14px', fontSize: 11,
                    fontWeight: a ? 600 : 400, cursor: 'pointer',
                    textTransform: 'uppercase', letterSpacing: 0.8,
                }
            }, t.label);
        })
    );
}

function Slider(p) {
    return React.createElement('div', { style: { marginBottom: 12 } },
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-sec)', marginBottom: 4 } },
            React.createElement('span', null, p.label),
            React.createElement('span', { style: { fontFamily: "'JetBrains Mono', monospace", color: '#00d4ff' } }, p.fmt ? p.fmt(p.value) : p.value)
        ),
        React.createElement('input', {
            type: 'range', min: p.min, max: p.max, step: p.step || 0.1, value: p.value,
            onChange: function(e) { p.onChange(parseFloat(e.target.value)); },
            style: { width: '100%', accentColor: '#00d4ff' }
        })
    );
}

function fN(n, d) { return n != null && isFinite(n) ? Number(n).toFixed(d != null ? d : 2) : '—'; }
function fB(n) {
    if (n == null || !isFinite(n)) return '—';
    var a = Math.abs(n);
    if (a >= 1e12) return (n < 0 ? '-' : '') + '$' + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return (n < 0 ? '-' : '') + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (n < 0 ? '-' : '') + '$' + (a / 1e6).toFixed(1) + 'M';
    return fmtCurrency(n);
}

// ============================================================
// Sector Benchmarks (from atlas_dcf_institutional.py + core/calculations.py)
// Keyed by Alpha Vantage Sector string (case-insensitive lookup below)
// ============================================================

var SECTOR_BENCHMARKS = {
    'technology':             { revGrowth: 0.12, fcfMargin: 0.20, capexPct: 0.03, daPct: 0.04, nwcPct: 0.015, sbcPct: 0.04 },
    'healthcare':             { revGrowth: 0.08, fcfMargin: 0.16, capexPct: 0.04, daPct: 0.05, nwcPct: 0.020, sbcPct: 0.02 },
    'financial services':     { revGrowth: 0.06, fcfMargin: 0.25, capexPct: 0.02, daPct: 0.02, nwcPct: 0.005, sbcPct: 0.01 },
    'financials':             { revGrowth: 0.06, fcfMargin: 0.25, capexPct: 0.02, daPct: 0.02, nwcPct: 0.005, sbcPct: 0.01 },
    'consumer cyclical':      { revGrowth: 0.06, fcfMargin: 0.08, capexPct: 0.05, daPct: 0.04, nwcPct: 0.025, sbcPct: 0.01 },
    'consumer discretionary': { revGrowth: 0.06, fcfMargin: 0.08, capexPct: 0.05, daPct: 0.04, nwcPct: 0.025, sbcPct: 0.01 },
    'consumer defensive':     { revGrowth: 0.04, fcfMargin: 0.10, capexPct: 0.04, daPct: 0.04, nwcPct: 0.020, sbcPct: 0.01 },
    'consumer staples':       { revGrowth: 0.04, fcfMargin: 0.10, capexPct: 0.04, daPct: 0.04, nwcPct: 0.020, sbcPct: 0.01 },
    'energy':                 { revGrowth: 0.04, fcfMargin: 0.12, capexPct: 0.10, daPct: 0.08, nwcPct: 0.010, sbcPct: 0.01 },
    'industrials':            { revGrowth: 0.06, fcfMargin: 0.09, capexPct: 0.06, daPct: 0.05, nwcPct: 0.025, sbcPct: 0.01 },
    'basic materials':        { revGrowth: 0.04, fcfMargin: 0.10, capexPct: 0.08, daPct: 0.07, nwcPct: 0.020, sbcPct: 0.01 },
    'materials':              { revGrowth: 0.04, fcfMargin: 0.10, capexPct: 0.08, daPct: 0.07, nwcPct: 0.020, sbcPct: 0.01 },
    'real estate':            { revGrowth: 0.04, fcfMargin: 0.18, capexPct: 0.15, daPct: 0.06, nwcPct: 0.005, sbcPct: 0.005 },
    'utilities':              { revGrowth: 0.03, fcfMargin: 0.14, capexPct: 0.20, daPct: 0.08, nwcPct: 0.005, sbcPct: 0.005 },
    'communication services': { revGrowth: 0.07, fcfMargin: 0.16, capexPct: 0.08, daPct: 0.06, nwcPct: 0.015, sbcPct: 0.03 },
    'telecommunications':     { revGrowth: 0.04, fcfMargin: 0.14, capexPct: 0.12, daPct: 0.08, nwcPct: 0.010, sbcPct: 0.01 },
};

function getSectorBenchmark(sector) {
    if (!sector) return null;
    return SECTOR_BENCHMARKS[sector.toLowerCase().trim()] || null;
}

function sizeAdj(mktCap) {
    if (!mktCap) return 0;
    if (mktCap >= 500e9) return -0.03;
    if (mktCap >= 100e9) return -0.01;
    if (mktCap >= 10e9)  return  0.00;
    return 0.01;
}

// ============================================================
// Smart defaults (sector-aware, Python-faithful)
// Signature unchanged — all callers (ConsensusPanel, FcffPanel, etc.) unaffected
// ============================================================

export function deriveDefaults(snap, overview, price) {
    var s = snap || {}, o = overview || {};
    var beta = o.Beta ? Number(o.Beta) : 1.0;
    var mktCap = o.MarketCapitalization ? Number(o.MarketCapitalization) : null;
    var shares = mktCap && price ? mktCap / price : null;

    // CAPM + WACC
    var rf = 0.045, mrp = 0.055;
    var coe = rf + beta * mrp;
    var cod = 0.05, taxRate = 0.21;
    var de = s.debtToEquity != null ? s.debtToEquity / 100 : 0.3;
    var wd = de / (1 + de), we = 1 - wd;
    var wacc = we * coe + wd * cod * (1 - taxRate);

    // Sector benchmark lookup — use when actual data is absent
    var sector = o.Sector || o.sector || null;
    var bench = getSectorBenchmark(sector);

    // Revenue growth: prefer reported, fall back to sector benchmark + size adj
    var revGrowthReported = s.revenueGrowth != null ? s.revenueGrowth : null;
    var benchGrowth = bench ? bench.revGrowth + sizeAdj(mktCap) : 0.08;
    var revGrowth = revGrowthReported != null
        ? Math.max(revGrowthReported, benchGrowth * 0.5)   // floor at half benchmark
        : benchGrowth;
    revGrowth = Math.max(-0.10, Math.min(revGrowth, 0.50));

    // FCF margin: prefer actual FCF/Revenue, fall back to sector benchmark
    var fcfActual = s.freeCashflow && s.totalRevenue && s.totalRevenue > 0
        ? s.freeCashflow / s.totalRevenue
        : null;
    var benchMargin = bench ? bench.fcfMargin : 0.12;
    var fcfMargin = fcfActual != null
        ? Math.max(fcfActual, benchMargin * 0.3)  // don't let negative FCF crush it entirely
        : benchMargin;
    fcfMargin = Math.max(-0.10, Math.min(fcfMargin, 0.60));

    var divYield = o.DividendYield ? Number(o.DividendYield) : 0;
    var divPerShare = divYield * (price || 0);
    var roe = s.returnOnEquity != null ? s.returnOnEquity : 0.15;

    return {
        beta: beta, rf: rf, mrp: mrp, coe: coe, cod: cod, taxRate: taxRate,
        wacc: Math.max(0.04, Math.min(wacc, 0.20)),
        terminalGrowth: 0.025, forecastYears: 5,
        revenue: s.totalRevenue || 0, fcf: s.freeCashflow || 0,
        revGrowth: revGrowth, fcfMargin: fcfMargin,
        // Sector-derived operating assumptions for multi-stage / projection table
        capexPct: bench ? bench.capexPct : 0.05,
        daPct:    bench ? bench.daPct    : 0.04,
        nwcPct:   bench ? bench.nwcPct   : 0.020,
        sbcPct:   bench ? bench.sbcPct   : 0.02,
        sector: sector,
        ebitda: s.ebitda || 0, netIncome: s.netIncome || 0,
        shares: shares, mktCap: mktCap, price: price,
        eps: s.trailingEps || 0, bookValue: s.bookValue || 0,
        divPerShare: divPerShare, roe: roe, de: de,
    };
}

// ============================================================
// DCF Trap Detector (5 institutional checks)
// Source: analytics/dcf_trap_detector.py
// ============================================================

export function detectTraps(defaults, wacc, tg, fcfMargin, dcfResult) {
    var warnings = [];
    if (!defaults || !dcfResult) return warnings;

    // Trap 1: Terminal Value Dependency
    var tvPct = dcfResult.tvPct;
    if (tvPct != null) {
        if (tvPct > 0.85) {
            warnings.push({
                id: 'TV_DEPENDENCY',
                severity: 'CRITICAL',
                title: 'Terminal Value Dominance',
                description: (tvPct * 100).toFixed(0) + '% of enterprise value sits in the terminal value. Small changes to WACC or terminal growth dramatically change the output.',
                metric: (tvPct * 100).toFixed(0) + '%',
                recommendation: 'Extend forecast years to 7–10, or reduce terminal growth to compress TV weight.'
            });
        } else if (tvPct > 0.75) {
            warnings.push({
                id: 'TV_DEPENDENCY',
                severity: 'HIGH',
                title: 'Elevated Terminal Value Weight',
                description: (tvPct * 100).toFixed(0) + '% of EV is terminal value — above the 75% institutional caution threshold.',
                metric: (tvPct * 100).toFixed(0) + '%',
                recommendation: 'Consider extending the explicit forecast period.'
            });
        }
    }

    // Trap 2: Discount Rate Illusion
    var minWacc = defaults.rf + 0.02;
    var flags2 = 0;
    if (wacc < minWacc) flags2++;
    if (defaults.beta < 0.8) {
        var defensiveSectors = ['utilities', 'consumer defensive', 'consumer staples', 'real estate'];
        var sectorLc = (defaults.sector || '').toLowerCase();
        if (!defensiveSectors.some(function(d) { return sectorLc.includes(d); })) flags2++;
    }
    if (wacc < 0.07 && defaults.de > 1.0) flags2++;
    if (flags2 >= 2) {
        warnings.push({
            id: 'DISCOUNT_RATE_ILLUSION',
            severity: flags2 >= 3 ? 'CRITICAL' : 'HIGH',
            title: 'Discount Rate May Be Too Low',
            description: 'WACC of ' + (wacc * 100).toFixed(1) + '% appears insufficient given company risk profile (' + flags2 + ' flag' + (flags2 > 1 ? 's' : '') + ' triggered).',
            metric: (wacc * 100).toFixed(1) + '%',
            recommendation: 'Verify beta, capital structure, and cost of debt inputs. Industry WACC benchmarks typically range 8–12%.'
        });
    } else if (flags2 === 1) {
        warnings.push({
            id: 'DISCOUNT_RATE_ILLUSION',
            severity: 'MEDIUM',
            title: 'Verify Discount Rate',
            description: 'One risk-underpricing indicator detected (WACC ' + (wacc * 100).toFixed(1) + '%).',
            metric: (wacc * 100).toFixed(1) + '%',
            recommendation: 'Cross-check WACC against sector peers before relying on this valuation.'
        });
    }

    // Trap 3: Terminal Growth Exceeds Long-Run GDP
    var gdpProxy = 0.025;
    if (tg > gdpProxy + 0.015) {
        warnings.push({
            id: 'TG_EXCEEDS_GDP',
            severity: 'HIGH',
            title: 'Terminal Growth Above GDP',
            description: 'Terminal growth of ' + (tg * 100).toFixed(1) + '% implies the company grows faster than the economy in perpetuity — mechanically impossible.',
            metric: (tg * 100).toFixed(1) + '%',
            recommendation: 'Cap terminal growth at 2.0–2.5% (long-run nominal GDP).'
        });
    } else if (tg > gdpProxy + 0.005) {
        warnings.push({
            id: 'TG_EXCEEDS_GDP',
            severity: 'MEDIUM',
            title: 'Terminal Growth Above GDP Trend',
            description: 'Terminal growth of ' + (tg * 100).toFixed(1) + '% is above the consensus long-run GDP estimate of ~2.5%.',
            metric: (tg * 100).toFixed(1) + '%',
            recommendation: 'Verify if the company has a structural advantage justifying above-GDP terminal growth.'
        });
    }

    // Trap 4: Unwarranted Margin Expansion
    var historicalMargin = defaults.fcf && defaults.revenue > 0 ? defaults.fcf / defaults.revenue : null;
    if (historicalMargin != null && historicalMargin > 0) {
        var expansion = fcfMargin / historicalMargin;
        if (expansion > 2.0) {
            warnings.push({
                id: 'MARGIN_EXPANSION',
                severity: 'HIGH',
                title: 'Aggressive Margin Expansion',
                description: 'Projected FCF margin (' + (fcfMargin * 100).toFixed(1) + '%) is ' + expansion.toFixed(1) + '× the historical margin (' + (historicalMargin * 100).toFixed(1) + '%). This requires identifying a specific operational catalyst.',
                metric: expansion.toFixed(1) + '× historical',
                recommendation: 'Justify margin expansion with operating leverage, mix shift, or cost programme evidence.'
            });
        } else if (expansion > 1.5) {
            warnings.push({
                id: 'MARGIN_EXPANSION',
                severity: 'MEDIUM',
                title: 'Material Margin Expansion Assumed',
                description: 'FCF margin projected to expand ' + ((expansion - 1) * 100).toFixed(0) + '% above historical levels.',
                metric: '+' + ((expansion - 1) * 100).toFixed(0) + '% vs. history',
                recommendation: 'Confirm with operational evidence or sensitivity analysis.'
            });
        }
    }

    // Trap 5: Negative FCF Base (structural loss-maker)
    if (defaults.fcf < 0 && defaults.revenue > 0) {
        warnings.push({
            id: 'NEGATIVE_FCF',
            severity: 'HIGH',
            title: 'Negative Historical FCF',
            description: 'The company currently generates negative free cash flow (' + fB(defaults.fcf) + '). DCF assumes future positive FCF — the path to profitability must be credible.',
            metric: fB(defaults.fcf),
            recommendation: 'Validate by identifying the specific revenue threshold or cost reductions that achieve FCF break-even.'
        });
    }

    return warnings;
}

// ============================================================
// FCFF DCF Engine (single-stage)
// ============================================================

export function runFCFF(defaults, wacc, tg, revG, fcfM, years) {
    var rev = defaults.revenue;
    if (!rev || !defaults.shares) return null;
    var projections = [];
    for (var y = 1; y <= years; y++) {
        rev = rev * (1 + revG);
        var fcf = rev * fcfM;
        var pv = fcf / Math.pow(1 + wacc, y);
        projections.push({ year: y, revenue: rev, fcf: fcf, pvFcf: pv });
    }
    var lastFcf = projections[projections.length - 1].fcf;
    var tv = lastFcf * (1 + tg) / (wacc - tg);
    if (wacc <= tg) tv = lastFcf * 20;
    var pvTv = tv / Math.pow(1 + wacc, years);
    var pvFcfSum = projections.reduce(function(s, p) { return s + p.pvFcf; }, 0);
    var evTotal = pvFcfSum + pvTv;
    var eqValue = evTotal - (defaults.de * defaults.mktCap / (1 + defaults.de));
    if (eqValue < 0) eqValue = evTotal;
    var perShare = eqValue / defaults.shares;
    var upside = defaults.price ? perShare / defaults.price - 1 : null;

    return {
        projections: projections, tv: tv, pvTv: pvTv, pvFcfSum: pvFcfSum,
        evTotal: evTotal, eqValue: eqValue, perShare: perShare, upside: upside,
        tvPct: pvTv / evTotal,
    };
}

// ============================================================
// Multi-Stage FCFF DCF (2-stage or 3-stage)
// Source: analytics/multistage_dcf.py → MultiStageProjectionEngine
// ============================================================

export function runMultiStageFCFF(defaults, stages, tg) {
    // stages: [{name, years, revGrowthStart, revGrowthEnd, ebitMargin, capexPct, daPct, nwcPct, sbcPct}]
    if (!defaults.revenue || !defaults.shares || !stages || !stages.length) return null;
    var wacc = defaults.wacc;
    var taxRate = defaults.taxRate;

    var projections = [];
    var globalYear = 0;
    var rev = defaults.revenue;

    for (var si = 0; si < stages.length; si++) {
        var st = stages[si];
        for (var yi = 0; yi < st.years; yi++) {
            globalYear++;
            // Linear growth interpolation within stage (Python-faithful)
            var progress = st.years > 1 ? yi / (st.years - 1) : 0;
            var revG = st.revGrowthStart + (st.revGrowthEnd - st.revGrowthStart) * progress;
            rev = rev * (1 + revG);

            var ebit = rev * st.ebitMargin;
            var nopat = ebit * (1 - taxRate);
            var da = rev * (st.daPct || defaults.daPct || 0.04);
            var capex = -rev * (st.capexPct || defaults.capexPct || 0.05);
            var prevRev = projections.length > 0 ? projections[projections.length - 1].revenue : defaults.revenue;
            var nwcChange = -(rev - prevRev) * (st.nwcPct || defaults.nwcPct || 0.02);
            var sbc = -rev * (st.sbcPct || defaults.sbcPct || 0.02);
            var fcff = nopat + da + capex + nwcChange + sbc;
            var pv = fcff / Math.pow(1 + wacc, globalYear);

            projections.push({
                year: globalYear, stage: st.name || ('Stage ' + (si + 1)),
                revenue: rev, revGrowth: revG,
                ebit: ebit, ebitMargin: st.ebitMargin,
                nopat: nopat, da: da, capex: capex, nwcChange: nwcChange, sbc: sbc,
                fcff: fcff, pvFcf: pv,
            });
        }
    }

    if (!projections.length) return null;
    var lastFcff = projections[projections.length - 1].fcff;
    var tv = (wacc > tg) ? lastFcff * (1 + tg) / (wacc - tg) : lastFcff * 20;
    var pvTv = tv / Math.pow(1 + wacc, globalYear);
    var pvFcfSum = projections.reduce(function(s, p) { return s + p.pvFcf; }, 0);
    var evTotal = pvFcfSum + pvTv;
    var netDebt = defaults.de * (defaults.mktCap || 0) / (1 + defaults.de);
    var eqValue = Math.max(evTotal - netDebt, evTotal * 0.1);
    var perShare = eqValue / defaults.shares;
    var upside = defaults.price ? perShare / defaults.price - 1 : null;

    return {
        projections: projections, tv: tv, pvTv: pvTv, pvFcfSum: pvFcfSum,
        evTotal: evTotal, eqValue: eqValue, perShare: perShare, upside: upside,
        tvPct: pvTv / evTotal, wacc: wacc, tg: tg,
    };
}

// ============================================================
// Gordon Growth DDM
// ============================================================

export function runGordonDDM(divPerShare, coe, growth) {
    if (!divPerShare || divPerShare <= 0) return null;
    if (growth >= coe) growth = coe * 0.9;
    growth = Math.min(growth, 0.06);
    var d1 = divPerShare * (1 + growth);
    var value = d1 / (coe - growth);
    return { d1: d1, value: value, growth: growth };
}

// ============================================================
// Multi-Stage DDM
// ============================================================

export function runMultiStageDDM(divPerShare, coe, highG, stableG, highYears) {
    if (!divPerShare || divPerShare <= 0) return null;
    stableG = Math.min(stableG, 0.06);
    if (stableG >= coe) stableG = coe * 0.9;
    var pvDiv = 0, curDiv = divPerShare;
    var divStream = [];
    for (var y = 1; y <= highYears; y++) {
        curDiv = curDiv * (1 + highG);
        var pv = curDiv / Math.pow(1 + coe, y);
        pvDiv += pv;
        divStream.push({ year: y, div: curDiv, pv: pv });
    }
    var termDiv = curDiv * (1 + stableG);
    var tv = termDiv / (coe - stableG);
    var pvTv = tv / Math.pow(1 + coe, highYears);
    var value = pvDiv + pvTv;
    return { pvDiv: pvDiv, tv: tv, pvTv: pvTv, value: value, divStream: divStream };
}

// ============================================================
// Residual Income
// ============================================================

export function runResidualIncome(bvPS, roe, coe, growth, years, retentionRatio) {
    if (!bvPS || bvPS <= 0) return null;
    roe = Math.max(0.01, Math.min(roe, 0.60));
    growth = Math.min(growth, 0.06);
    if (growth >= coe) growth = coe * 0.9;
    var ret = retentionRatio != null ? retentionRatio : 0.6;
    var pvRI = 0, bv = bvPS;
    var riStream = [];
    for (var y = 1; y <= years; y++) {
        var ni = roe * bv;
        var ri = (roe - coe) * bv;
        var pv = ri / Math.pow(1 + coe, y);
        pvRI += pv;
        riStream.push({ year: y, bv: bv, ni: ni, ri: ri, pv: pv });
        bv = bv + ni * ret;
    }
    var termRI = (roe - coe) * bv * (1 + growth);
    var tv = (coe - growth) > 0.001 ? termRI / (coe - growth) : 0;
    var pvTv = tv / Math.pow(1 + coe, years);
    var value = bvPS + pvRI + pvTv;
    return { pvRI: pvRI, tv: tv, pvTv: pvTv, value: value, riStream: riStream, bvPS: bvPS };
}

// ============================================================
// Monte Carlo
// ============================================================

export function runMonteCarlo(defaults, baseWacc, baseTg, baseRevG, baseFcfM, years, n) {
    if (!defaults.revenue || !defaults.shares) return null;
    var results = [];
    for (var i = 0; i < n; i++) {
        var w = baseWacc + (Math.random() - 0.5) * 0.04;
        var tg = baseTg + (Math.random() - 0.5) * 0.02;
        var rg = baseRevG + (Math.random() - 0.5) * 0.06;
        var fm = baseFcfM + (Math.random() - 0.5) * 0.08;
        w = Math.max(0.03, w); tg = Math.min(tg, w - 0.005); tg = Math.max(0, tg);
        fm = Math.max(0.02, Math.min(fm, 0.50));
        var r = runFCFF(defaults, w, tg, rg, fm, years);
        if (r) results.push(r.perShare);
    }
    results.sort(function(a, b) { return a - b; });
    var mean = results.reduce(function(s, v) { return s + v; }, 0) / results.length;
    var p10 = results[Math.floor(results.length * 0.10)];
    var p25 = results[Math.floor(results.length * 0.25)];
    var p50 = results[Math.floor(results.length * 0.50)];
    var p75 = results[Math.floor(results.length * 0.75)];
    var p90 = results[Math.floor(results.length * 0.90)];

    var min = results[0], max = results[results.length - 1];
    var binCt = 30, bw = (max - min) / binCt;
    var bins = [];
    for (var b = 0; b < binCt; b++) {
        var lo = min + b * bw, ct = 0;
        for (var j = 0; j < results.length; j++) if (results[j] >= lo && results[j] < lo + bw) ct++;
        bins.push({ mid: lo + bw / 2, count: ct });
    }
    return { mean: mean, p10: p10, p25: p25, p50: p50, p75: p75, p90: p90, bins: bins, n: results.length };
}

// ============================================================
// Sensitivity Matrix
// ============================================================

export function runSensitivity(defaults, baseRevG, baseFcfM, years) {
    var waccRange = [0.06, 0.08, 0.10, 0.12, 0.14, 0.16];
    var tgRange = [0.01, 0.015, 0.02, 0.025, 0.03, 0.035];
    var rows = [];
    for (var ti = 0; ti < tgRange.length; ti++) {
        var cells = [];
        for (var wi = 0; wi < waccRange.length; wi++) {
            var r = runFCFF(defaults, waccRange[wi], tgRange[ti], baseRevG, baseFcfM, years);
            cells.push(r ? r.perShare : null);
        }
        rows.push({ tg: tgRange[ti], cells: cells });
    }
    return { waccRange: waccRange, rows: rows };
}

export { Tile, SubTab, Slider, fN, fB };
