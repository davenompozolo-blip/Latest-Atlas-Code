import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exposuresBySymbol, aggregateExposure, exposureBudgets, exposurePenaltyGrad,
         regimeRiskScale, splitRanked, pctToBps } from './pcmRegime.js';

// Live-shaped rows: a measured name, one whose every exposure is insignificant,
// a name outside the partition and an option contract.
const ROWS = [
    { symbol: 'AMD',  exposure_status: 'measured', exposure_concentration: 0.0091, exposure_dollar: -0.0052, exposure_cyclical: null },
    { symbol: 'JPM',  exposure_status: 'measured', exposure_concentration: '-0.0031', exposure_dollar: null, exposure_cyclical: null },
    { symbol: 'UAE',  exposure_status: 'no_significant_axis' },
    { symbol: 'IXC',  exposure_status: 'not_in_partition' },
    { symbol: 'SOXX261016P00500000', exposure_status: 'option_contract' },
];

test('an insignificant exposure is absent, never zero', () => {
    const { bySymbol, withheld } = exposuresBySymbol(ROWS);
    assert.equal('cyclical' in bySymbol.AMD, false);
    assert.equal(bySymbol.JPM.concentration, -0.0031);
    assert.deepEqual(Object.keys(bySymbol.UAE), []);
    // no_significant_axis is a MEASUREMENT, not a withheld name
    assert.deepEqual(withheld.map(w => w.symbol), ['IXC', 'SOXX261016P00500000']);
});

test('aggregate exposure states the weight it could measure', () => {
    const { bySymbol } = exposuresBySymbol(ROWS);
    const agg = aggregateExposure(['AMD', 'JPM', 'IXC'], [0.5, 0.3, 0.2], bySymbol);
    assert.ok(Math.abs(agg.concentration - (0.5 * 0.0091 - 0.3 * 0.0031)) < 1e-15);
    assert.ok(Math.abs(agg.dollar - 0.5 * -0.0052) < 1e-15);
    assert.equal('cyclical' in agg, false);   // unmeasured: absent, not 0
    assert.equal('cyclical' in exposureBudgets(agg, bySymbol), false);   // and carries no cap
    assert.ok(Math.abs(agg.measuredWeight - 0.8) < 1e-12);
    assert.ok(Math.abs(agg.totalWeight - 1.0) < 1e-12);
});

test('the penalty is zero inside the budget and pushes exposure back outside it', () => {
    const { bySymbol } = exposuresBySymbol(ROWS);
    const syms = ['AMD', 'JPM'];
    const cur = aggregateExposure(syms, [0.5, 0.5], bySymbol);
    const budgets = exposureBudgets(cur, bySymbol);
    // at the current book: nothing to do
    assert.deepEqual(exposurePenaltyGrad(syms, [0.5, 0.5], bySymbol, budgets), [0, 0]);
    // piling into AMD raises concentration exposure past its budget: the
    // gradient must push AMD down and JPM (negative concentration) up
    const g = exposurePenaltyGrad(syms, [0.9, 0.1], bySymbol, budgets);
    assert.ok(g[0] < 0, 'AMD pushed down');
    assert.ok(g[1] > 0, 'JPM pushed up');
});

test('a zero budget does not divide by zero', () => {
    const bySymbol = { A: { dollar: 0.004 }, B: { dollar: -0.004 } };
    const cur = aggregateExposure(['A', 'B'], [0.5, 0.5], bySymbol);
    const budgets = exposureBudgets(cur, bySymbol);
    assert.equal(budgets.dollar.budget, 0);
    const g = exposurePenaltyGrad(['A', 'B'], [0.8, 0.2], bySymbol, budgets);
    assert.ok(g.every(Number.isFinite));
    assert.ok(g[0] < 0 && g[1] > 0);
});

