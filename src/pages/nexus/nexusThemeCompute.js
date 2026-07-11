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
        const g = m.get(t) || { theme: t, count: 0, convSum: 0, contribSum: 0, varSum: 0, fvSum: 0, fvN: 0, trustedN: 0, reads: {}, names: [] };
        g.count += 1;
        g.convSum += Number(h.conviction) || 0;
        g.contribSum += Number(h.contribPct) || 0;
        g.varSum += Number(h.componentVar) || 0;
        if (h.fvGapPct != null && isFinite(Number(h.fvGapPct))) { g.fvSum += Number(h.fvGapPct); g.fvN += 1; }
        if (h.valuationTrusted) g.trustedN += 1;
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
            // Pending until OUR composite backs the theme — the map renders
            // these dashed-grey rather than fabricating a colour from bare DCF.
            valuationPending: g.trustedN === 0,
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

// ── Momentum & betas (series-derived — computed in /api/nexus-theme) ──

// Daily returns from a close series. series: [{date, close}] → [{date, ret}].
export function dailyReturns(series) {
    const s = (series || []).filter(p => p && Number(p.close) > 0)
        .slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const out = [];
    for (let i = 1; i < s.length; i++) out.push({ date: s[i].date, ret: s[i].close / s[i - 1].close - 1 });
    return out;
}

