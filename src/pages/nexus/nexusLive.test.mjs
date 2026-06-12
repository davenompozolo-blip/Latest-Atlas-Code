// ============================================================
// Acceptance fixture for the Nexus live transforms.
// Run: node src/pages/nexus/nexusLive.test.mjs
//
// Pure maths only (nexusLiveCompute.js) — no Supabase IO. A small
// hand-computed book of vw_nexus_holdings-shaped rows verifies the
// row→Holding mapping, the composite-first FV gap, the derived
// reads, the theme spine, and the concentration gauge.
// ============================================================

import {
    toSignalTone, fvGapPct, mapHolding, buildSpine, buildConcentration, buildLiveSections,
} from './nexusLiveCompute.js';

// vw_nexus_holdings rows (only the fields the transforms read).
const ROWS = [
    { symbol: 'NVDA',  sector: 'Technology', weight_pct: 30, daily_return_pct: -2, var_contribution_pct: 40, conviction_score: 78, current_price: 100, dcf_upside_pct:  5, valuation_signal: 'Momentum cooling', quant_signal: 'Bullish',   technical_signal: '' },
    { symbol: 'AVGO',  sector: 'Technology', weight_pct: 20, daily_return_pct: -1, var_contribution_pct: 25, conviction_score: 72, current_price: 200, dcf_upside_pct: -4, valuation_signal: 'Rich vs DCF',      quant_signal: 'Bearish',   technical_signal: '' },
    { symbol: 'CVX',   sector: 'Energy',     weight_pct: 10, daily_return_pct:  1, var_contribution_pct:  5, conviction_score: 63, current_price: 150, dcf_upside_pct:  8, valuation_signal: 'Macro tailwind',   quant_signal: 'Improving', technical_signal: '' },
    { symbol: 'TCEHY', sector: 'Intl ADRs',  weight_pct:  5, daily_return_pct:  0, var_contribution_pct:  2, conviction_score: 64, current_price:  50, dcf_upside_pct: 18, valuation_signal: 'Stale feed',       quant_signal: '',          technical_signal: '' },
];

// NVDA has a trusted composite (→ FV gap from it); the rest fall back
// to the view's dcf_upside_pct.
const COMP = new Map([['NVDA', 112]]);   // (112-100)/100 = +12%
const STALE = new Set(['TCEHY']);

let fails = 0;
const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};

// ── Signal tone mapping ───────────────────────────────────────
check('tone: bullish → improving',     toSignalTone({ quant_signal: 'Bullish' }), 'improving');
check('tone: bearish → deteriorating', toSignalTone({ technical_signal: 'Bearish breakdown' }), 'deteriorating');
check('tone: empty → neutral',         toSignalTone({}), 'neutral');

// ── FV gap: composite-first, then dcf fallback, then null ─────
check('fvGap: composite wins', fvGapPct(ROWS[0], COMP), 12);
check('fvGap: dcf fallback',   fvGapPct(ROWS[1], COMP), -4);
check('fvGap: none → null',    fvGapPct({ symbol: 'X', current_price: 10 }, new Map()), null);

// ── Row → Holding ─────────────────────────────────────────────
const nvda = mapHolding(ROWS[0], COMP, STALE);
check('map: NVDA fvGap',      nvda.fvGapPct, 12);
check('map: NVDA tone',       nvda.signalTone, 'improving');
check('map: NVDA objectId',   nvda.objectId, 'obj-nvda');
check('map: TCEHY stale',     mapHolding(ROWS[3], COMP, STALE).stale, true);

// ── Derived reads (computeRead over the real ingredients) ─────
const { holdings, spine, concentration } = buildLiveSections(ROWS, COMP, STALE);
const readOf = tk => holdings.find(h => h.tk === tk).read;
check('read: NVDA  (cheap, no room) → hold',  readOf('NVDA'),  'hold');
check('read: AVGO  (deteriorating)  → watch', readOf('AVGO'),  'watch');
check('read: CVX   (cheap + room)   → add',   readOf('CVX'),   'add');
check('read: TCEHY (stale gate)     → hold',  readOf('TCEHY'), 'hold');

// ── Spine (theme aggregation) ─────────────────────────────────
check('spine: theme order',        spine.map(s => s.theme), ['Technology', 'Energy', 'Intl ADRs']);
check('spine: Tech share',         spine[0].sharePct, 50);
check('spine: Tech move',          spine[0].movePct, -1.6);
check('spine: Tech riskShift',     spine[0].riskShift, 2);
check('spine: Tech fragility',     spine[0].fragility, true);
check('spine: Intl ADRs stale',    spine[2].stale, true);
check('spine: Intl ADRs riskShift', spine[2].riskShift, -1);

// ── Concentration gauge ───────────────────────────────────────
check('conc: effectiveN',       concentration.effectiveN, 3);
check('conc: nominalN',         concentration.nominalN, 4);
check('conc: topFactorPct',     concentration.topFactorPct, 90);
check('conc: fragilityCluster', concentration.fragilityCluster, ['NVDA', 'AVGO']);
check('conc: verdict',          concentration.verdictChip, 'Diversified');

if (fails) { console.error(`\nFAILED — ${fails} assertion(s) did not match.`); process.exit(1); }
console.log('\nPASS — live transforms match the worked fixture.');
