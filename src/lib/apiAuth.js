// AUTH-2: who may call an /api route, decided in one place.
//
// Two callers are legitimate and nothing else is:
//   - a signed-in user: `Authorization: Bearer <Supabase access token>`,
//     verified against Supabase Auth (GET /auth/v1/user), so a revoked or
//     expired session is refused rather than trusted until its exp;
//   - pg_cron / the nightly chain: `Authorization: Bearer <CRON_SECRET>`,
//     exactly as atlas_chain_dispatch sends it. Never `?token=` -- a query
//     string lands in access logs.
// An unset CRON_SECRET authorises no cron call (fail closed), unlike the older
// per-route checks, which skipped auth entirely when the secret was absent.
//
// A user's request reaches Supabase with the USER's token, so the database --
// RLS, atlas_active_portfolio()'s membership check -- decides what they see.
// A route never widens a user's reach to the service key's. Cron calls use the
// service key, as before.

import { createHash, timingSafeEqual } from 'node:crypto';

export const SUPABASE_URL_DEFAULT = 'https://vdmojjszvvcithuxwexx.supabase.co';
const PORTFOLIO_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The project URL and keys from the environment, in the order the routes
 *  already used them. Pure over `env` so tests can pass their own. */
export function supabaseEnv(env = process.env) {
    const url = (env.ATLAS_SUPABASE_URL || env.VITE_SUPABASE_URL || SUPABASE_URL_DEFAULT).replace(/\/+$/, '');
    const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || null;
    const serviceKey = env.ATLAS_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || null;
    return { url, anonKey, serviceKey };
}

/** The bearer token from an Authorization header, or null. */
export function bearerOf(req) {
    const h = req && req.headers ? (req.headers.authorization || req.headers.Authorization || '') : '';
    const m = /^Bearer\s+(\S+)\s*$/i.exec(String(h));
    return m ? m[1] : null;
}

function sameSecret(a, b) {
    const x = createHash('sha256').update(String(a)).digest();
    const y = createHash('sha256').update(String(b)).digest();
    return timingSafeEqual(x, y);
}

/** Whether this token is the configured CRON_SECRET. Unset secret: never. */
export function isCronToken(token, secret) {
    const s = typeof secret === 'string' ? secret.trim() : '';
    if (!s || !token) return false;
    return sameSecret(token, s);
}

/** The ?portfolio= id when well-formed, lower-cased; otherwise null. */
export function requestedPortfolio(req) {
    const p = req && req.query ? req.query.portfolio : null;
    return typeof p === 'string' && PORTFOLIO_RE.test(p) ? p.toLowerCase() : null;
}

// token hash -> { user, at }. A verified session is reused for a short while
// so a page that fires ten /api calls does not make ten Auth round trips.
const USER_CACHE_MS = 60 * 1000;
const _users = new Map();

export function _clearUserCache() { _users.clear(); }

/**
 * The user behind an access token, or null. Asks Supabase Auth rather than
 * trusting the token's own claims, so a signed-out or deleted user is refused.
 * Throws only when Auth itself cannot be reached (the caller answers 503, not
 * 401: a transport failure is not a statement that the user is unknown).
 */
export async function verifyUser(token, { url, anonKey, fetchImpl = fetch, now = Date.now } = {}) {
    if (!token || !anonKey) return null;
    const k = createHash('sha256').update(token).digest('hex');
    const hit = _users.get(k);
    if (hit && now() - hit.at < USER_CACHE_MS) return hit.user;
    const r = await fetchImpl(url + '/auth/v1/user', {
        headers: { apikey: anonKey, Authorization: 'Bearer ' + token },
    });
    if (r.status === 401 || r.status === 403) { _users.delete(k); return null; }
    if (!r.ok) {
        const e = new Error('auth service answered HTTP ' + r.status);
        e.transport = true;
        throw e;
    }
    const u = await r.json();
    if (!u || !u.id) return null;
    const user = { id: u.id, email: u.email || null };
    if (_users.size > 500) _users.clear();
    _users.set(k, { user, at: now() });
    return user;
}

