// ============================================================
// ATLAS Nexus — Theme tab (rotation redesign, v1)
// ------------------------------------------------------------
// The page answers "what rotation do I make?", top to bottom in order
// of PM attention (spec: nexus rotation redesign):
//   1. Regime banner        — why rotation is happening (/api/macro)
//   2. Recommendation card  — SELL x → BUY y + conviction + drivers
//   3. Rotation map + leadership ledger — positioning vs momentum
//   4. Per-theme cards      — one line each, detail on hover
//   5. Supporting evidence  — transmission betas + dispersion (unchanged)
// Tier 1+2 alone should be enough to make the call. The card and the
// map are two views on one computation (rotationCall wraps
// rotationRead), so they can never disagree.
//
// Series-derived inputs (5d momentum, betas) self-fetch from
// /api/nexus-theme; regime from /api/macro; share / VaR / valuation /
// dispersion from the resolved model. All scoring is pure
// (nexusThemeCompute.js / nexusRegimeCompute.js).
// ============================================================

import React from 'react';
import {
    buildThemeView, themeDispersion, rotationCall, positionRankPct,
    breadthNote, VERDICT_CHIP, CONVICTION_WEIGHTS,
} from './nexusThemeCompute.js';
import { regimePlaybook, rotationBias } from './nexusRegimeCompute.js';
import { DispersionRegime, SectorDispersionStrip } from './NexusDispersion.js';

const { useState, useEffect } = React;
const e = React.createElement;

const pct1 = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');
const moveTone = v => (v == null ? 'tone-neutral' : v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : 'tone-neutral');
const betaTone = v => (v == null ? 't3' : Math.abs(v) < 0.25 ? 't3' : v > 0 ? 'tone-up' : 'tone-down');
const fmtBeta = v => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1));
const TILT_LABEL = { cheap: 'Cheap', rich: 'Rich', fair: 'Fair' };
const CHIP_CLS = { BUY: 'buy', SELL: 'sell', WATCH: 'watch', HOLD: '' };

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

// ── 1. Regime banner — why rotation is happening ──────────────
const lastTwo = arr => (Array.isArray(arr) && arr.length
    ? { latest: arr[arr.length - 1].value, prev: arr.length > 1 ? arr[arr.length - 2].value : null }
    : null);

function dirArrow(t) {
    if (!t || t.latest == null || t.prev == null || t.latest === t.prev) return e('span', { className: 't3' }, '·');
    return t.latest > t.prev ? e('b', { className: 'tone-up' }, '▲') : e('b', { className: 'tone-down' }, '▼');
}

function RegimeBanner({ macro, loading }) {
    if (loading) return e('div', { className: 'ntr-banner' }, e('span', { className: 'nf-sub' }, 'Loading regime…'));
    const regime = macro && macro.regime;
    if (!regime) {
        // Feed down → say so; never fabricate a regime or a confidence number.
        return e('div', { className: 'ntr-banner' },
            e('div', null,
                e('div', { className: 'ntr-banner-name' }, 'Regime unavailable'),
                e('div', { className: 'ntr-manual' }, 'macro feed not responding — rotation context is manual until /api/macro recovers')));
    }
    const bias = rotationBias(regime.label);
    const usd = ((macro.market || []).find(q => q && q.symbol === 'UUP') || {}).changePct;
    const credit = lastTwo(macro.credit && macro.credit.hySpreads);
    const creditDir = !credit || credit.prev == null ? '·'
        : credit.latest > credit.prev ? 'widening' : credit.latest < credit.prev ? 'tightening' : 'flat';
    return e('div', { className: 'ntr-banner' },
        e('div', null,
            e('div', { className: 'ntr-banner-name', style: { color: regime.color || 'var(--cyan)' } }, regime.label),
            bias ? e('div', { className: 'ntr-banner-bias' }, 'Rotation bias ', e('b', null, bias)) : null),
        e('div', { className: 'ntr-banner-facts' },
            e('span', null, '10Y ', dirArrow(lastTwo(macro.yields && macro.yields.dgs10))),
            e('span', null, 'USD ', usd == null ? e('span', { className: 't3' }, '·')
                : e('b', { className: usd >= 0 ? 'tone-up' : 'tone-down' }, usd >= 0 ? '▲' : '▼')),
            e('span', null, 'Credit ', e('b', { className: creditDir === 'widening' ? 'tone-down' : creditDir === 'tightening' ? 'tone-up' : 't3' }, creditDir))),
        e('div', { className: 'ntr-banner-conf' },
            e('div', { className: 'num' }, regime.confidence != null ? Math.round(regime.confidence * 100) + '%' : '—'),
            e('div', { className: 'lbl' }, 'REGIME CONFIDENCE')));
}

