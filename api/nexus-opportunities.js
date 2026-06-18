// api/nexus-opportunities.js
// ------------------------------------------------------------
// The marginal-dollar ledger: every scrapbook-valued name scored on its
// own merit AND on fit with the book, so a cheap-but-redundant name
// demotes below an additive diversifier. Sources (all anon-readable):
// vw_nexus_holdings (held set, weights, conviction), scrapbook_companies
// (fair value), scrapbook_narratives (thesis), cortex_signals /
// cortex_watchlist (provenance), insight_correlation_cluster (redundancy),
// insight_counter_specific_var_vs_sector (marginal risk),
// scrapbook_sector_notes (sector tilts). Scoring is pure (nexusOpportunities
// Compute.js). Degrades to an empty ledger, never throws.

import { rankLedger, sectorTilts } from '../src/pages/nexus/nexusOpportunitiesCompute.js';
import { optionsRead, entryTiming } from '../src/pages/nexus/nexusOptionsCompute.js';

const FALLBACK_URL = 'https://vdmojjszvvcithuxwexx.supabase.co';
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbW9qanN6dnZjaXRodXh3ZXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTg1NDgsImV4cCI6MjA4Nzk3NDU0OH0.xFo-N9CGQlpHlsykinr_ORAmzV4N7MIq0emW5N1Vojk';
const SB_URL = (process.env.VITE_SUPABASE_URL || FALLBACK_URL).replace(/\/+$/, '');
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_ANON;
const MAX_LEDGER = 24;

const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// Scrapbook sector names are free-text ("Semiconductors", "US banking",
// "consumer staples") — map them onto the book's sector taxonomy so the tilt
// can be pitted against real weights.
const normSector = s => {
    const x = String(s || '').toLowerCase();
    if (/semiconduct|chip|\btech/.test(x)) return 'Technology';
    if (/bank|financ/.test(x)) return 'Financials';
    if (/energy|oil|\bgas\b/.test(x)) return 'Energy';
    if (/health|pharma|biotech/.test(x)) return 'Healthcare';
    if (/staple/.test(x)) return 'Consumer Staples';
    if (/consumer|discretion/.test(x)) return 'Consumer Discretionary';
    if (/material|metal|mining|gold|precious/.test(x)) return 'Materials';
    if (/communicat|comms|media|internet|telecom/.test(x)) return 'Communications';
    if (/industrial/.test(x)) return 'Industrials';
    if (/real estate|reit/.test(x)) return 'Real Estate';
    if (/utilit/.test(x)) return 'Utilities';
    return s || 'Unclassified';
};

