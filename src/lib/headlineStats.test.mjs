import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateHeadline, MIN_ANNUALISED_SESSIONS } from './headlineStats.js';

// Atlas Secondary's header on its second day, verbatim.
const YOUNG = { annReturn: 11.214, annVol: 0.110, sharpe: 11.22, maxDD: 0, winRate: 0.5 };

test('two sessions publish no annualised figure, no Sharpe, no drawdown, no win rate', () => {
    const g = gateHeadline(YOUNG, 2, 11.22);
    for (const k of ['annReturn', 'annVol', 'sharpe', 'maxDD', 'winRate']) {
        assert.equal(k in g, false, k + ' must be absent');
        assert.match(g.withheld[k], /needs \d+ sessions \(2 so far\)/);
    }
});

test('the database Sharpe is gated on the same history as the local one', () => {
    const g = gateHeadline({ sharpe: 0.8 }, 10, 11.22);
    assert.equal('sharpe' in g, false);
    const h = gateHeadline({ sharpe: 0.8 }, MIN_ANNUALISED_SESSIONS, 1.3);
    assert.equal(h.sharpe, 1.3);
});

test('a long history publishes every figure, a genuine 0% drawdown included', () => {
    const g = gateHeadline({ annReturn: 0.21, annVol: 0.19, sharpe: 1.1, maxDD: 0, winRate: 0.54 }, 180, null);
    assert.equal(g.annReturn, 0.21);
    assert.equal(g.maxDD, 0);
    assert.equal(g.winRate, 0.54);
    assert.deepEqual(g.withheld, {});
});

test('between the floors: distribution figures publish, annualised ones do not', () => {
    const g = gateHeadline(YOUNG, 30, null);
    assert.equal(g.maxDD, 0);
    assert.equal(g.winRate, 0.5);
    assert.equal('annReturn' in g, false);
});

test('a non-finite figure is absent, not rendered', () => {
    const g = gateHeadline({ annReturn: NaN, annVol: Infinity }, 200, null);
    assert.equal('annReturn' in g, false);
    assert.equal('annVol' in g, false);
    // above its floor, so the reason is the measurement, not the history
    assert.equal(g.withheld.annReturn, 'not measured');
    assert.equal(g.withheld.annVol, 'not measured');
});
