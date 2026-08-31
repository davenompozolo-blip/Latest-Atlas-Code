// node src/lib/tradingEffect.test.mjs

import assert from 'node:assert/strict';
import { buildTradingView, alignment, tradingVerdict, KIND_READ } from './tradingEffect.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }

const AS_OF = '2026-08-28';

// Shaped like the view: fractions for rates, dollars for money.
function row(symbol, kind, usd, pct, extra) {
    return Object.assign({
        symbol: symbol,
        position_state: kind === 'exit' ? 'closed' : 'open',
        as_of: AS_OF,
        trade_kind: kind,
        n_buys: 1, n_sells: kind === 'exit' ? 1 : 0,
        comparable: true,
        unmeasurable_reason: null, unmeasurable_detail: null,
        traded_capital_usd: 1000, frozen_capital_usd: 1000,
        traded_gain_usd: usd, frozen_gain_usd: 0,
        trading_effect_usd: usd,
        traded_return_pct: null, frozen_return_pct: null,
        trading_effect_pct: pct == null ? null : pct / 100,
        effects_disagree: usd != null && pct != null && usd !== 0 && pct !== 0
                          && Math.sign(usd) !== Math.sign(pct),
        structural_zero_breach: false,
    }, extra || {});
}

// ── the sort key ──────────────────────────────────────────────
t('positions rank by DOLLARS, not by rate', () => {
    // GILD is the biggest rate mover on the real book (+70.9pp) and a middling
    // dollar one (+$626); AMD is +41.6pp and +$1,158. Ranking on the rate puts
    // the wrong name at the top of a list that claims to explain the book.
    const v = buildTradingView([
        row('GILD', 'resized', 626, 70.9),
        row('AMD',  'resized', 1158, 41.6),
    ], null);
    assert.deepEqual(v.rankedByDollars.map(r => r.symbol), ['AMD', 'GILD']);
});

t('ranking is by MAGNITUDE — the biggest movers either way', () => {
    const v = buildTradingView([
        row('SMALL', 'resized', 50, 1),
        row('BIGNEG', 'exit', -940, -33.1),
        row('BIGPOS', 'resized', 1158, 41.6),
    ], null);
    assert.deepEqual(v.rankedByDollars.map(r => r.symbol), ['BIGPOS', 'BIGNEG', 'SMALL']);
});

// ── structural zeros ──────────────────────────────────────────
t('untouched positions are excluded from helped/hurt', () => {
    // A position bought once and never touched was never in the comparison.
    // Counting it as "hurt by $0" would put it on whichever side a
    // floating-point sign happened to land.
    const v = buildTradingView([
        row('A', 'untouched', 0, 0),
        row('B', 'untouched', 0, 0),
        row('C', 'resized', 100, 2),
        row('D', 'exit', -100, -2),
    ], null);
    assert.equal(v.helped, 1);
    assert.equal(v.hurt, 1);
    assert.equal(v.untouchedCount, 2);
    assert.deepEqual(v.rankedByDollars.map(r => r.symbol), ['C', 'D']);
});

t('a traded position with no effect is its own outcome, not a rounding', () => {
    // Without this the header tally (helped + hurt) is short of the table it
    // introduces — the count on screen stops matching the list under it.
    const v = buildTradingView([
        row('UP',   'resized', 100, 2),
        row('DOWN', 'resized', -100, -2),
        row('NIL',  'resized', 0, 0),
    ], null);
    assert.equal(v.tradedCount, 3);
    assert.equal(v.helped, 1);
    assert.equal(v.hurt, 1);
    assert.equal(v.unchanged, 1);
    assert.equal(v.helped + v.hurt + v.unchanged, v.tradedCount);
    assert.equal(v.rankedByDollars.length, v.tradedCount);
});

t('untouched still counts toward the total, because zero is its real effect', () => {
    const v = buildTradingView([
        row('A', 'untouched', 0, 0),
        row('C', 'resized', 100, 2),
    ], null);
    assert.equal(v.measuredCount, 2);
    assert.equal(v.totalUsd, 100);
});

// ── the two units ─────────────────────────────────────────────
t('the naive rate sum is published, and is not the book number', () => {
    // The whole argument for the dollar column. On the real book these sum to
    // -160.76pp against a book effect of -1.03pp.
    const v = buildTradingView([
        row('A', 'resized', 10, -50),
        row('B', 'exit',  -20, -110),
    ], { effectPp: -1.03, asOf: AS_OF });
    assert.equal(Math.round(v.naiveRateSumPp), -160);
    assert.equal(v.bookEffectPp, -1.03);
    assert.notEqual(Math.round(v.naiveRateSumPp), Math.round(v.bookEffectPp));
});

t('dollars sum exactly; that is what makes them the sort key', () => {
    const v = buildTradingView([
        row('A', 'exit', -4020.58, -7.2),
        row('B', 'resized', -12.91, -0.2),
        row('C', 'untouched', 0, 0),
    ], null);
    assert.equal(Math.round(v.totalUsd * 100) / 100, -4033.49);
});

t('sign disagreements are surfaced, not smoothed', () => {
    // TSM is +$372 and -6.7pp: the traded path deployed more capital, so it
    // made more money at a worse rate. Both true, different questions.
    const v = buildTradingView([
        row('TSM', 'resized', 372, -6.7),
        row('OK',  'resized', 100, 5),
    ], null);
    assert.deepEqual(v.disagreements.map(r => r.symbol), ['TSM']);
});

