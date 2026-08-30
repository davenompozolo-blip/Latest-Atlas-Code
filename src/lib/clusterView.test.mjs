// node src/lib/clusterView.test.mjs
//
// Fixtures are real rows from position_verdicts as_of 2026-08-28, trimmed to
// the columns the view reads. The numbers below were checked against
// mv_position_tier1 before being frozen here.

import assert from 'node:assert/strict';
import {
    buildClusterView, ownPeriodReturn, sortMembers, hasCloseComparable,
} from './clusterView.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }

const R = (o) => Object.assign({
    as_of: '2026-08-28', logic_version: 'v1:rho0.75:n5:mwr',
    peer_basis: 'cluster', verdict_status: 'measured', verdict_label: 'holding_own',
    cluster_id: 195, cluster_size: 12, avg_intra_rho: 0.802, cluster_dispersion: 0.8437,
    rank_in_cluster: null, cf_median_return_pct: null, selection_effect_pct: null,
    cf_best_symbol: null, regret_vs_best_pct: null,
    best_correlate_symbol: null, best_correlate_rho: null,
}, o);

// Real AMD row. Note position_mwr_pct is +721.94% ANNUALISED; the period
// figure the cluster median is comparable to is +180.96%.
const AMD  = R({ symbol:'AMD',  cluster_id:195, cluster_size:12, cf_median_return_pct:0.3614,
                 selection_effect_pct:1.4482, cf_best_symbol:'SOXL', regret_vs_best_pct:-0.8136,
                 verdict_label:'leader', best_correlate_symbol:'DFEV', best_correlate_rho:0.761 });
const ASML = R({ symbol:'ASML', cluster_id:195, cluster_size:17, cf_median_return_pct:0.4816,
                 selection_effect_pct:0.1923, cf_best_symbol:'SOXL', regret_vs_best_pct:-1.2836,
                 verdict_label:'leader', best_correlate_symbol:'TSM', best_correlate_rho:0.765 });
const MRVL = R({ symbol:'MRVL', cluster_id:195, cluster_size:7, cf_median_return_pct:-0.1430,
                 selection_effect_pct:-0.1519, cf_best_symbol:'XLK', regret_vs_best_pct:-0.2761,
                 verdict_label:'lagging', best_correlate_symbol:'EWY', best_correlate_rho:0.729 });
// Cluster-eligible, but its best correlate INSIDE THE BOOK is only 0.447.
const ADBE = R({ symbol:'ADBE', cluster_id:185, cluster_size:7, cf_median_return_pct:0.1078,
                 selection_effect_pct:0.0113, cf_best_symbol:'CRM', regret_vs_best_pct:-0.1856,
                 best_correlate_symbol:'NKE', best_correlate_rho:0.447 });
const BOOKY = R({ symbol:'PBR', peer_basis:'book', cluster_id:null, cluster_size:null,
                  cf_median_return_pct:null, selection_effect_pct:null,
                  best_correlate_symbol:'XLE', best_correlate_rho:0.41 });
const KMTUY = R({ symbol:'KMTUY', peer_basis:'none', verdict_status:'stale_mark',
                  verdict_label:null, cluster_id:null, cluster_size:null,
                  cf_median_return_pct:null, selection_effect_pct:null,
                  best_correlate_symbol:null, best_correlate_rho:null });

// ── the basis trap ────────────────────────────────────────────
t('own return is derived on the PERIOD basis, exactly', () => {
    // 36.14 + 144.82 = 180.96, which is mv_position_tier1.own_return for AMD.
    // The stored position_mwr_pct is 721.94 — annualised, and not comparable
    // to a period-basis cluster median.
    assert.equal(Math.round(ownPeriodReturn(AMD) * 100) / 100, 180.96);
});

t('own return is null when either leg is missing, never half-derived', () => {
    assert.equal(ownPeriodReturn(BOOKY), null);
    assert.equal(ownPeriodReturn(R({ symbol:'X', cf_median_return_pct:0.1, selection_effect_pct:null })), null);
});

// ── sorting ───────────────────────────────────────────────────
t('members sort by selection effect, not by regret', () => {
    // By regret, MRVL (-27.61pp) would beat AMD (-81.36pp) and ASML
    // (-128.36pp) — ranking the book by how levered SOXL is.
    const out = sortMembers([MRVL, AMD, ASML].map((r) => ({
        symbol: r.symbol,
        selPp: r.selection_effect_pct * 100,
        regretPp: r.regret_vs_best_pct * 100,
    })));
    assert.deepEqual(out.map((m) => m.symbol), ['AMD', 'ASML', 'MRVL']);
});

t('rows with no score sort last, not first', () => {
    const out = sortMembers([{ symbol:'Z', selPp:null }, { symbol:'A', selPp:-50 }]);
    assert.deepEqual(out.map((m) => m.symbol), ['A', 'Z']);
});

