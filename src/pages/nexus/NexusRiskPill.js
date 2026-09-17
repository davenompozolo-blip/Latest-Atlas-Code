// ============================================================
// ATLAS Nexus — the chrome's risk pill (G-4)
// ------------------------------------------------------------
// This replaces a LITERAL. `nexus-page.js` rendered the string 'RISK-ON'
// in the terminal's top bar, computed from nothing, green in every market
// since it was written — while `macro-markets.js` computed a real
// barometer from the same session's data. The app could therefore show
// RISK-ON in the chrome and NEUTRAL on the Markets page at the same
// moment, and did.
//
// That is the "a gauge carried from the mock looks exactly like a working
// gauge" entry, in a second place and worse: a mock gauge at least had a
// mock behind it, and this had nothing at all.
//
// One computation, shared: `riskBarometer` over the same `/api/macro`
// payload the cross-asset panel reads, through the same feed module, so
// the pill and the panel cannot disagree.
//
// While the feed is in flight the pill renders NOTHING rather than a
// placeholder. A chrome-level badge is read at a glance and never
// re-read; a placeholder there is indistinguishable from a reading.
// ============================================================

import React from 'react';
import { useMacroFeed } from './useMacroFeed.js';
import { riskBarometer } from './nexusCrossAssetCompute.js';

const { useMemo } = React;
const e = React.createElement;

const PATHS = ['/api/macro'];

const TONE = {
    up:   { fg: 'var(--nx-success, #22c55e)', bg: 'rgba(34,197,94,0.13)' },
    down: { fg: 'var(--nx-danger, #ef4444)',  bg: 'rgba(239,68,68,0.13)' },
    flat: { fg: 'var(--nx-warn, #f5a623)',    bg: 'rgba(245,166,35,0.13)' },
};

export function NexusRiskPill() {
    const feed = useMacroFeed(PATHS);
    const macro = feed.data['/api/macro'];
    const b = useMemo(
        () => (macro ? riskBarometer(macro.market, macro.credit) : null),
        [macro]);

    // Not loaded, feed down, or nothing to read: no pill. An absent badge
    // is honest; a grey "—" in the chrome reads as a state the market is in.
    if (!b || b.label === 'UNKNOWN') return null;

    const t = TONE[b.tone] || TONE.flat;
    return e('div', {
        style: {
            padding: '3px 8px', borderRadius: 4, background: t.bg, color: t.fg,
            fontSize: 9, fontWeight: 600, letterSpacing: 1, marginRight: 12,
        },
        title: 'heuristic — ' + b.measured + ' of 3 inputs · '
            + b.components.map(c => c.label + ' ' + c.says).join(' · ')
            + ' · not the measured regime, see Nexus → Regime',
    }, b.label);
}

export default NexusRiskPill;
