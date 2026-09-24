// MP-2: the portfolio choice. The database decides what an id means; these
// tests pin what the client may carry and what the switcher may claim.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    STORAGE_KEY, PORTFOLIO_HEADER, isPortfolioId, readStoredPortfolio,
    writeStoredPortfolio, portfolioHeaders, withPortfolio, switcherState,
} from './activePortfolio.js';

const PRIMARY = 'e11b0e63-8edf-48b4-a57f-583f24c0a1c8';
const SECONDARY = '6844aec5-43c5-4d9b-96ed-d3cd1372cd37';

function memStorage(init = {}) {
    const m = new Map(Object.entries(init));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        _m: m,
    };
}
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };

test('only a UUID is a portfolio id', () => {
    assert.equal(isPortfolioId(SECONDARY), true);
    assert.equal(isPortfolioId(SECONDARY.toUpperCase()), true);
    for (const v of [null, undefined, '', 'default', 'not-a-uuid', SECONDARY + 'x', "' or 1=1 --", 42]) {
        assert.equal(isPortfolioId(v), false, String(v));
    }
});

test('a stored choice round-trips, lowercased; garbage reads as no choice', () => {
    const s = memStorage();
    assert.equal(writeStoredPortfolio(SECONDARY.toUpperCase(), s), true);
    assert.equal(readStoredPortfolio(s), SECONDARY);
    assert.equal(readStoredPortfolio(memStorage({ [STORAGE_KEY]: 'garbage' })), null);
});

test('choosing the default (null) CLEARS the choice rather than storing an id', () => {
    const s = memStorage({ [STORAGE_KEY]: SECONDARY });
    writeStoredPortfolio(null, s);
    assert.equal(s._m.has(STORAGE_KEY), false);
    assert.equal(readStoredPortfolio(s), null);
});

test('storage that throws or is absent is "no choice", never an error', () => {
    assert.equal(readStoredPortfolio(throwing), null);
    assert.equal(readStoredPortfolio(null), null);
    assert.equal(writeStoredPortfolio(SECONDARY, throwing), false);
    assert.equal(writeStoredPortfolio(SECONDARY, null), false);
});

test('no choice sends NO header, so the server resolves the default (pre-MP-2 behaviour)', () => {
    assert.deepEqual(portfolioHeaders(null), {});
    assert.deepEqual(portfolioHeaders('not-a-uuid'), {});
    assert.deepEqual(portfolioHeaders(SECONDARY), { [PORTFOLIO_HEADER]: SECONDARY });
});

test('API URLs carry the choice as a query param (the CDN cache key), and only a valid one', () => {
    assert.equal(withPortfolio('/api/nexus-bench', null), '/api/nexus-bench');
    assert.equal(withPortfolio('/api/nexus-bench', 'junk'), '/api/nexus-bench');
    assert.equal(withPortfolio('/api/nexus-bench', SECONDARY), '/api/nexus-bench?portfolio=' + SECONDARY);
    assert.equal(withPortfolio('/api/x?a=1', SECONDARY), '/api/x?a=1&portfolio=' + SECONDARY);
    // Two accounts must never share a cache key.
    assert.notEqual(withPortfolio('/api/nexus-theme', PRIMARY), withPortfolio('/api/nexus-theme', SECONDARY));
});

const ROWS = [
    { id: PRIMARY, name: 'Alpaca Primary Account', is_default: true, is_active: false },
    { id: SECONDARY, name: 'Atlas Secondary', is_default: false, is_active: true },
];

test('the switcher shows what the SERVER resolved, not what the client chose', () => {
    const st = switcherState(ROWS, SECONDARY);
    assert.equal(st.active.id, SECONDARY);
    assert.equal(st.onDefault, false);
    assert.equal(st.mismatch, false);
});

test('a stale choice the server did not honour is a MISMATCH, never displayed under the chosen name', () => {
    // Stored id names a portfolio that no longer exists: server fell back to Primary.
    const fellBack = ROWS.map((r) => ({ ...r, is_active: r.id === PRIMARY }));
    const st = switcherState(fellBack, '00000000-0000-0000-0000-000000000000');
    assert.equal(st.active.id, PRIMARY);
    assert.equal(st.onDefault, true);
    assert.equal(st.mismatch, true);
});

