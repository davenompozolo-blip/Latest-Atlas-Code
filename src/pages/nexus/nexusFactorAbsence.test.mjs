// MP-2 follow-up: an unmeasured factor-risk contribution is ABSENT, not 0%.
//
// `var_contribution_pct` is book-level analytics. On a non-default account it
// is withheld for EVERY name (the analytics describe the default book only),
// and on any account it is absent for a name bought since the nightly refresh.
// buildConcentration used to read that absence as 0: the Flagship said
// "Industrials carries 0% of factor risk" and ranked a "fragility cluster" on
// a column of zeros -- an arbitrary four names published as a finding. Seen
// live on Atlas Secondary on its first day.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConcentration, buildRead } from './nexusLiveCompute.js';

const row = (symbol, sector, weight, varc) =>
    ({ symbol, sector, weight_pct: weight, var_contribution_pct: varc });

// The Secondary shape: weights live, every factor contribution withheld.
const UNMEASURED = [
    row('BE', 'Industrials', 8, null), row('NVT', 'Industrials', 7, null),
    row('CAT', 'Industrials', 6, null), row('AMD', 'Technology', 5, null),
    row('PFE', 'Healthcare', 4, null),
];

test('nothing measured: factor share and fragility cluster are ABSENT, never 0 / an arbitrary list', () => {
    const c = buildConcentration(UNMEASURED);
    assert.equal('topFactorPct' in c, false, 'a 0% here reads as a measurement');
    assert.equal('fragilityCluster' in c, false, 'a cluster ranked on zeros is arbitrary');
    assert.equal(c.factorMeasuredN, 0);
    assert.match(c.note, /not measured/);
    assert.doesNotMatch(c.note, /0% of factor risk/);
    // Effective N is weight-based and stays a real reading.
    assert.equal(c.nominalN, 5);
    assert.ok(c.effectiveN > 1);
});

test('partly measured: shares come from measured names only, and the note says how many', () => {
    const rows = [
        row('BE', 'Industrials', 8, 1.0), row('NVT', 'Industrials', 7, null),
        row('AMD', 'Technology', 5, 3.0),
    ];
    const c = buildConcentration(rows);
    assert.equal(c.topFactorPct, 75);                 // 3.0 / (1.0 + 3.0), NOT diluted by the null
    assert.deepEqual(c.fragilityCluster, ['AMD']);
    assert.match(c.note, /2 of 3 names measured/);
});

test('fully measured: unchanged behaviour', () => {
    const rows = [row('A', 'Tech', 5, 2), row('B', 'Tech', 5, 1), row('C', 'Energy', 5, 1)];
    const c = buildConcentration(rows);
    assert.equal(c.topFactorPct, 75);
    assert.deepEqual(c.fragilityCluster, ['A', 'B']);
    assert.doesNotMatch(c.note, /measured\)/);
});

const MACRO = {
    yields: { dgs2: [{ value: 4.70 }, { value: 4.71 }], dgs10: [{ value: 4.95 }, { value: 4.96 }] },
    volatility: { vix: [{ value: 14.0 }, { value: 14.2 }] },
};

test('The Read never quotes a factor share it does not have', () => {
    const concentration = buildConcentration(UNMEASURED);
    const holdings = UNMEASURED.map(r => ({ tk: r.symbol, read: 'hold' }));
    const spine = [{ label: 'Industrials', sharePct: 21 }];
    const read = buildRead({ macro: MACRO, concentration, holdings, spine });
    assert.ok(read, 'read still renders on the measurable parts');
    const text = JSON.stringify(read);
    assert.doesNotMatch(text, /0% of factor risk/);
    assert.doesNotMatch(text, /undefined/);
    assert.match(text, /factor risk not measured/);
});
