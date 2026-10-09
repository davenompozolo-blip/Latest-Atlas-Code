// VC-1: api/broker-accounts.js registers an account and adopts env key pairs
// into Vault. Runs the real handler with Supabase and Alpaca stubbed at fetch.
// Own process (node --test), so the env below is this handler's whole world.

import test from 'node:test';
import assert from 'node:assert/strict';

const SB = 'https://atlas-test.supabase.co';
process.env.ATLAS_SUPABASE_URL = SB;
process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
process.env.ALPACA_API_KEY = 'PRIMARY-KEY';
process.env.ALPACA_API_SECRET = 'PRIMARY-SECRET';
process.env.ATLAS_ALPACA_API_KEY = 'SECONDARY-KEY';
process.env.ATLAS_ALPACA_API_SECRET = 'SECONDARY-SECRET';

let calls, accountFor, vault, brokerRows, registerResult;
function reset() {
    calls = [];
    accountFor = {};          // key id -> account number /v2/account reports (absent = 401)
    vault = {};               // broker account id -> pair
    brokerRows = [];
    registerResult = { status: 200, body: 'new-portfolio-id' };
}
reset();

globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, key: h['apca-api-key-id'] || null, body });
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

    if (/alpaca\.markets\/v2\/account$/.test(u)) {
        const n = accountFor[h['apca-api-key-id']];
        return n ? json({ account_number: n, status: 'ACTIVE' }) : json({ message: 'forbidden' }, 401);
    }
    if (u.startsWith(SB + '/rest/v1/rpc/atlas_register_broker_account')) {
        // A body that stalls: headers arrive, then the read is aborted by the timeout.
        if (registerResult.stallBody) return { ok: true, status: 200, text: () => Promise.reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })) };
        return json(registerResult.body, registerResult.status);
    }
    if (u.startsWith(SB + '/rest/v1/rpc/atlas_broker_credentials')) return json(vault[body.p_broker_account_id] ? [vault[body.p_broker_account_id]] : []);
    if (u.startsWith(SB + '/rest/v1/rpc/atlas_store_broker_credentials')) { vault[body.p_broker_account_id] = { key_id: body.p_key_id }; return json(null); }
    if (u.startsWith(SB + '/rest/v1/broker_accounts')) return json(brokerRows);
    if (u.startsWith(SB + '/functions/v1/')) return json({ ok: true });
    throw new Error('unexpected fetch ' + u);
};

const { default: handler } = await import('../../server/api/broker-accounts.js');

async function call(action, body, auth = 'Bearer admin-secret') {
    let status = null, out = null;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(b) { out = b; return this; } };
    await handler({ method: 'POST', query: { action }, body, headers: { authorization: auth } }, res);
    return { status, body: out };
}
const rpcCalls = (fn) => calls.filter(c => c.url.includes('/rpc/' + fn));

test('fails CLOSED when CRON_SECRET is unset -- a credentials route is never open by default', async () => {
    reset();
    delete process.env.CRON_SECRET;
    const r = await call('register', { name: 'X', key_id: 'K', secret_key: 'S' });
    // AUTH-2: the shared guard refuses first (401: no secret configured means no
    // bearer can match). Either refusal is fail-closed; what matters is that
    // nothing is contacted.
    assert.ok(r.status === 401 || r.status === 503, 'refused, got ' + r.status);
    assert.equal(calls.length, 0);
});

test('a wrong bearer is refused before anything is contacted', async () => {
    reset();
    process.env.CRON_SECRET = 'admin-secret';
    const r = await call('register', { name: 'X', key_id: 'K', secret_key: 'S' }, 'Bearer nope');
    assert.equal(r.status, 401);
    assert.equal(calls.length, 0);
});

