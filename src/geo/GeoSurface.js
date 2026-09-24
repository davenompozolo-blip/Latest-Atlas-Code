// ATLAS Geographic surface — the shared primitive.
//
// <GeoSurface> takes data and emits selection. It owns no fetching (beyond its
// own vendored geometry), holds no module state, and renders no chrome: the
// rail, the inspector and the toolbar belong to the consumer, composed around
// it. Same shape as the Nexus panel-provider lift — the surface is dumb, the
// provider above it is not.
//
// Props (the spec's contract, plus `overlays`, `view` and `centroids`):
//   exposure    Map<iso2, {weight, coverage, contributors}> | null — already resolved
//   layers      active layer keys, already filtered by the consumer
//   renderer    'flat' | 'globe'
//   scale       { mode: 'weight' | 'coverage', muted: boolean }
//   selected    iso2 | null  (controlled)
//   onSelect    (iso2 | null) => void
//   onHover     (iso2 | null) => void — throttled to 60 ms here
//   height      number | 'fill'
//   overlays    { venues: [], chokepoints: [], flows: [] } — point and arc data
//   view        { bounds, pov, nonce } | null — a camera request, not a filter.
//               `nonce` makes the same request repeatable: clicking WORLD
//               after panning away must re-centre even though WORLD is
//               already the active region.
//   centroids   Map<iso2, [lon, lat]> — lets a renderer bring a selection
//               into view (the globe turns to it)
//
// Both renderers are lazy chunks. The flat one (MapLibre + deck.gl) loads
// when the surface first mounts; the globe (globe.gl over three.js) loads on
// the first toggle and never on first paint. Neither lands in the terminal's
// initial bundle.

import React from 'react';
import './geoSurface.css';
import { layerByKey } from './layers/registry.js';
import { throttle } from './geoCompute.js';

const { useMemo, useRef, useEffect, Suspense, lazy } = React;
const e = React.createElement;

const FlatRenderer = lazy(() => import('./renderers/FlatRenderer.js'));
const GlobeRenderer = lazy(() => import('./renderers/GlobeRenderer.js'));

export const HOVER_THROTTLE_MS = 60;

export function GeoSurface(props) {
    const {
        exposure = null, layers = [], renderer = 'flat', scale = { mode: 'weight', muted: false },
        selected = null, onSelect, onHover, height = 'fill', overlays = {}, view = null, centroids = null,
    } = props;

    // Resolve keys to definitions once, and split them by kind: the
    // renderers paint by kind, never by key.
    const byKind = useMemo(() => {
        const out = { choropleth: null, point: [], arc: [] };
        for (const k of layers) {
            const l = layerByKey(k);
            if (!l) continue;
            if (l.kind === 'choropleth') out.choropleth = l;
            else out[l.kind].push(l);
        }
        return out;
    }, [layers.join(',')]);

    const hoverRef = useRef(onHover);
    useEffect(() => { hoverRef.current = onHover; }, [onHover]);
    const throttledHover = useMemo(
        () => throttle((iso) => { if (hoverRef.current) hoverRef.current(iso); }, HOVER_THROTTLE_MS),
        [],
    );

    const style = height === 'fill'
        ? { position: 'relative', width: '100%', height: '100%', minHeight: 320 }
        : { position: 'relative', width: '100%', height };

    const Renderer = renderer === 'globe' ? GlobeRenderer : FlatRenderer;

    return e('div', { className: 'geo-surface', style, 'data-renderer': renderer },
        e(Suspense, { fallback: e('div', { className: 'geo-surface-loading' }, renderer === 'globe' ? 'Loading globe…' : 'Loading map…') },
            e(Renderer, {
                exposure, byKind, scale, selected, overlays, view, centroids,
                onSelect: (iso) => { if (onSelect) onSelect(iso || null); },
                onHover: throttledHover,
            })));
}

export default GeoSurface;
