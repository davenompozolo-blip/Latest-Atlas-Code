// Vercel Serverless Function: ETF/fund data for ATLAS Terminal.
// GET /api/funds?symbol=SPY  (required)
// Optional: &compare=QQQ,IWM  &nocache=1
// Env: FINNHUB_API_KEY, ALPACA_API_KEY, ALPACA_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ATLAS_ALLOWED_ORIGIN

var SYMBOL_RE = /^[A-Z0-9.\-^=]{1,14}$/;
var FINNHUB_BASE = 'https://finnhub.io/api/v1';
var ALPACA_BASE = 'https://data.alpaca.markets/v2';
var TTL_MS = 30 * 60 * 1000;
var MEM_TTL_MS = 15 * 60 * 1000;
var _memCache = new Map();

var ETF_META = {
    SPY:  { name: 'SPDR S&P 500 ETF',            category: 'Large Blend',               expense: 0.000945 },
    QQQ:  { name: 'Invesco QQQ Trust',            category: 'Large Growth',              expense: 0.0020 },
    IWM:  { name: 'iShares Russell 2000',         category: 'Small Blend',               expense: 0.0019 },
    VTI:  { name: 'Vanguard Total Stock',         category: 'Large Blend',               expense: 0.0003 },
    VOO:  { name: 'Vanguard S&P 500',             category: 'Large Blend',               expense: 0.0003 },
    EFA:  { name: 'iShares MSCI EAFE',            category: 'Foreign Large Blend',       expense: 0.0032 },
    EEM:  { name: 'iShares MSCI Emerging',        category: 'Emerging Markets',          expense: 0.0068 },
    TLT:  { name: 'iShares 20+ Year Treasury',    category: 'Long-Term Bond',            expense: 0.0015 },
    AGG:  { name: 'iShares Core US Aggregate',    category: 'Intermediate Core Bond',    expense: 0.0003 },
    HYG:  { name: 'iShares High Yield Corporate', category: 'High Yield Bond',           expense: 0.0049 },
    LQD:  { name: 'iShares IG Corporate',         category: 'Corporate Bond',            expense: 0.0014 },
    GLD:  { name: 'SPDR Gold Shares',             category: 'Commodities Precious Metals', expense: 0.0040 },
    SLV:  { name: 'iShares Silver Trust',         category: 'Commodities Precious Metals', expense: 0.0050 },
    VNQ:  { name: 'Vanguard Real Estate',         category: 'Real Estate',               expense: 0.0012 },
    XLK:  { name: 'Technology Select SPDR',       category: 'Technology',                expense: 0.0009 },
    XLF:  { name: 'Financial Select SPDR',        category: 'Financial',                 expense: 0.0009 },
    XLV:  { name: 'Health Care Select SPDR',      category: 'Health',                    expense: 0.0009 },
    XLE:  { name: 'Energy Select SPDR',           category: 'Energy',                    expense: 0.0009 },
    ARKK: { name: 'ARK Innovation ETF',           category: 'Mid-Cap Growth',            expense: 0.0075 },
    SCHD: { name: 'Schwab US Dividend',           category: 'Large Value',               expense: 0.0006 },
    VIG:  { name: 'Vanguard Dividend Appreciation', category: 'Large Blend',             expense: 0.0006 },
    DIA:  { name: 'SPDR Dow Jones Industrial',    category: 'Large Value',               expense: 0.0016 },
    BND:  { name: 'Vanguard Total Bond',          category: 'Intermediate Core Bond',    expense: 0.0003 },
    USO:  { name: 'United States Oil Fund',       category: 'Commodities Energy',        expense: 0.0081 },
    UUP:  { name: 'Invesco DB US Dollar',         category: 'Currency',                  expense: 0.0077 },
    TQQQ: { name: 'ProShares UltraPro QQQ',      category: '3x Leveraged',              expense: 0.0086 },
    VYM:  { name: 'Vanguard High Dividend',       category: 'Large Value',               expense: 0.0006 },
    IEF:  { name: 'iShares 7-10 Year Treasury',   category: 'Intermediate Bond',        expense: 0.0015 },
    TIP:  { name: 'iShares TIPS Bond',            category: 'Inflation-Protected Bond',  expense: 0.0019 },
    EMB:  { name: 'iShares JP Morgan EM Bond',    category: 'Emerging Markets Bond',     expense: 0.0039 },
};

