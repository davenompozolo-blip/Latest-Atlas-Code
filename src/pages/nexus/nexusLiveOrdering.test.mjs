// ============================================================
// Acceptance fixture for the Nexus provider's FETCH ORDERING.
// Run: node src/pages/nexus/nexusLiveOrdering.test.mjs
//
// nexusLiveProvider.test.mjs pins WHAT the provider returns on every
// Supabase state. It is ordering-blind by construction: it stubs fetch
// to resolve instantly, so a provider that blocks the whole book on
// three network round-trips and one that overlaps them are identical
// to it. Both pass. That gap is what this file closes.
//
// The property: board / earnings / COT feed nothing downstream, so the
// holdings query must be ISSUED without waiting for them. Awaited up
// front they put the slowest of the three on the critical path ahead of
// the book — measured cold on production at 2.6s (board) and 3.0s
// (earnings) before the first Supabase query was even sent.
//
// Ordering is observed, not timed. A sleep-based test would pass on a
// fast machine and flake on a slow one; the interleaving of "fetch
// issued" and "table read issued" is exact and machine-independent.
// The panel fetches here resolve on a deferred promise the test holds
// open, so a provider that awaits them CANNOT reach the holdings query,
// which is the failure this suite is built to catch.
// ============================================================

import { register } from 'node:module';

register(new URL('./nexusLiveOrdering.stub.mjs', import.meta.url));

let fails = 0;
const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};

const PANELS = ['/api/nexus-board', '/api/nexus-earnings', '/api/nexus-cot'];
const PAYLOAD = {
    '/api/macro':          { vix: 18.4 },
    '/api/nexus-board':    { ok: true, fearGreed: { score: 42, label: 'Fear' } },
    '/api/nexus-earnings': { ok: true, rows: [{ tk: 'NVDA' }] },
    '/api/nexus-cot':      { ok: true, rows: [{ code: 'ES' }] },
};

// The three panel endpoints hang until release() is called. Everything
// else answers immediately.
let release;
const gate = new Promise(res => { release = res; });

globalThis.__ORDER = [];
globalThis.fetch = async (url) => {
    globalThis.__ORDER.push('fetch:' + url);
    const body = PAYLOAD[url];
    if (PANELS.indexOf(url) !== -1) await gate;
    if (!body) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
};

const cfg = await import(new URL('../config.js', import.meta.url).href);
const { getNexusModel } = await import(new URL('./nexusLive.js', import.meta.url).href);

cfg.__configure('ok');
const pending = getNexusModel();

// Yield generously. A correct provider issues its panel fetches and then
// runs the whole Supabase path to completion while they are still open;
// one that awaits them stalls at the three and never reaches the book.
for (let i = 0; i < 200; i++) await Promise.resolve();
await new Promise(r => setTimeout(r, 50));

const beforeRelease = globalThis.__ORDER.slice();
const issued = p => beforeRelease.indexOf(p) !== -1;

check('all three panel fetches issued before any release',
    PANELS.map(p => issued('fetch:' + p)), [true, true, true]);

// The load-bearing assertion. With the panel fetches still unresolved,
// the holdings query must already have gone out.
check('holdings query issued while panel fetches are still open',
    issued('sb:vw_nexus_holdings'), true);

// And the rest of the book's work too — not merely the first query.
check('downstream loads issued too (composites)',
    issued('sb:valuation_health'), true);

// Now let the panels answer and confirm the model still assembles correctly,
// so the overlap did not come at the cost of the contract the other suite pins.
release();
const m = await pending;

const state = v => (v === undefined ? 'undefined' : v === null ? 'null' : 'payload');
check('model still carries all three panels',
    { board: state(m.board), earnings: state(m.earnings), cot: state(m.cot) },
    { board: 'payload', earnings: 'payload', cot: 'payload' });
check('live book still assembled', m.holdings.map(h => h.tk), ['NVDA', 'CVX']);

// Exactly one call each — the promises are reused at each assembly point,
// never re-invoked.
const countOf = p => globalThis.__ORDER.filter(u => u === 'fetch:' + p).length;
check('exactly one fetch each', PANELS.map(countOf), [1, 1, 1]);

console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll ordering acceptance checks passed');
process.exit(fails ? 1 : 0);
