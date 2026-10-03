// ONB-2: the client's half of "the database decides the next step".
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getOnboardingState, saveDetails, watchStep, OnboardingError,
    validateEmail, validateCode, normaliseCode, validateDetails,
    resendWaitSeconds, syncIsSlow, codeErrorMessage,
    STEP_SIGN_IN, STEP_AWAITING, STEP_CONNECT, STEP_READY, STEP_FIRST_SYNC,
} from './nextStep.js';

function client({ session = { user: { id: 'u' } }, rpc = {} } = {}) {
    const calls = [];
    return {
        calls,
        auth: { getSession: async () => ({ data: { session }, error: null }) },
        rpc: async (name, args) => {
            calls.push({ name, args });
            const r = rpc[name];
            if (typeof r === 'function') return r(args);
            return r || { data: null, error: { message: 'no stub for ' + name } };
        },
    };
}

test('no session is sign_in, without asking the database', async () => {
    const sb = client({ session: null });
    assert.deepEqual(await getOnboardingState(sb), { next_step: STEP_SIGN_IN });
    assert.equal(sb.calls.length, 0);
});

test('the database names the step', async () => {
    const sb = client({ rpc: { atlas_my_onboarding: { data: { next_step: 'connect_broker', status: 'approved' }, error: null } } });
    assert.equal((await getOnboardingState(sb)).next_step, STEP_CONNECT);
});

test('a failed read throws -- it is never read as any step, least of all ready', async () => {
    const sb = client({ rpc: { atlas_my_onboarding: { data: null, error: { message: 'canceling statement due to statement timeout' } } } });
    const orig = console.error; console.error = () => {};
    try { await assert.rejects(getOnboardingState(sb), OnboardingError); } finally { console.error = orig; }
});

test('a step the client does not know throws rather than falling through', async () => {
    for (const data of [{ next_step: 'terminal' }, {}, null, 'ready']) {
        const sb = client({ rpc: { atlas_my_onboarding: { data, error: null } } });
        await assert.rejects(getOnboardingState(sb), OnboardingError);
    }
});

test('saveDetails trims and returns the next state', async () => {
    const sb = client({ rpc: { atlas_set_my_details: (a) => ({ data: { next_step: 'awaiting_approval', first_name: a.p_first_name }, error: null }) } });
    const s = await saveDetails(sb, '  Ada ', ' Lovelace ');
    assert.equal(s.next_step, STEP_AWAITING);
    assert.deepEqual(sb.calls[0].args, { p_first_name: 'Ada', p_surname: 'Lovelace' });
});

function fakeTimers() {
    const q = [];
    return {
        q,
        set: (f) => { q.push(f); return q.length; },
        clear: () => { q.length = 0; },
        async run() { const f = q.shift(); if (f) await f(); },
    };
}

test('watchStep calls back once, when the step changes, and stops', async () => {
    let step = 'awaiting_approval';
    const sb = client({ rpc: { atlas_my_onboarding: () => ({ data: { next_step: step }, error: null }) } });
    const t = fakeTimers();
    const seen = [];
    watchStep(sb, STEP_AWAITING, (s) => seen.push(s.next_step), 10, t);
    await t.run();                 // still waiting
    assert.deepEqual(seen, []);
    step = 'connect_broker';
    await t.run();                 // approved
    assert.deepEqual(seen, ['connect_broker']);
    assert.equal(t.q.length, 0, 'no further tick is scheduled');
});

test('watchStep treats a failed read as transient and keeps watching', async () => {
    let fail = true;
    const sb = client({ rpc: { atlas_my_onboarding: () => (fail ? { data: null, error: { message: 'x' } } : { data: { next_step: 'ready' }, error: null }) } });
    const t = fakeTimers();
    const seen = [];
    const orig = console.error; console.error = () => {};
    try {
        watchStep(sb, STEP_FIRST_SYNC, (s) => seen.push(s.next_step), 10, t);
        await t.run();
        assert.deepEqual(seen, []);
        assert.equal(t.q.length, 1, 'rescheduled after the failure');
        fail = false;
        await t.run();
        assert.deepEqual(seen, [STEP_READY]);
    } finally { console.error = orig; }
});

test('watchStep stop() cancels before any callback', async () => {
    const sb = client({ rpc: { atlas_my_onboarding: { data: { next_step: 'ready' }, error: null } } });
    const t = fakeTimers();
    const seen = [];
    const stop = watchStep(sb, STEP_AWAITING, (s) => seen.push(s), 10, t);
    stop();
    await t.run();
    assert.deepEqual(seen, []);
});

test('codes: the digits are what count; 6 to 10 of them reach the server', () => {
    assert.equal(normaliseCode(' 123 456 '), '123456');
    assert.equal(normaliseCode('1234-5678'), '12345678');
    assert.equal(validateCode('123456'), null);
    assert.equal(validateCode('12345678'), null);   // Supabase is configured for 8 today
    assert.notEqual(validateCode('12345'), null);
    assert.notEqual(validateCode('12a456'), null);
    assert.notEqual(validateCode(''), null);
});

test('email and names are checked before a round trip', () => {
    assert.equal(validateEmail(' a@b.co '), null);
    assert.notEqual(validateEmail('a@b'), null);
    assert.notEqual(validateEmail(''), null);
    assert.equal(validateDetails('Ada', 'Lovelace'), null);
    assert.notEqual(validateDetails('Ada', '  '), null);
    assert.notEqual(validateDetails('', 'Lovelace'), null);
});

test('resend waits 60 s from the send', () => {
    assert.equal(resendWaitSeconds(1000, 1000), 60);
    assert.equal(resendWaitSeconds(1000, 1000 + 59500), 1);
    assert.equal(resendWaitSeconds(1000, 1000 + 60000), 0);
    assert.equal(resendWaitSeconds(NaN, 5), 0);
});

test('a slow first sync is measured from the connect stamp, and no stamp is not slow', () => {
    const at = '2026-10-03T10:00:00Z';
    const t0 = Date.parse(at);
    assert.equal(syncIsSlow(at, t0 + 2 * 60 * 1000), false);
    assert.equal(syncIsSlow(at, t0 + 4 * 60 * 1000), true);
    assert.equal(syncIsSlow(null, t0 + 1e9), false);
    assert.equal(syncIsSlow('garbage', t0 + 1e9), false);
});

test('error sentences: a transport failure is never a wrong code, and closed sign-up says so', () => {
    assert.match(codeErrorMessage({ status: 0, name: 'AuthRetryableFetchError' }, 'verify'), /could not reach/);
    assert.match(codeErrorMessage({ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' }, 'verify'), /wrong or has expired/);
    assert.match(codeErrorMessage({ status: 429 }, 'send'), /Too many/);
    assert.match(codeErrorMessage({ status: 422, message: 'Signups not allowed for otp' }, 'send'), /not open/);
    assert.match(codeErrorMessage({ status: 400, message: 'captcha protection: request disallowed' }, 'send'), /security check/);
});
