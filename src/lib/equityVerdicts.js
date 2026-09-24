// ============================================================
// Equity Research verdicts — what may be SAID, and on what evidence
// ------------------------------------------------------------
// Pure module: no React, no Supabase, no imports.
//
// Every function here answers one question: given what was actually
// measured, what claim is the surface allowed to make? The rule is the
// one this codebase already applies in `nexusReturnBasis.js`,
// `institutionView.js` and `companyProfileView.js`:
//
//     A FIGURE IS ABSENT FROM THE SHAPE WHEN IT CANNOT BE FORMED,
//     NOT NULL AND NOT A DEFAULT.
//
// A renderer cannot print a number it was never handed, which is the only
// version of that rule that survives the next edit. Three measured defects
// motivated it, all of them verdicts published on absent evidence:
//
//  1. `piotroski()` emitted a 9-POINT score formed from fewer than nine
//     criteria. On the 52 symbols carrying statements only 23 resolve all
//     nine; SONY and CPER resolve THREE and printed "2 / 9 · WEAK" in amber.
//     The panel had a partial guard and it was dead: it tested
//     `piotroski_f != null`, which the statement path always satisfies, so
//     the guard could never fire on the case it was written for.
//
//  2. The Sloan accrual fallback reconstructed a balance sheet out of a
//     market multiple — `mktCap / (pb || 3) + totalDebt` as "total assets",
//     with a P/B of 3 SUBSTITUTED when none was on file — and handed the
//     result to the sentence "Earnings are high-quality". That is the same
//     algebra deleted from the Altman card on PR #806, still live one card
//     across.
//
//  3. Capital Allocation graded "Buyback value-accretion C+" and "M&A track
//     record A−" from the mere EXISTENCE of a row, with no input of any
//     kind; derived ROIC as `roe * 0.6`; and printed an Overall Grade of
//     "B" when nothing at all was measured. The 'RISK-ON' string literal
//     G-4 removed from the chrome, in a letter grade.
//
// The band is the reading, not a default: `null > 2.60` is false, so an
// unformed score falls through to the WORST zone on every chain written as
// a descending ladder. That is why the bands here are computed only after
// completeness is established, never as an `else`.
// ============================================================

const finite = v => typeof v === 'number' && Number.isFinite(v);

// ── Piotroski ────────────────────────────────────────────────────────────
//
// Nine criteria, ordered as the panel renders them. The KEY is what
// `piotroski()` in statementRows.js publishes; the LABEL is what the card
// shows and what a withheld-criteria list names.
export const PIOTROSKI_CRITERIA = [
    ['niPos',       'Positive net income'],
    ['cfoPos',      'Positive operating CF'],
    ['roaRising',   'Rising ROA'],
    ['cfoGtNi',     'CF > net income (accruals)'],
    ['levFalling',  'Falling leverage'],
    ['crRising',    'Rising current ratio'],
    ['noNewShares', 'No new shares issued'],
    ['gmRising',    'Rising gross margin'],
    ['atRising',    'Rising asset turnover'],
];

export const PIOTROSKI_OUT_OF = PIOTROSKI_CRITERIA.length;

/**
 * What the F-Score card may say.
 *
 * @param {?Object} detail  per-criterion true/false/null, keyed as above
 * @returns {{
 *   rows: Array<{key:string,label:string,pass:?boolean,resolved:boolean}>,
 *   determinable: number,
 *   passed: number,
 *   complete: boolean,
 *   withheld: string[],
 *   score?: number,   // present ONLY when all nine resolved
 *   outOf?: number,   // 9, and present only alongside `score`
 *   band?: 'STRONG'|'GOOD'|'WEAK',
 * }}
 *
 * `score` and `band` are ABSENT on a partial reading rather than scaled or
 * defaulted. A partial F-Score is not a lower F-Score; it is a count of a
 * different number of tests, and the STRONG/GOOD/WEAK thresholds are defined
 * over nine. `passed` and `determinable` still describe what resolved, so
 * the card can say "2 of the 3 criteria that resolved passed" without
 * implying the composite.
 */
