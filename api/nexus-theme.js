// api/nexus-theme.js
// ------------------------------------------------------------
// Series-derived inputs for the Theme tab's rotation funnel: per-THEME
// 5-day momentum and factor betas (rate / USD / oil). The book's daily
// closes come from price_history in ONE query; three liquid proxy ETFs
// (TLT, UUP, USO) supply the factor returns. Everything else the Theme
// panel needs (share, VaR, dispersion, valuation) it reads from the
// resolved model. Pure maths in nexusThemeCompute.js; degrades to an
// empty themes list, never throws.

import { dailyReturns, themeReturnSeries, cumMomentum, beta, scaleReturnsToVol } from '../src/pages/nexus/nexusThemeCompute.js';
import { closeSeriesFromAlpaca } from '../src/pages/nexus/nexusBoardCompute.js';
import { assetIdsPath, bookPricesPath, symbolById } from '../src/lib/bookPriceRead.js';

const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbW9qanN6dnZjaXRodXh3ZXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTg1NDgsImV4cCI6MjA4Nzk3NDU0OH0.xFo-N9CGQlpHlsykinr_ORAmzV4N7MIq0emW5N1Vojk';
const SB_URL = (process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_ANON;

// Factor proxies → the three transmission channels.
const FACTORS = { rate: 'TLT', usd: 'UUP', oil: 'USO' };
const BETA_DAYS = 60;       // lookback window for the rolling betas
const MOMENTUM_N = 5;       // 5-day momentum

async function fetchT(url, ms, headers) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 9000);
    try { return await fetch(url, { signal: ac.signal, headers: headers || {} }); }
    finally { clearTimeout(t); }
}

const ymd = d => d.toISOString().slice(0, 10);

// A healthy answer is cached for six hours (prices move nightly). A DEGRADED
// one must not be: on 2026-09-24 a timed-out price read produced a 200 with
// every theme's momentum null, the CDN served it as a HIT, and the Theme page
// read "Momentum pending -- price history syncing" for data that was there.
// A failure answers 503 with no-store; a partial answer is cached briefly and
// says what is missing.
const CACHE_OK = 's-maxage=21600, stale-while-revalidate=86400';
const CACHE_DEGRADED = 's-maxage=60';
function unavailable(res, reason) {
    console.error('[nexus-theme] unavailable: ' + reason);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ ok: false, error: reason, themes: [] });
}

