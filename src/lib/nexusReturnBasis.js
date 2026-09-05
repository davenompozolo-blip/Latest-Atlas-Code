// ============================================================
// ATLAS — the two returns Nexus publishes, named
// ------------------------------------------------------------
// `vw_nexus_holdings` carries two return columns and they are not two views
// of one number. On the book today they disagree in SIGN on 8 of 61 holdings,
// and the two columns differ by up to 125pp overall:
//
//   | symbol | total_return_pct | unrealised_return_pct |
//   |--------|-----------------:|----------------------:|
//   | SNDK   |          +31.68% |                −4.01% |
//   | MU     |          +20.73% |                −6.57% |
//   | AVGO   |           +7.37% |                −8.69% |
//   | META   |           −6.22% |                +2.82% |
//
// (Measured 2026-09-05, not copied forward — the CLAUDE.md entry that first
// recorded this defect quotes AMD/MU/SNDK figures that the book has since
// moved past. Re-measure before quoting these again.)
//
// `total_return_pct` is the return since the first fill — it includes shares
// already sold, so a name trimmed at a profit keeps that profit. That is why
// SNDK, MU and AVGO read positive there and negative on cost: the remaining
// shares are underwater. META is the same split in reverse — sold down at a
// loss, with the rump now above its average cost.
//
// `unrealised_return_pct` is the mark against average cost on what is STILL
// held. Neither is wrong; they answer different questions.
//
// ## What went wrong
//
// Five call sites read these columns and every one of them called its result
// "total return":
//
//   nexusLiveCompute:80    total_return_pct        → the "Total ret" column
//   nexusLiveCompute:265   unrealised ?? total     → winners / losers / at-risk
//   nexusLiveCompute:312   reconstructed from ↑    → the Portfolio panel line
//   nexusRealizedCompute:184  unrealised_return_pct → `totalPct`
//   api/nexus-bench:210    unrealised ?? total     → `totalReturnPct`
//
// So a position could be counted a loser in the summary and show green in the
// table on the same screen, with nothing on either to say they were measuring
// different things. That is the same failure as the Performance module's
// mixed-basis trap, in a module that never got the fix.
//
// ## Two rules, both of which this module exists to enforce
//
// **Name the basis.** A figure is `{ pct, basis }`, never a bare number, and
// the label the user sees comes from the basis rather than from whatever the
// variable happened to be called.
//
// **Never substitute one for the other.** Two of the five sites read
// `unrealised ?? total`. That fallback is silent, and it is exactly what
// `atlas.return.basis.v1` already forbids in Performance: "the toggle never
// falls back across bases … a row that cannot be measured on the active basis
// shows a reason." A mixed column with nothing on screen to say so is worse
// than a short one.
//
// The fallback is latent rather than live today — all 61 rows carry both
// figures, so no number on screen is currently wrong because of it. It is
// fixed anyway: it costs nothing now, and the codebase has three entries
// (`search_path`, the phantom `positions` rows, the price-basis gate) about
// dormant defects deferred on "nothing currently needs it" that went on to
// fail.
// ============================================================

/** Return since the first fill. Includes realised gains on shares since sold. */
export const BASIS_SINCE_ENTRY = 'since_entry';

/** Mark against average cost on what is still held. */
export const BASIS_ON_COST = 'on_cost';

export const BASES = [BASIS_SINCE_ENTRY, BASIS_ON_COST];

/** Column header / inline label. Short enough to sit beside a number. */
export const BASIS_LABEL = {
    [BASIS_SINCE_ENTRY]: 'Since entry',
    [BASIS_ON_COST]: 'On cost',
};

/** One line, for a tooltip or a panel subtitle. */
export const BASIS_READ = {
    [BASIS_SINCE_ENTRY]: 'return since the first fill, including shares already sold',
    [BASIS_ON_COST]: 'mark against average cost on what is still held',
};

/** Which view column backs each basis. */
const COLUMN = {
    [BASIS_SINCE_ENTRY]: 'total_return_pct',
    [BASIS_ON_COST]: 'unrealised_return_pct',
};

function num(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
}

/**
 * Read one basis off a raw `vw_nexus_holdings` row.
 *
 * Strict by construction: there is no second argument that would let a caller
 * fall through to the other column. A row that cannot be measured on the
 * requested basis returns null, and the caller decides what to say about it —
 * which is the only way the reason survives to the screen.
 *
 * @param {object} row   a raw view row
 * @param {string} basis BASIS_SINCE_ENTRY | BASIS_ON_COST
 * @returns {number|null} percent, in percent units (not a fraction)
 */
export function readReturn(row, basis) {
    const col = COLUMN[basis];
    if (!col) throw new Error('unknown return basis: ' + basis);
    return row ? num(row[col]) : null;
}

/**
 * The same read, carrying its own provenance.
 *
 * Prefer this wherever the figure reaches a component: a `{ pct, basis,
 * label }` cannot be rendered without the reader knowing which question it
 * answers, whereas a bare number can and did.
 */
export function readReturnTagged(row, basis) {
    const pct = readReturn(row, basis);
    return {
        pct: pct,
        basis: basis,
        label: BASIS_LABEL[basis],
        read: BASIS_READ[basis],
        measured: pct != null,
        reason: pct == null ? 'no ' + BASIS_LABEL[basis].toLowerCase() + ' figure for this position' : null,
    };
}

/**
 * Split rows into those measurable on `basis` and those that are not.
 *
 * Every consumer that counts positions needs this, because the honest denominator
 * is "rows we could measure", not "rows in the book" — and the count of the
 * ones dropped has to be available to say so.
 */
export function partitionByBasis(rows, basis) {
    const measured = [], unmeasured = [];
    (rows || []).forEach(function (r) {
        (readReturn(r, basis) == null ? unmeasured : measured).push(r);
    });
    return { measured: measured, unmeasured: unmeasured, basis: basis };
}

/**
 * The two figures side by side, for a row that wants to show both.
 *
 * `disagree` marks the sign split — 8 of 61 holdings today. It is not an
 * error: a name trimmed at a profit and now underwater on the remainder is
 * genuinely up since entry and down on cost.
 */
export function bothBases(row) {
    const sinceEntry = readReturn(row, BASIS_SINCE_ENTRY);
    const onCost = readReturn(row, BASIS_ON_COST);
    const both = sinceEntry != null && onCost != null;
    return {
        sinceEntry: sinceEntry,
        onCost: onCost,
        disagree: both && sinceEntry !== 0 && onCost !== 0
                  && Math.sign(sinceEntry) !== Math.sign(onCost),
        gapPp: both ? sinceEntry - onCost : null,
    };
}
