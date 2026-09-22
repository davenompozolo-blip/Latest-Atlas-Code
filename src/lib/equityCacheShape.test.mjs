// ============================================================
// api/equity.js — the equity_cache row has TWO writers and they do not agree
// on its shape.
//
// This endpoint writes { overview, financials, peers, _source }. The
// sync_fundamentals edge function writes
// { overview, profile, metric, market_cap_usd, source, fetched_at } to the same
// (symbol, 'overview') row, with no `financials` key. Reading
// `ovData.financials || null` against that shape yields null, so the endpoint
// answered 200 with `financials: {}` and `source: 'unknown'` — and every
// absolute the valuation module needs was absent.
//
// Measured 2026-09-22 against production: 895 of 913 'overview' rows carried
// the sync_fundamentals shape. 98% of symbols.
//
// A scanner rather than a behavioural test: getOverview is not exported and
// reaches the network and the database on every path. What has to hold is a
// property of the source, and this fails on the exact pre-fix shape.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EQUITY = readFileSync(
    fileURLToPath(new URL('../../api/equity.js', import.meta.url)), 'utf8');

function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

test('a cached payload without a financials key is not served as a cache hit', () => {
    const src = stripComments(EQUITY);
    assert.ok(/hasOwnProperty\.call\(\s*db\s*,\s*['"]financials['"]\s*\)/.test(src),
        'getOverview must test for the financials key on the cached row: its '
      + 'absence means another writer owns this row and the payload cannot '
      + 'serve this endpoint');
    assert.ok(/isForeignShape/.test(src), 'and name that condition');
    // The cache-hit return must be gated on it, not merely computed.
    assert.ok(/if\s*\(\s*!isStale\s*&&\s*!isForeignShape\s*\)/.test(src),
        'the early return must be gated on the shape check, or the check is '
      + 'a comment with a variable attached');
});

test('the foreign shape is logged, not swallowed', () => {
    // A silent refetch is indistinguishable from a cache that simply never
    // warms. This file has three entries about swallowed failures costing
    // months; a shape mismatch between two writers should be visible.
    const src = stripComments(EQUITY);
    const idx = src.indexOf('isForeignShape');
    assert.ok(idx > -1);
    const region = src.slice(idx, idx + 600);
    assert.ok(/console\.(warn|error)/.test(region),
        'ignoring another writer\'s payload must be logged');
});
