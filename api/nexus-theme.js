// api/nexus-theme.js
// ------------------------------------------------------------
// Series-derived inputs for the Theme tab's rotation funnel: per-theme
// 5-day momentum and factor betas (rate / USD / oil). The book's daily
// closes come from price_history in ONE query; three liquid proxy ETFs
// (TLT, UUP, USO) supply the factor returns. Everything else the Theme
// panel needs (share, VaR, dispersion, valuation) it reads from the
// resolved model. Pure maths in nexusThemeCompute.js; degrades to an
// empty themes list, never throws.

import { dailyReturns, themeReturnSeries, cumMomentum, beta, scaleReturnsToVol } from '../src/pages/nexus/nexusThemeCompute.js';
import { closeSeriesFromAlpaca } from '../src/pages/nexus/nexusBoardCompute.js';

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

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ATLAS_ALLOWED_ORIGIN || '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const origin = (process.env.SYNC_ORIGIN || (host ? proto + '://' + host : '')).replace(/\/$/, '');
    const fwd = {};
    if (req.headers['x-vercel-protection-bypass']) fwd['x-vercel-protection-bypass'] = req.headers['x-vercel-protection-bypass'];
    if (req.headers.cookie) fwd.cookie = req.headers.cookie;
    const sbHdr = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

    try {
        // 1. Book — symbol, theme, weight.
        const hr = await fetchT(SB_URL + '/rest/v1/vw_nexus_holdings?select=symbol,sector,weight_pct', 8000, sbHdr);
        const holdings = hr.ok ? await hr.json() : [];
        if (!holdings.length) return res.status(200).json({ ok: true, asOf: new Date().toISOString(), themes: [] });
        const symbols = [...new Set(holdings.map(h => h.symbol))];

        // 2. Book closes — one price_history query (joined to assets for the symbol).
        const since = ymd(new Date(Date.now() - (BETA_DAYS + 12) * 86_400_000));
        const pUrl = SB_URL + '/rest/v1/price_history'
            + '?select=price_date,close,assets!inner(symbol)'
            + '&assets.symbol=in.(' + symbols.join(',') + ')'
            + '&price_date=gte.' + since
            + '&order=price_date.asc&limit=20000';
        const pr = await fetchT(pUrl, 10000, sbHdr);
        const priceRows = pr.ok ? await pr.json() : [];
        const closesBySymbol = new Map();
        for (const row of priceRows) {
            const sym = row.assets && row.assets.symbol;
            const close = Number(row.close);
            if (!sym || !(close > 0)) continue;
            if (!closesBySymbol.has(sym)) closesBySymbol.set(sym, []);
            closesBySymbol.get(sym).push({ date: row.price_date, close });
        }
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

        // 4. Per-theme momentum + betas.
        const byTheme = new Map();
        for (const h of holdings) {
            const t = h.sector || 'Unclassified';
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

        res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
        return res.status(200).json({
            ok: true,
            asOf: new Date().toISOString(),
            betaDays: BETA_DAYS,
            priceAsOf: priceRows.length ? priceRows[priceRows.length - 1].price_date : null,
            themes,
        });
    } catch (e) {
        return res.status(200).json({ ok: false, error: (e && e.message) || 'theme error', themes: [] });
    }
}
