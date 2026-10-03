// ONB-3: ACCOUNTS -> My accounts and People. Fixtures use the shapes
// atlas_my_broker_accounts and atlas_admin_accounts actually return.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateReplaceKeys, keysHeldLabel, syncLine, accountLine,
    groupPeople, actionsFor, waitingCount, personName, stageInfo,
} from './accountsAdmin.js';

const NOW = Date.parse('2026-10-03T12:00:00Z');

test('replace keys: a key for the other environment is caught before the broker is asked', () => {
    assert.match(validateReplaceKeys({ keyId: 'AKLIVE', secretKey: 's', paper: true }), /paper account/);
    assert.match(validateReplaceKeys({ keyId: 'PKPAPER', secretKey: 's', paper: false }), /live account/);
    assert.equal(validateReplaceKeys({ keyId: 'PKPAPER', secretKey: 's', paper: true }), null);
    assert.match(validateReplaceKeys({ keyId: '', secretKey: 's', paper: true }), /key ID/);
    assert.match(validateReplaceKeys({ keyId: 'PK X', secretKey: 's', paper: true }), /spaces/);
});

test('where the keys are held is said in words, and an env-held pair says replacing moves it', () => {
    assert.match(keysHeldLabel('vault'), /encrypted in Atlas/);
    assert.match(keysHeldLabel('environment'), /moves them into Atlas/);
    assert.match(keysHeldLabel(null), /No keys/);
});

test('a failed last sync points at the keys; a missing one is not called a failure', () => {
    const failed = syncLine({ last_sync_at: '2026-10-03T11:50:00Z', last_sync_status: 'error' }, NOW);
    assert.equal(failed.tone, 'bad');
    assert.match(failed.text, /replace them/);
    assert.deepEqual(syncLine({ last_sync_at: null }, NOW), { text: 'Not synced yet', tone: 'muted' });
    assert.equal(syncLine({ last_sync_at: '2026-10-03T11:57:00Z', last_sync_status: 'success' }, NOW).text, 'Last synced 3 min ago');
});

test('an account line carries the environment and the last four only', () => {
    assert.equal(accountLine({ is_paper: true, account_last4: 'LIZJ' }), 'Paper · account ending LIZJ');
    assert.equal(accountLine({ is_paper: false, account_last4: null }), 'Live');
});

const PEOPLE = [
    { user_id: 'a', status: 'pending', stage: 'waiting', email: 'w@x.co', first_name: 'Wen', surname: 'Li' },
    { user_id: 'b', status: 'approved', stage: 'live', email: 'l@x.co' },
    { user_id: 'c', status: 'pending', stage: 'unverified', email: 'u@x.co' },
    { user_id: 'd', status: 'revoked', stage: 'revoked', email: 'r@x.co' },
    { user_id: 'e', status: 'approved', stage: 'approved', email: 'p@x.co' },
    { user_id: 'me', status: 'approved', stage: 'live', email: 'me@x.co' },
];

test('people are grouped in working order: waiting first, unverified and revoked collapsed', () => {
    const g = groupPeople(PEOPLE);
    assert.deepEqual(g.map((x) => x.id), ['waiting', 'active', 'unverified', 'revoked']);
    assert.deepEqual(g[1].rows.map((r) => r.user_id), ['b', 'e', 'me']);
    assert.equal(g.find((x) => x.id === 'unverified').collapsed, true);
    assert.deepEqual(groupPeople([]).length, 0);              // empty groups are dropped
});

test('the actions on offer follow the status, and there are none on yourself', () => {
    assert.deepEqual(actionsFor(PEOPLE[0], 'me').map((a) => a.to), ['approved', 'revoked']);
    assert.deepEqual(actionsFor(PEOPLE[1], 'me').map((a) => a.to), ['revoked']);
    assert.ok(actionsFor(PEOPLE[1], 'me')[0].confirm);         // revoking asks first
    assert.deepEqual(actionsFor(PEOPLE[3], 'me').map((a) => a.to), ['approved', 'pending']);
    assert.deepEqual(actionsFor(PEOPLE[5], 'me'), []);
});

test('the badge counts people waiting for approval, not people who never finished signing in', () => {
    assert.equal(waitingCount(PEOPLE), 1);
    assert.equal(waitingCount(null), 0);
});

test('a person with no name on file is shown by email; an unknown stage is labelled, never dropped', () => {
    assert.equal(personName(PEOPLE[0]), 'Wen Li');
    assert.equal(personName(PEOPLE[1]), 'l@x.co');
    assert.equal(stageInfo('something_new').label, 'something_new');
    assert.equal(groupPeople([{ user_id: 'z', stage: 'something_new' }])[0].id, 'active');
});
