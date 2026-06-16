// ============================================================
// ATLAS Nexus — Opportunities tab (mispricing)
// ------------------------------------------------------------
// Where price and fair value diverge most — the single-name valuation
// lens. A funnel: dislocation summary → mispricing map (FV gap ×
// conviction, the signature) → cheapest / richest boards → the read
// (best long, clearest trim). Reads the resolved model holdings;
// scoring is pure (nexusOpportunitiesCompute.js). Composite-backed
// valuations render solid, model-only (DCF) ones hollow — honest signal
// quality, never a fabricated edge.
// ============================================================

import React from 'react';
import { buildOpportunities, opportunitiesRead } from './nexusOpportunitiesCompute.js';

const e = React.createElement;

const sgnPct = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');
const convColor = c => (c >= 75 ? 'var(--success)' : c >= 60 ? 'var(--cyan)' : c >= 45 ? 'var(--amber)' : 'var(--danger)');

function openObject(tk) {
    window.dispatchEvent(new CustomEvent('nexus:open-object', { detail: { objectId: 'obj-' + String(tk).toLowerCase(), tk } }));
}

// ── Signature: the mispricing map ─────────────────────────────
function MispricingMap({ rows, onPick }) {
    const plot = rows.filter(h => h.fvGapPct != null && h.conviction != null);
    if (!plot.length) return e('div', { className: 'nb-empty' }, 'No valued names yet.');
    const X0 = 56, X1 = 700, Y0 = 18, Y1 = 250;
    const GAP = 60;                                  // clamp gaps to ±60% so the bulk is legible
    const px = g => X0 + ((Math.max(-GAP, Math.min(GAP, g)) + GAP) / (2 * GAP)) * (X1 - X0);
    const py = c => Y1 - (Math.max(0, Math.min(100, c)) / 100) * (Y1 - Y0);
    const cx = px(0), cy = py(50);
    const maxVar = Math.max(1, ...plot.map(h => Math.abs(Number(h.componentVar) || 0)));
    const kids = [];

    kids.push(e('rect', { key: 'q1', x: cx, y: Y0, width: X1 - cx, height: cy - Y0, fill: 'rgba(70,196,106,.05)' }));   // cheap+conviction
    kids.push(e('rect', { key: 'q2', x: X0, y: Y0, width: cx - X0, height: cy - Y0, fill: 'rgba(246,176,66,.05)' }));   // rich+conviction
    kids.push(e('rect', { key: 'q3', x: cx, y: cy, width: X1 - cx, height: Y1 - cy, fill: 'rgba(88,100,115,.05)' }));   // cheap+low
    kids.push(e('rect', { key: 'q4', x: X0, y: cy, width: cx - X0, height: Y1 - cy, fill: 'rgba(240,88,79,.05)' }));    // rich+low
    kids.push(e('line', { key: 'v', x1: cx, y1: Y0, x2: cx, y2: Y1, stroke: 'rgba(255,255,255,.16)', strokeWidth: 1 }));
    kids.push(e('line', { key: 'h', x1: X0, y1: cy, x2: X1, y2: cy, stroke: 'rgba(255,255,255,.1)', strokeWidth: 1, strokeDasharray: '2 3' }));

    const ql = [['cheap & convicted', X1 - 8, Y0 + 15, 'end'], ['expensive favourites', X0 + 8, Y0 + 15, 'start'],
        ['value traps?', X1 - 8, Y1 - 8, 'end'], ['rich & unloved — trim', X0 + 8, Y1 - 8, 'start']];
    ql.forEach((q, i) => kids.push(e('text', { key: 'ql' + i, x: q[1], y: q[2], textAnchor: q[3], fontSize: 10, fill: 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, q[0])));
    kids.push(e('text', { key: 'ax', x: (X0 + X1) / 2, y: Y1 + 26, textAnchor: 'middle', fontSize: 11, fill: 'var(--text2)' }, 'Fair-value gap   rich ←  0  → cheap'));
    kids.push(e('text', { key: 'ay', x: X0 - 24, y: (Y0 + Y1) / 2, textAnchor: 'middle', fontSize: 11, fill: 'var(--text2)', transform: 'rotate(-90 ' + (X0 - 24) + ' ' + ((Y0 + Y1) / 2) + ')' }, 'Conviction   low → high'));

    plot.forEach(h => {
        const x = px(h.fvGapPct), y = py(h.conviction);
        const rad = 6 + (Math.abs(Number(h.componentVar) || 0) / maxVar) * 14;
        const colour = h.fvGapPct >= 0 ? 'var(--success)' : 'var(--danger)';
        const trusted = !!h.valuationTrusted;
        kids.push(e('circle', {
            key: 'c' + h.tk, cx: x, cy: y, r: rad,
            fill: trusted ? colour : 'transparent', fillOpacity: trusted ? 0.5 : 1,
            stroke: colour, strokeWidth: trusted ? 1.2 : 1.4, strokeDasharray: trusted ? undefined : '3 3',
            style: { cursor: 'pointer' }, onClick: () => onPick(h.tk),
        }));
        kids.push(e('text', { key: 't' + h.tk, x: x, y: y - rad - 3, textAnchor: 'middle', fontSize: 9.5, fill: 'var(--text2)', style: { fontFamily: 'var(--fm)', cursor: 'pointer' }, onClick: () => onPick(h.tk) }, h.tk));
    });
    return e('svg', { viewBox: '0 0 740 290', width: '100%', role: 'img', 'aria-label': 'Mispricing map: holdings by fair-value gap (X) and conviction (Y); composite-backed solid, model-only hollow.' }, kids);
}

function OppRow(h, onPick) {
    return e('div', { className: 'op-row', key: h.tk, onClick: () => onPick(h.tk), title: 'Open ' + h.tk },
        e('div', { className: 'op-tk' }, e('span', { className: 'nf-tk' }, h.tk),
            h.name ? e('span', { className: 'op-name' }, h.name) : null),
        e('div', { className: 'op-gap ' + (h.fvGapPct >= 0 ? 'tone-up' : 'tone-down') }, sgnPct(h.fvGapPct)),
        e('div', { className: 'op-conv' },
            e('span', { className: 'op-conv-track' }, e('i', { style: { width: (h.conviction || 0) + '%', background: convColor(h.conviction || 0) } })),
            e('span', { className: 'nf-mono-cell' }, Math.round(h.conviction || 0))),
        e('div', { className: 'op-src' }, e('span', { className: 'op-dot ' + (h.valuationTrusted ? 'solid' : 'model'), title: h.valuationTrusted ? 'composite valuation' : 'model (DCF) estimate' }),
            h.valuationTrusted ? 'composite' : 'model'));
}

function OppBoard(title, rows, tone, onPick) {
    return e('div', { className: 'op-board' },
        e('div', { className: 'op-board-h ' + tone }, title, e('span', { className: 'op-board-n' }, rows.length)),
        rows.length ? rows.slice(0, 8).map(h => OppRow(h, onPick)) : e('div', { className: 'nr-none' }, 'none in the trusted set'));
}

export function NexusOpportunitiesPanel({ model }) {
    const opp = buildOpportunities(model.holdings);
    const read = opportunitiesRead(opp);
    const mapRows = opp.cheap.concat(opp.rich);
    const widest = opp.cheap[0], richest = opp.rich[0];

    return e('div', null,
        // 1. SUMMARY + MAP
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' },
                e('div', null, e('h3', null, 'Opportunities'),
                    e('div', { className: 'nf-sub', style: { marginTop: 4 } }, 'where price and fair value diverge most')),
                e('span', { className: 'nf-sub' }, opp.valued + ' valued · ' + opp.cheapCount + ' cheap · ' + opp.richCount + ' rich')),
            (widest || richest) ? e('div', { className: 'op-summary' },
                widest ? e('span', null, 'Widest upside ', e('b', { className: 'tone-up' }, widest.tk + ' ' + sgnPct(widest.fvGapPct))) : null,
                widest && richest ? ' · ' : null,
                richest ? e('span', null, 'richest ', e('b', { className: 'tone-down' }, richest.tk + ' ' + sgnPct(richest.fvGapPct))) : null) : null,
            e(MispricingMap, { rows: mapRows, onPick: openObject }),
            e('div', { className: 'op-leg' },
                e('span', null, e('i', { className: 'op-dot solid' }), 'composite-backed'),
                e('span', null, e('i', { className: 'op-dot model' }), 'model (DCF) estimate'),
                e('span', { className: 't3' }, '· bubble = VaR share'))),

        // 2. CHEAP / RICH BOARDS
        e('div', { className: 'op-boards' },
            OppBoard('Cheapest to fair value', opp.cheap, 'tone-up', openObject),
            OppBoard('Richest vs fair value', opp.rich, 'tone-down', openObject)),

        // 3. THE READ
        e('div', { className: 'nr-read' },
            e('div', { className: 'nr-read-t' }, e('span', { className: 'nr-vd tone-up' }), 'The opportunities read'),
            e('div', { className: 'nr-read-b' }, read.text)));
}

export default NexusOpportunitiesPanel;
