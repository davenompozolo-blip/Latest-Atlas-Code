// ============================================================
// ATLAS Nexus — Drift tab (rebalance / balance)
// ------------------------------------------------------------
// How far has the book wandered from its conviction-target weights, and
// what would pull it back? A top-to-bottom funnel: balance verdict →
// concentration health (effective-N / fragility, from the gauge) → the
// names off balance (drift from target, trim vs add) → theme drift → the
// rebalance read. Reads the resolved model (holdings carry current/target
// weight from the sizing engine; gauges carry concentration) — no fetch,
// no new endpoint. All scoring is pure (nexusDriftCompute.js).
// ============================================================

import React from 'react';
import { buildDriftRows, driftSummary, themeDrift, concentrationPosture, driftRead } from './nexusDriftCompute.js';

const e = React.createElement;

const pp = (v, dp = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(dp) + ' ppt');
const wt = v => (v == null ? '—' : Number(v).toFixed(1) + '%');

// Live Object navigation (same contract the other tabs use).
function openObject(tk) {
    window.dispatchEvent(new CustomEvent('nexus:open-object', { detail: { objectId: 'obj-' + String(tk).toLowerCase(), tk } }));
}

// Diverging drift bar: overweight (trim) extends right in amber/red, underweight
// (add) extends left in cyan, centred at the conviction target.
function DriftBar({ v, scale }) {
    if (v == null) return e('span', { className: 'nd-bar' });
    const frac = Math.max(-1, Math.min(1, v / (scale || 1)));
    const w = Math.abs(frac) * 50;
    const over = v > 0;
    return e('span', { className: 'nd-bar' },
        e('i', { className: over ? 'over' : 'under', style: over ? { left: '50%', width: w + '%' } : { right: '50%', width: w + '%' } })
    );
}

// ── Concentration health — reads the gauge ────────────────────
function ConcentrationCard({ concentration }) {
    const p = concentrationPosture(concentration);
    const c = concentration || {};
    const effLabel = p.effectiveN != null && p.nominalN ? p.effectiveN + ' of ' + p.nominalN : '—';
    return e('div', { className: 'nf-card nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Concentration health'),
            e('span', { className: 'nd-chip ' + (p.concentrated ? 'bad' : 'ok') }, p.concentrated ? 'top-heavy' : 'diversified')),
        e('div', { className: 'nd-conc' },
            e('div', { className: 'nd-metric' },
                e('div', { className: 'nd-m-v' }, effLabel),
                e('div', { className: 'nd-m-l' }, 'effective N · names actually carrying the book')),
            e('div', { className: 'nd-metric' },
                e('div', { className: 'nd-m-v' }, p.topFactorPct != null ? Math.round(p.topFactorPct) + '%' : '—'),
                e('div', { className: 'nd-m-l' }, 'top factor share of risk')),
            e('div', { className: 'nd-metric nd-frag' },
                e('div', { className: 'nd-m-l' }, 'fragility cluster — names that move together'),
                e('div', { className: 'nd-frag-row' },
                    (p.fragility && p.fragility.length)
                        ? p.fragility.map(tk => e('span', { key: tk, className: 'nd-fchip', onClick: () => openObject(tk), title: 'Open ' + tk }, tk))
                        : e('span', { className: 't3' }, 'none flagged')))),
        c.note ? e('div', { className: 'nb-foot' }, c.note) : null
    );
}

