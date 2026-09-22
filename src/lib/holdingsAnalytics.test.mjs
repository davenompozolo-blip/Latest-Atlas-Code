// ============================================================
// H-4: a holdings row can carry the BOOK without the ANALYTICS.
//
// Every fixture here carries at least one PENDING row -- a name that is
// priced, sized and real, with no conviction score, no recommended action and
// no alert flag, because it was bought between two matview refreshes. The
// whole 461-test suite passed unchanged across this change precisely because
// no fixture in it has ever had one: before H-4 such a name was ABSENT from
// vw_nexus_holdings rather than present-with-nulls, so the shape could not
// occur.
//
// Values are chosen so that reading a pending row as the old defaults --
// conviction 50, action 'Hold', target weight 0% -- changes the answer by a
// margin no rounding could produce. Verified by reverting each accessor, not
// assumed: see the note on each test that discriminates.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    analyticsPending, convictionOf, actionOf,
    partitionByAnalytics, sortByConviction, ANALYTICS_PENDING_LABEL,
} from './holdingsAnalytics.js';
import { weightedMove, withheldSharePct } from './weightedMove.js';

// AMD is the pending name: 40% of the book, bought minutes ago.
const BOOK = [
    { symbol: 'NVDA', market_value: 3000, weight_pct: 30, conviction_score: 90, recommended_action: 'Add'  },
    { symbol: 'AMD',  market_value: 4000, weight_pct: 40, conviction_score: null, recommended_action: null },
    { symbol: 'PG',   market_value: 3000, weight_pct: 30, conviction_score: 30, recommended_action: 'Trim' },
];

test('a row with no conviction is pending; a scored row is not', () => {
    assert.equal(analyticsPending(BOOK[1]), true);
    assert.equal(analyticsPending(BOOK[0]), false);
    assert.equal(analyticsPending(null), true);
    assert.equal(analyticsPending({ conviction_score: undefined }), true);
    assert.equal(analyticsPending({ conviction_score: '' }), true);
});

test('a conviction of exactly 0 is a MEASUREMENT, not a pending row', () => {
    // The lowest possible score is a real reading. Treating 0 as absent is the
    // `||` bug that started this, one level up.
    const row = { symbol: 'X', conviction_score: 0 };
    assert.equal(analyticsPending(row), false);
    assert.equal(convictionOf(row), 0);
});

test('convictionOf returns null, never 50', () => {
    assert.equal(convictionOf(BOOK[1]), null);
    assert.equal(convictionOf(BOOK[0]), 90);
    assert.equal(convictionOf({ conviction_score: 'not a number' }), null);
});

test('actionOf returns null, never Hold', () => {
    assert.equal(actionOf(BOOK[1]), null);
    assert.equal(actionOf(BOOK[0]), 'Add');
    assert.equal(actionOf({ recommended_action: '' }), null);
});

test('book-weighted conviction withholds the pending weight instead of scoring it 50', () => {
    const conv = weightedMove(BOOK, { value: h => h.market_value, move: convictionOf });
    // Measured names only: (3000*90 + 3000*30) / 6000 = 60.
    assert.equal(conv.pct, 60);
    // The old `|| 50` read gives (3000*90 + 4000*50 + 3000*30)/10000 = 56 --
    // a 4-point swing on a 0-100 gauge, from a name nobody has scored.
    assert.notEqual(conv.pct, 56);
    assert.equal(conv.withheldCount, 1);
    assert.deepEqual(conv.withheldSymbols, ['AMD']);
    // And the surface can state its denominator.
    assert.equal(withheldSharePct(conv, 10000), 40);
});

test('a book with NO analytics at all has no weighted conviction, not a conviction of 50', () => {
    const conv = weightedMove(
        [{ symbol: 'A', market_value: 100, conviction_score: null }],
        { value: h => h.market_value, move: convictionOf },
    );
    // Absent from the result, not null-valued: a renderer cannot print a
    // number it was never handed.
    assert.equal('pct' in conv, false);
    assert.equal(conv.pct ?? null, null);
});

