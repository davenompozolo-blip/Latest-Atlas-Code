// Vercel Serverless Function: equity data proxy for ATLAS Equity Research.
//
// History of this file (why it keeps getting rewritten):
//   1. Alpha Vantage — blown through the 25-req/day free tier instantly.
//   2. Yahoo Finance — works, but Yahoo IP-bans Vercel's egress pools;
//      users kept seeing "rate limit" errors because bans are per-IP, not
//      per-account, so waiting doesn't help.
//   3. Alpaca for prices + Yahoo for fundamentals, both cached in Supabase.
//      Alpaca has a 200/min free tier and we already own the creds.
//   4. (This version) Finnhub for fundamentals (primary) + Yahoo fallback.
//      Finnhub's free tier (60 req/min) is reliable on serverless — no
//      IP-banning. Yahoo kept as secondary for when Finnhub is unavailable.
//      Both cached durably in Supabase so steady-state traffic rarely
//      hits any provider.
//
// Response shape is unchanged — frontend (public/js/equity-research.js)
// keeps consuming Alpha-Vantage-keyed fields.
//
// Environment variables:
//   ALPACA_API_KEY, ALPACA_API_SECRET   — required for price path
//   SUPABASE_URL                        — required for durable cache
//   SUPABASE_SERVICE_ROLE_KEY           — required for durable cache
//   FINNHUB_API_KEY                     — primary fundamentals (finnhub.io free tier)
//   ATLAS_ALLOWED_ORIGIN                — optional CORS allow-list
//
// If SUPABASE_SERVICE_ROLE_KEY is missing, caching silently degrades to
// the in-memory Map (same behaviour as the previous version).

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const SYMBOL_RE = /^[A-Z0-9.\-^=]{1,14}$/;
const ALLOWED_ENDPOINTS = new Set(['combined', 'overview', 'daily']);

const TTL_DAILY_MS    = 4 * 60 * 60 * 1000;     // 4h
const TTL_OVERVIEW_MS = 24 * 60 * 60 * 1000;    // 24h
const MEM_TTL_MS      = 15 * 60 * 1000;          // fallback in-memory only
const CRUMB_TTL_MS    = 60 * 60 * 1000;

const ALPACA_BASE = 'https://data.alpaca.markets/v2';
const YF          = 'https://query2.finance.yahoo.com';
const SUMMARY_MODULES = 'summaryProfile,summaryDetail,financialData,defaultKeyStatistics,recommendationTrend,price,earnings';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

const _memCache = new Map();
let _crumb = null;

// ------------------------------------------------------------
// Low-level helpers
// ------------------------------------------------------------

async function fetchWithTimeout(url, opts, ms) {
    const ac = new AbortController();
    const t = setTimeout(function() { ac.abort(); }, ms || 8000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
    finally { clearTimeout(t); }
}

function memGet(key) {
    const e = _memCache.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > MEM_TTL_MS) { _memCache.delete(key); return null; }
    return e.data;
}
function memSet(key, data) { _memCache.set(key, { ts: Date.now(), data }); }

// ------------------------------------------------------------
// Supabase durable cache (read-through / write-back)
// ------------------------------------------------------------

function supaCfg() {
    const url = process.env.SUPABASE_URL || process.env.ATLAS_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return { url: url.replace(/\/$/, ''), key };
}

async function dbCacheGet(cacheKey) {
    const cfg = supaCfg();
    if (!cfg) return null;
    try {
        const url = cfg.url + '/rest/v1/equity_cache'
            + '?cache_key=eq.' + encodeURIComponent(cacheKey)
            + '&select=payload,expires_at';
        const r = await fetchWithTimeout(url, {
            headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, accept: 'application/json' },
        }, 4000);
        if (!r.ok) return null;
        const rows = await r.json();
        if (!Array.isArray(rows) || !rows.length) return null;
        if (new Date(rows[0].expires_at).getTime() < Date.now()) return null;
        return rows[0].payload;
    } catch (_) { return null; }
}

