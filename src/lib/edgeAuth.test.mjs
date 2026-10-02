// EF-1: the caller check every edge function runs before its handler.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCaller, clearCallerCache, looksLikeJwt } from '../../supabase/functions/_shared/edge_auth.js';

const SERVICE = 'service-role-key';
const CRON = 'not-a-jwt-cron-secret-value';
const USER_JWT = 'aaa.bbb.ccc';
const ANON_JWT = 'anon.key.jwt';

function req(method, auth) {
    const h = new Headers();
    if (auth) h.set('authorization', auth);
    return new Request('https://x.supabase.co/functions/v1/f', { method, headers: h });
}

// A fake Supabase: the cron RPC compares to CRON, /auth/v1/user knows USER_JWT.
function deps({ down = false } = {}) {
    const calls = [];
    const env = (n) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: SERVICE, SUPABASE_ANON_KEY: 'anon' })[n];
    const fetch = async (url, init = {}) => {
        calls.push({ url, init });
        if (down) return new Response('bad gateway', { status: 502 });
        if (url.endsWith('/rest/v1/rpc/atlas_check_cron_secret')) {
            const { p_token } = JSON.parse(init.body);
            return new Response(JSON.stringify(p_token === CRON), { status: 200 });
        }
        if (url.endsWith('/auth/v1/user')) {
            const tok = init.headers.Authorization.slice(7);
            return tok === USER_JWT
                ? new Response(JSON.stringify({ id: 'u1' }), { status: 200 })
                : new Response(JSON.stringify({ msg: 'bad jwt' }), { status: 403 });
        }
        throw new Error('unexpected fetch ' + url);
    };
    return { env, fetch, calls };
}

test.beforeEach(() => clearCallerCache());

test('no Authorization is refused, and nothing is fetched', async () => {
    const d = deps();
    const r = await checkCaller(req('POST'), { user: true }, d);
    assert.equal(r.status, 401);
    assert.equal(d.calls.length, 0);
});

test('the cron secret is accepted, and checked by the database', async () => {
    const d = deps();
    assert.equal(await checkCaller(req('POST', 'Bearer ' + CRON), { user: false }, d), null);
    assert.equal(d.calls.length, 1);
    assert.match(d.calls[0].url, /atlas_check_cron_secret$/);
    assert.equal(d.calls[0].init.headers.Authorization, 'Bearer ' + SERVICE);
});

test('a wrong secret is refused', async () => {
    const d = deps();
    const r = await checkCaller(req('POST', 'Bearer wrong-secret'), { user: false }, d);
    assert.equal(r.status, 401);
});

test('the service key is accepted without a round trip', async () => {
    const d = deps();
    assert.equal(await checkCaller(req('POST', 'Bearer ' + SERVICE), { user: false }, d), null);
    assert.equal(d.calls.length, 0);
});

test('a signed-in user is accepted only where the function allows users', async () => {
    const d = deps();
    assert.equal(await checkCaller(req('POST', 'Bearer ' + USER_JWT), { user: true }, d), null);
    clearCallerCache();
    const r = await checkCaller(req('POST', 'Bearer ' + USER_JWT), { user: false }, deps());
    assert.equal(r.status, 401);
});

test('the anon key -- a valid JWT with no user -- is refused', async () => {
    const r = await checkCaller(req('POST', 'Bearer ' + ANON_JWT), { user: true }, deps());
    assert.equal(r.status, 401);
});

test('a JWT is never sent to the cron check, and the cron secret never to the auth server', async () => {
    const d = deps();
    await checkCaller(req('POST', 'Bearer ' + USER_JWT), { user: true }, d);
    await checkCaller(req('POST', 'Bearer ' + CRON), { user: true }, d);
    assert.equal(d.calls.filter((c) => c.url.endsWith('/auth/v1/user')).length, 1);
    assert.equal(d.calls.filter((c) => c.url.endsWith('atlas_check_cron_secret')).length, 1);
    const rpc = d.calls.find((c) => c.url.endsWith('atlas_check_cron_secret'));
    assert.equal(JSON.parse(rpc.init.body).p_token, CRON);
});

test('a check that cannot complete fails closed with 503, never open', async () => {
    const d = deps({ down: true });
    const a = await checkCaller(req('POST', 'Bearer ' + CRON), { user: false }, d);
    const b = await checkCaller(req('POST', 'Bearer ' + USER_JWT), { user: true }, d);
    assert.equal(a.status, 503);
    assert.equal(b.status, 503);
});

test('missing service credentials fail closed', async () => {
    const d = deps();
    d.env = () => undefined;
    const r = await checkCaller(req('POST', 'Bearer ' + CRON), { user: false }, d);
    assert.equal(r.status, 503);
});

test('a preflight passes to the handler, which answers CORS itself', async () => {
    assert.equal(await checkCaller(req('OPTIONS'), { user: true }, deps()), null);
});

test('an accepted caller is cached, a cached user is not reused by a cron-only function', async () => {
    const d = deps();
    await checkCaller(req('POST', 'Bearer ' + CRON), { user: false }, d);
    await checkCaller(req('POST', 'Bearer ' + CRON), { user: false }, d);
    assert.equal(d.calls.length, 1);
    await checkCaller(req('POST', 'Bearer ' + USER_JWT), { user: true }, d);
    const r = await checkCaller(req('POST', 'Bearer ' + USER_JWT), { user: false }, d);
    assert.equal(r.status, 401);
});

test('refusals carry CORS, so the browser sees the 401 rather than a network error', async () => {
    const r = await checkCaller(req('POST'), { user: true }, deps());
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
});

test('looksLikeJwt', () => {
    assert.equal(looksLikeJwt('a.b.c'), true);
    assert.equal(looksLikeJwt('abc'), false);
    assert.equal(looksLikeJwt('a.b'), false);
});
