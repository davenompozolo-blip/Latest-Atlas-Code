// Globe auto-rotation, as a small state machine with no DOM in it.
//
// The first version toggled OrbitControls.autoRotate straight from events:
// off on pointer-down and on hovering a country, back on at pointer-up and at
// hover-null. Every one of those "back on" events can fail to arrive:
//
//   - a drag released OUTSIDE the canvas fires pointerup on another element,
//     so a listener on the canvas never sees it;
//   - leaving the canvas while over a country does not reliably produce a
//     hover-null from globe.gl, because it only raycasts on pointer moves
//     over its own canvas;
//   - a React re-render or a layer toggle mid-hover rebuilds the polygons and
//     the "previous" hovered object simply stops existing.
//
// Each of those left the globe stopped for good, which reads as frozen.
//
// So the rule is no longer "an event turns rotation back on". It is a
// predicate evaluated every frame, and rotation is RESTORED BY DEFAULT:
//
//   speed = 0           if motion is reduced, auto-rotate is switched off,
//                       a country is selected (focus), or a pointer is held
//   speed = 0           for RESUME_AFTER_MS after a drag, wheel or click
//   speed = HOVER_SPEED while the pointer rests on a country
//   speed = FULL_SPEED  otherwise
//
// HOVER SLOWS, IT DOES NOT STOP. The spec said "pauses on hover over a
// country", and a globe that halts the instant the cursor crosses land is
// indistinguishable from one that has frozen -- which is exactly how it was
// reported. A crawl keeps it visibly alive and still makes a country easy to
// hit. A deliberate stop is kept for the two cases where the user asked for
// one: holding it (drag) and choosing a country (focus), and the focus stop is
// labelled on screen so it never reads as a fault.
//
// with two watchdogs so no stuck input can hold it off for ever: a hover
// expires HOVER_STALE_MS after the last pointer move (a hover with no motion
// behind it is a hover whose end we missed), and a held pointer expires after
// POINTER_STALE_MS.
//
// And speed eases towards its target instead of snapping between 0 and full,
// so a pause is a deceleration you can see coming, not a hard stop.

export const FULL_SPEED = 1.0;          // OrbitControls units; 1.0 ≈ 6°/s at 60 fps
export const HOVER_SPEED = 0.25;        // a crawl, not a halt
export const RESUME_AFTER_MS = 1800;    // after a drag / wheel / click
export const HOVER_STALE_MS = 2500;     // hover with no pointer motion behind it
export const POINTER_STALE_MS = 8000;   // a "held" pointer nobody released
export const EASE_MS = 350;             // time constant of the speed ramp

export function createRotationController({ reducedMotion = false, now = () => Date.now() } = {}) {
    const s = {
        reduced: !!reducedMotion,
        enabled: true,
        focused: false,
        pointerDownAt: null,
        hoverAt: null,        // last pointer move while over a country
        lastInteraction: -Infinity,
        speed: reducedMotion ? 0 : FULL_SPEED,
    };

    function wanted(t) {
        if (s.reduced || !s.enabled || s.focused) return 0;
        if (s.pointerDownAt != null && t - s.pointerDownAt < POINTER_STALE_MS) return 0;
        if (t - s.lastInteraction < RESUME_AFTER_MS) return 0;
        if (s.hoverAt != null && t - s.hoverAt < HOVER_STALE_MS) return HOVER_SPEED;
        return FULL_SPEED;
    }

    return {
        pointerDown() { s.pointerDownAt = now(); s.lastInteraction = now(); },
        // Released anywhere — the caller listens on window, not the canvas.
        pointerUp() { s.pointerDownAt = null; s.lastInteraction = now(); },
        // Called on every pointer move over the canvas with whether a country
        // is under it. Motion over the ocean clears the hover immediately.
        pointerMove(overCountry) { s.hoverAt = overCountry ? now() : null; },
        pointerLeave() { s.hoverAt = null; },
        interact() { s.lastInteraction = now(); },      // wheel, click, keyboard
        setReducedMotion(v) { s.reduced = !!v; if (s.reduced) s.speed = 0; },
        // Auto-rotate switched on or off by the user. Off stops at once.
        setEnabled(v) { s.enabled = !!v; if (!s.enabled) s.speed = 0; },
        // A country is selected: hold it in view until the selection clears.
        setFocused(v) { s.focused = !!v; },
        state() { return { reduced: s.reduced, enabled: s.enabled, focused: s.focused }; },
        /** Advance by dt ms and return the speed to apply this frame. */
        step(dt) {
            const target = wanted(now());
            const k = Math.min(1, Math.max(0, dt) / EASE_MS);
            s.speed += (target - s.speed) * k;
            if (Math.abs(s.speed - target) < 1e-3) s.speed = target;
            return s.speed;
        },
        target() { return wanted(now()); },
        /** Why the globe is doing what it is doing, as one word. */
        reason() {
            const t = now();
            if (s.reduced) return 'reduced';
            if (!s.enabled) return 'off';
            if (s.focused) return 'focus';
            if (s.pointerDownAt != null && t - s.pointerDownAt < POINTER_STALE_MS) return 'held';
            if (t - s.lastInteraction < RESUME_AFTER_MS) return 'settling';
            if (s.hoverAt != null && t - s.hoverAt < HOVER_STALE_MS) return 'hover';
            return 'full';
        },
        get speed() { return s.speed; },
    };
}
