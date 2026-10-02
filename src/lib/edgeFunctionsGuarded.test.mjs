// EF-1: every edge function serves through serveGuarded, never Deno.serve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'functions');

// Functions the terminal calls from the browser (sb.functions.invoke). Every
// other function is server-only and must refuse a signed-in user.
const BROWSER = new Set([
    'claude_sql_assistant', 'compute_ticker_derived', 'synthesize_thesis',
    'cortex_pretrade_risk', 'generate_cortex_signals',
]);

function stripComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

export function findUnguarded(files) {
    const out = [];
    for (const [name, src] of files) {
        const code = stripComments(src);
        if (/\bDeno\.serve\s*\(/.test(code)) out.push(name + ': calls Deno.serve');
        else if (!/\bserveGuarded\s*\(/.test(code)) out.push(name + ': does not call serveGuarded');
        else if (!/from\s+['"]\.\.\/_shared\/edge_auth\.js['"]/.test(code)) out.push(name + ': does not import edge_auth.js');
    }
    return out;
}

function functions() {
    return readdirSync(FN)
        .filter((d) => !d.startsWith('_') && existsSync(join(FN, d, 'index.ts')))
        .map((d) => [d, readFileSync(join(FN, d, 'index.ts'), 'utf8')]);
}

test('the scan finds the functions at all', () => {
    assert.ok(functions().length >= 15);
});

test('every edge function serves through serveGuarded', () => {
    assert.deepEqual(findUnguarded(functions()), []);
});

test('only browser-called functions accept a signed-in user', () => {
    for (const [name, src] of functions()) {
        const m = /serveGuarded\(\s*\{\s*user:\s*(true|false)\s*\}/.exec(stripComments(src));
        assert.ok(m, name + ': serveGuarded without an explicit { user } policy');
        assert.equal(m[1] === 'true', BROWSER.has(name), name + ': user policy does not match its callers');
    }
});

test('the detector catches a bare Deno.serve and ignores one in a comment', () => {
    const bare = "import x from 'y'\nDeno.serve(async (req) => new Response('ok'))";
    const commented = "import { serveGuarded } from '../_shared/edge_auth.js'\n// Deno.serve( is replaced\nserveGuarded({ user: false }, () => new Response('ok'))";
    assert.deepEqual(findUnguarded([['bare', bare]]), ['bare: calls Deno.serve']);
    assert.deepEqual(findUnguarded([['ok', commented]]), []);
});
