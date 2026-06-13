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
//   5. Added Yahoo v8/chart as price fallback when Alpaca 404s (international
//      tickers and OTC ADRs not in Alpaca's universe, e.g. ADS.DE, ADDYY).
//      Added Finnhub exchange-suffix mapping so ADS.DE→ADS.F etc.
//
// Response shape is unchanged — frontend (public/js/equity-research.js)
// keeps consuming Alpha-Vantage-keyed fields.
//
// Environment variables:
//   ALPACA_API_KEY, ALPACA_API_SECRET   — required for price path (US equities)
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
const SUMMARY_MODULES = 'summaryProfile,summaryDetail,financialData,defaultKeyStatistics,recommendationTrend,price,earnings,calendarEvents';
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
        // Split-adjusted closes — raw bars carry pre-split price levels for any
        // name that split inside the window, which silently inflated the saved
        // current_price (e.g. GOOGL reading ~2.2× its adjusted level). Dividends
        // are intentionally NOT adjusted so the quote stays a true price level.
        + '&adjustment=split'
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

// ------------------------------------------------------------
// Upstream A2: Yahoo v8/chart — price fallback for non-Alpaca symbols
// ------------------------------------------------------------
// Used when Alpaca returns 404 (international exchanges, unlisted OTC).
// No crumb/cookie needed for the chart endpoint.

async function yahooChart(symbol) {
    // Yahoo uses hyphens instead of dots: BRK.B → BRK-B, ADS.DE → ADS.DE (stays)
    const yfSym = yfSymbol(symbol);
    const url = YF + '/v8/finance/chart/' + encodeURIComponent(yfSym)
        + '?interval=1d&range=2y&includePrePost=false&events=div,split';
    const r = await fetchWithTimeout(url, {
        headers: { 'User-Agent': UA, accept: 'application/json' },
    }, 12000);
    if (!r.ok) throw new Error('Yahoo chart HTTP ' + r.status + ' for ' + yfSym);
    const j = await r.json();
    const result = j && j.chart && j.chart.result && j.chart.result[0];
    if (!result) {
        const err = j && j.chart && j.chart.error;
        throw new Error('Yahoo chart: ' + ((err && err.description) || 'no result for ' + yfSym));
    }
    return result;
}

function mapYahooChart(result) {
    const timestamps = result.timestamp || [];
    const quote = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
    const adjClose = result.indicators && result.indicators.adjclose && result.indicators.adjclose[0];
    const series = {};
    for (let i = 0; i < timestamps.length; i++) {
        const close = (adjClose && adjClose.adjclose && adjClose.adjclose[i] != null)
            ? adjClose.adjclose[i]
            : (quote.close && quote.close[i]);
        if (close == null || !isFinite(close)) continue;
        const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
        series[date] = {
            '1. open':   String(quote.open?.[i]   ?? close),
            '2. high':   String(quote.high?.[i]   ?? close),
            '3. low':    String(quote.low?.[i]    ?? close),
            '4. close':  String(close),
            '5. volume': String(quote.volume?.[i] ?? 0),
        };
    }
    return { 'Time Series (Daily)': series };
}

// ------------------------------------------------------------
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
    set('52WeekHigh',    rawVal(detail.fiftyTwoWeekHigh));
    set('52WeekLow',     rawVal(detail.fiftyTwoWeekLow));
    // Upcoming calendar — feeds vw_earnings_calendar (→ next_earnings_date on
    // the book) and the Nexus earnings panel. Yahoo gives {raw, fmt} dates.
    const cal = summary.calendarEvents || {};
    const toISO = d => (d && (d.fmt || (d.raw ? new Date(d.raw * 1000).toISOString().slice(0, 10) : null))) || null;
    const today = new Date().toISOString().slice(0, 10);
    const earnDates = ((cal.earnings && cal.earnings.earningsDate) || []).map(toISO).filter(Boolean);
    const nextEarn = earnDates.find(d => d >= today) || earnDates[0] || null;
    if (nextEarn) out.NextEarningsDate = nextEarn;
    const exDiv = toISO(cal.exDividendDate);
    if (exDiv) out.ExDividendDate = exDiv;
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
    var detail = summary.summaryDetail || {};

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

    // Fundamentals hydration extras (Yahoo path)
    ss('sharesOutstanding', rv(stats.sharesOutstanding));
    ss('dividendPerShare',  rv(detail.dividendRate)); // annual DPS from summaryDetail
    if (snapshot.operatingCashflow != null && snapshot.freeCashflow != null) {
        snapshot.capitalExpenditures = Math.abs(snapshot.operatingCashflow - snapshot.freeCashflow);
    }
    // interestExpense not in Yahoo quoteSummary modules — left null, approximated downstream

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

