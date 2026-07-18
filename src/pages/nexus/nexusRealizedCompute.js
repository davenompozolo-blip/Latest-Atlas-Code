// ============================================================
// Nexus Realized layer — pure compute (beats 05 · 06 · 07).
// ------------------------------------------------------------
// All maths for the realized beats lives here, framework-free and
// unit-tested (nexusRealizedCompute.test.mjs). NexusRealized.js is
// the thin renderer.
//
// Data contracts:
//   • Position rows come from vw_portfolio_home (the SAME source the
//     Portfolio home waterfall uses — spec §2.3 "no new pipeline"):
//     { symbol, sector, market_value, daily_change_pct (fraction),
//       return_5d_pct (fraction), daily_change_dollar? }
//   • Betas + today's factor moves come from /api/nexus-theme — the
//     SAME values beat 03 renders. Never recomputed here (§2.4).
//   • Residual σ comes from sector_pnl_residuals (trailing daily
//     rows); no history → flags render '—', never fabricated (§8).
// ============================================================

const num = v => {
    if (v == null || v === '') return null; // Number(null) is 0 — never let absent read as zero
    const n = Number(v);
    return isFinite(n) ? n : null;
};

// ── Period P&L per position ───────────────────────────────────
// 1D: prefer the broker's daily_change_dollar; else back out from the
//     fractional return (P&L = mv − mv/(1+r) = mv·r/(1+r)).
// 5D: no dollar field exists on the view → same back-out from
//     return_5d_pct. MTD has NO per-position source — the UI disables
//     the toggle with the reason; this module simply doesn't offer it.
export function positionPnl(row, period) {
    const mv = num(row.market_value);
    if (mv == null) return null;
    if (period === '1d') {
        const d = num(row.daily_change_dollar);
        if (d != null) return d;
        const r = num(row.daily_change_pct);
        return r == null ? null : (Math.abs(mv) * r) / (1 + r);
    }
    if (period === '5d') {
        const r = num(row.return_5d_pct);
        return r == null ? null : (Math.abs(mv) * r) / (1 + r);
    }
    return null;
}

// ── Beat 05: sector P&L (waterfall input) ─────────────────────
// Returns { sectors: [{ sector, pnl, mv }], total, totalMv, covered }
// ordered largest-positive → largest-negative (§2.3). `covered` is the
// share of book MV with a computable period P&L, so the UI can say when
// the cut is partial instead of silently under-reporting.
export function sectorPnl(rows, period) {
    const bySector = new Map();
    let total = 0, totalMv = 0, coveredMv = 0;
    for (const row of rows || []) {
        const mv = Math.abs(num(row.market_value) || 0);
        if (!mv) continue;
        totalMv += mv;
        const pnl = positionPnl(row, period);
        if (pnl == null) continue;
        coveredMv += mv;
        const sec = row.sector || 'Other';
        const g = bySector.get(sec) || { sector: sec, pnl: 0, mv: 0 };
        g.pnl += pnl;
        g.mv += mv;
        bySector.set(sec, g);
        total += pnl;
    }
    const sectors = [...bySector.values()].sort((a, b) => b.pnl - a.pnl);
    return { sectors, total, totalMv, covered: totalMv ? coveredMv / totalMv : 0 };
}

// ── Beat 05: implied vs actual ────────────────────────────────
// implied return % = Σ_f β_f × factorMove_f — both sides in the same
// vol-normalised "% per 1% factor move" units from /api/nexus-theme.
// implied $ = implied% × sector MV. Residual = actual − implied.
// A sector with no betas gets residual null (render '—', grey row —
// same pending-coverage discipline as the rotation map).
//   sectorRows: output of sectorPnl().sectors
//   betasBySector: Map(sector → { rate, usd, oil }) — beat 03's values
//   factorMoves: { rate, usd, oil } in vol-normalised % units
export function impliedVsActual(sectorRows, betasBySector, factorMoves) {
    const fm = factorMoves || {};
    const movesLive = ['rate', 'usd', 'oil'].some(k => num(fm[k]) != null);
    return (sectorRows || []).map(s => {
        const betas = betasBySector && betasBySector.get ? betasBySector.get(s.sector) : null;
        let impliedRetPct = null;
        if (movesLive && betas) {
            let sum = 0, used = 0;
            for (const k of ['rate', 'usd', 'oil']) {
                const b = num(betas[k]), m = num(fm[k]);
                if (b != null && m != null) { sum += b * m; used++; }
            }
            if (used > 0) impliedRetPct = sum;
        }
        const implied = impliedRetPct == null ? null : (impliedRetPct / 100) * s.mv;
        return {
            sector: s.sector,
            mv: s.mv,
            actual: s.pnl,
            implied,
            residual: implied == null ? null : s.pnl - implied,
        };
    });
}

