// api/screener-market.js
// Returns a curated universe of non-portfolio stocks for the Valuation Screener
// "Market" mode. Fetches from Alpha Vantage OVERVIEW + GLOBAL_QUOTE.
//
// Design principle: ALL universe candidates are always returned.
// Stocks without AV data show with sector/name from the curated list and "—"
// for metrics. AV data enriches the rows progressively (up to 20 per request).
//
// Environment variables:
//   ALPHA_VANTAGE_API_KEY
//   SUPABASE_URL / ATLAS_SUPABASE_URL  (optional — for caching)
//   SUPABASE_SERVICE_ROLE_KEY          (optional — for caching)

const AV_BASE      = 'https://www.alphavantage.co/query';
const OVERVIEW_TTL = 24 * 60 * 60 * 1000;
const QUOTE_TTL    =  1 * 60 * 60 * 1000;
const MAX_AV_CALLS = 20;  // raised — free tier still rate-limits but paid tier benefits

// ─── Curated cross-sector universe ───────────────────────────────────────────
// Each entry: s=symbol, n=name, sec=sector, mc=approx market_cap_bucket
const UNIVERSE = [
  // Technology
  { s:'AAPL',  n:'Apple Inc',                  sec:'Technology',             mc:'Mega'  },
  { s:'MSFT',  n:'Microsoft Corporation',       sec:'Technology',             mc:'Mega'  },
  { s:'NVDA',  n:'NVIDIA Corporation',          sec:'Technology',             mc:'Mega'  },
  { s:'GOOGL', n:'Alphabet Inc',                sec:'Technology',             mc:'Mega'  },
  { s:'META',  n:'Meta Platforms Inc',          sec:'Technology',             mc:'Mega'  },
  { s:'AMD',   n:'Advanced Micro Devices',      sec:'Technology',             mc:'Large' },
  { s:'INTC',  n:'Intel Corporation',           sec:'Technology',             mc:'Large' },
  { s:'ORCL',  n:'Oracle Corporation',          sec:'Technology',             mc:'Large' },
  { s:'CRM',   n:'Salesforce Inc',              sec:'Technology',             mc:'Large' },
  { s:'ADBE',  n:'Adobe Inc',                   sec:'Technology',             mc:'Large' },
  { s:'QCOM',  n:'Qualcomm Inc',                sec:'Technology',             mc:'Large' },
  { s:'AVGO',  n:'Broadcom Inc',                sec:'Technology',             mc:'Mega'  },
  { s:'TXN',   n:'Texas Instruments',           sec:'Technology',             mc:'Large' },
  { s:'MU',    n:'Micron Technology',           sec:'Technology',             mc:'Large' },
  { s:'SNOW',  n:'Snowflake Inc',               sec:'Technology',             mc:'Mid'   },
  // Healthcare
  { s:'JNJ',   n:'Johnson & Johnson',           sec:'Healthcare',             mc:'Mega'  },
  { s:'UNH',   n:'UnitedHealth Group',          sec:'Healthcare',             mc:'Mega'  },
  { s:'PFE',   n:'Pfizer Inc',                  sec:'Healthcare',             mc:'Large' },
  { s:'LLY',   n:'Eli Lilly and Company',       sec:'Healthcare',             mc:'Mega'  },
  { s:'ABBV',  n:'AbbVie Inc',                  sec:'Healthcare',             mc:'Large' },
  { s:'MRK',   n:'Merck & Co Inc',              sec:'Healthcare',             mc:'Large' },
  { s:'TMO',   n:'Thermo Fisher Scientific',    sec:'Healthcare',             mc:'Large' },
  { s:'ABT',   n:'Abbott Laboratories',         sec:'Healthcare',             mc:'Large' },
  { s:'BMY',   n:'Bristol-Myers Squibb',        sec:'Healthcare',             mc:'Large' },
  { s:'AMGN',  n:'Amgen Inc',                   sec:'Healthcare',             mc:'Large' },
  { s:'GILD',  n:'Gilead Sciences',             sec:'Healthcare',             mc:'Large' },
  { s:'ISRG',  n:'Intuitive Surgical',          sec:'Healthcare',             mc:'Large' },
  // Financials
  { s:'JPM',   n:'JPMorgan Chase & Co',         sec:'Financials',             mc:'Mega'  },
  { s:'BAC',   n:'Bank of America',             sec:'Financials',             mc:'Large' },
  { s:'WFC',   n:'Wells Fargo & Co',            sec:'Financials',             mc:'Large' },
  { s:'GS',    n:'Goldman Sachs Group',         sec:'Financials',             mc:'Large' },
  { s:'MS',    n:'Morgan Stanley',              sec:'Financials',             mc:'Large' },
  { s:'BLK',   n:'BlackRock Inc',               sec:'Financials',             mc:'Large' },
  { s:'V',     n:'Visa Inc',                    sec:'Financials',             mc:'Mega'  },
  { s:'MA',    n:'Mastercard Inc',              sec:'Financials',             mc:'Mega'  },
  { s:'AXP',   n:'American Express Co',         sec:'Financials',             mc:'Large' },
  { s:'SCHW',  n:'Charles Schwab Corp',         sec:'Financials',             mc:'Large' },
  { s:'ICE',   n:'Intercontinental Exchange',   sec:'Financials',             mc:'Large' },
  { s:'COF',   n:'Capital One Financial',       sec:'Financials',             mc:'Large' },
  // Energy
  { s:'XOM',   n:'Exxon Mobil Corporation',     sec:'Energy',                 mc:'Mega'  },
  { s:'COP',   n:'ConocoPhillips',              sec:'Energy',                 mc:'Large' },
  { s:'EOG',   n:'EOG Resources',               sec:'Energy',                 mc:'Large' },
  { s:'SLB',   n:'SLB (Schlumberger)',           sec:'Energy',                 mc:'Large' },
  { s:'OXY',   n:'Occidental Petroleum',        sec:'Energy',                 mc:'Large' },
  { s:'MPC',   n:'Marathon Petroleum',          sec:'Energy',                 mc:'Large' },
  { s:'PSX',   n:'Phillips 66',                 sec:'Energy',                 mc:'Large' },
  { s:'DVN',   n:'Devon Energy',                sec:'Energy',                 mc:'Mid'   },
  // Industrials
  { s:'CAT',   n:'Caterpillar Inc',             sec:'Industrials',            mc:'Large' },
  { s:'DE',    n:'Deere & Company',             sec:'Industrials',            mc:'Large' },
  { s:'HON',   n:'Honeywell International',     sec:'Industrials',            mc:'Large' },
  { s:'UPS',   n:'United Parcel Service',       sec:'Industrials',            mc:'Large' },
  { s:'RTX',   n:'RTX Corporation',             sec:'Industrials',            mc:'Large' },
  { s:'LMT',   n:'Lockheed Martin',             sec:'Industrials',            mc:'Large' },
  { s:'BA',    n:'Boeing Company',              sec:'Industrials',            mc:'Large' },
  { s:'GE',    n:'GE Aerospace',                sec:'Industrials',            mc:'Large' },
  { s:'EMR',   n:'Emerson Electric',            sec:'Industrials',            mc:'Large' },
  { s:'ETN',   n:'Eaton Corporation',           sec:'Industrials',            mc:'Large' },
  // Consumer Discretionary
  { s:'HD',    n:'Home Depot Inc',              sec:'Consumer Discretionary', mc:'Large' },
  { s:'NKE',   n:'Nike Inc',                    sec:'Consumer Discretionary', mc:'Large' },
  { s:'MCD',   n:"McDonald's Corporation",      sec:'Consumer Discretionary', mc:'Large' },
  { s:'SBUX',  n:'Starbucks Corporation',       sec:'Consumer Discretionary', mc:'Large' },
  { s:'TGT',   n:'Target Corporation',          sec:'Consumer Discretionary', mc:'Large' },
  { s:'LOW',   n:"Lowe's Companies",            sec:'Consumer Discretionary', mc:'Large' },
  { s:'BKNG',  n:'Booking Holdings',            sec:'Consumer Discretionary', mc:'Large' },
  { s:'CMG',   n:"Chipotle Mexican Grill",      sec:'Consumer Discretionary', mc:'Large' },
  // Consumer Staples
  { s:'WMT',   n:'Walmart Inc',                 sec:'Consumer Staples',       mc:'Mega'  },
  { s:'PG',    n:'Procter & Gamble',            sec:'Consumer Staples',       mc:'Mega'  },
  { s:'KO',    n:'Coca-Cola Company',           sec:'Consumer Staples',       mc:'Large' },
  { s:'PEP',   n:'PepsiCo Inc',                 sec:'Consumer Staples',       mc:'Large' },
  { s:'COST',  n:'Costco Wholesale',            sec:'Consumer Staples',       mc:'Mega'  },
  { s:'MDLZ',  n:'Mondelez International',      sec:'Consumer Staples',       mc:'Large' },
  { s:'CL',    n:'Colgate-Palmolive',           sec:'Consumer Staples',       mc:'Large' },
  { s:'KHC',   n:'Kraft Heinz Company',         sec:'Consumer Staples',       mc:'Large' },
  // Materials
  { s:'LIN',   n:'Linde plc',                   sec:'Materials',              mc:'Mega'  },
  { s:'APD',   n:'Air Products & Chemicals',    sec:'Materials',              mc:'Large' },
  { s:'SHW',   n:'Sherwin-Williams',            sec:'Materials',              mc:'Large' },
  { s:'NEM',   n:'Newmont Corporation',         sec:'Materials',              mc:'Large' },
  { s:'FCX',   n:'Freeport-McMoRan',            sec:'Materials',              mc:'Large' },
  { s:'DD',    n:'DuPont de Nemours',           sec:'Materials',              mc:'Mid'   },
  // Real Estate
  { s:'AMT',   n:'American Tower',             sec:'Real Estate',            mc:'Large' },
  { s:'PLD',   n:'Prologis Inc',               sec:'Real Estate',            mc:'Large' },
  { s:'CCI',   n:'Crown Castle Inc',           sec:'Real Estate',            mc:'Large' },
  { s:'EQIX',  n:'Equinix Inc',               sec:'Real Estate',            mc:'Large' },
  { s:'PSA',   n:'Public Storage',            sec:'Real Estate',            mc:'Large' },
  // Utilities
  { s:'NEE',   n:'NextEra Energy',             sec:'Utilities',              mc:'Large' },
  { s:'DUK',   n:'Duke Energy',               sec:'Utilities',              mc:'Large' },
  { s:'SO',    n:'Southern Company',          sec:'Utilities',              mc:'Large' },
  { s:'D',     n:'Dominion Energy',           sec:'Utilities',              mc:'Large' },
  { s:'EXC',   n:'Exelon Corporation',        sec:'Utilities',              mc:'Large' },
  // Communication Services
  { s:'VZ',    n:'Verizon Communications',     sec:'Communication Services', mc:'Large' },
  { s:'T',     n:'AT&T Inc',                  sec:'Communication Services', mc:'Large' },
  { s:'CMCSA', n:'Comcast Corporation',        sec:'Communication Services', mc:'Large' },
  { s:'NFLX',  n:'Netflix Inc',               sec:'Communication Services', mc:'Large' },
  { s:'DIS',   n:'Walt Disney Company',       sec:'Communication Services', mc:'Large' },
  { s:'TMUS',  n:'T-Mobile US',               sec:'Communication Services', mc:'Large' },
  { s:'SPOT',  n:'Spotify Technology',        sec:'Communication Services', mc:'Mid'   },
  { s:'ROKU',  n:'Roku Inc',                  sec:'Communication Services', mc:'Mid'   },
];

