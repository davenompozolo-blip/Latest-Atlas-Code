// The sign-in page's backdrop: a few market-like traces drawn behind the card.
//
// Decorative only. The paths are a seeded random walk, so they are the same on
// every load (no layout shift between renders, nothing to cache) and they
// carry NO numbers -- no ticker, price or percentage is drawn, because a
// figure on screen in this product is read as a measurement and none of these
// are.

/** Deterministic PRNG (mulberry32): the same seed gives the same backdrop. */
export function seededRandom(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * One trace: a random walk across the full width, kept inside [top, bottom].
 * Returns the SVG path string and its final point (where the "live" dot sits).
 */
export function tracePath({ seed, width, top, bottom, steps = 64, drift = 0, vol = 0.04 }) {
    const rnd = seededRandom(seed);
    const span = bottom - top;
    let y = top + span * (0.35 + rnd() * 0.3);
    const dx = width / steps;
    const pts = [[0, y]];
    for (let i = 1; i <= steps; i++) {
        // drift is in units of the band per step; a negative drift rises on screen
        y += span * (drift + (rnd() - 0.5) * 2 * vol);
        if (y < top) y = top + (top - y) * 0.5;
        if (y > bottom) y = bottom - (y - bottom) * 0.5;
        y = Math.min(bottom, Math.max(top, y));
        pts.push([i * dx, y]);
    }
    const d = pts.map(([px, py], i) => (i === 0 ? 'M' : 'L') + px.toFixed(1) + ' ' + py.toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return { d, end: { x: last[0], y: last[1] }, points: pts.length };
}

/** The fixed set of traces the backdrop draws, in a 1600 x 900 viewBox. */
export const BACKDROP_VIEW = { width: 1600, height: 900 };

export function backdropTraces() {
    const { width } = BACKDROP_VIEW;
    return [
        { key: 'lead', tone: 'accent', ...tracePath({ seed: 7, width, top: 330, bottom: 640, drift: -0.006, vol: 0.05 }) },
        { key: 'mid', tone: 'blue', ...tracePath({ seed: 23, width, top: 420, bottom: 760, drift: -0.002, vol: 0.045 }) },
        { key: 'low', tone: 'muted', ...tracePath({ seed: 91, width, top: 520, bottom: 860, drift: 0.001, vol: 0.04 }) },
        { key: 'high', tone: 'muted', ...tracePath({ seed: 314, width, top: 90, bottom: 360, drift: -0.003, vol: 0.05 }) },
    ];
}
