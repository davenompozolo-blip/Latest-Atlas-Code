// ============================================================
// ATLAS Equity Research — valuation reconciliation, the SGR gate,
// and the reverse-DCF verdict.
// ------------------------------------------------------------
// Pure module. No React, no I/O, no `import.meta.env` — so the node
// suite can exercise every rule in here directly.
//
// Three jobs, and they are separate on purpose:
//
//   1. RECONCILE. The valuation engine hydrates its inputs from the
//      vendor snapshot (`equity_cache.financials`); the statement layer
//      derives the same quantities from twenty years of filings. Those
//      are two measurements of one thing and they can disagree. Nothing
//      here substitutes one for the other — it REPORTS both and names
//      the gap, because a silently-preferred source is how a number
//      ends up on screen that nobody can trace.
//
//   2. THE SGR GATE. An absolute model prices a perpetuity, and a
//      perpetuity is undefined once growth reaches the discount rate:
//      v = D(1+g)/(r-g) diverges as g -> r, and is NEGATIVE past it.
//      A company whose own sustainable growth rate sits above its cost
//      of capital cannot be valued by one, and the honest answer is to
//      REFUSE the model and say why — not to clamp g quietly, which is
//      what publishes a fair value resting on a growth rate the inputs
//      never supported.
//
//      The override then lets the reader impute a hypothetical SGR by
//      moving retention and/or ROE. It publishes NOTHING until they
//      move one: an untouched override is not an assumption anybody
//      made.
//
//   3. THE REVERSE-DCF VERDICT. Every clause is derived from a number
//      and is ABSENT when its inputs are. The panel this replaces ended
//      in a hardcoded sentence — "the market isn't asking for heroic
//      growth" — printed for every company in every market since it was
//      written. A sentence that cannot be false is not a verdict.
// ============================================================

import { MIN_TV_SPREAD, capm, calcWACC } from '../../lib/valuationEngine.js';

export { MIN_TV_SPREAD };

/** Finite-number guard. NaN, Infinity and null are all "no measurement". */
export function fin(v) {
    return v != null && typeof v === 'number' && isFinite(v);
}

function num(v) {
    if (v == null) return null;
    const x = typeof v === 'number' ? v : Number(v);
    return isFinite(x) ? x : null;
}

// ─────────────────────────────────────────────────────────────
// 1. Sustainable growth
// ─────────────────────────────────────────────────────────────

/**
 * SGR = ROE x retention. Null when either side is absent — never zero.
 * EQ-2 records why: the vendor's dividend line is unreliable in BOTH
 * directions, so an absent retention ratio cannot be read as "paid
 * nothing" and a fabricated 100% retention would inflate the SGR of
 * exactly the names this gate exists to catch.
 */
export function sustainableGrowth(roe, retention) {
    const r = num(roe), b = num(retention);
    if (r == null || b == null) return null;
    return r * b;
}

export const SGR_STATUS = {
    MEASURABLE: 'measurable',   // g is defined AND leaves a workable spread
    REFUSED: 'refused',         // g is defined and the perpetuity is not
    UNMEASURABLE: 'unmeasurable' // g itself could not be formed
};

/**
 * Grade a growth rate against a discount rate.
 *
 * `minSpread` is the engine's own MIN_TV_SPREAD (2pp) rather than a
 * second number invented here: below it the terminal value explodes,
 * which the engine already refuses to emit. Testing g >= r alone would
 * pass a company sitting 10bp under its cost of capital and hand the
 * reader a terminal value carrying ~99% of the fair value.
 */
export function gradeGrowth(growth, discountRate, minSpread) {
    const g = num(growth), r = num(discountRate);
    const floor = num(minSpread) != null ? num(minSpread) : MIN_TV_SPREAD;
    if (g == null || r == null) {
        return { status: SGR_STATUS.UNMEASURABLE, reason: g == null ? 'no_growth_rate' : 'no_discount_rate' };
    }
    const headroom = r - g;
    if (g >= r) {
        return { status: SGR_STATUS.REFUSED, reason: 'growth_exceeds_discount_rate', headroom };
    }
    if (headroom < floor) {
        return { status: SGR_STATUS.REFUSED, reason: 'spread_below_terminal_floor', headroom };
    }
    return { status: SGR_STATUS.MEASURABLE, reason: null, headroom };
}

