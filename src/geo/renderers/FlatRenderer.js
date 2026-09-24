// Flat renderer: MapLibre holds the basemap, deck.gl draws over it through
// MapboxOverlay in INTERLEAVED mode, so polygons sit under the basemap's own
// labels instead of burying them.
//
// The four techniques the performance budget rests on, all here:
//   1. Viewport culling with a content key (geoCompute.makeCuller): the same
//      visible set returns the same array reference, and deck.gl skips
//      retessellation on reference equality.
//   2. Two-phase commit: a rebuild is staged on one animation frame and
//      committed on the next, so the click or toggle that caused it stays
//      responsive.
//   3. Geometry by zoom: 1:110m below zoom 4, 1:50m above. The swap is a layer
//      id change, never a remount.
//   4. A basis change repaints through `updateTriggers` on a version counter,
//      so fills recolour without the polygons being re-tessellated.
//
// Basemap: OpenFreeMap's dark style, no token and no account. If the style
// does not load, a local style with only a background takes its place — and
// the country outline layer below is always drawn, so turning every data
// layer off still leaves a legible map rather than a blank panel.

import React from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer, ScatterplotLayer, ArcLayer } from '@deck.gl/layers';
import { loadCountries, DETAIL_ZOOM } from '../geometry.js';
import { makeCuller, fillFor } from '../geoCompute.js';

const { useEffect, useRef, useState } = React;
const e = React.createElement;

export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
const STYLE_TIMEOUT_MS = 4000;

export const FALLBACK_STYLE = Object.freeze({
    version: 8,
    sources: {},
    layers: [{ id: 'atlas-background', type: 'background', paint: { 'background-color': '#0a0d12' } }],
});

const SELECTED_LINE = [224, 246, 248, 255];
const BORDER_LINE = [70, 84, 100, 200];
const CYAN = [61, 214, 224];
const AMBER = [217, 155, 63];

function loadStyle() {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), STYLE_TIMEOUT_MS);
    return fetch(BASEMAP_STYLE_URL, ctl ? { signal: ctl.signal } : undefined)
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((style) => ({ style, source: 'openfreemap' }))
        .catch((err) => {
            console.error('[geo] basemap style unavailable, using the local fallback:', err && err.message);
            return { style: FALLBACK_STYLE, source: 'fallback' };
        })
        .finally(() => clearTimeout(t));
}

function firstSymbolLayerId(map) {
    const layers = (map.getStyle() && map.getStyle().layers) || [];
    const s = layers.find((l) => l.type === 'symbol');
    return s ? s.id : undefined;
}

