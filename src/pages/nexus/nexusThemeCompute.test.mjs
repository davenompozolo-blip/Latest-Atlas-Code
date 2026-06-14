// Theme aggregation — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    buildThemeView, themeLeaders,
    dailyReturns, themeReturnSeries, cumMomentum, beta, themeDispersion, rotationRead, stdev, scaleReturnsToVol,
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
