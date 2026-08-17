// ATLAS Trade — /trade/universe. Spec §3.
//
// "Eligibility is binary and runs first. Ranking is continuous and runs second.
// Every name excluded is shown with its reason, so a shrinking opportunity set
// is never silent."
//
// Three views (§3.5), default spatial rather than tabular, with the position
// overlay always on (§3.6) and every name routing into the ticket carrying the
// context that surfaced it (§3.7).

import React from 'react';
import {
    e, Card, Chip, Missing, Ann, fLarge, fPct, fSigned, fNum, DASH, toneOf,
} from './shared.js';
import { matchesAxes, rankUniverse } from '../../lib/trade/universe.js';

const { useState, useMemo } = React;

const SECTOR_FALLBACK = 'Unclassified';

export function TradeUniverse({ universe, onOpenTicket, loading }) {
    const [view, setView] = useState('field');
    const [rankBy, setRankBy] = useState('composite');
    const [axes, setAxes] = useState({
        geography: [], sector: [], marketCap: [], realisedVol: [], momentum: [],
        bookState: [], options: [], earnings: [], minAdvUsd: null,
    });

    const members = universe && universe.members ? universe.members : [];
    const eligible = useMemo(() => members.filter((m) => m.eligible), [members]);
    const excluded = useMemo(
        () => members.filter((m) => !m.eligible).sort((a, b) => String(a.exclusionCode).localeCompare(String(b.exclusionCode))),
        [members],
    );

    const filtered = useMemo(
        () => rankUniverse(eligible.filter((m) => matchesAxes(m, axes)), { rankBy }),
        [eligible, axes, rankBy],
    );

    const sectors = useMemo(() => {
        const s = new Set();
        for (const m of eligible) s.add(m.sector || SECTOR_FALLBACK);
        return [...s].sort();
    }, [eligible]);

    function toggle(group, value) {
        setAxes((a) => {
            const cur = a[group] || [];
            return { ...a, [group]: cur.includes(value) ? cur.filter((x) => x !== value) : cur.concat([value]) };
        });
    }

    if (loading) {
        return e('div', { className: 'tr-wrap' }, e('div', { className: 'tr-sub' }, 'Loading the universe…'));
    }

    if (!universe || !universe.available) {
        return e('div', { className: 'tr-wrap' },
            e('div', { className: 'tr-h2' }, 'Tradeable universe'),
            e(Card, { title: 'UNIVERSE NOT YET SNAPSHOTTED' },
                e(Missing, { title: 'NO SNAPSHOT ON FILE' },
                    (universe && universe.reason) || 'No universe has been built yet.',
                    e('div', { style: { marginTop: 10 } },
                        'The universe is a stored, versioned set rather than a live query, so it has to be ',
                        'written before it can be read. Run ', e('code', null, 'GET /api/trade-sync?job=all'),
                        ' — or wait for the nightly cron — and this screen fills in.'))));
    }

    return e('div', { className: 'tr-wrap' },
        e('div', { className: 'tr-h2' }, 'Tradeable universe'),
        e('p', { className: 'tr-sub' },
            'Eligibility is binary and runs first. Ranking is continuous and runs second. ',
            'Every name excluded is shown with its reason, so a shrinking opportunity set is never silent.'),

        e(FunnelBar, { funnel: universe.funnel, counts: universe.counts }),

        e('div', { className: 'tr-ugrid' },
            e(AxesPanel, { axes, sectors, toggle, setAxes }),

            e('div', { className: 'tr-card' },
                e('div', { className: 'tr-ch', style: { display: 'flex', alignItems: 'center', gap: 9 } },
                    e('span', { style: { flex: 1 } },
                        (view === 'map' ? 'MAP VIEW · GEOGRAPHY × SECTOR' :
                         view === 'field' ? 'FIELD VIEW · MOMENTUM × VOLATILITY' :
                         'TABLE VIEW') + ' · ' + filtered.length + ' OF ' + eligible.length + ' ELIGIBLE'),
                    e('span', { className: 'tr-viewsel' },
                        e(Chip, { on: view === 'map', onClick: () => setView('map') }, 'MAP'),
                        e(Chip, { on: view === 'field', onClick: () => setView('field') }, 'FIELD'),
                        e(Chip, { on: view === 'table', onClick: () => setView('table') }, 'TABLE'))),

                view === 'field' ? e(FieldView, { rows: filtered, onOpenTicket, axes, rankBy, view })
                    : view === 'map' ? e(MapView, { rows: filtered, onOpenTicket, axes, rankBy, view })
                    : e(TableView, { rows: filtered, onOpenTicket, rankBy, setRankBy, axes, view }),

                view !== 'table' ? e('div', { className: 'tr-legend' },
                    e('span', { className: 'tr-lg' }, e('span', { className: 'tr-dot', style: { background: '#48b9c4' } }), 'HELD'),
                    e('span', { className: 'tr-lg' }, e('span', { className: 'tr-dot', style: { background: '#35b691' } }), 'NET POSITIVE COHERENCE'),
                    e('span', { className: 'tr-lg' }, e('span', { className: 'tr-dot', style: { background: '#e0655c' } }), 'NET NEGATIVE'),
                    e('span', { className: 'tr-lg' }, e('span', { className: 'tr-dot', style: { background: '#8b98a8' } }), 'NEUTRAL / UNSCORED'),
                    e('span', { className: 'tr-lg' }, 'RADIUS = LIQUIDITY'),
                    e('span', { className: 'tr-lg' }, 'RING = IN BOOK')) : null),

            e('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
                e(ExcludedDrawer, {
                    excluded, onOpenTicket,
                    total: universe.excludedTotal != null ? universe.excludedTotal : excluded.length,
                }),
                e(RankedPanel, { rows: filtered, rankBy, setRankBy, onOpenTicket, axes, view }))),

        e(Ann, { title: 'WHY THIS IS NOT A SCREENER' },
            'The set is snapshotted daily and stored, so the opportunity set on any past date is recoverable. ',
            'Clicking any name routes to the ticket carrying its rank, the active axes, and the view it surfaced from, ',
            'all of which land in the intent row.',
            universe.asOfDate ? e('div', { style: { marginTop: 6 }, className: 'tr-dim3' },
                `Snapshot ${universe.asOfDate}${universe.builtAt ? ' · built ' + new Date(universe.builtAt).toISOString().slice(0, 16).replace('T', ' ') : ''}`) : null));
}

