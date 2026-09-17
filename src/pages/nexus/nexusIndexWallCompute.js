// ============================================================
// ATLAS Nexus — the index wall (G-5). Pure, IO-free.
// ------------------------------------------------------------
// The board already loads SPY / QQQ / IWM / DIA daily closes and shows
// ONE of them at a time behind symbol chips. The wall shows all of them,
// on one window, two ways:
//
//   SEPARATE — small multiples at native price. What each index did.
//   COMPARED — every index rebased to 100 on a COMMON first session,
//              on one chart. Which index did better.
//
// Both faces are the same four series answering the same question
// differently, which is the bar NexusFaceToggle sets. Neither face shows
// a row the other lacks.
//
// REBASING IS WHERE THIS GOES WRONG IF YOU ARE CASUAL. Four series
// rebased each from its own first bar are four different experiments
// drawn on one chart: if QQQ's window starts a session later than SPY's,
// the two lines answer different questions and the one that started on a
// down day looks better for free. The compared face therefore rebases on
// the INTERSECTION of the four date sets, and publishes how many
// sessions that intersection cost. The separate face has no such problem
// -- nothing is being compared -- so it keeps every bar it has.
// ============================================================

// Sessions, not calendar days: these are daily closes, so a month is 21
// trading days. `Max` is unbounded on purpose — it is the only honest
// answer to "show me everything" when the four series start on different
// dates.
export const WALL_RANGES = [
    { key: '1M', label: '1M', sessions: 21 },
    { key: '3M', label: '3M', sessions: 63 },
    { key: '6M', label: '6M', sessions: 126 },
    { key: '1Y', label: '1Y', sessions: 252 },
    { key: 'MAX', label: 'Max', sessions: Infinity },
];

export const DEFAULT_RANGE = '6M';

const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export function rangeOf(key) {
    return WALL_RANGES.find(r => r.key === key) || WALL_RANGES.find(r => r.key === DEFAULT_RANGE);
}

// A bar with no close cannot be plotted and cannot be rebased against.
// Dropped here rather than rendered as a gap, so every consumer below
// sees a clean series.
function cleanSeries(series) {
    const out = [];
    for (const b of series || []) {
        const c = num(b && b.c);
        if (c != null && b.t) out.push({ t: b.t, c });
    }
    out.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    return out;
}

// Percent from the window's first close to its last. A first close of
// zero has no percentage relative to it — null, never Infinity and never
// a made-up 0.00%.
export function windowMove(slice) {
    if (!slice || slice.length < 2) return null;
    const a = slice[0].c, b = slice[slice.length - 1].c;
    if (!(a > 0)) return null;
    return ((b - a) / a) * 100;
}

// ── SEPARATE: one index, its own bars ────────────────────────
export function wallSeparate(indices, rangeKey) {
    const r = rangeOf(rangeKey);
    return (indices || []).map(ix => {
        const full = cleanSeries(ix && ix.series);
        const slice = full.length > r.sessions ? full.slice(full.length - r.sessions) : full;
        return {
            symbol: ix.symbol,
            series: slice,
            sessions: slice.length,
            // A window the data cannot fill is marked rather than quietly
            // shown as though it were a full one: "1Y" over 90 bars is a
            // different statement from "1Y".
            truncated: Number.isFinite(r.sessions) && slice.length < r.sessions,
            move: windowMove(slice),
        };
    });
}

// ── COMPARED: every index rebased on a common session ────────
// The intersection is the whole point. Rebasing each series from its own
// first bar makes the comparison meaningless in exactly the case a reader
// most wants it — a fast-moving window where the feeds disagree by a
// session or two.
export function wallCompared(indices, rangeKey) {
    const r = rangeOf(rangeKey);
    const cleaned = (indices || [])
        .map(ix => ({ symbol: ix.symbol, series: cleanSeries(ix && ix.series) }))
        .filter(ix => ix.series.length);

    if (!cleaned.length) return { legs: [], sessions: 0, from: null, to: null, alignmentCost: 0, dropped: [] };

    // Dates present in EVERY leg.
    let common = null;
    for (const ix of cleaned) {
        const dates = new Set(ix.series.map(b => b.t));
        common = common == null ? dates : new Set([...common].filter(d => dates.has(d)));
    }
    const all = [...(common || [])].sort();
    const dates = Number.isFinite(r.sessions) && all.length > r.sessions
        ? all.slice(all.length - r.sessions) : all;

    if (dates.length < 2) {
        return {
            legs: [], sessions: dates.length, from: dates[0] || null, to: dates[dates.length - 1] || null,
            alignmentCost: 0, dropped: [], tooShort: true,
        };
    }

    const want = new Set(dates);
    const legs = [];
    const dropped = [];
    for (const ix of cleaned) {
        const byDate = new Map(ix.series.map(b => [b.t, b.c]));
        const pts = [];
        let base = null;
        for (const d of dates) {
            const c = byDate.get(d);
            if (c == null) { pts.length = 0; break; }
            if (base == null) base = c;
            pts.push({ t: d, c: (c / base) * 100 });
        }
        // A leg that cannot cover the common window is DROPPED and named,
        // never drawn from a different origin alongside the others.
        if (!pts.length || !(base > 0)) { dropped.push(ix.symbol); continue; }
        legs.push({ symbol: ix.symbol, series: pts, move: pts[pts.length - 1].c - 100 });
    }
    legs.sort((a, b) => b.move - a.move);

    // How many sessions the longest leg had to give up to be comparable.
    const longest = Math.max(...cleaned.map(ix => ix.series.length));
    const bounded = Number.isFinite(r.sessions) ? Math.min(longest, r.sessions) : longest;

    return {
        legs,
        sessions: dates.length,
        from: dates[0],
        to: dates[dates.length - 1],
        alignmentCost: Math.max(0, bounded - dates.length),
        dropped: dropped.sort(),
        tooShort: false,
        _want: want,
    };
}
