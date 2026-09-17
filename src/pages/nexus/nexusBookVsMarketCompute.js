// ============================================================
// ATLAS Nexus — the book against the market (G-6). Pure, IO-free.
// ------------------------------------------------------------
// Every other G unit puts a market reading on the flagship. This one is
// the reason they are worth having on the same page as the book: it
// takes the CHEAP signals — today's tape, the sector moves, the
// barometer — and asks the EXPENSIVE question against them. Is the
// book's move what its measured exposure says it should be?
//
// The link is one number. B0/C3 fitted the book's market beta on a
// 168-session panel; today's benchmark move times that beta is what the
// book "should" have done, and the residual is what the market factor
// does NOT explain. A cheap read that agrees with the expensive one is
// reassurance; a residual is where the day's story actually is.
//
// THREE REFUSALS, EACH ONE A RULE THIS CODEBASE ALREADY PAID FOR.
//
// 1. NO EXPECTATION WITHOUT A SIGNIFICANT BETA. `book_factor_betas`
//    carries `significant` bound by CHECK to |t| > 2. An insignificant
//    beta multiplied by today's move produces a number, and that number
//    is a claim the data does not support — A2's "an absent number beats
//    a flagged one", applied to a product rather than a coefficient.
//
// 2. THE TWO SIDES ARE DIFFERENT BASES AND IT IS SAID, NEVER RECONCILED.
//    `bookPct` is live and intraday; the beta is an append-only estimate
//    over a historical panel with its own `estimated_at` and `n_obs`.
//    Reading one against the other is exactly the mixed-basis failure
//    `vw_position_trading_effect` publishes its own `as_of` to avoid.
//    `alignment` carries both and reconciles neither.
//
// 3. THE DENOMINATOR TRAVELS WITH THE NUMBER. The book move already
//    withholds stale names and renormalises; a residual computed on 84%
//    of the book is a residual on 84% of the book.
// ============================================================

import { SECTOR_BY_NAME, SECTOR_ETF, normaliseSector } from '../../lib/marketAssetGroups.js';

const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const r2 = v => (v == null ? null : Math.round(v * 100) / 100);

// ── The core read ────────────────────────────────────────────
export function bookVsMarket(input) {
    const i = input || {};
    const gauge = i.gauge || {};
    const bookPct = num(gauge.bookPct);
    const benchPct = num(gauge.benchPct);
    const beta = i.marketBeta || null;

    const out = {
        bookPct, benchPct,
        benchSymbol: i.benchSymbol || 'SPY',
        measuredWeightPct: num(gauge.measuredWeightPct),
        withheldWeightPct: num(gauge.withheldWeightPct),
        excessPct: null,
        expectedPct: null,
        residualPct: null,
        beta: null,
        betaSignificant: null,
        alignment: null,
        reason: null,
    };

    // A BASELINE GAUGE IS NOT A BOOK MOVE. `liveOr` in nexusLive.js marks
    // a gauge that fell back to the structural baseline, and this panel
    // refuses it outright: a residual computed against a fitted beta from
    // a mock book move is a finding about a book that did not move that
    // way. The mark exists because logging the fallback told the console
    // and told no consumer anything.
    if (gauge.live === false) {
        out.bookPct = null; out.benchPct = null;
        out.measuredWeightPct = null; out.withheldWeightPct = null;
        out.reason = 'the book gauge fell back to the structural baseline — not a live move';
        return out;
    }

    // No benchmark is not a zero benchmark. Without it there is no
    // excess and no expectation, and saying so is the whole answer.
    if (bookPct == null || benchPct == null) {
        out.reason = bookPct == null
            ? 'no measurable book move today'
            : 'no benchmark move to compare against';
        return out;
    }

    out.excessPct = r2(bookPct - benchPct);

    if (!beta || num(beta.beta) == null) {
        out.reason = 'no market beta on file — the excess is unadjusted';
        return out;
    }

    out.beta = num(beta.beta);
    out.betaSignificant = !!beta.significant;

    // Rule 1. An insignificant beta times today's move is a number with
    // no evidence behind it.
    if (!beta.significant) {
        out.reason = 'market beta is not significant (|t| ≤ 2) — no expectation to form';
        return out;
    }

    out.expectedPct = r2(out.beta * benchPct);
    out.residualPct = r2(bookPct - out.expectedPct);

    // Rule 2. Two bases, named, never reconciled.
    out.alignment = {
        live: 'today, intraday',
        model: [
            beta.estimatedAt ? 'beta estimated ' + String(beta.estimatedAt).slice(0, 10) : null,
            beta.nObs ? 'n=' + beta.nObs : null,
        ].filter(Boolean).join(' · ') || 'beta of unknown vintage',
        note: 'a live move read against a historical beta — two bases, stated rather than reconciled',
    };

    return out;
}

