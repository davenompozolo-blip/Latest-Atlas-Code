// Sizing + book impact fixture.
// Run: node src/lib/trade/sizing.test.mjs
//
// Fixture is again the mockup's NVDA ticket, whose numbers are internally
// consistent and therefore checkable:
//   equity $100,167 · price $217.49 · 60 shares held at $198.40 avg
//   +2.00% → $2,003.34 notional → 9 shares → $1,957.41 filled
//   13.03% → 15.03% of equity, 8.65% → 9.95% of gross
//   incremental vol +0.38% → 19.4 bps of risk per $1,000 deployed

import {
    size, sizeByPercent, sizeByFixedFractional, sizeByIncrementalRisk,
    deriveAll, stageClips, detectOverride, SIZING_METHODS,
} from './sizing.js';
import {
    computeBookImpact, effectiveExposure, marginPicture, volDrift,
} from './bookImpact.js';
import { parametricVaR, clusterByCorrelation } from './stats.js';

let fails = 0;
const near = (name, got, want, tol) => {
    const ok = got != null && Math.abs(got - want) <= tol;
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${got}\n    want: ${want} ±${tol}`); }
    else console.log(`✓ ${name}  (${typeof got === 'number' ? Number(got.toFixed(4)) : got})`);
};
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};

const EQUITY = 100167;
const PRICE = 217.49;
const LMV = 150840;          // implied by the mockup's 13.03% equity / 8.65% gross pair

const ctx = {
    price: PRICE,
    equity: EQUITY,
    longMarketValue: LMV,
    atr: 15.79,
    incrementalVolFn: (q) => (q / 9) * 0.0038,   // linear stand-in for the real Σ solve
};

console.log('— percent of portfolio, the default method (§4.1) —');
const p2 = sizeByPercent(0.02, ctx);
near('Δnotional = pct × equity', p2.targetNotional, 2003.34, 0.01);
eq('shares floor to 9', p2.qty, 9);
near('filled notional', p2.filledNotional, 1957.41, 0.01);
near('pct of equity re-derived', p2.pctOfEquity * 100, 1.954, 0.001);
near('pct of gross, display only', p2.pctOfGross * 100, 1.298, 0.005);
near('stop-implied risk at 2×ATR', p2.stopRisk, 284.2, 0.6);
near('stop-implied risk in bps of equity', p2.stopRiskBps, 28.4, 0.1);
near('incremental vol', p2.incrementalVol * 100, 0.38, 0.001);
near('risk per $1,000 deployed = 19.4bps', p2.riskPerThousandBps, 19.4, 0.05);

console.log('\n— all five values render for every method (§4.1) —');
// "The method chosen changes which field you type in, not what you get to see."
const shape = ['qty', 'notional', 'pctOfEquity', 'pctOfGross', 'incrementalVol', 'stopRisk', 'riskPerThousandBps'];
for (const m of SIZING_METHODS) {
    const input = m.code === 'percent_of_portfolio' ? 0.02
        : m.code === 'incremental_risk' ? 38
        : m.code === 'fixed_fractional' ? 28.4
        : m.code === 'equal_risk' ? 0.01
        : { qty: 9 };
    const out = size(m.code, input, { ...ctx, mctrFn: (q) => (q / 9) * 0.011 });
    const missing = shape.filter((k) => !(k in out));
    eq(`${m.code} returns the full derived set`, missing, []);
}

console.log('\n— the other methods land where they should —');
const ff = sizeByFixedFractional(28.4, ctx);
eq('fixed fractional at 28.4bps to a 2×ATR stop → 9 shares', ff.qty, 9);
const ir = sizeByIncrementalRisk(38, ctx);
eq('incremental risk at 38bps → 9 shares', ir.qty, 9);

console.log('\n— manual is always an override (§4.1, §6) —');
const man = size('manual', { qty: 25 }, ctx);
eq('manual flags itself', man.isOverride, true);
eq('manual departure is detected', detectOverride({ modelQty: 9, submittedQty: 25, method: 'manual' }).isOverride, true);
eq('matching the model is not an override', detectOverride({ modelQty: 9, submittedQty: 9, method: 'percent_of_portfolio' }).isOverride, false);
near('override delta is measured, not just flagged',
    detectOverride({ modelQty: 9, submittedQty: 25, method: 'percent_of_portfolio' }).deltaPct, 1.7778, 0.001);

console.log('\n— staged entry (§4.1) —');
const clips = stageClips(10, 3, { price: PRICE, spacingPct: 0.01, side: 'buy' });
eq('three clips', clips.length, 3);
eq('clips sum to the agreed size', clips.reduce((a, c) => a + c.qty, 0), 10);
near('second clip steps down 1%', clips[1].limitPrice, 215.31, 0.02);

// ── Book impact ──────────────────────────────────────────────────────────────
console.log('\n— book impact, before → after (§4.1) —');

const positions = [
    { symbol: 'NVDA', quantity: 60, averageCost: 198.40, marketValue: 60 * PRICE },
    { symbol: 'AVGO', quantity: 40, averageCost: 180.00, marketValue: 12000 },
    { symbol: 'MU',   quantity: 50, averageCost: 90.00,  marketValue: 4808 },
    { symbol: 'SMH',  quantity: 30, averageCost: 250.00, marketValue: 8000 },
    { symbol: 'PG',   quantity: 40, averageCost: 150.00, marketValue: 6000 },
];

const RHO = {
    'NVDA|AVGO': 0.81, 'NVDA|MU': 0.78, 'NVDA|SMH': 0.89,
    'AVGO|SMH': 0.85, 'AVGO|MU': 0.70, 'MU|SMH': 0.74,
    'NVDA|PG': 0.10, 'AVGO|PG': 0.08, 'MU|PG': 0.05, 'SMH|PG': 0.09,
};
const rho = (a, b) => (a === b ? 1 : RHO[`${a}|${b}`] ?? RHO[`${b}|${a}`] ?? null);
const vols = { NVDA: 0.42, AVGO: 0.36, MU: 0.44, SMH: 0.33, PG: 0.16 };
const betas = { NVDA: 2.1, AVGO: 1.5, MU: 1.8, SMH: 1.6, PG: 0.5 };

const impact = computeBookImpact({
    symbol: 'NVDA', positions, equity: EQUITY, price: PRICE, deltaQty: 9,
    account: { equity: EQUITY, cash: -50691, long_market_value: LMV, maintenance_margin: LMV * 0.5, buyingPower: 49476 },
    rho, vols, betas, sectorOf: (s) => (s === 'PG' ? 'Staples' : 'Info Tech'),
});

near('shares 60 → 69', impact.position.sharesAfter, 69, 1e-9);
near('average cost 198.40 → 200.89', impact.position.avgCostAfter, 200.89, 0.01);
near('weight of equity 13.03%', impact.position.weightOfEquityBefore * 100, 13.03, 0.01);
// The mockup prints 13.03% → 15.03%, which adds the REQUESTED 2.00% rather than
// the 1.954% that 9 whole shares actually buys. The book will hold 69 shares
// worth $15,006.81, which is 14.98% of equity, so that is what the pane says.
// A before-and-after pane that reports a weight the book will not have is the
// one thing this pane cannot do.
near('weight of equity → 14.98% (filled, not requested)', impact.position.weightOfEquityAfter * 100, 14.98, 0.01);
near('weight of gross 8.65%', impact.position.weightOfGrossBefore * 100, 8.65, 0.01);
near('weight of gross → 9.95%', impact.position.weightOfGrossAfter * 100, 9.95, 0.01);
near('unrealised +$1,145', impact.position.unrealised, 1145.4, 1);

console.log('\n— effective exposure is not the position size (§4.1) —');
const eff = impact.effectiveExposure;
eq('three peers clear ρ>0.75', eff.peers.map((p) => p.symbol).sort(), ['AVGO', 'MU', 'SMH']);
// NVDA 13,049.40 + AVGO 12,000 + MU 4,808 + SMH 8,000 = 37,857.40 of 100,167.
near('correlated cluster weight before', eff.clusterWeightBefore * 100, 37.794, 0.005);
near('cluster weight after the add', eff.clusterWeightAfter * 100, 39.748, 0.005);
eq('a 0.70 peer is excluded at the 0.75 cut', effectiveExposure({
    symbol: 'AVGO', positions, equity: EQUITY, rho, threshold: 0.75,
}).peers.map((p) => p.symbol).sort(), ['NVDA', 'SMH']);

console.log('\n— the pairwise cut is a scaffold, clusters are the destination (§4.1) —');
const clusters = clusterByCorrelation(['NVDA', 'AVGO', 'MU', 'SMH', 'PG'], rho, { distanceCut: 0.35 });
const semis = clusters.find((c) => c.members.includes('NVDA'));
eq('semis cluster together, PG does not join them', semis.members, ['AVGO', 'MU', 'NVDA', 'SMH']);
eq('PG is its own cluster', clusters.find((c) => c.members.includes('PG')).size, 1);

console.log('\n— three separate vol quantities, never one (§4.1) —');
const r = impact.risk;
eq('current, incremental and resulting are distinct fields',
   [typeof r.currentVol, typeof r.incrementalVol, typeof r.resultingVol], ['number', 'number', 'number']);
near('resulting = current + incremental', r.currentVol + r.incrementalVol, r.resultingVol, 1e-9);
eq('strategic band is absent at V1, not zero (§4.1)', r.strategicBand, null);
eq('incremental vol is positive for an add to a correlated cluster', r.incrementalVol > 0, true);
near('risk per $1,000 is derived from incremental vol and notional',
    r.riskPerThousandBps, (r.incrementalVol / 1957.41) * 1000 * 10000, 1e-6);
eq('MCTR is reported as a share of resulting vol', r.mctrPositionPct > 0 && r.mctrPositionPct < 1, true);
eq('beta rises when a 2.1-beta name is added', r.betaAfter > r.betaBefore, true);
eq('covariance coverage is declared', r.covarianceCoverage, 1);

console.log('\n— VaR —');
near('95% 1d VaR on 26.9% annualised vol', parametricVaR(0.269, EQUITY), 2792, 3);
eq('incremental VaR is the difference of the two', Math.abs(
    (r.varAfter - r.varBefore) - r.incrementalVaR) < 1e-9, true);

console.log('\n— margin (§4.1) —');
const m = impact.margin;
near('gross leverage 1.51×', m.grossLeverage, 1.506, 0.005);
near('buying power consumed', m.buyingPowerConsumed, 1957.41, 0.01);
near('remaining headroom', m.buyingPowerRemaining, 47518.6, 0.1);
// (equity − rate·LMV) / (LMV·(1 − rate)) = (100,167 − 75,420) / 75,420 = 32.8%.
// The mockup's −32.1% corresponds to a ~50.5% requirement; the pane uses the
// broker's live maintenance_margin rather than any assumed rate, so the figure
// tracks the account that would actually generate the call.
near('fall to maintenance call at a 50% requirement', m.fallToMaintenanceCall * 100, 32.81, 0.02);

console.log('\n— vol drift indicator (§10 residual question 1) —');
const today = Date.now();
const series = [90, 60, 30, 0].map((d, i) => ({
    date: new Date(today - d * 86400000).toISOString().slice(0, 10),
    vol: [0.214, 0.238, 0.256, 0.269][i],
}));
const drift = volDrift(series);
eq('90 / 60 / 30 / now', [drift.d90, drift.d60, drift.d30, drift.now], [0.214, 0.238, 0.256, 0.269]);

console.log('\n— degraded inputs stay honest —');
const noData = computeBookImpact({
    symbol: 'ZZZZ', positions: [], equity: EQUITY, price: PRICE, deltaQty: 1,
    account: {}, rho: () => null, vols: {},
});
eq('no book, no invented risk', [noData.risk.currentVol, noData.position.sharesBefore], [0, 0]);
eq('empty derived set does not throw', deriveAll(null, ctx).qty, null);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
