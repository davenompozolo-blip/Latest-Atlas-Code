// ============================================================
// Nexus — Holdings, geography projection
// ------------------------------------------------------------
// The second projection behind the Holdings MAP toggle. It is the same book
// and the same candidate universe as the positioning map, in physical space
// instead of risk space. The filter chips, search and sector dropdown belong
// to NexusBookMap and apply to both projections; only the plot and the rail
// change.
//
// Selecting a country here filters the positioning map to the names that earn
// there (held names on the resolver, candidates on recorded domicile), so
// "what does my China exposure look like in correlation terms" is two clicks.
//
// Nothing here fetches from Supabase directly: the reads are geoData.js's,
// shared with Trade, so the two surfaces cannot disagree about a country.
// ============================================================

import React from 'react';
import { GeoSurface } from '../../geo/GeoSurface.js';
import { loadGeoBook } from '../../geo/geoData.js';
import { exposureFrom, coverageState, legendFor, pct, pp, REGIONS } from '../../geo/geoCompute.js';
import { bookPointsByDomicile, railRanking, coverageSentence, fallbackNote } from './nexusBookGeoCompute.js';

const { useState, useEffect, useMemo } = React;
const e = React.createElement;

// This consumer loads the candidate universe, so it satisfies the one
// prerequisite the Book-and-candidates layer declares.
export const GEO_SATISFIED = new Set(['candidate-universe']);

let bookPromise = null;
/** One read per session: toggling the projection must not refetch. */
export function useGeoBook(enabled) {
    const [s, setS] = useState({ loading: true });
    useEffect(() => {
        if (!enabled) return undefined;
        let alive = true;
        if (!bookPromise) bookPromise = loadGeoBook().catch((err) => { bookPromise = null; throw err; });
        bookPromise.then((b) => { if (alive) setS({ loading: false, book: b }); })
            .catch((err) => {
                console.error('[nexus] geography read failed:', err && err.message, err);
                if (alive) setS({ loading: false, failed: true });
            });
        return () => { alive = false; };
    }, [enabled]);
    return s;
}

/** Everything the projection and the country filter need, from one book. */
export function useGeoContext(geo) {
    return useMemo(() => {
        const b = geo.book;
        if (!b) return null;
        const ok = (x) => x && x.status === 'ok';
        const names = new Map();
        const centroids = new Map();
        for (const c of ok(b.countries) ? b.countries.data : []) {
            names.set(c.iso2, c.name);
            if (c.centroid_lon != null) centroids.set(c.iso2, [Number(c.centroid_lon), Number(c.centroid_lat)]);
        }
        const domicileBySymbol = new Map();
        for (const r of ok(b.domiciles) ? b.domiciles.data : []) {
            if (r.assets && r.assets.symbol) domicileBySymbol.set(r.assets.symbol, r.iso2);
        }
        return {
            names, centroids, domicileBySymbol,
            revenue: ok(b.revenue.exposure) ? exposureFrom(b.revenue.exposure.data) : null,
            domicile: ok(b.domicile.exposure) ? exposureFrom(b.domicile.exposure.data) : null,
            revenueSummary: ok(b.revenue.summary) ? b.revenue.summary.data : null,
            domicileSummary: ok(b.domicile.summary) ? b.domicile.summary.data : null,
            revenueDetail: ok(b.revenue.detail) ? b.revenue.detail.data : [],
            domicileDetail: ok(b.domicile.detail) ? b.domicile.detail.data : [],
        };
    }, [geo.book]);
}

