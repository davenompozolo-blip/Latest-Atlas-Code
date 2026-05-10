// api/screener-market.js
// Returns a curated universe of non-portfolio stocks for the Valuation Screener
// "Market" mode. Uses Alpha Vantage OVERVIEW + GLOBAL_QUOTE for data.
// Results are cached in equity_cache (endpoint='mkt_overview' / 'mkt_quote').
//
// Environment variables:
//   ALPHA_VANTAGE_API_KEY       — required for AV data fetches
//   SUPABASE_URL / ATLAS_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

const AV_BASE = 'https://www.alphavantage.co/query';
const OVERVIEW_TTL = 24 * 60 * 60 * 1000;   // 24 h
const QUOTE_TTL    =  1 * 60 * 60 * 1000;    //  1 h
const MAX_AV_CALLS = 4;                       // per request — stay within free-tier budget

// ─── Curated cross-sector universe (~110 well-known names) ───────────────────
const UNIVERSE = [
  // Technology
  { s: 'AAPL', sec: 'Technology' }, { s: 'MSFT', sec: 'Technology' },
  { s: 'NVDA', sec: 'Technology' }, { s: 'GOOGL', sec: 'Technology' },
  { s: 'META', sec: 'Technology' }, { s: 'AMD',  sec: 'Technology' },
  { s: 'INTC', sec: 'Technology' }, { s: 'ORCL', sec: 'Technology' },
  { s: 'CRM',  sec: 'Technology' }, { s: 'ADBE', sec: 'Technology' },
  { s: 'QCOM', sec: 'Technology' }, { s: 'AVGO', sec: 'Technology' },
  { s: 'TXN',  sec: 'Technology' }, { s: 'MU',   sec: 'Technology' },
  { s: 'SNOW', sec: 'Technology' },
  // Healthcare
  { s: 'JNJ',  sec: 'Healthcare' }, { s: 'UNH',  sec: 'Healthcare' },
  { s: 'PFE',  sec: 'Healthcare' }, { s: 'LLY',  sec: 'Healthcare' },
  { s: 'ABBV', sec: 'Healthcare' }, { s: 'MRK',  sec: 'Healthcare' },
  { s: 'TMO',  sec: 'Healthcare' }, { s: 'ABT',  sec: 'Healthcare' },
  { s: 'BMY',  sec: 'Healthcare' }, { s: 'AMGN', sec: 'Healthcare' },
  { s: 'GILD', sec: 'Healthcare' }, { s: 'ISRG', sec: 'Healthcare' },
  // Financials
  { s: 'JPM',  sec: 'Financials' }, { s: 'BAC',  sec: 'Financials' },
  { s: 'WFC',  sec: 'Financials' }, { s: 'GS',   sec: 'Financials' },
  { s: 'MS',   sec: 'Financials' }, { s: 'BLK',  sec: 'Financials' },
  { s: 'V',    sec: 'Financials' }, { s: 'MA',   sec: 'Financials' },
  { s: 'AXP',  sec: 'Financials' }, { s: 'SCHW', sec: 'Financials' },
  { s: 'ICE',  sec: 'Financials' }, { s: 'COF',  sec: 'Financials' },
  // Energy
  { s: 'XOM',  sec: 'Energy' },     { s: 'COP',  sec: 'Energy' },
  { s: 'EOG',  sec: 'Energy' },     { s: 'SLB',  sec: 'Energy' },
  { s: 'OXY',  sec: 'Energy' },     { s: 'MPC',  sec: 'Energy' },
  { s: 'PSX',  sec: 'Energy' },     { s: 'DVN',  sec: 'Energy' },
  // Industrials
  { s: 'CAT',  sec: 'Industrials' },{ s: 'DE',   sec: 'Industrials' },
  { s: 'HON',  sec: 'Industrials' },{ s: 'UPS',  sec: 'Industrials' },
  { s: 'RTX',  sec: 'Industrials' },{ s: 'LMT',  sec: 'Industrials' },
  { s: 'BA',   sec: 'Industrials' },{ s: 'GE',   sec: 'Industrials' },
  { s: 'EMR',  sec: 'Industrials' },{ s: 'ETN',  sec: 'Industrials' },
  // Consumer Discretionary
  { s: 'HD',   sec: 'Consumer Discretionary' },
  { s: 'NKE',  sec: 'Consumer Discretionary' },
  { s: 'MCD',  sec: 'Consumer Discretionary' },
  { s: 'SBUX', sec: 'Consumer Discretionary' },
  { s: 'TGT',  sec: 'Consumer Discretionary' },
  { s: 'LOW',  sec: 'Consumer Discretionary' },
  { s: 'BKNG', sec: 'Consumer Discretionary' },
  { s: 'CMG',  sec: 'Consumer Discretionary' },
  // Consumer Staples
  { s: 'WMT',  sec: 'Consumer Staples' },{ s: 'PG',   sec: 'Consumer Staples' },
  { s: 'KO',   sec: 'Consumer Staples' },{ s: 'PEP',  sec: 'Consumer Staples' },
  { s: 'COST', sec: 'Consumer Staples' },{ s: 'MDLZ', sec: 'Consumer Staples' },
  { s: 'CL',   sec: 'Consumer Staples' },{ s: 'KHC',  sec: 'Consumer Staples' },
  // Materials
  { s: 'LIN',  sec: 'Materials' },  { s: 'APD',  sec: 'Materials' },
  { s: 'SHW',  sec: 'Materials' },  { s: 'NEM',  sec: 'Materials' },
  { s: 'FCX',  sec: 'Materials' },  { s: 'DD',   sec: 'Materials' },
  // Real Estate
  { s: 'AMT',  sec: 'Real Estate' },{ s: 'PLD',  sec: 'Real Estate' },
  { s: 'CCI',  sec: 'Real Estate' },{ s: 'EQIX', sec: 'Real Estate' },
  { s: 'PSA',  sec: 'Real Estate' },
  // Utilities
  { s: 'NEE',  sec: 'Utilities' },  { s: 'DUK',  sec: 'Utilities' },
  { s: 'SO',   sec: 'Utilities' },  { s: 'D',    sec: 'Utilities' },
  { s: 'EXC',  sec: 'Utilities' },
  // Communication Services
  { s: 'VZ',   sec: 'Communication Services' },
  { s: 'T',    sec: 'Communication Services' },
  { s: 'CMCSA',sec: 'Communication Services' },
  { s: 'NFLX', sec: 'Communication Services' },
  { s: 'DIS',  sec: 'Communication Services' },
  { s: 'TMUS', sec: 'Communication Services' },
  { s: 'SPOT', sec: 'Communication Services' },
  { s: 'ROKU', sec: 'Communication Services' },
];

