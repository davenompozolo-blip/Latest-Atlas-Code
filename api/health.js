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
    var url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return 'misconfigured';
    try {
        var sb = createClient(url, key);
        var { error } = await sb.from('system_health').select('component').limit(1).single();
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
