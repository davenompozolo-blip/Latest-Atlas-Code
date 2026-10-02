// ON-1: invite-only onboarding, the browser half.
//
//   OnboardingGate   signed in with no portfolio -> connect a broker account
//                    before the terminal renders. A failed read of the account
//                    list is a retry screen, never the connect form.
//   ConnectBrokerForm  broker (Alpaca for now), name, paper/live, key pair.
//                    Posts to /api/onboarding?action=connect; the keys are
//                    verified against the broker server-side, stored in Vault
//                    and never come back.
//   AccountsButton   topbar: connect another account, and for an
//                    administrator, invite someone (a one-time link to hand
//                    over -- no email server is configured).
//
// Decisions live in src/lib/onboarding.js. Form pieces are the landing page's
// (auth/AuthFormParts.js), so the first screen a new person sees after setting
// a password is the same design as the one before it.

import React from 'react';
import { supabase } from '../lib/supabase.js';
import { writeStoredPortfolio } from '../lib/activePortfolio.js';
import {
    onboardingState, validateConnectForm, onboardingErrorMessage, accountCapLine,
    canConnectMore, inviteResultText, validateAccessRequest, accountsButtonLabel,
    ACCESS_REQUEST_REPLY, ACCESS_NOTE_MAX,
    ONBOARD_LOADING, ONBOARD_FAILED, ONBOARD_NEEDS_ACCOUNT,
} from '../lib/onboarding.js';
import { BROKERS } from '../lib/brokerOnboarding.js';
import { AuthBackdrop } from './auth/AuthBackdrop.js';
import { AtlasWordmark } from './auth/AtlasWordmark.js';
import { Field, PasswordField, SubmitButton, Shell } from './auth/AuthFormParts.js';
import '../styles/onboarding.css';

const e = React.createElement;

function reloadPage() {
    try { globalThis.location.reload(); } catch (_) { /* not in a browser */ }
}

/** The caller's portfolios and access facts. Both through the user's own
 *  session, so the database decides what they see. */
async function readAccess() {
    if (!supabase) return { error: 'no Supabase client', portfolios: null, access: null };
    const [p, a] = await Promise.all([
        supabase.from('vw_portfolios').select('id,name'),
        supabase.rpc('atlas_my_access'),
    ]);
    if (p.error) console.error('[Onboarding] vw_portfolios:', p.error.message || p.error);
    if (a.error) console.error('[Onboarding] atlas_my_access:', a.error.message || a.error);
    return {
        error: p.error ? (p.error.message || String(p.error)) : null,
        portfolios: p.error ? null : (p.data || []),
        // Access facts only gate the administrator's controls and the cap
        // line; their failure must not hide the terminal.
        access: a.error ? null : ((a.data && a.data[0]) || null),
    };
}

