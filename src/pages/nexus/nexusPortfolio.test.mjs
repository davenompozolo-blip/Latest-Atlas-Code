// Portfolio snapshot — pure book aggregation. Runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioSnapshot } from './nexusLiveCompute.js';

const rows = [
    { symbol: 'TSM', market_value: 6414, weight_pct: 6.3, total_return_pct: 40, daily_return_pct: 0.68, max_drawdown_pct: -5.75, quality_grade: 'B+' },
    { symbol: 'AMD', market_value: 3000, weight_pct: 3.0, total_return_pct: 183, daily_return_pct: -2.1, max_drawdown_pct: -12, quality_grade: 'B' },
    { symbol: 'PROSY', market_value: 2000, weight_pct: 2.0, total_return_pct: -28, daily_return_pct: 4.1, max_drawdown_pct: -30, quality_grade: 'C' },
    { symbol: 'CASHY', market_value: 1000, weight_pct: 1.0, total_return_pct: null, daily_return_pct: 0, max_drawdown_pct: 0, quality_grade: null },
];

test('buildPortfolioSnapshot aggregates winners/losers, today, win rate, at-risk', () => {
    const s = buildPortfolioSnapshot(rows);
    assert.equal(s.positions, 4);
    assert.equal(s.winners, 2);    // TSM, AMD
    assert.equal(s.losers, 1);     // PROSY
    assert.equal(s.todayUp, 2);    // TSM, PROSY
    assert.equal(s.todayDown, 1);  // AMD
    assert.equal(s.winRate, 67);   // 2/3
    assert.equal(s.atRisk, 1);     // PROSY -28% on cost (deep drawdown)
});

test('top concentration + best/worst by total return', () => {
    const s = buildPortfolioSnapshot(rows);
    assert.equal(s.topSymbol, 'TSM');
    assert.equal(s.topWeightPct, 6.3);
    assert.equal(s.best.tk, 'AMD');
    assert.equal(s.best.pct, 183);
    assert.equal(s.worst.tk, 'PROSY');
    assert.equal(s.worst.pct, -28);
});

test('cost basis + unrealised reconstructed from value × return', () => {
    const s = buildPortfolioSnapshot([{ symbol: 'X', market_value: 140, weight_pct: 50, total_return_pct: 40, quality_grade: 'A' }]);
    assert.equal(s.costBasis, 100);     // 140 / 1.40
    assert.equal(s.unrealisedPnl, 40);
    assert.equal(s.totalReturnPct, 40);
    assert.equal(s.wtdQuality, 93);     // single A
});

test('empty book → null', () => {
    assert.equal(buildPortfolioSnapshot([]), null);
});