test('register takes the account number from the BROKER, not the request, and starts the first syncs', async () => {
    reset();
    accountFor = { 'NEW-KEY': 'PA4NEWACCT01' };
    const r = await call('register', { name: 'Atlas Four', key_id: 'NEW-KEY', secret_key: 'NEW-SECRET', account_number: 'PA39BDB08Y3X' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const reg = rpcCalls('atlas_register_broker_account');
    assert.equal(reg.length, 1);
    assert.equal(reg[0].body.p_account_number, 'PA4NEWACCT01', 'the typed account number was ignored');
    assert.equal(reg[0].body.p_is_paper, true);
    assert.equal(r.body.portfolio_id, 'new-portfolio-id');
    assert.equal(calls.filter(c => c.url.includes('/functions/v1/')).length, 3);
    const hist = calls.find(c => c.url.endsWith('/functions/v1/sync_portfolio_history'));
    assert.equal(hist.body.portfolio_id, 'new-portfolio-id');
});

test('keys the broker rejects are never stored', async () => {
    reset();
    const r = await call('register', { name: 'Atlas Four', key_id: 'BAD', secret_key: 'BAD' });
    assert.equal(r.status, 422);
    assert.equal(rpcCalls('atlas_register_broker_account').length, 0);
});

test('an already-registered account answers 409', async () => {
    reset();
    accountFor = { 'DUP-KEY': 'PA345SGOX9LY' };
    registerResult = { status: 409, body: { code: '23505', message: 'account PA345SGOX9LY is already registered' } };
    const r = await call('register', { name: 'Dup', key_id: 'DUP-KEY', secret_key: 'S' });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'already_registered');
});

test('no response ever carries a key', async () => {
    reset();
    accountFor = { 'NEW-KEY': 'PA4NEWACCT01' };
    const r = await call('register', { name: 'Atlas Four', key_id: 'NEW-KEY', secret_key: 'NEW-SECRET' });
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes('NEW-KEY') && !text.includes('NEW-SECRET'));
});

test('adopt_env stores a verified env pair, skips one already in Vault, and refuses a mismatch', async () => {
    reset();
    brokerRows = [
        { id: 'ba-primary',   credential_prefix: 'ALPACA_API',       alpaca_account_number: 'PA39BDB08Y3X', is_paper: true },
        { id: 'ba-secondary', credential_prefix: 'ATLAS_ALPACA_API', alpaca_account_number: 'PA345SGOX9LY', is_paper: true },
        { id: 'ba-missing',   credential_prefix: 'NOT_SET',          alpaca_account_number: 'PA000000001',  is_paper: true },
        { id: 'ba-vaulted',   credential_prefix: 'ALPACA_API',       alpaca_account_number: 'PA000000002',  is_paper: true },
    ];
    vault = { 'ba-vaulted': { key_id: 'X', secret_key: 'Y' } };
    // Primary's env pair is right; the Secondary prefix holds keys for ANOTHER account.
    accountFor = { 'PRIMARY-KEY': 'PA39BDB08Y3X', 'SECONDARY-KEY': 'PA39BDB08Y3X' };
    const r = await call('adopt_env', {});
    const by = Object.fromEntries(r.body.accounts.map(a => [a.account_number, a.result]));
    assert.equal(by.PA39BDB08Y3X, 'adopted');
    assert.equal(by.PA345SGOX9LY, 'identity_mismatch');
    assert.equal(by.PA000000001, 'env_pair_missing_on_this_deployment');
    assert.equal(by.PA000000002, 'already_in_vault');
    assert.equal(r.status, 207, 'a partial adoption is not reported as a clean one');
    const stored = rpcCalls('atlas_store_broker_credentials').map(c => c.body.p_broker_account_id);
    assert.deepEqual(stored, ['ba-primary'], 'only the verified pair reached Vault');
    assert.ok(!JSON.stringify(r.body).includes('PRIMARY-SECRET'));
});

test('a response body that stalls past the timeout is an error response, never a thrown handler', async () => {
    reset();
    accountFor = { 'NEW-KEY': 'PA4NEWACCT01' };
    registerResult = { stallBody: true };
    const r = await call('register', { name: 'Atlas Four', key_id: 'NEW-KEY', secret_key: 'NEW-SECRET' });
    assert.equal(r.status, 500);
    assert.equal(r.body.error, 'register_failed');
    assert.match(r.body.detail, /did not answer/);
});
