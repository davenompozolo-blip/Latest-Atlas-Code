// Vercel Serverless Function: Yahoo Finance proxy for ATLAS Equity Research.
//
// We initially wired this against Alpha Vantage but the 25-request/day free
// tier is blown after analysing two or three tickers. Yahoo Finance (the same
// source yfinance uses) has no API key, no documented limit, and returns both
// fundamentals and daily price history in two calls.
//
// The proxy normalises the Yahoo payload into the exact Alpha-Vantage-shaped
// response the browser module (public/js/equity-research.js) already parses,
// so the frontend needs no changes when the data source pivots again later.
//
// Endpoints (query param `endpoint`):
//   combined  — chart + quoteSummary (default)
//   overview  — quoteSummary only
//   daily     — chart only
//
// Environment variables:
//   ATLAS_ALLOWED_ORIGIN   — optional CORS allow-list for local dev
//
// Notes on Yahoo's quirks:
//   • The /quoteSummary endpoint requires a "crumb" token + session cookie.
//     We run a one-time bootstrap against fc.yahoo.com and cache crumb+cookie
//     for 1 hour (per cold container).
//   • Yahoo sometimes rate-limits serverless IPs with 429s. We surface those
//     so the UI can back off.
//   • Chart endpoint does NOT need a crumb, so a pure price-history request
//     survives even if the crumb handshake fails.

const YF = 'https://query2.finance.yahoo.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 15 * 60 * 1000;
const CRUMB_TTL_MS = 60 * 60 * 1000;
const SYMBOL_RE = /^[A-Z0-9.\-^=]{1,14}$/;
const ALLOWED_ENDPOINTS = new Set(['combined', 'overview', 'daily']);
const SUMMARY_MODULES = 'summaryProfile,summaryDetail,financialData,defaultKeyStatistics,recommendationTrend,price';

const _dataCache = new Map();
let _crumbCache = null;

// Yahoo uses hyphens for class-share tickers (BRK-B, BF-B) where Bloomberg /
// Alpha Vantage / most humans use dots (BRK.B). Translate for the upstream
// call but keep the user-visible symbol as-typed in the cache key + response.
function yfSymbol(s) { return s.replace(/\./g, '-'); }

function cacheGet(key) {
  const e = _dataCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) { _dataCache.delete(key); return null; }
  return e.data;
}
function cacheSet(key, data) { _dataCache.set(key, { ts: Date.now(), data }); }

async function fetchWithTimeout(url, opts, ms) {
  const ac = new AbortController();
  const timer = setTimeout(function() { ac.abort(); }, ms || 8000);
  try {
    return await fetch(url, Object.assign({ signal: ac.signal }, opts || {}));
  } finally { clearTimeout(timer); }
}

async function bootstrapCrumb() {
  if (_crumbCache && Date.now() - _crumbCache.ts < CRUMB_TTL_MS) return _crumbCache;
  // Step 1: acquire a session cookie. fc.yahoo.com returns consent cookies.
  const sess = await fetchWithTimeout('https://fc.yahoo.com', {
    headers: { 'User-Agent': UA, accept: 'text/html' },
    redirect: 'manual',
  });
  const raw = typeof sess.headers.getSetCookie === 'function'
    ? sess.headers.getSetCookie()
    : [sess.headers.get('set-cookie')].filter(Boolean);
  const cookie = raw.map(function(c) { return String(c).split(';')[0]; }).filter(Boolean).join('; ');
  if (!cookie) throw new Error('Yahoo session cookie handshake failed');
  // Step 2: exchange cookie for a crumb
  const crumbRes = await fetchWithTimeout(YF + '/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie, accept: 'text/plain' },
  });
  if (!crumbRes.ok) throw new Error('Yahoo crumb request HTTP ' + crumbRes.status);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.length < 4) throw new Error('Yahoo crumb response empty');
  _crumbCache = { crumb, cookie, ts: Date.now() };
  return _crumbCache;
}

async function yfChart(symbol) {
  const url = YF + '/v8/finance/chart/' + encodeURIComponent(yfSymbol(symbol)) + '?range=2y&interval=1d&includePrePost=false';
  const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, accept: 'application/json' } });
  if (r.status === 429) throw new Error('Yahoo rate limit (chart): try again in a few seconds');
  if (r.status === 404) throw new Error('Symbol not found on Yahoo Finance: ' + symbol);
  if (!r.ok) throw new Error('Yahoo chart HTTP ' + r.status);
  const j = await r.json();
  const err = j && j.chart && j.chart.error;
  if (err) throw new Error('Yahoo: ' + (err.description || err.code || 'unknown error'));
  const result = j && j.chart && j.chart.result && j.chart.result[0];
  if (!result) throw new Error('Yahoo chart returned no result');
  return result;
}

async function yfSummary(symbol) {
  // Try with crumb; if that fails (serverless IPs sometimes get 401),
  // fall back to query1 which occasionally lets unauthenticated calls through.
  try {
    const { crumb, cookie } = await bootstrapCrumb();
    const url = YF + '/v10/finance/quoteSummary/' + encodeURIComponent(yfSymbol(symbol))
              + '?modules=' + SUMMARY_MODULES
              + '&crumb=' + encodeURIComponent(crumb);
    const r = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, Cookie: cookie, accept: 'application/json' } });
    if (r.status === 429) throw new Error('Yahoo rate limit (summary): try again in a few seconds');
    if (!r.ok) throw new Error('Yahoo summary HTTP ' + r.status);
    const j = await r.json();
    const err = j && j.quoteSummary && j.quoteSummary.error;
    if (err) throw new Error('Yahoo: ' + (err.description || err.code || 'unknown error'));
    const result = j && j.quoteSummary && j.quoteSummary.result && j.quoteSummary.result[0];
    if (!result) throw new Error('Yahoo summary returned no result');
    return result;
  } catch (e) {
    // Invalidate crumb cache on failure so the next call re-bootstraps
    _crumbCache = null;
    throw e;
  }
}

