// ============================================================
// ATLAS Nexus — the tape (F2 §3, F3 §2.1). Pure, IO-free.
// ------------------------------------------------------------
// Three sprints cycling: names, groups, signals. A tape is a format
// that makes everything on it look live and equally solid, which is
// why almost all of this file is about refusing to print things.
//
// THERE IS NO INSTRUMENT LIST IN THIS FILE. Sprint 2's frames come from
// `market_instruments.tape_group`, for the reason nexusPairsCompute.js
// carries no pair-to-axis map: a surface must not hold a hardcoded copy
// of a classification the database owns. Registering a leg is what puts
// it on the tape.
//
// Sprint 3 does not compute a ratio. It calls alignedWindow/buildSeries
// out of nexusPairsCompute.js — the pair explorer's own transform —
// because F2 §3 requires that the tape and the explorer "must never be
// able to disagree", and sharing a data source while running a second
// implementation of the arithmetic is exactly the failure that names.
// ============================================================

import { alignedWindow, buildSeries, assignAxis } from './nexusPairsCompute.js';

// ── Sprint 2 framing ─────────────────────────────────────────
// One instrument is a data point, not a category. `regional` holds
// exactly one leg (EEM), and a frame labelled "REGIONAL" carrying one
// ticker overstates what is measured in the same way a sector aggregate
// computed from the book's own holdings would.
//
// So the rule is structural rather than a carve-out for EEM: a group
// with fewer than two legs does not get a frame, and its legs fold into
// the broad-market frame. Register a second regional leg and regional
// becomes a frame on its own, with no change here. The fold is recorded
// on the item so the surface can say it happened.
export const MIN_FRAME_LEGS = 2;
export const FALLBACK_GROUP = 'index';

export const GROUP_LABEL = { sector: 'SECTOR', index: 'INDEX', regional: 'REGIONAL' };

// Sprint 3 windows, in aligned sessions. n sessions of closes yield n−1
// sessions of change, so 2/6/22 are the 1-session, 5-session and
// 21-session moves — a day, a week and a month of trading.
export const SIGNAL_WINDOWS = [
    { key: 'd', label: '1D', sessions: 2 },
    { key: 'w', label: '1W', sessions: 6 },
    { key: 'm', label: '1M', sessions: 22 },
];

export const NAMES_PER_SIDE = 5;

// ── helpers ──────────────────────────────────────────────────
const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// A move of exactly 0.00% is a real measurement and must survive. `??`
// rather than `||` — this codebase has an entry about `||` swallowing a
// genuine zero return and falling through to a different measure.
export function fmtPct(v, dp = 2) {
    if (v == null) return null;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(dp) + '%';
}

export function moveTone(v) {
    if (v == null) return '';
    return v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : '';
}

// Last aligned date across a symbol map, used for per-item freshness.
function lastDate(byDate) {
    const keys = Object.keys(byDate || {});
    if (!keys.length) return null;
    keys.sort();
    return keys[keys.length - 1];
}

// ── Sprint 1 — names ─────────────────────────────────────────
// Reads `nexus_holdings`, never `vw_nexus_holdings`: the latter is a view
// over a matview that ran three positions behind the live book, and its
// `daily_return_pct` carries no staleness gate at all. `today_pct` is
// already NULL past 7 days with `price_days_old` published beside it.
//
// A row with no move is not a performer — it cannot be ranked best or
// worst — so it leaves the ranking. It does NOT leave silently: the
// count and the reason come back on the sprint, the measuredCount /
// withheldCount construction used everywhere else on this build.
export function sprintNames(rows, perSide = NAMES_PER_SIDE) {
    const all = (rows || []).filter(r => r && r.tk);
    const measured = [];
    const withheld = [];
    for (const r of all) {
        const mv = num(r.today_pct);
        if (mv == null) withheld.push({ symbol: r.tk, daysOld: num(r.price_days_old) });
        else measured.push({ symbol: r.tk, move: mv, daysOld: num(r.price_days_old), stale: r.stale === true });
    }
    measured.sort((a, b) => b.move - a.move);

    const best = measured.slice(0, perSide);
    // Guard the overlap: on a book smaller than 2×perSide the two slices
    // would print the same name twice, once as a leader and once as a
    // laggard. Take the worst from what the best did not claim.
    const worst = measured.slice(Math.max(best.length, measured.length - perSide)).reverse();

    const items = [];
    for (const m of best) items.push({ kind: 'name', side: 'best', ...m });
    for (const m of worst) items.push({ kind: 'name', side: 'worst', ...m });

    return {
        key: 'names',
        label: 'NAMES',
        caption: 'best and worst today',
        items,
        measuredCount: measured.length,
        withheldCount: withheld.length,
        withheldSymbols: withheld.map(w => w.symbol),
        withheldReason: withheld.length ? 'no current price' : null,
    };
}

