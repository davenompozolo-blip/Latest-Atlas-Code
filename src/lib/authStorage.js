// AUTH-3: a session outlives the browser only when the person asked it to.
//
// supabase-js keeps its session in localStorage by default, so whoever signed
// in last on a machine is still signed in the next time anyone opens it. That
// is a convenience nobody chose. Here the session lives in sessionStorage --
// gone when the browser closes -- unless "Keep me signed in" was ticked at
// sign-in, and only then in localStorage.
//
// The choice is recorded in localStorage (REMEMBER_KEY) and is the ONLY thing
// that sends a session there. No flag means not remembered, so a session left
// in localStorage by the build before this one is ignored and removed: every
// existing sign-in ends once, the same for every account, administrators
// included.
//
// Where a store throws (some private modes), the session falls back to memory
// for this page: signed in until reload, never persisted by accident.

export const REMEMBER_KEY = 'atlas.auth.remember.v1';

function safe(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
}

function storeOf(name) {
    return safe(() => {
        const s = globalThis[name];
        if (!s) return null;
        // Touch it: Safari's private mode exposes a store that throws on write.
        const probe = '__atlas_probe__';
        s.setItem(probe, '1'); s.removeItem(probe);
        return s;
    }, null);
}

function memoryStore() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: (k) => { m.delete(k); },
        clear: () => { m.clear(); },
    };
}

/** Keys in `store` that belong to the session under `storageKey`. */
function sessionKeysIn(store, storageKey) {
    const keys = [];
    safe(() => {
        for (let i = 0; i < store.length; i++) {
            const k = store.key(i);
            if (k === storageKey || (typeof k === 'string' && k.indexOf(storageKey + '-') === 0)) keys.push(k);
        }
    });
    return keys;
}

/**
 * The storage adapter supabase-js is given. `local` and `session` are injected
 * for tests; in the browser they are window.localStorage / sessionStorage.
 */
export function createAuthStorage({ storageKey, local = storeOf('localStorage'), session = storeOf('sessionStorage') } = {}) {
    if (typeof storageKey !== 'string' || !storageKey) throw new Error('createAuthStorage: storageKey is required');
    const memory = memoryStore();
    const remembered = () => !!local && safe(() => local.getItem(REMEMBER_KEY) === '1', false);
    const active = () => (remembered() ? local : (session || memory));
    const others = () => [local, session, memory].filter((s) => s && s !== active());

    function purge(store) {
        if (!store) return;
        if (store === memory) { memory.clear(); return; }
        sessionKeysIn(store, storageKey).forEach((k) => safe(() => store.removeItem(k)));
    }

    // A session sitting in a store it is not supposed to be in is dropped on
    // load: chiefly the localStorage session every browser held before AUTH-3.
    if (!remembered()) purge(local);

    return {
        getItem: (k) => safe(() => active().getItem(k), null),
        setItem: (k, v) => { safe(() => active().setItem(k, v)); },
        // Sign-out removes the session from every store, so no copy survives in
        // the one that is not active.
        removeItem: (k) => { [local, session, memory].forEach((s) => s && safe(() => s.removeItem(k))); },

        /** Called immediately BEFORE sign-in, so the new session lands where
         *  the person chose. Any session in the other stores is cleared. */
        setRemember(on) {
            if (local) safe(() => { if (on) local.setItem(REMEMBER_KEY, '1'); else local.removeItem(REMEMBER_KEY); });
            others().forEach(purge);
        },
        remembered,
        /** Sign-out: the next person on this machine starts unticked. */
        forget() {
            if (local) safe(() => local.removeItem(REMEMBER_KEY));
            [local, session, memory].forEach(purge);
        },
    };
}
