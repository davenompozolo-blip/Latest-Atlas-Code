// api/vol-dispersion-sync.js
// ------------------------------------------------------------
// Nightly volatility-dispersion sync: single-name-vs-index 30D ATM IV
// spread, computed three ways from one shared function
// (src/pages/nexus/nexusDispersionCompute.js) and stored per basket in
// vol_dispersion_daily. EOD only, by design — the signal wants settled
// end-of-session chains, not intraday options noise.
//
// Flow per run:
//   1. Resolve the basket universe: static market + sector baskets, plus the
//      live book from nexus_holdings (portfolio basket, weight_pct-weighted).
//   2. One Alpha Vantage HISTORICAL_OPTIONS chain per unique underlying
//      (basket names + SPY + the 11 SPDR sector ETFs) → 30D ATM IV, ATM and
//      30D both interpolated, never "closest available".
//   3. Aggregate per basket (weights re-normalised over priced names) and
//      upsert one row per basket per day. Baskets whose benchmark leg or
//      every member failed are SKIPPED and recorded in the summary — no junk
//      rows, constituent_count keeps the thin-sample cases honest.
//
// The market/portfolio benchmark leg is SPY's own 30D ATM IV (Alpha Vantage
// doesn't serve SPX index options; SPY is the liquidity-equivalent proxy and
// ≈ VIX by construction), so every leg of every spread comes from the same
// compute. Sector rows benchmark against their SPDR ETF (Option B).
//
// Trigger: Vercel Cron (GET, ~9:30pm ET trading days — HISTORICAL_OPTIONS
// with no date returns the just-settled session) or manual POST with
// ?token=CRON_SECRET. Backfill: pass ?date=YYYY-MM-DD per invocation and walk
// backwards as far as reliable options history exists — the job never
// synthesizes history. NOTE: a full run is ~100 chain pulls, so this needs a
// premium Alpha Vantage key (the free 25/day tier cannot feed it).

import {
    iv30FromChain, basketIv,
    MARKET_BASKET, SECTOR_BASKETS, SECTOR_ETF, BENCHMARK_MARKET,
} from '../src/pages/nexus/nexusDispersionCompute.js';

const AV_BASE = 'https://www.alphavantage.co/query';