test('no rows (feed failed) claims nothing: no active account, onDefault unknown', () => {
    for (const rows of [null, undefined, [], [{ id: 'junk', is_active: true }]]) {
        const st = switcherState(rows, SECONDARY);
        assert.equal(st.active, null);
        assert.equal(st.onDefault, null, 'unknown is not "false" -- the banner must not claim a book it cannot see');
        assert.equal(st.mismatch, false);
    }
});

// ── Fail-closed /api tagging ──────────────────────────────────────────────
import { tagApiUrl, installApiPortfolioTagging } from './activePortfolio.js';

const ORIGIN = 'https://atlas.example.app';

test('same-origin /api/* is tagged; Supabase, third parties and non-API paths are not', () => {
    assert.equal(tagApiUrl('/api/trading?action=order', SECONDARY, ORIGIN), '/api/trading?action=order&portfolio=' + SECONDARY);
    assert.equal(tagApiUrl(ORIGIN + '/api/trading?action=account', SECONDARY, ORIGIN), ORIGIN + '/api/trading?action=account&portfolio=' + SECONDARY);
    for (const u of ['https://vdmojjszvvcithuxwexx.supabase.co/rest/v1/positions', 'https://evil.example/api/trading', '/assets/x.js', 'api/trading']) {
        assert.equal(tagApiUrl(u, SECONDARY, ORIGIN), u, u);
    }
    // Already tagged (withPortfolio at the call site): never double-tagged.
    const once = '/api/nexus-bench?portfolio=' + SECONDARY;
    assert.equal(tagApiUrl(once, SECONDARY, ORIGIN), once);
    // The default account: nothing tagged.
    assert.equal(tagApiUrl('/api/trading?action=order', null, ORIGIN), '/api/trading?action=order');
});

test('installed tagging reaches an ORDER POST no call site remembered to tag', async () => {
    const seen = [];
    const win = { location: { origin: ORIGIN }, fetch: async (input) => { seen.push(typeof input === 'string' ? input : input.url || input.href); return { ok: true }; } };
    assert.equal(installApiPortfolioTagging(win, SECONDARY), true);
    await win.fetch('/api/trading?action=order', { method: 'POST', body: '{}' });
    await win.fetch('https://vdmojjszvvcithuxwexx.supabase.co/rest/v1/vw_positions_current');
    assert.equal(seen[0], '/api/trading?action=order&portfolio=' + SECONDARY);
    assert.equal(seen[1], 'https://vdmojjszvvcithuxwexx.supabase.co/rest/v1/vw_positions_current');
    // Idempotent: a second install does not wrap twice.
    installApiPortfolioTagging(win, SECONDARY);
    await win.fetch('/api/x');
    assert.equal(seen[2], '/api/x?portfolio=' + SECONDARY);
});

test('on the default account nothing is installed: requests are exactly as before MP-2', () => {
    const f = async () => {};
    const win = { location: { origin: ORIGIN }, fetch: f };
    assert.equal(installApiPortfolioTagging(win, null), false);
    assert.equal(win.fetch, f);
});

// MP-3 routes these to the chosen account; with no way to RESOLVE it (here:
// no Supabase service key in this process) every one must still be refused
// before the broker is contacted. tradingRouting.test.mjs covers the routed path.
test('api/trading refuses every ACCOUNT action it cannot route, before touching the broker', async () => {
    const { default: handler } = await import('../../api/trading.js');
    const realFetch = globalThis.fetch;
    let brokerCalls = 0;
    globalThis.fetch = async () => { brokerCalls += 1; throw new Error('broker must not be called'); };
    try {
        for (const [method, action] of [['POST', 'order'], ['GET', 'account'], ['GET', 'orders'], ['GET', 'order_status']]) {
            let status = null, body = null;
            const res = {
                setHeader() {}, status(s) { status = s; return this; },
                json(b) { body = b; return this; }, end() { return this; },
            };
            await handler({ method, query: { action, portfolio: SECONDARY, client_order_id: 'x' }, body: { symbol: 'AAPL', qty: 1, side: 'buy' }, headers: {} }, res);
            assert.equal(status, 409, action);
            assert.equal(body.error, 'account_not_routed', action);
        }
        assert.equal(brokerCalls, 0, 'no request may reach Alpaca');
    } finally {
        globalThis.fetch = realFetch;
    }
});
