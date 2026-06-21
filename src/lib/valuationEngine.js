// ============================================================
// ATLAS Valuation Engine — isomorphic, pure model layer
// ------------------------------------------------------------
// One engine, two callers:
//   • the Valuation House page imports these for live, client-side
//     what-if (unchanged UX), and
//   • the weekly sync (api/sync-valuations) imports the SAME code as
//     the canonical path that writes the trusted saved valuations.
//
// Pure functions only — no React, no DOM, no globals, no page state.
// Inputs in, valuations out. Server-canonical, client-capable, single
// source of truth, zero reimplementation drift.
//
// The fail-loud discipline from PR #627 lives here now, so it travels
// with the engine wherever it runs: when a real input can't be
// hydrated, a method returns null and is dropped (never a default).
// ============================================================

import { assembleFundamentals } from './valuationIntelligence.js';
import { computeComposite } from './fairValueComposite.js';

// ── Tunables ──────────────────────────────────────────────────
// Minimum Gordon spread (discount rate − terminal growth). Below this the
// terminal value explodes (tv = f·(1+gL)/(r−gL)); a 2.8% spread produced
// BMY's $895B EV on a ~$115B company. Fail loud (null) rather than emit it.
export var MIN_TV_SPREAD = 0.02;

// A quote older than this is stale and must not be trusted as current_price
// (it feeds the saved price, the upside denominator and the share fallback).
export var PRICE_STALE_DAYS = 7;

// Default risk-free rate when no live rate is supplied (client what-if).
export var DEFAULT_RISK_FREE = 0.044;

// ── Cost of capital ───────────────────────────────────────────
export function capm(rf, b, erp) { return rf + b * erp; }
export function calcWACC(re, we, rd, wd, t) { return re * we + rd * (1 - t) * wd; }

// ── Dividend models ───────────────────────────────────────────
export function gordonGrowth(D0, g, r) {
    if (r <= g || D0 <= 0) return null;
    return D0 * (1 + g) / (r - g);
}

export function hModel(D0, gS, gL, H, r) {
    if (r <= gL || D0 <= 0) return null;
    var lr = D0 * (1 + gL) / (r - gL);
    var gp = D0 * H * (gS - gL) / (r - gL);
    return { v: lr + gp, lr: lr, gp: gp };
}

