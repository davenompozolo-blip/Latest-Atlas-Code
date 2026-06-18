// Drift transforms — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDriftRows, driftSummary, themeDrift, concentrationPosture, driftRead } from './nexusDriftCompute.js';

const holdings = [
    { tk: 'NVDA', theme: 'Technology', conviction: 80, currentWeightPct: 9.0, targetWeightPct: 6.0, objectId: 'o1' },
    { tk: 'AMD',  theme: 'Technology', conviction: 55, currentWeightPct: 2.0, targetWeightPct: 4.0, objectId: 'o2' },
    { tk: 'KO',   theme: 'Staples',    conviction: 40, currentWeightPct: 3.05, targetWeightPct: 3.0, objectId: 'o3' }, // on target (within band)
    { tk: 'XOM',  theme: 'Energy',     conviction: 30, currentWeightPct: 1.0, targetWeightPct: 2.0, objectId: 'o4' },
    { tk: 'PENDING', theme: 'X', conviction: null, currentWeightPct: 1.0, targetWeightPct: null }, // no target → excluded
];

test('buildDriftRows: drift = current − target, sorted by magnitude, excludes no-target', () => {
    const rows = buildDriftRows(holdings);
    assert.equal(rows.length, 4);            // PENDING excluded
    assert.equal(rows[0].tk, 'NVDA');        // |+3| largest
    assert.equal(rows[0].driftPpt, 3);
    assert.equal(rows[0].side, 'trim');
    const amd = rows.find(r => r.tk === 'AMD');
    assert.equal(amd.driftPpt, -2);
    assert.equal(amd.side, 'add');
    const ko = rows.find(r => r.tk === 'KO');
    assert.equal(ko.side, 'on');             // within the 0.25ppt dead-band
});

test('buildDriftRows excludes OCC option contracts (hedges, not core)', () => {
    const withOpt = holdings.concat([{ tk: 'XLK260618P00191000', theme: 'Technology', conviction: 50, currentWeightPct: 0.1, targetWeightPct: 2.3 }]);
    const rows = buildDriftRows(withOpt);
    assert.ok(!rows.some(r => r.tk === 'XLK260618P00191000'));
});

test('driftSummary: turnover, clearest trim/add', () => {
    const s = driftSummary(buildDriftRows(holdings));
    assert.equal(s.valued, 4);
    assert.equal(s.topTrim.tk, 'NVDA');
    assert.equal(s.topAdd.tk, 'AMD');         // −2 is the deepest underweight
    // turnover = Σ off-target overweights = NVDA +3 (KO is within the dead-band)
    assert.equal(s.turnoverPct, 3);
    assert.equal(s.nMaterial, 3);             // NVDA, AMD, XOM all ≥1ppt; KO not
});

test('themeDrift aggregates by theme', () => {
    const td = themeDrift(holdings);
    const tech = td.find(t => t.theme === 'Technology');
    assert.equal(tech.currentPct, 11);        // 9 + 2
    assert.equal(tech.targetPct, 10);         // 6 + 4
    assert.equal(tech.driftPpt, 1);
    assert.equal(td[0].theme, 'Technology');  // largest abs drift
});

test('concentrationPosture flags top-heavy when effN << nomN', () => {
    assert.equal(concentrationPosture({ effectiveN: 12, nominalN: 30 }).concentrated, true);  // 12 < 18
    assert.equal(concentrationPosture({ effectiveN: 25, nominalN: 30 }).concentrated, false);
    assert.equal(concentrationPosture({}).concentrated, false);
});

test('driftRead names the trim + add, cites concentration when top-heavy', () => {
    const s = driftSummary(buildDriftRows(holdings));
    const r = driftRead(s, { effectiveN: 12, nominalN: 30 });
    assert.equal(r.trimTk, 'NVDA');
    assert.equal(r.addTk, 'AMD');
    assert.match(r.text, /trim NVDA/);
    assert.match(r.text, /add to AMD/);
    assert.match(r.text, /top-heavy/);
});

test('driftRead degrades when on target', () => {
    const onTarget = [{ tk: 'A', currentWeightPct: 5, targetWeightPct: 5, conviction: 50 }];
    const r = driftRead(driftSummary(buildDriftRows(onTarget)), {});
    assert.equal(r.trimTk, null);
    assert.match(r.text, /sits on its conviction targets/);
});
