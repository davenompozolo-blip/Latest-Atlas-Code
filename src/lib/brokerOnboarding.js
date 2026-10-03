// ON-1: the server-side steps of connecting a broker account, shared by the
// admin route (api/broker-accounts.js, CRON_SECRET) and the signed-in user's
// route (api/onboarding.js). Pure over an injected fetch so both routes' tests
// can stub the broker and Supabase.
//
// The account number always comes from the broker's own /v2/account answer for
// the submitted keys, never from what a person typed: every sync and every
// order checks the credentials against that number (MP-1, MP-3), so this is
// where the identity gate's reference value is born.

// Brokers the terminal can connect. A registry, not a branch: adding one is an
// entry here plus its verifier, and the form lists what is available.
export const BROKERS = Object.freeze([
    Object.freeze({ id: 'alpaca', label: 'Alpaca', available: true }),
]);

export const AUTH_TIMEOUT_MS = 8000;      // every outbound call is bounded
// The first syncs are an accelerant -- the cron picks every account up anyway --
// so they are waited on only this long, well inside the routes' maxDuration.
export const FIRST_SYNC_WAIT_MS = 25000;
export const FIRST_SYNCS = ['sync_alpaca_positions', 'sync_alpaca_transactions', 'sync_portfolio_history'];

const NAME_MAX = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function alpacaTradingBase(paper) {
    return paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
}

function str(v) { return typeof v === 'string' ? v.trim() : ''; }

/**
 * Validate a connect request body. Returns { ok: true, value } or
 * { ok: false, error } with a sentence fit to show. Never echoes a key.
 */
export function parseConnectInput(body) {
    const b = body && typeof body === 'object' ? body : {};
    const broker = str(b.broker) || 'alpaca';
    const def = BROKERS.find((x) => x.id === broker);
    if (!def || !def.available) return { ok: false, error: 'That broker is not supported yet.' };
    const name = str(b.name);
    const keyId = str(b.key_id);
    const secretKey = str(b.secret_key);
    if (!name) return { ok: false, error: 'Give the account a name.' };
    if (name.length > NAME_MAX) return { ok: false, error: 'Keep the name under ' + NAME_MAX + ' characters.' };
    if (!keyId || !secretKey) return { ok: false, error: 'Both the API key ID and the secret key are required.' };
    if (/\s/.test(keyId) || /\s/.test(secretKey)) return { ok: false, error: 'A key cannot contain spaces.' };
    return { ok: true, value: { broker, name, keyId, secretKey, paper: b.paper !== false } };
}

/** Validate an invite request body: { ok, value: { email } } or { ok: false, error }. */
export function parseInviteInput(body) {
    const email = str(body && body.email).toLowerCase();
    if (!email) return { ok: false, error: 'Enter an email address.' };
    if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: 'That does not look like an email address.' };
    return { ok: true, value: { email } };
}

/**
 * What the broker says these keys belong to. Never throws:
 * { ok: true, accountNumber, status } | { ok: false, status, error? }.
 */
export async function verifyAlpacaKeys(keyId, secretKey, paper, { fetchImpl, timeoutMs = AUTH_TIMEOUT_MS } = {}) {
    const f = fetchImpl || globalThis.fetch;
    try {
        const r = await f(alpacaTradingBase(paper) + '/v2/account', {
            headers: { 'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secretKey, accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!r.ok) return { ok: false, status: r.status };
        const a = await r.json();
        if (!a || typeof a.account_number !== 'string' || !a.account_number) return { ok: false, status: r.status };
        return { ok: true, accountNumber: a.account_number, status: a.status || null };
    } catch (e) {
        return { ok: false, status: null, error: String((e && e.message) || e) };
    }
}

/** The sentence for keys the broker refused. Says which API was tried, because
 *  paper keys sent to the live API (and the reverse) is the commonest cause. */
export function keysRejectedDetail(paper, status) {
    return 'Alpaca did not accept these keys on the ' + (paper ? 'paper' : 'live') + ' API'
        + (status ? ' (HTTP ' + status + ')' : ' (no answer)')
        + '. Check the keys, and that the paper/live choice matches them.';
}

/**
 * Start the first syncs for a new portfolio so it arrives with its history.
 * Edge functions check their caller (EF-1), so the call carries CRON_SECRET.
 * Never throws; returns { function: status | sentence }.
 */
export async function startFirstSyncs(sbUrl, portfolioId, cronSecret, { fetchImpl, waitMs = FIRST_SYNC_WAIT_MS, log = console } = {}) {
    const f = fetchImpl || globalThis.fetch;
    const out = {};
    const secret = typeof cronSecret === 'string' ? cronSecret.trim() : '';
    if (!secret) {
        log.error('[brokerOnboarding] CRON_SECRET unset: first syncs not started; the cron will pick the account up');
        FIRST_SYNCS.forEach((fn) => { out[fn] = 'not started'; });
        return out;
    }
    await Promise.all(FIRST_SYNCS.map(async (fn) => {
        const body = fn === 'sync_portfolio_history'
            ? { period: '6M', timeframe: '1D', portfolio_id: portfolioId }   // first run widens to 'all' itself
            : { time: new Date().toISOString() };
        try {
            const r = await f(sbUrl + '/functions/v1/' + fn, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(waitMs),
            });
            out[fn] = r.status;
        } catch (e) {
            if (e && e.name === 'TimeoutError') {
                out[fn] = 'still running when the route stopped waiting';
            } else {
                log.error('[brokerOnboarding] first sync ' + fn + ' failed to start:', e);
                out[fn] = 'not started';
            }
        }
    }));
    return out;
}

/** Last four characters of an account number, for a response that confirms
 *  which account was connected without repeating the whole identifier. */
export function last4(accountNumber) {
    const s = String(accountNumber || '');
    return s.length > 4 ? s.slice(-4) : s;
}

// Where an invite or set-new-password link sends the person. ALWAYS a public
// address: the administrator's own origin when it is one of the public ones,
// otherwise the canonical site. Never null, because Supabase's fallback is its
// configured site_url, and on 2026-10-02 that was a deployment-protected
// *-davenompozolo-blips-projects.vercel.app address -- every invite opened
// Vercel's login page instead of Atlas. Those team URLs are protected, so they
// are refused here even when the administrator is on one. Supabase still
// checks the result against its redirect allow-list, which must list these.
export const PUBLIC_SITE_URL = 'https://atlasterminal.online/';
const PUBLIC_ORIGINS = new Set([
    'https://atlasterminal.online',
    'https://www.atlasterminal.online',
    'https://latest-atlas-code-o19a.vercel.app',
]);
const LOCAL_RE = /^http:\/\/localhost:\d{2,5}$/i;
export function inviteRedirect(req) {
    const o = req && req.headers ? String(req.headers.origin || '').toLowerCase() : '';
    return PUBLIC_ORIGINS.has(o) || LOCAL_RE.test(o) ? o + '/' : PUBLIC_SITE_URL;
}
