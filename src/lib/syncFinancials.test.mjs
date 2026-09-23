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

// ── EQ-3 probe: the concept measurement ────────────────────────────────────

import { indexReport, probeConcepts, GAAP_CONCEPTS, INSTITUTION_CONCEPTS }
    from '../../api/sync-financials.js';

test('indexReport flattens all three sections and keeps the first tag', () => {
    const idx = indexReport({
        ic: [{ concept: 'Revenues', label: 'Net sales', value: '100' },
             { concept: 'Revenues', label: 'DUPLICATE', value: '999' }],
        bs: [{ concept: 'Assets', label: 'Total assets', value: '500' }],
        cf: [{ concept: 'NetCashProvidedByUsedInOperatingActivities', label: 'CFO', value: '40' }],
    });
    assert.equal(idx.Revenues.value, 100);
    assert.equal(idx.Revenues.label, 'Net sales');     // first wins, not the duplicate
    assert.equal(idx.Revenues.section, 'ic');
    assert.equal(idx.Assets.section, 'bs');
    assert.equal(idx.NetCashProvidedByUsedInOperatingActivities.section, 'cf');
});

test('indexReport carries the LABEL, so an unrecognised tag is still identifiable', () => {
    // A concept nobody in the candidate list recognises is exactly the case
    // the probe exists to surface, and the human-written label in the filing
    // is how a reader identifies it.
    const idx = indexReport({ bs: [{ concept: 'SomeFilerSpecificTag', label: 'Loans, net', value: '7' }] });
    assert.equal(idx.SomeFilerSpecificTag.label, 'Loans, net');
});

test('a non-numeric value becomes NULL, never 0', () => {
    const idx = indexReport({ ic: [{ concept: 'GrossProfit', label: 'GP', value: 'None' },
                                   { concept: 'Revenues', label: 'R', value: 'NaN' }] });
    assert.equal(idx.GrossProfit.value, null);
    assert.equal(idx.Revenues.value, null);
});

test('probeConcepts reports a field that matched NOTHING rather than omitting it', () => {
    // A field silently missing from the report reads as one nobody asked
    // about. "No filer in this sample tags operating income" is a finding.
    const idx = indexReport({ ic: [{ concept: 'Revenues', value: '1' }] });
    const out = probeConcepts([idx], { total_revenue: GAAP_CONCEPTS.total_revenue, gross_profit: ['GrossProfit'] });
    assert.equal(out.total_revenue.matched, 'Revenues');
    assert.equal(out.total_revenue.periods_covered, 1);
    assert.ok('gross_profit' in out);
    assert.equal(out.gross_profit.matched, null);
    assert.equal(out.gross_profit.periods_covered, 0);
});

test('two different tags across the sample are flagged as cross-filer drift', () => {
    // This is the whole load-bearing unknown: Finnhub is AS-REPORTED, so the
    // tag is the filer's choice. One company's `Revenues` is another's
    // `RevenueFromContractWithCustomerExcludingAssessedTax`, and a mapping
    // that assumes one returns NULL for the other — honest and useless.
    const a = indexReport({ ic: [{ concept: 'Revenues', value: '1' }] });
    const b = indexReport({ ic: [{ concept: 'RevenueFromContractWithCustomerExcludingAssessedTax', value: '2' }] });
    const out = probeConcepts([a, b], { total_revenue: GAAP_CONCEPTS.total_revenue });
    assert.equal(out.total_revenue.periods_covered, 2);
    assert.equal(out.total_revenue.tags_seen.length, 2);

    // One consistent tag carries NO drift marker — absent, not an empty array,
    // so the common case does not read as a finding.
    const single = probeConcepts([a, a], { total_revenue: GAAP_CONCEPTS.total_revenue });
    assert.equal(single.total_revenue.tags_seen, undefined);
});

