// ============================================================
// Acceptance fixture for the v2 ghost states.
// Run: node src/pages/nexus/nexusGhost.test.mjs
//
// A panel that cannot answer says why, using the reason its own
// compute layer already returns — these were being computed and thrown
// away at the render boundary. Pins three things:
//
//   1. the real dropReason reaches the line (not a generic "no data"),
//   2. v1 keeps its existing empty states untouched,
//   3. loading (undefined) and unavailable (null) stay distinct — the
//      ghost replaces only the second, per the provider lift.
// ============================================================

import React from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.window = globalThis;

const { NexusOptionsPanel } = await import('./NexusOptions.js');
const { NexusEarningsTable } = await import('./NexusEarnings.js');
const { NexusBoardSection } = await import('./NexusBoard.js');
const { reasonText, dominantDropReason } = await import('./NexusGhost.js');

let fails = 0;
const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};
const e = React.createElement;
const isGhost = h => h.includes('nfv2-ghost');

// ── The reason mapping ────────────────────────────────────────
check('reason: no_listed_options', reasonText('no_listed_options'), 'no listed options on the held names');
check('reason: chain_too_thin',    reasonText('chain_too_thin'),    'chain too thin — no usable strike depth');
// An unknown code is information; it must not be flattened to "unavailable".
check('reason: unknown code passes through', reasonText('some_new_code'), 'some new code');
check('reason: none → null', reasonText(null), null);

// ── Dominant reason across the book ───────────────────────────
check('dominant: most common wins', dominantDropReason([
    { dropReason: 'chain_too_thin' }, { dropReason: 'no_listed_options' }, { dropReason: 'chain_too_thin' },
]), 'chain_too_thin');
check('dominant: none → null', dominantDropReason([{ hasOptions: true }, null]), null);

// ── Options ───────────────────────────────────────────────────
const noChains = [
    { tk: 'KMTUY', options: { hasOptions: false, dropReason: 'chain_too_thin' } },
    { tk: 'NPSNY', options: { hasOptions: false, dropReason: 'chain_too_thin' } },
];
const og = render(e(NexusOptionsPanel, { holdings: noChains, v2: true }));
check('options v2: renders a ghost', isGhost(og), true);
check('options v2: carries the real reason', og.includes('chain too thin'), true);
check('options v2: not an empty card', og.includes('nf-card'), false);
check('options v1: keeps its empty card', isGhost(render(e(NexusOptionsPanel, { holdings: noChains }))), false);

// ── Earnings: empty PAYLOAD vs empty FILTER are different facts ──
const eg = render(e(NexusEarningsTable, { earnings: { rows: [], horizonDays: 75 }, v2: true }));
check('earnings v2: ghost names the window', eg.includes('no dated event inside the 75d window'), true);
check('earnings v1: keeps its card', isGhost(render(e(NexusEarningsTable, { earnings: { rows: [] } }))), false);
// Rows present but filtered out is NOT the panel failing to answer.
const filtered = render(e(NexusEarningsTable, { earnings: { rows: [{ tk: 'NVDA', daysUntil: 3 }] }, v2: true }));
check('earnings v2: a populated payload still renders the table', isGhost(filtered), false);

// ── Board: loading and unavailable must not collapse ──────────
check('board v2: null → ghost', isGhost(render(e(NexusBoardSection, { board: null, v2: true }))), true);
check('board v2: undefined → still LOADING, not a ghost',
    render(e(NexusBoardSection, { v2: true })).includes('Loading macro &amp; breadth'), true);
check('board v2: undefined is not a ghost', isGhost(render(e(NexusBoardSection, { v2: true }))), false);
check('board v1: null → original card', isGhost(render(e(NexusBoardSection, { board: null }))), false);

console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll ghost-state checks passed');
process.exit(fails ? 1 : 0);
