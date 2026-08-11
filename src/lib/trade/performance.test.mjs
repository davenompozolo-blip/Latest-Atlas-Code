// Period performance fixture. Run: node src/lib/trade/performance.test.mjs

import { performanceSnapshot } from './performance.js';

let fails = 0;
const near = (name, got, want, tol = 1e-9) => {
    const ok = (got == null && want == null) || (got != null && want != null && Math.abs(got - want) <= tol);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${got}\n    want: ${want}`); }
    else console.log(`✓ ${name}  (${got == null ? 'null' : (got * 100).toFixed(2) + '%'})`);
};

// 2025-12-31 Wed, then Jan 2026. 2026-01-05 is a Monday.
const bars = [
    { d: '2025-12-30', c: 90 },
    { d: '2025-12-31', c: 100 },   // year base
    { d: '2026-01-02', c: 104 },
    { d: '2026-01-05', c: 110 },
    { d: '2026-01-06', c: 121 },
];

// Same-month case: last bar 2026-01-06, so the month base is 2025-12-31 and the
// week base is 2026-01-02 (the Friday before Monday the 5th).
const p = performanceSnapshot(bars);
near('day  = 121/110 − 1', p.day, 121 / 110 - 1);
near('wtd  measured from the Friday before the week opened', p.wtd, 121 / 104 - 1);
near('mtd  measured from the last close of December', p.mtd, 121 / 100 - 1);
near('ytd  measured from the last close of the prior year', p.ytd, 121 / 100 - 1);

console.log('\n— the first session of a period already shows its own move —');
const firstOfMonth = performanceSnapshot([
    { d: '2026-01-30', c: 100 },
    { d: '2026-02-02', c: 105 },
]);
near('MTD on the first trading day of February', firstOfMonth.mtd, 0.05);

console.log('\n— unmeasurable periods are null, never zero —');
const shortHistory = performanceSnapshot([
    { d: '2026-07-07', c: 100 },
    { d: '2026-07-08', c: 102 },
]);
near('day is measurable', shortHistory.day, 102 / 100 - 1);
near('YTD is not, with history starting in July', shortHistory.ytd, null);
near('MTD is not, with history starting mid-month', shortHistory.mtd, null);

const single = performanceSnapshot([{ d: '2026-07-08', c: 102 }]);
near('a lone bar yields no day return', single.day, null);
near('and no last-price confusion', single.last, 102);

console.log('\n— junk in the series is skipped, not propagated —');
const dirty = performanceSnapshot([
    { d: '2026-02-02', c: 100 },
    { d: '2026-02-03', c: 0 },
    { d: '2026-02-04', c: null },
    { d: '2026-02-05', c: 110 },
]);
near('base skips the zero and the null', dirty.day, 110 / 100 - 1);

const empty = performanceSnapshot([]);
near('empty input is all null', empty.day, null);
near('and reports no last', empty.last, null);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
