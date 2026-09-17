// F-4 flagship cards — pure, runs under plain node.
//
//   node --test src/pages/nexus/nexusPortfolioCards.test.mjs
//
// Clause 5 of F2 §5 asks for the absent state to be proven with a fixture,
// and that is most of this file. The values are chosen so that reading a
// zero where a measurement is missing changes the answer visibly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    portfolioCards, cardCoverage,
    ACCOUNT_OK, ACCOUNT_FAILED, ACCOUNT_LOADING,
} from './nexusPortfolioCards.js';

const P = {
    positions: 63, winRate: 48, winners: 30, losers: 33,
    todayUp: 43, todayDown: 19, atRisk: 10,
    topSymbol: 'AMD', topWeightPct: 4.3, top5WeightPct: 18,
    best: { tk: 'ANF', pct: 31.9 }, worst: { tk: 'MRVL', pct: -12.4 },
    wtdQuality: 78, unrealisedPnl: 5175, onCostReturnPct: 3.1,
};
const ACCT = { equity: 99392, long_market_value: 172450, cash: -73058, dayPnl: 568, dayPnlPct: 0.6 };

const byKey = cards => Object.fromEntries(cards.map(c => [c.key, c]));

test('healthy book: every card is measured and carries a value', () => {
    const cards = portfolioCards({ portfolio: P, account: ACCT, accountStatus: ACCOUNT_OK });
    const cov = cardCoverage(cards);
    assert.equal(cov.total, 11, 'four originals plus the seven promoted out of the strip');
    assert.equal(cov.absentCount, 0);
    for (const c of cards) assert.ok(c.value != null || c.pair, c.key + ' must carry a value');
});

test('the four originals keep their content and lead the grid', () => {
    const cards = portfolioCards({ portfolio: P, account: ACCT, accountStatus: ACCOUNT_OK });
    assert.deepEqual(cards.slice(0, 4).map(c => c.key),
        ['dayPnl', 'unrealised', 'longExposure', 'atRisk']);
    const k = byKey(cards);
    assert.equal(k.dayPnl.value, '+$568');
    assert.equal(k.dayPnl.sub, '+0.6% today');
    assert.equal(k.longExposure.sub, '63 positions · 1.74× lev');
    assert.equal(k.unrealised.sub, '+3.1% on cost');
    assert.equal(k.atRisk.value, '10');
});

test('the seven promoted metrics are all present as cards', () => {
    const k = byKey(portfolioCards({ portfolio: P, account: ACCT, accountStatus: ACCOUNT_OK }));
    assert.equal(k.accountEquity.value, '$99,392');
    // The minus goes in front of the unit: `$-73,058` strands the sign
    // inside the amount. A balance still takes no `+` when positive.
    assert.equal(k.cash.value, '−$73,058');
    assert.equal(k.cash.sub, 'on margin');
    assert.equal(k.winRate.value, '48%');
    assert.equal(k.today.value, '43 / 19');
    assert.equal(k.concentration.value, 'AMD 4.3%');
    assert.equal(k.quality.value, '78');
});

test('a positive cash balance takes no plus sign — a balance is not a P&L', () => {
    const k = byKey(portfolioCards({
        portfolio: P, account: { ...ACCT, cash: 12345 }, accountStatus: ACCOUNT_OK }));
    assert.equal(k.cash.value, '$12,345');
    assert.equal(k.cash.sub, 'uninvested');
    assert.equal(k.cash.tone, '');
});

// ── The absent variant ───────────────────────────────────────
test('ABSENT: a failed account feed absents its four cards and says why', () => {
    const cards = portfolioCards({ portfolio: P, account: null, accountStatus: ACCOUNT_FAILED });
    const cov = cardCoverage(cards);
    assert.deepEqual(cov.absentKeys.sort(),
        ['accountEquity', 'cash', 'dayPnl', 'longExposure'].sort());
    for (const key of cov.absentKeys) {
        const c = byKey(cards)[key];
        assert.equal(c.absent, true);
        assert.equal('value' in c, false, key + ': an absent card must carry no value key at all');
        assert.equal(c.reason, 'broker account feed did not answer');
    }
    // Everything the model can still answer stays measured.
    assert.equal(byKey(cards).winRate.value, '48%');
    assert.equal(cov.measured, 7);
});

