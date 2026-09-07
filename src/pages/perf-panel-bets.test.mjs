// node src/pages/perf-panel-bets.test.mjs
//
// Renders all three levels against a REAL snapshot of the 2026-09-07 book
// (src/pages/__fixtures__/perfBets.2026-09-07.json — 57 segment rows, 59
// verdict rows, 118 memberships, pulled straight out of Postgres).
//
// The handoff's acceptance checklist says every item is verifiable from a
// screenshot. This is that list, run in CI instead of by eye — and it catches
// the class of fault a Vite build cannot, because a call inside a useMemo is
// invisible to the bundler.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';

const fx = JSON.parse(readFileSync(
    new URL('./__fixtures__/perfBets.2026-09-07.json', import.meta.url), 'utf8'));

// The panel imports './config.js' (which reads import.meta.env, a Vite
// construct) and './components.js' (which pulls the whole shared component
// tree). Both are redirected to real stub FILES rather than to a synthetic
// module scheme — a custom scheme has no package scope, so `import React`
// inside the stub fails to resolve.
const stub = (name) => new URL('./__fixtures__/stub-' + name + '.js', import.meta.url).href;
const loaderUrl = 'data:text/javascript,' + encodeURIComponent(`
const MAP = ${JSON.stringify({ './config.js': stub('config'), './components.js': stub('components') })};
export async function resolve(spec, ctx, next) {
  if (MAP[spec]) return { url: MAP[spec], shortCircuit: true };
  return next(spec, ctx);
}
`);
register(loaderUrl, import.meta.url);

const { BetsLevel, CountersLevel, BookLevel } = await import('./perf-panel-bets.js');
const { buildBetsView, GROUPING_BET, GROUPING_THEME } = await import('../lib/segmentView.js');
const { buildCounters, segmentReading } = await import('../lib/counterView.js');
const { readBookBaseline } = await import('../lib/bookBaseline.js');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }
const noop = () => {};

