// ============================================================
// Nexus Theme — per-theme aggregation (pure transforms)
// ------------------------------------------------------------
// Side-effect-free, IO-free. Rolls the live book up to the theme
// (sector) level for the Theme tab: how each theme is positioned, how
// it's moving today, where conviction and valuation sit, and the
// action mix the read engine derived. Share / move / risk come from
// the spine (single source of truth); the rest from the holdings.
// ============================================================

const READS = ['add', 'hold', 'trim', 'watch', 'exit'];

// holdings + spine → per-theme rows, heaviest share first.
export function buildThemeView(holdings, spine) {
    const bySpine = new Map((spine || []).map(s => [s.theme, s]));
    const m = new Map();
    for (const h of holdings || []) {
        const t = h.theme || 'Unclassified';
        const g = m.get(t) || { theme: t, count: 0, convSum: 0, contribSum: 0, varSum: 0, fvSum: 0, fvN: 0, reads: {}, names: [] };
        g.count += 1;
        g.convSum += Number(h.conviction) || 0;
        g.contribSum += Number(h.contribPct) || 0;
        g.varSum += Number(h.componentVar) || 0;
        if (h.fvGapPct != null && isFinite(Number(h.fvGapPct))) { g.fvSum += Number(h.fvGapPct); g.fvN += 1; }
        g.reads[h.read] = (g.reads[h.read] || 0) + 1;
        g.names.push(h);
        m.set(t, g);
    }

    const rows = [...m.values()].map(g => {
        const sp = bySpine.get(g.theme) || {};
        const avgConv = g.count ? Math.round(g.convSum / g.count) : 0;
        const avgFv = g.fvN ? g.fvSum / g.fvN : null;
        const tilt = avgFv == null ? null : (avgFv > 8 ? 'cheap' : avgFv < -8 ? 'rich' : 'fair');
        const topNames = g.names.slice()
            .sort((a, b) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0))
            .slice(0, 4)
            .map(n => n.tk);
        const reads = {};
        READS.forEach(r => { if (g.reads[r]) reads[r] = g.reads[r]; });
        return {
            theme: g.theme,
            sharePct: sp.sharePct != null ? sp.sharePct : null,
            movePct: sp.movePct != null ? sp.movePct : null,
            contribPct: +g.contribSum.toFixed(2),
            varSharePct: +g.varSum.toFixed(1),
            count: g.count,
            avgConviction: avgConv,
            avgFvGapPct: avgFv == null ? null : +avgFv.toFixed(1),
            valuationTilt: tilt,
            reads,
            topNames,
            riskShift: sp.riskShift != null ? sp.riskShift : 0,
            fragility: !!sp.fragility,
            stale: !!sp.stale,
        };
    });

    rows.sort((a, b) => (b.sharePct || 0) - (a.sharePct || 0));
    return rows;
}

// Leaders / laggards by today's move, plus the heaviest theme — a one-line
// transmission summary for the section header.
export function themeLeaders(rows) {
    const withMove = (rows || []).filter(r => r.movePct != null);
    if (!withMove.length) return { top: null, leader: null, laggard: null };
    const byMove = withMove.slice().sort((a, b) => b.movePct - a.movePct);
    const byShare = (rows || []).slice().sort((a, b) => (b.sharePct || 0) - (a.sharePct || 0));
    return {
        top: byShare[0] || null,
        leader: byMove[0] || null,
        laggard: byMove[byMove.length - 1] || null,
    };
}
