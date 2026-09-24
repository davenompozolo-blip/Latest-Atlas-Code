import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildProfileView, fiscalYearEndLabel,
    PROFILE_LOADED, PROFILE_NOT_LOADED, PROFILE_FAILED,
} from './companyProfileView.js';

// A real company_profile row as loaded 2026-09-24.
const AAPL = {
    symbol: 'AAPL', cik: '0000320193', entity_name: 'Apple Inc.',
    sic: '3571', sic_description: 'Electronic Computers',
    sec_owner_org: '06 Technology', filer_category: 'Large accelerated filer',
    entity_type: 'operating', fiscal_year_end: '0926',
    exchanges: ['Nasdaq'], tickers: ['AAPL'], state_of_incorporation: 'CA',
    ein: '942404110', description: null, website: null, investor_website: null,
    former_names: [{ name: 'APPLE INC', from: '2007-01-10T05:00:00.000Z', to: '2019-08-05T00:00:00.000Z' }],
};

test('sector and industry are separate and neither falls back to the other', () => {
    // The defect: SECTOR Technology / INDUSTRY Technology, both from
    // p.finnhubIndustry. Measured: 0 of 52 EDGAR industries equal the sector.
    const v = buildProfileView(AAPL, { sector: 'Technology' }, PROFILE_LOADED);
    assert.equal(v.sector, 'Technology');
    assert.equal(v.industry, 'Electronic Computers');
    assert.notEqual(v.industry, v.sector);
});

test('an industry is never handed over without naming its taxonomy', () => {
    const v = buildProfileView(AAPL, { sector: 'Technology' }, PROFILE_LOADED);
    assert.equal(v.industrySource, 'SEC SIC');
    assert.equal(v.sicCode, '3571');
});

test('no industry means the key is ABSENT, not null and not empty', () => {
    const v = buildProfileView({ ...AAPL, sic_description: null, sic: null },
        { sector: 'Technology' }, PROFILE_LOADED);
    assert.ok(!('industry' in v), 'a renderer cannot print what it was not handed');
    assert.ok(!('industrySource' in v), 'and no orphan taxonomy label');
    assert.ok(!('sicCode' in v));
    assert.equal(v.sector, 'Technology', 'the sector still stands on its own');
});

test('a blank industry is absent too', () => {
    const v = buildProfileView({ ...AAPL, sic_description: '   ' }, {}, PROFILE_LOADED);
    assert.ok(!('industry' in v));
});

test('EDGAR\'s empty description never reaches the shape', () => {
    // EDGAR carries `description`/`website` as keys, blank on every filer
    // measured. An empty field on screen is indistinguishable from a failed one.
    for (const blank of [null, '', '   ']) {
        const v = buildProfileView({ ...AAPL, description: blank, website: blank }, {}, PROFILE_LOADED);
        assert.ok(!('description' in v));
        assert.ok(!('website' in v));
    }
});

test('a real description WOULD be carried if EDGAR ever published one', () => {
    const v = buildProfileView({ ...AAPL, description: 'Designs phones.' }, {}, PROFILE_LOADED);
    assert.equal(v.description, 'Designs phones.');
});

test('a transport failure and an unloaded symbol are different facts', () => {
    const failed = buildProfileView(null, { sector: 'Technology' }, PROFILE_FAILED);
    assert.equal(failed.state, PROFILE_FAILED);
    assert.equal(failed.reason, 'profile_feed_unavailable');
    assert.ok(!('industry' in failed));

    const absent = buildProfileView(null, { sector: 'Technology' }, PROFILE_NOT_LOADED);
    assert.equal(absent.reason, 'profile_not_loaded');
    assert.notEqual(failed.reason, absent.reason,
        'never let a dead feed render as a statement about the company');
});

test('the sector survives a profile failure', () => {
    const v = buildProfileView(null, { sector: 'Technology' }, PROFILE_FAILED);
    assert.equal(v.sector, 'Technology');
});

test('identity fields are carried, and absent ones stay absent', () => {
    const v = buildProfileView(AAPL, {}, PROFILE_LOADED);
    assert.equal(v.entityName, 'Apple Inc.');
    assert.equal(v.cik, '0000320193');
    assert.equal(v.filerCategory, 'Large accelerated filer');
    assert.equal(v.stateOfIncorporation, 'CA');
    assert.deepEqual(v.exchanges, ['Nasdaq']);
    assert.deepEqual(v.formerNames, ['APPLE INC']);

    const bare = buildProfileView(
        { cik: '0000000001', sic_description: 'X' }, {}, PROFILE_LOADED);
    assert.ok(!('entityName' in bare));
    assert.ok(!('exchanges' in bare));
    assert.ok(!('formerNames' in bare));
});

test('fiscal year end says WHEN the year ends and not what it is called', () => {
    assert.equal(fiscalYearEndLabel('0926'), 'September 26');
    assert.equal(fiscalYearEndLabel('0201'), 'February 1');
    assert.equal(fiscalYearEndLabel('1231'), 'December 31');
});

test('a malformed fiscal year end yields no label rather than a wrong one', () => {
    for (const bad of ['', '9', '1350', '0000', '0132', 'abcd', null, 926]) {
        assert.equal(fiscalYearEndLabel(bad), null);
    }
});

test('JPM and MS are both Financials and are NOT the same industry', () => {
    // The vendor pools them; SIC does not, which is the discriminator EQ-4's
    // institution layer picks its framework with.
    const jpm = buildProfileView({ cik: '0000019617', sic: '6021', sic_description: 'National Commercial Banks' },
        { sector: 'Financials' }, PROFILE_LOADED);
    const ms = buildProfileView({ cik: '0000895421', sic: '6211', sic_description: 'Security Brokers, Dealers & Flotation Companies' },
        { sector: 'Financials' }, PROFILE_LOADED);
    assert.equal(jpm.sector, ms.sector);
    assert.notEqual(jpm.industry, ms.industry);
});