/**
 * The gate the Valuation tab renders. Grades the SGR against BOTH the
 * cost of equity (which discounts the dividend and residual-income
 * models) and the WACC (which discounts FCFF) — they are different
 * rates and a growth rate can clear one and not the other, so a single
 * verdict would be wrong for half the models on the page.
 *
 * `status` is the WORSE of the two: the tab's headline claim is
 * "absolute models are available", and it is false if any of them is
 * undefined.
 */
export function sgrGate(opts) {
    const o = opts || {};
    const sgr = sustainableGrowth(o.roe, o.retention);
    const equity = gradeGrowth(sgr, o.costOfEquity, o.minSpread);
    const firm = gradeGrowth(sgr, o.wacc, o.minSpread);

    const rank = { measurable: 0, refused: 1, unmeasurable: 2 };
    const worst = rank[firm.status] > rank[equity.status] ? firm : equity;

    const out = {
        sgr: sgr,
        roe: num(o.roe),
        retention: num(o.retention),
        costOfEquity: num(o.costOfEquity),
        wacc: num(o.wacc),
        equity: equity,
        firm: firm,
        status: worst.status,
        reason: worst.reason,
    };
    // An absent number beats a flagged one: when the SGR could not be
    // formed there is no headroom to publish, and the key is absent
    // rather than null so a renderer cannot print one it never had.
    if (sgr != null) {
        if (equity.headroom != null) out.headroomEquity = equity.headroom;
        if (firm.headroom != null) out.headroomFirm = firm.headroom;
    }
    return out;
}

/**
 * Apply the reader's retention/ROE overrides and re-grade.
 *
 * `applied` is false while both controls sit untouched, and the caller
 * must publish nothing from an unapplied override: pre-loading the
 * controls with the offending inputs is a convenience, not an
 * assumption the reader has made.
 */
export function applySgrOverride(base, override) {
    const o = override || {};
    const roeOv = num(o.roe);
    const retOv = num(o.retention);
    const applied = roeOv != null || retOv != null;

    const roe = roeOv != null ? roeOv : num(base && base.roe);
    const retention = retOv != null ? retOv : num(base && base.retention);

    const graded = sgrGate({
        roe: roe,
        retention: retention,
        costOfEquity: base && base.costOfEquity,
        wacc: base && base.wacc,
        minSpread: base && base.minSpread,
    });

    return Object.assign({}, graded, {
        applied: applied,
        overrodeRoe: roeOv != null,
        overrodeRetention: retOv != null,
        baseSgr: base ? base.sgr : null,
    });
}

/**
 * The retention ratio that would bring the SGR to a target growth at
 * the given ROE — the "what would have to be true" figure, so the
 * reader is not left hunting for it on a slider.
 * Null when ROE cannot carry the target at ANY retention (b > 1).
 */
export function retentionForGrowth(roe, targetGrowth) {
    const r = num(roe), g = num(targetGrowth);
    if (r == null || g == null || r <= 0) return null;
    const b = g / r;
    if (b < 0 || b > 1) return null;
    return b;
}

/** The ROE that would bring the SGR to a target growth at this retention. */
export function roeForGrowth(retention, targetGrowth) {
    const b = num(retention), g = num(targetGrowth);
    if (b == null || g == null || b <= 0) return null;
    return g / b;
}

// ─────────────────────────────────────────────────────────────
// 2. Cost of capital, computed for THIS company
// ─────────────────────────────────────────────────────────────

/**
 * Read the engine's own cost of capital rather than restating it.
 *
 * `parseInputs` hardcodes `wacc: 0.085` for every symbol in the
 * universe, and that single number drives the reverse DCF, the
 * sensitivity grid and the tornado. A verdict about what the market
 * expects, computed at a discount rate that was never derived for the
 * company, is a statement about the constant.
 *
 * Returns null when the engine did not run — the tab then says the
 * cost of capital is unavailable rather than falling back to 8.5%.
 */
