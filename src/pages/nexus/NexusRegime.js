// ============================================================
// ATLAS Nexus — Regime tab
// ------------------------------------------------------------
// A2.2, 2026-09-10. Layout is now: pair explorer on top, then ONE toggle
// over two lower sections -- the intermarket axes (default) and the macro
// dashboard.
//
// Both lower sections are MOUNTED AND HIDDEN, never conditionally
// rendered. A section that has never mounted has no measured layout, so
// the first toggle would jump; and the axis panel self-fetches, so
// unmounting it would re-run its reads on every switch.
//
// Noted for review after it ships: this puts detail above summary. The
// axis panel is what teaches that eleven pairs are three things, and the
// explorer may start reading as the primary object. Shipped as specified.
//
// PHASE D, 2026-09-10. The Growth x Inflation 2x2 is retired, and with
// it every block on this tab that took `regime.label` as an input:
//
//   1. the verdict header   (label + playbook summary + a `confidence`
//                            that was a hardcoded constant per branch)
//   2. the 2x2 quadrant SVG
//   3. Book fit             (bookRegimeFit(spine, label) -- sector tilt
//                            against what the LABEL was said to reward)
//   4. the regime read      (regimeRead(label, fit))
//
// Removing only the SVG would have left three blocks still asserting a
// single regime label, which the acceptance criterion forbids. The rule
// applied is: if a block takes `regime.label` as an input, it goes.
//
// The classification came from /api/macro's classifyRegime(): two series
// (UNRATE, CPI), four hardcoded branches, and a confidence literal per
// branch. It is superseded by factor_axes / factor_axis_scores /
// book_factor_betas, which are derived rather than authored and which
// report significance instead of asserting a label.
//
// What remains is what the data supports: the macro indicators that
// locate the cycle, and the A2 axis panel with the book's MEASURED
// exposure to each axis. Nothing on this tab names a regime.
// ============================================================

import React from 'react';
import { macroIndicators } from './nexusRegimeCompute.js';
import NexusAxesPanel from './NexusAxes.js';
import NexusPairExplorer from './NexusPairExplorer.js';

const { useState, useEffect } = React;
const e = React.createElement;

const GROUPS = ['Rates', 'Inflation', 'Growth', 'Stress'];

function useMacro() {
    const [s, setS] = useState({ macro: null, loading: true });
    useEffect(function () {
        let alive = true;
        fetch('/api/macro').then(r => r.json())
            .then(j => { if (alive) setS({ macro: j && !j.error ? j : null, loading: false }); })
            .catch(() => { if (alive) setS({ macro: null, loading: false }); });
        return () => { alive = false; };
    }, []);
    return s;
}

function Stat(r) {
    return e('div', { className: 'nr-stat', key: r.label },
        e('div', { className: 'nr-stat-l' }, r.label),
        e('div', { className: 'nr-stat-row' },
            e('span', { className: 'nr-stat-v' }, r.value),
            r.delta ? e('span', { className: 'nr-stat-d tone-' + r.deltaTone }, r.delta) : null));
}

// `model` is still accepted because NexusFlagship passes it; the only block
// that read it was Book fit, which was keyed on the retired label.
export function NexusRegimePanel() {
    const { macro, loading } = useMacro();
    const [lower, setLower] = useState('axes');

    if (loading) return e('div', { className: 'nf-card nb-loading' }, e('span', { className: 'nb-spin' }, '\u25f4'), ' Loading regime\u2026');

    // The axis panel and the explorer both self-fetch from the database and
    // do not depend on /api/macro, so a dead indicator feed cannot take the
    // measured exposures down with it.
    const indicators = macro ? macroIndicators(macro) : null;
    const show = k => ({ display: lower === k ? 'block' : 'none' });

    return e('div', null,
        // 1. PAIR EXPLORER
        e(NexusPairExplorer, { key: 'pairs' }),

        // 2. ONE TOGGLE, TWO STATES, axes on load.
        e('div', { className: 'nr-toggle', role: 'tablist' },
            [['axes', 'Intermarket axes'], ['macro', 'Macro dashboard']].map(([k, label]) =>
                e('button', {
                    key: k, role: 'tab', type: 'button',
                    'aria-selected': lower === k,
                    className: 'nr-tab' + (lower === k ? ' on' : ''),
                    onClick: () => setLower(k),
                }, label))),

        // Both mounted. Hidden by style, not by absence.
        e('div', { style: show('axes') }, e(NexusAxesPanel, { key: 'axes' })),

        e('div', { style: show('macro') },
            e('div', { className: 'nf-card nf-fade' },
                e('div', { className: 'nf-card-h' },
                    e('div', null, e('h3', null, 'Macro dashboard'),
                        e('div', { className: 'nf-sub', style: { marginTop: 4 } },
                            'the indicators themselves \u2014 this tab no longer classifies them into a regime'))),
                indicators
                    ? e('div', { className: 'nr-dash' },
                        GROUPS.map(g => {
                            const rows = indicators.filter(r => r.group === g);
                            if (!rows.length) return null;
                            return e('div', { className: 'nr-group', key: g },
                                e('div', { className: 'nr-group-h' }, g),
                                rows.map(Stat));
                        }))
                    : e('div', { className: 'nb-empty' },
                        'Macro feed unavailable. This is a transport failure, not a reading about the market.'))));
}

export default NexusRegimePanel;