// ── 2a. Recommendation card — the call itself ─────────────────
const DRIVER_IC = { confirmed: '✓', caution: '!', pending: '–' };

function RecoCard({ call }) {
    if (!call.sell || !call.buy) {
        return e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Rotation call')),
            e('div', { className: 'nb-empty' }, call.text || 'No clear rotation — themes are balanced.'));
    }
    const score = call.conviction.score;
    return e('div', { className: 'nf-card nf-fade' },
        e('div', { className: 'ntr-reco-head' },
            e('div', null, e('span', { className: 'ntr-tag sell' }, 'SELL'), e('div', { className: 'ntr-reco-theme' }, call.sell.theme)),
            e('span', { className: 'ntr-reco-arrow' }, '→'),
            e('div', null, e('span', { className: 'ntr-tag buy' }, 'BUY'), e('div', { className: 'ntr-reco-theme' }, call.buy.theme))),
        score != null ? e('div', { className: 'ntr-convrow' },
            e('span', { className: 'lbl' }, 'Call conviction'),
            e('div', { className: 'ntr-track' }, e('div', { className: 'ntr-fill', style: { width: score + '%' } })),
            e('span', { className: 'num' }, score)) : null,
        e('div', { className: 'ntr-drivers' }, call.drivers.map(d =>
            e('div', { key: d.key, className: 'ntr-driver ' + d.status },
                e('span', { className: 'ic' }, DRIVER_IC[d.status]),
                e('span', null, d.text)))));
}

// ── 2b. Conviction score panel — the four-factor breakdown ────
const CV_FACTORS = [['momentum', 'Momentum'], ['positioning', 'Positioning'], ['breadth', 'Breadth'], ['macroFit', 'Macro fit']];

function ConvictionPanel({ conviction }) {
    const { score, tag, factors } = conviction;
    const tagCls = tag === 'BUY BIAS' ? '' : tag === 'NEUTRAL' ? ' neutral' : ' low';
    return e('div', { className: 'nf-card nf-fade' },
        e('div', { className: 'nf-card-h' }, e('h3', null, 'Rotation conviction'),
            e('span', { className: 'nf-sub' }, 'equal weights, held fixed')),
        score == null
            ? e('div', { className: 'nb-empty' }, 'No qualifying pair — nothing to score.')
            : e('div', null,
                e('div', { className: 'ntr-cv-row' },
                    e('span', { className: 'ntr-cv-score' }, score),
                    tag ? e('span', { className: 'ntr-cv-tag' + tagCls }, tag) : null),
                e('div', { className: 'ntr-cv-bar' }, e('i', { style: { width: score + '%' } })),
                CV_FACTORS.map(([k, label]) => e('div', { className: 'ntr-cv-item', key: k },
                    e('span', { className: 'lbl' }, label),
                    e('div', { className: 'track' }, factors[k] != null ? e('i', { style: { width: factors[k] + '%' } }) : null),
                    e('span', { className: 'wt' }, factors[k] != null ? Math.round(CONVICTION_WEIGHTS[k] * 100) + '%' : '—'))),
                e('div', { className: 'ntr-note', style: { marginTop: 10 } },
                    'Weights fixed at 25% each until a quarter of live readings is in; a factor with no data drops out and the rest renormalise.')));
}