async function sb(path, ms) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms || 9000);
    try {
        const r = await fetch(SB_URL + '/rest/v1/' + path, { signal: ac.signal, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
        return r.ok ? await r.json() : [];
    } catch { return []; }
    finally { clearTimeout(t); }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ATLAS_ALLOWED_ORIGIN || '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const [holdings, companies, narratives, sigs, watch, corr, varRows, sectorNotes, options] = await Promise.all([
            sb('vw_nexus_holdings?select=symbol,sector,weight_pct,conviction_score,dcf_upside_pct'),
            sb('scrapbook_companies?select=id,ticker,company_name,sector,avg_fair_value,current_price,fair_value_low,fair_value_high,conviction_rating,thesis_summary&avg_fair_value=not.is.null&current_price=not.is.null'),
            sb('scrapbook_narratives?select=company_id,thesis,investment_verdict,avg_upside_pct,bull_case,bear_case,key_sensitivities'),
            sb('cortex_signals?select=candidates&is_muted=eq.false'),
            sb('cortex_watchlist?select=symbol'),
            sb('insight_correlation_cluster?select=symbol_1,symbol_2,correlation'),
            sb('insight_counter_specific_var_vs_sector?select=symbol,excess_var'),
            sb('scrapbook_sector_notes?select=sector,sector_verdict,relative_value,company_tickers'),
            sb('nexus_options?select=tk,atm_iv,skew_25d,pc_oi,front_iv,back_iv,iv_rank,skew_rank,rank_ready'),
        ]);

        // Entry timing per candidate — the SAME optionsRead Flagship uses, framed
        // here as entry (clean / crowded / stressed). Annotates the ledger; the
        // rank stays own-worthiness (isolated merit + fit) — timing never reorders.
        const optByTk = new Map((options || []).map(o => [o.tk, o]));
        const timingFor = tk => {
            const row = optByTk.get(tk);
            if (!row || num(row.atm_iv) == null) return null;
            const { tone, because } = optionsRead(row);
            return { timing: entryTiming(tone), tone, because };
        };

        const heldSet = new Set(holdings.map(h => h.symbol));
        const heldConv = new Map(holdings.map(h => [h.symbol, num(h.conviction_score)]));
        const sectorWeights = {};
        for (const h of holdings) { const s = h.sector || 'Unclassified'; sectorWeights[s] = (sectorWeights[s] || 0) + (num(h.weight_pct) || 0); }

        const cortexTk = new Set();
        for (const s of sigs) for (const c of (s.candidates || [])) if (c && c.ticker) cortexTk.add(c.ticker);
        const watchSet = new Set(watch.map(w => w.symbol));
        const varMap = new Map(varRows.map(v => [v.symbol, num(v.excess_var)]));
        const idToTicker = new Map(companies.map(c => [c.id, c.ticker]));
        const narrByTk = new Map();
        for (const n of narratives) { const tk = idToTicker.get(n.company_id); if (tk && !narrByTk.has(tk)) narrByTk.set(tk, n); }

        const maxCorr = tk => {
            let m = null;
            for (const p of corr) {
                const c = num(p.correlation);
                if (c == null) continue;
                if (p.symbol_1 === tk && heldSet.has(p.symbol_2)) m = Math.max(m == null ? -1 : m, c);
                else if (p.symbol_2 === tk && heldSet.has(p.symbol_1)) m = Math.max(m == null ? -1 : m, c);
            }
            return m;
        };

        const scrapByTk = new Map(companies.map(c => [c.ticker, c]));
        const heldList = holdings.map(h => {
            const c = scrapByTk.get(h.symbol);
            const gap = (c && num(c.avg_fair_value) != null && num(c.current_price)) ? (c.avg_fair_value - c.current_price) / c.current_price * 100 : num(h.dcf_upside_pct);
            return { tk: h.symbol, fvGapPct: gap, conviction: num(h.conviction_score) };
        });

        // Foreign listings (2330.TW, 6758.T, ABEV3.SA) duplicate held US ADRs
        // with junk prices — exclude anything with a digit in the ticker.
        const tradeable = c => c.ticker && !/\d/.test(c.ticker);

        const candidates = companies.filter(tradeable).map(c => {
            const px = num(c.current_price), fv = num(c.avg_fair_value);
            const gap = (px && fv != null) ? (fv - px) / px * 100 : null;
            const lo = num(c.fair_value_low), hi = num(c.fair_value_high);
            // Extreme gaps (>80%) are model artifacts, not edges — untrust them
            // so they sink rather than top the ledger (the mock's "verify" case).
            const rangeOk = (lo && hi && lo > 0) ? (hi / lo <= 2.5) : true;
            const extreme = gap != null && Math.abs(gap) > 80;
            const provenance = ['valuation'];
            if (narrByTk.has(c.ticker)) provenance.push('scrapbook');
            if (cortexTk.has(c.ticker)) provenance.push('cortex');
            if (watchSet.has(c.ticker)) provenance.push('watchlist');
            return {
                tk: c.ticker, name: c.company_name, sector: c.sector,
                fvGapPct: gap == null ? null : +gap.toFixed(1),
                fvTrustworthy: rangeOk && fv != null && !extreme,
                held: heldSet.has(c.ticker),
                conviction: heldConv.get(c.ticker) ?? null,
                provenance,
                maxCorrToBook: maxCorr(c.ticker),
                excessVar: varMap.get(c.ticker) ?? null,
                thesis: c.thesis_summary || null,
            };
        }).filter(c => c.fvGapPct != null && isFinite(c.fvGapPct));

        const ledger = rankLedger(candidates, heldList).slice(0, MAX_LEDGER)
            .map(l => { const t = timingFor(l.tk); return t ? { ...l, ...t } : l; });
        // Normalise + dedupe sector notes onto the book taxonomy before tilting.
        const seenSec = new Set();
        const normNotes = sectorNotes.map(n => ({ ...n, sector: normSector(n.sector) }))
            .filter(n => (seenSec.has(n.sector) ? false : seenSec.add(n.sector)));
        const tilts = sectorTilts(normNotes, sectorWeights);
        const topThesis = ledger.slice(0, 3).map(l => {
            const n = narrByTk.get(l.tk) || null;
            return { tk: l.tk, thesis: l.thesis, fvGapPct: l.fvGapPct, fit: l.fit, fundFrom: l.fundFrom, timing: l.timing || null, timingBecause: l.because || null, narrative: n ? { thesis: n.thesis, verdict: n.investment_verdict, upside: num(n.avg_upside_pct) } : null };
        });
        const sorted = Object.entries(sectorWeights).sort((a, b) => b[1] - a[1]);
        const frame = { topSector: sorted[0] ? sorted[0][0] : null, topSectorPct: sorted[0] ? +sorted[0][1].toFixed(0) : null, valued: candidates.length };

        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=21600');
        return res.status(200).json({ ok: true, asOf: new Date().toISOString(), ledger, sectorTilts: tilts, frame, topThesis });
    } catch (e) {
        return res.status(200).json({ ok: false, error: (e && e.message) || 'opportunities error', ledger: [], sectorTilts: [] });
    }
}