// Map Yahoo/common exchange suffixes → Finnhub's exchange codes.
// Finnhub uses its own exchange suffix scheme (e.g. .F for Xetra, not .DE).
// Returns an array of symbols to try in order.
function finnhubSymbolCandidates(symbol) {
    const candidates = [symbol];
    // Exchange suffix map: Yahoo format → Finnhub format
    const SUFFIX_MAP = {
        '.DE': '.F',    // Deutsche Börse / Xetra (Frankfurt)
        '.F':  '.F',    // already Finnhub format
        '.L':  '.L',    // London Stock Exchange
        '.PA': '.PA',   // Euronext Paris
        '.AS': '.AS',   // Euronext Amsterdam
        '.MI': '.MI',   // Borsa Italiana (Milan)
        '.MC': '.MC',   // Bolsa de Madrid
        '.HK': '.HK',   // Hong Kong
        '.T':  '.T',    // Tokyo
        '.AX': '.AX',   // ASX (Australia)
        '.TO': '.TO',   // TSX (Toronto)
        '.SZ': '.SZ',   // Shenzhen
        '.SS': '.SS',   // Shanghai
    };
    for (const [from, to] of Object.entries(SUFFIX_MAP)) {
        if (symbol.toUpperCase().endsWith(from.toUpperCase()) && from !== to) {
            const base = symbol.slice(0, symbol.length - from.length);
            candidates.push(base + to);
        }
    }
    // For .DE specifically also try the bare symbol (e.g. ADS) on Finnhub
    if (symbol.toUpperCase().endsWith('.DE')) {
        candidates.push(symbol.slice(0, symbol.length - 3));
    }
    return [...new Set(candidates)];
}

