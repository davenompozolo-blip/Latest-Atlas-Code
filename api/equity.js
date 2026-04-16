// Vercel Serverless Function: Alpha Vantage proxy for ATLAS Equity Research
// (Module B — Phase 1).
//
// The Equity Research page (public/js/equity-research.js) GETs
// /api/equity?symbol=AAPL to receive { overview, daily } in a single
// round-trip. The Alpha Vantage API key stays server-side; the browser
// never sees ALPHA_VANTAGE_API_KEY.
//
// Endpoints (query param `endpoint`):
//   combined   — OVERVIEW + TIME_SERIES_DAILY (default)
//   overview   — OVERVIEW only
//   daily      — TIME_SERIES_DAILY only
//
// Environment variables (set in Vercel project settings):
//   ALPHA_VANTAGE_API_KEY    — required
//   ATLAS_ALLOWED_ORIGIN     — optional, CORS allow-list for local dev
//
// Response shape:
//   { symbol, overview?, daily?, cached_at }
//
// Notes on Alpha Vantage free tier:
//   • 25 requests/day, 5/minute. We cache aggressively (15 min in-memory)
//     and coalesce overview+daily into one browser call.
//   • TIME_SERIES_DAILY is free; TIME_SERIES_DAILY_ADJUSTED is premium.
//     We use the free endpoint and derive returns from raw closes.

const AV_BASE = 'https://www.alphavantage.co/query';
const CACHE_TTL_MS = 15 * 60 * 1000;
const ALLOWED_ENDPOINTS = new Set(['combined', 'overview', 'daily']);
const SYMBOL_RE = /^[A-Z0-9.\-]{1,12}$/;

// Per-instance cache. Vercel recycles Lambdas so this is best-effort — it
// dampens bursts but does not replace a durable cache layer.
const _cache = new Map();

function cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return e.data;
}
function cacheSet(key, data) { _cache.set(key, { ts: Date.now(), data }); }

async function fetchAV(params, apiKey) {
  const url = new URL(AV_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', apiKey);
  const r = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('Alpha Vantage HTTP ' + r.status + ' ' + r.statusText);
  const j = await r.json();
  // Alpha Vantage surfaces errors as structured fields rather than HTTP status
  if (j['Error Message']) throw new Error('Alpha Vantage: ' + j['Error Message']);
  if (j['Note']) throw new Error('Alpha Vantage rate limit: ' + j['Note']);
  if (j['Information']) throw new Error('Alpha Vantage: ' + j['Information']);
  return j;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    applyCors(res);
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    applyCors(res);
    return res.status(405).json({ error: 'GET only' });
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    applyCors(res);
    return res.status(500).json({ error: 'ALPHA_VANTAGE_API_KEY not configured on server' });
  }

  const rawSymbol = (req.query && req.query.symbol) || '';
  const symbol = String(rawSymbol).trim().toUpperCase();
  if (!symbol || !SYMBOL_RE.test(symbol)) {
    applyCors(res);
    return res.status(400).json({ error: 'Missing or malformed symbol (A-Z, 0-9, . -; max 12)' });
  }

  const endpoint = String((req.query && req.query.endpoint) || 'combined').toLowerCase();
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    applyCors(res);
    return res.status(400).json({ error: 'Unknown endpoint (expected: combined | overview | daily)' });
  }

  const cacheKey = symbol + ':' + endpoint;
  const cached = cacheGet(cacheKey);
  if (cached) {
    applyCors(res);
    res.setHeader('x-cache', 'HIT');
    return res.status(200).json(cached);
  }

  try {
    let payload = { symbol, cached_at: new Date().toISOString() };
    if (endpoint === 'overview') {
      payload.overview = await fetchAV({ function: 'OVERVIEW', symbol }, apiKey);
    } else if (endpoint === 'daily') {
      payload.daily = await fetchAV({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'full' }, apiKey);
    } else {
      const [overview, daily] = await Promise.all([
        fetchAV({ function: 'OVERVIEW', symbol }, apiKey),
        fetchAV({ function: 'TIME_SERIES_DAILY', symbol, outputsize: 'full' }, apiKey),
      ]);
      // OVERVIEW returns `{}` for unknown tickers — surface as 404 rather than
      // letting the UI render a shell of undefineds.
      if (!overview || !overview.Symbol) {
        applyCors(res);
        return res.status(404).json({ error: 'Symbol not found on Alpha Vantage: ' + symbol });
      }
      payload.overview = overview;
      payload.daily = daily;
    }
    cacheSet(cacheKey, payload);
    applyCors(res);
    res.setHeader('x-cache', 'MISS');
    return res.status(200).json(payload);
  } catch (e) {
    applyCors(res);
    const msg = (e && e.message) ? e.message : String(e);
    // Rate-limit errors come back as 429 so the UI can retry/backoff
    const status = /rate limit/i.test(msg) ? 429 : 502;
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
