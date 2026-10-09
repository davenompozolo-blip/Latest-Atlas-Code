// .vercelignore uses gitignore syntax: an entry with no leading slash matches a
// directory of that name ANYWHERE in the tree. `auth/` was written for the
// legacy Python package at the repo root and silently dropped
// src/components/auth/ from the Vercel upload -- the local build passed and
// every deployment failed on an unresolved import. This test fails any rule
// that hides a file the frontend build or the API functions need.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules') continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out); else out.push(relative(ROOT, p));
    }
    return out;
}

/** Directory rules (`name/`) that are not anchored to the root. */
export function unanchoredDirRules(text) {
    return text.split('\n').map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('/') && !l.startsWith('!') && l.endsWith('/'))
        .map((l) => l.slice(0, -1));
}

test('the detector reads unanchored directory rules and nothing else', () => {
    assert.deepEqual(unanchoredDirRules('# auth/\n/pages/\nauth/\napi/main.py\n*.md\ncore/'), ['auth', 'core']);
});

test('no .vercelignore rule hides a file under src/ or api/', () => {
    const rules = unanchoredDirRules(readFileSync(join(ROOT, '.vercelignore'), 'utf8'));
    assert.ok(rules.length > 0, 'expected to find directory rules; a vacuous scan passes trivially');
    const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'server', 'api')), ...walk(join(ROOT, 'api'))];
    const hidden = [];
    for (const f of files) {
        const parts = f.split('/').slice(0, -1);
        for (const r of rules) if (r.includes('/') ? ('/' + f).includes('/' + r + '/') : parts.includes(r)) hidden.push(r + ' -> ' + f);
    }
    // api/models/ and api/routers/ are the retired FastAPI app, excluded on purpose.
    const unexpected = hidden.filter((h) => !/ -> api\/(models|routers)\//.test(h));
    assert.deepEqual(unexpected, []);
});
