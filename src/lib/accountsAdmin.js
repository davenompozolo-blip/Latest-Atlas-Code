// ONB-3: the decisions behind ACCOUNTS -> My accounts and ACCOUNTS -> People.
// Pure, so the shapes can be tested without a browser; the components in
// src/components/Onboarding.js only render what these return.

import { alpacaKeyEnvironment } from './onboarding.js';

/* ------------------------------------------------------- My accounts */

/** Client-side check of the replace-keys form. null when acceptable. The
 *  environment is the account's, so a key for the other one is caught here
 *  rather than spent on the broker. */
export function validateReplaceKeys({ keyId, secretKey, paper }) {
    const k = typeof keyId === 'string' ? keyId.trim() : '';
    const s = typeof secretKey === 'string' ? secretKey.trim() : '';
    if (!k) return 'Enter the new API key ID.';
    if (!s) return 'Enter the new secret key.';
    if (/\s/.test(k) || /\s/.test(s)) return 'A key cannot contain spaces. Check what was pasted.';
    const env = alpacaKeyEnvironment(k);
    if (env === 'live' && paper !== false) return 'This is a paper account, and that is a live key (AK...). Use the paper account’s keys.';
    if (env === 'paper' && paper === false) return 'This is a live account, and that is a paper key (PK...). Use the live account’s keys.';
    return null;
}

/** Where an account's keys are kept, in words. */
export function keysHeldLabel(held) {
    if (held === 'vault') return 'Keys stored encrypted in Atlas';
    if (held === 'environment') return 'Keys held in the server settings. Replacing them moves them into Atlas.';
    return 'No keys on file';
}

function ago(iso, now) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 90) return 'just now';
    const m = Math.round(s / 60);
    if (m < 90) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 36) return h + ' h ago';
    return Math.round(h / 24) + ' d ago';
}

/** The last positions sync, in words: "Last synced 3 min ago", or why not. */
export function syncLine(row, now = Date.now()) {
    if (!row || !row.last_sync_at) return { text: 'Not synced yet', tone: 'muted' };
    const when = ago(row.last_sync_at, now);
    if (row.last_sync_status === 'success') return { text: 'Last synced ' + when, tone: 'ok' };
    if (row.last_sync_status === 'running') return { text: 'Syncing now', tone: 'muted' };
    return { text: 'Last sync failed ' + when + '. If the keys changed at the broker, replace them here.', tone: 'bad' };
}

export function accountLine(row) {
    const env = row && row.is_paper === false ? 'Live' : 'Paper';
    return env + (row && row.account_last4 ? ' · account ending ' + row.account_last4 : '');
}

/* -------------------------------------------------------------- People */

// atlas_admin_accounts' stage, in the order an administrator works through them.
export const STAGES = Object.freeze({
    waiting:    { label: 'Waiting for approval', tone: 'warn', group: 'waiting' },
    unverified: { label: 'Never finished signing in', tone: 'muted', group: 'unverified' },
    approved:   { label: 'Approved · no broker yet', tone: 'muted', group: 'active' },
    syncing:    { label: 'Broker connected · first sync pending', tone: 'muted', group: 'active' },
    live:       { label: 'Live', tone: 'ok', group: 'active' },
    revoked:    { label: 'Access removed', tone: 'bad', group: 'revoked' },
});

export const GROUPS = Object.freeze([
    { id: 'waiting', title: 'Waiting for approval', collapsed: false },
    { id: 'active', title: 'Active', collapsed: false },
    { id: 'unverified', title: 'Never finished signing in', collapsed: true },
    { id: 'revoked', title: 'Access removed', collapsed: true },
]);

export function stageInfo(stage) {
    return STAGES[stage] || { label: String(stage || 'unknown'), tone: 'muted', group: 'active' };
}

/** Rows grouped for display, groups in working order, empty groups dropped. */
export function groupPeople(rows) {
    const list = Array.isArray(rows) ? rows : [];
    return GROUPS.map((g) => ({ ...g, rows: list.filter((r) => stageInfo(r.stage).group === g.id) }))
        .filter((g) => g.rows.length > 0);
}

/** The status changes on offer for a row. None on yourself: the database
 *  refuses that, and a button that can only fail is worse than no button. */
export function actionsFor(row, selfId) {
    if (!row || (selfId && row.user_id === selfId)) return [];
    if (row.status === 'revoked') return [{ to: 'approved', label: 'Restore access' }, { to: 'pending', label: 'Set back to waiting' }];
    if (row.status === 'pending') return [{ to: 'approved', label: 'Approve' }, { to: 'revoked', label: 'Revoke' }];
    return [{ to: 'revoked', label: 'Revoke', confirm: 'Revoke access? They are signed out and cannot sign back in until restored. Their accounts and history are kept.' }];
}

/** How many people an administrator needs to act on. */
export function waitingCount(rows) {
    return (Array.isArray(rows) ? rows : []).filter((r) => r && r.stage === 'waiting').length;
}

export function personName(row) {
    const n = [row && row.first_name, row && row.surname].filter((x) => typeof x === 'string' && x.trim()).join(' ');
    return n || (row && row.email) || 'Unnamed';
}

/** "2 h ago" for a row's most relevant moment. */
export function personWhen(row, now = Date.now()) {
    const st = row && row.stage;
    const pick = st === 'revoked' ? ['revoked_at', 'Removed']
        : st === 'live' ? ['first_sync_ok_at', 'Live since']
        : st === 'waiting' ? ['details_completed_at', 'Asked'] : ['requested_at', 'Signed up'];
    const iso = (row && row[pick[0]]) || (row && row.requested_at);
    const when = iso ? ago(iso, now) : null;
    return when ? pick[1] + ' ' + when : null;
}