test('the institution concepts cover all three CFA L2 V3 LM4 frameworks', () => {
    // These are the line items normalisation DISCARDS, which is why EQ-4
    // cannot be built on Alpha Vantage at all.
    const k = Object.keys(INSTITUTION_CONCEPTS);
    // CAMELS: capital, asset quality, earnings, liquidity.
    ['tier_one_capital', 'risk_weighted_assets', 'allowance_for_credit_losses',
     'nonaccrual_loans', 'net_interest_income', 'deposits'].forEach(f => assert.ok(k.includes(f), f));
    // P&C: the combined ratio needs earned AND written premiums — their
    // denominators genuinely differ, so both must be present.
    ['premiums_earned_net', 'premiums_written_net', 'losses_and_lae_incurred'].forEach(f => assert.ok(k.includes(f), f));
    // Life / health.
    ['policyholder_benefits', 'future_policy_benefits'].forEach(f => assert.ok(k.includes(f), f));
    // Every entry is a non-empty candidate list.
    Object.entries(INSTITUTION_CONCEPTS).forEach(([f, c]) => {
        assert.ok(Array.isArray(c) && c.length > 0, f);
    });
});

// ── the namespace prefix, found by the probe's first live run ───────────────

import { conceptKey, taxonomyOf, indexByLocalName } from '../../api/sync-financials.js';

test('the three us-gaap spellings resolve to one key', () => {
    // Measured: the first probe returned MISS on EVERY field for GOOGL while
    // indexing 149 distinct concepts, and 3–4 of 16 periods for the others.
    // A tag matching on some periods and not others of the SAME filer is a
    // FORMAT difference, not a filer choosing a different concept.
    assert.equal(conceptKey('us-gaap:Assets'), 'assets');
    assert.equal(conceptKey('us-gaap_Assets'), 'assets');
    assert.equal(conceptKey('Assets'), 'assets');
    assert.equal(conceptKey('US-GAAP:Assets'), 'assets');   // case-insensitive
    assert.equal(conceptKey(null), '');
    assert.equal(conceptKey(''), '');
});

test('a FOREIGN taxonomy keeps its prefix and does NOT match us-gaap', () => {
    // THIS TEST ASSERTED THE OPPOSITE UNTIL PR #808's REVIEW. The first fix
    // took the last ':' or '_' and dropped whatever preceded it, so
    // `ifrs-full:Assets` collapsed to `assets` and was counted as the
    // US-GAAP candidate -- the probe would report mapping coverage it does
    // not have. ASML files in IFRS, so this is in the live sample, not
    // hypothetical.
    assert.equal(conceptKey('ifrs-full:Assets'), 'ifrs-full:assets');
    assert.equal(conceptKey('issuer:Assets'), 'issuer:assets');
    assert.equal(conceptKey('tgt_Custom'), 'tgt:custom');
    assert.notEqual(conceptKey('ifrs-full:Assets'), conceptKey('us-gaap:Assets'));

    assert.equal(taxonomyOf('us-gaap:Assets'), 'us-gaap');
    assert.equal(taxonomyOf('ifrs-full:Assets'), 'ifrs-full');
    assert.equal(taxonomyOf('Assets'), null);   // already stripped by Finnhub
});

test('an IFRS filer reports a MISS, and says the tag exists in IFRS', () => {
    // A miss because the concept is absent and a miss because the filer uses
    // another taxonomy are different findings, and collapsing them is exactly
    // what the defect above did. The second must be legible.
    const ifrs = indexReport({ bs: [{ concept: 'ifrs-full:Assets', value: '9' }] });
    const out = probeConcepts([ifrs], { total_assets: ['Assets'] });

    assert.equal(out.total_assets.matched, null, 'an IFRS tag is not a us-gaap match');
    assert.equal(out.total_assets.periods_covered, 0);
    assert.deepEqual(out.total_assets.foreign_taxonomy_tags, ['ifrs-full:Assets']);
});

test('a us-gaap match reports no foreign taxonomy', () => {
    const us = indexReport({ bs: [{ concept: 'us-gaap:Assets', value: '1' }] });
    const out = probeConcepts([us], { total_assets: ['Assets'] });
    assert.equal(out.total_assets.periods_covered, 1);
    assert.equal(out.total_assets.foreign_taxonomy_tags, undefined);
});

