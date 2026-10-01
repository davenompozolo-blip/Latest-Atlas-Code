import test from 'node:test';
import assert from 'node:assert/strict';
import {
    gateState, validateCredentials, validateNewPassword, authErrorMessage,
    isRecoveryUrl, signOutStorageKeys, PASSWORD_MIN_LENGTH,
    GATE_UNCONFIGURED, GATE_LOADING, GATE_SIGNED_OUT, GATE_RECOVERY, GATE_SIGNED_IN,
} from './authGate.js';

const session = { user: { id: 'u1' }, access_token: 't' };

test('no client means unconfigured, whatever else is true', () => {
    assert.equal(gateState({ configured: false, loading: false, session }), GATE_UNCONFIGURED);
});

test('the app does not render while the stored session is still being read', () => {
    assert.equal(gateState({ configured: true, loading: true, session }), GATE_LOADING);
});

test('no session is signed out; a session with a user is signed in', () => {
    assert.equal(gateState({ configured: true, loading: false, session: null }), GATE_SIGNED_OUT);
    assert.equal(gateState({ configured: true, loading: false, session: { user: null } }), GATE_SIGNED_OUT);
    assert.equal(gateState({ configured: true, loading: false, session }), GATE_SIGNED_IN);
});

test('a reset-link session shows the new-password form, never the app', () => {
    assert.equal(gateState({ configured: true, loading: false, session, recovery: true }), GATE_RECOVERY);
    // recovery without a session (expired link) is just signed out
    assert.equal(gateState({ configured: true, loading: false, session: null, recovery: true }), GATE_SIGNED_OUT);
});

test('credential validation', () => {
    assert.equal(validateCredentials('', 'x'), 'Enter your email address.');
    assert.match(validateCredentials('not-an-email', 'x'), /email address/);
    assert.equal(validateCredentials('a@b.co', ''), 'Enter your password.');
    assert.equal(validateCredentials(' a@b.co ', 'pw'), null);
    assert.equal(validateCredentials('a@b.co', '', { requirePassword: false }), null);
});

test('new password must meet the server minimum and match', () => {
    assert.equal(PASSWORD_MIN_LENGTH, 12);
    assert.match(validateNewPassword('short', 'short'), /12/);
    assert.match(validateNewPassword('x'.repeat(12), 'y'.repeat(12)), /match/);
    assert.equal(validateNewPassword('x'.repeat(12), 'x'.repeat(12)), null);
});

test('a failed sign-in never says whether the email exists', () => {
    const wrongPw = authErrorMessage({ status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' });
    const noUser = authErrorMessage({ status: 400, message: 'User not found' });
    assert.equal(wrongPw, noUser);
    assert.equal(wrongPw, 'Email or password is incorrect.');
});

test('a transport failure is never reported as a credentials problem', () => {
    const m = authErrorMessage({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' });
    assert.match(m, /Could not reach/);
    assert.notEqual(m, 'Email or password is incorrect.');
    assert.match(authErrorMessage({ status: 503 }), /had a problem/);
});

test('rate limiting and reset-link expiry read as themselves', () => {
    assert.match(authErrorMessage({ status: 429 }), /Too many attempts/);
    assert.match(authErrorMessage({ status: 401 }, 'update_password'), /expired/);
    assert.match(authErrorMessage({ code: 'same_password', status: 422 }, 'update_password'), /different/);
    assert.equal(authErrorMessage(null), null);
});

test('recovery is read from the URL fragment, exactly', () => {
    assert.equal(isRecoveryUrl('#access_token=a&type=recovery&expires_in=3600'), true);
    assert.equal(isRecoveryUrl('type=recovery'), true);
    assert.equal(isRecoveryUrl('#type=recoveryx'), false);
    assert.equal(isRecoveryUrl('#type=signup'), false);
    assert.equal(isRecoveryUrl(''), false);
    assert.equal(isRecoveryUrl(undefined), false);
});

function fakeStorage(keys) {
    return { length: keys.length, key: (i) => keys[i] };
}

test('sign-out clears the account choice and nothing else', () => {
    const s = fakeStorage(['atlas.portfolio.v1', 'atlas.return.basis.v1', 'sb-vdmojjszvvcithuxwexx-auth-token', 'atlas.portfolio.v2']);
    assert.deepEqual(signOutStorageKeys(s), ['atlas.portfolio.v1', 'atlas.portfolio.v2']);
    assert.deepEqual(signOutStorageKeys(null), []);
    const throwing = { get length() { throw new Error('blocked'); }, key() { return null; } };
    assert.deepEqual(signOutStorageKeys(throwing), []);
});
