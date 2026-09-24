// The fixtures are the LIVE `assets.asset_class` values and their live counts
// (measured 2026-09-24), not invented shapes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { instrumentLabel, INSTRUMENT_KINDS } from './instrumentLabel.js';

// symbol-facing value -> rows carrying it, straight from `assets`
const STORED = {
    Stock: 7847, us_equity: 72, equity: 24,
    option: 10, us_option: 3,
    cash: 1, etf: 1, crypto: 1,
};

test('every stored value renders a label, and none renders the raw token', () => {
    for (const raw of Object.keys(STORED)) {
        const out = instrumentLabel(raw);
        assert.ok(out, raw);
        assert.notEqual(out, raw, raw + ' still renders as stored');
        assert.doesNotMatch(out, /_/, raw + ' still carries an underscore');
    }
});

test('THE THREE EQUITY SPELLINGS RESOLVE TO ONE LABEL', () => {
    // 7,943 rows across three spellings for one instrument. Rendering them
    // apart is what makes the field unreadable: `us_equity` on one symbol and
    // `Stock` on the next look like different things and are not.
    const equity = ['Stock', 'us_equity', 'equity'].map(instrumentLabel);
    assert.deepEqual(equity, ['Equity', 'Equity', 'Equity']);
    assert.equal(new Set(equity).size, 1);
});

test('both option spellings resolve to one label', () => {
    // CLAUDE.md: "`asset_class` is 'us_option', not 'option'. Equality misses
    // every contract." Both genuinely occur, so both must map.
    assert.equal(instrumentLabel('option'), 'Option');
    assert.equal(instrumentLabel('us_option'), 'Option');
});

test('an option is never rendered as an equity', () => {
    // The one mapping that would be a false statement about the instrument.
    for (const o of ['option', 'us_option']) {
        assert.notEqual(instrumentLabel(o), 'Equity', o);
    }
});

test('case and padding do not produce a second label for one kind', () => {
    for (const v of ['STOCK', 'Stock', ' stock ', 'US_EQUITY']) {
        assert.equal(instrumentLabel(v), 'Equity', v);
    }
});

test('nothing stored is ABSENT, so the caller renders its own empty state', () => {
    for (const v of [null, undefined, '', '   ', 0, 42, {}, []]) {
        assert.equal(instrumentLabel(v), null, JSON.stringify(v));
    }
});

test('an unknown value is humanised, never dropped and never guessed', () => {
    // Dropping it would hide a vocabulary the platform had started storing.
    assert.equal(instrumentLabel('mutual_fund'), 'Mutual fund');
    assert.equal(instrumentLabel('WARRANT'), 'Warrant');
    // ...and is not silently forced into a kind it was not mapped to.
    assert.ok(!Object.values(INSTRUMENT_KINDS).includes(instrumentLabel('mutual_fund')));
});

test('the map covers every value the database currently holds', () => {
    // A new spelling appearing in `assets` should be a decision, not a
    // silently humanised string, so this pins the measured set.
    for (const raw of Object.keys(STORED)) {
        assert.ok(
            Object.prototype.hasOwnProperty.call(INSTRUMENT_KINDS, raw.toLowerCase()),
            raw + ' is stored but unmapped');
    }
});