async function dbCacheSet(cacheKey, symbol, endpoint, payload, ttlMs) {
    const cfg = supaCfg();
    if (!cfg) return;
    try {
        const body = [{
            cache_key: cacheKey,
            symbol: symbol,
            endpoint: endpoint,
            payload: payload,
            cached_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + ttlMs).toISOString(),
        }];
        await fetchWithTimeout(cfg.url + '/rest/v1/equity_cache', {
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

// ------------------------------------------------------------
// Upstream A: Alpaca (daily bars) — primary price source
// ------------------------------------------------------------

async function alpacaBars(symbol) {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET;
    if (!key || !secret) throw new Error('Alpaca credentials not configured on server (ALPACA_API_KEY / ALPACA_API_SECRET)');

    // 2-year window so 1Y return + 90D vol have headroom even on holidays.
    const end = new Date();
    const start = new Date(end.getTime() - 730 * 24 * 60 * 60 * 1000);
    // Alpaca class-share convention is dotted (BRK.B). URL-encode to be safe.
    const url = ALPACA_BASE + '/stocks/' + encodeURIComponent(symbol) + '/bars'
        + '?timeframe=1Day'
        + '&start=' + start.toISOString().slice(0, 10)
        + '&end=' + end.toISOString().slice(0, 10)
        + '&limit=10000'
        + '&adjustment=raw'
        + '&feed=iex';

    const r = await fetchWithTimeout(url, {
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, accept: 'application/json' },
    });
    if (r.status === 404) throw new Error('Symbol not found on Alpaca: ' + symbol);
    if (r.status === 403 || r.status === 401) throw new Error('Alpaca auth failed (check ALPACA_API_KEY / ALPACA_API_SECRET)');
    if (r.status === 429) throw new Error('Alpaca rate limit: try again in a moment');
    if (!r.ok) throw new Error('Alpaca HTTP ' + r.status);
    const j = await r.json();
    return (j && j.bars) || [];
}

function mapAlpacaDaily(bars) {
    const series = {};
    for (let i = 0; i < bars.length; i++) {
        const b = bars[i];
        const date = String(b.t).slice(0, 10);
        if (!date || b.c == null) continue;
        series[date] = {
            '1. open':   String(b.o != null ? b.o : b.c),
            '2. high':   String(b.h != null ? b.h : b.c),
            '3. low':    String(b.l != null ? b.l : b.c),
            '4. close':  String(b.c),
            '5. volume': String(b.v != null ? b.v : 0),
        };
    }
    return { 'Time Series (Daily)': series };
}

// Alpaca asset info — fallback for company name when Yahoo is blocked
async function alpacaAssetInfo(symbol) {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET;
    if (!key || !secret) return null;
    try {
        const url = 'https://paper-api.alpaca.markets/v2/assets/' + encodeURIComponent(symbol);
        const r = await fetchWithTimeout(url, {
            headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret, accept: 'application/json' },
        }, 5000);
        if (!r.ok) return null;
        const j = await r.json();
        return { Symbol: j.symbol || symbol, Name: j.name || symbol, Exchange: j.exchange || '' };
    } catch (_) { return null; }
}

// ------------------------------------------------------------
// Upstream B: Yahoo quoteSummary — fundamentals only
// ------------------------------------------------------------

function yfSymbol(s) { return s.replace(/\./g, '-'); }

async function bootstrapCrumb() {
    if (_crumb && Date.now() - _crumb.ts < CRUMB_TTL_MS) return _crumb;
    const sess = await fetchWithTimeout('https://fc.yahoo.com', {
        headers: { 'User-Agent': UA, accept: 'text/html' }, redirect: 'manual',
    });
    const raw = typeof sess.headers.getSetCookie === 'function'
        ? sess.headers.getSetCookie()
        : [sess.headers.get('set-cookie')].filter(Boolean);
    const cookie = raw.map(function(c) { return String(c).split(';')[0]; }).filter(Boolean).join('; ');
    if (!cookie) throw new Error('Yahoo cookie handshake failed');
    const crumbRes = await fetchWithTimeout(YF + '/v1/test/getcrumb', {
        headers: { 'User-Agent': UA, Cookie: cookie, accept: 'text/plain' },
    });
    if (!crumbRes.ok) throw new Error('Yahoo crumb HTTP ' + crumbRes.status);
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length < 4) throw new Error('Yahoo crumb empty');
    _crumb = { crumb: crumb, cookie: cookie, ts: Date.now() };
    return _crumb;
}

