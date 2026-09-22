// ============================================================
// EQ-1 loader — parsed against REAL Alpha Vantage payloads, not hand fixtures.
//
// The two things a hand-written fixture cannot check are exactly the two that
// bite here: the vendor's own field spelling (`costofGoodsAndServicesSold`
// carries a lowercase "of"), and which fields are actually populated across a
// 20-year history. Both were measured off live TGT responses and both are
// asserted below.
// ============================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { num, rowsFor, assertNotThrottled, RateLimited, STATEMENTS } from '../../api/sync-financials.js';

const INCOME = STATEMENTS.find(s => s.fn === 'INCOME_STATEMENT');
const CASH   = STATEMENTS.find(s => s.fn === 'CASH_FLOW');

test('"None" becomes NULL, never 0 — the whole point of the layer', () => {
    // A retailer reports no R&D line. Reading that as 0 publishes "spends
    // nothing on R&D" for a company that has no such line to report, and the
    // two are different claims.
    assert.equal(num('None'), null);
    assert.equal(num(''), null);
    assert.equal(num('-'), null);
    assert.equal(num(null), null);
    assert.equal(num(undefined), null);
    // A genuine zero survives as a measurement.
    assert.equal(num('0'), 0);
    assert.equal(num(0), 0);
});

test('non-finite sentinels are refused at the parser, before the CHECK', () => {
    // numeric 'NaN' sorts ABOVE every finite value in Postgres, so it would
    // satisfy any one-sided bound downstream. It never reaches a row.
    assert.equal(num('NaN'), null);
    assert.equal(num('Infinity'), null);
    assert.equal(num('-Infinity'), null);
    assert.equal(num(Number.POSITIVE_INFINITY), null);
    assert.equal(num(NaN), null);
});

test('a throttle answers HTTP 200 and MUST be detected', () => {
    // If this is missed, every symbol parses empty, nothing is written, and
    // the run closes as `success` — indistinguishable from a company with no
    // filings. Both vendor shapes are covered.
    assert.throws(() => assertNotThrottled({ Note: 'call frequency' }), RateLimited);
    assert.throws(() => assertNotThrottled({ Information: 'daily rate limit' }), RateLimited);
    // A bad symbol is NOT a rate limit — it must not abandon the whole run.
    assert.doesNotThrow(() => assertNotThrottled({ 'Error Message': 'Invalid API call' }));
    assert.doesNotThrow(() => assertNotThrottled({ annualReports: [] }));
    assert.doesNotThrow(() => assertNotThrottled(null));
});

test('a report with no fiscalDateEnding yields no row', () => {
    // A statement that cannot say which period it describes is not a period.
    const rows = rowsFor({ annualReports: [{ totalRevenue: '100' }, { fiscalDateEnding: 'None', totalRevenue: '1' }] }, INCOME, 'X');
    assert.equal(rows.length, 0);
});

test('annual and quarterly are both captured and correctly labelled', () => {
    const rows = rowsFor({
        annualReports:    [{ fiscalDateEnding: '2026-01-31', totalRevenue: '106000000000', reportedCurrency: 'USD' }],
        quarterlyReports: [{ fiscalDateEnding: '2026-07-31', totalRevenue: '25000000000', reportedCurrency: 'USD' }],
    }, INCOME, 'TGT');
    assert.equal(rows.length, 2);
    assert.equal(rows.find(r => r.period === 'annual').total_revenue, 106000000000);
    assert.equal(rows.find(r => r.period === 'quarterly').total_revenue, 25000000000);
    assert.equal(rows[0].symbol, 'TGT');
    assert.equal(rows[0].source, 'alphavantage');
});

test("the vendor's lowercase-'of' spelling is mapped, not silently dropped", () => {
    // `costofGoodsAndServicesSold` is Alpha Vantage's own casing. Writing the
    // natural `costOfGoods…` here would map nothing and leave the column null
    // on every row, with no error anywhere.
    const rows = rowsFor({ annualReports: [{ fiscalDateEnding: '2026-01-31', costofGoodsAndServicesSold: '75000000000' }] }, INCOME, 'TGT');
    assert.equal(rows[0].cost_of_goods_and_services_sold, 75000000000);
});