// Primary listing exchange for the curated ETFs. Finnhub /stock/profile2 returns
// no profile for these on our tier, so the Exchange field showed "—" for every
// fund (FD-03). Used as a fallback when the vendor profile is absent.
var ETF_EXCH = {
    SPY:'NYSE Arca', QQQ:'Nasdaq', IWM:'NYSE Arca', VTI:'NYSE Arca', VOO:'NYSE Arca',
    EFA:'NYSE Arca', EEM:'NYSE Arca', TLT:'Nasdaq', AGG:'NYSE Arca', HYG:'NYSE Arca',
    LQD:'NYSE Arca', GLD:'NYSE Arca', SLV:'NYSE Arca', VNQ:'NYSE Arca', XLK:'NYSE Arca',
    XLF:'NYSE Arca', XLV:'NYSE Arca', XLE:'NYSE Arca', ARKK:'Cboe BZX', SCHD:'NYSE Arca',
    VIG:'NYSE Arca', DIA:'NYSE Arca', BND:'Nasdaq', USO:'NYSE Arca', UUP:'NYSE Arca',
    TQQQ:'Nasdaq', VYM:'NYSE Arca', IEF:'Nasdaq', TIP:'NYSE Arca', EMB:'Nasdaq',
};

// -- Helpers ------------------------------------------------------------------

async function fetchWithTimeout(url, opts, ms) {
    var ac = new AbortController();
    var t = setTimeout(function() { ac.abort(); }, ms || 8000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
    finally { clearTimeout(t); }
}

function memGet(key) {
    var e = _memCache.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > MEM_TTL_MS) { _memCache.delete(key); return null; }
    return e.data;
}
function memSet(key, data) { _memCache.set(key, { ts: Date.now(), data: data }); }

// -- Supabase durable cache ---------------------------------------------------

function supaCfg() {
    var url = process.env.SUPABASE_URL || process.env.ATLAS_SUPABASE_URL;
    var key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return { url: url.replace(/\/$/, ''), key: key };
}

async function dbCacheGet(cacheKey) {
    var cfg = supaCfg();  if (!cfg) return null;
    try {
        var url = cfg.url + '/rest/v1/equity_cache?cache_key=eq.' + encodeURIComponent(cacheKey) + '&select=payload,expires_at';
        var r = await fetchWithTimeout(url, { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, accept: 'application/json' } }, 4000);
        if (!r.ok) return null;
        var rows = await r.json();
        if (!Array.isArray(rows) || !rows.length) return null;
        if (new Date(rows[0].expires_at).getTime() < Date.now()) return null;
        return rows[0].payload;
    } catch (_) { return null; }
}

async function dbCacheSet(cacheKey, symbol, endpoint, payload, ttlMs) {
    var cfg = supaCfg();  if (!cfg) return;
    try {
        await fetchWithTimeout(cfg.url + '/rest/v1/equity_cache', {
            method: 'POST',
            headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify([{ cache_key: cacheKey, symbol: symbol, endpoint: endpoint, payload: payload, cached_at: new Date().toISOString(), expires_at: new Date(Date.now() + ttlMs).toISOString() }]),
        }, 4000);
    } catch (_) { /* non-fatal */ }
}

// -- Finnhub ------------------------------------------------------------------

async function finnhubGet(path) {
    var key = (process.env.FINNHUB_API_KEY || '').trim();
    if (!key) throw new Error('FINNHUB_API_KEY not configured');
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    var url = FINNHUB_BASE + path + sep + 'token=' + encodeURIComponent(key);
    var r = await fetchWithTimeout(url, { headers: { accept: 'application/json' } }, 12000);
    if (r.status === 401 || r.status === 403) throw new Error('Finnhub auth failed (check FINNHUB_API_KEY)');
    if (r.status === 429) throw new Error('Finnhub rate limit');
    if (!r.ok) throw new Error('Finnhub HTTP ' + r.status);
    return r.json();
}

// -- Alpaca daily bars --------------------------------------------------------

async function alpacaBars(symbol) {
    var key = process.env.ALPACA_API_KEY;
    var secret = process.env.ALPACA_API_SECRET;
    if (!key || !secret) return null;
    var end = new Date();
    // ~5 years of daily history so 3Y annualised return (needs >756 bars) and
    // the rolling 1Y Sharpe chart (needs >252 bars) can be computed. The prior
    // 730-day (2y) window capped every fund at ~504 bars, so ret3y was always
    // null and rolling analysis never had enough history — even for SPY (FD-02).
    var start = new Date(end.getTime() - 1825 * 24 * 60 * 60 * 1000);
    var url = ALPACA_BASE + '/stocks/' + encodeURIComponent(symbol) + '/bars'
        + '?timeframe=1Day&start=' + start.toISOString().slice(0, 10)
        + '&end=' + end.toISOString().slice(0, 10)
        + '&limit=10000&adjustment=raw&feed=iex';
    var r = await fetchWithTimeout(url, {
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, accept: 'application/json' },
    }, 12000);
    if (!r.ok) return null;
    var j = await r.json();
    return (j && j.bars) || [];
}

