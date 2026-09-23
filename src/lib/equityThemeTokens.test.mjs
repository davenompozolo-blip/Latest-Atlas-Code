// EQ-6b · every `T.<token>` in the Equity Research closure must EXIST.
//
// `T.navy2` and `T.sans` were both written into the EQ-4 institution panel and
// neither is on the palette. React drops a style property whose value is
// `undefined`, so `background: T.navy2` painted nothing and reported nothing —
// the dead-`var()` failure this codebase already recorded for the app shell,
// in a JS form instead of a CSS one. `vite build` was clean, the tests were
// green, and the string shipped to the bundle.
//
// A missing token is invisible from every check that looks at code rather than
// at pixels, so the check has to look at the name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const THEME = 'src/pages/equity/equityTheme.js';

/** The token names the palette actually exports, read from the source. */
export function paletteTokens(src) {
    // The object literal assigned to the exported palette: `key: value,` lines.
    const body = src.slice(src.indexOf('export const T'));
    const out = new Set();
    for (const m of body.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*:/gm)) out.add(m[1]);
    return out;
}

/** `T.foo` references in a source file, comments stripped. */
export function tokenRefs(src) {
    const code = src
        .split('\n')
        .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    return [...new Set([...code.matchAll(/\bT\.([A-Za-z_$][\w$]*)\b/g)].map(m => m[1]))];
}

const themeSrc = readFileSync(THEME, 'utf8');
const tokens = paletteTokens(themeSrc);

test('the palette parses to a non-empty token set', () => {
    // A vacuous scan passes trivially, so assert the parser found something
    // and found the tokens we know are there.
    assert.ok(tokens.size >= 15, 'only found ' + tokens.size + ' tokens');
    for (const k of ['card', 'card2', 'border', 'border2', 'text', 'muted', 'mono', 'amber']) {
        assert.ok(tokens.has(k), 'palette is missing ' + k);
    }
});

test('the detector FINDS the exact shape that shipped', () => {
    const bad = 'const x = { background: T.navy2, fontFamily: T.sans };';
    const refs = tokenRefs(bad);
    assert.deepEqual(refs, ['navy2', 'sans']);
    assert.equal(refs.every(r => tokens.has(r)), false);
});

test('the detector does not read its own documentation as code', () => {
    // `equityTheme.js` and this file both NAME tokens in prose. A scanner that
    // counts those fails the very file that documents the rule —
    // `pagerOrdering.test.mjs` and the EQ-6 palette scanner both hit this.
    const commented = '// T.navy2 was removed\nconst y = T.card2;\n/* T.sans too */';
    assert.deepEqual(tokenRefs(commented), ['card2']);
});

test('EVERY T.<token> in src/pages resolves on the palette', () => {
    const dir = 'src/pages';
    const files = [];
    (function walk(d) {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith('.js')) files.push(p);
        }
    })(dir);
    assert.ok(files.length > 5, 'walked only ' + files.length + ' files');

    const offenders = [];
    for (const f of files) {
        const src = readFileSync(f, 'utf8');
        // Only files that import the shared palette are in scope. A file with
        // its own local `T` is a different object and answers to the EQ-6
        // palette scanner instead.
        if (!/from '\.\/equity\/equityTheme\.js'|from '\.\.\/equity\/equityTheme\.js'|from '\.\/equityTheme\.js'/.test(src)) continue;
        for (const ref of tokenRefs(src)) {
            if (!tokens.has(ref)) offenders.push(f + ' -> T.' + ref);
        }
    }
    assert.deepEqual(offenders, [],
        'undefined theme tokens (they render as nothing, silently):\n  ' + offenders.join('\n  '));
});
