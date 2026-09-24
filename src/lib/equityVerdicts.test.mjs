// Tests for src/lib/equityVerdicts.js — what a surface may SAY.
//
// Every fixture here carries the shape the live data actually produces, and
// the values are chosen so that reading the withheld thing changes the answer
// by a margin no rounding could account for. The suite was checked by
// REVERTING each fix and watching the named tests fail, never by inspection.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    piotroskiView, PIOTROSKI_OUT_OF, qualityGradeView, sloanView,
    capitalAllocationView, compositeCallView,
    ROW_GRADED, ROW_NO_VALUE, ROW_NO_MEASURE,
    BBB_DEFAULTS, scenarioEdited,
} from './equityVerdicts.js';

// AAPL FY2025 resolves all nine — measured against vw_company_fundamentals.
const COMPLETE = {
    niPos: true, cfoPos: true, roaRising: true, cfoGtNi: true, levFalling: true,
    crRising: false, noNewShares: true, gmRising: true, atRising: false,
};
// SONY resolves THREE. This is the live case: on the 52 symbols carrying
// statements only 23 resolve all nine, and SONY and CPER resolve three.
const SONY = { niPos: true, cfoPos: true, cfoGtNi: false };

test('a complete F-Score publishes a score, a denominator and a band', () => {
    const pv = piotroskiView(COMPLETE);
    assert.equal(pv.complete, true);
    assert.equal(pv.determinable, 9);
    assert.equal(pv.score, 7);
    assert.equal(pv.outOf, PIOTROSKI_OUT_OF);
    assert.equal(pv.band, 'STRONG');
    assert.deepEqual(pv.withheld, []);
});

test('a PARTIAL F-Score has NO score and NO band on the shape', () => {
    const pv = piotroskiView(SONY);
    assert.equal(pv.complete, false);
    assert.equal(pv.determinable, 3);
    assert.equal(pv.passed, 2);
    // Absent, not null: a renderer cannot print what it was never handed.
    assert.ok(!('score' in pv), 'score must be absent on a partial reading');
    assert.ok(!('band' in pv), 'band must be absent on a partial reading');
    assert.ok(!('outOf' in pv), 'a denominator of 9 must not travel with a partial');
});

test('the partial that shipped read 2 of 9 WEAK; 2 of the 3 that resolved passed', () => {
    const pv = piotroskiView(SONY);
    // The pre-fix code computed `passed` out of NINE and banded it:
    const shipped = pv.passed >= 7 ? 'STRONG' : pv.passed >= 5 ? 'GOOD' : 'WEAK';
    assert.equal(shipped, 'WEAK');
    // Two thirds of what could be measured passed. The band is the lie.
    assert.equal(pv.passed / pv.determinable, 2 / 3);
    assert.equal(pv.band, undefined);
});

test('an unresolved criterion is reported unresolved, never as a failure', () => {
    const pv = piotroskiView(SONY);
    const roa = pv.rows.find(r => r.key === 'roaRising');
    assert.equal(roa.resolved, false);
    assert.equal(roa.pass, null);          // never `false`
    assert.ok(pv.withheld.includes('Rising ROA'));
    assert.equal(pv.withheld.length, 6);
});

test('no detail at all is zero determinable, not a score of zero', () => {
    const pv = piotroskiView(null);
    assert.equal(pv.determinable, 0);
    assert.equal(pv.passed, 0);
    assert.ok(!('score' in pv));
    assert.equal(pv.rows.length, 9);
    assert.ok(pv.rows.every(r => r.resolved === false));
});

test('the quality grade comes from a COMPLETE F-Score or is absent', () => {
    assert.equal(qualityGradeView(piotroskiView(COMPLETE)).grade, 'A−');
    const partial = qualityGradeView(piotroskiView(SONY));
    assert.ok(!('grade' in partial), 'a partial F-Score must not be graded');
    assert.match(partial.reason, /resolved 3 of 9/);
});

test('the grade bands are absolute and the basis names the score', () => {
    const mk = n => {
        const d = {};
        ['niPos','cfoPos','roaRising','cfoGtNi','levFalling','crRising','noNewShares','gmRising','atRising']
            .forEach((k, i) => { d[k] = i < n; });
        return qualityGradeView(piotroskiView(d));
    };
    assert.equal(mk(8).grade, 'A−');
    assert.equal(mk(6).grade, 'B');
    assert.equal(mk(3).grade, 'C');
    assert.equal(mk(6).basis, 'Piotroski F-Score 6/9');
});