// ── Sprint 2 — groups ────────────────────────────────────────
// Market legs, priced by their own nightly loader. Nothing here is
// derived from the book: F3 §2.1 prohibits substituting the book's own
// sector aggregates for the market's, and the point of using these legs
// is that the substitution is never needed.
//
// The ticker is the label. "XLE" rather than "Energy" — the ETF is the
// measurement and the sector is an interpretation of it, and XLE's own
// caveats record that it is a large-cap-only slice close to a two-stock
// series. That reasoning was raised about EEM and holds for every leg,
// so it is applied to all of them rather than to the one that prompted
// it. `proxies_for` rides along as the title.
export function sprintGroups(instruments, bySymbol) {
    const legs = (instruments || [])
        .filter(i => i && i.symbol && i.tape_group)
        .map(i => ({
            symbol: i.symbol,
            group: i.tape_group,
            proxiesFor: i.proxies_for || null,
        }));

    const counts = {};
    for (const l of legs) counts[l.group] = (counts[l.group] || 0) + 1;
    const framed = g => (counts[g] || 0) >= MIN_FRAME_LEGS;
    // If the fallback itself is too thin there is nowhere honest to fold
    // to, so a thin group is dropped and named rather than folded into a
    // frame that does not exist.
    const fallbackOk = framed(FALLBACK_GROUP);

    const items = [];
    const dropped = [];
    for (const leg of legs) {
        const home = framed(leg.group) ? leg.group : (fallbackOk ? FALLBACK_GROUP : null);
        if (!home) { dropped.push(leg.symbol); continue; }

        const byDate = (bySymbol || {})[leg.symbol] || {};
        const dates = Object.keys(byDate).sort();
        const last = dates.length ? dates[dates.length - 1] : null;
        const prev = dates.length > 1 ? dates[dates.length - 2] : null;
        const a = last ? num(byDate[last]) : null;
        const b = prev ? num(byDate[prev]) : null;
        // Two bars or no move. A single bar cannot express a change, and
        // printing 0.00% for it would be a fabricated flat session.
        const move = a != null && b != null && b !== 0 ? (a / b - 1) * 100 : null;

        items.push({
            kind: 'group',
            symbol: leg.symbol,
            group: home,
            nativeGroup: leg.group,
            folded: home !== leg.group,
            proxiesFor: leg.proxiesFor,
            move,
            asOf: last,
        });
    }

    // Freshness is per item and relative to the newest bar the sprint
    // actually holds, never to wall-clock: a weekday feed is not late on
    // a Sunday, the rule this codebase applies everywhere else.
    const newest = items.reduce((mx, it) => (it.asOf && (!mx || it.asOf > mx) ? it.asOf : mx), null);
    for (const it of items) it.behind = it.asOf && newest ? it.asOf < newest : false;

    const order = ['sector', 'index', 'regional'];
    items.sort((x, y) => {
        const gx = order.indexOf(x.group), gy = order.indexOf(y.group);
        if (gx !== gy) return gx - gy;
        if (x.move == null) return 1;
        if (y.move == null) return -1;
        return y.move - x.move;
    });

    const frames = order.filter(framed);
    const foldedGroups = order.filter(g => (counts[g] || 0) > 0 && !framed(g) && fallbackOk);

    return {
        key: 'groups',
        label: 'GROUPS',
        caption: frames.map(f => GROUP_LABEL[f].toLowerCase()).join(' · '),
        items,
        frames,
        foldedGroups,
        foldedInto: foldedGroups.length ? FALLBACK_GROUP : null,
        droppedSymbols: dropped,
        asOf: newest,
    };
}