export function costOfCapital(engine) {
    if (!engine || !engine.state || !engine.state.coc) return null;
    const coc = engine.state.coc;
    const rf = num(coc.rf), beta = num(coc.beta), erp = num(coc.erp);
    const rd = num(coc.rd), wd = num(coc.wd), tax = num(coc.tax);
    if (rf == null || beta == null || erp == null) return null;
    const re = capm(rf, beta, erp);
    if (rd == null || wd == null || tax == null) return { re: re, wacc: null, rf, beta, erp, rd, wd, tax };
    return {
        re: re,
        wacc: calcWACC(re, 1 - wd, rd, wd, tax),
        rf: rf, beta: beta, erp: erp, rd: rd, wd: wd, tax: tax,
    };
}

// ─────────────────────────────────────────────────────────────
// 3. Input reconciliation
// ─────────────────────────────────────────────────────────────

export const AGREEMENT = {
    AGREE: 'agree',
    DIFFERS: 'differs',
    ENGINE_ONLY: 'engine_only',
    STATEMENT_ONLY: 'statement_only',
    NEITHER: 'neither',
};

/** Relative gap, or null when it cannot be formed (either side absent, or a zero base). */
export function divergence(engineValue, statementValue) {
    const a = num(engineValue), b = num(statementValue);
    if (a == null || b == null) return null;
    const base = Math.abs(b);
    if (base === 0) return null;
    return (a - b) / base;
}

/** Default tolerance below which two measurements are reported as agreeing. */
export const AGREE_TOLERANCE = 0.02;

function agreementOf(engineValue, statementValue, tolerance) {
    const a = num(engineValue), b = num(statementValue);
    if (a == null && b == null) return AGREEMENT.NEITHER;
    if (b == null) return AGREEMENT.ENGINE_ONLY;
    if (a == null) return AGREEMENT.STATEMENT_ONLY;
    const d = divergence(a, b);
    // A zero statement base cannot yield a relative gap. Exact equality
    // is still agreement; anything else is a difference we cannot size.
    if (d == null) return a === b ? AGREEMENT.AGREE : AGREEMENT.DIFFERS;
    return Math.abs(d) <= tolerance ? AGREEMENT.AGREE : AGREEMENT.DIFFERS;
}

const MILLIONS = 1e6;

/**
 * The field map. `engine` reads the hydrated engine state; `statement`
 * reads one `vw_company_fundamentals` row. `unit` tells the renderer
 * how to format and says, on the face of the table, what is being
 * compared.
 */