async function yfSummary(symbol) {
    // Try both query hosts — Yahoo sometimes blocks one CDN but not the other
    var hosts = [YF, 'https://query1.finance.yahoo.com'];
    var lastErr = null;
    for (var hi = 0; hi < hosts.length; hi++) {
        try {
            const b = await bootstrapCrumb();
            const url = hosts[hi] + '/v10/finance/quoteSummary/' + encodeURIComponent(yfSymbol(symbol))
                + '?modules=' + SUMMARY_MODULES + '&crumb=' + encodeURIComponent(b.crumb);
            const r = await fetchWithTimeout(url, {
                headers: { 'User-Agent': UA, Cookie: b.cookie, accept: 'application/json' },
            });
            if (r.status === 429) { lastErr = new Error('Yahoo rate limit (summary)'); _crumb = null; continue; }
            if (!r.ok) { lastErr = new Error('Yahoo summary HTTP ' + r.status); _crumb = null; continue; }
            const j = await r.json();
            const err = j && j.quoteSummary && j.quoteSummary.error;
            if (err) { lastErr = new Error('Yahoo: ' + (err.description || err.code)); continue; }
            const result = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
            if (!result) { lastErr = new Error('Yahoo summary returned no result'); continue; }
            return result;
        } catch (e) { _crumb = null; lastErr = e; }
    }
    throw lastErr || new Error('Yahoo summary failed on all hosts');
}

function rawVal(x) {
    if (x == null) return null;
    if (typeof x === 'object') {
        if ('raw' in x) return x.raw;
        if (Object.keys(x).length === 0) return null;
    }
    return x;
}

function mapOverview(summary, symbol) {
    if (!summary) return { Symbol: symbol, Name: symbol };
    const price = summary.price || {};
    const profile = summary.summaryProfile || {};
    const detail = summary.summaryDetail || {};
    const fin = summary.financialData || {};
    const stats = summary.defaultKeyStatistics || {};
    const trend = summary.recommendationTrend && summary.recommendationTrend.trend;
    const rec = (trend && trend[0]) || null;

    const out = {
        Symbol: price.symbol || symbol,
        Name: price.longName || price.shortName || symbol,
        Description: profile.longBusinessSummary || '',
        Exchange: price.exchangeName || price.fullExchangeName || '',
        Currency: price.currency || 'USD',
        Sector: profile.sector || '',
        Industry: profile.industry || '',
    };
    const set = function(k, v) { if (v != null && isFinite(Number(v))) out[k] = String(v); };
    set('MarketCapitalization', rawVal(price.marketCap) != null ? rawVal(price.marketCap) : rawVal(detail.marketCap));
    set('PERatio',       rawVal(detail.trailingPE));
    set('PEGRatio',      rawVal(stats.pegRatio));
    set('Beta',          rawVal(detail.beta) != null ? rawVal(detail.beta) : rawVal(stats.beta));
    set('EPS',           rawVal(stats.trailingEps));
    set('DividendYield', rawVal(detail.dividendYield));
    set('AnalystTargetPrice', rawVal(fin.targetMeanPrice));
    if (rec) {
        set('AnalystRatingStrongBuy',  rec.strongBuy);
        set('AnalystRatingBuy',        rec.buy);
        set('AnalystRatingHold',       rec.hold);
        set('AnalystRatingSell',       rec.sell);
        set('AnalystRatingStrongSell', rec.strongSell);
    }
    return out;
}

