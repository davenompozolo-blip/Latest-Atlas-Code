// ON-1: what the onboarding screens decide, kept apart from the components so
// it can be tested without a browser.
//
// Invite-only. An administrator creates a person and hands them a one-time
// link; the person sets a password (the auth gate's set-password form, see
// passwordSetupKind in authGate.js), then connects their own broker account.
// Until they can see at least one portfolio the terminal does not render --
// an empty terminal would read as an empty book, which is a different claim.

export const ONBOARD_LOADING = 'loading';
export const ONBOARD_FAILED = 'failed';           // the account list did not answer
export const ONBOARD_NEEDS_ACCOUNT = 'needs_account';
export const ONBOARD_READY = 'ready';

/**
 * One state from what the gate has read. A failed read is NEVER "needs an
 * account": a person who already has three accounts must not be shown the
 * connect form because a query was cancelled -- the transport-failure rule.
 * Membership of any role counts: a viewer someone else granted is set up.
 */
export function onboardingState({ loading, error, portfolios }) {
    if (loading) return ONBOARD_LOADING;
    if (error || !Array.isArray(portfolios)) return ONBOARD_FAILED;
    return portfolios.length === 0 ? ONBOARD_NEEDS_ACCOUNT : ONBOARD_READY;
}

/**
 * Alpaca key ids carry their environment in the prefix: PK for paper, AK for
 * live. A mismatch is the commonest failed connect, and catching it here means
 * the broker is never sent a pair it will refuse. Unknown prefixes pass: the
 * broker is the authority, this only saves a round trip.
 */
export function alpacaKeyEnvironment(keyId) {
    const k = typeof keyId === 'string' ? keyId.trim().toUpperCase() : '';
    if (k.startsWith('PK')) return 'paper';
    if (k.startsWith('AK')) return 'live';
    return null;
}

/** Client-side check of the connect form. null when acceptable. */
export function validateConnectForm({ name, keyId, secretKey, paper }) {
    const n = typeof name === 'string' ? name.trim() : '';
    const k = typeof keyId === 'string' ? keyId.trim() : '';
    const s = typeof secretKey === 'string' ? secretKey.trim() : '';
    if (!n) return 'Give the account a name.';
    if (n.length > 60) return 'Keep the name under 60 characters.';
    if (!k) return 'Enter the API key ID.';
    if (!s) return 'Enter the secret key.';
    if (/\s/.test(k) || /\s/.test(s)) return 'A key cannot contain spaces. Check what was pasted.';
    const env = alpacaKeyEnvironment(k);
    if (env === 'paper' && paper === false) return 'That key ID is a paper key (PK...). Choose Paper, or use your live keys.';
    if (env === 'live' && paper !== false) return 'That key ID is a live key (AK...). Choose Live, or use your paper keys.';
    return null;
}

/**
 * The sentence for a failed connect or invite. A transport failure is never
 * reported as a problem with the keys.
 */
export function onboardingErrorMessage(status, body) {
    const b = body && typeof body === 'object' ? body : {};
    if (status === 0 || status == null) return 'Could not reach Atlas. Check your connection and try again.';
    if (status === 401) return 'Your session has ended. Sign in again.';
    if (b.detail && typeof b.detail === 'string') return b.detail;
    if (status === 403) return 'You do not have permission to do that.';
    if (status >= 500) return 'Atlas had a problem saving this. Nothing was changed; try again.';
    return 'Something went wrong. Try again.';
}

/** "2 of 3 accounts connected" -- or nothing for an uncapped administrator. */
export function accountCapLine(access) {
    if (!access || access.account_cap == null) return null;
    const owned = Number(access.owned_portfolios) || 0;
    const cap = Number(access.account_cap);
    return owned + ' of ' + cap + ' account' + (cap === 1 ? '' : 's') + ' connected';
}

/** Whether the caller may connect another account. Unknown access does not
 *  block: the server enforces the cap and answers with a sentence. */
export function canConnectMore(access) {
    if (!access || access.account_cap == null) return true;
    return (Number(access.owned_portfolios) || 0) < Number(access.account_cap);
}

/** What the administrator is told about a link the invite route returned. */
export function inviteResultText(result) {
    if (!result || !result.action_link) return null;
    const mins = Math.round((Number(result.expires_in_seconds) || 3600) / 60);
    const life = 'It works once and expires in ' + mins + ' minutes.';
    if (result.kind === 'recovery') {
        return result.email + ' already has an Atlas account. This link lets them set a new password. ' + life;
    }
    return 'Send this link to ' + result.email + '. It lets them set a password and connect their broker. ' + life;
}

// ---------------------------------------------------------------- RA-1
// "Request access" on the landing page. The same check runs in the browser
// and in api/access-request.js, so the two cannot disagree about what a
// valid request is.

export const ACCESS_NAME_MAX = 100;
export const ACCESS_NOTE_MAX = 1000;
const ACCESS_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** null when acceptable, otherwise the sentence to show. */
export function validateAccessRequest({ name, email, note }) {
    const n = typeof name === 'string' ? name.trim() : '';
    const em = typeof email === 'string' ? email.trim() : '';
    const no = typeof note === 'string' ? note.trim() : '';
    if (!n) return 'Tell us your name.';
    if (n.length > ACCESS_NAME_MAX) return 'Keep your name under ' + ACCESS_NAME_MAX + ' characters.';
    if (!em) return 'Enter your email address.';
    if (!ACCESS_EMAIL_RE.test(em) || em.length > 254) return 'That does not look like an email address.';
    if (no.length > ACCESS_NOTE_MAX) return 'Keep the note under ' + ACCESS_NOTE_MAX + ' characters.';
    return null;
}

/**
 * What a visitor is told after asking. ONE sentence whether the request was
 * new, a repeat, or for an address that already has an account -- anything
 * else would let the form tell a stranger who uses Atlas.
 */
export const ACCESS_REQUEST_REPLY =
    'Thanks. Your request is with an administrator. If it is approved, they will send you a one-time invitation link.';

/** The label for the administrator's Accounts button: the pending count, if any. */
export function accountsButtonLabel(pending) {
    const n = Number(pending);
    return Number.isInteger(n) && n > 0 ? 'ACCOUNTS · ' + n : 'ACCOUNTS';
}
