// AUTH-1: the sign-in gate's decisions, kept apart from the component so they
// can be tested without a browser or a Supabase client.
//
// What this gate is and is not. It decides whether the TERMINAL renders: no
// session, no app. It does not, on its own, protect the data -- an anonymous
// request to PostgREST can still read what anon may read until AUTH-2 removes
// that path. What it does change is who the database thinks is asking: a
// signed-in request runs as `authenticated` with auth.uid() set, and
// atlas_active_portfolio() then resolves only portfolios that user is a member
// of (portfolio_members).

export const GATE_UNCONFIGURED = 'unconfigured'; // no Supabase client in this build
export const GATE_LOADING = 'loading';           // session not yet read from storage
export const GATE_SIGNED_OUT = 'signed_out';
export const GATE_RECOVERY = 'recovery';         // arrived from a password-reset link
export const GATE_SIGNED_IN = 'signed_in';

// Matches the server's password_min_length (Supabase Auth config, AUTH-1).
// The server is the authority; this only saves a round trip.
export const PASSWORD_MIN_LENGTH = 12;

/**
 * One state from the facts the component holds. Recovery wins over signed-in:
 * a reset link signs the user in with a session whose only legitimate use is
 * to set a new password, so the app must not render behind it.
 */
export function gateState({ configured, loading, session, recovery }) {
    if (!configured) return GATE_UNCONFIGURED;
    if (loading) return GATE_LOADING;
    if (recovery && session) return GATE_RECOVERY;
    if (session && session.user) return GATE_SIGNED_IN;
    return GATE_SIGNED_OUT;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side check before a sign-in or reset request. Returns null when the
 *  input is acceptable, otherwise the sentence to show. */
export function validateCredentials(email, password, { requirePassword = true } = {}) {
    const em = typeof email === 'string' ? email.trim() : '';
    if (!em) return 'Enter your email address.';
    if (!EMAIL_RE.test(em)) return 'That does not look like an email address.';
    if (requirePassword && (typeof password !== 'string' || password.length === 0)) {
        return 'Enter your password.';
    }
    return null;
}

/** Check a new password and its confirmation. null when acceptable. */
export function validateNewPassword(password, confirm) {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
        return 'Use at least ' + PASSWORD_MIN_LENGTH + ' characters.';
    }
    if (password !== confirm) return 'The two passwords do not match.';
    return null;
}

/**
 * The sentence for a failed auth request. Deliberately coarse on sign-in: it
 * never says whether the EMAIL exists, because "no such user" against "wrong
 * password" tells anyone probing the page which addresses have accounts.
 * A transport failure is never reported as a credentials problem -- the same
 * rule as everywhere else in the terminal: a failed request is not a
 * statement about the data.
 */
export function authErrorMessage(err, action = 'sign_in') {
    if (!err) return null;
    const code = String(err.code || err.error_code || '').toLowerCase();
    const status = Number(err.status);
    const msg = String(err.message || err.msg || '').toLowerCase();

    if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || status === 429) {
        return 'Too many attempts. Wait a few minutes and try again.';
    }
    if (err.name === 'AuthRetryableFetchError' || status === 0 || /failed to fetch|network/.test(msg)) {
        return 'Could not reach the sign-in service. Check your connection and try again.';
    }
    if (action === 'sign_in') {
        if (code === 'email_not_confirmed') return 'This account has not been confirmed yet. Use the link in your invitation email.';
        if (status === 400 || status === 401 || code === 'invalid_credentials') {
            return 'Email or password is incorrect.';
        }
    }
    if (action === 'update_password') {
        if (code === 'same_password') return 'Choose a password different from your current one.';
        if (code === 'weak_password') return 'That password is too weak. Use a longer one.';
        if (status === 401 || code === 'session_not_found') {
            return 'This reset link has expired. Request a new one.';
        }
    }
    if (status >= 500) return 'The sign-in service had a problem. Try again shortly.';
    return 'Something went wrong. Try again.';
}

/**
 * Whether the page was opened from a password-reset link. Supabase puts
 * `type=recovery` in the URL fragment (implicit flow) and fires a
 * PASSWORD_RECOVERY event; the fragment check covers the first render, before
 * the event arrives.
 */
export function isRecoveryUrl(hash) {
    if (typeof hash !== 'string' || !hash) return false;
    const h = hash.charAt(0) === '#' ? hash.slice(1) : hash;
    return h.split('&').some((kv) => kv === 'type=recovery');
}

/**
 * Keys a sign-out must remove from this browser, so the next person to sign in
 * here does not inherit the last one's account choice. The server would refuse
 * a portfolio they are not a member of anyway; clearing it means the refusal
 * never has to happen.
 */
export function signOutStorageKeys(storage) {
    const keys = [];
    try {
        if (!storage || typeof storage.length !== 'number') return keys;
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (typeof k === 'string' && k.indexOf('atlas.portfolio') === 0) keys.push(k);
        }
    } catch (_) { /* storage blocked: nothing to clear */ }
    return keys;
}
