// api/nexus-earnings.js
// ------------------------------------------------------------
// Data behind the Nexus "Earnings intelligence" table: which holdings
// report next, the consensus, the name's prior print + beat-rate, the
// market-implied move (history-first proxy), the driving theme, and a
// sentiment read from the book's own signals.
//
// Sources (all already live): vw_nexus_holdings (book + next_earnings_date
// + signals), Finnhub /calendar/earnings (upcoming + estimate) and
// /stock/earnings (surprise history), and daily closes via /api/equity.
// Scoring lives in nexusEarningsCompute.js (pure, unit-tested).

import { buildEarningsRow, sortRows } from '../src/pages/nexus/nexusEarningsCompute.js';
import { closeSeriesFromAlpaca } from '../src/pages/nexus/nexusBoardCompute.js';

const FINNHUB = 'https://finnhub.io/api/v1';
const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbW9qanN6dnZjaXRodXh3ZXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTg1NDgsImV4cCI6MjA4Nzk3NDU0OH0.xFo-N9CGQlpHlsykinr_ORAmzV4N7MIq0emW5N1Vojk';
const SB_URL = (process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_ANON;
const HORIZON_DAYS = 75;
// Finnhub fan-out (surprise history + daily series) is bounded to the names
// actually reporting in the window; every other holding still renders.
const MAX_RICH = 24;

async function fetchT(url, ms, headers) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 9000);
    try { return await fetch(url, { signal: ac.signal, headers: headers || {} }); }
    finally { clearTimeout(t); }
}

async function finnhub(path) {
    const key = (process.env.FINNHUB_API_KEY || '').trim();
    if (!key) return null;
    const url = FINNHUB + path + (path.includes('?') ? '&' : '?') + 'token=' + key;
    try { const r = await fetchT(url, 9000); return r.ok ? await r.json() : null; }
    catch { return null; }
}

const ymd = d => d.toISOString().slice(0, 10);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ATLAS_ALLOWED_ORIGIN || '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = (process.env.SYNC_ORIGIN || (host ? proto + '://' + host : '')).replace(/\/$/, '');
    const fwd = {};
    if (req.headers['x-vercel-protection-bypass']) fwd['x-vercel-protection-bypass'] = req.headers['x-vercel-protection-bypass'];
    if (req.headers.cookie) fwd.cookie = req.headers.cookie;

    const today = ymd(new Date());
    const to = ymd(new Date(Date.now() + HORIZON_DAYS * 86_400_000));

    try {
        // 1. Book — symbols, theme, signals, conviction, known next date.
        const hr = await fetchT(SB_URL + '/rest/v1/vw_nexus_holdings?select=symbol,sector,next_earnings_date,valuation_signal,quant_signal,technical_signal,conviction_score',
            8000, { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY });
        const holdings = hr.ok ? await hr.json() : [];
        const bySymbol = new Map(holdings.map(h => [h.symbol, h]));

        // 2. Finnhub earnings calendar for the window → upcoming date + estimate.
        const cal = await finnhub('/calendar/earnings?from=' + today + '&to=' + to);
        const calBySym = new Map();
        ((cal && cal.earningsCalendar) || []).forEach(row => {
            if (row && row.symbol && bySymbol.has(row.symbol) && row.date >= today) {
                const prev = calBySym.get(row.symbol);
                if (!prev || row.date < prev.date) calBySym.set(row.symbol, row);
            }
        });

        // 3. Reporting set — names with a known upcoming date (Finnhub calendar
        //    or the book), soonest first, capped so the Finnhub fan-out stays
        //    bounded. Every *other* holding still renders below, just without
        //    consensus / prior / implied-move context.
        const upcomingDate = h => {
            const cd = calBySym.get(h.symbol);
            if (cd && cd.date && cd.date >= today) return cd.date;
            if (h.next_earnings_date && h.next_earnings_date >= today) return h.next_earnings_date;
            return null;
        };
        const richSyms = holdings
            .map(h => ({ sym: h.symbol, d: upcomingDate(h) }))
            .filter(x => x.d && x.d <= to)
            .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
            .slice(0, MAX_RICH)
            .map(x => x.sym);

        // 4. Rich context for the reporting set: per-symbol calendar (consensus
        //    EPS + reporting hour — the bulk calendar only confirms a handful),
        //    surprise history, and the daily series for the implied-move proxy.
        const richData = new Map();
        await Promise.all(richSyms.map(async sym => {
            const [hist, eqResp, cal] = await Promise.all([
                finnhub('/stock/earnings?symbol=' + encodeURIComponent(sym)),
                fetchT(origin + '/api/equity?endpoint=daily&symbol=' + encodeURIComponent(sym), 15000, fwd).then(r => r.ok ? r.json() : null).catch(() => null),
                finnhub('/calendar/earnings?symbol=' + encodeURIComponent(sym) + '&from=' + today + '&to=' + to),
            ]);
            const upcoming = ((cal && cal.earningsCalendar) || [])
                .filter(r => r && r.date && r.date >= today)
                .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];
            richData.set(sym, {
                history: hist || [],
                series: eqResp ? closeSeriesFromAlpaca(eqResp.daily) : [],
                calendar: upcoming || calBySym.get(sym) || {},
            });
        }));

        // 5. One row per holding — the deck mirrors the book, earnings-first.
        const rows = holdings.map(h => {
            const rd = richData.get(h.symbol) || {};
            return buildEarningsRow(h, { calendar: rd.calendar || calBySym.get(h.symbol) || {}, history: rd.history || [], series: rd.series || [] }, today);
        });
        const reportingCount = rows.filter(r => r.daysUntil != null && r.daysUntil >= 0 && r.daysUntil <= HORIZON_DAYS).length;

        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=21600');
        return res.status(200).json({ ok: true, asOf: new Date().toISOString(), horizonDays: HORIZON_DAYS, total: rows.length, reportingCount, rows: sortRows(rows) });
    } catch (e) {
        return res.status(200).json({ ok: false, error: (e && e.message) || 'earnings error', rows: [] });
    }
}
