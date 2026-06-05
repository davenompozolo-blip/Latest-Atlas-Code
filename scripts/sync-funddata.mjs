#!/usr/bin/env node
// ============================================================
// ATLAS — FundsData SA NAV Sync
// ------------------------------------------------------------
// Fetches the public ASISA latest-price table from ProfileData
// FundsData and upserts into fund_prices_raw.
//
// Source: https://funds.profiledata.co.za/aci/ASISA/LatestPrices.aspx
// No account required for the public latest-prices endpoint.
//
// Licensing posture (per ATLAS v3 spec):
//   Build phase — low-frequency, aggressively cached, personal
//   dev use only. Swap the source in PROVIDER_URL when a
//   licensed ProfileData feed is available; the adapter
//   downstream is unchanged.
//
// Environment:
//   SUPABASE_URL              — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — Service role key (bypasses RLS)
//   SYNC_MODE                 — 'snapshot' (default) | 'backfill'
//   BACKFILL_FUND_CODE        — Fund code for backfill mode
// ============================================================

import https from 'node:https';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SYNC_MODE    = process.env.SYNC_MODE || 'snapshot';
const BACKFILL_CODE = process.env.BACKFILL_FUND_CODE || '';

// Provider URL — swap this string to change the data source.
// All downstream adapter logic reads from fund_prices_raw and
// is independent of this URL.
const PROVIDER_URL = 'https://funds.profiledata.co.za/aci/ASISA/LatestPrices.aspx';

// Aggressive cache: skip the source if we already have a row
// for today's date (or yesterday for after-close runs).
const CACHE_HOURS = 20;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
});

// ── HTTP fetch with timeout ───────────────────────────────────

function httpGet(url, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'ATLAS-Terminal/1.0 (personal portfolio research)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            timeout: timeoutMs,
        }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} from ${url}`));
                return;
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    });
}

// ── HTML table parser (no DOM dependency) ────────────────────
// Parses a basic <table> with <tr>/<th>/<td> into [{col:val}].

function parseTable(html) {
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const tagRe  = /<[^>]+>/g;

    const clean = s => s.replace(tagRe, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

    const rows = [];
    let rowMatch;
    while ((rowMatch = rowRe.exec(html)) !== null) {
        const cells = [];
        let cellMatch;
        const rowHtml = rowMatch[1];
        cellRe.lastIndex = 0;
        while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
            cells.push(clean(cellMatch[1]));
        }
        if (cells.length) rows.push(cells);
    }

    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    return rows.slice(1).map(cells => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = cells[i] || null; });
        return obj;
    });
}

// ── Parse numeric, null on invalid ───────────────────────────

function toNum(s) {
    if (!s) return null;
    const n = parseFloat(s.replace(/[,%\s]/g, ''));
    return isNaN(n) ? null : n;
}

// ── Check cache — skip fetch if we have fresh data ───────────

async function cacheIsFresh() {
    const cutoff = new Date(Date.now() - CACHE_HOURS * 3600 * 1000).toISOString();
    const { data } = await sb
        .from('fund_prices_raw')
        .select('created_at')
        .gte('created_at', cutoff)
        .limit(1);
    return Array.isArray(data) && data.length > 0;
}

// ── Main snapshot flow ────────────────────────────────────────

async function runSnapshot() {
    console.log(`[${new Date().toISOString()}] FundsData snapshot starting…`);

    // Cache guard — avoid hammering the source
    if (await cacheIsFresh()) {
        console.log('Cache is fresh (within CACHE_HOURS). Skipping fetch.');
        return;
    }

    let html;
    try {
        html = await httpGet(PROVIDER_URL);
    } catch (err) {
        console.error('Failed to fetch FundsData:', err.message);
        process.exit(1);
    }

    const rows = parseTable(html);
    if (!rows.length) {
        console.warn('No table rows parsed from FundsData response. HTML may have changed structure.');
        console.warn('First 500 chars:', html.slice(0, 500));
        process.exit(1);
    }

    console.log(`Parsed ${rows.length} fund rows.`);

    // Map parsed rows to fund_prices_raw shape.
    // Column names vary by FundsData version — try common variants.
    const today = new Date().toISOString().slice(0, 10);
    const upsertRows = [];

    for (const r of rows) {
        const fundCode = r['fund_code'] || r['code'] || r['isin'] || null;
        const fundName = r['fund_name'] || r['name'] || r['fund'] || null;
        const manager  = r['manager']   || r['management_company'] || r['manco'] || null;
        const category = r['category']  || r['asisa_category'] || r['class'] || null;
        const nav      = toNum(r['nav'] || r['price'] || r['nav_(cents)'] || null);
        const ter      = toNum(r['ter'] || r['total_expense_ratio'] || null);
        const tc       = toNum(r['tc']  || r['transaction_costs']   || null);
        const tic      = toNum(r['tic'] || r['total_investment_charge'] || null);

        if (!fundCode || nav == null) continue; // skip rows without minimum data

        upsertRows.push({
            source:         'funddata_public',
            fund_code:      fundCode,
            manager:        manager,
            fund_name:      fundName,
            asisa_category: category,
            price_date:     today,
            nav:            nav,
            ter:            ter,
            tc:             tc,
            tic:            tic,
        });
    }

    if (!upsertRows.length) {
        console.warn('No valid rows to upsert (all rows missing fund_code or nav).');
        console.warn('Sample parsed row:', JSON.stringify(rows[0]));
        process.exit(1);
    }

    // Upsert in batches of 200
    const BATCH = 200;
    let inserted = 0;
    for (let i = 0; i < upsertRows.length; i += BATCH) {
        const batch = upsertRows.slice(i, i + BATCH);
        const { error } = await sb
            .from('fund_prices_raw')
            .upsert(batch, { onConflict: 'source,fund_code,price_date' });
        if (error) {
            console.error('Upsert error:', error.message);
            process.exit(1);
        }
        inserted += batch.length;
    }

    console.log(`[${new Date().toISOString()}] Upserted ${inserted} rows into fund_prices_raw.`);
}

// ── Main ──────────────────────────────────────────────────────

if (SYNC_MODE === 'snapshot') {
    runSnapshot().catch(err => { console.error(err); process.exit(1); });
} else if (SYNC_MODE === 'backfill') {
    // Historical backfill via HistPriceLookUp.aspx is deferred to PR3.
    // The viewstate-driven postback flow will be implemented once the
    // snapshot path is validated against the live source.
    console.log(`Backfill mode requested for fund: ${BACKFILL_CODE || '(none)'}`);
    console.log('Historical backfill via HistPriceLookUp.aspx — deferred to PR3.');
    process.exit(0);
} else {
    console.error(`Unknown SYNC_MODE: ${SYNC_MODE}`);
    process.exit(1);
}
