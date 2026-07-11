// ============================================================
// Nexus Regime — macro-regime transforms (pure, IO-free)
// ------------------------------------------------------------
// The Regime tab's job is alignment: is the book positioned for the
// macro regime we're actually in? Classification comes from /api/macro
// (a growth × inflation 2×2); this module turns it into a playbook, a
// macro dashboard, the book's fit, and a regime read. All pure so the
// maths is unit-testable under plain node.
// ============================================================

// What each regime rewards / punishes (by book sector), plus its duration
// and risk posture. Domain mapping — the regime "playbook".
export const PLAYBOOKS = {
    Goldilocks:  { rewards: ['Technology', 'Consumer Discretionary', 'Communications', 'Industrials'], punishes: ['Energy', 'Materials'], duration: 'neutral', risk: 'on',  summary: 'growth without inflation — risk-on; growth and long-duration lead, real assets lag' },
    Reflation:   { rewards: ['Energy', 'Materials', 'Financials', 'Industrials'], punishes: ['Technology', 'Real Estate', 'Fixed Income', 'Utilities'], duration: 'short', risk: 'on',  summary: 'growth and inflation rising — cyclicals and real assets lead; long-duration lags' },
    Stagflation: { rewards: ['Energy', 'Materials', 'Healthcare'], punishes: ['Technology', 'Consumer Discretionary', 'Financials'], duration: 'short', risk: 'off', summary: 'inflation without growth — commodities and defensives hold; risk and duration both hurt' },
    Deflation:   { rewards: ['Fixed Income', 'Utilities', 'Healthcare', 'Technology'], punishes: ['Energy', 'Materials', 'Financials'], duration: 'long', risk: 'off', summary: 'growth and inflation falling — quality, long-duration and defensives lead' },
};
const UNKNOWN = { rewards: [], punishes: [], duration: 'neutral', risk: 'neutral', summary: 'regime still assessing — not enough signal to call growth and inflation' };

export function regimePlaybook(label) {
    return PLAYBOOKS[label] || UNKNOWN;
}

// Which way the regime pushes the book — the Theme tab's banner line.
// Derived from the playbook's risk posture, null while still assessing.
export function rotationBias(label) {
    const pb = PLAYBOOKS[label];
    if (!pb) return null;
    return pb.risk === 'on' ? 'Defensive → Cyclical' : 'Cyclical → Defensive';
}

const lastTwo = arr => {
    if (!Array.isArray(arr) || !arr.length) return null;
    return { latest: arr[arr.length - 1].value, prev: arr.length > 1 ? arr[arr.length - 2].value : null };
};

// One dashboard row from a series. opt: { fmt, dp, bp (delta in bp), invert
// (rising = bad → 'down' tone), dsuffix }.
function row(group, label, series, opt = {}) {
    const t = lastTwo(series);
    if (!t || t.latest == null) return null;
    const value = opt.fmt ? opt.fmt(t.latest) : t.latest.toFixed(opt.dp == null ? 2 : opt.dp) + (opt.suffix == null ? '%' : opt.suffix);
    let delta = null, deltaTone = 'neutral';
    if (t.prev != null) {
        const raw = t.latest - t.prev;
        const dv = opt.bp ? raw * 100 : raw;
        const ddp = opt.ddp == null ? (opt.bp ? 0 : 2) : opt.ddp;
        delta = (dv >= 0 ? '+' : '−') + Math.abs(dv).toFixed(ddp) + (opt.bp ? 'bp' : (opt.dsuffix || ''));
        const up = raw > 0, down = raw < 0;
        deltaTone = opt.invert ? (up ? 'down' : down ? 'up' : 'neutral') : (up ? 'up' : down ? 'down' : 'neutral');
    }
    return { group, label, value, delta, deltaTone };
}

