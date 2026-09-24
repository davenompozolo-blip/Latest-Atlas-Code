// MP-0: no browser or API code may read a book table directly.
//
// positions / account_snapshots / transactions / portfolio_equity_curve all
// carry portfolio_id. A direct read returns EVERY portfolio's rows, so the day
// a second account syncs, that reader silently sums two books. Read the scoped
// views instead -- vw_active_positions, vw_active_account_snapshots,
// vw_active_transactions, vw_active_equity_curve -- or a view built on them
// (vw_positions_current, vw_portfolio_home, ...). They are filtered to
// atlas_active_portfolio() in the database, which is the one place that
// decides which book is shown.
//
// The scan is repo-wide rather than a list of files, so the next direct read
// fails here instead of in the terminal. Run: node --test src/lib/bookTableReads.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SCAN = ['src', 'api'];
const BOOK = ['positions', 'account_snapshots', 'transactions', 'portfolio_equity_curve'];

// supabase-js:  .from('positions')      PostgREST path:  'positions?select=...'
//                                       or  '/rest/v1/positions'
const T = BOOK.join('|');
const PATTERNS = [
    new RegExp(`\\.from\\(\\s*['"\`](${T})['"\`]\\s*\\)`, 'g'),
    new RegExp(`['"\`/](${T})\\?`, 'g'),
    new RegExp(`/rest/v1/(${T})\\b`, 'g'),
];

// Comment lines are stripped before scanning: the prose around these reads is
// ABOUT the base tables (this file's own header names all four), and a scanner
// that reads its own documentation as code reports the wrong thing.
// A `//` preceded by ':' is a URL, not a comment.
export function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .split('\n')
        .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
        .join('\n');
}

export function findBookReads(src) {
    const code = stripComments(src);
    const hits = [];
    for (const re of PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(code))) {
            hits.push({ table: m[1], line: code.slice(0, m.index).split('\n').length });
        }
    }
    return hits;
}

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else if (/\.(m?js|jsx|ts)$/.test(name) && !/\.test\.m?js$/.test(name)) out.push(p);
    }
    return out;
}

test('the detector finds the exact shapes that shipped before MP-0', () => {
    const pre = [
        "sb.from('positions').select('asset_id')",
        "sb.from('account_snapshots').select('equity').order('as_of', { ascending: false }).limit(1)",
        "sbGet('positions?select=quantity,average_cost&order=as_of_date.desc&limit=500')",
        ".from('portfolio_equity_curve')",
        "fetch(url + '/rest/v1/transactions')",
    ];
    for (const s of pre) assert.equal(findBookReads(s).length, 1, s);
});

test('the scoped views and derived views are not flagged', () => {
    const ok = [
        "sb.from('vw_active_positions').select('asset_id')",
        "sb.from('vw_positions_current').select('asset_id')",
        "sb.from('vw_filled_transactions').select('*')",
        "sbGet('vw_active_account_snapshots?select=*')",
        "alpacaGet('/v2/positions')",
    ];
    for (const s of ok) assert.deepEqual(findBookReads(s), [], s);
});

test('comments are not code, and stripping them does not blind the scan', () => {
    assert.deepEqual(findBookReads("// never sb.from('positions') directly"), []);
    assert.deepEqual(findBookReads("/* sb.from('positions') */"), []);
    // A URL survives stripping; a live read on the same line as a URL is found.
    assert.equal(findBookReads("const u = 'https://x.co'; sb.from('positions')").length, 1);
});

test('the scan covers real files (a vacuous scan passes trivially)', () => {
    const files = SCAN.flatMap((d) => walk(join(ROOT, d)));
    assert.ok(files.length > 100, `only ${files.length} files scanned`);
});

test('no file in src/ or api/ reads a book table directly', () => {
    const offenders = [];
    for (const f of SCAN.flatMap((d) => walk(join(ROOT, d)))) {
        for (const h of findBookReads(readFileSync(f, 'utf8'))) {
            offenders.push(`${relative(ROOT, f)}:${h.line}  ${h.table}`);
        }
    }
    assert.deepEqual(offenders, [],
        'Read vw_active_* (or a view built on it), never the base table:\n  ' + offenders.join('\n  '));
});
