// node src/lib/counterView.test.mjs

import assert from 'node:assert/strict';
import { buildCounters, backFace, segmentReading, ACTION_FOR_REASON } from './counterView.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }

// Real position_verdicts rows, 2026-09-07, cluster 199. Stored as FRACTIONS.
const row = (o) => Object.assign({
    as_of: '2026-09-07', position_state: 'open', verdict_status: 'measured',
    allocation_effect_pct: null, conviction_at_entry: null, thesis_state: null,
}, o);

const AMD = row({
    symbol: 'AMD', peer_basis: 'cluster', cluster_eligible: true, cluster_size: 11,
    rank_in_cluster: 2, cf_median_return_pct: 0.296, cf_best_return_pct: 2.550,
    cf_best_symbol: 'SOXL', selection_effect_pct: 1.584, selection_effect_vol_adj: 1.774,
    verdict_label: 'leader', days_held: 186, capital_deployed_usd: 6880,
    thesis_state: 'untested',
});
const MU = row({
    symbol: 'MU', peer_basis: 'cluster', cluster_eligible: true, cluster_size: 15,
    rank_in_cluster: 1, cf_median_return_pct: -0.055, cf_best_return_pct: 0.016,
    cf_best_symbol: 'SNDK', selection_effect_pct: 0.168, selection_effect_vol_adj: 1.091,
    verdict_label: 'leader', days_held: 101, capital_deployed_usd: 6296,
});
const TSM = row({
    symbol: 'TSM', peer_basis: 'cluster', cluster_eligible: true, cluster_size: 14,
    rank_in_cluster: 9, cf_median_return_pct: 0.448, cf_best_return_pct: 1.464,
    cf_best_symbol: 'SOXL', selection_effect_pct: -0.089, selection_effect_vol_adj: -0.264,
    verdict_label: 'lagging', days_held: 249, capital_deployed_usd: 4876,
});
// The gate disagreement: inside cluster 199, but not cluster-eligible.
const MRVL = row({
    symbol: 'MRVL', peer_basis: 'book', cluster_eligible: false, cluster_size: 3,
    excess_vs_book_pct: -0.0029, cf_book_return_pct: 0.2514, position_mwr_pct: 0.2485,
    best_correlate_symbol: 'AMD', best_correlate_rho: 0.71,
    verdict_label: 'cut_candidate', suggested_reason_code: 'trim_concentration',
    days_held: 74, capital_deployed_usd: 2500,
});
const KMTUY = row({
    symbol: 'KMTUY', peer_basis: 'none', cluster_eligible: false,
    verdict_status: 'stale_mark', status_reason: 'price 176 days old',
    price_days_old: 176, verdict_label: null, days_held: 300, capital_deployed_usd: 3625,
});

// ── the two gates ─────────────────────────────────────────────
t('a cluster segment can hold a Tier 2 card — the two gates are separate', () => {
    // cluster_id puts MRVL in cluster 199; cluster_eligible keeps it off Tier 1.
    const { tiles } = buildCounters([AMD, MU, TSM, MRVL], ['AMD', 'MU', 'TSM', 'MRVL']);
    assert.equal(tiles.length, 4);
    const mrvl = tiles.find(t => t.symbol === 'MRVL');
    assert.equal(mrvl.slot.basis, 'book', 'MRVL must read TIER 2 inside a cluster segment');
    assert.equal(mrvl.clusterEligible, false);
    assert.equal(tiles.find(t => t.symbol === 'AMD').slot.basis, 'cluster');
});

t('the tier comes from peer_basis, never inferred from populated columns', () => {
    // MRVL carries a cluster_size of 3. Inferring the tier from that would
    // put it on Tier 1 with a median over two names.
    const { tiles } = buildCounters([MRVL], ['MRVL']);
    assert.equal(tiles[0].slot.basis, 'book');
});

// ── membership is never silently short ────────────────────────
t('a member with no verdict row is reported, not dropped', () => {
    const { tiles, missing } = buildCounters([AMD, MU], ['AMD', 'MU', 'GHOST']);
    assert.equal(tiles.length, 2);
    assert.deepEqual(missing, ['GHOST']);
});

t('a gated position renders with its reason rather than disappearing', () => {
    const { tiles } = buildCounters([AMD, KMTUY], ['AMD', 'KMTUY']);
    assert.equal(tiles.length, 2);
    const k = tiles.find(t => t.symbol === 'KMTUY');
    assert.equal(k.slot.basis, 'none');
    assert.equal(k.slot.reason, 'price too old to mark');
    // Sorted last, but present.
    assert.equal(tiles[tiles.length - 1].symbol, 'KMTUY');
});

// ── the back face ─────────────────────────────────────────────
t('the three-bar block is best peer, peer median, what you did — in that order', () => {
    const b = backFace(AMD, {});
    assert.deepEqual(b.bars.map(x => x.key), ['best', 'median', 'own']);
    assert.equal(b.bars[0].name, 'best peer');
    assert.equal(b.bars[2].name, 'what you did');
    // own = median + selection edge, both read as fractions and rendered as pp
    assert.equal(Math.round(b.bars[2].value * 10) / 10, 188.0);
    assert.equal(Math.round(b.bars[0].value * 10) / 10, 255.0);
});