test('Sloan is the statement figure or absent, never reconstructed', () => {
    const ok = sloanView(-0.012);
    assert.equal(ok.ratio, -0.012);
    assert.equal(ok.cashBacked, true);
    assert.match(ok.note, /cash-backed/);

    const none = sloanView(null);
    assert.ok(!('ratio' in none), 'no ratio without a statement figure');
    assert.ok(!('note' in none), 'no verdict without a ratio');
    assert.match(none.reason, /statement layer/);
});

test('an elevated accrual ratio gets the other sentence, not the good one', () => {
    const hot = sloanView(0.18);
    assert.equal(hot.cashBacked, false);
    assert.match(hot.note, /elevated/);
});

test('no measured ROIC means no spread and no value verdict', () => {
    const cap = capitalAllocationView({ roic: null, wacc: 0.085, waccBasis: 'assumed' });
    assert.ok(!('spread' in cap), 'a spread needs a measured ROIC');
    // The pre-fix sub-line read `spread > 0 ? ... : 'value-destroying'`, and
    // `null > 0` is false — so a company with no ROIC was called destructive.
    assert.ok(!('valueVerdict' in cap), 'no verdict without a spread');
    const row = cap.rows.find(r => r.label === 'Returns on capital vs cost');
    assert.equal(row.state, ROW_NO_VALUE);
    assert.equal(row.grade, undefined);
    assert.match(row.why, /No measured ROIC/);
});

test('buyback accretion and the M&A record are NOT MEASURABLE, not missing', () => {
    const cap = capitalAllocationView({ roic: 0.22, wacc: 0.085 });
    const bb = cap.rows.find(r => r.label === 'Buyback value-accretion');
    const ma = cap.rows.find(r => r.label === 'M&A track record');
    assert.equal(bb.state, ROW_NO_MEASURE);
    assert.equal(ma.state, ROW_NO_MEASURE);
    // They used to render 'C+' and 'A−' from the existence of a row.
    assert.equal(bb.grade, undefined);
    assert.equal(ma.grade, undefined);
    // And they are excluded from the denominator, because nothing computes them.
    assert.equal(cap.measurableCount, 3);
});

test('the overall grade states its denominator and is absent at zero', () => {
    const one = capitalAllocationView({ roic: 0.25, wacc: 0.085 });
    assert.equal(one.gradedCount, 1);
    assert.equal(one.overall, 'A');
    assert.equal(one.overallBasis, '1 of 3 measurable components graded');

    const none = capitalAllocationView({});
    // The pre-fix code ended `: 'B'` — a B in 64-point type over nothing.
    assert.ok(!('overall' in none), 'nothing measured means no grade');
    assert.equal(none.gradedCount, 0);
    assert.match(none.overallReason, /no grade/);
});

test('the overall grade averages the graded components on a stated scale', () => {
    // spread 0.20 -> A (4.0); reinvest 0.5 -> A− (3.7); divCov 2.0 -> B+ (3.3)
    const cap = capitalAllocationView({
        roic: 0.285, wacc: 0.085, reinvRate: 0.5, divCov: 2.0, divCovBasis: 'statements',
    });
    assert.equal(cap.gradedCount, 3);
    assert.equal(cap.overall, 'A−');   // mean 3.667, nearest is A− at 3.7
    assert.equal(cap.overallBasis, '3 of 3 measurable components graded');
});

test('the WACC basis travels, because a WACC is never observed', () => {
    const assumed = capitalAllocationView({ roic: 0.2, wacc: 0.085, waccBasis: 'assumed' });
    assert.equal(assumed.waccBasis, 'assumed');
    const est = capitalAllocationView({ roic: 0.2, wacc: 0.091, waccBasis: 'estimated' });
    assert.equal(est.waccBasis, 'estimated');
    // An unnamed basis is treated as the platform constant, never as measured.
    assert.equal(capitalAllocationView({ roic: 0.2, wacc: 0.085 }).waccBasis, 'assumed');
});

test('dividend coverage carries which book it came from', () => {
    const cap = capitalAllocationView({ divCov: 3.4, divCovBasis: 'overview' });
    assert.equal(cap.divCov, 3.4);
    assert.equal(cap.divCovBasis, 'overview');
    assert.equal(capitalAllocationView({ divCov: null }).divCov, undefined);
});