test('probeConcepts matches across BOTH tag formats and reports the raw one', () => {
    const bare = indexReport({ bs: [{ concept: 'Assets', value: '1' }] });
    const ns   = indexReport({ bs: [{ concept: 'us-gaap:Assets', value: '2' }] });
    const und  = indexReport({ bs: [{ concept: 'us-gaap_Assets', value: '3' }] });

    const out = probeConcepts([bare, ns, und], { total_assets: ['Assets'] });
    assert.equal(out.total_assets.periods_covered, 3);
    // The RAW tag is reported, not the normalised one — a reader chasing a
    // filing needs the string the filing actually used.
    assert.ok(['Assets', 'us-gaap:Assets', 'us-gaap_Assets'].includes(out.total_assets.matched));
    // Three spellings of one concept is a FORMAT difference, and it is still
    // surfaced as drift so the normalisation is visible rather than silent.
    assert.equal(out.total_assets.tags_seen.length, 3);
});

test('indexByLocalName keeps the raw concept alongside the value', () => {
    const idx = indexReport({ ic: [{ concept: 'us-gaap:NetIncomeLoss', label: 'NI', value: '7' }] });
    const by = indexByLocalName(idx);
    assert.equal(by.netincomeloss.value, 7);
    assert.equal(by.netincomeloss.concept, 'us-gaap:NetIncomeLoss');
    assert.equal(by.netincomeloss.label, 'NI');
});

// ============================================================
// EQ-4 · conceptSearch — the tool for mapping a filer class nobody has mapped.
//
// `sample_concepts` is the first 40 tags in an arbitrary order. An insurer
// reports 251-472 distinct concepts, so the line a framework needs is almost
// never in that slice, and a candidate list built without seeing the rest is
// a guess. These tests pin the two properties that make the search usable on
// an UNKNOWN vocabulary rather than a known one.
// ============================================================
import { conceptSearch } from '../../api/sync-financials.js';

const P_AND_C = [
    indexReport({
        ic: [
            { concept: 'us-gaap:PremiumsEarnedNet', label: 'Premiums earned, net', value: '100' },
            { concept: 'us-gaap:PolicyholderBenefitsAndClaimsIncurredNet', label: 'Claims and claim adjustment expenses', value: '60' },
            { concept: 'us-gaap:Revenues', label: 'Total revenues', value: '120' },
        ],
        bs: [{ concept: 'us-gaap:LiabilityForClaimsAndClaimsAdjustmentExpense', label: 'Claims and claim adjustment expense reserves', value: '900' }],
    }),
    indexReport({
        ic: [{ concept: 'us-gaap:PremiumsEarnedNet', label: 'Premiums earned, net', value: '110' }],
    }),
];

test('conceptSearch is ABSENT when nobody searched, never an empty array', () => {
    // An empty array reads as "nothing in this filing matches", which is a
    // finding. "No search was requested" is not a finding about the filing.
    assert.equal(conceptSearch(P_AND_C, ''), undefined);
    assert.equal(conceptSearch(P_AND_C, null), undefined);
    assert.deepEqual(conceptSearch(P_AND_C, 'zzz-no-such-line'), []);
});

test('conceptSearch matches the LABEL, so an unguessable tag is still findable', () => {
    // This is the whole point. Searching the tag can only find what you
    // already guessed; the label is what a human wrote in the filing, and the
    // CFA framework names its lines the way a human would.
    const byLabel = conceptSearch(P_AND_C, 'claim adjustment');
    const tags = byLabel.map(h => h.concept);
    assert.ok(tags.includes('us-gaap:PolicyholderBenefitsAndClaimsIncurredNet'));
    assert.ok(tags.includes('us-gaap:LiabilityForClaimsAndClaimsAdjustmentExpense'));

    // And neither of those two tags contains the string "claim adjustment"
    // in a form a tag search would find with that spacing.
    assert.equal(conceptSearch(P_AND_C, 'claim adjustment expense').length, 2);
});

test('conceptSearch counts PERIODS, so a one-year line is not read as a series', () => {
    const hits = conceptSearch(P_AND_C, 'premiumsearnednet');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].periods, 2);          // both filings

    const oneYear = conceptSearch(P_AND_C, 'Revenues');
    assert.equal(oneYear[0].periods, 1);       // the second filing does not carry it

    // Ranked by coverage, so the line a filer reports EVERY year sorts above
    // one it reported once — the opposite ordering would put the accident at
    // the top of a mapping exercise.
    const both = conceptSearch(P_AND_C, 'us-gaap:');
    assert.ok(both[0].periods >= both[both.length - 1].periods);
});