// ── How to read the residual ─────────────────────────────────
// Bands, not quantiles. A quantile rule forces a fixed share of days to
// be "unusual" however the book actually behaved — the objection this
// codebase raises to quantile verdict bands, in a different surface.
export const RESIDUAL_BAND_PCT = 0.25;

export function residualRead(m) {
    if (!m || m.residualPct == null) return null;
    const r = m.residualPct;
    if (Math.abs(r) <= RESIDUAL_BAND_PCT) {
        return { key: 'explained', text: 'the book moved about as its market exposure says it should' };
    }
    return r > 0
        ? { key: 'ahead', text: 'the book is ahead of what its market exposure explains' }
        : { key: 'behind', text: 'the book is behind what its market exposure explains' };
}

// ── Sector alignment ─────────────────────────────────────────
// Where the book's weight sits against where the market moved today.
//
// Book sector strings come from a different vendor than the ETF labels,
// so matching is normalised — and the MISSES ARE REPORTED. A partial
// match reads as a data gap rather than as a join that did not land,
// which is this codebase's own finding from the sector/theme overlap.
export function sectorAlignment(holdings, sectorQuotes) {
    const moves = new Map();
    for (const q of sectorQuotes || []) {
        const m = num(q && q.changePct);
        if (q && q.symbol && m != null) moves.set(q.symbol, m);
    }

    const byEtf = new Map();
    const unmatched = new Map();   // raw book sector name -> weight
    let matchedWeight = 0, unmatchedWeight = 0;

    for (const h of holdings || []) {
        const w = num(h && h.currentWeightPct);
        if (w == null || w === 0) continue;
        const etf = SECTOR_BY_NAME[normaliseSector(h.sector)];
        if (!etf || !moves.has(etf)) {
            const key = h.sector || 'Unclassified';
            unmatched.set(key, (unmatched.get(key) || 0) + w);
            unmatchedWeight += w;
            continue;
        }
        const cur = byEtf.get(etf) || { etf, sector: SECTOR_ETF[etf], weightPct: 0, movePct: moves.get(etf) };
        cur.weightPct += w;
        byEtf.set(etf, cur);
        matchedWeight += w;
    }

    const rows = [...byEtf.values()].map(x => Object.assign({}, x, {
        weightPct: r2(x.weightPct),
        // What this sector's market move would have contributed at the
        // book's weight in it. NOT the book's own return in that sector —
        // it is the sector ETF's move, and the label says so.
        sectorContribPct: r2((x.weightPct / 100) * x.movePct),
    }));
    rows.sort((a, b) => Math.abs(b.sectorContribPct) - Math.abs(a.sectorContribPct));

    return {
        rows,
        matchedWeightPct: r2(matchedWeight),
        unmatchedWeightPct: r2(unmatchedWeight),
        unmatched: [...unmatched.entries()]
            .map(([sector, weightPct]) => ({ sector, weightPct: r2(weightPct) }))
            .sort((a, b) => b.weightPct - a.weightPct),
    };
}

// ── Picking the beta ─────────────────────────────────────────
// `book_factor_betas` is APPEND-ONLY and holds more than one estimate
// set — B0's and C3's, keyed apart by `estimated_at` and `n_obs`. The
// latest set is the one to read, and mixing rows from two sets is how a
// panel ends up quoting B0's market beta beside C3's axis betas.
export function latestMarketBeta(rows) {
    const market = (rows || []).filter(r => r && r.factor_key === 'market' && num(r.beta) != null);
    if (!market.length) return null;
    market.sort((a, b) => String(b.estimated_at || '').localeCompare(String(a.estimated_at || '')));
    const r = market[0];
    return {
        beta: num(r.beta),
        tStat: num(r.t_stat),
        significant: !!r.significant,
        nObs: num(r.n_obs),
        estimatedAt: r.estimated_at || null,
    };
}
