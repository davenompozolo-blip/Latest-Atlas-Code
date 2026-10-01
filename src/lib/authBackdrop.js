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
        { key: 'lead', tone: 'accent', ...tracePath({ seed: 7, width, top: 470, bottom: 660, drift: -0.006, vol: 0.05 }) },
        { key: 'mid', tone: 'blue', ...tracePath({ seed: 23, width, top: 540, bottom: 740, drift: -0.002, vol: 0.045 }) },
        { key: 'low', tone: 'muted', ...tracePath({ seed: 91, width, top: 620, bottom: 860, drift: 0.001, vol: 0.04 }) },
    ];
}

// ---------------------------------------------------------------------------
// The scene behind the traces: mountain ridges, a perspective "market surface"
// across the lower third, and a networked globe at the upper right. All
// geometry, all seeded, nothing that reads as a figure.

const f1 = (n) => n.toFixed(1);

/** A ridge silhouette across the full width, closed to the bottom edge so it
 *  can be filled. Peaks sit between `peak` (highest) and `base` (lowest). */
export function ridgePath({ seed, width, height, peak, base, steps = 48, rough = 0.35 }) {
    const rnd = seededRandom(seed);
    const span = base - peak;
    const dx = width / steps;
    const pts = [];
    // Two slow swells plus jagged noise: reads as a range, not a sawtooth.
    const p1 = rnd() * Math.PI * 2, p2 = rnd() * Math.PI * 2;
    for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const swell = 0.5 + 0.3 * Math.sin(u * Math.PI * 2.2 + p1) + 0.2 * Math.sin(u * Math.PI * 5.3 + p2);
        const jag = (rnd() - 0.5) * rough;
        const t = Math.min(1, Math.max(0, swell + jag));
        pts.push([i * dx, base - t * span]);
    }
    const d = pts.map(([x, y], i) => (i === 0 ? 'M' : 'L') + f1(x) + ' ' + f1(y)).join(' ')
        + ' L' + width + ' ' + height + ' L0 ' + height + ' Z';
    return { d, top: Math.min(...pts.map((p) => p[1])) };
}

/**
 * A wire-mesh surface in false perspective: `rows` lines receding to a horizon
 * and `cols` lines converging toward the vanishing point, displaced by a seeded
 * terrain so it reads as a landscape of data. Nodes are a seeded subset of the
 * intersections on the nearer half.
 */
export function marketSurface({ seed, width, horizon, bottom, rows = 14, cols = 34, amp = 70, nodes = 18 }) {
    const rnd = seededRandom(seed);
    const waves = Array.from({ length: 4 }, () => ({ k: 1.5 + rnd() * 5, p: rnd() * Math.PI * 2, a: 0.4 + rnd() * 0.6 }));
    const cx = width / 2;
    const grid = [];
    for (let r = 0; r <= rows; r++) {
        const t = r / rows;                         // 0 far .. 1 near
        const depth = Math.pow(t, 1.7);
        const yBase = horizon + depth * (bottom - horizon);
        const spread = 0.65 + 1.6 * depth;          // near rows run past the edges
        const row = [];
        for (let c = 0; c <= cols; c++) {
            const u = c / cols - 0.5;               // -0.5 .. 0.5
            let h = 0;
            for (const w of waves) h += w.a * Math.sin(u * w.k * Math.PI * 2 + w.p + t * 2.1);
            // Rising toward the right, like a curve that ends higher.
            h += 0.9 * (u + 0.5);
            const x = cx + u * width * spread;
            const y = yBase - h * amp * (0.25 + 0.75 * depth);
            row.push([x, y]);
        }
        grid.push(row);
    }
    const line = (pts) => pts.map(([x, y], i) => (i === 0 ? 'M' : 'L') + f1(x) + ' ' + f1(y)).join(' ');
    const rowPaths = grid.map((row, r) => ({ d: line(row), depth: r / rows }));
    const colPaths = grid[0].map((_, c) => line(grid.map((row) => row[c])));
    const picks = [];
    const half = Math.floor(rows / 2);
    for (let i = 0; i < nodes; i++) {
        const r = half + Math.floor(rnd() * (rows - half + 1));
        const c = Math.floor(rnd() * (cols + 1));
        const [x, y] = grid[Math.min(rows, r)][c];
        if (x < 0 || x > width) continue;
        picks.push({ x: Number(f1(x)), y: Number(f1(y)), r: 1.6 + (r / rows) * 1.8 });
    }
    return { rows: rowPaths, cols: colPaths, nodes: picks };
}

