// ============================================================
// Vercel Serverless Function: register a broker account, or adopt the
// pre-Vault env key pairs into Vault (VC-1).
//
//   POST /api/broker-accounts?action=register
//        { "name": "...", "key_id": "...", "secret_key": "...", "paper": true }
//   POST /api/broker-accounts?action=adopt_env
//
// Adding an account used to mean two database rows, a key pair pasted into
// BOTH Supabase function secrets and Vercel, and a Vercel redeploy. Register
// is one call: the pair is verified against the broker, the account number is
// taken from the broker's own /v2/account answer (never from what someone
// typed), and atlas_register_broker_account writes the rows and the Vault
// secret in one transaction. The first syncs are then started, so the account
// arrives with its history rather than waiting for the next cron tick.
//
// adopt_env copies each existing account's <credential_prefix>_KEY/_SECRET
// from THIS deployment's environment into Vault, after the same identity
// check. The keys go server to server and are never returned.
//
// ADMIN ONLY until the platform has user auth: Bearer CRON_SECRET, header
// only (a URL token lands in logs), and it FAILS CLOSED when the secret is
// unset -- a route that stores credentials must not be open by default.
// No response ever carries a key.
// ============================================================

import { withAuth } from '../src/lib/apiAuth.js';
const SB_URL = (process.env.ATLAS_SUPABASE_URL || process.env.VITE_SUPABASE_URL
    || 'https://vdmojjszvvcithuxwexx.supabase.co').replace(/\/$/, '');
const SB_KEY = process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const TRADING_BASE = (paper) => paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
const TIMEOUT_MS = 8000;   // every outbound call is bounded: a hung upstream must not hold the function
// The first syncs are an accelerant -- the cron picks every account up anyway --
// so they are waited on only this long, well inside the route's maxDuration.
const FIRST_SYNC_WAIT_MS = 25000;
const FIRST_SYNCS = ['sync_alpaca_positions', 'sync_alpaca_transactions', 'sync_portfolio_history'];

function sbHeaders(extra) {
    return Object.assign({
        apikey: SB_KEY,
        Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
    }, extra || {});
}