function mapFinancials(summary) {
    if (!summary) return null;
    var rv = rawVal;
    var fd = summary.financialData || {};
    var stats = summary.defaultKeyStatistics || {};
    var earn = summary.earnings || {};

    // Snapshot: current-period financial metrics
    var snapshot = {};
    var ss = function(k, v) { if (v != null && isFinite(Number(v))) snapshot[k] = Number(v); };
    ss('totalRevenue',     rv(fd.totalRevenue));
    ss('grossProfits',     rv(fd.grossProfits));
    ss('ebitda',           rv(fd.ebitda));
    ss('operatingCashflow', rv(fd.operatingCashflow));
    ss('freeCashflow',     rv(fd.freeCashflow));
    ss('totalCash',        rv(fd.totalCash));
    ss('totalDebt',        rv(fd.totalDebt));
    ss('debtToEquity',     rv(fd.debtToEquity));
    ss('returnOnAssets',   rv(fd.returnOnAssets));
    ss('returnOnEquity',   rv(fd.returnOnEquity));
    ss('grossMargins',     rv(fd.grossMargins));
    ss('ebitdaMargins',    rv(fd.ebitdaMargins));
    ss('operatingMargins', rv(fd.operatingMargins));
    ss('profitMargins',    rv(fd.profitMargins));
    ss('revenueGrowth',    rv(fd.revenueGrowth));
    ss('earningsGrowth',   rv(fd.earningsGrowth));
    ss('netIncome',        rv(stats.netIncomeToCommon));
    ss('enterpriseValue',  rv(stats.enterpriseValue));
    ss('forwardPE',        rv(stats.forwardPE));
    ss('trailingEps',      rv(stats.trailingEps));
    ss('forwardEps',       rv(stats.forwardEps));
    ss('pegRatio',         rv(stats.pegRatio));
    ss('priceToBook',      rv(stats.priceToBook));
    ss('evToRevenue',      rv(stats.enterpriseToRevenue));
    ss('evToEbitda',       rv(stats.enterpriseToEbitda));
    ss('bookValue',        rv(stats.bookValue));

    // Yearly revenue + earnings (4 years from earnings module)
    var yearly = [];
    var fc = earn.financialsChart;
    if (fc && fc.yearly) {
        yearly = fc.yearly.map(function(r) {
            return { year: String(r.date), revenue: rv(r.revenue), earnings: rv(r.earnings) };
        }).filter(function(r) { return r.revenue != null || r.earnings != null; });
    }

    // Quarterly EPS actual vs estimate (4 quarters)
    var quarterly = [];
    var ec = earn.earningsChart;
    if (ec && ec.quarterly) {
        quarterly = ec.quarterly.map(function(r) {
            return { quarter: r.date, actual: rv(r.actual), estimate: rv(r.estimate) };
        }).filter(function(r) { return r.actual != null; });
    }

    if (!Object.keys(snapshot).length && !yearly.length) return null;
    return { snapshot: snapshot, yearly: yearly, quarterly: quarterly };
}

// ------------------------------------------------------------
// Upstream C: Finnhub — primary fundamentals source
// ------------------------------------------------------------
// Free tier: 60 req/min, no IP-banning on serverless.
// 4 calls per symbol, cached 24h → effectively unlimited.

async function finnhubGet(path) {
    var key = (process.env.FINNHUB_API_KEY || '').trim();
    if (!key) throw new Error('FINNHUB_API_KEY not configured');
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    var url = FINNHUB_BASE + path + sep + 'token=' + encodeURIComponent(key);
    var r = await fetchWithTimeout(url, {
        headers: { accept: 'application/json' },
    }, 12000);
    if (r.status === 401 || r.status === 403) throw new Error('Finnhub auth failed (check FINNHUB_API_KEY)');
    if (r.status === 429) throw new Error('Finnhub rate limit');
    if (!r.ok) throw new Error('Finnhub HTTP ' + r.status);
    return r.json();
}

async function finnhubFundamentals(symbol) {
    var sym = encodeURIComponent(symbol);
    var results = await Promise.allSettled([
        finnhubGet('/stock/profile2?symbol=' + sym),
        finnhubGet('/stock/metric?symbol=' + sym + '&metric=all'),
        finnhubGet('/stock/recommendation?symbol=' + sym),
        finnhubGet('/stock/earnings?symbol=' + sym),
    ]);
    var profile = results[0].status === 'fulfilled' ? results[0].value : {};
    if (!profile || !profile.ticker) {
        var reason = results[0].status === 'rejected' ? results[0].reason.message : 'empty profile';
        throw new Error('Finnhub profile failed for ' + symbol + ': ' + reason);
    }
    return {
        profile: profile,
        metrics: results[1].status === 'fulfilled' ? results[1].value : {},
        recs:    results[2].status === 'fulfilled' ? results[2].value : [],
        earnings: results[3].status === 'fulfilled' ? results[3].value : [],
    };
}

