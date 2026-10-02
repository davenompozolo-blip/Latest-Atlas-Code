// ON-1: api/onboarding.js -- a signed-in person connects their own broker
// account; an administrator invites people. Runs the real handler with Supabase
// Auth, PostgREST, Alpaca and the edge functions stubbed at fetch, so every
// outbound call is observed. Own process (node --test).

import test from 'node:test';
import assert from 'node:assert/strict';

const SB = 'https://atlas-test.supabase.co';
process.env.ATLAS_SUPABASE_URL = SB;
process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test';
process.env.CRON_SECRET = 'cron-secret-test';

const USERS = { 'tok-admin': 'u-admin', 'tok-member': 'u-member' };
const ADMINS = new Set(['u-admin']);
let calls, state;
function reset() {
    calls = [];
    state = {
        owned: { 'u-admin': 3, 'u-member': 0 },
        brokerAccount: { 'PKGOOD': 'PA0000ABCD99' },    // key id -> account number
        connect: null,                                   // override: { status, body }
        existingEmails: new Set(),
        requests: { 'aaaaaaaa-0000-4000-8000-000000000001': { email: 'asker@example.com', status: 'pending' } },
        linkFails: false,
        decideFails: false,
    };
}
reset();

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, h, body });
    const tok = (h.authorization || '').replace(/^Bearer /, '');

    if (u === SB + '/auth/v1/user') return USERS[tok] ? json({ id: USERS[tok] }) : json({ msg: 'bad jwt' }, 401);
    if (u === SB + '/rest/v1/rpc/atlas_my_access') {
        const uid = USERS[tok];
        return json([{ is_admin: ADMINS.has(uid), owned_portfolios: state.owned[uid], account_cap: ADMINS.has(uid) ? null : 3 }]);
    }
    if (u === SB + '/rest/v1/rpc/atlas_is_admin') return json(ADMINS.has(USERS[tok]));
    if (u === SB + '/rest/v1/rpc/atlas_connect_broker_account') {
        if (tok !== 'service-role-test') return json({ message: 'permission denied' }, 401);
        if (state.connect) return json(state.connect.body, state.connect.status);
        return json('new-portfolio-id');
    }
    if (/alpaca\.markets\/v2\/account$/.test(u)) {
        const n = state.brokerAccount[h['apca-api-key-id']];
        return n ? json({ account_number: n, status: 'ACTIVE' }) : json({ message: 'forbidden' }, 401);
    }
    if (u.startsWith(SB + '/rest/v1/access_requests?')) {
        if (tok !== 'service-role-test') return json({ message: 'permission denied' }, 401);
        const id = /id=eq\.([0-9a-f-]+)/.exec(u)[1];
        const r = state.requests[id];
        return json(r ? [{ id, ...r }] : []);
    }
    if (u === SB + '/rest/v1/rpc/atlas_decide_access_request') {
        if (tok !== 'service-role-test') return json({ message: 'permission denied' }, 401);
        if (state.decideFails) return json({ code: 'XX000', message: 'boom' }, 500);
        state.requests[body.p_id].status = body.p_status;
        return json(state.requests[body.p_id].email);
    }
    if (u === SB + '/auth/v1/admin/generate_link') {
        if (tok !== 'service-role-test') return json({ msg: 'not admin' }, 401);
        if (state.linkFails) return json({ msg: 'down' }, 500);
        if (body.type === 'invite' && state.existingEmails.has(body.email)) {
            return json({ code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' }, 422);
        }
        return json({ action_link: SB + '/auth/v1/verify?token=t&type=' + body.type, email: body.email });
    }
    if (u.startsWith(SB + '/functions/v1/')) return json({ ok: true });
    throw new Error('unexpected fetch ' + u);
};

const { default: handler } = await import('../../api/onboarding.js');

async function post(action, body, token, headers = {}) {
    let status = null, out = null;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(b) { out = b; return this; } };
    const auth = token ? { authorization: 'Bearer ' + token } : {};
    await handler({ method: 'POST', query: { action }, body, headers: { ...auth, ...headers } }, res);
    return { status, body: out };
}
const hits = (re) => calls.filter((c) => re.test(c.url));
const GOOD = { broker: 'alpaca', name: 'My account', key_id: 'PKGOOD', secret_key: 'S3CRET-VALUE', paper: true };

