// ============================================================
// Vercel Serverless Function: invite-only onboarding (ON-1).
//
//   POST /api/onboarding?action=connect
//        { "broker": "alpaca", "name": "...", "key_id": "...",
//          "secret_key": "...", "paper": true }
//   POST /api/onboarding?action=invite   { "email": "..." }   administrators only
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

async function invite(req, res, env) {
    const isAdmin = await call(env.url + '/rest/v1/rpc/atlas_is_admin', {
        method: 'POST', headers: { ...env.userHeaders, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!isAdmin.ok) return res.status(503).json({ error: 'access_unavailable', detail: 'Could not confirm you are an administrator. Try again.' });
    if (isAdmin.body !== true) return res.status(403).json({ error: 'admin_only', detail: 'Only an administrator can invite people.' });

    const parsed = parseInviteInput(req.body);
    if (!parsed.ok) return res.status(400).json({ error: 'invalid_input', detail: parsed.error });
    const { email } = parsed.value;

    const redirect = inviteRedirect(req);
    const generate = (type) => call(env.url + '/auth/v1/admin/generate_link', {
        method: 'POST', headers: serviceHeaders(env.serviceKey),
        body: JSON.stringify(redirect ? { type, email, redirect_to: redirect } : { type, email }),
    });

    // Auth re-issues an invite for a person who never accepted one. For a
    // person who already has a working account it refuses; they get a link to
    // set a new password instead -- without an email server, "Forgot your
    // password?" cannot reach them either, so the administrator is the only
    // route back in.
    let kind = 'invite';
    let r = await generate('invite');
    if (!r.ok && alreadyRegistered(r)) {
        kind = 'recovery';
        r = await generate('recovery');
    }
    if (!r.ok) {
        console.error('onboarding: generate_link failed:', r.status, (r.body && (r.body.error_code || r.body.code)) || '');
        return res.status(502).json({ error: 'invite_failed', detail: 'The invitation could not be created. Try again.' });
    }
    const b = r.body || {};
    const link = b.action_link || (b.properties && b.properties.action_link) || null;
    if (!link) {
        console.error('onboarding: generate_link answered without a link');
        return res.status(502).json({ error: 'invite_failed', detail: 'The invitation could not be created. Try again.' });
    }
    return res.status(201).json({ email, kind, action_link: link, expires_in_seconds: INVITE_LINK_TTL_SECONDS });
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
    return res.status(400).json({ error: 'action must be connect or invite' });
}

// A signed-in person only. The cron secret has no business here: an account
// connected under it would belong to nobody.
export default withAuth(handler, { cron: false });