// ── Funnel ───────────────────────────────────────────────────────────────────

function FunnelBar({ funnel, counts }) {
    const steps = funnel && funnel.length ? funnel : [];
    if (!steps.length) return null;
    return e('div', { className: 'tr-ubar' },
        steps.map((s, i) => {
            const isGate = s.stage === 'data_integrity';
            const cls = 'tr-ustep' + (isGate ? ' gate' : s.isFinal || s.stage === 'eligible' ? ' final' : s.dropped ? ' drop' : '');
            return e('div', { key: s.stage + i, className: cls, title: s.dropped ? `${s.dropped} names dropped here` : null },
                e('div', { className: 'tr-n' + (isGate ? ' tr-am' : '') },
                    isGate ? (s.dropped ? '−' + s.dropped : '0') : (s.count != null ? s.count.toLocaleString() : DASH)),
                e('div', { className: 'tr-l' }, s.label));
        }));
}

// ── Axes ─────────────────────────────────────────────────────────────────────

function AxesPanel({ axes, sectors, toggle, setAxes }) {
    const [showAllSectors, setShowAll] = React.useState(false);
    const shown = showAllSectors ? sectors : sectors.slice(0, 5);
    const group = (title, children) => e('div', { className: 'tr-fgroup' }, e('h4', null, title), e('div', { className: 'tr-chips' }, children));

    return e('div', { className: 'tr-card' },
        e('div', { className: 'tr-ch' }, 'AXES'),
        e('div', { className: 'tr-cb' },
            group('GEOGRAPHY', ['US', 'JSE', 'EU', 'APAC'].map((g) =>
                e(Chip, {
                    key: g, on: axes.geography.includes(g), onClick: () => toggle('geography', g),
                    disabled: g !== 'US',
                    title: g !== 'US' ? 'Venue-agnostic by construction — not yet sourced (§10 decision 3)' : null,
                }, g))),

            group('SECTOR', [
                ...shown.map((s) => e(Chip, { key: s, on: axes.sector.includes(s), onClick: () => toggle('sector', s) }, s)),
                sectors.length > 5 ? e(Chip, {
                    key: '_more', on: false, onClick: () => setShowAll((x) => !x),
                }, showAllSectors ? '−' : '+' + (sectors.length - 5)) : null,
            ]),

            group('MARKET CAP', ['Micro', 'Small', 'Mid', 'Large', 'Mega'].map((b) =>
                e(Chip, { key: b, on: axes.marketCap.includes(b), onClick: () => toggle('marketCap', b) }, b))),

            group('REALISED VOL', ['Q1', 'Q2', 'Q3', 'Q4'].map((b) =>
                e(Chip, { key: b, on: axes.realisedVol.includes(b), onClick: () => toggle('realisedVol', b) }, b))),

            group('MOMENTUM', ['Q1', 'Q2', 'Q3', 'Q4'].map((b) =>
                e(Chip, { key: b, on: axes.momentum.includes(b), onClick: () => toggle('momentum', b) }, b))),

            group('LIQUIDITY', [
                e(Chip, { key: '50', on: axes.minAdvUsd === 50e6, onClick: () => setAxes((a) => ({ ...a, minAdvUsd: a.minAdvUsd === 50e6 ? null : 50e6 })) }, '>$50m ADV'),
                e(Chip, { key: '10', on: axes.minAdvUsd === 10e6, onClick: () => setAxes((a) => ({ ...a, minAdvUsd: a.minAdvUsd === 10e6 ? null : 10e6 })) }, '>$10m'),
            ]),

            group('OPTIONS / IV RANK', [
                e(Chip, { key: 'l', on: axes.options.includes('listed'), onClick: () => toggle('options', 'listed') }, 'Listed'),
                e(Chip, { key: 'lo', on: axes.options.includes('iv_lt_40'), onClick: () => toggle('options', 'iv_lt_40') }, 'IV<40'),
                e(Chip, { key: 'hi', on: axes.options.includes('iv_gt_60'), onClick: () => toggle('options', 'iv_gt_60') }, 'IV>60'),
            ]),

            group('EARNINGS PROXIMITY', [
                e(Chip, { key: 'a', on: axes.earnings.includes('lt5d'), onClick: () => toggle('earnings', 'lt5d') }, '<5d'),
                e(Chip, { key: 'b', on: axes.earnings.includes('5_30d'), onClick: () => toggle('earnings', '5_30d') }, '5–30d'),
                e(Chip, { key: 'c', on: axes.earnings.includes('gt30d'), onClick: () => toggle('earnings', 'gt30d') }, '>30d'),
            ]),

            e('div', { className: 'tr-fgroup', style: { marginBottom: 0 } },
                e('h4', null, 'BOOK STATE'),
                e('div', { className: 'tr-chips' },
                    ['held', 'bench', 'unowned'].map((b) =>
                        e(Chip, { key: b, on: axes.bookState.includes(b), onClick: () => toggle('bookState', b) },
                            b === 'held' ? 'Held' : b === 'bench' ? 'On bench' : 'Unowned'))))));
}

