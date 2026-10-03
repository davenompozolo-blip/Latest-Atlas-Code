// ONB-0b: trade_universe_members.book_state / held_weight_pct are the DEFAULT
// account's holdings and weights, and the browser cannot read them. A read
// that names either column, or selects '*', is refused by PostgREST once the
// columns are revoked -- so the Trade page would fail for everyone. This
// guards every read in src/ by reading the source, since the module imports
// the live Supabase client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const WITHHELD = ['book_state', 'held_weight_pct'];

function walk(dir, out = []) {
    for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(m?js|jsx|ts)$/.test(f) && !/\.test\.mjs$/.test(f)) out.push(p);
    }
    return out;
}

/** Each `from('trade_universe_members')` call and the select that follows it. */
export function memberReads(src) {
    const reads = [];
    // The select may come after other builder calls (.eq, .order, ...), so
    // match lazily up to the first .select( after the from(); [^;] keeps the
    // match inside one statement.
    const re = /from\(\s*['"]trade_universe_members['"]\s*\)[^;]*?\.select\(\s*([^)]*)\)/g;
    let m;
    while ((m = re.exec(src))) reads.push(m[1].trim());
    return reads;
}

test('detector finds the pre-fix shape', () => {
    assert.deepEqual(memberReads("sb.from('trade_universe_members').select('*')"), ["'*'"]);
});

test('detector finds a select that follows a filter', () => {
    assert.deepEqual(
        memberReads("sb.from('trade_universe_members').eq('eligible', true).select('*')"),
        ["'*'"]);
});

test('MEMBER_COLUMNS withholds the default account book columns', () => {
    const src = readFileSync(join(ROOT, 'lib/trade/tradeData.js'), 'utf8');
    const block = src.slice(src.indexOf('export const MEMBER_COLUMNS'), src.indexOf("].join(',')"));
    assert.ok(block.includes("'symbol'"), 'the column list was not found');
    for (const c of WITHHELD) assert.ok(!block.includes(`'${c}'`), `${c} is selected`);
});

test('no read in src/ selects * or a withheld column', () => {
    const files = walk(ROOT);
    let found = 0;
    for (const f of files) {
        const src = readFileSync(f, 'utf8');
        for (const sel of memberReads(src)) {
            found++;
            assert.notEqual(sel.replace(/['"\s]/g, ''), '*', `${f} selects *`);
            for (const c of WITHHELD) assert.ok(!sel.includes(c), `${f} selects ${c}`);
        }
    }
    assert.ok(found >= 3, `expected the Trade page's reads, found ${found}`);
});

test('no read in src/ orders or filters on a withheld column', () => {
    for (const f of walk(ROOT)) {
        const src = readFileSync(f, 'utf8');
        if (!src.includes('trade_universe_members')) continue;
        for (const c of WITHHELD) {
            assert.ok(!new RegExp(`\\.(order|eq|neq|gt|lt|gte|lte|is|in)\\(\\s*['"]${c}['"]`).test(src),
                `${f} uses ${c} in a query`);
        }
    }
});
