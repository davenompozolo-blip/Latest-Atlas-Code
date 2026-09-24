// ATLAS Geographic surface — everything that is arithmetic rather than paint.
//
// Pure functions only: no React, no WebGL, no fetch. The renderers call these
// and the tests call these, so what the map shows and what the tests assert
// are the same computation.
//
// Weights arrive already resolved by `resolve_geo_exposure` (server-side, one
// row per country). Nothing here aggregates holdings into countries — the spec
// puts that in the database, and a second copy of it here is how the map and
// the footer would start to disagree.

// ── The coverage gate ──────────────────────────────────────────────────────
// Below this share of book weight resting on a disclosure, the surface mutes
// the choropleth and says what is missing. Spec: "start at 80%".
export const COVERAGE_FLOOR = 0.80;

export const UNALLOCATED = 'XX';

// ── Colour ─────────────────────────────────────────────────────────────────
// Sequential ramp for a weight, dark-to-cyan, matching the design board. The
// "none" step is its own colour, distinct from the lowest bin: a country the
// book has no exposure to is not a country with a small exposure.
export const WEIGHT_BINS = Object.freeze([
    Object.freeze({ key: 'none', label: 'none',   test: (w) => !(w > 0),   rgb: [27, 35, 45] }),
    Object.freeze({ key: 'b1',   label: '<1%',    test: (w) => w < 0.01,   rgb: [29, 74, 82] }),
    Object.freeze({ key: 'b2',   label: '1–4%',   test: (w) => w < 0.04,   rgb: [31, 106, 115] }),
    Object.freeze({ key: 'b3',   label: '4–10%',  test: (w) => w < 0.10,   rgb: [42, 154, 163] }),
    Object.freeze({ key: 'b4',   label: '>10%',   test: () => true,        rgb: [61, 214, 224] }),
]);

// Coverage is a share of a country's own weight, so its bins are about how
// much of the number rests on a disclosure, graded against the same floor.
export const COVERAGE_BINS = Object.freeze([
    Object.freeze({ key: 'none', label: 'no exposure', test: (c) => c == null, rgb: [27, 35, 45] }),
    Object.freeze({ key: 'c0',   label: '0%',          test: (c) => !(c > 0),  rgb: [120, 78, 34] }),
    Object.freeze({ key: 'c1',   label: '<50%',        test: (c) => c < 0.5,   rgb: [168, 116, 46] }),
    Object.freeze({ key: 'c2',   label: '50–80%',      test: (c) => c < COVERAGE_FLOOR, rgb: [31, 106, 115] }),
    Object.freeze({ key: 'c3',   label: '≥80%',        test: () => true,       rgb: [61, 214, 224] }),
]);

export function binOf(bins, v) {
    for (const b of bins) if (b.test(v)) return b;
    return bins[bins.length - 1];
}

const NO_POLYGON_FILL = [27, 35, 45, 255];

/**
 * Fill for a country polygon. `muted` is the coverage gate: the choropleth is
 * drawn at reduced opacity and desaturated towards the "none" colour, so a
 * surface resting on fallbacks never reads as a confident map.
 */
export function fillFor(entry, { scale = 'weight', muted = false } = {}) {
    if (!entry) return NO_POLYGON_FILL;
    const bins = scale === 'coverage' ? COVERAGE_BINS : WEIGHT_BINS;
    const v = scale === 'coverage' ? entry.coverage : entry.weight;
    const rgb = binOf(bins, v).rgb;
    if (!muted) return [rgb[0], rgb[1], rgb[2], 255];
    const base = NO_POLYGON_FILL;
    const mix = (i) => Math.round(base[i] + (rgb[i] - base[i]) * 0.45);
    return [mix(0), mix(1), mix(2), 255];
}

export function legendFor(scale) {
    return (scale === 'coverage' ? COVERAGE_BINS : WEIGHT_BINS).map((b) => ({ key: b.key, label: b.label, rgb: b.rgb }));
}

