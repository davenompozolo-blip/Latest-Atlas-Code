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
