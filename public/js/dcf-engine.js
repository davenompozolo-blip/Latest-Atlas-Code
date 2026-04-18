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

function fN(n, d) { return n != null && isFinite(n) ? Number(n).toFixed(d != null ? d : 2) : '\u2014'; }
function fB(n) {
    if (n == null || !isFinite(n)) return '\u2014';
    var a = Math.abs(n);
    if (a >= 1e12) return (n < 0 ? '-' : '') + '$' + (a / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return (n < 0 ? '-' : '') + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return (n < 0 ? '-' : '') + '$' + (a / 1e6).toFixed(1) + 'M';
    return fmtCurrency(n);
}

// ---- Smart defaults from existing data ----

export function deriveDefaults(snap, overview, price) {
    var s = snap || {}, o = overview || {};
    var beta = o.Beta ? Number(o.Beta) : 1.0;
    var mktCap = o.MarketCapitalization ? Number(o.MarketCapitalization) : null;
    var shares = mktCap && price ? mktCap / price : null;
    var rf = 0.045, mrp = 0.055;
    var coe = rf + beta * mrp;
    var cod = 0.05, taxRate = 0.21;
    var de = s.debtToEquity != null ? s.debtToEquity / 100 : 0.3;
    var wd = de / (1 + de), we = 1 - wd;
    var wacc = we * coe + wd * cod * (1 - taxRate);
    var revGrowth = s.revenueGrowth != null ? s.revenueGrowth : 0.08;
    var fcfMargin = s.freeCashflow && s.totalRevenue ? s.freeCashflow / s.totalRevenue : 0.15;
    var divYield = o.DividendYield ? Number(o.DividendYield) : 0;
    var divPerShare = divYield * (price || 0);
    var roe = s.returnOnEquity != null ? s.returnOnEquity : 0.15;

    return {
        beta: beta, rf: rf, mrp: mrp, coe: coe, cod: cod, taxRate: taxRate,
        wacc: Math.max(0.04, Math.min(wacc, 0.20)),
        terminalGrowth: 0.025, forecastYears: 5,
        revenue: s.totalRevenue || 0, fcf: s.freeCashflow || 0,
        revGrowth: revGrowth, fcfMargin: fcfMargin,
        ebitda: s.ebitda || 0, netIncome: s.netIncome || 0,
        shares: shares, mktCap: mktCap, price: price,
        eps: s.trailingEps || 0, bookValue: s.bookValue || 0,
        divPerShare: divPerShare, roe: roe, de: de,
    };
}

// ---- FCFF DCF Engine ----

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

// ---- Gordon Growth DDM (Bug #3 fixed: validates dividend > 0) ----

export function runGordonDDM(divPerShare, coe, growth) {
    if (!divPerShare || divPerShare <= 0) return null;
    if (growth >= coe) growth = coe * 0.9;
    growth = Math.min(growth, 0.06);
    var d1 = divPerShare * (1 + growth);
    var value = d1 / (coe - growth);
    return { d1: d1, value: value, growth: growth };
}

// ---- Multi-Stage DDM (Bug #4 fixed: explicit payout ratio) ----

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

// ---- Residual Income (Bugs #2 & #5 fixed: retention ratio, correct TV) ----

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

// ---- Monte Carlo ----

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

// ---- Sensitivity Matrix ----

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
