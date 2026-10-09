// ============================================================
// Vercel Serverless Function: "Request access" (RA-1).
//
//   POST /api/access-request   { "first_name": "...", "surname": "...", "email": "...",
//                                "note": "...", "website": "" }
//
// The ONE route a signed-out visitor can reach. It never reads on anyone's
// behalf: it records a request with the service key through
// atlas_submit_access_request() and answers. An administrator approves it in
// the terminal (ACCOUNTS -> Requests), which issues the usual invite link.
//
// It cannot become an oracle for who has an account: a new request, a repeat,
// and an address that already belongs to someone all get the same 202 and the
// same sentence. Only the rate limit is visible, and it is keyed by IP.
//
// Abuse controls: a honeypot field real people never see, input bounds, and
// limits enforced in the database under a lock (3 an hour per IP, 50 a day in
// all). The IP is stored only as a keyed hash.
// ============================================================

import { createHash } from 'node:crypto';
import { withAuth, supabaseEnv } from '../../src/lib/apiAuth.js';
import { validateAccessRequest, ACCESS_REQUEST_REPLY } from '../../src/lib/onboarding.js';

const TIMEOUT_MS = 8000;

/** The client IP as Vercel reports it, or '' when absent. */
export function clientIp(req) {
    const h = (req && req.headers) || {};
    const fwd = String(h['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || String(h['x-real-ip'] || '').trim();
}

/** Keyed hash: the raw IP is never stored, and the hash is useless without the key. */
export function ipHash(ip, pepper) {
    return createHash('sha256').update(String(pepper) + '|' + String(ip || 'unknown')).digest('hex');
}

async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { url, serviceKey } = supabaseEnv();
    if (!serviceKey) {
        console.error('access-request: service key not configured');
        return res.status(503).json({ error: 'not_configured' });
    }
    const b = req.body && typeof req.body === 'object' ? req.body : {};

    // Honeypot: a field hidden from people. A bot that fills it is told the
    // same thing as everyone else and nothing is recorded.
    if (typeof b.website === 'string' && b.website.trim() !== '') {
        return res.status(202).json({ ok: true, message: ACCESS_REQUEST_REPLY });
    }

    const invalid = validateAccessRequest({ firstName: b.first_name, surname: b.surname, email: b.email, note: b.note });
    if (invalid) return res.status(400).json({ error: 'invalid_input', detail: invalid });

    const pepper = process.env.ACCESS_REQUEST_PEPPER || serviceKey;
    let r, out;
    try {
        r = await fetch(url + '/rest/v1/rpc/atlas_submit_access_request', {
            method: 'POST',
            headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                p_name: String(b.first_name).trim(),
                p_surname: String(b.surname).trim(),
                p_email: String(b.email).trim(),
                p_note: typeof b.note === 'string' ? b.note.trim() : null,
                p_ip_hash: ipHash(clientIp(req), pepper),
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        out = await r.json().catch(() => null);
    } catch (e) {
        console.error('access-request: database did not answer:', e && e.message);
        return res.status(503).json({ error: 'unavailable', detail: 'Could not send your request. Try again shortly.' });
    }
    if (!r.ok) {
        console.error('access-request: submit failed:', r.status, (out && out.code) || '');
        if (out && out.code === '23514') {
            return res.status(400).json({ error: 'invalid_input', detail: 'Check your name, email and note, and try again.' });
        }
        return res.status(503).json({ error: 'unavailable', detail: 'Could not send your request. Try again shortly.' });
    }
    if (out === 'rate_limited') {
        return res.status(429).json({ error: 'rate_limited', detail: 'Too many requests from here. Try again in an hour.' });
    }
    // recorded | duplicate | existing_user: one answer, deliberately.
    return res.status(202).json({ ok: true, message: ACCESS_REQUEST_REPLY });
}

// RA-1: public -- the landing page has no session to send.
export default withAuth(handler, { public: true });