export function piotroskiView(detail) {
    const d = detail || {};
    const rows = PIOTROSKI_CRITERIA.map(([key, label]) => {
        const v = d[key];
        const resolved = v === true || v === false;
        return { key, label, pass: resolved ? v : null, resolved };
    });
    const determinable = rows.filter(r => r.resolved).length;
    const passed = rows.filter(r => r.pass === true).length;
    const complete = determinable === PIOTROSKI_OUT_OF;
    const out = {
        rows,
        determinable,
        passed,
        complete,
        withheld: rows.filter(r => !r.resolved).map(r => r.label),
    };
    if (complete) {
        out.score = passed;
        out.outOf = PIOTROSKI_OUT_OF;
        out.band = passed >= 7 ? 'STRONG' : passed >= 5 ? 'GOOD' : 'WEAK';
    }
    return out;
}

// ── Quality grade (the header tile) ──────────────────────────────────────
//
// The grade came off `piotroski_f >= 7 ? 'A−' : >= 5 ? 'B' : 'C'`, so a
// partial score graded a company C. It also read
// `equity_fundamentals_derived`, which EQ-5b measured as ABSENT FROM THE
// PRODUCTION BUNDLE — so the live path was always the fallback
// `roe > 0.20 ? 'B+' : '—'`: a letter grade on the same scale, from one
// ratio, labelled only "prov.".
//
// An ROE heuristic is not a forensic quality grade any more than a Z''
// missing two terms is a lower Z''. There is one basis and it is the
// complete F-Score, or the tile is absent with its reason.
export function qualityGradeView(pv) {
    if (!pv || !pv.complete) {
        return {
            reason: !pv || pv.determinable === 0
                ? 'No statements loaded, so no F-Score can be formed.'
                : 'F-Score resolved ' + pv.determinable + ' of ' + PIOTROSKI_OUT_OF
                  + ' criteria — the grade bands are defined over all nine.',
        };
    }
    return {
        grade: pv.score >= 7 ? 'A−' : pv.score >= 5 ? 'B' : 'C',
        basis: 'Piotroski F-Score ' + pv.score + '/' + PIOTROSKI_OUT_OF,
    };
}

// ── Sloan accruals ──────────────────────────────────────────────────────
//
// Statements only. The removed fallback is in the header comment; the
// short version is that `mktCap / (pb || 3) + totalDebt` is neither total
// assets nor, when `pb` is absent, anything the company reported.
export function sloanView(statementSloan) {
    if (!finite(statementSloan)) {
        return { reason: 'Accrual ratio needs reported net income, operating cash flow and total assets from the statement layer.' };
    }
    const cashBacked = Math.abs(statementSloan) < 0.05;
    return {
        ratio: statementSloan,
        cashBacked,
        note: cashBacked
            ? 'Earnings are cash-backed: operating cash flow closely tracks reported income and accruals are small.'
            : 'Accrual ratio elevated — monitor for earnings-quality deterioration. Corroborate with the CFO/NI ratio.',
    };
}

// ── Capital allocation ──────────────────────────────────────────────────
//
// Letter grades and their points. Averaging letters needs a scale; this is
// the ordinary 4.0 one, stated here rather than implied by string order.
const GRADE_POINTS = { A: 4.0, 'A−': 3.7, 'B+': 3.3, B: 3.0, 'B−': 2.7, 'C+': 2.3, C: 2.0 };
const POINTS_DESC = Object.keys(GRADE_POINTS).sort((a, b) => GRADE_POINTS[b] - GRADE_POINTS[a]);

function letterFromPoints(pts) {
    // Nearest letter on the scale, so an average of A and C lands on B
    // rather than on whichever bound a ladder of `>` happened to reach.
    let best = POINTS_DESC[0], bestGap = Infinity;
    POINTS_DESC.forEach(g => {
        const gap = Math.abs(GRADE_POINTS[g] - pts);
        if (gap < bestGap) { bestGap = gap; best = g; }
    });
    return best;
}

// A row's `state` says why it has no grade, because "not measured for this
// filer" and "nothing computes this at all" are different facts and an em
// dash in a grade slot cannot tell them apart.
export const ROW_GRADED = 'graded';
export const ROW_NO_VALUE = 'no_value';
export const ROW_NO_MEASURE = 'no_measure';

