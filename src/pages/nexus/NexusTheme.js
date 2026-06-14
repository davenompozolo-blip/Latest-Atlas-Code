// ============================================================
// ATLAS Nexus — Theme tab (rotation funnel)
// ------------------------------------------------------------
// Theme's job is rotation: the cross-theme add/trim decision Flagship
// can't make (it acts per name). One top-to-bottom funnel, mirroring
// Flagship: driver → rotation map → transmission (factor betas) →
// intra-theme dispersion → the rotation read → demoted detail grid.
//
// Series-derived inputs (5d momentum, betas) self-fetch from
// /api/nexus-theme; share / VaR / valuation / dispersion / reads come
// from the resolved model. All scoring is pure (nexusThemeCompute.js).
// ============================================================

import React from 'react';
import { buildThemeView, themeLeaders, themeDispersion, rotationRead } from './nexusThemeCompute.js';

const { useState, useEffect } = React;
const e = React.createElement;

const pct1 = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');
const moveTone = v => (v == null ? 'tone-neutral' : v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : 'tone-neutral');
const betaTone = v => (v == null ? 't3' : Math.abs(v) < 0.25 ? 't3' : v > 0 ? 'tone-up' : 'tone-down');
const fmtBeta = v => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1));
const TILT = { cheap: { label: 'Cheap', cls: 'tone-up' }, rich: { label: 'Rich', cls: 'tone-down' }, fair: { label: 'Fair', cls: 'tone-neutral' } };
const VERDICT = { ADD: 'add', LET_RUN: 'hold', TRIM: 'trim', IGNORE: 'watch', HOLD: 'hold' };

// Tell Flagship to filter its holdings to this theme, and route there.
function drillTheme(theme) {
    window.dispatchEvent(new CustomEvent('nexus:filter-theme', { detail: { theme } }));
}

function useThemeSeries() {
    const [s, setS] = useState({ map: new Map(), loaded: false });
    useEffect(function () {
        let alive = true;
        fetch('/api/nexus-theme').then(r => r.json())
            .then(j => {
                if (!alive) return;
                const map = new Map(((j && j.themes) || []).map(t => [t.theme, t]));
                setS({ map, loaded: true });
            })
            .catch(() => { if (alive) setS({ map: new Map(), loaded: true }); });
        return () => { alive = false; };
    }, []);
    return s;
}

