// ONB-2: where a signed-in person goes next.
//
// The database decides (public.atlas_my_onboarding, ONB-1); this module calls
// it and maps the answer to a screen. Ported from the handoff's nextStep.ts:
// the terminal has no router -- it is a gate around one app -- so a step maps
// to a SCREEN the gate renders rather than to a URL, and the route guard is the
// gate itself (WelcomeGate in src/components/Welcome.js). Same decision, one place.
//
// Call getOnboardingState right after a code is verified, on load when a
// session exists, and after each step completes.

export const STEP_SIGN_IN = 'sign_in';
export const STEP_DETAILS = 'details';
export const STEP_AWAITING = 'awaiting_approval';
export const STEP_CONNECT = 'connect_broker';
export const STEP_FIRST_SYNC = 'first_sync';
export const STEP_READY = 'ready';
export const STEP_REVOKED = 'revoked';

export const STEPS = Object.freeze([
    STEP_SIGN_IN, STEP_DETAILS, STEP_AWAITING, STEP_CONNECT, STEP_FIRST_SYNC, STEP_READY, STEP_REVOKED,
]);
const VALID = new Set(STEPS);

export class OnboardingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OnboardingError';
    }
}

/**
 * The caller's onboarding state. Throws OnboardingError rather than guessing:
 * the gate fails CLOSED on it (a retry screen, never the terminal and never a
 * step the database did not name).
 */
export async function getOnboardingState(sb) {
    if (!sb) throw new OnboardingError('no Supabase client');
    const { data: sess, error: sessErr } = await sb.auth.getSession();
    if (sessErr) throw new OnboardingError(sessErr.message || String(sessErr));
    if (!sess || !sess.session) return { next_step: STEP_SIGN_IN };

    const { data, error } = await sb.rpc('atlas_my_onboarding');
    if (error) {
        console.error('[onboarding] atlas_my_onboarding failed:', error.message || error);
        throw new OnboardingError(error.message || String(error));
    }
    if (!data || typeof data !== 'object' || !VALID.has(data.next_step)) {
        throw new OnboardingError('unexpected next_step: ' + (data && data.next_step));
    }
    return data;
}

/** Details step. Returns the new state so the caller moves on without a re-read. */
export async function saveDetails(sb, firstName, surname) {
    const { data, error } = await sb.rpc('atlas_set_my_details', {
        p_first_name: String(firstName || '').trim(),
        p_surname: String(surname || '').trim(),
    });
    if (error) throw new OnboardingError(error.message || String(error));
    if (!data || !VALID.has(data.next_step)) throw new OnboardingError('unexpected next_step: ' + (data && data.next_step));
    return data;
}

/** How often to re-read while waiting on something outside the person's control. */
export function watchInterval(step) {
    return step === STEP_FIRST_SYNC ? 5000 : 30000;
}

/**
 * Re-read until the step changes, then call onChange once and stop. A failed
 * read is transient here (the next tick tries again); the screen already
 * showing is the right one until the database says otherwise. Returns stop().
 * `timers` is injectable for tests.
 */
export function watchStep(sb, current, onChange, intervalMs, timers) {
    const t = timers || { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h) };
    const every = intervalMs || watchInterval(current);
    let stopped = false;
    let handle = null;
    const tick = async () => {
        if (stopped) return;
        try {
            const s = await getOnboardingState(sb);
            if (stopped) return;
            if (s.next_step !== current) {
                stopped = true;
                onChange(s);
                return;
            }
        } catch (_) { /* transient; try again next tick */ }
        if (!stopped) handle = t.set(tick, every);
    };
    handle = t.set(tick, every);
    return () => { stopped = true; if (handle != null) t.clear(handle); };
}

/* ------------------------------------------------------------ form checks */

const NAME_MAX = 80;

export function validateEmail(email) {
    const e = typeof email === 'string' ? email.trim() : '';
    if (!e) return 'Enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'That doesn’t look like an email address.';
    return null;
}

/** Strip what people paste around a code (spaces, a dash between halves). */
export function normaliseCode(code) {
    return String(code == null ? '' : code).replace(/[\s-]/g, '');
}

/**
 * Supabase's code length is a dashboard setting (6 asked for; 8 configured
 * when this was written), so any 6-10 digit code is passed to the server,
 * which is the authority. This only saves a round trip on a typo.
 */
export function validateCode(code) {
    const c = normaliseCode(code);
    if (!c) return 'Enter the code from the email.';
    if (!/^\d{6,10}$/.test(c)) return 'The code is the digits in the email, nothing else.';
    return null;
}

export function validateDetails(firstName, surname) {
    const f = typeof firstName === 'string' ? firstName.trim() : '';
    const s = typeof surname === 'string' ? surname.trim() : '';
    if (!f) return 'Enter your first name.';
    if (!s) return 'Enter your surname.';
    if (f.length > NAME_MAX || s.length > NAME_MAX) return 'Keep each name under ' + NAME_MAX + ' characters.';
    return null;
}

/* ------------------------------------------------------------ timing */

export const RESEND_AFTER_MS = 60 * 1000;
export const SYNC_SLOW_AFTER_MS = 3 * 60 * 1000;

/** Seconds until another code may be asked for; 0 when it may. */
export function resendWaitSeconds(sentAtMs, nowMs) {
    if (!Number.isFinite(sentAtMs) || !Number.isFinite(nowMs)) return 0;
    return Math.max(0, Math.ceil((sentAtMs + RESEND_AFTER_MS - nowMs) / 1000));
}

/**
 * The first sync has taken longer than it should. Measured from when the
 * broker was connected (the database's own stamp), never from when this page
 * opened -- a person who comes back an hour later is past "taking a while".
 * An absent or unparsable stamp is not "slow".
 */
export function syncIsSlow(brokerConnectedAt, nowMs) {
    const t = Date.parse(brokerConnectedAt || '');
    if (!Number.isFinite(t) || !Number.isFinite(nowMs)) return false;
    return nowMs - t > SYNC_SLOW_AFTER_MS;
}

/* ------------------------------------------------------------ auth errors */

/**
 * The sentence for a refused code request or verification. The same sentence
 * goes to every email on success; these are only for failures the person can
 * act on.
 */
export function codeErrorMessage(err, phase) {
    const status = err && err.status;
    const code = String((err && (err.code || err.error_code)) || '');
    const msg = String((err && err.message) || '');
    if (status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
        return 'Too many codes asked for. Wait a minute and try again.';
    }
    if (/signups? not allowed/i.test(msg) || code === 'signup_disabled') {
        // Configuration, not the person: open sign-in needs sign-ups enabled.
        return 'New sign-ups are not open yet. If you were invited, use the email the invitation was sent to.';
    }
    if (/captcha/i.test(msg) || code === 'captcha_failed') {
        return 'The security check did not pass. Reload the page and try again.';
    }
    if (phase === 'verify' && (code === 'otp_expired' || /expired|invalid/i.test(msg) || status === 403)) {
        return 'That code is wrong or has expired. Check it, or ask for a new one.';
    }
    if (status === 0 || status >= 500 || (err && err.name === 'AuthRetryableFetchError')) {
        return 'Atlas could not reach the sign-in service. Try again in a moment.';
    }
    return phase === 'verify' ? 'That code did not work. Ask for a new one.' : 'The code could not be sent. Try again.';
}
