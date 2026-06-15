// ============================================================
// ATLAS Nexus — Regime tab (alignment)
// ------------------------------------------------------------
// Is the book positioned for the macro regime we're actually in? A
// top-to-bottom funnel: regime verdict (+ the growth × inflation 2×2)
// → macro dashboard (the indicators that locate us) → book fit (sector
// tilt vs what the regime rewards) → the regime read. Classification
// self-fetches /api/macro; book fit reads the model's spine. All
// scoring is pure (nexusRegimeCompute.js).
// ============================================================

import React from 'react';
import { regimePlaybook, macroIndicators, bookRegimeFit, regimeRead, regimeQuadrant } from './nexusRegimeCompute.js';

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

// ── Signature: the growth × inflation 2×2 ─────────────────────
function RegimeQuad({ regime }) {
    const X0 = 46, X1 = 420, Y0 = 16, Y1 = 250;
    const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    const q = regimeQuadrant(regime.label);
    const dx = q.inflationUp ? (cx + X1) / 2 : (X0 + cx) / 2;
    const dy = q.growthUp ? (Y0 + cy) / 2 : (cy + Y1) / 2;
    const colour = regime.color || '#3ad6e0';
    const QUAD = [
        ['Goldilocks', (X0 + cx) / 2, (Y0 + cy) / 2, 'rgba(70,196,106,.06)'],
        ['Reflation', (cx + X1) / 2, (Y0 + cy) / 2, 'rgba(246,176,66,.07)'],
        ['Deflation', (X0 + cx) / 2, (cy + Y1) / 2, 'rgba(99,102,241,.07)'],
        ['Stagflation', (cx + X1) / 2, (cy + Y1) / 2, 'rgba(240,88,79,.06)'],
    ];
    const kids = [];
    kids.push(e('rect', { key: 'tl', x: X0, y: Y0, width: cx - X0, height: cy - Y0, fill: QUAD[0][3] }));
    kids.push(e('rect', { key: 'tr', x: cx, y: Y0, width: X1 - cx, height: cy - Y0, fill: QUAD[1][3] }));
    kids.push(e('rect', { key: 'bl', x: X0, y: cy, width: cx - X0, height: Y1 - cy, fill: QUAD[2][3] }));
    kids.push(e('rect', { key: 'br', x: cx, y: cy, width: X1 - cx, height: Y1 - cy, fill: QUAD[3][3] }));
    kids.push(e('line', { key: 'h', x1: X0, y1: cy, x2: X1, y2: cy, stroke: 'rgba(255,255,255,.13)', strokeWidth: 1 }));
    kids.push(e('line', { key: 'v', x1: cx, y1: Y0, x2: cx, y2: Y1, stroke: 'rgba(255,255,255,.13)', strokeWidth: 1 }));
    QUAD.forEach((qd, i) => kids.push(e('text', {
        key: 'q' + i, x: qd[1], y: qd[2], textAnchor: 'middle', fontSize: 12,
        fill: qd[0] === regime.label ? colour : 'var(--text3)',
        style: { fontFamily: 'var(--fb)', fontWeight: qd[0] === regime.label ? 700 : 400 },
    }, qd[0])));
    kids.push(e('text', { key: 'ax', x: (X0 + X1) / 2, y: Y1 + 26, textAnchor: 'middle', fontSize: 11, fill: 'var(--text2)' }, 'Inflation   low → high'));
    kids.push(e('text', { key: 'ay', x: X0 - 24, y: (Y0 + Y1) / 2, textAnchor: 'middle', fontSize: 11, fill: 'var(--text2)', transform: 'rotate(-90 ' + (X0 - 24) + ' ' + ((Y0 + Y1) / 2) + ')' }, 'Growth   ↓ → ↑'));
    kids.push(e('circle', { key: 'glow', cx: dx, cy: dy, r: 17, fill: colour, fillOpacity: 0.18 }));
    kids.push(e('circle', { key: 'dot', cx: dx, cy: dy, r: 7, fill: colour, stroke: '#0a0d12', strokeWidth: 1.5 }));
    return e('svg', { viewBox: '0 0 440 280', width: '100%', role: 'img', 'aria-label': 'Regime quadrant: growth versus inflation, current regime ' + regime.label }, kids);
}

function Stat(r) {
    return e('div', { className: 'nr-stat', key: r.label },
        e('div', { className: 'nr-stat-l' }, r.label),
        e('div', { className: 'nr-stat-row' },
            e('span', { className: 'nr-stat-v' }, r.value),
            r.delta ? e('span', { className: 'nr-stat-d tone-' + r.deltaTone }, r.delta) : null));
}

