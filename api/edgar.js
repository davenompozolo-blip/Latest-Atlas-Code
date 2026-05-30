// Vercel Serverless Function: SEC EDGAR provenance layer for ATLAS.
//
// Purpose: enriches fundamentals provenance with authoritative 10-K filing
// accession numbers and fiscal-year data. Does NOT supply primary values —
// AlphaVantage / Finnhub data already populates fields. This layer upgrades
// provenance labels from "Finnhub BS" → "FY2024 10-K · accn 0000320193-24-..."
// and optionally flags >5% variance between vendor and XBRL values.
//
// EDGAR is US-registrant only. Non-US counters return { cik: null } gracefully.
//
// EDGAR constraints (read: https://www.sec.gov/developer):
//   - No API key required
//   - Mandatory User-Agent header: "AppName contact@email" — requests without it are blocked
//   - Rate limit: 10 req/s — stay well under; we cache 24h in equity_cache
//   - All XBRL values are in RAW units (divide by 1e6 for $M comparison)
//
// Environment variables (shared with equity.js):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — for durable cache
//   EDGAR_CONTACT_EMAIL                       — contact email in User-Agent (required)
//
// Response shape:
//   {
//     cik: "0000320193",
//     ticker: "AAPL",
//     concepts: {
//       cfo:    { val, fy, accn, end, valM },   // NetCashProvidedByUsedInOperatingActivities
//       capex:  { val, fy, accn, end, valM },   // PaymentsToAcquirePropertyPlantAndEquipment
//       cash:   { val, fy, accn, end, valM },
//       debt:   { val, fy, accn, end, valM },   // LongTermDebtNoncurrent + DebtCurrent
//       shares: { val, fy, accn, end, valM },
//       dps:    { val, fy, accn, end, valM },
//     },
//     _source: "edgar"
//   }

const SEC_BASE = 'https://data.sec.gov';
const CIK_JSON = SEC_BASE + '/files/company_tickers.json';
const EDGAR_TTL_MS  = 24 * 60 * 60 * 1000;   // 24h
const CIK_MAP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory CIK map cache (Map of ticker → "0000000000" padded CIK)
const _cikCache = { map: null, ts: 0 };

function secHeaders() {
    const contact = (process.env.EDGAR_CONTACT_EMAIL || 'admin@atlas-terminal.app').trim();
    return { 'User-Agent': 'ATLAS Terminal ' + contact, Accept: 'application/json' };
}

async function fetchWithTimeout(url, opts, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 8000);
    try { return await fetch(url, Object.assign({ signal: ac.signal }, opts || {})); }
    finally { clearTimeout(t); }
}

// ── Supabase durable cache ────────────────────────────────────────────────────

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
            headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, Accept: 'application/json' },
        }, 4000);
        if (!r.ok) return null;
        const rows = await r.json();
        if (!Array.isArray(rows) || !rows.length) return null;
        if (new Date(rows[0].expires_at).getTime() < Date.now()) return null;
        return rows[0].payload;
    } catch (_) { return null; }
}

