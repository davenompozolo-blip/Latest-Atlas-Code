// Theme aggregation — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildThemeView, themeLeaders,
    dailyReturns, themeReturnSeries, cumMomentum, beta, themeDispersion, rotationRead, stdev, scaleReturnsToVol,
    positionRankPct, rotationConviction, rotationCall, breadthNote, VERDICT_CHIP, CONVICTION_WEIGHTS,
} from './nexusThemeCompute.js';

const holdings = [
    { tk: 'CVX', theme: 'Energy', conviction: 63, contribPct: 0.04, componentVar: 0.7, fvGapPct: 35, read: 'add' },
    { tk: 'HAL', theme: 'Energy', conviction: 47, contribPct: 0.03, componentVar: 1.1, fvGapPct: -31, read: 'trim' },
    { tk: 'KMI', theme: 'Energy', conviction: 70, contribPct: 0.02, componentVar: 0.5, fvGapPct: 12, read: 'add' },
    { tk: 'AAPL', theme: 'Technology', conviction: 80, contribPct: 0.10, componentVar: 2.0, fvGapPct: -2, read: 'hold' },
    { tk: 'NVDA', theme: 'Technology', conviction: 74, contribPct: 0.20, componentVar: 3.0, fvGapPct: null, read: 'watch' },
];
const spine = [
    { theme: 'Technology', sharePct: 30, movePct: 1.5, riskShift: 2, fragility: true },
    { theme: 'Energy', sharePct: 12, movePct: -0.8, riskShift: 0, stale: false },
];

test('buildThemeView rolls holdings up by theme, heaviest share first', () => {
    const rows = buildThemeView(holdings, spine);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].theme, 'Technology'); // 30% share sorts first
    assert.equal(rows[1].theme, 'Energy');
});

test('per-theme aggregates: count, conviction, contrib, var, valuation tilt', () => {
    const energy = buildThemeView(holdings, spine).find(r => r.theme === 'Energy');
    assert.equal(energy.count, 3);
    assert.equal(energy.avgConviction, 60);          // (63+47+70)/3 = 60
    assert.equal(energy.contribPct, 0.09);           // 0.04+0.03+0.02
    assert.equal(energy.varSharePct, 2.3);           // 0.7+1.1+0.5
    assert.equal(energy.avgFvGapPct, 5.3);           // (35-31+12)/3 = 5.33 → cheap-ish but within ±8
    assert.equal(energy.valuationTilt, 'fair');
    assert.equal(energy.sharePct, 12);               // from spine
    assert.equal(energy.movePct, -0.8);
    assert.deepEqual(energy.reads, { add: 2, trim: 1 });
});

test('valuation tilt flags cheap / rich beyond ±8%', () => {
    const cheap = buildThemeView([{ tk: 'X', theme: 'T', conviction: 50, read: 'add', fvGapPct: 20 }], []);
    assert.equal(cheap[0].valuationTilt, 'cheap');
    const rich = buildThemeView([{ tk: 'Y', theme: 'T', conviction: 50, read: 'trim', fvGapPct: -20 }], []);
    assert.equal(rich[0].valuationTilt, 'rich');
});

test('topNames ranked by conviction; null fvGap ignored in the tilt', () => {
    const tech = buildThemeView(holdings, spine).find(r => r.theme === 'Technology');
    assert.deepEqual(tech.topNames, ['AAPL', 'NVDA']);
    assert.equal(tech.avgFvGapPct, -2);   // only AAPL has a gap; NVDA null ignored
    assert.equal(tech.fragility, true);
    assert.equal(tech.riskShift, 2);
});

test('themeLeaders picks heaviest, leader and laggard by move', () => {
    const rows = buildThemeView(holdings, spine);
    const l = themeLeaders(rows);
    assert.equal(l.top.theme, 'Technology');     // heaviest share
    assert.equal(l.leader.theme, 'Technology');  // +1.5%
    assert.equal(l.laggard.theme, 'Energy');     // -0.8%
});