function mapFinnhubOverview(data, symbol) {
    var p = data.profile || {};
    var m = (data.metrics && data.metrics.metric) || {};
    var recs = data.recs;
    var rec = null;
    if (Array.isArray(recs) && recs.length) {
        recs.sort(function(a, b) { return a.period < b.period ? 1 : -1; });
        rec = recs[0];
    }

    var out = {
        Symbol: p.ticker || symbol,
        Name: p.name || symbol,
        Description: '',
        Exchange: p.exchange || '',
        Currency: p.currency || 'USD',
        Sector: p.finnhubIndustry || '',
        Industry: p.finnhubIndustry || '',
    };
    var set = function(k, v) { if (v != null && isFinite(Number(v))) out[k] = String(v); };
    set('MarketCapitalization', p.marketCapitalization ? p.marketCapitalization * 1e6 : null);
    set('PERatio', m.peBasicExclExtraTTM);
    set('PEGRatio', m.pegRatio);
    set('Beta', m.beta);
    set('EPS', m.epsBasicExclExtraItemsTTM);
    set('DividendYield', m.dividendYieldIndicatedAnnual != null ? m.dividendYieldIndicatedAnnual / 100 : null);
    set('AnalystTargetPrice', m.targetMedianPrice);
    if (rec) {
        set('AnalystRatingStrongBuy', rec.strongBuy);
        set('AnalystRatingBuy', rec.buy);
        set('AnalystRatingHold', rec.hold);
        set('AnalystRatingSell', rec.sell);
        set('AnalystRatingStrongSell', rec.strongSell);
    }
    return out;
}

