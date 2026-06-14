// api/nexus-cot.js
// ------------------------------------------------------------
// Commitments of Traders positioning for the macro drivers behind the
// book. Pulls the CFTC legacy futures-only report (public Socrata, no
// key) for a curated set of contracts, then scores each: large-spec net
// position, net as % of open interest, week-over-week change, and where
// this week sits in a ~1-year range (the crowding read). Scoring lives
// in nexusCotCompute.js (pure, unit-tested). Degrades to empty, never
// throws.

import { groupByCode, buildCotRows } from '../src/pages/nexus/nexusCotCompute.js';

const CFTC = 'https://publicreporting.cftc.gov/resource/6dca-aqww.json';

// Curated to the book's macro exposures (contract code → driving holdings).
const MARKETS = [
    { code: '088691', label: 'Gold',             tickers: ['GDX', 'RGLD'] },
    { code: '084691', label: 'Silver',           tickers: ['SBSW', 'RGLD'] },
    { code: '085692', label: 'Copper',           tickers: ['GEV', 'NVT'] },
    { code: '067651', label: 'WTI Crude',        tickers: ['CVX', 'HAL', 'BKR', 'PBR'] },
    { code: '023651', label: 'Nat Gas',          tickers: ['KMI', 'BKR'] },
    { code: '13874A', label: 'S&P 500 (E-mini)', tickers: ['Book β'] },
    { code: '043602', label: 'UST 10Y',          tickers: ['SHY', 'BSV', 'BOND'] },
    { code: '098662', label: 'USD Index',        tickers: ['BABA', 'TM', 'TSM'] },
];

const SELECT = [
    'cftc_contract_market_code', 'report_date_as_yyyy_mm_dd', 'open_interest_all',
    'noncomm_positions_long_all', 'noncomm_positions_short_all',
    'comm_positions_long_all', 'comm_positions_short_all',
    'change_in_noncomm_long_all', 'change_in_noncomm_short_all',
].join(',');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ATLAS_ALLOWED_ORIGIN || '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const codes = MARKETS.map(m => "'" + m.code + "'").join(',');
        const url = CFTC
            + '?$select=' + encodeURIComponent(SELECT)
            + '&$where=' + encodeURIComponent('cftc_contract_market_code in (' + codes + ')')
            + '&$order=' + encodeURIComponent('report_date_as_yyyy_mm_dd DESC')
            + '&$limit=600'; // ~75 weeks across 8 markets — enough for the 1y percentile

        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 12000);
        let rows = [];
        try {
            const r = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
            rows = r.ok ? await r.json() : [];
        } finally { clearTimeout(t); }

        const out = buildCotRows(MARKETS, groupByCode(rows));
        const asOf = out.reduce((a, r) => (r.date > a ? r.date : a), '');

        res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
        return res.status(200).json({ ok: true, asOf, rows: out });
    } catch (e) {
        return res.status(200).json({ ok: false, error: (e && e.message) || 'cot error', rows: [] });
    }
}
