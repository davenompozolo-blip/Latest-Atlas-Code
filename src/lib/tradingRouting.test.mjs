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
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test';
process.env.CRON_SECRET = 'cron-test';
process.env.ALPACA_API_KEY = 'PRIMARY-KEY';
process.env.ALPACA_API_SECRET = 'PRIMARY-SECRET';
process.env.ATLAS_ALPACA_API_KEY = 'SECONDARY-KEY';
process.env.ATLAS_ALPACA_API_SECRET = 'SECONDARY-SECRET';

const SECONDARY = '6844aec5-43c5-4d9b-96ed-d3cd1372cd37';
const UNKEYED = '11111111-1111-1111-1111-111111111111';
const TERTIARY = '04d55592-90a4-46e6-b363-879ab2af6e79';   // VC-1: Vault only, no env prefix
const PRIMARY = 'e11b0e63-8edf-48b4-a57f-583f24c0a1c8';

// AUTH-2: who is signed in, and what they are a member of.
const USER_TOKEN = 'user-token';
const USER_ID = 'u-1';
let MEMBERS = {};          // portfolio id -> role, for USER_ID
const ALL_OWNER = () => ({ [PRIMARY]: 'owner', [SECONDARY]: 'owner', [UNKEYED]: 'owner', [TERTIARY]: 'owner' });

const PORTFOLIOS = {
    [PRIMARY]:   { id: PRIMARY,   broker_accounts: { id: 'ba-primary',   credential_prefix: 'ALPACA_API',      alpaca_account_number: 'PA39BDB08Y3X', is_paper: true } },
    [SECONDARY]: { id: SECONDARY, broker_accounts: { id: 'ba-secondary', credential_prefix: 'ATLAS_ALPACA_API', alpaca_account_number: 'PA345SGOX9LY', is_paper: true } },
    [UNKEYED]:   { id: UNKEYED,   broker_accounts: { id: 'ba-unkeyed',   credential_prefix: 'NOT_CONFIGURED',  alpaca_account_number: 'PA000000000', is_paper: true } },
    [TERTIARY]:  { id: TERTIARY,  broker_accounts: { id: 'ba-tertiary',  credential_prefix: null,              alpaca_account_number: 'PA3NQO9O03E8', is_paper: true } },
};

// VC-1: what atlas_broker_credentials returns per broker account id. Each test
// sets it; an account absent from the map has nothing in Vault.
let VAULT = {};

let calls = [];
let accountNumberFor = {};   // key id -> what /v2/account reports

globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    // supabase-js hands a Headers instance
    if (init.headers && typeof init.headers.forEach === 'function') init.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
    calls.push({ url: u, method: init.method || 'GET', key: h['apca-api-key-id'] || null, body: init.body || null });
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

    if (u.startsWith(SB + '/auth/v1/user')) {
        return h.authorization === 'Bearer ' + USER_TOKEN ? json({ id: USER_ID, email: 'test@example.invalid' }) : json({ msg: 'invalid' }, 401);
    }
    if (u.startsWith(SB + '/rest/v1/portfolio_members')) {
        const pid = decodeURIComponent((u.match(/portfolio_id=eq\.([^&]+)/) || [])[1] || '');
        const uid = decodeURIComponent((u.match(/user_id=eq\.([^&]+)/) || [])[1] || '');
        const role = uid === USER_ID ? MEMBERS[pid] : null;
        const wantsObject = /vnd\.pgrst\.object/.test(h.accept || '');
        return wantsObject ? (role ? json({ role }) : json({ message: 'no rows' }, 406)) : json(role ? [{ role }] : []);
    }
    if (u.startsWith(SB + '/rest/v1/rpc/atlas_active_portfolio')) {
        return h.authorization === 'Bearer ' + USER_TOKEN ? json(PRIMARY) : json({ message: 'denied' }, 401);
    }
    if (u.startsWith(SB + '/rest/v1/portfolios')) {
        const id = decodeURIComponent((u.match(/id=eq\.([^&]+)/) || [])[1] || '');
        const row = PORTFOLIOS[id] || null;
        const wantsObject = /vnd\.pgrst\.object/.test(h.accept || '');
        return wantsObject ? (row ? json(row) : json({ message: 'no rows' }, 406)) : json(row ? [row] : []);
    }
    if (u.startsWith(SB + '/rest/v1/rpc/atlas_broker_credentials')) {
        const id = JSON.parse(init.body || '{}').p_broker_account_id;
        return json(VAULT[id] ? [VAULT[id]] : []);
    }
    if (u.startsWith(SB + '/rest/v1/orders')) return json({ id: 42 });
    if (u.startsWith(SB + '/rest/v1/decisions')) return json([]);
    if (/alpaca\.markets\/v2\/account$/.test(u)) return json({ account_number: accountNumberFor[h['apca-api-key-id']], equity: '1000', last_equity: '1000' });
    if (/alpaca\.markets\/v2\/orders$/.test(u) && init.method === 'POST') return json({ id: 'ord-1', status: 'accepted', symbol: 'AAPL', qty: '1', side: 'buy', order_type: 'market' });
    throw new Error('unexpected fetch ' + u);
};