function mapFinnhubFinancials(data) {
    var m = (data.metrics && data.metrics.metric) || {};
    var ser = (data.metrics && data.metrics.series) || {};
    var annual = ser.annual || {};
    var earn = data.earnings;
    var profile = data.profile || {};

    var shares = profile.shareOutstanding ? profile.shareOutstanding * 1e6 : null;
    var mktCap = profile.marketCapitalization ? profile.marketCapitalization * 1e6 : null;

    function latestVal(key) {
        var arr = annual[key];
        if (!Array.isArray(arr) || !arr.length) return null;
        arr.sort(function(a, b) { return a.period < b.period ? 1 : -1; });
        return arr[0].v;
    }

    function firstOf() {
        for (var i = 0; i < arguments.length; i++) {
            var v = arguments[i];
            if (v != null && isFinite(Number(v))) return Number(v);
        }
        return null;
    }

    var snapshot = {};
    var ss = function(k, v) { if (v != null && isFinite(Number(v))) snapshot[k] = Number(v); };

    ss('totalRevenue', firstOf(latestVal('revenue'), m.revenuePerShareTTM && shares ? m.revenuePerShareTTM * shares : null));
    ss('grossProfits', latestVal('grossProfit'));
    ss('ebitda', latestVal('ebitda'));
    ss('netIncome', latestVal('netIncome'));

    ss('freeCashflow', firstOf(
        latestVal('freeCashFlow'), latestVal('fcf'), latestVal('freeCashflow'),
        m.freeCashFlowTTM,
        m.fcfPerShareTTM && shares ? m.fcfPerShareTTM * shares : null,
        m.freeCashFlowPerShareTTM && shares ? m.freeCashFlowPerShareTTM * shares : null
    ));

    ss('operatingCashflow', firstOf(
        latestVal('cashFlowFromOperatingActivities'), latestVal('operatingCashFlow'),
        latestVal('operatingCashflow'), latestVal('cashFromOperations'),
        m.operatingCashFlowTTM,
        m.cashFlowPerShareTTM && shares ? m.cashFlowPerShareTTM * shares : null,
        m.cashFlowPerShareAnnual && shares ? m.cashFlowPerShareAnnual * shares : null
    ));

    ss('totalCash', firstOf(
        latestVal('cashAndShortTermInvestments'), latestVal('totalCash'),
        latestVal('cash'), latestVal('cashAndEquivalents'),
        m.totalCashPerShareQuarterly && shares ? m.totalCashPerShareQuarterly * shares : null,
        m.cashPerShareQuarterly && shares ? m.cashPerShareQuarterly * shares : null
    ));

    ss('totalDebt', firstOf(latestVal('totalDebt'), m.totalDebt));
    ss('debtToEquity', firstOf(m.totalDebtToEquityQuarterly, m.totalDebtToEquityAnnual));

    function mPct(key) { var v = m[key]; return v != null && isFinite(v) ? v / 100 : null; }
    ss('grossMargins', mPct('grossMarginTTM'));
    ss('operatingMargins', mPct('operatingMarginTTM'));
    ss('profitMargins', mPct('netProfitMarginTTM'));
    ss('ebitdaMargins', firstOf(
        mPct('ebitdaMarginTTM'),
        snapshot.ebitda && snapshot.totalRevenue ? snapshot.ebitda / snapshot.totalRevenue : null
    ));
    ss('returnOnEquity', mPct('roeTTM'));
    ss('returnOnAssets', mPct('roaTTM'));

    function mGrowth(key) { var v = m[key]; return v != null && isFinite(v) ? v / 100 : null; }
    ss('revenueGrowth', mGrowth('revenueGrowthTTMYoy'));
    ss('earningsGrowth', mGrowth('epsGrowthTTMYoy'));

    ss('trailingEps', m.epsBasicExclExtraItemsTTM);
    ss('forwardEps', firstOf(m.epsEstimateNextQuarter, m.epsEstimateNextYear));
    ss('priceToBook', firstOf(m.pbQuarterly, m.pbAnnual));
    ss('bookValue', firstOf(m.bookValuePerShareQuarterly, m.bookValuePerShareAnnual));

    ss('forwardPE', firstOf(
        m.peExclExtraAnnual, m.peNormalizedAnnual, m.peBasicExclExtraAnnual
    ));
    if (snapshot.forwardPE == null && snapshot.forwardEps && snapshot.forwardEps > 0 && mktCap && shares) {
        snapshot.forwardPE = (mktCap / shares) / snapshot.forwardEps;
    }

    ss('pegRatio', firstOf(m.pegRatio, m.pegAnnual));
    if (snapshot.pegRatio == null && snapshot.forwardPE && snapshot.earningsGrowth && snapshot.earningsGrowth > 0) {
        snapshot.pegRatio = snapshot.forwardPE / (snapshot.earningsGrowth * 100);
    }

    var evFromSeries = latestVal('ev');
    if (evFromSeries != null && evFromSeries < 1e6 && mktCap > 1e6) {
        evFromSeries = evFromSeries * 1e6;
    }
    ss('enterpriseValue', firstOf(m.enterpriseValue, evFromSeries));
    if (snapshot.enterpriseValue == null && mktCap) {
        snapshot.enterpriseValue = mktCap + (snapshot.totalDebt || 0) - (snapshot.totalCash || 0);
    }

    if (snapshot.enterpriseValue && snapshot.totalRevenue) {
        snapshot.evToRevenue = snapshot.enterpriseValue / snapshot.totalRevenue;
    }
    if (snapshot.enterpriseValue && snapshot.ebitda) {
        snapshot.evToEbitda = snapshot.enterpriseValue / snapshot.ebitda;
    }

    var yearly = [];
    var revArr = (annual.revenue || []).slice().sort(function(a, b) { return a.period < b.period ? 1 : -1; });
    var niArr = (annual.netIncome || []).slice().sort(function(a, b) { return a.period < b.period ? 1 : -1; });
    var years = Math.min(4, revArr.length);
    for (var yi = years - 1; yi >= 0; yi--) {
        var year = revArr[yi].period.slice(0, 4);
        var rev = revArr[yi].v;
        var ni = null;
        for (var nj = 0; nj < niArr.length; nj++) {
            if (niArr[nj].period.slice(0, 4) === year) { ni = niArr[nj].v; break; }
        }
        yearly.push({ year: year, revenue: rev, earnings: ni });
    }

    var quarterly = [];
    if (Array.isArray(earn) && earn.length) {
        var sorted = earn.slice().sort(function(a, b) {
            if (a.year !== b.year) return b.year - a.year;
            return b.quarter - a.quarter;
        });
        quarterly = sorted.slice(0, 4).reverse().map(function(e) {
            return { quarter: 'Q' + e.quarter + ' ' + e.year, actual: e.actual, estimate: e.estimate };
        }).filter(function(r) { return r.actual != null; });
    }

    if (!Object.keys(snapshot).length && !yearly.length) return null;
    return {
        snapshot: snapshot, yearly: yearly, quarterly: quarterly,
        _debugKeys: { metric: Object.keys(m).sort(), seriesAnnual: Object.keys(annual).sort() }
    };
}

// ------------------------------------------------------------
// Cached getters (read-through → in-mem → DB → upstream → write-back)
// ------------------------------------------------------------

async function getDaily(symbol) {
    const key = symbol + ':daily';
    const mem = memGet(key); if (mem) return { data: mem, cache: 'mem' };
    const db = await dbCacheGet(key);
    if (db) { memSet(key, db); return { data: db, cache: 'db' }; }
    const bars = await alpacaBars(symbol);
    if (!bars.length) throw new Error('No bars returned for ' + symbol);
    const data = mapAlpacaDaily(bars);
    memSet(key, data);
    dbCacheSet(key, symbol, 'daily', data, TTL_DAILY_MS);  // fire-and-forget
    return { data: data, cache: 'miss' };
}

