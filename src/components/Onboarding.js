// ON-1: invite-only onboarding, the browser half.
//
//   (the gate that decides which onboarding screen shows is WelcomeGate, in
//    Welcome.js, since ONB-2)
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
    validateConnectForm, onboardingErrorMessage, accountCapLine,
    canConnectMore, inviteResultText, validateAccessRequest, accountsButtonLabel,
    ACCESS_REQUEST_REPLY, ACCESS_NOTE_MAX, ACCESS_NAME_MAX, requesterName,
} from '../lib/onboarding.js';
import { BROKERS } from '../lib/brokerOnboarding.js';
import {
    validateReplaceKeys, keysHeldLabel, syncLine, accountLine,
    groupPeople, actionsFor, waitingCount, personName, personWhen, stageInfo,
} from '../lib/accountsAdmin.js';
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
// ONB-2: the gate is WelcomeGate (Welcome.js), driven by atlas_my_onboarding.

/* ------------------------------------------------------ the topbar panel */

function InviteForm() {
    const [email, setEmail] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [result, setResult] = React.useState(null);
    const [wantLink, setWantLink] = React.useState(false);

    async function onSubmit(ev) {
        ev.preventDefault();
        setError(null); setResult(null);
        if (!email.trim()) { setError('Enter an email address.'); return; }
        setBusy(true);
        try {
            const r = await postOnboarding('invite', { email: email.trim(), link: wantLink });
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
        e('label', { className: 'ob-check' },
            e('input', { type: 'checkbox', checked: wantLink, onChange: (ev) => setWantLink(ev.target.checked) }),
            e('span', null, 'Give me the link instead of emailing it')),
        e('p', { className: 'ob-hint' },
            wantLink
                ? 'Anyone holding the link can set the password, so send it privately.'
                : 'Atlas emails the invitation. If the email cannot be sent you get the link to pass on instead.'),
        e(SubmitButton, { busy, busyLabel: 'Inviting\u2026', label: wantLink ? 'Create invite link' : 'Send invitation' }),
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
    // RA-2: an emailed invitation has no link to show -- the only copy is in
    // the person's inbox.
    if (!result.action_link) {
        return e('div', { className: 'ob-link', role: 'status' },
            e('p', null, inviteResultText(result)),
            result.warning && e('p', { className: 'ag-error' }, result.warning));
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
        .select('id,name,surname,email,note,created_at')
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
            // An approval answers with either a link to pass on or word that
            // the invitation was emailed (RA-2); either is worth showing.
            if (r.body && (r.body.action_link || r.body.delivered === 'email')) setIssued(r.body);
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
                    e('div', { className: 'ob-req-name' }, requesterName(row)),
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
    const [firstName, setFirstName] = React.useState('');
    const [surname, setSurname] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [note, setNote] = React.useState('');
    const [website, setWebsite] = React.useState('');   // honeypot: hidden from people
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [sent, setSent] = React.useState(null);

    async function onSubmit(ev) {
        ev.preventDefault();
        setError(null);
        const invalid = validateAccessRequest({ firstName, surname, email, note });
        if (invalid) { setError(invalid); return; }
        setBusy(true);
        try {
            let r;
            try {
                r = await fetch('/api/access-request', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ first_name: firstName.trim(), surname: surname.trim(), email: email.trim(), note: note.trim(), website }),
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
            e('div', { className: 'ob-name-row' },
                e(Field, {
                    id: 'ra-first', label: 'First name', value: firstName,
                    autoComplete: 'given-name', maxLength: ACCESS_NAME_MAX, onChange: (ev) => setFirstName(ev.target.value),
                }),
                e(Field, {
                    id: 'ra-surname', label: 'Surname', value: surname,
                    autoComplete: 'family-name', maxLength: ACCESS_NAME_MAX, onChange: (ev) => setSurname(ev.target.value),
                })),
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

/* ------------------------------------------- ONB-3: My accounts */

async function readMyBrokerAccounts() {
    if (!supabase) return { rows: null, error: 'no Supabase client' };
    const { data, error } = await supabase.rpc('atlas_my_broker_accounts');
    if (error) {
        console.error('[Onboarding] atlas_my_broker_accounts:', error.message || error);
        return { rows: null, error: error.message || String(error) };
    }
    return { rows: data || [], error: null };
}

/** New keys for an account already connected. The environment is the
 *  account's: a paper account takes paper keys. */
function ReplaceKeysForm({ row, onDone, onCancel }) {
    const [keyId, setKeyId] = React.useState('');
    const [secretKey, setSecretKey] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState(null);
    const paper = row.is_paper !== false;

    async function onSubmit(ev) {
        ev.preventDefault();
        setError(null);
        const invalid = validateReplaceKeys({ keyId, secretKey, paper });
        if (invalid) { setError(invalid); return; }
        setBusy(true);
        try {
            const r = await postOnboarding('replace_keys', { portfolio_id: row.portfolio_id, key_id: keyId.trim(), secret_key: secretKey.trim() });
            if (!r.ok) { setError(onboardingErrorMessage(r.status, r.body)); return; }
            setKeyId(''); setSecretKey('');
            onDone(r.body);
        } finally {
            setBusy(false);
        }
    }

    return e('form', { onSubmit, noValidate: true, className: 'ag-form ob-compact ob-rekey' },
        e(Field, {
            id: 'ob-rekey-key-' + row.portfolio_id, label: 'New API key ID', icon: 'lock', value: keyId,
            placeholder: paper ? 'PK…' : 'AK…', autoComplete: 'off', autoCapitalize: 'none', spellCheck: false,
            onChange: (ev) => setKeyId(ev.target.value),
        }),
        e(PasswordField, {
            id: 'ob-rekey-secret-' + row.portfolio_id, label: 'New secret key', value: secretKey,
            placeholder: 'The new secret key', autoComplete: 'off', onChange: (ev) => setSecretKey(ev.target.value),
        }),
        e('p', { className: 'ob-hint' },
            'Generate a new pair in the Alpaca dashboard first. Atlas checks it belongs to this same account before saving it; the old pair stops being used straight away.'),
        e(SubmitButton, { busy, busyLabel: 'Checking with Alpaca…', label: 'Replace keys' }),
        error && e('div', { role: 'alert', className: 'ag-error' }, error),
        e('div', { className: 'ag-row-center' },
            e('button', { type: 'button', className: 'ag-link', onClick: onCancel }, 'Cancel')));
}

function MyAccountsPanel() {
    const [st, setSt] = React.useState({ loading: true, rows: null, error: null });
    const [open, setOpen] = React.useState(null);
    const [done, setDone] = React.useState(null);
    const load = React.useCallback(() => {
        setSt((s) => ({ ...s, loading: true }));
        readMyBrokerAccounts().then((r) => setSt({ loading: false, ...r }));
    }, []);
    React.useEffect(() => { load(); }, [load]);

    if (st.loading && !st.rows) return e('p', { className: 'ob-hint' }, 'Loading your accounts…');
    if (st.error) {
        return e('div', null,
            e('p', { className: 'ag-error' }, 'Your accounts did not load. Nothing has changed on them.'),
            e('button', { type: 'button', className: 'ob-copy', onClick: load }, 'Try again'));
    }
    if (st.rows.length === 0) return e('p', { className: 'ob-hint' }, 'You have no broker accounts connected yet.');
    return e('div', { className: 'ob-requests' },
        done && e('div', { className: 'ob-link', role: 'status' },
            e('p', null, 'Keys replaced for the account ending ' + (done.account_last4 || '') + '. A sync on the new keys has started.')),
        st.rows.map((row) => {
            const sync = syncLine(row);
            return e('div', { key: row.portfolio_id, className: 'ob-acct' },
                e('div', { className: 'ob-req' },
                    e('div', { className: 'ob-req-who' },
                        e('div', { className: 'ob-req-name' }, row.portfolio_name || 'Broker account'),
                        e('div', { className: 'ob-req-email' }, accountLine(row)),
                        e('div', { className: 'ob-req-note' }, keysHeldLabel(row.keys_held)),
                        e('div', { className: 'ob-req-when ob-tone-' + sync.tone }, sync.text)),
                    open !== row.portfolio_id && e('div', { className: 'ob-req-act' },
                        e('button', {
                            type: 'button', className: 'ob-copy',
                            onClick: () => { setOpen(row.portfolio_id); setDone(null); },
                        }, 'Replace keys'))),
                open === row.portfolio_id && e(ReplaceKeysForm, {
                    row, onCancel: () => setOpen(null),
                    onDone: (body) => { setOpen(null); setDone(body); load(); },
                }));
        }));
}

/* ------------------------------------------------- ONB-3: People */

async function readPeople() {
    if (!supabase) return { rows: null, error: 'no Supabase client' };
    const { data, error } = await supabase.rpc('atlas_admin_accounts');
    if (error) {
        console.error('[Onboarding] atlas_admin_accounts:', error.message || error);
        return { rows: null, error: error.message || String(error) };
    }
    return { rows: data || [], error: null };
}

/** Everyone who has signed in, by stage; approve, revoke, restore. */
function PeoplePanel({ onChanged }) {
    const [st, setSt] = React.useState({ loading: true, rows: null, error: null });
    const [selfId, setSelfId] = React.useState(null);
    const [busyId, setBusyId] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [shown, setShown] = React.useState({});
    const load = React.useCallback(() => {
        setSt((s) => ({ ...s, loading: true }));
        readPeople().then((r) => setSt({ loading: false, ...r }));
    }, []);
    React.useEffect(() => {
        load();
        if (supabase) supabase.auth.getUser().then(({ data }) => setSelfId((data && data.user && data.user.id) || null));
    }, [load]);

    async function act(row, a) {
        if (a.confirm && !globalThis.confirm(a.confirm)) return;
        setError(null); setBusyId(row.user_id);
        try {
            const { error: err } = await supabase.rpc('atlas_admin_set_status', { p_user_id: row.user_id, p_status: a.to });
            if (err) {
                console.error('[Onboarding] atlas_admin_set_status:', err.message || err);
                setError('That change was not saved: ' + (err.message || 'the database refused it') + '.');
                return;
            }
            load();
            if (onChanged) onChanged();
        } finally {
            setBusyId(null);
        }
    }

    if (st.loading && !st.rows) return e('p', { className: 'ob-hint' }, 'Loading people…');
    if (st.error) {
        return e('div', null,
            e('p', { className: 'ag-error' }, 'The list of people did not load. Nobody’s access has changed.'),
            e('button', { type: 'button', className: 'ob-copy', onClick: load }, 'Try again'));
    }
    const groups = groupPeople(st.rows);
    if (groups.length === 0) return e('p', { className: 'ob-hint' }, 'Nobody has signed in yet.');
    return e('div', { className: 'ob-requests' },
        error && e('div', { role: 'alert', className: 'ag-error' }, error),
        groups.map((g) => {
            const open = shown[g.id] === undefined ? !g.collapsed : shown[g.id];
            return e('section', { key: g.id, className: 'ob-group' },
                e('button', {
                    type: 'button', className: 'ob-group-head', 'aria-expanded': open,
                    onClick: () => setShown((x) => ({ ...x, [g.id]: !open })),
                }, g.title + ' · ' + g.rows.length, e('span', { 'aria-hidden': 'true' }, open ? '−' : '+')),
                open && g.rows.map((row) => {
                    const info = stageInfo(row.stage);
                    const when = personWhen(row);
                    return e('div', { key: row.user_id, className: 'ob-req' },
                        e('div', { className: 'ob-req-who' },
                            e('div', { className: 'ob-req-name' }, personName(row)),
                            personName(row) !== row.email && e('div', { className: 'ob-req-email' }, row.email),
                            e('div', { className: 'ob-req-note ob-tone-' + info.tone }, info.label
                                + (row.portfolio_count ? ' · ' + row.portfolio_count + ' account' + (row.portfolio_count === 1 ? '' : 's') : '')),
                            when && e('div', { className: 'ob-req-when' }, when)),
                        e('div', { className: 'ob-req-act' },
                            actionsFor(row, selfId).map((a) => e('button', {
                                key: a.to, type: 'button', disabled: busyId === row.user_id,
                                className: a.to === 'revoked' ? 'ob-decline' : 'ob-copy',
                                onClick: () => act(row, a),
                            }, busyId === row.user_id ? 'Working…' : a.label))));
                }));
        }));
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
    if (tab === 'mine') {
        body = e(MyAccountsPanel, null);
    } else if (tab === 'people' && isAdmin) {
        body = e(PeoplePanel, { onChanged: onRequestsChanged });
    } else if (tab === 'invite' && isAdmin) {
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
            e('div', { className: 'ob-tabs', role: 'tablist' },
                (isAdmin
                    ? [['connect', 'Connect'], ['mine', 'My accounts'], ['people', 'People'], ['invite', 'Invite'], ['requests', 'Requests']]
                    : [['connect', 'Connect'], ['mine', 'My accounts']]).map(([t, label]) => e('button', {
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
        // ONB-3: plus the people who signed in and are waiting for approval.
        // atlas_admin_accounts refuses a non-administrator (42501): that is 0,
        // not an error worth logging.
        Promise.all([
            supabase.from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.rpc('atlas_admin_accounts'),
        ]).then(([req, ppl]) => {
            if (req.error) console.error('[Onboarding] pending requests:', req.error.message || req.error);
            if (ppl.error && ppl.error.code !== '42501') console.error('[Onboarding] waiting people:', ppl.error.message || ppl.error);
            setPending((req.error ? 0 : (req.count || 0)) + (ppl.error ? 0 : waitingCount(ppl.data)));
        });
    }, []);
    React.useEffect(() => { refreshPending(); }, [refreshPending]);
    return e(React.Fragment, null,
        e('button', {
            type: 'button', onClick: () => setOpen(true),
            title: pending ? pending + (pending === 1 ? ' person is' : ' people are') + ' waiting for you to approve access' : 'Your broker accounts, and people (administrators)',
            className: 'ob-topbar-btn' + (pending ? ' has-pending' : ''),
        }, accountsButtonLabel(pending)),
        open && e(AccountsPanel, { onClose: () => setOpen(false), onRequestsChanged: refreshPending }));
}
