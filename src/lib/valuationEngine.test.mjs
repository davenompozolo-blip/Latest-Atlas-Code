// Isomorphic engine checks — run: node src/lib/valuationEngine.test.mjs
// Exercises the headless runValuation path (what the weekly sync calls) plus
// drop-reason attribution for the fail-loud cases.

import { runValuation, computeMethods, buildMethodSnapshots, mapPayload } from './valuationEngine.js';

const today = new Date().toISOString().slice(0, 10);
const freshSeries = (close) => [{ date: today, close }];

let fails = 0;
const check = (name, cond, detail) => {
    if (!cond) fails++;
    console.log(`${cond ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
};
const row = (res, method) => res.methods.find(m => m.method === method);

// ── Case 1: healthy large-cap — real shares/FCF/EBITDA hydrate, composite forms.
const healthy = runValuation({
    overview: { Name: 'Healthy Co', Symbol: 'HLTH', Sector: 'Technology', MarketCapitalization: 3.3e12,
                Beta: 1.25, DividendYield: 0, PERatio: 30 },
    financials: { snapshot: {
        sharesOutstanding: 24.5e9, trailingEps: 3.0, netIncome: 73e9, totalRevenue: 130e9,
        ebitda: 80e9, freeCashflow: 60e9, totalDebt: 10e9, totalCash: 30e9, bookValue: 3.0,
        returnOnEquity: 0.40, operatingMargins: 0.45, profitMargins: 0.55,
        evToEbitda: 28, evToRevenue: 18, priceToBook: 40, forwardPE: 30,
        revenueGrowth: 0.18, earningsGrowth: 0.22,
    } },
}, freshSeries(135), { riskFreeRate: 0.043 });

check('healthy: shares hydrated to ~24,500M', healthy.state.fcf.shs > 24000 && healthy.state.fcf.shs < 25000, `shs=${healthy.state.fcf.shs}`);
// DCF computed successfully — it either survives the blend or is trimmed as an
// outlier, but never fails loud on missing data here.
check('healthy: DCF computed (not a data-failure drop)', [null, 'outlier_trimmed'].includes(row(healthy, 'DCF').drop_reason));
check('healthy: DDM dropped (no dividend)', row(healthy, 'DDM').implied_price == null && row(healthy, 'DDM').drop_reason === 'no_dividend');
check('healthy: composite present', healthy.composite.avg_fair_value != null,
    `avg=${healthy.composite.avg_fair_value} [${healthy.composite.fair_value_low}–${healthy.composite.fair_value_high}]`);

// ── B-07: peer P/B of 40× sits outside the sane band → the engine exposes the
// effective (clamped) multiple so the UI can show what produced the implied price.
const hc = computeMethods(healthy.state);
check('B-07: raw peer P/B is 40×', healthy.state.mult.pPB === 40, `pPB=${healthy.state.mult.pPB}`);
check('B-07: effective P/B clamped to 20×', hc.safeMult && hc.safeMult.pPB === 20, `safePB=${hc.safeMult && hc.safeMult.pPB}`);
check('B-07: implied P/B reconciles to effective multiple × BVPS',
    hc.pPB != null && Math.abs(hc.pPB - hc.safeMult.pPB * healthy.state.mult.bvps) < 1e-6,
    `pPB=${hc.pPB} eff×bvps=${hc.safeMult.pPB * healthy.state.mult.bvps}`);

// ── Case 2: NVDA-shape with NO real share count + stale price → fail loud.
const noShares = runValuation({
    overview: { Name: 'NoShares', Symbol: 'NOSH', Sector: 'Technology', MarketCapitalization: 3.3e12, Beta: 1.5 },
    financials: { snapshot: {
        // no sharesOutstanding, no usable EPS pair
        totalRevenue: 130e9, ebitda: 80e9, freeCashflow: 60e9, totalDebt: 10e9, totalCash: 30e9,
        evToEbitda: 28, operatingMargins: 0.45, profitMargins: 0.55,
    } },
}, [{ date: '2026-01-01', close: 135 }] /* stale → priceTrusted=false */, { riskFreeRate: 0.043 });

check('no-shares: priceTrusted false (stale)', noShares.priceTrusted === false);
check('no-shares: shs null', noShares.state.fcf.shs == null);
check('no-shares: DCF drops shares_unhydrated', row(noShares, 'DCF').implied_price == null && row(noShares, 'DCF').drop_reason === 'shares_unhydrated');
check('no-shares: multiples drops shares_unhydrated', row(noShares, 'EV_EBITDA').drop_reason === 'shares_unhydrated');

// ── Case 3: thin Gordon spread → DCF clamps loud (tv_clamped). Crafted state.
const thin = {
    co: { ticker: 'THIN', price: 50, priceTrusted: true, sector: 'utilities' },
    coc: { rf: 0.03, beta: 0.2, erp: 0.055, rd: 0.04, wd: 0.10, tax: 0.21 },
    ddm: { D0: 0, gS: 0.03, gL: 0.025, n: 5, H: 4, model: 'gordon' },
    fcf: { fcff0: 1000, fcfe0: 800, gr: [0.03, 0.03, 0.03, 0.03, 0.03], gL: 0.025, debt: 2000, cash: 500, shs: 500, mode: 'fcff' },
    mult: { eps: null, bvps: null, ebitda: null, rev: null, b: 0.4, mktCap: null, netDebt: 1500, pPE: null, pPB: null, pEV: null, pPS: null },
    ri: { B0: null, ROE: 0.10, g: 0.025, n: 5, mth: 'gordon', omega: 0.60 },
    priv: { nE: 8000, mult: 10, debt: 25000, cash: 5000, shs: 2000, dlom: 0.2, dloc: 0.15, isCtrl: false, cp: 0.25 },
    wts: { ddm: 20, fcff: 25, fcfe: 20, mult: 20, ri: 15 },
};
const tc = computeMethods(thin);
const tcRows = buildMethodSnapshots(thin, tc);
const tcDcf = tcRows.find(m => m.method === 'DCF');
check('thin-spread: wc − gL < 2%', (tc.wc - thin.fcf.gL) < 0.02, `spread=${((tc.wc - thin.fcf.gL) * 100).toFixed(2)}%`);
check('thin-spread: DCF drops tv_clamped', tcDcf.implied_price == null && tcDcf.drop_reason === 'tv_clamped');

// ── Case 4: every method broken → composite null (ABEV3.SA shape).
const allBroken = runValuation({
    overview: { Name: 'Broken', Symbol: 'BRK', Sector: 'general' },
    financials: { snapshot: {} },
}, [{ date: '2026-01-01', close: 3.1 }], {});
check('all-broken: composite null', allBroken.composite.avg_fair_value == null);

// ── Case 5 (B-09): RI Gordon terminal undefined (g ≥ re) → method drops loud,
// rather than silently emitting a no-terminal book + explicit-period value.
const riThin = {
    co: { ticker: 'RIX', price: 100, priceTrusted: true, sector: 'technology' },
    coc: { rf: 0.03, beta: 1.0, erp: 0.055, rd: 0.04, wd: 0.10, tax: 0.21 },
    ddm: { D0: 0, gS: 0.10, gL: 0.03, n: 5, H: 4, model: 'gordon' },
    fcf: { fcff0: null, fcfe0: null, gr: [0.1, 0.08, 0.06, 0.05, 0.04], gL: 0.03, debt: 0, cash: 0, shs: 100, mode: 'fcff' },
    mult: { eps: null, bvps: null, ebitda: null, rev: null, b: 0.5, mktCap: null, netDebt: 0, pPE: null, pPB: null, pEV: null, pPS: null },
    // re = 0.03 + 1.0*0.055 = 0.085; g = 0.12 ≥ re → Gordon terminal undefined
    ri: { B0: 20, ROE: 0.30, g: 0.12, n: 5, mth: 'gordon', omega: 0.60 },
    priv: { nE: 8000, mult: 10, debt: 25000, cash: 5000, shs: 2000, dlom: 0.2, dloc: 0.15, isCtrl: false, cp: 0.25 },
    wts: { ddm: 20, fcff: 25, fcfe: 20, mult: 20, ri: 15 },
};
const riC = computeMethods(riThin);
const riRows = buildMethodSnapshots(riThin, riC);
const riRow = riRows.find(m => m.method === 'Residual_Income');
check('ri-thin: g ≥ re so RI value is null (not a silent truncated value)', riC.riR == null);
check('ri-thin: RI method drops loud (ri_undefined)', riRow.implied_price == null && riRow.drop_reason === 'ri_undefined');

// ── Case 6: financials (bank) — DCF/EV/PS are inapplicable and must not
// manufacture an absurd fair value from revenue×margin. Equity-research showed
// Citigroup at +23,000% upside from exactly this. The bank should be valued on
// DDM/RI/P-E/P-B and the composite must sit in a sane band around the price.
const bank = runValuation({
    overview: { Name: 'Bank Co', Symbol: 'BNK', Sector: 'Financial Services', Industry: 'Banks—Diversified',
                MarketCapitalization: 2.45e11, Beta: 1.1, PERatio: 12, DividendYield: 0.03 },
    financials: { snapshot: {
        sharesOutstanding: 1.9e9, trailingEps: 11.5, netIncome: 21e9, totalRevenue: 80e9,
        ebitda: 40e9, freeCashflow: 30e9, totalDebt: 300e9, totalCash: 200e9, bookValue: 100,
        returnOnEquity: 0.11, dividendPerShare: 2.2, priceToBook: 0.9, forwardPE: 11,
    } },
}, freshSeries(143), { riskFreeRate: 0.043 });

check('financials: classified as financials', bank.state.co.sector === 'financials', `sector=${bank.state.co.sector}`);
check('financials: DCF drops sector_inapplicable', row(bank, 'DCF').implied_price == null && row(bank, 'DCF').drop_reason === 'sector_inapplicable');
check('financials: composite present and sane vs $143 (not a revenue×margin blow-up)',
    bank.composite.avg_fair_value != null && bank.composite.avg_fair_value > 30 && bank.composite.avg_fair_value < 600,
    `avg=${bank.composite.avg_fair_value}`);

console.log(fails ? `\nFAILED — ${fails} check(s)` : '\nPASS — isomorphic engine behaves correctly.');
if (fails) process.exit(1);
