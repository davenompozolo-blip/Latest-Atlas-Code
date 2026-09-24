// ATLAS Geographic surface — the layer registry.
//
// One frozen array. The layer rail, the renderer toggle, the tile form and the
// command palette all read from it, and NOTHING ELSE DECLARES A LAYER. The
// renderer toggle filters this array rather than branching the component
// tree, which is why `renderers` sits on the definition instead of being
// inferred from the kind.
//
//   key        stable id, used in URL state
//   label      display name
//   group      'exposure' | 'universe' | 'context' — rail grouping
//   kind       'choropleth' | 'point' | 'arc' — which deck.gl class builds it
//   renderers  which paint targets can draw it
//   basis      which resolver call it needs ('domicile' | 'revenue' | 'active' | null)
//   requires   prerequisites the consumer must declare as satisfied
//   defaultOn  initial state
//   unmet      why each prerequisite can be missing, in words the rail prints
//
// A layer whose prerequisite is unmet greys out in the rail WITH ITS REASON.
// It is never hidden: a layer that silently disappears reads as a product
// that does not have the feature, when the truth is that the data is absent.

export const RENDERERS = Object.freeze(['flat', 'globe']);

const def = (o) => Object.freeze({ ...o, renderers: Object.freeze(o.renderers), requires: Object.freeze(o.requires || []) });

export const LAYERS = Object.freeze([
    def({
        key: 'revenue-source', label: 'Revenue source', group: 'exposure', kind: 'choropleth',
        renderers: ['flat', 'globe'], basis: 'revenue', requires: [], defaultOn: true,
    }),
    def({
        key: 'domicile', label: 'Domicile', group: 'exposure', kind: 'choropleth',
        renderers: ['flat', 'globe'], basis: 'domicile', requires: [], defaultOn: false,
    }),
    def({
        key: 'active-weight', label: 'Active vs benchmark', group: 'exposure', kind: 'choropleth',
        renderers: ['flat', 'globe'], basis: 'active', requires: ['benchmark-geo'], defaultOn: false,
    }),
    def({
        key: 'coverage', label: 'Coverage', group: 'universe', kind: 'choropleth',
        renderers: ['flat', 'globe'], basis: 'revenue', requires: [], defaultOn: false,
    }),
    def({
        key: 'listing-venues', label: 'Listing venues', group: 'universe', kind: 'point',
        renderers: ['flat', 'globe'], basis: null, requires: [], defaultOn: true,
    }),
    // The book and its candidate universe, one marker pair per domicile.
    // Needs a consumer that has loaded the candidate map (Nexus -> Holdings).
    def({
        key: 'book-positions', label: 'Book and candidates', group: 'universe', kind: 'point',
        renderers: ['flat', 'globe'], basis: null, requires: ['candidate-universe'], defaultOn: false,
    }),
    def({
        key: 'revenue-flows', label: 'Revenue flows', group: 'universe', kind: 'arc',
        renderers: ['flat', 'globe'], basis: 'revenue', requires: [], defaultOn: false,
    }),
    def({
        key: 'fx-sensitivity', label: 'FX sensitivity', group: 'context', kind: 'choropleth',
        renderers: ['flat'], basis: null, requires: ['fx-sensitivity'], defaultOn: false,
    }),
    def({
        key: 'chokepoints', label: 'Chokepoints', group: 'context', kind: 'point',
        renderers: ['flat', 'globe'], basis: null, requires: [], defaultOn: false,
    }),
]);

// Why a prerequisite can be unmet. Printed in the rail beside the greyed row.
export const UNMET_REASON = Object.freeze({
    'benchmark-geo': 'No benchmark geographic breakdown on file, so there is nothing to be active against.',
    'fx-sensitivity': 'No per-country currency sensitivity on file, and the reporting currency is an open decision.',
    'candidate-universe': 'This view does not load the candidate universe. It lives on Nexus -> Holdings -> MAP -> GEOGRAPHY.',
});

export const GROUPS = Object.freeze([
    Object.freeze({ key: 'exposure', label: 'EXPOSURE BASIS' }),
    Object.freeze({ key: 'universe', label: 'UNIVERSE' }),
    Object.freeze({ key: 'context', label: 'CONTEXT' }),
]);

const BY_KEY = new Map(LAYERS.map((l) => [l.key, l]));

export function layerByKey(key) {
    return BY_KEY.get(key) || null;
}

/**
 * Can this layer draw here, and if not, why not.
 * @param {object} layer          a registry entry
 * @param {'flat'|'globe'} renderer
 * @param {Set<string>|string[]} satisfied  prerequisites the consumer has met
 */
export function availability(layer, renderer, satisfied) {
    const met = satisfied instanceof Set ? satisfied : new Set(satisfied || []);
    if (!layer.renderers.includes(renderer)) {
        return { available: false, reason: `${layer.label} draws on the ${layer.renderers.join(' and ')} renderer only.` };
    }
    const missing = layer.requires.filter((r) => !met.has(r));
    if (missing.length) {
        return { available: false, reason: missing.map((r) => UNMET_REASON[r] || `Needs ${r}.`).join(' ') };
    }
    return { available: true, reason: null };
}

/**
 * Every choropleth paints the same country polygons, so at most one may be on
 * at a time — they would stack illegibly. The spec states this for the
 * exposure group; coverage and FX sensitivity are choropleths too and collide
 * for exactly the same reason, so the rule is keyed on KIND, not group.
 *
 * Turning a choropleth on turns any other choropleth off. Points and arcs
 * toggle freely.
 */
export function toggleLayer(active, key) {
    const layer = layerByKey(key);
    if (!layer) return active.slice();
    const on = active.includes(key);
    if (on) return active.filter((k) => k !== key);
    if (layer.kind === 'choropleth') {
        return active.filter((k) => layerByKey(k) && layerByKey(k).kind !== 'choropleth').concat([key]);
    }
    return active.concat([key]);
}

export function defaultLayers() {
    return LAYERS.filter((l) => l.defaultOn).map((l) => l.key);
}

/** Keys that can actually draw under this renderer and prerequisite set. */
export function drawable(active, renderer, satisfied) {
    return active.filter((k) => {
        const l = layerByKey(k);
        return l && availability(l, renderer, satisfied).available;
    });
}
