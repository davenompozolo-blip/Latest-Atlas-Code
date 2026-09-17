// ============================================================
// ATLAS Nexus — the MARKET tape (G-1). Pure, IO-free.
// ------------------------------------------------------------
// The book tape says what MY names did. This one says what the market
// did, and the two run as separate tapes on purpose: a reader has to be
// able to tell "my book is down" from "the market is down", and one
// stream carrying both makes that distinction a matter of remembering
// which sprint you are in.
//
// Four sprints: sectors, movers, the cap spectrum, cross-asset.
//
// THE MOVERS UNIVERSE IS THIRTY CURATED LARGE CAPS, not the market.
// `api/movers.js` ranks a fixed list and slices five off each end, so
// "top movers" here means "the best of thirty names someone chose". That
// is a real limit and it is printed, for the same reason XLE is labelled
// XLE rather than "Energy": the measurement is what it is, and the
// interpretation does not get to stand in for it.
//
// Ranked slices are banded BEST / WORST rather than GAINERS / LOSERS.
// The bottom five of thirty are not losers on a day the whole list is
// up, and a band that says otherwise is wrong exactly when the market is
// most obviously not. Same reasoning as the book tape's caret: the sign
// is carried by the caret and the tone, the ranking by the band.
// ============================================================

import { ASSET_CLASSES, ASSET_INDEX } from '../../lib/marketAssetGroups.js';

export const MOVERS_PER_SIDE = 5;

// A payload older than this is still shown — it is the last real
// observation — but its age is printed beside it. Nothing here is
// withheld for age: unlike a holding's mark, a quote that is an hour old
// is an hour-old quote and says so, rather than a fabricated current one.
export const STALE_PAYLOAD_MIN = 20;

const num = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// ── helpers ──────────────────────────────────────────────────
// A quote with no change percent cannot appear on a tape: there is no
// move to print and a tape renders everything on it as a measurement.
// Withheld and counted, never rendered as 0.00%.
function partition(quotes) {
    const kept = [], withheld = [];
    for (const q of quotes || []) {
        const move = num(q && q.changePct);
        if (move == null || !q.symbol) withheld.push(q && q.symbol ? q.symbol : '?');
        else kept.push({ symbol: q.symbol, move, name: q.name || null, price: num(q.price) });
    }
    return { kept, withheld };
}

function ageMinutes(ts, now) {
    const t = num(ts);
    if (t == null) return null;
    return Math.max(0, Math.round(((now == null ? Date.now() : now) - t) / 60000));
}

function sprint(key, label, caption, items, extra) {
    return Object.assign({ key, label, caption, items }, extra || {});
}

// ── Sprint 1 — sectors ───────────────────────────────────────
// All eleven GICS sector ETFs, ranked, with a sign split rather than a
// quantile one. LEADING is not "the top half" — it is the sectors that
// are actually up, so on a red tape it simply does not appear. A fixed
// share of the list labelled leading every day would be a ranking dressed
// as a market read, the same objection this codebase has to quantile
// verdict bands.
export function sprintSectors(sectors) {
    const { kept, withheld } = partition(sectors);
    kept.sort((a, b) => b.move - a.move);
    const items = kept.map(q => ({
        kind: 'mkt',
        symbol: q.symbol,
        move: q.move,
        proxiesFor: q.name || null,
        band: q.move > 0 ? 'up' : q.move < 0 ? 'down' : 'flat',
    }));
    return sprint('sectors', 'SECTORS', 'the eleven GICS sector ETFs, ranked by today’s move', items, {
        withheldCount: withheld.length,
        withheldReason: withheld.length ? withheld.join(', ') + ' · no quote' : null,
    });
}

