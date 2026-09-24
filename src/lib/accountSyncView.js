// What the Command Centre may say about each broker account's sync health.
//
// `atlas_account_sync_health()` (MP-4c) grades every registered Alpaca account
// on its OWN sync_log rows and its OWN book. Before it, the only freshness
// surface asked "did any positions sync succeed?", so a healthy Primary run hid
// a Secondary that had stopped syncing.
//
// Three states, because they need three different sentences: the function
// answered with accounts, answered with none (nothing registered -- a fact about
// the configuration), or did not answer (a transport failure, which must never
// read as "no accounts").

export const ACCOUNT_SYNC_LOADED = 'loaded';
export const ACCOUNT_SYNC_EMPTY = 'empty';
export const ACCOUNT_SYNC_FAILED = 'failed';

/** Validation / health status -> badge tone. Accepts both vocabularies the
 *  platform has written ('passed'/'warning'/'failed' and the older
 *  'pass'/'ok'/'warn'); anything else is grey, never green. */
export function statusTone(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'passed' || s === 'pass' || s === 'ok' || s === 'success') return 'green';
    if (s === 'warning' || s === 'warn' || s === 'partial' || s === 'skipped') return 'amber';
    if (s === 'failed' || s === 'fail' || s === 'error' || s === 'critical') return 'red';
    return 'grey';
}

function ageLabel(minutes) {
    if (minutes < 1) return '<1m';
    if (minutes < 60) return Math.round(minutes) + 'm';
    if (minutes < 1440) return Math.round(minutes / 60) + 'h';
    return (minutes / 1440).toFixed(1) + 'd';
}

function finite(v) {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * @param {{data?: Array<object>|null, error?: any}} res  a supabase-js rpc result
 * @returns {{state: string, rows?: Array<object>, reason?: string}}
 */
export function buildAccountSyncView(res) {
    if (!res || res.error || !Array.isArray(res.data)) {
        const msg = res && res.error && (res.error.message || String(res.error));
        return { state: ACCOUNT_SYNC_FAILED, reason: msg || 'account health did not answer' };
    }
    if (res.data.length === 0) return { state: ACCOUNT_SYNC_EMPTY };

    const rows = res.data.map((r) => {
        const out = {
            id: r.portfolio_id,
            name: r.portfolio_name || 'Unnamed account',
            isDefault: r.is_default === true,
            status: r.status || null,
            tone: statusTone(r.status),
            reasons: Array.isArray(r.reasons) ? r.reasons.filter(Boolean) : [],
        };
        // Absent, not zero: an account with no successful sync has no age, and
        // one with no broker equity has no drift. A renderer cannot print a
        // figure it was never handed.
        const age = finite(r.positions_age_minutes);
        if (age != null) out.ageLabel = ageLabel(age);
        const n = finite(r.positions_count);
        if (n != null) out.positions = n;
        const drift = finite(r.nav_drift_pct);
        if (drift != null) out.driftLabel = drift.toFixed(2) + '%';
        return out;
    });
    return { state: ACCOUNT_SYNC_LOADED, rows };
}
