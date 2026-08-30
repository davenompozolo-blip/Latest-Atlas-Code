// node src/lib/verdictCard.test.mjs
//
// Fixtures are real rows from position_verdicts as_of 2026-08-28.

import assert from 'node:assert/strict';
import {
    tierSlot, toCard, buildVerdictCards, barScale, barGeometry,
} from './verdictCard.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }

const base = {
    as_of: '2026-08-28', logic_version: 'v1:rho0.75:n5:mwr',
    position_state: 'open', side: 'long', verdict_status: 'measured',
    days_held: 242, capital_deployed_usd: 5000, evidence_staleness_days: 0,
    thesis_state: null, thesis_state_as_of: null,
};

// Tier 1. own = 36.14 + 144.82 = 180.96; position_mwr_pct is 721.94 ANNUALISED.
const AMD = { ...base, symbol: 'AMD', peer_basis: 'cluster', verdict_label: 'leader',
    cluster_size: 12, avg_intra_rho: 0.8021, cluster_dispersion: 0.8437, rank_in_cluster: 3,
    cf_median_return_pct: 0.361364, selection_effect_pct: 1.448250,
    cf_best_symbol: 'SOXL', regret_vs_best_pct: -0.813607,
    best_correlate_symbol: 'DFEV', best_correlate_rho: 0.7613 };

// Tier 2. own = 21.34 + 66.33 = 87.67; position_mwr_pct is 158.43 ANNUALISED.
const GILD = { ...base, symbol: 'GILD', peer_basis: 'book', verdict_label: 'leader',
    cf_book_return_pct: 0.2134, excess_vs_book_pct: 0.6633,
    best_correlate_symbol: 'BMY', best_correlate_rho: 0.5690 };

const MRVL = { ...base, symbol: 'MRVL', peer_basis: 'cluster', verdict_label: 'lagging',
    cluster_size: 7, avg_intra_rho: 0.7812, cluster_dispersion: 0.2021, rank_in_cluster: 6,
    cf_median_return_pct: -0.142984, selection_effect_pct: -0.151895,
    cf_best_symbol: 'XLK', regret_vs_best_pct: -0.276101,
    best_correlate_symbol: 'EWY', best_correlate_rho: 0.7287 };

const KMTUY = { ...base, symbol: 'KMTUY', peer_basis: 'none', verdict_status: 'stale_mark',
    verdict_label: null, price_days_old: 168, days_held: 300 };

// ── the basis trap ────────────────────────────────────────────
t('Tier 1 own return is derived against the cluster median, exactly', () => {
    const s = tierSlot(AMD);
    assert.equal(s.basis, 'cluster');
    assert.equal(Math.round(s.own * 100) / 100, 180.96);
    assert.equal(Math.round(s.reference * 100) / 100, 36.14);
    assert.equal(Math.round(s.edge * 100) / 100, 144.83);
});

t('Tier 2 own return is derived against the rest of the book, exactly', () => {
    const s = tierSlot(GILD);
    assert.equal(s.basis, 'book');
    assert.equal(Math.round(s.own * 100) / 100, 87.67);
    assert.equal(Math.round(s.reference * 100) / 100, 21.34);
    assert.equal(Math.round(s.edge * 100) / 100, 66.33);
});

t('neither tier ever reads the annualised column', () => {
    // If position_mwr_pct leaked in, AMD would read 721.94 and GILD 158.43.
    const withAnnualised = { ...AMD, position_mwr_pct: 7.2194 };
    assert.equal(Math.round(tierSlot(withAnnualised).own * 100) / 100, 180.96);
});

t('own is null when either leg is missing, never half-derived', () => {
    assert.equal(tierSlot({ ...AMD, cf_median_return_pct: null }).own, null);
    assert.equal(tierSlot({ ...GILD, excess_vs_book_pct: null }).own, null);
});