// ─── Supabase helpers (optional — caching degrades gracefully if unavailable) ─
function supaCfg() {
  const url = process.env.SUPABASE_URL || process.env.ATLAS_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

async function ft(url, opts, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms || 8000);
  try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
  finally { clearTimeout(t); }
}

async function batchCacheGet(cfg, symbols, endpoint) {
  if (!cfg || !symbols.length) return {};
  try {
    const inList = symbols.map(s => '"' + s + '"').join(',');
    const r = await ft(
      cfg.url + '/rest/v1/equity_cache'
        + '?endpoint=eq.' + encodeURIComponent(endpoint)
        + '&symbol=in.(' + inList + ')'
        + '&select=symbol,payload,expires_at'
        + '&expires_at=gt.' + new Date().toISOString(),
      { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, accept: 'application/json' } },
      6000
    );
    if (!r.ok) return {};
    const rows = await r.json();
    const out = {};
    for (const row of (Array.isArray(rows) ? rows : [])) out[row.symbol] = row.payload;
    return out;
  } catch (_) { return {}; }
}

async function cacheSet(cfg, symbol, endpoint, payload, ttlMs) {
  if (!cfg) return;
  try {
    await ft(cfg.url + '/rest/v1/equity_cache', {
      method: 'POST',
      headers: {
        apikey: cfg.key, Authorization: 'Bearer ' + cfg.key,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{
        cache_key: endpoint + ':' + symbol,
        symbol, endpoint, payload,
        cached_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      }]),
    }, 5000);
  } catch (_) { /* non-fatal */ }
}