export default function FlatRenderer({ exposure, byKind, scale, selected, overlays, view, onSelect, onHover }) {
    const hostRef = useRef(null);
    const mapRef = useRef(null);
    const overlayRef = useRef(null);
    const beforeIdRef = useRef(undefined);
    const cullers = useRef({});
    const features = useRef({});
    const frame = useRef(0);
    const version = useRef(0);
    const [ready, setReady] = useState(false);
    const [zoomRes, setZoomRes] = useState('110m');
    const [basemap, setBasemap] = useState(null);
    const [geomError, setGeomError] = useState(null);
    const [viewTick, setViewTick] = useState(0);
    const latest = useRef({});
    latest.current = { onSelect, onHover };

    // Mount: style, map, overlay, 1:110m geometry.
    useEffect(() => {
        let dead = false;
        Promise.all([loadStyle(), loadCountries('110m')]).then(([st, feats]) => {
            if (dead || !hostRef.current) return;
            features.current['110m'] = feats;
            cullers.current['110m'] = makeCuller(feats);
            setBasemap(st.source);
            const map = new maplibregl.Map({
                container: hostRef.current,
                style: st.style,
                center: [20, 20],
                zoom: 1.1,
                minZoom: 0.6,
                maxZoom: 7,
                renderWorldCopies: false,
                dragRotate: false,
                pitchWithRotate: false,
                attributionControl: { compact: true },
            });
            map.touchZoomRotate.disableRotation();
            const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
            map.addControl(overlay);
            mapRef.current = map;
            overlayRef.current = overlay;
            // 'style.load', not 'load'. 'load' waits for every source, and a
            // tile source that fails to answer (OpenFreeMap down, a proxy that
            // drops it) means it NEVER fires — the data layers would never
            // mount and the panel would sit blank with no error. Measured, not
            // assumed: with the style reachable and the tiles not, 'load' did
            // not fire in 9 s. The style is all the overlay needs.
            const onStyle = () => {
                beforeIdRef.current = firstSymbolLayerId(map);
                setReady(true);
            };
            if (map.isStyleLoaded()) onStyle(); else map.once('style.load', onStyle);
            map.on('error', (ev) => {
                const msg = ev && ev.error && ev.error.message;
                if (msg) console.error('[geo] basemap:', msg);
            });
            // A viewport change only needs a recull; the culler returns the
            // same array when the visible set has not changed, and then the
            // rebuild below is a no-op for deck.gl.
            map.on('moveend', () => {
                const z = map.getZoom();
                setZoomRes(z >= DETAIL_ZOOM ? '50m' : '110m');
                setViewTick((t) => t + 1);
            });
        }).catch((err) => {
            console.error('[geo] flat renderer could not start:', err && err.message);
            if (!dead) setGeomError(String((err && err.message) || err));
        });
        return () => {
            dead = true;
            cancelAnimationFrame(frame.current);
            if (mapRef.current) mapRef.current.remove();
            mapRef.current = null;
            overlayRef.current = null;
        };
    }, []);

    // Lazy 1:50m, the first time the map zooms past DETAIL_ZOOM.
    useEffect(() => {
        if (zoomRes !== '50m' || features.current['50m']) return;
        loadCountries('50m').then((feats) => {
            features.current['50m'] = feats;
            cullers.current['50m'] = makeCuller(feats);
            setViewTick((t) => t + 1);
        }).catch((err) => console.error('[geo] 1:50m geometry unavailable, staying on 1:110m:', err && err.message));
    }, [zoomRes]);

    // Camera requests from the consumer (region presets).
    // Keyed on the nonce, so repeating a request (WORLD after panning away)
    // re-centres instead of being swallowed as "unchanged".
    useEffect(() => {
        const map = mapRef.current;
        const bb = view && view.bounds;
        if (!ready || !map || !bb) return;
        map.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 12, duration: 600 });
    }, [ready, view && view.nonce]);

    // A data or style change bumps the version, so getFillColor re-runs.
    useEffect(() => { version.current += 1; }, [exposure, scale.mode, scale.muted]);

    // Build + two-phase commit.
    useEffect(() => {
        const map = mapRef.current;
        const overlay = overlayRef.current;
        if (!ready || !map || !overlay) return;
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            const res = features.current[zoomRes] ? zoomRes : '110m';
            const b = map.getBounds();
            const visible = cullers.current[res]([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
            const beforeId = beforeIdRef.current;
            const layers = [];
            const choro = byKind.choropleth;

            layers.push(new GeoJsonLayer({
                id: 'countries-' + res,
                beforeId,
                data: visible,
                pickable: true,
                stroked: true,
                filled: true,
                lineWidthUnits: 'pixels',
                getLineWidth: (f) => (f.id && f.id === selected ? 1.6 : 0.5),
                getLineColor: (f) => (f.id && f.id === selected ? SELECTED_LINE : BORDER_LINE),
                getFillColor: (f) => (choro && exposure ? fillFor(exposure.get(f.id), scale) : [0, 0, 0, 0]),
                updateTriggers: {
                    getFillColor: [version.current, choro ? choro.key : 'none'],
                    getLineColor: selected,
                    getLineWidth: selected,
                },
                onClick: (info) => latest.current.onSelect(info.object ? info.object.id : null),
                onHover: (info) => latest.current.onHover(info.object ? info.object.id : null),
            }));

            for (const l of byKind.arc) {
                if (l.key !== 'revenue-flows') continue;
                const flows = overlays.flows || [];
                const maxW = flows.reduce((m, f) => Math.max(m, f.weight), 0) || 1;
                layers.push(new ArcLayer({
                    id: 'revenue-flows', beforeId, data: flows,
                    getSourcePosition: (d) => d.source,
                    getTargetPosition: (d) => d.target,
                    getSourceColor: [...CYAN, 90],
                    getTargetColor: [...CYAN, 230],
                    getWidth: (d) => 1 + 5 * Math.sqrt(d.weight / maxW),
                    greatCircle: true,
                }));
            }

            for (const l of byKind.point) {
                if (l.key === 'listing-venues') {
                    const pts = overlays.venues || [];
                    layers.push(new ScatterplotLayer({
                        id: 'listing-venues', beforeId, data: pts,
                        getPosition: (d) => [d.lon, d.lat],
                        radiusUnits: 'pixels',
                        getRadius: (d) => 4 + 16 * Math.sqrt(d.weight),
                        stroked: true, filled: true,
                        getFillColor: [...CYAN, 40],
                        getLineColor: [...CYAN, 230],
                        lineWidthUnits: 'pixels', getLineWidth: 1.5,
                        pickable: false,
                    }));
                } else if (l.key === 'book-positions') {
                    const pts = overlays.bookPoints || [];
                    // Candidates underneath as dots, the book on top as rings
                    // sized by weight -- the same encoding as the positioning map.
                    layers.push(new ScatterplotLayer({
                        id: 'book-candidates', beforeId, data: pts.filter((d) => d.candCount > 0),
                        getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels',
                        getRadius: (d) => 2.5 + 2.2 * Math.sqrt(d.candCount),
                        getFillColor: [139, 152, 168, 170], pickable: false,
                    }));
                    layers.push(new ScatterplotLayer({
                        id: 'book-held', beforeId, data: pts.filter((d) => d.heldCount > 0),
                        getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels',
                        getRadius: (d) => 4 + 4.5 * Math.sqrt(d.heldWeightPct),
                        stroked: true, filled: true, getFillColor: [...CYAN, 30], getLineColor: [...CYAN, 235],
                        lineWidthUnits: 'pixels', getLineWidth: 1.6, pickable: false,
                    }));
                } else if (l.key === 'chokepoints') {
                    layers.push(new ScatterplotLayer({
                        id: 'chokepoints', beforeId, data: overlays.chokepoints || [],
                        getPosition: (d) => [d.lon, d.lat],
                        radiusUnits: 'pixels', getRadius: 4,
                        getFillColor: [...AMBER, 220],
                        stroked: true, getLineColor: [10, 13, 18, 255], lineWidthUnits: 'pixels', getLineWidth: 1,
                        pickable: false,
                    }));
                }
            }

            // Phase two: commit on the following frame.
            frame.current = requestAnimationFrame(() => overlay.setProps({ layers }));
        });
    }, [ready, zoomRes, viewTick, exposure, byKind, scale.mode, scale.muted, selected, overlays]);

    return e('div', { className: 'geo-flat', style: { position: 'absolute', inset: 0 } },
        e('div', { ref: hostRef, style: { position: 'absolute', inset: 0 } }),
        geomError ? e('div', { className: 'geo-surface-error' }, 'Map unavailable: ', geomError) : null,
        basemap === 'fallback' ? e('div', { className: 'geo-basemap-note' }, 'Basemap tiles unavailable — outlines only') : null);
}
