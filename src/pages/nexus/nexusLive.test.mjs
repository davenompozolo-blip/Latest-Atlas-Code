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
    buildWindshield, buildSeasonal, buildRead,
} from './nexusLiveCompute.js';

const M = '−';  // unicode minus, as the formatters emit

// vw_nexus_holdings rows (only the fields the transforms read).
const ROWS = [
    { symbol: 'NVDA',  sector: 'Technology', theme: 'AI / accelerated compute', weight_pct: 30, daily_return_pct: -2, var_contribution_pct: 40, conviction_score: 78, current_price: 100, dcf_upside_pct:  5, valuation_signal: 'Momentum cooling', quant_signal: 'Bullish',   technical_signal: '' },
    { symbol: 'AVGO',  sector: 'Technology', theme: 'AI / accelerated compute', weight_pct: 20, daily_return_pct: -1, var_contribution_pct: 25, conviction_score: 72, current_price: 200, dcf_upside_pct: -4, valuation_signal: 'Rich vs DCF',      quant_signal: 'Bearish',   technical_signal: '' },
    { symbol: 'CVX',   sector: 'Energy',     theme: 'Energy',                     weight_pct: 10, daily_return_pct:  1, var_contribution_pct:  5, conviction_score: 63, current_price: 150, dcf_upside_pct:  8, valuation_signal: 'Macro tailwind',   quant_signal: 'Improving', technical_signal: '' },
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
check('map: NVDA contrib (w×ret/100)', nvda.contribPct, -0.6);  // 30% × −2% / 100
check('map: NVDA tone',       nvda.signalTone, 'improving');
check('map: NVDA objectId',   nvda.objectId, 'obj-nvda');
check('map: TCEHY stale',     mapHolding(ROWS[3], COMP, STALE).stale, true);

// ── Derived reads (computeRead over the real ingredients) ─────
const sections = buildLiveSections(ROWS, COMP, STALE);
const { holdings, spine, concentration } = sections;
const readOf = tk => holdings.find(h => h.tk === tk).read;
check('read: NVDA  (cheap, no room) → hold',  readOf('NVDA'),  'hold');
check('read: AVGO  (deteriorating)  → watch', readOf('AVGO'),  'watch');
check('read: CVX   (cheap + room)   → add',   readOf('CVX'),   'add');
check('read: TCEHY (stale gate)     → hold',  readOf('TCEHY'), 'hold');

// ── Spine (sector aggregation) ────────────────────────────────
// Rows are keyed on `label` + `dimension` — the spine groups by whichever
// axis it was asked for, so naming the field `theme` was only ever right
// by accident.
check('spine: sector order',       spine.map(s => s.label), ['Technology', 'Energy', 'Intl ADRs']);
check('spine: dimension',          spine[0].dimension, 'sector');

// ── Theme spine — the second cut of the same book ─────────────
// Sector says the book is half Technology; theme says the same 50% is one
// bet. Both are true and the difference is the reason both views exist.
const themeSpine = buildSpine(ROWS, STALE, 'theme');
check('themeSpine: order',         themeSpine.map(s => s.label), ['AI / accelerated compute', 'Energy', 'Unclassified']);
check('themeSpine: dimension',     themeSpine[0].dimension, 'theme');
check('themeSpine: AI share',      themeSpine[0].sharePct, 50);
check('themeSpine: AI names',      themeSpine[0].names, 2);
// 30×−2 + 20×−1 = −80, over 50% share = −1.6
check('themeSpine: AI move',       themeSpine[0].movePct, -1.6);
// TCEHY carries no theme: it lands in Unclassified and is reported, not hidden.
check('themeSpine: unmapped bucket', themeSpine[2].sharePct, 5);
check('themeSpine: unmappedWeight',  themeSpine.unmappedWeight, 5);
check('spine: nothing unmapped by sector', spine.unmappedWeight, 0);
// Unclassified is an absence of data, never a fragility cluster.
check('themeSpine: unmapped not fragile', !!themeSpine[2].fragility, false);
// Both cuts still describe the whole book.
check('themeSpine: shares total',  themeSpine.reduce((a, r) => a + r.sharePct, 0), 65);
check('spine: shares total',       spine.reduce((a, r) => a + r.sharePct, 0), 65);
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

// ── Windshield (live macro tiles from the /api/macro payload) ──
// FRED arrays are ascending {date,value}; SPY is a Finnhub quote.
const MACRO = {
    yields: { dgs2: [{ value: 4.51 }, { value: 4.62 }], dgs10: [{ value: 4.50 }, { value: 4.55 }] },
    market: [{ symbol: 'SPY', price: 5123, changePct: -1.2 }],
    volatility: { vix: [{ value: 16.3 }, { value: 18.4 }] },
    regime: { label: 'Reflation', cpiYoY: 3.1 },
};
const ws = buildWindshield(MACRO);
check('ws: tile count',        ws.stats.length, 5);
check('ws: VIX value',         ws.stats[0].value, '18.4');
check('ws: VIX change',        ws.stats[0].change, '+2.1');
check('ws: S&P value',         ws.stats[1].value, '$5,123.00');
check('ws: S&P change',        ws.stats[1].change, M + '1.2%');
check('ws: 2Y value',          ws.stats[2].value, '4.62%');
check('ws: 2Y change (bp)',    ws.stats[2].change, '+11bp');
check('ws: 2Y tone rising',    ws.stats[2].tone, 'down');
check('ws: spread value',      ws.stats[4].value, M + '7bp');
check('ws: spread tone inv',   ws.stats[4].tone, 'down');
check('ws: driver regime',     /Reflation regime/.test(ws.driver), true);
check('ws: no macro → null',   buildWindshield(null), null);

// ── Seasonal (live figures, no stale literals) ────────────────
const seas = buildSeasonal({ spine, concentration, holdings, macro: MACRO });
check('seasonal: keys',           Object.keys(seas).sort(), ['drift', 'opportunities', 'regime', 'theme']);
check('sections: both spines',     [sections.spine[0].dimension, sections.themeSpine[0].dimension], ['sector', 'theme']);
// Holdings carry sector and theme separately; theme stays null when unmapped.
check('map: NVDA sector',         holdings.find(h => h.tk === 'NVDA').sector, 'Technology');
check('map: NVDA theme',          holdings.find(h => h.tk === 'NVDA').theme, 'AI / accelerated compute');
check('map: TCEHY theme null',    holdings.find(h => h.tk === 'TCEHY').theme, null);
check('map: TCEHY sector kept',   holdings.find(h => h.tk === 'TCEHY').sector, 'Intl ADRs');
check('seasonal: sector largest', /Technology is your largest sector at 50%/.test(seas.theme.body[0]), true);
check('seasonal: regime label',   seas.regime.tags.includes('Reflation'), true);
check('seasonal: inverted curve', seas.regime.tags.includes('Inverted curve'), true);
check('seasonal: opp cheap name', /NVDA/.test(seas.opportunities.body[0]), true);
check('seasonal: drift cluster',  /NVDA/.test(seas.drift.body[1]), true);

// ── The Read (live narrative from macro + gauge + verdicts) ───
const read = buildRead({ macro: MACRO, concentration, holdings, spine });
check('read: shape',            Object.keys(read.variants).sort(), ['hfl', 'market']);
check('read: default stance',   read.default, 'market');
check('read: prices the tape',  /2Y at 4\.62%.*10Y at 4\.55%.*curve −7bp.*VIX 18\.4/.test(read.variants.market.html), true);
check('read: regime named',     /reflation/.test(read.variants.market.html), true);
check('read: cluster share',    new RegExp(concentration.topFactorPct + '% of factor risk in Technology').test(read.variants.market.html), true);
// The trims the hfl stance names must be the engine's own trim/exit verdicts.
const trimTks = holdings.filter(h => h.read === 'trim' || h.read === 'exit').map(h => h.tk);
const namesTrim = trimTks.some(tk => read.variants.hfl.html.includes(tk));
check('read: hfl trims are engine verdicts', trimTks.length ? namesTrim : /no forced trims/.test(read.variants.hfl.html), true);
check('read: hfl stresses the 2Y', /2Y holds near 4\.62%/.test(read.variants.hfl.html), true);
check('read: no macro → null (baseline fallback)', buildRead({ macro: null, concentration, holdings, spine }), null);
check('read: empty book → null', buildRead({ macro: MACRO, concentration, holdings: [], spine }), null);

if (fails) { console.error(`\nFAILED — ${fails} assertion(s) did not match.`); process.exit(1); }
console.log('\nPASS — live transforms match the worked fixture.');
