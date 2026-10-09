// ============================================================
// Vercel Serverless Function: tell the administrators someone is waiting
// for approval (ONB-5).
//
//   POST /api/account-notify      Bearer CRON_SECRET only
//
// Called by cron job `notify_admins_waiting` (every 5 minutes), which
// dispatches ONLY when someone is waiting and has not been announced -- so an
// ordinary five minutes writes no sync_log row and makes no request.
//
// A waiting person is atlas_accounts.status = 'pending' with their details
// filled in (details_completed_at) and admin_notified_at still empty. One
// email lists everyone new; admin_notified_at is stamped only once Resend
// accepted it, so a failed send -- or a deployment with no RESEND_API_KEY --
// is retried on the next run rather than lost. Answers 503 when it could not
// send, so the chain reaper grades the stage as failed, never as a quiet 200.
// ============================================================

import { withAuth, supabaseEnv } from '../src/lib/apiAuth.js';
import { waitingNoticeMessage, sendEmail } from '../src/lib/accountEmail.js';

const TIMEOUT_MS = 8000;

async function call(url, init) {
    let r, text;
    try {
        r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
        text = await r.text();
    } catch (e) {
        return { ok: false, status: null, body: null };
    }
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: r.ok, status: r.status, body };
}

function headers(key, extra) {
    return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(extra || {}) };
}

async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { url, serviceKey } = supabaseEnv();
    if (!serviceKey) {
        console.error('account-notify: service key not configured on this deployment');
        return res.status(503).json({ error: 'not_configured' });
    }
    const h = headers(serviceKey);

    const waiting = await call(url + '/rest/v1/atlas_accounts?select=user_id,email,first_name,surname'
        + '&status=eq.pending&details_completed_at=not.is.null&admin_notified_at=is.null&order=details_completed_at.asc', { headers: h });
    if (!waiting.ok || !Array.isArray(waiting.body)) {
        console.error('account-notify: could not read waiting accounts:', waiting.status);
        return res.status(503).json({ error: 'unavailable' });
    }
    if (waiting.body.length === 0) return res.status(200).json({ waiting: 0, sent: false });

    const admins = await call(url + '/rest/v1/atlas_admins?select=user_id', { headers: h });
    const ids = admins.ok && Array.isArray(admins.body) ? admins.body.map((a) => a.user_id).filter(Boolean) : [];
    if (!ids.length) {
        console.error('account-notify: no administrators to notify:', admins.status);
        return res.status(503).json({ error: 'no_admins', waiting: waiting.body.length });
    }
    const emails = await call(url + '/rest/v1/atlas_accounts?select=email&user_id=in.(' + ids.join(',') + ')', { headers: h });
    const to = emails.ok && Array.isArray(emails.body) ? emails.body.map((x) => x.email).filter(Boolean) : [];

    const msg = waitingNoticeMessage({ admins: to, people: waiting.body });
    if (!msg) {
        console.error('account-notify: nothing sendable (admin addresses unreadable or invalid):', emails.status);
        return res.status(503).json({ error: 'no_recipient', waiting: waiting.body.length });
    }
    const sent = await sendEmail(msg, { apiKey: process.env.RESEND_API_KEY });
    if (!sent.sent) {
        console.error('account-notify: notice not sent:', sent.reason);
        return res.status(503).json({ error: 'not_sent', reason: sent.reason, waiting: waiting.body.length });
    }

    // Stamp exactly the people this email named, and only if still unstamped.
    const named = waiting.body.map((p) => p.user_id).join(',');
    const mark = await call(url + '/rest/v1/atlas_accounts?user_id=in.(' + named + ')&admin_notified_at=is.null', {
        method: 'PATCH', headers: headers(serviceKey, { Prefer: 'return=minimal' }),
        body: JSON.stringify({ admin_notified_at: new Date().toISOString() }),
    });
    if (!mark.ok) {
        // Sent but not stamped: the next run repeats the notice. Say so loudly.
        console.error('account-notify: notice sent but admin_notified_at not stamped:', mark.status);
        return res.status(207).json({ waiting: waiting.body.length, sent: true, stamped: false });
    }
    return res.status(200).json({ waiting: waiting.body.length, sent: true, stamped: true });
}

export default withAuth(handler, { user: false });