const RECONCILED_FIELDS = [
    { key: 'roe', label: 'Return on equity', unit: 'pct',
      engine: function (s) { return s.ri && s.ri.ROE; },
      statement: function (r) { return r.roe; },
      note: 'Drives the residual-income model and the sustainable growth rate.' },

    { key: 'retention', label: 'Retention ratio (b)', unit: 'ratio',
      engine: function (s) { return s.mult && s.mult.b; },
      statement: function (r) { return r.retention_ratio; },
      note: 'Engine derives it from dividend per share over EPS; the statements from the cash-flow dividend line over net income.' },

    { key: 'tax', label: 'Effective tax rate', unit: 'pct',
      engine: function (s) { return s.coc && s.coc.tax; },
      statement: function (r) { return r.effective_tax_rate; },
      note: 'Engine infers it from the margin spread when it has no tax line; the statements read it off the filing.' },

    { key: 'debt', label: 'Total debt', unit: 'musd',
      engine: function (s) { return s.fcf && s.fcf.debt; },
      statement: function (r) { return r.total_debt == null ? null : r.total_debt / MILLIONS; } },

    { key: 'cash', label: 'Cash', unit: 'musd',
      engine: function (s) { return s.fcf && s.fcf.cash; },
      statement: function (r) { return r.cash_and_cash_equivalents == null ? null : r.cash_and_cash_equivalents / MILLIONS; } },

    { key: 'shares', label: 'Shares outstanding', unit: 'm',
      engine: function (s) { return s.fcf && s.fcf.shs; },
      statement: function (r) { return r.common_stock_shares_outstanding == null ? null : r.common_stock_shares_outstanding / MILLIONS; } },

    { key: 'revenue', label: 'Revenue', unit: 'musd',
      engine: function (s) { return s.mult && s.mult.rev; },
      statement: function (r) { return r.total_revenue == null ? null : r.total_revenue / MILLIONS; } },

    { key: 'ebitda', label: 'EBITDA', unit: 'musd',
      engine: function (s) { return s.mult && s.mult.ebitda; },
      statement: function (r) { return r.ebitda == null ? null : r.ebitda / MILLIONS; } },

    { key: 'fcff', label: 'FCFF', unit: 'musd',
      engine: function (s) { return s.fcf && s.fcf.fcff0; },
      statement: function (r) { return r.fcff == null ? null : r.fcff / MILLIONS; },
      note: 'Engine reconstructs it as free cash flow plus after-tax interest on total debt; the statements take the CFO-based definition on the reported interest expense.' },

    { key: 'fcfe', label: 'FCFE', unit: 'musd',
      engine: function (s) { return s.fcf && s.fcf.fcfe0; },
      statement: function (r) { return r.fcfe == null ? null : r.fcfe / MILLIONS; } },

    { key: 'bvps', label: 'Book value / share', unit: 'usd',
      engine: function (s) { return s.ri && s.ri.B0; },
      statement: function (r) {
          const eq = num(r.total_shareholder_equity), sh = num(r.common_stock_shares_outstanding);
          if (eq == null || sh == null || sh <= 0) return null;
          return eq / sh;
      } },
];

/**
 * Compare every engine input against the statement layer's own figure.
 *
 * Returns one row per field, ALWAYS — a field neither source carries is
 * reported as `neither` rather than dropped, because "the engine has no
 * FCFF for this company" is exactly the fact a reader chasing a missing
 * DCF needs to see.
 */
export function reconcileInputs(engineState, statementRow, opts) {
    const o = opts || {};
    const tol = num(o.tolerance) != null ? num(o.tolerance) : AGREE_TOLERANCE;
    const s = engineState || {};
    const r = statementRow || {};

    const rows = RECONCILED_FIELDS.map(function (f) {
        const e = num(f.engine(s));
        const t = num(f.statement(r));
        const row = {
            key: f.key,
            label: f.label,
            unit: f.unit,
            agreement: agreementOf(e, t, tol),
        };
        if (e != null) row.engine = e;
        if (t != null) row.statement = t;
        const d = divergence(e, t);
        if (d != null) row.divergence = d;
        if (f.note) row.note = f.note;
        return row;
    });

    const counts = { agree: 0, differs: 0, engine_only: 0, statement_only: 0, neither: 0 };
    rows.forEach(function (row) { counts[row.agreement] += 1; });

    return {
        rows: rows,
        counts: counts,
        tolerance: tol,
        comparable: counts.agree + counts.differs,
        statementFiscalYear: r.fiscal_year != null ? r.fiscal_year : null,
        statementPeriodEnd: r.fiscal_date_ending != null ? r.fiscal_date_ending : null,
        statementProfile: r.statement_profile != null ? r.statement_profile : null,
    };
}

// ─────────────────────────────────────────────────────────────
// 4. Reverse DCF — solvers and the value bridge
// ─────────────────────────────────────────────────────────────

/** Enterprise value of a revenue-margin DCF at a given growth and margin. */
export function dcfEnterpriseValue(revenue0, growth, margin, tax, wacc, terminalGrowth, years) {
    const r0 = num(revenue0), g = num(growth), m = num(margin);
    const t = num(tax), w = num(wacc), gl = num(terminalGrowth), n = num(years);
    if (r0 == null || g == null || m == null || t == null || w == null || gl == null || n == null) return null;
    if (r0 <= 0 || n < 1) return null;
    // The same terminal discipline the engine applies: below the floor
    // the perpetuity is not a valuation, it is a division by nearly zero.
    if (w - gl < MIN_TV_SPREAD) return null;
    let rev = r0, pv = 0, nopat = 0;
    for (let i = 1; i <= n; i++) {
        rev *= (1 + g);
        nopat = rev * m * (1 - t);
        pv += nopat / Math.pow(1 + w, i);
    }
    const tv = nopat * (1 + gl) / (w - gl);
    const pvTv = tv / Math.pow(1 + w, n);
    return { ev: pv + pvTv, pvExplicit: pv, pvTerminal: pvTv, terminalValue: tv };
}

