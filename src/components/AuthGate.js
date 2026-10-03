// AUTH-1: the sign-in gate and landing page.
//
// No session, no terminal. The decisions live in src/lib/authGate.js; this
// file only renders them and talks to Supabase Auth. Access is invite-only
// (ON-1): public sign-up is disabled in the Supabase Auth config, an
// administrator creates a person and hands them a one-time link, and the link
// opens the set-password form below. The landing page itself offers sign-in
// and password reset, never sign-up.
//
// Layout: scene (auth/AuthBackdrop), brand panel, the glass card, capability
// rail -- the pieces live in ./auth/. The scene is seeded geometry from
// src/lib/authBackdrop.js and carries no figures. Colours are the --nx-*
// tokens so it matches the shell. Two things in the design reference are left
// out on purpose: "Remember me" (supabase-js already keeps the session until
// sign-out, so the box would change nothing) and SSO (none is configured).

import React from 'react';
import { supabase } from '../lib/supabase.js';
import {
    gateState, validateCredentials, validateNewPassword, authErrorMessage,
    signOutStorageKeys, sessionStorageKeys, recoveryPending, authChangeNeedsReload,
    RECOVERY_MARKER_KEY, SETUP_KIND_KEY, PASSWORD_MIN_LENGTH, passwordSetupKind,
    GATE_UNCONFIGURED, GATE_LOADING, GATE_RECOVERY, GATE_SIGNED_IN,
} from '../lib/authGate.js';
import { AuthBackdrop } from './auth/AuthBackdrop.js';
import { AtlasWordmark } from './auth/AtlasWordmark.js';
import { Field, PasswordField, SubmitButton, Shell } from './auth/AuthFormParts.js';
import { WelcomeGate } from './Welcome.js';
import { CodeSignInForm } from './auth/CodeSignIn.js';
import '../styles/auth-gate.css';

const e = React.createElement;

// Read once, at module load. supabase-js consumes the URL fragment of an
// invite or reset link while it initialises, which can finish before the
// first effect runs; module evaluation always comes first.
const INITIAL_HASH = currentHash();

function readKind() {
    try { return globalThis.sessionStorage ? globalThis.sessionStorage.getItem(SETUP_KIND_KEY) : null; } catch (_) { return null; }
}

function writeKind(kind) {
    try {
        const ss = globalThis.sessionStorage;
        if (!ss) return;
        if (kind) ss.setItem(SETUP_KIND_KEY, kind);
        else ss.removeItem(SETUP_KIND_KEY);
    } catch (_) { /* wording only */ }
}

function currentHash() {
    try { return globalThis.location ? globalThis.location.hash : ''; } catch (_) { return ''; }
}

function readMarker() {
    try { return globalThis.sessionStorage ? globalThis.sessionStorage.getItem(RECOVERY_MARKER_KEY) : null; } catch (_) { return null; }
}

function writeMarker(userId) {
    try {
        const ss = globalThis.sessionStorage;
        if (!ss) return;
        if (userId) ss.setItem(RECOVERY_MARKER_KEY, userId);
        else ss.removeItem(RECOVERY_MARKER_KEY);
    } catch (_) { /* storage blocked: the fragment still covers the first load */ }
}

function reloadPage() {
    try { globalThis.location.reload(); } catch (_) { /* not in a browser */ }
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
    writeMarker(null);
    if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) {
            // auth-js keeps the stored session when the revoke request fails
            // (a 503, a dropped connection). Remove it here, or the reload
            // below would land the user straight back inside the terminal.
            console.error('[AuthGate] sign-out refused by the server; clearing this device\'s session:', error.message || error);
            try {
                const storage = globalThis.localStorage;
                sessionStorageKeys(storage, supabase.auth.storageKey).forEach((k) => {
                    try { storage.removeItem(k); } catch (_) { /* ignore */ }
                });
            } catch (_) { /* storage blocked */ }
        }
    }
    reloadPage();
}

function useAuthSession() {
    const [st, setSt] = React.useState({ loading: !!supabase, session: null, recovery: false, setupKind: null });
    const userRef = React.useRef(null);
    React.useEffect(() => {
        if (!supabase) return undefined;
        let live = true;
        const hash = INITIAL_HASH || currentHash();
        const uidOf = (sess) => (sess && sess.user && sess.user.id) || null;
        supabase.auth.getSession().then(({ data, error }) => {
            if (!live) return;
            if (error) console.error('[AuthGate] reading the stored session:', error.message || error);
            const session = (data && data.session) || null;
            const recovery = recoveryPending({ hash, marker: readMarker(), session });
            const kind = passwordSetupKind(hash) || readKind() || 'recovery';
            if (recovery && uidOf(session)) { writeMarker(uidOf(session)); writeKind(kind); }
            userRef.current = uidOf(session);
            setSt({ loading: false, session, recovery, setupKind: recovery ? kind : null });
        });
        const { data } = supabase.auth.onAuthStateChange((event, session) => {
            if (!live) return;
            const next = uidOf(session);
            // Another tab signing out or in reaches this tab too. Module-level
            // loader caches hold the previous user's book, so a change of user
            // reloads rather than re-rendering over them.
            if (authChangeNeedsReload(userRef.current, event, next)) {
                writeMarker(null);
                reloadPage();
                return;
            }
            userRef.current = next;
            if (event === 'PASSWORD_RECOVERY' && next) { writeMarker(next); writeKind('recovery'); }
            setSt((s) => ({
                loading: false,
                session: session || null,
                recovery: event === 'PASSWORD_RECOVERY' ? true : s.recovery,
                setupKind: event === 'PASSWORD_RECOVERY' ? 'recovery' : s.setupKind,
            }));
        });
        return () => { live = false; data && data.subscription && data.subscription.unsubscribe(); };
    }, []);
    return [st, setSt];
}

