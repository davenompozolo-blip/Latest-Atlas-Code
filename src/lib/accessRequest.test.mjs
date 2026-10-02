// RA-1: api/access-request.js -- the one public route. Runs the real handler
// with Supabase stubbed at fetch. Own process (node --test).
import test from 'node:test';
import assert from 'node:assert/strict';

const SB = 'https://atlas-test.supabase.co';
process.env.ATLAS_SUPABASE_URL = SB;
process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
process.env.ACCESS_REQUEST_PEPPER = 'pepper-test';

let calls, outcome;
function reset() { calls = []; outcome = { status: 200, body: 'recorded' }; }
reset();

globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), headers: init.headers || {}, body });
    if (String(url) === SB + '/rest/v1/rpc/atlas_submit_access_request') {
        return new Response(JSON.stringify(outcome.body), { status: outcome.status, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected fetch ' + url);
};

const { default: handler, ipHash, clientIp } = await import('../../api/access-request.js');
const { ACCESS_REQUEST_REPLY } = await import('./onboarding.js');

async function post(body, headers = { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, method = 'POST') {
    let status = null, out = null;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(b) { out = b; return this; } };
    await handler({ method, body, headers }, res);
    return { status, body: out };
}
const GOOD = { name: 'Ada Lovelace', email: 'ada@example.com', note: 'Friend of the admin' };

test('a request is recorded with the service key and a HASHED ip, never the raw one', async () => {
    reset();
    const r = await post(GOOD);
    assert.equal(r.status, 202);
    assert.equal(calls.length, 1);
    const c = calls[0];
    assert.equal(c.headers.Authorization, 'Bearer service-role-test');
    assert.equal(c.body.p_ip_hash, ipHash('203.0.113.7', 'pepper-test'));
    assert.ok(!JSON.stringify(c.body).includes('203.0.113.7'));
});

test('new, duplicate and already-registered get the SAME reply -- the form is not an oracle', async () => {
    const replies = [];
    for (const o of ['recorded', 'duplicate', 'existing_user']) {
        reset(); outcome = { status: 200, body: o };
        const r = await post(GOOD);
        replies.push([r.status, r.body.message]);
    }
    assert.deepEqual(replies, [[202, ACCESS_REQUEST_REPLY], [202, ACCESS_REQUEST_REPLY], [202, ACCESS_REQUEST_REPLY]]);
});

test('the rate limit is the one thing a visitor is told differently', async () => {
    reset(); outcome = { status: 200, body: 'rate_limited' };
    assert.equal((await post(GOOD)).status, 429);
});

test('a filled honeypot records nothing and still answers like a success', async () => {
    reset();
    const r = await post({ ...GOOD, website: 'http://spam.example' });
    assert.equal(r.status, 202);
    assert.equal(calls.length, 0);
});

test('bad input is refused before the database is asked', async () => {
    reset();
    for (const b of [{ ...GOOD, name: '' }, { ...GOOD, email: 'nope' }, { ...GOOD, note: 'x'.repeat(1001) }, {}]) {
        assert.equal((await post(b)).status, 400);
    }
    assert.equal(calls.length, 0);
    assert.equal((await post(GOOD, {}, 'GET')).status, 405);
});

test('a database failure is a 503 that says try again, never a fake success', async () => {
    reset(); outcome = { status: 500, body: { code: 'XX000' } };
    const r = await post(GOOD);
    assert.equal(r.status, 503);
});

test('clientIp takes the first forwarded hop', () => {
    assert.equal(clientIp({ headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.2' } }), '198.51.100.1');
    assert.equal(clientIp({ headers: { 'x-real-ip': '198.51.100.9' } }), '198.51.100.9');
    assert.equal(clientIp({ headers: {} }), '');
});