// ── Sprint 3 — signals ───────────────────────────────────────
// Daily, weekly and monthly change on each ratio pair, with the axis it
// belongs to. Both the changes and the axis come from the objects the
// explorer uses — no second arithmetic, no pair-to-axis map here.
export function sprintSignals({ pairs, loadings, axes, bySymbol, benchmark = 'SPY' }) {
    const byPair = {};
    for (const l of loadings || []) (byPair[l.pair_key] = byPair[l.pair_key] || []).push(l);
    const axisMeta = {};
    for (const a of axes || []) axisMeta[a.axis_key] = a;

    const items = [];
    for (const p of pairs || []) {
        const axis = assignAxis(byPair[p.pair_key]);
        const meta = axis.axisKey ? axisMeta[axis.axisKey] : null;

        const moves = {};
        let any = false;
        for (const w of SIGNAL_WINDOWS) {
            const win = alignedWindow({
                bySymbol, numerator: p.numerator_symbol,
                denominator: p.denominator_symbol, benchmark, sessions: w.sessions,
            });
            const series = buildSeries(win);
            // A window that came back short is published as short rather
            // than passed off as a full one: a "1M" reading over eleven
            // sessions is a different statement from a monthly move.
            const v = series && series.returns ? series.returns.ratio : null;
            moves[w.key] = { label: w.label, value: v, truncated: !!win.truncated, sessions: win.actualSessions };
            if (v != null) any = true;
        }
        if (!any) continue;   // nothing measurable on this pair — it is not padded with zeros

        items.push({
            kind: 'signal',
            pairKey: p.pair_key,
            label: (p.numerator_symbol || '?') + '/' + (p.denominator_symbol || '?'),
            // CPER/GLD loads on no axis. It renders as absent — never
            // blank, and never quietly filed under one of the three.
            axisKey: axis.axisKey,
            // The KEY is the tape token; `factor_axes.label` is a full
            // sentence ("Cyclical risk-on (up = cyclicals & credit over
            // defensives & gold)") and swamps the item at ticker size. The
            // sentence and `positive_means` ride on the title, so the
            // orientation is one hover away rather than discarded — which is
            // what the "render from positive_means" rule is protecting.
            axisLabel: meta ? (meta.label || meta.axis_key) : null,
            axisPositiveMeans: meta ? (meta.positive_means || null) : null,
            axisUnassigned: axis.unassigned,
            axisNearTie: axis.nearTie,
            loading: axis.loading,
            // THE SIGN IS NEVER DROPPED. RSP/SPY loads −0.47 on
            // concentration: a reader shown a rising RSP/SPY beside a bare
            // "concentration" tag would conclude the opposite of what the
            // loading says. nexusPairsCompute.js makes this argument in its
            // own header and the tape is the surface that would break it.
            loadingSign: axis.loading == null ? null : (axis.loading < 0 ? '−' : '+'),
            moves,
            asOf: lastDate((bySymbol || {})[p.numerator_symbol]),
        });
    }

    items.sort((a, b) => {
        const av = a.moves.d.value, bv = b.moves.d.value;
        if (av == null) return 1;
        if (bv == null) return -1;
        return Math.abs(bv) - Math.abs(av);
    });

    return { key: 'signals', label: 'SIGNALS', caption: 'ratio pairs · 1D 1W 1M', items };
}

// ── Assembly ─────────────────────────────────────────────────
// "A sprint with no data is skipped, not padded." An empty sprint is
// dropped from the cycle entirely rather than rendered as a heading over
// nothing, and the tape reports how many it is running so a two-sprint
// tape is legible as two rather than read as three.
export function buildTape(sprints) {
    const present = (sprints || []).filter(s => s && s.items && s.items.length > 0);
    const skipped = (sprints || []).filter(s => s && (!s.items || s.items.length === 0)).map(s => s.key);
    return {
        sprints: present,
        sprintCount: present.length,
        skipped,
        empty: present.length === 0,
    };
}
