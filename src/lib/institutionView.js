// ============================================================
// Equity Research · EQ-4 — the institution layer's view shape.
//
// PURE. No transport, no React: the loader lives in
// `src/pages/equity/institutionRatios.js` and hands its rows here, the same
// split `clusterView.js` and `segmentView.js` already use.
//
// THE METRICS ARE ABSENT WHEN UNMEASURED. Not null, not zero, not an em dash
// the renderer supplies: the key is not on the object, so a renderer cannot
// print a number it was never handed. Same construction as
// `nexusReturnBasis.js` and A2's axis betas — the wrong thing is impossible
// to write rather than discouraged.
//
// FOUR STATES, KEPT APART, because they need four different actions:
//   not_loaded   — no as-reported lines for this symbol at all
//   no_framework — lines loaded, and no institution framework applies (a
//                  retailer). That is an ANSWER, not a gap.
//   loaded       — a framework applies
//   failed       — the query did not answer. NEVER rendered as a statement
//                  about the data; this codebase has five entries about that.
// ============================================================

export const INST_LOADED       = 'loaded';
export const INST_NO_FRAMEWORK = 'no_framework';
export const INST_NOT_LOADED   = 'not_loaded';
export const INST_FAILED       = 'failed';

// ── the framework's name, from the duration basis and never from P&C ────────
// EQ-4h: UNH and HUM file short-duration contract liabilities exactly as a
// P&C insurer does and write no property and no casualty business. The label
// must say what was tested.
export const FRAMEWORK_LABEL = {
    bank:                   'Depository · CAMELS',
    short_duration_insurer: 'Short-duration insurer (ASC 944)',
    long_duration_insurer:  'Long-duration insurer (ASC 944)',
    mixed_insurer:          'Insurer writing both contract durations',
    mixed_bank_insurer:     'Depository with insurance contracts',
};

const WITHHELD_SENTENCE = {
    underwriting_expense_not_measured:
        'The combined ratio needs an underwriting expense ratio, and no sound numerator for '
      + 'one is reported: the only candidates are DAC amortisation, which is a component, and '
      + '"other underwriting expense", which says so in its own name.',
    loan_book_not_reported_by_this_filer_year:
        'This filing reports no loan book to divide by. The tag changed with ASC 326 (CECL) '
      + 'and this year falls in the filer’s own transition, where one side is reported and '
      + 'the other is not.',
    regulatory_capital_not_in_face_statements:
        'Capital adequacy needs Tier 1 capital and risk-weighted assets. Those live in the '
      + 'regulatory capital tables, not the face statements, and are absent on every filer '
      + 'measured.',
};

export function withheldSentence(code) {
    return WITHHELD_SENTENCE[code] || null;
}

function fin(v) {
    const n = Number(v);
    return v != null && v !== '' && Number.isFinite(n) ? n : null;
}

/** Put `key` on `out` only if the value is a finite number. */
function put(out, key, v) {
    const n = fin(v);
    if (n !== null) out[key] = n;
}

/**
 * Pure. Takes the view's rows (newest first) and returns what the panel may
 * render — nothing more.
 *
 * @param {Array<object>} rows
 */
export function buildInstitutionView(rows) {
    const list = Array.isArray(rows) ? rows.slice() : [];
    if (!list.length) return { state: INST_NOT_LOADED, metrics: {}, withheld: {}, years: [] };

    // Newest first is the loader's contract; re-derive it rather than trust it,
    // because a caller can hand rows from anywhere.
    list.sort((a, b) => Number(b.fiscal_year) - Number(a.fiscal_year));
    const cur = list[0];

    const framework = cur.primary_framework || null;
    if (!framework) {
        return {
            state: INST_NO_FRAMEWORK,
            fiscalYear: Number(cur.fiscal_year),
            years: list.map(r => Number(r.fiscal_year)),
            metrics: {}, withheld: {},
        };
    }

    const metrics = {};
    const withheld = {};

    if (cur.bank_applicable) {
        put(metrics, 'efficiency_ratio', cur.efficiency_ratio);
        put(metrics, 'noninterest_income_share', cur.noninterest_income_share);
        put(metrics, 'nii_to_assets', cur.nii_to_assets);
        put(metrics, 'deposits_to_assets', cur.deposits_to_assets);
        put(metrics, 'allowance_to_loans', cur.allowance_to_loans);
        put(metrics, 'loans_to_assets', cur.loans_to_assets);
        if (cur.camels_a_withheld) withheld.camels_a = cur.camels_a_withheld;
        if (cur.camels_c_withheld) withheld.camels_c = cur.camels_c_withheld;
    }

    if (cur.short_duration_applicable) {
        put(metrics, 'loss_and_lae_ratio', cur.loss_and_lae_ratio);
        put(metrics, 'reserves_to_premiums', cur.reserves_to_premiums);
        if (cur.combined_ratio_withheld) withheld.combined_ratio = cur.combined_ratio_withheld;
    }

    if (cur.long_duration_applicable) {
        put(metrics, 'separate_account_share', cur.separate_account_share);
        // THE CAVEAT IS PART OF THE FIGURE, NOT AN ANNOTATION ON IT.
        // benefits_to_premiums reads like a loss ratio and is not one: a
        // long-duration insurer earns most of its revenue as net investment
        // income and policy fees, so premiums are a minority denominator and
        // the ratio runs near or above 1.0 without saying anything about
        // underwriting. A row that somehow carries the number without the
        // caveat is REFUSED rather than rendered bare — the view puts the
        // caveat on all 62 such rows, so this can only fire on a regression,
        // which is exactly when it matters.
        const b = fin(cur.benefits_to_premiums);
        if (b !== null) {
            if (cur.benefits_ratio_caveat) {
                metrics.benefits_to_premiums = b;
                metrics.benefits_ratio_caveat = cur.benefits_ratio_caveat;
            } else {
                withheld.benefits_to_premiums = 'caveat_missing';
            }
        }
    }

    // The trend, oldest-last, for whichever metrics the panel charts. Only
    // years that actually measured the metric appear — a gap is a gap, never
    // a zero, because a zero efficiency ratio is a bank with no costs.
    function series(key) {
        return list
            .filter(r => fin(r[key]) !== null)
            .map(r => ({ year: Number(r.fiscal_year), value: fin(r[key]) }))
            .reverse();
    }

    return {
        state: INST_LOADED,
        framework,
        frameworkLabel: FRAMEWORK_LABEL[framework] || framework,
        bankApplicable:          !!cur.bank_applicable,
        shortDurationApplicable: !!cur.short_duration_applicable,
        longDurationApplicable:  !!cur.long_duration_applicable,
        fiscalYear: Number(cur.fiscal_year),
        years: list.map(r => Number(r.fiscal_year)),
        periods: list.length,
        metrics,
        withheld,
        series,
    };
}
