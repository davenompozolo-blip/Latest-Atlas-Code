// AUTH-2: the shared /api guard, and a scan that every route goes through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    bearerOf, isCronToken, requestedPortfolio, authorizeRequest, supabaseHeaders,
    withAuth, privateCache, _clearUserCache,
} from './apiAuth.js';

const ENV = { CRON_SECRET: 'cron-s3cret', VITE_SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', ATLAS_SUPABASE_URL: 'https://sb.test' };
const P = '6844aec5-43c5-4d9b-96ed-d3cd1372cd37';

function authFetch(valid = { 'good-token': { id: 'u1', email: 'a@b.c' } }, opts = {}) {
    const seen = [];
    const f = async (url, init) => {
        seen.push(url);
        if (opts.down) return new Response('x', { status: 503 });
        const tok = (init.headers.Authorization || '').replace('Bearer ', '');
        const u = valid[tok];
        return u ? new Response(JSON.stringify(u), { status: 200 }) : new Response('{}', { status: 401 });
    };
    f.seen = seen;
    return f;
}
const req = (auth, query = {}) => ({ method: 'GET', query, headers: auth ? { authorization: auth } : {} });

test('bearer parsing is exact', () => {
    assert.equal(bearerOf(req('Bearer abc')), 'abc');
    assert.equal(bearerOf(req('bearer abc ')), 'abc');
    assert.equal(bearerOf(req('Basic abc')), null);
    assert.equal(bearerOf(req('Bearer a b')), null);
    assert.equal(bearerOf(req(null)), null);
});

test('an unset or blank CRON_SECRET authorises nothing', () => {
    assert.equal(isCronToken('', ''), false);
    assert.equal(isCronToken('x', undefined), false);
    assert.equal(isCronToken('x', '   '), false);
    assert.equal(isCronToken('s', 's'), true);
    assert.equal(isCronToken('s2', 's'), false);
});

test('no credential is 401 and never reaches Supabase Auth', async () => {
    _clearUserCache();
    const f = authFetch();
    const a = await authorizeRequest(req(null), { env: ENV, fetchImpl: f });
    assert.deepEqual([a.ok, a.status], [false, 401]);
    assert.equal(f.seen.length, 0);
});

test('the cron secret is accepted only where the route allows cron', async () => {
    _clearUserCache();
    const f = authFetch();
    const ok = await authorizeRequest(req('Bearer cron-s3cret'), { env: ENV, fetchImpl: f });
    assert.equal(ok.kind, 'cron');
    const userOnly = await authorizeRequest(req('Bearer cron-s3cret'), { env: ENV, fetchImpl: f, allow: { user: true, cron: false } });
    assert.equal(userOnly.ok, false, 'a user-only route treats the secret as an unknown token');
    assert.equal(f.seen.length, 1, 'and asked Auth, which refused it');
});

test('a user is whoever Supabase Auth says the token belongs to; anything else is 401', async () => {
    _clearUserCache();
    const f = authFetch();
    const a = await authorizeRequest(req('Bearer good-token'), { env: ENV, fetchImpl: f });
    assert.deepEqual([a.ok, a.kind, a.user.id], [true, 'user', 'u1']);
    const b = await authorizeRequest(req('Bearer forged'), { env: ENV, fetchImpl: f });
    assert.deepEqual([b.ok, b.status, b.error], [false, 401, 'session_invalid']);
    const cronOnly = await authorizeRequest(req('Bearer good-token'), { env: ENV, fetchImpl: f, allow: { user: false, cron: true } });
    assert.equal(cronOnly.ok, false, 'a valid user cannot call a cron-only route');
});

test('Auth being unreachable is 503, never 401 -- a transport failure is not a verdict on the user', async () => {
    _clearUserCache();
    const a = await authorizeRequest(req('Bearer good-token'), { env: ENV, fetchImpl: authFetch(undefined, { down: true }) });
    assert.deepEqual([a.ok, a.status], [false, 503]);
});

test('a verified session is reused briefly, then re-checked', async () => {
    _clearUserCache();
    const f = authFetch();
    let t = 0;
    const now = () => t;
    await authorizeRequest(req('Bearer good-token'), { env: ENV, fetchImpl: f, now });
    await authorizeRequest(req('Bearer good-token'), { env: ENV, fetchImpl: f, now });
    assert.equal(f.seen.length, 1);
    t = 61 * 1000;
    await authorizeRequest(req('Bearer good-token'), { env: ENV, fetchImpl: f, now });
    assert.equal(f.seen.length, 2);
});

test('PostgREST headers carry the USER token for a user, the service key only for cron', () => {
    const u = supabaseHeaders({ kind: 'user', token: 'good-token' }, req(null, { portfolio: P.toUpperCase() }), ENV);
    assert.deepEqual(u, { apikey: 'anon', Authorization: 'Bearer good-token', 'x-atlas-portfolio': P });
    const c = supabaseHeaders({ kind: 'cron' }, req(null), ENV);
    assert.deepEqual(c, { apikey: 'svc', Authorization: 'Bearer svc' });
    assert.equal(supabaseHeaders(null, req(null), ENV), null, 'no decision, no headers');
    assert.equal(requestedPortfolio(req(null, { portfolio: 'nope' })), null);
});

test('withAuth refuses before the handler runs, and marks the refusal uncacheable', async () => {
    _clearUserCache();
    let ran = 0, status = null, headers = {};
    const res = { setHeader(k, v) { headers[k] = v; }, status(s) { status = s; return this; }, json() { return this; } };
    const h = withAuth(async () => { ran++; }, { env: ENV, fetchImpl: authFetch() });
    await h(req(null), res);
    assert.deepEqual([ran, status, headers['Cache-Control']], [0, 401, 'no-store']);
    await h(req('Bearer good-token'), res);
    assert.equal(ran, 1);
    assert.equal(privateCache(900), 'private, max-age=900');
});

// ── Every route is wrapped ───────────────────────────────────────────────────

const API = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'api');

