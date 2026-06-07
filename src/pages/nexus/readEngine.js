// ============================================================
// Nexus Meat · Step 1 — The Read Engine
// ------------------------------------------------------------
// "The read is the verdict column, derived not authored."
//
// computeRead() is a pure, deterministic, side-effect-free function.
// The provider calls it per holding and writes `read` + `because`
// into the model; components stay dumb and just render them.
//
// Transparent  — every read ships a `because`.
// Structural   — driven by valuation / signal tone / conviction /
//                portfolio room, never daily P&L.
// Portfolio-aware — behind a swappable RoomAssessor seam, so we can
//                deepen it (theme concentration → marginal risk)
//                without touching the cascade.
// ============================================================

// ── Config — the tunable knobs (section 4) ────────────────────
// Defaults fitted to the current book. Config, not code: tune
// without a rebuild. No threshold is buried in the logic below.
export const READ_CONFIG = {
    cheapLo:  4,    // fvGap >= this is "cheap"
    cheapHi: 10,    // fvGap >= this is "strong-cheap"
    richTh:  -3,    // fvGap <= this is "rich"
    lowConv: 55,    // conviction below this is "soft"
    varCap:  10,    // componentVar at/above this = no room (v1)
    // v1.1 will add: themeCap: 20
};

// ── RoomAssessor seam (section 3) ─────────────────────────────
// Interface:  assess(holding, book, config) -> { hasRoom, reason }
//
// v1 — ConcentrationPenalty. One threshold (VaR cap). Deliberately
// minimal: the seam, the contract, and the cascade are what we
// prove out first. v1.1 (theme concentration) and v2 (Cortex
// marginal risk) are same-signature drop-ins — the cascade is
// untouched, and swapping is a one-line provider change.
export const ConcentrationPenalty = {
    assess(holding, _book, config) {
        const hasRoom = holding.componentVar < config.varCap;
        return {
            hasRoom,
            reason: hasRoom ? '' : `already ${holding.componentVar.toFixed(1)}% of book risk`,
        };
    },
};

// Signed fair-value gap, e.g. +9.8% / −3.4%
const fvFmt = v => (v >= 0 ? '+' : '−') + Math.abs(Number(v)).toFixed(1) + '%';

/**
 * Compute the structural read for a single holding.
 *
 * @param {import('./nexusModel.js').Holding} holding
 * @param {Object} book          full holdings array + portfolio aggregates (theme shares, total VaR, fragility) for the assessor
 * @param {typeof READ_CONFIG} [config]
 * @param {{assess: Function}} [roomAssessor]   injected seam; defaults to ConcentrationPenalty
 * @returns {{read: "add"|"hold"|"trim"|"watch"|"exit", because: string}}
 */
export function computeRead(holding, book, config = READ_CONFIG, roomAssessor = ConcentrationPenalty) {
    const h = holding;

    // Attractiveness — name-level, in isolation.
    const cheap         = h.fvGapPct >= config.cheapLo;
    const strongCheap   = h.fvGapPct >= config.cheapHi;
    const rich          = h.fvGapPct <= config.richTh;
    const soft          = h.conviction < config.lowConv;
    const improving     = h.signalTone === 'improving';
    const deteriorating = h.signalTone === 'deteriorating';

    // ── 1. Data gate — never act on stale inputs; freeze the verdict.
    if (h.stale) {
        return soft
            ? { read: 'watch', because: 'Stale feed, conviction soft, verdict frozen.' }
            : { read: 'hold',  because: 'Stale feed, verdict frozen until data refreshes.' };
    }

    // Room — portfolio-level. Assessed once via the injected seam.
    const room = roomAssessor.assess(h, book, config);

    // ── 2. Deteriorating thesis (unless so cheap it overrides) → watch.
    if (deteriorating && !strongCheap) {
        return { read: 'watch', because: `${h.signal || 'Signal weakening'}, conviction soft, watching.` };
    }

    // ── 3. Rich and not improving → trim.
    if (rich && !improving) {
        return { read: 'trim', because: `Rich vs fair value (${fvFmt(h.fvGapPct)}).` };
    }

    const addWorthy = strongCheap || (cheap && improving);

    // ── 4. Attractive with room → add.
    if (addWorthy && room.hasRoom) {
        return { read: 'add', because: `Cheap (${fvFmt(h.fvGapPct)}) into an intact thesis, room to size.` };
    }

    // ── 5. Cheap, thesis intact, but no room → hold.
    if (cheap && !deteriorating && !room.hasRoom) {
        return { read: 'hold', because: `Cheap, but ${room.reason}.` };
    }

    // ── 6. Thesis broken: low conviction into a rich, weakening name → exit.
    //      (Sits low and rarely fires; kept so the taxonomy is complete.)
    if (soft && rich && deteriorating) {
        return { read: 'exit', because: 'Thesis broken: low conviction into a rich, weakening name.' };
    }

    // ── 7. Default.
    return { read: 'hold', because: 'Fairly valued, thesis intact.' };
}