export function twoStageDDM(D0, gS, gL, n, r) {
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

// ── Discounted cash flow ──────────────────────────────────────
export function fcffVal(f0, gr, gL, wc, debt, cash, shs) {
    // Fail loud: no fabricated base, no fabricated share count, no thin spread.
    if (f0 == null || f0 <= 0) return null;
    if (shs == null || shs <= 0) return null;
    if (wc - gL < MIN_TV_SPREAD) return null;
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
    var eq = ev - (debt || 0) + (cash || 0);
    return { eqPS: eq / shs, ev: ev, eq: eq, pvS: pvS, pvTV: pvTV, tv: tv, tvPct: pvTV / ev * 100, proj: proj };
}

export function fcfeVal(f0, gr, gL, re, shs) {
    if (f0 == null || f0 <= 0) return null;
    if (shs == null || shs <= 0) return null;
    if (re - gL < MIN_TV_SPREAD) return null;
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
    return { eqPS: eq / shs, eq: eq, pvS: pvS, pvTV: pvTV, tv: tv, tvPct: pvTV / eq * 100, proj: proj };
}

// ── Justified multiples & residual income ─────────────────────
export function jPELeading(b, r, g) { return r > g ? (1 - b) / (r - g) : null; }
export function jPB(roe, r, g) { return r > g ? (roe - g) / (r - g) : null; }

export function riCalc(B0, ROE, re, g, n, mth, omega) {
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
    // Fail loud (B-09): a terminal value that can't be formed for the selected
    // fade method would otherwise be silently left at 0, truncating the RI to
    // book + explicit-period only and understating value while still looking
    // valid. Drop the method instead. Gordon mirrors the FCFF MIN_TV_SPREAD
    // discipline so a near-singular (re ≈ g) perpetuity can't explode either.
    var tv, tvOk;
    if (mth === 'persistence') {
        tvOk = re > omega;
        tv = tvOk ? RI_n / (re - omega) : 0;
    } else {
        tvOk = (re - g) >= MIN_TV_SPREAD && RI_n > 0;
        tv = tvOk ? RI_n * (1 + g) / (re - g) : 0;
    }
    if (!tvOk) return null;
    var pvTV = tv / Math.pow(1 + re, n);
    return {
        v: B0 + pvS + pvTV, B0: B0, pvS: pvS, pvTV: pvTV, periods: periods,
        tvPct: Math.abs(pvTV) / (Math.abs(pvS) + Math.abs(pvTV) + B0) * 100,
    };
}

export function privCalc(nE, mult, debt, cash, dlom, dloc, isCtrl, cp) {
    var ev   = nE * mult;
    var eq   = ev - debt + cash;
    var ctrl = eq * (1 + cp);
    var min  = eq * (1 - dloc) * (1 - dlom);
    return { ev: ev, eq: eq, ctrl: ctrl, min: min };
}

export function buildConsensus(valMap, wts) {
    var totalWt = Object.keys(wts).reduce(function(a, k) {
        return a + (valMap[k] != null && valMap[k] > 0 ? wts[k] : 0);
    }, 0);
    if (totalWt === 0) return null;
    return Object.keys(wts).reduce(function(a, k) {
        return a + (valMap[k] != null && valMap[k] > 0 ? valMap[k] * wts[k] : 0);
    }, 0) / totalWt;
}

// Patches the mapped state with real values from assembleFundamentals.
// Only overwrites fields where hasData===true and the value is non-null/non-zero.
// FCFE can be negative (high-capex companies) so we don't clamp it.
export function applyFundamentalsHydration(mappedState, fund) {
    if (!fund) return mappedState;
    var fcf = Object.assign({}, mappedState.fcf);
    var ddm = Object.assign({}, mappedState.ddm);
    var changed = false;

    if (fund.fcff && fund.fcff.hasData && fund.fcff.value != null) {
        fcf.fcff0 = Math.round(fund.fcff.value * 10) / 10;
        changed = true;
    }
    if (fund.fcfe && fund.fcfe.hasData && fund.fcfe.value != null) {
        fcf.fcfe0 = Math.round(fund.fcfe.value * 10) / 10;
        changed = true;
    }
    if (fund.totalDebt && fund.totalDebt.hasData && fund.totalDebt.value != null) {
        fcf.debt = fund.totalDebt.value;
        changed = true;
    }
    if (fund.cash && fund.cash.hasData && fund.cash.value != null) {
        fcf.cash = fund.cash.value;
        changed = true;
    }
    if (fund.dividend && fund.dividend.hasData && fund.dividend.value != null) {
        ddm.D0 = fund.dividend.value;
        changed = true;
    }

    if (!changed) return mappedState;
    return Object.assign({}, mappedState, { fcf: fcf, ddm: ddm });
}

// ── Sector defaults & classifier ──────────────────────────────
export var SECTORS = {
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

// Defaults for the private-co and consensus-weight blocks (mapPayload fills the
// rest from live data). Kept here so the engine is self-contained.
export var DEFAULT_PRIV = { nE: 8000, mult: 10, debt: 25000, cash: 5000, shs: 2000,
                            dlom: 0.20, dloc: 0.15, isCtrl: false, cp: 0.25 };
export var DEFAULT_WTS  = { ddm: 20, fcff: 25, fcfe: 20, mult: 20, ri: 15 };

// Sector classifier — covers Yahoo Finance sectors, Finnhub GICS industries,
// and Alpha Vantage sector strings. Pass both sector AND industry for best
// coverage (Finnhub only returns an industry string, not a broad sector).
export function sectorToKey(sector, industry) {
    var candidates = [];
    if (sector)   candidates.push(sector.toLowerCase());
    if (industry && industry !== sector) candidates.push(industry.toLowerCase());

    for (var ci = 0; ci < candidates.length; ci++) {
        var s = candidates[ci];

        if (s.includes('real estate') || s.includes('reit') || s.includes('realty') ||
            s.includes('property trust'))
            return 'realestate';

        if (s.includes('utilit') || s.includes('water utility') || s.includes('gas utility') ||
            s.includes('regulated gas') || s.includes('regulated electric') ||
            s.includes('regulated water') || s.includes('independent power'))
            return 'utilities';

        if (s.includes('energy') || s.includes('oil') || s.includes('gas e&p') ||
            s.includes('petroleum') || s.includes('coal') || s.includes('uranium') ||
            s.includes('pipeline') || s.includes('refin') || s.includes('midstream') ||
            s.includes('integrated oil') || s.includes('oil & gas') || s.includes('fossil'))
            return 'energy';

        if (s.includes('health') || s.includes('pharma') || s.includes('biotech') ||
            s.includes('medical') || s.includes('drug') || s.includes('hospital') ||
            s.includes('diagnostics') || s.includes('managed care') || s.includes('life science') ||
            s.includes('therapeut') || s.includes('clinical') || s.includes('genomic') ||
            s.includes('radiolog') || s.includes('dental') || s.includes('optometri') ||
            s.includes('medtech'))
            return 'healthcare';

        if (s.includes('financ') || s.includes('bank') || s.includes('insurance') ||
            s.includes('invest') || s.includes('asset management') || s.includes('credit') ||
            s.includes('mortgage') || s.includes('brokerage') || s.includes('capital market') ||
            s.includes('exchange') || s.includes('wealth') || s.includes('private equity') ||
            s.includes('financial service') || s.includes('diversified financial'))
            return 'financials';

        if (s.includes('communication service') || s.includes('telecom') || s.includes('wireless') ||
            s.includes('broadcasting') || s.includes('publishing') || s.includes('advertising') ||
            s.includes('interactive media') || s.includes('entertainment') ||
            s.includes('gaming & multimedia') || s.includes('electronic gaming') ||
            s.includes('social media') || s.includes('media'))
            return 'comms';

        if (s.includes('tech') || s.includes('software') || s.includes('semiconductor') ||
            s.includes('hardware') || s.includes('computer') || s.includes('internet content') ||
            s.includes('data center') || s.includes('cloud') || s.includes('cybersecur') ||
            s.includes('artificial intel') || s.includes('information tech') ||
            s.includes('electronic components') || s.includes('it service'))
            return 'technology';

        if (s.includes('basic material') || s.includes('mining') || s.includes('gold') ||
            s.includes('silver') || s.includes('copper') || s.includes('steel') ||
            s.includes('aluminum') || s.includes('metal') || s.includes('chemical') ||
            s.includes('specialty chemical') || s.includes('agricultural input') ||
            s.includes('fertilizer') || s.includes('paper') || s.includes('forestry') ||
            s.includes('lumber') || s.includes('packaging') || s.includes('platinum') ||
            s.includes('precious metal') || s.includes('commodity'))
            return 'materials';

        if (s.includes('industr') || s.includes('aerospace') || s.includes('defense') ||
            s.includes('airlin') || s.includes('railroad') || s.includes('transport') ||
            s.includes('logistics') || s.includes('machinery') || s.includes('construction') ||
            s.includes('engineering') || s.includes('farm & heavy') || s.includes('conglomerate') ||
            s.includes('waste') || s.includes('staffing') || s.includes('consulting') ||
            s.includes('commercial service') || s.includes('business service') ||
            s.includes('professional service') || s.includes('marine') || s.includes('trucking'))
            return 'industrials';

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

export function avSectorToKey(sector) { return sectorToKey(sector, null); }

// ── Hydration: payload → engine state ─────────────────────────
// `opts.riskFreeRate` threads a live rate into WACC (weekly sync). When absent,
// the client what-if path uses DEFAULT_RISK_FREE, so numbers are unchanged.
export function mapPayload(payload, series, opts) {
    opts = opts || {};
    var rfRate = (opts.riskFreeRate != null && isFinite(opts.riskFreeRate)) ? opts.riskFreeRate : DEFAULT_RISK_FREE;

    var o      = payload.overview   || {};
    var rawFin = payload.financials || {};
    var fin    = (rawFin && rawFin.snapshot) ? rawFin.snapshot : rawFin;
    var num    = function(k, obj) { var v = Number((obj || o)[k]); return isFinite(v) && v !== 0 ? v : null; };

    // Price: last close, but only if the series is fresh and positive. A stale
    // or missing quote fails loud (priceTrusted = false) — see PRICE_STALE_DAYS.
    var lastBar    = series && series.length ? series[series.length - 1] : null;
    var price      = lastBar && lastBar.close > 0 ? lastBar.close : null;
    var priceAgeMs = lastBar ? (Date.now() - new Date(lastBar.date).getTime()) : Infinity;
    var priceTrusted = price != null && priceAgeMs < PRICE_STALE_DAYS * 864e5;

    var beta    = num('Beta') || 1.0;
    var mktCap  = num('MarketCapitalization') || null;   // raw dollars
    var mktCapM = mktCap ? mktCap / 1e6 : null;

    // Shares (millions): real reported count first (Finnhub shareOutstanding is
    // already fetched, absolute), then netIncome/EPS, then mktCap/price ONLY if
    // the price is trusted. No placeholder — null drops the per-share methods.
    var trailingEps = fin.trailingEps || num('EPS') || null;
    var netIncomeM  = fin.netIncome ? fin.netIncome / 1e6 : null;
    var realSharesM = (fin.sharesOutstanding && fin.sharesOutstanding > 0) ? fin.sharesOutstanding / 1e6 : null;
    var sharesM;
    if (realSharesM != null) {
        sharesM = realSharesM;
    } else if (netIncomeM && trailingEps && Math.abs(trailingEps) > 0.01) {
        sharesM = Math.abs(netIncomeM / trailingEps);
    } else if (mktCap && priceTrusted && price > 0) {
        sharesM = (mktCap / price) / 1e6;
    } else {
        sharesM = null;   // fail loud — no fabricated share count
    }

    var eps    = trailingEps || null;
    var bvps   = fin.bookValue || num('BookValue') || null;
    var divYld = num('DividendYield') || 0;
    var D0     = +(divYld * (price || 0)).toFixed(2);
    var roe    = fin.returnOnEquity != null ? fin.returnOnEquity : 0.145;

    // Balance sheet / income statement ($M) — null when unhydrated (fail loud).
    var debt   = fin.totalDebt    ? +(fin.totalDebt    / 1e6).toFixed(0) : null;
    var cash   = fin.totalCash    ? +(fin.totalCash    / 1e6).toFixed(0) : null;
    var ebitda = fin.ebitda       ? +(fin.ebitda       / 1e6).toFixed(0) : null;
    var rev    = fin.totalRevenue ? +(fin.totalRevenue / 1e6).toFixed(0) : null;

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
    var rf         = rfRate;
    var debtEbitda = (debt != null && ebitda > 0) ? debt / ebitda : 2.0;
    var creditSpread;
    if      (debtEbitda < 1.0) creditSpread = 0.008;
    else if (debtEbitda < 2.0) creditSpread = 0.012;
    else if (debtEbitda < 3.0) creditSpread = 0.018;
    else if (debtEbitda < 4.5) creditSpread = 0.025;
    else                       creditSpread = 0.040;
    var rd = +(rf + creditSpread).toFixed(4);

    // FCF: freeCashflow = operatingCF − capex = FCFE; FCFF = FCFE + Debt×rd×(1−tax).
    // No real FCF → null base, so the DCF method drops (no fabricated 400/500).
    var fcfe0raw    = fin.freeCashflow ? fin.freeCashflow / 1e6 : null;
    var interestAdj = (debt || 0) * rd * (1 - tax);
    var fcfe0 = fcfe0raw != null ? +fcfe0raw.toFixed(0)              : null;
    var fcff0 = fcfe0raw != null ? +(fcfe0raw + interestAdj).toFixed(0) : null;

    // WACC weights: prefer market-value (debt / (debt + mktCap)); fallback book D/E
    var wd;
    if (mktCapM && debt > 0) {
        wd = Math.max(0.05, Math.min(0.70, debt / (debt + mktCapM)));
    } else {
        var de = fin.debtToEquity != null ? fin.debtToEquity / 100 : 0.30;
        wd = Math.max(0.05, Math.min(0.70, de / (1 + de)));
    }

    var secKey = sectorToKey(o.Sector, o.Industry) || 'general';
    var sec    = SECTORS[secKey] || SECTORS['general'];
    var gL     = sec.gL;

    var earningsG  = fin.earningsGrowth != null ? fin.earningsGrowth : null;
    var revenueG   = fin.revenueGrowth  != null ? fin.revenueGrowth  : null;
    var pegImplied = null;
    if (fin.pegRatio && fin.pegRatio > 0 && fin.forwardPE && fin.forwardPE > 0) {
        pegImplied = fin.forwardPE / fin.pegRatio / 100;
    }
    var gS = Math.max(0.01, Math.min(0.35, earningsG || pegImplied || revenueG || sec.gS));

    var gr = [];
    for (var i = 0; i < 5; i++) {
        gr.push(+(gS + (gL - gS) * (i / 4)).toFixed(3));
    }

    var b = eps > 0 && D0 > 0 ? Math.max(0, Math.min(0.99, +(1 - D0 / eps).toFixed(2))) : 0.40;
    var riG = Math.max(gL, Math.min(0.15, +(roe * b).toFixed(3)));

    var netDebt = Math.max(0, (debt || 0) - (cash || 0));
    // Peer multiples: real ratios only. null → that multiple sub-method drops.
    var pePeer  = num('PERatio') || fin.forwardPE || null;
    var pbPeer  = fin.priceToBook  ? +fin.priceToBook.toFixed(1)
                  : (bvps > 0 && priceTrusted && price > 0 ? +(price / bvps).toFixed(1) : null);
    var pEV     = fin.evToEbitda   ? +fin.evToEbitda.toFixed(1)   : null;
    var pPS     = fin.evToRevenue  ? +fin.evToRevenue.toFixed(1)  : null;

    // Hard-data fields are null when unhydrated (fail loud → method drops).
    return {
        co:   { name: o.Name || o.Symbol || 'Unknown', ticker: o.Symbol || '', price: price, priceTrusted: priceTrusted, sector: secKey },
        coc:  { rf: rf, beta: beta, erp: 0.055, rd: rd, wd: +wd.toFixed(3), tax: +tax.toFixed(3) },
        ddm:  { D0: Math.max(0, D0), gS: +gS.toFixed(3), gL: gL, n: 5, H: 4, model: D0 > 0 ? '2stage' : 'gordon' },
        fcf:  { fcff0: fcff0 != null && fcff0 > 0 ? fcff0 : null, fcfe0: fcfe0 != null && fcfe0 > 0 ? fcfe0 : null,
                gr: gr, gL: gL, debt: debt, cash: cash,
                shs: sharesM != null ? Math.round(sharesM) : null, mode: 'fcff' },
        mult: { eps: eps > 0 ? +eps.toFixed(2) : null, bvps: bvps > 0 ? +bvps.toFixed(2) : null,
                ebitda: ebitda != null && ebitda > 0 ? ebitda : null, rev: rev != null && rev > 0 ? rev : null, b: b,
                mktCap: mktCapM ? +mktCapM.toFixed(0) : null, netDebt: netDebt,
                pPE: pePeer, pPB: pbPeer, pEV: pEV, pPS: pPS },
        ri:   { B0: bvps > 0 ? +bvps.toFixed(2) : null, ROE: roe > 0 ? +roe.toFixed(3) : 0.145,
                g: riG, n: 5, mth: 'gordon', omega: 0.60 },
        priv: Object.assign({}, DEFAULT_PRIV),
        wts:  Object.assign({}, DEFAULT_WTS),
    };
}

// ── computeMethods — the shared valuation pass ────────────────
// Runs every model on an engine state and returns both the rich result the
// page memo renders AND a per-method list (with drop reasons) the sync writes.
// Identical math for both callers — no reimplementation.
export function computeMethods(s) {
    var coc = s.coc, ddm = s.ddm, fcf = s.fcf, mult = s.mult, ri = s.ri, priv = s.priv, wts = s.wts;
    // Financials (banks/insurers): free cash flow is not a meaningful concept and
    // enterprise value is undefined (debt is raw material, not financing), so the
    // DCF (FCFF/FCFE), EV/EBITDA and P/S legs are inapplicable. Value them on
    // DDM, residual income and equity multiples (P/E, P/B) only — otherwise a
    // revenue×margin DCF on a bank manufactures absurd fair values.
    var isFin = (s.co && s.co.sector === 'financials');
    var re  = capm(coc.rf, coc.beta, coc.erp);
    var we  = 1 - coc.wd;
    var wc  = calcWACC(re, we, coc.rd, coc.wd, coc.tax);

    var ggm = gordonGrowth(ddm.D0, ddm.gL, re);
    var hm  = hModel(ddm.D0, ddm.gS, ddm.gL, ddm.H, re);
    var ts  = twoStageDDM(ddm.D0, ddm.gS, ddm.gL, ddm.n, re);
    var ddmV = ddm.model === 'gordon' ? ggm : ddm.model === 'h' ? (hm ? hm.v : null) : (ts ? ts.v : null);

    var ffR = isFin ? null : fcffVal(fcf.fcff0, fcf.gr, fcf.gL, wc, fcf.debt, fcf.cash, fcf.shs);
    var feR = isFin ? null : fcfeVal(fcf.fcfe0, fcf.gr, fcf.gL, re, fcf.shs);

    // Multiples: real peer ratio × real base only; a null on either side drops
    // that leg (no shared placeholder anchors its value).
    var safeClamp = function(v, lo, hi) { return v == null ? null : Math.min(Math.max(v, lo), hi); };
    var safePE  = safeClamp(mult.pPE,  3,   200);
    var safePB  = safeClamp(mult.pPB,  0.1,  20);
    var safeEV  = safeClamp(mult.pEV,  1,    60);
    var safePS  = safeClamp(mult.pPS,  0.1,  20);
    var liveNetDebt = Math.max(0, (fcf.debt || 0) - (fcf.cash || 0));
    var hasShs = fcf.shs != null && fcf.shs > 0;

    var pPE   = (safePE != null && mult.eps  != null) ? safePE * mult.eps  : null;
    var pPB   = (safePB != null && mult.bvps != null) ? safePB * mult.bvps : null;
    var pEVps = (hasShs && safeEV != null && mult.ebitda != null) ? (safeEV * mult.ebitda - liveNetDebt) / fcf.shs : null;
    var pPS   = (hasShs && safePS != null && mult.rev    != null) ? (safePS * mult.rev - liveNetDebt) / fcf.shs : null;
    var jpeV  = jPELeading(mult.b, re, ddm.gL);
    var jpbV  = jPB(ri.ROE, re, ri.g);
    // Sanity gate: only with a TRUSTED price; drop any leg outside an 8× band.
    // Financials use equity multiples only (P/E, P/B) — EV/EBITDA and P/S drop.
    var priceRef = (s.co.priceTrusted && s.co.price > 0) ? s.co.price : null;
    var legSet = isFin ? [pPE, pPB] : [pPE, pPB, pEVps, pPS];
    var mLegs = legSet.filter(function(v) {
        if (!(v > 0 && isFinite(v))) return false;
        return priceRef == null ? true : (v <= priceRef * 8 && v >= priceRef / 8);
    });
    var mLegsRaw = legSet.filter(function(v) { return v > 0 && isFinite(v); });
    var multAvg = mLegs.length ? mLegs.reduce(function(a, b) { return a + b; }, 0) / mLegs.length : null;

    var riR  = (ri.B0 != null) ? riCalc(ri.B0, ri.ROE, re, ri.g, ri.n, ri.mth, ri.omega) : null;
    var privR = privCalc(priv.nE, priv.mult, priv.debt, priv.cash, priv.dlom, priv.dloc, priv.isCtrl, priv.cp);
    var privPS = priv.shs > 0 ? (priv.isCtrl ? privR.ctrl : privR.min) / priv.shs : null;

    var valMap = { ddm: ddmV, fcff: ffR ? ffR.eqPS : null, fcfe: feR ? feR.eqPS : null, mult: multAvg, ri: riR ? riR.v : null };
    var cons   = buildConsensus(valMap, wts);

    return {
        re: re, we: we, wc: wc, ggm: ggm, hm: hm, ts: ts, ddmV: ddmV,
        ffR: ffR, feR: feR,
        pPE: pPE, pPB: pPB, pEVps: pEVps, pPS: pPS, jpeV: jpeV, jpbV: jpbV, multAvg: multAvg,
        // Effective (clamped) multiples actually used for the implied prices above.
        // A leg whose raw peer multiple sat outside the sane band is capped here,
        // so the UI can show the multiple that produced the price — not the raw input.
        safeMult: { pPE: safePE, pPB: safePB, pEV: safeEV, pPS: safePS },
        // diagnostics for drop-reason attribution
        _mLegsCount: mLegsRaw.length, _mLegsTrimmed: mLegsRaw.length - mLegs.length,
        riR: riR, privR: privR, privPS: privPS, valMap: valMap, cons: cons,
    };
}

// ── Drop-reason attribution per method (for the health surface) ──
function dcfDrop(s, c) {
    if (s.co && s.co.sector === 'financials') return 'sector_inapplicable';
    if (s.fcf.shs == null)  return 'shares_unhydrated';
    if (s.fcf.fcff0 == null) return 'missing_fcf_base';
    if (c.wc - s.fcf.gL < MIN_TV_SPREAD) return 'tv_clamped';
    return c.ffR && c.ffR.eqPS > 0 ? null : 'dcf_undefined';
}
function ddmDrop(s, c) {
    if (s.ddm.D0 <= 0) return s.co.priceTrusted ? 'no_dividend' : 'stale_price';
    return c.ddmV > 0 ? null : 'ddm_undefined';
}
function multDrop(s, c) {
    if (s.fcf.shs == null) return 'shares_unhydrated';
    if (c._mLegsCount === 0) return s.co.priceTrusted ? 'missing_multiples_inputs' : 'stale_price';
    return c.multAvg > 0 ? null : 'outlier_trimmed';
}
function riDrop(s, c) {
    if (s.ri.B0 == null) return 'missing_book_value';
    return c.riR && c.riR.v > 0 ? null : 'ri_undefined';
}

// ── buildMethodSnapshots — canonical per-method rows for persistence ──
// One row per attempted method. Valued methods carry implied_price; dropped
// methods carry implied_price=null + a drop_reason. Mirrors the page's
// SaveBar assembly, but headless and for all methods at once.
export function buildMethodSnapshots(s, c) {
    var rows = [];
    var pushRow = function(method, label, price, dropReason, inputs, assumptions, terminalValue, impliedEV) {
        var valued = price != null && isFinite(price) && price > 0 && dropReason == null;
        rows.push({
            method: method,
            method_label: label,
            implied_price: valued ? +price.toFixed(2) : null,
            drop_reason: valued ? null : (dropReason || 'unknown'),
            inputs: inputs || {},
            assumptions: assumptions || {},
            terminal_value: terminalValue != null ? terminalValue : null,
            implied_ev: impliedEV != null ? impliedEV : null,
        });
    };

    // DCF (FCFF — the canonical DCF)
    pushRow('DCF', '5-Year FCFF DCF',
        c.ffR ? c.ffR.eqPS : null, dcfDrop(s, c),
        { wacc_pct: +(c.wc * 100).toFixed(2), terminal_growth_rate_pct: +(s.fcf.gL * 100).toFixed(2),
          forecast_horizon_years: 5, base_fcf_m: s.fcf.fcff0, growth_yr1_pct: +(s.fcf.gr[0] * 100).toFixed(1),
          growth_yr5_pct: +(s.fcf.gr[4] * 100).toFixed(1), net_debt_m: Math.max(0, (s.fcf.debt || 0) - (s.fcf.cash || 0)),
          shares_m: s.fcf.shs },
        { mode: 'FCFF', cost_of_equity_pct: +(c.re * 100).toFixed(2), cost_of_debt_pct: +(s.coc.rd * 100).toFixed(2),
          tax_rate_pct: +(s.coc.tax * 100).toFixed(1), debt_weight: s.coc.wd },
        c.ffR ? c.ffR.tv : null, c.ffR ? c.ffR.ev : null);

    // DDM
    pushRow('DDM', s.ddm.model === 'gordon' ? 'Gordon Growth DDM' : '2-Stage DDM',
        c.ddmV, ddmDrop(s, c),
        { D0_trailing_dps: s.ddm.D0, gS_pct: +(s.ddm.gS * 100).toFixed(1), gL_pct: +(s.ddm.gL * 100).toFixed(1),
          cost_of_equity_pct: +(c.re * 100).toFixed(2), n_years: s.ddm.n },
        { model_variant: s.ddm.model, beta: s.coc.beta, erp_pct: +(s.coc.erp * 100).toFixed(1), rf_pct: +(s.coc.rf * 100).toFixed(1) },
        null, null);

    // Multiples (EV/EBITDA blend)
    pushRow('EV_EBITDA', 'Comparable Company Multiples',
        c.multAvg, multDrop(s, c),
        { peer_pe: s.mult.pPE, peer_pb: s.mult.pPB, peer_ev_ebitda: s.mult.pEV, peer_ps: s.mult.pPS,
          eps: s.mult.eps, bvps: s.mult.bvps, ebitda_m: s.mult.ebitda, revenue_m: s.mult.rev,
          net_debt_m: s.mult.netDebt, shares_m: s.fcf.shs },
        { blended_methods: 'P/E, P/B, EV/EBITDA, P/S (trimmed average)' },
        null, (s.fcf.shs && s.mult.pEV && s.mult.ebitda) ? s.mult.pEV * s.mult.ebitda : null);

    // Residual Income
    pushRow('Residual_Income', 'Residual Income (RI) Model',
        c.riR ? c.riR.v : null, riDrop(s, c),
        { book_value_per_share: s.ri.B0, roe_pct: +(s.ri.ROE * 100).toFixed(1), cost_of_equity_pct: +(c.re * 100).toFixed(2),
          forecast_horizon_years: s.ri.n, growth_rate_pct: +(s.ri.g * 100).toFixed(2), fade_method: s.ri.mth, omega: s.ri.omega },
        { eva_spread_pct: +((s.ri.ROE - c.re) * 100).toFixed(2), sustainable_growth_pct: +(s.ri.g * 100).toFixed(2) },
        null, null);

    return rows;
}

// ── runValuation — the full isomorphic entry point ────────────
// payload: { overview, financials } as returned by /api/equity
// series:  [{date, close}] ascending
// opts:    { riskFreeRate }
// Returns the resolved state, the per-method snapshot rows (with composite-
// trim drop reasons applied), and the deterministic composite. Used by the
// weekly sync as the canonical write path.
export function runValuation(payload, series, opts) {
    opts = opts || {};
    var state = mapPayload(payload, series, opts);
    var fund  = assembleFundamentals(payload, state);
    state = applyFundamentalsHydration(state, fund);

    var computed = computeMethods(state);
    var methods  = buildMethodSnapshots(state, computed);

    // Deterministic composite over the valued methods, anchored on the trusted
    // price. Methods trimmed by the band are re-flagged outlier_trimmed and
    // their implied_price nulled so methods_valued = survivors backing the blend.
    var trusted = (state.co.priceTrusted && state.co.price > 0) ? state.co.price : null;
    var valued  = methods.filter(function(m) { return m.implied_price != null; });
    var blend   = computeComposite(valued.map(function(m) { return m.implied_price; }), trusted);
    var survivors = blend ? blend.used.slice() : [];

    methods.forEach(function(m) {
        if (m.implied_price == null) return;
        var i = survivors.indexOf(m.implied_price);
        if (i >= 0) { survivors.splice(i, 1); return; }   // kept
        // computed but trimmed from the trusted blend
        m.inputs = Object.assign({}, m.inputs, { trimmed_implied_price: m.implied_price });
        m.implied_price = null;
        m.drop_reason = 'outlier_trimmed';
    });

    return {
        ticker: state.co.ticker,
        state: state,
        computed: computed,
        methods: methods,
        composite: blend
            ? { avg_fair_value: blend.blended_fair_value, fair_value_low: blend.fair_value_low, fair_value_high: blend.fair_value_high }
            : { avg_fair_value: null, fair_value_low: null, fair_value_high: null },
        priceTrusted: state.co.priceTrusted,
        currentPrice: state.co.price,
    };
}
