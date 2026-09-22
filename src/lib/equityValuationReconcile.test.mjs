// ============================================================
// EQ-6 — the SGR gate, the reconciliation, the reverse DCF and the verdict.
//
// Every fixture here is chosen so that the WRONG behaviour changes the answer
// by a margin no rounding could produce. Two of them reproduce live rows:
// GOOGL's FY2025 SGR (32.99%) genuinely sits above any plausible cost of
// capital, and AMD carries an ROE with no retention ratio at all.
// ============================================================
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    sustainableGrowth, gradeGrowth, sgrGate, applySgrOverride,
    retentionForGrowth, roeForGrowth, costOfCapital,
    reconcileInputs, divergence, AGREEMENT,
    dcfEnterpriseValue, bisectFor, reverseDcf, reverseDcfVerdict,
    deliveredRecord, sensitivityGrid, driverSweep, fairValuePerShare,
    SGR_STATUS, MIN_TV_SPREAD,
} from '../pages/equity/valuationReconcile.js';

// ── fixtures ────────────────────────────────────────────────

// GOOGL FY2025, as vw_company_fundamentals publishes it.
const GOOGL = { symbol: 'GOOGL', fiscal_year: 2025, fiscal_date_ending: '2025-12-31',
    statement_profile: 'operating',
    roe: 0.3570, retention_ratio: 0.9240, effective_tax_rate: 0.1678,
    operating_margin: 0.3206, total_revenue: 400000e6, ebitda: 160000e6,
    total_debt: 30000e6, cash_and_cash_equivalents: 24000e6,
    common_stock_shares_outstanding: 12000e6, total_shareholder_equity: 340000e6,
    fcff: 75000e6, fcfe: 72000e6 };

// AMD FY2025: an ROE and NO retention ratio, because the vendor omits the
// dividend line and EQ-2 refuses to read absence as "paid nothing".
const AMD = { symbol: 'AMD', fiscal_year: 2025, roe: 0.0719, retention_ratio: null,
    effective_tax_rate: -0.0247, operating_margin: 0.1066 };

const DCF = {
    revenue: 100000, growth: 0.08, margin: 0.20, tax: 0.21,
    wacc: 0.09, terminalGrowth: 0.025, years: 10, shares: 1000, netDebt: 5000,
};

// ── 1. sustainable growth ───────────────────────────────────

test('SGR is ROE x retention', () => {
    assert.ok(Math.abs(sustainableGrowth(0.20, 0.50) - 0.10) < 1e-12);
});

test('an absent retention ratio yields NO SGR, never zero', () => {
    // A zero here would read as "this company cannot grow from retained
    // earnings", which is a measurement. AMD's retention is unknown.
    assert.equal(sustainableGrowth(AMD.roe, AMD.retention_ratio), null);
    const g = sgrGate({ roe: AMD.roe, retention: AMD.retention_ratio, costOfEquity: 0.11, wacc: 0.095 });
    assert.equal(g.status, SGR_STATUS.UNMEASURABLE);
    assert.equal(g.reason, 'no_growth_rate');
    // Absent from the row shape, not null: a renderer cannot print a headroom
    // it was never handed.
    assert.equal('headroomEquity' in g, false);
    assert.equal('headroomFirm' in g, false);
});

test('a NaN input is not a growth rate', () => {
    assert.equal(sustainableGrowth(NaN, 0.5), null);
    assert.equal(sustainableGrowth(0.2, Infinity), null);
});

// ── 2. the gate ─────────────────────────────────────────────

test('growth at or above the discount rate is REFUSED, not clamped', () => {
    // What the engine does today, measured against the live /api/equity:
    // `mapPayload` clamps riG to 0.15, `riCalc`'s own MIN_TV_SPREAD then
    // refuses the terminal value, and the method drops with the OPAQUE reason
    // `ri_undefined`. So no wrong number is published — the reader is simply
    // never told that the company's own sustainable growth rate is the cause,
    // and has no way to ask what growth it would take.
    const r = gradeGrowth(0.12, 0.12);
    assert.equal(r.status, SGR_STATUS.REFUSED);
    assert.equal(r.reason, 'growth_exceeds_discount_rate');
    const over = gradeGrowth(0.20, 0.12);
    assert.equal(over.status, SGR_STATUS.REFUSED);
});