// ── 3a. Signature object: the rotation map ────────────────────
function RotationMap({ rows, ranks, onPick }) {
    const plot = rows.filter(r => r.momentum5d != null && ranks.has(r.theme));
    if (!plot.length) return e('div', { className: 'nb-empty' }, 'Momentum pending — price history syncing.');
    const X0 = 72, X1 = 700, Y0 = 34, Y1 = 398;
    const moms = plot.map(r => r.momentum5d);
    const momMax = Math.max(3, ...moms) + 0.5;
    const momMin = Math.min(-3, ...moms) - 0.5;
    // x = percentile rank of position weight; the centre line at rank 50 is
    // rotationRead's heavy/light (median) cut, so quadrant = verdict.
    const px = rank => X0 + 28 + (rank / 100) * (X1 - X0 - 56);
    const py = m => Y0 + ((momMax - m) / (momMax - momMin)) * (Y1 - Y0);
    const cx = px(50), cy = py(0);
    const kids = [];

    kids.push(e('rect', { key: 'q1', x: X0, y: Y0, width: cx - X0, height: cy - Y0, fill: 'rgba(70,196,106,.045)' }));
    kids.push(e('rect', { key: 'q2', x: cx, y: Y0, width: X1 - cx, height: cy - Y0, fill: 'rgba(58,214,224,.045)' }));
    kids.push(e('rect', { key: 'q3', x: X0, y: cy, width: cx - X0, height: Y1 - cy, fill: 'rgba(88,100,115,.05)' }));
    kids.push(e('rect', { key: 'q4', x: cx, y: cy, width: X1 - cx, height: Y1 - cy, fill: 'rgba(240,88,79,.05)' }));
    kids.push(e('line', { key: 'hx', x1: X0, y1: cy, x2: X1, y2: cy, stroke: 'rgba(255,255,255,.14)', strokeWidth: 1 }));
    kids.push(e('line', { key: 'vx', x1: cx, y1: Y0, x2: cx, y2: Y1, stroke: 'rgba(255,255,255,.14)', strokeWidth: 1 }));

    const ql = [['ACCUMULATE · underweight, improving', X0 + 10, Y0 + 17, 'start'], ['HOLD WINNERS · core, improving', X1 - 10, Y0 + 17, 'end'],
        ['IGNORE · underweight, washed out', X0 + 10, Y1 - 9, 'start'], ['TRIM · crowded, rolling over', X1 - 10, Y1 - 9, 'end']];
    ql.forEach((q, i) => kids.push(e('text', { key: 'ql' + i, x: q[1], y: q[2], textAnchor: q[3], fontSize: 10, fill: 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, q[0])));
    kids.push(e('text', { key: 'ax', x: (X0 + X1) / 2, y: Y1 + 28, textAnchor: 'middle', fontSize: 11, fill: 'var(--text2)' }, 'Position weight percentile   light → committed'));
    kids.push(e('text', { key: 'ay', x: X0 - 26, y: (Y0 + Y1) / 2, textAnchor: 'middle', fontSize: 11, fill: 'var(--text2)', transform: 'rotate(-90 ' + (X0 - 26) + ' ' + ((Y0 + Y1) / 2) + ')' }, '5-day momentum Δ   ↓ → ↑'));

    plot.forEach(r => {
        const x = px(ranks.get(r.theme)), y = py(r.momentum5d);
        const rad = 7 + ((r.avgConviction || 0) / 100) * 13;
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
    return e('svg', { viewBox: '0 0 760 442', width: '100%', role: 'img', 'aria-label': 'Rotation map: themes by position-weight percentile (X) and 5-day momentum change (Y), sized by conviction, coloured by valuation.' }, kids);
}

// ── 3b. Leadership shift ledger — same field as the map's Y, sorted ──
function LeadershipLedger({ rows }) {
    const list = rows.filter(r => r.momentum5d != null).slice().sort((a, b) => b.momentum5d - a.momentum5d);
    if (!list.length) return e('div', { className: 'nb-empty' }, 'Momentum pending — price history syncing.');
    const maxAbs = Math.max(1, ...list.map(r => Math.abs(r.momentum5d)));
    return e('div', null, list.map(r => {
        const w = (Math.abs(r.momentum5d) / maxAbs) * 49;
        const up = r.momentum5d >= 0;
        return e('div', { className: 'ntr-ledger-row', key: r.theme, style: { cursor: 'pointer' }, onClick: () => drillTheme(r.theme) },
            e('span', { className: 'lname' }, r.theme),
            e('div', { className: 'ntr-ltrack' },
                e('i', { className: 'zero' }),
                e('i', { className: 'bar ' + (up ? 'up' : 'down'), style: up ? { left: '50%', width: w + '%' } : { left: (50 - w) + '%', width: w + '%' } })),
            e('span', { className: 'lval ' + moveTone(r.momentum5d) }, pct1(r.momentum5d)));
    }));
}

// ── 4. Per-theme card — one line per theme, detail on hover ───
function ThemeCard({ row, chip, note, onPick }) {
    const pendingVal = row.valuationPending || !row.valuationTilt;
    const momW = row.momentum5d == null ? 0 : Math.max(3, Math.min(100, 50 + row.momentum5d * 5));
    const momCol = row.momentum5d == null ? 'var(--text3)' : row.momentum5d > 0 ? 'var(--success)' : 'var(--danger)';
    const detail = 'VaR share ' + row.varSharePct.toFixed(1) + '% · conviction ' + row.avgConviction
        + (row.momentum5d != null ? ' · ' + pct1(row.momentum5d) + ' 5d' : '') + ' · click → Flagship';
    return e('div', { className: 'nt-card' + (row.fragility ? ' frag' : ''), style: { cursor: 'pointer' }, onClick: () => onPick(row.theme), title: detail },
        e('div', { className: 'nt-card-h' },
            e('span', { className: 'nt-theme' }, row.theme),
            e('span', { className: 'nt-share' }, row.sharePct == null ? '—' : row.sharePct.toFixed(1) + '%')),
        e('div', { className: 'nt-moveline' },
            e('span', { className: 'nt-move ' + moveTone(row.movePct) }, pct1(row.movePct))),
        e('div', { className: 'ntr-mom' }, e('i', { style: { width: momW + '%', background: momCol } })),
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 } },
            e('span', { className: 'ntr-valtag' + (pendingVal ? ' pending' : ' ' + row.valuationTilt) }, pendingVal ? 'Pending' : TILT_LABEL[row.valuationTilt]),
            e('span', { className: 'ntr-note' }, note)),
        e('div', { className: 'ntr-chip ' + (CHIP_CLS[chip] || '') }, chip));
}

