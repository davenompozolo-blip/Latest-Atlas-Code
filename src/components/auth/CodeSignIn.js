// ONB-2: sign in with a one-time email code.
//
// Email -> signInWithOtp (shouldCreateUser: a new address becomes a pending
// account, ONB-1) -> the code from the email -> verifyOtp. Every address gets
// the same sentence on success, so the form says nothing about who has an
// account. Whether the person then reaches the terminal is a status on their
// account row, decided by WelcomeGate -- not by this form.
//
// Turnstile renders only when VITE_TURNSTILE_SITE_KEY is set at build time
// (Supabase Auth -> Attack protection must then be on with the same provider).

import React from 'react';
import { supabase } from '../../lib/supabase.js';
import {
    validateEmail, validateCode, normaliseCode, resendWaitSeconds, codeErrorMessage,
} from '../../lib/onboarding/nextStep.js';
import { Field, SubmitButton, Shell } from './AuthFormParts.js';

const e = React.createElement;

const TURNSTILE_SITE_KEY = (import.meta.env && import.meta.env.VITE_TURNSTILE_SITE_KEY) || '';
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let turnstileLoad = null;

function loadTurnstile() {
    if (turnstileLoad) return turnstileLoad;
    turnstileLoad = new Promise((resolve, reject) => {
        if (globalThis.turnstile) { resolve(globalThis.turnstile); return; }
        const s = document.createElement('script');
        s.src = TURNSTILE_SRC; s.async = true; s.defer = true;
        s.onload = () => (globalThis.turnstile ? resolve(globalThis.turnstile) : reject(new Error('turnstile missing')));
        s.onerror = () => { turnstileLoad = null; reject(new Error('turnstile failed to load')); };
        document.head.appendChild(s);
    });
    return turnstileLoad;
}

/** The captcha widget. Calls onToken with a fresh token, or null when it expires. */
function Turnstile({ onToken, resetKey }) {
    const ref = React.useRef(null);
    const idRef = React.useRef(null);
    const [failed, setFailed] = React.useState(false);
    React.useEffect(() => {
        let live = true;
        loadTurnstile().then((ts) => {
            if (!live || !ref.current) return;
            idRef.current = ts.render(ref.current, {
                sitekey: TURNSTILE_SITE_KEY, theme: 'dark',
                callback: (t) => onToken(t),
                'expired-callback': () => onToken(null),
                'error-callback': () => onToken(null),
            });
        }).catch((err) => {
            console.error('[CodeSignIn] Turnstile:', err.message || err);
            if (live) setFailed(true);
        });
        return () => {
            live = false;
            try { if (idRef.current != null && globalThis.turnstile) globalThis.turnstile.remove(idRef.current); } catch (_) { /* gone */ }
        };
    }, []);
    // A token is single-use: reset after each request so the next one is fresh.
    React.useEffect(() => {
        if (resetKey && idRef.current != null && globalThis.turnstile) {
            try { globalThis.turnstile.reset(idRef.current); } catch (_) { /* gone */ }
            onToken(null);
        }
    }, [resetKey]);
    if (failed) return e('div', { className: 'ag-error', role: 'alert' }, 'The security check could not load. Reload the page.');
    return e('div', { ref, className: 'ob-captcha' });
}

