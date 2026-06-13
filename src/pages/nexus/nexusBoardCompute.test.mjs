// ============================================================
// Fixture for the Macro & Breadth board transforms.
// Run: node src/pages/nexus/nexusBoardCompute.test.mjs
// ============================================================

import {
    closeSeriesFromAlpaca, ratioSeries, lastChange, computeFearGreed, fgLabel, eventMarkers,
} from './nexusBoardCompute.js';

let fails = 0;
const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};

// ── Alpaca parse ──────────────────────────────────────────────
const ALPACA = { 'Time Series (Daily)': {
    '2026-06-10': { '4. close': '100' },
    '2026-06-12': { '4. close': '102' },
    '2026-06-11': { '4. close': '101' },
} };
check('alpaca parse + sort', closeSeriesFromAlpaca(ALPACA), [
    { t: '2026-06-10', c: 100 }, { t: '2026-06-11', c: 101 }, { t: '2026-06-12', c: 102 },
]);
check('alpaca empty → []', closeSeriesFromAlpaca({}), []);

// ── Breadth ratio (rebased to 100) ────────────────────────────
const EW = [{ t: 'd1', c: 50 }, { t: 'd2', c: 55 }, { t: 'd3', c: 54 }];
const CW = [{ t: 'd1', c: 100 }, { t: 'd2', c: 105 }, { t: 'd3', c: 110 }];
// ratios: .5, .5238, .4909 → rebased: 100, 104.8, 98.2
check('ratio rebased to 100', ratioSeries(EW, CW), [
    { t: 'd1', v: 100 }, { t: 'd2', v: 104.8 }, { t: 'd3', v: 98.2 },
]);
check('ratio no overlap → []', ratioSeries(EW, [{ t: 'x', c: 1 }]), []);

// ── last/change ───────────────────────────────────────────────
check('lastChange', lastChange([{ t: 'd1', c: 100 }, { t: 'd2', c: 103 }]), { last: 103, changePct: 3 });
check('lastChange single', lastChange([{ t: 'd1', c: 100 }]), { last: 100, changePct: null });

// ── Fear & Greed labels ───────────────────────────────────────
check('fg label extreme fear', fgLabel(10), 'Extreme Fear');
check('fg label neutral',      fgLabel(50), 'Neutral');
check('fg label extreme greed', fgLabel(90), 'Extreme Greed');

// ── Fear & Greed composite ────────────────────────────────────
// Low VIX (greedy) only → high score; high VIX (fearful) → low.
const greedy = computeFearGreed({ vix: [{ t: 'd', v: 12 }] });
check('fg greedy vix → 100', greedy.score, 100);
check('fg greedy label',     greedy.label, 'Extreme Greed');
const fearful = computeFearGreed({ vix: [{ t: 'd', v: 34 }] });
check('fg fearful vix → 0', fearful.score, 0);
check('fg parts count (vix only)', greedy.parts.length, 1);
check('fg no inputs → null', computeFearGreed({}), null);

// Credit: tight HY spread = greed (2.5%→100), wide (6%)→0.
check('fg credit tight = greed', computeFearGreed({ hySpreadPct: 2.5 }).score, 100);
check('fg credit wide = fear',   computeFearGreed({ hySpreadPct: 6 }).score, 0);

// ── Event calendar ────────────────────────────────────────────
const ev = eventMarkers('2026-06-01', '2026-06-30');
check('events: FOMC Jun 17 present', ev.some(e => e.time === '2026-06-17' && e.kind === 'FOMC'), true);
check('events: CPI Jun 10 present',  ev.some(e => e.time === '2026-06-10' && e.kind === 'CPI'), true);
check('events: NFP Jun 5 (1st Fri)', ev.some(e => e.time === '2026-06-05' && e.kind === 'NFP'), true);
check('events: ascending', ev.map(e => e.time).every((t, i, a) => i === 0 || a[i - 1] <= t), true);

if (fails) { console.error(`\nFAILED — ${fails} assertion(s).`); process.exit(1); }
console.log('\nPASS — board transforms match the fixture.');
