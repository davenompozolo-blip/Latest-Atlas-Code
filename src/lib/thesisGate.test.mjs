// node src/lib/thesisGate.test.mjs

import assert from 'node:assert/strict';
import { thesisGate, thesisQuadrants, THESIS_STALE_DAYS } from './thesisGate.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }

const NOW = '2026-08-30';

t('the threshold is Bench\'s own 30 days', () => {
    // Diverging here would let Performance call a thesis fresh that the Bench
    // calls stale, about the same thesis, on the same day.
    assert.equal(THESIS_STALE_DAYS, 30);
});

// ── nothing to show ───────────────────────────────────────────
t('no thesis at all returns null, not an empty state', () => {
    assert.equal(thesisGate({ thesis_state: null }, NOW), null);
    assert.equal(thesisGate(null, NOW), null);
});

// ── already unjudged ──────────────────────────────────────────
t('untested is shown as untested and is NOT reported as gated', () => {
    // This is the state, not a downgrade of one. Every held thesis is here
    // today: 18 claims, all untested.
    const g = thesisGate({ thesis_state: 'untested', thesis_state_as_of: null }, NOW);
    assert.equal(g.display, 'untested');
    assert.equal(g.gated, false);
    assert.match(g.reason, /no claim on this thesis has been judged yet/);
});

t('pending is treated the same as untested', () => {
    assert.equal(thesisGate({ thesis_state: 'pending' }, NOW).display, 'untested');
});

// ── the gate ──────────────────────────────────────────────────
t('a fresh INTACT is shown as INTACT', () => {
    const g = thesisGate({ thesis_state: 'intact', thesis_state_as_of: '2026-08-20' }, NOW);
    assert.equal(g.display, 'intact');
    assert.equal(g.gated, false);
    assert.equal(g.ageDays, 10);
});

t('an INTACT past the threshold is downgraded, keeping what it said', () => {
    const g = thesisGate({ thesis_state: 'intact', thesis_state_as_of: '2026-06-17' }, NOW);
    assert.equal(g.display, 'untested');
    assert.equal(g.gated, true);
    assert.equal(g.lastState, 'intact');
    assert.match(g.reason, /was INTACT, last judged 74d ago/);
});

t('the boundary is inclusive — exactly 30 days is stale', () => {
    const at30 = thesisGate({ thesis_state: 'intact', thesis_state_as_of: '2026-07-31' }, NOW);
    const at29 = thesisGate({ thesis_state: 'intact', thesis_state_as_of: '2026-08-01' }, NOW);
    assert.equal(at30.ageDays, 30);
    assert.equal(at30.display, 'untested');
    assert.equal(at29.ageDays, 29);
    assert.equal(at29.display, 'intact');
});

t('an undated state is refused even though a state is recorded', () => {
    // bench_claims_status_stamp NULLs the date for unresolved claims and
    // stamps now() for resolved ones, so a missing date means no judgement
    // happened — not that a field was forgotten.
    const g = thesisGate({ thesis_state: 'intact', thesis_state_as_of: null }, NOW);
    assert.equal(g.display, 'untested');
    assert.equal(g.gated, true);
    assert.match(g.reason, /carries no date — never judged/);
});

t('an overdue review downgrades even a recently judged state', () => {
    // The claim named its own deadline; that beats the global threshold.
    const g = thesisGate({ thesis_state: 'intact', thesis_state_as_of: '2026-08-28', review_by: '2026-08-15' }, NOW);
    assert.equal(g.display, 'untested');
    assert.equal(g.gated, true);
    assert.match(g.reason, /review was due 2026-08-15/);
    assert.equal(g.ageDays, 2);   // recent, and still not to be relied on
});

t('a future review date does not downgrade anything', () => {
    // Every live claim is here: review dates run 2027-03 to 2027-09.
    const g = thesisGate({ thesis_state: 'intact', thesis_state_as_of: '2026-08-28', review_by: '2027-06-30' }, NOW);
    assert.equal(g.display, 'intact');
    assert.equal(g.gated, false);
});

t('downgrading is symmetric — a stale BROKEN is gated too', () => {
    const g = thesisGate({ thesis_state: 'broken', thesis_state_as_of: '2026-05-01' }, NOW);
    assert.equal(g.display, 'untested');
    assert.equal(g.lastState, 'broken');
    assert.match(g.reason, /was BROKEN/);
});

// ── the 2x2 ───────────────────────────────────────────────────
const card = (symbol, thesisState, asOf, edge, reviewBy) => ({
    symbol, thesisState, thesisAsOf: asOf, reviewBy,
    slot: { edge },
});

t('quadrants place on the GATED state, never the raw one', () => {
    const q = thesisQuadrants([
        card('A', 'intact', '2026-08-25', 12),    // fresh, winning
        card('B', 'intact', '2026-05-01', 12),    // STALE — must not count as holding
    ], NOW);
    assert.deepEqual(q.holdingWinning.map(c => c.symbol), ['A']);
    assert.deepEqual(q.notJudged.map(c => c.symbol), ['B']);
});

t('all four live quadrants fill', () => {
    const q = thesisQuadrants([
        card('HW', 'intact', '2026-08-25',  12),
        card('HL', 'intact', '2026-08-25', -12),
        card('BW', 'broken', '2026-08-25',  12),
        card('BL', 'broken', '2026-08-25', -12),
    ], NOW);
    assert.deepEqual(q.holdingWinning.map(c => c.symbol), ['HW']);
    assert.deepEqual(q.holdingLosing.map(c => c.symbol),  ['HL']);
    assert.deepEqual(q.brokenWinning.map(c => c.symbol),  ['BW']);
    assert.deepEqual(q.brokenLosing.map(c => c.symbol),   ['BL']);
});

t('bending counts as holding — under pressure is not falsified', () => {
    const q = thesisQuadrants([card('X', 'bending', '2026-08-25', 5)], NOW);
    assert.deepEqual(q.holdingWinning.map(c => c.symbol), ['X']);
});

t('no thesis and not-judged are separate buckets', () => {
    // Not knowing is not the same as knowing it is broken, and having no
    // thesis on the Bench is different again.
    const q = thesisQuadrants([
        card('NONE', null, null, 8),
        card('UNT', 'untested', null, 8),
    ], NOW);
    assert.deepEqual(q.noThesis.map(c => c.symbol), ['NONE']);
    assert.deepEqual(q.notJudged.map(c => c.symbol), ['UNT']);
    assert.equal(q.brokenLosing.length + q.brokenWinning.length, 0);
});

t('a card with no measurable edge cannot be placed', () => {
    const q = thesisQuadrants([card('K', 'intact', '2026-08-25', null)], NOW);
    assert.deepEqual(q.notJudged.map(c => c.symbol), ['K']);
});

t('today\'s real shape: 16 untested theses all land in notJudged', () => {
    const cards = ['ADBE','AMD','AMGN','AMZN','ANF','BKNG','CRWV','GILD','GS','JPM','KMI','MS','NEE','NKE','SNDK','XLE']
        .map((s, i) => card(s, 'untested', null, i - 8, '2027-06-30'));
    const q = thesisQuadrants(cards, NOW);
    assert.equal(q.notJudged.length, 16);
    assert.equal(q.holdingWinning.length + q.holdingLosing.length
               + q.brokenWinning.length + q.brokenLosing.length, 0);
});

console.log('\n' + passed + '/' + passed + ' passed');
