// F-1 regime pane switcher — pure logic, runs under plain node.
//
//   node --test src/pages/nexus/nexusRegimePanes.test.mjs
//
// Fixtures use pane keys that do not exist on the real tab, so anything
// hardcoding 'pairs'/'axes'/'macro' — or assuming three of them — fails
// here rather than when F-2 adds the fourth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PANE_STORAGE_KEY, resolveInitialPane, revealedPanes,
    readStoredPane, writeStoredPane, nextPaneByKeyboard,
} from './nexusRegimePanes.js';

const KEYS = ['alpha', 'beta', 'gamma', 'delta'];

test('initial pane: stored wins when it still exists', () => {
    assert.equal(resolveInitialPane('gamma', KEYS, 'alpha'), 'gamma');
});

test('initial pane: a stored key that no longer exists falls back, never selects nothing', () => {
    // The case that matters: a pane was renamed or removed after someone
    // had already selected it. They must not land on a blank tab.
    assert.equal(resolveInitialPane('retired-pane', KEYS, 'alpha'), 'alpha');
    assert.equal(resolveInitialPane('', KEYS, 'alpha'), 'alpha');
    assert.equal(resolveInitialPane(null, KEYS, 'alpha'), 'alpha');
    assert.equal(resolveInitialPane(undefined, KEYS, 'alpha'), 'alpha');
});

test('initial pane: a fallback that is not in the list still yields a real pane', () => {
    assert.equal(resolveInitialPane(null, KEYS, 'not-a-pane'), 'alpha');
    assert.equal(resolveInitialPane(null, [], 'alpha'), null);
});

test('reveal is cumulative — a pane stays revealed after you leave it', () => {
    let seen = revealedPanes('alpha', new Set());
    assert.deepEqual([...seen], ['alpha']);
    seen = revealedPanes('gamma', seen);
    assert.deepEqual([...seen].sort(), ['alpha', 'gamma']);
    seen = revealedPanes('alpha', seen);           // back again
    assert.deepEqual([...seen].sort(), ['alpha', 'gamma']);
    // and never reveals one that was not asked for
    assert.ok(!seen.has('beta'));
    assert.ok(!seen.has('delta'));
});

test('reveal does not mutate the set it was given', () => {
    const before = new Set(['alpha']);
    const after = revealedPanes('beta', before);
    assert.deepEqual([...before], ['alpha']);
    assert.deepEqual([...after].sort(), ['alpha', 'beta']);
});

test('storage failures are silent and mean "no preference"', () => {
    const throwing = {
        getItem() { throw new Error('SecurityError: storage is disabled'); },
        setItem() { throw new Error('SecurityError: storage is disabled'); },
    };
    assert.equal(readStoredPane(throwing), null);
    assert.equal(writeStoredPane(throwing, 'alpha'), false);
    // absent storage entirely (SSR, or a stripped environment)
    assert.equal(readStoredPane(null), null);
    assert.equal(writeStoredPane(null, 'alpha'), false);
    // and the tab still resolves to a usable pane
    assert.equal(resolveInitialPane(readStoredPane(throwing), KEYS, 'alpha'), 'alpha');
});

test('storage round-trips under a working implementation', () => {
    const store = new Map();
    const ok = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
    assert.equal(readStoredPane(ok), null);
    assert.equal(writeStoredPane(ok, 'delta'), true);
    assert.equal(readStoredPane(ok), 'delta');
    assert.equal(store.get(PANE_STORAGE_KEY), 'delta');
});

test('keyboard navigation wraps and honours Home/End', () => {
    assert.equal(nextPaneByKeyboard('ArrowRight', 'alpha', KEYS), 'beta');
    assert.equal(nextPaneByKeyboard('ArrowRight', 'delta', KEYS), 'alpha');   // wraps
    assert.equal(nextPaneByKeyboard('ArrowLeft', 'alpha', KEYS), 'delta');    // wraps
    assert.equal(nextPaneByKeyboard('Home', 'gamma', KEYS), 'alpha');
    assert.equal(nextPaneByKeyboard('End', 'alpha', KEYS), 'delta');
    assert.equal(nextPaneByKeyboard('Enter', 'alpha', KEYS), null);           // not ours
    assert.equal(nextPaneByKeyboard('ArrowRight', 'alpha', []), null);
    assert.equal(nextPaneByKeyboard('ArrowRight', 'unknown', KEYS), 'alpha');
});

test('switcher logic is agnostic to how many panes there are', () => {
    // F-2 adds one entry; nothing above should need changing.
    const three = ['a', 'b', 'c'];
    const four = ['a', 'b', 'c', 'd'];
    assert.equal(nextPaneByKeyboard('ArrowLeft', 'a', three), 'c');
    assert.equal(nextPaneByKeyboard('ArrowLeft', 'a', four), 'd');
    assert.equal(resolveInitialPane('d', three, 'a'), 'a');   // not yet added
    assert.equal(resolveInitialPane('d', four, 'a'), 'd');    // once added
});