// ── kinds ─────────────────────────────────────────────────────
t('the by-kind rollup partitions the total', () => {
    const v = buildTradingView([
        row('E1', 'exit', -4000, -7),
        row('E2', 'exit', -20, -1),
        row('R1', 'resized', -13, -0.2),
        row('U1', 'untouched', 0, 0),
    ], null);
    const byKind = Object.fromEntries(v.byKind.map(k => [k.kind, k]));
    assert.equal(byKind.exit.count, 2);
    assert.equal(byKind.exit.usd, -4020);
    assert.equal(byKind.resized.usd, -13);
    assert.equal(byKind.untouched.usd, 0);
    assert.equal(byKind.exit.usd + byKind.resized.usd + byKind.untouched.usd, v.totalUsd);
});

t('every kind carries a plain-language read', () => {
    const v = buildTradingView([row('A', 'exit', -1, -1)], null);
    v.byKind.forEach(k => assert.ok(KIND_READ[k.kind] && k.read === KIND_READ[k.kind]));
});

// ── unmeasurable ──────────────────────────────────────────────
t('unmeasurable rows are counted apart and keep their reason', () => {
    const v = buildTradingView([
        row('OK', 'resized', 100, 2),
        Object.assign(row('DD', 'exit', null, null), {
            comparable: false, trading_effect_usd: null, trading_effect_pct: null,
            unmeasurable_reason: 'basis_mismatch',
            unmeasurable_detail: '9 of 10 fills price a different share basis',
        }),
    ], null);
    assert.equal(v.measuredCount, 1);
    assert.equal(v.unmeasurableCount, 1);
    assert.equal(v.unmeasurable[0].reason, 'basis_mismatch');
    assert.match(v.unmeasurable[0].detail, /different share basis/);
    // and it must not have leaked into the total
    assert.equal(v.totalUsd, 100);
});

// ── the alignment gate ────────────────────────────────────────
t('same date is aligned', () => {
    assert.equal(alignment(AS_OF, AS_OF).state, 'aligned');
});

t('a drill-down ahead of the tile says so', () => {
    // The nightly job missed a night; the live engine has moved on. This is
    // the mixed-basis case and it must be visible, not reconciled.
    const a = alignment('2026-08-29', '2026-08-28');
    assert.equal(a.state, 'drill_ahead');
    assert.match(a.reason, /live engine at 2026-08-29/);
    assert.match(a.reason, /last written for 2026-08-28/);
});

t('a drill-down behind the tile says so too', () => {
    assert.equal(alignment('2026-08-27', '2026-08-28').state, 'drill_behind');
});

t('a missing date is unknown, never assumed aligned', () => {
    assert.equal(alignment(null, AS_OF).state, 'unknown');
    assert.equal(alignment(AS_OF, null).state, 'unknown');
    assert.ok(alignment(null, null).reason.length > 0);
});

t('the view carries its own as_of and the alignment against the tile', () => {
    const v = buildTradingView([row('A', 'exit', -10, -1)], { asOf: AS_OF, effectPp: -1.03 });
    assert.equal(v.asOf, AS_OF);
    assert.equal(v.align.state, 'aligned');
});

// ── the one-line read ─────────────────────────────────────────
t('the verdict names the kind that dominates by magnitude', () => {
    const v = buildTradingView([
        row('E', 'exit', -4020, -7),
        row('R', 'resized', -13, -0.2),
    ], null);
    assert.match(tradingVerdict(v), /cost \$4033, almost all of it in exits/);
});

t('the verdict names the driver even when trading PAID', () => {
    // A "worst kind" reading would name the losing bucket on a winning book.
    const v = buildTradingView([
        row('R', 'resized', 5000, 20),
        row('E', 'exit', -100, -2),
    ], null);
    assert.match(tradingVerdict(v), /added \$4900, almost all of it in resizeds/);
});

t('a genuine wash is called a wash, not rounded to a direction', () => {
    const v = buildTradingView([row('A', 'resized', 0.4, 0.01)], null);
    assert.match(tradingVerdict(v), /wash/);
});

t('nothing measurable is said plainly', () => {
    assert.equal(tradingVerdict(buildTradingView([], null)), 'Nothing to decompose');
    assert.equal(tradingVerdict(null), 'Nothing to decompose');
});

t('today\'s real shape: exits carry the book, resizing is a wash', () => {
    const rows = [];
    for (let i = 0; i < 21; i++) rows.push(row('X' + i, 'exit', i === 0 ? -4000 : -0.98, -7));
    for (let i = 0; i < 42; i++) rows.push(row('R' + i, 'resized', -12.91 / 42, -0.2));
    for (let i = 0; i < 14; i++) rows.push(row('U' + i, 'untouched', 0, 0));
    const v = buildTradingView(rows, { asOf: AS_OF, effectPp: -1.03 });

    assert.equal(v.measuredCount, 77);
    assert.equal(v.untouchedCount, 14);
    const byKind = Object.fromEntries(v.byKind.map(k => [k.kind, k]));
    assert.equal(Math.round(byKind.exit.usd), -4020);
    assert.equal(Math.round(byKind.resized.usd), -13);
    assert.equal(byKind.untouched.usd, 0);
    assert.match(tradingVerdict(v), /exits/);
});

console.log('\n' + passed + '/' + passed + ' passed');