// ── Exposure ───────────────────────────────────────────────────────────────

function num(x) {
    const n = typeof x === 'string' ? Number(x) : x;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Rows from resolve_geo_exposure -> the surface's `exposure` prop.
 *
 * XX is split out rather than dropped: it has no polygon, so it cannot be
 * painted, and it must still be shown — "a map that hides 30% unattributed
 * revenue is worse than no map". The consumer renders `unallocated` as its
 * own slice.
 */
export function exposureFrom(rows) {
    const map = new Map();
    let unallocated = 0;
    for (const r of rows || []) {
        const w = num(r.weight);
        if (w == null) continue;
        if (r.iso2 === UNALLOCATED) { unallocated += w; continue; }
        map.set(r.iso2, {
            weight: w,
            coverage: num(r.coverage),
            contributors: r.contributor_count == null ? null : Number(r.contributor_count),
            attributableWeight: num(r.attributable_weight),
        });
    }
    return { map, unallocated };
}

/**
 * The gate. Returns whether the surface should be muted and the sentence that
 * names the gap. The sentence is built from the summary's own counts, so it
 * says what is missing, never just that something is.
 */
export function coverageState(summary, basis) {
    if (!summary) return { muted: true, coverage: null, sentence: 'Coverage unknown — the resolver did not answer.' };
    const cov = num(summary.book_coverage);
    if (basis === 'domicile') {
        const nd = Number(summary.no_domicile_count || 0);
        return {
            muted: cov == null || cov < COVERAGE_FLOOR,
            coverage: cov,
            sentence: nd
                ? `${nd} holding${nd === 1 ? '' : 's'} carry no recorded domicile and sit in unallocated.`
                : 'Every holding carries a sourced domicile.',
        };
    }
    const parts = [];
    const fb = Number(summary.domicile_fallback_count || 0);
    const fu = Number(summary.fund_unresolved_count || 0);
    const nd = Number(summary.no_domicile_count || 0);
    if (fb) parts.push(`${fb} holding${fb === 1 ? '' : 's'} (${pct(summary.domicile_fallback_weight)}) fall back to domicile`);
    if (fu) parts.push(`${fu} fund${fu === 1 ? '' : 's'} (${pct(summary.fund_unresolved_weight)}) have no look-through and sit in unallocated`);
    if (nd) parts.push(`${nd} (${pct(summary.no_domicile_weight)}) have no domicile at all`);
    const head = `Revenue coverage is ${pct(cov)} of book weight.`;
    return {
        muted: cov == null || cov < COVERAGE_FLOOR,
        coverage: cov,
        sentence: parts.length ? `${head} ${capitalise(parts.join('; '))}.` : head,
    };
}

function capitalise(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

export function pct(x, d = 1) {
    const n = num(x);
    return n == null ? '—' : (n * 100).toFixed(d) + '%';
}

export function pp(x, d = 1) {
    const n = num(x);
    if (n == null) return '—';
    const v = n * 100;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + 'pp';
}

/** Countries ranked by weight, XX excluded (it is reported apart). */
export function rankCountries(exposure, names, n = 10) {
    return [...exposure.map.entries()]
        .map(([iso2, e]) => ({ iso2, name: (names && names.get(iso2)) || iso2, ...e }))
        .filter((r) => r.weight > 0)
        .sort((a, b) => b.weight - a.weight || a.iso2.localeCompare(b.iso2))
        .slice(0, n);
}

/**
 * Revenue minus domicile, per country. WITHHELD when revenue coverage is
 * under the floor: at 0% coverage every "gap" is just a fund moving into
 * unallocated, and ranking those as findings would publish the resolver's
 * own gaps as a statement about the book.
 */
export function gaps(revenue, domicile, revenueCoverage) {
    if (!(revenueCoverage >= COVERAGE_FLOOR)) {
        return { withheld: true, reason: `Withheld — revenue coverage is ${pct(revenueCoverage)} against an ${pct(COVERAGE_FLOOR, 0)} floor.`, rows: [] };
    }
    const keys = new Set([...revenue.map.keys(), ...domicile.map.keys()]);
    const rows = [...keys].map((iso2) => {
        const r = revenue.map.get(iso2);
        const d = domicile.map.get(iso2);
        return { iso2, revenue: r ? r.weight : 0, domicile: d ? d.weight : 0, gap: (r ? r.weight : 0) - (d ? d.weight : 0) };
    }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap) || a.iso2.localeCompare(b.iso2));
    return { withheld: false, reason: null, rows };
}

/** Holdings behind one country on the active basis, largest first. */
export function contributorsOf(detail, iso2) {
    return (detail || [])
        .filter((d) => d.iso2 === iso2 && num(d.weight) > 0)
        .map((d) => ({
            symbol: d.symbol, name: d.name, weight: num(d.weight), positionWeight: num(d.position_weight),
            resolution: d.resolution, attributable: !!d.attributable, kind: d.instrument_kind,
            sourceUrl: d.source_url || null, periodEnd: d.period_end || null,
        }))
        .sort((a, b) => b.weight - a.weight || String(a.symbol).localeCompare(String(b.symbol)));
}

// A fallback weight is a guess about where a company earns, so it plots but
// never ranks beside a disclosure. Same rule as the positioning map's levered
// and inverse funds.
export const FALLBACK_RESOLUTIONS = Object.freeze(['domicile_fallback', 'fund_no_lookthrough', 'no_domicile', 'estimated']);

export function isFallback(resolution) {
    return FALLBACK_RESOLUTIONS.includes(resolution);
}

export const RESOLUTION_LABEL = Object.freeze({
    disclosed: 'disclosed',
    mapped_from_segment: 'segment-mapped',
    estimated: 'estimate',
    domicile: 'domicile',
    domicile_fallback: 'domicile fallback',
    fund_no_lookthrough: 'fund · no look-through',
    no_domicile: 'no domicile',
});

// ── Flows and points ───────────────────────────────────────────────────────

/**
 * Domicile -> revenue-source arcs. Only from DISCLOSED rows naming a country
 * other than the domicile: a fallback row has, by construction, no flow — it
 * was placed at its own domicile — and drawing it would draw the guess.
 */
export function flowsFrom(detail, centroids) {
    const acc = new Map();
    for (const d of detail || []) {
        if (!d.attributable || !d.domicile_iso2 || d.iso2 === UNALLOCATED || d.iso2 === d.domicile_iso2) continue;
        const from = centroids.get(d.domicile_iso2);
        const to = centroids.get(d.iso2);
        if (!from || !to) continue;
        const k = d.domicile_iso2 + '>' + d.iso2;
        const cur = acc.get(k) || { from: d.domicile_iso2, to: d.iso2, source: from, target: to, weight: 0, symbols: [] };
        cur.weight += num(d.weight) || 0;
        cur.symbols.push(d.symbol);
        acc.set(k, cur);
    }
    return [...acc.values()].sort((a, b) => b.weight - a.weight);
}

// Listing venues. A venue is a place, so its coordinates are a fact about the
// exchange, not about the book. Alpaca's `exchange` codes, as they appear on
// `assets`.
export const VENUES = Object.freeze({
    NYSE:   Object.freeze({ label: 'New York Stock Exchange', lon: -74.0113, lat: 40.7069 }),
    ARCA:   Object.freeze({ label: 'NYSE Arca',               lon: -74.0113, lat: 40.7069 }),
    AMEX:   Object.freeze({ label: 'NYSE American',           lon: -74.0113, lat: 40.7069 }),
    NASDAQ: Object.freeze({ label: 'Nasdaq',                  lon: -73.9863, lat: 40.7570 }),
    BATS:   Object.freeze({ label: 'Cboe BZX',                lon: -94.7336, lat: 38.9536 }),
});

/** One point per venue, sized by the book weight listed there. */
export function venuesFrom(detail, exchangeBySymbol) {
    const perAsset = new Map();
    for (const d of detail || []) {
        if (!perAsset.has(d.asset_id)) perAsset.set(d.asset_id, { symbol: d.symbol, w: num(d.position_weight) || 0 });
    }
    const acc = new Map();
    let unplaced = 0;
    let unplacedWeight = 0;
    for (const { symbol, w } of perAsset.values()) {
        const code = exchangeBySymbol && exchangeBySymbol.get(symbol);
        const v = code && VENUES[code];
        if (!v) { unplaced += 1; unplacedWeight += w; continue; }
        const cur = acc.get(code) || { code, ...v, weight: 0, count: 0 };
        cur.weight += w;
        cur.count += 1;
        acc.set(code, cur);
    }
    return { points: [...acc.values()].sort((a, b) => b.weight - a.weight), unplaced, unplacedWeight };
}

// Maritime chokepoints: context, not exposure. Positions are approximate —
// good enough to orient a reader, not to route a ship.
export const CHOKEPOINTS = Object.freeze([
    { key: 'hormuz',     label: 'Strait of Hormuz',      lon: 56.4,   lat: 26.6 },
    { key: 'malacca',    label: 'Strait of Malacca',     lon: 101.3,  lat: 2.5 },
    { key: 'suez',       label: 'Suez Canal',            lon: 32.35,  lat: 30.6 },
    { key: 'babelmandeb',label: 'Bab-el-Mandeb',         lon: 43.4,   lat: 12.6 },
    { key: 'panama',     label: 'Panama Canal',          lon: -79.7,  lat: 9.1 },
    { key: 'bosporus',   label: 'Bosporus',              lon: 29.05,  lat: 41.1 },
    { key: 'gibraltar',  label: 'Strait of Gibraltar',   lon: -5.6,   lat: 35.95 },
    { key: 'taiwan',     label: 'Taiwan Strait',         lon: 119.5,  lat: 24.5 },
    { key: 'goodhope',   label: 'Cape of Good Hope',     lon: 18.47,  lat: -34.36 },
].map(Object.freeze));

// ── Regions ────────────────────────────────────────────────────────────────
// View presets. Bounds are [west, south, east, north]; a preset is a camera,
// never a filter — the exposure outside the view still exists.
export const REGIONS = Object.freeze([
    Object.freeze({ key: 'world',    label: 'WORLD',    bounds: [-170, -58, 190, 80] }),
    Object.freeze({ key: 'emea',     label: 'EMEA',     bounds: [-25, -36, 62, 72] }),
    Object.freeze({ key: 'apac',     label: 'APAC',     bounds: [60, -48, 180, 55] }),
    Object.freeze({ key: 'americas', label: 'AMERICAS', bounds: [-170, -56, -30, 72] }),
    Object.freeze({ key: 'africa',   label: 'AFRICA',   bounds: [-20, -36, 55, 38] }),
]);

// ── Viewport culling with a content key ────────────────────────────────────

export function bboxOf(geometry) {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    const walk = (c) => {
        if (typeof c[0] === 'number') {
            if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
            if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
            return;
        }
        for (const x of c) walk(x);
    };
    if (geometry && geometry.coordinates) walk(geometry.coordinates);
    return [w, s, e, n];
}

/**
 * Precompute every feature's bounding box once; on each viewport change cull,
 * join the visible ids into a key, and return the IDENTICAL array reference
 * when the key is unchanged. deck.gl skips retessellation on reference
 * equality, and without this panning re-uploads every polygon every frame.
 *
 * A view wider than the world, or one crossing the antimeridian, returns
 * everything: culling there saves nothing and risks dropping a polygon.
 */
export function makeCuller(features) {
    const boxes = features.map((f) => bboxOf(f.geometry));
    let lastKey = null;
    let lastArr = null;
    return function cull(bounds) {
        let visible;
        if (!bounds || bounds[2] - bounds[0] >= 360 || bounds[0] < -180 || bounds[2] > 180) {
            visible = features;
        } else {
            const [vw, vs, ve, vn] = bounds;
            visible = features.filter((f, i) => {
                const b = boxes[i];
                return b[2] >= vw && b[0] <= ve && b[3] >= vs && b[1] <= vn;
            });
        }
        const key = visible.map((f, i) => f.id == null ? '~' + i : f.id).join(',') + '|' + visible.length;
        if (key === lastKey) return lastArr;
        lastKey = key;
        lastArr = visible;
        return visible;
    };
}

// ── URL state ──────────────────────────────────────────────────────────────
// Renderer choice rides in the URL (?r=globe) rather than local storage, so a
// shared link carries it. The Trade module routes on the hash, so the query
// sits inside it: #/trade/geographic?r=globe&l=domicile,chokepoints&c=CN

export function parseGeoState(hash, knownLayers) {
    const q = String(hash || '').split('?')[1] || '';
    const p = new URLSearchParams(q);
    const r = p.get('r') === 'globe' ? 'globe' : 'flat';
    const known = new Set(knownLayers || []);
    const layers = p.has('l')
        ? p.get('l').split(',').filter((k) => known.has(k))
        : null;
    const c = p.get('c');
    return { renderer: r, layers, selected: c && /^[A-Z]{2}$/.test(c) && c !== UNALLOCATED ? c : null };
}

export function geoQuery({ renderer, layers, selected }) {
    const p = new URLSearchParams();
    if (renderer === 'globe') p.set('r', 'globe');
    if (layers) p.set('l', layers.join(','));
    if (selected) p.set('c', selected);
    const s = p.toString().replace(/%2C/g, ',');
    return s ? '?' + s : '';
}

// ── Interaction ────────────────────────────────────────────────────────────

/** Leading + trailing throttle. The surface throttles hover to 60 ms. */
export function throttle(fn, ms, now = () => Date.now(), timer = { set: setTimeout, clear: clearTimeout }) {
    let last = -Infinity;
    let pending = null;
    let lastArgs = null;
    return function (...args) {
        lastArgs = args;
        const t = now();
        if (t - last >= ms) {
            last = t;
            if (pending) { timer.clear(pending); pending = null; }
            fn(...args);
        } else if (!pending) {
            pending = timer.set(() => { last = now(); pending = null; fn(...lastArgs); }, ms - (t - last));
        }
    };
}

// ── Footer statistics ──────────────────────────────────────────────────────

/**
 * The strip under the map. Every figure is either measured or explicitly
 * withheld, and the withheld ones say why.
 */
export function footerStats({ revenue, domicile, revenueSummary, domicileSummary }) {
    const revCov = revenueSummary ? num(revenueSummary.book_coverage) : null;
    const lookThrough = revenue
        ? [...revenue.map.values()].filter((e) => (e.attributableWeight || 0) > 0).length
        : null;
    const domCountries = domicile ? [...domicile.map.values()].filter((e) => e.weight > 0).length : null;
    const hhiSrc = revCov != null && revCov >= COVERAGE_FLOOR ? revenueSummary : domicileSummary;
    const hhi = hhiSrc ? num(hhiSrc.concentration_hhi) : null;
    const g = revenue && domicile ? gaps(revenue, domicile, revCov) : { withheld: true, rows: [], reason: 'Withheld — a basis did not load.' };
    return {
        lookThroughCountries: lookThrough,
        domicileCountries: domCountries,
        hhiTimes1e3: hhi == null ? null : hhi * 1000,
        hhiBasis: hhiSrc === revenueSummary ? 'revenue' : 'domicile',
        largestGap: g.withheld ? null : g.rows[0] || null,
        gapWithheld: g.withheld ? g.reason : null,
    };
}

/** Universe names domiciled in a country — "screen this exposure". */
export function screenByDomicile(members, domicileBySymbol, iso2) {
    return (members || [])
        .filter((m) => domicileBySymbol.get(m.symbol) === iso2)
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || String(a.symbol).localeCompare(String(b.symbol)));
}
