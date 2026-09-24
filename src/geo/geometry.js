// Vendored Natural Earth geometry, decoded once per session.
//
// 1:110m (~104 KB) serves the globe and every flat zoom below 4; 1:50m
// (~726 KB) is fetched only when the flat map first zooms past 4. Feature ids
// are ISO 3166-1 alpha-2 (scripts/build-geo-assets.mjs), so a choropleth
// binds on the id with no lookup table in between.

import { feature } from 'topojson-client';

export const DETAIL_ZOOM = 4;

const cache = new Map();

export function loadCountries(res = '110m') {
    if (!cache.has(res)) {
        const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
        const p = fetch(base + 'geo/countries-' + res + '.json')
            .then((r) => {
                if (!r.ok) throw new Error('geometry ' + res + ': HTTP ' + r.status);
                return r.json();
            })
            .then((topo) => feature(topo, topo.objects.countries).features)
            .catch((err) => {
                cache.delete(res);
                throw err;
            });
        cache.set(res, p);
    }
    return cache.get(res);
}
