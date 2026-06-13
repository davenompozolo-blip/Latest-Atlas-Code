// ============================================================
// Nexus Live — pure transforms (vw_nexus_holdings → model parts)
// ------------------------------------------------------------
// Side-effect-free, IO-free. The provider (nexusLive.js) handles
// the Supabase reads, then hands the raw rows here. Kept separate
// so the maths is unit-testable under plain node — nexusLive.js
// transitively imports the Supabase client (import.meta.env), which
// only resolves under Vite.
//
// Only dependency is the (pure) read engine.
// ============================================================

import { computeRead, READ_CONFIG, ConcentrationPenalty } from './readEngine.js';

// A view numeric is null/'' → null, else Number.
export const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// ── Cortex tone the read engine consumes ──────────────────────
// The view ships human signal text; map it to the structured tone.
// Unknown/empty → neutral, so a missing feed never fabricates a
// directional read.
export function toSignalTone(row) {
    const s = `${row.quant_signal || ''} ${row.technical_signal || ''}`.toLowerCase();
    if (/improv|bullish|upgrade|accumulat|strengthen|breakout/.test(s)) return 'improving';
    if (/deterior|bearish|downgrade|weaken|distribut|breakdown/.test(s)) return 'deteriorating';
    return 'neutral';
}

// ── Fair-value gap — signed % upside ──────────────────────────
// Prefer OUR composite (valuation_health.avg_fair_value vs live
// price); fall back to the view's own DCF upside when a name has no
// trusted composite. null when neither exists — computeRead then
// treats it as neither cheap nor rich (no read invented from a
// missing valuation).
export function fvGapPct(row, compByTk) {
    const comp = compByTk.get(row.symbol);
    const price = num(row.current_price);
    if (comp != null && price && price > 0) return ((comp - price) / price) * 100;
    return num(row.dcf_upside_pct);
}

// ── One view row → one Holding (contract shape, pre-read) ─────
export function mapHolding(row, compByTk, staleSet) {
    const gap = fvGapPct(row, compByTk);
    return {
        tk: row.symbol,
        theme: row.sector || 'Unclassified',
        conviction: num(row.conviction_score) ?? 0,
        todayPct: num(row.daily_return_pct) ?? 0,
        // Contribution to book daily return (pts). The view's pnl_contribution
        // is a raw $ amount and not reliably signed, so derive it from the
        // position's weight share × today's move — sign-correct and on the
        // same scale as Today.
        contribPct: ((num(row.weight_pct) ?? 0) * (num(row.daily_return_pct) ?? 0)) / 100,
        componentVar: num(row.var_contribution_pct) ?? 0,
        // null (not 0) when there's no composite and no DCF — an unknown gap
        // renders as "—", never a misleading "fairly valued" 0.0%.
        fvGapPct: gap,
        signal: row.valuation_signal || null,
        signalTone: toSignalTone(row),
        stale: staleSet.has(row.symbol),
        objectId: 'obj-' + String(row.symbol || '').toLowerCase(),
    };
}

