import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { T, RAMP, dim, DIM_ALPHA } from '../pages/equity/equityTheme.js';

// The Equity Research module paints from raw hex because one of these values
// reaches a Chart.js canvas, which cannot resolve a CSS custom property. That
// buys correctness on canvas and costs the guarantee that the module and the
// stylesheet still agree -- so the guarantee is re-established here, against
// the stylesheet itself rather than against a copy of it.

const GLOBALS = 'src/styles/globals.css';

/** `:root { ... }` from globals.css, as a token -> value map. */
function rootTokens() {
    const css = readFileSync(GLOBALS, 'utf8');
    const open = css.indexOf(':root');
    assert.ok(open >= 0, 'globals.css has no :root block');
    const brace = css.indexOf('{', open);
    const close = css.indexOf('}', brace);
    const body = css.slice(brace + 1, close);
    const out = {};
    for (const line of body.split('\n')) {
        const m = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i.exec(line);
        if (m) out[m[1]] = m[2].trim();
    }
    return out;
}

/**
 * Comments are not code.
 *
 * equityTheme.js DOCUMENTS the accents it removed -- it has to, or the next
 * reader cannot tell what changed -- and the first run of this scanner read
 * those mentions as live usage and failed the module that fixed the problem.
 * `pagerOrdering.test.mjs` hit the identical trap. A detector that reports the
 * wrong thing is worse than none, so the stripping is tested below rather than
 * trusted.
 *
 * `//` is only treated as a comment when it does not follow a `:`, so a
 * `https://` inside a string survives.
 */
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const norm = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * The Equity Research module = the IMPORT CLOSURE of its entry point, computed
 * here rather than listed.
 *
 * A glob over `src/pages/equity*.js` was the first version and it over-reached:
 * it flagged equity-valuation.js, equity-risk.js and the four equity-dcf-* files,
 * which belong to the VALUATION HOUSE -- a different page, with its own chrome
 * and its own decision to make. A hardcoded list would have the opposite fault:
 * it goes stale the moment a tab gains an import, which is exactly when a new
 * palette arrives unnoticed. The closure tracks the module as it actually is.
 */
function importClosure(entry) {
    const seen = new Set();
    const stack = [entry];
    while (stack.length) {
        const f = stack.pop();
        if (seen.has(f) || !existsSync(f)) continue;
        seen.add(f);
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
            const p = resolve(dirname(f), m[1]);
            const rel = relative(process.cwd(), p);
            if (rel.startsWith('src/')) stack.push(rel);
        }
    }
    return [...seen].sort();
}

const EQ_FILES = importClosure('src/pages/equity-research.js')
    .filter(f => f.startsWith('src/pages/equity'));

test('the :root block parses and is not trivially empty', () => {
    const tok = rootTokens();
    // A parser that silently returns {} would make every assertion below pass
    // vacuously, which is the failure mode of a scanner that reports the wrong
    // thing. Anchor it on a token whose absence means the parse broke.
    assert.ok(Object.keys(tok).length > 20, 'expected >20 :root tokens, got ' + Object.keys(tok).length);
    assert.equal(norm(tok['--navy-2']), '#121821');
});

test('every RAMP value still matches globals.css :root', () => {
    const tok = rootTokens();
    for (const [name, value] of Object.entries(RAMP)) {
        assert.ok(tok[name] !== undefined, name + ' is gone from globals.css :root');
        assert.equal(
            norm(tok[name]), norm(value),
            name + ': globals.css says ' + tok[name] + ', equityTheme says ' + value,
        );
    }
});

test('the equity module declares no second palette', () => {
    const offenders = EQ_FILES.filter(f => /^\s*(var|const|let)\s+T\s*=\s*\{/m.test(readFileSync(f, 'utf8')));
    assert.deepEqual(offenders, [], 'these files re-declare a local palette: ' + offenders.join(', '));
});

test('no equity file paints from an accent outside the ramp', () => {
    // The module carried THREE accents beyond the ramp's cyan: #00d4b8,
    // #00d4ff and #3b82f6. Each appears as hex AND as an rgba() wash, so the
    // channel triples are matched too -- grepping only the hex form is what
    // let the rgba(0,212,184,.05) copies survive the first pass.
    //
    // CHROME ONLY. This does not ban every off-ramp hex, because a series
    // palette (equity-peers' eight chart colours) and a bucket taxonomy
    // (equity-screener's Value/Growth/Momentum, which G-2 deliberately
    // mirrored onto the holdings table) are doing a different job from
    // chrome. Re-basing those re-bases a vocabulary shared with another
    // surface, which is its own decision, not a fold-in.
    const banned = [
        /#00d4b8/i, /0\s*,\s*212\s*,\s*184/,
        /#00d4ff/i, /0\s*,\s*212\s*,\s*255/,
        /#3b82f6/i, /59\s*,\s*130\s*,\s*246/,
    ];
    const offenders = [];
    for (const f of EQ_FILES) {
        const src = stripComments(readFileSync(f, 'utf8'));
        for (const re of banned) if (re.test(src)) offenders.push(f + ' :: ' + re);
    }
    assert.deepEqual(offenders, [], 'off-ramp accents still present:\n' + offenders.join('\n'));
});

test('the scanner looks at a real, non-empty set of files', () => {
    // A scan over zero files passes every assertion above. This is the
    // detector's own detector.
    assert.ok(EQ_FILES.length >= 6, 'expected >=6 equity page files, found ' + EQ_FILES.length);
    assert.ok(EQ_FILES.includes('src/pages/equity-research-panels.js'));
});

test('dim() derives a wash from its base rather than being typed', () => {
    assert.equal(dim('#22c55e'), 'rgba(34,197,94,' + DIM_ALPHA + ')');
    assert.equal(dim(T.red), 'rgba(239,68,68,' + DIM_ALPHA + ')');
    assert.equal(T.greenDim, dim(T.green), 'greenDim must be derived from green');
    assert.equal(T.violetDim, dim(T.violet), 'violetDim must be derived from violet');
    // Absent rather than a wrong colour: a malformed base must not yield a
    // plausible rgba() that renders as something nobody chose.
    assert.equal(dim('nonsense'), null);
    assert.equal(dim(undefined), null);
});

test('border and border2 convert on value, not on name', () => {
    // --border is 0.11 in globals.css and 0.07 in nexus-flagship.css: the same
    // name, the alpha steps swapped between the files. The module's `border`
    // has always been the SUBTLE one (.08) and `border2` the stronger (.13),
    // so they must land on 0.07 and 0.11 respectively -- taking the names at
    // face value would invert every edge in the module.
    assert.match(T.border, /0\.07\)/);
    assert.match(T.border2, /0\.11\)/);
});

test('stripComments removes documentation without eating code or URLs', () => {
    // The exact shape that failed: a banned colour named in prose.
    assert.equal(stripComments('/* was #00d4b8 */ var a = 1;').includes('#00d4b8'), false);
    assert.equal(stripComments('// the old #00d4ff accent\nvar a = 1;').includes('#00d4ff'), false);
    // ...and the shape that must NOT be eaten: a live literal, and a URL.
    assert.equal(stripComments("var a = '#00d4b8';").includes('#00d4b8'), true);
    assert.equal(stripComments("var u = 'https://x.dev/a';").includes('https://x.dev/a'), true);
});

test('the accent scanner still fires on a live literal', () => {
    // A scanner made blind by over-eager comment stripping passes everything.
    // Feed it the pre-fix shape and require a hit.
    const live = stripComments("var T = { teal: '#00d4b8' };");
    assert.match(live, /#00d4b8/);
});