// ── Off-balance names — drift from target ─────────────────────
function DriftMap({ rows, scale }) {
    return e('div', { className: 'nf-card nf-holdings nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Off balance'),
            e('span', { className: 'nf-sub' }, 'current weight vs conviction target · bar = drift')),
        rows.length === 0
            ? e('div', { className: 'nb-empty' }, 'Conviction targets pending — nothing to measure drift against yet.')
            : e('div', { className: 'nf-table-scroll', style: { maxHeight: 380 } },
                e('table', { className: 'nf-table' },
                    e('thead', null, e('tr', null,
                        ['Ticker', 'Theme', 'Now', 'Target', 'Drift', 'Action'].map((h, i) =>
                            e('th', { key: h, className: (i === 0 || i === 1 || i === 5) ? 'nf-l' : '' }, h)))),
                    e('tbody', null, rows.map(function (r) {
                        const off = r.side !== 'on';
                        return e('tr', { key: r.tk, className: off ? 'ne-soon' : '', onClick: () => openObject(r.tk), title: 'Open ' + r.tk, style: { cursor: 'pointer' } },
                            e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk' }, r.tk),
                                r.stale ? e('span', { className: 'nf-name', title: 'Stale price' }, 'stale') : null),
                            e('td', { className: 'nf-l nf-theme-cell' }, r.theme),
                            e('td', { className: 'nf-mono-cell' }, wt(r.currentWeightPct)),
                            e('td', { className: 'nf-mono-cell t2' }, wt(r.targetWeightPct)),
                            e('td', { className: 'nf-mono-cell ' + (r.driftPpt > 0 ? 'tone-down' : r.driftPpt < 0 ? 'tone-up' : '') },
                                e('span', { className: 'nf-fv-wrap' },
                                    e(DriftBar, { v: r.driftPpt, scale }),
                                    e('span', null, pp(r.driftPpt)))),
                            e('td', { className: 'nf-l' },
                                r.side === 'on'
                                    ? e('span', { className: 't3' }, 'on target')
                                    : e('span', { className: 'nd-act ' + r.side }, r.side === 'trim' ? 'trim' : 'add')));
                    }))
                )),
        e('div', { className: 'nb-foot' }, 'Target weight is conviction-implied (∝ PCM, normalised to the invested book). Overweight → trim, underweight → add. A small dead-band reads as on-target.')
    );
}

// ── Theme drift ───────────────────────────────────────────────
function ThemeDriftStrip({ themes, scale }) {
    if (!themes.length) return null;
    return e('div', { className: 'nf-card nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Theme drift'),
            e('span', { className: 'nf-sub' }, 'footprint vs conviction-implied weight')),
        e('div', { className: 'nd-themes' }, themes.map(function (t) {
            const off = Math.abs(t.driftPpt) >= 1;
            return e('div', { className: 'nd-tcell', key: t.theme },
                e('div', { className: 'nd-tn' }, t.theme, e('span', { className: 't3' }, t.count + (t.count === 1 ? ' name' : ' names'))),
                e('div', { className: 'nd-tbar' }, e(DriftBar, { v: t.driftPpt, scale })),
                e('div', { className: 'nd-tv' },
                    e('span', { className: 't2' }, wt(t.currentPct) + ' / ' + wt(t.targetPct)),
                    e('span', { className: off ? (t.driftPpt > 0 ? 'tone-down' : 'tone-up') : 't3' }, pp(t.driftPpt))));
        })));
}

export function NexusDriftPanel({ model }) {
    if (!model || !model.holdings) return e('div', { className: 'nf-card' }, e('div', { className: 'nb-empty' }, 'No book loaded.'));
    const rows = buildDriftRows(model.holdings);
    const summary = driftSummary(rows);
    const themes = themeDrift(model.holdings);
    const concentration = model.gauges && model.gauges.concentration;
    const read = driftRead(summary, concentration);

    const nameScale = Math.max(1, ...rows.map(r => r.absDrift));
    const themeScale = Math.max(1, ...themes.map(t => Math.abs(t.driftPpt)));

    return e('div', null,
        // 1. FRAME
        e('div', { className: 'ol-frame' },
            summary.valued
                ? e('span', null, 'The book is ', e('b', null, summary.turnoverPct.toFixed(1) + ' ppt'),
                    ' of NAV from its conviction targets — ', e('b', null, summary.nMaterial + (summary.nMaterial === 1 ? ' name' : ' names')),
                    ' materially off. Rebalancing pulls weight back toward where conviction says it should sit.')
                : 'Conviction targets are still resolving — drift will read once the sizing engine has them.'),

        // 2. CONCENTRATION HEALTH
        e(ConcentrationCard, { concentration }),

        // 3. OFF-BALANCE NAMES
        e(DriftMap, { rows, scale: nameScale }),

        // 4. THEME DRIFT
        e(ThemeDriftStrip, { themes, scale: themeScale }),

        // 5. THE REBALANCE READ
        e('div', { className: 'nf-card nf-read nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'The rebalance read')),
            e('div', { className: 'nf-read-body' },
                e('span', { className: 'nf-read-dot ' + (read.concentrated ? 'warn' : (read.trimTk || read.addTk) ? 'neutral' : 'ok') }),
                e('span', null, read.text)))
    );
}

export default NexusDriftPanel;
