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
export const GATE_RECOVERY = 'recovery';         // arrived from a password-reset or invite link
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
 * Which set-a-password link opened the page, if any: 'recovery' (a reset
 * link) or 'invite' (ON-1: an administrator's invitation). Supabase puts
 * `type=...` in the URL fragment (implicit flow); the fragment check covers the
 * first render, before any auth event arrives. Both links sign the person in
 * with a session whose first legitimate use is to set a password, so both hold
 * the terminal behind the form.
 */
export function passwordSetupKind(hash) {
    if (typeof hash !== 'string' || !hash) return null;
    const h = hash.charAt(0) === '#' ? hash.slice(1) : hash;
    const parts = h.split('&');
    if (parts.some((kv) => kv === 'type=recovery')) return 'recovery';
    if (parts.some((kv) => kv === 'type=invite')) return 'invite';
    return null;
}

/** Whether the page was opened from a set-a-password link (reset or invite). */
export function isRecoveryUrl(hash) {
    return passwordSetupKind(hash) !== null;
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

/**
 * The browser keys holding the Supabase session, for a sign-out the server
 * refused. auth-js removes the stored session only AFTER the revoke request
 * succeeds (2.105.4, GoTrueClient._signOut), so a 503 or a dropped connection
 * would leave the user signed in on this device behind a reload that looks
 * like a sign-out. Keys are the configured storageKey and its suffixed
 * companions (`-code-verifier`, `-user`), never another project's.
 */
export function sessionStorageKeys(storage, storageKey) {
    const keys = [];
    if (typeof storageKey !== 'string' || !storageKey) return keys;
    try {
        if (!storage || typeof storage.length !== 'number') return keys;
        for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (k === storageKey || (typeof k === 'string' && k.indexOf(storageKey + '-') === 0)) keys.push(k);
        }
    } catch (_) { /* storage blocked: nothing to clear */ }
    return keys;
}

/** sessionStorage key marking that THIS tab's session came from a reset link. */
export const RECOVERY_MARKER_KEY = 'atlas.auth.recovery.v1';
/** sessionStorage key holding which link it was ('invite' | 'recovery'), so a
 *  refresh keeps the right wording. Wording only: it never opens the form. */
export const SETUP_KIND_KEY = 'atlas.auth.setup_kind.v1';

/**
 * Whether the set-new-password form is owed. A reset link's fragment is
 * consumed on the first load and the PASSWORD_RECOVERY event does not fire
 * again, so a refresh before saving would otherwise drop the user into the
 * terminal with the form gone. The marker records which user the recovery was
 * for; it counts only while that same user is the session, so a marker left
 * behind by someone else can never hold a different session in the form.
 */
export function recoveryPending({ hash, marker, session }) {
    if (isRecoveryUrl(hash)) return true;
    const uid = session && session.user && session.user.id;
    return typeof marker === 'string' && marker.length > 0 && marker === uid;
}

/**
 * Whether an auth event must reload the page. Loaders across the app cache in
 * module-level promises, so a tab that saw one user sign out and another sign
 * in (in this tab or another -- auth-js broadcasts across tabs) would render
 * the second user's terminal from the first user's cached data. Reload when a
 * session that existed ends, or when the user behind the session changes.
 * Never on a token refresh or a repeat of the same user.
 */
export function authChangeNeedsReload(prevUserId, event, nextUserId) {
    const prev = prevUserId || null;
    const next = nextUserId || null;
    if (!prev) return false;            // nothing was rendered for anyone yet
    if (event === 'SIGNED_OUT' || !next) return true;
    return prev !== next;
}
