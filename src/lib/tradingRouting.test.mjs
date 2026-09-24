// MP-3: api/trading.js routes ACCOUNT actions to the chosen portfolio's own
// broker account -- resolved server-side, behind an identity gate -- and
// refuses anything it cannot resolve BEFORE the broker is contacted.
//
// Runs the real handler. Supabase (PostgREST) and Alpaca are both stubbed at
// `fetch`, so every request the handler makes is observed: which host, which
// key pair, which path. This file runs in its own process (node --test), so
// the env set below is this handler's whole world.

import test from 'node:test';
import assert from 'node:assert/strict';

const SB = 'https://atlas-test.supabase.co';
process.env.ATLAS_SUPABASE_URL = SB;
process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
process.env.ALPACA_API_KEY = 'PRIMARY-KEY';
process.env.ALPACA_API_SECRET = 'PRIMARY-SECRET';
process.env.ATLAS_ALPACA_API_KEY = 'SECONDARY-KEY';
process.env.ATLAS_ALPACA_API_SECRET = 'SECONDARY-SECRET';

const SECONDARY = '6844aec5-43c5-4d9b-96ed-d3cd1372cd37';
const UNKEYED = '11111111-1111-1111-1111-111111111111';

const PORTFOLIOS = {
    [SECONDARY]: { id: SECONDARY, broker_accounts: { credential_prefix: 'ATLAS_ALPACA_API', alpaca_account_number: 'PA345SGOX9LY', is_paper: true } },
    [UNKEYED]:   { id: UNKEYED,   broker_accounts: { credential_prefix: 'NOT_CONFIGURED',  alpaca_account_number: 'PA000000000', is_paper: true } },
};

let calls = [];
let accountNumberFor = {};   // key id -> what /v2/account reports

globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    // supabase-js hands a Headers instance
    if (init.headers && typeof init.headers.forEach === 'function') init.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
    calls.push({ url: u, method: init.method || 'GET', key: h['apca-api-key-id'] || null, body: init.body || null });
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

    if (u.startsWith(SB + '/rest/v1/portfolios')) {
        const id = decodeURIComponent((u.match(/id=eq\.([^&]+)/) || [])[1] || '');
        const row = PORTFOLIOS[id] || null;
        const wantsObject = /vnd\.pgrst\.object/.test(h.accept || '');
        return wantsObject ? (row ? json(row) : json({ message: 'no rows' }, 406)) : json(row ? [row] : []);
    }
    if (u.startsWith(SB + '/rest/v1/orders')) return json({ id: 42 });
    if (u.startsWith(SB + '/rest/v1/decisions')) return json([]);
    if (/alpaca\.markets\/v2\/account$/.test(u)) return json({ account_number: accountNumberFor[h['apca-api-key-id']], equity: '1000', last_equity: '1000' });
    if (/alpaca\.markets\/v2\/orders$/.test(u) && init.method === 'POST') return json({ id: 'ord-1', status: 'accepted', symbol: 'AAPL', qty: '1', side: 'buy', order_type: 'market' });
    throw new Error('unexpected fetch ' + u);
};

const { default: handler } = await import('../../api/trading.js');

async function call(method, query, body) {
    let status = null, out = null;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(b) { out = b; return this; }, end() { return this; } };
    await handler({ method, query, body, headers: {} }, res);
    return { status, body: out };
}
const brokerCalls = () => calls.filter(c => /alpaca\.markets/.test(c.url));
const reset = (map) => { calls = []; accountNumberFor = map; };

test('an order for Secondary executes with SECONDARY keys, after a fresh identity check, and is recorded against it', async () => {
    reset({ 'SECONDARY-KEY': 'PA345SGOX9LY', 'PRIMARY-KEY': 'PA39BDB08Y3X' });
    const r = await call('POST', { action: 'order', portfolio: SECONDARY }, { symbol: 'AAPL', qty: 1, side: 'buy', client_order_id: 'c1' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const b = brokerCalls();
    assert.ok(b.length >= 2);
    assert.ok(b.every(c => c.key === 'SECONDARY-KEY'), 'every broker call used the Secondary pair');
    assert.ok(/\/v2\/account$/.test(b[0].url), 'identity checked BEFORE the order');
    assert.ok(/\/v2\/orders$/.test(b[1].url) && b[1].method === 'POST');
    const rec = calls.find(c => c.url.startsWith(SB + '/rest/v1/orders'));
    assert.ok(rec && JSON.parse(rec.body).portfolio_id === SECONDARY, 'the audit row names the account that executed it');
});

test('IDENTITY MISMATCH: keys that report another account send NOTHING to /orders', async () => {
    // The Secondary prefix now resolves to keys that belong to the Primary account.
    reset({ 'SECONDARY-KEY': 'PA39BDB08Y3X' });
    const r = await call('POST', { action: 'order', portfolio: SECONDARY }, { symbol: 'AAPL', qty: 1, side: 'buy' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'account_not_routed');
    assert.match(r.body.detail, /IDENTITY MISMATCH/);
    assert.equal(brokerCalls().filter(c => /\/orders/.test(c.url)).length, 0);
});

test('a portfolio whose key pair is not configured is refused with no broker call at all', async () => {
    reset({});
    const r = await call('GET', { action: 'account', portfolio: UNKEYED });
    assert.equal(r.status, 409);
    assert.match(r.body.detail, /NOT_CONFIGURED_KEY/);
    assert.equal(brokerCalls().length, 0);
});

test('an unknown portfolio is refused, never answered from the default account', async () => {
    reset({ 'PRIMARY-KEY': 'PA39BDB08Y3X' });
    const r = await call('GET', { action: 'account', portfolio: '22222222-2222-2222-2222-222222222222' });
    assert.equal(r.status, 409);
    assert.equal(brokerCalls().length, 0);
});

test('no ?portfolio= is the default account, unchanged: default keys, no lookup, no identity round trip', async () => {
    reset({ 'PRIMARY-KEY': 'PA39BDB08Y3X' });
    const r = await call('GET', { action: 'account' });
    assert.equal(r.status, 200);
    assert.equal(calls.filter(c => c.url.startsWith(SB)).length, 0, 'no Supabase lookup on the default path');
    const b = brokerCalls();
    assert.equal(b.length, 1);
    assert.equal(b[0].key, 'PRIMARY-KEY');
});
