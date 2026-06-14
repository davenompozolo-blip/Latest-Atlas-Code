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

// ── Conviction-target sizing ──────────────────────────────────
// "How much to trade" expressed off the page's own signals + our
// positioning. Each name's target weight ∝ its conviction, normalised
// to the book's *invested* weight (a rebalance within the same gross,
// not a cash call). The quantum closes the gap to that target — but
// only in the direction the read already calls: ADD buys the shortfall,
// TRIM sells the excess, EXIT closes the line. HOLD / WATCH and names
// already at their conviction weight trade nothing.

// Book NAV via the weight identity every row shares (weight = |mv|/NAV).
// Median over the rows that carry both, so a stray row can't skew it.
export function bookNav(rows) {
    const navs = [];
    for (const r of rows) {
        const w = num(r.weight_pct), mv = num(r.market_value);
        if (w && mv != null && w !== 0) navs.push(Math.abs(mv) / (w / 100));
    }
    if (!navs.length) return null;
    navs.sort((a, b) => a - b);
    return navs[Math.floor(navs.length / 2)];
}

// symbol → conviction-implied target weight (% of NAV).
export function targetWeights(rows) {
    const invested = rows.reduce((a, r) => a + (num(r.weight_pct) || 0), 0);
    const convSum = rows.reduce((a, r) => a + Math.max(0, num(r.conviction_score) || 0), 0) || 1;
    const m = new Map();
    for (const r of rows) {
        const conv = Math.max(0, num(r.conviction_score) || 0);
        m.set(r.symbol, (conv / convSum) * invested);
    }
    return m;
}

// read + position context → signed trade quantum (shares + $).
// ctx = { nav, price, currentWeightPct, targetWeightPct, currentShares }
export function sizeTrade(read, ctx) {
    const blank = { tradeSide: null, tradeShares: null, tradeUsd: null, atTarget: false };
    if (!ctx || !ctx.nav || !ctx.price || ctx.price <= 0) return blank;
    const drift = ctx.targetWeightPct - ctx.currentWeightPct; // ppt of NAV
    if (read === 'exit') {
        const sh = ctx.currentShares != null ? Math.round(ctx.currentShares) : null;
        return sh ? { tradeSide: 'sell', tradeShares: -sh, tradeUsd: -sh * ctx.price, atTarget: false } : blank;
    }
    if (read === 'add') {
        if (drift > 0) { const usd = drift / 100 * ctx.nav; return { tradeSide: 'buy', tradeShares: Math.round(usd / ctx.price), tradeUsd: usd, atTarget: false }; }
        return { ...blank, atTarget: true };
    }
    if (read === 'trim') {
        if (drift < 0) { const usd = drift / 100 * ctx.nav; return { tradeSide: 'sell', tradeShares: Math.round(usd / ctx.price), tradeUsd: usd, atTarget: false }; }
        return { ...blank, atTarget: true };
    }
    return blank; // hold / watch
}

// ── Orchestrate the live sections from raw rows ───────────────
// Pure: rows + composite map + stale set → { holdings, spine,
// concentration, nav }. computeRead runs over the real ingredients with
// the full book in scope for the room assessor; sizeTrade then attaches
// the conviction-target quantum to each read.
export function buildLiveSections(rows, compByTk, staleSet) {
    const book = { holdings: [] };
    const ingredients = rows.map(r => {
        const ing = mapHolding(r, compByTk, staleSet);
        book.holdings.push(ing);
        return ing;
    });
    const nav = bookNav(rows);
    const targets = targetWeights(rows);
    const byTk = new Map(rows.map(r => [r.symbol, r]));
    const holdings = ingredients.map(ing => {
        const withRead = { ...ing, ...computeRead(ing, book, READ_CONFIG, ConcentrationPenalty) };
        const r = byTk.get(withRead.tk) || {};
        const price = num(r.current_price);
        const currentWeightPct = num(r.weight_pct) || 0;
        const targetWeightPct = targets.get(withRead.tk) || 0;
        const currentShares = (price && price > 0 && num(r.market_value) != null) ? Math.abs(num(r.market_value)) / price : null;
        const trade = sizeTrade(withRead.read, { nav, price, currentWeightPct, targetWeightPct, currentShares });
        return {
            ...withRead,
            price,
            currentWeightPct: +currentWeightPct.toFixed(2),
            targetWeightPct: +targetWeightPct.toFixed(2),
            driftPct: +(targetWeightPct - currentWeightPct).toFixed(2),
            ...trade,
        };
    });
    return {
        holdings,
        spine: buildSpine(rows, staleSet),
        concentration: buildConcentration(rows),
        nav,
    };
}

