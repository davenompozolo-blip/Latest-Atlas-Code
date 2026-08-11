// Universe fixture — eligibility is binary, ranking is continuous, and the two
// must never touch. Run: node src/lib/trade/universe.test.mjs
//
// The excluded names are drawn from the real gap in production: SNDK, MU and
// MRVL carry only ~59 sessions of price history, which is the "AGE DATA
// MISSING" case §3.2 says must be enforced rather than noted.

import {
    applyGates, buildUniverse, buildFunnel, matchesAxes, rankUniverse,
    attachPercentiles, bandOf, EXCLUSION,
} from './universe.js';
import { buildFamilyVector, eventSuppression, convictionFromAgreement, convictionFromExtremity } from './families.js';

let fails = 0;
const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};
const near = (name, got, want, tol) => {
    const ok = got != null && Math.abs(got - want) <= tol;
    if (!ok) { fails++; console.error(`✗ ${name}\n    got: ${got}\n    want: ${want} ±${tol}`); }
    else console.log(`✓ ${name}  (${typeof got === 'number' ? Number(got.toFixed(4)) : got})`);
};

const base = {
    tradeable: true, halted: false, listingStatus: 'active',
    advUsd: 2e9, spreadBps: 3, priceAgeDays: 1, historyDays: 276,
    close: 100, sector: 'Info Tech', geography: 'US',
};

const CANDIDATES = [
    { symbol: 'NVDA', ...base, advUsd: 28.1e9, momentum: 0.42, realisedVol: 0.42, net: 0.06, alignment: 0.10, marketCapBucket: 'Mega', bookState: 'held' },
    { symbol: 'GDX',  ...base, advUsd: 1.2e9,  momentum: 0.31, realisedVol: 0.28, net: 0.61, alignment: 0.78, marketCapBucket: 'Large', bookState: 'unowned', sector: 'Materials' },
    { symbol: 'NEM',  ...base, advUsd: 680e6,  momentum: 0.27, realisedVol: 0.30, net: 0.54, alignment: 0.71, marketCapBucket: 'Large', bookState: 'unowned', sector: 'Materials' },
    { symbol: 'XLE',  ...base, advUsd: 1.9e9,  momentum: 0.18, realisedVol: 0.22, net: 0.38, alignment: 0.66, marketCapBucket: 'Large', bookState: 'unowned', sector: 'Energy' },
    { symbol: 'WMT',  ...base, advUsd: 1.4e9,  momentum: 0.14, realisedVol: 0.15, net: 0.31, alignment: 0.74, marketCapBucket: 'Mega', bookState: 'unowned', sector: 'Staples' },
    { symbol: 'SMCI', ...base, advUsd: 2.1e9,  momentum: 0.55, realisedVol: 0.68, net: -0.44, alignment: 0.52, marketCapBucket: 'Mid', bookState: 'unowned' },
    // The real production gap: three names with ~59 sessions on file.
    { symbol: 'SNDK', ...base, historyDays: 59 },
    { symbol: 'MU',   ...base, historyDays: 59, bookState: 'held' },
    { symbol: 'MRVL', ...base, historyDays: 59 },
    // One of each remaining gate.
    { symbol: 'CVNA', ...base, spreadBps: 41 },
    { symbol: 'HTZ',  ...base, advUsd: 2e6 },
    { symbol: 'SAVE', ...base, halted: true },
    { symbol: 'DEAD', ...base, tradeable: false },
    { symbol: 'OLD',  ...base, priceAgeDays: 91 },
];

console.log('— gates are binary and each drop is attributed to one stage (§3.2) —');
eq('history too short → AGE DATA MISSING',
   applyGates(CANDIDATES[6]).code, EXCLUSION.HISTORY_SHORT);
eq('wide spread → SPREAD ABOVE CEILING',
   applyGates(CANDIDATES[9]).code, EXCLUSION.SPREAD_CEILING);
eq('thin ADV → ADV BELOW FLOOR',
   applyGates(CANDIDATES[10]).code, EXCLUSION.ADV_FLOOR);