t('the bars scale against each other, not against a global grid scale', () => {
    const b = backFace(AMD, {});
    const biggest = b.bars.reduce((m, x) => Math.max(m, Math.abs(x.value)), 0);
    const top = b.bars.find(x => Math.abs(x.value) === biggest);
    assert.equal(top.frac, 1);
    b.bars.forEach(x => assert.ok(x.frac >= 0 && x.frac <= 1));
});

t('a single-transaction position suppresses the three-bar block, with a reason', () => {
    const b = backFace(AMD, { singleTransaction: true });
    assert.equal(b.bars.length, 0);
    assert.equal(b.barsSuppressed, true);
    assert.match(b.barsSuppressedReason, /bought once and never traded/);
});

t('a Tier 2 back face compares against the book, not against absent peers', () => {
    const b = backFace(MRVL, {});
    assert.deepEqual(b.bars.map(x => x.name), ['book without it', 'what you did']);
    assert.equal(b.basis, 'book');
});

// ── the empty columns ─────────────────────────────────────────
t('Allocation says it was never computed rather than rendering blank or zero', () => {
    // allocation_effect_pct is 0 of 59 on the live table. The mockup shows it
    // filled; it cannot be.
    const b = backFace(AMD, {});
    const alloc = b.metrics.find(m => m.key === 'allocation');
    assert.equal(alloc.available, false);
    assert.equal(alloc.value, null);
    assert.match(alloc.absentReason, /never written/);
    // And a populated one is marked available, so the surface can tell them apart.
    assert.equal(b.metrics.find(m => m.key === 'selection').available, true);
});

t('a missing metric is never a zero', () => {
    const b = backFace(MU, {});
    b.metrics.forEach(m => {
        if (!m.available) assert.equal(m.value, null, m.key + ' must be null, not 0');
    });
});

t('conviction reports as not captured, and says whether it was recorded', () => {
    const b = backFace(AMD, {});
    assert.equal(b.conviction, 'not captured');
    assert.equal(b.convictionRecorded, false);
    assert.equal(b.thesis, 'untested');
    assert.equal(b.thesisRecorded, true, 'AMD carries an explicit untested state');
    assert.equal(backFace(MU, {}).thesisRecorded, false, 'MU has no state on file');
});

t('the action comes from the engine reason code, never re-derived from the label', () => {
    // switch_to_cluster_leader is gated on measured volatility upstream so
    // this layer cannot offer "switch to SOXL". Re-deriving would route
    // around that gate.
    assert.equal(backFace(MRVL, {}).action, ACTION_FOR_REASON.trim_concentration);
    assert.equal(backFace(AMD, {}).action, null, 'no reason code means no action');
});

// ── the header reading ────────────────────────────────────────
t('the reading is computed from counts, not the mockup string', () => {
    const { tiles } = buildCounters([AMD, MU, TSM, MRVL], ['AMD', 'MU', 'TSM', 'MRVL']);
    const seg = { excessPp: 47.24, riskShare: 0.4287, weightShare: 0.1932 };
    const r = segmentReading(tiles, seg);
    // Two leaders of four, and AMD #2 + MU #1 rank top-three.
    // Words throughout, not "two of 4" — mixing a word with a numeral in one
    // clause reads as a typo.
    assert.match(r.first, /^two of four are leaders and two rank top-three in their cluster\.$/);
    assert.match(r.text, /size, not selection/);
});

t('"All n are leaders" only when they all are', () => {
    const { tiles } = buildCounters([AMD, MU], ['AMD', 'MU']);
    const r = segmentReading(tiles, { excessPp: 47.24, riskShare: 0.43, weightShare: 0.19 });
    assert.match(r.first, /^All two are leaders/);
});

t('a segment behind the book on a fraction of its risk gets the hedge reading', () => {
    const bond = row({ symbol: 'SHY', peer_basis: 'book', excess_vs_book_pct: -0.27,
                       cf_book_return_pct: 0.25, verdict_label: 'holding_own',
                       days_held: 200, capital_deployed_usd: 1000 });
    const { tiles } = buildCounters([bond], ['SHY']);
    const r = segmentReading(tiles, { excessPp: -30.04, riskShare: 0.0012, weightShare: 0.0336 });
    assert.match(r.text, /which is what it was bought for/);
});

t('a segment with nothing measurable says so instead of reading empty', () => {
    const { tiles } = buildCounters([KMTUY], ['KMTUY']);
    const r = segmentReading(tiles, { excessPp: null, riskShare: 0.02, weightShare: 0.02 });
    assert.equal(r.text, 'No member of this segment can be measured today.');
});

t('the reading is deterministic', () => {
    const { tiles } = buildCounters([AMD, MU, TSM, MRVL], ['AMD', 'MU', 'TSM', 'MRVL']);
    const seg = { excessPp: 47.24, riskShare: 0.4287, weightShare: 0.1932 };
    assert.equal(segmentReading(tiles, seg).text, segmentReading(tiles, seg).text);
});

console.log('\n' + passed + '/' + passed + ' passed');