export function CodeSignInForm({ onUsePassword }) {
    const [phase, setPhase] = React.useState('email');   // 'email' | 'code'
    const [email, setEmail] = React.useState('');
    const [code, setCode] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [sentAt, setSentAt] = React.useState(null);
    const [now, setNow] = React.useState(Date.now());
    const [captcha, setCaptcha] = React.useState(null);
    const [captchaReset, setCaptchaReset] = React.useState(0);
    const needCaptcha = !!TURNSTILE_SITE_KEY;

    React.useEffect(() => {
        if (phase !== 'code') return undefined;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [phase]);

    async function sendCode() {
        setError(null);
        const invalid = validateEmail(email);
        if (invalid) { setError(invalid); return false; }
        if (needCaptcha && !captcha) { setError('Complete the security check first.'); return false; }
        setBusy(true);
        try {
            const options = { shouldCreateUser: true };
            if (needCaptcha) options.captchaToken = captcha;
            const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim(), options });
            if (needCaptcha) setCaptchaReset((n) => n + 1);
            if (err) {
                console.error('[CodeSignIn] signInWithOtp:', err.status, err.code || '', err.message || '');
                setError(codeErrorMessage(err, 'send'));
                return false;
            }
            setSentAt(Date.now()); setNow(Date.now());
            setPhase('code');
            return true;
        } finally {
            setBusy(false);
        }
    }

    async function onSubmitEmail(ev) { ev.preventDefault(); await sendCode(); }

    async function onSubmitCode(ev) {
        ev.preventDefault();
        setError(null);
        const invalid = validateCode(code);
        if (invalid) { setError(invalid); return; }
        setBusy(true);
        try {
            const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: normaliseCode(code), type: 'email' });
            if (err) {
                console.error('[CodeSignIn] verifyOtp:', err.status, err.code || '', err.message || '');
                setError(codeErrorMessage(err, 'verify'));
                return;
            }
            // onAuthStateChange carries the session to the gate, which asks the
            // database where this person goes next.
        } finally {
            setBusy(false);
        }
    }

    const wait = resendWaitSeconds(sentAt, now);
    const passwordLink = onUsePassword && e('div', { className: 'ag-row-center' },
        e('button', { type: 'button', className: 'ag-link', onClick: onUsePassword }, 'Sign in with a password instead'));

    if (phase === 'code') {
        return e(Shell, { title: 'Check your email', subtitle: 'We’ve sent a code to ' + email.trim() + '.' },
            e('form', { onSubmit: onSubmitCode, noValidate: true, className: 'ag-form' },
                e(Field, {
                    id: 'atlas-code', label: 'Sign-in code', icon: 'lock', value: code, placeholder: '123456',
                    autoComplete: 'one-time-code', inputMode: 'numeric', enterKeyHint: 'go', autoFocus: true,
                    maxLength: 14, onChange: (ev) => setCode(ev.target.value),
                }),
                e(SubmitButton, { busy, busyLabel: 'Checking…', label: 'Sign in', arrow: true }),
                error && e('div', { role: 'alert', className: 'ag-error' }, error),
                needCaptcha && wait === 0 && e(Turnstile, { onToken: setCaptcha, resetKey: captchaReset }),
                e('div', { className: 'ag-row-center' },
                    e('button', {
                        type: 'button', className: 'ag-link', disabled: busy || wait > 0,
                        onClick: () => { setCode(''); sendCode(); },
                    }, wait > 0 ? 'Send a new code in ' + wait + ' s' : 'Send a new code')),
                e('div', { className: 'ag-row-center' },
                    e('button', {
                        type: 'button', className: 'ag-link',
                        onClick: () => { setPhase('email'); setCode(''); setError(null); },
                    }, 'Use a different email'))));
    }

    return e(Shell, { title: 'Sign in to Atlas', subtitle: 'Enter your email and we’ll send you a code. New here? The same code starts your account.' },
        e('form', { onSubmit: onSubmitEmail, noValidate: true, className: 'ag-form' },
            e(Field, {
                id: 'atlas-email', label: 'Email address', icon: 'mail', type: 'email', value: email,
                placeholder: 'you@domain.com', autoComplete: 'email', inputMode: 'email', enterKeyHint: 'send',
                autoCapitalize: 'none', spellCheck: false, onChange: (ev) => setEmail(ev.target.value),
            }),
            needCaptcha && e(Turnstile, { onToken: setCaptcha, resetKey: captchaReset }),
            e(SubmitButton, { busy, busyLabel: 'Sending…', label: 'Send code', arrow: true }),
            error && e('div', { role: 'alert', className: 'ag-error' }, error),
            passwordLink));
}