// MP-2: the browser's chosen portfolio arrives as ?portfolio= -- a query param
// because this response is CDN-cached by URL and a request header is not part
// of the cache key, so one account's cached answer would be served to the
// other. It is forwarded to PostgREST as x-atlas-portfolio, where
// atlas_active_portfolio() validates it; anything that is not a portfolio id
// is dropped here and the server resolves the default portfolio.
const PORTFOLIO_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function portfolioHeader(req) {
    const p = req && req.query ? req.query.portfolio : null;
    return typeof p === 'string' && PORTFOLIO_RE.test(p) ? { 'x-atlas-portfolio': p.toLowerCase() } : {};
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ATLAS_ALLOWED_ORIGIN || '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = (process.env.SYNC_ORIGIN || (host ? proto + '://' + host : '')).replace(/\/$/, '');
    const fwd = {};
    if (req.headers['x-vercel-protection-bypass']) fwd['x-vercel-protection-bypass'] = req.headers['x-vercel-protection-bypass'];
    if (req.headers.cookie) fwd.cookie = req.headers.cookie;
    const sbHdr = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, ...portfolioHeader(req) };

    try {
        // 1. Book — symbol, theme, weight.
        const hr = await fetchT(SB_URL + '/rest/v1/vw_nexus_holdings?select=symbol,theme,weight_pct', 8000, sbHdr);
        if (!hr.ok) return unavailable(res, 'holdings feed HTTP ' + hr.status);
        const holdings = await hr.json();
        // A genuinely empty book is an answer, not a failure.
        if (!holdings.length) return res.status(200).json({ ok: true, asOf: new Date().toISOString(), themes: [] });
        const symbols = [...new Set(holdings.map(h => h.symbol))];

        const ar = await fetchT(SB_URL + '/rest/v1/' + assetIdsPath(symbols), 8000, sbHdr);
        if (!ar.ok) return unavailable(res, 'asset lookup HTTP ' + ar.status);
        const symOf = symbolById(await ar.json());

        // 2. Book closes — one price_history query (joined to assets for the symbol).
        const since = ymd(new Date(Date.now() - (BETA_DAYS + 12) * 86_400_000));
        // Paged, not `order=asc&limit=20000`: PostgREST caps a response at
        // 1,000 rows whatever `limit` asks for, and a single read once kept
        // the OLDEST rows (priceAsOf read 2026-07-08 against a book at
        // 2026-08-21). The path is src/lib/bookPriceRead.js -- asset-major,
        // filtered on asset_id; see its header for why. A cap or a failed page
        // is REPORTED (pricesComplete), because an asset-major truncation
        // drops whole names. Each symbol's closes are sorted ascending below
        // because dailyReturns() walks forward.
        const pBase = SB_URL + '/rest/v1/' + bookPricesPath([...symOf.keys()], since);
        const priceRows = [];
        let pricesComplete = true;
        for (let page = 0; ; page++) {
            if (page >= 8) { pricesComplete = false; console.error('[nexus-theme] price read hit the 8-page cap'); break; }
            // One retry: a cold buffer cache can cost the first attempt the
            // 3s anon cap (seen 2026-09-25) and the second is then warm.
            const get = () => fetchT(pBase + '&limit=1000&offset=' + page * 1000, 10000, sbHdr).catch(e => ({ ok: false, status: (e && e.name) || 'error' }));
            let r = await get();
            if (!r.ok) r = await get();
            if (!r.ok) {
                // A failed first page is no tape at all -- never publish that
                // as themes whose momentum is merely pending.
                const body = r.text ? await r.text().catch(() => '') : '';
                if (page === 0) return unavailable(res, 'price history HTTP ' + r.status + ' ' + body.slice(0, 200));
                pricesComplete = false;
                console.error('[nexus-theme] price page ' + page + ' HTTP ' + r.status + ' -- tape truncated ' + body.slice(0, 200));
                break;
            }
            const batch = await r.json();
            priceRows.push(...batch);
            if (batch.length < 1000) break;
        }
        const closesBySymbol = new Map();
        for (const row of priceRows) {
            const sym = symOf.get(row.asset_id);
            const close = Number(row.close);
            if (!sym || !(close > 0)) continue;
            if (!closesBySymbol.has(sym)) closesBySymbol.set(sym, []);
            closesBySymbol.get(sym).push({ date: row.price_date, close });
        }
        for (const closes of closesBySymbol.values()) closes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        // The newest bar in the tape -- a max, not the last row, since the
        // read is asset-major.
        let priceAsOf = null;
        for (const row of priceRows) if (row.price_date && (!priceAsOf || row.price_date > priceAsOf)) priceAsOf = row.price_date;
        const retBySymbol = new Map();
        for (const [sym, closes] of closesBySymbol) retBySymbol.set(sym, dailyReturns(closes));

        // 3. Factor proxy returns (TLT / UUP / USO) via the equity daily endpoint.
        const factorRet = {};
        await Promise.all(Object.entries(FACTORS).map(async ([key, sym]) => {
            const r = await fetchT(origin + '/api/equity?endpoint=daily&symbol=' + sym, 15000, fwd)
                .then(x => x.ok ? x.json() : null).catch(() => null);
            const series = r ? closeSeriesFromAlpaca(r.daily) : [];
            factorRet[key] = dailyReturns((series || []).map(p => ({ date: p.t, close: p.c })));
        }));

        // Vol-normalise the factor returns to a common 1% daily move so the
        // rate / USD / oil betas are comparable (raw betas scale with the
        // factor's own volatility — UUP would dwarf USO otherwise).
        const fr = {
            rate: scaleReturnsToVol(factorRet.rate),
            usd: scaleReturnsToVol(factorRet.usd),
            oil: scaleReturnsToVol(factorRet.oil),
        };

        // Today's factor moves in the SAME vol-normalised units the betas are
        // regressed against, so implied return = Σ β_f × move_f is internally
        // consistent. Consumed by Nexus beat 05 (Realized transmission) —
        // the betas and these moves must come from one place or the implied
        // vs actual panel can silently disagree with the transmission strip.
        // Rate sign flipped to match the beta convention (β to *rising* rates).
        const lastMove = rs => {
            const r = rs && rs.length ? rs[rs.length - 1] : null;
            return (r && r.ret != null && isFinite(r.ret)) ? r.ret : null;
        };
        const factorMoves = {
            rate: lastMove(fr.rate) == null ? null : +(-lastMove(fr.rate) * 100).toFixed(3),
            usd: lastMove(fr.usd) == null ? null : +(lastMove(fr.usd) * 100).toFixed(3),
            oil: lastMove(fr.oil) == null ? null : +(lastMove(fr.oil) * 100).toFixed(3),
        };

        // 4. Per-theme momentum + betas.
        // Bucket on THEME, and fall back to 'Unclassified' exactly as
        // buildThemeView / themeDispersion do — the Theme panel joins this
        // payload by theme name, so any other key silently drops the row.
        // This grouped by `sector`, and sector and theme are different
        // taxonomies (CLAUDE.md, 2026-08-11). Only names that happen to
        // exist in both — "Financials" and "Energy" — ever matched, so 12
        // of the book's 14 themes rendered "momentum pending sync" and
        // "factor betas pending" while the series behind them was fine.
        // "Real estate" the theme missed "Real Estate" the sector on case
        // alone, which is how narrow the accidental overlap was.
        const byTheme = new Map();
        for (const h of holdings) {
            const t = h.theme || 'Unclassified';
            if (!byTheme.has(t)) byTheme.set(t, []);
            byTheme.get(t).push({ symbol: h.symbol, weight: Number(h.weight_pct) || 0 });
        }
        const themes = [...byTheme.entries()].map(([theme, members]) => {
            const tr = themeReturnSeries(members, retBySymbol);
            const rateBeta = beta(tr, fr.rate);
            return {
                theme,
                momentum5d: cumMomentum(tr, MOMENTUM_N),
                // TLT rises when rates fall, so the sensitivity to *rising* rates
                // is the negative of the beta to TLT.
                betas: {
                    rate: rateBeta == null ? null : +(-rateBeta).toFixed(2),
                    usd: beta(tr, fr.usd),
                    oil: beta(tr, fr.oil),
                },
            };
        });

        const factorsComplete = ['rate', 'usd', 'oil'].every(k => factorMoves[k] != null);
        const degraded = [];
        if (!pricesComplete) degraded.push('prices_partial');
        if (!factorsComplete) degraded.push('factors_partial');
        res.setHeader('Cache-Control', degraded.length ? CACHE_DEGRADED : CACHE_OK);
        return res.status(200).json({
            ok: true,
            asOf: new Date().toISOString(),
            betaDays: BETA_DAYS,
            priceAsOf,
            themes,
            // Beat 05 (Realized transmission) computes implied = Σ β_f × move_f
            // and needs these. They were being computed above and then dropped
            // on the floor, so the front end always saw `undefined`, `movesLive`
            // was always false, and EVERY sector's implied rendered "—".
            factorMoves,
            // When the factor proxy fetch fails, betas AND moves are null — the
            // panel needs to say which leg is missing instead of a bare dash.
            factorsAvailable: ['rate', 'usd', 'oil'].some(k => factorMoves[k] != null),
            // A consumer that writes history (theme-leadership-snapshot) must
            // refuse a partial tape; a surface should say it is partial.
            pricesComplete,
            degraded,
        });
    } catch (e) {
        return unavailable(res, (e && e.message) || 'theme error');
    }
}