const { default: handler } = await import('../../api/trading.js');

async function call(method, query, body, token = USER_TOKEN) {
    let status = null, out = null;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(b) { out = b; return this; }, end() { return this; } };
    await handler({ method, query, body, headers: token ? { authorization: 'Bearer ' + token } : {} }, res);
    return { status, body: out };
}
const brokerCalls = () => calls.filter(c => /alpaca\.markets/.test(c.url));
const reset = (map, vault = {}, members = ALL_OWNER()) => { calls = []; accountNumberFor = map; VAULT = vault; MEMBERS = members; };

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

test('no ?portfolio= is the USER\'s default portfolio, behind the identity gate -- not the deployment default', async () => {
    reset({ 'PRIMARY-KEY': 'PA39BDB08Y3X' });
    const r = await call('GET', { action: 'account' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(calls.some(c => c.url.includes('/rpc/atlas_active_portfolio')), 'the database resolved which portfolio');
    assert.ok(calls.some(c => c.url.includes('/portfolio_members')), 'membership was checked');
    const b = brokerCalls();
    assert.ok(b.every(c => c.key === 'PRIMARY-KEY'));
});

// ── AUTH-2: who may call at all ──────────────────────────────────────────────

test('no session: 401 and nothing contacted -- not the broker, not the database', async () => {
    reset({ 'PRIMARY-KEY': 'PA39BDB08Y3X' });
    for (const q of [{ action: 'account' }, { action: 'quote', symbol: 'AAPL' }]) {
        const r = await call('GET', q, undefined, null);
        assert.equal(r.status, 401);
    }
    const r2 = await call('POST', { action: 'order', portfolio: SECONDARY }, { symbol: 'AAPL', qty: 1, side: 'buy' }, null);
    assert.equal(r2.status, 401);
    assert.equal(calls.length, 0);
});

test('a token Supabase Auth does not recognise is refused before any broker call', async () => {
    reset({ 'PRIMARY-KEY': 'PA39BDB08Y3X' });
    const r = await call('POST', { action: 'order', portfolio: SECONDARY }, { symbol: 'AAPL', qty: 1, side: 'buy' }, 'forged-token');
    assert.equal(r.status, 401);
    assert.equal(brokerCalls().length, 0);
});

test('the cron secret cannot trade: this route is for signed-in users only', async () => {
    reset({ 'SECONDARY-KEY': 'PA345SGOX9LY' });
    const r = await call('POST', { action: 'order', portfolio: SECONDARY }, { symbol: 'AAPL', qty: 1, side: 'buy' }, 'cron-test');
    assert.equal(r.status, 401);
    assert.equal(brokerCalls().length, 0);
});

test('a portfolio the user is not a member of is refused, with no broker call', async () => {
    reset({ 'SECONDARY-KEY': 'PA345SGOX9LY' }, {}, { [PRIMARY]: 'owner' });
    const r = await call('GET', { action: 'account', portfolio: SECONDARY });
    assert.equal(r.status, 409);
    assert.match(r.body.detail, /not a member/);
    assert.equal(brokerCalls().length, 0);
});

test('a viewer can read the account but cannot place an order', async () => {
    reset({ 'SECONDARY-KEY': 'PA345SGOX9LY' }, {}, { [SECONDARY]: 'viewer' });
    const read = await call('GET', { action: 'account', portfolio: SECONDARY });
    assert.equal(read.status, 200, JSON.stringify(read.body));
    calls = [];
    const r = await call('POST', { action: 'order', portfolio: SECONDARY }, { symbol: 'AAPL', qty: 1, side: 'buy' });
    assert.equal(r.status, 409);
    assert.match(r.body.detail, /owner/);
    assert.equal(brokerCalls().filter(c => /\/orders/.test(c.url)).length, 0);
});

// ── VC-1: credentials from Vault ─────────────────────────────────────────────

test('a Vault-only account (no env prefix) trades with its Vault pair after an identity check', async () => {
    reset({ 'TERTIARY-VAULT-KEY': 'PA3NQO9O03E8' },
          { 'ba-tertiary': { key_id: 'TERTIARY-VAULT-KEY', secret_key: 'TERTIARY-VAULT-SECRET' } });
    const r = await call('POST', { action: 'order', portfolio: TERTIARY }, { symbol: 'AAPL', qty: 1, side: 'buy' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const b = brokerCalls();
    assert.ok(b.length >= 2 && b.every(c => c.key === 'TERTIARY-VAULT-KEY'));
    assert.ok(/\/v2\/account$/.test(b[0].url), 'identity checked BEFORE the order');
});

test('Vault wins over the env pair when both exist', async () => {
    reset({ 'SECONDARY-VAULT-KEY': 'PA345SGOX9LY', 'SECONDARY-KEY': 'PA345SGOX9LY' },
          { 'ba-secondary': { key_id: 'SECONDARY-VAULT-KEY', secret_key: 'S' } });
    const r = await call('POST', { action: 'order', portfolio: SECONDARY }, { symbol: 'AAPL', qty: 1, side: 'buy' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(brokerCalls().every(c => c.key === 'SECONDARY-VAULT-KEY'), 'the env pair was not used');
});

test('a Vault pair that reports another account sends NOTHING to /orders', async () => {
    reset({ 'WRONG-VAULT-KEY': 'PA39BDB08Y3X' },
          { 'ba-tertiary': { key_id: 'WRONG-VAULT-KEY', secret_key: 'S' } });
    const r = await call('POST', { action: 'order', portfolio: TERTIARY }, { symbol: 'AAPL', qty: 1, side: 'buy' });
    assert.equal(r.status, 409);
    assert.match(r.body.detail, /IDENTITY MISMATCH/);
    assert.equal(brokerCalls().filter(c => /\/orders/.test(c.url)).length, 0);
});

test('an account with no Vault pair and no prefix is refused with no broker call', async () => {
    reset({});
    const r = await call('GET', { action: 'account', portfolio: TERTIARY });
    assert.equal(r.status, 409);
    assert.match(r.body.detail, /none in Vault/);
    assert.equal(brokerCalls().length, 0);
});

test('a pair rotated in Vault inside the cache TTL is re-verified, not carried by the old pair\'s check', async () => {
    reset({ 'GOOD-VAULT-KEY': 'PA3NQO9O03E8', 'ROTATED-VAULT-KEY': 'PA39BDB08Y3X' },
          { 'ba-tertiary': { key_id: 'GOOD-VAULT-KEY', secret_key: 'S1' } });
    const first = await call('GET', { action: 'account', portfolio: TERTIARY });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    // Same account id, same registered number -- only the pair behind it changed.
    VAULT = { 'ba-tertiary': { key_id: 'ROTATED-VAULT-KEY', secret_key: 'S2' } };
    calls = [];
    const r = await call('GET', { action: 'account', portfolio: TERTIARY });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.match(r.body.detail, /IDENTITY MISMATCH/);
});

test('an unchanged pair inside the TTL is not re-verified on a read', async () => {
    reset({ 'STEADY-VAULT-KEY': 'PA3NQO9O03E8' },
          { 'ba-tertiary': { key_id: 'STEADY-VAULT-KEY', secret_key: 'S' } });
    await call('GET', { action: 'account', portfolio: TERTIARY });
    calls = [];
    const r = await call('GET', { action: 'account', portfolio: TERTIARY });
    assert.equal(r.status, 200);
    assert.equal(brokerCalls().filter(c => /\/v2\/account$/.test(c.url)).length, 1, 'one call: the read itself, no identity round trip');
});
