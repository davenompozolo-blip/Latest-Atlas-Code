// Portfolio snapshot — pure book aggregation. Runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioSnapshot } from './nexusLiveCompute.js';

// Every row carries BOTH return columns, with values chosen so that reading
// the wrong one changes the answer. That is deliberate: this fixture used to
// supply only `total_return_pct` and passed because `buildPortfolioSnapshot`
// fell back to it — so the suite could not tell the two measures apart, which
// is the defect it is now here to catch.
//
// PROSY is the discriminator. It is −28% on cost and +12% since entry, the
// real shape of a name trimmed at a profit whose remainder is underwater (8 of
// 61 live holdings look like this). If the aggregate ever regresses to the
// since-entry column, PROSY becomes a winner, `losers` drops to 0 and
// `atRisk` drops to 0 — three assertions below fail at once.
const rows = [
    { symbol: 'TSM',   market_value: 6414, weight_pct: 6.3, unrealised_return_pct: 40,  total_return_pct: 55,   daily_return_pct: 0.68, max_drawdown_pct: -5.75, quality_grade: 'B+' },
    { symbol: 'AMD',   market_value: 3000, weight_pct: 3.0, unrealised_return_pct: 183, total_return_pct: 200,  daily_return_pct: -2.1, max_drawdown_pct: -12,   quality_grade: 'B' },
    { symbol: 'PROSY', market_value: 2000, weight_pct: 2.0, unrealised_return_pct: -28, total_return_pct: 12,   daily_return_pct: 4.1,  max_drawdown_pct: -30,   quality_grade: 'C' },
    { symbol: 'CASHY', market_value: 1000, weight_pct: 1.0, unrealised_return_pct: null, total_return_pct: null, daily_return_pct: 0,   max_drawdown_pct: 0,     quality_grade: null },
];

test('buildPortfolioSnapshot aggregates winners/losers, today, win rate, at-risk', () => {
    const s = buildPortfolioSnapshot(rows);
    assert.equal(s.positions, 4);
    assert.equal(s.winners, 2);    // TSM, AMD
    assert.equal(s.losers, 1);     // PROSY — on cost, not since entry
    assert.equal(s.todayUp, 2);    // TSM, PROSY
    assert.equal(s.todayDown, 1);  // AMD
    assert.equal(s.winRate, 67);   // 2/3
    assert.equal(s.atRisk, 1);     // PROSY -28% on cost (deep drawdown)
});

test('the aggregate declares the basis it is on', () => {
    // NexusPortfolio renders this line; without the declaration it printed
    // "total return" over an on-cost figure while the holdings table's
    // "Total ret" column showed the since-entry one.
    const s = buildPortfolioSnapshot(rows);
    assert.equal(s.returnBasis, 'on_cost');
    assert.equal(s.returnBasisLabel, 'On cost');
});

test('a position with no on-cost figure is NOT counted via the other basis', () => {
    // The removed fallback, pinned. `total_return_pct` is present and large;
    // it must not turn this into a winner.
    const s = buildPortfolioSnapshot([
        { symbol: 'ONLY_ENTRY', market_value: 1000, weight_pct: 1, unrealised_return_pct: null, total_return_pct: 88 },
        { symbol: 'REAL',       market_value: 1000, weight_pct: 1, unrealised_return_pct: 10,   total_return_pct: 10 },
    ]);
    assert.equal(s.positions, 2);
    assert.equal(s.winners, 1);              // REAL only
    assert.equal(s.measuredPositions, 1);
    assert.equal(s.unmeasuredPositions, 1);
    assert.deepEqual(s.unmeasuredSymbols, ['ONLY_ENTRY']);
    assert.equal(s.best.tk, 'REAL');
    assert.equal(s.winRate, 100);            // 1 of 1 measured, not 1 of 2 held
});

test('top concentration + best/worst by on-cost return', () => {
    const s = buildPortfolioSnapshot(rows);
    assert.equal(s.topSymbol, 'TSM');
    assert.equal(s.topWeightPct, 6.3);
    assert.equal(s.best.tk, 'AMD');
    assert.equal(s.best.pct, 183);           // on cost; since entry would be 200
    assert.equal(s.worst.tk, 'PROSY');
    assert.equal(s.worst.pct, -28);          // on cost; since entry would be +12
});

test('cost basis + unrealised reconstructed from value × on-cost return', () => {
    // total_return_pct is deliberately absurd here: if the reconstruction ever
    // reads it, costBasis collapses and the assertion fails loudly.
    const s = buildPortfolioSnapshot([
        { symbol: 'X', market_value: 140, weight_pct: 50, unrealised_return_pct: 40, total_return_pct: 999, quality_grade: 'A' },
    ]);
    assert.equal(s.costBasis, 100);          // 140 / 1.40
    assert.equal(s.unrealisedPnl, 40);
    assert.equal(s.onCostReturnPct, 40);
    assert.equal(s.totalReturnPct, 40);      // deprecated alias, same value
    assert.equal(s.wtdQuality, 93);          // single A
});

test('empty book → null', () => {
    assert.equal(buildPortfolioSnapshot([]), null);
});
