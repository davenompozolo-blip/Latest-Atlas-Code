// ONB-5: the emails Atlas sends about an ACCOUNT, as opposed to the ones
// Supabase Auth sends about a sign-in (invite, code, password reset), which go
// through Auth's own Resend SMTP.
//
// Two kinds:
//   - to the person, when an administrator changes their access
//     (approved, restored, revoked). Setting someone back to pending sends
//     nothing: it is a correction, not news.
//   - to every administrator, when a pending person has finished their
//     details and is waiting (sent once; atlas_accounts.admin_notified_at).
//
// Sent with Resend's HTTP API from Vercel (RESEND_API_KEY). With no key the
// sender says so -- 'not_configured' -- and nothing is marked as sent, so the
// cron sends the admin notice once the key exists rather than never.
// No message ever carries a key, a token or a link that signs anyone in: the
// person is told to sign in at the site, which is the only way in.

export const SITE_URL = 'https://atlasterminal.online';
export const FROM = 'Atlas Terminal <no-reply@atlasterminal.online>';
export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
export const SEND_TIMEOUT_MS = 8000;

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** HTML-escape a value placed in a message body. Names come from users. */
export function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** A display name, or null. A subject line must not carry a newline. */
export function displayName(first, surname) {
    const n = [first, surname].map((x) => (typeof x === 'string' ? x.replace(/[\r\n]+/g, ' ').trim() : ''))
        .filter(Boolean).join(' ');
    return n || null;
}

function page(lines) {
    const body = lines.map((l) => '<p style="margin:0 0 14px">' + l + '</p>').join('');
    return '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;'
        + 'line-height:1.5;color:#111">' + body + '</div>';
}

/**
 * The message for a status change made by an administrator, or null when the
 * change is not something to tell the person about. `from` is the status
 * before the change ('pending' | 'approved' | 'revoked').
 */
export function statusChangeMessage({ from, to, email, first }) {
    if (!EMAIL_RE.test(String(email || ''))) return null;
    if (from === to) return null;
    const hi = first ? 'Hi ' + esc(first) + ',' : 'Hello,';
    const signIn = '<a href="' + SITE_URL + '">' + SITE_URL.replace('https://', '') + '</a>';
    if (to === 'approved') {
        const restored = from === 'revoked';
        const subject = restored ? 'Your Atlas access is restored' : "You're in: your Atlas account is approved";
        const lead = restored
            ? 'Your access to Atlas Terminal has been restored.'
            : 'Your Atlas Terminal account has been approved.';
        const text = [
            first ? 'Hi ' + first + ',' : 'Hello,', '',
            lead,
            'Sign in at ' + SITE_URL + ' with ' + email + '.' + (restored ? '' : ' The next step is connecting your broker account.'),
        ].join('\n');
        const html = page([hi, esc(lead),
            'Sign in at ' + signIn + ' with ' + esc(email) + '.' + (restored ? '' : ' The next step is connecting your broker account.')]);
        return { to: email, subject, text, html, kind: restored ? 'restored' : 'approved' };
    }
    if (to === 'revoked') {
        const subject = 'Your Atlas access has been removed';
        const lead = 'Your access to Atlas Terminal has been removed by an administrator, and you have been signed out.';
        const after = 'If you think this is a mistake, reply to the person who invited you.';
        const text = [first ? 'Hi ' + first + ',' : 'Hello,', '', lead, after].join('\n');
        return { to: email, subject, text, html: page([hi, esc(lead), esc(after)]), kind: 'revoked' };
    }
    return null;  // back to pending: a correction, not news
}

/**
 * The notice to the administrators that people are waiting. One message per
 * run listing everyone new, so three sign-ups are one email, not three.
 */
export function waitingNoticeMessage({ admins, people }) {
    const to = (admins || []).filter((a) => EMAIL_RE.test(String(a || '')));
    const rows = (people || []).filter((p) => p && EMAIL_RE.test(String(p.email || '')));
    if (!to.length || !rows.length) return null;
    const label = (p) => {
        const n = displayName(p.first_name, p.surname);
        return n ? n + ' (' + p.email + ')' : p.email;
    };
    const subject = rows.length === 1
        ? displayName(rows[0].first_name, rows[0].surname) ? displayName(rows[0].first_name, rows[0].surname) + ' is waiting for approval'
            : 'Someone is waiting for approval'
        : rows.length + ' people are waiting for approval';
    const where = 'Approve or revoke in Atlas: ACCOUNTS -> People (' + SITE_URL + ').';
    const text = ['Waiting for approval:', '',
        ...rows.map((p) => '- ' + label(p)), '', where].join('\n');
    const html = page(['Waiting for approval:',
        '<ul style="margin:0;padding-left:18px">' + rows.map((p) => '<li>' + esc(label(p)) + '</li>').join('') + '</ul>',
        esc(where)]);
    return { to, subject, text, html, kind: 'admin_waiting' };
}

/**
 * Send one message through Resend. Never throws. Answers
 *   { sent: true, id }                 accepted by Resend
 *   { sent: false, reason: 'not_configured' }   no RESEND_API_KEY
 *   { sent: false, reason: '<code>' }  refused or unreachable (logged by caller)
 * The key is never logged and never part of the answer.
 */
export async function sendEmail(msg, { apiKey, fetchImpl = fetch } = {}) {
    if (!msg) return { sent: false, reason: 'nothing_to_send' };
    if (!apiKey) return { sent: false, reason: 'not_configured' };
    let r;
    try {
        r = await fetchImpl(RESEND_ENDPOINT, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
    } catch (e) {
        return { sent: false, reason: 'unreachable' };
    }
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    if (r.ok && body && body.id) return { sent: true, id: body.id };
    const code = (body && (body.name || body.statusCode)) || r.status || 'refused';
    return { sent: false, reason: String(code) };
}
