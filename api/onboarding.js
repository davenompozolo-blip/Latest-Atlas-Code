// ============================================================
// Vercel Serverless Function: invite-only onboarding (ON-1).
//
//   POST /api/onboarding?action=connect
//        { "broker": "alpaca", "name": "...", "key_id": "...",
//          "secret_key": "...", "paper": true }
//   POST /api/onboarding?action=invite   { "email": "..." }   administrators only
//   POST /api/onboarding?action=decide   { "id": "...", "decision": "approve"|"decline" }
//                                        administrators only (RA-1 access requests)
//
// connect: a signed-in person connects THEIR OWN broker account. The keys are
// verified against the broker, the account number is taken from the broker's
// answer, and atlas_connect_broker_account registers the account, stores the
// keys in Vault, attributes it to the caller and makes them its owner -- one
// transaction. The first syncs are then started.
//
// invite: an administrator (atlas_admins) creates a person and gets back a
// one-time link to set their password (or, for someone who already has an
// account, a link to set a new one). There is no email server configured, so
// the link is handed to the administrator to deliver; Supabase's built-in mail
// only reaches the project's own team. Public sign-up stays disabled.
//
// No response ever carries a key, and a request body is never logged.
// ============================================================

import { withAuth, supabaseEnv, supabaseHeaders } from '../src/lib/apiAuth.js';
import {
    parseConnectInput, parseInviteInput, verifyAlpacaKeys, keysRejectedDetail,
    startFirstSyncs, last4, inviteRedirect, AUTH_TIMEOUT_MS,
} from '../src/lib/brokerOnboarding.js';

// Supabase Auth's mailer_otp_exp: how long an invite link works.
export const INVITE_LINK_TTL_SECONDS = 3600;

// Never throws: a timeout or transport failure comes back as ok:false, status null.
async function call(url, init) {
    let r, text;
    try {
        r = await fetch(url, { ...init, signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) });
        text = await r.text();
    } catch (e) {
        return { ok: false, status: null, body: { message: String((e && e.message) || e) } };
    }
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: r.ok, status: r.status, body };
}