// ── Field view (§3.5) ────────────────────────────────────────────────────────

function fillFor(r) {
    if (r.net == null) return '#8b98a8';
    return r.net > 0.05 ? '#35b691' : r.net < -0.05 ? '#e0655c' : '#8b98a8';
}

function radiusFor(r) {
    const p = r.liquidityPct;
    if (p == null) return 3;
    return 2.5 + (p / 100) * 5.5;
}

function FieldView({ rows, onOpenTicket, axes, rankBy, view }) {
    const W = 620, H = 430, L = 60, R = 580, T = 40, B = 380;
    const x = (pct) => L + ((pct ?? 50) / 100) * (R - L);
    const y = (pct) => B - ((pct ?? 50) / 100) * (B - T);

    const plotted = rows.filter((r) => r.momentumPct != null && r.volPct != null);

    return e('div', { className: 'tr-cb tr-svgwrap' },
        plotted.length === 0
            ? e(Missing, { title: 'NOTHING TO PLOT' },
                'No eligible name carries both a momentum and a volatility percentile today.')
            : e('svg', {
                viewBox: `0 0 ${W} ${H}`, role: 'img',
                'aria-label': 'Scatter of eligible names, momentum percentile against realised volatility percentile',
            },
                e('defs', null,
                    e('linearGradient', { id: 'tr-qg', x1: '0', y1: '1', x2: '1', y2: '0' },
                        e('stop', { offset: '0', stopColor: '#48b9c4', stopOpacity: '0' }),
                        e('stop', { offset: '1', stopColor: '#48b9c4', stopOpacity: '.06' }))),
                e('rect', { x: 310, y: 40, width: 270, height: 170, fill: 'url(#tr-qg)' }),
                e('g', { stroke: 'rgba(255,255,255,.055)' },
                    e('line', { x1: L, y1: T, x2: L, y2: B }),
                    e('line', { x1: L, y1: B, x2: R, y2: B }),
                    e('line', { x1: 310, y1: T, x2: 310, y2: B, strokeDasharray: '3 4' }),
                    e('line', { x1: L, y1: 210, x2: R, y2: 210, strokeDasharray: '3 4' })),
                e('g', { fontFamily: 'JetBrains Mono', fontSize: '9', fill: '#5a6675' },
                    e('text', { x: 60, y: 398 }, '0'),
                    e('text', { x: 300, y: 398 }, '50'),
                    e('text', { x: 566, y: 398 }, '100'),
                    e('text', { x: 300, y: 414, textAnchor: 'middle' }, 'MOMENTUM PERCENTILE'),
                    e('text', { x: 40, y: 384 }, '0'),
                    e('text', { x: 36, y: 214 }, '50'),
                    e('text', { x: 32, y: 46 }, '100'),
                    e('text', { x: 20, y: 210, transform: 'rotate(-90 20 210)', textAnchor: 'middle' }, 'REALISED VOL PERCENTILE'),
                    e('text', { x: 570, y: 58, textAnchor: 'end', fill: '#3a4654' }, 'HIGH MOMENTUM · HIGH VOL'),
                    e('text', { x: 570, y: 372, textAnchor: 'end', fill: '#3a4654' }, 'HIGH MOMENTUM · LOW VOL')),

                // Unheld names first, so the book always draws on top.
                e('g', null, plotted.filter((r) => r.bookState !== 'held').map((r) =>
                    e('g', { key: r.symbol, className: 'tr-node', onClick: () => onOpenTicket(r, { view, rankBy, axes }) },
                        e('circle', {
                            cx: x(r.momentumPct), cy: y(r.volPct), r: radiusFor(r),
                            fill: fillFor(r), fillOpacity: r.net == null ? 0.38 : 0.55,
                        },
                            e('title', null, `${r.symbol} · momentum ${fNum(r.momentumPct, 0)} · vol ${fNum(r.volPct, 0)} · net ${fSigned(r.net)} · ADV ${fLarge(r.advUsd)}`)),
                        r.net != null && Math.abs(r.net) > 0.2
                            ? e('text', {
                                x: x(r.momentumPct), y: y(r.volPct) + 18, fontFamily: 'JetBrains Mono',
                                fontSize: '9', fill: fillFor(r), textAnchor: 'middle',
                            }, r.symbol) : null))),

                e('g', null, plotted.filter((r) => r.bookState === 'held').map((r) =>
                    e('g', { key: r.symbol, className: 'tr-node', onClick: () => onOpenTicket(r, { view, rankBy, axes }) },
                        e('circle', {
                            cx: x(r.momentumPct), cy: y(r.volPct), r: radiusFor(r) + 2,
                            fill: '#48b9c4', fillOpacity: 0.18, stroke: '#48b9c4', strokeWidth: 1.5,
                        },
                            e('title', null, `${r.symbol} · held ${fNum(r.heldWeightPct, 2)}% of equity`)),
                        e('text', {
                            x: x(r.momentumPct), y: y(r.volPct) - 12, fontFamily: 'JetBrains Mono',
                            fontSize: '10', fill: '#48b9c4', textAnchor: 'middle',
                        }, r.symbol))))));
}