const theme = buildBetsView(fx.segments, GROUPING_THEME);
const bet   = buildBetsView(fx.segments, GROUPING_BET);
const html  = (el) => renderToStaticMarkup(el);
const text  = (el) => html(el).replace(/<[^>]*>/g, ' ').replace(/&#x27;/g, "'")
                              .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
                              .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
                              .replace(/\s+/g, ' ');

// ── Level 2 ───────────────────────────────────────────────────
t('L2 renders under both groupings without throwing', () => {
    assert.ok(text(BetsLevel(theme, GROUPING_THEME, noop, noop)).length > 500);
    assert.ok(text(BetsLevel(bet, GROUPING_BET, noop, noop)).length > 500);
});

t('the toggle is present and theme is the one selected by default', () => {
    const out = html(BetsLevel(theme, GROUPING_THEME, noop, noop));
    assert.ok(out.includes('BY THEME'));
    assert.ok(out.includes('BY BET'));
    // Assert on the BUTTON, not on the first occurrence of the string — the
    // grouping is also named in the basis line above the toggle, and matching
    // that would pass whichever button was actually lit.
    assert.match(out, /<button[^>]*rgba\(58,214,224,\.13\)[^>]*>BY THEME<\/button>/,
        'BY THEME must render as the selected button');
    assert.ok(!/<button[^>]*rgba\(58,214,224,\.13\)[^>]*>BY BET<\/button>/.test(out),
        'BY BET must not also render selected');
});

t('BY THEME covers all 59 positions and shows the gap as its own row', () => {
    assert.equal(theme.positionCount, 59);
    const un = theme.segments.find(s => s.kind === 'unpaired');
    assert.ok(un, 'the unmapped names must render as a visible segment');
    assert.equal(un.memberCount, 17);
    // And it is not hidden in the tail — it is the second largest by risk.
    assert.ok(theme.full.some(s => s.kind === 'unpaired'));
});

t('the risk strip shows every segment proportionally, descending', () => {
    assert.equal(bet.strip.length, 44);
    assert.equal(theme.strip.length, 13);
    for (let i = 1; i < bet.strip.length; i++) {
        assert.ok(bet.strip[i - 1].share >= bet.strip[i].share, 'strip must be descending');
    }
    const out = html(BetsLevel(bet, GROUPING_BET, noop, noop));
    assert.ok(out.includes('44 segments'));
});

t('eight full rows, the remainder in one expandable tail', () => {
    assert.equal(bet.full.length, 8);
    assert.equal(bet.tail.length, 36);
    const out = text(BetsLevel(bet, GROUPING_BET, noop, noop));
    assert.match(out, /36 small bets/);
});

t('cluster 199 reads 19.3% weight against 42.9% risk — the position-level basis', () => {
    // The handoff checklist says 44.1%. That is the cluster-level share, which
    // renormalises KMTUY and IXC's 3.2% of marginal risk away — the exact
    // thing §2.4b replaces. 42.9% is the figure on the basis the spec chose.
    const c199 = bet.segments.find(s => s.segmentId === 'cluster:199');
    assert.equal((c199.weightShare * 100).toFixed(1), '19.3');
    assert.equal((c199.riskShare * 100).toFixed(1), '42.9');
});

t('the bond sleeve stays visible at 0.1% of risk', () => {
    const bonds = bet.segments.find(s => s.segmentId === 'cluster:158');
    assert.equal((bonds.weightShare * 100).toFixed(1), '3.4');
    assert.equal((bonds.riskShare * 100).toFixed(1), '0.1');
    // minWidth 2px on the fill is what keeps it on screen; "invisible" and
    // "zero" must not look the same.
    const out = html(BetsLevel(bet, GROUPING_BET, noop, noop));
    assert.ok(out.includes('min-width:2px'), 'the fill needs a floor to stay visible');
});

t('the two-bar device is on every full row, both bars labelled', () => {
    const out = html(BetsLevel(bet, GROUPING_BET, noop, noop));
    assert.equal((out.match(/>weight</g) || []).length, bet.full.length);
    assert.equal((out.match(/>risk</g) || []).length, bet.full.length);
});

t('both shares close to 1.0 under both groupings', () => {
    const close = (v) => Math.abs(v.segments.reduce((t, s) => t + s.riskShare, 0) - 1) < 1e-9
                      && Math.abs(v.segments.reduce((t, s) => t + s.weightShare, 0) - 1) < 1e-9;
    assert.ok(close(bet), 'BY BET must close');
    assert.ok(close(theme), 'BY THEME must close');
});

t('effective bets is labelled as a property of the grouping shown', () => {
    const out = text(BetsLevel(theme, GROUPING_THEME, noop, noop));
    assert.match(out, /effective bets measured on this grouping/i);
    // And it genuinely differs between the two.
    assert.notEqual(bet.effectiveBets.toFixed(2), theme.effectiveBets.toFixed(2));
});

t('insight sentences are capped at two, and silent when nothing clears', () => {
    bet.segments.forEach(s => assert.ok(s.insights.length <= 2, s.label));

    // §2.5's thresholds are selective, and on the real book most segments
    // carry weight ~= risk, which is the "nothing notable" case. Only 2 of the
    // 8 default rows produce a reading. That is deliberate silence, not a
    // missing template: the mockup shows a "Weight and risk in line" sentence
    // for Mega-cap platforms, and NO such rule exists in §2.5. Adding one
    // would be inventing content the spec does not define, so the row stays
    // quiet until that is decided.
    const withIns = theme.full.filter(s => s.insights.length > 0);
    assert.equal(withIns.length, 2, 'thresholds changed — re-read §2.5 before adjusting this');
    assert.deepEqual(withIns.map(s => s.label).sort(),
                     ['AI / accelerated compute', 'Unpaired']);
    assert.deepEqual(
        theme.segments.find(s => s.label === 'AI / accelerated compute').insights.map(i => i.key),
        ['risk_over_weight', 'dispersion']);
});

t('a segment that could not be measured shows the reason, not a dash', () => {
    const gated = bet.segments.filter(s => s.cfStatus !== 'measured');
    assert.ok(gated.length >= 1, 'KMTUY alone is unmeasurable under BY BET');
    const out = text(BetsLevel(bet, GROUPING_BET, noop, noop));
    // It sits in the tail on this book, so assert on the row renderer's own
    // output via a view whose full set contains it.
    const only = buildBetsView(fx.segments.filter(
        r => r.grouping === 'bet' && r.cf_status !== 'measured'), GROUPING_BET);
    const gatedOut = text(BetsLevel(only, GROUPING_BET, noop, noop));
    assert.match(gatedOut, /no_measured_members|gated by the return engine/);
    assert.ok(!/\bNaN\b/.test(gatedOut));
});

// ── Level 3 ───────────────────────────────────────────────────
const c199 = bet.segments.find(s => s.segmentId === 'cluster:199');
const c199syms = fx.membership
    .filter(m => m.grouping === 'bet' && m.segment_id === 'cluster:199')
    .map(m => m.symbol);
const built = buildCounters(fx.counters, c199syms, { singleTransaction: {} });

t('L3 renders cluster 199 with all eight members', () => {
    assert.equal(c199syms.length, 8);
    assert.equal(built.tiles.length, 8);
    assert.deepEqual(built.missing, []);
    const out = text(CountersLevel(c199, built.tiles, built.missing,
        segmentReading(built.tiles, c199), {}, noop));
    ['AMD', 'MU', 'SNDK', 'ASML', 'TSM', 'EWY', 'DFEV', 'MRVL']
        .forEach(s => assert.ok(out.includes(s), 'missing tile ' + s));
});

t('a paired-but-ineligible member shows TIER 2 inside a cluster segment', () => {
    // The checklist item. MRVL is in cluster 199 by cluster_id and off Tier 1
    // by cluster_eligible — two gates, and they are meant to disagree.
    const mrvl = built.tiles.find(t => t.symbol === 'MRVL');
    assert.equal(mrvl.slot.basis, 'book');
    assert.equal(mrvl.clusterEligible, false);
    const out = text(CountersLevel(c199, built.tiles, built.missing,
        segmentReading(built.tiles, c199), {}, noop));
    assert.ok(out.includes('Tier 2 · Rest of book'));
    assert.ok(out.includes('Tier 1 · Cluster'));
});

t('the segment header carries the weight/risk/vs-book triplet', () => {
    const out = text(CountersLevel(c199, built.tiles, built.missing,
        segmentReading(built.tiles, c199), {}, noop));
    assert.match(out, /weight 19\.3%/);
    assert.match(out, /risk 42\.9%/);
    assert.match(out, /vs book \+47\.\d/);
});

t('the header says vs book is a counterfactual, not an average of the tiles', () => {
    const out = text(CountersLevel(c199, built.tiles, built.missing,
        segmentReading(built.tiles, c199), {}, noop));
    assert.match(out, /own flows run into the book without it/i);
});

t('the reading sentence is computed from the real eight, not the mockup copy', () => {
    const r = segmentReading(built.tiles, c199);
    // The mockup says "All four are leaders". The real segment is eight with
    // mixed ranks, so that sentence cannot be true here.
    assert.ok(!/All four/.test(r.text));
    assert.match(r.text, /leader/i);
});

t('the flip renders the back face and it carries the three-bar block', () => {
    const flipped = {};
    built.tiles.forEach(t => { flipped[t.symbol] = true; });
    const out = text(CountersLevel(c199, built.tiles, built.missing,
        segmentReading(built.tiles, c199), flipped, noop));
    assert.match(out, /best peer/);
    assert.match(out, /peer median/);
    assert.match(out, /what you did/);
    assert.match(out, /on the same dates/);
});

t('Allocation renders "not computed" rather than blank or zero', () => {
    // allocation_effect_pct is 0 of 59 on the live table.
    const flipped = { AMD: true };
    const out = text(CountersLevel(c199, built.tiles, built.missing,
        segmentReading(built.tiles, c199), flipped, noop));
    assert.match(out, /Allocation not computed/);
    assert.ok(!/Allocation\s+0\.0pp/.test(out), 'must never fabricate a zero');
});

t('a single-transaction position suppresses the bars with words', () => {
    const one = buildCounters(fx.counters, ['AMD'], { singleTransaction: { AMD: true } });
    const out = text(CountersLevel(c199, one.tiles, [], segmentReading(one.tiles, c199),
        { AMD: true }, noop));
    assert.match(out, /bought once and never traded/);
    assert.ok(!/what you did/.test(out));
});

t('a member with no verdict row is named on screen', () => {
    const withGhost = buildCounters(fx.counters, c199syms.concat(['GHOST']), { singleTransaction: {} });
    const out = text(CountersLevel(c199, withGhost.tiles, withGhost.missing,
        segmentReading(withGhost.tiles, c199), {}, noop));
    assert.match(out, /no verdict row tonight: GHOST/);
});

t('no level renders NaN, undefined or [object Object]', () => {
    const outs = [
        text(BetsLevel(theme, GROUPING_THEME, noop, noop)),
        text(BetsLevel(bet, GROUPING_BET, noop, noop)),
        text(CountersLevel(c199, built.tiles, built.missing, segmentReading(built.tiles, c199), {}, noop)),
    ];
    outs.forEach((o, i) => {
        assert.ok(!/\bNaN\b/.test(o), 'NaN in output ' + i);
        assert.ok(!/\bundefined\b/.test(o), 'undefined in output ' + i);
        assert.ok(!/\[object Object\]/.test(o), 'object in output ' + i);
    });
});

// ── Level 1 ───────────────────────────────────────────────────
const book = (function () {
    const b = readBookBaseline(fx.baseline);
    return { traded: b.tradedPct, frozen: b.frozenPct, tradingEffectPp: b.effectPp,
             status: b.status, reason: b.reason, asOf: b.asOf };
})();

t('L1 hero is the trading effect with a sentence beneath', () => {
    const out = text(BookLevel(book, theme, noop, noop));
    assert.match(out, /trading effect · do-nothing baseline/i);
    assert.match(out, /held frozen at their opening weights|has not been written/);
});

t('L1 carries four tiles including measured / total', () => {
    const out = text(BookLevel(book, theme, noop, noop));
    ['book MWR', 'vs frozen', 'effective bets', 'measured / total']
        .forEach(l => assert.ok(out.includes(l), 'missing tile ' + l));
});

t('L1 process panel renders in a pending state rather than being omitted', () => {
    const out = text(BookLevel(book, theme, noop, noop));
    assert.match(out, /process · pending/i);
    assert.match(out, /Hit rate, win:loss and holding-period skew/);
});

t('L1 verdict bar renders and its counts sum to the labelled positions', () => {
    const out = text(BookLevel(book, theme, noop, noop));
    assert.match(out, /verdicts across the book/i);
    const total = theme.segments.reduce((t, s) => t + (s.labelledCount || 0), 0);
    assert.equal(total, 59, 'every position must be counted exactly once');
    assert.match(out, new RegExp(total + ' of 59 positions labelled'));
});

t('L1 says when the headline and the composition come from different nights', () => {
    const stale = Object.assign({}, book, { asOf: '2026-09-01' });
    const out = text(BookLevel(stale, theme, noop, noop));
    assert.match(out, /did not land on the same night/);
    // And stays quiet when they agree.
    const aligned = Object.assign({}, book, { asOf: theme.asOf });
    assert.ok(!/did not land on the same night/.test(text(BookLevel(aligned, theme, noop, noop))));
});

console.log('\n' + passed + '/' + passed + ' passed');
