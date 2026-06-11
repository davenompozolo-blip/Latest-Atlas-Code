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
// Trigger: Vercel Cron (GET, weekly) or manual POST with ?token=CRON_SECRET.
// Throttle keeps us under Finnhub's ~60/min free tier.

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
    const throttleMs = Number(process.env.SYNC_THROTTLE_MS || q.throttle || 1200);

    // 1. Live book
    let tickers;
    try {
        const hr = await fetch(SB_URL + '/rest/v1/nexus_holdings?select=tk', { headers: sbHeaders(SB_KEY) });
        if (!hr.ok) throw new Error('nexus_holdings ' + hr.status);
        const rows = await hr.json();
        tickers = [...new Set(rows.map(r => (r.tk || '').toUpperCase()).filter(Boolean))].sort();
    } catch (e) {
        return res.status(502).json({ error: 'Failed to read nexus_holdings: ' + e.message });
    }
    if (offset || limit) tickers = tickers.slice(offset, limit ? offset + limit : undefined);

    // 2. Live risk-free
    const rf = await liveRiskFree();

    const runTs = new Date().toISOString();
    const runDate = runTs.slice(0, 10);
    const summary = { run_at: runTs, risk_free: rf, scope: tickers.length, valued: 0, dropped: 0, errors: 0, results: [] };

    // 3 + 4. Per-ticker hydrate → engine → headless write
    for (const tk of tickers) {
        try {
            const eqResp = await fetch(origin + '/api/equity?endpoint=combined&symbol=' + encodeURIComponent(tk),
                { signal: AbortSignal.timeout(20000) });
            if (!eqResp.ok) throw new Error('equity ' + eqResp.status);
            const payload = await eqResp.json();
            const series = buildSeries(payload.daily);

            const val = runValuation(payload, series, { riskFreeRate: rf != null ? rf : undefined });

            // Upsert company (composite + freshness stamp)
            const ov = payload.overview || {};
            const compRow = {
                ticker: tk,
                company_name: ov.Name || tk,
                sector: ov.Sector || null,
                currency: ov.Currency || 'USD',
                current_price: val.priceTrusted ? val.currentPrice : null,
                avg_fair_value: val.composite.avg_fair_value,
                fair_value_low: val.composite.fair_value_low,
                fair_value_high: val.composite.fair_value_high,
                last_run_at: runTs,
                updated_at: runTs,
            };
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
            summary.results.push({ tk, composite: val.composite.avg_fair_value, valued: nValued, dropped: val.methods.length - nValued, price_trusted: val.priceTrusted });
        } catch (e) {
            summary.errors++;
            summary.results.push({ tk, error: e.message });
        }
        if (throttleMs) await sleep(throttleMs);
    }

    return res.status(200).json(summary);
}
