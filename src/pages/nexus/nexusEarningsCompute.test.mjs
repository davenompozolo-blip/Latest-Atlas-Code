// ============================================================
// Fixture for the Earnings intelligence transforms.
// Run: node src/pages/nexus/nexusEarningsCompute.test.mjs
// ============================================================

import {
    daysUntil, beatRate, priorPrint, avgEarningsMovePct, realizedVolPct,
    expectedMove, sentimentFromSignals, buildEarningsRow, sortRows,
} from './nexusEarningsCompute.js';

let fails = 0;
const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};

const TODAY = '2026-06-13';

// ── daysUntil ─────────────────────────────────────────────────
check('daysUntil future', daysUntil('2026-06-17', TODAY), 4);
check('daysUntil past',   daysUntil('2026-06-10', TODAY), -3);
check('daysUntil null',   daysUntil(null, TODAY), null);

// ── beatRate / priorPrint ─────────────────────────────────────
const HIST = [
    { period: '2026-03-31', actual: 2.10, estimate: 2.00, surprisePercent: 5.0 },
    { period: '2025-12-31', actual: 1.80, estimate: 1.85, surprisePercent: -2.7 },
    { period: '2025-09-30', actual: 1.70, estimate: 1.60, surprisePercent: 6.25 },
    { period: '2025-06-30', actual: 1.55, estimate: 1.50, surprisePercent: 3.3 },
];
check('beatRate 3/4 → 75', beatRate(HIST), 75);
check('beatRate empty → null', beatRate([]), null);
check('priorPrint newest', priorPrint(HIST), { period: '2026-03-31', actual: 2.1, estimate: 2, surprisePct: 5 });

// ── avgEarningsMovePct ────────────────────────────────────────
// closes: jump on the day after each earnings date.
const SERIES = [
    { t: '2025-09-29', c: 100 }, { t: '2025-09-30', c: 100 }, { t: '2025-10-01', c: 106 }, // +6% after 09-30
    { t: '2025-12-30', c: 110 }, { t: '2025-12-31', c: 110 }, { t: '2026-01-02', c: 105.6 }, // -4% after 12-31
];
check('avg earnings move = 5%', avgEarningsMovePct(SERIES, ['2025-09-30', '2025-12-31']), 5);
check('avg move no dates → null', avgEarningsMovePct(SERIES, []), null);

// ── realizedVol + expectedMove fallback ───────────────────────
const FLAT = Array.from({ length: 25 }, (_, i) => ({ t: 'd' + i, c: 100 }));
check('realizedVol flat = 0', realizedVolPct(FLAT, 20), 0);
check('expectedMove history-first', expectedMove(SERIES, ['2025-09-30', '2025-12-31']), { pct: 5, basis: 'history' });
check('expectedMove vol fallback basis', expectedMove(FLAT, []).basis, 'vol');

// ── sentiment ─────────────────────────────────────────────────
check('sentiment bullish', sentimentFromSignals({ quant_signal: 'Long', valuation_signal: 'Cheap' }).tone, 'bullish');
check('sentiment bearish', sentimentFromSignals({ valuation_signal: 'Rich' }).tone, 'bearish');
check('sentiment neutral', sentimentFromSignals({}).tone, 'neutral');

// ── buildEarningsRow + sort ───────────────────────────────────
const row = buildEarningsRow(
    { symbol: 'NVDA', sector: 'Technology', next_earnings_date: '2026-06-17', valuation_signal: 'Cheap', quant_signal: 'Long', conviction_score: 83 },
    { calendar: { date: '2026-06-17', epsEstimate: 1.25, hour: 'amc' }, history: HIST, series: SERIES },
    TODAY,
);
check('row tk/theme', [row.tk, row.theme], ['NVDA', 'Technology']);
check('row daysUntil', row.daysUntil, 4);
check('row consensus', row.consensusEps, 1.25);
check('row beatRate', row.beatRate, 75);
check('row prior surprise', row.priorSurprisePct, 5);
check('row expected move', [row.expectedMovePct, row.expectedMoveBasis], [5, 'history']);
check('row sentiment', row.sentiment, 'bullish');

const sorted = sortRows([{ daysUntil: 10 }, { daysUntil: -2 }, { daysUntil: 3 }, { daysUntil: null }]);
check('sort soonest first, past/undated last', sorted.map(r => r.daysUntil), [3, 10, -2, null]);

if (fails) { console.error(`\nFAILED — ${fails} assertion(s).`); process.exit(1); }
console.log('\nPASS — earnings transforms match the fixture.');