/**
 * @param {Object} m
 *   m.roic        measured ROIC (statement layer) or null — NEVER a proxy
 *   m.wacc        cost of capital
 *   m.waccBasis   'estimated' (per-company) | 'assumed' (a platform constant)
 *   m.reinvRate   reinvestment rate or null
 *   m.divCov      dividend coverage of FCF (×) or null
 *   m.divCovBasis 'statements' | 'overview' — required when divCov is given
 *   m.buybackYield measured buyback yield or null
 */
export function capitalAllocationView(m) {
    const o = m || {};
    const roic = finite(o.roic) ? o.roic : null;
    const wacc = finite(o.wacc) ? o.wacc : null;
    // A spread needs a MEASURED return on capital. `roe * 0.6` is not one,
    // and the spread drives a "value-creating / value-destroying" sentence.
    const spread = (roic != null && wacc != null) ? roic - wacc : null;

    // Same rule as the result object below: a row carries a `grade` key only
    // when it has one. `state` is the discriminator a renderer switches on,
    // because "this filer has no value for it" and "nothing computes this at
    // all" need different sentences and one em dash cannot tell them apart.
    function row(label, value, grade, why) {
        if (grade === null) return { label, state: ROW_NO_MEASURE, why };
        if (!finite(value)) return { label, state: ROW_NO_VALUE, why };
        return { label, state: ROW_GRADED, grade };
    }

    const rows = [
        row('Returns on capital vs cost', spread,
            spread == null ? undefined
                : spread > 0.15 ? 'A' : spread > 0.08 ? 'B+' : spread > 0 ? 'B\u2212' : 'C',
            roic == null ? 'No measured ROIC on file' : 'No cost of capital'),
        row('Reinvestment discipline', o.reinvRate,
            finite(o.reinvRate) ? (o.reinvRate > 0.3 && o.reinvRate < 0.7 ? 'A\u2212' : 'B') : undefined,
            'Needs EBIT, tax rate, capex and D&A'),
        row('Dividend coverage (FCF)', o.divCov,
            finite(o.divCov) ? (o.divCov > 3 ? 'A' : o.divCov > 1.5 ? 'B+' : 'C') : undefined,
            'Needs free cash flow and dividends paid'),
        // THESE TWO CARRY NO MEASUREMENT AT ALL. They were graded 'C+' and
        // 'A\u2212' from `capGrade ? ... : null` \u2014 the existence of a row, not
        // anything about buybacks or acquisitions. Buyback accretion needs
        // repurchase prices against intrinsic value; an M&A record needs
        // deal-by-deal returns. Neither is in any layer.
        row('Buyback value-accretion', null, null, 'No repurchase-price series in any layer'),
        row('M&A track record',        null, null, 'No deal-level returns in any layer'),
    ];

    const measurable = rows.filter(r => r.state !== ROW_NO_MEASURE);
    const graded = rows.filter(r => r.state === ROW_GRADED);

    // `{ key: undefined }` IS NOT AN ABSENT KEY. `'spread' in out` is true for
    // it and `Object.keys` lists it, so a consumer testing for presence — the
    // very check this module exists to make possible — sees a figure that was
    // never measured. Found by the test, not by reading: the first draft of
    // this function assigned `spread: spread == null ? undefined : spread` and
    // the absence assertion failed. Assign the key only when there is a value.
    const out = { rows, gradedCount: graded.length, measurableCount: measurable.length };
    if (roic != null) out.roic = roic;
    if (wacc != null) {
        out.wacc = wacc;
        // A WACC is never observed; every one is a modelling choice, so the
        // basis travels with it rather than being inferred at the render.
        out.waccBasis = o.waccBasis === 'estimated' ? 'estimated' : 'assumed';
    }
    if (spread != null) {
        out.spread = spread;
        // The value verdict is a claim about the spread and cannot outlive it.
        out.valueVerdict = spread > 0 ? 'value-creating' : 'value-destroying';
    }
    if (finite(o.buybackYield)) out.buybackYield = o.buybackYield;
    if (finite(o.divCov)) {
        out.divCov = o.divCov;
        out.divCovBasis = o.divCovBasis || null;
    }

    if (graded.length) {
        const pts = graded.reduce((n, r) => n + GRADE_POINTS[r.grade], 0) / graded.length;
        out.overall = letterFromPoints(pts);
        // State the denominator on the face of the grade. An "Overall Grade"
        // averaged over one of three components is a reading about one
        // component, and the previous version simply printed 'B'.
        out.overallBasis = graded.length + ' of ' + measurable.length + ' measurable components graded';
    } else {
        out.overallReason = 'Nothing in the scorecard could be measured for this filer, so there is no grade.';
    }
    return out;
}