// ─── Supabase helpers ─────────────────────────────────────────────────────────
function supaCfg() {
  const url = process.env.SUPABASE_URL || process.env.ATLAS_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function fetchWithTimeout(url, opts, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms || 8000);
  try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
  finally { clearTimeout(t); }
}

// Batch-read from equity_cache for a list of symbols + endpoint
async function batchCacheGet(cfg, symbols, endpoint) {
  if (!cfg || !symbols.length) return {};
  try {
    const inList = symbols.map(s => '"' + s + '"').join(',');
    const url = cfg.url + '/rest/v1/equity_cache'
      + '?endpoint=eq.' + encodeURIComponent(endpoint)
      + '&symbol=in.(' + inList + ')'
      + '&select=symbol,payload,expires_at'
      + '&expires_at=gt.' + new Date().toISOString();
    const r = await fetchWithTimeout(url, {
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, accept: 'application/json' },
    }, 5000);
    if (!r.ok) return {};
    const rows = await r.json();
    const out = {};
    for (const row of (Array.isArray(rows) ? rows : [])) {
      out[row.symbol] = row.payload;
    }
    return out;
  } catch (_) { return {}; }
}

// Write one entry to equity_cache
async function cacheSet(cfg, symbol, endpoint, payload, ttlMs) {
  if (!cfg) return;
  try {
    const body = [{
      cache_key: endpoint + ':' + symbol,
      symbol,
      endpoint,
      payload,
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
    }, 5000);
  } catch (_) { /* non-fatal */ }
}

// Get current portfolio symbols to exclude from market universe
async function getPortfolioSymbols(cfg) {
  if (!cfg) return new Set();
  try {
    const url = cfg.url + '/rest/v1/rpc/get_latest_symbols';
    // Fallback: query positions + assets directly
    const r = await fetchWithTimeout(
      cfg.url + '/rest/v1/assets'
        + '?select=symbol'
        + '&id=in.(select asset_id from positions where quantity != 0)',
      {
        headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, accept: 'application/json' },
      }, 4000
    );
    if (!r.ok) return new Set();
    const rows = await r.json();
    return new Set((Array.isArray(rows) ? rows : []).map(r => r.symbol));
  } catch (_) { return new Set(); }
}