// ── the slot ──────────────────────────────────────────────────
t('the slot names its basis on every card', () => {
    assert.equal(tierSlot(AMD).label, 'vs cluster median');
    assert.equal(tierSlot(GILD).label, 'vs rest of book');
});

t('Tier 2 states WHY it is on Tier 2', () => {
    // "no cluster shown" becomes a measurement rather than an omission.
    assert.match(tierSlot(GILD).detail, /closest held name BMY at ρ 0\.57/);
    assert.match(tierSlot({ ...GILD, best_correlate_rho: null }).detail, /no correlate measured/);
});

t('Tier 1 states the peer count that earned it the tier', () => {
    assert.match(tierSlot(AMD).detail, /12 peers at ρ ≥ 0\.75/);
    assert.equal(tierSlot(AMD).field, 13);   // peers + the position itself
});

t('the basis is read from peer_basis, not from populated columns', () => {
    // A Tier 2 row carrying a cluster_id must not render as Tier 1.
    const jpm = { ...base, symbol: 'JPM', peer_basis: 'book', cluster_id: 170,
                  cluster_size: 1, cf_median_return_pct: -0.004472,
                  cf_book_return_pct: 0.21, excess_vs_book_pct: -0.05,
                  best_correlate_symbol: 'MS', best_correlate_rho: 0.6481 };
    assert.equal(tierSlot(jpm).basis, 'book');
});

t('an unmeasurable position gets the reason, not an empty slot', () => {
    const s = tierSlot(KMTUY);
    assert.equal(s.basis, 'none');
    assert.equal(s.reason, 'price too old to mark');
    assert.equal(s.staleDays, 168);
    assert.equal(s.own, undefined);
});

t('regret is carried but is not the edge', () => {
    const s = tierSlot(AMD);
    assert.equal(Math.round(s.regret), -81);
    assert.notEqual(s.edge, s.regret);
});

// ── the bar ───────────────────────────────────────────────────
t('the scale is one shared scale, anchored off the extreme', () => {
    const cards = buildVerdictCards([AMD, GILD, MRVL]).cards;
    const s = barScale(cards);
    // AMD at +144.83pp is 2x the next; the p90 anchor keeps the others visible.
    assert.ok(s < 144.83, 'scale should not be pinned to the maximum');
    assert.ok(s > 0);
});

t('a bar past the anchor is clipped and says so', () => {
    const g = barGeometry(144.83, 66.33);
    assert.equal(g.frac, 1);
    assert.equal(g.clipped, true);
    const inRange = barGeometry(20, 66.33);
    assert.ok(inRange.frac > 0 && inRange.frac < 1);
    assert.equal(inRange.clipped, false);
});

t('a missing edge draws no bar rather than a zero-length one at centre', () => {
    assert.deepEqual(barGeometry(null, 50), { frac: 0, clipped: false });
});

// ── the set ───────────────────────────────────────────────────
t('cards sort by their own tier score, unmeasurable last', () => {
    const v = buildVerdictCards([MRVL, KMTUY, GILD, AMD]);
    assert.deepEqual(v.cards.map((c) => c.symbol), ['AMD', 'GILD', 'MRVL', 'KMTUY']);
});

t('the tier mix is counted', () => {
    const v = buildVerdictCards([AMD, GILD, MRVL, KMTUY]);
    assert.deepEqual(v.counts, { cluster: 2, book: 1, none: 1 });
});

t('an empty night yields an empty set, not a crash', () => {
    const v = buildVerdictCards([]);
    assert.deepEqual(v.cards, []);
    assert.equal(v.asOf, null);
});

t('thesis_state is carried through for §5.2 and is null today', () => {
    assert.equal(toCard(AMD).thesisState, null);
    assert.equal(toCard({ ...AMD, thesis_state: 'INTACT', thesis_state_as_of: '2026-07-01T00:00:00Z' }).thesisAsOf,
                 '2026-07-01');
});

console.log('\n' + passed + '/' + passed + ' passed');
