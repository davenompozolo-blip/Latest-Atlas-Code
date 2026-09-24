// Globe renderer: globe.gl over three.js. A lazy chunk — it loads on the first
// renderer toggle and never on first paint.
//
// The honest case for a globe is arcs. A Johannesburg-to-Shenzhen revenue
// flow on a flat projection runs the wrong way round the map or clips at the
// antimeridian; on a sphere it reads correctly with no special handling. A
// choropleth is NOT better here — half the world is hidden — which is why the
// globe is an option and never the default.
//
// Auto-rotation at 6°/s, paused on pointer-down and while hovering a country,
// and never started under prefers-reduced-motion (so a low-power device skips
// rotation rather than dropping frames). Rotation state does not survive a
// renderer switch.

import React from 'react';
import Globe from 'globe.gl';
import { loadCountries } from '../geometry.js';
import { fillFor } from '../geoCompute.js';

const { useEffect, useRef, useState } = React;
const e = React.createElement;

// OrbitControls: autoRotateSpeed 2.0 is one orbit per 30 s at 60 fps, i.e.
// 12°/s. The spec's 6°/s is therefore 1.0.
export const AUTO_ROTATE_SPEED = 1.0;

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a == null ? (c[3] == null ? 1 : c[3] / 255) : a})`;

function reducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function GlobeRenderer({ exposure, byKind, scale, selected, overlays, onSelect, onHover }) {
    const hostRef = useRef(null);
    const globeRef = useRef(null);
    const [feats, setFeats] = useState(null);
    const [error, setError] = useState(null);
    const latest = useRef({});
    latest.current = { onSelect, onHover, exposure, scale, selected, choro: byKind.choropleth };

    useEffect(() => {
        let dead = false;
        loadCountries('110m').then((f) => { if (!dead) setFeats(f); })
            .catch((err) => { if (!dead) setError(String((err && err.message) || err)); });
        return () => { dead = true; };
    }, []);

    // Mount once geometry is in hand.
    useEffect(() => {
        if (!feats || !hostRef.current || globeRef.current) return;
        const host = hostRef.current;
        const g = new Globe(host, { animateIn: false });
        g.backgroundColor('rgba(0,0,0,0)')
            .showAtmosphere(true).atmosphereColor('#3dd6e0').atmosphereAltitude(0.12)
            .showGraticules(true)
            .polygonsData(feats)
            .polygonSideColor(() => 'rgba(0,0,0,0)')
            .polygonStrokeColor((f) => (f.id && f.id === latest.current.selected ? '#e0f6f8' : 'rgba(70,84,100,0.8)'))
            .polygonsTransitionDuration(0)
            .onPolygonClick((f) => latest.current.onSelect(f ? f.id : null))
            .onPolygonHover((f) => {
                latest.current.onHover(f ? f.id : null);
                if (!reducedMotion()) g.controls().autoRotate = !f;
            });
        const mat = g.globeMaterial();
        if (mat && mat.color) mat.color.set('#0d141c');
        const controls = g.controls();
        controls.autoRotate = !reducedMotion();
        controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
        const stop = () => { controls.autoRotate = false; };
        const resume = () => { if (!reducedMotion()) controls.autoRotate = true; };
        host.addEventListener('pointerdown', stop);
        host.addEventListener('pointerup', resume);

        const ro = new ResizeObserver(() => {
            g.width(host.clientWidth).height(host.clientHeight);
        });
        ro.observe(host);
        globeRef.current = g;
        return () => {
            ro.disconnect();
            host.removeEventListener('pointerdown', stop);
            host.removeEventListener('pointerup', resume);
            try { g._destructor(); } catch (_) { /* already gone */ }
            globeRef.current = null;
            host.innerHTML = '';
        };
    }, [feats]);

    // Data. Colours come from the same fillFor the flat renderer uses, so a
    // country cannot be one shade flat and another on the sphere.
    useEffect(() => {
        const g = globeRef.current;
        if (!g) return;
        const choro = byKind.choropleth;
        g.polygonCapColor((f) => (choro && exposure ? rgba(fillFor(exposure.get(f.id), scale)) : 'rgba(27,35,45,0.9)'))
            .polygonAltitude((f) => (f.id && f.id === selected ? 0.02 : 0.006))
            .polygonStrokeColor((f) => (f.id && f.id === selected ? '#e0f6f8' : 'rgba(70,84,100,0.8)'));

        const pts = [];
        for (const l of byKind.point) {
            if (l.key === 'listing-venues') {
                for (const v of overlays.venues || []) pts.push({ lat: v.lat, lng: v.lon, r: 0.25 + 1.2 * Math.sqrt(v.weight), c: '#3dd6e0' });
            } else if (l.key === 'chokepoints') {
                for (const c of overlays.chokepoints || []) pts.push({ lat: c.lat, lng: c.lon, r: 0.3, c: '#d99b3f' });
            }
        }
        g.pointsData(pts).pointLat('lat').pointLng('lng').pointRadius('r').pointColor('c').pointAltitude(0.012);

        const flows = byKind.arc.some((l) => l.key === 'revenue-flows') ? overlays.flows || [] : [];
        const maxW = flows.reduce((m, f) => Math.max(m, f.weight), 0) || 1;
        g.arcsData(flows)
            .arcStartLat((d) => d.source[1]).arcStartLng((d) => d.source[0])
            .arcEndLat((d) => d.target[1]).arcEndLng((d) => d.target[0])
            .arcColor(() => ['rgba(61,214,224,0.35)', 'rgba(61,214,224,0.95)'])
            .arcStroke((d) => 0.3 + 1.2 * Math.sqrt(d.weight / maxW))
            .arcDashLength(0.5).arcDashGap(0.2).arcDashAnimateTime(reducedMotion() ? 0 : 3000);
    }, [feats, exposure, byKind, scale.mode, scale.muted, selected, overlays]);

    return e('div', { className: 'geo-globe', style: { position: 'absolute', inset: 0 } },
        e('div', { ref: hostRef, style: { position: 'absolute', inset: 0 } }),
        error ? e('div', { className: 'geo-surface-error' }, 'Globe unavailable: ', error) : null);
}