test('dailyReturns: consecutive close-to-close, sorted, drops bad closes', () => {
    const r = dailyReturns([{ date: '2026-06-03', close: 100 }, { date: '2026-06-02', close: 100 }, { date: '2026-06-04', close: 110 }]);
    assert.deepEqual(r.map(x => x.date), ['2026-06-03', '2026-06-04']);
    assert.equal(+r[1].ret.toFixed(2), 0.10);
});

test('themeReturnSeries: weight-rolled across members by date', () => {
    const ret = new Map([
        ['A', [{ date: 'd1', ret: 0.10 }, { date: 'd2', ret: 0.00 }]],
        ['B', [{ date: 'd1', ret: 0.00 }, { date: 'd2', ret: 0.20 }]],
    ]);
    const s = themeReturnSeries([{ symbol: 'A', weight: 3 }, { symbol: 'B', weight: 1 }], ret);
    assert.equal(+s[0].ret.toFixed(4), 0.075);  // (3*.10 + 1*0)/4
    assert.equal(+s[1].ret.toFixed(4), 0.05);   // (3*0 + 1*.20)/4
});

test('cumMomentum: n-day compounded %, null when short', () => {
    const s = [{ ret: 0.01 }, { ret: 0.01 }, { ret: 0.01 }, { ret: 0.01 }, { ret: 0.01 }];
    assert.equal(cumMomentum(s, 5), 5.1);
    assert.equal(cumMomentum(s, 9), null);
});

test('beta: OLS slope, null below minN', () => {
    // theme = 2x factor exactly → beta 2.
    const f = Array.from({ length: 20 }, (_, i) => ({ date: 'd' + i, ret: (i - 10) / 1000 }));
    const t = f.map(r => ({ date: r.date, ret: r.ret * 2 }));
    assert.equal(beta(t, f, 15), 2);
    assert.equal(beta(t.slice(0, 5), f, 15), null);
});

test('themeDispersion: winners/losers + spread inside a theme', () => {
    const d = themeDispersion([
        { tk: 'EWY', theme: 'Intl', todayPct: 3.2 },
        { tk: 'ACWI', theme: 'Intl', todayPct: 0.8 },
        { tk: 'EZA', theme: 'Intl', todayPct: -2.1 },
    ]);
    assert.deepEqual(d.Intl.winners.map(x => x.tk), ['EWY', 'ACWI']);
    assert.deepEqual(d.Intl.losers.map(x => x.tk), ['EZA']);
    assert.equal(d.Intl.spread, 5.3);
});

test('rotationRead: quadrant verdicts + a concrete out/in book read', () => {
    const rows = [
        { theme: 'Materials', sharePct: 8, momentum5d: 3.0, valuationTilt: 'cheap', valuationPending: false },
        { theme: 'Industrials', sharePct: 11, momentum5d: -3.5, valuationTilt: 'rich', valuationPending: false },
        { theme: 'Tech', sharePct: 37, momentum5d: 1.1, valuationTilt: 'rich', valuationPending: false },
        { theme: 'Comms', sharePct: 1.5, momentum5d: -5.5, valuationPending: true },
    ];
    const { perTheme, book } = rotationRead(rows);
    const v = t => perTheme.find(p => p.theme === t).verdict;
    assert.equal(v('Materials'), 'ADD');       // light + working
    assert.equal(v('Industrials'), 'TRIM');    // heavy + rolling
    assert.equal(v('Tech'), 'LET_RUN');        // heavy + working
    assert.equal(v('Comms'), 'IGNORE');        // light + washed out
    assert.equal(book.outTheme, 'Industrials');
    assert.equal(book.inTheme, 'Materials');
    assert.match(book.text, /out of Industrials into Materials/);
});