eq('halted → HALTED', applyGates(CANDIDATES[11]).code, EXCLUSION.HALTED);
eq('not tradeable → NOT BROKER TRADEABLE', applyGates(CANDIDATES[12]).code, EXCLUSION.NOT_TRADEABLE);
eq('stale price → PRICE DATA STALE', applyGates(CANDIDATES[13]).code, EXCLUSION.PRICE_STALE);
eq('a clean name passes', applyGates(CANDIDATES[0]).eligible, true);

console.log('\n— gate order: the first failure owns the drop —');
// HTZ fails liquidity AND would fail nothing else; SAVE is halted AND thin.
const both = { ...base, symbol: 'BOTH', halted: true, advUsd: 1 };
eq('broker gate is checked before liquidity', applyGates(both).stage, 'broker_tradeable');

console.log('\n— shortability only applies to the short side (§3.2) —');
const noBorrow = { ...base, symbol: 'NB', shortable: false };
eq('long side ignores borrow', applyGates(noBorrow, {}, { side: 'buy' }).eligible, true);
eq('short side does not', applyGates(noBorrow, {}, { side: 'sell_short' }).code, EXCLUSION.NOT_SHORTABLE);

console.log('\n— your clip against the book’s liquidity (§3.2) —');
eq('a clip inside 5% of ADV passes',
   applyGates({ ...base, symbol: 'X', advUsd: 1e7 }, {}, { intendedClipUsd: 400000 }).eligible, true);
eq('a clip above it does not',
   applyGates({ ...base, symbol: 'X', advUsd: 1e7 }, {}, { intendedClipUsd: 900000 }).code, EXCLUSION.CLIP_TOO_LARGE);

console.log('\n— the funnel (§3.2) —');
const uni = buildUniverse(CANDIDATES);
const f = uni.funnel;
eq('funnel stages in order', f.map((s) => s.stage),
   ['candidates', 'broker_tradeable', 'liquidity_floor', 'data_integrity', 'eligible']);
eq('14 candidates in', f[0].count, 14);
eq('2 dropped at the broker gate', f[1].dropped, 2);
eq('2 dropped at the liquidity floor', f[2].dropped, 2);
eq('4 dropped at the data gate', f[3].dropped, 4);
eq('6 eligible today', uni.counts.eligible, 6);
eq('the data-gate count is surfaced on its own', uni.counts.dataGate, 4);
eq('every exclusion carries a reason',
   uni.excluded.every((r) => r.exclusionCode && r.exclusionDetail), true);
eq('a held-but-ineligible name is still reported as held',
   uni.excluded.find((r) => r.symbol === 'MU').bookState, 'held');

console.log('\n— ranking never sees an ineligible name (§0, §3.4) —');
eq('excluded names are absent from the ranking',
   uni.eligible.some((r) => !r.eligible), false);
eq('ranks are dense from 1', uni.eligible.map((r) => r.rank), [1, 2, 3, 4, 5, 6]);

console.log('\n— the composite is a display convenience, not a verdict (§3.4) —');
const byNet = rankUniverse(uni.eligible, { rankBy: 'net' }).map((r) => r.symbol);
const byAlign = rankUniverse(uni.eligible, { rankBy: 'alignment' }).map((r) => r.symbol);
eq('by net, GDX leads and NVDA is fifth', [byNet[0], byNet.indexOf('NVDA') + 1], ['GDX', 5]);
eq('by alignment, NVDA is last', byAlign[byAlign.length - 1], 'NVDA');
// This is the mockup's whole point about the ranked panel: a single composite
// would have ordered these identically to net and lost the alignment reading.
eq('the two orderings genuinely differ', byNet.join() !== byAlign.join(), true);

console.log('\n— percentiles are taken over the eligible set only —');
const withPct = attachPercentiles(uni.members);
eq('ineligible names get no percentile',
   withPct.find((r) => r.symbol === 'SNDK').momentumPct, undefined);