// ── Spine — aggregate the raw book by theme (sector) ──────────
// share  = Σ weight_pct                     (theme footprint)
// move   = weight-weighted Σ daily_return   (theme P&L today)
// riskShift = risk *density* bucketed: a theme carrying more of the
//   VaR than its share earns a positive shift; less, negative.
// fragility = the single heaviest-VaR theme (the cluster the
//   concentration gauge flags), when it is also a real weight.
export function buildSpine(rows, staleSet) {
    const totalVar = rows.reduce((a, r) => a + (num(r.var_contribution_pct) || 0), 0) || 1;
    const m = new Map();
    for (const r of rows) {
        const theme = r.sector || 'Unclassified';
        const w = num(r.weight_pct) || 0;
        const ret = num(r.daily_return_pct) || 0;
        const v = num(r.var_contribution_pct) || 0;
        const g = m.get(theme) || { theme, share: 0, moveW: 0, varSum: 0, anyFresh: false };
        g.share += w;
        g.moveW += w * ret;
        g.varSum += v;
        if (!staleSet.has(r.symbol)) g.anyFresh = true;
        m.set(theme, g);
    }

    const fragileTheme = [...m.values()].sort((a, b) => b.varSum - a.varSum)[0];
    return [...m.values()]
        .sort((a, b) => b.share - a.share)
        .map(g => {
            const share = +g.share.toFixed(1);
            const movePct = +(g.share ? g.moveW / g.share : 0).toFixed(1);
            const varShare = (g.varSum / totalVar) * 100;
            const density = share > 0 ? varShare / share : 0;
            const riskShift = density >= 1.5 ? 2 : density >= 1.1 ? 1 : density <= 0.6 ? -1 : 0;
            const row = { theme: g.theme, sharePct: share, movePct, riskShift };
            if (!g.anyFresh) row.stale = true;
            if (fragileTheme && g.theme === fragileTheme.theme && share >= 5) row.fragility = true;
            return row;
        });
}

// ── Concentration gauge — derived from the real weights/VaR ───
// effectiveN = 1 / Σ wᵢ²  (Herfindahl effective number of bets)
// topFactorPct = share of total VaR carried by the heaviest theme
// fragilityCluster = the heaviest-VaR theme's largest names
export function buildConcentration(rows) {
    const nominalN = rows.length;
    const wsum = rows.reduce((a, r) => a + (num(r.weight_pct) || 0), 0) || 1;
    const hhi = rows.reduce((a, r) => {
        const w = (num(r.weight_pct) || 0) / wsum;
        return a + w * w;
    }, 0);
    const effectiveN = hhi > 0 ? 1 / hhi : nominalN;

    const totalVar = rows.reduce((a, r) => a + (num(r.var_contribution_pct) || 0), 0) || 1;
    const themeVar = new Map();
    for (const r of rows) {
        const t = r.sector || 'Unclassified';
        themeVar.set(t, (themeVar.get(t) || 0) + (num(r.var_contribution_pct) || 0));
    }
    const [topTheme, topVar] = [...themeVar.entries()].sort((a, b) => b[1] - a[1])[0] || ['—', 0];
    const topFactorPct = Math.round((topVar / totalVar) * 100);
    const fragilityCluster = rows
        .filter(r => (r.sector || 'Unclassified') === topTheme)
        .sort((a, b) => (num(b.var_contribution_pct) || 0) - (num(a.var_contribution_pct) || 0))
        .slice(0, 4)
        .map(r => r.symbol);

    // Fragile when the book concentrates into few effective bets
    // relative to its nominal breadth.
    const fragile = nominalN >= 10 && effectiveN < nominalN * 0.35;
    return {
        effectiveN: +effectiveN.toFixed(1),
        nominalN,
        topFactorPct,
        fragilityCluster,
        verdictChip: fragile ? 'Fragile' : 'Diversified',
        note: `Effective N of ${effectiveN.toFixed(0)} against ${nominalN} names — ` +
              `${topTheme} carries ${topFactorPct}% of factor risk.`,
    };
}

// ── Orchestrate the live sections from raw rows ───────────────
// Pure: rows + composite map + stale set → { holdings, spine,
// concentration }. computeRead runs over the real ingredients with
// the full book in scope for the room assessor.
export function buildLiveSections(rows, compByTk, staleSet) {
    const book = { holdings: [] };
    const ingredients = rows.map(r => {
        const ing = mapHolding(r, compByTk, staleSet);
        book.holdings.push(ing);
        return ing;
    });
    const holdings = ingredients.map(ing => ({
        ...ing,
        ...computeRead(ing, book, READ_CONFIG, ConcentrationPenalty),
    }));
    return {
        holdings,
        spine: buildSpine(rows, staleSet),
        concentration: buildConcentration(rows),
    };
}
