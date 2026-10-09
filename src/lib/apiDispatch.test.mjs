// VD-1: every /api route is one Vercel function. The Hobby plan refuses a
// deployment with more than 12, and production silently stays on the last
// build that fit -- so the count is pinned here, not left to the deploy.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { default: dispatch, ROUTES, routeName } = await import('../../api/[atlasRoute].js');

test('api/ holds exactly one JavaScript function: the dispatcher', () => {
    const fns = readdirSync(join(ROOT, 'api')).filter((f) => /\.(js|mjs|cjs|ts)$/.test(f));
    assert.deepEqual(fns, ['[atlasRoute].js']);
});

test('every handler in server/api/ is in the route table, and nothing else is', () => {
    const files = readdirSync(join(ROOT, 'server', 'api')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
    assert.deepEqual(Object.keys(ROUTES).sort(), files);
    assert.ok(files.length > 10, 'a vacuous table passes trivially');
});

function fakeRes() {
    const out = { status: null, body: null };
    return { out, setHeader() {}, status(s) { out.status = s; return this; }, json(b) { out.body = b; return this; } };
}

test('an unknown route is a 404 and never reaches a handler; inherited names do not resolve', async () => {
    for (const name of ['nope', 'constructor', '__proto__', '../src/lib/apiAuth']) {
        const res = fakeRes();
        await dispatch({ query: { atlasRoute: name }, url: '/api/' + name, headers: {} }, res);
        assert.equal(res.out.status, 404, name);
    }
});

test('the route segment is taken from the query, else the path, and removed before the handler', () => {
    assert.equal(routeName({ query: { atlasRoute: 'equity' }, url: '/api/equity?endpoint=daily' }), 'equity');
    assert.equal(routeName({ query: { endpoint: 'daily' }, url: '/api/equity?endpoint=daily' }), 'equity');
    assert.equal(routeName({ query: {}, url: '/' }), '');
});

test('a real route runs through the dispatcher with its own query intact', async () => {
    const req = { method: 'GET', query: { atlasRoute: 'onboarding', action: 'x' }, url: '/api/onboarding?action=x', headers: {} };
    const res = fakeRes();
    await dispatch(req, res);
    assert.equal('atlasRoute' in req.query, false);
    assert.equal(req.query.action, 'x');
    // onboarding refuses GET or an unauthenticated caller -- either proves the handler ran.
    assert.ok([401, 405].includes(res.out.status), String(res.out.status));
});