// ── Map view (§3.5): treemap, geography outer, sector inner ──────────────────

function squarify(items, x0, y0, w, h) {
    // Simple slice-and-dice: deterministic, stable across renders, and legible
    // at the tile counts this book produces. Area is proportional to value.
    const out = [];
    const total = items.reduce((a, i) => a + i.value, 0);
    if (!(total > 0)) return out;
    let x = x0, y = y0, rw = w, rh = h;
    let rest = items.slice().sort((a, b) => b.value - a.value);
    let remaining = total;

    while (rest.length) {
        const it = rest.shift();
        const frac = it.value / remaining;
        if (rw >= rh) {
            const tw = rw * frac;
            out.push({ ...it, x, y, w: tw, h: rh });
            x += tw; rw -= tw;
        } else {
            const th = rh * frac;
            out.push({ ...it, x, y, w: rw, h: th });
            y += th; rh -= th;
        }
        remaining -= it.value;
    }
    return out;
}

function MapView({ rows, onOpenTicket, axes, rankBy, view }) {
    const W = 620, H = 430;
    const bySector = new Map();
    for (const r of rows) {
        const k = r.sector || SECTOR_FALLBACK;
        if (!bySector.has(k)) bySector.set(k, []);
        bySector.get(k).push(r);
    }
    const sectorItems = [...bySector.entries()].map(([k, list]) => ({
        key: k,
        value: list.reduce((a, r) => a + (r.advUsd || r.marketCapUsd || 1), 0),
        list,
    }));

    if (!sectorItems.length) {
        return e('div', { className: 'tr-cb' },
            e(Missing, { title: 'NOTHING TO MAP' }, 'No eligible name carries a sector and a size today.'));
    }

    const tiles = squarify(sectorItems, 0, 0, W, H);

    return e('div', { className: 'tr-cb tr-svgwrap' },
        e('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Treemap of the eligible set, sector by size, filled by net signal direction' },
            tiles.map((t) => {
                const inner = squarify(
                    t.list.map((r) => ({ key: r.symbol, value: r.advUsd || r.marketCapUsd || 1, row: r })),
                    t.x + 1, t.y + 1, Math.max(t.w - 2, 1), Math.max(t.h - 2, 1),
                );
                return e('g', { key: t.key },
                    inner.map((c) => e('g', { key: c.key, className: 'tr-node', onClick: () => onOpenTicket(c.row, { view, rankBy, axes }) },
                        e('rect', {
                            x: c.x, y: c.y, width: Math.max(c.w - 1, 0), height: Math.max(c.h - 1, 0),
                            fill: fillFor(c.row),
                            fillOpacity: c.row.net == null ? 0.12 : 0.14 + Math.min(Math.abs(c.row.net), 1) * 0.5,
                            stroke: c.row.bookState === 'held' ? '#48b9c4' : 'rgba(255,255,255,.07)',
                            strokeWidth: c.row.bookState === 'held' ? 1.4 : 0.6,
                        }, e('title', null, `${c.key} · ${t.key} · net ${fSigned(c.row.net)} · ADV ${fLarge(c.row.advUsd)}`)),
                        c.w > 34 && c.h > 16
                            ? e('text', {
                                x: c.x + 4, y: c.y + 13, fontFamily: 'JetBrains Mono', fontSize: '9',
                                fill: c.row.bookState === 'held' ? '#48b9c4' : '#dde5ed',
                            }, c.key) : null)),
                    t.w > 60 && t.h > 26
                        ? e('text', {
                            x: t.x + 5, y: t.y + t.h - 5, fontFamily: 'JetBrains Mono', fontSize: '8.5',
                            fill: '#5a6675', style: { pointerEvents: 'none' },
                        }, t.key.toUpperCase()) : null);
            })));
}