// Top-N rows by |residual| for the card (§2.4: show 5, not all 12).
// Pending rows (residual null) sink to the bottom and only pad if
// fewer than n live rows exist — pending coverage stays visible.
export function topResidualRows(rows, n = 5) {
    const live = (rows || []).filter(r => r.residual != null)
        .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
    const pending = (rows || []).filter(r => r.residual == null);
    return live.slice(0, n).concat(pending.slice(0, Math.max(0, n - live.length)));
}

// ── Residual σ from sector_pnl_residuals history ──────────────
// historyRows: [{ sector, residual }] over the trailing window.
// Requires ≥ 20 observations per sector for a σ — below that the flag
// renders '—' rather than a number computed on noise.
export function residualSigma(historyRows, minObs = 20) {
    const by = new Map();
    for (const r of historyRows || []) {
        const v = num(r.residual);
        if (v == null || !r.sector) continue;
        if (!by.has(r.sector)) by.set(r.sector, []);
        by.get(r.sector).push(v);
    }
    const out = new Map();
    for (const [sector, vals] of by) {
        if (vals.length < minObs) { out.set(sector, null); continue; }
        const m = vals.reduce((a, b) => a + b, 0) / vals.length;
        out.set(sector, Math.sqrt(vals.reduce((a, b) => a + (b - m) * (b - m), 0) / vals.length));
    }
    return out;
}

// Sectors whose |residual| exceeds 1σ of their trailing distribution.
// No σ (no history yet) → never flagged; honesty over drama.
export function flaggedSectors(ivaRows, sigmaBySector) {
    const out = [];
    for (const r of ivaRows || []) {
        if (r.residual == null) continue;
        const sigma = sigmaBySector && sigmaBySector.get ? sigmaBySector.get(r.sector) : null;
        if (sigma != null && sigma > 0 && Math.abs(r.residual) > sigma) out.push(r.sector);
    }
    return out;
}

// ── Beat 05: the read — two templated sentences (§2.5) ────────
export function transmissionRead(ivaRows, sigmaBySector) {
    const withSigma = (ivaRows || []).filter(r => {
        const s = sigmaBySector && sigmaBySector.get ? sigmaBySector.get(r.sector) : null;
        return r.residual != null && s != null && s > 0;
    });
    if (!withSigma.length) {
        return {
            explained: null, unexplained: null,
            text: 'Residual significance needs a trailing distribution — sector_pnl_residuals is still accruing history, so no sector is graded explained or unexplained yet.',
        };
    }
    const sig = r => Math.abs(r.residual) / sigmaBySector.get(r.sector);
    const explained = withSigma.filter(r => sig(r) < 0.5).map(r => r.sector);
    const unexplained = withSigma.filter(r => sig(r) > 1).map(r => r.sector);
    const s1 = explained.length
        ? explained.join(' and ') + ' ' + (explained.length === 1 ? 'is' : 'are') + ' explained by beta — factor moves account for the P&L, so that is transmission, not judgement.'
        : 'No sector sits inside 0.5σ of its implied move today.';
    const s2 = unexplained.length
        ? unexplained.join(' and ') + ' ' + (unexplained.length === 1 ? 'is' : 'are') + ' unexplained by beta, and unexplained is where the name work lives — carried into Name impact flagged.'
        : 'No sector clears 1σ unexplained — nothing to carry into Name impact.';
    return { explained, unexplained, text: s1 + ' ' + s2 };
}

// ── Beat 06: name impact ──────────────────────────────────────
// Top n and bottom n names by period P&L, optionally filtered to the
// flagged sectors (the beat-05 carry-through) or book-only rows.
export function nameImpact(rows, period, { filter = 'all', flagged = [] } = {}, n = 5) {
    let list = (rows || []).map(row => ({
        symbol: row.symbol,
        sector: row.sector || 'Other',
        mv: Math.abs(num(row.market_value) || 0),
        pnl: positionPnl(row, period),
        dayPct: num(row.daily_change_pct),
        totalPct: num(row.unrealised_return_pct),
    })).filter(r => r.pnl != null);
    if (filter === 'flagged' && flagged.length) list = list.filter(r => flagged.indexOf(r.sector) >= 0);
    list.sort((a, b) => b.pnl - a.pnl);
    const top = list.slice(0, n);
    const bottom = list.slice(Math.max(n, list.length - n)).reverse();
    // top-to-bottom through a centre axis: positive block then negative block
    const seen = new Set(top.map(r => r.symbol));
    return top.concat(bottom.filter(r => !seen.has(r.symbol)).reverse());
}

