// ONB-2: the onboarding screens, and the gate that picks between them.
//
// The database names the step (atlas_my_onboarding, ONB-1); the gate renders
// the screen for it and nothing else -- there is no way to skip ahead to the
// broker form while pending, because the form is only ever rendered for the
// connect_broker step. A failed read is a retry screen, never the terminal.
//
//   details            first name + surname
//   awaiting_approval  "You're on the list"; moves on by itself when approved
//   connect_broker     the ON-1 connect form (keys verified with Alpaca, Vault)
//   first_sync         waits for the first account snapshot; after 3 minutes
//                      says so, with the last failed sync for their account
//   revoked            plain message, sign out
//   ready              the terminal

import React from 'react';
import { supabase } from '../lib/supabase.js';
import {
    getOnboardingState, saveDetails, watchStep, validateDetails, syncIsSlow,
    STEP_DETAILS, STEP_AWAITING, STEP_CONNECT, STEP_FIRST_SYNC, STEP_READY, STEP_REVOKED, STEP_SIGN_IN,
} from '../lib/onboarding/nextStep.js';
import { AuthBackdrop } from './auth/AuthBackdrop.js';
import { AtlasWordmark } from './auth/AtlasWordmark.js';
import { Field, SubmitButton, Shell } from './auth/AuthFormParts.js';
import { ConnectBrokerForm } from './Onboarding.js';
import '../styles/onboarding.css';

const e = React.createElement;

function SignOutLink({ onSignOut }) {
    return e('div', { className: 'ag-row-center' },
        e('button', { type: 'button', className: 'ag-link', onClick: onSignOut }, 'Sign out'));
}

function Loading() {
    return e('main', { className: 'ag-page ag-page--loading', 'aria-busy': 'true' },
        e(AuthBackdrop, null), e(AtlasWordmark, { className: 'ag-loading-mark' }));
}

/** Re-read the state on an interval while this screen is showing. */
function useWatch(step, onChange) {
    React.useEffect(() => {
        if (!supabase) return undefined;
        return watchStep(supabase, step, onChange);
    }, [step]);
}

function DetailsScreen({ state, onNext, onSignOut }) {
    const [first, setFirst] = React.useState(state.first_name || '');
    const [surname, setSurname] = React.useState(state.surname || '');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);

    async function onSubmit(ev) {
        ev.preventDefault();
        setError(null);
        const invalid = validateDetails(first, surname);
        if (invalid) { setError(invalid); return; }
        setBusy(true);
        try {
            onNext(await saveDetails(supabase, first, surname));
        } catch (err) {
            console.error('[Welcome] saving details:', err.message || err);
            setError('Your name could not be saved. Try again.');
        } finally {
            setBusy(false);
        }
    }

    return e(Shell, { title: 'Welcome to Atlas', subtitle: 'Tell us who you are. An administrator approves each new account.' },
        e('form', { onSubmit, noValidate: true, className: 'ag-form' },
            e(Field, {
                id: 'ob-first', label: 'First name', value: first, autoComplete: 'given-name',
                maxLength: 80, onChange: (ev) => setFirst(ev.target.value),
            }),
            e(Field, {
                id: 'ob-surname', label: 'Surname', value: surname, autoComplete: 'family-name',
                maxLength: 80, onChange: (ev) => setSurname(ev.target.value),
            }),
            e(SubmitButton, { busy, busyLabel: 'Saving…', label: 'Continue', arrow: true }),
            error && e('div', { role: 'alert', className: 'ag-error' }, error)),
        e(SignOutLink, { onSignOut }));
}

function WaitingScreen({ state, onNext, onSignOut }) {
    useWatch(STEP_AWAITING, onNext);
    return e(Shell, { title: 'You’re on the list', subtitle: null },
        e('div', { className: 'ag-form', role: 'status' },
            e('p', { className: 'ob-hint' },
                'An administrator approves each new account. This page moves on by itself once you’re approved, ',
                'and the next time you sign in you’ll pick up from here.'),
            state.email && e('p', { className: 'ob-hint' }, 'Signed in as ' + state.email + '.')),
        e(SignOutLink, { onSignOut }));
}

function ConnectScreen({ onNext, onSignOut }) {
    async function connected() {
        // The database moves the step on (broker_connected_at); read it back
        // rather than assuming where the person goes.
        try { onNext(await getOnboardingState(supabase)); } catch (_) { onNext(null); }
    }
    return e(Shell, { title: 'Connect your broker', subtitle: 'Atlas reads your book from your broker. Start with one account; you can add more later.' },
        e(ConnectBrokerForm, { onConnected: connected }),
        e('p', { className: 'ob-hint' },
            'Your keys are in the ',
            e('a', { href: 'https://app.alpaca.markets/', target: '_blank', rel: 'noopener noreferrer' }, 'Alpaca dashboard'),
            ', under API Keys on the account\u2019s home page. Paper keys start PK, live keys start AK.'),
        e(SignOutLink, { onSignOut }));
}