// ── Sprint 2 — movers ────────────────────────────────────────
export function sprintMovers(top, bottom) {
    const t = partition(top), b = partition(bottom);
    const items = [
        ...t.kept.slice(0, MOVERS_PER_SIDE).map(q => ({ kind: 'mkt', symbol: q.symbol, move: q.move, proxiesFor: q.name, band: 'best' })),
        ...b.kept.slice(0, MOVERS_PER_SIDE).map(q => ({ kind: 'mkt', symbol: q.symbol, move: q.move, proxiesFor: q.name, band: 'worst' })),
    ];
    const withheld = t.withheld.length + b.withheld.length;
    return sprint('movers', 'MOVERS', 'best and worst of thirty tracked large caps', items, {
        withheldCount: withheld,
        withheldReason: withheld ? 'no quote' : null,
        // Printed, not assumed known. Without it the sprint reads as the
        // market's movers, which it is not.
        scopeNote: 'ranked within 30 tracked large caps · not the whole market',
    });
}

// ── Sprint 3 — the cap spectrum ──────────────────────────────
// Mega to micro in the order api/movers.js supplies, which is the order
// that makes the read legible: the shape of the sequence IS the breadth
// signal, so it is never re-sorted by move.
export function sprintCapSpectrum(capSpectrum) {
    const { kept, withheld } = partition(capSpectrum);
    // No band. The sprint label already says CAP SPECTRUM, and a frame
    // marker that restates its own label is noise on a tape where every
    // marker is supposed to mean the frame just changed.
    const items = kept.map(q => ({
        kind: 'mkt', symbol: q.symbol, move: q.move,
        proxiesFor: (q.name || '').replace(/\s+/g, ' ').trim() || null,
    }));
    return sprint('cap', 'CAP SPECTRUM', 'mega through micro — in size order, never re-ranked', items, {
        withheldCount: withheld.length,
        withheldReason: withheld.length ? withheld.join(', ') + ' · no quote' : null,
    });
}

// ── Sprint 4 — cross-asset ───────────────────────────────────
// Grouped by the shared registry rather than by a list held here. A
// symbol the registry does not know is DROPPED and named, never filed
// under a class it was never assigned to — a wrong class is worse than
// an absent one, because it reads as a fact about the asset.
export function sprintCrossAsset(market) {
    const { kept, withheld } = partition(market);
    const bySym = new Map(kept.map(q => [q.symbol, q]));
    const items = [];
    const dropped = [];

    for (const cls of ASSET_CLASSES) {
        for (const sym of cls.symbols) {
            const q = bySym.get(sym);
            if (!q) continue;
            bySym.delete(sym);
            items.push({
                kind: 'mkt', symbol: sym, move: q.move,
                proxiesFor: ASSET_INDEX[sym] ? ASSET_INDEX[sym].proxiesFor : null,
                band: cls.key, bandLabel: cls.label,
            });
        }
    }
    for (const sym of bySym.keys()) dropped.push(sym);

    return sprint('cross', 'CROSS-ASSET', 'equities, rates, credit, commodities and the dollar', items, {
        withheldCount: withheld.length,
        withheldReason: withheld.length ? withheld.join(', ') + ' · no quote' : null,
        droppedSymbols: dropped.sort(),
    });
}

// ── Band labels ──────────────────────────────────────────────
const BAND_LABEL = {
    up: 'LEADING', down: 'LAGGING', flat: 'FLAT',
    best: 'BEST', worst: 'WORST',
};

export function marketBandOf(it) {
    if (!it || !it.band) return null;
    const label = it.bandLabel || BAND_LABEL[it.band];
    if (!label) return null;
    return { key: it.band, label };
}

// ── Assembly ─────────────────────────────────────────────────
// A sprint with no items is dropped rather than rendered as an empty
// frame: a label with nothing under it reads as a feed that returned
// nothing to say, when what happened is that it returned nothing at all.
export function buildMarketTape(sprints, opts) {
    const live = (sprints || []).filter(s => s && s.items && s.items.length);
    const o = opts || {};
    const age = ageMinutes(o.asOfTs, o.now);
    return {
        sprints: live,
        empty: live.length === 0,
        ageMinutes: age,
        stale: age != null && age >= STALE_PAYLOAD_MIN,
    };
}
