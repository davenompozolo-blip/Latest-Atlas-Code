import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchPaged, PAGE_SIZE, MAX_PAGES } from './pagedRead.js';
import {
    buildReturnSeries, measuredCount, measuredValues, pairwiseComplete,
    corrPairwise, partitionBySufficiency, MIN_OBS,
} from './riskReturnSeries.js';

// ── The naive constructions these replace ────────────────────────────────
// Kept here so every assertion below can be read against what shipped, and
// so a fixture that fails to discriminate is visible rather than assumed.

function naiveSeries(dates, closeBySymbol, symbols) {
    const out = {};
    for (const sym of symbols) {
        const p = closeBySymbol[sym] || {};
        const rets = [];
        for (let i = 1; i < dates.length; i++) {
            const p0 = p[dates[i - 1]], p1 = p[dates[i]];
            rets.push(p0 && p1 && p0 > 0 ? (p1 - p0) / p0 : 0);   // <- fabricates
        }
        out[sym] = rets;
    }
    return out;
}

function naivePearson(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 5) return 0;                                          // <- claims 0
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
        const x = a[i] - ma, y = b[i] - mb;
        num += x * y; da += x * x; db += y * y;
    }
    const d = Math.sqrt(da * db);
    return d > 0 ? num / d : 0;                                   // <- claims 0
}

// ── Fixture ──────────────────────────────────────────────────────────────
// Eight sessions. HELD traded throughout. LATE was bought on day 6, which
// is the live MA / APH / INTU case. FLAT has no bar at all, the live TTWO
// case.
const DATES = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
const CLOSES = {
    HELD: { d1: 100, d2: 102, d3: 101, d4: 105, d5: 103, d6: 106, d7: 104, d8: 108 },
    // Moves the OPPOSITE way to HELD on both days it actually traded.
    LATE: { d6: 50, d7: 52, d8: 49 },
    FLAT: {},
};
const SYMS = ['HELD', 'LATE', 'FLAT'];

// ── buildReturnSeries ────────────────────────────────────────────────────

test('a date with no bar is null, never a 0.00% return', () => {
    const { series } = buildReturnSeries(DATES, CLOSES, SYMS);
    const naive = naiveSeries(DATES, CLOSES, SYMS);

    // LATE has 7 slots; only the last two are observations.
    assert.equal(series.LATE.length, 7);
    assert.deepEqual(series.LATE.slice(0, 5), [null, null, null, null, null]);
    assert.ok(series.LATE[5] != null && series.LATE[6] != null);

    // The shipped version called every one of those five a real flat day.
    assert.deepEqual(naive.LATE.slice(0, 5), [0, 0, 0, 0, 0]);
});

test('a name with no bars at all is entirely unmeasured, not entirely flat', () => {
    const { series, coverage } = buildReturnSeries(DATES, CLOSES, SYMS);
    assert.equal(coverage.FLAT.measured, 0);
    assert.ok(series.FLAT.every((v) => v === null));

    // Naive: seven real zeros -> zero variance -> reads as a riskless name.
    const naive = naiveSeries(DATES, CLOSES, SYMS);
    assert.deepEqual(naive.FLAT, [0, 0, 0, 0, 0, 0, 0]);
});

test('coverage counts observations, and a fully-held name is complete', () => {
    const { coverage } = buildReturnSeries(DATES, CLOSES, SYMS);
    assert.deepEqual(coverage.HELD, { measured: 7, slots: 7 });
    assert.deepEqual(coverage.LATE, { measured: 2, slots: 7 });
});

test('a zero price is not a valid base for a return', () => {
    const { series } = buildReturnSeries(['a', 'b'], { Z: { a: 0, b: 10 } }, ['Z']);
    assert.equal(series.Z[0], null);
});

// ── the guard that the fabrication defeated ──────────────────────────────

test('measuredCount counts observations, not slots', () => {
    const { series } = buildReturnSeries(DATES, CLOSES, SYMS);
    // This is the whole mechanism: the page guarded on `a.length > 5`, and
    // the zero-fill made every vector full length, so every guard passed.
    assert.equal(series.LATE.length, 7);          // what the old guard saw
    assert.equal(measuredCount(series.LATE), 2);  // what was actually there
    assert.ok(series.LATE.length > MIN_OBS);
    assert.ok(measuredCount(series.LATE) < MIN_OBS);
});