function alpacaToArrays(bars) {
    if (!bars || !bars.length) return null;
    var closes = [], timestamps = [];
    for (var i = 0; i < bars.length; i++) {
        closes.push(bars[i].c);
        timestamps.push(Math.floor(new Date(bars[i].t).getTime() / 1000));
    }
    return { c: closes, t: timestamps, s: 'ok' };
}

// -- Metrics computation ------------------------------------------------------

function computeMetrics(candles) {
    if (!candles || !candles.c || candles.c.length < 20) return null;
    var closes = candles.c, timestamps = candles.t, n = closes.length, current = closes[n - 1];
    var ret1m = n > 21 ? closes[n-1]/closes[n-22] - 1 : null;
    var ret3m = n > 63 ? closes[n-1]/closes[n-64] - 1 : null;
    var ret6m = n > 126 ? closes[n-1]/closes[n-127] - 1 : null;
    var ret1y = n > 252 ? closes[n-1]/closes[n-253] - 1 : null;
    var ret3y = n > 756 ? Math.pow(closes[n-1]/closes[n-757], 1/3) - 1 : null;
    // YTD
    var retYtd = null;
    if (timestamps && timestamps.length === n) {
        var nowYear = new Date().getFullYear();
        for (var yi = 0; yi < n; yi++) {
            if (new Date(timestamps[yi] * 1000).getFullYear() === nowYear) { retYtd = closes[n-1]/closes[yi] - 1; break; }
        }
    }
    // Daily returns
    var dailyRet = [];
    for (var i = 1; i < n; i++) dailyRet.push(closes[i]/closes[i-1] - 1);
    var w = Math.min(dailyRet.length, 252);
    var recentRet = dailyRet.slice(-w);
    var mean = recentRet.reduce(function(s,v){return s+v;}, 0) / recentRet.length;
    var variance = recentRet.reduce(function(s,v){return s+(v-mean)*(v-mean);}, 0) / recentRet.length;
    var annVol = Math.sqrt(variance) * Math.sqrt(252);
    var annReturn = mean * 252;
    var sharpe = annVol > 0 ? (annReturn - 0.045) / annVol : null;
    // Sortino
    var downRet = recentRet.filter(function(r){return r < 0;});
    var downDev = downRet.length > 0 ? Math.sqrt(downRet.reduce(function(s,v){return s+v*v;}, 0) / downRet.length) * Math.sqrt(252) : 0;
    var sortino = downDev > 0 ? (annReturn - 0.045) / downDev : null;
    // Max drawdown
    var peak = closes[0], maxDD = 0, ddSeries = [];
    for (var j = 0; j < n; j++) {
        if (closes[j] > peak) peak = closes[j];
        var dd = (closes[j] - peak) / peak;
        if (dd < maxDD) maxDD = dd;
        ddSeries.push(dd);
    }
    var calmar = maxDD < 0 ? annReturn / Math.abs(maxDD) : null;
    // 52W high/low
    var w52 = closes.slice(-252);
    return {
        current: current, high52: Math.max.apply(null, w52), low52: Math.min.apply(null, w52),
        ret1m: ret1m, ret3m: ret3m, ret6m: ret6m, ret1y: ret1y, ret3y: ret3y, retYtd: retYtd,
        annReturn: annReturn, annVol: annVol, sharpe: sharpe, sortino: sortino,
        maxDD: maxDD, calmar: calmar, ddSeries: ddSeries.slice(-1300),
    };
}

function buildSeries(candles) {
    if (!candles || !candles.c || !candles.t) return [];
    var series = [];
    for (var i = 0; i < candles.c.length; i++) {
        series.push({ date: new Date(candles.t[i] * 1000).toISOString().slice(0, 10), close: candles.c[i] });
    }
    // Return up to ~5 years so the client can compute the rolling 1Y Sharpe and
    // a multi-year price/heatmap. Previously capped at 252 (1y), which forced
    // "Insufficient data for rolling analysis" on every fund (FD-02).
    return series.slice(-1300);
}

// -- Fetch & cache for a single symbol ----------------------------------------