test('pending rows sort LAST in both directions, and the order is deterministic', () => {
    // `b.conviction_score - a.conviction_score` yields NaN against a null, and
    // a NaN comparator is unstable rather than merely wrong.
    assert.deepEqual(sortByConviction(BOOK, -1).map(h => h.symbol), ['NVDA', 'PG', 'AMD']);
    assert.deepEqual(sortByConviction(BOOK,  1).map(h => h.symbol), ['PG', 'NVDA', 'AMD']);
    // Same input, reversed: the pending row still lands last, so the result
    // does not depend on the engine's sort implementation.
    assert.deepEqual(sortByConviction([...BOOK].reverse(), -1).map(h => h.symbol), ['NVDA', 'PG', 'AMD']);
});

test('a pending row never satisfies a High Conviction filter', () => {
    // `h.conviction_score >= 60` is already false for null, but the accessor
    // form has to keep it false rather than coercing.
    const high = BOOK.filter(h => (convictionOf(h) ?? -1) >= 60);
    assert.deepEqual(high.map(h => h.symbol), ['NVDA']);
});

test('partitionByAnalytics reports the pending share of book value', () => {
    const p = partitionByAnalytics(BOOK);
    assert.equal(p.measuredCount, 2);
    assert.equal(p.pendingCount, 1);
    assert.deepEqual(p.pendingSymbols, ['AMD']);
    assert.equal(p.pendingValue, 4000);
    assert.equal(p.pendingSharePct, 40);
});

test('partitionByAnalytics on an all-measured book reports zero pending', () => {
    // A wall of absent-handling that also mangles the healthy case is worse
    // than none: the happy path is asserted, not assumed.
    const p = partitionByAnalytics([BOOK[0], BOOK[2]]);
    assert.equal(p.pendingCount, 0);
    assert.equal(p.pendingSharePct, 0);
    assert.equal(p.measuredValue, 6000);
});

test('the pending label is a sentence about the analytics, not about the price', () => {
    // The name IS priced and IS sized -- that is the whole point of H-4. The
    // label must not read as a missing quote.
    assert.match(ANALYTICS_PENDING_LABEL, /analytics/i);
    assert.doesNotMatch(ANALYTICS_PENDING_LABEL, /price|quote|stale|no data/i);
});

// ── Repo-wide: no file may default a pending verdict ──────────────────
// The rule is repo-wide rather than "these three files", so the next call
// site fails in CI rather than in the terminal. Same construction as
// pagerOrdering.test.mjs, including its two lessons: strip comments before
// scanning (the prose around these reads is ABOUT defaulting), and test the
// detector against the exact pre-fix shape so a scanner that finds nothing
// cannot pass vacuously.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('..', import.meta.url).pathname;          // src/
const SELF = 'lib/holdingsAnalytics.js';

function jsFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) jsFiles(p, out);
        else if (/\.(js|jsx|mjs)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(p);
    }
    return out;
}

const stripComments = src => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

// `x.conviction_score || 50`, `?? 0`, `.recommended_action || 'Hold'` -- any
// default applied directly to the withheld fields.
// Closing parens are allowed between the field and the operator: the live
// instance was `num(row.conviction_score) ?? 0`, and a regex anchored tight to
// the field missed it. The detector test below is what found that.
const DEFAULTED = /\.(conviction_score|recommended_action|alert_flag)\s*\)*\s*(\|\||\?\?)/;

test('DETECTOR: the scanner catches the exact pre-fix shape', () => {
    assert.match(stripComments("const s = h.conviction_score || 50;"), DEFAULTED);
    assert.match(stripComments("conviction: num(row.conviction_score) ?? 0,"), DEFAULTED);
    assert.match(stripComments("h.recommended_action || 'Hold'"), DEFAULTED);
    // and does NOT fire on the sanctioned accessor form, nor on prose
    assert.doesNotMatch(stripComments("const s = convictionOf(h) ?? null;"), DEFAULTED);
    assert.doesNotMatch(stripComments("// never write h.conviction_score || 50 here"), DEFAULTED);
});

test('no source file defaults a withheld verdict field', () => {
    const files = jsFiles(SRC);
    // A scan that reaches nothing passes trivially.
    assert.ok(files.length > 50, `expected to scan the app, saw ${files.length} files`);

    const offenders = [];
    for (const f of files) {
        const rel = relative(SRC, f);
        if (rel === SELF) continue;          // the module that defines the rule
        for (const [i, line] of stripComments(readFileSync(f, 'utf8')).split('\n').entries()) {
            if (DEFAULTED.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
    }
    assert.deepEqual(offenders, [],
        'read these through convictionOf / actionOf instead:\n' + offenders.join('\n'));
});
