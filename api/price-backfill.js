// api/price-backfill.js
// ------------------------------------------------------------
// Widen the tradeable universe by giving it price history to stand on.
//
// The Trade module's liquidity floor was rejecting 7,623 of 7,650 names, and
// almost none of them for being illiquid — they simply had no ADV on file,
// because ADV is derived from price_history and price_history only ever covered
// the book. A universe of 26 names is not a universe.
//
// This is the fix, and it is deliberately the boring one. Patching ADV in from
// the cached Finnhub metrics would have moved those names from ADV BELOW FLOOR
// to AGE DATA MISSING without making a single one tradeable, because the module
// genuinely cannot measure a name it has no series for: no momentum or vol
// percentile to plot it, no correlation for effective exposure, no trend score.
// Declaring such names eligible would make the universe a stock list again,
// which is the thing §3.2 exists to prevent.
//
// Two stages, both resumable, because a full run exceeds any single serverless
// invocation:
//
//   ?stage=rank    One snapshot call per 100 symbols across Alpaca's tradeable
//                  US equities, ranked by dollar volume. Writes the target list
//                  to price_backfill_targets. ~76 requests.
//   ?stage=bars    Daily bars for the top N targets, oldest first, in batches.
//                  Re-invoke until `done: true`. Each call reports next_cursor.
//
// Drive it to completion:
//   curl "$HOST/api/price-backfill?stage=rank&token=$CRON_SECRET"
//   curl "$HOST/api/price-backfill?stage=bars&token=$CRON_SECRET"   # repeat
//
// Rate limits: Alpaca's free data tier allows 200 requests/minute. Every loop
// throttles below that rather than trusting burst headroom.

'use strict';

const ALPACA_DATA = 'https://data.alpaca.markets/v2';