/**
 * Decide a request. `allow` names which callers this route accepts:
 * { user: true, cron: true } by default. Returns
 *   { ok: true, kind: 'user', user, token } | { ok: true, kind: 'cron' }
 *   | { ok: false, status, error }.
 */
export async function authorizeRequest(req, { allow = { user: true, cron: true }, env = process.env, fetchImpl = fetch, now } = {}) {
    const token = bearerOf(req);
    if (!token) return { ok: false, status: 401, error: 'sign_in_required' };
    if (allow.cron && isCronToken(token, env.CRON_SECRET)) return { ok: true, kind: 'cron' };
    if (!allow.user) return { ok: false, status: 401, error: 'not_authorised' };
    const { url, anonKey } = supabaseEnv(env);
    if (!anonKey) return { ok: false, status: 503, error: 'auth_not_configured' };
    try {
        const user = await verifyUser(token, { url, anonKey, fetchImpl, now });
        if (!user) return { ok: false, status: 401, error: 'session_invalid' };
        return { ok: true, kind: 'user', user, token };
    } catch (e) {
        console.error('[apiAuth] could not verify the session:', e && e.message);
        return { ok: false, status: 503, error: 'auth_unavailable' };
    }
}

/**
 * Headers for a PostgREST call made on behalf of this request. A user's call
 * carries the user's own token (role authenticated); a cron call the service
 * key. The chosen portfolio travels as x-atlas-portfolio and is validated by
 * atlas_active_portfolio(), which for a user also requires membership.
 * Returns null when the deployment lacks the key the caller needs.
 */
export function supabaseHeaders(auth, req, env = process.env) {
    const { anonKey, serviceKey } = supabaseEnv(env);
    let h;
    if (auth && auth.kind === 'user') {
        if (!anonKey) return null;
        h = { apikey: anonKey, Authorization: 'Bearer ' + auth.token };
    } else if (auth && auth.kind === 'cron') {
        if (!serviceKey) return null;
        h = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };
    } else {
        return null;
    }
    const p = requestedPortfolio(req);
    if (p) h['x-atlas-portfolio'] = p;
    return h;
}

/**
 * Wrap a route handler. The handler runs only for an accepted caller and finds
 * the decision on req.atlasAuth. OPTIONS passes through for CORS preflight.
 */
export function withAuth(handler, opts = {}) {
    // RA-1: a route a signed-out visitor must reach (the request-access form).
    // It runs with no caller at all, so it may never read on anyone's behalf;
    // apiAuth.test.mjs pins the list of routes allowed to declare this.
    if (opts.public === true) {
        const open = async function atlasPublic(req, res) {
            if (req) req.atlasAuth = { ok: true, kind: 'public' };
            return handler(req, res);
        };
        open.__atlasAuth = { public: true };
        return open;
    }
    const allow = { user: opts.user !== false, cron: opts.cron !== false };
    const wrapped = async function atlasAuthed(req, res) {
        if (req && req.method === 'OPTIONS') return handler(req, res);
        const a = await authorizeRequest(req, { allow, fetchImpl: opts.fetchImpl, env: opts.env });
        if (!a.ok) {
            res.setHeader('Cache-Control', 'no-store');
            return res.status(a.status).json({ error: a.error });
        }
        req.atlasAuth = a;
        return handler(req, res);
    };
    wrapped.__atlasAuth = allow;
    return wrapped;
}

/**
 * Headers for a call this route makes to another /api route on the caller's
 * behalf. Since AUTH-2b every route checks its caller, so the caller's own
 * Authorization has to travel with the internal call -- a call that drops it is
 * answered 401 and reads as "no data". Deployment-protection credentials ride
 * along so previews work too.
 */
export function internalCallHeaders(req) {
    const src = (req && req.headers) || {};
    const h = {};
    if (src['x-vercel-protection-bypass']) h['x-vercel-protection-bypass'] = src['x-vercel-protection-bypass'];
    if (src.cookie) h.cookie = src.cookie;
    if (src.authorization) h.authorization = src.authorization;
    return h;
}

/** Cache-Control for a response that describes a user's book: never shared. */
export function privateCache(seconds) {
    return 'private, max-age=' + Math.max(0, Math.floor(seconds || 0));
}
