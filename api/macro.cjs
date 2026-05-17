// Vercel Serverless Function: macro/economic data for ATLAS Terminal.
//
// Fetches yield curve, inflation, growth, credit, and market data from
// FRED API + Finnhub, computes a regime classification, and caches the
// assembled payload in Supabase (1h TTL).
//
// Environment variables:
//   FRED_API_KEY                       -- required for FRED series
//   FINNHUB_API_KEY                    -- required for market quotes
//   SUPABASE_URL                       -- optional, for durable cache
//   SUPABASE_SERVICE_ROLE_KEY          -- optional, for durable cache
//   ATLAS_ALLOWED_ORIGIN               -- optional CORS allow-list

var FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
var FINNHUB_BASE = 'https://finnhub.io/api/v1';
var CACHE_KEY = 'macro_data';
var CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---- helpers ----

async function fetchWithTimeout(url, opts, ms) {
    var ac = new AbortController();
    var t = setTimeout(function() { ac.abort(); }, ms || 8000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
    finally { clearTimeout(t); }
}

async function fetchFred(seriesId, limit) {
    var key = (process.env.FRED_API_KEY || '').trim();
    if (!key) return null;
    var url = FRED_BASE + '?series_id=' + seriesId +
              '&api_key=' + key + '&file_type=json&sort_order=desc&limit=' + (limit || 12);
    var r = await fetchWithTimeout(url, {}, 10000);
    if (!r.ok) return null;
    var d = await r.json();
    if (!d.observations) return null;
    return d.observations
        .filter(function(o) { return o.value !== '.'; })
        .map(function(o) { return { date: o.date, value: parseFloat(o.value) }; })
        .reverse();
}

async function finnhubQuote(symbol) {
    var key = (process.env.FINNHUB_API_KEY || '').trim();
    if (!key) return null;
    var r = await fetchWithTimeout(FINNHUB_BASE + '/quote?symbol=' + symbol + '&token=' + key, {}, 6000);
    if (!r.ok) return null;
    var d = await r.json();
    return { symbol: symbol, price: d.c, change: d.d, changePct: d.dp, high: d.h, low: d.l, prevClose: d.pc };
}

// ---- Supabase cache (mirrors equity.js pattern) ----

function supaCfg() {
    var url = process.env.SUPABASE_URL || process.env.ATLAS_SUPABASE_URL;
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return { url: url.replace(/\/$/, ''), key: key };
}

async function readCache(cacheKey) {
    var cfg = supaCfg();
    if (!cfg) return null;
    try {
        var url = cfg.url + '/rest/v1/cache'
            + '?cache_key=eq.' + encodeURIComponent(cacheKey)
            + '&select=payload,expires_at';
        var r = await fetchWithTimeout(url, {
            headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, accept: 'application/json' },
        }, 4000);
        if (!r.ok) return null;
        var rows = await r.json();
        if (!Array.isArray(rows) || !rows.length) return null;
        if (new Date(rows[0].expires_at).getTime() < Date.now()) return null;
        return rows[0].payload;
    } catch (_) { return null; }
}

async function writeCache(cacheKey, payload, ttlMs) {
    var cfg = supaCfg();
    if (!cfg) return;
    try {
        var body = [{
            cache_key: cacheKey,
            payload: payload,
            cached_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + ttlMs).toISOString(),
        }];
        await fetchWithTimeout(cfg.url + '/rest/v1/cache', {
            method: 'POST',
            headers: {
                apikey: cfg.key,
                Authorization: 'Bearer ' + cfg.key,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(body),
        }, 4000);
    } catch (_) { /* non-fatal */ }
}

// ---- regime classification ----

function classifyRegime(data) {
    var regime = { label: 'Assessing', quadrant: 'unknown', color: '#6366f1', confidence: 0.5 };

    var growthUp = false;
    if (data.growth && data.growth.unrate && data.growth.unrate.length >= 2) {
        var latest = data.growth.unrate[data.growth.unrate.length - 1].value;
        var prior = data.growth.unrate[data.growth.unrate.length - 2].value;
        growthUp = latest <= prior;
    }

    var inflationUp = false;
    if (data.inflation && data.inflation.cpi && data.inflation.cpi.length >= 14) {
        var arr = data.inflation.cpi;
        var latestYoY = (arr[arr.length - 1].value / arr[arr.length - 13].value - 1) * 100;
        var priorYoY = (arr[arr.length - 2].value / arr[arr.length - 14].value - 1) * 100;
        inflationUp = latestYoY > priorYoY;
        regime.cpiYoY = latestYoY;
    }

    if (growthUp && !inflationUp) { regime.label = 'Goldilocks'; regime.quadrant = 'growth_up_inflation_down'; regime.color = '#10b981'; regime.confidence = 0.7; }
    else if (growthUp && inflationUp) { regime.label = 'Reflation'; regime.quadrant = 'growth_up_inflation_up'; regime.color = '#f59e0b'; regime.confidence = 0.65; }
    else if (!growthUp && inflationUp) { regime.label = 'Stagflation'; regime.quadrant = 'growth_down_inflation_up'; regime.color = '#ef4444'; regime.confidence = 0.65; }
    else { regime.label = 'Deflation'; regime.quadrant = 'growth_down_inflation_down'; regime.color = '#6366f1'; regime.confidence = 0.6; }

    return regime;
}

// ---- CORS ----

