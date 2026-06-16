// ============================================================
// ATLAS Nexus — Opportunities tab (marginal-dollar ledger)
// ------------------------------------------------------------
// Of everything you could do with the next dollar, sourced from
// anywhere, what is best GIVEN what you already own. One ledger, many
// sources, every entry scored on isolated merit AND portfolio fit —
// so a cheap-but-redundant name demotes below an additive diversifier.
// A funnel: frame → opportunity map → the ranked ledger → thesis-in-
// context → sector strip. Self-fetches /api/nexus-opportunities;
// scoring is pure (nexusOpportunitiesCompute.js).
// ============================================================

import React from 'react';

const { useState, useEffect } = React;
const e = React.createElement;

const sgnPct = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');
const convColor = c => (c >= 75 ? 'var(--success)' : c >= 60 ? 'var(--cyan)' : c >= 45 ? 'var(--amber)' : 'var(--danger)');
const FIT_LABEL = { additive: 'additive', redundant: 'redundant', neutral: 'neutral' };
const FIT_FILL = { additive: 'var(--cyan)', redundant: 'var(--amber)', neutral: '#5b6b7d' };
const PROV = { valuation: 'val', scrapbook: 'scrapbook', cortex: 'cortex', watchlist: 'watch' };

function openObject(tk) {
    window.dispatchEvent(new CustomEvent('nexus:open-object', { detail: { objectId: 'obj-' + String(tk).toLowerCase(), tk } }));
}

function useOpps() {
    const [s, setS] = useState({ data: null, loading: true });
    useEffect(function () {
        let alive = true;
        fetch('/api/nexus-opportunities').then(r => r.json())
            .then(j => { if (alive) setS({ data: j && j.ok ? j : { ledger: [], sectorTilts: [] }, loading: false }); })
            .catch(() => { if (alive) setS({ data: { ledger: [], sectorTilts: [] }, loading: false }); });
        return () => { alive = false; };
    }, []);
    return s;
}

