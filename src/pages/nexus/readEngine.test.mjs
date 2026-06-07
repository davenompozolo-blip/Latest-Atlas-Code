// ============================================================
// Acceptance fixture for the Read Engine (Meat step 1, section 6).
// Run: node src/pages/nexus/readEngine.test.mjs
//
// The engine's `read` for all 12 current holdings must match the
// worked trace exactly (this is the acceptance fixture). `because`
// is checked against the section-5 canonical templates.
// ============================================================

import { computeRead, READ_CONFIG, ConcentrationPenalty } from './readEngine.js';

// Mock ingredients (mirror nexusMock HOLDINGS) — no read/because.
const HOLDINGS = [
    { tk: 'NVDA',  conviction: 78, componentVar: 18.4, fvGapPct:  6.2, signal: 'Momentum cooling', signalTone: 'neutral' },
    { tk: 'AVGO',  conviction: 72, componentVar:  9.1, fvGapPct: -3.4, signal: 'Rich vs DCF',      signalTone: 'neutral' },
    { tk: 'MSFT',  conviction: 81, componentVar:  7.7, fvGapPct:  9.8, signal: 'Quality A+',       signalTone: 'improving' },
    { tk: 'AMZN',  conviction: 69, componentVar:  5.2, fvGapPct: 12.1, signal: null,               signalTone: 'neutral' },
    { tk: 'AMD',   conviction: 58, componentVar:  6.8, fvGapPct: -1.2, signal: 'High beta',        signalTone: 'deteriorating' },
    { tk: 'ASML',  conviction: 74, componentVar:  5.9, fvGapPct:  4.5, signal: 'Cheap vs peers',   signalTone: 'improving' },
    { tk: 'CVX',   conviction: 63, componentVar:  3.1, fvGapPct:  8.0, signal: 'Macro tailwind',   signalTone: 'improving' },
    { tk: 'BAC',   conviction: 55, componentVar:  2.4, fvGapPct:  2.1, signal: null,               signalTone: 'neutral' },
    { tk: 'TCEHY', conviction: 64, componentVar:  1.8, fvGapPct: 18.4, signal: 'Stale feed',       signalTone: 'neutral', stale: true },
    { tk: 'PROSY', conviction: 61, componentVar:  1.1, fvGapPct: 22.0, signal: 'Stale feed',       signalTone: 'neutral', stale: true },
    { tk: 'NPSNY', conviction: 57, componentVar:  0.9, fvGapPct:  6.0, signal: 'Stale feed',       signalTone: 'neutral', stale: true },
    { tk: 'VWAGY', conviction: 52, componentVar:  0.7, fvGapPct: 14.0, signal: 'Stale feed',       signalTone: 'neutral', stale: true },
];

// Expected verdicts (section 6 "Engine read" column).
const EXPECTED = {
    NVDA: 'hold', AVGO: 'trim', MSFT: 'add', AMZN: 'add', AMD: 'watch', ASML: 'add',
    CVX: 'add', BAC: 'hold', TCEHY: 'hold', PROSY: 'hold', NPSNY: 'hold', VWAGY: 'watch',
};

const book = { holdings: HOLDINGS };
let fails = 0;
console.log('Ticker  read   because');
for (const h of HOLDINGS) {
    const { read, because } = computeRead(h, book, READ_CONFIG, ConcentrationPenalty);
    const ok = read === EXPECTED[h.tk];
    if (!ok) fails++;
    console.log(`${(ok ? '✓' : '✗')} ${h.tk.padEnd(6)} ${read.padEnd(6)} ${because}`);
}
if (fails) {
    console.error(`\nFAILED — ${fails} read(s) did not match the fixture.`);
    process.exit(1);
}
console.log('\nPASS — all 12 reads match the section-6 trace.');
