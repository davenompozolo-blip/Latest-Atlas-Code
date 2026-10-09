// ONB-5: the account emails, and api/account-notify.js (the "someone is
// waiting" notice to administrators) run against stubbed PostgREST and Resend.

import test from 'node:test';
import assert from 'node:assert/strict';
import { statusChangeMessage, waitingNoticeMessage, sendEmail, esc } from './accountEmail.js';
import { statusChangeText } from './onboarding.js';

const SB = 'https://atlas-test.supabase.co';
process.env.ATLAS_SUPABASE_URL = SB;
process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test';
process.env.CRON_SECRET = 'cron-secret-test';

test('a name from a user is escaped in HTML and cannot break a subject line', () => {
    const m = statusChangeMessage({ from: 'pending', to: 'approved', email: 'a@example.com', first: '<script>x</script>' });
    assert.ok(!m.html.includes('<script>'));
    assert.ok(m.html.includes(esc('<script>x</script>')));
    const w = waitingNoticeMessage({ admins: ['admin@example.com'], people: [{ email: 'p@example.com', first_name: 'Evil\r\nBcc: x@y.z', surname: null }] });
    assert.ok(!/[\r\n]/.test(w.subject));
});

test('which changes are news: approve, restore, revoke yes; pending and no-op no', () => {
    const base = { email: 'a@example.com', first: 'Ada' };
    assert.equal(statusChangeMessage({ ...base, from: 'pending', to: 'approved' }).kind, 'approved');
    assert.equal(statusChangeMessage({ ...base, from: 'revoked', to: 'approved' }).kind, 'restored');
    assert.equal(statusChangeMessage({ ...base, from: 'approved', to: 'revoked' }).kind, 'revoked');
    assert.equal(statusChangeMessage({ ...base, from: 'approved', to: 'pending' }), null);
    assert.equal(statusChangeMessage({ ...base, from: 'approved', to: 'approved' }), null);
    assert.equal(statusChangeMessage({ ...base, email: 'not-an-address', from: 'pending', to: 'approved' }), null);
});

test('no message carries a sign-in link: the way in is the site', () => {
    const m = statusChangeMessage({ from: 'pending', to: 'approved', email: 'a@example.com' });
    assert.ok(!/token|verify\?|type=invite/.test(m.html + m.text));
    assert.match(m.text, /atlasterminal\.online/);
});

test('one waiting notice names everyone, and is addressed to every administrator', () => {
    const w = waitingNoticeMessage({ admins: ['a1@example.com', 'a2@example.com'],
        people: [{ email: 'p1@example.com', first_name: 'Ada', surname: 'Lovelace' }, { email: 'p2@example.com' }] });
    assert.deepEqual(w.to, ['a1@example.com', 'a2@example.com']);
    assert.match(w.subject, /2 people/);
    assert.match(w.text, /Ada Lovelace \(p1@example\.com\)/);
    assert.match(w.text, /p2@example\.com/);
    assert.equal(waitingNoticeMessage({ admins: [], people: [{ email: 'p@example.com' }] }), null);
});

test('sendEmail: no key is not_configured and makes no request; a refusal is a reason, never a throw', async () => {
    let n = 0;
    const f = async () => { n++; return new Response('{}', { status: 500 }); };
    assert.deepEqual(await sendEmail({ to: 'a@example.com' }, { apiKey: '', fetchImpl: f }), { sent: false, reason: 'not_configured' });
    assert.equal(n, 0);
    const down = await sendEmail({ to: 'a@example.com' }, { apiKey: 'k', fetchImpl: async () => { throw new Error('net'); } });
    assert.deepEqual(down, { sent: false, reason: 'unreachable' });
});

test('the People panel says when nobody was told', () => {
    assert.match(statusChangeText({ status: 'approved', from: 'pending', notified: 'email' }), /emailed/);
    assert.match(statusChangeText({ status: 'approved', from: 'revoked', notified: 'not_configured' }), /restored.*No email/s);
    assert.match(statusChangeText({ status: 'revoked', from: 'approved', notified: 'failed' }), /did not go out/);
    assert.equal(statusChangeText({ status: 'pending', from: 'approved', notified: 'none' }), 'Set back to waiting.');
});

// ── api/account-notify.js ─────────────────────────────────────────
let calls, st;
function reset() {
    calls = [];
    st = {
        waiting: [{ user_id: 'u-1', email: 'p1@example.com', first_name: 'Ada', surname: null }],
        admins: [{ user_id: 'u-admin' }],
        adminEmail: 'admin@example.com',
        stamped: [],
        sent: [],
        resendFails: false,
    };
    delete process.env.RESEND_API_KEY;
}
reset();
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    if (u.startsWith(SB + '/rest/v1/atlas_accounts?') && (init.method || 'GET') === 'PATCH') {
        st.stamped.push(u);
        return new Response(null, { status: 204 });
    }
    if (u.startsWith(SB + '/rest/v1/atlas_accounts?select=user_id')) return json(st.waiting);
    if (u.startsWith(SB + '/rest/v1/atlas_admins?')) return json(st.admins);
    if (u.startsWith(SB + '/rest/v1/atlas_accounts?select=email&user_id=in.')) return json([{ email: st.adminEmail }]);
    if (u === 'https://api.resend.com/emails') {
        if (st.resendFails) return json({ name: 'rate_limit_exceeded' }, 429);
        st.sent.push(JSON.parse(init.body));
        return json({ id: 'msg' });
    }
    throw new Error('unexpected fetch ' + u);
};
const { default: notify } = await import('../../server/api/account-notify.js');
async function run(token = 'cron-secret-test') {
    let status = null, out = null;
    const res = { setHeader() {}, status(s) { status = s; return this; }, json(b) { out = b; return this; } };
    await notify({ method: 'POST', query: {}, body: {}, headers: token ? { authorization: 'Bearer ' + token } : {} }, res);
    return { status, body: out };
}

test('account-notify: cron only', async () => {
    reset();
    assert.equal((await run(null)).status, 401);
    assert.equal(calls.length, 0);
});

test('account-notify: sends one notice and stamps exactly the people it named', async () => {
    reset();
    process.env.RESEND_API_KEY = 're_test';
    const r = await run();
    assert.equal(r.status, 200);
    assert.deepEqual(st.sent[0].to, ['admin@example.com']);
    assert.equal(st.stamped.length, 1);
    assert.match(st.stamped[0], /user_id=in\.\(u-1\)&admin_notified_at=is\.null/);
});

test('account-notify: with no key, or a refused send, nothing is stamped and the stage reads failed', async () => {
    reset();
    const nokey = await run();
    assert.equal(nokey.status, 503);
    assert.equal(nokey.body.reason, 'not_configured');
    reset();
    process.env.RESEND_API_KEY = 're_test';
    st.resendFails = true;
    const refused = await run();
    assert.equal(refused.status, 503);
    assert.equal(st.stamped.length, 0);
});

test('account-notify: nobody waiting is a quiet 200 with no email', async () => {
    reset();
    process.env.RESEND_API_KEY = 're_test';
    st.waiting = [];
    const r = await run();
    assert.equal(r.status, 200);
    assert.equal(st.sent.length, 0);
    assert.equal(calls.filter((c) => /atlas_admins/.test(c.url)).length, 0);
});