// ── Macro helpers ─────────────────────────────────────────────
// FRED series in the /api/macro payload are arrays of {date, value}
// in ascending order (latest last).
const lastVal = arr => (Array.isArray(arr) && arr.length ? arr[arr.length - 1].value : null);
const lastTwo = arr => {
    if (!Array.isArray(arr) || !arr.length) return null;
    return { latest: arr[arr.length - 1].value, prev: arr.length > 1 ? arr[arr.length - 2].value : null };
};
const sgn = (v, dp) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dp);
const pctS = v => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%');
const yieldTone = ch => (ch > 0 ? 'down' : ch < 0 ? 'up' : 'neutral');

// ── Windshield — live macro tiles from the /api/macro payload ──
// Returns the Windshield contract { driver, driverEmphasis, stats[] }
// or null (→ provider falls back to baseline) when no macro is available.
export function buildWindshield(macro) {
    if (!macro) return null;
    const y = macro.yields || {};
    const stats = [];

    const vix = lastTwo(macro.volatility && macro.volatility.vix);
    if (vix) stats.push({
        label: 'VIX', value: vix.latest.toFixed(1),
        change: vix.prev != null ? sgn(vix.latest - vix.prev, 1) : '', tone: 'warn',
    });

    const spy = (macro.market || []).find(q => q && q.symbol === 'SPY');
    if (spy && isFinite(spy.changePct) && isFinite(spy.price)) stats.push({
        label: 'S&P 500', value: Number(spy.price).toLocaleString('en-US', { maximumFractionDigits: 0 }),
        change: sgn(spy.changePct, 1) + '%', tone: spy.changePct < 0 ? 'down' : spy.changePct > 0 ? 'up' : 'neutral',
    });

    const d2 = lastTwo(y.dgs2), d10 = lastTwo(y.dgs10);
    if (d2) { const ch = d2.prev != null ? (d2.latest - d2.prev) * 100 : null;
        stats.push({ label: '2Y UST', value: d2.latest.toFixed(2) + '%',
            change: ch != null ? sgn(ch, 0) + 'bp' : '', tone: ch != null ? yieldTone(ch) : 'neutral' }); }
    if (d10) { const ch = d10.prev != null ? (d10.latest - d10.prev) * 100 : null;
        stats.push({ label: '10Y UST', value: d10.latest.toFixed(2) + '%',
            change: ch != null ? sgn(ch, 0) + 'bp' : '', tone: ch != null ? yieldTone(ch) : 'neutral' }); }
    if (d2 && d10) {
        const v = (d10.latest - d2.latest) * 100;
        const prevSpread = (d2.prev != null && d10.prev != null) ? (d10.prev - d2.prev) * 100 : null;
        const ch = prevSpread != null ? v - prevSpread : null;
        stats.push({ label: '10Y–2Y', value: sgn(v, 0) + 'bp',
            change: ch != null ? sgn(ch, 0) + 'bp' : '', tone: v < 0 ? 'down' : 'up' });
    }

    if (!stats.length) return null;

    // Factual, data-driven headline (the regime label is the only
    // "narrative" and it comes straight from the macro classifier).
    const reg = macro.regime || {};
    let driver = 'Macro snapshot', driverEmphasis = null;
    if (d2 && d10) {
        const v = Math.round((d10.latest - d2.latest) * 100);
        const label = reg.label && reg.label !== 'Assessing' ? reg.label + ' regime' : 'Rates in focus';
        driver = label + ' — 2Y at ' + d2.latest.toFixed(2) + '%, the 10Y–2Y curve at ' + sgn(v, 0) + 'bp';
        driverEmphasis = v < 0 ? 'curve still inverted' : 'curve positive';
    }
    return { driver, driverEmphasis, stats };
}

