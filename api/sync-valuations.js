// api/sync-valuations.js
// ------------------------------------------------------------
// Weekly canonical valuation sync. Runs the SAME isomorphic engine the
// Valuation House page uses (src/lib/valuationEngine.js) server-side, so the
// fail-loud fixes travel with it and there is zero reimplementation drift.
//
// Flow per run:
//   1. Pull the live book from nexus_holdings (scope tracks the portfolio).
//   2. Fetch a LIVE risk-free rate (FRED DGS10) so a week with no new filing
//      still re-prices cost of capital — that's what makes the cadence matter.
//   3. Hydrate each ticker via the existing /api/equity endpoint (Finnhub +
//      Alpaca split-adjusted prices), run every model, blend deterministically.
//   4. Write headless to the same Supabase project the app uses (anon key,
//      which has full RLS access to the scrapbook tables): a snapshot row for
//      EVERY attempted method (dropped ones carry implied_price=null +
//      drop_reason), and the composite onto the company.
//
// Trigger: pg_cron via atlas_chain_dispatch (daily), or manual with
// ?token=CRON_SECRET.
//
// BUDGETED, STALEST-FIRST (2026-09-25). This ran weekly over the default
// account's book with a fixed 1.2s gap per ticker. /api/equity makes SEVEN
// Finnhub calls per uncached symbol, in parallel, so that paced ~350 calls a
// minute against the free tier's 60: on 2026-09-21, 44 of 66 tickers failed
// to hydrate (shares_unhydrated / missing_book_value), kept their old
// composite, and fv_trustworthy read 0 of 67 on the default account and 0 of
// 38 on Secondary. Nothing reported it -- the chain row said success.
//
// Now: the scope is the UNION of every account's holdings; names are taken
// oldest attempt first; after a live fundamentals fetch the job waits
// FINNHUB_PACE_MS (7 calls at <= 60/min), after a cache hit barely at all; and
// it stops at RUN_BUDGET_MS, inside the 300s maxDuration. A name that fails to
// hydrate keeps its composite and retries on its next turn. Run daily,
// the book turns over in a few days -- well inside the 14-day trust window --
// and more accounts cost queue depth, not correctness.

import { runValuation } from '../src/lib/valuationEngine.js';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

