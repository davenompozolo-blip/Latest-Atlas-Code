// AUTH-1: the sign-in gate and landing page.
//
// No session, no terminal. The decisions live in src/lib/authGate.js; this
// file only renders them and talks to Supabase Auth. Accounts are created by
// an administrator (public sign-up is disabled in the Supabase Auth config), so
// the landing page offers sign-in and password reset, never sign-up.
//
// The visual design is a placeholder on purpose -- the brief is to get the
// mechanics right first. It reads the --nx-* tokens so it matches the shell.

import React from 'react';
import { supabase } from '../lib/supabase.js';
import {
    gateState, validateCredentials, validateNewPassword, authErrorMessage,
    isRecoveryUrl, signOutStorageKeys,
    GATE_UNCONFIGURED, GATE_LOADING, GATE_RECOVERY, GATE_SIGNED_IN,
} from '../lib/authGate.js';

const e = React.createElement;

function currentHash() {
    try { return globalThis.location ? globalThis.location.hash : ''; } catch (_) { return ''; }
}

function clearAuthFragment() {
    try {
        const loc = globalThis.location;
        if (loc && loc.hash && globalThis.history) {
            globalThis.history.replaceState(null, '', loc.pathname + loc.search);
        }
    } catch (_) { /* nothing to clear */ }
}

/** Sign this browser out and reload, so no module-level cache from the last
 *  session survives into the next one (the same reason switching accounts
 *  reloads). scope 'local' ends this device's session only. */
export async function signOut() {
    try {
        const storage = globalThis.localStorage;
        signOutStorageKeys(storage).forEach((k) => { try { storage.removeItem(k); } catch (_) { /* ignore */ } });
    } catch (_) { /* storage blocked */ }
    if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) console.error('[AuthGate] sign-out:', error.message || error);
    }
    try { globalThis.location.reload(); } catch (_) { /* not in a browser */ }
}

function useAuthSession() {
    const [st, setSt] = React.useState({ loading: !!supabase, session: null, recovery: isRecoveryUrl(currentHash()) });
    React.useEffect(() => {
        if (!supabase) return undefined;
        let live = true;
        supabase.auth.getSession().then(({ data, error }) => {
            if (!live) return;
            if (error) console.error('[AuthGate] reading the stored session:', error.message || error);
            setSt((s) => ({ ...s, loading: false, session: (data && data.session) || null }));
        });
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            if (!live) return;
            setSt((s) => ({
                loading: false,
                session: session || null,
                recovery: event === 'PASSWORD_RECOVERY' ? true : (event === 'SIGNED_OUT' ? false : s.recovery),
            }));
        });
        return () => { live = false; data && data.subscription && data.subscription.unsubscribe(); };
    }, []);
    return [st, setSt];
}

const S = {
    page: {
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--nx-bg)', color: 'var(--nx-text)', fontFamily: 'var(--nx-fb)',
        padding: 'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
    },
    card: {
        width: '100%', maxWidth: 380, background: 'var(--nx-bg2)', border: '1px solid var(--nx-border)',
        borderRadius: 'var(--nx-r-lg)', padding: '28px 24px', boxSizing: 'border-box',
    },
    mark: { fontFamily: 'var(--nx-fd)', fontWeight: 800, fontSize: 22, letterSpacing: 4, color: 'var(--nx-accent)' },
    sub: { fontSize: 13, color: 'var(--nx-text2)', margin: '6px 0 22px' },
    label: { display: 'block', fontSize: 12, color: 'var(--nx-text2)', margin: '14px 0 6px' },
    input: {
        width: '100%', boxSizing: 'border-box', padding: '11px 12px', fontSize: 16, // 16px: no iOS zoom on focus
        background: 'var(--nx-bg)', color: 'var(--nx-text)', border: '1px solid var(--nx-border-md)',
        borderRadius: 'var(--nx-r-sm)', fontFamily: 'var(--nx-fb)', outline: 'none',
    },
    button: {
        width: '100%', marginTop: 20, padding: '12px 14px', minHeight: 44, fontSize: 15, fontWeight: 600,
        border: 'none', borderRadius: 'var(--nx-r-sm)', cursor: 'pointer',
        background: 'var(--nx-accent)', color: 'var(--nx-bg)', fontFamily: 'var(--nx-fb)',
    },
    link: {
        background: 'none', border: 'none', padding: '10px 0', minHeight: 44, marginTop: 6, cursor: 'pointer',
        color: 'var(--nx-text2)', fontSize: 13, fontFamily: 'var(--nx-fb)', textDecoration: 'underline',
    },
    error: { marginTop: 14, fontSize: 13, color: 'var(--nx-red)' },
    note: { marginTop: 14, fontSize: 13, color: 'var(--nx-text2)' },
};

function Field({ id, label, ...rest }) {
    return e(React.Fragment, null,
        e('label', { htmlFor: id, style: S.label }, label),
        e('input', { id, style: S.input, ...rest }));
}

function Shell({ subtitle, children }) {
    return e('main', { style: S.page },
        e('div', { style: S.card },
            e('div', { style: S.mark }, 'ATLAS'),
            e('div', { style: S.sub }, subtitle),
            children));
}

