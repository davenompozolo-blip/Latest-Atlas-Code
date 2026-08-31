// ============================================================
// Acceptance fixture for the board's composite ↔ workings flip.
// Run: node src/pages/nexus/nexusBoardFace.test.mjs
//
// The flip rule this pins: both faces are the same payload read two
// ways, so neither may show a chart the other's data cannot support,
// and the panel must not fetch to change face — /api/nexus-board is
// fetched once by the provider and passed in as a prop.
//
// Also pins that v1 is untouched: with no `v2` prop every chart
// renders at once, exactly as it shipped.
// ============================================================

import React from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { readFileSync } from 'node:fs';

// useFace() reads localStorage on mount.
const store = new Map();
globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
};
globalThis.window = globalThis;

const { NexusBoardSection } = await import('./NexusBoard.js');
const { loadFace, saveFace } = await import('./NexusFaceToggle.js');

let fails = 0;
const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};
const e = React.createElement;

const BOARD = {
    fearGreed: { score: 42, label: 'Fear', parts: [{ name: 'volatility', score: 40, value: '18.4' }] },
    indices: [{ symbol: 'SPY', changePct: 0.4, series: [] }],
    vix: { series: [], events: [] },
    breadth: [],
};
// Match the card HEADINGS, not bare text: the face toggle's own title
// attribute mentions "Fear & Greed" too, and matching that made the first
// version of this suite report the gauge as visible on the workings face.
const FACES = ['Fear &amp; Greed', 'Major indices', 'Volatility track record', 'Market breadth'];
const heads = html => (html.match(/<h3[^>]*>(.*?)<\/h3>/g) || []).map(h => h.replace(/<[^>]+>/g, ''));
const shown = html => heads(html).filter(t => FACES.indexOf(t) !== -1);

// ── v1: untouched, every chart at once ────────────────────────
check('v1: all four charts render', shown(render(e(NexusBoardSection, { board: BOARD }))).sort(), FACES.slice().sort());
check('v1: no face control', render(e(NexusBoardSection, { board: BOARD })).includes('nfv2-face-head'), false);

// ── v2 composite: the score and its parts ─────────────────────
store.clear();
const comp = render(e(NexusBoardSection, { board: BOARD, v2: true }));
check('v2 composite: gauge + indices only', shown(comp).sort(), ['Fear &amp; Greed', 'Major indices']);
check('v2 composite: face control present', comp.includes('nfv2-face-head'), true);
check('v2 composite: inactive face carries the ⇄ affix', comp.includes('⇄ Workings'), true);

// ── v2 workings: the components drawn out ─────────────────────
store.set('atlas.nexus.board.face.v1', 'workings');
const work = render(e(NexusBoardSection, { board: BOARD, v2: true }));
check('v2 workings: components + indices', shown(work).sort(), ['Major indices', 'Market breadth', 'Volatility track record']);
check('v2 workings: indices stay in both faces', shown(work).indexOf('Major indices') !== -1, true);
check('v2 workings: gauge is NOT drawn', shown(work).indexOf('Fear &amp; Greed'), -1);

// ── Persistence, and its defensive read ───────────────────────
store.clear();
check('face: defaults to composite', loadFace('atlas.nexus.board.face.v1', [{ id: 'composite' }, { id: 'workings' }], 'composite'), 'composite');
saveFace('atlas.nexus.board.face.v1', 'workings');
check('face: choice survives a reload', loadFace('atlas.nexus.board.face.v1', [{ id: 'composite' }, { id: 'workings' }], 'composite'), 'workings');
store.set('atlas.nexus.board.face.v1', 'nonsense');
check('face: unknown stored value falls back', loadFace('atlas.nexus.board.face.v1', [{ id: 'composite' }, { id: 'workings' }], 'composite'), 'composite');

// ── The panel never fetches: the provider owns /api/nexus-board ──
const src = readFileSync(new URL('./NexusBoard.js', import.meta.url), 'utf8');
check('board panel contains no fetch', /\bfetch\s*\(/.test(src), false);

// ── Loading vs unavailable stay distinct through the flip ─────
check('undefined → loading', render(e(NexusBoardSection, { v2: true })).includes('Loading macro &amp; breadth'), true);
check('null → unavailable',  render(e(NexusBoardSection, { board: null, v2: true })).includes('board unavailable'), true);

console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll board-face checks passed');
process.exit(fails ? 1 : 0);