test('a spread below the terminal floor is refused even though g < r', () => {
    // 10bp of headroom is arithmetically fine and financially absurd: the
    // terminal value carries essentially all of the fair value.
    const r = gradeGrowth(0.119, 0.12);
    assert.equal(r.status, SGR_STATUS.REFUSED);
    assert.equal(r.reason, 'spread_below_terminal_floor');
    assert.ok(r.headroom > 0 && r.headroom < MIN_TV_SPREAD);
    // And exactly at the floor it passes.
    assert.equal(gradeGrowth(0.12 - MIN_TV_SPREAD, 0.12).status, SGR_STATUS.MEASURABLE);
});

test('GOOGL FY2025 refuses the absolute models on its real numbers', () => {
    const g = sgrGate({ roe: GOOGL.roe, retention: GOOGL.retention_ratio,
                        costOfEquity: 0.11, wacc: 0.095 });
    assert.ok(Math.abs(g.sgr - 0.329868) < 1e-6);
    assert.equal(g.status, SGR_STATUS.REFUSED);
    assert.equal(g.reason, 'growth_exceeds_discount_rate');
    assert.ok(g.headroomEquity < 0);
    assert.ok(g.headroomFirm < 0);
});

test('the gate takes the WORSE of the equity and firm verdicts', () => {
    // 9.0% growth clears an 11% cost of equity with 2pp to spare and does NOT
    // clear a 9.5% WACC. A gate reading only one rate would call the page
    // available while the FCFF model is undefined.
    const g = sgrGate({ roe: 0.18, retention: 0.5, costOfEquity: 0.11, wacc: 0.095 });
    assert.ok(Math.abs(g.sgr - 0.09) < 1e-12);
    assert.equal(g.equity.status, SGR_STATUS.MEASURABLE);
    assert.equal(g.firm.status, SGR_STATUS.REFUSED);
    assert.equal(g.status, SGR_STATUS.REFUSED);
});

// ── 3. the override ─────────────────────────────────────────

test('an untouched override publishes nothing and changes nothing', () => {
    const base = sgrGate({ roe: GOOGL.roe, retention: GOOGL.retention_ratio,
                           costOfEquity: 0.11, wacc: 0.095 });
    const eff = applySgrOverride(base, { roe: null, retention: null });
    assert.equal(eff.applied, false);
    assert.equal(eff.overrodeRoe, false);
    assert.equal(eff.overrodeRetention, false);
    assert.equal(eff.sgr, base.sgr);
    assert.equal(eff.status, base.status);
});

test('moving retention imputes a new SGR and can clear the gate', () => {
    const base = sgrGate({ roe: GOOGL.roe, retention: GOOGL.retention_ratio,
                           costOfEquity: 0.11, wacc: 0.095 });
    assert.equal(base.status, SGR_STATUS.REFUSED);
    // 0.20 retention at a 35.7% ROE gives 7.14%, clearing the 9.5% WACC by
    // more than the floor.
    const eff = applySgrOverride(base, { roe: null, retention: 0.20 });
    assert.equal(eff.applied, true);
    assert.equal(eff.overrodeRetention, true);
    assert.equal(eff.overrodeRoe, false);
    assert.ok(Math.abs(eff.sgr - 0.0714) < 1e-9);
    assert.equal(eff.status, SGR_STATUS.MEASURABLE);
    // The reported figure is carried alongside so the panel can label the
    // imputed one as imputed.
    assert.ok(Math.abs(eff.baseSgr - 0.329868) < 1e-6);
});

test('an override on a company with NO reported input still imputes one', () => {
    // AMD has an ROE and no retention. Moving retention alone must produce an
    // SGR — a base of null must not swallow the override.
    const base = sgrGate({ roe: AMD.roe, retention: null, costOfEquity: 0.11, wacc: 0.095 });
    assert.equal(base.sgr, null);
    const eff = applySgrOverride(base, { roe: null, retention: 0.80 });
    assert.ok(Math.abs(eff.sgr - 0.0719 * 0.80) < 1e-12);
    assert.equal(eff.applied, true);
});