test('no session is refused; the cron secret is refused too -- an account connected under it would belong to nobody', async () => {
    reset();
    assert.equal((await post('connect', GOOD, null)).status, 401);
    assert.equal((await post('connect', GOOD, 'cron-secret-test')).status, 401);
    assert.equal(hits(/alpaca|atlas_connect/).length, 0);
});

test('connect: the owner is the SESSION, the account number is the BROKER\'s -- never what the body says', async () => {
    reset();
    const r = await post('connect', { ...GOOD, user_id: 'u-admin', account_number: 'PA-TYPED' }, 'tok-member');
    assert.equal(r.status, 201);
    const rpc = hits(/atlas_connect_broker_account/)[0];
    assert.equal(rpc.body.p_user_id, 'u-member');
    assert.equal(rpc.body.p_account_number, 'PA0000ABCD99');
    assert.equal(rpc.h.authorization, 'Bearer service-role-test');
    assert.equal(r.body.portfolio_id, 'new-portfolio-id');
    assert.equal(r.body.account_last4, 'CD99');
});

test('connect: no response carries a key or the full account number', async () => {
    reset();
    const r = await post('connect', GOOD, 'tok-member');
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes('S3CRET-VALUE') && !text.includes('PKGOOD') && !text.includes('PA0000ABCD99'), text);
});

test('connect: the first syncs are started with the cron secret (edge functions check their caller)', async () => {
    reset();
    await post('connect', GOOD, 'tok-member');
    const syncs = hits(/\/functions\/v1\//);
    assert.equal(syncs.length, 3);
    syncs.forEach((c) => assert.equal(c.h.authorization, 'Bearer cron-secret-test'));
});

test('connect: keys the broker refuses are a 422, and nothing is registered', async () => {
    reset();
    const r = await post('connect', { ...GOOD, key_id: 'PKBAD' }, 'tok-member');
    assert.equal(r.status, 422);
    assert.match(r.body.detail, /paper API/);
    assert.equal(hits(/atlas_connect_broker_account/).length, 0);
});

test('connect: at the account cap the broker is never asked', async () => {
    reset();
    state.owned['u-member'] = 3;
    const r = await post('connect', GOOD, 'tok-member');
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'account_limit');
    assert.equal(hits(/alpaca/).length, 0);
});

test('connect: an administrator is not capped', async () => {
    reset();
    assert.equal((await post('connect', GOOD, 'tok-admin')).status, 201);
});

test('connect: an account already in Atlas is a 409, and a database failure never logs the secret', async () => {
    reset();
    state.connect = { status: 409, body: { code: '23505', message: 'account PA0000ABCD99 is already registered' } };
    assert.equal((await post('connect', GOOD, 'tok-member')).body.error, 'already_registered');
    state.connect = { status: 500, body: { code: 'XX000', message: 'boom' } };
    const logged = [];
    const orig = console.error;
    console.error = (...a) => logged.push(a.map(String).join(' '));
    try { assert.equal((await post('connect', GOOD, 'tok-member')).status, 500); }
    finally { console.error = orig; }
    assert.ok(logged.length > 0);
    assert.ok(!logged.join('\n').includes('S3CRET-VALUE'));
});

test('connect: malformed input is refused before any outbound call', async () => {
    reset();
    for (const b of [{ ...GOOD, name: '' }, { ...GOOD, secret_key: '' }, { ...GOOD, broker: 'ibkr' }, { ...GOOD, key_id: 'PK GOOD' }]) {
        assert.equal((await post('connect', b, 'tok-member')).status, 400);
    }
    assert.equal(hits(/alpaca|atlas_connect|atlas_my_access/).length, 0);
});