// Alternate portfolio symbols fetch via vw_screener symbols
async function getPortfolioSymbolsAlt(cfg) {
  if (!cfg) return new Set();
  try {
    const r = await fetchWithTimeout(
      cfg.url + '/rest/v1/vw_screener?select=symbol',
      {
        headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, accept: 'application/json' },
      }, 6000
    );
    if (!r.ok) return new Set();
    const rows = await r.json();
    return new Set((Array.isArray(rows) ? rows : []).map(r => r.symbol));
  } catch (_) { return new Set(); }
}

// ─── Alpha Vantage fetchers ───────────────────────────────────────────────────
async function avOverview(symbol, apiKey) {
  try {
    const r = await fetchWithTimeout(
      AV_BASE + '?function=OVERVIEW&symbol=' + encodeURIComponent(symbol) + '&apikey=' + apiKey,
      {}, 8000
    );
    if (!r.ok) return null;
    const j = await r.json();
    // AV returns {"Information": "..."} on rate limit / invalid key
    if (!j || j.Information || j.Note || !j.Symbol) return null;
    return j;
  } catch (_) { return null; }
}

async function avGlobalQuote(symbol, apiKey) {
  try {
    const r = await fetchWithTimeout(
      AV_BASE + '?function=GLOBAL_QUOTE&symbol=' + encodeURIComponent(symbol) + '&apikey=' + apiKey,
      {}, 8000
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || j.Information || j.Note) return null;
    const q = j['Global Quote'];
    if (!q || !q['05. price']) return null;
    return { price: parseFloat(q['05. price']), change_pct: q['10. change percent'] };
  } catch (_) { return null; }
}

// ─── Data formatting ──────────────────────────────────────────────────────────
function n(v) {
  const x = parseFloat(v);
  return isNaN(x) ? null : x;
}

function formatRow(candidate, ov, qt) {
  if (!ov && !qt) return null;
  const price = qt ? qt.price : null;
  const pe = n(ov && ov.PERatio);
  const evEbitda = n(ov && ov.EVToEBITDA);
  const pb = n(ov && ov.PriceToBookRatio);
  const divYield = n(ov && ov.DividendYield);           // decimal e.g. 0.015
  const roe = n(ov && ov.ReturnOnEquityTTM);            // decimal
  const revGrowth = n(ov && ov.RevenueGrowthYOY);       // decimal
  const marketCap = n(ov && ov.MarketCapitalization);
  const ma50 = n(ov && ov['50DayMovingAverage']);
  const ma200 = n(ov && ov['200DayMovingAverage']);
  const high52 = n(ov && ov['52WeekHigh']);
  const low52 = n(ov && ov['52WeekLow']);
  const analystTarget = n(ov && ov.AnalystTargetPrice);

  let priceRegime = null;
  if (price && ma50 && ma200) {
    priceRegime = (price > ma50 && ma50 > ma200) ? 'Uptrend'
                : (price < ma50 && ma50 < ma200) ? 'Downtrend'
                : 'Sideways';
  }

  let pct52w = null;
  if (price != null && high52 && low52 && high52 > low52) {
    pct52w = Math.round((price - low52) / (high52 - low52) * 1000) / 10;
  }

  // Drawdown proxy: % below 52w high
  let drawdownProxy = null;
  if (price != null && high52 && high52 > 0) {
    drawdownProxy = Math.round((price / high52 - 1) * 1000) / 10;
  }

  let mcapBucket = 'Small';
  if (marketCap >= 1e12) mcapBucket = 'Mega';
  else if (marketCap >= 1e11) mcapBucket = 'Large';
  else if (marketCap >= 1e10) mcapBucket = 'Mid';

  const styleTags = [];
  if (pe != null && evEbitda != null && pb != null
    && (pe < 16 || evEbitda < 9 || pb < 1.5)) styleTags.push('Value');
  else if ((pe != null && pe < 16) || (evEbitda != null && evEbitda < 9) || (pb != null && pb < 1.5))
    styleTags.push('Value');

  if ((revGrowth != null && revGrowth > 0.10) || (pct52w != null && pct52w > 70))
    styleTags.push('Growth');

  if (priceRegime === 'Uptrend' && pct52w != null && pct52w > 60)
    styleTags.push('Momentum');

  if ((roe != null && roe > 0.15)) styleTags.push('Quality');

  if (divYield != null && divYield > 0.015) styleTags.push('Dividend');

  if (drawdownProxy != null && drawdownProxy < -20) styleTags.push('Contrarian');

  return {
    symbol: candidate.s,
    name: (ov && ov.Name) || candidate.s,
    sector: (ov && ov.Sector) || candidate.sec || 'Other',
    industry: (ov && ov.Industry) || 'N/A',
    country: (ov && ov.Country) || 'US',
    exchange: (ov && ov.Exchange) || null,
    asset_class: 'equity',
    pe_ratio: pe != null ? Math.round(pe * 10) / 10 : null,
    ev_ebitda: evEbitda != null ? Math.round(evEbitda * 10) / 10 : null,
    pb_ratio: pb != null ? Math.round(pb * 100) / 100 : null,
    div_yield_pct: divYield != null ? Math.round(divYield * 10000) / 100 : 0,
    roe_pct: roe != null ? Math.round(roe * 1000) / 10 : null,
    revenue_growth_pct: revGrowth != null ? Math.round(revGrowth * 1000) / 10 : null,
    market_cap_bucket: mcapBucket,
    market_cap_raw: marketCap || null,
    analyst_target: analystTarget,
    next_earnings: null,
    current_price: price,
    rsi_14: null,
    ma_20: null,
    ma_50: ma50,
    ma_200: ma200,
    price_regime: priceRegime,
    vol_regime: null,
    zscore_20d: null,
    mean_reversion_signal: null,
    annualised_vol_20d: null,
    high_52w: high52,
    low_52w: low52,
    pct_52w_range: pct52w,
    atr_14: null,
    return_1d_pct: null,
    return_1w_pct: null,
    return_1m_pct: null,
    return_3m_pct: null,
    return_6m_pct: null,
    return_1y_pct: null,
    return_ytd_pct: null,
    current_drawdown_pct: drawdownProxy,
    style_tags: styleTags,
    analyst_upside_pct: (analystTarget && price && price > 0)
      ? Math.round((analystTarget - price) / price * 1000) / 10
      : null,
  };
}

