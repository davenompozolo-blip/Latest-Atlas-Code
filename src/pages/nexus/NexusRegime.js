// ============================================================
// ATLAS Nexus — Regime tab
// ------------------------------------------------------------
// F-1, 2026-09-16. The tab is a PANE SWITCHER: one pane visible at a
// time, pair explorer on load, selection persisting across navigation
// within the session.
//
// This replaces the A2.2 layout (pair explorer pinned on top with a
// two-state toggle beneath), and with it the concern that layout recorded:
// the explorer no longer sits permanently above the axis panel, so detail
// no longer outranks summary by position. The explorer's own CONTENT is
// unchanged — A2.2 still governs it.
//
// PANES ARE DATA. Nothing below counts them or names them. F-2 adds the
// structural-regimes pane by adding one entry to PANES; no logic here
// changes. The switcher's pure parts live in nexusRegimePanes.js.
//
// MOUNT ON FIRST REVEAL, THEN STAY MOUNTED. F2 section 1 asks both that
// every pane be mounted rather than conditionally rendered (so a switch
// cannot jump) and that each pane fetch on first reveal rather than page
// load (so the tab does not fire every pane's queries at once against a
// 3 s anon cap). Those cannot both hold literally here, because every
// pane self-fetches in a mount effect — mounting them all IS fetching
// them all. The reasons the spec gives decide it: a cancelled query
// renders as "no data", a false statement about the market, which
// outranks a cosmetic jump on one first switch. So a pane mounts when
// first revealed and is thereafter hidden by style, never unmounted —
// which still delivers no refetch on toggle and no jump on any later
// switch. Reasoning recorded in nexusRegimePanes.js.
//
// PHASE D, 2026-09-10 (retained). The Growth x Inflation 2x2 is retired,
// and with it every block that took `regime.label` as an input: the
// verdict header, the quadrant SVG, Book fit, and the regime read. The
// rule applied was: if a block takes `regime.label` as an input, it goes.
// What remains is what the data supports — the macro indicators that
// locate the cycle, and the A2 axis panel with the book's MEASURED
// exposure. Nothing on this tab names a regime.
// ============================================================

import React from 'react';
import { macroIndicators } from './nexusRegimeCompute.js';
import NexusAxesPanel from './NexusAxes.js';
import NexusPairExplorer from './NexusPairExplorer.js';
import {
    resolveInitialPane, revealedPanes, readStoredPane, writeStoredPane,
    nextPaneByKeyboard,
} from './nexusRegimePanes.js';

const { useState, useEffect, useRef, useCallback } = React;
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

// Extracted from the tab body so every pane is one component and the
// registry is uniform. Its fetch now runs on first reveal with the rest.
function MacroDashboardPane() {
    const { macro, loading } = useMacro();
    if (loading) {
        return e('div', { className: 'nf-card nb-loading' },
            e('span', { className: 'nb-spin' }, '◴'), ' Loading macro indicators…');
    }
    const indicators = macro ? macroIndicators(macro) : null;
    return e('div', { className: 'nf-card nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('div', null, e('h3', null, 'Macro dashboard'),
                e('div', { className: 'nf-sub', style: { marginTop: 4 } },
                    'the indicators themselves — this tab no longer classifies them into a regime'))),
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
                'Macro feed unavailable. This is a transport failure, not a reading about the market.'));
}

// The registry. `render` is a thunk so an unrevealed pane's element is
// never even constructed.
//
// The structural-regimes pane (F1 section 3) is F-2's to add and is
// deliberately absent rather than present-and-empty: a tab that selects
// nothing is a dead control in a live terminal, and F-2 is a separate
// register ID precisely because the pane does not exist yet.
const PANES = [
    { key: 'pairs', label: 'Pair explorer',    render: () => e(NexusPairExplorer) },
    { key: 'axes',  label: 'Intermarket axes', render: () => e(NexusAxesPanel) },
    { key: 'macro', label: 'Macro dashboard',  render: () => e(MacroDashboardPane) },
];
const DEFAULT_PANE = 'pairs';
const PANE_KEYS = PANES.map(p => p.key);

export function NexusRegimePanel() {
    // Lazy initialiser: storage is read once, on mount, not on every render.
    const [active, setActive] = useState(() => resolveInitialPane(
        readStoredPane(typeof window !== 'undefined' ? window.sessionStorage : null),
        PANE_KEYS, DEFAULT_PANE));

    const [revealed, setRevealed] = useState(() => revealedPanes(active, new Set()));
    const tabRefs = useRef({});

    const select = useCallback(function (key) {
        if (!key) return;
        setActive(key);
        setRevealed(prev => revealedPanes(key, prev));
        writeStoredPane(typeof window !== 'undefined' ? window.sessionStorage : null, key);
    }, []);

    const onKeyDown = useCallback(function (ev) {
        const next = nextPaneByKeyboard(ev.key, active, PANE_KEYS);
        if (!next) return;
        ev.preventDefault();
        select(next);
        const el = tabRefs.current[next];
        if (el && el.focus) el.focus();
    }, [active, select]);

    return e('div', null,
        e('div', { className: 'nr-toggle', role: 'tablist', 'aria-label': 'Regime views', onKeyDown },
            PANES.map(p => e('button', {
                key: p.key,
                id: 'nr-tab-' + p.key,
                ref: el => { tabRefs.current[p.key] = el; },
                role: 'tab',
                type: 'button',
                'aria-selected': active === p.key,
                'aria-controls': 'nr-pane-' + p.key,
                // Roving tabindex: one stop for the whole tablist, then
                // arrow keys within it, per the WAI tablist pattern.
                tabIndex: active === p.key ? 0 : -1,
                className: 'nr-tab' + (active === p.key ? ' on' : ''),
                onClick: () => select(p.key),
            }, p.label))),

        PANES.map(p => revealed.has(p.key)
            ? e('div', {
                key: p.key,
                id: 'nr-pane-' + p.key,
                role: 'tabpanel',
                'aria-labelledby': 'nr-tab-' + p.key,
                // Hidden by style, never unmounted, from first reveal on.
                style: { display: active === p.key ? 'block' : 'none' },
            }, p.render())
            : null));
}

export default NexusRegimePanel;