function serviceHeaders(serviceKey) {
    return { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
}

async function myAccess(url, userHeaders) {
    const r = await call(url + '/rest/v1/rpc/atlas_my_access', {
        method: 'POST', headers: { ...userHeaders, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!r.ok || !Array.isArray(r.body) || !r.body[0]) return null;
    return r.body[0];
}

async function connect(req, res, env) {
    const parsed = parseConnectInput(req.body);
    if (!parsed.ok) return res.status(400).json({ error: 'invalid_input', detail: parsed.error });
    const { name, keyId, secretKey, paper } = parsed.value;
    const user = req.atlasAuth.user;

    // The cap is enforced in the database; asking first only spares the broker
    // a call that cannot lead anywhere.
    const access = await myAccess(env.url, env.userHeaders);
    if (!access) return res.status(503).json({ error: 'access_unavailable', detail: 'Could not read your account limits. Try again.' });
    if (access.account_cap != null && access.owned_portfolios >= access.account_cap) {
        return res.status(409).json({ error: 'account_limit', detail: 'You can connect up to ' + access.account_cap + ' accounts.' });
    }

    const acct = await verifyAlpacaKeys(keyId, secretKey, paper);
    if (!acct.ok) return res.status(422).json({ error: 'credentials_rejected', detail: keysRejectedDetail(paper, acct.status) });

    const r = await call(env.url + '/rest/v1/rpc/atlas_connect_broker_account', {
        method: 'POST', headers: serviceHeaders(env.serviceKey),
        body: JSON.stringify({
            p_user_id: user.id, p_name: name, p_account_number: acct.accountNumber,
            p_is_paper: paper, p_key_id: keyId, p_secret_key: secretKey,
        }),
    });
    if (!r.ok) {
        const code = r.body && r.body.code;
        if (code === '23505') {
            return res.status(409).json({ error: 'already_registered', detail: 'That broker account is already connected to Atlas.' });
        }
        if (code === '23514') {
            return res.status(409).json({ error: 'account_limit', detail: 'You have reached your account limit.' });
        }
        console.error('onboarding: connect failed:', r.status, (r.body && r.body.message) || '');
        return res.status(r.status ? 500 : 504).json({ error: 'connect_failed', detail: 'The account could not be saved. Nothing was connected; try again.' });
    }
    const portfolioId = r.body;
    const syncs = await startFirstSyncs(env.url, portfolioId, process.env.CRON_SECRET);
    return res.status(201).json({
        portfolio_id: portfolioId, name, account_last4: last4(acct.accountNumber), paper, first_syncs: syncs,
    });
}

function alreadyRegistered(r) {
    const b = r.body || {};
    const code = String(b.error_code || b.code || '');
    const msg = String(b.msg || b.message || '');
    return code === 'email_exists' || /already (been )?registered|already exists/i.test(msg);
}

// The caller is an administrator, asked with THEIR token so the database
// decides. Answers a response to send when they are not, null when they are.
async function refuseNonAdmin(res, env, verb) {
    const isAdmin = await call(env.url + '/rest/v1/rpc/atlas_is_admin', {
        method: 'POST', headers: { ...env.userHeaders, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!isAdmin.ok) return res.status(503).json({ error: 'access_unavailable', detail: 'Could not confirm you are an administrator. Try again.' });
    if (isAdmin.body !== true) return res.status(403).json({ error: 'admin_only', detail: 'Only an administrator can ' + verb + '.' });
    return null;
}

// A one-time link for this address: an invite, or -- for someone who already
// has an account -- a link to set a new password. Auth re-issues an invite for
// a person who never accepted one; without an email server "Forgot your
// password?" cannot reach anyone else, so the administrator is the only route
// back in. Returns { kind, link } or null (logged).
async function issueLink(req, env, email) {
    const redirect = inviteRedirect(req);
    const generate = (type) => call(env.url + '/auth/v1/admin/generate_link', {
        method: 'POST', headers: serviceHeaders(env.serviceKey),
        body: JSON.stringify(redirect ? { type, email, redirect_to: redirect } : { type, email }),
    });
    let kind = 'invite';
    let r = await generate('invite');
    if (!r.ok && alreadyRegistered(r)) {
        kind = 'recovery';
        r = await generate('recovery');
    }
    if (!r.ok) {
        console.error('onboarding: generate_link failed:', r.status, (r.body && (r.body.error_code || r.body.code)) || '');
        return null;
    }
    const b = r.body || {};
    const link = b.action_link || (b.properties && b.properties.action_link) || null;
    if (!link) {
        console.error('onboarding: generate_link answered without a link');
        return null;
    }
    return { kind, link };
}

async function invite(req, res, env) {
    const refused = await refuseNonAdmin(res, env, 'invite people');
    if (refused) return refused;
    const parsed = parseInviteInput(req.body);
    if (!parsed.ok) return res.status(400).json({ error: 'invalid_input', detail: parsed.error });
    const { email } = parsed.value;
    const issued = await issueLink(req, env, email);
    if (!issued) return res.status(502).json({ error: 'invite_failed', detail: 'The invitation could not be created. Try again.' });
    return res.status(201).json({ email, kind: issued.kind, action_link: issued.link, expires_in_seconds: INVITE_LINK_TTL_SECONDS });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// RA-1: approve or decline a request for access. Approval issues the link
// FIRST and only then marks the request approved: a request marked approved
// with no link behind it would be a promise nobody can keep, while a link
// issued for a request that then fails to close is just a pending request
// with a working invitation.
async function decide(req, res, env) {
    const refused = await refuseNonAdmin(res, env, 'decide requests');
    if (refused) return refused;
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const id = typeof b.id === 'string' ? b.id.trim() : '';
    const decision = b.decision === 'approve' ? 'approved' : b.decision === 'decline' ? 'declined' : null;
    if (!UUID_RE.test(id) || !decision) return res.status(400).json({ error: 'invalid_input', detail: 'A request id and approve or decline are required.' });

    const row = await call(env.url + '/rest/v1/access_requests?select=id,email,status&id=eq.' + id, {
        headers: serviceHeaders(env.serviceKey),
    });
    const reqRow = row.ok && Array.isArray(row.body) ? row.body[0] : null;
    if (!row.ok) return res.status(503).json({ error: 'unavailable', detail: 'Could not read the request. Try again.' });
    if (!reqRow) return res.status(404).json({ error: 'not_found', detail: 'That request no longer exists.' });
    if (reqRow.status !== 'pending') return res.status(409).json({ error: 'already_decided', detail: 'That request was already ' + reqRow.status + '.' });

    let issued = null;
    if (decision === 'approved') {
        issued = await issueLink(req, env, reqRow.email);
        if (!issued) return res.status(502).json({ error: 'invite_failed', detail: 'The invitation could not be created, so the request is still pending. Try again.' });
    }
    const mark = await call(env.url + '/rest/v1/rpc/atlas_decide_access_request', {
        method: 'POST', headers: serviceHeaders(env.serviceKey),
        body: JSON.stringify({ p_id: id, p_status: decision, p_admin: req.atlasAuth.user.id }),
    });
    if (!mark.ok) {
        console.error('onboarding: decide failed:', mark.status, (mark.body && mark.body.code) || '');
        if (issued) {
            // The link exists; say so rather than hide a working invitation.
            return res.status(207).json({ email: reqRow.email, kind: issued.kind, action_link: issued.link,
                expires_in_seconds: INVITE_LINK_TTL_SECONDS, warning: 'The link was created but the request could not be marked approved.' });
        }
        return res.status(502).json({ error: 'decide_failed', detail: 'The request could not be updated. Try again.' });
    }
    if (!issued) return res.status(200).json({ email: reqRow.email, decision });
    return res.status(201).json({ email: reqRow.email, decision, kind: issued.kind, action_link: issued.link, expires_in_seconds: INVITE_LINK_TTL_SECONDS });
}

async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { url, serviceKey } = supabaseEnv();
    const userHeaders = supabaseHeaders(req.atlasAuth, req);
    if (!serviceKey || !userHeaders) {
        console.error('onboarding: Supabase keys not configured on this deployment');
        return res.status(503).json({ error: 'not_configured' });
    }
    const env = { url, serviceKey, userHeaders };
    const action = req.query && req.query.action;
    if (action === 'connect') return connect(req, res, env);
    if (action === 'invite') return invite(req, res, env);
    if (action === 'decide') return decide(req, res, env);
    return res.status(400).json({ error: 'action must be connect, invite or decide' });
}

// A signed-in person only. The cron secret has no business here: an account
// connected under it would belong to nobody.
export default withAuth(handler, { cron: false });
