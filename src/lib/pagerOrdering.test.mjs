import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import { fetchPaged, PAGE_SIZE } from './pagedRead.js';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// ── The library contract ─────────────────────────────────────────────────
// The fix rests on chained `.order()` producing a MULTI-KEY PostgREST sort.
// If supabase-js ever dropped the earlier key, every tiebreaker in the repo
// would silently stop being one, and nothing else here would notice — the
// query would still succeed and still return rows.

const sb = createClient('https://example.supabase.co', 'x'.repeat(40));
const qs = (b) => decodeURIComponent(b.url.toString()).split('?')[1];
const orderOf = (b) => (qs(b).match(/order=([^&]+)/) || [])[1];

test('chained .order() emits BOTH keys, in order, with directions', () => {
    const o = orderOf(
        sb.from('market_prices').select('symbol,date')
          .order('date', { ascending: false })
          .order('symbol', { ascending: true })
          .range(0, PAGE_SIZE - 1)
    );
    assert.equal(o, 'date.desc,symbol.asc');
    // The date key must come FIRST: it is what a truncation is meant to
    // cost. A tiebreaker that outranks it would drop the newest bars.
    assert.ok(o.indexOf('date.desc') < o.indexOf('symbol.asc'));
});

test('a single .order() is a one-key sort — the shape being fixed', () => {
    const o = orderOf(
        sb.from('market_prices').select('symbol,date')
          .order('date', { ascending: false })
          .range(0, PAGE_SIZE - 1)
    );
    assert.equal(o, 'date.desc');
    assert.equal(o.split(',').length, 1);
});

test('the price_history read pins the interval', () => {
    const q = qs(
        sb.from('price_history').select('asset_id, price_date, close')
          .in('asset_id', ['a'])
          .eq('interval', '1d')
          .order('price_date', { ascending: false })
          .order('asset_id', { ascending: true })
          .range(0, PAGE_SIZE - 1)
    );
    // Without this, SPY returns two different closes for the same session:
    // the table carries a legacy '1Day' yahoo import alongside '1d'.
    assert.match(q, /interval=eq\.1d/);
    assert.match(q, /order=price_date\.desc,asset_id\.asc/);
});

test('range maps to offset/limit, so paging is OFFSET paging', () => {
    // Which is the whole reason a total ordering is required: OFFSET over a
    // non-total sort has no consistency guarantee between requests.
    const q = qs(
        sb.from('market_prices').select('date').order('date').range(0, PAGE_SIZE - 1)
    );
    assert.match(q, /offset=0/);
    assert.match(q, new RegExp('limit=' + PAGE_SIZE));
});

// ── The repo-wide invariant ──────────────────────────────────────────────
// The rule is not "these three files"; it is that ANY paged read declares a
// total ordering. Scanning the source is what makes the next one fail here
// rather than in production.

function jsFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...jsFiles(full));
        else if (/\.(js|mjs)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(full);
    }
    return out;
}

// A paged read is a `.range(` call. For each one, walk back to the `.from(`
// that opens its chain and count the `.order(` calls in between.
//
// Comment lines are STRIPPED before counting, for two reasons: the prose
// around these reads talks about ordering, so an unstripped count reads its
// own documentation as code; and a long comment between `.from(` and
// `.range(` must not push the chain start out of range. Both were real —
// the first draft of this scanner reported performance-suite.js and
// risk-model-validation.js as having ZERO order keys, which is the comment
// block this very fix added sitting between the two.
const COMMENT = /^\s*(\/\/|\*|\/\*)/;