test('conceptSearch caps its result and the cap is bounded', () => {
    assert.equal(conceptSearch(P_AND_C, 'us-gaap:', 1).length, 1);
    // A caller cannot ask for an unbounded scan of a 472-concept filing.
    assert.ok(conceptSearch(P_AND_C, 'us-gaap:', 100000).length <= 200);
});

// ============================================================
// EQ-4 · the reported-lines loader.
//
// Every fixture here carries the shapes EQ-3 MEASURED against production, not
// invented ones: a foreign filer the endpoint returns nothing for, a 10-K
// alongside other forms, a concept the filer tags under IFRS, and a figure
// filed in a currency that is not the dollar.
// ============================================================
import { reportedRowsFor, reportedSummary, isoDate, SOURCE_REPORTED }
    from '../../api/sync-financials.js';

const TEN_K = {
    data: [{
        year: 2025, form: '10-K', accessNumber: '0000027419-25-000012',
        endDate: '2025-02-01 00:00:00', filedDate: '2025-03-12 16:04:00',
        report: {
            ic: [{ concept: 'us-gaap_PremiumsEarnedNet', label: 'Premiums earned, net', unit: 'usd', value: '100' }],
            bs: [{ concept: 'us-gaap_LiabilityForClaimsAndClaimsAdjustmentExpense', label: 'Claim reserves', unit: 'usd', value: '900' }],
            cf: [],
        },
    }],
};

test('a 10-K becomes one row per concept, with the tag the filer used', () => {
    const rows = reportedRowsFor(TEN_K, 'TRV');
    assert.equal(rows.length, 2);
    const prem = rows.find(r => r.concept === 'us-gaap_PremiumsEarnedNet');
    assert.equal(prem.source, SOURCE_REPORTED);
    assert.equal(prem.symbol, 'TRV');
    assert.equal(prem.fiscal_year, 2025);
    assert.equal(prem.value, 100);
    assert.equal(prem.label, 'Premiums earned, net');
    assert.equal(prem.section, 'ic');
    assert.equal(prem.accession, '0000027419-25-000012');
    // The RAW tag, not a normalised one. A reader chasing a filing needs the
    // string the filing actually used.
    assert.equal(prem.concept, 'us-gaap_PremiumsEarnedNet');
});

test('the UNIT is carried — a value without it compares a euro to a dollar', () => {
    const eur = reportedRowsFor({ data: [{ year: 2025, form: '10-K',
        report: { bs: [{ concept: 'us-gaap:Assets', unit: 'eur', value: '5' }] } }] }, 'X');
    assert.equal(eur[0].unit, 'eur');
    // Absent is NULL, never a defaulted 'usd' — that would assert a currency
    // the filing did not state.
    const none = reportedRowsFor({ data: [{ year: 2025, form: '10-K',
        report: { bs: [{ concept: 'us-gaap:Assets', value: '5' }] } }] }, 'X');
    assert.equal(none[0].unit, null);
});

test('a FOREIGN taxonomy is recorded as such, not laundered into us-gaap', () => {
    const rows = reportedRowsFor({ data: [{ year: 2025, form: '10-K', report: {
        bs: [{ concept: 'ifrs-full:Assets', value: '1' }, { concept: 'us-gaap:Assets', value: '2' }] } }] }, 'X');
    const ifrs = rows.find(r => r.concept === 'ifrs-full:Assets');
    const gaap = rows.find(r => r.concept === 'us-gaap:Assets');
    assert.equal(ifrs.taxonomy, 'ifrs-full');
    assert.equal(gaap.taxonomy, null);          // us-gaap is the unmarked case
    assert.equal(rows.length, 2);               // two concepts, not one
});

test('only 10-K filings are read, and a quarter is not a year', () => {
    const mixed = { data: [
        { year: 2025, form: '10-Q', report: { ic: [{ concept: 'A', value: '1' }] } },
        { year: 2025, form: '8-K',  report: { ic: [{ concept: 'B', value: '2' }] } },
        { year: 2025, form: '10-K', report: { ic: [{ concept: 'C', value: '3' }] } },
    ] };
    const rows = reportedRowsFor(mixed, 'X');
    assert.deepEqual(rows.map(r => r.concept), ['C']);
    // 10-K/A is an AMENDED annual report and still an annual report.
    const amended = reportedRowsFor({ data: [{ year: 2025, form: '10-K/A',
        report: { ic: [{ concept: 'C', value: '3' }] } }] }, 'X');
    assert.equal(amended.length, 1);
});