test('risk scale takes the largest bucket ratio and names the axis; none is stated', () => {
    const r = regimeRiskScale([
        { axis_key: 'concentration', regime_vol_ratio: '1.002834', regime_bucket_label: 'q4 of 4' },
        { axis_key: 'cyclical', regime_vol_ratio: 0.8956 },
        { axis_key: 'dollar', regime_vol_ratio: null },
    ]);
    assert.equal(r.axis, 'concentration');
    assert.ok(Math.abs(r.scale - 1.002834) < 1e-12);
    assert.equal(r.basis, 'regime_cvar');
    const none = regimeRiskScale([{ axis_key: 'dollar', regime_vol_ratio: null }]);
    assert.equal(none.scale, 1);
    assert.equal(none.basis, 'none');
    assert.match(none.reason, /no regime CVaR/);
});

test('a column of zeros is neither top nor bottom', () => {
    const items = [{ sym: 'A', a: 0 }, { sym: 'B', a: 0 }, { sym: 'C', a: 0 }, { sym: 'D', a: 0 }];
    const s = splitRanked(items, 'a');
    assert.deepEqual(s.top, []);
    assert.deepEqual(s.bottom, []);
    assert.equal(s.flat, 4);
    const t = splitRanked([{ sym: 'A', a: 0.2 }, { sym: 'B', a: 0 }, { sym: 'C', a: -0.1 }], 'a');
    assert.deepEqual(t.top.map(x => x.sym), ['A']);
    assert.deepEqual(t.bottom.map(x => x.sym), ['C']);
});

test('FRED spreads arrive in percent', () => {
    assert.equal(pctToBps(3.05), 305);
    assert.equal(pctToBps(null), null);
    assert.equal(pctToBps('NaN'), null);
});

// Through the real optimiser: a book whose best Sharpe sits in the name that
// carries the most concentration exposure. Without the frame the optimiser
// piles into it; with the frame the aggregate exposure may not exceed the
// current book's.
test('runAtlasAdaptive: the exposure budget holds the aggregate axis exposure', async () => {
    const { runAtlasAdaptive } = await import('../pages/pcm-optimizer.js');
    const symbols = ['AMD', 'JPM', 'PG'];
    const vols = [0.02, 0.012, 0.009];
    const rho = [[1, 0.2, 0.1], [0.2, 1, 0.3], [0.1, 0.3, 1]];
    const cov = rho.map((r, i) => r.map((c, j) => c * vols[i] * vols[j]));
    const inputs = { symbols, means: [0.004, 0.0003, 0.0002], vols, cov };
    const positions = symbols.map(s => ({ symbol: s, market_value: 100, sector: s === 'AMD' ? 'Tech' : s === 'JPM' ? 'Fin' : 'Staples' }));
    const frame = {
        exposureRows: [
            { symbol: 'AMD', weight: 1/3, exposure_status: 'measured', exposure_concentration: 0.009 },
            { symbol: 'JPM', weight: 1/3, exposure_status: 'measured', exposure_concentration: -0.003 },
            { symbol: 'PG',  weight: 1/3, exposure_status: 'no_significant_axis' },
        ],
        axisRows: [{ axis_key: 'concentration', regime_vol_ratio: 1.1, regime_bucket_label: 'q4 of 4' }],
    };
    const ips = { risk_tolerance: 8, concentration_limit: 80 };
    const free = runAtlasAdaptive(inputs, positions, {}, ips, null, null, null);
    const held = runAtlasAdaptive(inputs, positions, {}, ips, null, null, frame);
    const conc = (w) => w[0] * 0.009 + w[1] * -0.003;
    const start = conc([1/3, 1/3, 1/3]);
    assert.ok(conc(free.weights) > start * 1.2, 'unconstrained piles into AMD: ' + conc(free.weights));
    assert.ok(conc(held.weights) < conc(free.weights), 'the budget pulls exposure back');
    assert.ok(conc(held.weights) <= start * 1.15, 'close to the budget: ' + conc(held.weights) + ' vs ' + start);
    const rf = held.macroContext.regimeFrame;
    assert.equal(rf.risk.axis, 'concentration');
    assert.equal(free.macroContext.regimeFrame, null);
});