test('the "what would have to be true" targets are exact, and null when unreachable', () => {
    // b = g / ROE.
    assert.ok(Math.abs(retentionForGrowth(0.30, 0.09) - 0.30) < 1e-12);
    // A 9% target at a 5% ROE needs b = 1.8 — impossible, so null rather than
    // a retention ratio above 1 that reads like an instruction.
    assert.equal(retentionForGrowth(0.05, 0.09), null);
    assert.ok(Math.abs(roeForGrowth(0.50, 0.09) - 0.18) < 1e-12);
    assert.equal(roeForGrowth(0, 0.09), null);
});

// ── 4. cost of capital ──────────────────────────────────────

test('cost of capital comes from the engine, and is null when it did not run', () => {
    assert.equal(costOfCapital(null), null);
    assert.equal(costOfCapital({ state: {} }), null);
    const c = costOfCapital({ state: { coc: { rf: 0.044, beta: 1.2, erp: 0.055, rd: 0.056, wd: 0.15, tax: 0.21 } } });
    assert.ok(Math.abs(c.re - (0.044 + 1.2 * 0.055)) < 1e-12);
    // WACC = re*we + rd*(1-t)*wd
    const expected = c.re * 0.85 + 0.056 * 0.79 * 0.15;
    assert.ok(Math.abs(c.wacc - expected) < 1e-12);
    // NOT 0.085 — which is what `parseInputs` hands every symbol.
    assert.notEqual(Number(c.wacc.toFixed(3)), 0.085);
});

// ── 5. reconciliation ───────────────────────────────────────

const ENGINE_STATE = {
    coc: { rf: 0.044, beta: 1.2, erp: 0.055, rd: 0.056, wd: 0.15, tax: 0.21 },
    ri:  { ROE: 0.3570, B0: 28.33 },
    mult:{ b: 0.9240, rev: 400000, ebitda: 160000 },
    fcf: { debt: 30000, cash: 24000, shs: 12000, fcff0: 75000, fcfe0: 60000 },
};

test('relative gap is measured against the FILINGS, and is null with no base', () => {
    assert.ok(Math.abs(divergence(110, 100) - 0.10) < 1e-12);
    assert.equal(divergence(110, 0), null);
    assert.equal(divergence(null, 100), null);
});

test('reconciliation reports both sources and substitutes neither', () => {
    const rec = reconcileInputs(ENGINE_STATE, GOOGL);
    const by = {};
    rec.rows.forEach(r => { by[r.key] = r; });

    // Agreeing fields.
    assert.equal(by.roe.agreement, AGREEMENT.AGREE);
    assert.equal(by.debt.agreement, AGREEMENT.AGREE);
    // FCFE differs by 20% — engine 60,000 against filings 72,000 — and must be
    // reported as a difference, never resolved.
    assert.equal(by.fcfe.agreement, AGREEMENT.DIFFERS);
    assert.ok(Math.abs(by.fcfe.divergence - (60000 - 72000) / 72000) < 1e-12);
    assert.equal(by.fcfe.engine, 60000);
    assert.equal(by.fcfe.statement, 72000);
    assert.equal(rec.statementFiscalYear, 2025);
});

test('a field neither source carries is reported, not dropped', () => {
    // "The engine has no FCFF for this company" is the fact a reader chasing a
    // missing DCF needs. A row count that shrinks hides it.
    const thin = reconcileInputs({ ri: {}, mult: {}, fcf: {}, coc: {} }, { fiscal_year: 2025 });
    assert.equal(thin.rows.length, reconcileInputs(ENGINE_STATE, GOOGL).rows.length);
    assert.ok(thin.counts.neither > 0);
    assert.equal(thin.comparable, 0);
    thin.rows.forEach(r => {
        assert.equal('engine' in r, false);
        assert.equal('statement' in r, false);
    });
});

test('one-sided coverage is named as one-sided, not as a disagreement', () => {
    const rec = reconcileInputs(ENGINE_STATE, { fiscal_year: 2025, roe: 0.357 });
    const by = {}; rec.rows.forEach(r => { by[r.key] = r; });
    assert.equal(by.roe.agreement, AGREEMENT.AGREE);
    assert.equal(by.debt.agreement, AGREEMENT.ENGINE_ONLY);
    assert.equal('divergence' in by.debt, false);
});

// ── 6. the reverse DCF ──────────────────────────────────────

