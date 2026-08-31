// ============================================================
// ATLAS Nexus — layout flag (v1 ↔ v2 Flagship arrangement)
// ------------------------------------------------------------
// Persists exactly the way column visibility does (nexusColumns.js):
// one localStorage key, a defensive read, and a write that shrugs off
// private mode. An unknown or unreadable value falls back to 'v1', so
// a stale or hand-edited preference can never render a layout that
// does not exist.
//
// Nexus-only on purpose — do NOT share this with another surface. The
// v1 and v2 arrangements are two answers to "how should the Flagship
// tab be shaped", which is a question no other page is asking.
//
// Ships defaulted to 'v1'. The flip to 'v2' is its own one-line commit
// so the arrangement and the switch-on stay separately revertable.
// ============================================================

const STORAGE_KEY = 'atlas.nexus.layout.v2';
const LAYOUTS = ['v1', 'v2'];
export const DEFAULT_LAYOUT = 'v1';

export function loadLayout() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return LAYOUTS.indexOf(raw) !== -1 ? raw : DEFAULT_LAYOUT;
    } catch (_) {
        return DEFAULT_LAYOUT;
    }
}

export function saveLayout(v) {
    if (LAYOUTS.indexOf(v) === -1) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, v);
    } catch (_) { /* private mode — the session still works, it just won't persist */ }
}
