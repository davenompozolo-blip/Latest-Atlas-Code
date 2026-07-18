// Engine checks — run: node src/lib/chartSeriesEngine.test.mjs
// Exercises alignment (union axis, forward-fill, common-start rebase,
// warnings) and window-scoped metrics (beta/corr/capture vs reference).

import { alignSeries, computeMetrics, rollingBeta, makeRequestGate, timeframeCutoff } from './chartSeriesEngine.js';

let fails = 0;
const check = (name, cond, detail) => {
    if (!cond) fails++;
    console.log(`${cond ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
};
const approx = (a, b, eps = 1e-6) => a != null && b != null && Math.abs(a - b) < eps;

// Build a weekday-ish calendar of n days ending today.
const days = (n) => {
    const out = [];
    const d = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const x = new Date(d);
        x.setDate(x.getDate() - i);
        out.push(x.toISOString().slice(0, 10));
    }
    return out;
};

// ── Case 1: alignment joins on date, forward-fills asset holidays.
const cal = days(10);
const port = cal.map((date, i) => ({ date, close: 100 + i }));
// asset missing cal[3] (its market holiday) — must forward-fill, not drift.
const asset = cal.filter((_, i) => i !== 3).map((date) => ({ date, close: 50 + cal.indexOf(date) * 2 }));

const a1 = alignSeries({ raw: { portfolio: port, AAA: asset }, ids: ['portfolio', 'AAA'], timeframe: null, normalise: false });
check('axis is the portfolio calendar', a1.dates.length === 10 && a1.dates[0] === cal[0]);
const aaa = a1.series.find(s => s.id === 'AAA');
check('holiday forward-filled with prior close', aaa.values[3] === aaa.values[2], `v3=${aaa.values[3]} v2=${aaa.values[2]}`);
check('forward-fill surfaced as warning', a1.warnings.some(w => w.id === 'AAA' && w.kind === 'forward_filled'));

// ── Case 2: common-start rebase — both series rebase at the same date.
const late = cal.slice(4).map((date, i) => ({ date, close: 10 + i })); // starts at cal[4]
const a2 = alignSeries({ raw: { portfolio: port, LATE: late }, ids: ['portfolio', 'LATE'], timeframe: null, normalise: true });
check('common start is the late series start', a2.commonStart === cal[4], a2.commonStart);
const p2 = a2.series.find(s => s.id === 'portfolio');
const l2 = a2.series.find(s => s.id === 'LATE');
check('portfolio rebases to 100 at common start (not its own first)', approx(p2.values[4], 100), `v=${p2.values[4]}`);
check('late series rebases to 100 at its start', approx(l2.values[4], 100), `v=${l2.values[4]}`);
check('late series leading dates stay null', l2.values[0] === null && l2.values[3] === null);
check('truncated history surfaced as warning', a2.warnings.some(w => w.id === 'LATE' && w.kind === 'truncated_history'));

// ── Case 3: missing ticker fails loud, not blank.
const a3 = alignSeries({ raw: { portfolio: port }, ids: ['portfolio', 'GHOST'], timeframe: null, normalise: true });
check('ghost ticker dropped with warning', a3.series.length === 1 && a3.warnings.some(w => w.id === 'GHOST' && w.kind === 'no_data'));

// ── Case 4: metrics on the displayed window only, beta vs reference.
// Asset = exactly 2× the portfolio's daily return → beta 2, corr 1.
const n = 80;
const cal4 = days(n);
let pv = 100, av = 100;
const port4 = [], asset4 = [];
for (let i = 0; i < n; i++) {
    const r = (i % 2 === 0 ? 1 : -1) * 0.01 * (1 + (i % 5) / 10);
    if (i > 0) { pv *= 1 + r; av *= 1 + 2 * r; }
    port4.push({ date: cal4[i], close: pv });
    asset4.push({ date: cal4[i], close: av });
}
const a4 = alignSeries({ raw: { portfolio: port4, DBL: asset4 }, ids: ['portfolio', 'DBL'], timeframe: null, normalise: true });
const m4 = computeMetrics({ dates: a4.dates, series: a4.series, referenceId: 'portfolio', rf: 0.04 });
const md = m4.find(m => m.id === 'DBL');
const mp = m4.find(m => m.id === 'portfolio');
check('reference beta/corr are 1', mp.beta === 1 && mp.corr === 1);
check('2x asset beta ≈ 2', approx(md.beta, 2, 1e-3), `beta=${md.beta}`);
check('2x asset corr ≈ 1', approx(md.corr, 1, 1e-6), `corr=${md.corr}`);
check('up capture ≈ 200', approx(md.upCapture, 200, 0.1), `up=${md.upCapture}`);
check('down capture ≈ 200', approx(md.downCapture, 200, 0.1), `down=${md.downCapture}`);
check('total return matches rebased endpoints', approx(md.totalReturn, a4.series[1].values[n - 1] / 100 - 1, 1e-9));

// ── Case 5: insufficient history guard (<20 obs → no fabricated numbers).
const short = cal4.slice(-6).map((date, i) => ({ date, close: 10 + i }));
const a5 = alignSeries({ raw: { portfolio: port4, TINY: short }, ids: ['portfolio', 'TINY'], timeframe: null, normalise: true });
const m5 = computeMetrics({ dates: a5.dates, series: a5.series, referenceId: 'portfolio' });
const mt = m5.find(m => m.id === 'TINY');
check('short series flagged insufficient', mt.insufficient === true && mt.totalReturn === undefined, `obs=${mt.obs}`);

// ── Case 6: rolling beta converges to 2 for the 2x asset.
const rb = rollingBeta({ dates: a4.dates, series: a4.series, referenceId: 'portfolio', id: 'DBL', window: 60 });
check('rolling beta null before full window', rb.values[30] === null);
check('rolling beta ≈ 2 once window fills', approx(rb.values[rb.values.length - 1], 2, 1e-3), `b=${rb.values[rb.values.length - 1]}`);

// ── Case 7: request gate discards stale responses.
const gate = makeRequestGate();
const t1 = gate.next();
const t2 = gate.next();
check('stale token rejected, current accepted', !gate.isCurrent(t1) && gate.isCurrent(t2));

// ── Case 8: timeframe cutoff sanity.
check('YTD cutoff is Jan 1', timeframeCutoff('YTD', '2026-07-18').slice(5) === '01-01');
check('1M cutoff one month back', timeframeCutoff('1M', '2026-07-18') === '2026-06-18');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
