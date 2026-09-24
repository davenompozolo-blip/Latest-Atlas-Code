// ============================================================
// Vercel Serverless Function: EDGAR companyfacts -> normalised statements.
//
// Transport only. Every mapping decision lives in `src/lib/edgarFacts.js`,
// which is pure and tested; this file resolves a CIK, fetches, and writes.
//
// WHY THIS EXISTS. Measured 2026-09-24 against production: 10 of 913 symbols
// carried statements, because Alpha Vantage is capped at 25 requests/day on
// two independent free keys and costs 3 calls per symbol -- about eight
// symbols a day. EDGAR has no key and no daily cap, and one call returns
// every concept for every period. The 913-symbol universe is ~15 minutes of
// calls rather than ~114 days.
//
// EDGAR constraints (https://www.sec.gov/search-filings/edgar-application-programming-interfaces):
//   - No API key. A descriptive User-Agent carrying a contact address is
//     MANDATORY; requests without one are blocked.
//   - 10 requests/second. Paced well under that here.
//
// NOTE FOR THE NEXT READER: the SEC also publishes an "EDGAR API" for FILERS
// -- filer management, delegations, CCC codes, transmitting submissions. It
// is Bearer-authenticated with Filer and User API tokens issued to a
// registrant and carries NO financial data. That is the submission side and
// is not this. This reads `data.sec.gov`, the structured-data side.
// ============================================================

import { statementRowsFromFacts, SOURCE_EDGAR } from '../src/lib/edgarFacts.js';

const SEC_WWW  = 'https://www.sec.gov';
const SEC_DATA = 'https://data.sec.gov';
const TICKER_MAP_URL = SEC_WWW + '/files/company_tickers.json';

const SB_URL     = process.env.SUPABASE_URL || '';
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CONTACT    = (process.env.EDGAR_CONTACT_EMAIL || '').trim();

/** Politeness pacing. EDGAR allows 10/s; this sits at ~6/s. */
const PACE_MS = 160;

/**
 * A fiscal history this short is not a history. Used to refuse a CIK rather
 * than write a one-year "load" that reads as a successful one.
 */
const MIN_ANNUAL_PERIODS = 3;

/**
 * THE TICKER MAP CAN POINT AT A SUCCESSOR REGISTRANT WITH NO HISTORY.
 *
 * Measured: `company_tickers.json` maps XOM to CIK 2115436, which carries 94
 * concepts and ZERO annual `Assets` facts. Exxon's actual filing history is
 * under CIK 34088 -- 438 concepts, 18 years. `entityName` is "Exxon Mobil
 * Corporation" on BOTH, so the name corroborates the wrong answer and the
 * failure reads as "this company has no data".
 *
 * Overrides are recorded here with the evidence that justified them. A symbol
 * that trips the MIN_ANNUAL_PERIODS floor is REPORTED rather than guessed at,
 * so the list grows from measurement instead of from assumption.
 */
const CIK_OVERRIDES = {
    // ticker: [cik, why]
    XOM: ['0000034088', 'ticker map resolves to successor CIK 2115436: 94 concepts, 0 annual Assets'],
};

function ua() {
    // EDGAR blocks requests without a contact address. Fail loudly rather
    // than send a header that gets the whole platform rate-limited.
    return 'ATLAS Terminal ' + (CONTACT || 'unknown-contact');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function secGet(url) {
    const res = await fetch(url, { headers: { 'User-Agent': ua(), 'Accept-Encoding': 'gzip, deflate' } });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error('EDGAR ' + res.status + ' ' + url + ' ' + body.slice(0, 200));
        err.status = res.status;
        throw err;
    }
    return res.json();
}

function sbHeaders() {
    return {
        apikey: SB_SERVICE,
        Authorization: 'Bearer ' + SB_SERVICE,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
    };
}