// ── Table view ───────────────────────────────────────────────────────────────

const TABLE_COLS = [
    { key: 'rank', label: '#', get: (r) => r.rank, sortKey: 'composite' },
    { key: 'symbol', label: 'NAME', get: (r) => r.symbol, cls: 'name' },
    { key: 'sector', label: 'SECTOR', get: (r) => r.sector || DASH, cls: 'name' },
    { key: 'net', label: 'NET', get: (r) => fSigned(r.net), tone: (r) => toneOf(r.net), sortKey: 'net' },
    { key: 'alignment', label: 'ALIGN', get: (r) => (r.alignment == null ? DASH : fNum(r.alignment, 2)), sortKey: 'alignment' },
    { key: 'dispersion', label: 'DISP', get: (r) => (r.dispersion == null ? DASH : fNum(r.dispersion, 2)) },
    { key: 'momentumPct', label: 'MOM %ILE', get: (r) => fNum(r.momentumPct, 0), sortKey: 'momentum' },
    { key: 'volPct', label: 'VOL %ILE', get: (r) => fNum(r.volPct, 0), sortKey: 'vol' },
    { key: 'advUsd', label: 'ADV', get: (r) => fLarge(r.advUsd), sortKey: 'adv' },
    { key: 'marketCapUsd', label: 'MCAP', get: (r) => fLarge(r.marketCapUsd) },
    { key: 'bookState', label: 'BOOK', get: (r) => (r.bookState === 'held' ? fNum(r.heldWeightPct, 2) + '%' : r.bookState || DASH) },
];

