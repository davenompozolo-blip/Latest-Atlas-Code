// node src/lib/nexusReturnBasis.test.mjs

import assert from 'node:assert/strict';
import {
    BASIS_SINCE_ENTRY, BASIS_ON_COST, BASES, BASIS_LABEL, BASIS_READ,
    readReturn, readReturnTagged, partitionByBasis, bothBases,
} from './nexusReturnBasis.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }

// Real rows, measured 2026-09-05.
const SNDK = { symbol: 'SNDK', total_return_pct: 31.68, unrealised_return_pct: -4.01 };
const META = { symbol: 'META', total_return_pct: -6.22, unrealised_return_pct: 2.82 };
const TSM  = { symbol: 'TSM',  total_return_pct: 40.12, unrealised_return_pct: 12.40 };

// ── the two bases are distinct ────────────────────────────────
t('the two bases read different columns', () => {
    assert.equal(readReturn(SNDK, BASIS_SINCE_ENTRY), 31.68);
    assert.equal(readReturn(SNDK, BASIS_ON_COST), -4.01);
});

t('every basis has a label and a one-line read', () => {
    BASES.forEach(b => {
        assert.ok(BASIS_LABEL[b] && BASIS_LABEL[b].length);
        assert.ok(BASIS_READ[b] && BASIS_READ[b].length > 20);
    });
});

t('an unknown basis throws rather than guessing', () => {
    // A typo'd basis returning null would look exactly like an unmeasurable
    // position, which is the failure this module exists to prevent.
    assert.throws(() => readReturn(SNDK, 'total'), /unknown return basis/);
    assert.throws(() => readReturn(SNDK, undefined), /unknown return basis/);
});

// ── the rule: no substitution ─────────────────────────────────
t('a missing basis returns null and NEVER the other column', () => {
    // This is the whole point. Two call sites read `unrealised ?? total`,
    // producing a column that silently mixed both measures.
    const noCost = { symbol: 'X', total_return_pct: 40, unrealised_return_pct: null };
    assert.equal(readReturn(noCost, BASIS_ON_COST), null);
    assert.notEqual(readReturn(noCost, BASIS_ON_COST), 40);

    const noEntry = { symbol: 'Y', total_return_pct: null, unrealised_return_pct: -5 };
    assert.equal(readReturn(noEntry, BASIS_SINCE_ENTRY), null);
});

t('readReturn takes no fallback argument at all', () => {
    // Enforced by arity: a caller cannot pass a default even by accident.
    assert.equal(readReturn.length, 2);
});

t('a null row is null, not a throw', () => {
    assert.equal(readReturn(null, BASIS_ON_COST), null);
});

// ── tagged reads carry provenance ─────────────────────────────
t('a tagged read cannot be rendered without its basis', () => {
    const g = readReturnTagged(SNDK, BASIS_ON_COST);
    assert.equal(g.pct, -4.01);
    assert.equal(g.basis, BASIS_ON_COST);
    assert.equal(g.label, 'On cost');
    assert.equal(g.measured, true);
    assert.equal(g.reason, null);
});

t('an unmeasurable tagged read carries a reason, not a zero', () => {
    const g = readReturnTagged({ total_return_pct: 40, unrealised_return_pct: null }, BASIS_ON_COST);
    assert.equal(g.pct, null);
    assert.equal(g.measured, false);
    assert.match(g.reason, /on cost/);
});

// ── partitioning ──────────────────────────────────────────────
t('partition gives an honest denominator', () => {
    // "3 winners of 5 positions" is wrong when only 4 could be measured.
    const rows = [SNDK, META, TSM,
        { symbol: 'NOPE', total_return_pct: 5, unrealised_return_pct: null }];
    const p = partitionByBasis(rows, BASIS_ON_COST);
    assert.equal(p.measured.length, 3);
    assert.equal(p.unmeasured.length, 1);
    assert.equal(p.unmeasured[0].symbol, 'NOPE');
    assert.equal(p.basis, BASIS_ON_COST);
});

t('partitioning on the other basis moves different rows', () => {
    const rows = [{ symbol: 'A', total_return_pct: null, unrealised_return_pct: 3 }];
    assert.equal(partitionByBasis(rows, BASIS_SINCE_ENTRY).unmeasured.length, 1);
    assert.equal(partitionByBasis(rows, BASIS_ON_COST).measured.length, 1);
});

t('an empty or absent list partitions cleanly', () => {
    assert.equal(partitionByBasis([], BASIS_ON_COST).measured.length, 0);
    assert.equal(partitionByBasis(null, BASIS_ON_COST).unmeasured.length, 0);
});

// ── the sign split ────────────────────────────────────────────
t('a sign disagreement is detected, in both directions', () => {
    // SNDK: up since entry, down on cost — trimmed at a profit, rump underwater.
    const a = bothBases(SNDK);
    assert.equal(a.disagree, true);
    assert.equal(Math.round(a.gapPp * 100) / 100, 35.69);

    // META: the same split the other way round.
    const b = bothBases(META);
    assert.equal(b.disagree, true);
    assert.ok(b.gapPp < 0);
});

t('agreeing rows are not flagged', () => {
    assert.equal(bothBases(TSM).disagree, false);
});

t('a zero on either side is not a disagreement', () => {
    // sign(0) is 0, which differs from both +1 and -1; treating that as a
    // disagreement would flag every flat position.
    assert.equal(bothBases({ total_return_pct: 0, unrealised_return_pct: -4 }).disagree, false);
    assert.equal(bothBases({ total_return_pct: 5, unrealised_return_pct: 0 }).disagree, false);
});

t('a half-measured row is not a disagreement and has no gap', () => {
    const g = bothBases({ total_return_pct: 40, unrealised_return_pct: null });
    assert.equal(g.disagree, false);
    assert.equal(g.gapPp, null);
    assert.equal(g.sinceEntry, 40);
    assert.equal(g.onCost, null);
});

t('today\'s real shape: 8 of 61 disagree in sign', () => {
    const book = [
        { total_return_pct: 69.69, unrealised_return_pct: -5.93 },  // PBR
        { total_return_pct: 31.68, unrealised_return_pct: -4.01 },  // SNDK
        { total_return_pct: 20.73, unrealised_return_pct: -6.57 },  // MU
        { total_return_pct: 13.07, unrealised_return_pct: -11.79 }, // HAL
        { total_return_pct: 17.11, unrealised_return_pct: -6.77 },  // C
        { total_return_pct: 7.37,  unrealised_return_pct: -8.69 },  // AVGO
        { total_return_pct: -6.22, unrealised_return_pct: 2.82 },   // META
        { total_return_pct: 0.94,  unrealised_return_pct: -3.80 },  // PG
        { total_return_pct: 40.12, unrealised_return_pct: 12.40 },  // TSM, agrees
    ];
    assert.equal(book.filter(r => bothBases(r).disagree).length, 8);
});

console.log('\n' + passed + '/' + passed + ' passed');