// Sector residual concentration (§3.5 clause 1): distribute the sector's
// implied P&L pro-rata by MV, so each name's excess over its implied
// share is its residual contribution. One name carrying > 60% of the
// sector residual ⇒ a position call; spread across 3+ names ⇒ a sector
// call.
export function residualConcentration(rows, period, ivaRow) {
    if (!ivaRow || ivaRow.residual == null || !ivaRow.mv) return null;
    const members = (rows || []).filter(r => (r.sector || 'Other') === ivaRow.sector);
    const shares = [];
    for (const m of members) {
        const pnl = positionPnl(m, period);
        const mv = Math.abs(num(m.market_value) || 0);
        if (pnl == null || !mv) continue;
        const impliedShare = (ivaRow.implied || 0) * (mv / ivaRow.mv);
        shares.push({ symbol: m.symbol, excess: pnl - impliedShare });
    }
    if (!shares.length) return null;
    const denom = shares.reduce((a, b) => a + Math.abs(b.excess), 0);
    if (!(denom > 0)) return null;
    shares.sort((a, b) => Math.abs(b.excess) - Math.abs(a.excess));
    const top = shares[0];
    const topShare = Math.abs(top.excess) / denom;
    return {
        sector: ivaRow.sector,
        topName: top.symbol,
        topShare,
        spreadCount: shares.filter(s => Math.abs(s.excess) / denom > 0.15).length,
        concentrated: topShare > 0.6,
    };
}

// ── Beat 06: the read — three templated clauses (§3.5) ────────
//   concentrations: outputs of residualConcentration for flagged sectors
//   worst: { symbol, pnl } the largest detractor
//   streak: consecutive losing sessions for `worst` (null = unknown)
//   cortexNames: bar names that carry a live Cortex signal, [{symbol, signal}]
export function nameRead({ concentrations = [], worst = null, streak = null, cortexNames = [] } = {}) {
    const parts = [];
    for (const c of concentrations) {
        if (!c) continue;
        parts.push(c.concentrated
            ? c.sector + ' residual is ' + c.topName + ' alone (' + Math.round(c.topShare * 100) + '% of it) — a position call, not a rotation call.'
            : c.sector + ' residual is spread across ' + Math.max(c.spreadCount, 2) + ' names — that reads as the sector tilt, not one position.');
    }
    if (worst) {
        parts.push(worst.symbol + ' is the single largest detractor'
            + (streak != null && streak > 1 ? ' for the ' + ordinal(streak) + ' session running' : '')
            + '.');
    }
    if (cortexNames.length) {
        parts.push(cortexNames.map(c => c.symbol + ' already carries a live Cortex ' + String(c.signal).toLowerCase() + ' signal').join('; ') + '.');
    }
    return parts.join(' ') || 'No period P&L on the book yet — nothing to attribute.';
}

function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Consecutive losing sessions from a chronological close series.
export function losingStreak(closes) {
    if (!closes || closes.length < 2) return null;
    let streak = 0;
    for (let i = closes.length - 1; i > 0; i--) {
        if (closes[i] < closes[i - 1]) streak++;
        else break;
    }
    return streak;
}

// ── Beat 07: scorecard read (§4.4) ────────────────────────────
// Names (a) allocation-led vs selection-led, (b) the single sector where
// the pattern breaks — worst sector on the LEADING effect — and (c)
// whether that sector is currently flagged by the rotation engine
// (beat 02), which closes the loop back to the top of the page.
export function scorecardRead(brinson, rotation) {
    if (!brinson) return 'Attribution unavailable — needs position data with sectors.';
    const alloc = brinson.totals.allocation, sel = brinson.totals.selection;
    const allocLed = Math.abs(alloc) >= Math.abs(sel);
    const leadKey = allocLed ? 'allocationEffect' : 'selectionEffect';
    const worst = brinson.sectors.slice().sort((a, b) => a[leadKey] - b[leadKey])[0] || null;
    let text = 'Active return is ' + (allocLed ? 'allocation-led — the rotation map is carrying the book and the ledger adds on top.'
        : 'selection-led — the opportunities ledger is carrying the book and sector weights add on top.');
    if (worst && worst[leadKey] < 0) {
        text += ' The pattern breaks in ' + worst.sector + ', where ' + (allocLed
            ? 'the weight decision cost more than the names earned'
            : 'the name picks gave back what the weight earned') + '.';
        const inRotation = rotation && (rotation.buyTheme === worst.sector || rotation.sellTheme === worst.sector);
        if (inRotation) {
            const side = rotation.buyTheme === worst.sector ? 'a weight add' : 'a trim';
            text += ' Beat 02 currently flags ' + worst.sector + ' for ' + side + ' — the loop is live.';
        } else if (rotation) {
            text += ' Beat 02 does not currently flag ' + worst.sector + '.';
        }
    } else if (worst) {
        text += ' No sector breaks the pattern — the leading engine is positive everywhere it is sized.';
    }
    return text;
}

// Trailing effect arrays per benchmark from attribution_history rows:
// [{ week_start, benchmark, allocation_effect, selection_effect,
//    interaction_effect }] → { allocation: [...], selection: [...],
// interaction: [...] } oldest-first, for verdictForEffect().
export function trailingEffects(historyRows, benchmark, weeks = 12) {
    const rows = (historyRows || [])
        .filter(r => r.benchmark === benchmark)
        .sort((a, b) => (a.week_start < b.week_start ? -1 : 1))
        .slice(-weeks);
    return {
        allocation: rows.map(r => num(r.allocation_effect)),
        selection: rows.map(r => num(r.selection_effect)),
        interaction: rows.map(r => num(r.interaction_effect)),
        weeks: rows.length,
    };
}
