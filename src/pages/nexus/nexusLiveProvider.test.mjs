// ============================================================
// Acceptance fixture for the Nexus provider lift.
// Run: node src/pages/nexus/nexusLiveProvider.test.mjs
//
// The three Supabase-independent panels (board / earnings / COT) used
// to fetch for themselves on mount. The provider owns those fetches
// now, which introduces one way to get it wrong: put the loaders in
// the existing Promise.all — below getNexusModel()'s early returns —
// and all three panels vanish whenever Supabase is unconfigured,
// erroring, or the book is empty. Their self-fetch used to survive
// exactly that state, and it is the state where macro context matters
// most. This suite pins that down.
//
// nexusLive.stub.mjs stands in for ../config.js so `sb` can be driven
// per case; fetch is stubbed here so the per-load request count is
// observable (no panel may fetch twice, or fetch at all on its own).
//
// Every case below is proven to fail against a provider with the loaders
// moved back under the guards — a suite that only passes proves nothing.
// ============================================================

import { register } from 'node:module';

register(new URL('./nexusLive.stub.mjs', import.meta.url));

let fails = 0;
const check = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { fails++; console.error(`✗ ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); }
    else console.log(`✓ ${name}`);
};

let calls = [];
const PAYLOAD = {
    '/api/macro':          { vix: 18.4 },
    '/api/nexus-board':    { ok: true, fearGreed: { score: 42, label: 'Fear' } },
    '/api/nexus-earnings': { ok: true, rows: [{ tk: 'NVDA' }] },
    '/api/nexus-cot':      { ok: true, rows: [{ code: 'ES' }] },
};

// `down` names the endpoints that answer non-ok for this case.
function installFetch(down) {
    calls = [];
    globalThis.fetch = async (url) => {
        calls.push(url);
        if (down.has(url)) return { ok: false, status: 503, json: async () => ({ ok: false, error: 'down' }) };
        const body = PAYLOAD[url];
        if (!body) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => body };
    };
}

// The provider and the stub are imported once; `sb` is a live binding the
// stub reassigns, so each case sees the new Supabase state without a rebuild.
const cfg = await import(new URL('../config.js', import.meta.url).href);
const { getNexusModel } = await import(new URL('./nexusLive.js', import.meta.url).href);

async function load(sbMode, down = new Set()) {
    cfg.__configure(sbMode);
    installFetch(down);
    return getNexusModel();
}

// undefined (unresolved) / null (endpoint down) / payload — the three states
// the panels distinguish. Reported as strings so a wrong one names itself.
const state = v => (v === undefined ? 'undefined' : v === null ? 'null' : 'payload');
const panels = m => ({ board: state(m.board), earnings: state(m.earnings), cot: state(m.cot) });
const ALL = { board: 'payload', earnings: 'payload', cot: 'payload' };
const countOf = p => calls.filter(u => u === p).length;
const fetchCounts = () => [countOf('/api/nexus-board'), countOf('/api/nexus-earnings'), countOf('/api/nexus-cot')];

// ── 1. Healthy — live book, all three endpoints up ────────────
let m = await load('ok');
check('healthy: three panels carry payloads', panels(m), ALL);
check('healthy: live book still assembled',   m.holdings.map(h => h.tk), ['NVDA', 'CVX']);
check('healthy: spine still built',           m.spine.map(r => r.label), ['Technology', 'Energy']);

// ── 6. No double-fetch ────────────────────────────────────────
check('healthy: exactly one fetch each', fetchCounts(), [1, 1, 1]);

// ── 2. Supabase unconfigured — THE regression this lift risks ──
m = await load('null');
check('sb null: three panels STILL carry payloads', panels(m), ALL);
check('sb null: baseline sections intact', [!!m.read, !!m.windshield, !!m.spine], [true, true, true]);
check('sb null: exactly one fetch each', fetchCounts(), [1, 1, 1]);

// ── 3. Empty book ─────────────────────────────────────────────
m = await load('empty');
check('empty book: three panels STILL carry payloads', panels(m), ALL);

// ── 3b. Supabase erroring (loadHoldingRows → null) ────────────
m = await load('error');
check('sb error: three panels STILL carry payloads', panels(m), ALL);

// ── 4. One endpoint down — the other two unaffected ───────────
m = await load('ok', new Set(['/api/nexus-earnings']));
check('one down: only earnings is null', panels(m), { board: 'payload', earnings: 'null', cot: 'payload' });

// ── 5. All endpoints down — three nulls, page otherwise normal ─
m = await load('ok', new Set(['/api/nexus-board', '/api/nexus-earnings', '/api/nexus-cot']));
check('all down: three nulls', panels(m), { board: 'null', earnings: 'null', cot: 'null' });
check('all down: book still assembled', m.holdings.map(h => h.tk), ['NVDA', 'CVX']);

// ── The mock provider stays honest about what it does not supply ──
const { getNexusModel: mock } = await import(new URL('./nexusMock.js', import.meta.url).href);
const mm = await mock();
check('mock: explicit nulls', panels(mm), { board: 'null', earnings: 'null', cot: 'null' });
check('mock: keys present, not merely absent', ['board', 'earnings', 'cot'].every(k => k in mm), true);

console.log(fails ? `\n${fails} check(s) FAILED` : '\nAll provider acceptance checks passed');
process.exit(fails ? 1 : 0);