// ── grouping ──────────────────────────────────────────────────
t('groups by the partition, and the field size stays per row', () => {
    const v = buildClusterView([AMD, ASML, MRVL, ADBE]);
    const big = v.clusters.find((c) => c.clusterId === 195);
    assert.equal(big.heldCount, 3);
    // Same displayed group, different peer-set sizes — the two cluster
    // objects are not the same object.
    assert.deepEqual(big.members.map((m) => m.symbol + ' #of' + m.field),
                     ['AMD #of13', 'ASML #of18', 'MRVL #of8']);
});

t('a cluster holding one name is a group, not an error', () => {
    const v = buildClusterView([AMD, ADBE]);
    assert.equal(v.clusters.length, 2);
    assert.equal(v.clusters.find((c) => c.clusterId === 185).heldCount, 1);
});

t('bigger groups come first', () => {
    const v = buildClusterView([ADBE, AMD, ASML]);
    assert.deepEqual(v.clusters.map((c) => c.clusterId), [195, 185]);
});

// ── the complement ────────────────────────────────────────────
t('no-close-comparable is scoped to the open book, at 0.65', () => {
    assert.equal(hasCloseComparable(AMD), true);    // 0.761
    assert.equal(hasCloseComparable(ADBE), false);  // 0.447
    assert.equal(hasCloseComparable(KMTUY), false); // no rho at all
});

t('a position can be cluster-eligible AND have no close comparable', () => {
    // Opposite scoping on purpose: the peer set is drawn from the whole
    // matrix, the differentiation question from the book. ADBE is both.
    const v = buildClusterView([AMD, ADBE, BOOKY, KMTUY]);
    assert.ok(v.eligible.some((m) => m.symbol === 'ADBE'));
    assert.ok(v.noComparable.some((m) => m.symbol === 'ADBE'));
});

t('unmeasurable is kept apart from no-comparable', () => {
    const v = buildClusterView([AMD, BOOKY, KMTUY]);
    assert.deepEqual(v.unmeasurable.map((m) => m.symbol), ['KMTUY']);
    // KMTUY appears in both counts, which is correct — it has no comparable
    // AND cannot be measured — but the two lists mean different things.
    assert.deepEqual(v.noComparable.map((m) => m.symbol).sort(), ['KMTUY', 'PBR']);
});

t('the tier is read from peer_basis, never inferred from cluster_id', () => {
    // A Tier 2 row can carry a cluster_id: the partition assigns every name a
    // bucket whether or not its neighbourhood was large enough to rank in.
    // JPM, AVGO, KMI, BKNG and XLRE are all like this on 2026-08-28, and
    // inferring the basis from the id labelled all five "cluster".
    const JPM = R({ symbol:'JPM', peer_basis:'book', cluster_id:170, cluster_size:1,
                    cf_median_return_pct:-0.004472, selection_effect_pct:null,
                    best_correlate_symbol:'MS', best_correlate_rho:0.6481 });
    const v = buildClusterView([AMD, JPM]);
    const jpm = v.noComparable.find((m) => m.symbol === 'JPM');
    assert.equal(jpm.peerBasis, 'book');
    assert.equal(jpm.clusterId, 170);      // present, and not the tier
    // …and it must not have been swept into the cluster groups.
    assert.equal(v.eligibleCount, 1);
    assert.deepEqual(v.clusters.map((c) => c.clusterId), [195]);
});

// ── the ranking gate ──────────────────────────────────────────
t('a night with no ranks recorded says so rather than inventing an order', () => {
    const v = buildClusterView([AMD, ASML]);
    assert.equal(v.ranksRecorded, false);
    assert.equal(v.clusters[0].members[0].rank, null);
});

t('a night with ranks reports them', () => {
    const v = buildClusterView([R(Object.assign({}, AMD, { rank_in_cluster: 3 }))]);
    assert.equal(v.ranksRecorded, true);
    assert.equal(v.clusters[0].members[0].rank, 3);
});

// ── shape ─────────────────────────────────────────────────────
t('an empty night yields an empty surface, not a crash', () => {
    const v = buildClusterView([]);
    assert.equal(v.eligibleCount, 0);
    assert.deepEqual(v.clusters, []);
    assert.equal(v.asOf, null);
});

t('counts and as_of come from the rows', () => {
    const v = buildClusterView([AMD, ASML, MRVL, ADBE, BOOKY, KMTUY]);
    assert.equal(v.asOf, '2026-08-28');
    assert.equal(v.totalCount, 6);
    assert.equal(v.eligibleCount, 4);
    assert.equal(v.noComparableCount, 3); // ADBE, PBR, KMTUY
});

console.log('\n' + passed + '/' + passed + ' passed');
