// Vercel Serverless Function: top/bottom daily movers + cap spectrum for ATLAS Terminal.
// Uses Finnhub quotes for a curated large-cap universe (~30 stocks) and cap-spectrum ETFs.
//
// Environment variables:
//   FINNHUB_API_KEY                    -- required
//   SUPABASE_URL / ATLAS_SUPABASE_URL  -- optional, for durable cache
//   SUPABASE_SERVICE_ROLE_KEY          -- optional
//   ATLAS_ALLOWED_ORIGIN               -- optional CORS allow-list

var FINNHUB_BASE = 'https://finnhub.io/api/v1';
var CACHE_KEY = 'movers_data';
var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

var STOCK_UNIVERSE = [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'LLY', name: 'Eli Lilly' },
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'V', name: 'Visa' },
    { symbol: 'UNH', name: 'UnitedHealth' },
    { symbol: 'XOM', name: 'ExxonMobil' },
    { symbol: 'JNJ', name: 'Johnson & Johnson' },
    { symbol: 'PG', name: 'Procter & Gamble' },
    { symbol: 'MA', name: 'Mastercard' },
    { symbol: 'MRK', name: 'Merck' },
    { symbol: 'AVGO', name: 'Broadcom' },
    { symbol: 'HD', name: 'Home Depot' },
    { symbol: 'ORCL', name: 'Oracle' },
    { symbol: 'BAC', name: 'Bank of America' },
    { symbol: 'COST', name: 'Costco' },
    { symbol: 'ABBV', name: 'AbbVie' },
    { symbol: 'CVX', name: 'Chevron' },
    { symbol: 'AMD', name: 'AMD' },
    { symbol: 'CRM', name: 'Salesforce' },
    { symbol: 'NFLX', name: 'Netflix' },
    { symbol: 'MCD', name: "McDonald's" },
    { symbol: 'GS', name: 'Goldman Sachs' },
    { symbol: 'MS', name: 'Morgan Stanley' },
    { symbol: 'NOW', name: 'ServiceNow' },
];

var CAP_SPECTRUM = [
    { symbol: 'SPY', label: 'Large Cap  (S&P 500)' },
    { symbol: 'QQQ', label: 'Mega Cap  (Nasdaq 100)' },
    { symbol: 'MDY', label: 'Mid Cap  (S&P 400)' },
    { symbol: 'IWM', label: 'Small Cap  (Russell 2K)' },
    { symbol: 'IJR', label: 'Small Cap  (S&P 600)' },
    { symbol: 'IWC', label: 'Micro Cap  (Russell Micro)' },
];

// ---- helpers ----

async function fetchWithTimeout(url, opts, ms) {
    var ac = new AbortController();
    var t = setTimeout(function() { ac.abort(); }, ms || 8000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
    finally { clearTimeout(t); }
}

async function finnhubQuote(symbol) {
    var key = (process.env.FINNHUB_API_KEY || '').trim();
    if (!key) return null;
    try {
        var r = await fetchWithTimeout(FINNHUB_BASE + '/quote?symbol=' + symbol + '&token=' + key, {}, 6000);
        if (!r.ok) return null;
        var d = await r.json();
        if (d.c == null || d.c === 0) return null;
        return { symbol: symbol, price: d.c, change: d.d, changePct: d.dp, high: d.h, low: d.l, prevClose: d.pc };
    } catch (_) { return null; }
}

// ---- Supabase cache ----

function supaCfg() {
    var url = process.env.SUPABASE_URL || process.env.ATLAS_SUPABASE_URL;
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return { url: url.replace(/\/$/, ''), key: key };
}

async function readCache(cacheKey) {
    var cfg = supaCfg(); if (!cfg) return null;
    try {
        var r = await fetchWithTimeout(
            cfg.url + '/rest/v1/cache?cache_key=eq.' + encodeURIComponent(cacheKey) + '&select=payload,expires_at',
            { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, accept: 'application/json' } }, 4000
        );
        if (!r.ok) return null;
        var rows = await r.json();
        if (!Array.isArray(rows) || !rows.length) return null;
        if (new Date(rows[0].expires_at).getTime() < Date.now()) return null;
        return rows[0].payload;
    } catch (_) { return null; }
}

async function writeCache(cacheKey, payload, ttlMs) {
    var cfg = supaCfg(); if (!cfg) return;
    try {
        await fetchWithTimeout(cfg.url + '/rest/v1/cache', {
            method: 'POST',
            headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify([{ cache_key: cacheKey, payload: payload, cached_at: new Date().toISOString(), expires_at: new Date(Date.now() + ttlMs).toISOString() }]),
        }, 4000);
    } catch (_) { /* non-fatal */ }
}

// ---- CORS ----

function applyCors(res) {
    var origin = process.env.ATLAS_ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ---- handler ----

export default async function handler(req, res) {
    applyCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

    try {
        var nocache = req.query && (req.query.nocache === '1' || req.query.nocache === 'true');

        if (!nocache) {
            var cached = await readCache(CACHE_KEY);
            if (cached) return res.status(200).json(cached);
        }

        // Fetch all quotes in parallel — tolerate failures
        var allSymbols = STOCK_UNIVERSE.concat(
            CAP_SPECTRUM.map(function(e) { return { symbol: e.symbol, name: e.label }; })
        );
        var quotes = await Promise.all(allSymbols.map(function(item) { return finnhubQuote(item.symbol); }));

        // Build stock results with names
        var stockResults = [];
        for (var i = 0; i < STOCK_UNIVERSE.length; i++) {
            var q = quotes[i];
            if (q && q.changePct != null) {
                stockResults.push(Object.assign({}, q, { name: STOCK_UNIVERSE[i].name }));
            }
        }

        // Sort and slice top/bottom 5
        stockResults.sort(function(a, b) { return (b.changePct || 0) - (a.changePct || 0); });
        var top    = stockResults.slice(0, 5);
        var bottom = stockResults.slice(-5).reverse();

        // Build cap spectrum
        var capSpectrum = [];
        for (var j = 0; j < CAP_SPECTRUM.length; j++) {
            var qi = quotes[STOCK_UNIVERSE.length + j];
            if (qi) {
                capSpectrum.push(Object.assign({}, qi, { label: CAP_SPECTRUM[j].label }));
            }
        }

        var payload = { top: top, bottom: bottom, capSpectrum: capSpectrum, _ts: Date.now() };
        writeCache(CACHE_KEY, payload, CACHE_TTL_MS);
        return res.status(200).json(payload);
    } catch (err) {
        return res.status(500).json({ error: (err && err.message) || 'Internal error' });
    }
}
