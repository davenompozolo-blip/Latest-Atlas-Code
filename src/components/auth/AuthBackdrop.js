// The landing page's scene: grid, glow, ridges, the market surface, a globe
// and the seeded traces. Decorative and hidden from assistive tech; every
// shape comes from src/lib/authBackdrop.js and none of it is a figure.

import React from 'react';
import { backdropTraces, backdropScene, BACKDROP_VIEW } from '../../lib/authBackdrop.js';

const e = React.createElement;
const TRACES = backdropTraces();
const SCENE = backdropScene();

function Globe() {
    const g = SCENE.globe;
    return e('svg', {
        className: 'ag-globe', viewBox: (g.cx - g.r - 40) + ' ' + (g.cy - g.r - 40) + ' ' + (g.r * 2 + 80) + ' ' + (g.r * 2 + 80),
        'aria-hidden': 'true', focusable: 'false',
    },
        e('defs', null,
            e('radialGradient', { id: 'ag-globe-glow', cx: '50%', cy: '50%', r: '50%' },
                e('stop', { offset: '70%', stopColor: 'var(--nx-accent)', stopOpacity: 0 }),
                e('stop', { offset: '88%', stopColor: 'var(--nx-accent)', stopOpacity: 0.10 }),
                e('stop', { offset: '100%', stopColor: 'var(--nx-accent)', stopOpacity: 0 })),
            e('radialGradient', { id: 'ag-globe-face', cx: '38%', cy: '35%', r: '70%' },
                e('stop', { offset: '0%', stopColor: 'var(--nx-blue)', stopOpacity: 0.16 }),
                e('stop', { offset: '100%', stopColor: 'var(--nx-bg)', stopOpacity: 0.05 }))),
        e('circle', { cx: g.cx, cy: g.cy, r: g.r + 34, fill: 'url(#ag-globe-glow)' }),
        e('circle', { className: 'ag-globe-rim', cx: g.cx, cy: g.cy, r: g.r, fill: 'url(#ag-globe-face)' }),
        e('path', { className: 'ag-globe-grat', d: g.graticule.join(' ') }),
        e('path', { className: 'ag-globe-links', d: g.links }),
        e('g', { className: 'ag-globe-nodes' },
            g.nodes.map((n, i) => e('circle', {
                key: i, cx: n.x, cy: n.y, r: 1.2 + n.z * 1.6,
                className: i % 9 === 0 ? 'ag-globe-node ag-globe-node--lit' : 'ag-globe-node',
                style: { opacity: 0.25 + n.z * 0.65 },
            }))));
}

export function AuthBackdrop() {
    const { width, height } = BACKDROP_VIEW;
    const lead = TRACES[0];
    const s = SCENE.surface;
    return e('div', { className: 'ag-scene', 'aria-hidden': 'true' },
        e('div', { className: 'ag-grid' }),
        e(Globe, null),
        e('svg', {
            className: 'ag-traces', viewBox: '0 0 ' + width + ' ' + height,
            preserveAspectRatio: 'xMidYMax slice', focusable: 'false',
        },
            e('defs', null,
                e('linearGradient', { id: 'ag-area-fill', x1: 0, y1: 0, x2: 0, y2: 1 },
                    e('stop', { offset: '0%', stopColor: 'var(--nx-accent)', stopOpacity: 0.14 }),
                    e('stop', { offset: '100%', stopColor: 'var(--nx-accent)', stopOpacity: 0 })),
                e('linearGradient', { id: 'ag-ridge-far', x1: 0, y1: 0, x2: 0, y2: 1 },
                    e('stop', { offset: '0%', stopColor: 'var(--nx-bg3)' }),
                    e('stop', { offset: '100%', stopColor: 'var(--nx-bg)' })),
                e('linearGradient', { id: 'ag-ridge-near', x1: 0, y1: 0, x2: 0, y2: 1 },
                    e('stop', { offset: '0%', stopColor: 'var(--nx-bg2)' }),
                    e('stop', { offset: '100%', stopColor: 'var(--nx-bg)' })),
                e('linearGradient', { id: 'ag-mesh-fade', x1: 0, y1: 0, x2: 0, y2: 1 },
                    e('stop', { offset: '0%', stopColor: '#fff', stopOpacity: 0 }),
                    e('stop', { offset: '35%', stopColor: '#fff', stopOpacity: 0.7 }),
                    e('stop', { offset: '100%', stopColor: '#fff', stopOpacity: 1 })),
                e('mask', { id: 'ag-mesh-mask' },
                    e('rect', { x: 0, y: 0, width, height, fill: 'url(#ag-mesh-fade)' }))),
            e('g', { className: 'ag-traces-drift' },
                SCENE.ridges.map((r) => e('path', { key: r.key, className: 'ag-ridge ag-ridge--' + r.tone, d: r.d, fill: 'url(#ag-ridge-' + r.tone + ')' })),
                e('path', { className: 'ag-area', d: lead.d + ' L' + width + ' ' + height + ' L0 ' + height + ' Z', fill: 'url(#ag-area-fill)' }),
                TRACES.map((t) => e('path', { key: t.key, className: 'ag-line ag-line--' + t.tone, d: t.d, pathLength: 1 }))),
            e('g', { className: 'ag-mesh', mask: 'url(#ag-mesh-mask)' },
                e('path', { className: 'ag-mesh-cols', d: s.cols.join(' ') }),
                s.rows.map((r, i) => e('path', { key: i, className: 'ag-mesh-row', d: r.d, style: { opacity: 0.25 + r.depth * 0.75 } })),
                s.nodes.map((n, i) => e('circle', { key: i, className: 'ag-mesh-node', cx: n.x, cy: n.y, r: n.r })))));
}
