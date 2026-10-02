// ON-1: the onboarding screens' decisions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    onboardingState, validateConnectForm, alpacaKeyEnvironment, onboardingErrorMessage,
    accountCapLine, canConnectMore, inviteResultText,
    ONBOARD_LOADING, ONBOARD_FAILED, ONBOARD_NEEDS_ACCOUNT, ONBOARD_READY,
} from './onboarding.js';
import { passwordSetupKind, recoveryPending } from './authGate.js';

test('a failed account read is never "connect an account"', () => {
    assert.equal(onboardingState({ loading: false, error: 'canceling statement', portfolios: null }), ONBOARD_FAILED);
    assert.equal(onboardingState({ loading: false, error: 'boom', portfolios: [] }), ONBOARD_FAILED);
    assert.equal(onboardingState({ loading: false, error: null, portfolios: undefined }), ONBOARD_FAILED);
});

test('no portfolios -> connect; any membership -> the terminal; loading wins', () => {
    assert.equal(onboardingState({ loading: false, error: null, portfolios: [] }), ONBOARD_NEEDS_ACCOUNT);
    assert.equal(onboardingState({ loading: false, error: null, portfolios: [{ id: 'p' }] }), ONBOARD_READY);
    assert.equal(onboardingState({ loading: true, error: null, portfolios: [] }), ONBOARD_LOADING);
});

test('the key prefix names its environment, and a mismatch is caught before the broker is asked', () => {
    assert.equal(alpacaKeyEnvironment(' pkabc'), 'paper');
    assert.equal(alpacaKeyEnvironment('AKXYZ'), 'live');
    assert.equal(alpacaKeyEnvironment('ZZ1'), null);
    const base = { name: 'Mine', keyId: 'PKABC', secretKey: 'S', paper: true };
    assert.equal(validateConnectForm(base), null);
    assert.match(validateConnectForm({ ...base, paper: false }), /paper key/);
    assert.match(validateConnectForm({ ...base, keyId: 'AKABC' }), /live key/);
    assert.equal(validateConnectForm({ ...base, keyId: 'AKABC', paper: false }), null);
    assert.equal(validateConnectForm({ ...base, keyId: 'XX1' }), null);   // unknown prefix: the broker decides
});

test('connect form: missing fields and pasted whitespace', () => {
    const base = { name: 'Mine', keyId: 'PKABC', secretKey: 'S', paper: true };
    assert.match(validateConnectForm({ ...base, name: '  ' }), /name/);
    assert.match(validateConnectForm({ ...base, keyId: '' }), /key ID/);
    assert.match(validateConnectForm({ ...base, secretKey: '' }), /secret/);
    assert.match(validateConnectForm({ ...base, secretKey: 'S S' }), /spaces/);
    assert.match(validateConnectForm({ ...base, name: 'x'.repeat(61) }), /60/);
});

test('a transport failure is never reported as a problem with the keys', () => {
    assert.match(onboardingErrorMessage(0, null), /reach Atlas/);
    assert.match(onboardingErrorMessage(null, null), /reach Atlas/);
    assert.match(onboardingErrorMessage(401, { detail: 'whatever' }), /Sign in again/);
    assert.equal(onboardingErrorMessage(422, { detail: 'Alpaca did not accept these keys' }), 'Alpaca did not accept these keys');
    assert.match(onboardingErrorMessage(503, {}), /Nothing was changed/);
});

test('the cap line and whether another account may be connected', () => {
    assert.equal(accountCapLine({ owned_portfolios: 2, account_cap: 3 }), '2 of 3 accounts connected');
    assert.equal(accountCapLine({ owned_portfolios: 0, account_cap: 1 }), '0 of 1 account connected');
    assert.equal(accountCapLine({ owned_portfolios: 9, account_cap: null }), null);
    assert.equal(canConnectMore({ owned_portfolios: 3, account_cap: 3 }), false);
    assert.equal(canConnectMore({ owned_portfolios: 2, account_cap: 3 }), true);
    assert.equal(canConnectMore({ owned_portfolios: 40, account_cap: null }), true);
    assert.equal(canConnectMore(null), true);   // unknown: the server enforces it
});

test('the invite result says who it is for, what it does and when it dies', () => {
    assert.equal(inviteResultText(null), null);
    const inv = inviteResultText({ email: 'a@b.co', kind: 'invite', action_link: 'x', expires_in_seconds: 3600 });
    assert.match(inv, /a@b\.co/); assert.match(inv, /60 minutes/); assert.match(inv, /connect their broker/);
    assert.match(inviteResultText({ email: 'a@b.co', kind: 'recovery', action_link: 'x' }), /already has an Atlas account/);
});

test('an invite link opens the set-password form, like a reset link', () => {
    assert.equal(passwordSetupKind('#access_token=x&type=invite'), 'invite');
    assert.equal(passwordSetupKind('#access_token=x&type=recovery'), 'recovery');
    assert.equal(passwordSetupKind('#access_token=x&type=signup'), null);
    assert.equal(passwordSetupKind(''), null);
    assert.equal(recoveryPending({ hash: '#a=1&type=invite', marker: null, session: null }), true);
});
