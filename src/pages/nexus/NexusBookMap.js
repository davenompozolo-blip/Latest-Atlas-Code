// ============================================================
// Nexus — the book universe map (G-3)
// ------------------------------------------------------------
// A toggle on the holdings table: TABLE shows what you own, MAP shows what you
// own sitting inside the set of things you could own instead.
//
// All arithmetic and every refusal live in nexusBookMapCompute.js. The
// "what would this do to the book" answer is NOT reimplemented here --
// `src/lib/trade/bookImpact.js` owns it, the Trade ticket's Pane B renders it,
// and this drawer calls the same function with the same inputs. A second
// implementation of that arithmetic is how two surfaces start disagreeing
// about your risk.
// ============================================================

import React from 'react';
import { supabase } from '../../lib/supabase.js';
import * as tradeData from '../../lib/trade/tradeData.js';
import { computeBookImpact } from '../../lib/trade/bookImpact.js';
import { covarianceIsMeasurable, coverageSentence } from '../../lib/trade/covarianceCoverage.js';
import {
    normaliseRow, placement, extents, bookCentroid, quadrantOf, rankCandidates,
    facetCounts, applyMapFilters, sectorOptions, candidateLine, isRankable,
    QUADRANT, ABSENCE_TEXT,
} from './nexusBookMapCompute.js';

const { useState, useEffect, useMemo, useCallback, useRef } = React;
const e = React.createElement;

const isNum = (v) => typeof v === 'number' && isFinite(v);
// One minus sign throughout (U+2212), because toFixed emits ASCII '-' and
// mixing the two inside one panel reads as two different kinds of number.
const MINUS = '\u2212';
const sign = (str) => String(str).replace(/^-/, MINUS);
const pct = (v, d = 1) => (isNum(v) ? sign((v * 100).toFixed(d)) + '%' : '—');
// `money` keeps the sign. An incremental VaR of -$4 means the add REDUCES the
// bound, which is the whole point of showing it beside an offsetting name --
// an abs() here would print $4 and say the opposite.
const money = (v, d = 0) => (isNum(v)
    ? (v < 0 ? MINUS : '') + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: d })
    : '—');
