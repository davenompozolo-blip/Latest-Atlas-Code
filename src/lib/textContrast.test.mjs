// The tertiary text colour sits under 9px uppercase labels across the
// terminal. It must clear WCAG AA for small text (4.5:1) on the card surface,
// stay a visible step below the secondary colour, and be the same value in
// every stylesheet that declares it -- three copies drifted apart once already.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL('../styles/' + f, import.meta.url), 'utf8');
const token = (css, name) => {
    const m = css.match(new RegExp(name.replace(/-/g, '\\-') + ':\\s*(#[0-9a-fA-F]{6})'));
    assert.ok(m, name + ' not found');
    return m[1].toLowerCase();
};
const lum = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

const g = read('globals.css');
const text3 = token(g, '--text-3');
const text2 = token(g, '--text-2');
const card = token(g, '--navy-2');

test('every stylesheet declares the same tertiary text colour', () => {
    assert.equal(token(read('nexus-theme.css'), '--nx-text3'), text3);
    assert.equal(token(read('nexus-flagship.css'), '--text3'), text3);
});

test('tertiary text clears 4.5:1 on the card surface and on both page backgrounds', () => {
    for (const bg of [card, token(g, '--navy'), token(g, '--navy-1')]) {
        assert.ok(contrast(text3, bg) >= 4.5, `${text3} on ${bg}: ${contrast(text3, bg).toFixed(2)}`);
    }
});

test('tertiary text is still a visible step below secondary text', () => {
    assert.ok(contrast(text2, card) / contrast(text3, card) >= 1.35);
});