function applyCors(res) {
    var origin = process.env.ATLAS_ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ---- handler ----

module.exports = async function handler(req, res) {
    applyCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

    try {
        var nocache = req.query && (req.query.nocache === '1' || req.query.nocache === 'true');

        // Check Supabase cache first
        if (!nocache) {
            var cached = await readCache(CACHE_KEY);
            if (cached) { return res.status(200).json(cached); }
        }

        // Fetch all FRED series in parallel
        var fredResults = await Promise.allSettled([
            /* 0  */ fetchFred('DGS3MO', 60),
            /* 1  */ fetchFred('DGS2', 60),
            /* 2  */ fetchFred('DGS5', 60),
            /* 3  */ fetchFred('DGS10', 60),
            /* 4  */ fetchFred('DGS30', 60),
            /* 5  */ fetchFred('FEDFUNDS', 24),
            /* 6  */ fetchFred('CPIAUCSL', 36),
            /* 7  */ fetchFred('CPILFESL', 36),
            /* 8  */ fetchFred('PCEPI', 36),
            /* 9  */ fetchFred('T5YIE', 60),
            /* 10 */ fetchFred('T10YIE', 60),
            /* 11 */ fetchFred('GDP', 24),
            /* 12 */ fetchFred('GDPC1', 24),
            /* 13 */ fetchFred('PAYEMS', 24),
            /* 14 */ fetchFred('UNRATE', 24),
            /* 15 */ fetchFred('ICSA', 52),
            /* 16 */ fetchFred('INDPRO', 24),
            /* 17 */ fetchFred('BAMLH0A0HYM2', 60),
            /* 18 */ fetchFred('BAMLC0A4CBBB', 60),
            /* 19 */ fetchFred('NFCI', 60),
        ]);

        function val(i) { return fredResults[i].status === 'fulfilled' ? fredResults[i].value : null; }

        var dgs3mo = val(0), dgs2 = val(1), dgs5 = val(2), dgs10 = val(3), dgs30 = val(4);
        var fedFunds = val(5);
        var cpi = val(6), coreCpi = val(7), pce = val(8), t5yie = val(9), t10yie = val(10);
        var gdp = val(11), realGdp = val(12), payrolls = val(13), unrate = val(14), claims = val(15), indpro = val(16);
        var hySpreads = val(17), igSpreads = val(18), nfci = val(19);

        // Build yield curve snapshot from latest values
        function latestVal(arr) { return arr && arr.length ? arr[arr.length - 1].value : null; }
        var yieldCurve = {
            labels: ['3M', '2Y', '5Y', '10Y', '30Y'],
            values: [latestVal(dgs3mo), latestVal(dgs2), latestVal(dgs5), latestVal(dgs10), latestVal(dgs30)],
            spread2s10s: (latestVal(dgs10) != null && latestVal(dgs2) != null) ? latestVal(dgs10) - latestVal(dgs2) : null,
        };

        // Fetch Finnhub market quotes in parallel
        var etfs = [
            // Core cross-asset
            'SPY', 'QQQ', 'IWM', 'EFA', 'EEM', 'TLT', 'HYG', 'LQD', 'GLD', 'USO', 'UUP',
            // Global ETF proxies
            'EWJ', 'EWG', 'EWU', 'EWY', 'EWH',
            // US SPDR Sector ETFs
            'XLK', 'XLF', 'XLV', 'XLY', 'XLC', 'XLI', 'XLP', 'XLE', 'XLU', 'XLRE', 'XLB',
        ];
        var quoteResults = await Promise.allSettled(etfs.map(function(s) { return finnhubQuote(s); }));
        var allQuotes = quoteResults
            .map(function(r) { return r.status === 'fulfilled' ? r.value : null; })
            .filter(Boolean);

        var SECTOR_NAMES = {
            XLK:'Technology', XLF:'Financials', XLV:'Health Care', XLY:'Cons. Discretionary',
            XLC:'Comm. Services', XLI:'Industrials', XLP:'Cons. Staples', XLE:'Energy',
            XLU:'Utilities', XLRE:'Real Estate', XLB:'Materials',
        };
        var SECTOR_SYMS = Object.keys(SECTOR_NAMES);

        var marketQuotes = allQuotes.filter(function(q) { return !SECTOR_NAMES[q.symbol]; });
        var sectorQuotes = allQuotes
            .filter(function(q) { return !!SECTOR_NAMES[q.symbol]; })
            .map(function(q) { return Object.assign({}, q, { name: SECTOR_NAMES[q.symbol] }); })
            .sort(function(a, b) { return (b.changePct || 0) - (a.changePct || 0); });

        // Assemble payload
        var payload = {
            yields: {
                curve: yieldCurve,
                fedFunds: fedFunds,
                dgs2: dgs2,
                dgs10: dgs10,
                dgs30: dgs30,
            },
            inflation: {
                cpi: cpi,
                coreCpi: coreCpi,
                pce: pce,
                breakeven5y: t5yie,
                breakeven10y: t10yie,
            },
            growth: {
                gdp: gdp,
                realGdp: realGdp,
                payrolls: payrolls,
                unrate: unrate,
                claims: claims,
                indpro: indpro,
            },
            credit: {
                hySpreads: hySpreads,
                igSpreads: igSpreads,
                nfci: nfci,
            },
            market: marketQuotes,
            sectors: sectorQuotes,
            regime: classifyRegime({ growth: { unrate: unrate }, inflation: { cpi: cpi } }),
            _ts: Date.now(),
            _v: 1,
        };

        // Write cache (fire-and-forget)
        writeCache(CACHE_KEY, payload, CACHE_TTL_MS);

        return res.status(200).json(payload);
    } catch (err) {
        return res.status(500).json({ error: (err && err.message) || 'Internal error' });
    }
};