/**
 * A networked globe, orthographic projection, seen slightly from above.
 * Returns graticule paths (front hemisphere only), node positions on the
 * visible face, and links between near neighbours.
 */
export function globeGeometry({ cx, cy, r, seed = 3, count = 140, tilt = 0.38, spin = 0.6, links = 2 }) {
    const rnd = seededRandom(seed);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    // lon/lat -> rotated unit vector; visible when z > 0
    const rot = (lon, lat) => {
        const x0 = Math.cos(lat) * Math.sin(lon + spin);
        const y0 = Math.sin(lat);
        const z0 = Math.cos(lat) * Math.cos(lon + spin);
        return [x0, y0 * ct - z0 * st, y0 * st + z0 * ct];
    };
    const proj = ([x, y]) => [cx + x * r, cy - y * r];
    const arc = (sample) => {
        // split into front-facing runs
        const segs = [];
        let cur = [];
        for (const v of sample) {
            if (v[2] > 0.02) cur.push(proj(v));
            else if (cur.length) { segs.push(cur); cur = []; }
        }
        if (cur.length) segs.push(cur);
        return segs.filter((s) => s.length > 1)
            .map((s) => s.map(([x, y], i) => (i === 0 ? 'M' : 'L') + f1(x) + ' ' + f1(y)).join(' '))
            .join(' ');
    };
    const graticule = [];
    for (let lon = 0; lon < 180; lon += 20) {
        const L = (lon * Math.PI) / 180;
        const s = [];
        for (let a = 0; a <= 360; a += 6) s.push(rot(L, (a * Math.PI) / 180));
        const d = arc(s);
        if (d) graticule.push(d);
    }
    for (let lat = -60; lat <= 60; lat += 20) {
        const B = (lat * Math.PI) / 180;
        const s = [];
        for (let a = 0; a <= 360; a += 6) s.push(rot((a * Math.PI) / 180, B));
        const d = arc(s);
        if (d) graticule.push(d);
    }
    // Nodes: a jittered Fibonacci sphere, so they spread evenly.
    const golden = Math.PI * (3 - Math.sqrt(5));
    const pts = [];
    for (let i = 0; i < count; i++) {
        const y = 1 - ((i + 0.5) / count) * 2;
        const lat = Math.asin(y) + (rnd() - 0.5) * 0.08;
        const lon = i * golden + (rnd() - 0.5) * 0.08;
        const v = rot(lon, lat);
        if (v[2] > 0.08) pts.push(v);
    }
    const nodes = pts.map((v) => {
        const [x, y] = proj(v);
        return { x: Number(f1(x)), y: Number(f1(y)), z: Number(v[2].toFixed(3)) };
    });
    const seen = new Set();
    const linkPaths = [];
    pts.forEach((a, i) => {
        const near = pts
            .map((b, j) => ({ j, d: (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 }))
            .filter((o) => o.j !== i)
            .sort((p, q) => p.d - q.d)
            .slice(0, links);
        for (const { j } of near) {
            const k = i < j ? i + ':' + j : j + ':' + i;
            if (seen.has(k)) continue;
            seen.add(k);
            linkPaths.push('M' + f1(nodes[i].x) + ' ' + f1(nodes[i].y) + ' L' + f1(nodes[j].x) + ' ' + f1(nodes[j].y));
        }
    });
    return { cx, cy, r, graticule, nodes, links: linkPaths.join(' ') };
}

/** Everything the scene draws, fixed for the 1600 x 900 view. */
export function backdropScene() {
    const { width, height } = BACKDROP_VIEW;
    return {
        ridges: [
            { key: 'far', tone: 'far', ...ridgePath({ seed: 41, width, height, peak: 470, base: 640, rough: 0.3 }) },
            { key: 'near', tone: 'near', ...ridgePath({ seed: 77, width, height, peak: 560, base: 720, rough: 0.4 }) },
        ],
        surface: marketSurface({ seed: 19, width, horizon: 610, bottom: 960 }),
        globe: globeGeometry({ cx: 1340, cy: 250, r: 250 }),
    };
}