async function fetchFundData(symbol) {
    var sym = encodeURIComponent(symbol);
    var results = await Promise.allSettled([
        finnhubGet('/quote?symbol=' + sym),
        finnhubGet('/stock/profile2?symbol=' + sym),
        alpacaBars(symbol),
    ]);
    var quote = results[0].status === 'fulfilled' ? results[0].value : null;
    var profile = results[1].status === 'fulfilled' ? results[1].value : null;
    var alpacaRaw = results[2].status === 'fulfilled' ? results[2].value : null;
    var candles = alpacaToArrays(alpacaRaw);
    if (!quote && !candles) {
        var reasons = [];
        if (results[0].status === 'rejected') reasons.push('quote: ' + results[0].reason.message);
        if (results[2].status === 'rejected') reasons.push('bars: ' + results[2].reason.message);
        throw new Error('Failed to fetch data for ' + symbol + ': ' + reasons.join('; '));
    }
    var quoteObj = (quote && quote.c != null) ? { price: quote.c, change: quote.d != null ? quote.d : null, changePct: quote.dp != null ? quote.dp : null } : null;
    var em = ETF_META[symbol] || null;
    var exch = (profile && profile.exchange) || ETF_EXCH[symbol] || '';
    // Use the vendor profile when present; otherwise synthesise a minimal one from
    // the curated ETF metadata so the Profile tab shows a name + exchange instead
    // of "—" (FD-03) — Finnhub returns no profile for these ETFs on our tier.
    var profileObj = (profile && (profile.name || profile.ticker))
        ? { name: profile.name || symbol, exchange: exch, logo: profile.logo || null, industry: profile.finnhubIndustry || '' }
        : (em ? { name: em.name, exchange: exch, logo: null, industry: '' } : null);
    var metrics = candles ? computeMetrics(candles) : null;
    var series = candles ? buildSeries(candles) : [];
    if (metrics && quoteObj && quoteObj.price) metrics.current = quoteObj.price;
    return {
        symbol: symbol, profile: profileObj, meta: ETF_META[symbol] || null,
        quote: quoteObj, metrics: metrics, series: series,
        ddSeries: metrics ? metrics.ddSeries : [], _ts: Date.now(), _v: 1,
    };
}

async function getFundData(symbol, skipCache) {
    var cacheKey = 'fund_' + symbol;
    if (!skipCache) {
        var mem = memGet(cacheKey);  if (mem) return { data: mem, cache: 'mem' };
        var db = await dbCacheGet(cacheKey);
        if (db) { memSet(cacheKey, db); return { data: db, cache: 'db' }; }
    }
    var data = await fetchFundData(symbol);
    memSet(cacheKey, data);
    dbCacheSet(cacheKey, symbol, 'fund', data, TTL_MS);
    return { data: data, cache: 'miss' };
}

// -- CORS & Handler -----------------------------------------------------------

function applyCors(res) {
    var origin = process.env.ATLAS_ALLOWED_ORIGIN;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
    }
}

var COMP_METRIC_KEYS = ['current','high52','low52','ret1m','ret3m','ret6m','ret1y','ret3y','retYtd','annReturn','annVol','sharpe','sortino','maxDD','calmar'];

function slimMetrics(m) {
    if (!m) return null;
    var out = {};
    for (var i = 0; i < COMP_METRIC_KEYS.length; i++) { var k = COMP_METRIC_KEYS[i]; out[k] = m[k]; }
    return out;
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') { applyCors(res); return res.status(204).end(); }
    if (req.method !== 'GET')     { applyCors(res); return res.status(405).json({ error: 'GET only' }); }
    var symbol = String((req.query && req.query.symbol) || '').trim().toUpperCase();
    if (!symbol || !SYMBOL_RE.test(symbol)) { applyCors(res); return res.status(400).json({ error: 'Missing or malformed symbol' }); }
    var skipCache = req.query && (req.query.nocache === '1' || req.query.nocache === 'true');
    var compareRaw = (req.query && req.query.compare) ? String(req.query.compare).trim() : '';
    var compareSymbols = compareRaw ? compareRaw.split(',').map(function(s){return s.trim().toUpperCase();}).filter(function(s){return SYMBOL_RE.test(s) && s !== symbol;}) : [];
    try {
        var primary = await getFundData(symbol, skipCache);
        var payload = primary.data;
        if (compareSymbols.length > 0) {
            var compResults = await Promise.allSettled(compareSymbols.map(function(s){return getFundData(s, skipCache);}));
            payload.comparisons = [];
            for (var i = 0; i < compResults.length; i++) {
                if (compResults[i].status === 'fulfilled') {
                    var d = compResults[i].value.data;
                    payload.comparisons.push({ symbol: d.symbol, profile: d.profile, meta: d.meta, quote: d.quote, metrics: slimMetrics(d.metrics) });
                }
            }
        }
        applyCors(res);
        res.setHeader('x-cache', primary.cache);
        return res.status(200).json(payload);
    } catch (e) {
        applyCors(res);
        var msg = (e && e.message) ? e.message : String(e);
        var status = /rate limit/i.test(msg) ? 429 : /not found|HTTP 404/i.test(msg) ? 404 : 502;
        return res.status(status).json({ error: msg });
    }
};