const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
const SB_URL = (process.env.ATLAS_SUPABASE_URL || process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
const SB_KEY = process.env.ATLAS_SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || process.env.VITE_SUPABASE_KEY
    || '';

// The natural stopping point: roughly 1,200–1,800 US names clear a $10m ADV
// floor, so beyond this we would be storing history for names the liquidity
// gate rejects anyway.
const DEFAULT_TARGETS = 1500;
const HISTORY_DAYS = 400;          // ~1 trading year plus the 120d window's runway
const SNAPSHOT_CHUNK = 100;        // symbols per snapshot request
const BARS_CHUNK = 40;             // symbols per bars request
const SYMBOLS_PER_INVOCATION = 240; // keeps a run inside the function timeout
const THROTTLE_MS = 350;           // ~170 req/min, under Alpaca's 200

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function alpacaHdrs() {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET;
    if (!key || !secret) throw new Error('ALPACA_API_KEY / ALPACA_API_SECRET not configured');
    return { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, accept: 'application/json' };
}

function brokerBase() {
    const paper = (process.env.ALPACA_PAPER || 'true').toLowerCase() !== 'false';
    return paper ? 'https://paper-api.alpaca.markets/v2' : 'https://api.alpaca.markets/v2';
}

function sbHdrs() {
    return { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
}

const PAGE = 1000;

/** Paginated read — PostgREST caps responses at 1000 rows and says nothing. */
async function sbGet(path) {
    const rows = [];
    let offset = 0;
    for (;;) {
        const r = await fetch(SB_URL + '/rest/v1/' + path, {
            headers: { ...sbHdrs(), Range: `${offset}-${offset + PAGE - 1}`, 'Range-Unit': 'items' },
        });
        if (!r.ok && r.status !== 206) {
            throw new Error(`GET ${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
        }
        const page = await r.json();
        if (!Array.isArray(page)) return page;
        rows.push(...page);
        if (page.length < PAGE) return rows;
        offset += PAGE;
    }
}

async function sbWrite(table, rows, onConflict) {
    if (!rows.length) return 0;
    let written = 0;
    for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000);
        const q = onConflict ? `?on_conflict=${onConflict}` : '';
        const r = await fetch(SB_URL + '/rest/v1/' + table + q, {
            method: 'POST',
            headers: {
                ...sbHdrs(),
                Prefer: (onConflict ? 'resolution=merge-duplicates,' : '') + 'return=minimal',
            },
            body: JSON.stringify(chunk),
        });
        if (!r.ok) throw new Error(`WRITE ${table}: ${r.status} ${(await r.text()).slice(0, 300)}`);
        written += chunk.length;
    }
    return written;
}

// ── Stage 1: rank the market by dollar volume ────────────────────────────────

async function stageRank(limit) {
    // Alpaca's own view of what is tradeable — the only authority on the broker
    // gate, and the same source api/trade-sync.js?job=assets stamps from.
    const r = await fetch(brokerBase() + '/assets?status=active&asset_class=us_equity', { headers: alpacaHdrs() });
    if (!r.ok) throw new Error('Alpaca assets HTTP ' + r.status);
    const assets = (await r.json()).filter((a) => a.tradable && a.status === 'active');

    const symbols = assets.map((a) => a.symbol).filter((s) => /^[A-Z][A-Z.\-]{0,6}$/.test(s));
    const ranked = [];

    for (let i = 0; i < symbols.length; i += SNAPSHOT_CHUNK) {
        const chunk = symbols.slice(i, i + SNAPSHOT_CHUNK);
        const url = ALPACA_DATA + '/stocks/snapshots?symbols=' + encodeURIComponent(chunk.join(','))
            + '&feed=iex';
        const sr = await fetch(url, { headers: alpacaHdrs() });
        if (!sr.ok) { await sleep(THROTTLE_MS); continue; }   // a bad chunk must not sink the run
        const snaps = await sr.json();
        for (const [sym, s] of Object.entries(snaps || {})) {
            const bar = s && (s.dailyBar || s.prevDailyBar);
            if (!bar || !bar.c || !bar.v) continue;
            ranked.push({ symbol: sym, dollar_volume: bar.c * bar.v, last_close: bar.c });
        }
        await sleep(THROTTLE_MS);
    }

    ranked.sort((a, b) => b.dollar_volume - a.dollar_volume);
    const targets = ranked.slice(0, limit);

    const meta = new Map(assets.map((a) => [a.symbol, a]));
    const rows = targets.map((t, i) => ({
        symbol: t.symbol,
        rank: i + 1,
        dollar_volume: Math.round(t.dollar_volume),
        last_close: t.last_close,
        exchange: (meta.get(t.symbol) || {}).exchange || null,
        name: (meta.get(t.symbol) || {}).name || null,
        status: 'pending',
        ranked_at: new Date().toISOString(),
    }));

    await fetch(SB_URL + '/rest/v1/price_backfill_targets?symbol=neq.__none__',
        { method: 'DELETE', headers: sbHdrs() });
    await sbWrite('price_backfill_targets', rows, 'symbol');

    return {
        tradeable_assets: assets.length,
        snapshotted: ranked.length,
        targets: rows.length,
        min_dollar_volume: rows.length ? rows[rows.length - 1].dollar_volume : null,
        max_dollar_volume: rows.length ? rows[0].dollar_volume : null,
    };
}

// ── Stage 2: pull the bars ───────────────────────────────────────────────────

/** Make sure every target has an assets row, so price_history has something to point at. */
async function ensureAssets(targets) {
    const existing = await sbGet('assets?select=id,symbol&limit=20000');
    const bySymbol = new Map(existing.map((a) => [a.symbol, a.id]));

    const missing = targets.filter((t) => !bySymbol.has(t.symbol));
    if (missing.length) {
        await sbWrite('assets', missing.map((t) => ({
            symbol: t.symbol,
            name: t.name || t.symbol,
            asset_class: 'Stock',
            exchange: t.exchange || null,
            currency: 'USD',
            listing_status: 'active',
            metadata: { source: 'price-backfill', tradable: true },
        })), 'symbol');

        const refreshed = await sbGet('assets?select=id,symbol&limit=20000');
        for (const a of refreshed) bySymbol.set(a.symbol, a.id);
    }
    return bySymbol;
}

async function stageBars(cursor, limit) {
    const targets = await sbGet(
        `price_backfill_targets?select=symbol,rank,name,exchange&rank=lte.${limit}&order=rank.asc`,
    );
    if (!targets.length) throw new Error('No targets — run ?stage=rank first');

    const slice = targets.filter((t) => t.rank > cursor).slice(0, SYMBOLS_PER_INVOCATION);
    if (!slice.length) return { done: true, cursor, bars: 0, symbols: 0 };

    const idBySymbol = await ensureAssets(slice);

    const start = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString().slice(0, 10);
    const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let barCount = 0;
    let covered = 0;

    for (let i = 0; i < slice.length; i += BARS_CHUNK) {
        const chunk = slice.slice(i, i + BARS_CHUNK);
        const syms = chunk.map((t) => t.symbol);
        let pageToken = null;
        const rows = [];

        do {
            const url = ALPACA_DATA + '/stocks/bars?symbols=' + encodeURIComponent(syms.join(','))
                + `&timeframe=1Day&start=${start}&end=${end}&limit=10000&adjustment=split&feed=iex`
                + (pageToken ? '&page_token=' + encodeURIComponent(pageToken) : '');
            const r = await fetch(url, { headers: alpacaHdrs() });
            if (!r.ok) { pageToken = null; await sleep(THROTTLE_MS); break; }
            const j = await r.json();
            pageToken = j.next_page_token || null;

            for (const [sym, bars] of Object.entries(j.bars || {})) {
                const assetId = idBySymbol.get(sym);
                if (!assetId) continue;
                for (const b of bars) {
                    rows.push({
                        asset_id: assetId,
                        price_date: String(b.t).slice(0, 10),
                        open: b.o, high: b.h, low: b.l, close: b.c,
                        adjusted_close: b.c,
                        volume: b.v,
                        // '1d' is the convention the other 84k rows use; the
                        // unique key is (asset_id, source, interval, price_date),
                        // so a mismatched interval would duplicate rather than
                        // upsert.
                        interval: '1d',
                        source: 'alpaca',
                    });
                }
            }
            await sleep(THROTTLE_MS);
        } while (pageToken);

        if (rows.length) {
            barCount += await sbWrite('price_history', rows, 'asset_id,source,interval,price_date');
        }
        covered += chunk.length;
    }

    const nextCursor = slice[slice.length - 1].rank;
    return {
        done: nextCursor >= Math.min(limit, targets[targets.length - 1].rank),
        cursor: nextCursor,
        next_cursor: nextCursor,
        symbols: covered,
        bars: barCount,
        window: { start, end },
    };
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    const secret = (process.env.CRON_SECRET || '').trim();
    if (secret) {
        const auth = req.headers.authorization || '';
        const token = (req.query && req.query.token) || '';
        if (auth !== 'Bearer ' + secret && token !== secret) return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!SB_KEY) return res.status(500).json({ error: 'No Supabase key configured' });

    const stage = ((req.query && req.query.stage) || 'bars').toLowerCase();
    const limit = Math.min(parseInt(req.query && req.query.limit, 10) || DEFAULT_TARGETS, 5000);
    const cursor = parseInt(req.query && req.query.cursor, 10) || 0;

    const started = Date.now();
    try {
        const out = stage === 'rank'
            ? { stage, ...(await stageRank(limit)) }
            : { stage, ...(await stageBars(cursor, limit)) };
        out.ok = true;
        out.duration_ms = Date.now() - started;
        if (stage === 'bars' && !out.done) {
            out.next = `?stage=bars&cursor=${out.next_cursor}&limit=${limit}`;
        }
        return res.status(200).json(out);
    } catch (e) {
        return res.status(500).json({
            stage, ok: false,
            error: e && e.message ? e.message : String(e),
            duration_ms: Date.now() - started,
        });
    }
}