// ── Composite fair value and the call ───────────────────────────────────
//
// `fairValueComposite.js` states the governing rule for this product:
// "when an input can't be trusted, drop it. If nothing survives, return
// null — never fabricate a number." The header carried a SECOND blend that
// did the opposite — a DCF on a substituted 10% growth rate and 20%
// operating margin, a multiple leg on a substituted 18× EV/EBITDA, and a
// leg that was simply trailing EPS × 20 — then averaged whatever survived
// and drove BUY / ACCUMULATE / HOLD / REDUCE off it.
//
// There is one composite: the canonical engine's. When it did not run for a
// ticker there is no fair value and therefore no call.
export function compositeCallView(engineFV, price) {
    if (!finite(engineFV) || engineFV <= 0) {
        return { reason: 'The valuation engine did not produce a composite for this ticker, so there is no fair value and no call.' };
    }
    if (!finite(price) || price <= 0) {
        return { fv: engineFV, reason: 'No current price, so no upside and no call.' };
    }
    const upside = engineFV / price - 1;
    return {
        fv: engineFV,
        upside,
        call: upside >= 0.15 ? 'BUY · meaningful MoS'
            : upside >= 0.03 ? 'ACCUMULATE · narrow MoS'
            : upside >= -0.05 ? 'HOLD · limited MoS'
            : 'REDUCE · overvalued',
        tone: upside >= 0.15 ? 'good' : upside >= 0.03 ? 'ok' : upside >= -0.05 ? 'warn' : 'bad',
    };
}

// ── the Bull/Base/Bear scenario, and when it may leave its own card ─────────
//
// These three rows are the INITIAL STATE of the Valuation tab's sliders, not a
// measurement and not even an assumption anyone made about this company: the
// same 13% revenue CAGR, 44% terminal margin and 28x exit multiple for every
// filer on the platform. On its own card that is fine -- it is captioned
// "what-if - does not set the call" and the sliders are right there.
//
// It was ALSO pushed into the header verdict strip as `PROB-WEIGHTED EV`,
// where on MSFT it read $1,036 beside a measured `COMPOSITE FV` of $376: two
// figures 2.8x apart, side by side, one of them from constants, with nothing
// saying which. That is the blend EQ-9 deleted from the composite -- a DCF on
// a substituted growth rate and a substituted margin -- surviving one tile
// over, and the header is the line a reader trusts at a glance.
export const BBB_DEFAULTS = {
    bull: { cagr: 0.16, margin: 0.47, mult: 32, prob: 25 },
    base: { cagr: 0.13, margin: 0.44, mult: 28, prob: 50 },
    bear: { cagr: 0.08, margin: 0.40, mult: 22, prob: 25 },
};

const BBB_LEGS = ['bull', 'base', 'bear'];
const BBB_LEVERS = ['cagr', 'margin', 'mult', 'prob'];

/**
 * Has the reader actually asserted this scenario, or is it still the shipped
 * constants? Compared by VALUE, never by identity: the sliders replace the
 * object on every change, so a reference check would call an untouched
 * scenario edited the moment anything re-rendered.
 *
 * @param {?Object} bbb the live scenario state
 * @returns {boolean}
 */
export function scenarioEdited(bbb) {
    if (!bbb || typeof bbb !== 'object') return false;
    for (const leg of BBB_LEGS) {
        const cur = bbb[leg], def = BBB_DEFAULTS[leg];
        if (!cur || typeof cur !== 'object') return false;
        for (const lever of BBB_LEVERS) {
            // A non-finite lever is not an edit -- it cannot have been set by a
            // slider, and treating it as one would publish an EV built on it.
            if (!Number.isFinite(cur[lever])) return false;
            if (cur[lever] !== def[lever]) return true;
        }
    }
    return false;
}
