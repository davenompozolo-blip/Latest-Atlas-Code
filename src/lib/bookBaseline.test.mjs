// node src/lib/bookBaseline.test.mjs
//
// The staleness gate is the part worth testing: it is the difference between
// publishing a description of the book on screen and publishing a description
// of the book as it was some unstated number of nights ago.

import assert from 'node:assert/strict';
import {
    sessionsBehind, readBookBaseline, baselineVerdict, STALE_AFTER_SESSIONS,
} from './bookBaseline.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }

// A weekday NAV calendar: Thu, Fri, Mon (the weekend simply has no sessions).
const NAV = [
    { price_date: '2026-08-27' },
    { price_date: '2026-08-28' },
    { price_date: '2026-08-31' },
];

const ROW = {
    as_of: '2026-08-28',
    logic_version: 'v1:rho0.75:n5:mwr',
    traded_book_return_pct: 0.1130,
    frozen_book_return_pct: 0.1240,
    trading_effect_pct: -0.0110,
};

// ── sessionsBehind ────────────────────────────────────────────
t('a row dated on the last session is 0 behind', () => {
    assert.equal(sessionsBehind('2026-08-31', NAV), 0);
});

t('the weekend does not age a Friday row — Friday is still the last session', () => {
    // This is the whole reason the anchor is the NAV series and not the clock.
    // Against wall time a Friday row is ~60h old on a Sunday; in sessions it
    // is 0 behind, because no session has closed since.
    const fridayOnly = NAV.slice(0, 2);
    assert.equal(sessionsBehind('2026-08-28', fridayOnly), 0);
});

t('one session behind is the ordinary intraday state', () => {
    assert.equal(sessionsBehind('2026-08-28', NAV), 1);
});

t('two sessions behind means a night was missed', () => {
    assert.equal(sessionsBehind('2026-08-27', NAV), 2);
});

t('no series returns null, never 0 — absence of an anchor is not freshness', () => {
    assert.equal(sessionsBehind('2026-08-28', []), null);
    assert.equal(sessionsBehind('2026-08-28', null), null);
    assert.equal(sessionsBehind(null, NAV), null);
});

t('a timestamp is truncated to its day', () => {
    assert.equal(sessionsBehind('2026-08-28T23:37:00Z', NAV), 1);
});

// ── readBookBaseline ──────────────────────────────────────────
t('a current row is measured and converted to display units', () => {
    const b = readBookBaseline(ROW, NAV.slice(0, 2));
    assert.equal(b.status, 'measured');
    assert.equal(Math.round(b.effectPp * 100) / 100, -1.10);
    assert.equal(Math.round(b.tradedPct * 100) / 100, 11.30);
    assert.equal(Math.round(b.frozenPct * 100) / 100, 12.40);
    assert.equal(b.asOf, '2026-08-28');
    assert.equal(b.behind, 0);
});

t('a row two sessions behind is refused as current but keeps its numbers', () => {
    const b = readBookBaseline({ ...ROW, as_of: '2026-08-27' }, NAV);
    assert.equal(b.status, 'stale');
    assert.equal(b.behind, STALE_AFTER_SESSIONS);
    assert.match(b.reason, /2 sessions ago \(2026-08-27\)/);
    // Kept, so a drill-down can still say what was last computed and when.
    assert.ok(b.effectPp != null);
});

t('no row at all is absent, not zero', () => {
    const b = readBookBaseline(null, NAV);
    assert.equal(b.status, 'absent');
    assert.equal(b.effectPp, null);
});

t('a row with a null effect is absent, not a 0.00pp result', () => {
    // "Doing nothing and trading were identical" and "we could not work it
    // out" must never render as the same thing.
    const b = readBookBaseline({ ...ROW, trading_effect_pct: null }, NAV);
    assert.equal(b.status, 'absent');
});

// ── baselineVerdict ───────────────────────────────────────────
t('the verdict names the unwelcome case plainly', () => {
    assert.equal(baselineVerdict(readBookBaseline(ROW, NAV.slice(0, 2))),
                 'Doing nothing would have beaten this');
});

t('a positive effect reads as trading adding value', () => {
    const b = readBookBaseline({ ...ROW, trading_effect_pct: 0.021 }, NAV.slice(0, 2));
    assert.equal(baselineVerdict(b), 'Trading added value');
});

t('a negligible effect is a wash, not a win', () => {
    const b = readBookBaseline({ ...ROW, trading_effect_pct: 0.0002 }, NAV.slice(0, 2));
    assert.equal(baselineVerdict(b), 'Trading was a wash');
});

console.log('\n' + passed + '/' + passed + ' passed');