// ── 2. Signature object: the rotation map ─────────────────────
function RotationMap({ rows, onPick }) {
    const plot = rows.filter(r => r.momentum5d != null && r.sharePct != null);
    if (!plot.length) return e('div', { className: 'nb-empty' }, 'Momentum pending — price history syncing.');
    const X0 = 72, X1 = 700, Y0 = 34, Y1 = 398;
    const moms = plot.map(r => r.momentum5d);
    const momMax = Math.max(3, ...moms) + 0.5;
    const momMin = Math.min(-3, ...moms) - 0.5;
    const maxShare = Math.max(1, ...plot.map(r => r.sharePct || 0));
    const maxVar = Math.max(1, ...plot.map(r => r.varSharePct || 0));
    const px = pos => X0 + (pos / 100) * (X1 - X0);
    const py = m => Y0 + ((momMax - m) / (momMax - momMin)) * (Y1 - Y0);
    const cx = px(50), cy = py(0);
    const kids = [];

    kids.push(e('rect', { key: 'q1', x: X0, y: Y0, width: cx - X0, height: cy - Y0, fill: 'rgba(70,196,106,.045)' }));
    kids.push(e('rect', { key: 'q2', x: cx, y: Y0, width: X1 - cx, height: cy - Y0, fill: 'rgba(58,214,224,.045)' }));
    kids.push(e('rect', { key: 'q3', x: X0, y: cy, width: cx - X0, height: Y1 - cy, fill: 'rgba(88,100,115,.05)' }));
    kids.push(e('rect', { key: 'q4', x: cx, y: cy, width: X1 - cx, height: Y1 - cy, fill: 'rgba(240,88,79,.05)' }));
    kids.push(e('line', { key: 'hx', x1: X0, y1: cy, x2: X1, y2: cy, stroke: 'rgba(255,255,255,.14)', strokeWidth: 1 }));
    kids.push(e('line', { key: 'vx', x1: cx, y1: Y0, x2: cx, y2: Y1, stroke: 'rgba(255,255,255,.14)', strokeWidth: 1 }));

    const ql = [['Underweight & working — chase', X0 + 10, Y0 + 17, 'start'], ['Core & working — let run', X1 - 10, Y0 + 17, 'end'],
        ['Washed out — ignore', X0 + 10, Y1 - 9, 'start'], ['Crowded & rolling — trim', X1 - 10, Y1 - 9, 'end']];
    ql.forEach((q, i) => kids.push(e('text', { key: 'ql' + i, x: q[1], y: q[2], textAnchor: q[3], fontSize: 10, fill: 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, q[0])));
    kids.push(e('text', { key: 'ax', x: (X0 + X1) / 2, y: Y1 + 28, textAnchor: 'middle', fontSize: 11, fill: 'var(--text2)' }, 'Positioning   light → committed (share)'));
    kids.push(e('text', { key: 'ay', x: X0 - 26, y: (Y0 + Y1) / 2, textAnchor: 'middle', fontSize: 11, fill: 'var(--text2)', transform: 'rotate(-90 ' + (X0 - 26) + ' ' + ((Y0 + Y1) / 2) + ')' }, '5-day momentum   ↓ → ↑'));

    plot.forEach(r => {
        const x = px((r.sharePct / maxShare) * 95), y = py(r.momentum5d);
        const rad = 7 + ((r.varSharePct || 0) / maxVar) * 18;
        const pending = r.valuationPending || !r.valuationTilt;
        const colour = r.valuationTilt === 'cheap' ? 'var(--success)' : r.valuationTilt === 'rich' ? 'var(--danger)' : '#5a6b7d';
        kids.push(e('circle', {
            key: 'c' + r.theme, cx: x, cy: y, r: rad,
            fill: pending ? 'transparent' : colour, fillOpacity: pending ? 1 : 0.5,
            stroke: pending ? 'var(--text3)' : colour, strokeWidth: pending ? 1.4 : 1.2,
            strokeDasharray: pending ? '3 3' : undefined,
            style: { cursor: 'pointer' }, onClick: () => onPick(r.theme),
        }));
        kids.push(e('text', {
            key: 't' + r.theme, x: x, y: y - rad - 4, textAnchor: 'middle', fontSize: 10.5,
            fill: 'var(--text2)', style: { fontFamily: 'var(--fm)', cursor: 'pointer' }, onClick: () => onPick(r.theme),
        }, r.theme));
    });
    return e('svg', { viewBox: '0 0 760 442', width: '100%', role: 'img', 'aria-label': 'Rotation map: themes by positioning (X) and 5-day momentum (Y), sized by VaR share, coloured by valuation.' }, kids);
}

// ── 3. Transmission — factor betas + why it moved ─────────────
function movedBecause(r) {
    const b = r.betas || {};
    const cands = [['rate', b.rate], ['USD', b.usd], ['oil', b.oil]].filter(x => x[1] != null);
    if (!cands.length) return 'factor betas pending';
    cands.sort((a, c) => Math.abs(c[1]) - Math.abs(a[1]));
    const [name, val] = cands[0];
    if (Math.abs(val) < 0.3) return 'low factor sensitivity';
    return name + (val > 0 ? '-positive' : '-negative') + ' (β ' + fmtBeta(val) + ')';
}

// ── Detail card (demoted v1 grid) ─────────────────────────────
function ThemeCard({ row, onPick }) {
    const tilt = row.valuationPending ? null : (row.valuationTilt ? TILT[row.valuationTilt] : null);
    return e('div', { className: 'nt-card' + (row.fragility ? ' frag' : ''), style: { cursor: 'pointer' }, onClick: () => onPick(row.theme), title: 'Open ' + row.theme + ' in Flagship' },
        e('div', { className: 'nt-card-h' },
            e('span', { className: 'nt-theme' }, row.theme),
            e('span', { className: 'nt-share' }, row.sharePct == null ? '—' : row.sharePct.toFixed(1) + '%')),
        e('div', { className: 'nt-moveline' },
            e('span', { className: 'nt-move ' + moveTone(row.movePct) }, pct1(row.movePct)),
            row.momentum5d != null ? e('span', { className: 'nt-count' }, pct1(row.momentum5d) + ' 5d') : null),
        e('div', { className: 'nt-x' }, 'VaR ' + row.varSharePct.toFixed(1) + '% · conv ' + row.avgConviction + (tilt ? ' · ' + tilt.label.toLowerCase() : ' · val pending')));
}

export function NexusThemePanel({ model }) {
    const series = useThemeSeries();
    const base = buildThemeView(model.holdings, model.spine);
    const rows = base.map(r => {
        const td = series.map.get(r.theme);
        return { ...r, momentum5d: td ? td.momentum5d : null, betas: td ? td.betas : { rate: null, usd: null, oil: null } };
    });
    const L = themeLeaders(rows);
    const disp = themeDispersion(model.holdings);
    const read = rotationRead(rows);
    const verdictOf = t => (read.perTheme.find(p => p.theme === t) || {}).verdict;
    const windDriver = model.windshield && model.windshield.driver;

    // Transmission: heaviest themes first, capped for space.
    const transmit = rows.filter(r => r.movePct != null).slice(0, 8);
    // Dispersion: widest spreads first, only where it's material.
    const dispRows = rows.map(r => ({ r, d: disp[r.theme] }))
        .filter(x => x.d && x.d.spread >= 2 && (x.d.winners.length || x.d.losers.length))
        .sort((a, b) => b.d.spread - a.d.spread).slice(0, 3);

    return e('div', null,
        // 1. DRIVER
        e('div', { className: 'nt-driver' },
            windDriver ? e('div', { style: { marginBottom: L.leader ? 7 : 0 } }, windDriver) : null,
            L.leader && L.laggard
                ? e('div', null, 'Transmission today — ',
                    e('b', { className: 'tone-up' }, L.leader.theme + ' ' + pct1(L.leader.movePct)), ' leads, ',
                    e('b', { className: 'tone-down' }, L.laggard.theme + ' ' + pct1(L.laggard.movePct)), ' drags.')
                : null),

        // 2. ROTATION MAP
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' },
                e('div', null, e('h3', null, 'Rotation map'),
                    e('div', { className: 'nf-sub', style: { marginTop: 4 } }, 'where your money sits vs where the momentum is · bubble = VaR share · colour = valuation')),
                !series.loaded ? e('span', { className: 'nf-sub' }, 'loading momentum…') : null),
            e(RotationMap, { rows, onPick: drillTheme }),
            e('div', { className: 'nt-leg' },
                e('span', null, e('i', { className: 'nt-sw', style: { background: 'var(--success)' } }), 'cheap'),
                e('span', null, e('i', { className: 'nt-sw', style: { background: 'var(--danger)' } }), 'rich'),
                e('span', null, e('i', { className: 'nt-sw', style: { background: '#5a6b7d' } }), 'fair'),
                e('span', null, e('i', { className: 'nt-sw dash' }), 'valuation pending sync'),
                e('span', { className: 't3' }, '· size = VaR share'))),

        // 3. TRANSMISSION
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Transmission'),
                e('span', { className: 'nf-sub' }, 'sensitivity to the day’s factors — why it moved')),
            e('div', { className: 'nf-table-scroll' },
                e('table', { className: 'nf-table nt-tt' },
                    e('thead', null, e('tr', null,
                        ['Theme', 'Rate β', 'USD β', 'Oil β', 'Today', 'Moved because'].map((h, i) =>
                            e('th', { key: h, className: i === 0 || i === 5 ? 'nf-l' : '' }, h)))),
                    e('tbody', null, transmit.map(r =>
                        e('tr', { key: r.theme, style: { cursor: 'pointer' }, onClick: () => drillTheme(r.theme) },
                            e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk' }, r.theme)),
                            e('td', { className: 'nf-mono-cell ' + betaTone(r.betas.rate) }, fmtBeta(r.betas.rate)),
                            e('td', { className: 'nf-mono-cell ' + betaTone(r.betas.usd) }, fmtBeta(r.betas.usd)),
                            e('td', { className: 'nf-mono-cell ' + betaTone(r.betas.oil) }, fmtBeta(r.betas.oil)),
                            e('td', { className: 'nf-mono-cell ' + moveTone(r.movePct) }, pct1(r.movePct)),
                            e('td', { className: 'nf-l t2' }, movedBecause(r)))))))),

        // 4. DISPERSION
        dispRows.length ? e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Intra-theme dispersion'),
                e('span', { className: 'nf-sub' }, 'a calm average can hide a wide spread')),
            dispRows.map(({ r, d }) => e('div', { className: 'nt-disp', key: r.theme },
                e('div', { className: 'nt-disp-l' }, e('span', { className: 'nf-tk' }, r.theme), ' ',
                    e('span', { className: 'mono ' + moveTone(r.movePct) }, pct1(r.movePct)), e('span', { className: 't3' }, ' surface · spread ' + d.spread + 'pp')),
                e('div', { className: 'nt-chips' },
                    d.winners.map(w => e('span', { key: w.tk, className: 'nt-chip w' }, w.tk + ' ' + pct1(w.pct))),
                    d.losers.map(l => e('span', { key: l.tk, className: 'nt-chip l' }, l.tk + ' ' + pct1(l.pct))))))) : null,

        // 5. ROTATION READ
        e('div', { className: 'nt-read' },
            e('div', { className: 'nt-read-t' }, e('span', { className: 'nt-vd' }), 'The rotation read'),
            e('div', { className: 'nt-read-b' },
                read.book.outTheme ? e('span', { className: 'out' }, 'Rotate out of ' + read.book.outTheme) : null,
                read.book.outTheme && read.book.inTheme ? ' and ' : null,
                read.book.inTheme ? e('span', { className: 'in' }, (read.book.outTheme ? 'into ' : 'add ') + read.book.inTheme) : null,
                read.book.outTheme || read.book.inTheme ? '. ' : read.book.text + ' ',
                e('span', { className: 't2' }, (read.perTheme.find(p => p.theme === read.book.outTheme) || {}).because || ''),
                read.book.inTheme ? e('span', { className: 't2' }, ' · ' + (read.perTheme.find(p => p.theme === read.book.inTheme) || {}).because || '') : null)),

        // 6. DETAIL GRID (demoted)
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Per-theme breakdown'),
                e('span', { className: 'nf-sub' }, rows.length + ' themes · click → Flagship')),
            e('div', { className: 'nt-grid' }, rows.map(r => e(ThemeCard, { key: r.theme, row: r, onPick: drillTheme })))));
}

export default NexusThemePanel;