function TableView({ rows, onOpenTicket, rankBy, setRankBy, axes, view }) {
    return e('div', { className: 'tr-cb tr-scroll', style: { padding: '0 6px 6px' } },
        e('table', { className: 'tr-table' },
            e('thead', null, e('tr', null, TABLE_COLS.map((c) =>
                e('th', {
                    key: c.key,
                    onClick: c.sortKey ? () => setRankBy(c.sortKey) : null,
                    title: c.sortKey ? 'Rank by ' + c.label : null,
                    style: { color: c.sortKey === rankBy ? '#48b9c4' : null },
                }, c.label)))),
            e('tbody', null, rows.map((r) =>
                e('tr', { key: r.symbol, onClick: () => onOpenTicket(r, { view, rankBy, axes }) },
                    TABLE_COLS.map((c) =>
                        e('td', { key: c.key, className: (c.cls || '') + ' ' + (c.tone ? c.tone(r) : '') }, c.get(r))))))));
}

// ── Excluded drawer (§3.2) ───────────────────────────────────────────────────

function ExcludedDrawer({ excluded, onOpenTicket, total }) {
    const [expanded, setExpanded] = React.useState(false);
    const held = excluded.filter((r) => r.bookState === 'held');
    const shown = expanded ? excluded : excluded.slice(0, 8);
    const sampled = total > excluded.length;

    // Reason codes across the whole drawer, so the shape of the exclusion is
    // legible even when the list itself is a sample.
    const byReason = {};
    for (const r of excluded) byReason[r.exclusionCode] = (byReason[r.exclusionCode] || 0) + 1;
    const reasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]);

    return e('div', { className: 'tr-card' },
        e('div', { className: 'tr-ch' }, `EXCLUDED · ${total} NAME${total === 1 ? '' : 'S'}`),
        e('div', { className: 'tr-cb tr-exc' },
            reasons.length
                ? e('div', { className: 'tr-exreasons' },
                    reasons.map(([code, n]) =>
                        e('span', { key: code, className: 'tr-badge warn', title: `${n} in this sample` },
                            code + ' ×' + n)))
                : null,
            excluded.length === 0
                ? e('div', { className: 'tr-dim3', style: { fontSize: 12 } }, 'Nothing was excluded today.')
                : shown.map((r) =>
                    e('div', { key: r.symbol, className: 'tr-e' },
                        e('span', { className: 'tr-sym', onClick: () => onOpenTicket(r, { view: 'excluded' }) }, r.symbol),
                        e('span', { className: 'tr-why', title: r.exclusionDetail || '' }, r.exclusionCode))),
            excluded.length > 8
                ? e('button', {
                    className: 'tr-chip', style: { marginTop: 8 }, type: 'button',
                    onClick: () => setExpanded((x) => !x),
                }, expanded ? 'SHOW LESS' : `SHOW ${excluded.length}`) : null,
            sampled
                ? e('div', { className: 'tr-note', style: { marginTop: 8 } },
                    `Showing ${excluded.length} of ${total}, held names first. The full set is on the daily snapshot; `
                    + 'the drawer samples it so the page does not ship the whole listed universe to read one column.')
                : null,
            held.length ? e(HeldButIneligible, { held }) : null));
}