async function getPortfolioSymbols(cfg) {
  if (!cfg) return new Set();
  try {
    const r = await ft(
      cfg.url + '/rest/v1/vw_screener?select=symbol',
      { headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, accept: 'application/json' } },
      8000
    );
    if (!r.ok) return new Set();
    const rows = await r.json();
    return new Set((Array.isArray(rows) ? rows : []).map(r => r.symbol));
  } catch (_) { return new Set(); }
}

// ─── Alpha Vantage ────────────────────────────────────────────────────────────
async function avOverview(symbol, apiKey) {
  try {
    const r = await ft(
      AV_BASE + '?function=OVERVIEW&symbol=' + encodeURIComponent(symbol) + '&apikey=' + apiKey,
      {}, 10000
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || j.Information || j.Note || !j.Symbol) return null;
    return j;
  } catch (_) { return null; }
}

async function avGlobalQuote(symbol, apiKey) {
  try {
    const r = await ft(
      AV_BASE + '?function=GLOBAL_QUOTE&symbol=' + encodeURIComponent(symbol) + '&apikey=' + apiKey,
      {}, 10000
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || j.Information || j.Note) return null;
    const q = j['Global Quote'];
    if (!q || !q['05. price']) return null;
    return { price: parseFloat(q['05. price']) };
  } catch (_) { return null; }
}

