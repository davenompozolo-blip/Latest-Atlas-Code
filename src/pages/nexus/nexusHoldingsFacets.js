// ============================================================
// ATLAS Nexus — holdings facets (G-2). Pure, IO-free.
// ------------------------------------------------------------
// The Valuation House screener opens with a row of counted tiles —
// Value 9, Growth 19, Momentum 3, Quality 20 — that double as filters.
// It is a good grammar and the holdings table should share it, because
// two tables in one product that filter differently make the reader
// learn the app twice.
//
// WHAT IT MUST NOT SHARE IS THE SCREENER'S BUCKETS. Value / Growth /
// Momentum / Quality / Dividend / Contrarian are derived from screener
// fields the BOOK does not carry, and inventing them here would be a
// classification with nothing behind it — the same objection this
// codebase raises to a sector aggregate standing in for a theme, and to
// the tape's movers being called "the market".
//
// So the tiles are built from the facets the book actually has:
//
//   READ    the derived read per position (add / hold / trim / watch /
//           exit) — already computed, already ranked, previously rendered
//           as a small chip rail.
//   SIGNAL  the valuation signal, where one exists.
//
// A facet with no members does not get a tile. An empty tile invites the
// reader to click it and find nothing, and on a screener the tile row
// doubles as a summary — a zero there says "the book has none of these",
// which is a claim worth making only when it is a fact rather than a
// column that happens to be null.
// ============================================================

export const READ_ORDER = ['add', 'hold', 'trim', 'watch', 'exit'];

// What each read means, for the tile's subtitle. The screener's tiles
// carry one ("Low multiples", "Uptrend + RSI > 50") and they are most of
// why the row is readable at a glance.
export const READ_BLURB = {
    add:   'raise the position',
    hold:  'no change indicated',
    trim:  'reduce the position',
    watch: 'flagged, not actioned',
    exit:  'close the position',
};

export const UNCLASSIFIED = 'Unclassified';

const str = v => (v == null || v === '' ? null : String(v));

// ── Facet tiles ──────────────────────────────────────────────
// Counted in the ORDER the reads are ranked, not by frequency: the row is
// a spectrum from add to exit and re-sorting it by count destroys the
// only thing its left-to-right order was carrying.
export function readFacets(holdings) {
    const counts = {};
    for (const h of holdings || []) {
        const r = str(h && h.read);
        if (r) counts[r] = (counts[r] || 0) + 1;
    }
    return READ_ORDER
        .filter(r => counts[r])
        .map(r => ({ key: r, label: r, count: counts[r], blurb: READ_BLURB[r] || null }));
}

export function signalFacets(holdings) {
    const counts = {};
    for (const h of holdings || []) {
        const s = str(h && h.signal);
        if (s) counts[s] = (counts[s] || 0) + 1;
    }
    // Alphabetical: these have no intrinsic ordering the way reads do, and
    // ranking them by count would move the tiles under the reader every
    // time a price did.
    return Object.keys(counts).sort()
        .map(s => ({ key: s, label: s, count: counts[s] }));
}

// ── Filter options ───────────────────────────────────────────
// `Unclassified` is a real bucket and is offered as one, never folded
// into "All". A book with six unmapped names should be able to show them.
export function sectorOptions(holdings) {
    const seen = new Set();
    let anyMissing = false;
    for (const h of holdings || []) {
        const s = str(h && h.sector);
        if (!s || s === UNCLASSIFIED) anyMissing = true; else seen.add(s);
    }
    const out = [...seen].sort();
    if (anyMissing) out.push(UNCLASSIFIED);
    return out;
}

export function themeOptions(holdings) {
    const seen = new Set();
    let anyUnmapped = false;
    for (const h of holdings || []) {
        const t = str(h && h.theme);
        // theme stays NULL for unmapped names and is never coalesced to
        // sector -- the rule this codebase set when the flagship was
        // displaying sector values under a "Theme" heading.
        if (!t) anyUnmapped = true; else seen.add(t);
    }
    return { themes: [...seen].sort(), anyUnmapped };
}

// ── Applying them ────────────────────────────────────────────
// One filter function, so the row count in the header and the rows in the
// body cannot come from two different predicates.
export function applyFilters(holdings, f) {
    const q = (f && f.query ? String(f.query) : '').trim().toLowerCase();
    const reads = (f && f.reads) || null;
    const signals = (f && f.signals) || null;
    const theme = (f && f.theme) || 'ALL';
    const sector = (f && f.sector) || 'ALL';

    return (holdings || []).filter(h => {
        if (q && !String(h.tk || '').toLowerCase().includes(q)) return false;
        if (reads && reads.size && !reads.has(h.read)) return false;
        if (signals && signals.size && !signals.has(h.signal)) return false;
        if (theme !== 'ALL') {
            if (theme === 'UNMAPPED') { if (h.theme) return false; }
            else if (h.theme !== theme) return false;
        }
        if (sector !== 'ALL') {
            const s = str(h.sector);
            if (sector === UNCLASSIFIED) { if (s && s !== UNCLASSIFIED) return false; }
            else if (s !== sector) return false;
        }
        return true;
    });
}

// Is anything narrowing the view? Drives the `clear` affordance, which
// must not appear when there is nothing to clear.
export function isFiltered(f) {
    if (!f) return false;
    return !!(
        (f.query && String(f.query).trim()) ||
        (f.reads && f.reads.size) ||
        (f.signals && f.signals.size) ||
        (f.theme && f.theme !== 'ALL') ||
        (f.sector && f.sector !== 'ALL')
    );
}
