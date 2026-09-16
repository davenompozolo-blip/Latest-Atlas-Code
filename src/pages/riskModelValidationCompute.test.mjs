// F-3 / B5 Model validation transforms — pure, runs under plain node.
//
//   node --test src/pages/riskModelValidationCompute.test.mjs
//
// The fixtures deliberately invert reality in places: 90% passing while
// 95% fails, a fourth confidence level, a run with no decomposition
// columns. Anything that hardcodes "95% is the one that passes" or
// assumes three levels fails here rather than on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    VAR_Z, latestRunSet, tailShapeRows, patternSentence,
    scaleChain, scaleClosing, normalOverlay, tailBinFlags, vintageAgrees,
} from './riskModelValidationCompute.js';

const run = (over) => ({
    as_of: '2026-09-14', logic_version: 'v1', leg: 'model', basis: 'unconditional',
    axis_key: null, conf: 0.95, n_obs: 3370, exceptions: 169, expected_exceptions: 168.5,
    kupiec_lr: 0.002, kupiec_reject_05: false, kupiec_reject_01: false,
    sd_pred_daily: 0.012022, sd_realised_daily: 0.012018,
    sd_factor_window: null, sd_residual_window: null,
    betas_estimated_at: '2026-09-09T15:22:52.968Z', ...over,
});

// The three model-leg rows exactly as B5 published them.
const REAL_MODEL = [
    run({ conf: 0.90, exceptions: 265, expected_exceptions: 337.0, kupiec_lr: 18.309, kupiec_reject_05: true, kupiec_reject_01: true }),
    run({ conf: 0.95, exceptions: 169, expected_exceptions: 168.5, kupiec_lr: 0.002, kupiec_reject_05: false, kupiec_reject_01: false }),
    run({ conf: 0.99, exceptions: 56, expected_exceptions: 33.7, kupiec_lr: 12.429, kupiec_reject_05: true, kupiec_reject_01: true }),
];

// The book leg exactly as B5 published it, decomposition columns included.
const REAL_BOOK = run({
    leg: 'book', conf: 0.95, n_obs: 172, exceptions: 18, expected_exceptions: 8.6,
    kupiec_lr: 8.341, kupiec_reject_05: true, kupiec_reject_01: true,
    sd_pred_daily: 0.012022, sd_realised_daily: 0.016530,
    sd_factor_window: 0.014547, sd_residual_window: 0.007755,
});

test('tail rows reproduce the published model leg and derive direction from data', () => {
    const rows = tailShapeRows(REAL_MODEL);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(r => r.confLabel), ['90%', '95%', '99%']);
    assert.equal(rows[0].direction, 'too few — body too wide');
    assert.equal(rows[1].direction, 'passes — observed and expected agree');
    assert.equal(rows[2].direction, 'too many — tail too thin');
    assert.ok(Math.abs(rows[0].ratio - 265 / 337) < 1e-12);
    assert.ok(Math.abs(rows[2].ratio - 56 / 33.7) < 1e-12);
});

test('direction follows the data when 90% passes and 95% fails', () => {
    // Inverted fixture: if anything keys off the confidence level rather
    // than the Kupiec flag, this is where it shows up.
    const rows = tailShapeRows([
        run({ conf: 0.90, exceptions: 340, expected_exceptions: 337.0, kupiec_reject_05: false }),
        run({ conf: 0.95, exceptions: 400, expected_exceptions: 168.5, kupiec_reject_05: true }),
    ]);
    assert.equal(rows[0].direction, 'passes — observed and expected agree');
    assert.equal(rows[1].direction, 'too many — tail too thin');
});

test('a fourth confidence level flows through without a z and is not dropped', () => {
    const rows = tailShapeRows([...REAL_MODEL, run({ conf: 0.975, exceptions: 100, expected_exceptions: 84 })]);
    assert.equal(rows.length, 4);
    assert.equal(rows.find(r => r.conf === 0.975).z, null);
});

