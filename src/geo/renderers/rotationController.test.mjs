import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createRotationController, FULL_SPEED, HOVER_SPEED, RESUME_AFTER_MS, HOVER_STALE_MS, POINTER_STALE_MS,
} from './rotationController.js';

// A fake clock, so every rule is tested against time rather than against
// whichever order events happened to arrive in.
function rig(opts = {}) {
    let t = 0;
    const c = createRotationController({ now: () => t, ...opts });
    const run = (ms, step = 16) => { let v = c.speed; for (let i = 0; i < ms; i += step) { t += step; v = c.step(step); } return v; };
    return { c, run, advance: (ms) => { t += ms; } };
}

test('idle: rotates at full speed', () => {
    const { run } = rig();
    assert.equal(run(500), FULL_SPEED);
});

test('hovering a country SLOWS to a crawl — it never halts (the reported freeze)', () => {
    const { c, run } = rig();
    c.pointerMove(true);
    assert.equal(c.target(), HOVER_SPEED);
    assert.ok(HOVER_SPEED > 0 && HOVER_SPEED < FULL_SPEED);
    let v = 0;
    for (let i = 0; i < 20; i++) { c.pointerMove(true); v = run(200); }
    assert.ok(Math.abs(v - HOVER_SPEED) < 0.01, 'settles at the crawl, not at zero');
    c.pointerMove(false);
    assert.equal(c.target(), FULL_SPEED);
    assert.equal(run(3000), FULL_SPEED);
});

test('a hover whose end is never reported EXPIRES — the freeze this exists to stop', () => {
    const { c, run } = rig();
    c.pointerMove(true);          // hover-null never arrives
    assert.ok(Math.abs(run(HOVER_STALE_MS - 100) - HOVER_SPEED) < 0.02, 'crawling while the hover is fresh');
    assert.equal(run(HOVER_STALE_MS + 1500), FULL_SPEED, 'resumed once the hover went stale');
});

test('a pointer still moving over a country keeps the pause alive', () => {
    const { c, run } = rig();
    for (let i = 0; i < 10; i++) { c.pointerMove(true); run(HOVER_STALE_MS / 2); }
    assert.ok(Math.abs(c.speed - HOVER_SPEED) < 0.02);
});

test('leaving the canvas clears the hover immediately', () => {
    const { c } = rig();
    c.pointerMove(true);
    c.pointerLeave();
    assert.equal(c.target(), FULL_SPEED);
});

test('a drag pauses; release anywhere resumes after the quiet period', () => {
    const { c, run } = rig();
    c.pointerDown();
    assert.ok(run(3000) < 0.05);
    c.pointerUp();
    assert.equal(c.target(), 0, 'not the instant the button lifts');
    assert.equal(run(RESUME_AFTER_MS + 3000), FULL_SPEED);
});

test('a release that never arrives cannot hold rotation off for ever', () => {
    const { c, run } = rig();
    c.pointerDown();
    assert.equal(run(POINTER_STALE_MS + RESUME_AFTER_MS + 1500), FULL_SPEED);
});

test('speed EASES rather than snapping', () => {
    const { c, run } = rig();
    c.pointerDown();
    const v = run(100);
    assert.ok(v > 0.2 && v < FULL_SPEED, `mid-ramp after 100 ms, got ${v}`);
});

test('a selected country holds the globe still until the selection clears', () => {
    const { c, run } = rig();
    c.setFocused(true);
    assert.equal(run(10000), 0);
    c.setFocused(false);
    assert.equal(run(3000), FULL_SPEED);
});

test('the user switch wins over everything and stops at once', () => {
    const { c, run } = rig();
    run(500);
    c.setEnabled(false);
    assert.equal(c.speed, 0);
    assert.equal(run(5000), 0);
    c.setEnabled(true);
    assert.equal(run(3000), FULL_SPEED);
});

test('a drag outranks a hover: holding the globe stops it outright', () => {
    const { c, run } = rig();
    c.pointerMove(true);
    c.pointerDown();
    assert.ok(run(3000) < 0.01);
});

test('reduced motion never rotates, whatever the input', () => {
    const { c, run } = rig({ reducedMotion: true });
    assert.equal(run(5000), 0);
    c.setReducedMotion(false);
    assert.equal(run(3000), FULL_SPEED);
    c.setReducedMotion(true);
    assert.equal(c.speed, 0, 'switching it on stops at once, not after a ramp');
});

test('a huge frame gap cannot overshoot', () => {
    const { c } = rig();
    c.pointerMove(true);
    c.pointerMove(false);
    assert.ok(c.step(60000) <= FULL_SPEED);
    assert.ok(c.step(-5) >= 0);
});

test('reason() names the state in the order the rules apply', () => {
    const { c, advance } = rig();
    assert.equal(c.reason(), 'full');
    c.pointerMove(true); assert.equal(c.reason(), 'hover');
    c.pointerDown(); assert.equal(c.reason(), 'held');
    c.pointerUp(); assert.equal(c.reason(), 'settling');
    advance(RESUME_AFTER_MS + 1); c.pointerMove(false); assert.equal(c.reason(), 'full');
    c.setFocused(true); assert.equal(c.reason(), 'focus');
    c.setEnabled(false); assert.equal(c.reason(), 'off');
    c.setReducedMotion(true); assert.equal(c.reason(), 'reduced');
});
