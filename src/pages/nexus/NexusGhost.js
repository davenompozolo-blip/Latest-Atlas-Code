// ============================================================
// ATLAS Nexus — Ghost (a panel that cannot answer, saying why)
// ------------------------------------------------------------
// The honesty rule this serves: a pane that cannot answer says why,
// and "no data" is never printed where "the writer never fired" is the
// truth. Every reason rendered here is one the compute layer already
// returns and the render boundary was throwing away.
//
// Form is one muted line with a left rule — deliberately NOT an empty
// card with reserved height. A feed that does not exist should not cost
// the vertical space of a panel that does.
//
// v2 only. The v1 layout keeps its existing empty states so it stays
// pixel-identical; callers pass `v2` and fall back to what they render
// today when it is absent.
// ============================================================

import React from 'react';

const e = React.createElement;

// dropReason codes → what they actually mean, in words. Anything
// unrecognised passes through as-is rather than being flattened to a
// generic "unavailable" — an unknown code is information too.
const REASON = {
    no_listed_options: 'no listed options on the held names',
    chain_too_thin: 'chain too thin — no usable strike depth',
    no_30d_expiry: 'no expiry near 30 days to interpolate from',
};

export function reasonText(code) {
    if (!code) return null;
    return REASON[code] || String(code).replace(/_/g, ' ');
}

/** The dominant dropReason across a set of option blocks, or null. */
export function dominantDropReason(blocks) {
    const tally = new Map();
    (blocks || []).forEach(b => {
        const r = b && b.dropReason;
        if (r) tally.set(r, (tally.get(r) || 0) + 1);
    });
    if (!tally.size) return null;
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function Ghost({ name, why }) {
    return e('div', { className: 'nfv2-ghost' },
        e('span', { className: 'nfv2-ghost-name' }, name),
        e('span', { className: 'nfv2-ghost-why' }, why)
    );
}

export default Ghost;
