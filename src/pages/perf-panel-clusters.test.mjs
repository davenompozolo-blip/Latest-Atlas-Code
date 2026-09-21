// node src/pages/perf-panel-clusters.test.mjs
//
// Renders ClusterRankingView through the REAL component, not a harness that
// reproduces its markup -- what changed in H-2 is the wiring, and a harness
// mirroring the DOM verifies the CSS instead of the wiring. It also catches
// the class of fault `vite build` cannot see: a call inside a render is
// invisible to the bundler, and three display defects in this repo shipped
// past clean builds.

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';

const stub = (name) => new URL('./__fixtures__/stub-' + name + '.js', import.meta.url).href;
const loaderUrl = 'data:text/javascript,' + encodeURIComponent(`
const MAP = ${JSON.stringify({ './config.js': stub('config'), './components.js': stub('components') })};
export async function resolve(spec, ctx, next) {
  if (MAP[spec]) return { url: MAP[spec], shortCircuit: true };
  return next(spec, ctx);
}
`);
register(loaderUrl, import.meta.url);

const React = (await import('react')).default;
const { ClusterRankingView } = await import('./perf-panel-clusters.js');
const { shapeIdentity, byClusterId, NO_AXIS_TEXT } = await import('../lib/clusterIdentity.js');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }
const html = (el) => renderToStaticMarkup(el);
const text = (el) => html(el).replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/\s+/g, ' ');

function member(symbol, rank) {
    return {
        symbol: symbol, rank: rank, field: 13, ownPct: 12.5, medianPct: 8.0,
        selectionPct: 4.5, label: 'leader', avgIntraRho: 0.71,
        bestCorrelate: 'TSM', bestRho: 0.81, clusterId: 196,
    };
}

const view = {
    asOf: '2026-09-18', logicVersion: 'v3', ranksRecorded: true,
    eligibleCount: 3, noComparableCount: 1, totalCount: 4,
    clusters: [
        { clusterId: 196, heldCount: 2, members: [member('AMD', 1), member('TSM', 2)] },
        { clusterId: 151, heldCount: 1, members: [member('KMI', 1)] },
        { clusterId: 999, heldCount: 1, members: [member('ZZZ', 1)] },
    ],
    eligible: [], unmeasurable: [],
    noComparable: [{ symbol: 'KMTUY', peerBasis: 'book', status: 'not_measurable',
                     bestCorrelate: null, bestRho: null, label: null }],
};

// 196 is named and loads negatively on the dollar. 151 is fitted and NOTHING
// cleared |t| > 2. 999 has no identity row at all -- a night the job did not
// write. Three different absences, which must not render the same.
const identity = byClusterId([
    shapeIdentity({
        as_of_date: '2026-09-18', cluster_id: 196, cluster_size: 34, held_count: 2,
        composition_label: 'AI / accelerated compute', composition_basis: 'curated_theme',
        composition_coverage: 0.24, fit_status: 'measured', n_obs: 139, r_squared: 0.780297,
        beta_market: 0.81245581, t_market: 3.2199, market_significant: true,
        primary_axis: 'dollar', primary_axis_sign: -1, primary_axis_t: -6.4,
        primary_axis_beta: -0.0031, primary_axis_marginal: true,
        primary_axis_label: 'Dollar strength',
        primary_axis_positive_means: 'dollar strengthening; EEM/SPY, GLD/SPY and IWM/SPY falling',
        held_symbols: ['AMD', 'TSM'],
    }),
    shapeIdentity({
        as_of_date: '2026-09-18', cluster_id: 151, cluster_size: 2, held_count: 1,
        composition_label: 'Energy', composition_basis: 'curated_theme',
        composition_coverage: 0.5, fit_status: 'measured', n_obs: 139, r_squared: 0.029963,
        beta_market: 0.011625, t_market: 0.0625, market_significant: false,
        primary_axis: null, primary_axis_sign: null, primary_axis_t: null,
        primary_axis_beta: null, held_symbols: ['KMI'],
    }),
]);

const out = text(React.createElement(ClusterRankingView, { view: view, identity: identity }));