test('the perpetuity is refused below the terminal floor', () => {
    // 9% WACC against 8% terminal growth is 1pp of spread.
    assert.equal(dcfEnterpriseValue(100000, 0.08, 0.2, 0.21, 0.09, 0.08, 10), null);
    assert.ok(dcfEnterpriseValue(100000, 0.08, 0.2, 0.21, 0.09, 0.025, 10).ev > 0);
});

test('the solver returns NULL outside its bracket, never its own bound', () => {
    // This is the defect in the panel being replaced: the old `bisect` ran a
    // fixed number of halvings with no bracket check, so an unreachable target
    // came back as the endpoint and was published as the market's expectation.
    const f = (x) => x * 100;
    assert.ok(Math.abs(bisectFor(f, 50, 0, 1) - 0.5) < 1e-9);
    assert.equal(bisectFor(f, 500, 0, 1), null);      // above the bracket
    assert.equal(bisectFor(f, -10, 0, 1), null);      // below it
});

test('the reverse DCF names every missing input rather than defaulting one', () => {
    const r = reverseDcf({ price: 100, shares: 1000 });
    assert.equal(r.solved, false);
    assert.ok(r.missing.includes('revenue'));
    assert.ok(r.missing.includes('wacc'));
    assert.ok(r.missing.includes('operating_margin'));
    assert.equal('impliedGrowth' in r, false);
});

test('a solved reverse DCF reproduces the priced enterprise value', () => {
    const r = reverseDcf(Object.assign({ price: 250, deliveredGrowth: 0.08 }, DCF, { growth: undefined }));
    assert.equal(r.solved, true);
    const back = dcfEnterpriseValue(DCF.revenue, r.impliedGrowth, DCF.margin, DCF.tax,
                                    DCF.wacc, DCF.terminalGrowth, DCF.years);
    // The solved growth must reproduce price x shares + net debt.
    assert.ok(Math.abs(back.ev - r.targetEv) / r.targetEv < 1e-6);
    // The bridge closes: explicit + terminal = EV, and EV - net debt = equity.
    assert.ok(Math.abs((r.pvExplicit + r.pvTerminal) - r.targetEv) / r.targetEv < 1e-6);
    assert.ok(Math.abs(r.equityValue - (r.targetEv - DCF.netDebt)) < 1e-9);
    assert.ok(r.terminalShare > 0 && r.terminalShare < 1);
    assert.ok(r.impliedMarginAtDeliveredGrowth > 0);
});

// ── 7. the verdict ──────────────────────────────────────────

test('every clause is absent when its inputs are, and the withheld are named', () => {
    // The panel being replaced closed with a fixed sentence regardless of data.
    const v = reverseDcfVerdict({});
    assert.equal(v.clauses.length, 0);
    assert.equal(v.measured, 0);
    assert.equal(v.withheld.length, 4);
    const ids = v.withheld.map(w => w.id).sort();
    assert.deepEqual(ids, ['funding', 'growth', 'margin', 'terminal']);
});

test('the growth clause reads the DIRECTION off the number', () => {
    const demanding = reverseDcfVerdict({ impliedGrowth: 0.24, deliveredGrowth: 0.08, deliveredPeriods: 11 });
    const gd = demanding.clauses.find(c => c.id === 'growth');
    assert.equal(gd.tone, 'demanding');
    assert.ok(/3\.0x/.test(gd.text));

    const cheap = reverseDcfVerdict({ impliedGrowth: 0.02, deliveredGrowth: 0.08, deliveredPeriods: 11 });
    const gc = cheap.clauses.find(c => c.id === 'growth');
    assert.equal(gc.tone, 'cheap');
    assert.ok(/less than the record/.test(gc.text));

    const inline = reverseDcfVerdict({ impliedGrowth: 0.08, deliveredGrowth: 0.08, deliveredPeriods: 11 });
    assert.equal(inline.clauses.find(c => c.id === 'growth').tone, 'neutral');
});

test('a priced DECLINE is not reported as slow growth', () => {
    const v = reverseDcfVerdict({ impliedGrowth: -0.04, deliveredGrowth: 0.08, deliveredPeriods: 11 });
    const g = v.clauses.find(c => c.id === 'growth');
    assert.ok(/SHRINKING/.test(g.text));
    assert.equal(g.tone, 'cheap');
});

