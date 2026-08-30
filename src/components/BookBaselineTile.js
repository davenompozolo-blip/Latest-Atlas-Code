import React from 'react';
// ============================================================
// ATLAS — Trading Effect tile (memo v2 close-out §5.1)
// ------------------------------------------------------------
// The do-nothing baseline, on the book scorecard rather than three clicks
// down. React 18, no JSX — repo convention.
//
// Set apart from the metrics to its left on purpose. Those grade the
// positions; this one grades the trading. It carries its own accent rule and
// its own verdict line because the memo's argument for surfacing it at all is
// that an unwelcome answer must be impossible to skip past.
//
// The three states are deliberately not interchangeable:
//   measured — the figure, signed, in percentage POINTS
//   stale    — the word STALE, never the last computed number dressed as
//              today's. A stale effect beside a live return is the
//              mixed-basis failure in a new place.
//   absent   — an em dash and the reason. "Trading was a wash" and "we have
//              not worked it out" must never look the same.
// ============================================================

import { baselineVerdict } from '../lib/bookBaseline.js';

var h = React.createElement;

var LABEL = {
    fontSize: 9, letterSpacing: 1.8, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontFamily: 'Figtree',
};

/** rgba() from the state's hex accent, for the tinted panel. */
function tint(hex, alpha) {
    if (hex.charAt(0) !== '#') return hex;
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

/** Signed percent from a fraction, matching the rest of the KPI bar. */
function pct(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

export function BookBaselineTile(props) {
    var b = props.baseline;
    if (!b) return null;

    // Hex throughout: tint() derives the panel fill from it, and a
    // pre-built rgba() string would pass through unchanged and paint the
    // absent state as a 35%-white block — louder than the states that
    // actually have something to say.
    var color = b.status === 'absent' ? '#7c8598'
              : b.status === 'stale'  ? '#f59e0b'
              : b.effectPp >= 0       ? '#10b981' : '#ef4444';

    var value = b.status === 'absent' ? 'NOT RUN'
              : b.status === 'stale'  ? 'STALE'
              : (b.effectPp >= 0 ? '+' : '') + b.effectPp.toFixed(2) + 'pp';

    var head  = b.status === 'absent' ? 'Nightly baseline has not run'
              : b.status === 'stale'  ? b.reason
              : baselineVerdict(b);

    // On a stale row the comparison is still shown, but dated — the figures
    // are useful history, they are just not a description of today.
    var sub = (b.tradedPct == null || b.frozenPct == null) ? null
            : (b.status === 'stale' ? 'As of ' + b.asOf + ': ' : '')
              + 'Traded ' + pct(b.tradedPct) + ' · Frozen ' + pct(b.frozenPct);

    // A tinted panel rather than another column of the strip. The tile has to
    // out-weigh the metrics beside it or §5.1 has not been done: a figure that
    // grades your trading, rendered quieter than account equity, is a figure
    // the eye skips. The state's own colour carries the panel, so the
    // unwelcome answer arrives already looking like one.
    return h('div', {
        style: {
            marginLeft: props.pushRight === false ? 0 : 'auto',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '9px 16px 10px', borderRadius: 8,
            background: tint(color, 0.08), border: '1px solid ' + tint(color, 0.30),
            minWidth: 232,
        }
    },
        h('div', { style: LABEL }, 'Trading Effect'),
        h('div', { style: { fontFamily: 'JetBrains Mono', fontSize: 26, fontWeight: 700, color: color, lineHeight: 1.1, letterSpacing: -0.5 } }, value),
        h('div', { style: { fontSize: 11, fontWeight: 600, color: color, marginTop: 3, fontFamily: 'Figtree', maxWidth: 300, lineHeight: 1.3 } }, head),
        sub && h('div', { style: { fontSize: 9.5, color: 'rgba(255,255,255,0.42)', marginTop: 3, fontFamily: 'JetBrains Mono' } }, sub)
    );
}