/**
 * Held names that are ineligible today. The point of this note is the rule, not
 * the roll-call, so it names the largest few and totals the rest — a book with
 * thirty ineligible holdings would otherwise bury the sentence that matters
 * under a list nobody reads.
 */
function HeldButIneligible({ held }) {
    const [all, setAll] = React.useState(false);
    const sorted = held.slice().sort((a, b) => (b.heldWeightPct || 0) - (a.heldWeightPct || 0));
    const named = all ? sorted : sorted.slice(0, 3);
    const rest = sorted.length - named.length;
    const restWeight = sorted.slice(named.length).reduce((a, h) => a + (h.heldWeightPct || 0), 0);

    return e('div', { className: 'tr-note', style: { marginTop: 10 } },
        named.map((h) => `${h.symbol} at ${fNum(h.heldWeightPct, 1)}%`).join(', '),
        rest > 0
            ? ` and ${rest} other${rest === 1 ? '' : 's'} totalling ${fNum(restWeight, 1)}%`
            : '',
        sorted.length === 1 ? ' is ' : ' are ',
        'held and ineligible for new trades. Existing exposure is unaffected. ',
        'Exits are always permitted through a data gate.',
        rest > 0
            ? e('button', {
                className: 'tr-chip', type: 'button', style: { marginTop: 6, display: 'block' },
                onClick: () => setAll(true),
            }, `NAME ALL ${sorted.length}`)
            : null);
}

// ── Ranked panel (§3.4) ──────────────────────────────────────────────────────

function RankedPanel({ rows, rankBy, setRankBy, onOpenTicket, axes, view }) {
    const top = rows.slice(0, 8);
    const byNet = rows.slice().sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity)).map((r) => r.symbol);
    const byAlign = rows.slice().sort((a, b) => (b.alignment ?? -Infinity) - (a.alignment ?? -Infinity)).map((r) => r.symbol);
    const disagree = byNet.join() !== byAlign.join();

    return e('div', { className: 'tr-card' },
        e('div', { className: 'tr-ch', style: { display: 'flex', gap: 8, alignItems: 'center' } },
            e('span', { style: { flex: 1 } }, 'RANKED · TOP OF ELIGIBLE SET'),
            e('span', { className: 'tr-viewsel' },
                ['composite', 'net', 'alignment'].map((k) =>
                    e(Chip, { key: k, on: rankBy === k, onClick: () => setRankBy(k) }, k.slice(0, 5).toUpperCase())))),
        e('div', { className: 'tr-cb', style: { padding: '6px 14px 12px' } },
            top.length === 0
                ? e('div', { className: 'tr-dim3', style: { fontSize: 12, padding: '8px 0' } }, 'No name matches the active axes.')
                : e('table', { className: 'tr-ftable' },
                    e('thead', null, e('tr', null,
                        e('th', null, 'NAME'), e('th', null, 'NET'), e('th', null, 'ALIGN'), e('th', null, 'ADV'))),
                    e('tbody', null, top.map((r) =>
                        e('tr', { key: r.symbol, className: 'clickable', onClick: () => onOpenTicket(r, { view, rankBy, axes }) },
                            e('td', null, r.symbol),
                            e('td', { className: toneOf(r.net) }, fSigned(r.net)),
                            e('td', { className: r.alignment != null && r.alignment < 0.25 ? 'tr-am' : '' },
                                r.alignment == null ? DASH : fNum(r.alignment, 2)),
                            e('td', null, fLarge(r.advUsd)))))),
            disagree
                ? e('div', { className: 'tr-note' },
                    'Ordering by net and ordering by alignment do not agree. A single composite score would have ',
                    'collapsed them into one column and lost that.')
                : null));
}
