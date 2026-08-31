// ============================================================
// Acceptance fixture for the lifted panels' prop contract.
// Run: node src/pages/nexus/nexusPanelProps.test.mjs
//
// The three panels now read their data from a prop instead of
// fetching it. That makes one distinction load-bearing, and it is
// easy to collapse by accident into a single `if (!board)`:
//
//   undefined → the model has not resolved yet   → loading
//   null      → it resolved, the endpoint failed → unavailable
//
// A collapsed tile has to tell those apart to show a headline, so
// they are pinned here. Rendered with react-dom/server: the chart
// effects never run, and the assertions are about which branch was
// taken, not about the canvas.
// ============================================================

import React from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { NexusBoardSection } from './NexusBoard.js';
import { NexusEarningsTable } from './NexusEarnings.js';
import { NexusCotTable } from './NexusCot.js';

let fails = 0;
const check = (name, got, want) => {
    const ok = got === want;
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${got}\n    want: ${want}`); }
    else console.log(`✓ ${name}`);
};
const e = React.createElement;
// react-dom escapes entities, so match the escaped form.
const has = (html, s) => html.includes(s);

// ── undefined: model unresolved → loading ─────────────────────
check('board undefined → loading',    has(render(e(NexusBoardSection,  {})), 'Loading macro &amp; breadth'), true);
check('earnings undefined → loading', has(render(e(NexusEarningsTable, {})), 'Loading earnings'),            true);
check('cot undefined → loading',      has(render(e(NexusCotTable,      {})), 'Loading positioning'),         true);

// ── null: endpoint unavailable → each panel's own empty state ─
const bNull = render(e(NexusBoardSection, { board: null }));
check('board null → unavailable',      has(bNull, 'Macro &amp; breadth board unavailable'), true);
check('board null → NOT still loading', has(bNull, 'Loading macro'), false);
check('earnings null → NOT still loading', has(render(e(NexusEarningsTable, { earnings: null })), 'Loading earnings'), false);
check('cot null → unavailable',        has(render(e(NexusCotTable, { cot: null })), 'Positioning data unavailable'), true);

// ── payload: the real panel, off the prop alone ───────────────
const bOk = render(e(NexusBoardSection, { board: {
    fearGreed: { score: 42, label: 'Fear', parts: [{ name: 'volatility', score: 40, value: '18.4' }] },
    indices: [], vix: null, breadth: [],
} }));
check('board payload → Fear & Greed rendered', has(bOk, 'Fear &amp; Greed') && has(bOk, '42'), true);
check('board payload → no unavailable notice', has(bOk, 'board unavailable'), false);

const cOk = render(e(NexusCotTable, { cot: { asOf: '2026-08-29', rows: [
    { code: 'ES', market: 'S&P 500', exposure: ['SPY'], netSpecPctOi: 12.5, tone: 'rich', rank1y: 0.9, wowNet: 4200, read: 'Crowded long' },
] } }));
check('cot payload → market row rendered', has(cOk, 'S&amp;P 500') && has(cOk, '1 markets'), true);

const erOk = render(e(NexusEarningsTable, { earnings: { horizonDays: 75, reportingCount: 1, rows: [
    { tk: 'NVDA', sector: 'Technology', theme: 'AI', date: '2026-09-10', daysUntil: 10, hour: 'amc', sentiment: 'bullish', sentimentLabel: 'Bullish' },
] } }));
check('earnings payload → ticker row rendered', has(erOk, 'NVDA'), true);
check('earnings payload → not loading',         has(erOk, 'Loading earnings'), false);

console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll panel prop-contract checks passed');
process.exit(fails ? 1 : 0);
