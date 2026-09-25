import test from 'node:test';
import assert from 'node:assert/strict';
import { rateWindow } from './rateWindow.js';

const clock = () => { let t = 0; return { now: () => t, advance: ms => { t += ms; } }; };

// The sequence that broke the after-the-fact pause: three 12-call symbols
// then a 26-call one. Reserving before each must keep every 60s window <= 60.
test('no 60s window ever exceeds the limit, whatever the sequence', () => {
    const c = clock();
    const w = rateWindow({ limit: 60, windowMs: 60000, now: c.now });
    const log = [];
    for (const n of [12, 12, 12, 26, 12, 26, 26, 12]) {
        c.advance(w.waitFor(n));
        w.reserve(n);
        log.push({ t: c.now(), n });
        c.advance(500);   // the work itself takes a moment
    }
    for (const a of log) {
        const inWindow = log.filter(b => b.t > a.t - 60000 && b.t <= a.t).reduce((s, b) => s + b.n, 0);
        assert.ok(inWindow <= 60, 'window ending ' + a.t + ' held ' + inWindow);
    }
});

test('a released reservation (cache hit) frees its room at once', () => {
    const c = clock();
    const w = rateWindow({ limit: 60, windowMs: 60000, now: c.now });
    const h = w.reserve(26);
    w.reserve(26);
    assert.ok(w.waitFor(26) > 0);
    w.release(h);
    assert.equal(w.waitFor(26), 0);
});

test('the wait is exactly until enough of the oldest reservations age out', () => {
    const c = clock();
    const w = rateWindow({ limit: 60, windowMs: 60000, now: c.now });
    w.reserve(30); c.advance(10000);
    w.reserve(30); c.advance(5000);
    assert.equal(w.waitFor(12), 45000);   // the first 30 ages out at t=60000
});

test('a request larger than the whole limit is refused, not waited on forever', () => {
    const w = rateWindow({ limit: 60, windowMs: 60000, now: () => 0 });
    assert.equal(w.waitFor(61), Infinity);
});
