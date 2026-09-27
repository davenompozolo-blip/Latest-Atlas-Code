// A multi-asset price_history read must order ASSET-MAJOR.
//
// `.in('asset_id', ids).order('price_date')` makes the planner walk the
// price_date index across the whole ~1,900-name universe to find the first
// page. On 2026-09-27 that cancelled page 0 of every Performance batch at the
// 3s anon cap on BOTH accounts, and Contribution / Factor Engine / Regime
// Slicer read "no price history". Asset-major is served per asset off the
// unique index. Same rule `bookPriceRead.test.mjs` enforces for api/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function stripComments(src) {
    return src.split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}

export function dateMajorMultiAssetReads(src) {
    const code = stripComments(src);
    const hits = [];
    const re = /from\(\s*['"]price_history['"]\s*\)/g;
    let m;
    while ((m = re.exec(code))) {
        const chunk = code.slice(m.index, m.index + 1200).split(/\.then\(|\.range\(|;\s*\n/)[0];
        if (!/\.in\(\s*['"]asset_id['"]/.test(chunk)) continue;
        const first = chunk.match(/\.order\(\s*['"]([a-z_]+)['"]/);
        if (first && first[1] === 'price_date') hits.push(code.slice(0, m.index).split('\n').length);
    }
    return hits;
}

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
        else if (/\.(js|jsx|mjs)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) out.push(p);
    }
    return out;
}

test('the detector finds the shipped date-major shape', () => {
    const bad = `sb.from('price_history')
        .select('asset_id, price_date, close')
        .in('asset_id', batchIds)
        .order('price_date', { ascending: false })
        .order('asset_id', { ascending: true })
        .range(from, to);`;
    assert.equal(dateMajorMultiAssetReads(bad).length, 1);
});

test('the detector accepts asset-major and single-asset reads, and ignores comments', () => {
    const ok = `sb.from('price_history')
        // .order('price_date') was the old shape
        .in('asset_id', ids)
        .order('asset_id', { ascending: true })
        .order('price_date', { ascending: false })
        .range(a, b);
      sb.from('price_history').eq('asset_id', id).order('price_date', { ascending: true });`;
    assert.deepEqual(dateMajorMultiAssetReads(ok), []);
});

test('no multi-asset price_history read in src/ orders date-major', () => {
    const files = walk(ROOT);
    assert.ok(files.length > 50, 'the scan found the source tree');
    const bad = [];
    for (const f of files) {
        for (const line of dateMajorMultiAssetReads(fs.readFileSync(f, 'utf8'))) {
            bad.push(path.relative(ROOT, f) + ':' + line);
        }
    }
    assert.deepEqual(bad, []);
});
