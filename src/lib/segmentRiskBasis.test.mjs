// Defect 3 — the segment risk share is signed under the Euler basis.
//
// This file exists because the whole suite passed UNCHANGED when the risk
// measure was re-based from `weight x annual_vol` to the Euler MCTR. Every
// fixture in it carries a positive risk share, because under the old measure a
// negative one was impossible by construction — so none of them can tell a
// segment that CONSUMES risk from one that OFFSETS it.
//
// Every fixture below carries at least one negative share and one unmeasured
// segment, with values chosen so that the pre-fix reading changes the answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBetsView, effectiveBets } from './segmentView.js';
import { segmentReading } from './counterView.js';

// Shares chosen to mirror the live 2026-09-18 BY THEME cut: a dominant
// consumer, two genuine offsets, and one segment the correlation matrix
// cannot price at all.
function row(o) {
    return Object.assign({
        as_of: '2026-09-18', logic_version: 'v1:rho0.75:n5:mwr', grouping: 'theme',
        segment_kind: 'theme', member_count: 4, cf_status: 'measured',
        risk_basis: 'mctr_euler', risk_matrix_as_of: '2026-09-18',
    }, o);
}

const rows = [
    row({ segment_id: 't:ai',     segment_label: 'AI / accelerated compute', weight_share: 0.240, risk_share:  0.6471 }),
    row({ segment_id: 't:intl',   segment_label: 'International / EM ETFs',  weight_share: 0.103, risk_share:  0.1527 }),
    row({ segment_id: 't:health', segment_label: 'Healthcare / defensives',  weight_share: 0.103, risk_share: -0.0098 }),
    row({ segment_id: 't:saas',   segment_label: 'Software / SaaS',          weight_share: 0.025, risk_share: -0.0182 }),
    row({ segment_id: 't:energy', segment_label: 'Energy',                   weight_share: 0.044, risk_share: null,
          risk_basis: null, risk_matrix_as_of: null,
          risk_members_withheld: 1, risk_withheld_weight_pct: 37.06 }),
];

// ── the strip ────────────────────────────────────────────────

test('strip width is share of GROSS risk, not the signed share', () => {
    const v = buildBetsView(rows, 'theme');
    const byId = Object.fromEntries(v.strip.map(s => [s.id, s]));
    // Signed shares do not tile a whole once some are negative: the positives
    // here sum to 0.7998 while the total is 0.7718. Laying the band out on the
    // signed value makes the positive segments alone exceed the width.
    const gross = 0.6471 + 0.1527 + 0.0098 + 0.0182;
    assert.ok(Math.abs(byId['t:ai'].width - 0.6471 / gross) < 1e-9);
    assert.ok(Math.abs(byId['t:saas'].width - 0.0182 / gross) < 1e-9,
        'a negative segment gets POSITIVE width from its magnitude');
    // and the widths of the measured segments tile exactly one whole
    const total = v.strip.filter(s => s.measured).reduce((t, s) => t + s.width, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, 'the band is a genuine part-to-whole');
});

test('the signed share travels beside the width, so sign is never inferred from the bar', () => {
    const v = buildBetsView(rows, 'theme');
    const health = v.strip.find(s => s.id === 't:health');
    assert.equal(health.share, -0.0098);
    assert.equal(health.offsets, true);
    const ai = v.strip.find(s => s.id === 't:ai');
    assert.equal(ai.offsets, false);
});

test('an unmeasured segment gets NO width and is not drawn', () => {
    const v = buildBetsView(rows, 'theme');
    const energy = v.strip.find(s => s.id === 't:energy');
    assert.equal(energy.measured, false);
    assert.equal(energy.width, null, 'absent, not 0 — a renderer cannot draw what it was not handed');
    assert.equal(energy.share, null);
    assert.equal(energy.offsets, false, 'unmeasured is not the same claim as offsetting');
});

