// ============================================================
// Nexus Spine — REAL data integrity (not mocked)
// ------------------------------------------------------------
// Per the handoff spec §3/§7/§8, dataIntegrity is wired live this
// pass. It is computed from:
//   1. feed freshness     → vw_nexus_price_freshness (per-symbol
//                            last price_date vs today)
//   2. positioning age    → vw_sync_status (latest position sync)
//
// Both the mock provider and the eventual real provider call this
// same function, so the DataIntegrityIndicator is genuinely live
// regardless of which provider is wired for the rest of the model.
// ============================================================

import { sb } from '../config.js';

// A held symbol is "stale" once its last price is older than a full
// trading week. Weekends/holidays make 2–4 calendar days normal; >7
// reliably isolates feeds that have actually stopped updating
// (the OTC ADRs: TCEHY, NPSNY, PROSY, VWAGY).
const STALE_PRICE_DAYS = 7;

// Positioning thresholds (days since last successful position sync).
const POS_WARN_DAYS = 1;
const POS_BAD_DAYS  = 2;

/** @returns {Promise<import('./nexusModel.js').DataIntegrity>} */
export async function computeDataIntegrity() {
    // Safe default when Supabase isn't configured — surfaced as a warn,
    // never silently "ok".
    const fallback = { staleFeedCount: 0, positioningAgeDays: null, status: 'warn', staleTickers: [] };
    if (!sb) return fallback;

    const [freshness, positioning] = await Promise.all([
        loadStaleTickers(),
        loadPositioningAgeDays(),
    ]);

    const staleTickers   = freshness.staleTickers;
    const staleFeedCount = staleTickers.length;
    const positioningAgeDays = positioning;

    const status = deriveStatus(staleFeedCount, positioningAgeDays, freshness.errored);

    return { staleFeedCount, positioningAgeDays, status, staleTickers };
}

function deriveStatus(staleFeedCount, posAge, errored) {
    // Hard failure: can't read freshness, or positions are genuinely old.
    if (errored) return 'bad';
    if (posAge != null && posAge >= POS_BAD_DAYS) return 'bad';
    // Soft warning: some stale feeds, or positions a day behind.
    if (staleFeedCount > 0) return 'warn';
    if (posAge != null && posAge >= POS_WARN_DAYS) return 'warn';
    if (posAge == null) return 'warn';
    return 'ok';
}

async function loadStaleTickers() {
    try {
        const { data, error } = await sb
            .from('vw_nexus_price_freshness')
            .select('symbol, days_old')
            .gt('days_old', STALE_PRICE_DAYS)
            .order('days_old', { ascending: false });
        if (error) throw error;
        return { staleTickers: (data || []).map(r => r.symbol), errored: false };
    } catch (e) {
        return { staleTickers: [], errored: true };
    }
}

async function loadPositioningAgeDays() {
    try {
        const { data, error } = await sb
            .from('vw_sync_status')
            .select('finished_at, status')
            .order('finished_at', { ascending: false })
            .limit(1);
        if (error) throw error;
        const row = data && data[0];
        if (!row || !row.finished_at) return null;
        const ms = Date.now() - new Date(row.finished_at).getTime();
        return Math.max(0, Math.floor(ms / 86_400_000));
    } catch (e) {
        return null;
    }
}
