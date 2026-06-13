// api/nexus-board.js
// ------------------------------------------------------------
// Data behind the Nexus "Macro & Breadth" board. Assembles, server-side
// (so keys stay off the client):
//   • vix      — FRED VIXCLS history + a FOMC/CPI/NFP event calendar
//   • indices  — daily closes for SPY / QQQ / IWM / DIA (Alpaca via /api/equity)
//   • breadth  — equal-weight vs cap-weight ratios (RSP/SPY, QQQE/QQQ), rebased
//   • fearGreed— a transparent composite (VIX, momentum, safe-haven, credit, breadth)
//
// All formatting/scoring lives in nexusBoardCompute.js (pure, unit-tested);
// this file is only fetch + assemble. Always 200s; missing pieces come back
// null/empty so the board degrades gracefully rather than breaking the page.

import {
    closeSeriesFromAlpaca, ratioSeries, lastChange, computeFearGreed, eventMarkers,
} from '../src/pages/nexus/nexusBoardCompute.js';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

async function fetchWithTimeout(url, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 9000);
    try { return await fetch(url, { signal: ac.signal }); }
    finally { clearTimeout(t); }
}

// FRED series → ascending [{t, v}].
async function fredSeries(id, limit) {
    const key = (process.env.FRED_API_KEY || '').trim();
    if (!key) return [];
    try {
        const url = FRED_BASE + '?series_id=' + id + '&api_key=' + key +
            '&file_type=json&sort_order=desc&limit=' + (limit || 300);
        const r = await fetchWithTimeout(url, 9000);
        if (!r.ok) return [];
        const j = await r.json();
        return (j.observations || [])
            .filter(o => o.value && o.value !== '.')
            .map(o => ({ t: o.date, v: Number(o.value) }))
            .filter(o => !Number.isNaN(o.v))
            .reverse();
    } catch { return []; }
}

// Daily closes for a symbol via the existing (cached) equity endpoint.
async function dailyCloses(origin, symbol) {
    try {
        const r = await fetchWithTimeout(origin + '/api/equity?endpoint=daily&symbol=' + encodeURIComponent(symbol), 15000);
        if (!r.ok) return [];
        const j = await r.json();
        return closeSeriesFromAlpaca(j.daily);
    } catch { return []; }
}

const tail = (arr, n) => (arr.length > n ? arr.slice(arr.length - n) : arr);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ATLAS_ALLOWED_ORIGIN || '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = (process.env.SYNC_ORIGIN || (host ? proto + '://' + host : '')).replace(/\/$/, '');

    try {
        const [vix, hy, spy, qqq, iwm, dia, rsp, qqqe, tlt] = await Promise.all([
            fredSeries('VIXCLS', 300),
            fredSeries('BAMLH0A0HYM2', 5),
            dailyCloses(origin, 'SPY'),
            dailyCloses(origin, 'QQQ'),
            dailyCloses(origin, 'IWM'),
            dailyCloses(origin, 'DIA'),
            dailyCloses(origin, 'RSP'),
            dailyCloses(origin, 'QQQE'),
            dailyCloses(origin, 'TLT'),
        ]);

        const vix1y = tail(vix, 252);
        const from = vix1y.length ? vix1y[0].t : '2025-01-01';
        const to = (vix1y.length ? vix1y[vix1y.length - 1].t : new Date().toISOString().slice(0, 10));

        const rspSpy = ratioSeries(rsp, spy);
        const qqqeQqq = ratioSeries(qqqe, qqq);

        const fearGreed = computeFearGreed({
            vix: vix1y,
            spy,
            tlt,
            hySpreadPct: hy.length ? hy[hy.length - 1].v : null,
            breadth: rspSpy,
        });

        const idx = (symbol, series) => {
            const { last, changePct } = lastChange(series);
            return { symbol, series: tail(series, 180), last, changePct };
        };

        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=7200');
        return res.status(200).json({
            ok: true,
            asOf: new Date().toISOString(),
            vix: { series: vix1y, events: eventMarkers(from, to) },
            indices: [idx('SPY', spy), idx('QQQ', qqq), idx('IWM', iwm), idx('DIA', dia)].filter(i => i.series.length),
            breadth: [
                { pair: 'RSP / SPY', label: 'S&P 500 equal vs cap weight', series: tail(rspSpy, 180) },
                { pair: 'QQQE / QQQ', label: 'Nasdaq-100 equal vs cap weight', series: tail(qqqeQqq, 180) },
            ].filter(b => b.series.length),
            fearGreed,
        });
    } catch (e) {
        return res.status(200).json({ ok: false, error: (e && e.message) || 'board error' });
    }
}
