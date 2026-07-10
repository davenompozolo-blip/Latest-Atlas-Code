'use strict';
// /api/ledger-snapshot — Phase 2 outcome snapshotting (cron-driven)
//
// 1. Refreshes the SPY benchmark series in price_history (daily bars).
// 2. Calls snapshot_decision_outcomes(), which appends any newly-matured
//    decision outcomes (entity vs SPY at 30/60/90/to-date).
//
// Idempotent on both halves: price upserts on conflict; outcomes are
// append-only with a unique(decision_id,horizon_days) guard. Safe to run
// daily from vercel.json crons, or on demand.

import { createClient } from '@supabase/supabase-js';

const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
// Env resolution mirrors api/options-snapshot.js: several Vercel projects
// deploy this repo, and on some of them the Supabase Vercel integration
// injects SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY pointing at its own
// (non-ATLAS) project. ATLAS_-prefixed overrides win, then VITE_, then the
// hardcoded ATLAS project — never the integration-injected SUPABASE_URL.
function sbUrl() {
    return (process.env.ATLAS_SUPABASE_URL || process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
}
function sbService() {
    const key = process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return null;
    return createClient(sbUrl(), key, { auth: { persistSession: false } });
}

// Pull SPY daily bars from Alpaca's market-data API (keys already in env).
async function fetchSpyBars(startISO) {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET;
    if (!key || !secret) return { error: 'alpaca misconfigured' };
    const url = 'https://data.alpaca.markets/v2/stocks/SPY/bars'
        + '?timeframe=1Day&adjustment=all&limit=10000&start=' + encodeURIComponent(startISO);
    try {
        const r = await fetch(url, { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret } });
        if (!r.ok) return { error: 'alpaca http ' + r.status };
        const j = await r.json();
        return { bars: j.bars || [] };
    } catch (e) {
        return { error: String(e && e.message || e) };
    }
}

async function upsertSpy(sb, bars) {
    if (!bars.length) return { upserted: 0, error: null };
    // ensure the SPY benchmark asset exists
    let { data: asset } = await sb.from('assets').select('id').eq('symbol', 'SPY').maybeSingle();
    if (!asset) {
        const ins = await sb.from('assets')
            .insert({ symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', asset_class: 'etf', currency: 'USD', sector: 'Benchmark' })
            .select('id').single();
        asset = ins.data;
    }
    if (!asset) return { upserted: 0, error: 'SPY asset row missing and insert failed' };
    const rows = bars.map(function(b) {
        return {
            asset_id: asset.id,
            price_date: b.t.slice(0, 10),
            open: b.o, high: b.h, low: b.l, close: b.c,
            adjusted_close: b.c, volume: b.v,
            source: 'alpaca', interval: '1d',
        };
    });
    // price_history has a strict unique index on (asset_id, price_date, interval)
    // — conflicting on the 4-column key with `source` raises instead of merging
    // whenever a row from another source exists for the same date, and the whole
    // batch fails atomically. Conflict on the real natural key.
    const { error } = await sb.from('price_history')
        .upsert(rows, { onConflict: 'asset_id,price_date,interval' });
    if (error) return { upserted: 0, error: error.message };
    return { upserted: rows.length, error: null };
}

export default async function handler(req, res) {
    const sb = sbService();
    if (!sb) return res.status(503).json({ error: 'supabase misconfigured' });

    // refresh SPY from ~120 days back (covers the longest open horizon)
    const start = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);
    const spy = await fetchSpyBars(start);
    let spyResult = { upserted: 0, error: spy.error || null };
    if (spy.bars) spyResult = await upsertSpy(sb, spy.bars);

    // run the snapshotter regardless (entity prices may have advanced)
    const { data, error } = await sb.rpc('snapshot_decision_outcomes');
    if (error) return res.status(500).json({ error: error.message, pricesUpserted: spyResult.upserted, spyError: spyResult.error });

    // Phase 5: check for drift / calibration / integrity alerts
    const { data: alertsInserted } = await sb.rpc('insert_ledger_alerts');

    return res.status(200).json({
        ok: true,
        pricesUpserted: spyResult.upserted,
        outcomesInserted: data,
        alertsInserted: alertsInserted || 0,
        spyError: spyResult.error,
        ts: new Date().toISOString(),
    });
}
