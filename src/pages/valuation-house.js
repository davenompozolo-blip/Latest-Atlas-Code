import Chart from 'chart.js/auto';
import React from 'react';
// ============================================================
// ATLAS Terminal — Valuation House
// ------------------------------------------------------------
// Standalone CFA Level II equity valuation suite.
// Zero Supabase dependency — all computation is client-side.
// Eight sub-tabs: Dashboard, Setup, DDM, FCF, Multiples,
// Residual Income, Private Co., Sensitivity.
// ============================================================

import { ScrapbookSaveBar } from './scrapbook.js';
import {
    SECTOR_NORMS,
    resolveGICSSectorCode,
    deriveProvenance,
    computeCompassScore,
} from '../lib/valuationIntelligence.js';

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─── Formatting helpers ───────────────────────────────────────────────────────
const fp  = (v, d = 2) => v == null || isNaN(v) ? '—' : Number(v).toFixed(d);
const fpp = (v)        => v == null ? '—' : (v * 100).toFixed(2) + '%';
const fd  = (v, d = 2) => v == null || isNaN(v) ? '—' : '$' + fp(v, d);
const fM  = (v) => {
    if (v == null || isNaN(v)) return '—';
    var sign = v < 0 ? '-' : '';
    var abs = Math.abs(v);
    return abs >= 1000 ? sign + '$' + (abs / 1000).toFixed(2) + 'B' : sign + '$' + abs.toFixed(1) + 'M';
};
const pct = (v)        => v == null ? '—' : (v * 100).toFixed(2) + '%';

// ─── Signal helpers ───────────────────────────────────────────────────────────
function upside(v, price) {
    return (v != null && v > 0 && price > 0) ? (v - price) / price : null;
}
function signalLabel(v, price) {
    var u = upside(v, price);
    if (u == null) return '—';
    if (u > 0.20)  return 'STRONG BUY';
    if (u > 0.10)  return 'BUY';
    if (u > 0.02)  return 'OUTPERFORM';
    if (u > -0.02) return 'HOLD';
    if (u > -0.10) return 'UNDERPERFORM';
    return 'SELL';
}
function signalColor(v, price) {
    var u = upside(v, price);
    if (u == null) return 'var(--text-muted)';
    if (u > 0.10)  return 'var(--green)';
    if (u > 0)     return 'var(--cyan)';
    if (u > -0.10) return 'var(--amber)';
    return 'var(--red)';
}

// ─── Calculation engine ───────────────────────────────────────────────────────
function capm(rf, b, erp) { return rf + b * erp; }
function calcWACC(re, we, rd, wd, t) { return re * we + rd * (1 - t) * wd; }

function gordonGrowth(D0, g, r) {
    if (r <= g || D0 <= 0) return null;
    return D0 * (1 + g) / (r - g);
}

function hModel(D0, gS, gL, H, r) {
    if (r <= gL || D0 <= 0) return null;
    var lr = D0 * (1 + gL) / (r - gL);
    var gp = D0 * H * (gS - gL) / (r - gL);
    return { v: lr + gp, lr: lr, gp: gp };
}

function twoStageDDM(D0, gS, gL, n, r) {
    if (r <= gL || D0 <= 0) return null;
    var D = D0, pvS = 0, divs = [];
    for (var t = 1; t <= n; t++) {
        D *= (1 + gS);
        var p = D / Math.pow(1 + r, t);
        pvS += p;
        divs.push({ t: t, D: +D.toFixed(4), pv: +p.toFixed(4) });
    }
    var tv = D * (1 + gL) / (r - gL);
    var pvTV = tv / Math.pow(1 + r, n);
    return { v: pvS + pvTV, divs: divs, pvS: pvS, pvTV: pvTV, tv: tv, tvPct: pvTV / (pvS + pvTV) * 100 };
}

function fcffVal(f0, gr, gL, wc, debt, cash, shs) {
    if (wc <= gL || f0 <= 0) return null;
    var f = f0, pvS = 0;
    var proj = gr.map(function(g, i) {
        f *= (1 + g);
        var p = f / Math.pow(1 + wc, i + 1);
        pvS += p;
        return { t: i + 1, g: g, fcff: +f.toFixed(1), pv: +p.toFixed(1) };
    });
    var n = gr.length;
    var tv = f * (1 + gL) / (wc - gL);
    var pvTV = tv / Math.pow(1 + wc, n);
    var ev = pvS + pvTV;
    var eq = ev - debt + cash;
    return { eqPS: shs > 0 ? eq / shs : null, ev: ev, eq: eq, pvS: pvS, pvTV: pvTV, tv: tv, tvPct: pvTV / ev * 100, proj: proj };
}

function fcfeVal(f0, gr, gL, re, shs) {
    if (re <= gL || f0 <= 0) return null;
    var f = f0, pvS = 0;
    var proj = gr.map(function(g, i) {
        f *= (1 + g);
        var p = f / Math.pow(1 + re, i + 1);
        pvS += p;
        return { t: i + 1, g: g, fcfe: +f.toFixed(1), pv: +p.toFixed(1) };
    });
    var n = gr.length;
    var tv = f * (1 + gL) / (re - gL);
    var pvTV = tv / Math.pow(1 + re, n);
    var eq = pvS + pvTV;
    return { eqPS: shs > 0 ? eq / shs : null, eq: eq, pvS: pvS, pvTV: pvTV, tv: tv, tvPct: pvTV / eq * 100, proj: proj };
}

function jPELeading(b, r, g) { return r > g ? (1 - b) / (r - g) : null; }
function jPB(roe, r, g) { return r > g ? (roe - g) / (r - g) : null; }

function riCalc(B0, ROE, re, g, n, mth, omega) {
    if (B0 <= 0 || ROE <= 0 || re <= 0) return null;
    var ret = Math.min(0.99, g / Math.max(ROE, 0.001));
    var B = B0, pvS = 0, periods = [];
    for (var t = 1; t <= n; t++) {
        var NI = B * ROE;
        var RI = (ROE - re) * B;
        var p = RI / Math.pow(1 + re, t);
        pvS += p;
        periods.push({ t: t, B: +B.toFixed(2), NI: +NI.toFixed(2), RI: +RI.toFixed(2), pv: +p.toFixed(2) });
        B += NI * ret;
    }
    var RI_n = (ROE - re) * B;
    var tv = 0;
    if (mth === 'persistence' && re > omega) tv = RI_n / (re - omega);
    else if (mth === 'gordon' && re > g && RI_n > 0) tv = RI_n * (1 + g) / (re - g);
    var pvTV = tv / Math.pow(1 + re, n);
    return {
        v: B0 + pvS + pvTV, B0: B0, pvS: pvS, pvTV: pvTV, periods: periods,
        tvPct: Math.abs(pvTV) / (Math.abs(pvS) + Math.abs(pvTV) + B0) * 100,
    };
}

function privCalc(nE, mult, debt, cash, dlom, dloc, isCtrl, cp) {
    var ev   = nE * mult;
    var eq   = ev - debt + cash;
    var ctrl = eq * (1 + cp);
    var min  = eq * (1 - dloc) * (1 - dlom);
    return { ev: ev, eq: eq, ctrl: ctrl, min: min };
}

function buildConsensus(valMap, wts) {
    var totalWt = Object.keys(wts).reduce(function(a, k) {
        return a + (valMap[k] != null && valMap[k] > 0 ? wts[k] : 0);
    }, 0);
    if (totalWt === 0) return null;
    return Object.keys(wts).reduce(function(a, k) {
        return a + (valMap[k] != null && valMap[k] > 0 ? valMap[k] * wts[k] : 0);
    }, 0) / totalWt;
}

function detectTraps(s, re, wc) {
    var t = [];
    if (wc <= s.fcf.gL)
        t.push({ t: 'error',   m: 'WACC (' + pct(wc) + ') ≤ terminal growth (' + pct(s.fcf.gL) + '): FCFF model → TV = ∞.' });
    if (re <= s.ddm.gL)
        t.push({ t: 'error',   m: 're (' + pct(re) + ') ≤ DDM gL (' + pct(s.ddm.gL) + '): Gordon Growth undefined.' });
    if (s.fcf.gL > 0.04)
        t.push({ t: 'warning', m: 'Terminal growth ' + pct(s.fcf.gL) + ' exceeds ~4% nominal GDP. No firm grows faster than the economy in perpetuity.' });
    if (s.ri.ROE < re)
        t.push({ t: 'info',    m: 'ROE (' + pct(s.ri.ROE) + ') < re (' + pct(re) + '): RI < 0 — firm destroys value. Expect V₀ < B₀.' });
    if (s.ddm.D0 <= 0)
        t.push({ t: 'info',    m: 'D₀ = 0: DDM models inapplicable. Switch to FCF or RI.' });
    return t;
}

function buildSensGrid(s, wc) {
    var gLDeltas = [-0.015, -0.010, -0.005, 0, 0.005, 0.010, 0.015];
    var wLDeltas = [ 0.015,  0.010,  0.005, 0,-0.005,-0.010,-0.015];
    var colLabels = gLDeltas.map(function(d) { return ((s.fcf.gL + d) * 100).toFixed(1) + '%'; });
    var rowLabels = wLDeltas.map(function(d) { return ((wc + d) * 100).toFixed(1) + '%'; });
    var cells = wLDeltas.map(function(dW) {
        return gLDeltas.map(function(dG) {
            var gg = s.fcf.gL + dG;
            var ww = wc + dW;
            if (ww <= gg || gg <= 0 || ww <= 0) return null;
            var r = fcffVal(s.fcf.fcff0, s.fcf.gr, gg, ww, s.fcf.debt, s.fcf.cash, s.fcf.shs);
            return r && r.eqPS != null ? r.eqPS : null;
        });
    });
    return { cells: cells, colLabels: colLabels, rowLabels: rowLabels };
}

// ─── Constants ───────────────────────────────────────────────────────────────
var INIT = {
    co:   { name: 'ACME Corp', ticker: 'ACME', price: 45.00, sector: 'technology' },
    coc:  { rf: 0.044, beta: 1.20, erp: 0.055, rd: 0.048, wd: 0.20, tax: 0.21 },
    ddm:  { D0: 0.80, gS: 0.10, gL: 0.030, n: 5, H: 4, model: '2stage' },
    fcf:  { fcff0: 1200, fcfe0: 900, gr: [0.10, 0.09, 0.08, 0.06, 0.05],
            gL: 0.025, debt: 5000, cash: 2000, shs: 500, mode: 'fcff' },
    mult: { eps: 3.20, bvps: 18.50, ebitda: 2800, rev: 12000, b: 0.40,
            mktCap: 22500, netDebt: 3000, pPE: 22, pPB: 3.5, pEV: 14, pPS: 2.2 },
    ri:   { B0: 18.50, ROE: 0.145, g: 0.030, n: 5, mth: 'gordon', omega: 0.60 },
    priv: { nE: 8000, mult: 10, debt: 25000, cash: 5000, shs: 2000,
            dlom: 0.20, dloc: 0.15, isCtrl: false, cp: 0.25 },
    wts:  { ddm: 20, fcff: 25, fcfe: 20, mult: 20, ri: 15 },
};