test('the view counts offsets and unmeasured segments so a caption can say so', () => {
    const v = buildBetsView(rows, 'theme');
    assert.equal(v.offsetCount, 2);
    assert.equal(v.unmeasuredCount, 1);
    assert.equal(v.riskBasis, 'mctr_euler');
});

// ── ordering ─────────────────────────────────────────────────

test('an unmeasured segment sorts LAST, not at zero', () => {
    const v = buildBetsView(rows, 'theme');
    const order = v.segments.map(s => s.segmentId);
    assert.deepEqual(order, ['t:ai', 't:intl', 't:health', 't:saas', 't:energy']);
    // The naive `(b.riskShare || 0) - (a.riskShare || 0)` puts the null at 0,
    // i.e. ABOVE both genuine offsets — claiming the unmeasured segment carries
    // more risk than the two that demonstrably reduce it.
    const naive = rows.slice().sort((a, b) => (b.risk_share || 0) - (a.risk_share || 0))
                      .map(r => r.segment_id);
    assert.notDeepEqual(naive, order, 'the fixture must discriminate against the naive sort');
    assert.equal(naive.indexOf('t:energy'), 2);
});

// ── effective bets ───────────────────────────────────────────

test('effectiveBets squares signed shares, so offsets reduce the count', () => {
    const v = buildBetsView(rows, 'theme');
    const eb = effectiveBets(v.segments);
    const sq = 0.6471 ** 2 + 0.1527 ** 2 + 0.0098 ** 2 + 0.0182 ** 2;
    assert.ok(Math.abs(eb - 1 / sq) < 1e-6);
    // Concentration, not diversification: a dominant consumer beside small
    // offsets is few effective bets.
    assert.ok(eb < 3, 'got ' + eb);
});

// ── the row shape ────────────────────────────────────────────

test('shape carries the basis, its matrix date and the coverage', () => {
    const v = buildBetsView(rows, 'theme');
    const energy = v.segments.find(s => s.segmentId === 't:energy');
    assert.equal(energy.riskBasis, null, 'no figure, so no basis — the biconditional');
    assert.equal(energy.riskMatrixAsOf, null);
    assert.equal(energy.riskWithheld, 1);
    assert.equal(energy.riskWithheldWeightPct, 37.06);
    const ai = v.segments.find(s => s.segmentId === 't:ai');
    assert.equal(ai.riskBasis, 'mctr_euler');
    assert.equal(ai.riskMatrixAsOf, '2026-09-18');
});

// ── the reading ──────────────────────────────────────────────

// segmentReading returns early unless at least one tile is measurable, so the
// fixtures carry two ordinary members; the clause under test is the SECOND
// sentence, which is about the segment rather than its members.
const tiles = [
    { label: 'holder', slot: { basis: 'book', rank: 4 } },
    { label: 'holder', slot: { basis: 'book', rank: 5 } },
];

test('a segment that lowers book risk is READ as lowering it', () => {
    const seg = { riskShare: -0.0098, weightShare: 0.103, excessPp: -2.1 };
    const r = segmentReading(tiles, seg);
    assert.match(r.text, /lowering its risk/);
    // The pre-fix code fell through to the `< weightShare * 0.5` branch —
    // true for ANY negative against a positive weight — and called a sleeve
    // that reduces book volatility "a fraction of its risk".
    assert.doesNotMatch(r.text, /fraction of its risk/);
});

test('a segment that is ahead AND lowering risk says both', () => {
    const r = segmentReading(tiles, { riskShare: -0.02, weightShare: 0.10, excessPp: 3.4 });
    assert.match(r.text, /ahead of the book without it AND lowering its risk/);
});

test('a positive-risk segment keeps its original reading', () => {
    const r = segmentReading(tiles, { riskShare: 0.30, weightShare: 0.10, excessPp: 2.0 });
    assert.match(r.text, /the question it raises is size, not selection/);
    const r2 = segmentReading(tiles, { riskShare: 0.02, weightShare: 0.10, excessPp: -1.0 });
    assert.match(r2.text, /fraction of its risk/);
});