/**
 * Bisect for the input that reproduces the observed enterprise value.
 * Returns null rather than an endpoint when the target sits outside the
 * bracket — a solver that silently returns its own bound publishes the
 * bound as a market expectation.
 */
export function bisectFor(fn, target, lo, hi, iterations) {
    const t = num(target);
    if (t == null) return null;
    const n = iterations || 80;
    const fLo = fn(lo), fHi = fn(hi);
    if (fLo == null || fHi == null) return null;
    if ((fLo - t) * (fHi - t) > 0) return null;   // not bracketed
    let a = lo, b = hi;
    for (let i = 0; i < n; i++) {
        const mid = (a + b) / 2;
        const fm = fn(mid);
        if (fm == null) return null;
        if ((fLo - t) * (fm - t) <= 0) b = mid; else a = mid;
    }
    return (a + b) / 2;
}

export const REVERSE_BOUNDS = {
    growthLo: -0.50,
    growthHi: 1.00,
    marginLo: 0.005,
    marginHi: 0.90,
};

/**
 * Solve the growth the current price implies, holding margin fixed, and
 * report the value bridge at that growth.
 *
 * Every argument is required and there is no default for any of them:
 * a reverse DCF is a statement about what the market is paying, and a
 * defaulted WACC or margin makes it a statement about the default.
 */
export function reverseDcf(opts) {
    const o = opts || {};
    const price = num(o.price), shares = num(o.shares), netDebt = num(o.netDebt);
    const revenue = num(o.revenue), margin = num(o.margin), tax = num(o.tax);
    const wacc = num(o.wacc), terminalGrowth = num(o.terminalGrowth), years = num(o.years);

    const missing = [];
    if (price == null || price <= 0) missing.push('price');
    if (shares == null || shares <= 0) missing.push('shares');
    if (netDebt == null) missing.push('net_debt');
    if (revenue == null || revenue <= 0) missing.push('revenue');
    if (margin == null) missing.push('operating_margin');
    if (tax == null) missing.push('tax_rate');
    if (wacc == null) missing.push('wacc');
    if (terminalGrowth == null) missing.push('terminal_growth');
    if (years == null) missing.push('horizon');
    if (missing.length) return { solved: false, missing: missing };

    const targetEv = price * shares + netDebt;
    const at = function (g) {
        const r = dcfEnterpriseValue(revenue, g, margin, tax, wacc, terminalGrowth, years);
        return r ? r.ev : null;
    };
    const g = bisectFor(at, targetEv, REVERSE_BOUNDS.growthLo, REVERSE_BOUNDS.growthHi);
    if (g == null) {
        return { solved: false, missing: [], reason: 'outside_solver_bounds', targetEv: targetEv, bounds: REVERSE_BOUNDS };
    }

    const bridge = dcfEnterpriseValue(revenue, g, margin, tax, wacc, terminalGrowth, years);
    const out = {
        solved: true,
        impliedGrowth: g,
        targetEv: targetEv,
        equityValue: targetEv - netDebt,
        netDebt: netDebt,
        wacc: wacc,
        terminalGrowth: terminalGrowth,
        years: years,
        margin: margin,
    };
    if (bridge) {
        out.pvExplicit = bridge.pvExplicit;
        out.pvTerminal = bridge.pvTerminal;
        out.terminalValue = bridge.terminalValue;
        out.terminalShare = bridge.ev > 0 ? bridge.pvTerminal / bridge.ev : null;
    }

    // The margin the price implies if growth is instead held at what the
    // company has actually delivered. Absent, not null, when there is no
    // delivered growth to hold it at.
    const delivered = num(o.deliveredGrowth);
    if (delivered != null) {
        const atMargin = function (m) {
            const r = dcfEnterpriseValue(revenue, delivered, m, tax, wacc, terminalGrowth, years);
            return r ? r.ev : null;
        };
        const m = bisectFor(atMargin, targetEv, REVERSE_BOUNDS.marginLo, REVERSE_BOUNDS.marginHi);
        if (m != null) out.impliedMarginAtDeliveredGrowth = m;
    }
    return out;
}