async function postOnboarding(action, body) {
    let r;
    try {
        r = await fetch('/api/onboarding?action=' + action, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
    } catch (err) {
        return { ok: false, status: 0, body: null };
    }
    let out = null;
    try { out = await r.json(); } catch (_) { out = null; }
    return { ok: r.ok, status: r.status, body: out };
}

/* ----------------------------------------------------------- connect form */

function Segmented({ name, value, options, onChange, label }) {
    return e('div', { className: 'ag-field' },
        e('div', { className: 'ag-label', id: name + '-label' }, label),
        e('div', { className: 'ob-seg', role: 'radiogroup', 'aria-labelledby': name + '-label' },
            options.map((o) => e('label', {
                key: o.value,
                className: 'ob-seg-opt' + (o.value === value ? ' is-on' : '') + (o.disabled ? ' is-off' : ''),
            },
                e('input', {
                    type: 'radio', name, value: o.value, checked: o.value === value, disabled: !!o.disabled,
                    onChange: () => onChange(o.value),
                }),
                e('span', null, o.label),
                o.hint && e('span', { className: 'ob-seg-hint' }, o.hint)))));
}

export function ConnectBrokerForm({ onConnected, compact }) {
    const [broker, setBroker] = React.useState('alpaca');
    const [name, setName] = React.useState('');
    const [paper, setPaper] = React.useState(true);
    const [keyId, setKeyId] = React.useState('');
    const [secretKey, setSecretKey] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);

    async function onSubmit(ev) {
        ev.preventDefault();
        setError(null);
        const invalid = validateConnectForm({ name, keyId, secretKey, paper });
        if (invalid) { setError(invalid); return; }
        setBusy(true);
        try {
            const r = await postOnboarding('connect', {
                broker, name: name.trim(), key_id: keyId.trim(), secret_key: secretKey.trim(), paper,
            });
            if (!r.ok) { setError(onboardingErrorMessage(r.status, r.body)); return; }
            // The secret leaves this component's state as soon as it is saved.
            setSecretKey(''); setKeyId('');
            onConnected(r.body);
        } finally {
            setBusy(false);
        }
    }

    const brokerOptions = BROKERS.map((b) => ({ value: b.id, label: b.label, disabled: !b.available }));
    return e('form', { onSubmit, noValidate: true, className: 'ag-form' + (compact ? ' ob-compact' : '') },
        e(Segmented, {
            name: 'ob-broker', label: 'Broker', value: broker, options: brokerOptions, onChange: setBroker,
        }),
        e('p', { className: 'ob-hint' }, 'More brokers will follow. Alpaca paper and live accounts are supported today.'),
        e(Field, {
            id: 'ob-name', label: 'Account name', value: name, placeholder: 'e.g. Alpaca paper',
            autoComplete: 'off', maxLength: 60, onChange: (ev) => setName(ev.target.value),
        }),
        e(Segmented, {
            name: 'ob-env', label: 'Environment', value: paper ? 'paper' : 'live',
            options: [
                { value: 'paper', label: 'Paper', hint: 'keys start PK' },
                { value: 'live', label: 'Live', hint: 'keys start AK' },
            ],
            onChange: (v) => setPaper(v === 'paper'),
        }),
        e(Field, {
            id: 'ob-key', label: 'API key ID', icon: 'lock', value: keyId, placeholder: paper ? 'PK…' : 'AK…',
            autoComplete: 'off', autoCapitalize: 'none', spellCheck: false,
            onChange: (ev) => setKeyId(ev.target.value),
        }),
        e(PasswordField, {
            id: 'ob-secret', label: 'Secret key', value: secretKey, placeholder: 'Your Alpaca secret key',
            autoComplete: 'off', onChange: (ev) => setSecretKey(ev.target.value),
        }),
        e('p', { className: 'ob-hint' },
            'Atlas checks these keys with Alpaca, reads the account number from Alpaca’s answer, and stores the keys encrypted. They are never shown again, and nobody else on Atlas can see this account.'),
        e(SubmitButton, { busy, busyLabel: 'Checking with Alpaca…', label: 'Connect account', arrow: true }),
        error && e('div', { role: 'alert', className: 'ag-error' }, error));
}

function Connected({ result, action, actionLabel }) {
    return e('div', { className: 'ob-done', role: 'status' },
        e('div', { className: 'ob-done-title' }, 'Connected'),
        e('p', null, (result.name || 'Your account') + ' · account ••' + (result.account_last4 || '') +
            (result.paper ? ' · paper' : ' · live') + '.'),
        e('p', { className: 'ob-hint' },
            'The first sync has started. Positions arrive within a minute; history and the nightly analytics fill in over the next day.'),
        e('button', { type: 'button', className: 'ag-submit', onClick: action }, actionLabel));
}

/* ---------------------------------------------------------- the gate */

export function OnboardingGate({ children, onSignOut }) {
    const [st, setSt] = React.useState({ loading: true, error: null, portfolios: null, access: null });
    const [attempt, setAttempt] = React.useState(0);
    const [connected, setConnected] = React.useState(null);

    React.useEffect(() => {
        let live = true;
        setSt((s) => ({ ...s, loading: true }));
        readAccess().then((r) => { if (live) setSt({ loading: false, ...r }); });
        return () => { live = false; };
    }, [attempt]);

    const state = onboardingState(st);
    if (state === ONBOARD_LOADING) {
        return e('main', { className: 'ag-page ag-page--loading', 'aria-busy': 'true' },
            e(AuthBackdrop, null), e(AtlasWordmark, { className: 'ag-loading-mark' }));
    }
    if (state === ONBOARD_FAILED) {
        return e(Shell, { title: 'Your accounts did not load', subtitle: 'Atlas could not read which accounts you have. Nothing is wrong with them.' },
            e('div', { className: 'ag-form' },
                e('button', { type: 'button', className: 'ag-submit', onClick: () => setAttempt((n) => n + 1) }, 'Try again'),
                e('div', { className: 'ag-row-center' },
                    e('button', { type: 'button', className: 'ag-link', onClick: onSignOut }, 'Sign out'))));
    }
    if (state === ONBOARD_NEEDS_ACCOUNT) {
        if (connected) {
            return e(Shell, { title: 'You’re set up', subtitle: null },
                e(Connected, { result: connected, action: reloadPage, actionLabel: 'Open the terminal' }));
        }
        return e(Shell, { title: 'Connect your broker', subtitle: 'Atlas reads your book from your broker. Start with one account; you can add more later.' },
            e(ConnectBrokerForm, { onConnected: setConnected }),
            e('div', { className: 'ag-row-center' },
                e('button', { type: 'button', className: 'ag-link', onClick: onSignOut }, 'Sign out')));
    }
    return children;
}