export function NexusRegimePanel({ model }) {
    const { macro, loading } = useMacro();
    if (loading) return e('div', { className: 'nf-card nb-loading' }, e('span', { className: 'nb-spin' }, '◴'), ' Loading regime…');
    if (!macro || !macro.regime) return e('div', { className: 'nf-card' }, e('div', { className: 'nb-empty' }, 'Macro feed unavailable.'));

    const regime = macro.regime;
    const pb = regimePlaybook(regime.label);
    const indicators = macroIndicators(macro);
    const fit = bookRegimeFit(model.spine, regime.label);
    const read = regimeRead(regime.label, fit);
    const colour = regime.color || '#3ad6e0';
    const conf = regime.confidence != null ? Math.round(regime.confidence * 100) + '%' : '—';
    const fitPos = Math.max(0, Math.min(100, (fit.score + 1) * 50)); // -1..1 → 0..100
    const readTone = read.verdict === 'aligned' ? 'up' : read.verdict === 'misaligned' ? 'down' : 'warn';

    return e('div', null,
        // 1. VERDICT + QUADRANT
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' },
                e('div', null, e('h3', null, 'Regime'),
                    e('div', { className: 'nf-sub', style: { marginTop: 4 } }, 'where the cycle sits, and whether the book is positioned for it')),
                e('span', { className: 'nr-conf' }, 'confidence ' + conf)),
            e('div', { className: 'nr-verdict' },
                e('div', { className: 'nr-vleft' },
                    e('div', { className: 'nr-label', style: { color: colour } }, regime.label),
                    e('div', { className: 'nr-summary' }, pb.summary),
                    e('div', { className: 'nr-tags' },
                        e('span', { className: 'nr-tag' }, 'duration: ' + pb.duration),
                        e('span', { className: 'nr-tag' }, 'risk-' + pb.risk),
                        e('span', { className: 'nr-tag' }, 'CPI ' + (regime.cpiYoY != null ? regime.cpiYoY.toFixed(1) + '%' : '—')))),
                e('div', { className: 'nr-vright' }, e(RegimeQuad, { regime })))),

        // 2. MACRO DASHBOARD
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Macro dashboard'),
                e('span', { className: 'nf-sub' }, 'the indicators that locate the regime')),
            e('div', { className: 'nr-dash' },
                GROUPS.map(g => {
                    const rows = indicators.filter(r => r.group === g);
                    if (!rows.length) return null;
                    return e('div', { className: 'nr-group', key: g },
                        e('div', { className: 'nr-group-h' }, g),
                        rows.map(Stat));
                }))),

        // 3. BOOK FIT
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Book fit'),
                e('span', { className: 'nf-sub' }, 'your sector tilt vs what ' + regime.label + ' rewards')),
            e('div', { className: 'nr-fitbar' },
                e('div', { className: 'nr-fitbar-track' },
                    e('i', { className: 'nr-fitbar-mid' }),
                    e('i', { className: 'nr-fitbar-dot', style: { left: fitPos + '%', background: colour } })),
                e('div', { className: 'nr-fitbar-ends' }, e('span', null, 'offside'), e('span', null, 'aligned'))),
            e('div', { className: 'nr-fitrow' },
                e('div', { className: 'nr-fitcol' },
                    e('div', { className: 'nr-fitcol-h tone-up' }, 'In the tailwind · ' + fit.alignedWeight + '%'),
                    e('div', { className: 'nr-chips' }, fit.aligned.length
                        ? fit.aligned.map(a => e('span', { key: a.theme, className: 'nr-chip in' }, a.theme + ' ' + a.sharePct + '%'))
                        : e('span', { className: 'nr-none' }, 'none'))),
                e('div', { className: 'nr-fitcol' },
                    e('div', { className: 'nr-fitcol-h tone-down' }, 'Into the headwind · ' + fit.misalignedWeight + '%'),
                    e('div', { className: 'nr-chips' }, fit.misaligned.length
                        ? fit.misaligned.map(a => e('span', { key: a.theme, className: 'nr-chip out' }, a.theme + ' ' + a.sharePct + '%'))
                        : e('span', { className: 'nr-none' }, 'none'))))),

        // 4. REGIME READ
        e('div', { className: 'nr-read' },
            e('div', { className: 'nr-read-t' }, e('span', { className: 'nr-vd tone-' + readTone }), 'The regime read'),
            e('div', { className: 'nr-read-b' }, read.text)));
}

export default NexusRegimePanel;