test('a margin above the best ever posted is stated as a fact about the filings', () => {
    const v = reverseDcfVerdict({
        impliedMarginAtDeliveredGrowth: 0.44, currentMargin: 0.32,
        bestObservedMargin: 0.34, marginPeriods: 20,
    });
    const m = v.clauses.find(c => c.id === 'margin');
    assert.equal(m.tone, 'demanding');
    assert.ok(/never posted/.test(m.text));
    assert.ok(/20 periods/.test(m.text));
});

test('a margin inside the record is not reported as demanding', () => {
    const v = reverseDcfVerdict({
        impliedMarginAtDeliveredGrowth: 0.18, currentMargin: 0.32,
        bestObservedMargin: 0.34, marginPeriods: 20,
    });
    assert.equal(v.clauses.find(c => c.id === 'margin').tone, 'cheap');
});

test('the funding clause tests the implied growth against the SGR', () => {
    const cannot = reverseDcfVerdict({ impliedGrowth: 0.18, sgr: 0.07 });
    const f1 = cannot.clauses.find(c => c.id === 'funding');
    assert.equal(f1.tone, 'demanding');
    assert.ok(/outside capital/.test(f1.text));

    const can = reverseDcfVerdict({ impliedGrowth: 0.04, sgr: 0.07 });
    assert.equal(can.clauses.find(c => c.id === 'funding').tone, 'neutral');
});

// ── 8. delivered record ─────────────────────────────────────

test('delivered growth compounds over the loaded window, newest row first', () => {
    const rows = [
        { total_revenue: 200, operating_margin: 0.20 },
        { total_revenue: 150, operating_margin: 0.26 },
        { total_revenue: 100, operating_margin: 0.18 },
    ];
    const d = deliveredRecord(rows);
    assert.equal(d.periods, 3);
    // Two years of growth from 100 to 200.
    assert.ok(Math.abs(d.revenueCagr - (Math.pow(2, 0.5) - 1)) < 1e-12);
    assert.equal(d.currentMargin, 0.20);
    assert.equal(d.bestMargin, 0.26);
    assert.equal(d.worstMargin, 0.18);
    assert.equal(d.marginPeriods, 3);
});

test('one period is not a growth rate', () => {
    const d = deliveredRecord([{ total_revenue: 200, operating_margin: 0.2 }]);
    assert.equal('revenueCagr' in d, false);
    assert.equal(d.periods, 1);
});

// ── 9. sensitivity and the sweep ────────────────────────────

test('the grid is centred on the company\'s own WACC and its centre reproduces the valuation', () => {
    // The panel being replaced used a fixed 7.5–9.5% grid for every symbol, so
    // a company at 13% read its fair value off a range it never occupied, and
    // the centre cell did not reproduce the valuation shown above it.
    const hi = Object.assign({}, DCF, { wacc: 0.13 });
    const g = sensitivityGrid(hi);
    assert.ok(Math.abs(g.waccs[g.centreIndex] - 0.13) < 1e-12);
    assert.ok(Math.abs(g.cells[g.centreIndex][g.centreIndex] - fairValuePerShare(hi)) < 1e-9);
});

test('a refused cell is null, not a low number', () => {
    // At a 3% WACC the terminal growth column marches up through the floor.
    const g = sensitivityGrid(Object.assign({}, DCF, { wacc: 0.035, terminalGrowth: 0.025 }));
    const refused = g.cells.reduce((a, row) => a + row.filter(v => v == null).length, 0);
    assert.ok(refused > 0);
});

test('the driver sweep ranks by swing and marks a refused side rather than zeroing it', () => {
    const sw = driverSweep(DCF);
    assert.ok(sw.rows.length === 4);
    // Sorted descending by total swing.
    for (let i = 1; i < sw.rows.length; i++) assert.ok(sw.rows[i - 1].swing >= sw.rows[i].swing);
    sw.rows.forEach(r => assert.equal(r.refused, 0));

    // Push terminal growth to 1pp under the WACC: the +0.5pp shock crosses the
    // floor, so that side is REFUSED. A zero there would read as an assumption
    // that does not matter.
    const tight = Object.assign({}, DCF, { terminalGrowth: DCF.wacc - 0.021 });
    const sw2 = driverSweep(tight);
    const term = sw2.rows.find(r => r.id === 'terminal');
    assert.equal(term.refused, 1);
    assert.equal('up' in term, false);
    assert.ok(term.down != null);
});
