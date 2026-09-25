// No page may fall back to sample book data or to a read that hides a failure.
//
// `loadView(name, fallback)` returned its fallback on ANY error, and four pages
// passed MOCK data as that fallback -- so a command centre cancelled at the 3s
// anon cap rendered a $119,500 NAV and a 1.35 Sharpe as the book, and PCM's
// rebalancing layer showed "Rebalancing Triggered 7.2%" with NVDA/BND/IEFA
// trades that nobody computed. Both are gone: pages read loadViewState and say
// which feed did not answer (src/lib/feedStates.js).
//
// Repo-wide scan, so the next one fails here instead of in the terminal.
// MOCK_PCM_IPS is allowed: it is the starting template of an editable form,
// marked unsaved until the user saves it -- not a claim about the book.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const ALLOWED_MOCKS = new Set(['MOCK_PCM_IPS']);

function walk(dir, out) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === '__fixtures__') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(js|jsx|mjs)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(p);
    }
    return out;
}

// Strip comments so prose ABOUT the retired helpers is not read as a use.
function code(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function findViolations(src) {
    const c = code(src);
    const out = [];
    for (const m of c.matchAll(/\bloadView\s*\(/g)) out.push('loadView(');
    for (const m of c.matchAll(/\bMOCK_[A-Z_]+\b/g)) if (!ALLOWED_MOCKS.has(m[0])) out.push(m[0]);
    return out;
}

const files = walk(join(ROOT, 'src'), []);

test('the scan finds files at all (a vacuous scan passes trivially)', () => {
    assert.ok(files.length > 50, 'expected to scan the page layer, got ' + files.length);
});

test('the detector finds the exact pre-fix shapes', () => {
    assert.deepEqual(findViolations("loadView('vw_command_centre', [MOCK_COMMAND])"), ['loadView(', 'MOCK_COMMAND']);
    assert.deepEqual(findViolations("useState(MOCK_PCM_DRIFT)"), ['MOCK_PCM_DRIFT']);
});

test('the detector does not read comments or the allowed IPS template as a use', () => {
    assert.deepEqual(findViolations("// loadView(name, fallback) returned MOCK_COMMAND\nuseState(MOCK_PCM_IPS)"), []);
    assert.deepEqual(findViolations("loadViewState('vw_x')"), []);
});

test('no page falls back to mock book data or to loadView', () => {
    const hits = [];
    for (const f of files) {
        const v = findViolations(readFileSync(f, 'utf8'));
        if (v.length) hits.push(relative(ROOT, f) + ': ' + v.join(', '));
    }
    assert.deepEqual(hits, []);
});