function SignInForm() {
    const [mode, setMode] = React.useState('sign_in'); // 'sign_in' | 'reset'
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [note, setNote] = React.useState(null);

    async function onSubmit(ev) {
        ev.preventDefault();
        setError(null); setNote(null);
        const invalid = validateCredentials(email, password, { requirePassword: mode === 'sign_in' });
        if (invalid) { setError(invalid); return; }
        setBusy(true);
        try {
            if (mode === 'sign_in') {
                const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (err) { setError(authErrorMessage(err, 'sign_in')); return; }
                // onAuthStateChange carries the session to the gate.
            } else {
                const redirectTo = globalThis.location ? globalThis.location.origin + '/' : undefined;
                const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
                if (err && (err.status === 429 || err.status >= 500 || err.name === 'AuthRetryableFetchError')) {
                    setError(authErrorMessage(err, 'reset'));
                    return;
                }
                // Same sentence whether or not the address has an account.
                setNote('If that address has an Atlas account, a reset link is on its way.');
            }
        } finally {
            setBusy(false);
        }
    }

    const signIn = mode === 'sign_in';
    return e(Shell, { subtitle: signIn ? 'Sign in to your terminal' : 'Reset your password' },
        e('form', { onSubmit, noValidate: true },
            e(Field, {
                id: 'atlas-email', label: 'Email', type: 'email', value: email,
                autoComplete: 'username', inputMode: 'email', enterKeyHint: signIn ? 'next' : 'send',
                autoCapitalize: 'none', spellCheck: false, onChange: (ev) => setEmail(ev.target.value),
            }),
            signIn && e(Field, {
                id: 'atlas-password', label: 'Password', type: 'password', value: password,
                autoComplete: 'current-password', enterKeyHint: 'go',
                onChange: (ev) => setPassword(ev.target.value),
            }),
            e('button', { type: 'submit', style: { ...S.button, opacity: busy ? 0.6 : 1 }, disabled: busy },
                busy ? 'Please wait…' : (signIn ? 'Sign in' : 'Send reset link')),
            error && e('div', { role: 'alert', style: S.error }, error),
            note && e('div', { role: 'status', style: S.note }, note),
            e('button', {
                type: 'button', style: S.link,
                onClick: () => { setMode(signIn ? 'reset' : 'sign_in'); setError(null); setNote(null); },
            }, signIn ? 'Forgot your password?' : 'Back to sign in')));
}

function NewPasswordForm({ onDone }) {
    const [password, setPassword] = React.useState('');
    const [confirm, setConfirm] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);

    async function onSubmit(ev) {
        ev.preventDefault();
        setError(null);
        const invalid = validateNewPassword(password, confirm);
        if (invalid) { setError(invalid); return; }
        setBusy(true);
        try {
            const { error: err } = await supabase.auth.updateUser({ password });
            if (err) { setError(authErrorMessage(err, 'update_password')); return; }
            clearAuthFragment();
            onDone();
        } finally {
            setBusy(false);
        }
    }

    return e(Shell, { subtitle: 'Choose a new password' },
        e('form', { onSubmit, noValidate: true },
            e(Field, {
                id: 'atlas-new-password', label: 'New password', type: 'password', value: password,
                autoComplete: 'new-password', enterKeyHint: 'next', onChange: (ev) => setPassword(ev.target.value),
            }),
            e(Field, {
                id: 'atlas-confirm-password', label: 'Confirm new password', type: 'password', value: confirm,
                autoComplete: 'new-password', enterKeyHint: 'go', onChange: (ev) => setConfirm(ev.target.value),
            }),
            e('button', { type: 'submit', style: { ...S.button, opacity: busy ? 0.6 : 1 }, disabled: busy },
                busy ? 'Please wait…' : 'Save password'),
            error && e('div', { role: 'alert', style: S.error }, error)));
}

export function AuthGate({ children }) {
    const [st, setSt] = useAuthSession();
    const gate = gateState({ configured: !!supabase, loading: st.loading, session: st.session, recovery: st.recovery });

    if (gate === GATE_UNCONFIGURED) {
        return e(Shell, { subtitle: 'This build has no Supabase key, so sign-in is unavailable.' },
            e('div', { style: S.note }, 'Set VITE_SUPABASE_ANON_KEY and rebuild.'));
    }
    if (gate === GATE_LOADING) {
        return e('main', { style: S.page, 'aria-busy': 'true' }, e('div', { style: S.mark }, 'ATLAS'));
    }
    if (gate === GATE_RECOVERY) {
        return e(NewPasswordForm, { onDone: () => setSt((s) => ({ ...s, recovery: false })) });
    }
    if (gate === GATE_SIGNED_IN) return children;
    return e(SignInForm, null);
}

/** Topbar control: who is signed in, and the way out. */
export function SignOutButton() {
    const [email, setEmail] = React.useState(null);
    React.useEffect(() => {
        if (!supabase) return;
        supabase.auth.getUser().then(({ data }) => setEmail((data && data.user && data.user.email) || null));
    }, []);
    return e('button', {
        type: 'button', onClick: () => { signOut(); },
        title: email ? 'Signed in as ' + email : 'Sign out',
        style: {
            marginRight: 12, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
            border: '1px solid var(--nx-border)', background: 'transparent', color: 'var(--nx-text2)',
            fontFamily: 'var(--nx-fb)', fontSize: 10, letterSpacing: 0.5,
        },
    }, 'SIGN OUT');
}
