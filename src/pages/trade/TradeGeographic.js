// ATLAS Trade — /trade/geographic. The geographic surface's first consumer.
//
// The page owns the fetching, the URL state and all of the chrome — layer
// rail, toolbar, inspector, footer — and composes them around <GeoSurface>,
// which owns none of it. Everything the rail offers comes from the layer
// registry; nothing on this page declares a layer.
//
// What the page will not do, because each would make the map say something
// the data does not support:
//   - render a confident choropleth when revenue coverage is under 80% — it
//     mutes the fill and names the gap instead;
//   - hide unallocated weight — XX is its own row, selectable, with the
//     holdings behind it;
//   - rank a fallback beside a disclosure — fallback rows are marked, and the
//     largest-gap figure is withheld while coverage is under the floor;
//   - hide a layer it cannot draw — it greys out with the reason.

import React from 'react';
import '../../styles/geo.css';
import { e } from './shared.js';
import { GeoSurface } from '../../geo/GeoSurface.js';
import { loadGeoBook } from '../../geo/geoData.js';
import {
    LAYERS, GROUPS, availability, toggleLayer, defaultLayers, drawable, layerByKey,
} from '../../geo/layers/registry.js';
import {
    exposureFrom, coverageState, rankCountries, contributorsOf, flowsFrom, venuesFrom,
    CHOKEPOINTS, REGIONS, parseGeoState, geoQuery, footerStats, legendFor, pct, pp,
    isFallback, RESOLUTION_LABEL, screenByDomicile, UNALLOCATED, COVERAGE_FLOOR,
} from '../../geo/geoCompute.js';

const { useState, useEffect, useMemo, useCallback } = React;

// Nothing on file satisfies either prerequisite today. Declared here, by the
// consumer, so the registry stays a catalogue and never a status board.
const SATISFIED = new Set();

const KIND_TAG = { choropleth: 'GEOJSON', point: 'SCATTER', arc: 'ARC' };
const ALL_KEYS = LAYERS.map((l) => l.key);

function readUrl() {
    return parseGeoState(typeof window !== 'undefined' ? window.location.hash : '', ALL_KEYS);
}

