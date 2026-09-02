// ============================================================
// Nexus Spine — REAL provider (live book → NexusModel)
// ------------------------------------------------------------
// getNexusModel(): Promise<NexusModel> — same signature as the
// mock. This is the "go live" pass: the data-backed sections are
// computed from the real portfolio instead of synthetic literals.
//
// Wired live this pass (sourced from vw_nexus_holdings + the
// valuation composites in valuation_health):
//   • holdings   — every Live Object row, with computeRead() run
//                  over real ingredients (conviction, VaR, FV gap,
//                  signal tone, real staleness).
//   • spine      — sector aggregation (share / move / risk shift),
//                  with themeSpine carrying the same cut by theme.
//   • gauges.concentration — effective N, top factor, fragility.
//   • dataIntegrity — already live (feed freshness + sync age).
//
// Deferred to their own feeds (carried from the structural baseline
// until they wire in, per the spine philosophy — "as step-2 feeds
// light up, the model improves section by section"):
//   • windshield macro stats, gauges.risk / gauges.performance,
//     the Read narrative, chef, seasonal.
//
// Resilience: if Supabase is unconfigured, errors, or returns an
// empty book, we return the structural baseline unchanged — the
// page renders the same as the mock provider, never blank.
//
// All maths lives in nexusLiveCompute.js (pure, unit-tested); this
// file is only the IO + assembly.
// ============================================================

import { sb } from '../config.js';
import { getNexusModel as getBaselineModel } from './nexusMock.js';
import { num, buildLiveSections, buildWindshield, buildSeasonal, buildChef, buildRead } from './nexusLiveCompute.js';
import { toOptionsModel } from './nexusOptionsCompute.js';

// Live macro snapshot (FRED yields + regime + market quotes) from the
// shared /api/macro endpoint. Same-origin, edge-cached; null on any
// failure so the windshield falls back to baseline.
async function loadMacro() {
    try {
        const r = await fetch('/api/macro');
        if (!r.ok) return null;
        const j = await r.json();
        return j && !j.error ? j : null;
    } catch (e) {
        return null;
    }
}

// Supabase-independent panel endpoints (board / earnings / COT). These three
// panels used to fetch for themselves on mount; the provider owns the fetch now
// so a collapsed tile can read a headline without mounting the panel. Same
// shape as loadMacro(): same-origin, `ok` check, null on any failure so each
// panel falls back to its own unavailable state rather than throwing.
async function loadBoard() {
    try {
        const r = await fetch('/api/nexus-board');
        if (!r.ok) return null;
        const j = await r.json();
        return j && j.ok ? j : null;
    } catch (e) {
        return null;
    }
}

async function loadEarnings() {
    try {
        const r = await fetch('/api/nexus-earnings');
        if (!r.ok) return null;
        const j = await r.json();
        return j && j.ok ? j : null;
    } catch (e) {
        return null;
    }
}

async function loadCot() {
    try {
        const r = await fetch('/api/nexus-cot');
        if (!r.ok) return null;
        const j = await r.json();
        return j && j.ok ? j : null;
    } catch (e) {
        return null;
    }
}

async function loadComposites() {
    try {
        const { data, error } = await sb.from('valuation_health').select('ticker, avg_fair_value');
        if (error) throw error;
        const m = new Map();
        (data || []).forEach(r => {
            const v = num(r.avg_fair_value);
            if (v != null) m.set(r.ticker, v);
        });
        return m;
    } catch (e) {
        return new Map();
    }
}

async function loadHoldingRows() {
    try {
        const { data, error } = await sb.from('vw_nexus_holdings').select('*');
        if (error) throw error;
        return data || [];
    } catch (e) {
        return null; // signal: fall back to baseline
    }
}

// The cash-flow return engine (step 2), for the SINCE ENTRY / MWR toggle.
// Read from the nightly snapshot: vw_position_returns recomputes an IRR and a
// self-counterfactual per position (~940ms) and has no business in a page load.
// Absent or erroring → empty map, so rows simply carry no MWR and the toggle
// renders a stated reason rather than a substituted number.
async function loadReturnEngine() {
    try {
        const { data, error } = await sb.from('mv_position_returns')
            .select('symbol, position_mwr_period_pct, position_mwr_pct, position_twr_pct, engine_status, engine_reason, days_held');
        if (error) throw error;
        const m = new Map();
        (data || []).forEach(r => { if (r.symbol) m.set(r.symbol, r); });
        return m;
    } catch (e) {
        return new Map();
    }
}

// Options positioning per name (held filter is implicit — we look up by ticker).
// One read from the canonical nexus_options view; absent/error → empty map, so
// holdings simply render no options tone (hasOptions:false).
async function loadOptions() {
    try {
        const { data, error } = await sb.from('nexus_options').select('*');
        if (error) throw error;
        const m = new Map();
        (data || []).forEach(r => { if (r && r.tk) m.set(r.tk, toOptionsModel(r)); });
        return m;
    } catch (e) {
        return new Map();
    }
}