async function getOverview(symbol, skipCache) {
    const key = symbol + ':overview';
    if (!skipCache) {
        const mem = memGet(key); if (mem) return { data: mem, cache: 'mem' };
        const db = await dbCacheGet(key);
        if (db) { memSet(key, db); return { data: db, cache: 'db' }; }
    }

    var data = null;
    var finnhubErr = null;

    // Primary: Finnhub (reliable on serverless, no IP-banning)
    if ((process.env.FINNHUB_API_KEY || '').trim()) {
        try {
            var fh = await finnhubFundamentals(symbol);
            data = { overview: mapFinnhubOverview(fh, symbol), financials: mapFinnhubFinancials(fh), _source: 'finnhub' };
        } catch (e) { finnhubErr = e; }
    }

    // Fallback: Yahoo quoteSummary
    if (!data) {
        try {
            var summary = await yfSummary(symbol);
            data = { overview: mapOverview(summary, symbol), financials: mapFinancials(summary), _source: 'yahoo' };
        } catch (yahooErr) {
            var msg = 'Fundamentals unavailable.';
            if (!process.env.FINNHUB_API_KEY) msg += ' FINNHUB_API_KEY not set.';
            else if (finnhubErr) msg += ' Finnhub: ' + finnhubErr.message + '.';
            msg += ' Yahoo: ' + yahooErr.message;
            throw new Error(msg);
        }
    }

    memSet(key, data);
    dbCacheSet(key, symbol, 'overview', data, TTL_OVERVIEW_MS);
    return { data: data, cache: 'miss' };
}

// ------------------------------------------------------------
// Handler
// ------------------------------------------------------------

module.exports = async function handler(req, res) {
    if (req.method === 'OPTIONS') { applyCors(res); return res.status(204).end(); }
    if (req.method !== 'GET')     { applyCors(res); return res.status(405).json({ error: 'GET only' }); }

    const symbol = String((req.query && req.query.symbol) || '').trim().toUpperCase();
    if (!symbol || !SYMBOL_RE.test(symbol)) {
        applyCors(res);
        return res.status(400).json({ error: 'Missing or malformed symbol' });
    }

    const endpoint = String((req.query && req.query.endpoint) || 'combined').toLowerCase();
    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
        applyCors(res);
        return res.status(400).json({ error: 'Unknown endpoint (expected: combined | overview | daily)' });
    }

    try {
        const payload = { symbol: symbol, cached_at: new Date().toISOString(), _v: 5 };
        const cacheHits = { overview: null, daily: null };
        var ovSource = 'unknown';
        var finnhubKeyPresent = !!(process.env.FINNHUB_API_KEY || '').trim();

        var skipCache = req.query && (req.query.nocache === '1' || req.query.nocache === 'true');
        if (endpoint === 'overview' || endpoint === 'combined') {
            try {
                const o = await getOverview(symbol, skipCache);
                var ovData = o.data;
                payload.overview = ovData.overview || ovData;
                payload.financials = ovData.financials || null;
                ovSource = ovData._source || 'unknown';
                cacheHits.overview = o.cache;
            } catch (e) {
                if (endpoint === 'overview') throw e;
                // Fundamentals failed (Finnhub + Yahoo) — fall back to Alpaca for company name
                var fallback = await alpacaAssetInfo(symbol);
                payload.overview = fallback || { Symbol: symbol, Name: symbol };
                payload.overview_error = e.message;
                payload.overview_source = fallback ? 'alpaca-fallback' : 'none';
            }
        }
        if (endpoint === 'daily' || endpoint === 'combined') {
            const d = await getDaily(symbol);
            payload.daily = d.data;
            cacheHits.daily = d.cache;
        }

        payload.source = { overview: ovSource, daily: 'alpaca', finnhub_key: finnhubKeyPresent };
        payload.cache_hits = cacheHits;

        applyCors(res);
        res.setHeader('x-cache', JSON.stringify(cacheHits));
        return res.status(200).json(payload);
    } catch (e) {
        applyCors(res);
        const msg = (e && e.message) ? e.message : String(e);
        const status = /rate limit/i.test(msg) ? 429
                     : /not found|no bars|HTTP 404/i.test(msg) ? 404
                     : 502;
        return res.status(status).json({ error: msg });
    }
};

function applyCors(res) {
    const origin = process.env.ATLAS_ALLOWED_ORIGIN;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
    }
}
