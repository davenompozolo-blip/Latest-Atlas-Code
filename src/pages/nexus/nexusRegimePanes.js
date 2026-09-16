// ============================================================
// F-1 — Regime tab pane switcher · pure logic
// ------------------------------------------------------------
// The pane list is DATA. Nothing in the switcher knows how many panes
// there are or what they are called, so F-2 adds the structural-regimes
// pane by adding one entry and changes no logic here.
// ============================================================

// Selection persists "across navigation within the session" (F2 section 1),
// so sessionStorage, not localStorage: a new tab is a new session and
// should open on the default rather than inherit a choice made elsewhere.
export const PANE_STORAGE_KEY = 'atlas.regime.pane.v1';

// A stored key that no longer exists must fall back, not select nothing.
// Renaming or removing a pane would otherwise leave a returning reader on
// a blank tab with every control looking unselected -- and because the
// value is per-browser it would persist for exactly the people who used
// the tab most.
export function resolveInitialPane(stored, paneKeys, fallback) {
    const keys = Array.isArray(paneKeys) ? paneKeys : [];
    const dflt = keys.includes(fallback) ? fallback : (keys[0] ?? null);
    if (typeof stored !== 'string' || !stored) return dflt;
    return keys.includes(stored) ? stored : dflt;
}

// A pane is revealed when it is the active one, or when it has been active
// at any earlier point in this mount.
//
// THIS RESOLVES A CONTRADICTION IN F2 section 1, which asks for two things
// that cannot both hold literally:
//
//   "All panes mount and are hidden by script, never conditionally
//    rendered" -- so a first switch cannot jump; and
//   "Each pane fetches on first reveal, not on page load" -- so the tab
//    does not fire every pane's queries at once against a 3s anon cap.
//
// Every pane here self-fetches in a mount effect (NexusPairExplorer,
// NexusAxes and the macro dashboard all do), so mounting them all at load
// IS fetching them all at load. The spec states the reason for each rule,
// and the fetch rule's reason is the graver one: a cancelled query renders
// as "no data", which is a false statement about the market rather than a
// cosmetic flaw. So panes mount on first reveal and then STAY mounted --
// which delivers the mount rule's actual purpose (no refetch on toggle, no
// jump on any switch after the first) without the stampede.
export function revealedPanes(activeKey, previouslyRevealed) {
    const next = new Set(previouslyRevealed || []);
    if (activeKey) next.add(activeKey);
    return next;
}

// Read/write are wrapped because sessionStorage throws in some privacy
// modes and returns null when cleared. The tab must render correctly with
// no storage at all, so a failure is silent and simply means "no
// preference" -- never a broken pane.
export function readStoredPane(storage) {
    try {
        return storage ? storage.getItem(PANE_STORAGE_KEY) : null;
    } catch {
        return null;
    }
}

export function writeStoredPane(storage, key) {
    // Returns whether the preference was actually stored. The first draft
    // returned true when `storage` was absent -- claiming a write that
    // never happened, which is the same class of untruth as a swallowed
    // write failure. Caught by its own test.
    if (!storage || !key) return false;
    try {
        storage.setItem(PANE_STORAGE_KEY, key);
        return true;
    } catch {
        return false;
    }
}

// Left/Right move between panes, Home/End jump to the ends, per the WAI
// tablist pattern. Wrapping is deliberate: a tablist this short is faster
// to traverse than it is to stop at an edge and reverse.
export function nextPaneByKeyboard(key, activeKey, paneKeys) {
    const keys = Array.isArray(paneKeys) ? paneKeys : [];
    if (!keys.length) return null;
    const i = keys.indexOf(activeKey);
    if (i < 0) return keys[0];
    switch (key) {
        case 'ArrowRight': return keys[(i + 1) % keys.length];
        case 'ArrowLeft':  return keys[(i - 1 + keys.length) % keys.length];
        case 'Home':       return keys[0];
        case 'End':        return keys[keys.length - 1];
        default:           return null;
    }
}