const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbW9qanN6dnZjaXRodXh3ZXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTg1NDgsImV4cCI6MjA4Nzk3NDU0OH0.xFo-N9CGQlpHlsykinr_ORAmzV4N7MIq0emW5N1Vojk';
const SB_URL = (process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_ANON;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const sbHeaders = key => ({ apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' });

async function fetchT(url, ms, headers) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 15000);
    try { return await fetch(url, { signal: ac.signal, headers: headers || {} }); }
    finally { clearTimeout(t); }
}

// One underlying's chain for one session → { iv30, asOf, dropReason }.
// Rate-limit replies (Note/Information) throw so the run fails loud rather
// than recording every remaining name as optionless.
async function avIv30(symbol, apiKey, date) {
    const url = AV_BASE + '?function=HISTORICAL_OPTIONS&symbol=' + encodeURIComponent(symbol)
        + (date ? '&date=' + date : '') + '&apikey=' + apiKey;
    const r = await fetchT(url, 20000);
    if (!r.ok) throw new Error('AV ' + r.status);
    const j = await r.json();
    if (j && (j.Note || j.Information)) throw new Error('AV throttled: ' + String(j.Note || j.Information).slice(0, 120));
    return iv30FromChain(j && j.data);
}

export default async function handler(req, res) {
    // Auth — Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
    const secret = (process.env.CRON_SECRET || '').trim();
    if (secret) {
        const auth = req.headers.authorization || '';
        const token = (req.query && req.query.token) || '';
        if (auth !== 'Bearer ' + secret && token !== secret) return res.status(401).json({ error: 'Unauthorized' });
    }

    const apiKey = (process.env.ALPHA_VANTAGE_API_KEY || '').trim();
    if (!apiKey) return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY not configured' });

    const q = req.query || {};
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : null; // backfill target; default = last settled session
    const throttleMs = Number(process.env.VOL_DISP_THROTTLE_MS || q.throttle || 600);

    // 1. Portfolio basket — live book, weight_pct as the vega/cap-weight leg.
    //    Foreign digit-tickers (2330.TW…) carry no US options; skip like the
    //    options snapshot does. A read failure degrades to "no portfolio row"
    //    rather than killing the market/sector baskets.
    let portfolio = [];
    let portfolioError = null;
    try {
        const hr = await fetchT(SB_URL + '/rest/v1/nexus_holdings?select=symbol,weight_pct', 9000, sbHeaders(SB_ANON));
        const hr2 = await (hr.ok ? hr.json() : Promise.reject(new Error('nexus_holdings ' + hr.status)));
        portfolio = hr2
            .map(h => ({ tk: (h.symbol || '').toUpperCase(), w: Number(h.weight_pct) || 0 }))
            .filter(m => m.tk && !/\d/.test(m.tk) && m.w > 0);
    } catch (e) { portfolioError = e.message; }

    // 2. Unique underlyings: every basket name + every benchmark leg.
    const underlyings = new Set([BENCHMARK_MARKET]);
    for (const m of MARKET_BASKET) underlyings.add(m.tk);
    for (const members of Object.values(SECTOR_BASKETS)) for (const m of members) underlyings.add(m.tk);
    for (const etf of Object.values(SECTOR_ETF)) underlyings.add(etf);
    for (const m of portfolio) underlyings.add(m.tk);

    const startedAt = new Date().toISOString();
    const summary = { run_at: startedAt, date: date || 'latest', scope: underlyings.size, priced: 0, unpriced: 0, errors: 0, written: 0, skipped: [], results: [] };

    // Open one sync_log row (best-effort; needs the service role to write).
    let logId = null;
    if (SB_SERVICE) {
        try {
            const ins = await fetch(SB_URL + '/rest/v1/sync_log', {
                method: 'POST', headers: { ...sbHeaders(SB_SERVICE), Prefer: 'return=representation' },
                body: JSON.stringify([{ status: 'running', source: 'vol_dispersion_sync', started_at: startedAt }]),
            });
            if (ins.ok) { const j = await ins.json(); logId = j && j[0] && j[0].id; }
        } catch { /* logging is best-effort */ }
    }

    // 3. One chain pull per underlying. Isolated per name; a throttle error
    //    aborts the loop (every later name would fail identically).
    const iv = new Map();   // tk → iv30 (vol points) | null
    let anchorDate = date;  // the session all rows are stamped with
    let aborted = null;
    for (const tk of underlyings) {
        try {
            const r = await avIv30(tk, apiKey, date);
            iv.set(tk, r.iv30);
            if (!anchorDate && r.asOf) anchorDate = r.asOf;
            if (r.iv30 != null) summary.priced++;
            else { summary.unpriced++; summary.results.push({ tk, drop_reason: r.dropReason }); }
        } catch (e) {
            iv.set(tk, null);
            summary.errors++;
            summary.results.push({ tk, error: e.message });
            if (/throttled/.test(e.message)) { aborted = e.message; break; }
        }
        if (throttleMs) await sleep(throttleMs);
    }

    // 4. Assemble rows — only baskets with a live benchmark leg AND at least
    //    one priced member. Everything else lands in summary.skipped.
    const rows = [];
    const withIv = members => members.map(m => ({ ...m, iv: iv.get(m.tk) ?? null }));
    const pushRow = (basketType, sector, members, benchTk) => {
        const bench = iv.get(benchTk) ?? null;
        const b = basketIv(withIv(members));
        if (bench == null || b.iv == null) {
            summary.skipped.push({ basket_type: basketType, sector: sector || undefined, reason: bench == null ? 'benchmark_unpriced:' + benchTk : 'no_priced_members' });
            return;
        }
        rows.push({
            date: anchorDate, basket_type: basketType, sector: sector || '',
            basket_iv: b.iv, benchmark_iv: bench, benchmark_ticker: benchTk,
            spread: Math.round((b.iv - bench) * 100) / 100, constituent_count: b.count,
        });
    };

    if (!aborted && anchorDate) {
        pushRow('market', null, MARKET_BASKET, BENCHMARK_MARKET);
        if (portfolio.length) pushRow('portfolio', null, portfolio, BENCHMARK_MARKET);
        else summary.skipped.push({ basket_type: 'portfolio', reason: portfolioError ? 'holdings_read_failed: ' + portfolioError : 'no_holdings' });
        for (const [sector, members] of Object.entries(SECTOR_BASKETS)) {
            pushRow('sector', sector, members, SECTOR_ETF[sector]);
        }
    }

    // 5. One upsert, PK (date, basket_type, sector) → re-runs are idempotent.
    if (rows.length) {
        try {
            const up = await fetch(SB_URL + '/rest/v1/vol_dispersion_daily?on_conflict=date,basket_type,sector', {
                method: 'POST', headers: { ...sbHeaders(SB_ANON), Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify(rows),
            });
            if (!up.ok) throw new Error('upsert ' + up.status + ' ' + (await up.text()).slice(0, 200));
            summary.written = rows.length;
        } catch (e) {
            summary.errors++; summary.writeError = e.message;
        }
    }

    if (SB_SERVICE && logId != null) {
        const status = aborted || summary.writeError ? (summary.written ? 'partial' : 'error') : (summary.errors ? 'partial' : 'success');
        try {
            await fetch(SB_URL + '/rest/v1/sync_log?id=eq.' + logId, {
                method: 'PATCH', headers: sbHeaders(SB_SERVICE),
                body: JSON.stringify({
                    finished_at: new Date().toISOString(), status,
                    prices_upserted: summary.written,
                    error_message: aborted || summary.writeError || null,
                    details: { date: anchorDate, priced: summary.priced, unpriced: summary.unpriced, errors: summary.errors, skipped: summary.skipped },
                }),
            });
        } catch { /* best-effort */ }
    }

    return res.status(aborted && !summary.written ? 502 : 200).json(aborted ? { ...summary, aborted } : summary);
}