// Never throws: a timeout or transport failure comes back as ok:false, status
// null, so every caller's existing not-ok branch handles it.
async function rpc(fn, args) {
    let r, text;
    try {
        r = await fetch(SB_URL + '/rest/v1/rpc/' + fn, {
            method: 'POST', headers: sbHeaders(), body: JSON.stringify(args),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        text = await r.text();   // the timeout covers the body too, so it is read inside the try
    } catch (e) {
        return { ok: false, status: null, body: { message: fn + ' did not answer: ' + String(e && e.message || e) } };
    }
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { ok: r.ok, status: r.status, body };
}

// What the broker says these keys belong to. Never throws; the caller decides.
async function brokerAccount(keyId, secretKey, paper) {
    try {
        const r = await fetch(TRADING_BASE(paper) + '/v2/account', {
            headers: { 'APCA-API-KEY-ID': keyId, 'APCA-API-SECRET-KEY': secretKey, accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!r.ok) return { ok: false, status: r.status };
        const a = await r.json();
        if (!a || typeof a.account_number !== 'string') return { ok: false, status: r.status };
        return { ok: true, accountNumber: a.account_number, status: a.status || null };
    } catch (e) {
        return { ok: false, status: null, error: String(e && e.message || e) };
    }
}

async function startFirstSyncs(portfolioId) {
    const out = {};
    await Promise.all(FIRST_SYNCS.map(async (fn) => {
        const body = fn === 'sync_portfolio_history'
            ? { period: '6M', timeframe: '1D', portfolio_id: portfolioId }   // first run widens to 'all' itself
            : { time: new Date().toISOString() };
        try {
            const r = await fetch(SB_URL + '/functions/v1/' + fn, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
                signal: AbortSignal.timeout(FIRST_SYNC_WAIT_MS),
            });
            out[fn] = r.status;
        } catch (e) {
            if (e && e.name === 'TimeoutError') {
                out[fn] = 'still running when the route stopped waiting';
            } else {
                console.error('broker-accounts: first sync ' + fn + ' failed to start:', e);
                out[fn] = 'not started';
            }
        }
    }));
    return out;
}

async function register(req, res) {
    const b = req.body || {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const keyId = typeof b.key_id === 'string' ? b.key_id.trim() : '';
    const secretKey = typeof b.secret_key === 'string' ? b.secret_key.trim() : '';
    const paper = b.paper !== false;
    if (!name || !keyId || !secretKey) {
        return res.status(400).json({ error: 'name, key_id and secret_key are required' });
    }

    const acct = await brokerAccount(keyId, secretKey, paper);
    if (!acct.ok) {
        return res.status(422).json({
            error: 'credentials_rejected',
            detail: 'Alpaca did not accept these keys on the ' + (paper ? 'paper' : 'live') + ' API'
                + (acct.status ? ' (HTTP ' + acct.status + ')' : ''),
        });
    }

    const r = await rpc('atlas_register_broker_account', {
        p_name: name, p_account_number: acct.accountNumber, p_is_paper: paper,
        p_key_id: keyId, p_secret_key: secretKey,
    });
    if (!r.ok) {
        const msg = (r.body && r.body.message) || String(r.body);
        if (r.body && r.body.code === '23505') {
            return res.status(409).json({ error: 'already_registered', account_number: acct.accountNumber });
        }
        console.error('broker-accounts: register failed:', r.status, msg);
        return res.status(500).json({ error: 'register_failed', detail: msg });
    }
    const portfolioId = r.body;
    const syncs = await startFirstSyncs(portfolioId);
    return res.status(201).json({
        portfolio_id: portfolioId, name, account_number: acct.accountNumber,
        paper, first_syncs: syncs,
    });
}

async function adoptEnv(req, res) {
    let r, accounts;
    try {
        r = await fetch(SB_URL
        + '/rest/v1/broker_accounts?select=id,credential_prefix,alpaca_account_number,is_paper'
        + '&broker=eq.alpaca&credential_prefix=not.is.null&order=created_at',
        { headers: sbHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!r.ok) {
            console.error('broker-accounts: broker_accounts read failed:', r.status, await r.text());
            return res.status(500).json({ error: 'broker_accounts read failed' });
        }
        accounts = await r.json();   // inside the try: the timeout covers the body read
    } catch (e) {
        console.error('broker-accounts: broker_accounts read did not answer:', e);
        return res.status(504).json({ error: 'broker_accounts read did not answer' });
    }
    const results = [];
    for (const a of accounts) {
        const row = { account_number: a.alpaca_account_number, credential_prefix: a.credential_prefix };
        const have = await rpc('atlas_broker_credentials', { p_broker_account_id: a.id });
        if (have.ok && Array.isArray(have.body) && have.body.length) {
            results.push(Object.assign(row, { result: 'already_in_vault' }));
            continue;
        }
        const keyId = process.env[a.credential_prefix + '_KEY'];
        const secretKey = process.env[a.credential_prefix + '_SECRET'];
        if (!keyId || !secretKey) {
            results.push(Object.assign(row, { result: 'env_pair_missing_on_this_deployment' }));
            continue;
        }
        const acct = await brokerAccount(keyId, secretKey, a.is_paper);
        if (!acct.ok) {
            results.push(Object.assign(row, { result: 'credentials_rejected', status: acct.status }));
            continue;
        }
        if (acct.accountNumber !== a.alpaca_account_number) {
            results.push(Object.assign(row, { result: 'identity_mismatch', reported: acct.accountNumber }));
            continue;
        }
        const s = await rpc('atlas_store_broker_credentials', {
            p_broker_account_id: a.id, p_key_id: keyId, p_secret_key: secretKey,
        });
        if (!s.ok) console.error('broker-accounts: store failed for', a.alpaca_account_number, s.status, s.body);
        results.push(Object.assign(row, { result: s.ok ? 'adopted' : 'store_failed' }));
    }
    const failed = results.some(x => !['adopted', 'already_in_vault'].includes(x.result));
    return res.status(failed ? 207 : 200).json({ accounts: results });
}

async function handler(req, res) {
    const secret = (process.env.CRON_SECRET || '').trim();
    if (!secret) {
        console.error('broker-accounts: CRON_SECRET unset -- refusing (this route stores credentials)');
        return res.status(503).json({ error: 'admin secret not configured' });
    }
    if ((req.headers && req.headers.authorization) !== 'Bearer ' + secret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    if (!SB_KEY) {
        console.error('broker-accounts: Supabase service key unset');
        return res.status(500).json({ error: 'Supabase service key not configured' });
    }
    const action = req.query && req.query.action;
    if (action === 'register') return register(req, res);
    if (action === 'adopt_env') return adoptEnv(req, res);
    return res.status(400).json({ error: 'action must be register or adopt_env' });
}

// AUTH-2: pg_cron only (Bearer CRON_SECRET).
export default withAuth(handler, { user: false });