const big = (v) => {
    if (!isNum(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return sign((v / 1e9).toFixed(1)).replace(/^(\u2212)?/, '$1$') + 'b';
    if (a >= 1e6) return sign((v / 1e6).toFixed(0)).replace(/^(\u2212)?/, '$1$') + 'm';
    return money(v);
};

// ── Data ─────────────────────────────────────────────────────
function useMapRows() {
    const [s, setS] = useState({ loading: true });
    useEffect(() => {
        let alive = true;
        // Not configured and did not answer are different claims, and only
        // one of them is about the connection.
        if (!supabase) { setS({ loading: false, failed: true, unconfigured: true }); return undefined; }
        supabase.from('mv_book_candidate_map')
            .select('*')
            // 423 rows today and bounded by the correlation snapshot's own
            // ~420-symbol cap, so this sits well inside PostgREST's 1,000-row
            // ceiling -- but the ceiling is asserted rather than assumed.
            .limit(1000)
            .then(({ data, error }) => {
                if (!alive) return;
                if (error) {
                    // A transport failure must never render as a statement
                    // about the data.
                    console.error('[nexus] book map read failed:', error.message, error);
                    setS({ loading: false, failed: true });
                    return;
                }
                const rows = (data || []).map(normaliseRow);
                setS({ loading: false, failed: false, rows, truncated: rows.length >= 1000 });
            });
        return () => { alive = false; };
    }, []);
    return s;
}

// ── The scatter ──────────────────────────────────────────────
const W = 760, H = 420, L = 54, R = 744, T = 18, B = 368;

function radiusOf(r) {
    if (r.held) return 4 + Math.min(Math.sqrt(Math.max(r.weightPct || 0, 0)) * 2.4, 9);
    if (isNum(r.advUsd) && r.advUsd > 0) return 2.2 + Math.min(Math.log10(r.advUsd) - 5, 4) * 0.7;
    return 2.4;
}

function fillOf(r, q) {
    if (r.held) return '#22d3ee';
    if (r.isLevered) return '#f59e0b';
    if (r.isInverse) return '#a78bfa';
    if (q === 'diversifier') return '#22c55e';
    return '#64748b';
}

function Scatter({ rows, centroid, ext, onPick, selected }) {
    if (!ext) {
        return e('div', { className: 'nbmap-empty' },
            'Nothing can be placed. Both axes are needed for a point, and no row carries them.');
    }
    const x = (v) => L + ((v - ext.x0) / (ext.x1 - ext.x0)) * (R - L);
    const y = (v) => B - ((v - ext.y0) / (ext.y1 - ext.y0)) * (B - T);

    const cx = centroid ? x(centroid.rhoToBook) : null;
    const cy = centroid ? y(centroid.volAnnual) : null;
    const held = rows.filter((r) => r.held);
    const rest = rows.filter((r) => !r.held);

    const tick = (v, fmt) => e('text', { key: 'x' + v, x: x(v), y: 386, textAnchor: 'middle' }, fmt(v));
    const xticks = [-0.4, -0.2, 0, 0.2, 0.4].filter((v) => v >= ext.x0 && v <= ext.x1);
    const yticks = [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5].filter((v) => v <= ext.y1);

    const dot = (r) => {
        const q = quadrantOf(r, centroid);
        const on = selected && selected.symbol === r.symbol;
        return e('g', {
            key: r.symbol, className: 'nbmap-node' + (on ? ' is-on' : ''),
            onClick: () => onPick(r), role: 'button', tabIndex: 0,
            onKeyDown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(r); } },
        },
            e('circle', {
                cx: x(r.rhoToBook), cy: y(r.volAnnual), r: radiusOf(r) + (on ? 3 : 0),
                fill: fillOf(r, q), fillOpacity: r.held ? 0.2 : 0.5,
                stroke: fillOf(r, q), strokeWidth: r.held ? 1.6 : (on ? 1.6 : 0),
            }, e('title', null,
                `${r.symbol}${r.name ? ' · ' + r.name : ''}\n`
                + `ρ to book ${r.rhoToBook.toFixed(3)} · vol ${pct(r.volAnnual, 0)}`
                + (r.held ? `\nheld ${r.weightPct != null ? r.weightPct.toFixed(2) + '% of book' : ''}` : '')
                + (r.isLevered ? '\nlevered — plotted, never ranked' : r.isInverse ? '\ninverse — negatively correlated by construction' : ''))),
            // 2.5%, not 1.5%: at 1.5% thirty of the book's names label and the
            // dense centre becomes unreadable overlap. Seven do at 2.5%.
            (r.held && (r.weightPct || 0) >= 2.5) || on
                ? e('text', {
                    x: x(r.rhoToBook), y: y(r.volAnnual) - radiusOf(r) - 5,
                    textAnchor: 'middle', className: 'nbmap-lbl',
                }, r.symbol) : null);
    };

    return e('svg', {
        className: 'nbmap-svg', viewBox: `0 0 ${W} ${H}`, role: 'img',
        'aria-label': 'Scatter of the book and its candidate universe, correlation to the book against annualised volatility',
    },
        // Quadrant wash, anchored on the BOOK's centre rather than on zero.
        centroid ? e('g', null,
            e('rect', { x: L, y: cy, width: cx - L, height: B - cy, fill: '#22c55e', fillOpacity: 0.045 }),
            e('line', { x1: cx, y1: T, x2: cx, y2: B, stroke: 'rgba(34,211,238,.35)', strokeDasharray: '4 4' }),
            e('line', { x1: L, y1: cy, x2: R, y2: cy, stroke: 'rgba(34,211,238,.35)', strokeDasharray: '4 4' }),
            e('text', { x: cx + 6, y: T + 11, className: 'nbmap-cn' }, 'BOOK CENTRE'))
            : null,
        e('g', { stroke: 'rgba(255,255,255,.07)' },
            e('line', { x1: L, y1: T, x2: L, y2: B }),
            e('line', { x1: L, y1: B, x2: R, y2: B })),
        e('g', { className: 'nbmap-ax' },
            xticks.map((v) => tick(v, (n) => n.toFixed(1))),
            yticks.map((v) => e('text', { key: 'y' + v, x: L - 8, y: y(v) + 3, textAnchor: 'end' }, (v * 100).toFixed(0) + '%')),
            e('text', { x: (L + R) / 2, y: 406, textAnchor: 'middle', className: 'nbmap-axt' },
                'CORRELATION TO THE BOOK  ·  less like what you own ← → more like it'),
            e('text', { x: 14, y: (T + B) / 2, transform: `rotate(-90 14 ${(T + B) / 2})`, textAnchor: 'middle', className: 'nbmap-axt' },
                'ANNUALISED VOLATILITY')),
        // Unheld first so the book always draws on top of its universe.
        e('g', null, rest.map(dot)),
        e('g', null, held.map(dot)));
}

