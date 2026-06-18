// ============================================================
// Nexus Drift — rebalance/balance transforms (pure, IO-free)
// ------------------------------------------------------------
// The Drift tab's job is balance: how far has the book wandered from its
// conviction-target weights, and what would pull it back? Every input is
// already in the resolved model — each holding carries currentWeightPct /
// targetWeightPct (the sizing engine's conviction-implied target) and the
// concentration gauge carries effective-N / fragility. These functions turn
// that into per-name drift, theme-level drift, and a "what to rebalance" read.
// Side-effect-free so the maths is unit-testable under plain node.
// ============================================================

const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const sgn = (v, dp = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dp));

// Derivative positions (OCC option contracts, e.g. XLK260618P00191000) sit in
// the book as hedges, not conviction-sized core holdings — the sizing engine
// still target-weights them, which would surface a nonsensical "add to a put".
// Exclude them from the rebalance lens.
const isDerivative = tk => /\d{6}[CP]\d{8}$/.test(String(tk || ''));

// Per-name drift from the conviction target. driftPpt = current − target (ppt of
// NAV): + = overweight (trim back), − = underweight (add). Names without a target
// (no conviction yet) are excluded rather than shown as a fake full-overweight.
// Sorted by magnitude — the names pulling the book off balance first.
export function buildDriftRows(holdings, cfg = {}) {
    const band = cfg.band == null ? 0.25 : cfg.band; // ppt dead-band: within this = on target
    return (holdings || [])
        .map(h => {
            const cur = num(h.currentWeightPct), tgt = num(h.targetWeightPct);
            if (cur == null || tgt == null || isDerivative(h.tk)) return null;
            const drift = +(cur - tgt).toFixed(2);
            return {
                tk: h.tk,
                theme: h.theme || 'Unclassified',
                objectId: h.objectId,
                currentWeightPct: +cur.toFixed(2),
                targetWeightPct: +tgt.toFixed(2),
                driftPpt: drift,
                absDrift: +Math.abs(drift).toFixed(2),
                conviction: num(h.conviction),
                side: drift > band ? 'trim' : drift < -band ? 'add' : 'on',
                stale: !!h.stale,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.absDrift - a.absDrift);
}

// Book-level rebalance summary. turnoverPct = Σ positive drift ≈ the one-sided
// trade (as % of NAV) needed to snap back — the sizing engine normalises targets
// to the invested weight, so Σ over ≈ Σ under. The biggest overweight is the
// clearest trim; the biggest underweight the clearest add.
export function driftSummary(rows, cfg = {}) {
    const material = cfg.material == null ? 1 : cfg.material; // ppt
    const list = rows || [];
    const over = list.filter(r => r.side === 'trim').sort((a, b) => b.driftPpt - a.driftPpt);
    const under = list.filter(r => r.side === 'add').sort((a, b) => a.driftPpt - b.driftPpt);
    const turnoverPct = +over.reduce((a, r) => a + r.driftPpt, 0).toFixed(1);
    return {
        valued: list.length,
        turnoverPct,
        nMaterial: list.filter(r => r.absDrift >= material).length,
        overCount: over.length,
        underCount: under.length,
        topTrim: over[0] || null,   // biggest overweight
        topAdd: under[0] || null,   // biggest underweight
    };
}

// Theme-level drift — sum current vs target weight per theme, so a theme that's
// crept above (or below) its conviction-implied footprint surfaces. Sorted by
// magnitude.
export function themeDrift(holdings) {
    const m = new Map();
    for (const h of holdings || []) {
        const cur = num(h.currentWeightPct), tgt = num(h.targetWeightPct);
        if (cur == null || tgt == null || isDerivative(h.tk)) continue;
        const t = h.theme || 'Unclassified';
        const g = m.get(t) || { theme: t, current: 0, target: 0, count: 0 };
        g.current += cur; g.target += tgt; g.count += 1;
        m.set(t, g);
    }
    return [...m.values()]
        .map(g => ({
            theme: g.theme,
            currentPct: +g.current.toFixed(1),
            targetPct: +g.target.toFixed(1),
            driftPpt: +(g.current - g.target).toFixed(1),
            count: g.count,
        }))
        .sort((a, b) => Math.abs(b.driftPpt) - Math.abs(a.driftPpt));
}

// Concentration posture from the gauge — top-heavy when effective-N has collapsed
// well below the nominal count (a few names carry the book).
export function concentrationPosture(concentration) {
    const c = concentration || {};
    const eff = num(c.effectiveN), nom = num(c.nominalN);
    const concentrated = eff != null && nom ? eff < nom * 0.6 : false;
    return { effectiveN: eff, nominalN: nom, topFactorPct: num(c.topFactorPct), concentrated, fragility: c.fragilityCluster || [] };
}

// The rebalance read — turnover, the clearest trim/add, and whether the move also
// de-risks concentration. Transparent, structural; degrades when on-target.
export function driftRead(summary, concentration) {
    const post = concentrationPosture(concentration);
    const trim = summary.topTrim, add = summary.topAdd;
    if (!trim && !add) {
        return { text: 'The book sits on its conviction targets — nothing material to rebalance.', trimTk: null, addTk: null, concentrated: post.concentrated };
    }
    const parts = [];
    if (trim) parts.push('trim ' + trim.tk + ' (' + sgn(trim.driftPpt) + ' ppt over)');
    if (add) parts.push('add to ' + add.tk + ' (' + sgn(add.driftPpt) + ' ppt under)');
    let text = 'About ' + summary.turnoverPct.toFixed(1) + ' ppt of NAV has drifted from target — ' + parts.join(', ') + '.';
    if (post.concentrated && post.effectiveN != null) {
        text += ' Effective N is ' + post.effectiveN + ' of ' + post.nominalN + ' — top-heavy, so the rebalance also de-risks concentration.';
    }
    return { text, trimTk: trim ? trim.tk : null, addTk: add ? add.tk : null, concentrated: post.concentrated };
}