export function NexusBookGeo({ ctx, rows, basis, country, onCountry, renderer }) {
    const [hover, setHover] = useState(null);
    const [viewNonce, setViewNonce] = useState(0);
    const [region, setRegion] = useState('world');

    const exposure = basis === 'domicile' ? ctx.domicile : ctx.revenue;
    const summary = basis === 'domicile' ? ctx.domicileSummary : ctx.revenueSummary;
    const gate = coverageState(summary, basis);
    const layerKey = basis === 'domicile' ? 'domicile' : 'revenue-source';

    const pts = useMemo(() => bookPointsByDomicile(rows, ctx.domicileBySymbol, ctx.centroids), [rows, ctx]);
    const overlays = useMemo(() => ({ bookPoints: pts.points }), [pts]);
    const rank = useMemo(() => railRanking({
        revenue: ctx.revenue, domicile: ctx.domicile, revenueSummary: ctx.revenueSummary, names: ctx.names,
    }), [ctx]);
    const note = fallbackNote(ctx.revenueSummary);
    const regionDef = REGIONS.find((r) => r.key === region) || REGIONS[0];
    const view = useMemo(() => ({ bounds: regionDef.bounds, pov: regionDef.pov, nonce: region + ':' + viewNonce }),
        [regionDef, region, viewNonce]);

    const heldHere = rows.filter((r) => r.held).length;
    const candHere = rows.length - heldHere;

    return e('div', { className: 'nbgeo' },
        e('div', { className: 'nbgeo-plot' },
            gate.muted ? e('div', { className: 'nbgeo-gate', role: 'status' }, e('b', null, 'MUTED · '), gate.sentence) : null,
            e('div', { className: 'nbgeo-regions' },
                REGIONS.map((r) => e('button', {
                    key: r.key, type: 'button', className: 'nf-viewbtn' + (region === r.key ? ' is-on' : ''),
                    onClick: () => { setRegion(r.key); setViewNonce((n) => n + 1); },
                }, r.label))),
            e('div', { className: 'nbgeo-map' },
                e(GeoSurface, {
                    exposure: exposure ? exposure.map : null,
                    layers: [layerKey, 'book-positions'],
                    renderer,
                    scale: { mode: 'weight', muted: gate.muted },
                    selected: country,
                    onSelect: (iso) => onCountry(iso && iso === country ? null : iso),
                    onHover: setHover,
                    overlays,
                    view,
                    centroids: ctx.centroids,
                }),
                hover && ctx.names.get(hover) ? e('div', { className: 'nbgeo-hover' },
                    ctx.names.get(hover), ' · ',
                    exposure && exposure.map.get(hover) ? pct(exposure.map.get(hover).weight) : 'no exposure') : null),
            e('div', { className: 'nbmap-legend' },
                legendFor('weight').map((b) => e('span', { key: b.key, className: 'nbmap-k' + (gate.muted ? ' is-muted' : '') },
                    e('span', { className: 'nbgeo-sw', style: { background: `rgb(${b.rgb.join(',')})` } }), b.label)),
                e('span', { className: 'nbmap-k' }, e('span', { className: 'nbgeo-ring' }), 'in the book · radius = weight'),
                e('span', { className: 'nbmap-k' }, e('span', { className: 'nbmap-dot', style: { background: '#8b98a8' } }), 'candidates · by domicile')),
            e('p', { className: 'nbmap-scope' },
                `Shading is the whole book on the ${basis === 'domicile' ? 'domicile' : 'revenue'} basis; the filters apply to the points. `,
                `${heldHere} held and ${candHere} candidate names in the current filter`,
                pts.unplacedCand || pts.unplacedHeld
                    ? ` · ${pts.unplacedHeld + pts.unplacedCand} with no recorded domicile are not placed (they stay on the positioning map)`
                    : '',
                '. Markers sit at a country’s label point: no issuer headquarters is on file, so one marker per country is the precision the data has.')),

        e('div', { className: 'nbmap-side' },
            e('div', { className: 'nbmap-sec', style: { marginTop: 0 } },
                rank.mode === 'gap' ? 'WHERE YOU EARN, NOT WHERE YOU ARE LISTED' : 'WHERE THE BOOK IS DOMICILED'),
            rank.rows.length
                ? e('div', null, rank.rows.map((r) => e('button', {
                    key: r.iso2, type: 'button',
                    className: 'nbmap-rank' + (country === r.iso2 ? ' is-on' : ''),
                    onClick: () => onCountry(country === r.iso2 ? null : r.iso2),
                    title: r.name,
                },
                    e('span', { className: 'nbmap-rtk' }, r.iso2),
                    e('span', { className: 'nbmap-rr' + (rank.mode === 'gap' ? (r.value >= 0 ? ' is-pos' : ' is-neg') : ' is-neutral') },
                        rank.mode === 'gap' ? pp(r.value) : pct(r.value)),
                    e('span', { className: 'nbmap-rv' }, r.coverage != null ? pct(r.coverage, 0) : ''))))
                : e('div', { className: 'nbmap-note' }, rank.reason || 'Nothing to rank.'),
            rank.mode !== 'gap' && rank.reason ? e('p', { className: 'nbmap-note' }, rank.reason) : null,
            note ? e('p', { className: 'nbmap-note' }, note) : null,
            e('p', { className: 'nbmap-note' },
                country
                    ? `Filtered to ${ctx.names.get(country) || country}: held names placing weight there on the ${basis} basis, and candidates domiciled there. Switch to POSITIONING to see them in correlation terms.`
                    : 'Click any country to filter the positioning map to the names that earn there.')),

        e('p', { className: 'nbgeo-foot' }, coverageSentence(ctx.revenueSummary)));
}

export default NexusBookGeo;