// The defining macro indicators, grouped. Rising tone is good unless inverted.
export function macroIndicators(macro) {
    const y = (macro && macro.yields) || {};
    const inf = (macro && macro.inflation) || {};
    const g = (macro && macro.growth) || {};
    const cr = (macro && macro.credit) || {};
    const vol = (macro && macro.volatility) || {};
    const reg = (macro && macro.regime) || {};
    const out = [];
    const add = r => { if (r) out.push(r); };

    add(row('Rates', 'Fed Funds', y.fedFunds));
    add(row('Rates', '2Y UST', y.dgs2, { bp: true }));
    add(row('Rates', '10Y UST', y.dgs10, { bp: true }));
    const d2 = lastTwo(y.dgs2), d10 = lastTwo(y.dgs10);
    if (d2 && d10 && d2.latest != null && d10.latest != null) {
        const v = (d10.latest - d2.latest) * 100;
        const pv = (d2.prev != null && d10.prev != null) ? (d10.prev - d2.prev) * 100 : null;
        const dd = pv != null ? v - pv : null;
        out.push({ group: 'Rates', label: '10Y–2Y curve', value: (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(0) + 'bp', delta: dd != null ? (dd >= 0 ? '+' : '−') + Math.abs(dd).toFixed(0) + 'bp' : null, deltaTone: v < 0 ? 'down' : 'up' });
    }

    if (reg.cpiYoY != null) out.push({ group: 'Inflation', label: 'CPI YoY', value: reg.cpiYoY.toFixed(1) + '%', delta: null, deltaTone: reg.cpiYoY >= 3 ? 'down' : 'up' });
    add(row('Inflation', '5y breakeven', inf.breakeven5y));

    add(row('Growth', 'Unemployment', g.unrate, { invert: true, dp: 1 }));
    add(row('Growth', 'Jobless claims', g.claims, { fmt: v => (v / 1000).toFixed(0) + 'k', invert: true, dsuffix: 'k', ddp: 0, suffix: 'k' }));

    add(row('Stress', 'VIX', vol.vix, { fmt: v => v.toFixed(1), invert: true, suffix: '', dsuffix: '' }));
    add(row('Stress', 'HY spreads', cr.hySpreads, { invert: true }));
    return out;
}

// Book fit — spine (sector shares) scored against the regime playbook.
// score ∈ [-1, 1]: +ve = tilted toward what the regime rewards.
export function bookRegimeFit(spine, label) {
    const pb = regimePlaybook(label);
    const rew = new Set(pb.rewards), pun = new Set(pb.punishes);
    let wsum = 0, num = 0;
    const aligned = [], misaligned = [];
    for (const s of spine || []) {
        const w = Number(s.sharePct) || 0;
        if (w <= 0) continue;
        wsum += w;
        if (rew.has(s.theme)) { num += w; aligned.push({ theme: s.theme, sharePct: +w.toFixed(1) }); }
        else if (pun.has(s.theme)) { num -= w; misaligned.push({ theme: s.theme, sharePct: +w.toFixed(1) }); }
    }
    aligned.sort((a, b) => b.sharePct - a.sharePct);
    misaligned.sort((a, b) => b.sharePct - a.sharePct);
    return {
        score: wsum ? +(num / wsum).toFixed(2) : 0,
        aligned, misaligned,
        alignedWeight: +aligned.reduce((a, x) => a + x.sharePct, 0).toFixed(1),
        misalignedWeight: +misaligned.reduce((a, x) => a + x.sharePct, 0).toFixed(1),
    };
}

// The regime read — alignment verdict + a concrete tilt.
export function regimeRead(label, fit) {
    const pb = regimePlaybook(label);
    if (!PLAYBOOKS[label]) return { verdict: 'unknown', text: 'Regime is still assessing — hold positioning decisions until growth and inflation resolve.' };
    const verdict = fit.score > 0.15 ? 'aligned' : fit.score < -0.15 ? 'misaligned' : 'neutral';
    const names = arr => arr.slice(0, 3).map(x => x.theme).join(', ');
    let text;
    if (verdict === 'aligned') {
        text = 'Your book leans into the ' + label + ' regime — ' + fit.alignedWeight + '% sits in what it rewards (' + names(fit.aligned) + '). Stay the course; press the leaders.';
    } else if (verdict === 'misaligned') {
        text = 'Your book is offside the ' + label + ' regime — ' + fit.misalignedWeight + '% sits in what it punishes (' + names(fit.misaligned) + '). Tilt toward ' + pb.rewards.slice(0, 3).join(', ') + '.';
    } else {
        text = 'Your book is roughly regime-neutral. ' + label + ' rewards ' + pb.rewards.slice(0, 2).join(', ') + ' and punishes ' + pb.punishes.slice(0, 2).join(', ') + ' — lean toward the formers for the tailwind.';
    }
    return { verdict, text };
}

// Quadrant geometry for the 2×2 map: growth (Y) × inflation (X).
export function regimeQuadrant(label) {
    return {
        growthUp: label === 'Goldilocks' || label === 'Reflation',
        inflationUp: label === 'Reflation' || label === 'Stagflation',
    };
}