export function TradeGeographic({ universe, onOpenTicket }) {
    const initial = useMemo(readUrl, []);
    const [renderer, setRenderer] = useState(initial.renderer);
    const [active, setActive] = useState(initial.layers || defaultLayers());
    const [selected, setSelected] = useState(initial.selected);
    const [region, setRegion] = useState('world');
    // Bumped on every chip click, so repeating a region re-centres.
    const [viewNonce, setViewNonce] = useState(0);
    const [hover, setHover] = useState(null);
    const [screenOpen, setScreenOpen] = useState(false);
    const [book, setBook] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let live = true;
        loadGeoBook().then((b) => { if (live) { setBook(b); setLoading(false); } })
            .catch((err) => {
                console.error('[geo] book load failed:', err && err.message);
                if (live) setLoading(false);
            });
        return () => { live = false; };
    }, []);

    // URL state: replace, not push — a layer toggle is not a navigation.
    useEffect(() => {
        const base = (window.location.hash || '').split('?')[0] || '#/trade/geographic';
        const next = base + geoQuery({ renderer, layers: active, selected: selected === UNALLOCATED ? null : selected });
        if (window.location.hash !== next) window.history.replaceState(null, '', next);
    }, [renderer, active.join(','), selected]);

    useEffect(() => { setScreenOpen(false); }, [selected]);

    // Esc releases a selection. On the globe a selection holds rotation, so
    // there has to be a way out that does not depend on finding empty ocean.
    useEffect(() => {
        const onKey = (ev) => {
            if (ev.key !== 'Escape') return;
            const t = ev.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            setSelected(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const names = useMemo(() => {
        const m = new Map();
        const rows = book && book.countries.status === 'ok' ? book.countries.data : [];
        for (const c of rows) m.set(c.iso2, c.name);
        return m;
    }, [book]);

    const centroids = useMemo(() => {
        const m = new Map();
        const rows = book && book.countries.status === 'ok' ? book.countries.data : [];
        for (const c of rows) {
            if (c.centroid_lon != null) m.set(c.iso2, [Number(c.centroid_lon), Number(c.centroid_lat)]);
        }
        return m;
    }, [book]);

    const iso3 = useMemo(() => {
        const m = new Map();
        const rows = book && book.countries.status === 'ok' ? book.countries.data : [];
        for (const c of rows) m.set(c.iso2, c.iso3);
        return m;
    }, [book]);

    const { domicileBySymbol, exchangeBySymbol } = useMemo(() => {
        const d = new Map();
        const x = new Map();
        const rows = book && book.domiciles.status === 'ok' ? book.domiciles.data : [];
        for (const r of rows) {
            const a = r.assets || {};
            if (!a.symbol) continue;
            d.set(a.symbol, r.iso2);
            if (a.exchange) x.set(a.symbol, a.exchange);
        }
        return { domicileBySymbol: d, exchangeBySymbol: x };
    }, [book]);

    const rev = useMemo(() => (book && book.revenue.exposure.status === 'ok' ? exposureFrom(book.revenue.exposure.data) : null), [book]);
    const dom = useMemo(() => (book && book.domicile.exposure.status === 'ok' ? exposureFrom(book.domicile.exposure.data) : null), [book]);
    const revSummary = book && book.revenue.summary.status === 'ok' ? book.revenue.summary.data : null;
    const domSummary = book && book.domicile.summary.status === 'ok' ? book.domicile.summary.data : null;
    // Memoised so an unchanged book hands the surface the same references,
    // and the renderer's rebuild is a no-op rather than a re-upload.
    const revDetail = useMemo(() => (book && book.revenue.detail.status === 'ok' ? book.revenue.detail.data : []), [book]);
    const domDetail = useMemo(() => (book && book.domicile.detail.status === 'ok' ? book.domicile.detail.data : []), [book]);

    const layersHere = useMemo(() => drawable(active, renderer, SATISFIED), [active.join(','), renderer]);
    const choro = layersHere.map(layerByKey).find((l) => l.kind === 'choropleth') || null;
    const basis = choro ? (choro.basis === 'domicile' ? 'domicile' : 'revenue') : 'revenue';
    const basisExposure = basis === 'domicile' ? dom : rev;
    const basisSummary = basis === 'domicile' ? domSummary : revSummary;
    const basisDetail = basis === 'domicile' ? domDetail : revDetail;
    const gate = coverageState(basisSummary, basis);
    const scaleMode = choro && choro.key === 'coverage' ? 'coverage' : 'weight';

    const venueInfo = useMemo(() => venuesFrom(revDetail, exchangeBySymbol), [revDetail, exchangeBySymbol]);
    const overlays = useMemo(() => ({
        venues: venueInfo.points,
        chokepoints: CHOKEPOINTS,
        flows: flowsFrom(revDetail, centroids),
    }), [venueInfo, revDetail, centroids]);
    const stats = footerStats({ revenue: rev, domicile: dom, revenueSummary: revSummary, domicileSummary: domSummary });
    const regionDef = REGIONS.find((r) => r.key === region) || REGIONS[0];
    const view = useMemo(() => ({ bounds: regionDef.bounds, pov: regionDef.pov, nonce: region + ':' + viewNonce }),
        [regionDef, region, viewNonce]);

    const onToggle = useCallback((key) => setActive((a) => toggleLayer(a, key)), []);

    return e('div', { className: 'geo-root' },
        e('div', { className: 'geo-crumb' },
            e('span', null, 'TRADING'), e('span', { className: 'geo-sep' }, '/'),
            e('span', null, 'UNIVERSE'), e('span', { className: 'geo-sep' }, '/'),
            e('span', { className: 'geo-crumb-on' }, 'GEOGRAPHIC')),

        e('div', { className: 'geo-grid' },
            e(Rail, { active, renderer, onToggle }),

            e('div', { className: 'geo-center' },
                e('div', { className: 'geo-toolbar' },
                    e('div', { className: 'geo-chips' },
                        REGIONS.map((r) => e('button', {
                            key: r.key, type: 'button', className: 'geo-chip' + (region === r.key ? ' on' : ''),
                            onClick: () => { setRegion(r.key); setViewNonce((n) => n + 1); },
                            title: 'A camera, not a filter — exposure outside the view still counts',
                        }, r.label))),
                    e('div', { className: 'geo-chips' },
                        e('span', { className: 'geo-badge' }, 'BASIS: ', choro ? choro.label.toUpperCase() : 'NONE'),
                        e('div', { className: 'geo-seg', role: 'group', 'aria-label': 'Renderer' },
                            ['flat', 'globe'].map((r) => e('button', {
                                key: r, type: 'button', className: renderer === r ? 'on' : '',
                                'aria-pressed': renderer === r, onClick: () => setRenderer(r),
                            }, r.toUpperCase()))))),

                loading ? null : gate.muted && choro ? e('div', { className: 'geo-gate', role: 'status' },
                    e('b', null, 'MUTED · '), gate.sentence,
                    ' The map is drawn at reduced strength until coverage clears ', pct(COVERAGE_FLOOR, 0), '.') : null,

                e('div', { className: 'geo-mapcard' },
                    e('div', { className: 'geo-mapwrap' },
                        loading
                            ? e('div', { className: 'geo-surface-loading' }, 'Resolving the book…')
                            : e(GeoSurface, {
                                exposure: choro && basisExposure ? basisExposure.map : null,
                                layers: layersHere,
                                renderer,
                                scale: { mode: scaleMode, muted: gate.muted },
                                selected: selected === UNALLOCATED ? null : selected,
                                onSelect: setSelected,
                                onHover: setHover,
                                overlays,
                                view,
                                centroids,
                            }),
                        hover && names.get(hover) ? e('div', { className: 'geo-hover' },
                            names.get(hover), ' · ',
                            basisExposure && basisExposure.map.get(hover) ? pct(basisExposure.map.get(hover).weight) : 'no exposure') : null),
                    e(Legend, { scale: scaleMode, muted: gate.muted && !!choro, choro, layersHere, venueInfo })),

                e(TopCountries, {
                    exposure: basisExposure, names, basis, selected, onSelect: setSelected, failed: !loading && !basisExposure,
                })),

            e(Inspector, {
                selected, names, iso3, rev, dom, revSummary, basis, basisDetail,
                universe, domicileBySymbol, screenOpen, setScreenOpen, onOpenTicket,
            })),

        e(Footer, { stats, revSummary, loading }));
}

// ── Rail ──────────────────────────────────────────────────────────────────

function Rail({ active, renderer, onToggle }) {
    return e('div', { className: 'geo-rail' },
        GROUPS.map((g) => e('div', { key: g.key, className: 'geo-rail-group' },
            e('h4', null, g.label),
            LAYERS.filter((l) => l.group === g.key).map((l) => {
                const av = availability(l, renderer, SATISFIED);
                const on = active.includes(l.key);
                return e('div', { key: l.key, className: 'geo-layer' + (av.available ? '' : ' off') },
                    e('label', null,
                        e('input', {
                            type: 'checkbox', checked: on && av.available, disabled: !av.available,
                            onChange: () => onToggle(l.key),
                            'aria-describedby': av.available ? undefined : 'why-' + l.key,
                        }),
                        e('span', { className: 'geo-layer-l' }, l.label),
                        e('span', { className: 'geo-tag' }, KIND_TAG[l.kind])),
                    av.available ? null : e('div', { id: 'why-' + l.key, className: 'geo-why' }, av.reason));
            }))),
        e('div', { className: 'geo-rail-foot' },
            e('h4', null, 'REGISTRY'),
            e('p', null, LAYERS.length, ' layers declared. Each names the renderers that can paint it, so the rail, ',
                'the renderer toggle and the tile read one source. Choropleths paint the same polygons, so only one is on at a time.')));
}

// ── Legend ────────────────────────────────────────────────────────────────

function Legend({ scale, muted, choro, layersHere, venueInfo }) {
    const items = choro ? legendFor(scale) : [];
    return e('div', { className: 'geo-legend' },
        items.map((b) => e('span', { key: b.key, className: 'geo-lg' + (muted ? ' muted' : '') },
            e('i', { style: { background: `rgb(${b.rgb.join(',')})` } }), b.label)),
        layersHere.includes('listing-venues') ? e('span', { className: 'geo-lg' },
            e('i', { className: 'ring' }), 'listing venue · radius = weight',
            venueInfo.unplaced ? ` · ${venueInfo.unplaced} with no venue on file` : '') : null,
        layersHere.includes('chokepoints') ? e('span', { className: 'geo-lg' }, e('i', { className: 'dot am' }), 'chokepoint (approx.)') : null,
        e('span', { className: 'geo-lg geo-src' }, 'Natural Earth · deck.gl / MapLibre · OpenFreeMap'));
}

// ── Top countries, with the unallocated slice ─────────────────────────────

function TopCountries({ exposure, names, basis, selected, onSelect, failed }) {
    if (failed) return e('div', { className: 'geo-card' },
        e('div', { className: 'geo-card-h' }, 'TOP COUNTRIES'),
        e('div', { className: 'geo-missing' }, 'The ', basis, ' basis did not answer — nothing is ranked rather than an empty list standing in for it.'));
    if (!exposure) return null;
    const rows = rankCountries(exposure, names, 6);
    const max = Math.max(exposure.unallocated, ...rows.map((r) => r.weight), 0.0001);
    const bar = (key, label, w, extra, cls) => e('button', {
        key, type: 'button', className: 'geo-bar' + (selected === key ? ' on' : '') + (cls ? ' ' + cls : ''),
        onClick: () => onSelect(selected === key ? null : key),
    },
        e('span', { className: 'geo-bar-l' }, label),
        e('span', { className: 'geo-bar-t' }, e('span', { style: { width: (100 * w / max) + '%' } })),
        e('span', { className: 'geo-bar-v' }, pct(w)),
        extra);
    return e('div', { className: 'geo-card' },
        e('div', { className: 'geo-card-h' }, 'TOP ', basis === 'domicile' ? 'DOMICILE' : 'REVENUE-SOURCE', ' COUNTRIES'),
        rows.map((r) => bar(r.iso2, r.name, r.weight,
            r.coverage != null && r.coverage < 1 && basis === 'revenue'
                ? e('span', { className: 'geo-bar-c', title: 'Share of this weight resting on a disclosure' }, 'cov ', pct(r.coverage, 0))
                : null)),
        exposure.unallocated > 0 ? bar(UNALLOCATED, 'Unallocated', exposure.unallocated,
            e('span', { className: 'geo-bar-c' }, 'not a place'), 'xx') : null);
}

// ── Inspector ─────────────────────────────────────────────────────────────

function Inspector({ selected, names, iso3, rev, dom, revSummary, basis, basisDetail, universe, domicileBySymbol, screenOpen, setScreenOpen, onOpenTicket }) {
    if (!selected) {
        return e('div', { className: 'geo-insp' },
            e('div', { className: 'geo-insp-k' }, 'SELECTED'),
            e('p', { className: 'geo-dim' }, 'Click any country, or the unallocated row, to see the holdings behind its weight.'));
    }
    const isXX = selected === UNALLOCATED;
    const r = rev && (isXX ? { weight: rev.unallocated } : rev.map.get(selected));
    const d = dom && (isXX ? { weight: dom.unallocated } : dom.map.get(selected));
    const revCov = revSummary ? Number(revSummary.book_coverage) : null;
    const gapOk = revCov != null && revCov >= COVERAGE_FLOOR;
    const rw = r ? r.weight : 0;
    const dw = d ? d.weight : 0;
    const contribs = contributorsOf(basisDetail, selected);
    const maxW = contribs.reduce((m, c) => Math.max(m, c.weight), 0) || 1;
    const members = universe && universe.members ? universe.members : [];
    const screened = isXX ? [] : screenByDomicile(members.filter((m) => m.eligible), domicileBySymbol, selected);

    return e('div', { className: 'geo-insp' },
        e('div', { className: 'geo-insp-k' }, 'SELECTED'),
        e('div', { className: 'geo-insp-name' },
            isXX ? 'Unallocated' : (names.get(selected) || selected),
            e('span', { className: 'geo-insp-codes' }, isXX ? 'XX · not a place' : selected + (iso3.get(selected) ? ' · ' + iso3.get(selected) : ''))),

        e('div', { className: 'geo-figs' },
            e(Fig, { v: rev ? pct(rw) : '—', l: 'REVENUE', note: r && r.coverage != null && r.coverage < 1 && !isXX ? 'cov ' + pct(r.coverage, 0) : null }),
            e(Fig, { v: dom ? pct(dw) : '—', l: 'DOMICILE' }),
            e(Fig, {
                v: gapOk && rev && dom ? pp(rw - dw) : '—', l: 'GAP',
                title: gapOk ? null : `Withheld: revenue coverage is ${pct(revCov)}, under the ${pct(COVERAGE_FLOOR, 0)} floor, so a gap here would measure the resolver's fallbacks, not the book.`,
                note: gapOk ? null : 'withheld',
            })),

        e('div', { className: 'geo-insp-k' }, 'CONTRIBUTING HOLDINGS · ', basis === 'domicile' ? 'DOMICILE' : 'REVENUE', ' BASIS'),
        contribs.length ? e('div', { className: 'geo-contribs' },
            contribs.map((c) => e('div', {
                key: c.symbol, className: 'geo-contrib' + (isFallback(c.resolution) ? ' fb' : ''),
                title: (RESOLUTION_LABEL[c.resolution] || c.resolution) + (c.sourceUrl ? ' · ' + c.sourceUrl : ''),
            },
                e('span', { className: 'geo-sym' }, c.symbol),
                e('span', { className: 'geo-nm' }, c.name),
                e('span', { className: 'geo-mini' }, e('span', { style: { width: (100 * c.weight / maxW) + '%' } })),
                e('span', { className: 'geo-w' }, pct(c.weight)),
                e('span', { className: 'geo-res' }, RESOLUTION_LABEL[c.resolution] || c.resolution))))
            : e('p', { className: 'geo-dim' }, 'No holding places weight here on this basis.'),
        contribs.some((c) => isFallback(c.resolution)) ? e('p', { className: 'geo-note' },
            'Dimmed rows are fallbacks — a domicile standing in for a revenue split nobody has entered, or a fund with no look-through. ',
            'They plot, and they do not rank beside a disclosure.') : null,

        isXX ? null : e('div', { className: 'geo-actions' },
            e('button', {
                type: 'button', className: 'geo-btn', onClick: () => setScreenOpen((x) => !x),
                disabled: !members.length, title: members.length ? null : 'The universe has not loaded',
            }, 'SCREEN THIS EXPOSURE · ', screened.length, ' DOMICILED HERE'),
            screenOpen ? e('div', { className: 'geo-screen' },
                screened.length ? screened.slice(0, 40).map((m) => e('button', {
                    key: m.symbol, type: 'button', className: 'geo-screen-row',
                    onClick: () => onOpenTicket && onOpenTicket(m, { view: 'geographic', axes: { domicile: [selected] } }),
                }, e('span', { className: 'geo-sym' }, m.symbol), e('span', { className: 'geo-nm' }, m.name || ''),
                    m.bookState === 'held' ? e('span', { className: 'geo-res' }, 'held') : null))
                    : e('p', { className: 'geo-dim' }, 'No eligible universe name has a recorded domicile here.'),
                screened.length > 40 ? e('p', { className: 'geo-dim' }, '+', screened.length - 40, ' more') : null,
                e('p', { className: 'geo-note' }, 'Screened on DOMICILE, the only basis with coverage today. A revenue screen needs the disclosures phase A has not yet entered.')) : null));
}

function Fig({ v, l, note, title }) {
    return e('div', { className: 'geo-fig', title },
        e('div', { className: 'geo-fig-v' }, v),
        e('div', { className: 'geo-fig-l' }, l, note ? e('span', { className: 'geo-fig-n' }, ' · ', note) : null));
}

// ── Footer ────────────────────────────────────────────────────────────────

function Footer({ stats, revSummary, loading }) {
    if (loading) return e('div', { className: 'geo-foot' });
    const n = (v, d = 0) => (v == null ? '—' : Number(v).toFixed(d));
    const g = stats.largestGap;
    return e('div', { className: 'geo-foot' },
        e('span', null, e('b', null, n(stats.lookThroughCountries)), ' LOOK-THROUGH COUNTRIES'),
        e('span', null, e('b', null, n(stats.domicileCountries)), ' DOMICILE COUNTRIES'),
        e('span', { title: 'Herfindahl over attributed countries (XX excluded), on the ' + stats.hhiBasis + ' basis' },
            e('b', null, n(stats.hhiTimes1e3, 0)), ' CONCENTRATION (HHI ×10³, ', stats.hhiBasis.toUpperCase(), ')'),
        g ? e('span', null, e('b', null, g.iso2, ' ', pp(g.gap)), ' LARGEST GAP')
            : e('span', { title: stats.gapWithheld }, e('b', null, '—'), ' LARGEST GAP · WITHHELD'),
        e('span', { className: 'geo-foot-r' },
            revSummary ? `${revSummary.n_positions} holdings · ${revSummary.excluded_option_count} option contract${revSummary.excluded_option_count === 1 ? '' : 's'} excluded (no revenue, no domicile)` : ''));
}

export default TradeGeographic;
