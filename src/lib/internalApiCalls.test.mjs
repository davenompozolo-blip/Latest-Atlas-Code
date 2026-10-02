// Since AUTH-2b every /api route checks its caller. A route that calls another
// /api route server to server must pass the caller's Authorization on, or the
// inner route answers 401 and the outer one reports "no data". That is how the
// index wall, the options snapshot and the valuation run all went dark on
// 2026-10-01. This test fails any route that builds an internal /api URL
// without using internalCallHeaders.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { internalCallHeaders } from './apiAuth.js';

const API = new URL('../../api/', import.meta.url).pathname;

/** Files that build a same-deployment /api URL from a resolved origin. */
export function internalCallers(files) {
    return files.filter(([, src]) => /origin\s*\+\s*['"`]\/api\//.test(src));
}

test('the helper forwards the caller credential and the preview bypass, nothing else', () => {
    const h = internalCallHeaders({ headers: {
        authorization: 'Bearer tok', cookie: 'c=1', 'x-vercel-protection-bypass': 'b', host: 'x', 'x-forwarded-for': '1.2.3.4',
    } });
    assert.deepEqual(h, { authorization: 'Bearer tok', cookie: 'c=1', 'x-vercel-protection-bypass': 'b' });
    assert.deepEqual(internalCallHeaders({ headers: {} }), {});
    assert.deepEqual(internalCallHeaders(null), {});
});

test('the detector finds the exact shape that broke', () => {
    const broke = "const r = await fetch(origin + '/api/equity?endpoint=daily', { headers: fwd });";
    assert.equal(internalCallers([['x.js', broke]]).length, 1);
    assert.equal(internalCallers([['y.js', "fetch(SB_URL + '/rest/v1/x')"]]).length, 0);
});

test('every route that calls another /api route forwards the caller credential', () => {
    const files = readdirSync(API).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(join(API, f), 'utf8')]);
    const callers = internalCallers(files);
    assert.ok(callers.length >= 5, 'expected several internal callers; a vacuous scan passes trivially');
    const bad = callers.filter(([, src]) => !src.includes('internalCallHeaders(req)')).map(([f]) => f);
    assert.deepEqual(bad, []);
});