eq('SMCI is the top momentum band', withPct.find((r) => r.symbol === 'SMCI').momentumBand, 'Q4');
eq('band boundaries', [bandOf(10), bandOf(30), bandOf(60), bandOf(90)], ['Q1', 'Q2', 'Q3', 'Q4']);

console.log('\n— axes filter the view, never eligibility (§3.3) —');
const materials = uni.eligible.filter((r) => matchesAxes(r, { sector: ['Materials'] }));
eq('sector axis narrows the view', materials.map((r) => r.symbol).sort(), ['GDX', 'NEM']);
eq('axes do not change the eligible count', uni.counts.eligible, 6);
eq('an empty axis set matches everything', matchesAxes(uni.eligible[0], { sector: [] }), true);
eq('earnings bucket', matchesAxes({ daysToEarnings: 14 }, { earnings: ['5_30d'] }), true);
eq('earnings bucket excludes', matchesAxes({ daysToEarnings: 2 }, { earnings: ['5_30d'] }), false);

// ── Family scoring ───────────────────────────────────────────────────────────
console.log('\n— conviction, the two methods (§10 residual question 2) —');
const mildAgree = [0.2, 0.25, 0.18, 0.22].map((v, i) => ({ key: `i${i}`, value: v }));
near('every input agrees mildly → conviction 1', convictionFromAgreement(mildAgree, 0.21), 1, 1e-9);
const oneScreams = [{ key: 'a', value: 0.95 }, { key: 'b', value: 0.01 }, { key: 'c', value: 0 },
                    { key: 'd', value: -0.02 }, { key: 'e', value: 0.03 }];
near('one screams, the rest are silent → conviction 0.2', convictionFromAgreement(oneScreams, 0.19), 0.2, 1e-9);
near('a multiple at its median produces no conviction', convictionFromExtremity(50), 0, 1e-9);
near('at the 98th percentile, near full', convictionFromExtremity(98), 1, 1e-9);
near('at the 75th, partial', convictionFromExtremity(75), 0.5556, 0.001);

console.log('\n— event proximity suppression curve (§5.2) —');
near('14 days out costs ~6 points, as in the worked example', eventSuppression(14) * 100, 6.0, 0.3);
near('3 days out costs far more', eventSuppression(3) * 100, 26.7, 0.5);
near('the day itself is the maximum', eventSuppression(0) * 100, 40, 1e-9);
eq('beyond 45 days it costs nothing', eventSuppression(60), 0);

console.log('\n— a family with no data reports no confidence, not a neutral score —');
const vec = buildFamilyVector({});
const trend = vec.find((x) => x.code === 'trend');
eq('trend with no closes scores null', trend.score, null);
eq('and carries zero confidence', trend.confidence, 0);

console.log('\n— trend on a real-shaped series —');
const rising = Array.from({ length: 260 }, (_, i) => 100 * (1 + i * 0.0015));
const spy = Array.from({ length: 260 }, (_, i) => 400 * (1 + i * 0.0005));
const sect = Array.from({ length: 260 }, (_, i) => 80 * (1 + i * 0.0008));
const t2 = buildFamilyVector({ trend: { closes: rising, spyCloses: spy, sectorCloses: sect } }).find((x) => x.code === 'trend');
eq('a steadily rising series scores positive', t2.score > 0.3, true);
eq('with every input agreeing, conviction is high', t2.conviction > 0.85, true);
eq('all seven inputs present → full confidence', t2.confidence, 1);

// Confidence is the data channel, and it must move when an input goes missing
// while score and conviction stay put (§5.2).
const t3 = buildFamilyVector({ trend: { closes: rising, spyCloses: spy } }).find((x) => x.code === 'trend');
near('one input missing → confidence 6/7', t3.confidence, 6 / 7, 1e-9);
eq('a stale series costs confidence too',
   buildFamilyVector({ trend: { closes: rising, spyCloses: spy, sectorCloses: sect, ageDays: 20 } })
     .find((x) => x.code === 'trend').confidence < 1, true);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