// ─────────────────────────────────────────────────────────────
// 5. The verdict
// ─────────────────────────────────────────────────────────────

/**
 * ABSOLUTE bands, stated on the panel. A quantile rule would relabel a
 * company because the other companies loaded changed, which is a
 * ranking dressed as a verdict.
 */
export const VERDICT_BANDS = {
    growthInLineLow: 0.8,    // implied / delivered below this: asking for less
    growthInLineHigh: 1.25,  // above this: asking for more
    growthDemanding: 2.0,    // above this: asking for roughly double or more
    terminalHeavy: 0.75,     // share of value in the terminal value
};

function pct(x) { return (x * 100).toFixed(1) + '%'; }

/**
 * Build the verdict from measurements. Each clause is emitted only when
 * every input it names is present, and `withheld` records the ones that
 * were not — so the panel can state its denominator instead of reading
 * as though the silent clauses agreed.
 */
export function reverseDcfVerdict(opts) {
    const o = opts || {};
    const implied = num(o.impliedGrowth);
    const delivered = num(o.deliveredGrowth);
    const deliveredPeriods = num(o.deliveredPeriods);
    const impliedMargin = num(o.impliedMarginAtDeliveredGrowth);
    const currentMargin = num(o.currentMargin);
    const bestMargin = num(o.bestObservedMargin);
    const marginPeriods = num(o.marginPeriods);
    const sgr = num(o.sgr);
    const terminalShare = num(o.terminalShare);

    const clauses = [];
    const withheld = [];

    // ── growth: what is priced against what was delivered ──
    if (implied != null && delivered != null && delivered > -1) {
        const ratio = delivered !== 0 ? implied / delivered : null;
        const window = deliveredPeriods != null && deliveredPeriods > 1
            ? ' over ' + Math.round(deliveredPeriods - 1) + ' years of filings' : '';
        if (implied <= 0 && delivered > 0) {
            clauses.push({ id: 'growth', tone: 'cheap',
                text: 'The price implies revenue SHRINKING at ' + pct(implied)
                    + ' a year against ' + pct(delivered) + ' delivered' + window
                    + ' — the market is pricing a decline this company has not had.' });
        } else if (ratio == null) {
            clauses.push({ id: 'growth', tone: 'neutral',
                text: 'The price implies ' + pct(implied) + ' revenue growth a year. Delivered growth'
                    + window + ' was ' + pct(delivered) + ', so the two cannot be expressed as a ratio.' });
        } else if (ratio >= VERDICT_BANDS.growthDemanding) {
            clauses.push({ id: 'growth', tone: 'demanding',
                text: 'The price implies ' + pct(implied) + ' revenue growth a year — '
                    + ratio.toFixed(1) + 'x the ' + pct(delivered) + ' delivered' + window
                    + '. That is an acceleration, not a continuation.' });
        } else if (ratio > VERDICT_BANDS.growthInLineHigh) {
            clauses.push({ id: 'growth', tone: 'demanding',
                text: 'The price implies ' + pct(implied) + ' revenue growth a year against '
                    + pct(delivered) + ' delivered' + window + ' — the market is asking for more than the record.' });
        } else if (ratio < VERDICT_BANDS.growthInLineLow) {
            clauses.push({ id: 'growth', tone: 'cheap',
                text: 'The price implies only ' + pct(implied) + ' revenue growth a year against '
                    + pct(delivered) + ' delivered' + window + ' — the market is asking for less than the record.' });
        } else {
            clauses.push({ id: 'growth', tone: 'neutral',
                text: 'The price implies ' + pct(implied) + ' revenue growth a year, in line with the '
                    + pct(delivered) + ' delivered' + window + '.' });
        }
    } else {
        withheld.push({ id: 'growth', needs: implied == null ? 'implied growth' : 'delivered growth' });
    }

    // ── margin: the strongest clause available, because it is a fact
    //    about the company's own filings rather than a forecast ──
    if (impliedMargin != null && bestMargin != null) {
        const window = marginPeriods != null ? marginPeriods + ' periods of filings' : 'the loaded filings';
        if (impliedMargin > bestMargin) {
            clauses.push({ id: 'margin', tone: 'demanding',
                text: 'Holding growth at the delivered rate, the price needs a '
                    + pct(impliedMargin) + ' operating margin — above the best '
                    + pct(bestMargin) + ' in ' + window + '. The market is asking for a margin this company has never posted.' });
        } else if (currentMargin != null && impliedMargin > currentMargin) {
            clauses.push({ id: 'margin', tone: 'demanding',
                text: 'Holding growth at the delivered rate, the price needs a '
                    + pct(impliedMargin) + ' operating margin against ' + pct(currentMargin)
                    + ' today — achieved before (best ' + pct(bestMargin) + '), but it has to come back.' });
        } else {
            clauses.push({ id: 'margin', tone: 'cheap',
                text: 'Holding growth at the delivered rate, the price needs only a '
                    + pct(impliedMargin) + ' operating margin'
                    + (currentMargin != null ? ' against ' + pct(currentMargin) + ' today' : '')
                    + ' — inside what this company has already done.' });
        }
    } else {
        withheld.push({ id: 'margin', needs: impliedMargin == null ? 'an implied margin' : 'a margin history' });
    }

    // ── funding: can the implied growth be self-funded? ──
    if (implied != null && sgr != null) {
        if (implied > sgr) {
            clauses.push({ id: 'funding', tone: 'demanding',
                text: 'The implied ' + pct(implied) + ' exceeds the ' + pct(sgr)
                    + ' sustainable growth rate the current ROE and retention support, so it cannot be'
                    + ' funded from retained earnings alone — it needs a higher ROE, a lower payout, or outside capital.' });
        } else {
            clauses.push({ id: 'funding', tone: 'neutral',
                text: 'The implied ' + pct(implied) + ' sits inside the ' + pct(sgr)
                    + ' sustainable growth rate, so retained earnings can fund it.' });
        }
    } else {
        withheld.push({ id: 'funding', needs: implied == null ? 'implied growth' : 'a sustainable growth rate' });
    }

    // ── where the value sits ──
    if (terminalShare != null) {
        if (terminalShare >= VERDICT_BANDS.terminalHeavy) {
            clauses.push({ id: 'terminal', tone: 'demanding',
                text: (terminalShare * 100).toFixed(0) + '% of the value sits beyond the forecast window,'
                    + ' so the terminal assumption — not the next few years — is what the price rests on.' });
        } else {
            clauses.push({ id: 'terminal', tone: 'neutral',
                text: (terminalShare * 100).toFixed(0) + '% of the value sits beyond the forecast window;'
                    + ' the explicit period carries the rest.' });
        }
    } else {
        withheld.push({ id: 'terminal', needs: 'a solved value bridge' });
    }

    return { clauses: clauses, withheld: withheld, measured: clauses.length, bands: VERDICT_BANDS };
}