// Pin to the SAME Supabase project the frontend uses. The anon key has full
// RLS access to the scrapbook tables (policy anon_all_*) and SELECT on the
// holdings view, so no service-role secret is required. We deliberately do NOT
// read SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY here: on some deployments those
// point at a different/older project and would silently send writes to the
// wrong database. The sync must always hit the live data project, like the app.
const FALLBACK_URL  = 'https://vdmojjszvvcithuxwexx.supabase.co';
// Public anon key for the data project (the same one shipped in the frontend
// bundle; writes are gated by RLS, so this is safe to commit).
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbW9qanN6dnZjaXRodXh3ZXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTg1NDgsImV4cCI6MjA4Nzk3NDU0OH0.xFo-N9CGQlpHlsykinr_ORAmzV4N7MIq0emW5N1Vojk';
const SB_URL = (process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_ANON;

function sbHeaders(key) {
    return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
}

// Live risk-free rate from FRED 10Y Treasury (DGS10, quoted in percent).
async function liveRiskFree() {
    const key = (process.env.FRED_API_KEY || '').trim();
    if (!key) return null;
    try {
        const url = FRED_BASE + '?series_id=DGS10&api_key=' + key +
            '&file_type=json&sort_order=desc&limit=10';
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const j = await r.json();
        const obs = (j.observations || []).find(o => o.value && o.value !== '.');
        if (!obs) return null;
        const pct = Number(obs.value);
        return isFinite(pct) ? +(pct / 100).toFixed(4) : null;
    } catch { return null; }
}

// Build the ascending {date, close} series the engine expects from the
// /api/equity daily payload (already split-adjusted upstream).
function buildSeries(daily) {
    const ts = daily && daily['Time Series (Daily)'];
    if (!ts) return [];
    const series = [];
    for (const date in ts) {
        const close = Number(ts[date]['4. close']);
        if (!isNaN(close)) series.push({ date, close });
    }
    series.sort((a, b) => (a.date < b.date ? -1 : 1));
    return series;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const FINNHUB_PACE_MS = 8000;   // 7 calls per live symbol, kept under 60/min
const CACHED_PACE_MS = 250;     // a cache hit spends no Finnhub budget
const RUN_BUDGET_MS = 240000;   // stop starting new names here (maxDuration 300s)

// Every registered portfolio's holdings, unioned. nexus_holdings is scoped by
// x-atlas-portfolio (MP-0); read without it, it is the default account only,
// which is how a Secondary-only name could never be valued. Any account's read
// failing fails the run -- a silently smaller scope is the defect.
async function bookUniverse() {
    const pr = await fetch(SB_URL + '/rest/v1/vw_portfolios?select=id', { headers: sbHeaders(SB_KEY) });
    if (!pr.ok) throw new Error('vw_portfolios ' + pr.status);
    const ids = (await pr.json()).map(r => r.id).filter(Boolean);
    if (!ids.length) throw new Error('no portfolios visible');
    const all = new Set();
    for (const id of ids) {
        const hr = await fetch(SB_URL + '/rest/v1/nexus_holdings?select=tk', { headers: { ...sbHeaders(SB_KEY), 'x-atlas-portfolio': id } });
        if (!hr.ok) throw new Error('nexus_holdings ' + hr.status + ' for portfolio ' + id);
        for (const r of await hr.json()) { const tk = (r.tk || '').toUpperCase(); if (tk) all.add(tk); }
    }
    return { tickers: [...all].sort(), portfolios: ids.length };
}

// Oldest ATTEMPT first -- updated_at, which the write below stamps even when
// hydration fails -- with never-attempted names leading. Not oldest SUCCESS:
// a fund has no fundamentals and never values (ACWX, BOND, SHY ... all stored
// as us_equity, so no field says so), and ordered by last_run_at it would head
// the queue every run and burn the budget. By attempt, it takes its turn and
// retries once a rotation, like a transient 429 does.
async function stalestFirst(tickers) {
    const quoted = tickers.map(t => /[,.()"\s:]/.test(t) ? '"' + t.replace(/"/g, '\\"') + '"' : t);
    const r = await fetch(SB_URL + '/rest/v1/scrapbook_companies?select=ticker,updated_at&ticker=in.(' + quoted.join(',') + ')',
        { headers: sbHeaders(SB_KEY) });
    if (!r.ok) throw new Error('scrapbook_companies ' + r.status);
    const last = new Map((await r.json()).map(c => [c.ticker, c.updated_at || null]));
    return tickers.slice().sort((a, b) => {
        const la = last.get(a) || '', lb = last.get(b) || '';
        return la < lb ? -1 : la > lb ? 1 : (a < b ? -1 : 1);
    });
}

export default async function handler(req, res) {
    // Auth — Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`; manual
    // callers can pass ?token=. If no secret is configured, allow (dev only).
    const secret = (process.env.CRON_SECRET || '').trim();
    if (secret) {
        const auth = req.headers.authorization || '';
        const token = (req.query && req.query.token) || '';
        if (auth !== 'Bearer ' + secret && token !== secret) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    // Origin for the internal /api/equity hydration.
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = (process.env.SYNC_ORIGIN || (host ? proto + '://' + host : '')).replace(/\/$/, '');
    if (!origin) return res.status(500).json({ error: 'Cannot resolve origin for /api/equity' });

    const q = req.query || {};
    const limit = Math.min(Number(q.limit) || 0, 200);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const t0 = Date.now();

    // 1. Every account's book, stalest valuation first.
    let tickers, portfolios;
    try {
        const u = await bookUniverse();
        portfolios = u.portfolios;
        tickers = await stalestFirst(u.tickers);
    } catch (e) {
        console.error('[sync-valuations] scope unavailable: ' + e.message);
        return res.status(502).json({ error: 'Failed to read the book: ' + e.message });
    }
    const universe = tickers.length;
    if (offset || limit) tickers = tickers.slice(offset, limit ? offset + limit : undefined);

    // 2. Live risk-free
    const rf = await liveRiskFree();

    const runTs = new Date().toISOString();
    const runDate = runTs.slice(0, 10);
    const summary = { run_at: runTs, risk_free: rf, portfolios, universe, scope: tickers.length, attempted: 0, remaining: 0, valued: 0, dropped: 0, kept: 0, errors: 0, results: [] };

    // 3 + 4. Per-ticker hydrate → engine → headless write, inside the budget.
    for (const tk of tickers) {
        if (Date.now() - t0 > RUN_BUDGET_MS) break;
        summary.attempted++;
        let liveFetch = true;
        try {
            const eqResp = await fetch(origin + '/api/equity?endpoint=combined&symbol=' + encodeURIComponent(tk),
                { signal: AbortSignal.timeout(20000) });
            if (!eqResp.ok) throw new Error('equity ' + eqResp.status);
            const payload = await eqResp.json();
            const ch = payload.cache_hits && payload.cache_hits.overview;
            liveFetch = !(ch === 'db' || ch === 'mem');
            const series = buildSeries(payload.daily);

            const val = runValuation(payload, series, { riskFreeRate: rf != null ? rf : undefined });

            // Upsert company (composite + freshness stamp).
            const ov = payload.overview || {};

            // Keep-last guard: a transient *fetch* failure (fundamentals
            // didn't hydrate — rate limit, missing key, ADR with no data)
            // must never overwrite a previously trusted composite with null.
            // When that happens we touch only updated_at and identity, leaving
            // avg_fair_value / fair_value_* / last_run_at untouched so a bad run
            // can't regress a good one (and age_days keeps counting from the
            // last *real* valuation). Snapshots below still record the dropped
            // attempt for the audit trail. A genuine valuation drop — real data
            // in, every method trimmed — has no overview_error and still writes
            // null, so fail-loud is preserved for names that are truly unvaluable.
            const hydrationFailed = !!payload.overview_error
                || (payload.source && payload.source.finnhub_key === false);
            const protectComposite = hydrationFailed && val.composite.avg_fair_value == null;

            const compRow = {
                ticker: tk,
                company_name: ov.Name || tk,
                updated_at: runTs,
            };
            if (!protectComposite) {
                compRow.sector = ov.Sector || null;
                compRow.currency = ov.Currency || 'USD';
                compRow.current_price = val.priceTrusted ? val.currentPrice : null;
                compRow.avg_fair_value = val.composite.avg_fair_value;
                compRow.fair_value_low = val.composite.fair_value_low;
                compRow.fair_value_high = val.composite.fair_value_high;
                compRow.last_run_at = runTs;
            } else {
                // Preserve a known sector/currency without overwriting good data with null.
                if (ov.Sector) compRow.sector = ov.Sector;
                if (ov.Currency) compRow.currency = ov.Currency;
            }
            const upResp = await fetch(SB_URL + '/rest/v1/scrapbook_companies?on_conflict=ticker', {
                method: 'POST',
                headers: { ...sbHeaders(SB_KEY), Prefer: 'resolution=merge-duplicates,return=representation' },
                body: JSON.stringify([compRow]),
            });
            if (!upResp.ok) throw new Error('company upsert ' + upResp.status + ' ' + (await upResp.text()).slice(0, 200));
            const co = (await upResp.json())[0];

            // Append one snapshot per attempted method (dropped ones included).
            const cp = val.priceTrusted ? val.currentPrice : null;
            const snapRows = val.methods.map(m => ({
                company_id: co.id,
                method: m.method,
                method_label: m.method_label,
                inputs: m.inputs,
                assumptions: m.assumptions,
                implied_price: m.implied_price,
                drop_reason: m.drop_reason,
                current_price_at_save: cp,
                upside_pct: (m.implied_price != null && cp > 0) ? (m.implied_price - cp) / cp : null,
                terminal_value: m.terminal_value,
                implied_ev: m.implied_ev,
                analyst_note: 'weekly sync',
                run_date: runDate,
            }));
            const insResp = await fetch(SB_URL + '/rest/v1/scrapbook_snapshots', {
                method: 'POST',
                headers: { ...sbHeaders(SB_KEY), Prefer: 'return=minimal' },
                body: JSON.stringify(snapRows),
            });
            if (!insResp.ok) throw new Error('snapshots ' + insResp.status + ' ' + (await insResp.text()).slice(0, 200));

            const nValued = val.methods.filter(m => m.implied_price != null).length;
            summary.valued += nValued;
            summary.dropped += val.methods.length - nValued;
            if (protectComposite) summary.kept++;
            summary.results.push({ tk, composite: val.composite.avg_fair_value, valued: nValued, dropped: val.methods.length - nValued, price_trusted: val.priceTrusted, kept: protectComposite });
        } catch (e) {
            summary.errors++;
            summary.results.push({ tk, error: e.message });
        }
        await sleep(liveFetch ? FINNHUB_PACE_MS : CACHED_PACE_MS);
    }
    summary.remaining = tickers.length - summary.attempted;
    summary.kept_names = summary.results.filter(r => r.kept).map(r => r.tk);
    if (summary.kept || summary.errors) {
        console.error('[sync-valuations] ' + summary.kept + ' names failed to hydrate, ' + summary.errors + ' errored: '
            + summary.results.filter(r => r.kept || r.error).map(r => r.tk + (r.error ? '(' + r.error + ')' : '')).join(', ').slice(0, 800));
    }
    // Nothing written at all is not a success (the no-op-answers-200 rule).
    const wrote = summary.results.some(r => !r.error && !r.kept);
    return res.status(wrote ? 200 : 503).json(summary);
}