var SECTORS = {
    technology:  { beta: 1.25, D0: 0.50, gS: 0.12, gL: 0.030, rd: 0.048, wd: 0.15, label: 'Technology' },
    financials:  { beta: 1.10, D0: 2.00, gS: 0.07, gL: 0.030, rd: 0.040, wd: 0.40, label: 'Financials' },
    healthcare:  { beta: 0.85, D0: 1.00, gS: 0.09, gL: 0.025, rd: 0.042, wd: 0.20, label: 'Healthcare' },
    energy:      { beta: 1.15, D0: 2.50, gS: 0.05, gL: 0.020, rd: 0.050, wd: 0.30, label: 'Energy' },
    utilities:   { beta: 0.60, D0: 3.00, gS: 0.04, gL: 0.020, rd: 0.045, wd: 0.45, label: 'Utilities' },
    consumer:    { beta: 0.80, D0: 1.50, gS: 0.07, gL: 0.025, rd: 0.040, wd: 0.20, label: 'Consumer' },
    industrials: { beta: 1.05, D0: 1.20, gS: 0.07, gL: 0.025, rd: 0.042, wd: 0.25, label: 'Industrials' },
    realestate:  { beta: 0.70, D0: 3.50, gS: 0.05, gL: 0.025, rd: 0.045, wd: 0.50, label: 'Real Estate' },
    materials:   { beta: 1.05, D0: 1.50, gS: 0.06, gL: 0.022, rd: 0.043, wd: 0.28, label: 'Materials' },
    comms:       { beta: 0.90, D0: 1.20, gS: 0.08, gL: 0.025, rd: 0.042, wd: 0.30, label: 'Comm. Services' },
    general:     { beta: 1.00, D0: 1.00, gS: 0.07, gL: 0.025, rd: 0.044, wd: 0.25, label: 'General' },
};

var INNER_TABS = [
    { k: 'dash',  l: '◈ Dashboard' },
    { k: 'setup', l: '⚙ Setup' },
    { k: 'ddm',   l: '💰 DDM' },
    { k: 'fcf',   l: '💸 FCF' },
    { k: 'mult',  l: '📊 Multiples' },
    { k: 'ri',    l: '📐 Residual Income' },
    { k: 'priv',  l: '🏢 Private Co.' },
    { k: 'sens',  l: '🔥 Sensitivity' },
];

// ─── Sector classifier — covers Yahoo Finance sectors, Finnhub GICS industries,
//     and Alpha Vantage sector strings. Pass both sector AND industry fields for
//     best coverage (Finnhub only returns an industry string, not a broad sector).
function sectorToKey(sector, industry) {
    // Build a list of strings to test, most authoritative first
    var candidates = [];
    if (sector)   candidates.push(sector.toLowerCase());
    if (industry && industry !== sector) candidates.push(industry.toLowerCase());

    for (var ci = 0; ci < candidates.length; ci++) {
        var s = candidates[ci];

        // ── Real Estate (check before industrials to avoid 'construction' clash)
        if (s.includes('real estate') || s.includes('reit') || s.includes('realty') ||
            s.includes('property trust'))
            return 'realestate';

        // ── Utilities
        if (s.includes('utilit') || s.includes('water utility') || s.includes('gas utility') ||
            s.includes('regulated gas') || s.includes('regulated electric') ||
            s.includes('regulated water') || s.includes('independent power'))
            return 'utilities';

        // ── Energy (check before industrials: pipelines, refiners)
        if (s.includes('energy') || s.includes('oil') || s.includes('gas e&p') ||
            s.includes('petroleum') || s.includes('coal') || s.includes('uranium') ||
            s.includes('pipeline') || s.includes('refin') || s.includes('midstream') ||
            s.includes('integrated oil') || s.includes('oil & gas') || s.includes('fossil'))
            return 'energy';

        // ── Healthcare (check before technology: med-tech overlap)
        if (s.includes('health') || s.includes('pharma') || s.includes('biotech') ||
            s.includes('medical') || s.includes('drug') || s.includes('hospital') ||
            s.includes('diagnostics') || s.includes('managed care') || s.includes('life science') ||
            s.includes('therapeut') || s.includes('clinical') || s.includes('genomic') ||
            s.includes('radiolog') || s.includes('dental') || s.includes('optometri') ||
            s.includes('medtech'))
            return 'healthcare';

        // ── Financials
        if (s.includes('financ') || s.includes('bank') || s.includes('insurance') ||
            s.includes('invest') || s.includes('asset management') || s.includes('credit') ||
            s.includes('mortgage') || s.includes('brokerage') || s.includes('capital market') ||
            s.includes('exchange') || s.includes('wealth') || s.includes('private equity') ||
            s.includes('financial service') || s.includes('diversified financial'))
            return 'financials';

        // ── Communication Services (before technology: internet, media)
        if (s.includes('communication service') || s.includes('telecom') || s.includes('wireless') ||
            s.includes('broadcasting') || s.includes('publishing') || s.includes('advertising') ||
            s.includes('interactive media') || s.includes('entertainment') ||
            s.includes('gaming & multimedia') || s.includes('electronic gaming') ||
            s.includes('social media') || s.includes('media'))
            return 'comms';

        // ── Technology
        if (s.includes('tech') || s.includes('software') || s.includes('semiconductor') ||
            s.includes('hardware') || s.includes('computer') || s.includes('internet content') ||
            s.includes('data center') || s.includes('cloud') || s.includes('cybersecur') ||
            s.includes('artificial intel') || s.includes('information tech') ||
            s.includes('electronic components') || s.includes('it service'))
            return 'technology';

        // ── Materials (before industrials: mining, chemicals overlap)
        if (s.includes('basic material') || s.includes('mining') || s.includes('gold') ||
            s.includes('silver') || s.includes('copper') || s.includes('steel') ||
            s.includes('aluminum') || s.includes('metal') || s.includes('chemical') ||
            s.includes('specialty chemical') || s.includes('agricultural input') ||
            s.includes('fertilizer') || s.includes('paper') || s.includes('forestry') ||
            s.includes('lumber') || s.includes('packaging') || s.includes('platinum') ||
            s.includes('precious metal') || s.includes('commodity'))
            return 'materials';

        // ── Industrials
        if (s.includes('industr') || s.includes('aerospace') || s.includes('defense') ||
            s.includes('airlin') || s.includes('railroad') || s.includes('transport') ||
            s.includes('logistics') || s.includes('machinery') || s.includes('construction') ||
            s.includes('engineering') || s.includes('farm & heavy') || s.includes('conglomerate') ||
            s.includes('waste') || s.includes('staffing') || s.includes('consulting') ||
            s.includes('commercial service') || s.includes('business service') ||
            s.includes('professional service') || s.includes('marine') || s.includes('trucking'))
            return 'industrials';

        // ── Consumer (cyclical + defensive: apparel, food, auto, travel, luxury)
        if (s.includes('consumer') || s.includes('retail') || s.includes('apparel') ||
            s.includes('footwear') || s.includes('textile') || s.includes('luxury') ||
            s.includes('food') || s.includes('beverage') || s.includes('restaurant') ||
            s.includes('hotel') || s.includes('lodging') || s.includes('travel') ||
            s.includes('gambling') || s.includes('casino') || s.includes('leisure') ||
            s.includes('sporting') || s.includes('auto') || s.includes('automobile') ||
            s.includes('vehicle') || s.includes('tobacco') || s.includes('household') ||
            s.includes('personal product') || s.includes('packaged food') ||
            s.includes('grocery') || s.includes('discount') || s.includes('specialty store') ||
            s.includes('home furnishing') || s.includes('home improvement') ||
            s.includes('department store') || s.includes('e-commerce'))
            return 'consumer';
    }

    return null;
}

// Legacy alias kept for any external callers
function avSectorToKey(sector) { return sectorToKey(sector, null); }

// ─── Map /api/equity payload → ValuationHouse state ──────────────────────────
function mapPayload(payload, series) {
    var o      = payload.overview   || {};
    var rawFin = payload.financials || {};
    // API returns financials = { snapshot: {...}, yearly: [...], quarterly: [...] }
    var fin    = (rawFin && rawFin.snapshot) ? rawFin.snapshot : rawFin;
    var num    = function(k, obj) { var v = Number((obj || o)[k]); return isFinite(v) && v !== 0 ? v : null; };

    var price   = series && series.length ? series[series.length - 1].close : 45;
    var beta    = num('Beta') || 1.0;
    var mktCap  = num('MarketCapitalization') || null;   // raw dollars
    var mktCapM = mktCap ? mktCap / 1e6 : null;

    // Shares: prefer netIncome/EPS derivation (more stable); fallback mktCap/price
    var trailingEps = fin.trailingEps || num('EPS') || null;
    var netIncomeM  = fin.netIncome ? fin.netIncome / 1e6 : null;
    var sharesM;
    if (netIncomeM && trailingEps && Math.abs(trailingEps) > 0.01) {
        sharesM = Math.abs(netIncomeM / trailingEps);
    } else if (mktCap && price) {
        sharesM = (mktCap / price) / 1e6;
    } else {
        sharesM = 500;
    }

    var eps    = trailingEps || 0;
    var bvps   = fin.bookValue || num('BookValue') || 18.50;
    var divYld = num('DividendYield') || 0;
    var D0     = +(divYld * price).toFixed(2);
    var roe    = fin.returnOnEquity != null ? fin.returnOnEquity : 0.145;

    // Balance sheet / income statement ($M)
    var debt   = fin.totalDebt    ? +(fin.totalDebt    / 1e6).toFixed(0) : 5000;
    var cash   = fin.totalCash    ? +(fin.totalCash    / 1e6).toFixed(0) : 2000;
    var ebitda = fin.ebitda       ? +(fin.ebitda       / 1e6).toFixed(0) : 2800;
    var rev    = fin.totalRevenue ? +(fin.totalRevenue / 1e6).toFixed(0) : 12000;

    // Tax rate derived from margin spread: 1 − (netMargin / opMargin), capped 15-40%
    var profitM = fin.profitMargins   != null ? fin.profitMargins   : null;
    var opM     = fin.operatingMargins != null ? fin.operatingMargins : null;
    var tax;
    if (profitM != null && opM != null && opM > 0.01) {
        tax = Math.max(0.15, Math.min(0.40, 1 - profitM / opM));
    } else {
        tax = 0.21;
    }

    // Cost of debt via Damodaran credit spread from Debt/EBITDA leverage ratio
    var rf         = 0.044;
    var debtEbitda = (ebitda > 0) ? debt / ebitda : 2.0;
    var creditSpread;
    if      (debtEbitda < 1.0) creditSpread = 0.008;
    else if (debtEbitda < 2.0) creditSpread = 0.012;
    else if (debtEbitda < 3.0) creditSpread = 0.018;
    else if (debtEbitda < 4.5) creditSpread = 0.025;
    else                       creditSpread = 0.040;
    var rd = +(rf + creditSpread).toFixed(4);

    // FCF: Yahoo/Finnhub freeCashflow = operatingCF − capex = FCFE (post-interest)
    // FCFF = FCFE + Debt × rd × (1 − tax)  [add back after-tax interest shield]
    var fcfe0raw    = fin.freeCashflow ? fin.freeCashflow / 1e6 : null;
    var interestAdj = debt * rd * (1 - tax);
    var fcfe0 = fcfe0raw != null ? +fcfe0raw.toFixed(0)              : 400;
    var fcff0 = fcfe0raw != null ? +(fcfe0raw + interestAdj).toFixed(0) : 500;

    // WACC weights: prefer market-value (debt / (debt + mktCap)); fallback book D/E
    var wd;
    if (mktCapM && debt > 0) {
        wd = Math.max(0.05, Math.min(0.70, debt / (debt + mktCapM)));
    } else {
        var de = fin.debtToEquity != null ? fin.debtToEquity / 100 : 0.30;
        wd = Math.max(0.05, Math.min(0.70, de / (1 + de)));
    }

    // Sector defaults — use both Sector and Industry fields so Finnhub's granular
    // industry strings (e.g. "Apparel—Footwear & Accessories") resolve correctly
    var secKey = sectorToKey(o.Sector, o.Industry) || 'general';
    var sec    = SECTORS[secKey] || SECTORS['general'];
    var gL     = sec.gL;   // sector-specific long-run growth

    // Short-run growth priority: earningsGrowth → PEG-implied → revenueGrowth → sector default
    var earningsG  = fin.earningsGrowth != null ? fin.earningsGrowth : null;
    var revenueG   = fin.revenueGrowth  != null ? fin.revenueGrowth  : null;
    var pegImplied = null;
    if (fin.pegRatio && fin.pegRatio > 0 && fin.forwardPE && fin.forwardPE > 0) {
        pegImplied = fin.forwardPE / fin.pegRatio / 100;
    }
    var gS = Math.max(0.01, Math.min(0.35, earningsG || pegImplied || revenueG || sec.gS));

    // Five-year growth vector: convex step-down gS → gL
    var gr = [];
    for (var i = 0; i < 5; i++) {
        gr.push(+(gS + (gL - gS) * (i / 4)).toFixed(3));
    }

    // Dividend retention ratio b
    var b = eps > 0 && D0 > 0 ? Math.max(0, Math.min(0.99, +(1 - D0 / eps).toFixed(2))) : 0.40;

    // Sustainable growth for RI model: g = ROE × b
    var riG = Math.max(gL, Math.min(0.15, +(roe * b).toFixed(3)));

    var netDebt = Math.max(0, debt - cash);
    var pePeer  = num('PERatio') || fin.forwardPE || 22;

    // Multiples from live fundamentals rather than hardcoded placeholders
    var pbPeer = fin.priceToBook  ? +fin.priceToBook.toFixed(1)  : (bvps > 0 ? +(price / bvps).toFixed(1) : 3.5);
    var pEV    = fin.evToEbitda   ? +fin.evToEbitda.toFixed(1)   : 14;
    var pPS    = fin.evToRevenue  ? +fin.evToRevenue.toFixed(1)  : 2.2;

    return {
        co:   { name: o.Name || o.Symbol || 'Unknown', ticker: o.Symbol || '', price: price, sector: secKey },
        coc:  { rf: rf, beta: beta, erp: 0.055, rd: rd, wd: +wd.toFixed(3), tax: +tax.toFixed(3) },
        ddm:  { D0: Math.max(0, D0), gS: +gS.toFixed(3), gL: gL, n: 5, H: 4, model: D0 > 0 ? '2stage' : 'gordon' },
        fcf:  { fcff0: fcff0 > 0 ? fcff0 : 500, fcfe0: fcfe0 > 0 ? fcfe0 : 400,
                gr: gr, gL: gL, debt: debt, cash: cash,
                shs: Math.round(Math.max(1, sharesM)), mode: 'fcff' },
        mult: { eps: eps > 0 ? +eps.toFixed(2) : 3.20, bvps: bvps > 0 ? +bvps.toFixed(2) : 18.50,
                ebitda: ebitda > 0 ? ebitda : 2800, rev: rev > 0 ? rev : 12000, b: b,
                mktCap: mktCapM ? +mktCapM.toFixed(0) : 22500, netDebt: netDebt,
                pPE: pePeer, pPB: pbPeer, pEV: pEV, pPS: pPS },
        ri:   { B0: bvps > 0 ? +bvps.toFixed(2) : 18.50, ROE: roe > 0 ? +roe.toFixed(3) : 0.145,
                g: riG, n: 5, mth: 'gordon', omega: 0.60 },
        priv: INIT.priv,
        wts:  INIT.wts,
    };
}