// Saved scrapbook research per name — the thesis summary + conviction the user
// wrote in the Valuation Scrapbook. Surfaced on held rows so notes on names you
// already own stay visible in Nexus (the Opportunities ledger is a buy-new
// engine and deliberately won't headline existing holdings). Empty map on any
// failure, so holdings still render.
async function loadScrapbookThesis() {
    try {
        const { data, error } = await sb.from('scrapbook_companies')
            .select('ticker, thesis_summary, conviction_rating')
            .not('thesis_summary', 'is', null);
        if (error) throw error;
        const m = new Map();
        (data || []).forEach(r => { if (r && r.ticker) m.set(r.ticker, r); });
        return m;
    } catch (e) {
        return new Map();
    }
}

/** @returns {Promise<import('./nexusModel.js').NexusModel>} */
export async function getNexusModel() {
    // Structural baseline carries the not-yet-live sections (windshield,
    // risk/perf gauges, the Read narrative, chef, seasonal) AND a live
    // dataIntegrity. We override the data-backed sections below.
    // Board, earnings and COT do not touch Supabase, so they are STARTED here —
    // above every guard below — and merged into the baseline on both fallback
    // paths. Inside the existing Promise.all they would sit past the early
    // returns and the three panels would vanish whenever Supabase is
    // unconfigured, erroring or the book is empty — the exact state where macro
    // context matters most, and the one their self-fetch used to survive.
    //
    // Started, not awaited. Nothing below reads these three, so awaiting them
    // here put three network round-trips on the critical path ahead of the
    // book: the model could not begin loading holdings until the slowest of
    // them returned. Cold on production that was 2.6s (board) and 3.0s
    // (earnings) of dead wait before the first Supabase query was even issued.
    // Held as promises they overlap the baseline, the holdings query and the
    // five-way load instead, and are awaited only where the model is assembled.
    //
    // Each is still called exactly once per getNexusModel() — the promise is
    // reused, not re-invoked — which is what nexusLiveProvider.test.mjs pins.
    const boardP = loadBoard();
    const earningsP = loadEarnings();
    const cotP = loadCot();
    const panelsOf = async () => ({
        board: await boardP, earnings: await earningsP, cot: await cotP,
    });

    // Structural baseline carries the not-yet-live sections; now that the three
    // panel fetches are in flight, this await overlaps them rather than queuing
    // behind them.
    const baseline = await getBaselineModel();

    if (!sb) return { ...baseline, ...(await panelsOf()) };

    const rows = await loadHoldingRows();
    // unconfigured / empty / error → baseline
    if (!rows || !rows.length) return { ...baseline, ...(await panelsOf()) };

    const staleSet = new Set((baseline.dataIntegrity && baseline.dataIntegrity.staleTickers) || []);
    const [compByTk, macro, optByTk, scrapByTk, retByTk] = await Promise.all([
        loadComposites(), loadMacro(), loadOptions(), loadScrapbookThesis(), loadReturnEngine(),
    ]);

    const sections = buildLiveSections(rows, compByTk, staleSet);
    const { spine, themeSpine, concentration, nav, portfolio } = sections;
    // Attach the options block per holding (adjacent signal — does NOT feed the
    // read engine; the verdict was already computed in buildLiveSections) and the
    // saved scrapbook thesis/conviction (surfaced in the row's WHY drawer).
    const holdings = sections.holdings.map(h => {
        const o = optByTk.get(h.tk);
        const sc = scrapByTk.get(h.tk);
        let out = o ? { ...h, options: o } : h;
        // Engine figures ride alongside totalReturnPct rather than replacing
        // it: the toggle picks between them at render time, so both bases stay
        // available and neither is silently substituted for the other.
        const rr = retByTk.get(h.tk);
        out = {
            ...out,
            mwrPct: rr && rr.position_mwr_period_pct != null ? Number(rr.position_mwr_period_pct) * 100 : null,
            engineStatus: rr ? rr.engine_status : null,
            engineReason: rr ? rr.engine_reason : null,
        };
        if (sc) out = { ...out, scrapbookThesis: sc.thesis_summary || null, scrapbookConviction: sc.conviction_rating || null };
        return out;
    });

    // Windshield macro tiles (live, falls back to baseline if FRED is down);
    // seasonal Theme/Regime/Opportunities/Drift derived from the live book + macro.
    const windshield = buildWindshield(macro) || baseline.windshield;
    const seasonal = buildSeasonal({ spine, concentration, holdings, macro });
    const chef = buildChef({ spine, holdings, concentration });
    // The Read narrative, assembled from the same live ingredients (falls
    // back to the structural baseline when macro is down).
    const read = buildRead({ macro, concentration, holdings, spine }) || baseline.read;

    return {
        ...baseline,
        ...(await panelsOf()),
        asOf: new Date().toISOString(),
        holdings,
        spine,
        themeSpine,
        nav,
        portfolio,
        gauges: { ...baseline.gauges, concentration },
        windshield,
        seasonal,
        chef,
        read,
    };
}