t('the cluster leads with its NAME, not with a bare partition id', () => {
    assert.match(out, /AI \/ ACCELERATED COMPUTE|AI \/ accelerated compute/);
    // The id survives as provenance -- it is the key every other layer joins
    // on -- but it is no longer the heading.
    assert.match(out, /#196/);
    assert.doesNotMatch(out, /RISK CLUSTER 196/);
});

t('the axis tag carries its DIRECTION, never the axis alone', () => {
    assert.match(out, /DOLLAR −/);
    assert.doesNotMatch(out, /DOLLAR(?! [+−])/);
});

t('the axis sentence is built from positive_means plus the sign', () => {
    assert.match(out, /Falls with dollar strengthening/);
});

t('a fitted cluster with no axis clearing the bar says so, and shows NO number', () => {
    assert.match(out, new RegExp(NO_AXIS_TEXT));
    // 151's own axis betas are all below the bar. None of them may appear --
    // printing 0.0005 asserts a small exposure, a different claim entirely.
    assert.doesNotMatch(out, /0\.0000|0\.0005/);
});

t('an insignificant market beta is withheld, a significant one is shown', () => {
    assert.match(out, /Beta to SPY 0\.81/);
    // 151's market beta is 0.0116 at t 0.06 -- not measured, so not printed.
    assert.doesNotMatch(out, /Beta to SPY 0\.01/);
});

t('the label states its basis and how much of the bucket it speaks for', () => {
    assert.match(out, /from curated theme, 24% of members/);
});

t('held count is stated against the bucket size, not as the bucket size', () => {
    assert.match(out, /2 held names of 34 in the bucket/);
});

t('a cluster with NO identity row falls back to the id and invents nothing', () => {
    // Cluster 999 has no row. It must still render, with the old heading and
    // no axis sentence -- a missing identity costs the name, never the
    // ranking table underneath it.
    assert.match(out, /RISK CLUSTER 999/);
    assert.match(out, /ZZZ/);
});

t('a name with no peer group still shows its NAMED bucket and axis', () => {
    // KMTUY is in the complement list with cluster_id 196 in this fixture:
    // no peer group to rank inside, but the bucket is named and has an axis.
    // Without this most of the book reads as unclassified, which is the
    // complaint H-2 answers -- the cards above cover only the eligible few.
    const withCluster = Object.assign({}, view, {
        noComparable: [{ symbol: 'KMTUY', peerBasis: 'book', status: 'measured',
                         bestCorrelate: null, bestRho: null, label: 'lagging',
                         clusterId: 196 }],
    });
    const o = text(React.createElement(ClusterRankingView,
        { view: withCluster, identity: identity }));
    assert.match(o, /Risk cluster/);
    assert.match(o, /KMTUY/);
    assert.match(o, /DOLLAR \u2212/);
});

t('the two kinds of missing bucket do not read the same', () => {
    const mixed = Object.assign({}, view, {
        noComparable: [
            { symbol: 'IXC', peerBasis: 'book', status: 'measured', bestCorrelate: null,
              bestRho: null, label: null, clusterId: null },
            { symbol: 'ZZZ', peerBasis: 'book', status: 'measured', bestCorrelate: null,
              bestRho: null, label: null, clusterId: 777 },
        ],
    });
    const o = text(React.createElement(ClusterRankingView,
        { view: mixed, identity: identity }));
    // Absent from the partition is a different fact from a night the job
    // did not write, and pooling them would hide a stopped feed.
    assert.match(o, /not in the partition/);
    assert.match(o, /no identity on file/);
});

t('the ranking table still renders beneath every card', () => {
    ['AMD', 'TSM', 'KMI'].forEach((s) => assert.match(out, new RegExp('\\b' + s + '\\b')));
    assert.match(out, /Peer median/);
});

t('the panel renders with NO identity map at all', () => {
    // The identity job is separate from the verdict job. A night it did not
    // write must cost the names and nothing else.
    const bare = text(React.createElement(ClusterRankingView, { view: view }));
    assert.match(bare, /RISK CLUSTER 196/);
    assert.match(bare, /AMD/);
    assert.doesNotMatch(bare, new RegExp(NO_AXIS_TEXT));
});

console.log(passed + '/' + passed + ' passed');