/* ------------------------------------------------------ the topbar panel */

function InviteForm() {
    const [email, setEmail] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [result, setResult] = React.useState(null);
    const [copied, setCopied] = React.useState(false);

    async function onSubmit(ev) {
        ev.preventDefault();
        setError(null); setResult(null); setCopied(false);
        if (!email.trim()) { setError('Enter an email address.'); return; }
        setBusy(true);
        try {
            const r = await postOnboarding('invite', { email: email.trim() });
            if (!r.ok) { setError(onboardingErrorMessage(r.status, r.body)); return; }
            setResult(r.body);
        } finally {
            setBusy(false);
        }
    }

    return e('form', { onSubmit, noValidate: true, className: 'ag-form ob-compact' },
        e(Field, {
            id: 'ob-invite-email', label: 'Their email address', icon: 'mail', type: 'email', value: email,
            placeholder: 'name@domain.com', autoComplete: 'off', autoCapitalize: 'none', spellCheck: false,
            onChange: (ev) => setEmail(ev.target.value),
        }),
        e('p', { className: 'ob-hint' },
            'Atlas has no email server, so it gives you the link to send yourself. Anyone holding the link can set the password, so send it privately.'),
        e(SubmitButton, { busy, busyLabel: 'Creating link…', label: 'Create invite link' }),
        error && e('div', { role: 'alert', className: 'ag-error' }, error),
        result && e(LinkResult, { result }));
}

/** A one-time link to hand over: who it is for, what it does, and a copy button. */
function LinkResult({ result }) {
    const [copied, setCopied] = React.useState(false);
    const [failed, setFailed] = React.useState(false);
    async function copy() {
        try {
            await globalThis.navigator.clipboard.writeText(result.action_link);
            setCopied(true);
        } catch (_) {
            setFailed(true);
        }
    }
    return e('div', { className: 'ob-link', role: 'status' },
        e('p', null, inviteResultText(result)),
        result.warning && e('p', { className: 'ag-error' }, result.warning),
        e('input', {
            className: 'ag-input', readOnly: true, value: result.action_link, 'aria-label': 'Invite link',
            onFocus: (ev) => ev.target.select(),
        }),
        e('button', { type: 'button', className: 'ob-copy', onClick: copy }, copied ? 'Copied' : 'Copy link'),
        failed && e('p', { className: 'ag-error' }, 'Copy failed. Select the link and copy it by hand.'));
}

/* ------------------------------------------------- RA-1: access requests */

