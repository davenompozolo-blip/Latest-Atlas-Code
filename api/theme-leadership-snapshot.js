// api/theme-leadership-snapshot.js
// ------------------------------------------------------------
// Weekly theme-leadership snapshot: persists each theme's 5-day momentum
// change — the same field the rotation map plots on its y-axis — ranked,
// one row per theme, into theme_leadership_weekly. The phase-2 leadership
// timeline needs weekly history that isn't stored anywhere yet; this job
// starts collecting it now so the UI ships against real data, not a cold
// start (rotation redesign spec §3.7).
//
// Flow per run:
//   1. GET this deployment's own /api/nexus-theme — the single source of
//      per-theme momentum (weight-rolled from price_history). No second
//      computation path to drift out of sync with the page.
//   2. Rank themes by momentum5d (nulls skipped, never fabricated).
//   3. Upsert one row per theme, PK (snapshot_date, theme) → idempotent.
//
// Trigger: Vercel Cron (GET, Friday post-close) or manual with
// ?token=CRON_SECRET. snapshot_date = the price session the momentum is
// as of (nexus-theme's priceAsOf), not the wall-clock run date.

const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbW9qanN6dnZjaXRodXh3ZXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTg1NDgsImV4cCI6MjA4Nzk3NDU0OH0.xFo-N9CGQlpHlsykinr_ORAmzV4N7MIq0emW5N1Vojk';
const SB_URL = (process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_ANON;

async function fetchT(url, ms, headers) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 15000);
    try { return await fetch(url, { signal: ac.signal, headers: headers || {} }); }
    finally { clearTimeout(t); }
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
    const fwd = {};
    if (req.headers['x-vercel-protection-bypass']) fwd['x-vercel-protection-bypass'] = req.headers['x-vercel-protection-bypass'];

    try {
        // 1. The page's own momentum computation — one source of truth.
        const tr = await fetchT(origin + '/api/nexus-theme', 30000, fwd);
        if (!tr.ok) return res.status(502).json({ error: 'nexus-theme ' + tr.status });
        const j = await tr.json();
        const themes = ((j && j.themes) || []).filter(t => t.momentum5d != null);
        if (!themes.length) return res.status(200).json({ ok: false, written: 0, reason: 'no momentum data — price history not synced' });

        // 2. Rank; snapshot_date = the session the momentum is as of.
        const snapshotDate = j.priceAsOf || new Date().toISOString().slice(0, 10);
        const rows = themes
            .slice().sort((a, b) => b.momentum5d - a.momentum5d)
            .map((t, i) => ({
                snapshot_date: snapshotDate,
                theme: t.theme,
                momentum_5d: t.momentum5d,
                rank: i + 1,
                is_leader: i === 0,
            }));

        // 3. One idempotent upsert.
        const up = await fetch(SB_URL + '/rest/v1/theme_leadership_weekly?on_conflict=snapshot_date,theme', {
            method: 'POST',
            headers: {
                apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(rows),
        });
        if (!up.ok) return res.status(502).json({ error: 'upsert ' + up.status + ' ' + (await up.text()).slice(0, 200) });

        return res.status(200).json({
            ok: true, snapshot_date: snapshotDate, written: rows.length,
            leader: { theme: rows[0].theme, momentum_5d: rows[0].momentum_5d },
        });
    } catch (e) {
        return res.status(500).json({ error: (e && e.message) || 'snapshot error' });
    }
}
