import test from 'node:test';
import assert from 'node:assert/strict';
import { isApiUrl, installApiAuth } from './apiClientAuth.js';

function fakeWin() {
    const seen = [];
    const win = {
        location: { origin: 'https://atlas.example' },
        fetch: async (input, init) => {
            const url = typeof input === 'string' ? input : (input.url || input.href);
            const h = new Headers((input && input.headers) || undefined);
            new Headers((init && init.headers) || undefined).forEach((v, k) => h.set(k, v));
            seen.push({ url, auth: h.get('authorization') });
            return new Response('{}');
        },
    };
    return { win, seen };
}

test('only same-origin /api paths count', () => {
    assert.equal(isApiUrl('/api/macro'), true);
    assert.equal(isApiUrl('https://atlas.example/api/x', 'https://atlas.example'), true);
    assert.equal(isApiUrl('https://evil.example/api/x', 'https://atlas.example'), false);
    assert.equal(isApiUrl('https://vdmojjszvvcithuxwexx.supabase.co/rest/v1/x', 'https://atlas.example'), false);
    assert.equal(isApiUrl('/apix/macro'), false);
});

test('the token goes to /api and nowhere else', async () => {
    const { win, seen } = fakeWin();
    installApiAuth(win, async () => 'tok');
    await win.fetch('/api/trading?action=account', { method: 'POST', headers: { 'content-type': 'application/json' } });
    await win.fetch('https://atlas.example/api/macro');
    await win.fetch(new Request('https://atlas.example/api/nexus-bench'));
    await win.fetch('https://finnhub.io/api/v1/quote');
    await win.fetch('https://vdmojjszvvcithuxwexx.supabase.co/rest/v1/assets');
    assert.deepEqual(seen.map((s) => s.auth), ['Bearer tok', 'Bearer tok', 'Bearer tok', null, null]);
});

test('no session sends the request bare (the route answers 401), and an explicit header is kept', async () => {
    const { win, seen } = fakeWin();
    let tok = null;
    installApiAuth(win, () => tok);
    await win.fetch('/api/macro');
    tok = 'tok';
    await win.fetch('/api/macro', { headers: { Authorization: 'Bearer cron' } });
    assert.deepEqual(seen.map((s) => s.auth), [null, 'Bearer cron']);
});

test('installing twice wraps once', async () => {
    const { win, seen } = fakeWin();
    let n = 0;
    installApiAuth(win, () => { n++; return 'tok'; });
    installApiAuth(win, () => { n++; return 'tok'; });
    await win.fetch('/api/macro');
    assert.equal(n, 1);
    assert.equal(seen.length, 1);
});