async function lastSyncFailure() {
    const { data, error } = await supabase.from('sync_log')
        .select('function_name,status,error_message,started_at')
        .not('portfolio_id', 'is', null)
        .in('status', ['error', 'failed', 'partial'])
        .order('started_at', { ascending: false })
        .limit(1);
    if (error) {
        console.error('[Welcome] reading sync_log:', error.message || error);
        return { failed: true };
    }
    return { row: (data && data[0]) || null };
}

function SyncingScreen({ state, onNext, onSignOut }) {
    useWatch(STEP_FIRST_SYNC, onNext);
    const [now, setNow] = React.useState(Date.now());
    const [failure, setFailure] = React.useState(null);
    React.useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(t);
    }, []);
    const slow = syncIsSlow(state.broker_connected_at, now);
    React.useEffect(() => {
        if (!slow) return undefined;
        let live = true;
        lastSyncFailure().then((r) => { if (live) setFailure(r); });
        return () => { live = false; };
    }, [slow, Math.floor(now / 30000)]);

    let detail = null;
    if (slow && failure) {
        if (failure.failed) detail = 'The sync log could not be read, so Atlas cannot say why yet.';
        else if (failure.row) detail = 'Last error (' + (failure.row.function_name || 'sync') + '): ' + (failure.row.error_message || failure.row.status);
        else detail = 'No sync has failed; the broker may simply be slow to answer.';
    }
    return e(Shell, { title: slow ? 'Taking longer than usual' : 'Reading your account', subtitle: null },
        e('div', { className: 'ag-form', role: 'status', 'aria-live': 'polite' },
            e('p', { className: 'ob-hint' },
                slow
                    ? 'Your broker is connected, but the first sync has not finished. This page keeps checking.'
                    : 'Your broker is connected. Atlas is reading your positions; this usually takes under a minute.'),
            detail && e('p', { className: 'ob-hint' }, detail)),
        e(SignOutLink, { onSignOut }));
}

function RevokedScreen({ onSignOut }) {
    return e(Shell, { title: 'Access removed', subtitle: 'Your access to Atlas has been removed. If you think this is a mistake, contact the administrator.' },
        e('div', { className: 'ag-form' },
            e('button', { type: 'button', className: 'ag-submit', onClick: onSignOut }, 'Sign out')));
}

function FailedScreen({ onRetry, onSignOut }) {
    return e(Shell, { title: 'Your account did not load', subtitle: 'Atlas could not read where your account is up to. Nothing is wrong with it.' },
        e('div', { className: 'ag-form' },
            e('button', { type: 'button', className: 'ag-submit', onClick: onRetry }, 'Try again')),
        e(SignOutLink, { onSignOut }));
}

/** The route guard: renders the terminal only on `ready`. */
export function WelcomeGate({ children, onSignOut }) {
    const [st, setSt] = React.useState({ loading: true, state: null, failed: false });
    const [attempt, setAttempt] = React.useState(0);

    React.useEffect(() => {
        let live = true;
        setSt((s) => ({ ...s, loading: true }));
        getOnboardingState(supabase)
            .then((state) => { if (live) setSt({ loading: false, state, failed: false }); })
            .catch(() => { if (live) setSt({ loading: false, state: null, failed: true }); });
        return () => { live = false; };
    }, [attempt]);

    const next = (state) => {
        if (state) setSt({ loading: false, state, failed: false });
        else setAttempt((n) => n + 1);
    };
    const retry = () => setAttempt((n) => n + 1);

    if (st.loading && !st.state) return e(Loading, null);
    if (st.failed || !st.state) return e(FailedScreen, { onRetry: retry, onSignOut });
    const s = st.state;
    switch (s.next_step) {
        case STEP_READY: return children;
        case STEP_DETAILS: return e(DetailsScreen, { state: s, onNext: next, onSignOut });
        case STEP_AWAITING: return e(WaitingScreen, { state: s, onNext: next, onSignOut });
        case STEP_CONNECT: return e(ConnectScreen, { onNext: next, onSignOut });
        case STEP_FIRST_SYNC: return e(SyncingScreen, { state: s, onNext: next, onSignOut });
        case STEP_REVOKED: return e(RevokedScreen, { onSignOut });
        case STEP_SIGN_IN: return e(FailedScreen, { onRetry: retry, onSignOut });
        default: return e(FailedScreen, { onRetry: retry, onSignOut });
    }
}