test('measuredValues drops gaps and keeps order', () => {
    assert.deepEqual(measuredValues([null, 0.1, null, -0.2]), [0.1, -0.2]);
    assert.deepEqual(measuredValues([]), []);
    assert.deepEqual(measuredValues(undefined), []);
});

// ── pairwise statistics ──────────────────────────────────────────────────

test('pairwiseComplete keeps only days both names traded', () => {
    const { series } = buildReturnSeries(DATES, CLOSES, SYMS);
    const { a, b, n } = pairwiseComplete(series.HELD, series.LATE);
    assert.equal(n, 2);
    assert.equal(a.length, 2);
    assert.equal(b.length, 2);
});

test('an unmeasurable correlation is null, never 0', () => {
    const { series } = buildReturnSeries(DATES, CLOSES, SYMS);

    // Two shared observations against a floor of five.
    assert.equal(corrPairwise(series.HELD, series.LATE), null);
    // No shared observations at all.
    assert.equal(corrPairwise(series.HELD, series.FLAT), null);

    // The shipped version answered BOTH, confidently, and the two answers
    // fail in different ways. Against LATE it computed a real-looking
    // number off seven slots of which five were fabricated flat days — so
    // it is not a refusal, it is a measurement of the fabrication. Against
    // FLAT the all-zero vector is constant, so it fell to the `denom > 0`
    // branch and returned 0: "uncorrelated", which on a risk page reads as
    // a perfect diversifier.
    const naive = naiveSeries(DATES, CLOSES, SYMS);
    const fabricated = naivePearson(naive.HELD, naive.LATE);
    assert.ok(fabricated !== 0 && Number.isFinite(fabricated),
        'the old helper published a number, not a refusal, got ' + fabricated);
    assert.equal(naivePearson(naive.HELD, naive.FLAT), 0);
});

test('a constant series has no correlation, and that is not zero correlation', () => {
    const flat = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    const moves = [0.01, -0.02, 0.03, -0.01, 0.02, -0.03];
    assert.equal(corrPairwise(flat, moves), null);
    assert.equal(naivePearson(flat, moves), 0);
});

test('zero-filling inverts the SIGN of a real correlation', () => {
    // Twelve sessions. OLD drifts steadily down throughout. NEW is bought
    // on d6 and falls with it — on every one of the six days both names
    // traded, they move together, and the measured correlation is -1.0
    // against a falling incumbent, i.e. strongly negative co-movement of
    // returns. The six fabricated flat days sit ABOVE NEW's own mean and
    // BELOW OLD's, so their product contributes positively and drags the
    // estimate across zero.
    const dates = ['d0','d1','d2','d3','d4','d5','d6','d7','d8','d9','d10','d11','d12'];
    const closes = {
        OLD: { d0:100, d1:99.58, d2:99.38, d3:99.20, d4:98.87, d5:98.55, d6:98.12,
               d7:96.28, d8:95.74, d9:94.04, d10:92.66, d11:90.67, d12:88.71 },
        NEW: { d6:50, d7:49.78, d8:48.91, d9:48.64, d10:48.23, d11:48.15, d12:48.07 },
    };
    const { series, coverage } = buildReturnSeries(dates, closes, ['OLD', 'NEW']);
    assert.equal(coverage.NEW.measured, 6);
    assert.equal(coverage.NEW.slots, 12);

    const measured = corrPairwise(series.OLD, series.NEW);
    assert.ok(measured < -0.99, 'measured correlation is ~-1, got ' + measured);

    const naive = naiveSeries(dates, closes, ['OLD', 'NEW']);
    const fabricated = naivePearson(naive.OLD, naive.NEW);
    assert.ok(fabricated > 0.15,
        'the shipped construction reported a POSITIVE correlation, got ' + fabricated);

    // Not a rounding difference. Opposite signs, and the page would have
    // read the pair as a mild diversifier when they move as one.
    assert.ok(Math.sign(measured) !== Math.sign(fabricated));
});

// ── withholding, and stating the denominator ─────────────────────────────

