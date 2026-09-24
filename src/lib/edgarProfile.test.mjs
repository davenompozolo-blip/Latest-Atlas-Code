// Fixtures are the REAL shapes measured against EDGAR on 2026-09-24.
import test from 'node:test';
import assert from 'node:assert/strict';
import { profileFromSubmissions, SOURCE_EDGAR } from './edgarProfile.js';

// Apple's actual submissions payload, trimmed to the fields this layer reads.
const AAPL = {
    cik: '0000320193', entityType: 'operating', sic: '3571',
    sicDescription: 'Electronic Computers', ownerOrg: '06 Technology',
    name: 'Apple Inc.', tickers: ['AAPL'], exchanges: ['Nasdaq'],
    ein: '942404110', lei: null,
    description: '', website: '', investorWebsite: '',
    category: 'Large accelerated filer', fiscalYearEnd: '0926',
    stateOfIncorporation: 'CA',
    formerNames: [{ name: 'APPLE INC', from: '2007-01-10T05:00:00.000Z', to: '2019-08-05T00:00:00.000Z' }],
};

test('SIC is a real industry, distinct from any vendor sector', () => {
    const p = profileFromSubmissions(AAPL, 'AAPL');
    assert.equal(p.sic, '3571');
    assert.equal(p.sic_description, 'Electronic Computers');
    // The whole point: this is NOT "Technology", which is what both `sector`
    // and `industry` read on screen before this layer existed.
    assert.notEqual(p.sic_description, 'Technology');
});

test('an EMPTY description is absent, never an empty string', () => {
    // EDGAR carries `description`, `website` and `investorWebsite` as keys and
    // leaves them blank on every filer measured. '' would render as an empty
    // box that looks like a loaded-but-empty field.
    const p = profileFromSubmissions(AAPL, 'AAPL');
    assert.equal(p.description, null);
    assert.equal(p.website, null);
    assert.equal(p.investor_website, null);
    assert.notEqual(p.description, '');
});

test('whitespace is blank too', () => {
    const p = profileFromSubmissions({ ...AAPL, description: '   \n  ' }, 'AAPL');
    assert.equal(p.description, null);
});

test('a real description survives', () => {
    const p = profileFromSubmissions({ ...AAPL, description: 'Makes phones.' }, 'AAPL');
    assert.equal(p.description, 'Makes phones.');
});

test('identity and classification fields are carried', () => {
    const p = profileFromSubmissions(AAPL, 'AAPL');
    assert.equal(p.symbol, 'AAPL');
    assert.equal(p.cik, '0000320193');
    assert.equal(p.entity_name, 'Apple Inc.');
    assert.equal(p.sec_owner_org, '06 Technology');
    assert.equal(p.filer_category, 'Large accelerated filer');
    assert.equal(p.entity_type, 'operating');
    assert.equal(p.state_of_incorporation, 'CA');
    assert.deepEqual(p.exchanges, ['Nasdaq']);
    assert.deepEqual(p.tickers, ['AAPL']);
    assert.equal(p.source, SOURCE_EDGAR);
});

test('fiscalYearEnd is MMDD kept verbatim', () => {
    assert.equal(profileFromSubmissions(AAPL, 'AAPL').fiscal_year_end, '0926');
    // Target closes in early February.
    assert.equal(profileFromSubmissions({ ...AAPL, fiscalYearEnd: '0201' }, 'TGT').fiscal_year_end, '0201');
});

test('a malformed fiscalYearEnd is refused rather than stored', () => {
    for (const bad of ['', '9', 'Sept', null, 926]) {
        assert.equal(profileFromSubmissions({ ...AAPL, fiscalYearEnd: bad }, 'X').fiscal_year_end, null);
    }
});

test('former names are kept with their date range', () => {
    const p = profileFromSubmissions(AAPL, 'AAPL');
    assert.equal(p.former_names.length, 1);
    assert.equal(p.former_names[0].name, 'APPLE INC');
    assert.ok(p.former_names[0].from.startsWith('2007-01-10'));
});

test('no former names is null, not an empty array', () => {
    assert.equal(profileFromSubmissions({ ...AAPL, formerNames: [] }, 'X').former_names, null);
    assert.equal(profileFromSubmissions({ ...AAPL, formerNames: null }, 'X').former_names, null);
});

test('an empty exchange list is absent rather than empty', () => {
    assert.equal(profileFromSubmissions({ ...AAPL, exchanges: [] }, 'X').exchanges, null);
    assert.equal(profileFromSubmissions({ ...AAPL, exchanges: ['', '  '] }, 'X').exchanges, null);
});

test('a payload with no CIK is not a profile', () => {
    // A response that cannot identify a filer must not become a row keyed on
    // the symbol we asked about.
    for (const bad of [null, undefined, {}, { name: 'X' }, { cik: '' }, 'string']) {
        assert.equal(profileFromSubmissions(bad, 'X'), null);
    }
});

test('JPM resolves to a bank, which is what picks the EQ-4 framework', () => {
    const p = profileFromSubmissions({
        ...AAPL, cik: '0000019617', sic: '6021',
        sicDescription: 'National Commercial Banks', name: 'JPMORGAN CHASE & CO',
    }, 'JPM');
    assert.equal(p.sic_description, 'National Commercial Banks');
    // `Financials` pools banks and insurers; SIC does not.
    assert.equal(p.sic, '6021');
});