test('scaleReturnsToVol normalises a low-vol factor up to the target', () => {
    const lo = Array.from({ length: 30 }, (_, i) => ({ date: 'd' + i, ret: (i % 2 ? 1 : -1) * 0.002 })); // ~0.2% vol
    const sc = scaleReturnsToVol(lo, 0.01);
    assert.ok(Math.abs(stdev(sc.map(r => r.ret)) - 0.01) < 1e-9);
});

test('vol-normalising a quiet factor deflates its inflated beta, sign preserved', () => {
    // A sub-1%-vol factor (like UUP) regresses to a large raw beta; scaling it
    // up to 1% vol divides that beta down — same sign, smaller magnitude.
    const quiet = Array.from({ length: 25 }, (_, i) => ({ date: 'd' + i, ret: (i % 2 ? 1 : -1) * 0.002 }));
    const theme = quiet.map((q, i) => ({ date: q.date, ret: q.ret * 3 + (i % 2 ? 0.005 : -0.005) }));
    const raw = beta(theme, quiet);
    const norm = beta(theme, scaleReturnsToVol(quiet, 0.01));
    assert.ok(Math.abs(norm) < Math.abs(raw));   // quiet factor scaled up → beta deflated
    assert.equal(Math.sign(norm), Math.sign(raw));
});

// ── Rotation redesign v1 — call, conviction, rank ──

const pairRows = [
    { theme: 'Materials', sharePct: 2, momentum5d: 3.5, valuationPending: true, valuationTilt: null },
    { theme: 'Industrials', sharePct: 12, momentum5d: -10.0, valuationTilt: 'fair', valuationPending: false },
    { theme: 'Tech', sharePct: 30, momentum5d: 1.1, valuationTilt: 'rich', valuationPending: false },
    { theme: 'Energy', sharePct: 5, momentum5d: -2.0, valuationTilt: 'fair', valuationPending: false },
];

test('positionRankPct: centre (rank 50) splits exactly at rotationRead median cut', () => {
    const ranks = positionRankPct(pairRows);
    // sorted shares: 2, 5, 12, 30 → median (idx 2) = 12 → Industrials & Tech heavy
    assert.ok(ranks.get('Industrials') >= 50 && ranks.get('Tech') >= 50);
    assert.ok(ranks.get('Materials') < 50 && ranks.get('Energy') < 50);
    assert.equal(ranks.get('Materials'), 0);
    assert.equal(ranks.get('Tech'), 100);
});

test('positionRankPct: null shares excluded, single theme sits mid-axis', () => {
    const ranks = positionRankPct([{ theme: 'A', sharePct: 9 }, { theme: 'B', sharePct: null }]);
    assert.equal(ranks.get('A'), 50);
    assert.equal(ranks.has('B'), false);
});

test('rotationCall: pair matches rotationRead book — the card and map never disagree', () => {
    const call = rotationCall(pairRows, {}, null);
    const read = rotationRead(pairRows);
    assert.equal(call.sell.theme, read.book.outTheme);   // Industrials
    assert.equal(call.buy.theme, read.book.inTheme);     // Materials
});

test('rotationCall drivers: momentum + positioning confirmed, valuation pending when a leg is unresolved', () => {
    const call = rotationCall(pairRows, {}, null);
    const d = k => call.drivers.find(x => x.key === k);
    assert.equal(d('momentum').status, 'confirmed');
    assert.match(d('momentum').text, /Industrials −10\.0% 5d vs Materials \+3\.5% 5d/);
    assert.equal(d('positioning').status, 'confirmed');
    assert.equal(d('breadth').status, 'pending');        // no dispersion supplied
    assert.equal(d('valuation').status, 'pending');      // Materials leg unresolved
    assert.match(d('valuation').text, /pending on Materials/);
});

test('rotationCall drivers: wide sell-leg spread flags narrow breadth with the driving name', () => {
    const disp = { Industrials: { spread: 11.9, winners: [], losers: [{ tk: 'KMTUY', pct: -10.3 }] } };
    const call = rotationCall(pairRows, disp, null);
    const b = call.drivers.find(x => x.key === 'breadth');
    assert.equal(b.status, 'caution');
    assert.match(b.text, /KMTUY/);
});