// Theme daily return series — weight-rolled across member names.
// members: [{symbol, weight}] · retBySymbol: Map(symbol → [{date,ret}]).
export function themeReturnSeries(members, retBySymbol) {
    const get = (retBySymbol && retBySymbol.get) ? s => retBySymbol.get(s) : s => retBySymbol[s];
    const acc = new Map(); // date → { wret, w }
    for (const mbr of members || []) {
        const w = Number(mbr.weight) || 0;
        if (w <= 0) continue;
        for (const r of get(mbr.symbol) || []) {
            const g = acc.get(r.date) || { wret: 0, w: 0 };
            g.wret += w * r.ret; g.w += w;
            acc.set(r.date, g);
        }
    }
    return [...acc.entries()]
        .map(([date, g]) => ({ date, ret: g.w ? g.wret / g.w : 0 }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// n-day cumulative momentum from a return series, in %. Null if too short.
export function cumMomentum(retSeries, n = 5) {
    const s = retSeries || [];
    if (s.length < n) return null;
    let cum = 1;
    for (const r of s.slice(-n)) cum *= (1 + r.ret);
    return +((cum - 1) * 100).toFixed(2);
}

// Population standard deviation of a number array (null if too short).
export function stdev(xs) {
    const a = (xs || []).filter(v => isFinite(v));
    if (a.length < 2) return null;
    const m = a.reduce((s, v) => s + v, 0) / a.length;
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

// Rescale a return series so its daily vol equals `targetVol`. Lets betas to
// factors of very different volatility (UUP ≈ 0.2%/day vs USO ≈ 2%/day) be
// compared on one scale — "theme move per 1% (vol-normalised) factor move".
export function scaleReturnsToVol(retSeries, targetVol = 0.01) {
    const sd = stdev((retSeries || []).map(r => r.ret));
    if (!sd) return retSeries || [];
    const k = targetVol / sd;
    return (retSeries || []).map(r => ({ date: r.date, ret: r.ret * k }));
}

// OLS beta of theme returns on a factor, aligned by date. Null below `minN`
// overlapping points — fail loud, never fabricate a sensitivity.
export function beta(themeRet, factorRet, minN = 15) {
    const fmap = new Map((factorRet || []).map(r => [r.date, r.ret]));
    const xs = [], ys = [];
    for (const r of themeRet || []) {
        const f = fmap.get(r.date);
        if (f != null && isFinite(f) && isFinite(r.ret)) { xs.push(f); ys.push(r.ret); }
    }
    const n = xs.length;
    if (n < minN) return null;
    const mx = xs.reduce((a, v) => a + v, 0) / n, my = ys.reduce((a, v) => a + v, 0) / n;
    let cov = 0, varx = 0;
    for (let i = 0; i < n; i++) { cov += (xs[i] - mx) * (ys[i] - my); varx += (xs[i] - mx) ** 2; }
    if (varx === 0) return null;
    return +(cov / varx).toFixed(2);
}

// ── Dispersion — winners / losers inside each theme (client-side) ──
export function themeDispersion(holdings, perSide = 2) {
    const m = new Map();
    for (const h of holdings || []) {
        const t = h.theme || 'Unclassified';
        if (!m.has(t)) m.set(t, []);
        m.get(t).push({ tk: h.tk, pct: +(Number(h.todayPct) || 0).toFixed(1) });
    }
    const out = {};
    for (const [t, names] of m) {
        const sorted = names.slice().sort((a, b) => b.pct - a.pct);
        out[t] = {
            spread: sorted.length > 1 ? +(sorted[0].pct - sorted[sorted.length - 1].pct).toFixed(1) : 0,
            winners: sorted.filter(x => x.pct > 0).slice(0, perSide),
            losers: sorted.filter(x => x.pct < 0).slice(-perSide).reverse(),
        };
    }
    return out;
}

// ── Rotation read — the decision cascade (client-side) ──
// Quadrant (positioning × momentum) → verdict, nudged by valuation/crowding
// when trustworthy. Transparent `because`; structural, not reactive.
const fmtShare = v => (v == null ? '—' : v.toFixed(1) + '%');
const median = xs => {
    const s = (xs || []).filter(v => v != null).slice().sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
};

export function rotationRead(rows, cfg = {}) {
    const heavyCut = median(rows.map(r => r.sharePct)) || 0;
    const tilt = r => (r.valuationPending ? null : r.valuationTilt);

    const perTheme = (rows || []).map(r => {
        const heavy = r.sharePct != null && r.sharePct >= heavyCut;
        const mom = r.momentum5d;
        let verdict, because;
        if (mom == null) {
            verdict = 'HOLD'; because = 'momentum pending sync';
        } else if (!heavy && mom > 0) {
            verdict = 'ADD'; because = 'underweight at ' + fmtShare(r.sharePct) + ' and working (' + (mom >= 0 ? '+' : '') + mom + '% 5d)';
        } else if (heavy && mom > 0) {
            verdict = 'LET_RUN'; because = 'core at ' + fmtShare(r.sharePct) + ', still working';
        } else if (heavy && mom <= 0) {
            verdict = 'TRIM'; because = 'committed at ' + fmtShare(r.sharePct) + ' but rolling over (' + mom + '% 5d)';
        } else {
            verdict = 'IGNORE'; because = 'washed out but light at ' + fmtShare(r.sharePct);
        }
        // Valuation nudges (only when coverage is trustworthy).
        if (verdict === 'ADD' && tilt(r) === 'rich') { verdict = 'LET_RUN'; because += ' — but rich, don’t chase'; }
        else if (verdict === 'ADD' && tilt(r) === 'cheap') { because += ', and cheap'; }
        else if (verdict === 'TRIM' && tilt(r) === 'rich') { because += ', and rich'; }
        return { theme: r.theme, verdict, because };
    });

    const find = t => rows.find(r => r.theme === t);
    const outCand = perTheme.filter(p => p.verdict === 'TRIM').map(p => find(p.theme))
        .sort((a, b) => (a.momentum5d ?? 0) - (b.momentum5d ?? 0))[0] || null;
    const inCand = perTheme.filter(p => p.verdict === 'ADD').map(p => find(p.theme))
        .sort((a, b) => (b.momentum5d ?? 0) - (a.momentum5d ?? 0))[0] || null;

    let text;
    if (outCand && inCand) text = 'Rotate out of ' + outCand.theme + ' into ' + inCand.theme + '.';
    else if (inCand) text = 'Add to ' + inCand.theme + '.';
    else if (outCand) text = 'Trim ' + outCand.theme + '.';
    else text = 'No clear rotation — themes are balanced.';

    return {
        perTheme,
        book: { outTheme: outCand ? outCand.theme : null, inTheme: inCand ? inCand.theme : null, text },
    };
}

// Verdict → the one-word chip on the theme card face. Mechanical mapping so
// a theme's chip always matches its map quadrant — never a separate call.
export const VERDICT_CHIP = { ADD: 'BUY', LET_RUN: 'HOLD', TRIM: 'SELL', IGNORE: 'WATCH', HOLD: 'HOLD' };

// ── Rotation call (v1 redesign) — pair, drivers, conviction ──
// The recommendation card and the map are two views on the same computation:
// the pair comes from rotationRead (quadrant verdicts), so they can never
// disagree.

// Percentile rank of position weight across themes, 0–100. Rank ≥ 50 ⟺
// sharePct ≥ median, i.e. the map's centre line at rank 50 is exactly
// rotationRead's heavy/light cut — quadrant membership and verdict agree
// by construction. Chosen over raw weight because one dominant theme
// (Technology ~29%) compresses everything else into the left margin.
export function positionRankPct(rows) {
    const withShare = (rows || []).filter(r => r.sharePct != null);
    const n = withShare.length;
    const out = new Map();
    if (!n) return out;
    for (const r of withShare) {
        const below = withShare.filter(o => o.sharePct < r.sharePct).length;
        out.set(r.theme, n > 1 ? +((100 * below) / (n - 1)).toFixed(1) : 50);
    }
    return out;
}

// Conviction weights — equal by design (spec open item 3): defined once,
// held constant for a review quarter, then revisited against realized
// outcomes. Do NOT tune per period or the score becomes unfalsifiable.
export const CONVICTION_WEIGHTS = { momentum: 0.25, positioning: 0.25, breadth: 0.25, macroFit: 0.25 };

const clamp100 = v => Math.max(0, Math.min(100, v));

// Four-factor conviction for a sell→buy pair, 0–100 per factor:
//   momentum    — 5d momentum divergence (buy − sell), 12pp saturates
//   positioning — weight skew (sell − buy), 15pp saturates
//   breadth     — 100 minus 5×(sell-leg intra-theme spread): a drawdown one
//                 name is driving deserves less conviction than a broad one
//   macroFit    — regime playbook agreement: ±50 for each leg the regime
//                 rewards/punishes in the call's direction, from 50 base
// A factor with no data is null and its weight is renormalised over the
// rest — the score degrades honestly, it never fabricates an input.
export function rotationConviction(sell, buy, sellDisp, playbook) {
    const factors = {
        momentum: (sell.momentum5d != null && buy.momentum5d != null)
            ? clamp100(((buy.momentum5d - sell.momentum5d) / 12) * 100) : null,
        positioning: (sell.sharePct != null && buy.sharePct != null)
            ? clamp100(((sell.sharePct - buy.sharePct) / 15) * 100) : null,
        breadth: (sellDisp && sellDisp.spread != null && (sellDisp.winners.length || sellDisp.losers.length))
            ? clamp100(100 - sellDisp.spread * 5) : null,
        macroFit: null,
    };
    if (playbook && (playbook.rewards.length || playbook.punishes.length)) {
        let fit = 50;
        if (playbook.rewards.includes(buy.theme)) fit += 50;
        if (playbook.punishes.includes(buy.theme)) fit -= 50;
        if (playbook.punishes.includes(sell.theme)) fit += 50;
        if (playbook.rewards.includes(sell.theme)) fit -= 50;
        factors.macroFit = clamp100(fit);
    }
    let wsum = 0, acc = 0;
    for (const [k, v] of Object.entries(factors)) {
        if (v == null) continue;
        wsum += CONVICTION_WEIGHTS[k];
        acc += CONVICTION_WEIGHTS[k] * v;
    }
    const score = wsum ? Math.round(acc / wsum) : null;
    const tag = score == null ? null : score >= 60 ? 'BUY BIAS' : score >= 40 ? 'NEUTRAL' : 'LOW CONVICTION';
    return { score, tag, factors };
}

// The full rotation call: pair from rotationRead + driver lines. Every
// driver traces to a real field (spec §3.2) — momentum and positioning from
// the pair legs, breadth from themeDispersion, valuation only when both
// legs carry a resolved tilt. status: confirmed | caution | pending.
export function rotationCall(rows, disp, playbook) {
    const read = rotationRead(rows);
    const { outTheme, inTheme, text } = read.book;
    const sell = rows.find(r => r.theme === outTheme) || null;
    const buy = rows.find(r => r.theme === inTheme) || null;
    if (!sell || !buy) return { sell, buy, text, drivers: [], conviction: { score: null, tag: null, factors: {} }, perTheme: read.perTheme };

    const sd = (disp || {})[sell.theme];
    const fp = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%';
    const drivers = [];

    drivers.push({
        key: 'momentum', status: 'confirmed',
        text: 'Momentum diverging — ' + sell.theme + ' ' + fp(sell.momentum5d) + ' 5d vs ' + buy.theme + ' ' + fp(buy.momentum5d) + ' 5d',
    });
    drivers.push({
        key: 'positioning', status: 'confirmed',
        text: 'Positioning skew — ' + sell.theme + ' committed at ' + sell.sharePct.toFixed(1) + '% weight, ' + buy.theme + ' light at ' + buy.sharePct.toFixed(1) + '%',
    });
    if (sd && (sd.winners.length || sd.losers.length)) {
        const movers = [...sd.winners, ...sd.losers];
        const top = movers.slice().sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
        if (sd.spread >= 5 && top) {
            drivers.push({ key: 'breadth', status: 'caution', text: 'Narrow breadth — ' + sell.theme + ' dispersion ' + sd.spread + 'pp spread, ' + top.tk + ' ' + fp(top.pct) + ' driving the move' });
        } else {
            drivers.push({ key: 'breadth', status: 'confirmed', text: 'Broad move — ' + sell.theme + ' dispersion ' + sd.spread + 'pp spread, no single name dominating' });
        }
    } else {
        drivers.push({ key: 'breadth', status: 'pending', text: 'Breadth — intra-theme dispersion pending' });
    }
    const sTilt = sell.valuationPending ? null : sell.valuationTilt;
    const bTilt = buy.valuationPending ? null : buy.valuationTilt;
    if (sTilt && bTilt) {
        const against = bTilt === 'rich' || sTilt === 'cheap';
        drivers.push({
            key: 'valuation', status: against ? 'caution' : 'confirmed',
            text: 'Valuation — ' + sell.theme + ' ' + sTilt + ', ' + buy.theme + ' ' + bTilt + (against ? ' (cuts against the call)' : ''),
        });
    } else {
        const legs = [!sTilt && sell.theme, !bTilt && buy.theme].filter(Boolean).join(' and ');
        drivers.push({ key: 'valuation', status: 'pending', text: 'Valuation — pending on ' + legs + ', not yet a supporting signal' });
    }

    return { sell, buy, text, drivers, conviction: rotationConviction(sell, buy, sd, playbook), perTheme: read.perTheme };
}

// One-line breadth note for the card face, from the existing per-name
// dispersion breakdown. Mechanical: ≥5pp with a dominant mover → name it.
export function breadthNote(d) {
    if (!d || (!d.winners.length && !d.losers.length)) return '—';
    if (d.spread >= 5) {
        const movers = [...d.winners, ...d.losers].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
        return movers.length ? movers[0].tk + ' driving' : 'wide ' + d.spread + 'pp';
    }
    if (d.spread >= 2) return 'spread ' + d.spread + 'pp';
    return 'breadth tight';
}