test('a filing that cannot say which year it describes yields no rows', () => {
    const noYear = { data: [{ form: '10-K', report: { ic: [{ concept: 'A', value: '1' }] } }] };
    assert.equal(reportedRowsFor(noYear, 'X').length, 0);
    const junkYear = { data: [{ year: 'FY25', form: '10-K', report: { ic: [{ concept: 'A', value: '1' }] } }] };
    assert.equal(reportedRowsFor(junkYear, 'X').length, 0);
});

test('one row per (year, concept) even when a concept appears twice', () => {
    // The table is keyed on it, so a duplicate would collide on insert and
    // take the whole symbol's transaction down with it.
    const dup = { data: [{ year: 2025, form: '10-K', report: {
        bs: [{ concept: 'us-gaap:Assets', label: 'Total assets', value: '1' }],
        cf: [{ concept: 'us-gaap:Assets', label: 'Total assets', value: '1' }],
    } }] };
    const rows = reportedRowsFor(dup, 'X');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].section, 'bs');        // the first occurrence wins
});

test('isoDate takes the date off a timestamp and refuses a malformed one', () => {
    assert.equal(isoDate('2025-02-01 00:00:00'), '2025-02-01');
    assert.equal(isoDate('2025-02-01'), '2025-02-01');
    assert.equal(isoDate('2025-02-01T16:04:00Z'), '2025-02-01');
    // Never a fabricated day. A malformed date is absent, not the first of
    // some month.
    assert.equal(isoDate('Feb 2025'), null);
    assert.equal(isoDate(''), null);
    assert.equal(isoDate(null), null);
});

test('NO FILINGS and NO 10-K are different findings', () => {
    // EQ-3 measured ASML, TSM, SONY and ABEV all returning `data: []` —
    // financials-reported is a SEC 10-K feed and a foreign private issuer
    // files a 20-F. Reporting that as "0 rows" reads as a load that produced
    // nothing, and the coverage finding disappears.
    const foreign = { data: [] };
    const s1 = reportedSummary(foreign, reportedRowsFor(foreign, 'ASML'));
    assert.equal(s1.reason, 'no_filings');
    assert.equal(s1.filings, 0);
    assert.deepEqual(s1.forms, []);

    const quarterlyOnly = { data: [{ year: 2025, form: '10-Q', report: { ic: [] } }] };
    const s2 = reportedSummary(quarterlyOnly, reportedRowsFor(quarterlyOnly, 'X'));
    assert.equal(s2.reason, 'no_10k_filings');
    assert.equal(s2.filings, 1);
    assert.deepEqual(s2.forms, ['10-Q']);       // names what WAS there

    assert.notEqual(s1.reason, s2.reason);
});

test('a successful summary carries the span, and reports no reason', () => {
    const s = reportedSummary(TEN_K, reportedRowsFor(TEN_K, 'TRV'));
    assert.equal(s.reason, null);
    assert.equal(s.periods, 1);
    assert.equal(s.year_min, 2025);
    assert.equal(s.year_max, 2025);
    assert.equal(s.rows, 2);
});

test('`taxonomy is not null` IS the foreign test, across all three spellings', () => {
    // The trap this column exists to avoid: taxonomyOf() returns the RAW
    // prefix, so a bare `Assets` and a prefixed `us-gaap:Assets` would differ
    // in a column whose whole job is to say "this filer is not on us-gaap".
    // Then `taxonomy is distinct from 'us-gaap'` counts every bare tag as
    // foreign, which is most of them.
    const rows = reportedRowsFor({ data: [{ year: 2025, form: '10-K', report: { bs: [
        { concept: 'Assets', value: '1' },
        { concept: 'us-gaap:Liabilities', value: '2' },
        { concept: 'us-gaap_Goodwill', value: '3' },
        { concept: 'ifrs-full:Equity', value: '4' },
        { concept: 'trv:UnderwritingExpense', value: '5' },
    ] } }] }, 'X');
    const tax = Object.fromEntries(rows.map(r => [r.concept, r.taxonomy]));
    assert.equal(tax['Assets'], null);
    assert.equal(tax['us-gaap:Liabilities'], null);
    assert.equal(tax['us-gaap_Goodwill'], null);
    assert.equal(tax['ifrs-full:Equity'], 'ifrs-full');
    // A FILER-SPECIFIC extension is foreign too. It is not us-gaap, so the
    // ratio layer must not match it against a us-gaap candidate.
    assert.equal(tax['trv:UnderwritingExpense'], 'trv');

    assert.equal(rows.filter(r => r.taxonomy !== null).length, 2);
});

