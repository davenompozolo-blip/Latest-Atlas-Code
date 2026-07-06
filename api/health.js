'use strict';
// /api/health — lightweight pipeline health check
// Returns: { alpaca: 'ok'|'down', supabase: 'ok'|'down', ts: ISO }

import { createClient } from '@supabase/supabase-js';

function cors(res) {
    var origin = process.env.ATLAS_ALLOWED_ORIGIN;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    }
}

async function pingAlpaca() {
    var key = process.env.ALPACA_API_KEY;
    var secret = process.env.ALPACA_API_SECRET;
    if (!key || !secret) return 'misconfigured';
    var paper = (process.env.ALPACA_PAPER || 'true').toLowerCase() !== 'false';
    var base = paper ? 'https://paper-api.alpaca.markets/v2' : 'https://api.alpaca.markets/v2';
    try {
        var ac = new AbortController();
        var t = setTimeout(() => ac.abort(), 5000);
        var r = await fetch(base + '/clock', { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret }, signal: ac.signal });
        clearTimeout(t);
        return r.ok ? 'ok' : 'down';
    } catch (_) { return 'down'; }
}

async function pingSupabase() {
    // ATLAS_ overrides first — SUPABASE_URL may be integration-injected and
    // point at a non-ATLAS Supabase project (see api/options-snapshot.js).
    var url = process.env.ATLAS_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://vdmojjszvvcithuxwexx.supabase.co';
    var key = process.env.ATLAS_SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return 'misconfigured';
    try {
        var sb = createClient(url, key);
        // Probe a table that actually exists — system_health was never
        // created, so the old check reported 'down' unconditionally.
        var { error } = await sb.from('assets').select('id').limit(1);
        return error ? 'down' : 'ok';
    } catch (_) { return 'down'; }
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    const [alpaca, supabase] = await Promise.all([pingAlpaca(), pingSupabase()]);
    const status = (alpaca === 'ok' && supabase === 'ok') ? 200 : 503;
    return res.status(status).json({ alpaca, supabase, ts: new Date().toISOString() });
}
