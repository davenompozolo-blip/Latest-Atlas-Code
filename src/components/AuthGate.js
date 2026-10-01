// AUTH-1: the sign-in gate and landing page.
//
// No session, no terminal. The decisions live in src/lib/authGate.js; this
// file only renders them and talks to Supabase Auth. Accounts are created by
// an administrator (public sign-up is disabled in the Supabase Auth config), so
// the landing page offers sign-in and password reset, never sign-up.
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
    RECOVERY_MARKER_KEY, PASSWORD_MIN_LENGTH,
    GATE_UNCONFIGURED, GATE_LOADING, GATE_RECOVERY, GATE_SIGNED_IN,
} from '../lib/authGate.js';
import { AuthBackdrop } from './auth/AuthBackdrop.js';
import { AuthBrandPanel } from './auth/AuthBrandPanel.js';
import { CapabilityRail } from './auth/CapabilityRail.js';
import { AtlasWordmark } from './auth/AtlasWordmark.js';
import { AuthIcon } from './auth/AuthIcons.js';
import '../styles/auth-gate.css';

const e = React.createElement;

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
    const [st, setSt] = React.useState({ loading: !!supabase, session: null, recovery: false });
    const userRef = React.useRef(null);
    React.useEffect(() => {
        if (!supabase) return undefined;
        let live = true;
        const hash = currentHash();
        const uidOf = (sess) => (sess && sess.user && sess.user.id) || null;
        supabase.auth.getSession().then(({ data, error }) => {
            if (!live) return;
            if (error) console.error('[AuthGate] reading the stored session:', error.message || error);
            const session = (data && data.session) || null;
            const recovery = recoveryPending({ hash, marker: readMarker(), session });
            if (recovery && uidOf(session)) writeMarker(uidOf(session));
            userRef.current = uidOf(session);
            setSt({ loading: false, session, recovery });
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
            if (event === 'PASSWORD_RECOVERY' && next) writeMarker(next);
            setSt((s) => ({
                loading: false,
                session: session || null,
                recovery: event === 'PASSWORD_RECOVERY' ? true : s.recovery,
            }));
        });
        return () => { live = false; data && data.subscription && data.subscription.unsubscribe(); };
    }, []);
    return [st, setSt];
}

function Field({ id, label, icon, ...rest }) {
    return e('div', { className: 'ag-field' },
        e('label', { htmlFor: id, className: 'ag-label' }, label),
        e('div', { className: 'ag-input-wrap' },
            icon && e(AuthIcon, { name: icon, size: 19, className: 'ag-input-icon' }),
            e('input', { id, className: 'ag-input' + (icon ? ' ag-input--icon' : ''), ...rest })));
}

const EYE = 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z';
const EYE_OFF = 'M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2';

function EyeIcon({ open }) {
    return e('svg', {
        width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
    },
        e('path', { d: open ? EYE : EYE_OFF }),
        open && e('circle', { cx: 12, cy: 12, r: 3 }));
}

/** A password input with a show/hide control. Showing is per field and resets
 *  when the form unmounts; the browser's password manager still sees the field
 *  through its autocomplete hint either way. */
function PasswordField({ id, label, ...rest }) {
    const [shown, setShown] = React.useState(false);
    return e('div', { className: 'ag-field' },
        e('label', { htmlFor: id, className: 'ag-label' }, label),
        e('div', { className: 'ag-input-wrap ag-pw' },
            e(AuthIcon, { name: 'lock', size: 19, className: 'ag-input-icon' }),
            e('input', {
                id, className: 'ag-input ag-input--icon', ...rest,
                type: shown ? 'text' : 'password', autoCapitalize: 'none', spellCheck: false,
            }),
            e('button', {
                type: 'button', className: 'ag-eye',
                'aria-label': shown ? 'Hide password' : 'Show password',
                'aria-pressed': shown, 'aria-controls': id,
                onClick: () => setShown((v) => !v),
            }, e(EyeIcon, { open: !shown }))));
}

function SubmitButton({ busy, busyLabel, label, arrow }) {
    return e('button', { type: 'submit', className: 'ag-submit', disabled: busy, 'aria-busy': busy || undefined },
        e('span', null, busy ? busyLabel : label),
        arrow && !busy && e(AuthIcon, { name: 'arrow', size: 18, strokeWidth: 2 }));
}

/** The glass card: wordmark, a title, a line under it, then the form. */
function AuthCard({ title, subtitle, children }) {
    return e('div', { className: 'ag-card' },
        e(AtlasWordmark, { className: 'ag-card-mark' }),
        title && e('h1', { className: 'ag-title' }, title),
        subtitle && e('p', { className: 'ag-sub' }, subtitle),
        children,
        e('div', { className: 'ag-foot' },
            'PORTFOLIO', e('span', { 'aria-hidden': 'true' }, ' \u2022 '),
            'RISK', e('span', { 'aria-hidden': 'true' }, ' \u2022 '), 'RESEARCH'));
}

/** The landing page: scene, brand panel, card, capability rail. */
function Shell(props) {
    return e('main', { className: 'ag-page' },
        e(AuthBackdrop, null),
        e(AuthBrandPanel, null),
        e(AuthCard, props),
        e(CapabilityRail, null));
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
            !signIn && e('div', { className: 'ag-row-center' }, toggle)));
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
            writeMarker(null);
            onDone();
        } finally {
            setBusy(false);
        }
    }

    return e(Shell, { title: 'Choose a new password', subtitle: 'At least ' + PASSWORD_MIN_LENGTH + ' characters.' },
        e('form', { onSubmit, noValidate: true, className: 'ag-form' },
            e(PasswordField, {
                id: 'atlas-new-password', label: 'New password', value: password,
                autoComplete: 'new-password', enterKeyHint: 'next', onChange: (ev) => setPassword(ev.target.value),
            }),
            e(PasswordField, {
                id: 'atlas-confirm-password', label: 'Confirm new password', value: confirm,
                autoComplete: 'new-password', enterKeyHint: 'go', onChange: (ev) => setConfirm(ev.target.value),
            }),
            e(SubmitButton, { busy, busyLabel: 'Saving\u2026', label: 'Save password', arrow: true }),
            error && e('div', { role: 'alert', className: 'ag-error' }, error)));
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