// ── Seasonal — live figures (factual templating, not generative) ──
// Theme/Opportunities/Drift derive from the live book; Regime adds the
// macro curve + regime label. Prose is templated from real numbers, so
// nothing contradicts the spine. Always returns a value.
export function buildSeasonal({ spine = [], concentration = null, holdings = [], macro = null }) {
    const sorted = spine.slice().sort((a, b) => b.sharePct - a.sharePct);
    const top = sorted[0];
    const byMove = spine.slice().sort((a, b) => b.movePct - a.movePct);
    const greenest = byMove[0], reddest = byMove[byMove.length - 1];

    const valued = holdings.filter(h => h.fvGapPct != null && !h.stale);
    const cheap = valued.slice().sort((a, b) => b.fvGapPct - a.fvGapPct).slice(0, 3);
    const rich = valued.slice().sort((a, b) => a.fvGapPct - b.fvGapPct).slice(0, 3);
    const nameGap = h => h.tk + ' ' + pctS(h.fvGapPct);

    const c = concentration || {};
    const y = (macro && macro.yields) || {};
    const reg = (macro && macro.regime) || {};
    const d2 = lastVal(y.dgs2), d10 = lastVal(y.dgs10);
    const spreadBp = (d2 != null && d10 != null) ? Math.round((d10 - d2) * 100) : null;
    const inverted = spreadBp != null && spreadBp < 0;

    return {
        theme: {
            title: 'Theme transmission',
            subtitle: 'How today’s macro is propagating through your themes',
            tags: [top && top.theme, sorted[1] && sorted[1].theme, 'Rotation'].filter(Boolean),
            body: [
                top ? top.theme + ' is your largest theme at ' + top.sharePct + '% and moved ' + pctS(top.movePct) +
                      ' today — the primary transmission node for the book.' : 'No theme data yet.',
                (greenest && reddest && greenest.theme !== reddest.theme)
                    ? greenest.theme + ' leads on the day (' + pctS(greenest.movePct) + '); ' + reddest.theme + ' lags (' + pctS(reddest.movePct) + ').'
                    : 'Theme dispersion is muted today.',
            ],
        },
        regime: {
            title: 'Regime',
            subtitle: 'Where the cycle and the book’s breadth sit',
            tags: [
                reg.label && reg.label !== 'Assessing' ? reg.label : null,
                inverted ? 'Inverted curve' : (spreadBp != null ? 'Positive curve' : null),
                c.verdictChip === 'Fragile' ? 'Fragile breadth' : 'Broad breadth',
            ].filter(Boolean),
            body: [
                spreadBp != null
                    ? 'The 10Y–2Y curve is ' + (inverted ? 'inverted at ' : 'positive at ') + (spreadBp >= 0 ? '+' : '−') + Math.abs(spreadBp) + 'bp' +
                      (d2 != null ? ', the 2Y at ' + d2.toFixed(2) + '%' : '') +
                      (reg.cpiYoY != null ? ' · CPI ' + reg.cpiYoY.toFixed(1) + '% YoY' : '') + '.'
                    : 'Macro curve data unavailable.',
                c.note || 'Concentration data unavailable.',
            ],
        },
        opportunities: {
            title: 'Opportunities',
            subtitle: 'Where price and value diverge most',
            tags: ['Value gaps', 'Mispriced'],
            body: [
                cheap.length ? 'Widest live upside to fair value: ' + cheap.map(nameGap).join(', ') + '.' : 'No live upside gaps in the trusted set yet.',
                rich.length ? 'Richest vs fair value: ' + rich.map(nameGap).join(', ') + '.' : 'No rich names in the trusted set.',
            ],
        },
        drift: {
            title: 'Drift',
            subtitle: 'How far the book has wandered from balance',
            tags: ['Concentration', 'Rebalance'],
            body: [
                c.note || 'Concentration data unavailable.',
                (c.fragilityCluster && c.fragilityCluster.length) ? 'Fragility cluster: ' + c.fragilityCluster.join(' · ') + '.' : 'No fragility cluster flagged.',
            ],
        },
    };
}

