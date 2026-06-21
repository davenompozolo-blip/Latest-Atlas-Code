// Price-guard checks — run: node scripts/lib/price-guard.test.mjs
import { assessClose, parseStooqClose, parseStooqHistory, MAX_DIVERGENCE } from './price-guard.mjs';

let fails = 0;
const check = (name, cond, detail) => {
  if (!cond) fails++;
  console.log(`${cond ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
};

// ── The three real corruptions must be quarantined ──
check('MU: 1132 vs ref 110 → quarantine',
  assessClose(1132.59, 110).ok === false && assessClose(1132.59, 110).reason === 'reference_divergence');
check('SNDK: 2185 vs ref 78 → quarantine',
  assessClose(2185.16, 78).ok === false);
check('GEV: 1109 vs ref 540 → quarantine (~2×)',
  assessClose(1109.33, 540).ok === false);

// ── Clean names must pass ──
check('NVDA: 210.38 vs ref 209.9 → validated', assessClose(210.38, 209.9).ok === true);
check('PFE: 25.22 vs ref 25.4 → validated',    assessClose(25.22, 25.4).ok === true);

// ── Boundaries around MAX_DIVERGENCE (0.30) ──
check('29% divergence → ok', assessClose(129, 100).ok === true && Math.abs(assessClose(129,100).divergence - 0.29) < 1e-9);
check('31% divergence → quarantine', assessClose(131, 100).ok === false);

// ── Degenerate inputs ──
check('no reference → pass-through (no_reference)', assessClose(1000, null).ok === true && assessClose(1000, null).reason === 'no_reference');
check('invalid close → not ok', assessClose(0, 100).ok === false && assessClose(0, 100).reason === 'invalid_close');
check('reference zero → no_reference', assessClose(50, 0).reason === 'no_reference');

// ── Stooq CSV parsing ──
check('parseStooqClose: valid row',
  parseStooqClose('Symbol,Date,Time,Open,High,Low,Close,Volume\nMU.US,2026-06-18,22:00:05,108,112,107,110.42,1199969') === 110.42);
check('parseStooqClose: N/D → null',
  parseStooqClose('Symbol,Date,Time,Open,High,Low,Close,Volume\nBADSYM.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D') === null);
check('parseStooqClose: empty → null', parseStooqClose('') === null);

// ── Stooq history parsing ──
const hist = parseStooqHistory('Date,Open,High,Low,Close,Volume\n2026-06-17,109,112,108,110.4,1200000\n2026-06-18,110,113,109,111.2,1300000');
check('parseStooqHistory: 2 rows parsed', hist.length === 2);
check('parseStooqHistory: close + volume correct', hist[1].close === 111.2 && hist[1].volume === 1300000);
check('parseStooqHistory: skips junk/blank rows',
  parseStooqHistory('Date,Open,High,Low,Close,Volume\nN/D,N/D,N/D,N/D,N/D,N/D').length === 0);

console.log(`\nMAX_DIVERGENCE = ${MAX_DIVERGENCE}`);
console.log(fails ? `\nFAILED — ${fails} check(s)` : '\nPASS — price guard behaves correctly.');
if (fails) process.exit(1);
