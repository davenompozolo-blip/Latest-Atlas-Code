// ============================================================
// ATLAS Nexus — one read of /api/macro and /api/movers (G-4)
// ------------------------------------------------------------
// The market tape needs both; the cross-asset panels need /api/macro;
// the chrome's risk pill needs the barometer derived from it. Three
// components each fetching for themselves is three requests for one
// payload, and — worse — three payloads that can disagree, because the
// endpoint is cached with a TTL and two calls either side of an expiry
// return different data to two panels on the same screen.
//
// One module-level promise per endpoint, shared by every caller for the
// life of the page. Deliberately NOT a cache with its own TTL: the
// endpoints already cache server-side (1h for macro, 5m for movers), and
// a second TTL here would be a second policy to keep in step.
//
// A rejected promise is CACHED as rejected. A component mounting later
// must see the same failure the first one saw, rather than quietly
// retrying and rendering a panel beside one that says the feed is down.
// ============================================================

import React from 'react';

const { useState, useEffect } = React;

const inflight = new Map();

async function getJSON(path) {
    const r = await fetch(path);
    if (!r.ok) {
        // Status and body at error level. A transport failure must never
        // reach a surface as a statement about the market.
        const body = await r.text().catch(() => '');
        console.error('[ATLAS] macro feed ' + path + ' -> ' + r.status + ' ' + body.slice(0, 300));
        throw new Error(path + ' ' + r.status);
    }
    return r.json();
}

export function fetchFeed(path) {
    if (!inflight.has(path)) inflight.set(path, getJSON(path));
    return inflight.get(path);
}

// For tests and for a deliberate refresh; never called on render.
export function resetFeeds() { inflight.clear(); }

// `paths` is fixed per call site. Each resolves independently: one dead
// endpoint costs its own panels and nothing else.
export function useMacroFeed(paths) {
    const key = paths.join('|');
    const [s, setS] = useState({ loaded: false, data: {} });

    useEffect(function () {
        let alive = true;
        Promise.allSettled(paths.map(fetchFeed)).then(results => {
            if (!alive) return;
            const data = {};
            paths.forEach((p, i) => { data[p] = results[i].status === 'fulfilled' ? results[i].value : null; });
            setS({ loaded: true, data });
        });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return s;
}