// ---------------------------------------------------------------
// Normalisation — map Yahoo shapes onto Alpha-Vantage-style keys so
// the frontend (which was written against AV) needs no changes.
// ---------------------------------------------------------------

function rawVal(x) {
  if (x == null) return null;
  if (typeof x === 'object' && 'raw' in x) return x.raw;
  return x;
}

function mapOverview(summary, symbol) {
  if (!summary) return null;
  const price = summary.price || {};
  const profile = summary.summaryProfile || {};
  const detail = summary.summaryDetail || {};
  const fin = summary.financialData || {};
  const stats = summary.defaultKeyStatistics || {};
  const trend = summary.recommendationTrend && summary.recommendationTrend.trend;
  const rec = (trend && trend[0]) || null;

  // Alpha-Vantage OVERVIEW shape. Numeric fields must be stringified because
  // parseOverview() on the frontend does Number(o[k]) on them.
  const out = {
    Symbol: price.symbol || symbol,
    Name: price.longName || price.shortName || symbol,
    Description: profile.longBusinessSummary || '',
    Exchange: price.exchangeName || price.fullExchangeName || '',
    Currency: price.currency || 'USD',
    Sector: profile.sector || '',
    Industry: profile.industry || '',
  };
  const set = function(key, v) { if (v != null && isFinite(Number(v))) out[key] = String(v); };
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

function mapDaily(chart) {
  const empty = { 'Time Series (Daily)': {} };
  if (!chart || !chart.timestamp || !chart.timestamp.length) return empty;
  const ts = chart.timestamp;
  const q = (chart.indicators && chart.indicators.quote && chart.indicators.quote[0]) || {};
  const closes = q.close || [];
  const opens = q.open || [];
  const highs = q.high || [];
  const lows = q.low || [];
  const vols = q.volume || [];
  const series = {};
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    if (close == null) continue;
    const iso = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    series[iso] = {
      '1. open':   String(opens[i] != null ? opens[i] : close),
      '2. high':   String(highs[i] != null ? highs[i] : close),
      '3. low':    String(lows[i] != null ? lows[i]  : close),
      '4. close':  String(close),
      '5. volume': String(vols[i] != null ? vols[i]  : 0),
    };
  }
  return { 'Time Series (Daily)': series };
}

// ---------------------------------------------------------------
// Handler
// ---------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { applyCors(res); return res.status(204).end(); }
  if (req.method !== 'GET')     { applyCors(res); return res.status(405).json({ error: 'GET only' }); }

  const rawSymbol = (req.query && req.query.symbol) || '';
  const symbol = String(rawSymbol).trim().toUpperCase();
  if (!symbol || !SYMBOL_RE.test(symbol)) {
    applyCors(res);
    return res.status(400).json({ error: 'Missing or malformed symbol' });
  }

  const endpoint = String((req.query && req.query.endpoint) || 'combined').toLowerCase();
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    applyCors(res);
    return res.status(400).json({ error: 'Unknown endpoint (expected: combined | overview | daily)' });
  }

  const cacheKey = symbol + ':' + endpoint;
  const cached = cacheGet(cacheKey);
  if (cached) { applyCors(res); res.setHeader('x-cache', 'HIT'); return res.status(200).json(cached); }

  try {
    const payload = { symbol, cached_at: new Date().toISOString(), source: 'yahoo-finance' };
    if (endpoint === 'overview') {
      const summary = await yfSummary(symbol);
      payload.overview = mapOverview(summary, symbol);
    } else if (endpoint === 'daily') {
      const chart = await yfChart(symbol);
      payload.daily = mapDaily(chart);
    } else {
      // Run in parallel — quoteSummary and chart are independent
      const [summaryResult, chartResult] = await Promise.allSettled([
        yfSummary(symbol),
        yfChart(symbol),
      ]);
      // Chart is the critical path (price history powers every metric tile)
      if (chartResult.status !== 'fulfilled') throw chartResult.reason;
      payload.daily = mapDaily(chartResult.value);
      // Summary is best-effort — if it fails (401/crumb issue), still return
      // a usable response with price history and log the error for debugging.
      if (summaryResult.status === 'fulfilled') {
        payload.overview = mapOverview(summaryResult.value, symbol);
      } else {
        payload.overview = { Symbol: symbol, Name: symbol };
        payload.overview_error = (summaryResult.reason && summaryResult.reason.message) || 'summary unavailable';
      }
    }
    cacheSet(cacheKey, payload);
    applyCors(res);
    res.setHeader('x-cache', 'MISS');
    return res.status(200).json(payload);
  } catch (e) {
    applyCors(res);
    const msg = (e && e.message) ? e.message : String(e);
    const status = /rate limit/i.test(msg) ? 429
                : /no data|not found|delisted|HTTP 404/i.test(msg) ? 404
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