// ─── Row formatter ────────────────────────────────────────────────────────────
function p(v) { const x = parseFloat(v); return isNaN(x) ? null : x; }

function formatRow(candidate, ov, qt) {
  const price = qt ? qt.price : null;
  const pe       = p(ov && ov.PERatio);
  const evEbitda = p(ov && ov.EVToEBITDA);
  const pb       = p(ov && ov.PriceToBookRatio);
  const divYield = p(ov && ov.DividendYield);
  const roe      = p(ov && ov.ReturnOnEquityTTM);
  const revGrowth= p(ov && ov.RevenueGrowthYOY);
  const mktCap   = p(ov && ov.MarketCapitalization);
  const ma50     = p(ov && ov['50DayMovingAverage']);
  const ma200    = p(ov && ov['200DayMovingAverage']);
  const high52   = p(ov && ov['52WeekHigh']);
  const low52    = p(ov && ov['52WeekLow']);
  const analystT = p(ov && ov.AnalystTargetPrice);

  let priceRegime = null;
  if (price && ma50 && ma200) {
    priceRegime = (price > ma50 && ma50 > ma200) ? 'Uptrend'
                : (price < ma50 && ma50 < ma200) ? 'Downtrend'
                : 'Sideways';
  }

  let pct52w = null;
  if (price != null && high52 && low52 && high52 > low52)
    pct52w = Math.round((price - low52) / (high52 - low52) * 1000) / 10;

  // Drawdown proxy: % below 52-week high
  let ddProxy = null;
  if (price != null && high52 && high52 > 0)
    ddProxy = Math.round((price / high52 - 1) * 1000) / 10;

  // Market cap bucket: use AV data if available, else fall back to curated hint
  let mcapBucket = candidate.mc || 'Large';
  if (mktCap != null) {
    if      (mktCap >= 1e12) mcapBucket = 'Mega';
    else if (mktCap >= 1e11) mcapBucket = 'Large';
    else if (mktCap >= 1e10) mcapBucket = 'Mid';
    else                      mcapBucket = 'Small';
  }

  // Style tags — computed from whatever data is available
  const tags = [];
  if ((pe != null && pe < 16) || (evEbitda != null && evEbitda < 9) || (pb != null && pb < 1.5))
    tags.push('Value');
  if ((revGrowth != null && revGrowth > 0.10) || (pct52w != null && pct52w > 70))
    tags.push('Growth');
  if (priceRegime === 'Uptrend' && pct52w != null && pct52w > 60)
    tags.push('Momentum');
  if (roe != null && roe > 0.15)
    tags.push('Quality');
  if (divYield != null && divYield > 0.015)
    tags.push('Dividend');
  if (ddProxy != null && ddProxy < -20)
    tags.push('Contrarian');

  return {
    symbol:              candidate.s,
    name:                (ov && ov.Name)     || candidate.n,
    sector:              (ov && ov.Sector)   || candidate.sec || 'Other',
    industry:            (ov && ov.Industry) || 'N/A',
    country:             (ov && ov.Country)  || 'US',
    exchange:            (ov && ov.Exchange) || null,
    asset_class:         'equity',
    pe_ratio:            pe    != null ? Math.round(pe    * 10)   / 10   : null,
    ev_ebitda:           evEbitda != null ? Math.round(evEbitda * 10) / 10 : null,
    pb_ratio:            pb    != null ? Math.round(pb    * 100)  / 100  : null,
    div_yield_pct:       divYield != null ? Math.round(divYield * 10000) / 100 : 0,
    roe_pct:             roe   != null ? Math.round(roe   * 1000) / 10   : null,
    revenue_growth_pct:  revGrowth != null ? Math.round(revGrowth * 1000) / 10 : null,
    market_cap_bucket:   mcapBucket,
    market_cap_raw:      mktCap   || null,
    analyst_target:      analystT || null,
    next_earnings:       null,
    current_price:       price,
    rsi_14:              null,
    ma_20:               null,
    ma_50:               ma50,
    ma_200:              ma200,
    price_regime:        priceRegime,
    vol_regime:          null,
    zscore_20d:          null,
    mean_reversion_signal: null,
    annualised_vol_20d:  null,
    high_52w:            high52,
    low_52w:             low52,
    pct_52w_range:       pct52w,
    atr_14:              null,
    return_1d_pct:       null,
    return_1w_pct:       null,
    return_1m_pct:       null,
    return_3m_pct:       null,
    return_6m_pct:       null,
    return_1y_pct:       null,
    return_ytd_pct:      null,
    current_drawdown_pct: ddProxy,
    style_tags:          tags,
    analyst_upside_pct:  (analystT && price && price > 0)
                           ? Math.round((analystT - price) / price * 1000) / 10
                           : null,
  };
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
function cors(res) {
  const o = process.env.ATLAS_ALLOWED_ORIGIN;
  if (o) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { cors(res); return res.status(204).end(); }
  if (req.method !== 'GET')    { cors(res); return res.status(405).json({ error: 'GET only' }); }
  cors(res);

  const apiKey = (process.env.ALPHA_VANTAGE_API_KEY || '').trim();
  const cfg    = supaCfg();

  // 1. Exclude current portfolio holdings (best-effort; empty set on failure)
  const portfolioSymbols = await getPortfolioSymbols(cfg);
  const candidates = UNIVERSE.filter(c => !portfolioSymbols.has(c.s));
  const symbols    = candidates.map(c => c.s);

  // 2. Batch-read cache (no-ops gracefully if Supabase not configured)
  const [ovCache, qtCache] = await Promise.all([
    batchCacheGet(cfg, symbols, 'mkt_overview'),
    batchCacheGet(cfg, symbols, 'mkt_quote'),
  ]);

  // 3. Fetch from AV for uncached stocks (up to MAX_AV_CALLS per request)
  //    Overview first, then quote for stocks that got overview this request
  if (apiKey) {
    const needOv = candidates.filter(c => !ovCache[c.s]);
    let avCalls = 0;

    for (const c of needOv) {
      if (avCalls >= MAX_AV_CALLS) break;
      const data = await avOverview(c.s, apiKey);
      avCalls++;
      if (data) {
        ovCache[c.s] = data;
        // Fire-and-forget cache write (don't await — reduces latency)
        cacheSet(cfg, c.s, 'mkt_overview', data, OVERVIEW_TTL);
      }
    }

    const needQt = candidates.filter(c => ovCache[c.s] && !qtCache[c.s]);
    for (const c of needQt) {
      if (avCalls >= MAX_AV_CALLS) break;
      const qt = await avGlobalQuote(c.s, apiKey);
      avCalls++;
      if (qt) {
        qtCache[c.s] = qt;
        cacheSet(cfg, c.s, 'mkt_quote', qt, QUOTE_TTL);
      }
    }
  }

  // 4. Return ALL candidates — enriched where cache/AV data exists,
  //    falling back to curated-list metadata (name, sector, mc bucket) for the rest.
  const enriched = candidates.filter(c => ovCache[c.s]).length;
  const stocks   = candidates.map(c => formatRow(c, ovCache[c.s] || null, qtCache[c.s] || null));

  return res.status(200).json({
    stocks,
    total_universe: candidates.length,
    enriched,
    has_av_key: !!apiKey,
  });
};
