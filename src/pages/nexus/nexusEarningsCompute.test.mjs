// ============================================================
// Fixture for the Earnings intelligence transforms.
// Run: node src/pages/nexus/nexusEarningsCompute.test.mjs
// ============================================================

import {
    daysUntil, beatRate, priorPrint, avgEarningsMovePct, realizedVolPct,
    expectedMove, sentimentFromSignals, buildEarningsRow, sortRows,
    pickEarningsExpiry, atmStraddleMovePct,
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

// ── options-implied move ──────────────────────────────────────
const EXP = ['2026-06-15', '2026-06-22', '2026-06-26', '2026-07-17'];
check('expiry brackets the print', pickEarningsExpiry(EXP, '2026-06-24'), '2026-06-26');
check('expiry exact match', pickEarningsExpiry(EXP, '2026-06-22'), '2026-06-22');
check('expiry none after → null', pickEarningsExpiry(EXP, '2026-08-01'), null);

// ATM straddle: spot 100, ATM strike 100 call 3.0 / put 2.5 → 5.5% move.
const CHAIN = {
    calls: [{ strike: 95, bid: 6, ask: 6.4 }, { strike: 100, bid: 2.9, ask: 3.1 }, { strike: 105, bid: 1, ask: 1.2 }],
    puts:  [{ strike: 95, bid: 1, ask: 1.2 }, { strike: 100, bid: 2.4, ask: 2.6 }, { strike: 105, bid: 5.8, ask: 6.2 }],
};
check('ATM straddle move %', atmStraddleMovePct(CHAIN, 100), 5.5);
check('straddle no spot → null', atmStraddleMovePct(CHAIN, 0), null);
check('straddle empty chain → null', atmStraddleMovePct({ calls: [], puts: [] }, 100), null);

// buildEarningsRow prefers the options move (basis 'iv') over history.
const ivRow = buildEarningsRow(
    { symbol: 'NVDA', sector: 'Technology', next_earnings_date: '2026-06-17' },
    { calendar: { date: '2026-06-17' }, history: HIST, series: SERIES, optionsMovePct: 6.2 },
    TODAY,
);
check('row prefers options-implied move', [ivRow.expectedMovePct, ivRow.expectedMoveBasis], [6.2, 'iv']);

if (fails) { console.error(`\nFAILED — ${fails} assertion(s).`); process.exit(1); }
console.log('\nPASS — earnings transforms match the fixture.');
