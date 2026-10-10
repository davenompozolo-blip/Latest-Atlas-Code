// AUTH-3: a session outlives the browser only when "Keep me signed in" was ticked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthStorage, REMEMBER_KEY } from './authStorage.js';

const KEY = 'sb-test-auth-token';

function fakeStore() {
    const m = new Map();
    return {
        get length() { return m.size; },
        key: (i) => [...m.keys()][i] ?? null,
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        dump: () => Object.fromEntries(m),
    };
}

test('unticked is the default: the session goes to sessionStorage, never localStorage', () => {
    const local = fakeStore(), session = fakeStore();
    const s = createAuthStorage({ storageKey: KEY, local, session });
    s.setRemember(false);
    s.setItem(KEY, 'tok');
    assert.equal(session.getItem(KEY), 'tok');
    assert.equal(local.getItem(KEY), null);
    assert.equal(s.getItem(KEY), 'tok');
});

test('a session left in localStorage with no choice recorded is dropped on load (the pre-AUTH-3 state)', () => {
    const local = fakeStore(), session = fakeStore();
    local.setItem(KEY, 'old-tok'); local.setItem(KEY + '-user', 'u');
    local.setItem('atlas.unrelated', 'keep');
    const s = createAuthStorage({ storageKey: KEY, local, session });
    assert.equal(s.getItem(KEY), null);
    assert.equal(local.getItem(KEY), null);
    assert.equal(local.getItem(KEY + '-user'), null);
    assert.equal(local.getItem('atlas.unrelated'), 'keep');
});

test('ticked: the session goes to localStorage and survives a reload', () => {
    const local = fakeStore(), session = fakeStore();
    const s = createAuthStorage({ storageKey: KEY, local, session });
    s.setRemember(true);
    s.setItem(KEY, 'tok');
    assert.equal(local.getItem(KEY), 'tok');
    assert.equal(local.getItem(REMEMBER_KEY), '1');
    const reloaded = createAuthStorage({ storageKey: KEY, local, session: fakeStore() });
    assert.equal(reloaded.getItem(KEY), 'tok');
});

test('closing the browser ends an unticked session: a new sessionStorage reads nothing', () => {
    const local = fakeStore();
    const s = createAuthStorage({ storageKey: KEY, local, session: fakeStore() });
    s.setRemember(false); s.setItem(KEY, 'tok');
    assert.equal(createAuthStorage({ storageKey: KEY, local, session: fakeStore() }).getItem(KEY), null);
});

test('signing in unticked after a ticked session clears the remembered copy', () => {
    const local = fakeStore(), session = fakeStore();
    const s = createAuthStorage({ storageKey: KEY, local, session });
    s.setRemember(true); s.setItem(KEY, 'person-a');
    s.setRemember(false);
    assert.equal(local.getItem(KEY), null);
    assert.equal(local.getItem(REMEMBER_KEY), null);
    assert.equal(s.getItem(KEY), null);
});

test('sign-out forgets the choice and every copy of the session', () => {
    const local = fakeStore(), session = fakeStore();
    const s = createAuthStorage({ storageKey: KEY, local, session });
    s.setRemember(true); s.setItem(KEY, 'tok');
    session.setItem(KEY, 'stray');
    s.forget();
    assert.equal(local.getItem(KEY), null);
    assert.equal(session.getItem(KEY), null);
    assert.equal(local.getItem(REMEMBER_KEY), null);
    assert.equal(s.remembered(), false);
});

test('removeItem clears every store, so no copy survives in the inactive one', () => {
    const local = fakeStore(), session = fakeStore();
    const s = createAuthStorage({ storageKey: KEY, local, session });
    local.setItem(KEY, 'a'); session.setItem(KEY, 'b');
    s.removeItem(KEY);
    assert.equal(local.getItem(KEY), null);
    assert.equal(session.getItem(KEY), null);
});

test('no usable sessionStorage: the session is held in memory, never persisted', () => {
    const local = fakeStore();
    const s = createAuthStorage({ storageKey: KEY, local, session: null });
    s.setItem(KEY, 'tok');
    assert.equal(s.getItem(KEY), 'tok');
    assert.equal(local.getItem(KEY), null);
});

test('the Supabase client is given this adapter and an explicit storage key', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./supabase.js', import.meta.url), 'utf8');
    assert.match(src, /storage:\s*authStorage/);
    assert.match(src, /storageKey:\s*AUTH_STORAGE_KEY/);
    for (const f of ['../components/AuthGate.js', '../components/auth/CodeSignIn.js']) {
        const s = readFileSync(new URL(f, import.meta.url), 'utf8');
        assert.match(s, /authStorage\.setRemember\(remember\)/, f + ' must record the choice before signing in');
        assert.match(s, /useState\(false\)/, f);
    }
});