// ─── Component ───────────────────────────────────────────────────────────────
export function ValuationHouse(props) {
    var h = React.createElement;
    var _s = useState(INIT);
    var s = _s[0], setS = _s[1];
    var _it = useState('dash');
    var innerTab = _it[0], setInnerTab = _it[1];

    // ── Ticker search state ────────────────────────────────────────────────
    var _qi = useState('');
    var searchInput = _qi[0], setSearchInput = _qi[1];
    var _qs = useState('idle');   // 'idle' | 'loading' | 'ready' | 'error'
    var searchStatus = _qs[0], setSearchStatus = _qs[1];
    var _qe = useState(null);
    var searchError = _qe[0], setSearchError = _qe[1];
    var _ql = useState(null);
    var loadedTicker = _ql[0], setLoadedTicker = _ql[1];
    var _sym = useState(null);    // committed ticker that triggers fetch
    var pendingSymbol = _sym[0], setPendingSymbol = _sym[1];

    // ── Intelligence layer state ───────────────────────────────────────────────
    var _intel = useState(null);
    var intelligence = _intel[0], setIntelligence = _intel[1];
    var _compass = useState(null);
    var compassResult = _compass[0], setCompassResult = _compass[1];
    var _iloading = useState(false);
    var intelligenceLoading = _iloading[0], setIntelligenceLoading = _iloading[1];
    var _flagsOpen = useState(false);
    var flagsOpen = _flagsOpen[0], setFlagsOpen = _flagsOpen[1];

    var upd = useCallback(function(path, val) {
        setS(function(prev) {
            var next = JSON.parse(JSON.stringify(prev));
            var keys = path.split('.');
            var ref = next;
            for (var i = 0; i < keys.length - 1; i++) ref = ref[keys[i]];
            ref[keys[keys.length - 1]] = val;
            return next;
        });
    }, []);

    var setSec = useCallback(function(sec) {
        var d = SECTORS[sec];
        if (!d) return;
        setS(function(p) {
            return {
                co:   Object.assign({}, p.co,  { sector: sec }),
                coc:  Object.assign({}, p.coc, { beta: d.beta, rd: d.rd, wd: d.wd }),
                ddm:  Object.assign({}, p.ddm, { D0: d.D0, gS: d.gS, gL: d.gL }),
                fcf:  Object.assign({}, p.fcf, { gL: d.gL }),
                mult: p.mult, ri: p.ri, priv: p.priv, wts: p.wts,
            };
        });
    }, []);

    // ── Ticker search: commit on Enter or button click ─────────────────────
    var handleSearch = useCallback(function(raw) {
        var sym = (raw || '').trim().toUpperCase();
        if (!sym) return;
        if (!/^[A-Z0-9.\-]{1,12}$/.test(sym)) {
            setSearchError('Invalid ticker. Use A–Z, 0–9, . or - (max 12 chars).');
            setSearchStatus('error');
            return;
        }
        setSearchError(null);
        setPendingSymbol(sym);
    }, []);

    // ── Auto-load when initialTicker prop is set (from Screener navigation) ──
    useEffect(function() {
        var t = props && props.initialTicker;
        if (!t) return;
        var sym = t.trim().toUpperCase();
        setSearchInput(sym);
        setPendingSymbol(sym);
    }, [props && props.initialTicker]);

    // ── Fetch on pendingSymbol change ──────────────────────────────────────
    useEffect(function() {
        if (!pendingSymbol) return;
        var cancelled = false;
        setSearchStatus('loading');
        setSearchError(null);
        setIntelligence(null);
        setCompassResult(null);
        setFlagsOpen(false);
        setIntelligenceLoading(true);
        fetch('/api/equity?symbol=' + encodeURIComponent(pendingSymbol))
            .then(function(r) {
                return r.json().then(function(j) { return { ok: r.ok, status: r.status, body: j }; });
            })
            .then(function(res) {
                if (cancelled) return;
                if (!res.ok) {
                    setSearchError((res.body && res.body.error) || 'Request failed (HTTP ' + res.status + ')');
                    setSearchStatus('error');
                    return;
                }
                // Parse price series the same way equity-research.js does
                var raw = res.body;
                var series = [];
                var ts = raw.daily && raw.daily['Time Series (Daily)'];
                if (ts) {
                    for (var date in ts) {
                        var close = Number(ts[date]['4. close']);
                        if (!isNaN(close)) series.push({ date: date, close: close });
                    }
                    series.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
                }
                var mapped = mapPayload(raw, series);
                setS(mapped);
                setLoadedTicker(pendingSymbol);
                setSearchStatus('ready');
                setInnerTab('dash');
                // Build intelligence layer synchronously — non-blocking, best-effort
                try {
                    var sectorCode = resolveGICSSectorCode(mapped.co.sector);
                    var norm = SECTOR_NORMS[sectorCode] || SECTOR_NORMS['DEFAULT'];
                    var prov = deriveProvenance(raw.overview || {}, mapped, norm);
                    var intel = { sectorCode: sectorCode, sectorLabel: norm.label, provenance: prov };
                    setIntelligence(intel);
                    var re0 = mapped.coc.rf + mapped.coc.beta * mapped.coc.erp;
                    var wc0 = re0 * (1 - mapped.coc.wd) + mapped.coc.rd * (1 - mapped.coc.tax) * mapped.coc.wd;
                    var em0 = mapped.mult.ebitda > 0 && mapped.mult.rev > 0
                        ? (mapped.mult.ebitda / mapped.mult.rev) * 100 : norm.ebitdaMargin.base;
                    setCompassResult(computeCompassScore({
                        wacc: wc0 * 100,
                        terminalGrowth: mapped.fcf.gL * 100,
                        revenueGrowthNear: mapped.ddm.gS * 100,
                        ebitdaMargin: em0,
                        beta: mapped.coc.beta,
                    }, sectorCode));
                } catch(_) {}
                setIntelligenceLoading(false);
            })
            .catch(function(e) {
                if (cancelled) return;
                setSearchError((e && e.message) || 'Network error');
                setSearchStatus('error');
                setIntelligenceLoading(false);
            });
        return function() { cancelled = true; };
    }, [pendingSymbol]);

    // ── Compass: recalculate on every input change ────────────────────────────
    useEffect(function() {
        if (!intelligence) return;
        var sCode = intelligence.sectorCode;
        var norm = SECTOR_NORMS[sCode] || SECTOR_NORMS['DEFAULT'];
        var re_ = s.coc.rf + s.coc.beta * s.coc.erp;
        var wc_ = re_ * (1 - s.coc.wd) + s.coc.rd * (1 - s.coc.tax) * s.coc.wd;
        var em_ = s.mult.ebitda > 0 && s.mult.rev > 0
            ? (s.mult.ebitda / s.mult.rev) * 100 : norm.ebitdaMargin.base;
        setCompassResult(computeCompassScore({
            wacc: wc_ * 100,
            terminalGrowth: s.fcf.gL * 100,
            revenueGrowthNear: s.ddm.gS * 100,
            ebitdaMargin: em_,
            beta: s.coc.beta,
        }, sCode));
    }, [s, intelligence]);

    var c = useMemo(function() {
        var coc = s.coc, ddm = s.ddm, fcf = s.fcf, mult = s.mult, ri = s.ri, priv = s.priv, wts = s.wts;
        var re  = capm(coc.rf, coc.beta, coc.erp);
        var we  = 1 - coc.wd;
        var wc  = calcWACC(re, we, coc.rd, coc.wd, coc.tax);

        var ggm = gordonGrowth(ddm.D0, ddm.gL, re);
        var hm  = hModel(ddm.D0, ddm.gS, ddm.gL, ddm.H, re);
        var ts  = twoStageDDM(ddm.D0, ddm.gS, ddm.gL, ddm.n, re);
        var ddmV = ddm.model === 'gordon' ? ggm : ddm.model === 'h' ? (hm ? hm.v : null) : (ts ? ts.v : null);

        var ffR = fcffVal(fcf.fcff0, fcf.gr, fcf.gL, wc, fcf.debt, fcf.cash, fcf.shs);
        var feR = fcfeVal(fcf.fcfe0, fcf.gr, fcf.gL, re, fcf.shs);

        var pPE   = mult.pPE * mult.eps;
        var pPB   = mult.pPB * mult.bvps;
        var pEVps = fcf.shs > 0 ? (mult.pEV * mult.ebitda - mult.netDebt) / fcf.shs : null;
        var pPS   = fcf.shs > 0 ? mult.pPS * mult.rev / fcf.shs : null;
        var jpeV  = jPELeading(mult.b, re, ddm.gL);
        var jpbV  = jPB(ri.ROE, re, ri.g);
        var mVals = [pPE, pPB, pEVps, pPS].filter(function(v) { return v > 0 && isFinite(v); });
        var multAvg = mVals.length ? mVals.reduce(function(a, b) { return a + b; }, 0) / mVals.length : null;

        var riR  = riCalc(ri.B0, ri.ROE, re, ri.g, ri.n, ri.mth, ri.omega);

        var privR = privCalc(priv.nE, priv.mult, priv.debt, priv.cash, priv.dlom, priv.dloc, priv.isCtrl, priv.cp);
        var privPS = priv.shs > 0 ? (priv.isCtrl ? privR.ctrl : privR.min) / priv.shs : null;

        var valMap = { ddm: ddmV, fcff: ffR ? ffR.eqPS : null, fcfe: feR ? feR.eqPS : null, mult: multAvg, ri: riR ? riR.v : null };
        var cons   = buildConsensus(valMap, wts);

        var sg = buildSensGrid(s, wc);
        var traps = detectTraps(s, re, wc);
        var sustainableG = ri.ROE * (1 - mult.b);

        return {
            re: re, we: we, wc: wc, ggm: ggm, hm: hm, ts: ts, ddmV: ddmV,
            ffR: ffR, feR: feR,
            pPE: pPE, pPB: pPB, pEVps: pEVps, pPS: pPS, jpeV: jpeV, jpbV: jpbV, multAvg: multAvg,
            riR: riR, privR: privR, privPS: privPS, valMap: valMap, cons: cons,
            sensCells: sg.cells, sensCols: sg.colLabels, sensRows: sg.rowLabels,
            traps: traps, sustainableG: sustainableG,
        };
    }, [s]);

    var price = s.co.price;

    // ── Shared styles ─────────────────────────────────────────────────────────
    var inputStyle = {
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid var(--card-border)',
        borderRadius: 5,
        color: 'var(--text)',
        padding: '4px 8px',
        fontSize: 12,
        fontFamily: 'JetBrains Mono, monospace',
        width: '100%',
        outline: 'none',
        boxSizing: 'border-box',
    };
    var labelStyle = {
        fontSize: 10,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 3,
        display: 'block',
        fontFamily: 'Figtree, sans-serif',
    };

    // ── UI Primitives ─────────────────────────────────────────────────────────
    function NumIn(label, val, onCh, sfx, step, tip) {
        sfx = sfx || ''; step = step || 0.01; tip = tip || '';
        return h('div', { style: { marginBottom: 8 } },
            h('label', { style: labelStyle, title: tip }, label + (sfx ? ' (' + sfx + ')' : '')),
            h('input', { type: 'number', step: step, value: val,
                onChange: function(e) { onCh(Number(e.target.value)); },
                style: inputStyle })
        );
    }

    function PctIn(label, val, onCh, tip) {
        tip = tip || '';
        return h('div', { style: { marginBottom: 8 } },
            h('label', { style: labelStyle, title: tip }, label + ' (%)'),
            h('input', { type: 'number', step: 0.1, value: +(val * 100).toFixed(3),
                onChange: function(e) { onCh(Number(e.target.value) / 100); },
                style: inputStyle })
        );
    }

    function Card(title, children, accent) {
        accent = accent || 'var(--cyan)';
        return h('div', { style: {
            background: 'var(--card)',
            border: '1px solid var(--card-border)',
            borderRadius: 8,
            padding: 16,
            marginBottom: 14,
        }},
            h('div', { style: {
                fontSize: 10, fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                color: accent,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                marginBottom: 12,
                paddingBottom: 8,
                borderBottom: '1px solid var(--card-border)',
            }}, title),
            children
        );
    }

    function StatRow(label, value, color) {
        color = color || 'var(--text)';
        return h('div', { style: {
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)'
        }},
            h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, label),
            h('span', { style: { fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: color } }, value)
        );
    }

    function Alert(type, msg) {
        var bg     = type === 'error' ? 'rgba(239,68,68,0.1)' : type === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)';
        var border = type === 'error' ? 'var(--red)' : type === 'warning' ? 'var(--amber)' : 'var(--indigo)';
        var color  = type === 'error' ? 'var(--red)' : type === 'warning' ? 'var(--amber)' : '#818cf8';
        return h('div', { style: {
            background: bg, borderLeft: '3px solid ' + border,
            borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize: 12, color: color,
        }}, msg);
    }

    function Sig(v, px) {
        var col = signalColor(v, px);
        return h('span', { style: {
            background: col + '22', color: col,
            border: '1px solid ' + col + '55',
            borderRadius: 4, padding: '2px 8px',
            fontSize: 10, fontWeight: 700,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.06em',
        }}, signalLabel(v, px));
    }

    function Upsid(v, px) {
        var u = upside(v, px);
        if (u == null) return h('span', { style: { color: 'var(--text-muted)', fontSize: 11 } }, '—');
        var color = u > 0 ? 'var(--green)' : u < 0 ? 'var(--red)' : 'var(--text-muted)';
        return h('span', { style: { color: color, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 } },
            (u > 0 ? '+' : '') + (u * 100).toFixed(1) + '%');
    }

    function TwoCol(left, right) {
        return h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } }, left, right);
    }

    function DTable(headers, rows) {
        return h('div', { style: { overflowX: 'auto', marginTop: 8 } },
            h('table', { className: 'data-table', style: { fontSize: 11 } },
                h('thead', null,
                    h('tr', null, headers.map(function(hd) { return h('th', { key: hd }, hd); }))
                ),
                h('tbody', null,
                    rows.map(function(row, i) {
                        return h('tr', { key: i },
                            row.map(function(cell, j) { return h('td', { key: j }, cell); })
                        );
                    })
                )
            )
        );
    }

    // ── Intelligence UI helpers ───────────────────────────────────────────────

    function ProvenanceLabel(fieldKey) {
        if (!intelligence || !intelligence.provenance || !intelligence.provenance[fieldKey]) return null;
        var prov = intelligence.provenance[fieldKey];
        return h('div', { style: {
            display: 'flex', gap: 6, alignItems: 'center',
            marginTop: 2, marginBottom: 2,
            fontSize: 10, color: 'var(--text-muted)',
            fontFamily: 'JetBrains Mono, monospace',
        }},
            h('span', { style: { color: 'var(--cyan)', fontWeight: 500 } }, prov.source),
            h('span', null, '← ' + prov.provenance)
        );
    }

    function ConfidenceBand(valuePct, fieldKey) {
        if (!intelligence || !intelligence.provenance || !intelligence.provenance[fieldKey]) return null;
        var range = intelligence.provenance[fieldKey].range;
        if (!range) return null;
        var bear = range.bear, base = range.base, bull = range.bull;
        var span = bull - bear;
        if (span <= 0) return null;
        var pct = Math.min(100, Math.max(0, ((valuePct - bear) / span) * 100));
        var isBase = Math.abs(valuePct - base) < 0.25;
        return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 } },
            h('span', { style: { fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', minWidth: 30 } }, bear),
            h('div', { style: { flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, position: 'relative', overflow: 'visible' } },
                h('div', { style: { height: '100%', width: pct + '%', background: 'rgba(0,200,224,0.2)', borderRadius: 2 } }),
                h('div', { style: {
                    position: 'absolute', top: -3, left: pct + '%',
                    width: 8, height: 8, borderRadius: '50%',
                    background: isBase ? 'var(--cyan)' : 'var(--amber)',
                    transform: 'translateX(-50%)',
                    transition: 'left 0.15s ease',
                }}),
                h('div', { style: {
                    position: 'absolute', top: -1, left: ((base - bear) / span * 100) + '%',
                    width: 2, height: 6, background: 'rgba(255,255,255,0.18)',
                    transform: 'translateX(-50%)',
                }})
            ),
            h('span', { style: { fontSize: 9, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', minWidth: 30, textAlign: 'right' } }, bull)
        );
    }

    function ValuationCompassBadge() {
        if (intelligenceLoading) {
            return h('div', { style: {
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 100,
                fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                background: 'var(--card)', border: '1px solid var(--card-border)',
                color: 'var(--text-muted)',
            }}, '◎ COMPASS ···');
        }
        if (!compassResult) return null;
        var score = compassResult.score;
        var band = compassResult.band;
        var bandLabel = compassResult.bandLabel;
        var flags = compassResult.flags;
        var colors = {
            GREEN: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', text: '#22c55e' },
            AMBER: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
            RED:   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  text: '#ef4444' },
        };
        var cc = colors[band] || colors.GREEN;
        var tipText = flags.length
            ? flags.map(function(f) { return f.severity.toUpperCase() + ': ' + f.message; }).join('\n')
            : 'Assumptions are internally coherent';
        return h('div', {
            title: tipText,
            style: {
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 100,
                fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                background: cc.bg, border: '1px solid ' + cc.border,
                cursor: 'default', letterSpacing: '0.03em', userSelect: 'none',
            },
        },
            h('span', { style: { fontSize: 12 } }, '◎'),
            h('span', { style: { color: cc.text } }, score + ' · ' + bandLabel),
            flags.length > 0 && h('span', { style: { color: cc.text, fontSize: 10, marginLeft: 2 } }, flags.length + '⚑')
        );
    }

    function CompassFlagsPanel() {
        if (!compassResult || !compassResult.flags || !compassResult.flags.length) return null;
        var flags = compassResult.flags;
        return h('div', { style: { padding: '0 18px 4px', borderBottom: '1px solid var(--card-border)' } },
            h('button', {
                onClick: function() { setFlagsOpen(function(o) { return !o; }); },
                style: {
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-sec)', fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                    padding: '5px 0', display: 'flex', alignItems: 'center', gap: 4,
                },
            },
                flagsOpen ? '▾' : '▸',
                ' ' + flags.length + ' assumption tension' + (flags.length > 1 ? 's' : '') + ' detected'
            ),
            flagsOpen && h('ul', { style: { listStyle: 'none', margin: '0 0 6px 0', padding: 0 } },
                flags.map(function(f, i) {
                    var sev = f.severity;
                    var col = sev === 'critical' ? 'var(--red)' : sev === 'warning' ? 'var(--amber)' : 'var(--cyan)';
                    return h('li', { key: i, style: {
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
                        fontSize: 11,
                    }},
                        h('span', { style: { color: col, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 9, flexShrink: 0, paddingTop: 2 } },
                            sev.toUpperCase()),
                        h('span', { style: { color: 'var(--text-sec)' } }, f.message)
                    );
                })
            )
        );
    }

    // ── Donut chart (Dashboard) ───────────────────────────────────────────────
    var donutRef = useRef(null);
    var donutChart = useRef(null);

    useEffect(function() {
        if (!donutRef.current) return;
        if (donutChart.current) { donutChart.current.destroy(); donutChart.current = null; }
        var keys   = ['ddm', 'fcff', 'fcfe', 'mult', 'ri'];
        var labels = ['DDM', 'FCFF', 'FCFE', 'Multiples', 'RI'];
        var colors = ['#00d4ff', '#10b981', '#6366f1', '#f59e0b', '#8b5cf6'];
        var data   = keys.map(function(k) { return c.valMap[k] != null && c.valMap[k] > 0 ? s.wts[k] : 0; });
        donutChart.current = new Chart(donutRef.current, {
            type: 'doughnut',
            data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 1, borderColor: '#0d0f1a' }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: {
                    legend: { position: 'right', labels: { color: 'rgba(255,255,255,0.55)', font: { size: 10 }, boxWidth: 10 } },
                    tooltip: { callbacks: { label: function(ctx) { return ' ' + ctx.label + ': ' + ctx.raw + '%'; } } },
                },
            },
        });
        return function() { if (donutChart.current) { donutChart.current.destroy(); donutChart.current = null; } };
    }, [s.wts, c.valMap]);

    // ── FCF bar chart ─────────────────────────────────────────────────────────
    var fcfBarRef = useRef(null);
    var fcfChart  = useRef(null);
    var fcfData   = s.fcf.mode === 'fcff' ? c.ffR : c.feR;

    useEffect(function() {
        if (!fcfBarRef.current || !fcfData || !fcfData.proj) return;
        if (fcfChart.current) { fcfChart.current.destroy(); fcfChart.current = null; }
        var isFF = s.fcf.mode === 'fcff';
        var fcfKey = isFF ? 'fcff' : 'fcfe';
        fcfChart.current = new Chart(fcfBarRef.current, {
            type: 'bar',
            data: {
                labels: fcfData.proj.map(function(p) { return 'Y' + p.t; }),
                datasets: [
                    { label: isFF ? 'FCFF ($M)' : 'FCFE ($M)',
                      data: fcfData.proj.map(function(p) { return p[fcfKey]; }),
                      backgroundColor: 'rgba(99,102,241,0.55)', borderWidth: 0 },
                    { label: 'PV ($M)',
                      data: fcfData.proj.map(function(p) { return p.pv; }),
                      backgroundColor: 'rgba(0,212,255,0.45)', borderWidth: 0 },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { color: 'rgba(255,255,255,0.55)', font: { size: 10 } } } },
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.45)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                },
            },
        });
        return function() { if (fcfChart.current) { fcfChart.current.destroy(); fcfChart.current = null; } };
    }, [fcfData, s.fcf.mode]);

    // ── Sub-tab: DASHBOARD ────────────────────────────────────────────────────
    function renderDash() {
        var models = [
            { k: 'ddm',  label: 'DDM',          val: c.valMap.ddm,  wt: s.wts.ddm },
            { k: 'fcff', label: 'FCFF',          val: c.valMap.fcff, wt: s.wts.fcff },
            { k: 'fcfe', label: 'FCFE',          val: c.valMap.fcfe, wt: s.wts.fcfe },
            { k: 'mult', label: 'Multiples',     val: c.valMap.mult, wt: s.wts.mult },
            { k: 'ri',   label: 'Res. Income',   val: c.valMap.ri,   wt: s.wts.ri },
        ];
        return h('div', null,
            c.traps.length > 0 && h('div', { style: { marginBottom: 12 } },
                c.traps.map(function(trap, i) { return h('div', { key: i }, Alert(trap.t, trap.m)); })
            ),
            // Hero metrics row
            h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 } },
                h('div', { style: { background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, padding: 16, textAlign: 'center' } },
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 } }, 'Consensus Value'),
                    h('div', { style: { fontSize: 28, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                        color: c.cons ? signalColor(c.cons, price) : 'var(--text-muted)' } },
                        c.cons ? '$' + c.cons.toFixed(2) : '—'),
                    h('div', { style: { marginTop: 6 } }, Sig(c.cons, price))
                ),
                h('div', { style: { background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, padding: 16, textAlign: 'center' } },
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 } }, 'Market Price'),
                    h('div', { style: { fontSize: 28, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' } },
                        '$' + price.toFixed(2)),
                    h('div', { style: { marginTop: 6 } }, Upsid(c.cons, price))
                ),
                h('div', { style: { background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, padding: 16, textAlign: 'center' } },
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 } }, 'WACC / re'),
                    h('div', { style: { fontSize: 18, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--cyan)' } },
                        (c.wc * 100).toFixed(2) + '% / ' + (c.re * 100).toFixed(2) + '%'),
                    h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginTop: 4 } }, 'β = ' + s.coc.beta.toFixed(2))
                )
            ),
            TwoCol(
                Card('Model Estimates', h('div', null,
                    models.map(function(m) {
                        return h('div', { key: m.k, style: { marginBottom: 12 } },
                            h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3 } },
                                h('span', { style: { fontSize: 11, color: 'var(--text-sec)' } }, m.label),
                                h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                                    h('span', { style: { fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--text)' } },
                                        m.val != null ? '$' + m.val.toFixed(2) : '—'),
                                    m.val != null ? Sig(m.val, price) : null,
                                    m.val != null ? Upsid(m.val, price) : null
                                )
                            ),
                            m.val != null && h('div', { style: { height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginBottom: 2 } },
                                h('div', { style: {
                                    height: '100%',
                                    width: Math.min(100, Math.max(0, (m.val / (price * 2)) * 100)) + '%',
                                    background: signalColor(m.val, price),
                                    borderRadius: 2,
                                }})
                            )
                        );
                    })
                )),
                h('div', null,
                    Card('Model Weights', h('div', null,
                        models.map(function(m) {
                            return h('div', { key: m.k, style: { marginBottom: 10 } },
                                h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3 } },
                                    h('span', { style: { fontSize: 11, color: 'var(--text-sec)' } }, m.label),
                                    h('span', { style: { fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--cyan)' } }, m.wt + '%')
                                ),
                                h('input', {
                                    type: 'range', min: 0, max: 100, step: 5, value: m.wt,
                                    onChange: function(e) { upd('wts.' + m.k, Number(e.target.value)); },
                                    style: { width: '100%', accentColor: '#00d4ff' },
                                })
                            );
                        })
                    )),
                    Card('Weight Distribution', h('div', { style: { position: 'relative', height: 160 } },
                        h('canvas', { ref: donutRef })
                    ))
                )
            )
        );
    }

    // ── Sub-tab: SETUP ────────────────────────────────────────────────────────
    function renderSetup() {
        return h('div', null,
            TwoCol(
                h('div', null,
                    Card('Company Info', h('div', null,
                        h('div', { style: { marginBottom: 8 } },
                            h('label', { style: labelStyle }, 'Company Name'),
                            h('input', { value: s.co.name, onChange: function(e) { upd('co.name', e.target.value); }, style: inputStyle })
                        ),
                        h('div', { style: { marginBottom: 8 } },
                            h('label', { style: labelStyle }, 'Ticker'),
                            h('input', { value: s.co.ticker, onChange: function(e) { upd('co.ticker', e.target.value); }, style: inputStyle })
                        ),
                        NumIn('Market Price', s.co.price, function(v) { upd('co.price', v); }, '$', 0.01),
                        h('div', { style: { marginBottom: 8 } },
                            h('label', { style: labelStyle }, 'Sector'),
                            h('select', {
                                value: s.co.sector,
                                onChange: function(e) { setSec(e.target.value); },
                                style: Object.assign({}, inputStyle, { cursor: 'pointer' }),
                            },
                                Object.keys(SECTORS).map(function(k) {
                                    return h('option', { key: k, value: k }, SECTORS[k].label);
                                })
                            )
                        ),
                        StatRow('Sustainable g (ROE × b)', fpp(c.sustainableG), 'var(--cyan)'),
                        StatRow('g = ROE × b', fpp(s.ri.ROE) + ' × ' + fpp(s.mult.b), 'var(--text-muted)'),
                    )),
                    Card('Capital Structure & Tax', h('div', null,
                        PctIn('Risk-Free Rate rf', s.coc.rf, function(v) { upd('coc.rf', v); }, '10Y Treasury yield'),
                        PctIn('Equity Risk Premium (ERP)', s.coc.erp, function(v) { upd('coc.erp', v); }),
                        NumIn('Beta (β)', s.coc.beta, function(v) { upd('coc.beta', v); }, '', 0.01),
                        ProvenanceLabel('beta'),
                        ConfidenceBand(s.coc.beta, 'beta'),
                        PctIn('Pre-tax Cost of Debt rd', s.coc.rd, function(v) { upd('coc.rd', v); }),
                        PctIn('Debt Weight wd', s.coc.wd, function(v) { upd('coc.wd', v); }),
                        PctIn('Tax Rate', s.coc.tax, function(v) { upd('coc.tax', v); }),
                    ))
                ),
                h('div', null,
                    Card('CAPM + WACC Output', h('div', null,
                        StatRow('re = rf + β × ERP', fpp(c.re), 'var(--cyan)'),
                        StatRow('  rf', fpp(s.coc.rf)),
                        StatRow('  β', fp(s.coc.beta, 2)),
                        StatRow('  ERP', fpp(s.coc.erp)),
                        h('div', { style: { height: 1, background: 'var(--card-border)', margin: '8px 0' } }),
                        StatRow('we (equity weight)', fpp(c.we)),
                        StatRow('wd (debt weight)', fpp(s.coc.wd)),
                        StatRow('rd × (1 − t)', fpp(s.coc.rd * (1 - s.coc.tax))),
                        h('div', { style: { height: 1, background: 'var(--card-border)', margin: '8px 0' } }),
                        StatRow('WACC', fpp(c.wc), 'var(--cyan)'),
                        StatRow('  re × we', fpp(c.re * c.we)),
                        StatRow('  rd(1−t) × wd', fpp(s.coc.rd * (1 - s.coc.tax) * s.coc.wd)),
                    )),
                    Card('DDM Inputs', h('div', null,
                        NumIn('D₀ (last paid dividend)', s.ddm.D0, function(v) { upd('ddm.D0', v); }, '$', 0.01),
                        PctIn('Short-term growth gS', s.ddm.gS, function(v) { upd('ddm.gS', v); }),
                        ProvenanceLabel('revenueGrowthNear'),
                        ConfidenceBand(s.ddm.gS * 100, 'revenueGrowthNear'),
                        PctIn('Long-term growth gL', s.ddm.gL, function(v) { upd('ddm.gL', v); }),
                        ProvenanceLabel('terminalGrowth'),
                        ConfidenceBand(s.ddm.gL * 100, 'terminalGrowth'),
                        NumIn('Stage 1 years (n)', s.ddm.n, function(v) { upd('ddm.n', Math.max(1, Math.min(20, Math.round(v)))); }, '', 1),
                        NumIn('H (H-model half-life)', s.ddm.H, function(v) { upd('ddm.H', v); }, '', 0.5),
                    )),
                    Card('FCF Inputs', h('div', null,
                        NumIn('FCFF₀ (base, $M)', s.fcf.fcff0, function(v) { upd('fcf.fcff0', v); }, '$M', 10),
                        NumIn('FCFE₀ (base, $M)', s.fcf.fcfe0, function(v) { upd('fcf.fcfe0', v); }, '$M', 10),
                        PctIn('Terminal growth gL', s.fcf.gL, function(v) { upd('fcf.gL', v); }),
                        ProvenanceLabel('terminalGrowth'),
                        ConfidenceBand(s.fcf.gL * 100, 'terminalGrowth'),
                        NumIn('Total Debt ($M)', s.fcf.debt, function(v) { upd('fcf.debt', v); }, '$M', 100),
                        NumIn('Cash ($M)', s.fcf.cash, function(v) { upd('fcf.cash', v); }, '$M', 100),
                        NumIn('Shares outstanding (M)', s.fcf.shs, function(v) { upd('fcf.shs', v); }, 'M', 10),
                    ))
                )
            )
        );
    }

    // ── Sub-tab: DDM ──────────────────────────────────────────────────────────
    function renderDDM() {
        var modelBtns = [
            { k: '2stage', l: '2-Stage' },
            { k: 'gordon', l: 'Gordon Growth' },
            { k: 'h',      l: 'H-Model' },
        ];
        return h('div', null,
            h('div', { style: { display: 'flex', gap: 8, marginBottom: 14 } },
                modelBtns.map(function(m) {
                    var active = s.ddm.model === m.k;
                    return h('button', { key: m.k, onClick: function() { upd('ddm.model', m.k); }, style: {
                        padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: 'none',
                        background: active ? 'var(--cyan)' : 'var(--card)',
                        color: active ? '#000' : 'var(--text-sec)', fontWeight: active ? 700 : 400,
                    }}, m.l);
                })
            ),
            TwoCol(
                h('div', null,
                    Card('DDM Parameters', h('div', null,
                        NumIn('D₀', s.ddm.D0, function(v) { upd('ddm.D0', v); }, '$', 0.01),
                        PctIn('Short-term growth gS', s.ddm.gS, function(v) { upd('ddm.gS', v); }),
                        PctIn('Long-term growth gL', s.ddm.gL, function(v) { upd('ddm.gL', v); }),
                        NumIn('Stage 1 years (n)', s.ddm.n, function(v) { upd('ddm.n', Math.max(1, Math.min(20, Math.round(v)))); }, '', 1),
                        NumIn('H-model half-life', s.ddm.H, function(v) { upd('ddm.H', v); }, '', 0.5),
                    )),
                    c.traps.filter(function(t) { return t.m.indexOf('DDM') >= 0 || t.m.indexOf('re') >= 0; })
                           .map(function(t, i) { return h('div', { key: i }, Alert(t.t, t.m)); })
                ),
                h('div', null,
                    Card('Gordon Growth — V₀ = D₁ / (r − g)', h('div', null,
                        h('div', { style: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 8 } },
                            'V₀ = D₁ / (r − g)'),
                        StatRow('D₁ = D₀×(1+g)', fd(s.ddm.D0 * (1 + s.ddm.gL))),
                        StatRow('r − g', fpp(c.re - s.ddm.gL)),
                        StatRow('V₀ (Gordon)', fd(c.ggm), c.ggm ? signalColor(c.ggm, price) : 'var(--text-muted)'),
                        c.ggm != null && h('div', { style: { marginTop: 8, display: 'flex', gap: 8 } }, Sig(c.ggm, price), Upsid(c.ggm, price))
                    )),
                    Card('H-Model', h('div', null,
                        h('div', { style: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 8 } },
                            'V₀ = D₀(1+gL)/(r−gL) + D₀·H·(gS−gL)/(r−gL)'),
                        StatRow('LR base value', fd(c.hm ? c.hm.lr : null)),
                        StatRow('Growth premium', fd(c.hm ? c.hm.gp : null)),
                        StatRow('V₀ (H-Model)', fd(c.hm ? c.hm.v : null), c.hm ? signalColor(c.hm.v, price) : 'var(--text-muted)'),
                        c.hm && h('div', { style: { marginTop: 8, display: 'flex', gap: 8 } }, Sig(c.hm.v, price), Upsid(c.hm.v, price))
                    )),
                    c.ts && Card('Two-Stage DDM', h('div', null,
                        DTable(
                            ['Year', 'Dividend', 'PV'],
                            c.ts.divs.map(function(d) { return [d.t, fd(d.D), fd(d.pv)]; })
                        ),
                        h('div', { style: { marginTop: 10 } },
                            StatRow('Σ PV(dividends)', fd(c.ts.pvS)),
                            StatRow('Terminal Value', fd(c.ts.tv)),
                            StatRow('PV(TV)', fd(c.ts.pvTV)),
                            StatRow('TV% of total', fp(c.ts.tvPct) + '%', 'var(--amber)'),
                            StatRow('V₀ (Two-Stage)', fd(c.ts.v), signalColor(c.ts.v, price))
                        ),
                        h('div', { style: { marginTop: 8, display: 'flex', gap: 8 } }, Sig(c.ts.v, price), Upsid(c.ts.v, price))
                    ))
                )
            )
        );
    }

    // ── Sub-tab: FCF ──────────────────────────────────────────────────────────
    function renderFCF() {
        var isFF = s.fcf.mode === 'fcff';
        var r = fcfData;
        return h('div', null,
            h('div', { style: { display: 'flex', gap: 8, marginBottom: 14 } },
                h('button', { onClick: function() { upd('fcf.mode', 'fcff'); }, style: {
                    padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: 'none',
                    background: isFF ? 'var(--cyan)' : 'var(--card)',
                    color: isFF ? '#000' : 'var(--text-sec)', fontWeight: isFF ? 700 : 400,
                }}, 'FCFF → EV'),
                h('button', { onClick: function() { upd('fcf.mode', 'fcfe'); }, style: {
                    padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: 'none',
                    background: !isFF ? 'var(--cyan)' : 'var(--card)',
                    color: !isFF ? '#000' : 'var(--text-sec)', fontWeight: !isFF ? 700 : 400,
                }}, 'FCFE → Equity')
            ),
            c.traps.filter(function(t) { return t.m.indexOf('WACC') >= 0; })
                   .map(function(t, i) { return h('div', { key: i }, Alert(t.t, t.m)); }),
            TwoCol(
                h('div', null,
                    Card('Stage Growth Rates', h('div', null,
                        s.fcf.gr.map(function(g, i) {
                            return h('div', { key: i, style: { marginBottom: 10 } },
                                h('label', { style: labelStyle }, 'Year ' + (i + 1) + ' growth'),
                                h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
                                    h('input', {
                                        type: 'range', min: -10, max: 50, step: 0.5,
                                        value: +(g * 100).toFixed(1),
                                        onChange: function(e) {
                                            var gr = s.fcf.gr.slice();
                                            gr[i] = Number(e.target.value) / 100;
                                            upd('fcf.gr', gr);
                                        },
                                        style: { flex: 1, accentColor: '#00d4ff' },
                                    }),
                                    h('input', {
                                        type: 'number', step: 0.5, min: -10, max: 50,
                                        value: +(g * 100).toFixed(1),
                                        onChange: function(e) {
                                            var gr = s.fcf.gr.slice();
                                            gr[i] = Number(e.target.value) / 100;
                                            upd('fcf.gr', gr);
                                        },
                                        style: Object.assign({}, inputStyle, { width: 72 }),
                                    }),
                                    h('span', { style: { fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 } }, '%')
                                )
                            );
                        }),
                        PctIn('Terminal growth gL', s.fcf.gL, function(v) { upd('fcf.gL', v); })
                    )),
                    Card('FCF Projection Chart', h('div', null,
                        h('div', { style: { position: 'relative', height: 150 } },
                            h('canvas', { ref: fcfBarRef })
                        ),
                        r && DTable(
                            ['Year', 'g%', isFF ? 'FCFF $M' : 'FCFE $M', 'PV $M'],
                            r.proj.map(function(p) {
                                return [p.t, (p.g * 100).toFixed(1) + '%', fM(p[isFF ? 'fcff' : 'fcfe']), fM(p.pv)];
                            })
                        )
                    ))
                ),
                h('div', null,
                    r ? Card(isFF ? 'EV → Equity Bridge' : 'Equity Value', h('div', null,
                        isFF && h('div', { style: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 8 } },
                            'TV = FCFFₙ(1+gL) / (WACC − gL)'),
                        StatRow('Σ PV(FCF stage)', fM(r.pvS)),
                        StatRow('Terminal Value', fM(r.tv)),
                        StatRow('PV(TV)', fM(r.pvTV)),
                        StatRow('TV% of total', fp(r.tvPct) + '%', 'var(--amber)'),
                        isFF && StatRow('Enterprise Value', fM(r.ev), 'var(--cyan)'),
                        isFF && StatRow('− Debt', fM(-s.fcf.debt)),
                        isFF && StatRow('+ Cash', fM(s.fcf.cash)),
                        h('div', { style: { height: 1, background: 'var(--card-border)', margin: '6px 0' } }),
                        StatRow('Equity Value ($M)', fM(r.eq), 'var(--cyan)'),
                        StatRow('÷ Shares (M)', s.fcf.shs + 'M'),
                        StatRow('Equity / Share', fd(r.eqPS), signalColor(r.eqPS, price)),
                        h('div', { style: { marginTop: 10, display: 'flex', gap: 8 } }, Sig(r.eqPS, price), Upsid(r.eqPS, price))
                    )) : Alert('warning', 'WACC ≤ gL: model undefined. Adjust inputs in Setup.'),
                    Card(isFF ? 'FCFF Formula' : 'FCFE Formula', h('div', { style: { fontSize: 11, color: 'var(--text-sec)', lineHeight: 1.8 } },
                        h('div', { style: { fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 } },
                            isFF ? 'FCFF = EBIT(1−t) + NCC − FCInv − WCInv'
                                 : 'FCFE = FCFF − Int(1−t) + Net Borrowing'),
                        isFF ? 'Discounted at WACC to derive Enterprise Value, then bridged to equity per share.'
                             : 'Discounted directly at re (cost of equity) to derive equity value per share.'
                    ))
                )
            )
        );
    }

    // ── Sub-tab: MULTIPLES ────────────────────────────────────────────────────
    function renderMultiples() {
        var actPE = price > 0 && s.mult.eps > 0 ? fp(price / s.mult.eps, 1) + 'x' : '—';
        var actPB = s.mult.bvps > 0 ? fp(price / s.mult.bvps, 1) + 'x' : '—';
        return h('div', null,
            TwoCol(
                h('div', null,
                    Card('Peer / Comparable Multiples', h('div', null,
                        NumIn('Peer P/E', s.mult.pPE, function(v) { upd('mult.pPE', v); }, 'x', 0.5),
                        NumIn('Peer P/B', s.mult.pPB, function(v) { upd('mult.pPB', v); }, 'x', 0.1),
                        NumIn('Peer EV/EBITDA', s.mult.pEV, function(v) { upd('mult.pEV', v); }, 'x', 0.5),
                        NumIn('Peer P/S', s.mult.pPS, function(v) { upd('mult.pPS', v); }, 'x', 0.1),
                    )),
                    Card('Fundamental Inputs', h('div', null,
                        NumIn('EPS', s.mult.eps, function(v) { upd('mult.eps', v); }, '$', 0.01),
                        NumIn('BVPS (Book Value/Share)', s.mult.bvps, function(v) { upd('mult.bvps', v); }, '$', 0.01),
                        NumIn('EBITDA ($M)', s.mult.ebitda, function(v) { upd('mult.ebitda', v); }, '$M', 50),
                        NumIn('Revenue ($M)', s.mult.rev, function(v) { upd('mult.rev', v); }, '$M', 100),
                        NumIn('Net Debt ($M)', s.mult.netDebt, function(v) { upd('mult.netDebt', v); }, '$M', 100),
                        PctIn('Dividend retention ratio b', s.mult.b, function(v) { upd('mult.b', v); }),
                    ))
                ),
                h('div', null,
                    Card('Implied Values', h('div', null,
                        DTable(
                            ['Method', 'Multiple', 'Implied Price', 'Signal'],
                            [
                                ['P/E', s.mult.pPE + 'x', fd(c.pPE), Sig(c.pPE, price)],
                                ['P/B', s.mult.pPB + 'x', fd(c.pPB), Sig(c.pPB, price)],
                                ['EV/EBITDA', s.mult.pEV + 'x', fd(c.pEVps), Sig(c.pEVps, price)],
                                ['P/S', s.mult.pPS + 'x', fd(c.pPS), Sig(c.pPS, price)],
                            ]
                        ),
                        h('div', { style: { marginTop: 10 } },
                            StatRow('Average implied price', fd(c.multAvg), c.multAvg ? signalColor(c.multAvg, price) : 'var(--text-muted)')
                        ),
                        c.multAvg && h('div', { style: { marginTop: 8, display: 'flex', gap: 8 } }, Sig(c.multAvg, price), Upsid(c.multAvg, price))
                    )),
                    Card('Justified Multiples (Fundamentals)', h('div', null,
                        h('div', { style: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 8 } },
                            'Justified P/E = (1−b) / (re − g)'),
                        StatRow('Justified P/E', c.jpeV != null ? fp(c.jpeV, 2) + 'x' : '—', 'var(--cyan)'),
                        StatRow('Actual P/E', actPE),
                        h('div', { style: { height: 1, background: 'var(--card-border)', margin: '8px 0' } }),
                        h('div', { style: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 8 } },
                            'Justified P/B = (ROE − g) / (re − g)'),
                        StatRow('Justified P/B', c.jpbV != null ? fp(c.jpbV, 2) + 'x' : '—', 'var(--cyan)'),
                        StatRow('Actual P/B', actPB),
                    ))
                )
            )
        );
    }

    // ── Sub-tab: RESIDUAL INCOME ──────────────────────────────────────────────
    function renderRI() {
        var tvMethods = [
            { k: 'gordon',      l: 'Gordon Growth' },
            { k: 'persistence', l: 'Persistence' },
            { k: 'zero',        l: 'Zero TV' },
        ];
        return h('div', null,
            TwoCol(
                h('div', null,
                    Card('RI Parameters', h('div', null,
                        NumIn('B₀ (Book Value / share)', s.ri.B0, function(v) { upd('ri.B0', v); }, '$', 0.01),
                        PctIn('ROE', s.ri.ROE, function(v) { upd('ri.ROE', v); }),
                        PctIn('Long-run growth g', s.ri.g, function(v) { upd('ri.g', v); }),
                        NumIn('Explicit period (n)', s.ri.n, function(v) { upd('ri.n', Math.max(1, Math.min(20, Math.round(v)))); }, '', 1),
                        NumIn('Persistence factor ω', s.ri.omega, function(v) { upd('ri.omega', v); }, '0–1', 0.05),
                    )),
                    h('div', { style: { marginBottom: 14 } },
                        h('div', { style: labelStyle }, 'Terminal Value Method'),
                        h('div', { style: { display: 'flex', gap: 6 } },
                            tvMethods.map(function(m) {
                                var active = s.ri.mth === m.k;
                                return h('button', { key: m.k, onClick: function() { upd('ri.mth', m.k); }, style: {
                                    padding: '5px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer', border: 'none',
                                    background: active ? 'var(--violet)' : 'var(--card)',
                                    color: active ? '#fff' : 'var(--text-sec)', fontWeight: active ? 700 : 400,
                                }}, m.l);
                            })
                        )
                    ),
                    c.traps.filter(function(t) { return t.m.indexOf('ROE') >= 0; })
                           .map(function(t, i) { return h('div', { key: i }, Alert(t.t, t.m)); })
                ),
                h('div', null,
                    c.riR ? h('div', null,
                        Card('RI Explicit Period — RI = (ROE − re) × BVₜ₋₁', h('div', null,
                            DTable(
                                ['Year', 'BV', 'NI', 'RI', 'PV(RI)'],
                                c.riR.periods.map(function(p) { return [p.t, fd(p.B), fd(p.NI), fd(p.RI), fd(p.pv)]; })
                            )
                        )),
                        Card('V₀ = B₀ + Σ PV(RIₜ) + PV(TV)', h('div', null,
                            StatRow('B₀', fd(c.riR.B0)),
                            StatRow('Σ PV(RI)', fd(c.riR.pvS), 'var(--cyan)'),
                            StatRow('PV(TV) — ' + (s.ri.mth === 'zero' ? 'Zero' : s.ri.mth === 'gordon' ? 'Gordon' : 'Persistence'), fd(c.riR.pvTV)),
                            StatRow('TV% of total', fp(c.riR.tvPct) + '%', 'var(--amber)'),
                            h('div', { style: { height: 1, background: 'var(--card-border)', margin: '6px 0' } }),
                            StatRow('V₀ (Residual Income)', fd(c.riR.v), signalColor(c.riR.v, price)),
                            h('div', { style: { marginTop: 8, display: 'flex', gap: 8 } }, Sig(c.riR.v, price), Upsid(c.riR.v, price))
                        ))
                    ) : Alert('warning', 'Invalid RI inputs. Check B₀, ROE, re values.')
                )
            )
        );
    }

    // ── Sub-tab: PRIVATE CO. ──────────────────────────────────────────────────
    function renderPrivate() {
        var pr = c.privR;
        var bridgeRows = [
            ['Normalised Earnings ($K)', '$' + s.priv.nE.toLocaleString(), ''],
            ['× Transaction Multiple', s.priv.mult + 'x', ''],
            ['Enterprise Value ($K)', '$' + Math.round(pr.ev).toLocaleString(), 'nE × mult'],
            ['− Debt ($K)', '−$' + s.priv.debt.toLocaleString(), ''],
            ['+ Cash ($K)', '+$' + s.priv.cash.toLocaleString(), ''],
            ['Equity Value ($K)', '$' + Math.round(pr.eq).toLocaleString(), 'EV − Debt + Cash'],
        ];
        if (s.priv.isCtrl) {
            bridgeRows.push(['+ Control Premium (' + fpp(s.priv.cp) + ')', '$' + Math.round(pr.eq * s.priv.cp).toLocaleString(), 'Acquisition basis']);
            bridgeRows.push(['Control Equity Value ($K)', '$' + Math.round(pr.ctrl).toLocaleString(), '']);
        } else {
            bridgeRows.push(['× (1 − DLOC ' + fpp(s.priv.dloc) + ')', '$' + Math.round(pr.eq * (1 - s.priv.dloc)).toLocaleString(), 'Minority basis']);
            bridgeRows.push(['× (1 − DLOM ' + fpp(s.priv.dlom) + ')', '$' + Math.round(pr.min).toLocaleString(), 'Illiquid minority']);
        }
        return h('div', null,
            TwoCol(
                Card('Private Company Inputs', h('div', null,
                    NumIn('Normalised Earnings ($K)', s.priv.nE, function(v) { upd('priv.nE', v); }, '$K', 100),
                    NumIn('Transaction Multiple', s.priv.mult, function(v) { upd('priv.mult', v); }, 'x', 0.5),
                    NumIn('Total Debt ($K)', s.priv.debt, function(v) { upd('priv.debt', v); }, '$K', 500),
                    NumIn('Cash ($K)', s.priv.cash, function(v) { upd('priv.cash', v); }, '$K', 100),
                    NumIn('Shares outstanding', s.priv.shs, function(v) { upd('priv.shs', v); }, '', 100),
                    h('div', { style: { height: 1, background: 'var(--card-border)', margin: '10px 0' } }),
                    PctIn('DLOM (Lack of Marketability)', s.priv.dlom, function(v) { upd('priv.dlom', v); }),
                    PctIn('DLOC (Lack of Control)', s.priv.dloc, function(v) { upd('priv.dloc', v); }),
                    PctIn('Control Premium cp', s.priv.cp, function(v) { upd('priv.cp', v); }),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 } },
                        h('label', { style: { fontSize: 11, color: 'var(--text-sec)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 } },
                            h('input', { type: 'checkbox', checked: s.priv.isCtrl,
                                onChange: function(e) { upd('priv.isCtrl', e.target.checked); },
                                style: { accentColor: '#00d4ff' } }),
                            'Control stake (apply premium, not discounts)'
                        )
                    )
                )),
                Card('Private Value Bridge', h('div', null,
                    h('div', { style: { fontSize: 10, color: 'var(--amber)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 10 } },
                        'DLOC applied first, DLOM applied second'),
                    DTable(['Step', 'Value', 'Notes'], bridgeRows),
                    h('div', { style: { height: 1, background: 'var(--card-border)', margin: '10px 0' } }),
                    StatRow('Selected Equity Value ($K)', '$' + Math.round(s.priv.isCtrl ? pr.ctrl : pr.min).toLocaleString(), 'var(--cyan)'),
                    s.priv.shs > 0 && StatRow('Equity / Share', fd(c.privPS), 'var(--cyan)')
                ))
            )
        );
    }

    // ── Sub-tab: SENSITIVITY ──────────────────────────────────────────────────
    function cellBg(v, min, max) {
        if (v == null) return 'var(--card)';
        var p = (v - min) / (max - min || 1);
        if (p < 0.35) return '#7f1d1d';
        if (p < 0.50) return '#78350f';
        if (p < 0.65) return '#166534';
        return '#15803d';
    }

    function renderSensitivity() {
        var allVals = [];
        c.sensCells.forEach(function(row) { row.forEach(function(v) { if (v != null) allVals.push(v); }); });
        var min = allVals.length ? Math.min.apply(null, allVals) : 0;
        var max = allVals.length ? Math.max.apply(null, allVals) : 0;
        return h('div', null,
            c.traps.filter(function(t) { return t.m.indexOf('WACC') >= 0; })
                   .map(function(t, i) { return h('div', { key: i }, Alert(t.t, t.m)); }),
            Card('FCFF Sensitivity: Equity/Share vs WACC × Terminal Growth (gL)', h('div', null,
                h('div', { style: { overflowX: 'auto', marginTop: 8 } },
                    h('table', { style: { borderCollapse: 'collapse', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, width: '100%' } },
                        h('thead', null,
                            h('tr', null,
                                h('th', { style: { padding: '6px 10px', color: 'var(--text-muted)', textAlign: 'center', background: 'var(--card)', fontSize: 10, borderBottom: '1px solid var(--card-border)' } }, 'WACC \\ gL'),
                                c.sensCols.map(function(col, j) {
                                    return h('th', { key: j, style: { padding: '6px 8px', color: 'var(--cyan)', textAlign: 'center', background: 'var(--card)', fontSize: 10, borderBottom: '1px solid var(--card-border)', minWidth: 64 } }, col);
                                })
                            )
                        ),
                        h('tbody', null,
                            c.sensCells.map(function(row, i) {
                                return h('tr', { key: i },
                                    h('td', { style: { padding: '6px 10px', color: 'var(--cyan)', background: 'var(--card)', fontWeight: 600, fontSize: 10, borderRight: '1px solid var(--card-border)' } }, c.sensRows[i]),
                                    row.map(function(v, j) {
                                        var bg = cellBg(v, min, max);
                                        var isNear = v != null && price > 0 && Math.abs(v - price) / price < 0.03;
                                        return h('td', { key: j, style: {
                                            padding: '6px 8px', textAlign: 'center',
                                            background: bg,
                                            color: v != null ? '#fff' : 'var(--text-muted)',
                                            fontWeight: isNear ? 700 : 400,
                                            border: isNear ? '2px solid var(--cyan)' : '1px solid rgba(255,255,255,0.04)',
                                            fontSize: 11,
                                        }}, v != null ? '$' + v.toFixed(1) : '∞');
                                    })
                                );
                            })
                        )
                    )
                ),
                h('div', { style: { marginTop: 10, fontSize: 10, color: 'var(--text-muted)' } },
                    'Cyan border = market price zone (±3%). Dark red = lowest value, dark green = highest.')
            ))
        );
    }

    // ── Render dispatch ───────────────────────────────────────────────────────
    var RENDER = {
        dash:  renderDash,
        setup: renderSetup,
        ddm:   renderDDM,
        fcf:   renderFCF,
        mult:  renderMultiples,
        ri:    renderRI,
        priv:  renderPrivate,
        sens:  renderSensitivity,
    };

    // ── Search bar (top band) ──────────────────────────────────────────────────
    var searchBar = h('div', { style: {
        background: 'rgba(0,0,0,0.25)',
        borderBottom: '1px solid var(--card-border)',
        padding: '10px 18px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    }},
        h('div', { style: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', flexShrink: 0 } },
            '◈ Screen Public Co.'),
        h('input', {
            type: 'text',
            value: searchInput,
            placeholder: 'Ticker (e.g. AAPL, MSFT, BRK.B)',
            spellCheck: false,
            onChange: function(e) { setSearchInput(e.target.value); },
            onKeyDown: function(e) { if (e.key === 'Enter') handleSearch(searchInput); },
            style: {
                flex: 1, minWidth: 180, maxWidth: 340,
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid var(--card-border)',
                borderRadius: 7, padding: '7px 12px',
                color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, outline: 'none',
            },
        }),
        h('button', {
            onClick: function() { handleSearch(searchInput); },
            disabled: searchStatus === 'loading',
            style: {
                background: searchStatus === 'loading'
                    ? 'rgba(0,212,255,0.15)'
                    : 'linear-gradient(135deg, #00d4ff, #6366f1)',
                color: searchStatus === 'loading' ? 'var(--cyan)' : '#fff',
                border: 'none', borderRadius: 7, padding: '7px 18px',
                fontWeight: 600, cursor: searchStatus === 'loading' ? 'not-allowed' : 'pointer',
                fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
                opacity: searchStatus === 'loading' ? 0.7 : 1,
            },
        }, searchStatus === 'loading' ? 'Loading…' : 'Load'),
        // Status badge
        loadedTicker && searchStatus !== 'loading' && h('div', { style: {
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)',
            borderRadius: 6, padding: '4px 10px',
            fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)',
        }},
            h('span', { style: { width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' } }),
            loadedTicker + ' loaded'
        ),
        searchStatus === 'error' && h('div', { style: {
            fontSize: 11, color: 'var(--red)', maxWidth: 300,
        }}, searchError || 'Error fetching data'),
        h('div', { style: { fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' } },
            'Prices & fundamentals via /api/equity · data auto-fills all models')
    );

    return h('div', { style: { background: 'var(--bg)', minHeight: '100%', display: 'flex', flexDirection: 'column' } },
        // Ticker search band
        searchBar,
        // Sub-tab header bar
        h('div', { style: {
            background: 'var(--card)',
            borderBottom: '1px solid var(--card-border)',
            padding: '10px 18px',
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }},
            h('div', null,
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
                    h('div', { style: { fontSize: 13, fontWeight: 700, color: 'var(--cyan)', letterSpacing: '0.06em', fontFamily: 'Syne, sans-serif' } },
                        s.co.ticker ? s.co.ticker + ' — VALUATION HOUSE' : 'VALUATION HOUSE'),
                    ValuationCompassBadge()
                ),
                h('div', { style: { fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' } },
                    s.co.name && s.co.ticker
                        ? s.co.name + ' · ' + (intelligence ? intelligence.sectorLabel : 'CFA Level II Suite')
                        : 'CFA Level II Equity Research Suite')
            ),
            h('div', { style: { flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' } },
                INNER_TABS.map(function(t) {
                    var active = innerTab === t.k;
                    return h('button', { key: t.k, onClick: function() { setInnerTab(t.k); }, style: {
                        padding: '5px 12px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
                        background: active ? 'var(--cyan)' : 'var(--card)',
                        color: active ? '#000' : 'var(--text-muted)',
                        border: active ? 'none' : '1px solid var(--card-border)',
                        fontWeight: active ? 600 : 400,
                    }}, t.l);
                })
            ),
            h('div', { style: { textAlign: 'right', minWidth: 80 } },
                h('div', { style: {
                    fontSize: 18, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
                    color: c.cons ? signalColor(c.cons, price) : 'var(--text-muted)',
                }}, c.cons ? '$' + c.cons.toFixed(2) : '—'),
                h('div', { style: { fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' } }, 'Consensus'),
                c.cons != null && h('div', { style: { marginTop: 2 } }, Sig(c.cons, price))
            )
        ),
        // Compass flags panel (collapsed by default)
        CompassFlagsPanel(),
        // Loading overlay
        searchStatus === 'loading' && h('div', { style: {
            padding: '18px 18px 0',
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 12, color: 'var(--cyan)',
            fontFamily: 'JetBrains Mono, monospace',
        }},
            h('span', { style: {
                display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
                border: '2px solid rgba(0,212,255,0.2)', borderTopColor: 'var(--cyan)',
                animation: 'spin 0.7s linear infinite',
            }}),
            'Fetching ' + (pendingSymbol || '') + ' fundamentals…'
        ),
        // Body
        h('div', { style: { flex: 1, padding: 18, overflowY: 'auto' } },
            (RENDER[innerTab] || renderDash)()
        ),
        // ── Scrapbook SaveBar — visible for valuation method tabs ─────────────
        (function() {
            var SAVE_TABS = { fcf: true, ddm: true, mult: true, ri: true };
            if (!SAVE_TABS[innerTab] || !s.co.ticker) return null;

            var sbMethod, sbLabel, sbImplied, sbInputs, sbAssumptions, sbTV, sbEV;

            if (innerTab === 'ddm') {
                sbMethod = 'DDM';
                sbLabel  = s.ddm.model === 'gordon' ? 'Gordon Growth DDM' : s.ddm.model === 'h' ? 'H-Model DDM' : '2-Stage DDM';
                sbImplied = c.ddmV;
                sbInputs = {
                    D0_trailing_dps: s.ddm.D0,
                    gS_pct: +(s.ddm.gS * 100).toFixed(1),
                    gL_pct: +(s.ddm.gL * 100).toFixed(1),
                    cost_of_equity_pct: +(c.re * 100).toFixed(2),
                    n_years: s.ddm.n,
                };
                sbAssumptions = {
                    model_variant: sbLabel,
                    beta: s.coc.beta,
                    erp_pct: +(s.coc.erp * 100).toFixed(1),
                    rf_pct: +(s.coc.rf * 100).toFixed(1),
                };
            } else if (innerTab === 'fcf') {
                var isFF = s.fcf.mode === 'fcff';
                sbMethod = 'DCF';
                sbLabel  = isFF ? '5-Year FCFF DCF' : '5-Year FCFE DCF';
                sbImplied = isFF ? (c.ffR ? c.ffR.eqPS : null) : (c.feR ? c.feR.eqPS : null);
                sbTV = isFF ? (c.ffR ? c.ffR.tv : null) : (c.feR ? c.feR.tv : null);
                sbEV = isFF && c.ffR ? c.ffR.ev : null;
                sbInputs = {
                    wacc_pct: +(c.wc * 100).toFixed(2),
                    terminal_growth_rate_pct: +(s.fcf.gL * 100).toFixed(2),
                    forecast_horizon_years: 5,
                    base_fcf_m: isFF ? s.fcf.fcff0 : s.fcf.fcfe0,
                    growth_yr1_pct: +(s.fcf.gr[0] * 100).toFixed(1),
                    growth_yr5_pct: +(s.fcf.gr[4] * 100).toFixed(1),
                    net_debt_m: Math.max(0, s.fcf.debt - s.fcf.cash),
                    shares_m: s.fcf.shs,
                };
                sbAssumptions = {
                    mode: isFF ? 'FCFF' : 'FCFE',
                    cost_of_equity_pct: +(c.re * 100).toFixed(2),
                    cost_of_debt_pct: +(s.coc.rd * 100).toFixed(2),
                    tax_rate_pct: +(s.coc.tax * 100).toFixed(1),
                    debt_weight: s.coc.wd,
                };
            } else if (innerTab === 'mult') {
                sbMethod = 'EV_EBITDA';
                sbLabel  = 'Comparable Company Multiples';
                sbImplied = c.multAvg;
                sbEV = s.fcf.shs > 0 ? s.mult.pEV * s.mult.ebitda : null;
                sbInputs = {
                    peer_pe: s.mult.pPE,
                    peer_pb: s.mult.pPB,
                    peer_ev_ebitda: s.mult.pEV,
                    peer_ps: s.mult.pPS,
                    eps: s.mult.eps,
                    bvps: s.mult.bvps,
                    ebitda_m: s.mult.ebitda,
                    revenue_m: s.mult.rev,
                    net_debt_m: s.mult.netDebt,
                    shares_m: s.fcf.shs,
                };
                sbAssumptions = {
                    blended_methods: 'P/E, P/B, EV/EBITDA, P/S (simple average)',
                };
            } else if (innerTab === 'ri') {
                sbMethod = 'Residual_Income';
                sbLabel  = 'Residual Income (RI) Model';
                sbImplied = c.riR ? c.riR.v : null;
                sbInputs = {
                    book_value_per_share: s.ri.B0,
                    roe_pct: +(s.ri.ROE * 100).toFixed(1),
                    cost_of_equity_pct: +(c.re * 100).toFixed(2),
                    forecast_horizon_years: s.ri.n,
                    growth_rate_pct: +(s.ri.g * 100).toFixed(2),
                    fade_method: s.ri.mth,
                    omega: s.ri.omega,
                };
                sbAssumptions = {
                    eva_spread_pct: +((s.ri.ROE - c.re) * 100).toFixed(2),
                    sustainable_growth_pct: +(s.ri.g * 100).toFixed(2),
                };
            }

            if (!sbImplied) return null;

            return h('div', { style: { padding: '0 18px 14px' } },
                h(ScrapbookSaveBar, {
                    method: sbMethod,
                    methodLabel: sbLabel,
                    ticker: s.co.ticker,
                    companyName: s.co.name,
                    exchange: null,
                    sector: s.co.sector,
                    currency: 'USD',
                    currentPrice: price,
                    impliedPrice: sbImplied,
                    inputs: sbInputs,
                    assumptions: sbAssumptions,
                    terminalValue: sbTV || null,
                    impliedEV: sbEV || null,
                    onSaved: function(result) {
                        if (result.navigate) {
                            window.dispatchEvent(new CustomEvent('atlas:open-scrapbook', {
                                detail: { ticker: s.co.ticker }
                            }));
                        }
                    },
                })
            );
        })()
    );
}