// ── Signature: the opportunity map (conviction × fv-gap, fit-coloured) ──
function OppMap({ ledger, onPick }) {
    const plot = ledger.filter(l => l.conviction != null && l.fvGapPct != null);
    if (!plot.length) return e('div', { className: 'nb-empty' }, 'No conviction-rated names to map yet.');
    const X0 = 64, X1 = 720, Y0 = 20, Y1 = 250, G = 60;
    const px = g => X0 + ((Math.max(-G, Math.min(G, g)) + G) / (2 * G)) * (X1 - X0);
    const py = c => Y1 - (Math.max(0, Math.min(100, c)) / 100) * (Y1 - Y0);
    const cx = px(0), cy = py(50);
    const byTk = new Map(plot.map(l => [l.tk, l]));
    const kids = [];
    kids.push(e('rect', { key: 'q1', x: cx, y: Y0, width: X1 - cx, height: cy - Y0, fill: 'rgba(58,214,224,.045)' }));
    kids.push(e('rect', { key: 'q2', x: X0, y: Y0, width: cx - X0, height: cy - Y0, fill: 'rgba(246,176,66,.04)' }));
    kids.push(e('rect', { key: 'q3', x: X0, y: cy, width: cx - X0, height: Y1 - cy, fill: 'rgba(240,88,79,.045)' }));
    kids.push(e('rect', { key: 'q4', x: cx, y: cy, width: X1 - cx, height: Y1 - cy, fill: 'rgba(88,100,115,.05)' }));
    kids.push(e('line', { key: 'v', x1: cx, y1: Y0, x2: cx, y2: Y1, stroke: 'rgba(255,255,255,.14)', strokeWidth: 1 }));
    kids.push(e('line', { key: 'h', x1: X0, y1: cy, x2: X1, y2: cy, stroke: 'rgba(255,255,255,.1)', strokeWidth: 1, strokeDasharray: '2 3' }));
    [['expensive favourites', X0 + 10, Y0 + 15, 'start'], ['cheap & convicted', X1 - 10, Y0 + 15, 'end'], ['rich & unloved — trim', X0 + 10, Y1 - 9, 'start'], ['value traps?', X1 - 10, Y1 - 9, 'end']]
        .forEach((q, i) => kids.push(e('text', { key: 'ql' + i, x: q[1], y: q[2], textAnchor: q[3], fontSize: 10, fill: 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, q[0])));
    kids.push(e('text', { key: 'ax', x: (X0 + X1) / 2, y: Y1 + 26, textAnchor: 'middle', fontSize: 11, fill: 'var(--text2)' }, 'Fair-value gap   rich ←  0  → cheap'));
    kids.push(e('text', { key: 'ay', x: X0 - 24, y: (Y0 + Y1) / 2, textAnchor: 'middle', fontSize: 11, fill: 'var(--text2)', transform: 'rotate(-90 ' + (X0 - 24) + ' ' + ((Y0 + Y1) / 2) + ')' }, 'Conviction   low → high'));
    // swap arrows: additive ledger entries funded from a held name that's on the map
    plot.filter(l => l.fit === 'additive' && l.fundFrom && byTk.has(l.fundFrom)).slice(0, 3).forEach((l, i) => {
        const a = byTk.get(l.fundFrom), b = l;
        const x1 = px(a.fvGapPct), y1 = py(a.conviction), x2 = px(b.fvGapPct), y2 = py(b.conviction);
        kids.push(e('path', { key: 'sw' + i, d: 'M' + x1 + ' ' + y1 + ' Q ' + ((x1 + x2) / 2) + ' ' + (((y1 + y2) / 2) - 22) + ' ' + x2 + ' ' + y2, fill: 'none', stroke: 'var(--cyan)', strokeWidth: 1.1, strokeDasharray: '4 3', opacity: 0.5 }));
    });
    plot.forEach(l => {
        const x = px(l.fvGapPct), y = py(l.conviction), rad = 6 + (Math.min(12, Math.abs(Number(l.excessVar) || 0) * 14));
        const colour = FIT_FILL[l.fit] || '#5b6b7d', trusted = !!l.fvTrustworthy;
        kids.push(e('circle', { key: 'c' + l.tk, cx: x, cy: y, r: 6 + (rad - 6), fill: trusted ? colour : 'transparent', fillOpacity: trusted ? 0.5 : 1, stroke: colour, strokeWidth: trusted ? 1.2 : 1.4, strokeDasharray: trusted ? undefined : '3 3', style: { cursor: 'pointer' }, onClick: () => onPick(l.tk) }));
        kids.push(e('text', { key: 't' + l.tk, x: x, y: y - rad - 3, textAnchor: 'middle', fontSize: 9.5, fill: 'var(--text2)', style: { fontFamily: 'var(--fm)', cursor: 'pointer' }, onClick: () => onPick(l.tk) }, l.tk));
    });
    return e('svg', { viewBox: '0 0 760 290', width: '100%', role: 'img', 'aria-label': 'Opportunity map: conviction vs fair-value gap, coloured by portfolio fit, with suggested swap arrows.' }, kids);
}

function LedgerRow(l, i, onPick) {
    const fit = l.fit || 'neutral';
    return e('tr', { key: l.tk, onClick: () => onPick(l.tk), title: 'Open ' + l.tk, style: { cursor: 'pointer' } },
        e('td', { className: 'ol-rk' }, i + 1),
        e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk' }, l.tk), l.held ? null : e('span', { className: 'ol-new' }, 'new')),
        e('td', { className: 'nf-l' }, e('span', { className: 'ol-src' }, (l.provenance || []).map(p => e('span', { key: p, className: 'ol-tag ' + p }, PROV[p] || p)))),
        e('td', { className: 'nf-mono-cell ' + (l.fvGapPct >= 0 ? 'tone-up' : 'tone-down') }, sgnPct(l.fvGapPct), l.fvTrustworthy ? null : e('span', { className: 'ol-est', title: 'model estimate / extreme — verify' }, '~')),
        e('td', { className: 'nf-l' }, e('span', { className: 'ol-fit ' + fit }, FIT_LABEL[fit] || fit)),
        e('td', { className: 'nf-l ol-fund' }, l.fundFrom || '—'),
        e('td', { className: 'nf-l ol-because' }, l.thesis ? String(l.thesis).slice(0, 90) : (l.held ? 'top-up candidate' : 'new-position candidate')));
}

function ThesisCard(t) {
    const n = t.narrative || {};
    const good = t.fit === 'additive';
    return e('div', { className: 'ol-cc ' + (good ? 'good' : 'weak'), key: t.tk },
        e('div', { className: 'ol-cc-top' }, e('span', { className: 'ol-cc-nm' }, t.tk),
            e('span', { className: 'ol-cc-vd ' + (good ? 'holds' : 'cond') }, good ? 'additive' : t.fit)),
        n.thesis ? e('div', { className: 'ol-cc-iso' }, String(n.thesis).slice(0, 220)) : e('div', { className: 'ol-cc-iso t3' }, 'No scrapbook narrative yet — valuation gap ' + sgnPct(t.fvGapPct) + '.'),
        e('div', { className: 'ol-cc-ctx' }, 'against the portfolio'),
        e('div', { className: 'ol-cc-swap' }, t.fundFrom
            ? e('span', null, 'Net: add, funded by trimming ', e('b', null, t.fundFrom), '.')
            : e('span', null, 'Net: redundant to the book — a top-up or swap within its cluster, not a fresh add.')));
}

function SectorCell(s) {
    const tl = s.tilt === 'up' ? 'up' : s.tilt === 'down' ? 'dn' : 'hold';
    const label = s.tilt === 'up' ? 'tilt up' : s.tilt === 'down' ? 'trim the tilt' : 'hold';
    return e('div', { className: 'ol-scell', key: s.sector },
        e('div', { className: 'ol-sn' }, s.sector, e('span', { className: 't3' }, 'you: ' + (s.yourWeightPct || 0) + '%')),
        e('div', { className: 'ol-pv ' + (s.stance === 'cheap' ? 'tone-up' : s.stance === 'rich' ? 'tone-down' : 't2') }, 'playbook: ' + s.stance),
        e('span', { className: 'ol-tilt ' + tl }, label));
}

export function NexusOpportunitiesPanel() {
    const { data, loading } = useOpps();
    if (loading) return e('div', { className: 'nf-card nb-loading' }, e('span', { className: 'nb-spin' }, '◴'), ' Loading opportunities…');
    const ledger = (data && data.ledger) || [];
    const tilts = (data && data.sectorTilts) || [];
    const frame = (data && data.frame) || {};
    const topThesis = (data && data.topThesis) || [];

    return e('div', null,
        // 1. FRAME
        e('div', { className: 'ol-frame' },
            frame.topSector
                ? e('span', null, 'The book is concentrated — ', e('b', null, frame.topSectorPct + '% in ' + frame.topSector),
                    '. The marginal dollar’s best home is a ', e('b', null, 'cheap name that diversifies'),
                    ', funded from the rich, low-conviction tail — not another ' + frame.topSector + ' line however cheap it screens.')
                : 'Ranking the marginal dollar across valuation, scrapbook and Cortex sources.'),

        // 2. OPPORTUNITY MAP
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' },
                e('div', null, e('h3', null, 'Opportunity map'),
                    e('div', { className: 'nf-sub', style: { marginTop: 4 } }, 'conviction × fair-value gap, re-coloured by portfolio fit · arrows = suggested swaps · ring solid = composite, dashed = model/extreme')),
                e('span', { className: 'nf-sub' }, (frame.valued || ledger.length) + ' valued')),
            e(OppMap, { ledger, onPick: openObject }),
            e('div', { className: 'op-leg' },
                e('span', null, e('i', { className: 'op-dot', style: { background: 'var(--cyan)' } }), 'additive · diversifies'),
                e('span', null, e('i', { className: 'op-dot', style: { background: 'var(--amber)' } }), 'redundant · concentrates'),
                e('span', null, e('i', { className: 'op-dot', style: { background: '#5b6b7d' } }), 'neutral'),
                e('span', { className: 't3' }, '· dashed ring = model/extreme estimate'))),

        // 3. THE LEDGER
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'The ledger'),
                e('span', { className: 'nf-sub' }, 'ranked on merit AND fit — the cheapest names are not the top opportunities')),
            ledger.length
                ? e('div', { className: 'nf-table-scroll', style: { maxHeight: 460 } },
                    e('table', { className: 'nf-table ol-table' },
                        e('thead', null, e('tr', null,
                            ['#', 'Name', 'Surfaced by', 'FV gap', 'Fit', 'Fund from', 'Read'].map((h, i) => e('th', { key: h, className: (i === 0 || i === 1 || i === 2 || i === 4 || i === 5 || i === 6) ? 'nf-l' : '' }, h)))),
                        e('tbody', null, ledger.map((l, i) => LedgerRow(l, i, openObject)))))
                : e('div', { className: 'nb-empty' }, 'No valued candidates yet.')),

        // 4. THESIS IN CONTEXT
        topThesis.length ? e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'The thesis, in context'),
                e('span', { className: 'nf-sub' }, 'the scrapbook view, re-cast against what you hold')),
            e('div', { className: 'ol-cards' }, topThesis.map(ThesisCard))) : null,

        // 5. SECTOR STRIP
        tilts.length ? e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Sector playbook, against your weights'),
                e('span', { className: 'nf-sub' }, 'a tilt decision, not an isolated call')),
            e('div', { className: 'ol-sec' }, tilts.slice(0, 8).map(SectorCell))) : null);
}

export default NexusOpportunitiesPanel;