function SignInForm({ onUseCode }) {
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
    const toggle = e('button', {
        type: 'button', className: 'ag-link',
        onClick: () => { setMode(signIn ? 'reset' : 'sign_in'); setError(null); setNote(null); },
    }, signIn ? 'Forgot your password?' : 'Back to sign in');
    return e(Shell, signIn
        ? { title: 'Welcome back', subtitle: 'Sign in to your terminal' }
        : { title: 'Reset your password', subtitle: 'We\u2019ll email you a link to choose a new one.' },
        e('form', { onSubmit, noValidate: true, className: 'ag-form' },
            e(Field, {
                id: 'atlas-email', label: 'Email address', icon: 'mail', type: 'email', value: email,
                placeholder: 'you@domain.com',
                autoComplete: 'username', inputMode: 'email', enterKeyHint: signIn ? 'next' : 'send',
                autoCapitalize: 'none', spellCheck: false, onChange: (ev) => setEmail(ev.target.value),
            }),
            signIn && e(PasswordField, {
                id: 'atlas-password', label: 'Password', value: password, placeholder: 'Enter your password',
                autoComplete: 'current-password', enterKeyHint: 'go',
                onChange: (ev) => setPassword(ev.target.value),
            }),
            signIn && e('div', { className: 'ag-row-end' }, toggle),
            e(SubmitButton, {
                busy, arrow: true,
                busyLabel: signIn ? 'Signing in\u2026' : 'Sending\u2026',
                label: signIn ? 'Sign in' : 'Send reset link',
            }),
            error && e('div', { role: 'alert', className: 'ag-error' }, error),
            note && e('div', { role: 'status', className: 'ag-note' }, note),
            // No email server is configured (ON-1), so a reset email reaches
            // only the project's own team; everyone else needs the admin.
            !signIn && note && e('div', { className: 'ag-note' },
                'Nothing arriving? Ask your administrator for a link to set a new password.'),
            !signIn && e('div', { className: 'ag-row-center' }, toggle),
            signIn && onUseCode && e('div', { className: 'ag-row-center' },
                e('button', { type: 'button', className: 'ag-link', onClick: onUseCode },
                    'Sign in with an email code instead'))));
}

function NewPasswordForm({ onDone, kind }) {
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
            writeMarker(null);
            writeKind(null);
            onDone();
        } finally {
            setBusy(false);
        }
    }

    const invited = kind === 'invite';
    return e(Shell, invited
        ? { title: 'Welcome to Atlas', subtitle: 'Choose a password for your account. At least ' + PASSWORD_MIN_LENGTH + ' characters.' }
        : { title: 'Choose a new password', subtitle: 'At least ' + PASSWORD_MIN_LENGTH + ' characters.' },
        e('form', { onSubmit, noValidate: true, className: 'ag-form' },
            e(PasswordField, {
                id: 'atlas-new-password', label: 'New password', value: password,
                autoComplete: 'new-password', enterKeyHint: 'next', onChange: (ev) => setPassword(ev.target.value),
            }),
            e(PasswordField, {
                id: 'atlas-confirm-password', label: 'Confirm new password', value: confirm,
                autoComplete: 'new-password', enterKeyHint: 'go', onChange: (ev) => setConfirm(ev.target.value),
            }),
            e(SubmitButton, { busy, busyLabel: 'Saving\u2026', label: invited ? 'Set password and continue' : 'Save password', arrow: true }),
            error && e('div', { role: 'alert', className: 'ag-error' }, error)));
}

// ONB-2: a one-time email code is the way in. The password form stays for
// accounts that already have a password (?password=1, or the link under the
// code form) until ONB-4 removes it.
function wantsPassword() {
    try { return new URLSearchParams(globalThis.location.search).get('password') === '1'; } catch (_) { return false; }
}

function SignInScreen() {
    const [password, setPassword] = React.useState(wantsPassword);
    if (password) return e(SignInForm, { onUseCode: () => setPassword(false) });
    return e(CodeSignInForm, { onUsePassword: () => setPassword(true) });
}

export function AuthGate({ children }) {
    const [st, setSt] = useAuthSession();
    const gate = gateState({ configured: !!supabase, loading: st.loading, session: st.session, recovery: st.recovery });

    if (gate === GATE_UNCONFIGURED) {
        return e(Shell, { title: 'Sign-in unavailable', subtitle: 'This build has no Supabase key.' },
            e('div', { className: 'ag-note' }, 'Set VITE_SUPABASE_ANON_KEY and rebuild.'));
    }
    if (gate === GATE_LOADING) {
        return e('main', { className: 'ag-page ag-page--loading', 'aria-busy': 'true' },
            e(AuthBackdrop, null), e(AtlasWordmark, { className: 'ag-loading-mark' }));
    }
    if (gate === GATE_RECOVERY) {
        return e(NewPasswordForm, { kind: st.setupKind, onDone: () => setSt((s) => ({ ...s, recovery: false, setupKind: null })) });
    }
    // ON-1: signed in is not set up. A person with no portfolio connects a
    // broker account before the terminal renders.
    // ONB-2: signed in is not let in. The database names the step (details,
    // approval, broker, first sync) and WelcomeGate renders only that screen.
    if (gate === GATE_SIGNED_IN) return e(WelcomeGate, { onSignOut: () => { signOut(); } }, children);
    return e(SignInScreen, null);
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