function pagedReads(src) {
    const found = [];
    const raw = src.split('\n');
    const code = raw.map((l) => (COMMENT.test(l) ? '' : l));
    for (let i = 0; i < code.length; i++) {
        if (!/\.range\s*\(/.test(code[i])) continue;
        let start = -1;
        for (let j = i; j >= 0 && i - j < 80; j--) {
            if (/\.from\s*\(/.test(code[j])) { start = j; break; }
        }
        if (start < 0) continue;                       // not a PostgREST chain
        const chain = code.slice(start, i + 1).join('\n');
        // An explicit, JUSTIFIED exemption: a single key that is already
        // unique on this relation is total, and demanding a second one
        // would be cargo cult. The author has to say which key and why,
        // in the comments around the chain — an allowlist in this file
        // would let the claim rot away from the code it describes.
        const context = raw.slice(Math.max(0, start - 12), i + 1).join('\n');
        const exempt = /TOTAL ORDER:/.test(context);
        found.push({
            line: i + 1,
            orders: (chain.match(/\.order\s*\(/g) || []).length,
            exempt,
        });
    }
    return found;
}

test('every paged read in src/ declares a total ordering', () => {
    const offenders = [];
    for (const file of jsFiles(SRC)) {
        for (const r of pagedReads(readFileSync(file, 'utf8'))) {
            if (r.orders < 2 && !r.exempt) {
                offenders.push(relative(SRC, file) + ':' + r.line
                    + ' (' + r.orders + ' order key(s), no TOTAL ORDER: justification)');
            }
        }
    }
    assert.deepEqual(offenders, [],
        'paged reads without a tiebreaker:\n  ' + offenders.join('\n  '));
});

test('a paged read is found at all — the scanner is not vacuous', () => {
    // If the scan matched nothing the test above would pass trivially.
    let n = 0;
    for (const file of jsFiles(SRC)) n += pagedReads(readFileSync(file, 'utf8')).length;
    assert.ok(n >= 5, 'expected several paged reads in src/, found ' + n);
});

test('the scanner can actually see a single-key paged read', () => {
    // A detector that never fires is not a detector. Feed it the exact
    // pre-fix shape and require it to report one order key and no exemption.
    const prefix = [
        'const res = await sb.from("var_backtest_runs")',
        '    .select("as_of")',
        '    .order("as_of", { ascending: false })',
        '    .range(from, from + PAGE - 1);',
    ].join('\n');
    const hits = pagedReads(prefix);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].orders, 1);
    assert.equal(hits[0].exempt, false);

    // ...and pass the fixed shape.
    const fixed = prefix.replace(
        '    .range(', '    .order("id", { ascending: true })\n    .range(');
    assert.equal(pagedReads(fixed)[0].orders, 2);
});

test('a comment mentioning .order() does not count as an order key', () => {
    const src = [
        'const res = await sb.from("t")',
        '    // we used to call .order() twice here',
        '    .select("a")',
        '    .order("a")',
        '    .range(0, 999);',
    ].join('\n');
    assert.equal(pagedReads(src)[0].orders, 1);
});

test('a long comment between .from( and .range( does not hide the chain', () => {
    const filler = new Array(30).fill('    // explanation line').join('\n');
    const src = [
        'return sb.from("t")',
        '    .select("a")',
        filler,
        '    .order("a")',
        '    .range(0, 999);',
    ].join('\n');
    const hits = pagedReads(src);
    assert.equal(hits.length, 1, 'the chain must still be found');
    assert.equal(hits[0].orders, 1);
});

test('TOTAL ORDER: exempts a single key, and only when justified', () => {
    const base = [
        'return sb.from("v")',
        '    .select("k")',
        '    .order("k")',
        '    .range(0, 999);',
    ].join('\n');
    assert.equal(pagedReads(base)[0].exempt, false);
    const justified = '// TOTAL ORDER: k is unique on this view.\n' + base;
    assert.equal(pagedReads(justified)[0].exempt, true);
});

// ── the pager still behaves ──────────────────────────────────────────────

test('fetchPaged still recovers every row past the cap', async () => {
    const server = (from, to) => {
        const total = 2696;
        const end = Math.min(to, from + PAGE_SIZE - 1, total - 1);
        const data = [];
        for (let i = from; i <= end; i++) data.push({ i });
        return Promise.resolve({ data, error: null });
    };
    const rows = await fetchPaged(server, 'price_history');
    assert.equal(rows.length, 2696);
});
