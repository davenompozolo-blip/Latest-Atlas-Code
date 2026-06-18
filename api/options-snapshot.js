// api/options-snapshot.js
// ------------------------------------------------------------
// Daily options-positioning snapshot for the tracked pool (positions +
// scrapbook + watchlist, ~70 names — the same bounded set Opportunities draws
// from, nowhere near the universe). Reuses the /api/trading Alpaca options
// fetch, runs the pure chainMetrics, and writes one row per name to
// options_positioning_snapshots — names with no listed options record a row
// carrying nulls + drop_reason, so coverage stays honest. One run row to
// sync_log, mirroring the price sync's observability convention.
//
// Trigger: Vercel Cron (GET, trading days after close) or manual POST with
// ?token=CRON_SECRET. Snapshot writes use the anon key against the table's RLS
// write policy (the same headless pattern sync-valuations uses for
// scrapbook_snapshots) — no service-role secret required. The sync_log run row
// is opportunistic: written only if SUPABASE_SERVICE_ROLE_KEY happens to be set.

import { chainMetrics } from '../src/pages/nexus/nexusOptionsCompute.js';

const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbW9qanN6dnZjaXRodXh3ZXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTg1NDgsImV4cCI6MjA4Nzk3NDU0OH0.xFo-N9CGQlpHlsykinr_ORAmzV4N7MIq0emW5N1Vojk';
const SB_URL = (process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
// Reads (tracked pool) go through the anon key; writes need the service role
// because the snapshot table is RLS-locked to anon reads only.
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_ANON;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ymd = d => d.toISOString().slice(0, 10);

async function fetchT(url, ms, headers) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 12000);
    try { return await fetch(url, { signal: ac.signal, headers: headers || {} }); }
    finally { clearTimeout(t); }
}
const sbHeaders = key => ({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' });

// Front = first expiry comfortably past today (skip the expiring-this-session
// noise); back = first expiry ~25+ days beyond front (for the term-structure
// read). Both fall back gracefully when the chain is short.
function pickExpiries(expiries, today) {
    const sorted = (Array.isArray(expiries) ? expiries : []).filter(Boolean).slice().sort();
    if (!sorted.length) return { front: null, back: null };
    const minFront = ymd(new Date(new Date(today + 'T00:00:00Z').getTime() + 3 * 86_400_000));
    const front = sorted.find(d => d >= minFront) || sorted[0];
    const minBack = ymd(new Date(new Date(front + 'T00:00:00Z').getTime() + 25 * 86_400_000));
    const back = sorted.find(d => d >= minBack) || (sorted[sorted.length - 1] !== front ? sorted[sorted.length - 1] : null);
    return { front, back };
}

export default async function handler(req, res) {
    // Auth — Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
    const secret = (process.env.CRON_SECRET || '').trim();
    if (secret) {
        const auth = req.headers.authorization || '';
        const token = (req.query && req.query.token) || '';
        if (auth !== 'Bearer ' + secret && token !== secret) return res.status(401).json({ error: 'Unauthorized' });
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = (process.env.SYNC_ORIGIN || (host ? proto + '://' + host : '')).replace(/\/$/, '');
    if (!origin) return res.status(500).json({ error: 'Cannot resolve origin for /api/trading' });
    const fwd = {};
    if (req.headers['x-vercel-protection-bypass']) fwd['x-vercel-protection-bypass'] = req.headers['x-vercel-protection-bypass'];
    if (req.headers.cookie) fwd.cookie = req.headers.cookie;

    const q = req.query || {};
    const limit = Math.min(Number(q.limit) || 0, 200);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const throttleMs = Number(process.env.OPTIONS_THROTTLE_MS || q.throttle || 500);
    const today = ymd(new Date());

    // 1. Tracked pool — the canonical view returns one row per tracked name even
    //    before any snapshot exists (left join), so it's the single source of truth.
    let tickers;
    try {
        const hr = await fetchT(SB_URL + '/rest/v1/nexus_options?select=tk', 9000, sbHeaders(SB_ANON));
        if (!hr.ok) throw new Error('nexus_options ' + hr.status);
        const rows = await hr.json();
        // Foreign listings (2330.TW, 6758.T) duplicate US ADRs and carry no US
        // options — skip the digit-tickers rather than spend Alpaca calls on them.
        tickers = [...new Set(rows.map(r => (r.tk || '').toUpperCase()).filter(tk => tk && !/\d/.test(tk)))].sort();
    } catch (e) {
        return res.status(502).json({ error: 'Failed to read tracked pool: ' + e.message });
    }
    if (offset || limit) tickers = tickers.slice(offset, limit ? offset + limit : undefined);

    // Open one sync_log row (best-effort; needs the service role to write).
    let logId = null;
    const startedAt = new Date().toISOString();
    if (SB_SERVICE) {
        try {
            const ins = await fetch(SB_URL + '/rest/v1/sync_log', {
                method: 'POST', headers: { ...sbHeaders(SB_SERVICE), Prefer: 'return=representation' },
                body: JSON.stringify([{ status: 'running', source: 'options_snapshot', started_at: startedAt }]),
            });
            if (ins.ok) { const j = await ins.json(); logId = j && j[0] && j[0].id; }
        } catch { /* logging is best-effort */ }
    }

    const summary = { run_at: startedAt, scope: tickers.length, withChain: 0, noChain: 0, errors: 0, written: 0, results: [] };
    const snapRows = [];
    // PostgREST bulk insert requires every object in the array to carry the
    // SAME keys (else 400 PGRST102 "All object keys must match"). Build every
    // row through one shape so no-chain / error rows match the computed ones.
    const blankRow = (tk, reason) => ({
        symbol: tk, snapshot_date: today,
        atm_iv: null, skew_25d: null, pc_oi: null, pc_vol: null,
        front_iv: null, back_iv: null, oi_peak_strike: null, next_expiry: null,
        drop_reason: reason,
    });

    // 2. Per-name: expiries → front + back chains → chainMetrics. Best-effort and
    //    isolated; a name that fails records a drop_reason rather than vanishing.
    for (const tk of tickers) {
        try {
            const expResp = await fetchT(origin + '/api/trading?action=option_expiries&symbol=' + encodeURIComponent(tk), 12000, fwd)
                .then(r => r.ok ? r.json() : null).catch(() => null);
            const { front, back } = pickExpiries(expResp, today);
            if (!front) {
                snapRows.push(blankRow(tk, 'no_listed_options'));
                summary.noChain++; summary.results.push({ tk, drop_reason: 'no_listed_options' });
                if (throttleMs) await sleep(throttleMs);
                continue;
            }
            const [fc, bc] = await Promise.all([
                fetchT(origin + '/api/trading?action=options_chain&symbol=' + encodeURIComponent(tk) + '&expiry=' + front, 15000, fwd).then(r => r.ok ? r.json() : null).catch(() => null),
                back ? fetchT(origin + '/api/trading?action=options_chain&symbol=' + encodeURIComponent(tk) + '&expiry=' + back, 15000, fwd).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
            ]);
            const m = chainMetrics(fc, bc, null);
            snapRows.push({
                symbol: tk, snapshot_date: today,
                atm_iv: m.atmIv, skew_25d: m.skew25d, pc_oi: m.pcOi, pc_vol: m.pcVol,
                front_iv: m.frontIv, back_iv: m.backIv, oi_peak_strike: m.oiPeak,
                next_expiry: front, drop_reason: m.dropReason,
            });
            if (m.dropReason) { summary.noChain++; } else { summary.withChain++; }
            summary.results.push({ tk, atm_iv: m.atmIv, skew_25d: m.skew25d, drop_reason: m.dropReason });
        } catch (e) {
            summary.errors++;
            snapRows.push(blankRow(tk, 'no_listed_options'));
            summary.results.push({ tk, error: e.message });
        }
        if (throttleMs) await sleep(throttleMs);
    }

    // 3. One upsert. Writes with the anon key against the table's RLS write
    //    policy — the same headless pattern sync-valuations uses for
    //    scrapbook_snapshots, so there's no service-role/env-binding dependency.
    if (snapRows.length) {
        try {
            const up = await fetch(SB_URL + '/rest/v1/options_positioning_snapshots?on_conflict=symbol,snapshot_date', {
                method: 'POST', headers: { ...sbHeaders(SB_ANON), Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify(snapRows),
            });
            if (!up.ok) throw new Error('upsert ' + up.status + ' ' + (await up.text()).slice(0, 200));
            summary.written = snapRows.length;
        } catch (e) {
            summary.errors++; summary.writeError = e.message;
        }
    }

    if (SB_SERVICE && logId != null) {
        const status = summary.errors ? (summary.written ? 'partial' : 'error') : 'success';
        try {
            await fetch(SB_URL + '/rest/v1/sync_log?id=eq.' + logId, {
                method: 'PATCH', headers: sbHeaders(SB_SERVICE),
                body: JSON.stringify({ finished_at: new Date().toISOString(), status, prices_upserted: summary.written, error_message: summary.writeError || null, details: { withChain: summary.withChain, noChain: summary.noChain, errors: summary.errors, scope: summary.scope } }),
            });
        } catch { /* best-effort */ }
    }

    return res.status(200).json(summary);
}
