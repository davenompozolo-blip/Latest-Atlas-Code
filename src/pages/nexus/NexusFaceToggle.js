// ============================================================
// ATLAS Nexus — NexusFaceToggle (the shared two-face control)
// ------------------------------------------------------------
// One mechanic, written three separate ways before this file: the
// spine's Bars ↔ Treemap tabs, the Theme tab's rotation map ↔
// leadership ledger, and beat 06's bars ↔ heatmap. Same control,
// three implementations, three sets of bugs to fix twice.
//
// The rule this component encodes: BOTH FACES ARE THE SAME DATA
// ANSWERING THE SAME QUESTION DIFFERENTLY. If one face shows rows the
// other doesn't, it is a filter or a drill-down and does not belong
// here — the holdings table is the standing example, because no chart
// says what 59 rows say.
//
//   e(NexusFaceToggle, {
//       faces: [{ id: 'bars', label: 'Bars' }, { id: 'map', label: 'Treemap' }],
//       active, onChange,
//       persistKey: 'atlas.nexus.spine.face.v1',  // optional
//       affix: true,                              // optional, see below
//   })
//
// Presentational and controlled: the caller owns `active`. Persistence
// is opt-in and additive — pass `persistKey` and the choice is written
// on change; pair it with useFace() to read the stored value back on
// mount. Callers that want the old ephemeral behaviour simply omit it.
//
// `affix` draws the `⇄` marker on the inactive face, so the control
// reads as "there is another side of this" rather than as a filter.
// It defaults to OFF because the spine's toggle renders in the v1
// layout too, which must stay pixel-identical; v2-only faces turn it
// on. Classes are the existing `nf-spine-toggle` / `nf-sp-tab` pair
// from nexus-flagship.css rather than new ones.
// ============================================================

import React from 'react';

const { useState } = React;
const e = React.createElement;

const idsOf = faces => (faces || []).map(f => f.id);

/**
 * Defensive read, same posture as nexusColumns.loadVisible(): an unknown,
 * stale or unreadable stored value falls back to the caller's default rather
 * than throwing or selecting a face that no longer exists.
 */
export function loadFace(persistKey, faces, fallback) {
    const ids = idsOf(faces);
    const def = fallback != null && ids.indexOf(fallback) !== -1 ? fallback : ids[0];
    if (!persistKey) return def;
    try {
        const raw = window.localStorage.getItem(persistKey);
        return raw && ids.indexOf(raw) !== -1 ? raw : def;
    } catch (_) {
        return def;
    }
}

export function saveFace(persistKey, id) {
    if (!persistKey) return;
    try {
        window.localStorage.setItem(persistKey, id);
    } catch (_) { /* private mode — the session still works, it just won't persist */ }
}

/** State hook for a persisted face. Omit persistKey for an ephemeral one. */
export function useFace(persistKey, faces, fallback) {
    return useState(() => loadFace(persistKey, faces, fallback));
}

export function NexusFaceToggle({ faces, active, onChange, persistKey, affix, className }) {
    if (!faces || faces.length < 2) return null;
    const pick = id => {
        saveFace(persistKey, id);
        if (onChange) onChange(id);
    };
    return e('div', { className: className || 'nf-spine-toggle' },
        faces.map(f => {
            const on = f.id === active;
            return e('button', {
                key: f.id,
                className: 'nf-sp-tab' + (on ? ' active' : ''),
                onClick: () => pick(f.id),
                title: f.title || null,
            }, affix && !on ? '⇄ ' + f.label : f.label);
        })
    );
}

export default NexusFaceToggle;