async function sbSelect(path) {
    const res = await fetch(SB_URL + '/rest/v1/' + path, { headers: sbHeaders() });
    if (!res.ok) throw new Error('supabase select ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 200));
    return res.json();
}

/** One symbol's three statements, written in ONE transaction. */
async function writeStatements(income, balance, cashflow) {
    const res = await fetch(SB_URL + '/rest/v1/rpc/atlas_upsert_company_statements', {
        method: 'POST', headers: sbHeaders(),
        body: JSON.stringify({ p_income: income, p_balance: balance, p_cashflow: cashflow }),
    });
    if (!res.ok) {
        throw new Error('atlas_upsert_company_statements ' + res.status + ' '
            + (await res.text().catch(() => '')).slice(0, 300));
    }
    return res.json().catch(() => null);
}

// ── sync_log ────────────────────────────────────────────────────────────────
// NEVER write duration_ms: it is GENERATED ALWAYS and including it makes
// PostgREST reject the ENTIRE patch. Set finished_at and let it derive.
// A swallowed write failure costs months, so both ends log at error level.

async function logOpen(summary) {
    try {
        const res = await fetch(SB_URL + '/rest/v1/sync_log', {
            method: 'POST', headers: sbHeaders(),
            body: JSON.stringify([{
                function_name: 'sync_statements_edgar',
                source: 'sync_statements_edgar',
                status: 'running',
                started_at: new Date().toISOString(),
                details: summary,
            }]),
        });
        if (!res.ok) {
            console.error('sync_statements_edgar: sync_log open refused',
                res.status, (await res.text().catch(() => '')).slice(0, 300));
            return null;
        }
        const rows = await res.json();
        return (rows && rows[0] && rows[0].id) || null;
    } catch (e) {
        console.error('sync_statements_edgar: sync_log open threw', e.message);
        return null;
    }
}

async function logClose(id, status, summary, errorMessage) {
    if (!id) return;
    try {
        const res = await fetch(SB_URL + '/rest/v1/sync_log?id=eq.' + id, {
            method: 'PATCH', headers: sbHeaders(),
            body: JSON.stringify({
                status,
                finished_at: new Date().toISOString(),
                details: summary,
                error_message: errorMessage || null,
            }),
        });
        if (!res.ok) {
            console.error('sync_statements_edgar: sync_log close refused',
                res.status, (await res.text().catch(() => '')).slice(0, 300));
        }
    } catch (e) {
        console.error('sync_statements_edgar: sync_log close threw', e.message);
    }
}

// ── symbol resolution ───────────────────────────────────────────────────────

let tickerMapCache = null;
async function tickerToCik() {
    if (tickerMapCache) return tickerMapCache;
    const raw = await secGet(TICKER_MAP_URL);
    const map = new Map();
    for (const k of Object.keys(raw)) {
        const row = raw[k];
        if (!row || !row.ticker) continue;
        map.set(String(row.ticker).toUpperCase(), String(row.cik_str).padStart(10, '0'));
    }
    tickerMapCache = map;
    return map;
}

/**
 * Which symbols to load. Held names first -- a page someone opens is the
 * coverage that matters -- then the rest of the screener universe.
 * `refresh_days` skips symbols already loaded recently.
 */
async function resolveSymbols(explicit, limit, refreshDays) {
    if (explicit.length) return explicit;

    const ordered = [];
    const seen = new Set();
    const push = s => { const u = String(s || '').toUpperCase(); if (u && !seen.has(u)) { seen.add(u); ordered.push(u); } };

    try {
        const held = await sbSelect('vw_positions_current?select=asset_id&limit=2000');
        const ids = held.map(r => r.asset_id).filter(Boolean);
        if (ids.length) {
            const assets = await sbSelect(
                'assets?select=symbol,asset_class&id=in.(' + ids.join(',') + ')&limit=2000');
            for (const a of assets) {
                if (a.asset_class && String(a.asset_class).startsWith('us_option')) continue;
                push(a.symbol);
            }
        }
    } catch (e) { console.error('sync_statements_edgar: held lookup failed', e.message); }

    try {
        const universe = await sbSelect('equity_screener_universe?select=symbol&limit=5000');
        for (const r of universe) push(r.symbol);
    } catch (e) { console.error('sync_statements_edgar: universe lookup failed', e.message); }

    let fresh = new Set();
    if (refreshDays > 0) {
        try {
            const cutoff = new Date(Date.now() - refreshDays * 86400000).toISOString();
            const recent = await sbSelect('company_income_statement?select=symbol&source=eq.'
                + SOURCE_EDGAR + '&loaded_at=gte.' + cutoff + '&limit=100000');
            fresh = new Set(recent.map(r => r.symbol));
        } catch (e) { console.error('sync_statements_edgar: freshness lookup failed', e.message); }
    }

    return ordered.filter(s => !fresh.has(s)).slice(0, limit);
}

// ── handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
    const secret = (process.env.CRON_SECRET || '').trim();
    if (secret) {
        const auth = req.headers.authorization || '';
        const token = (req.query && req.query.token) || '';
        if (auth !== 'Bearer ' + secret && token !== secret) return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!SB_SERVICE || !SB_URL) {
        console.error('sync_statements_edgar: SUPABASE_SERVICE_ROLE_KEY unset — refusing to run');
        return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY unset' });
    }
    // EDGAR blocks an anonymous User-Agent outright. Refusing here beats
    // getting the platform's egress IP rate-limited.
    if (!CONTACT) {
        console.error('sync_statements_edgar: EDGAR_CONTACT_EMAIL unset — refusing to run');
        return res.status(500).json({ error: 'EDGAR_CONTACT_EMAIL unset (EDGAR requires a contact in User-Agent)' });
    }

    const q = req.query || {};
    const explicit = String(q.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const limit = Math.max(1, Math.min(2000, Number(q.limit) || 25));
    const refreshDays = q.refresh_days === undefined ? 30 : Math.max(0, Number(q.refresh_days) || 0);
    const budgetMs = Math.max(10000, Math.min(280000, Number(q.budget_ms) || 240000));
    const started = Date.now();

    const summary = {
        source: SOURCE_EDGAR,
        scope: explicit.length ? 'explicit' : 'resolved',
        run_tag: String(q.run_tag || '') || null,
        requested: 0, attempted: 0,
        symbols_written: 0, rows_written: 0, edgar_calls: 0,
        budget_exhausted: false,
        symbols: [],
        no_cik: [],          // ticker not in EDGAR's map at all
        thin_history: [],    // resolved, but too little history to trust the CIK
        failures: [],
    };

    const logId = await logOpen(summary);

    let symbols = [];
    try {
        symbols = await resolveSymbols(explicit, limit, refreshDays);
        summary.requested = symbols.length;
    } catch (e) {
        summary.failures.push({ stage: 'resolve', message: e.message });
        await logClose(logId, 'error', summary, e.message);
        return res.status(500).json(summary);
    }

    let map;
    try {
        map = await tickerToCik();
        summary.edgar_calls++;
    } catch (e) {
        summary.failures.push({ stage: 'ticker_map', message: e.message });
        await logClose(logId, 'error', summary, e.message);
        return res.status(500).json(summary);
    }

    for (const symbol of symbols) {
        if (Date.now() - started > budgetMs) { summary.budget_exhausted = true; break; }
        summary.attempted++;

        const override = CIK_OVERRIDES[symbol];
        const cik = override ? override[0] : map.get(symbol);
        if (!cik) { summary.no_cik.push(symbol); continue; }

        try {
            const facts = await secGet(SEC_DATA + '/api/xbrl/companyfacts/CIK' + cik + '.json');
            summary.edgar_calls++;

            const { income, balance, cashflow, provenance } = statementRowsFromFacts(facts, symbol);

            // A CIK with almost no history is a resolution failure wearing a
            // successful fetch. Report it; do NOT write a one-year history
            // that reads as a real load.
            if (provenance.fiscal_years.length < MIN_ANNUAL_PERIODS) {
                summary.thin_history.push({
                    symbol, cik, entity: facts && facts.entityName,
                    periods: provenance.fiscal_years.length,
                });
                await sleep(PACE_MS);
                continue;
            }

            // ALL THREE STATEMENTS, THEN WRITE. EQ-2 found SNDK with an income
            // statement and no balance sheet because the old loader wrote as it
            // fetched and was interrupted between calls. A symbol is atomic.
            await writeStatements(income, balance, cashflow);

            const rows = income.length + balance.length + cashflow.length;
            summary.symbols_written++;
            summary.rows_written += rows;
            summary.symbols.push({
                symbol, cik,
                entity: (facts && facts.entityName) || null,
                periods: provenance.fiscal_years.length,
                year_min: provenance.fiscal_years[0],
                year_max: provenance.fiscal_years[provenance.fiscal_years.length - 1],
                rows,
                override: override ? override[1] : undefined,
            });
        } catch (e) {
            console.error('sync_statements_edgar:', symbol, e.message);
            summary.failures.push({ symbol, cik, message: String(e.message).slice(0, 300) });
        }
        await sleep(PACE_MS);
    }

    // Three outcomes, kept apart. A no-op dressed as a successful write is the
    // defect this codebase has recorded four times.
    let status = 'success';
    let errMsg = null;
    if (summary.symbols_written === 0) {
        if (summary.attempted === 0) {
            status = 'skipped';
            errMsg = 'nothing to load — every requested symbol was already fresh';
        } else {
            status = 'error';
            errMsg = 'attempted ' + summary.attempted + ' symbols and wrote none';
        }
    } else if (summary.failures.length || summary.thin_history.length || summary.no_cik.length) {
        status = 'partial';
    }

    await logClose(logId, status, summary, errMsg);
    return res.status(status === 'error' ? 500 : 200).json(summary);
}