// ── The drawer ───────────────────────────────────────────────
function useBookImpact(row, sizePct) {
    const [s, setS] = useState({ loading: true });
    const symbol = row ? row.symbol : null;

    useEffect(() => {
        if (!symbol) return undefined;
        let alive = true;
        setS({ loading: true });
        (async () => {
            const book = await tradeData.loadBook();
            if (!alive) return;
            const cover = (book.positions || []).map((p) => p.symbol).concat([symbol]);
            const risk = await tradeData.loadRiskLayer({ symbols: cover });
            if (!alive) return;
            setS({ loading: false, book, risk });
        })().catch((err) => {
            console.error('[nexus] book impact inputs failed:', err && err.message, err);
            if (alive) setS({ loading: false, failed: true });
        });
        return () => { alive = false; };
    }, [symbol]);

    return useMemo(() => {
        if (s.loading || s.failed || !row) return s;
        const equity = s.book && s.book.account ? Number(s.book.account.equity) : null;
        const price = row.lastClose;
        if (!isNum(equity) || !isNum(price) || price <= 0) {
            return { loading: false, failed: true, reason: 'no equity or no last close on file' };
        }
        const notional = equity * (sizePct / 100);
        const impact = computeBookImpact({
            symbol: row.symbol,
            positions: s.book.positions || [],
            equity,
            account: s.book.account,
            price,
            deltaQty: notional / price,
            rho: s.risk.rho,
            vols: s.risk.vols,
            betas: s.risk.betas,
            clusters: s.risk.clusters,
            sectorOf: (sym) => {
                const p = (s.book.positions || []).find((q) => q.symbol === sym);
                return p ? p.sector : (sym === row.symbol ? row.sector : null);
            },
        });
        return { loading: false, impact, equity, notional, risk: s.risk };
    }, [s, row, sizePct]);
}

const SIZES = [0.5, 1, 2, 3];