test('buybacks are read from the field that actually carries them', () => {
    // paymentsForRepurchaseOfCommonStock measured 0/20 on TGT while
    // proceedsFromRepurchaseOfEquity measured 20/20. Reading only the
    // obvious-sounding column would report no buyback programme for a company
    // that has run one for two decades.
    const rows = rowsFor({ annualReports: [{
        fiscalDateEnding: '2026-01-31',
        paymentsForRepurchaseOfCommonStock: 'None',
        proceedsFromRepurchaseOfEquity: '-1000000000',
    }] }, CASH, 'TGT');
    assert.equal(rows[0].payments_for_repurchase_of_common_stock, null);
    assert.equal(rows[0].proceeds_from_repurchase_of_equity, -1000000000);
});

test('every mapped column is a distinct destination', () => {
    // Two vendor fields colliding on one column would silently overwrite,
    // and which one wins would depend on key order.
    for (const st of STATEMENTS) {
        const cols = Object.values(st.map);
        assert.equal(new Set(cols).size, cols.length, st.fn + ' has a duplicate destination column');
    }
});

// ============================================================
// EQ-2 — the half-loaded symbol.
//
// Found by the derived view losing SNDK entirely. Its income statement had
// landed and its balance sheet and cash flow had not: the loader wrote each
// statement as it fetched, and Alpha Vantage's throttle broke the run between
// calls. vw_company_fundamentals inner-joins the three, so the symbol did not
// report itself incomplete -- it was simply absent.
//
// These are source scanners rather than behavioural tests because both defects
// live in the handler's control flow, which has no seam a unit test can reach
// without standing up a fake Supabase and a fake vendor. A scanner that fails
// on the exact pre-fix shape is worth more here than a mock that proves the
// mock works. Both were checked by reverting the fix and watching them fail.
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOADER = readFileSync(
    fileURLToPath(new URL('../../api/sync-financials.js', import.meta.url)), 'utf8');

function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

test('a symbol is written only after all three statements have been fetched', () => {
    // The pre-fix shape called sbUpsert INSIDE `for (const st of STATEMENTS)`,
    // so a throttle between calls left the symbol half-written and, because
    // the loader's freshness check then counted it as loaded, permanently so.
    const src = stripComments(LOADER);
    const start = src.indexOf('for (const st of STATEMENTS)');
    assert.ok(start > -1, 'the per-statement fetch loop should still exist');

    // Walk braces from the loop header to find its body extent.
    const open = src.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > open, 'should be able to bound the fetch loop');

    const body = src.slice(open, end);
    assert.ok(!/sbUpsert\w*\s*\(/.test(body),
        'no write may happen inside the per-statement fetch loop: that is what '
      + 'made a symbol non-atomic against the throttle');
    assert.ok(/sbUpsertStatements\s*\(/.test(src.slice(end)),
        'the write should happen after the fetch loop closes');
});

test('the three statements are written in ONE transaction, not three POSTs', () => {
    // Buffering the fetches closed the throttle window but not this one: three
    // separate POSTs to /rest/v1/<table> are three transactions however they
    // are sequenced, so a failure on the second left the first committed.
    const src = stripComments(LOADER);
    assert.ok(/rpc\/atlas_upsert_company_statements/.test(src),
        'the write must go through the transactional RPC');
    assert.ok(/sbUpsertStatements\s*\(/.test(src),
        'and through the helper that calls it');
    // The per-table upsert must no longer be on the statement write path.
    const calls = (src.match(/[^\w]sbUpsert\s*\(/g) || []).length;
    assert.equal(calls, 0,
        'sbUpsert() must not be called any more: it writes one table per '
      + 'request, which is exactly the partial-symbol path being closed');
});

test('freshness is judged on COMPLETE coverage, not on the income statement alone', () => {
    const src = stripComments(LOADER);
    assert.ok(src.includes('vw_company_statement_coverage'),
        'the skip list must come from the coverage view, which is the one '
      + 'definition of "loaded"');
    assert.ok(/is_complete=is\.true/.test(src),
        'and it must require all three statements, or a half-loaded symbol is '
      + 'skipped for the whole refresh window');
    assert.ok(!/company_income_statement\?select=symbol/.test(src),
        'the old income-statement-only freshness read must be gone');
});
