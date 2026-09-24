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
import { createRotationController } from './rotationController.js';

const { useEffect, useRef, useState } = React;
const e = React.createElement;

const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a == null ? (c[3] == null ? 1 : c[3] / 255) : a})`;

function reducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function GlobeRenderer({ exposure, byKind, scale, selected, overlays, view, centroids, onSelect, onHover }) {
    const hostRef = useRef(null);
    const globeRef = useRef(null);
    const rotRef = useRef(null);
    const hoverRef = useRef(null);
    const insideRef = useRef(false);
    const [feats, setFeats] = useState(null);
    const [error, setError] = useState(null);
    const [autoRotate, setAutoRotate] = useState(true);
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
        const motion = typeof window !== 'undefined' && window.matchMedia
            ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        const rot = createRotationController({ reducedMotion: motion ? motion.matches : false });
        rotRef.current = rot;

        const g = new Globe(host, { animateIn: false });
        g.backgroundColor('rgba(0,0,0,0)')
            .showAtmosphere(true).atmosphereColor('#3dd6e0').atmosphereAltitude(0.12)
            .showGraticules(true)
            .polygonsData(feats)
            .polygonSideColor(() => 'rgba(0,0,0,0)')
            .polygonStrokeColor((f) => (f.id && f.id === latest.current.selected ? '#e0f6f8' : 'rgba(70,84,100,0.8)'))
            .polygonsTransitionDuration(0)
            .onPolygonClick((f) => { rot.interact(); latest.current.onSelect(f ? f.id : null); })
            .onGlobeClick(() => { rot.interact(); latest.current.onSelect(null); })
            .onPolygonHover((f) => {
                // globe.gl raycasts from the LAST pointer position on every
                // render, not only on pointer moves. Once the pointer has left
                // the canvas that position is stale, and as the globe turns a
                // new country slides under it and is reported as "hovered".
                // The first version stopped rotation on every such report, so
                // the globe halted under a cursor that was nowhere near it and
                // nothing ever restarted it -- the freeze. A hover counts only
                // while the pointer is inside the canvas.
                if (!insideRef.current) return;
                hoverRef.current = f ? f.id : null;
                rot.pointerMove(!!f);
                latest.current.onHover(f ? f.id : null);
            });
        g.enablePointerInteraction(false);
        const mat = g.globeMaterial();
        if (mat && mat.color) mat.color.set('#0d141c');

        // Rotation is owned by the controller, never toggled straight from an
        // event: autoRotate stays on and the speed is eased every frame.
        const controls = g.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = rot.speed;

        // Down on the canvas; UP ANYWHERE. A drag released over the rail is
        // still a release, and a canvas-only listener never sees it.
        const onDown = () => rot.pointerDown();
        const onUp = () => rot.pointerUp();
        // A pointer that moves keeps a hover alive; one resting on the ocean
        // clears it. globe.gl only reports hover changes, not steady state.
        const onMove = () => {
            if (!insideRef.current) onEnter();
            rot.pointerMove(hoverRef.current != null);
        };
        // Leaving the canvas clears the hover outright: globe.gl raycasts only
        // on moves over its own canvas, so it will not report this itself.
        const onEnter = () => {
            insideRef.current = true;
            g.enablePointerInteraction(true);
        };
        const onLeave = () => {
            insideRef.current = false;
            // Stop raycasting at a stale position altogether while outside:
            // it is the source of the ghost hover, and it is wasted work.
            g.enablePointerInteraction(false);
            rot.pointerLeave();
            if (hoverRef.current != null) { hoverRef.current = null; latest.current.onHover(null); }
        };
        const onWheel = () => rot.interact();
        const onMotion = (ev) => rot.setReducedMotion(ev.matches);
        host.addEventListener('pointerdown', onDown);
        host.addEventListener('pointerenter', onEnter);
        host.addEventListener('pointermove', onMove);
        host.addEventListener('pointerleave', onLeave);
        host.addEventListener('wheel', onWheel, { passive: true });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        window.addEventListener('blur', onUp);
        if (motion && motion.addEventListener) motion.addEventListener('change', onMotion);

        let raf = 0;
        let last = performance.now();
        let lastReason = '';
        const tick = (t) => {
            controls.autoRotateSpeed = rot.step(t - last);
            last = t;
            // Published only on change: a debugging and test hook that costs
            // nothing per frame.
            const why = rot.reason();
            if (why !== lastReason) { host.dataset.rotation = why; lastReason = why; }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        const ro = new ResizeObserver(() => {
            if (host.clientWidth && host.clientHeight) g.width(host.clientWidth).height(host.clientHeight);
        });
        ro.observe(host);
        globeRef.current = g;
        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
            host.removeEventListener('pointerdown', onDown);
            host.removeEventListener('pointerenter', onEnter);
            host.removeEventListener('pointermove', onMove);
            host.removeEventListener('pointerleave', onLeave);
            host.removeEventListener('wheel', onWheel);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            window.removeEventListener('blur', onUp);
            if (motion && motion.removeEventListener) motion.removeEventListener('change', onMotion);
            // Release the WebGL context explicitly. _destructor does not, and
            // browsers keep ~16 live contexts: after enough renderer switches
            // the OLDEST is lost -- which can be the one on screen.
            let renderer = null;
            try { renderer = g.renderer(); } catch (_) { /* gone */ }
            try { g.pauseAnimation && g.pauseAnimation(); } catch (_) { /* gone */ }
            try { g._destructor(); } catch (_) { /* already gone */ }
            try { if (renderer) { renderer.dispose(); renderer.forceContextLoss(); } } catch (_) { /* gone */ }
            globeRef.current = null;
            rotRef.current = null;
            host.innerHTML = '';
        };
    }, [feats]);

    // Data. Colours come from the same fillFor the flat renderer uses, so a
    // country cannot be one shade flat and another on the sphere.
    useEffect(() => {
        const g = globeRef.current;
        if (!g) return;
        const choro = byKind.choropleth;
        g.polygonCapColor((f) => (choro && exposure ? rgba(fillFor(exposure.get(f.id), scale)) : 'rgba(27,35,45,0.9)'));

        const pts = [];
        for (const l of byKind.point) {
            if (l.key === 'listing-venues') {
                for (const v of overlays.venues || []) pts.push({ lat: v.lat, lng: v.lon, r: 0.25 + 1.2 * Math.sqrt(v.weight), c: '#3dd6e0' });
            } else if (l.key === 'book-positions') {
                for (const d of overlays.bookPoints || []) {
                    if (d.candCount) pts.push({ lat: d.lat, lng: d.lon, r: 0.18 + 0.12 * Math.sqrt(d.candCount), c: 'rgba(139,152,168,0.8)' });
                    if (d.heldCount) pts.push({ lat: d.lat, lng: d.lon, r: 0.3 + 0.35 * Math.sqrt(d.heldWeightPct), c: 'rgba(61,214,224,0.75)' });
                }
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
    }, [feats, exposure, byKind, scale.mode, scale.muted, overlays]);

    // Selection, apart from the data: a click must not re-push every point and
    // arc (which restarted the arc animation on each click). It lifts and
    // outlines the country, holds rotation, and turns the globe to face it.
    useEffect(() => {
        const g = globeRef.current;
        if (!g) return;
        g.polygonAltitude((f) => (f.id && f.id === selected ? 0.02 : 0.006))
            .polygonStrokeColor((f) => (f.id && f.id === selected ? '#e0f6f8' : 'rgba(70,84,100,0.8)'));
        if (rotRef.current) rotRef.current.setFocused(!!selected);
        const c = selected && centroids && centroids.get(selected);
        if (c) {
            const pov = g.pointOfView();
            g.pointOfView({ lat: c[1], lng: c[0], altitude: Math.min(Math.max(pov.altitude || 2.2, 1.4), 2.6) }, 800);
        }
    }, [feats, selected]);

    // Region presets. Keyed on the nonce so WORLD re-centres after a pan.
    // The request that is already current when the globe MOUNTS is not a
    // click -- it is the page's default -- so it is skipped; otherwise it
    // would run after the selection's fly-to and turn the globe away from the
    // country it was just told to face.
    const seenNonce = useRef(undefined);
    useEffect(() => {
        const g = globeRef.current;
        if (!g || !view || !view.pov) return;
        const first = seenNonce.current === undefined;
        seenNonce.current = view.nonce;
        if (first && selected) return;
        if (rotRef.current) rotRef.current.interact();
        g.pointOfView(view.pov, first ? 0 : 900);
    }, [feats, view && view.nonce]);

    useEffect(() => { if (rotRef.current) rotRef.current.setEnabled(autoRotate); }, [feats, autoRotate]);

    // A stop the user did not ask for must say why, or it reads as a fault.
    const reduced = reducedMotion();
    const why = reduced ? 'ROTATION OFF · reduced motion'
        : !autoRotate ? 'ROTATION OFF'
        : selected ? 'HOLDING ON ' + selected + ' · click space or Esc to release'
        : null;
    return e('div', { className: 'geo-globe', style: { position: 'absolute', inset: 0 } },
        e('div', { ref: hostRef, style: { position: 'absolute', inset: 0 } }),
        e('div', { className: 'geo-globe-ctl' },
            why ? e('span', { className: 'geo-globe-why', role: 'status' }, why) : null,
            reduced ? null : e('button', {
                type: 'button', className: 'geo-globe-btn' + (autoRotate ? ' on' : ''),
                'aria-pressed': autoRotate, onClick: () => setAutoRotate((v) => !v),
                title: 'Auto-rotate the globe',
            }, autoRotate ? '❚❚ AUTO-ROTATE' : '▶ AUTO-ROTATE')),
        error ? e('div', { className: 'geo-surface-error' }, 'Globe unavailable: ', error) : null);
}