async function finnhubFundamentals(symbol) {
    // Try symbol candidates in order — stop at first one with a valid profile
    var candidates = finnhubSymbolCandidates(symbol);
    var lastErr = null;
    var profile, metrics, recs, earnings, rawPeers, reported;

    for (var ci = 0; ci < candidates.length; ci++) {
        var sym = encodeURIComponent(candidates[ci]);
        try {
            var results = await Promise.allSettled([
                finnhubGet('/stock/profile2?symbol=' + sym),
                finnhubGet('/stock/metric?symbol=' + sym + '&metric=all'),
                finnhubGet('/stock/recommendation?symbol=' + sym),
                finnhubGet('/stock/earnings?symbol=' + sym),
                finnhubGet('/stock/peers?symbol=' + sym),
                finnhubGet('/stock/financials-reported?symbol=' + sym + '&freq=annual'),
            ]);
            var p = results[0].status === 'fulfilled' ? results[0].value : {};
            if (p && p.ticker) {
                profile  = p;
                metrics  = results[1].status === 'fulfilled' ? results[1].value : {};
                recs     = results[2].status === 'fulfilled' ? results[2].value : [];
                earnings = results[3].status === 'fulfilled' ? results[3].value : [];
                rawPeers = results[4].status === 'fulfilled' ? results[4].value : [];
                reported = results[5].status === 'fulfilled' ? results[5].value : null;
                break;
            }
            lastErr = new Error('empty profile for ' + candidates[ci]);
        } catch (e) {
            lastErr = e;
        }
    }

    if (!profile) {
        throw new Error('Finnhub profile failed for ' + symbol + ' (tried: ' + candidates.join(', ') + '): ' + (lastErr && lastErr.message));
    }

    var peerTickers = Array.isArray(rawPeers) ? rawPeers.filter(function(p) { return p && p !== symbol; }).slice(0, 5) : [];
    var peers = await Promise.all(peerTickers.map(async function(sym) {
        try {
            var pm = await finnhubGet('/stock/metric?symbol=' + encodeURIComponent(sym) + '&metric=all');
            var met = (pm && pm.metric) || {};
            return {
                symbol: sym,
                evToEbitda: met.enterpriseValueEbitdaTTM || null,
                trailingPE: met.peNormalizedAnnual || met.peTTM || null,
                priceToFCF: null,
                returnOnEquity: met.roeTTM != null ? met.roeTTM / 100 : null,
                revenueGrowth: met.revenueGrowthTTMYoy != null ? met.revenueGrowthTTMYoy / 100 : null,
            };
        } catch (e) {
            return { symbol: sym };
        }
    }));
    return { profile: profile, metrics: metrics, recs: recs, earnings: earnings, peers: peers, reported: reported };
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

// Extracts absolute financial statement values from Finnhub's /financials-reported
// endpoint, which returns XBRL data from SEC 10-K filings.
// Returns a flat object of absolute values (in raw dollars, not $M).
function mapFinnhubReported(reported) {
    if (!reported || !Array.isArray(reported.data) || !reported.data.length) return {};
    // Most recent annual filing (quarter === 0 means annual)
    var annuals = reported.data.filter(function(d) { return d.quarter === 0 && d.report; });
    if (!annuals.length) {
        // Some filers use quarter = 4 for annual
        annuals = reported.data.filter(function(d) { return d.report; });
    }
    if (!annuals.length) return {};
    annuals.sort(function(a, b) { return a.year < b.year ? 1 : -1; });
    var latest = annuals[0];
    var report = latest.report;

    // Finnhub returns concept names either bare ("CashAndCashEquivalents…") or
    // namespace-prefixed ("us-gaap_CashAndCashEquivalents…"). Match on suffix so
    // both shapes resolve. Tags are tried in priority order; first hit wins.
    function concept(items, tags) {
        if (!Array.isArray(items)) return null;
        for (var t = 0; t < tags.length; t++) {
            var tag = tags[t];
            for (var i = 0; i < items.length; i++) {
                var v = items[i];
                var cName = String(v.concept || '');
                var match = cName === tag
                    || cName.split('_').pop() === tag
                    || cName.split(':').pop() === tag;
                if (match && v.value != null && isFinite(v.value) && Number(v.value) !== 0) {
                    return Number(v.value);
                }
            }
        }
        return null;
    }

    var bs = report.bs || [];
    var ic = report.ic || [];
    var cf = report.cf || [];

    var cash = concept(bs, [
        'CashAndCashEquivalentsAtCarryingValue',
        'CashCashEquivalentsAndShortTermInvestments',
        'CashAndCashEquivalentsPeriodIncreaseDecrease',
    ]);

    var ltDebt  = concept(bs, ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebtAndFinanceLeaseLiabilities']);
    var curDebt = concept(bs, ['DebtCurrent', 'ShortTermBorrowings', 'LongTermDebtCurrent', 'CurrentPortionOfLongTermDebt', 'NotesPayableCurrent', 'CommercialPaper']);
    var totalDebt = (ltDebt != null || curDebt != null) ? (ltDebt || 0) + (curDebt || 0) : null;

    var ocf = concept(cf, [
        'NetCashProvidedByUsedInOperatingActivities',
        'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ]);
    var capexRaw = concept(cf, [
        'PaymentsToAcquirePropertyPlantAndEquipment',
        'PaymentsForCapitalImprovements',
        'PurchasesOfPropertyAndEquipment',
    ]);
    var capex = capexRaw != null ? Math.abs(capexRaw) : null;
    var fcf = (ocf != null && capex != null) ? ocf - capex : null;

    var interest = concept(ic, ['InterestExpense', 'InterestAndDebtExpense', 'InterestExpenseDebt', 'InterestExpenseRelatedParty']);
    if (interest == null) interest = concept(cf, ['InterestPaidNet', 'InterestPaid']);
    if (interest != null) interest = Math.abs(interest);

    var revenue = concept(ic, [
        'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
        'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax',
        'SalesRevenueGoodsNet', 'RealEstateRevenueNet', 'NetRevenue',
        'TotalRevenues', 'TotalRevenuesAndOtherIncome',
    ]);
    var netIncome = concept(ic, ['NetIncomeLoss', 'NetIncome', 'ProfitLoss', 'NetIncomeLossAttributableToParent']);

    var out = {};
    if (cash     != null) out.totalCash        = cash;
    if (totalDebt!= null) out.totalDebt        = totalDebt;
    if (ocf      != null) out.operatingCashflow= ocf;
    if (capex    != null) out.capitalExpenditures = capex;
    if (fcf      != null) out.freeCashflow     = fcf;
    if (interest != null) out.interestExpense  = interest;
    if (revenue  != null) out.totalRevenue     = revenue;
    if (netIncome!= null) out.netIncome        = netIncome;
    out._fy   = latest.year;
    out._accn = latest.accessNumber || '';
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
    // Finnhub series.annual reports absolute financial values in USD millions.
    // Scale by 1e6 so snapshot values are in raw dollars (consistent with mktCap/shares).
    function latestValM(key) { var v = latestVal(key); return v != null ? v * 1e6 : null; }

    function firstOf() {
        for (var i = 0; i < arguments.length; i++) {
            var v = arguments[i];
            if (v != null && isFinite(Number(v))) return Number(v);
        }
        return null;
    }

    // Dynamic search: find first metric key containing substring (case-insensitive)
    var mKeys = Object.keys(m);
    function findM(pattern) {
        var lp = pattern.toLowerCase();
        for (var i = 0; i < mKeys.length; i++) {
            if (mKeys[i].toLowerCase().indexOf(lp) >= 0) {
                var v = m[mKeys[i]];
                if (v != null && isFinite(Number(v))) return Number(v);
            }
        }
        return null;
    }

    // Per-share metric × shares helper
    function perShare(pattern) {
        var ps = findM(pattern);
        return ps != null && shares ? ps * shares : null;
    }

    var snapshot = {};
    var ss = function(k, v) { if (v != null && isFinite(Number(v))) snapshot[k] = Number(v); };

    // --- Absolute financials: series.annual → per-share × shares → derivation ---

    ss('netIncome', firstOf(
        latestValM('netIncome'),
        perShare('netIncomePerShare'),
        m.epsBasicExclExtraItemsTTM && shares ? m.epsBasicExclExtraItemsTTM * shares : null
    ));

    ss('totalRevenue', firstOf(
        latestValM('revenue'),
        perShare('revenuePerShare'),
        perShare('salesPerShare'),
        snapshot.netIncome && m.netProfitMarginTTM && m.netProfitMarginTTM > 0
            ? snapshot.netIncome / (m.netProfitMarginTTM / 100) : null
    ));

    ss('grossProfits', firstOf(
        latestValM('grossProfit'),
        snapshot.totalRevenue && m.grossMarginTTM ? snapshot.totalRevenue * (m.grossMarginTTM / 100) : null
    ));

    ss('ebitda', firstOf(
        latestValM('ebitda'),
        perShare('ebitdaPerShare'),
        perShare('ebitPerShare')
    ));

    // freeCashflow: series.annual first, then per-share derivation.
    // Do NOT use findM('freeCashFlow') — it matches freeCashFlowPerShareAnnual,
    // returning a per-share value that gets treated as an absolute number.
    ss('freeCashflow', firstOf(
        latestValM('freeCashFlow'), latestValM('fcf'), latestValM('freeCashflow'),
        perShare('fcfPerShare'),
        perShare('freeCashFlowPerShare')
    ));

    ss('operatingCashflow', firstOf(
        latestValM('cashFlowFromOperatingActivities'), latestValM('operatingCashFlow'),
        latestValM('operatingCashflow'), latestValM('cashFromOperations'),
        perShare('cashFlowPerShare')
    ));

    // totalCash / totalDebt: series.annual then per-share. Do NOT use findM —
    // it matches ratio metrics (totalDebtToEquityAnnual, cashRatioAnnual, etc.)
    // which are dimensionless and far too small to be treated as $-absolute values.
    ss('totalCash', firstOf(
        latestValM('cashAndShortTermInvestments'), latestValM('totalCash'),
        latestValM('cash'), latestValM('cashAndEquivalents'),
        perShare('cashPerShare')
    ));

    ss('totalDebt', firstOf(
        latestValM('totalDebt'),
        latestValM('longTermDebt'),
        perShare('debtPerShare'),
        perShare('totalDebtPerShare'),
        perShare('longTermDebtPerShare')
    ));

    ss('debtToEquity', firstOf(m.totalDebtToEquityQuarterly, m.totalDebtToEquityAnnual, findM('debtToEquity')));

    // --- Margins (metric TTM → derived from absolutes) ---

    function mPct(key) { var v = m[key]; return v != null && isFinite(v) ? v / 100 : null; }

    ss('grossMargins', mPct('grossMarginTTM'));
    ss('operatingMargins', mPct('operatingMarginTTM'));
    ss('profitMargins', mPct('netProfitMarginTTM'));

    var ebitdaMarginRaw = firstOf(
        mPct('ebitdaMarginTTM'),
        findM('ebitdaMargin') != null ? findM('ebitdaMargin') / 100 : null,
        snapshot.ebitda && snapshot.totalRevenue ? snapshot.ebitda / snapshot.totalRevenue : null
    );
    ss('ebitdaMargins', ebitdaMarginRaw);

    // Derive EBITDA from margin if still null
    if (snapshot.ebitda == null && ebitdaMarginRaw && snapshot.totalRevenue) {
        snapshot.ebitda = snapshot.totalRevenue * ebitdaMarginRaw;
    }

    ss('returnOnEquity', mPct('roeTTM'));
    ss('returnOnAssets', mPct('roaTTM'));

    // --- Growth ---

    function mGrowth(key) { var v = m[key]; return v != null && isFinite(v) ? v / 100 : null; }
    ss('revenueGrowth', mGrowth('revenueGrowthTTMYoy'));
    ss('earningsGrowth', mGrowth('epsGrowthTTMYoy'));

    // --- Fundamentals hydration extras (used by assembleFundamentals) ---

    // CapEx derived as |CFO − FCF| — Finnhub's freeCashFlow ≈ CFO − CapEx
    if (snapshot.operatingCashflow != null && snapshot.freeCashflow != null) {
        snapshot.capitalExpenditures = Math.abs(snapshot.operatingCashflow - snapshot.freeCashflow);
    }
    // Shares outstanding (raw count) — needed alongside totalDebt/totalCash for per-share derivations
    if (shares != null) snapshot.sharesOutstanding = shares;
    // Dividend per share — prefer annual metric, fall through to per-share search
    ss('dividendPerShare', firstOf(
        m.dividendPerShareAnnual, m.dividendPerShareTTM,
        findM('dividendPerShare'), findM('lastDividend')
    ));
    // Interest expense — needed for accurate FCFF = FCFE + Int(1−t)
    ss('interestExpense', firstOf(
        latestValM('interestExpense'), latestValM('interestAndDebtExpense'),
        latestValM('totalInterestExpense'), findM('interestExpense')
    ));

    // --- Valuation multiples ---

    ss('trailingEps', m.epsBasicExclExtraItemsTTM);
    ss('forwardEps', firstOf(m.epsEstimateNextQuarter, m.epsEstimateNextYear, findM('epsEstimate')));
    ss('priceToBook', firstOf(m.pbQuarterly, m.pbAnnual, findM('pb')));
    ss('bookValue', firstOf(m.bookValuePerShareQuarterly, m.bookValuePerShareAnnual, findM('bookValue')));

    ss('forwardPE', firstOf(
        m.peExclExtraAnnual, m.peNormalizedAnnual, m.peBasicExclExtraAnnual, findM('peNormalized')
    ));
    if (snapshot.forwardPE == null && snapshot.forwardEps && snapshot.forwardEps > 0 && mktCap && shares) {
        snapshot.forwardPE = (mktCap / shares) / snapshot.forwardEps;
    }

    ss('pegRatio', firstOf(m.pegRatio, m.pegAnnual, findM('peg')));
    if (snapshot.pegRatio == null && snapshot.forwardPE && snapshot.earningsGrowth && snapshot.earningsGrowth > 0) {
        snapshot.pegRatio = snapshot.forwardPE / (snapshot.earningsGrowth * 100);
    }

    // --- Enterprise Value → EV/Revenue, EV/EBITDA ---

    // Finnhub metric.enterpriseValue and series.annual.ev are both in USD millions → scale by 1e6.
    var evRaw = firstOf(findM('enterpriseValue'), latestVal('ev'));
    var evDirect = evRaw != null ? evRaw * 1e6 : null;
    ss('enterpriseValue', evDirect);
    if (snapshot.enterpriseValue == null && mktCap) {
        snapshot.enterpriseValue = mktCap + (snapshot.totalDebt || 0) - (snapshot.totalCash || 0);
    }

    if (snapshot.enterpriseValue && snapshot.totalRevenue) {
        var evs = snapshot.enterpriseValue / snapshot.totalRevenue;
        // Sanity: EV/Sales outside 0.05–30 indicates a unit mismatch between EV and Revenue
        if (evs >= 0.05 && evs <= 30) snapshot.evToRevenue = evs;
    }
    if (snapshot.enterpriseValue && snapshot.ebitda) {
        var eve = snapshot.enterpriseValue / snapshot.ebitda;
        // Sanity: EV/EBITDA outside 1–100 indicates a unit mismatch between EV and EBITDA
        if (eve >= 1 && eve <= 100) snapshot.evToEbitda = eve;
    }

    // --- Supplement from financials-reported (XBRL 10-K) ---
    // Fills gaps where basicFinancials series.annual is absent. These are absolute
    // dollar values from SEC XBRL, so they take precedence over per-share derivations
    // but yield to values already resolved above (series.annual is more current).
    var rep = mapFinnhubReported(data.reported);
    if (snapshot.freeCashflow     == null && rep.freeCashflow      != null) snapshot.freeCashflow      = rep.freeCashflow;
    if (snapshot.operatingCashflow== null && rep.operatingCashflow != null) snapshot.operatingCashflow = rep.operatingCashflow;
    if (snapshot.totalCash        == null && rep.totalCash         != null) snapshot.totalCash         = rep.totalCash;
    if (snapshot.totalDebt        == null && rep.totalDebt         != null) snapshot.totalDebt         = rep.totalDebt;
    if (snapshot.interestExpense  == null && rep.interestExpense   != null) snapshot.interestExpense   = rep.interestExpense;
    if (snapshot.totalRevenue     == null && rep.totalRevenue      != null) snapshot.totalRevenue      = rep.totalRevenue;
    if (snapshot.netIncome        == null && rep.netIncome         != null) snapshot.netIncome         = rep.netIncome;
    if (snapshot.capitalExpenditures == null && rep.capitalExpenditures != null) snapshot.capitalExpenditures = rep.capitalExpenditures;
    // Re-derive FCF if we now have OCF + CapEx from reported but FCF was still null
    if (snapshot.freeCashflow == null && snapshot.operatingCashflow != null && snapshot.capitalExpenditures != null) {
        snapshot.freeCashflow = snapshot.operatingCashflow - snapshot.capitalExpenditures;
    }
    // Attach fiscal year metadata for provenance labels
    if (rep._fy) { snapshot._reportedFY = rep._fy; snapshot._reportedAccn = rep._accn || ''; }

    // --- Yearly & quarterly trends ---

    var yearly = [];
    var revArr = (annual.revenue || []).slice().sort(function(a, b) { return a.period < b.period ? 1 : -1; });
    var niArr = (annual.netIncome || []).slice().sort(function(a, b) { return a.period < b.period ? 1 : -1; });
    var years = Math.min(4, revArr.length);
    for (var yi = years - 1; yi >= 0; yi--) {
        var year = revArr[yi].period.slice(0, 4);
        var rev = revArr[yi].v != null ? revArr[yi].v * 1e6 : null;  // Finnhub series in $M → dollars
        var ni = null;
        for (var nj = 0; nj < niArr.length; nj++) {
            if (niArr[nj].period.slice(0, 4) === year) { ni = niArr[nj].v != null ? niArr[nj].v * 1e6 : null; break; }
        }
        yearly.push({ year: year, revenue: rev, earnings: ni });
    }
    // Enrich yearly entries with OCF for historical CAGR computation
    var ocfSeries = (annual.cashFlowFromOperatingActivities
        || annual.operatingCashFlow
        || annual.cashFlowFromOperations
        || []).slice().sort(function(a, b) { return a.period < b.period ? 1 : -1; });
    for (var oy = 0; oy < yearly.length; oy++) {
        for (var oi = 0; oi < ocfSeries.length; oi++) {
            if (ocfSeries[oi].period.slice(0, 4) === yearly[oy].year) {
                yearly[oy].ocf = ocfSeries[oi].v != null ? ocfSeries[oi].v * 1e6 : null;  // $M → dollars
                break;
            }
        }
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
        _debugKeys: {
            metric: mKeys.sort(),
            seriesAnnual: Object.keys(annual).sort(),
            reportedFY: snapshot._reportedFY || null,
            reportedFilled: Object.keys(rep).filter(function(k) { return k.charAt(0) !== '_'; }),
        }
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

    let data;

    // Primary: Alpaca (US-listed equities, low latency)
    try {
        const bars = await alpacaBars(symbol);
        if (!bars.length) throw new Error('No bars returned for ' + symbol);
        data = mapAlpacaDaily(bars);
    } catch (alpacaErr) {
        // Alpaca doesn't cover international exchanges or all OTC ADRs.
        // Fall back to Yahoo v8/chart which supports global symbols (ADS.DE, ADDYY, etc.)
        try {
            const result = await yahooChart(symbol);
            data = mapYahooChart(result);
            const dateCount = Object.keys(data['Time Series (Daily)']).length;
            if (dateCount === 0) throw new Error('Yahoo chart returned zero valid bars for ' + symbol);
        } catch (yahooErr) {
            throw new Error(
                'Price data unavailable for ' + symbol + '. ' +
                'Alpaca: ' + alpacaErr.message + '. Yahoo: ' + yahooErr.message
            );
        }
    }

    memSet(key, data);
    dbCacheSet(key, symbol, 'daily', data, TTL_DAILY_MS);
    return { data: data, cache: 'miss' };
}

async function getOverview(symbol, skipCache) {
    const key = symbol + ':overview';
    if (!skipCache) {
        const mem = memGet(key); if (mem) return { data: mem, cache: 'mem' };
        const db = await dbCacheGet(key);
        if (db) {
            // Skip stale cache entries that pre-date the financials-reported addition.
            // A fresh payload always has snapshot._reportedFY set for US stocks, or
            // the Finnhub reported fetch will have run (non-US returns {} from mapFinnhubReported).
            // We detect staleness by checking for the absence of this field when there IS
            // financials data — old payloads have snapshot but no _reportedFY.
            var snap = db.financials && db.financials.snapshot;
            var isStale = snap && snap._reportedFY == null && snap.totalRevenue != null;
            if (!isStale) { memSet(key, db); return { data: db, cache: 'db' }; }
        }
    }

    var data = null;
    var finnhubErr = null;

    // Primary: Finnhub (reliable on serverless, no IP-banning)
    if ((process.env.FINNHUB_API_KEY || '').trim()) {
        try {
            var fh = await finnhubFundamentals(symbol);
            data = { overview: mapFinnhubOverview(fh, symbol), financials: mapFinnhubFinancials(fh), peers: fh.peers || [], _source: 'finnhub' };
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

export default async function handler(req, res) {
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
        const payload = { symbol: symbol, cached_at: new Date().toISOString(), _v: 7 };
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
                payload.peers = ovData.peers || [];
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
