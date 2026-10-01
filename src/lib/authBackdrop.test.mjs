import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom, tracePath, backdropTraces, BACKDROP_VIEW } from './authBackdrop.js';

test('the backdrop is identical on every load', () => {
    assert.deepEqual(backdropTraces(), backdropTraces());
    const a = seededRandom(5), b = seededRandom(5);
    for (let i = 0; i < 10; i++) assert.equal(a(), b());
});

test('every trace stays inside its band and spans the full width', () => {
    for (const band of [{ top: 100, bottom: 300 }, { top: 500, bottom: 520 }]) {
        const t = tracePath({ seed: 11, width: 1600, ...band, steps: 200, drift: 0.05, vol: 0.2 });
        const ys = [...t.d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
        const xs = [...t.d.matchAll(/[ML](-?[\d.]+) /g)].map((m) => Number(m[1]));
        assert.equal(ys.length, 201);
        assert.ok(ys.every((y) => y >= band.top - 1e-9 && y <= band.bottom + 1e-9));
        assert.equal(xs[0], 0);
        assert.equal(xs[xs.length - 1], 1600);
    }
});

test('the traces carry no figures, only geometry', () => {
    for (const t of backdropTraces()) {
        assert.match(t.d, /^M[\d. L]+$/);
        assert.ok(t.end.x === BACKDROP_VIEW.width);
        assert.ok(['accent', 'blue', 'muted'].includes(t.tone));
    }
});

import { ridgePath, marketSurface, globeGeometry, backdropScene } from './authBackdrop.js';

const NUMS = /-?\d+(?:\.\d+)?/g;

test('the scene is identical on every load', () => {
    assert.deepEqual(backdropScene(), backdropScene());
});

test('a ridge stays inside its band and closes to the bottom edge', () => {
    const r = ridgePath({ seed: 9, width: 1600, height: 900, peak: 400, base: 600, rough: 0.9 });
    assert.match(r.d, / L1600 900 L0 900 Z$/);
    const ys = [...r.d.replace(/ L1600 900 L0 900 Z$/, '').matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
    assert.ok(ys.every((y) => y >= 400 - 1e-9 && y <= 600 + 1e-9));
    assert.ok(r.top >= 400 && r.top <= 600);
});

test('the market surface is a closed grid and its nodes sit on screen', () => {
    const s = marketSurface({ seed: 19, width: 1600, horizon: 610, bottom: 960, rows: 10, cols: 20, nodes: 30 });
    assert.equal(s.rows.length, 11);
    assert.equal(s.cols.length, 21);
    for (const c of s.cols) assert.equal((c.match(/[ML]/g) || []).length, 11);
    assert.ok(s.nodes.length > 0);
    assert.ok(s.nodes.every((n) => n.x >= 0 && n.x <= 1600 && Number.isFinite(n.y)));
});

test('the globe draws only its front face, inside its own disc', () => {
    const g = globeGeometry({ cx: 500, cy: 400, r: 200 });
    assert.ok(g.nodes.length > 20 && g.graticule.length > 5);
    assert.ok(g.nodes.every((n) => n.z > 0 && Math.hypot(n.x - 500, n.y - 400) <= 200 + 0.1));
    const coords = (g.links + ' ' + g.graticule.join(' ')).match(NUMS).map(Number);
    for (let i = 0; i < coords.length; i += 2) {
        assert.ok(Math.hypot(coords[i] - 500, coords[i + 1] - 400) <= 200 + 0.1);
    }
});

test('the scene carries no figures, only geometry', () => {
    const s = backdropScene();
    const strings = [...s.ridges.map((r) => r.d), ...s.surface.rows.map((r) => r.d), ...s.surface.cols, ...s.globe.graticule, s.globe.links];
    for (const d of strings) assert.match(d, /^[ML\d. \-Z]+$/);
});