function Drawer({ row, centroid, peers, onClose }) {
    const [sizePct, setSizePct] = useState(1);
    const res = useBookImpact(row, sizePct);
    const closeRef = useRef(null);

    useEffect(() => {
        const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        if (closeRef.current) closeRef.current.focus();
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const imp = res.impact;
    const r = imp ? imp.risk : null;
    const measurable = r ? covarianceIsMeasurable(r) : false;

    return e('div', { className: 'nbmap-drawer', role: 'dialog', 'aria-label': 'Candidate ' + row.symbol },
        e('div', { className: 'nbmap-dh' },
            e('div', null,
                e('span', { className: 'nbmap-dtk' }, row.symbol),
                row.held ? e('span', { className: 'nbmap-badge is-held' }, 'IN THE BOOK') : null,
                row.isLevered ? e('span', { className: 'nbmap-badge is-lev' }, 'LEVERED') : null,
                row.isInverse ? e('span', { className: 'nbmap-badge is-inv' }, 'INVERSE') : null),
            e('button', { ref: closeRef, className: 'nbmap-x', onClick: onClose, 'aria-label': 'Close' }, '×')),
        row.name ? e('div', { className: 'nbmap-dn' }, row.name, row.sector ? ' · ' + row.sector : '') : null,

        e('p', { className: 'nbmap-line' }, candidateLine(row, centroid)),

        // ── What it is ────────────────────────────────────────
        e('div', { className: 'nbmap-sec' }, 'THE NAME'),
        e('div', { className: 'nbmap-grid' },
            e(Fact, { k: 'ρ to book', v: isNum(row.rhoToBook) ? sign(row.rhoToBook.toFixed(3)) : null }),
            e(Fact, { k: 'Closest held name', v: isNum(row.maxRhoToBook) ? 'ρ ' + sign(row.maxRhoToBook.toFixed(2)) : null }),
            e(Fact, { k: 'Annualised vol', v: pct(row.volAnnual, 0) }),
            e(Fact, { k: 'Beta to SPY', v: isNum(row.betaSpy) ? sign(row.betaSpy.toFixed(2)) : null }),
            e(Fact, { k: 'ADV', v: big(row.advUsd) }),
            e(Fact, { k: 'Last close', v: money(row.lastClose, 2), sub: row.lastPriceDate }),
            e(Fact, { k: 'Sessions observed', v: isNum(row.obsDays) ? String(row.obsDays) : null }),
            e(Fact, { k: 'Risk cluster', v: row.clusterLabel || (row.clusterId != null ? '#' + row.clusterId : null) })),
        peers && peers.length
            ? e('div', { className: 'nbmap-peers' },
                e('span', { className: 'nbmap-pk' }, 'Held names in the same cluster'),
                peers.map((p) => e('span', { className: 'nbmap-peer', key: p.symbol },
                    p.symbol, e('i', null, isNum(p.weightPct) ? p.weightPct.toFixed(1) + '%' : ''))))
            : row.clusterId != null
                ? e('div', { className: 'nbmap-note' }, 'No held name sits in this risk cluster.')
                : null,

        // ── What it would do ──────────────────────────────────
        e('div', { className: 'nbmap-sec' }, 'WHAT ADDING IT WOULD DO'),
        e('div', { className: 'nbmap-sizes' },
            e('span', { className: 'nbmap-pk' }, 'Size'),
            SIZES.map((s) => e('button', {
                key: s, className: 'nbmap-size' + (s === sizePct ? ' is-on' : ''),
                onClick: () => setSizePct(s),
            }, s + '%')),
            res.notional ? e('span', { className: 'nbmap-nom' }, money(res.notional)) : null),

        res.loading
            ? e('div', { className: 'nbmap-note' }, 'Reading the book and its correlation matrix…')
            : res.failed
                ? e('div', { className: 'nbmap-absent' },
                    e('b', null, 'CANNOT MODEL THIS ADD'),
                    res.reason || 'The book or the correlation snapshot did not answer.')
                : e('div', null,
                    e('div', { className: 'nbmap-grid' },
                        e(Delta, { k: 'Weight of equity', a: imp.position.weightOfEquityBefore, b: imp.position.weightOfEquityAfter, fmt: (v) => pct(v, 2) }),
                        e(Delta, { k: 'Correlated cluster weight', a: imp.effectiveExposure.clusterWeightBefore, b: imp.effectiveExposure.clusterWeightAfter, fmt: (v) => pct(v, 1) }),
                        e(Delta, { k: 'Top-5 weight', a: imp.concentration.before.top5Weight, b: imp.concentration.after.top5Weight, fmt: (v) => pct(v, 1) }),
                        e(Delta, { k: 'Portfolio beta', a: imp.risk.betaBefore, b: imp.risk.betaAfter, fmt: (v) => (isNum(v) ? sign(v.toFixed(2)) : '—') })),

                    // The risk block shares Pane B's gate, because it is the
                    // same matrix. A vol computed with missing pairs filled at
                    // rho 0 is the diversified-away floor, not this book.
                    e('div', { className: 'nbmap-sec2' }, 'RISK'),
                    // These are weights of EQUITY, not of portfolio value. On a
                    // levered book that is a different number for the same book
                    // -- 30.5% here against vw_book_mctr's 19.4%, which is the
                    // 1.7x gross leverage and not a disagreement. Saying so is
                    // the whole of the fix; reconciling them silently would be
                    // the mixed-basis failure.
                    isNum(imp.margin.grossLeverage) && imp.margin.grossLeverage > 1.02
                        ? e('div', { className: 'nbmap-note', style: { margin: '0 0 6px' } },
                            `On weights of EQUITY at ${imp.margin.grossLeverage.toFixed(2)}\u00d7 gross. `
                            + 'The Risk page weights by portfolio value, so its book vol is the same '
                            + 'measurement divided by that leverage \u2014 not a different answer.')
                        : null,
                    measurable
                        ? e('div', { className: 'nbmap-grid' },
                            e(Delta, { k: 'Portfolio vol', a: imp.risk.currentVol, b: imp.risk.resultingVol, fmt: (v) => pct(v, 2) }),
                            e(Fact, { k: 'Incremental vol', v: isNum(imp.risk.incrementalVol) ? (imp.risk.incrementalVol > 0 ? '+' : '') + pct(imp.risk.incrementalVol, 3) : null }),
                            e(Fact, { k: 'MCTR of the position', v: pct(imp.risk.mctrPositionPct, 1) }),
                            e(Fact, { k: 'Incremental 95% 1d VaR', v: isNum(imp.risk.incrementalVaR) ? money(imp.risk.incrementalVaR) : null, sub: imp.risk.incrementalVaR < 0 ? 'the add lowers the bound' : null }))
                        : e('div', { className: 'nbmap-absent' },
                            e('b', null, 'NOT MEASURABLE · COVARIANCE MATRIX INCOMPLETE'),
                            coverageSentence(imp.risk)),
                    measurable && isNum(imp.risk.incrementalVol)
                        ? e('p', { className: 'nbmap-verdict' },
                            imp.risk.incrementalVol < 0
                                ? `At ${sizePct}% this LOWERS book volatility by ${pct(Math.abs(imp.risk.incrementalVol), 3)} — it offsets more than it adds.`
                                : `At ${sizePct}% this adds ${pct(imp.risk.incrementalVol, 3)} of book volatility.`)
                        : null),

        e('div', { className: 'nbmap-foot' },
            'Correlations and volatility are a 120-session estimate as at ',
            row.asOfDate || 'the latest snapshot',
            '. The book impact is computed live off the current positions, so the two are different vintages and are not reconciled.'));
}

function Fact({ k, v, sub }) {
    return e('div', { className: 'nbmap-f' },
        e('span', { className: 'nbmap-fk' }, k),
        v == null || v === '—'
            // Absent is a named state, not a dash in a slot that looks like
            // every other slot.
            ? e('span', { className: 'nbmap-fv is-absent' }, 'not on file')
            : e('span', { className: 'nbmap-fv' }, v),
        sub ? e('span', { className: 'nbmap-fs' }, sub) : null);
}

function Delta({ k, a, b, fmt }) {
    const moved = isNum(a) && isNum(b) && Math.abs(b - a) > 1e-9;
    return e('div', { className: 'nbmap-f' },
        e('span', { className: 'nbmap-fk' }, k),
        e('span', { className: 'nbmap-fv' },
            fmt(a), e('i', { className: 'nbmap-arrow' }, '→'),
            e('b', { className: moved ? 'is-moved' : '' }, fmt(b))));
}

// ── The map ──────────────────────────────────────────────────
export function NexusBookMap() {
    const data = useMapRows();
    const [facets, setFacets] = useState(() => new Set());
    const [sectors, setSectors] = useState(() => new Set());
    const [search, setSearch] = useState('');
    const [picked, setPicked] = useState(null);

    const rows = data.rows || [];
    const place = useMemo(() => placement(rows), [rows]);
    const centroid = useMemo(() => bookCentroid(place.placed), [place]);
    const shown = useMemo(() => applyMapFilters(place.placed, { facets, sectors, search }),
        [place, facets, sectors, search]);
    const ext = useMemo(() => extents(shown.length ? shown : place.placed), [shown, place]);
    const ranking = useMemo(() => rankCandidates(place.placed), [place]);
    const counts = useMemo(() => facetCounts(place.placed), [place]);
    const secs = useMemo(() => sectorOptions(place.placed), [place]);

    const peers = useMemo(() => {
        if (!picked || picked.clusterId == null) return [];
        return place.placed.filter((r) => r.held && r.clusterId === picked.clusterId && r.symbol !== picked.symbol)
            .sort((a, b) => (b.weightPct || 0) - (a.weightPct || 0));
    }, [picked, place]);

    const toggle = useCallback((setter, key) => setter((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    }), []);

    if (data.loading) return e('div', { className: 'nbmap-note' }, 'Building the map…');
    if (data.failed) {
        return e('div', { className: 'nbmap-absent' },
            e('b', null, 'MAP UNAVAILABLE'),
            data.unconfigured
                ? 'No Supabase connection is configured in this build, so the map was never asked for.'
                : 'The candidate map feed did not answer. That is a statement about the connection, not about the universe.');
    }

    return e('div', { className: 'nbmap' },
        e('div', { className: 'nbmap-bar' },
            counts.map((c) => e('button', {
                key: c.key, className: 'nbmap-facet' + (facets.has(c.key) ? ' is-on' : ''),
                onClick: () => toggle(setFacets, c.key),
            }, e('b', null, c.count), c.label)),
            e('input', {
                className: 'nbmap-search', value: search, placeholder: 'Ticker or name…',
                onChange: (ev) => setSearch(ev.target.value), 'aria-label': 'Search the map',
            }),
            secs.length > 1
                ? e('select', {
                    className: 'nbmap-sel', 'aria-label': 'Sector',
                    value: sectors.size === 1 ? [...sectors][0] : '',
                    onChange: (ev) => setSectors(ev.target.value ? new Set([ev.target.value]) : new Set()),
                },
                    e('option', { value: '' }, 'All sectors'),
                    secs.map((s) => e('option', { key: s.label, value: s.label }, `${s.label} (${s.count})`)))
                : null),

        e('div', { className: 'nbmap-body' },
            e('div', { className: 'nbmap-plot' },
                e(Scatter, { rows: shown, centroid, ext, onPick: setPicked, selected: picked }),
                e('div', { className: 'nbmap-legend' },
                    e(Key, { c: '#22d3ee', t: 'in the book · area = weight' }),
                    e(Key, { c: '#22c55e', t: 'less correlated and quieter than the book' }),
                    e(Key, { c: '#f59e0b', t: 'levered' }),
                    e(Key, { c: '#a78bfa', t: 'inverse' }),
                    e('span', { className: 'nbmap-k' }, 'unheld radius = ADV')),
                e('p', { className: 'nbmap-scope' },
                    `${shown.length} of ${place.placed.length} placed`,
                    place.heldWithheldSymbols.length
                        ? ` · ${place.heldWithheldSymbols.join(', ')} held but not placed `
                          + `(${place.heldWithheldWeightPct.toFixed(2)}% of book): `
                          + place.heldWithheldSymbols.map((sym) => {
                              const w = place.withheld.find((r) => r.symbol === sym);
                              return ABSENCE_TEXT[w && w.absenceReason] || 'not measurable';
                          }).join('; ')
                        : '',
                    '. The universe is the names the correlation snapshot covers — about 420 of a ~1,500-name book universe — not every listed stock.')),

            picked
                ? e(Drawer, { row: picked, centroid, peers, onClose: () => setPicked(null) })
                : e('div', { className: 'nbmap-side' },
                    e('div', { className: 'nbmap-sec', style: { marginTop: 0 } }, 'LEAST LIKE WHAT YOU OWN'),
                    ranking.ranked.length
                        ? e('div', null, ranking.ranked.map((r) => e('button', {
                            key: r.symbol, className: 'nbmap-rank', onClick: () => setPicked(r),
                        },
                            e('span', { className: 'nbmap-rtk' }, r.symbol),
                            // 3dp, not 2: this list is SORTED on rho, and at
                            // 2dp five consecutive rows read -0.02, so the
                            // ordering reads as arbitrary. A sort key has to be
                            // rendered at a precision that can express the sort.
                            e('span', { className: 'nbmap-rr' }, 'ρ ' + r.rhoToBook.toFixed(3)),
                            e('span', { className: 'nbmap-rv' }, pct(r.volAnnual, 0)))))
                        : e('div', { className: 'nbmap-note' }, 'No candidate is rankable today.'),
                    e('p', { className: 'nbmap-note' },
                        `${ranking.excludedCount} plotted names are held out of this ranking — `,
                        `${ranking.excludedLevered} levered, ${ranking.excludedInverse} inverse, `,
                        `${ranking.excludedNoBeta} with no beta on file. `,
                        'An inverse fund is negatively correlated by construction and a levered one takes a '
                        + 'levered share of any move, so ranking on ρ alone would grade leverage. '
                        + 'They stay on the map.'),
                    e('p', { className: 'nbmap-note' },
                        'Click any point for what adding it would do to the book.'))));
}

function Key({ c, t }) {
    return e('span', { className: 'nbmap-k' },
        e('span', { className: 'nbmap-dot', style: { background: c } }), t);
}

export default NexusBookMap;