test('an insufficiently measured name is withheld with its weight named', () => {
    const { series } = buildReturnSeries(DATES, CLOSES, SYMS);
    const w = { HELD: 90, LATE: 8, FLAT: 2 };
    const p = partitionBySufficiency(SYMS, series, (s) => w[s]);

    assert.deepEqual(p.measured, ['HELD']);
    assert.deepEqual(p.withheld.map((x) => x.symbol).sort(), ['FLAT', 'LATE']);
    assert.equal(Math.round(p.measuredWeightPct), 90);
    assert.equal(Math.round(p.withheldWeightPct), 10);
    // The two sides must account for the whole book, not a renormalised one.
    assert.ok(Math.abs(p.measuredWeightPct + p.withheldWeightPct - 100) < 1e-9);
});

test('withholding reports how many observations the name actually had', () => {
    const { series } = buildReturnSeries(DATES, CLOSES, SYMS);
    const p = partitionBySufficiency(SYMS, series, () => 1);
    const late = p.withheld.find((x) => x.symbol === 'LATE');
    assert.equal(late.measured, 2);
});

test('an empty book states no denominator rather than dividing by zero', () => {
    const p = partitionBySufficiency([], {}, () => 0);
    assert.equal(p.measuredWeightPct, 0);
    assert.equal(p.withheldWeightPct, 0);
});

// ── the pager ────────────────────────────────────────────────────────────

function fakeServer(totalRows) {
    // Mimics PostgREST: honours `range`, caps each response at PAGE_SIZE.
    return (from, to) => {
        const end = Math.min(to, from + PAGE_SIZE - 1, totalRows - 1);
        const data = [];
        for (let i = from; i <= end; i++) data.push({ i });
        return Promise.resolve({ data, error: null });
    };
}

test('paging recovers every row past the 1,000 cap', async () => {
    const rows = await fetchPaged(fakeServer(2696), 'vw_position_nav_daily');
    assert.equal(rows.length, 2696);
    assert.equal(rows[0].i, 0);
    assert.equal(rows[rows.length - 1].i, 2695);

    // This is the live chunk-0 shape: a single capped request returned the
    // oldest 1,000 of 2,696 and the page never looked at content-range.
    const single = await fetchPaged(
        (f, t) => fakeServer(2696)(f, Math.min(t, f + PAGE_SIZE - 1)), 'x'
    );
    assert.equal(single.length, 2696);
});

test('an exact multiple of the page size still terminates', async () => {
    const rows = await fetchPaged(fakeServer(2000), 'x');
    assert.equal(rows.length, 2000);
});

test('a short first page ends the read immediately', async () => {
    let calls = 0;
    const rows = await fetchPaged((f, t) => { calls++; return fakeServer(350)(f, t); }, 'x');
    assert.equal(rows.length, 350);
    assert.equal(calls, 1);
});

test('an empty relation yields no rows and one call', async () => {
    let calls = 0;
    const rows = await fetchPaged((f, t) => { calls++; return fakeServer(0)(f, t); }, 'x');
    assert.deepEqual(rows, []);
    assert.equal(calls, 1);
});

test('a server that ignores range is capped rather than allowed to hang', async () => {
    const errs = [];
    const realErr = console.error;
    console.error = (m) => errs.push(m);
    try {
        // Always returns a full page: without the cap this never terminates.
        const rows = await fetchPaged(() => Promise.resolve({
            data: new Array(PAGE_SIZE).fill({ i: 0 }), error: null,
        }), 'runaway_relation');
        assert.equal(rows.length, PAGE_SIZE * MAX_PAGES);
    } finally {
        console.error = realErr;
    }
    assert.equal(errs.length, 1);
    assert.match(errs[0], /runaway_relation/);
    assert.match(errs[0], /TRUNCATED/);
});

test('a PostgREST error is raised, not swallowed into an empty read', async () => {
    await assert.rejects(
        fetchPaged(() => Promise.resolve({ data: null, error: new Error('57014') }), 'x'),
        /57014/
    );
});

test('the pager refuses a call that cannot name the relation it truncated', () => {
    assert.throws(() => fetchPaged(fakeServer(10)), /label is required/);
    assert.throws(() => fetchPaged(null, 'x'), /must be a function/);
});
