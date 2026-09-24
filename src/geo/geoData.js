// ATLAS Geographic surface — the provider's reads.
//
// The surface itself never calls Supabase. This module is what a consumer
// uses to build its props, and it is the only file that knows the resolver's
// function names.
//
// Both bases load together. The resolver is ~30 ms a call, and having both in
// hand is what makes a basis switch a repaint rather than a round trip — the
// spec's 120 ms budget for that interaction cannot survive a network hop.
//
// Every read reports its own outcome. A basis that failed is `failed`, never
// an empty map: an empty map reads as "the book has no exposure there", which
// is a statement about the book, when the truth is that the query did not
// answer.

import { sb } from '../lib/supabase.js';
import { fetchPaged } from '../lib/pagedRead.js';

function rpc(name, args) {
    if (!sb) return Promise.reject(new Error('no Supabase client'));
    return sb.rpc(name, args).then((res) => {
        if (res.error) throw res.error;
        return res.data || [];
    });
}

function settled(p, label) {
    return p.then(
        (data) => ({ status: 'ok', data }),
        (err) => {
            console.error('[geo] ' + label + ' failed:', err && (err.message || err));
            return { status: 'failed', data: null, error: String((err && err.message) || err) };
        },
    );
}

export function loadBasis(basis, { portfolioId = null, asOf = null } = {}) {
    const args = { p_portfolio_id: portfolioId, p_basis: basis };
    if (asOf) args.p_as_of = asOf;
    return Promise.all([
        settled(rpc('resolve_geo_exposure', args), 'resolve_geo_exposure/' + basis),
        settled(rpc('geo_exposure_detail', args), 'geo_exposure_detail/' + basis),
        settled(rpc('geo_exposure_summary', args).then((r) => r[0] || null), 'geo_exposure_summary/' + basis),
    ]).then(([exposure, detail, summary]) => ({ basis, exposure, detail, summary }));
}

export function loadCountryRef() {
    if (!sb) return Promise.resolve({ status: 'failed', data: null });
    // 238 rows. TOTAL ORDER: iso2 is the primary key.
    return settled(
        fetchPaged((from, to) => sb.from('country_ref')
            .select('iso2, iso3, name, region, subregion, is_developed, centroid_lon, centroid_lat')
            .order('iso2', { ascending: true })
            .range(from, to), 'country_ref'),
        'country_ref',
    );
}

/**
 * Domicile for every security that has one (~920 rows — close enough to the
 * 1,000-row cap that it pages rather than trusts). Used to screen the
 * universe from a selected country.
 */
export function loadDomiciles() {
    if (!sb) return Promise.resolve({ status: 'failed', data: null });
    // TOTAL ORDER: security_id is the primary key.
    return settled(
        fetchPaged((from, to) => sb.from('security_domicile')
            .select('security_id, iso2, instrument_kind, source, assets(symbol, exchange)')
            .order('security_id', { ascending: true })
            .range(from, to), 'security_domicile'),
        'security_domicile',
    );
}

export function loadGeoBook(opts) {
    return Promise.all([
        loadBasis('revenue', opts),
        loadBasis('domicile', opts),
        loadCountryRef(),
        loadDomiciles(),
    ]).then(([revenue, domicile, countries, domiciles]) => ({ revenue, domicile, countries, domiciles }));
}