async function dbCacheSet(cacheKey, symbol, payload, ttlMs) {
    const cfg = supaCfg();
    if (!cfg) return;
    try {
        const body = [{
            cache_key: cacheKey,
            symbol: symbol,
            endpoint: 'edgar',
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

// ── CIK resolution ────────────────────────────────────────────────────────────

async function loadCIKMap() {
    if (_cikCache.map && Date.now() - _cikCache.ts < CIK_MAP_TTL_MS) {
        return _cikCache.map;
    }
    // Try Supabase cache for the full map (avoids re-fetching the 4MB JSON)
    const cached = await dbCacheGet('__edgar_cik_map__');
    if (cached && typeof cached === 'object') {
        _cikCache.map = cached;
        _cikCache.ts = Date.now();
        return cached;
    }
    // Fetch from SEC
    const r = await fetchWithTimeout(CIK_JSON, { headers: secHeaders() }, 15000);
    if (!r.ok) throw new Error('EDGAR company_tickers.json HTTP ' + r.status);
    const raw = await r.json();
    // Build ticker→paddedCIK map (raw format: { "0": { cik_str, ticker, title }, ... })
    const map = {};
    for (const entry of Object.values(raw)) {
        if (entry.ticker) {
            map[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, '0');
        }
    }
    _cikCache.map = map;
    _cikCache.ts = Date.now();
    // Cache in Supabase for 7 days
    dbCacheSet('__edgar_cik_map__', '__global__', map, CIK_MAP_TTL_MS);
    return map;
}

async function resolveCIK(ticker) {
    const map = await loadCIKMap();
    return map[ticker.toUpperCase()] || null;
}

// ── XBRL concept lookup ───────────────────────────────────────────────────────

/**
 * Returns the most recent 10-K datapoint for a given US-GAAP XBRL concept tag.
 * @param {string} cik     - zero-padded 10-digit CIK
 * @param {string} tag     - XBRL concept tag (e.g. "NetCashProvidedByUsedInOperatingActivities")
 * @param {string} [units] - unit key to look for (default: "USD")
 */
async function latestTenKValue(cik, tag, units) {
    units = units || 'USD';
    const url = `${SEC_BASE}/api/xbrl/companyconcept/CIK${cik}/us-gaap/${tag}.json`;
    const r = await fetchWithTimeout(url, { headers: secHeaders() }, 10000);
    if (!r.ok) return null;
    const data = await r.json();
    const arr = (data.units && (data.units[units] || data.units['USD'])) || [];
    const tenKs = arr
        .filter(u => u.form === '10-K' && u.val != null)
        .sort((a, b) => new Date(b.end) - new Date(a.end));
    if (!tenKs.length) return null;
    const latest = tenKs[0];
    return {
        val:  latest.val,
        valM: +(latest.val / 1e6).toFixed(1),
        fy:   latest.fy,
        accn: latest.accn,
        end:  latest.end,
        form: latest.form,
    };
}

// ── Concept tag map ───────────────────────────────────────────────────────────

// Primary and fallback tags per concept.
// latestTenKValue returns the first non-null result.
const CONCEPT_TAGS = {
    cfo: [
        'NetCashProvidedByUsedInOperatingActivities',
        'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ],
    capex: [
        'PaymentsToAcquirePropertyPlantAndEquipment',
        'PaymentsForCapitalImprovements',
        'CapitalExpenditureDiscontinuedOperations',
    ],
    cash: [
        'CashAndCashEquivalentsAtCarryingValue',
        'CashCashEquivalentsAndShortTermInvestments',
        'CashAndCashEquivalentsPeriodIncreaseDecrease',
    ],
    debt: [
        'LongTermDebtNoncurrent',
        'LongTermDebtAndCapitalLeaseObligations',
    ],
    debtCurrent: [
        'DebtCurrent',
        'CurrentPortionOfLongTermDebt',
    ],
    shares: [
        'CommonStockSharesOutstanding',
        'CommonStockSharesIssued',
    ],
    dps: [
        'CommonStockDividendsPerShareDeclared',
        'CommonStockDividendsPerShareCashPaid',
    ],
};

async function fetchConceptWithFallbacks(cik, tagList, units) {
    for (const tag of tagList) {
        try {
            const result = await latestTenKValue(cik, tag, units);
            if (result) return result;
        } catch (_) { /* try next */ }
    }
    return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    const corsOrigin = process.env.ATLAS_ALLOWED_ORIGIN;
    if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET')     return res.status(405).json({ error: 'GET only' });

    const symbol = String((req.query && req.query.symbol) || '').trim().toUpperCase();
    if (!symbol || !/^[A-Z0-9.\-^]{1,14}$/.test(symbol)) {
        return res.status(400).json({ error: 'Missing or invalid symbol' });
    }

    // Check durable cache
    const cacheKey = symbol + ':edgar';
    const cached = await dbCacheGet(cacheKey);
    if (cached) {
        res.setHeader('x-cache', 'hit');
        return res.status(200).json(cached);
    }

    try {
        // Resolve CIK
        const cik = await resolveCIK(symbol);
        if (!cik) {
            // Non-US registrant or unresolved — return gracefully
            return res.status(200).json({
                ticker: symbol, cik: null,
                concepts: {}, _source: 'edgar',
                _note: 'CIK not found — EDGAR covers US registrants only'
            });
        }

        // Fetch concepts in parallel (6 concepts, respecting rate limit awareness)
        const [cfo, capex, cash, debt, debtCurr, shares, dps] = await Promise.all([
            fetchConceptWithFallbacks(cik, CONCEPT_TAGS.cfo),
            fetchConceptWithFallbacks(cik, CONCEPT_TAGS.capex),
            fetchConceptWithFallbacks(cik, CONCEPT_TAGS.cash),
            fetchConceptWithFallbacks(cik, CONCEPT_TAGS.debt),
            fetchConceptWithFallbacks(cik, CONCEPT_TAGS.debtCurrent),
            fetchConceptWithFallbacks(cik, CONCEPT_TAGS.shares, 'shares'),
            fetchConceptWithFallbacks(cik, CONCEPT_TAGS.dps, 'USD-per-shares'),
        ]);

        // Combine long-term + current debt
        let debtCombined = null;
        if (debt || debtCurr) {
            const ltDebt  = debt     ? debt.val     : 0;
            const curDebt = debtCurr ? debtCurr.val : 0;
            debtCombined = {
                val:  ltDebt + curDebt,
                valM: +((ltDebt + curDebt) / 1e6).toFixed(1),
                fy:   (debt || debtCurr).fy,
                accn: (debt || debtCurr).accn,
                end:  (debt || debtCurr).end,
                form: '10-K',
            };
        }

        const payload = {
            ticker: symbol,
            cik: cik,
            concepts: {
                cfo:    cfo    || null,
                capex:  capex  || null,
                cash:   cash   || null,
                debt:   debtCombined || null,
                shares: shares || null,
                dps:    dps    || null,
            },
            _source: 'edgar',
        };

        // Cache for 24h
        await dbCacheSet(cacheKey, symbol, payload, EDGAR_TTL_MS);

        res.setHeader('x-cache', 'miss');
        return res.status(200).json(payload);
    } catch (e) {
        const msg = (e && e.message) || String(e);
        return res.status(502).json({ error: 'EDGAR fetch failed: ' + msg });
    }
}