// ─── CORS ────────────────────────────────────────────────────────────────────
function cors(res) {
  const origin = process.env.ATLAS_ALLOWED_ORIGIN;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'GET')    { cors(res); return res.status(405).json({ error: 'GET only' }); }
  cors(res);

  const apiKey = (process.env.ALPHA_VANTAGE_API_KEY || '').trim();
  const cfg = supaCfg();

  // 1. Get portfolio symbols to exclude (use vw_screener for reliability)
  const portfolioSymbols = await getPortfolioSymbolsAlt(cfg);

  // 2. Build candidate list — universe minus current portfolio holdings
  const candidates = UNIVERSE.filter(c => !portfolioSymbols.has(c.s));
  const symbols = candidates.map(c => c.s);

  // 3. Batch-read from cache
  const [ovCache, qtCache] = await Promise.all([
    batchCacheGet(cfg, symbols, 'mkt_overview'),
    batchCacheGet(cfg, symbols, 'mkt_quote'),
  ]);

  // 4. Identify what's missing and fetch from AV (rate-limited)
  let avCalls = 0;
  if (apiKey) {
    // Overview: fetch for symbols without cached overview (prioritise those also missing quote)
    const needOverview = candidates.filter(c => !ovCache[c.s]);
    for (const c of needOverview) {
      if (avCalls >= MAX_AV_CALLS) break;
      const data = await avOverview(c.s, apiKey);
      if (data) {
        ovCache[c.s] = data;
        await cacheSet(cfg, c.s, 'mkt_overview', data, OVERVIEW_TTL);
      }
      avCalls++;
    }
    // Quote: fetch for symbols that have overview but no fresh price
    const needQuote = candidates.filter(c => ovCache[c.s] && !qtCache[c.s]);
    for (const c of needQuote) {
      if (avCalls >= MAX_AV_CALLS) break;
      const qt = await avGlobalQuote(c.s, apiKey);
      if (qt) {
        qtCache[c.s] = qt;
        await cacheSet(cfg, c.s, 'mkt_quote', qt, QUOTE_TTL);
      }
      avCalls++;
    }
  }

  // 5. Format — include any row that has at least overview data
  const stocks = candidates
    .filter(c => ovCache[c.s] || qtCache[c.s])
    .map(c => formatRow(c, ovCache[c.s], qtCache[c.s]))
    .filter(Boolean);

  return res.status(200).json({
    stocks,
    total_universe: candidates.length,
    cached: stocks.length,
    av_calls: avCalls,
    has_av_key: !!apiKey,
  });
};