test('ABSENT: a pending feed is a different statement from a failed one', () => {
    // Rendering both as one dash is how a transport failure ends up
    // reading as a fact about the book.
    const loading = portfolioCards({ portfolio: P, account: null, accountStatus: ACCOUNT_LOADING });
    assert.equal(byKey(loading).accountEquity.reason, 'waiting on the broker account');
    const failed = portfolioCards({ portfolio: P, account: null, accountStatus: ACCOUNT_FAILED });
    assert.notEqual(byKey(failed).accountEquity.reason, byKey(loading).accountEquity.reason);
});

test('ABSENT: a missing measurement never becomes a zero', () => {
    const thin = { ...P, winRate: null, wtdQuality: null, atRisk: null, topSymbol: null, best: null, worst: null };
    const k = byKey(portfolioCards({ portfolio: thin, account: ACCT, accountStatus: ACCOUNT_OK }));
    for (const key of ['winRate', 'quality', 'atRisk', 'concentration', 'bestWorst']) {
        assert.equal(k[key].absent, true, key);
        assert.equal('value' in k[key], false, key + ' must not carry a value');
        assert.ok(k[key].reason && k[key].reason.length > 0, key + ' must say why');
    }
});

test('ABSENT: a genuine zero is measured, not absent', () => {
    // The `||` vs `??` trap, at card level: 0 at-risk positions and a 0%
    // win rate are real readings and must render as numbers.
    const zeroed = { ...P, atRisk: 0, winRate: 0, wtdQuality: 0 };
    const k = byKey(portfolioCards({ portfolio: zeroed, account: ACCT, accountStatus: ACCOUNT_OK }));
    assert.equal(k.atRisk.absent, false);
    assert.equal(k.atRisk.value, '0');
    assert.equal(k.atRisk.tone, 'tone-up', 'nothing at risk is good news, not missing news');
    assert.equal(k.winRate.value, '0%');
    assert.equal(k.quality.value, '0');
});

test('leverage needs both legs — a long value over zero equity yields no ratio', () => {
    const noEquity = { ...ACCT, equity: 0 };
    const k = byKey(portfolioCards({ portfolio: P, account: noEquity, accountStatus: ACCOUNT_OK }));
    assert.equal(k.longExposure.sub, '63 positions', 'no fabricated × lev');
    // ...and equity itself stays MEASURED at $0. An unfunded account is
    // genuinely zero, and absenting it here would contradict the
    // zero-is-a-measurement rule asserted above — the same reading has to
    // mean the same thing in every card or neither rule is worth having.
    assert.equal(k.accountEquity.absent, false);
    assert.equal(k.accountEquity.value, '$0');
});

// ── Pairs ────────────────────────────────────────────────────
test('pairs stay in one card: splitting them loses the comparison', () => {
    const k = byKey(portfolioCards({ portfolio: P, account: ACCT, accountStatus: ACCOUNT_OK }));
    assert.equal(k.today.value, '43 / 19', 'up and down in one card');
    assert.deepEqual(k.bestWorst.pair, { best: { tk: 'ANF', pct: '+31.9%' }, worst: { tk: 'MRVL' } });
    assert.equal(k.bestWorst.sub, 'worst −12.4%');
    // ...and there is no separate "best" or "worst" card.
    assert.equal(Object.keys(k).filter(x => /best|worst/i.test(x)).length, 1);
});

test('no portfolio at all yields no cards rather than eleven absent ones', () => {
    assert.deepEqual(portfolioCards({ portfolio: null }), []);
    assert.deepEqual(portfolioCards(), []);
});