// ============================================================
// EQ-4 · one filing per fiscal year.
//
// Found by the FIRST LIVE RUN, not by a fixture: CB failed on
// 23505 (source, symbol, fiscal_year, concept) already exists. CB returns 19
// filings all tagged `10-K` and 2011, 2012 and 2013 each appear twice -- the
// merged Chubb/ACE entity, two predecessor registrants filing for the same
// years under one ticker. Case 6 above covered a concept repeated WITHIN one
// filing; nothing covered the same year arriving in TWO.
// ============================================================
import { pickOnePerYear, supersededFilings } from '../../api/sync-financials.js';

const filing = (year, n, filed, acc) => ({
    year, form: '10-K', filedDate: filed, accessNumber: acc,
    report: { ic: Array.from({ length: n }, (_, i) => ({ concept: 'c' + i, value: '1' })) },
});

test('two filings for ONE fiscal year cannot both be emitted', () => {
    // The real CB shape: a full payload and a stub for the same year.
    const rows = reportedRowsFor({ data: [
        filing(2013, 3, '2014-02-28', 'A'),
        filing(2013, 1, '2014-03-01', 'B'),
    ] }, 'CB');
    const keys = rows.map(r => r.fiscal_year + '/' + r.concept);
    assert.equal(new Set(keys).size, keys.length, 'a duplicate key would be refused by the PK');
});

test('the RICHEST filing wins, not the latest — richest cannot lose a line', () => {
    // The stub here is filed LATER. Taking "latest" would drop two concepts
    // the other filing carried, which is the failure mode this rule avoids.
    const kept = pickOnePerYear([
        filing(2013, 3, '2014-02-28', 'A'),
        filing(2013, 1, '2014-03-01', 'B'),
    ]);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].accessNumber, 'A');
    assert.equal(kept[0].report.ic.length, 3);
});

test('an equal-sized pair is broken by filing date, then by accession', () => {
    const byDate = pickOnePerYear([
        filing(2013, 2, '2014-02-28', 'A'),
        filing(2013, 2, '2014-03-01', 'B'),
    ]);
    assert.equal(byDate[0].accessNumber, 'B');       // later filing wins
    // Fully deterministic even with no date to separate them: the loader must
    // not depend on the vendor's array order.
    const byAcc = pickOnePerYear([
        filing(2013, 2, null, 'B'),
        filing(2013, 2, null, 'A'),
    ]);
    assert.equal(byAcc[0].accessNumber, 'B');
});

test('distinct years are all kept — the rule dedupes, it does not collapse', () => {
    const kept = pickOnePerYear([filing(2013, 2, 'x', 'A'), filing(2012, 2, 'x', 'B'),
                                 filing(2011, 2, 'x', 'C')]);
    assert.equal(kept.length, 3);
    assert.deepEqual(kept.map(f => f.year).sort(), [2011, 2012, 2013]);
});

test('a superseded year is REPORTED, never dropped silently', () => {
    const data = [filing(2013, 3, 'x', 'A'), filing(2013, 1, 'y', 'B'), filing(2012, 2, 'z', 'C')];
    assert.deepEqual(supersededFilings(data), [{ year: 2013, filings: 2 }]);

    const s = reportedSummary({ data }, reportedRowsFor({ data }, 'CB'));
    assert.deepEqual(s.superseded, [{ year: 2013, filings: 2 }]);

    // ABSENT, not an empty array, when no year was duplicated: every other
    // symbol would otherwise carry a key that says nothing.
    const clean = [filing(2013, 2, 'x', 'A'), filing(2012, 2, 'y', 'B')];
    assert.equal(reportedSummary({ data: clean }, reportedRowsFor({ data: clean }, 'X')).superseded,
                 undefined);
});