async function readPendingRequests() {
    if (!supabase) return { rows: null, error: 'no Supabase client' };
    const { data, error } = await supabase.from('access_requests')
        .select('id,name,email,note,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(200);
    if (error) {
        console.error('[Onboarding] access_requests:', error.message || error);
        return { rows: null, error: error.message || String(error) };
    }
    return { rows: data || [], error: null };
}

function whenAsked(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    return new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** The administrator's queue: approve (issues the invite link) or decline. */
function RequestsPanel({ onChanged }) {
    const [st, setSt] = React.useState({ loading: true, rows: null, error: null });
    const [busyId, setBusyId] = React.useState(null);
    const [issued, setIssued] = React.useState(null);
    const [error, setError] = React.useState(null);

    const load = React.useCallback(() => {
        setSt((s) => ({ ...s, loading: true }));
        readPendingRequests().then((r) => setSt({ loading: false, ...r }));
    }, []);
    React.useEffect(() => { load(); }, [load]);

    async function decide(row, decision) {
        setError(null); setIssued(null); setBusyId(row.id);
        try {
            const r = await postOnboarding('decide', { id: row.id, decision });
            if (!r.ok && r.status !== 207) { setError(onboardingErrorMessage(r.status, r.body)); return; }
            if (r.body && r.body.action_link) setIssued(r.body);
            load();
            if (onChanged) onChanged();
        } finally {
            setBusyId(null);
        }
    }

    if (st.loading && !st.rows) return e('p', { className: 'ob-hint' }, 'Loading requests\u2026');
    if (st.error) {
        return e('div', null,
            e('p', { className: 'ag-error' }, 'The request list did not load. Nothing is wrong with the requests themselves.'),
            e('button', { type: 'button', className: 'ob-copy', onClick: load }, 'Try again'));
    }
    return e('div', { className: 'ob-requests' },
        issued && e(LinkResult, { result: issued }),
        error && e('div', { role: 'alert', className: 'ag-error' }, error),
        st.rows.length === 0
            ? e('p', { className: 'ob-hint' }, 'No one is waiting. Requests from the sign-in page appear here.')
            : st.rows.map((row) => e('div', { key: row.id, className: 'ob-req' },
                e('div', { className: 'ob-req-who' },
                    e('div', { className: 'ob-req-name' }, row.name),
                    e('div', { className: 'ob-req-email' }, row.email),
                    row.note && e('div', { className: 'ob-req-note' }, row.note),
                    e('div', { className: 'ob-req-when' }, 'Asked ' + whenAsked(row.created_at))),
                e('div', { className: 'ob-req-act' },
                    e('button', {
                        type: 'button', className: 'ob-copy', disabled: busyId === row.id,
                        onClick: () => decide(row, 'approve'),
                    }, busyId === row.id ? 'Working\u2026' : 'Approve'),
                    e('button', {
                        type: 'button', className: 'ob-decline', disabled: busyId === row.id,
                        onClick: () => decide(row, 'decline'),
                    }, 'Decline')))));
}

/** The landing page's request form (RA-1). Anonymous: no session exists yet. */
export function RequestAccessForm({ onBack }) {
    const [name, setName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [note, setNote] = React.useState('');
    const [website, setWebsite] = React.useState('');   // honeypot: hidden from people
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [sent, setSent] = React.useState(null);

    async function onSubmit(ev) {
        ev.preventDefault();
        setError(null);
        const invalid = validateAccessRequest({ name, email, note });
        if (invalid) { setError(invalid); return; }
        setBusy(true);
        try {
            let r;
            try {
                r = await fetch('/api/access-request', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name.trim(), email: email.trim(), note: note.trim(), website }),
                });
            } catch (_) {
                setError('Could not reach Atlas. Check your connection and try again.');
                return;
            }
            const body = await r.json().catch(() => null);
            if (r.status === 202) { setSent((body && body.message) || ACCESS_REQUEST_REPLY); return; }
            setError(onboardingErrorMessage(r.status, body));
        } finally {
            setBusy(false);
        }
    }

    const back = e('div', { className: 'ag-row-center' },
        e('button', { type: 'button', className: 'ag-link', onClick: onBack }, 'Back to sign in'));
    if (sent) {
        return e(Shell, { title: 'Request sent', subtitle: null },
            e('div', { className: 'ag-form' }, e('p', { className: 'ob-done', role: 'status' }, sent), back));
    }
    return e(Shell, { title: 'Request access', subtitle: 'Atlas is invitation-only. Tell us who you are and an administrator will be in touch.' },
        e('form', { onSubmit, noValidate: true, className: 'ag-form' },
            e(Field, {
                id: 'ra-name', label: 'Your name', value: name, placeholder: 'First and last name',
                autoComplete: 'name', maxLength: 100, onChange: (ev) => setName(ev.target.value),
            }),
            e(Field, {
                id: 'ra-email', label: 'Email address', icon: 'mail', type: 'email', value: email,
                placeholder: 'you@domain.com', autoComplete: 'email', inputMode: 'email',
                autoCapitalize: 'none', spellCheck: false, onChange: (ev) => setEmail(ev.target.value),
            }),
            e('div', { className: 'ag-field' },
                e('label', { htmlFor: 'ra-note', className: 'ag-label' }, 'Why you\u2019d like access (optional)'),
                e('textarea', {
                    id: 'ra-note', className: 'ag-input ob-textarea', value: note, rows: 3,
                    maxLength: ACCESS_NOTE_MAX, onChange: (ev) => setNote(ev.target.value),
                })),
            // Honeypot. Off-screen and out of the tab order; people never fill it.
            e('div', { className: 'ob-hp', 'aria-hidden': 'true' },
                e('label', { htmlFor: 'ra-website' }, 'Website'),
                e('input', {
                    id: 'ra-website', name: 'website', type: 'text', tabIndex: -1, autoComplete: 'off',
                    value: website, onChange: (ev) => setWebsite(ev.target.value),
                })),
            e(SubmitButton, { busy, busyLabel: 'Sending\u2026', label: 'Request access', arrow: true }),
            error && e('div', { role: 'alert', className: 'ag-error' }, error),
            back));
}

