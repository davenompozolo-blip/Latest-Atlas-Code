import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assetIdsPath, bookPricesPath, symbolById } from './bookPriceRead.js';

test('prices are filtered on asset_id, interval pinned, asset-major total order', () => {
    const p = bookPricesPath(['a1', 'b2', 'a1'], '2026-07-15');
    assert.match(p, /asset_id=in\.\(a1,b2\)/);
    assert.match(p, /interval=eq\.1d/);
    // Asset-major, so idx_price_history_asset_interval_date serves it with no
    // sort; date-major walks the whole universe by date (see the module).
    assert.match(p, /order=asset_id\.asc,price_date\.desc$/);
    assert.doesNotMatch(p, /assets!inner/);
});

test('no ids, no path -- never an unfiltered read of the whole table', () => {
    assert.equal(bookPricesPath([], '2026-07-15'), null);
    assert.equal(assetIdsPath([]), null);
});

test('a malformed since is refused rather than sent', () => {
    assert.throws(() => bookPricesPath(['a1'], 'yesterday'));
});

test('symbols carrying a reserved character are quoted', () => {
    assert.equal(assetIdsPath(['AAPL', 'BRK.B']), 'assets?select=id,symbol&symbol=in.(AAPL,"BRK.B")');
});

test('symbolById maps ids and skips incomplete rows', () => {
    const m = symbolById([{ id: 'x', symbol: 'AAPL' }, { id: 'y' }, null]);
    assert.equal(m.get('x'), 'AAPL');
    assert.equal(m.size, 1);
});

// The embed filter is what timed out. Fail any handler that reintroduces it.
test('no api handler filters price_history through the assets embed', () => {
    const dir = new URL('../../api/', import.meta.url).pathname;
    const hits = [];
    for (const f of readdirSync(dir).filter(n => n.endsWith('.js'))) {
        const src = readFileSync(join(dir, f), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
        if (/price_history\?[^'"`]*assets!inner/.test(src) && /assets\.symbol=in\./.test(src)) hits.push(f);
    }
    assert.deepEqual(hits, []);
});
