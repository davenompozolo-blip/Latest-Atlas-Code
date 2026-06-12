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
//   • spine      — theme aggregation (share / move / risk shift).
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
import { num, buildLiveSections } from './nexusLiveCompute.js';

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

/** @returns {Promise<import('./nexusModel.js').NexusModel>} */
export async function getNexusModel() {
    // Structural baseline carries the not-yet-live sections (windshield,
    // risk/perf gauges, the Read narrative, chef, seasonal) AND a live
    // dataIntegrity. We override the data-backed sections below.
    const baseline = await getBaselineModel();
    if (!sb) return baseline;

    const rows = await loadHoldingRows();
    if (!rows || !rows.length) return baseline; // unconfigured / empty / error → baseline

    const staleSet = new Set((baseline.dataIntegrity && baseline.dataIntegrity.staleTickers) || []);
    const compByTk = await loadComposites();

    const { holdings, spine, concentration } = buildLiveSections(rows, compByTk, staleSet);

    return {
        ...baseline,
        asOf: new Date().toISOString(),
        holdings,
        spine,
        gauges: { ...baseline.gauges, concentration },
    };
}