test('invite: a person who is not an administrator is refused and no link is made', async () => {
    reset();
    const r = await post('invite', { email: 'new@example.com' }, 'tok-member');
    assert.equal(r.status, 403);
    assert.equal(hits(/generate_link/).length, 0);
});

test('invite: an administrator gets a one-time invite link, made with the service key', async () => {
    reset();
    const r = await post('invite', { email: ' New@Example.com ' }, 'tok-admin', { origin: 'https://latest-atlas-code-abc.vercel.app' });
    assert.equal(r.status, 201);
    assert.equal(r.body.kind, 'invite');
    assert.match(r.body.action_link, /type=invite/);
    const g = hits(/generate_link/)[0];
    assert.equal(g.body.email, 'new@example.com');
    assert.equal(g.body.redirect_to, 'https://latest-atlas-code-abc.vercel.app/');
    assert.equal(g.h.authorization, 'Bearer service-role-test');
});

test('invite: a foreign origin is not passed as the redirect', async () => {
    reset();
    await post('invite', { email: 'new@example.com' }, 'tok-admin', { origin: 'https://evil.example' });
    assert.equal(hits(/generate_link/)[0].body.redirect_to, undefined);
});

test('invite: someone who already has an account gets a set-new-password link instead', async () => {
    reset();
    state.existingEmails.add('old@example.com');
    const r = await post('invite', { email: 'old@example.com' }, 'tok-admin');
    assert.equal(r.status, 201);
    assert.equal(r.body.kind, 'recovery');
    assert.match(r.body.action_link, /type=recovery/);
});

const RID = 'aaaaaaaa-0000-4000-8000-000000000001';

test('decide: a person who is not an administrator is refused before anything is read', async () => {
    reset();
    const r = await post('decide', { id: RID, decision: 'approve' }, 'tok-member');
    assert.equal(r.status, 403);
    assert.equal(hits(/access_requests|generate_link|decide_access/).length, 0);
});

test('decide: approve issues the invite link FIRST, then marks the request, as the calling admin', async () => {
    reset();
    const r = await post('decide', { id: RID, decision: 'approve' }, 'tok-admin');
    assert.equal(r.status, 201);
    assert.match(r.body.action_link, /type=invite/);
    const order = calls.map((c) => c.url).filter((u) => /generate_link|decide_access/.test(u));
    assert.deepEqual(order.map((u) => /generate_link/.test(u) ? 'link' : 'mark'), ['link', 'mark']);
    const mark = hits(/atlas_decide_access_request/)[0];
    assert.equal(mark.body.p_admin, 'u-admin');
    assert.equal(mark.body.p_status, 'approved');
    assert.equal(state.requests[RID].status, 'approved');
});

test('decide: when the link cannot be made the request stays pending', async () => {
    reset();
    state.linkFails = true;
    const r = await post('decide', { id: RID, decision: 'approve' }, 'tok-admin');
    assert.equal(r.status, 502);
    assert.equal(hits(/atlas_decide_access_request/).length, 0);
    assert.equal(state.requests[RID].status, 'pending');
});

test('decide: a link made but not recorded is still handed over, with a warning', async () => {
    reset();
    state.decideFails = true;
    const r = await post('decide', { id: RID, decision: 'approve' }, 'tok-admin');
    assert.equal(r.status, 207);
    assert.ok(r.body.action_link && r.body.warning);
});

test('decide: decline makes no link; a decided request cannot be decided again; bad ids are refused', async () => {
    reset();
    const d = await post('decide', { id: RID, decision: 'decline' }, 'tok-admin');
    assert.equal(d.status, 200);
    assert.equal(hits(/generate_link/).length, 0);
    assert.equal((await post('decide', { id: RID, decision: 'approve' }, 'tok-admin')).status, 409);
    assert.equal((await post('decide', { id: 'not-a-uuid', decision: 'approve' }, 'tok-admin')).status, 400);
    assert.equal((await post('decide', { id: RID, decision: 'maybe' }, 'tok-admin')).status, 400);
});