// ── 5. Transmission — factor betas + why it moved ─────────────
function movedBecause(r) {
    const b = r.betas || {};
    const cands = [['rate', b.rate], ['USD', b.usd], ['oil', b.oil]].filter(x => x[1] != null);
    if (!cands.length) return 'factor betas pending';
    cands.sort((a, c) => Math.abs(c[1]) - Math.abs(a[1]));
    const [name, val] = cands[0];
    if (Math.abs(val) < 0.3) return 'low factor sensitivity';
    return name + (val > 0 ? '-positive' : '-negative') + ' (β ' + fmtBeta(val) + ')';
}

export function NexusThemePanel({ model }) {
    const series = useThemeSeries();
    const { macro, loading: macroLoading } = useMacro();
    const base = buildThemeView(model.holdings, model.spine);
    const rows = base.map(r => {
        const td = series.map.get(r.theme);
        return { ...r, momentum5d: td ? td.momentum5d : null, betas: td ? td.betas : { rate: null, usd: null, oil: null } };
    });
    const disp = themeDispersion(model.holdings);
    const regime = macro && macro.regime;
    const call = rotationCall(rows, disp, regime ? regimePlaybook(regime.label) : null);
    const ranks = positionRankPct(rows);
    const chipOf = t => VERDICT_CHIP[(call.perTheme.find(p => p.theme === t) || {}).verdict] || 'HOLD';

    // Transmission: heaviest themes first, capped for space.
    const transmit = rows.filter(r => r.movePct != null).slice(0, 8);
    // Dispersion: widest spreads first, only where it's material.
    const dispRows = rows.map(r => ({ r, d: disp[r.theme] }))
        .filter(x => x.d && x.d.spread >= 2 && (x.d.winners.length || x.d.losers.length))
        .sort((a, b) => b.d.spread - a.d.spread).slice(0, 3);

    return e('div', null,
        // 1. REGIME BANNER — why rotation is happening
        e(RegimeBanner, { macro, loading: macroLoading }),

        // 2. THE CALL — recommendation + conviction breakdown
        e('div', { className: 'ntr-top' },
            e(RecoCard, { call }),
            e(ConvictionPanel, { conviction: call.conviction })),

        // 3. MAP + LEDGER — where positioning sits vs where momentum is moving
        e('div', { className: 'ntr-mid' },
            e('div', { className: 'nf-card nf-fade' },
                e('div', { className: 'nf-card-h' },
                    e('div', null, e('h3', null, 'Rotation map'),
                        e('div', { className: 'nf-sub', style: { marginTop: 4 } }, 'weight percentile (x) vs 5-day momentum Δ (y) · bubble = conviction · colour = valuation')),
                    !series.loaded ? e('span', { className: 'nf-sub' }, 'loading momentum…') : null),
                // Regime qualifier: wide dispersion → the rotation call is
                // trustworthy; compressed → beta dominates, treat as noise.
                e(DispersionRegime),
                e(RotationMap, { rows, ranks, onPick: drillTheme }),
                e(SectorDispersionStrip),
                e('div', { className: 'nt-leg' },
                    e('span', null, e('i', { className: 'nt-sw', style: { background: 'var(--success)' } }), 'cheap'),
                    e('span', null, e('i', { className: 'nt-sw', style: { background: 'var(--danger)' } }), 'rich'),
                    e('span', null, e('i', { className: 'nt-sw', style: { background: '#5a6b7d' } }), 'fair'),
                    e('span', null, e('i', { className: 'nt-sw dash' }), 'valuation pending sync'),
                    e('span', { className: 't3' }, '· size = conviction'))),
            e('div', { className: 'nf-card nf-fade' },
                e('div', { className: 'nf-card-h' },
                    e('div', null, e('h3', null, 'Leadership shift'),
                        e('div', { className: 'nf-sub', style: { marginTop: 4 } }, 'themes ranked by 5-day momentum Δ — the map’s y-axis, sorted'))),
                e(LeadershipLedger, { rows }))),

        // 4. DETAIL GRID — one line per theme, chip = quadrant verdict
        e('div', { className: 'nf-card nf-fade', style: { marginTop: 14 } },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Per-theme breakdown'),
                e('span', { className: 'nf-sub' }, rows.length + ' themes · VaR / conviction on hover · click → Flagship')),
            e('div', { className: 'nt-grid' }, rows.map(r =>
                e(ThemeCard, { key: r.theme, row: r, chip: chipOf(r.theme), note: breadthNote(disp[r.theme]), onPick: drillTheme })))),

        // 5. SUPPORTING EVIDENCE — backs the call above, doesn't compete with it
        e('div', { className: 'nf-card nf-fade', style: { marginTop: 14 } },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Transmission'),
                e('span', { className: 'nf-sub' }, 'supporting evidence — β to a 1% move in each factor (vol-normalised)')),
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

        dispRows.length ? e('div', { className: 'nf-card nf-fade', style: { marginTop: 14 } },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Intra-theme dispersion'),
                e('span', { className: 'nf-sub' }, 'supporting evidence — a calm average can hide a wide spread')),
            dispRows.map(({ r, d }) => e('div', { className: 'nt-disp', key: r.theme },
                e('div', { className: 'nt-disp-l' }, e('span', { className: 'nf-tk' }, r.theme), ' ',
                    e('span', { className: 'mono ' + moveTone(r.movePct) }, pct1(r.movePct)), e('span', { className: 't3' }, ' surface · spread ' + d.spread + 'pp')),
                e('div', { className: 'nt-chips' },
                    d.winners.map(w => e('span', { key: w.tk, className: 'nt-chip w' }, w.tk + ' ' + pct1(w.pct))),
                    d.losers.map(l => e('span', { key: l.tk, className: 'nt-chip l' }, l.tk + ' ' + pct1(l.pct))))))) : null);
}

export default NexusThemePanel;