function AccountsPanel({ onClose, onRequestsChanged }) {
    const [access, setAccess] = React.useState(undefined);   // undefined loading, null unknown
    const [tab, setTab] = React.useState('connect');
    const [connected, setConnected] = React.useState(null);

    React.useEffect(() => {
        let live = true;
        readAccess().then((r) => { if (live) setAccess(r.access); });
        return () => { live = false; };
    }, []);

    React.useEffect(() => {
        const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
        globalThis.addEventListener('keydown', onKey);
        return () => globalThis.removeEventListener('keydown', onKey);
    }, [onClose]);

    const isAdmin = !!(access && access.is_admin);
    const capLine = accountCapLine(access);
    let body;
    if (tab === 'invite' && isAdmin) {
        body = e(InviteForm, null);
    } else if (tab === 'requests' && isAdmin) {
        body = e(RequestsPanel, { onChanged: onRequestsChanged });
    } else if (connected) {
        body = e(Connected, {
            result: connected, actionLabel: 'Switch to it',
            action: () => { writeStoredPortfolio(connected.portfolio_id); reloadPage(); },
        });
    } else if (access !== undefined && !canConnectMore(access)) {
        body = e('p', { className: 'ob-hint' }, 'You have connected the most accounts allowed (' + access.account_cap + '). Ask an administrator if you need more.');
    } else {
        body = e(ConnectBrokerForm, { onConnected: setConnected, compact: true });
    }

    return e('div', { className: 'ob-overlay', onMouseDown: (ev) => { if (ev.target === ev.currentTarget) onClose(); } },
        e('div', { className: 'ob-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ob-panel-title' },
            e('div', { className: 'ob-panel-head' },
                e('h2', { id: 'ob-panel-title' }, 'Accounts'),
                e('button', { type: 'button', className: 'ob-x', 'aria-label': 'Close', onClick: onClose }, '×')),
            isAdmin && e('div', { className: 'ob-tabs', role: 'tablist' },
                [['connect', 'Connect an account'], ['invite', 'Invite someone'], ['requests', 'Requests']].map(([t, label]) => e('button', {
                    key: t, type: 'button', role: 'tab', 'aria-selected': tab === t,
                    className: 'ob-tab' + (tab === t ? ' is-on' : ''), onClick: () => setTab(t),
                }, label))),
            capLine && tab === 'connect' && e('p', { className: 'ob-cap' }, capLine),
            body));
}

/** Topbar control: connect another account; invite people (administrators). */
export function AccountsButton() {
    const [open, setOpen] = React.useState(false);
    const [pending, setPending] = React.useState(0);
    // RA-1: an administrator sees how many people are waiting. RLS returns no
    // rows to anyone else, so a non-admin's count is simply 0.
    const refreshPending = React.useCallback(() => {
        if (!supabase) return;
        supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
            .then(({ count, error }) => {
                if (error) { console.error('[Onboarding] pending requests:', error.message || error); return; }
                setPending(count || 0);
            });
    }, []);
    React.useEffect(() => { refreshPending(); }, [refreshPending]);
    return e(React.Fragment, null,
        e('button', {
            type: 'button', onClick: () => setOpen(true),
            title: pending ? pending + ' request' + (pending === 1 ? '' : 's') + ' for access waiting' : 'Connect a broker account or invite someone',
            className: 'ob-topbar-btn' + (pending ? ' has-pending' : ''),
        }, accountsButtonLabel(pending)),
        open && e(AccountsPanel, { onClose: () => setOpen(false), onRequestsChanged: refreshPending }));
}