/**
 * Delivered revenue growth and the margin history, read off the loaded
 * statement rows (newest first, as the loader returns them).
 */
export function deliveredRecord(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return { periods: 0 };

    const out = { periods: list.length };

    const newest = num(list[0].total_revenue);
    const oldest = num(list[list.length - 1].total_revenue);
    if (newest != null && oldest != null && oldest > 0 && newest > 0 && list.length > 1) {
        out.revenueCagr = Math.pow(newest / oldest, 1 / (list.length - 1)) - 1;
    }

    const margins = list.map(function (r) { return num(r.operating_margin); })
                        .filter(function (m) { return m != null; });
    if (margins.length) {
        out.currentMargin = num(list[0].operating_margin);
        out.bestMargin = Math.max.apply(null, margins);
        out.worstMargin = Math.min.apply(null, margins);
        out.marginPeriods = margins.length;
    }
    return out;
}

// ─────────────────────────────────────────────────────────────
// 6. Sensitivity and driver sweep
// ─────────────────────────────────────────────────────────────

/** Fair value per share at a given WACC / terminal growth. Null when refused. */
export function fairValuePerShare(o) {
    const r = dcfEnterpriseValue(o.revenue, o.growth, o.margin, o.tax, o.wacc, o.terminalGrowth, o.years);
    const shares = num(o.shares), netDebt = num(o.netDebt);
    if (!r || shares == null || shares <= 0 || netDebt == null) return null;
    return (r.ev - netDebt) / shares;
}