export function unguardedRoutes(files) {
    const bad = [];
    for (const [name, src] of files) {
        const m = src.match(/^export default\s+([^\n;]+)/m);
        if (!m || !/^withAuth\(handler,\s*\{[^}]*\}\)$/.test(m[1].trim())) bad.push(name);
    }
    return bad;
}

test('the scanner catches a route exported without the guard', () => {
    assert.deepEqual(unguardedRoutes([
        ['ok.js', 'async function handler(){}\nexport default withAuth(handler, {});\n'],
        ['bare.js', 'export default async function handler(req, res) {}\n'],
        ['other.js', 'export default someOtherWrapper(handler);\n'],
    ]), ['bare.js', 'other.js']);
});

test('every /api route is exported through withAuth', () => {
    const files = readdirSync(API).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(join(API, f), 'utf8')]);
    assert.ok(files.length >= 30, 'found the routes (' + files.length + ')');
    assert.deepEqual(unguardedRoutes(files), []);
});

// RA-1: the only routes a signed-out visitor may reach. A new public route
// fails here until it is added on purpose.
const PUBLIC_ROUTES = ['access-request.js'];

test('only the listed routes are public', () => {
    const pub = readdirSync(API).filter((f) => f.endsWith('.js'))
        .filter((f) => /withAuth\(handler,\s*\{[^}]*public:\s*true/.test(readFileSync(join(API, f), 'utf8')));
    assert.deepEqual(pub.sort(), PUBLIC_ROUTES.slice().sort());
});

test('a public route runs with no caller and is marked so', async () => {
    let seen = null;
    const h = withAuth(async (req) => { seen = req.atlasAuth; }, { public: true });
    await h({ method: 'POST', headers: {} }, { setHeader() {}, status() { return this; }, json() { return this; } });
    assert.deepEqual(seen, { ok: true, kind: 'public' });
    assert.deepEqual(h.__atlasAuth, { public: true });
});

test('book routes never ask the CDN to cache a response', () => {
    for (const f of ['nexus-bench.js', 'nexus-theme.js', 'nexus-earnings.js', 'nexus-opportunities.js', 'ledger-export.js', 'trading.js', 'screener-market.js']) {
        const src = readFileSync(join(API, f), 'utf8');
        assert.doesNotMatch(src, /s-maxage/, f + ' must not publish a shared cache of a user\'s book');
    }
});