test('a genuine zero spread is a measurement and is graded', () => {
    const cap = capitalAllocationView({ roic: 0.085, wacc: 0.085 });
    assert.equal(cap.spread, 0);
    assert.equal(cap.valueVerdict, 'value-destroying');   // 0 is not above cost
    assert.equal(cap.rows[0].state, ROW_GRADED);
    assert.equal(cap.rows[0].grade, 'C');
});

test('no engine composite means no fair value, no upside and NO CALL', () => {
    const cv = compositeCallView(null, 336.87);
    assert.ok(!('fv' in cv));
    assert.ok(!('upside' in cv));
    // The pre-fix ladder ended `else { call = 'REDUCE · overvalued' }`, and a
    // chain of `>` against a null falls through to its last rung — so an
    // unvalued ticker rendered the most negative verdict on the board.
    assert.ok(!('call' in cv), 'no call without a fair value');
    assert.match(cv.reason, /did not produce a composite/);
});

test('a composite with no price gives the value and still no call', () => {
    const cv = compositeCallView(238, null);
    assert.equal(cv.fv, 238);
    assert.ok(!('upside' in cv));
    assert.ok(!('call' in cv));
});

test('the call bands read off the engine composite', () => {
    assert.equal(compositeCallView(200, 100).call, 'BUY · meaningful MoS');
    assert.equal(compositeCallView(105, 100).call, 'ACCUMULATE · narrow MoS');
    assert.equal(compositeCallView(100, 100).call, 'HOLD · limited MoS');
    assert.equal(compositeCallView(80, 100).call, 'REDUCE · overvalued');
    assert.equal(compositeCallView(200, 100).tone, 'good');
    assert.equal(compositeCallView(80, 100).tone, 'bad');
});

test('a non-positive composite is not a fair value', () => {
    assert.ok(!('fv' in compositeCallView(0, 100)));
    assert.ok(!('fv' in compositeCallView(-12, 100)));
});

// ── the scenario gate ───────────────────────────────────────────────────────
// Every test below fails against the pre-fix behaviour (the header strip was
// fed `ev_pw` unconditionally), checked by reverting.

test('an untouched scenario is NOT an edit, so the header gets nothing', () => {
    assert.equal(scenarioEdited(BBB_DEFAULTS), false);
    // ...and not by reference either: the sliders replace the object on every
    // change, so a `!==` check would call an untouched scenario edited the
    // first time anything re-rendered.
    assert.equal(scenarioEdited(JSON.parse(JSON.stringify(BBB_DEFAULTS))), false);
});

test('moving any single lever on any leg counts as an edit', () => {
    for (const leg of ['bull', 'base', 'bear']) {
        for (const lever of ['cagr', 'margin', 'mult', 'prob']) {
            const s = JSON.parse(JSON.stringify(BBB_DEFAULTS));
            s[leg][lever] = s[leg][lever] + 0.01;
            assert.equal(scenarioEdited(s), true, leg + '.' + lever);
        }
    }
});

test('a malformed or non-finite scenario is not an edit', () => {
    // A NaN lever cannot have come from a slider, and treating it as an edit
    // would publish an EV computed through it.
    for (const bad of [null, undefined, {}, 'x', 7, { bull: {}, base: {}, bear: {} }]) {
        assert.equal(scenarioEdited(bad), false, JSON.stringify(bad));
    }
    const nan = JSON.parse(JSON.stringify(BBB_DEFAULTS));
    nan.base.cagr = NaN;
    assert.equal(scenarioEdited(nan), false);
});

test('the defaults are company-independent constants, which is the point', () => {
    // If these ever became per-company they would stop being a reason to
    // withhold the figure, and this test should be the thing that fails.
    assert.equal(BBB_DEFAULTS.base.cagr, 0.13);
    assert.equal(BBB_DEFAULTS.base.margin, 0.44);
    assert.equal(BBB_DEFAULTS.base.mult, 28);
    assert.equal(BBB_DEFAULTS.bull.prob + BBB_DEFAULTS.base.prob + BBB_DEFAULTS.bear.prob, 100);
});

test('resetting returns to the baseline, so the header goes absent again', () => {
    const edited = JSON.parse(JSON.stringify(BBB_DEFAULTS));
    edited.bull.mult = 40;
    assert.equal(scenarioEdited(edited), true);
    assert.equal(scenarioEdited(JSON.parse(JSON.stringify(BBB_DEFAULTS))), false);
});