/**
 * A WACC x terminal-growth grid CENTRED ON THIS COMPANY'S OWN WACC.
 *
 * The panel this replaces used a fixed 7.5–9.5% grid for every symbol, so a
 * company at a 13% cost of capital had its fair value read off a range it never
 * occupied — and the grid's own centre cell did not reproduce the valuation
 * shown above it. `centreIndex` is published so the surface can mark the cell
 * that IS the company's own reading.
 */
export function sensitivityGrid(o, opts) {
    const wacc = num(o.wacc), gl = num(o.terminalGrowth);
    if (wacc == null || gl == null) return null;
    const p = opts || {};
    const wStep = p.waccStep != null ? p.waccStep : 0.005;
    const gStep = p.growthStep != null ? p.growthStep : 0.005;
    const span = p.span != null ? p.span : 2;            // cells either side

    const waccs = [], growths = [];
    for (let i = -span; i <= span; i++) {
        waccs.push(wacc + i * wStep);
        growths.push(gl + i * gStep);
    }
    const cells = waccs.map(function (w) {
        return growths.map(function (g) {
            return fairValuePerShare(Object.assign({}, o, { wacc: w, terminalGrowth: g }));
        });
    });
    return { waccs: waccs, growths: growths, cells: cells, centreIndex: span };
}

/**
 * Per-driver swing in fair value. Ranked by total absolute swing, so the
 * reader sees which assumption the valuation actually rests on.
 *
 * A driver whose shock cannot be valued at all (a WACC bump that takes the
 * terminal spread below the floor, say) reports the refusal on that side
 * rather than a zero — a zero swing reads as an assumption that does not
 * matter, which is the opposite of what a refused perpetuity means.
 */
export function driverSweep(o, shocks) {
    const base = fairValuePerShare(o);
    if (base == null) return null;
    const list = shocks || [
        { id: 'margin', label: 'Operating margin', field: 'margin', delta: 0.02, fmt: 'pp' },
        { id: 'wacc', label: 'WACC', field: 'wacc', delta: 0.005, fmt: 'pp', invert: true },
        { id: 'growth', label: 'Revenue growth', field: 'growth', delta: 0.02, fmt: 'pp' },
        { id: 'terminal', label: 'Terminal growth', field: 'terminalGrowth', delta: 0.005, fmt: 'pp' },
    ];
    const rows = list.map(function (s) {
        const up = fairValuePerShare(Object.assign({}, o, { [s.field]: num(o[s.field]) + s.delta }));
        const dn = fairValuePerShare(Object.assign({}, o, { [s.field]: num(o[s.field]) - s.delta }));
        const row = { id: s.id, label: s.label, delta: s.delta, fmt: s.fmt, base: base };
        if (up != null) row.up = up - base;
        if (dn != null) row.down = dn - base;
        row.refused = (up == null ? 1 : 0) + (dn == null ? 1 : 0);
        row.swing = (row.up != null ? Math.abs(row.up) : 0) + (row.down != null ? Math.abs(row.down) : 0);
        return row;
    });
    rows.sort(function (a, b) { return b.swing - a.swing; });
    const maxSwing = rows.length ? Math.max.apply(null, rows.map(function (r) { return r.swing; })) : 0;
    return { base: base, rows: rows, maxSwing: maxSwing };
}