test('pattern sentence names the crossing only when the pattern is there', () => {
    const s = patternSentence(tailShapeRows(REAL_MODEL));
    assert.match(s, /leptokurtic/);
    assert.match(s, /95% passes because it is where the two errors cross/);

    const allPass = tailShapeRows(REAL_MODEL.map(r => ({ ...r, kupiec_reject_05: false })));
    const s2 = patternSentence(allPass);
    assert.match(s2, /not refuted/);
    assert.doesNotMatch(s2, /leptokurtic/);
});

test('scale chain reproduces B5 published factors from stored columns', () => {
    const c = scaleChain([REAL_BOOK]);
    assert.ok(Math.abs(c.total - 1.3749) < 1e-4, 'total ' + c.total);
    assert.ok(Math.abs(c.steps[0].factor - 1.2100) < 1e-4, 'hot ' + c.steps[0].factor);
    assert.ok(Math.abs(c.steps[1].factor - 1.1332) < 1e-4, 'idio ' + c.steps[1].factor);
    assert.ok(Math.abs(c.product - 1.3712) < 1e-3, 'product ' + c.product);
    // The published residual gap is ~0.27%.
    assert.ok(Math.abs(c.gap) < 0.005 && Math.abs(c.gap) > 0.0005, 'gap ' + c.gap);
    assert.match(c.steps[1].cause, /22\.[0-9]% of book variance/);
});

test('a run without decomposition columns yields no chain, not zeros', () => {
    const c = scaleChain([{ ...REAL_BOOK, sd_factor_window: null, sd_residual_window: null }]);
    assert.equal(c.steps, null);
    assert.ok(c.reason);
    assert.ok(Math.abs(c.total - 1.3749) < 1e-4);   // the total is still measurable
    assert.match(scaleClosing(c), /decomposition is not available/);
});

test('scale chain is absent, not zero, when there is no book row', () => {
    assert.equal(scaleChain(REAL_MODEL), null);
    assert.equal(scaleClosing(null), null);
});

test('latestRunSet takes one as_of and one logic_version, never a blend', () => {
    const set = latestRunSet([
        run({ as_of: '2026-09-11', logic_version: 'v1' }),
        run({ as_of: '2026-09-14', logic_version: 'v1' }),
        run({ as_of: '2026-09-14', logic_version: 'v0' }),
    ]);
    assert.equal(set.asOf, '2026-09-14');
    assert.equal(set.logicVersion, 'v1');
    assert.equal(set.rows.length, 1);
    assert.deepEqual(set.logicVersionsSeen, ['v0', 'v1']);
    assert.equal(latestRunSet([]), null);
});

test('normal overlay integrates to about n over a wide grid', () => {
    const bins = [];
    for (let i = -24; i < 24; i++) {
        bins.push({ bin_lo: i * 0.25, bin_hi: (i + 1) * 0.25, bin_mid: i * 0.25 + 0.125, obs: 0, n_obs: 1000 });
    }
    const total = normalOverlay(bins).reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(total - 1000) < 5, 'overlay total ' + total);
});

test('tail shading never includes a bin straddling the threshold', () => {
    const z = VAR_Z['0.99'];                       // 2.3263…
    const bins = [
        { bin_lo: -2.75, bin_hi: -2.50, bin_mid: -2.625 },  // fully beyond
        { bin_lo: -2.50, bin_hi: -2.25, bin_mid: -2.375 },  // straddles -2.3263
        { bin_lo: -2.25, bin_hi: -2.00, bin_mid: -2.125 },  // inside
    ];
    assert.deepEqual(tailBinFlags(bins, z), [true, false, false]);
});

test('vintage disagreement is reported, not silently ignored', () => {
    assert.equal(vintageAgrees({ betas_estimated_at: '2026-09-09T15:22:52.968Z' },
                               { betas_estimated_at: '2026-09-09T15:22:52.968Z' }), true);
    assert.equal(vintageAgrees({ betas_estimated_at: '2026-09-09T15:22:52.968Z' },
                               { betas_estimated_at: '2026-09-16T01:00:00.000Z' }), false);
    assert.equal(vintageAgrees(null, {}), null);
});
