// ============================================================
// ATLAS — return basis (memo v2 §4 step 3)
// ------------------------------------------------------------
// Which return a surface shows, and what it is honestly called.
//
// ## Why one shared key, when the Brinson benchmark gets namespaced
//
// The memo tells us to namespace `atlas_brinson_bench` because Performance and
// Nexus will grade against different things once Performance moves to a
// cluster basis — one control silently changing two things that no longer mean
// the same thing. This control is the exact opposite case: "time-weight my
// return by when the money was actually in, or don't" is the *same question*
// on every surface, so one answer should hold everywhere. Splitting it would
// let the two modules disagree about the same position with nothing on screen
// to say why.
//
// ## Why the plain basis is not called "Simple"
//
// Both modules' return COLUMNS agree: Nexus's "Total ret" and Performance's
// "Return %" both read `total_return_pct` and are identical to the cent.
// Both are return *since first buy* — current price against the first fill,
// ignoring every add and trim. So the plain label is SINCE ENTRY in both.
//
// What did NOT agree was inside Nexus. `vw_nexus_holdings` publishes two
// different returns — `total_return_pct` (since the first fill) and
// `unrealised_return_pct` (the mark on average cost) — and six sites used them
// interchangeably under the words "total return", two of them falling back
// across the pair. They disagree in SIGN on 8 of 61 holdings, so a name could
// be a "loser" in the summary and green in the table.
//
// **Fixed 2026-09-05.** `src/lib/nexusReturnBasis.js` names them `since_entry`
// and `on_cost`, its reader takes no fallback argument, and every surface now
// declares which one it is on. Neither measure was wrong; the labelling was.
// Naming the basis where it is shown is the rule: SINCE ENTRY, ON COST, MWR —
// and never the word "Simple" over two different numbers.
//
// ## Brinson does not follow this toggle, by construction
//
// The attribution engine's benchmark leg is a neutral-weighted average of this
// book's OWN position returns. Money-weighting those would make the comparator
// reflect your cash-flow timing, so selection would grade your trading against
// your trading. See the header of `src/lib/attributionEngine.js`; the panel
// badges `ON SINCE ENTRY` when the toggle says MWR, and that badge is a
// settled property of the model rather than pending work.

export const BASIS_MWR = 'mwr';
export const BASIS_PLAIN = 'plain';

const STORAGE_KEY = 'atlas.return.basis.v1';

/** Per-surface label for the non-MWR basis. Name the number, never "Simple". */
export const PLAIN_LABEL = {
    nexus: 'SINCE ENTRY',
    performance: 'SINCE ENTRY',
};

export const PLAIN_HINT = {
    nexus: 'Current price against the first fill, ignoring adds and trims',
    performance: 'Current price against the first fill, ignoring adds and trims',
};

export const MWR_HINT =
    'Money-weighted over the holding period — the return on the cash actually deployed, when it was deployed';

export function loadBasis() {
    try {
        const v = window.localStorage.getItem(STORAGE_KEY);
        return v === BASIS_MWR ? BASIS_MWR : BASIS_PLAIN;
    } catch (e) {
        return BASIS_PLAIN;   // private mode
    }
}

export function saveBasis(basis) {
    try {
        window.localStorage.setItem(STORAGE_KEY, basis === BASIS_MWR ? BASIS_MWR : BASIS_PLAIN);
    } catch (e) { /* private mode — the choice just doesn't persist */ }
    // Other mounted surfaces follow without a reload. `storage` only fires in
    // *other* tabs, so this event is what keeps two panels in one tab in step.
    try {
        window.dispatchEvent(new CustomEvent('atlas:return-basis', { detail: { basis: basis } }));
    } catch (e) { /* no window */ }
}

/**
 * The MWR figure for a row, or null with a reason.
 *
 * Never falls back to the plain basis when MWR is unavailable. Six of 86
 * positions have no MWR — a mixed-basis column that silently substitutes one
 * definition for another is precisely the failure this sequence exists to
 * remove. Callers render `reason` instead of a number.
 */
export function mwrOf(row) {
    if (!row) return { value: null, reason: 'no engine row' };
    if (row.engine_status && row.engine_status !== 'measured') {
        return { value: null, reason: row.engine_reason || row.engine_status };
    }
    if (row.position_mwr_period_pct == null) {
        return { value: null, reason: row.engine_reason || 'not measurable' };
    }
    return { value: Number(row.position_mwr_period_pct), reason: null };
}

/** Short, human form of an engine_status for a badge or tooltip. */
export const STATUS_TEXT = {
    ledger_mismatch:   'ledger disagrees with broker',
    incomplete_ledger: 'ledger predates the position',
    stale_mark:        'price too old to mark',
    // Kept distinct from stale_mark on purpose: a stale mark self-heals when
    // the feed returns, this one needs a corporate-action adjustment and never
    // does. DD's fills sit at ~1:3 to its own tape.
    basis_mismatch:    'ledger and tape price different shares',
    no_rate:           'no defined rate',
};