test('rotationCall drivers: cheap sell leg cuts against the call → caution', () => {
    // (A rich BUY leg can't occur: rotationRead already demotes ADD+rich to
    // LET_RUN, so it never becomes the in-candidate.)
    const rows = pairRows.map(r => {
        if (r.theme === 'Industrials') return { ...r, valuationTilt: 'cheap' };
        if (r.theme === 'Materials') return { ...r, valuationPending: false, valuationTilt: 'fair' };
        return r;
    });
    const v = rotationCall(rows, {}, null).drivers.find(x => x.key === 'valuation');
    assert.equal(v.status, 'caution');
    assert.match(v.text, /cuts against/);
});

test('rotationCall: no qualifying pair degrades to text, null score', () => {
    const call = rotationCall([{ theme: 'Only', sharePct: 100, momentum5d: 2, valuationPending: true }], {}, null);
    assert.equal(call.sell, null);
    assert.equal(call.conviction.score, null);
    assert.ok(call.text.length > 0);
});

test('rotationConviction: equal weights, renormalised over available factors', () => {
    assert.deepEqual(Object.values(CONVICTION_WEIGHTS), [0.25, 0.25, 0.25, 0.25]);
    const sell = { theme: 'Industrials', sharePct: 12, momentum5d: -10 };
    const buy = { theme: 'Materials', sharePct: 2, momentum5d: 3.5 };
    // No dispersion, no regime → momentum + positioning only, weights renormalise.
    const c = rotationConviction(sell, buy, null, null);
    assert.equal(c.factors.breadth, null);
    assert.equal(c.factors.macroFit, null);
    // momentum gap 13.5pp → clamps to 100; skew 10pp/15 → 66.67; mean ≈ 83
    assert.equal(c.factors.momentum, 100);
    assert.equal(Math.round(c.factors.positioning), 67);
    assert.equal(c.score, 83);
    assert.equal(c.tag, 'BUY BIAS');
});

test('rotationConviction: macro fit rewards regime-aligned pairs, breadth penalises wide spreads', () => {
    const sell = { theme: 'Technology', sharePct: 30, momentum5d: -4 };
    const buy = { theme: 'Energy', sharePct: 3, momentum5d: 2 };
    const playbook = { rewards: ['Energy', 'Materials'], punishes: ['Technology'] };
    const c = rotationConviction(sell, buy, { spread: 8, winners: [{ tk: 'X', pct: 1 }], losers: [] }, playbook);
    assert.equal(c.factors.macroFit, 100);   // buy rewarded (+50) and sell punished (+50)
    assert.equal(c.factors.breadth, 60);     // 100 − 8×5
    const inverse = rotationConviction(buy, sell, null, playbook);  // selling what the regime rewards
    assert.equal(inverse.factors.macroFit, 0);
});

test('VERDICT_CHIP maps every quadrant verdict to a card chip', () => {
    assert.deepEqual(
        ['ADD', 'LET_RUN', 'TRIM', 'IGNORE', 'HOLD'].map(v => VERDICT_CHIP[v]),
        ['BUY', 'HOLD', 'SELL', 'WATCH', 'HOLD']);
});

test('breadthNote: names the driver when wide, reports spread when moderate', () => {
    assert.equal(breadthNote(null), '—');
    assert.equal(breadthNote({ spread: 0.8, winners: [{ tk: 'A', pct: 0.5 }], losers: [] }), 'breadth tight');
    assert.equal(breadthNote({ spread: 3.1, winners: [{ tk: 'A', pct: 2 }], losers: [{ tk: 'B', pct: -1.1 }] }), 'spread 3.1pp');
    assert.equal(breadthNote({ spread: 11.9, winners: [{ tk: 'A', pct: 1.6 }], losers: [{ tk: 'KMTUY', pct: -10.3 }] }), 'KMTUY driving');
});
