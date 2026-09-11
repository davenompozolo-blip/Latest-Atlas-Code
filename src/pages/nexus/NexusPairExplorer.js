// ============================================================
// ATLAS Nexus — pair explorer (A2.2)
// ------------------------------------------------------------
// A2 shipped the axis layer with nothing beneath it: the panel said
// eleven pairs are three things and offered no way to look at a pair.
// This is the floor under it.
//
// Everything structural comes from the database. There is no pair list,
// no leg list and NO PAIR-TO-AXIS MAP in this file — the grouping is
// derived from factor_axis_loadings in nexusPairsCompute.js, which is
// asserted in nexusPairsCompute.test.mjs against axis keys that do not
// exist live.
// ============================================================

import React from 'react';
import * as LC from 'lightweight-charts';
import { supabase } from '../../lib/supabase.js';
import { CHART_COL, useLwChart } from './nexusChart.js';
import {
    groupPairsByAxis, alignedWindow, buildSeries, metricTiles, pairRead,
} from './nexusPairsCompute.js';

const { useState, useEffect, useMemo, useRef } = React;
const e = React.createElement;

const WINDOW_SESSIONS = 60;
const BENCHMARK = 'SPY';
// Enough calendar to cover 60 sessions with slack for holidays.
const LOOKBACK_DAYS = 130;

// The three data lines take the house chart palette so this panel and the
// Board read as one system. SPY is the exception and stays an explicit
// neutral: it is not decoration -- it is what lets the read establish
// whether either leg is actually beating the market, so it has to be
// legible. A CSS variable resolved almost to the background here, and the
// house `dim` is darker still; this grey is heavy enough to follow and cool
// enough not to compete with the three data lines.
const COLOR = { num: CHART_COL.cyan, den: CHART_COL.amber, ratio: CHART_COL.green, bench: '#8b93a1' };

const CHART_H = 250;

// PostgREST caps at 1,000 rows whatever `limit` says. 60 sessions across 17
// symbols is ~1,020 — over the cap by a hair, which is exactly how this
// codebase has been bitten four times. Page with .range(), and order DESC so
// a truncation would lose the OLDEST rows rather than the current session.
async function fetchPricesPaged(symbols, sinceIso) {
    const out = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('market_prices')
            .select('symbol,date,adj_close')
            .in('symbol', symbols)
            .gte('date', sinceIso)
            .order('date', { ascending: false })
            .range(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < PAGE) break;
    }
    return out;
}

function usePairData() {
    const [s, setS] = useState({ loaded: false });

    useEffect(function () {
        let alive = true;
        if (!supabase) { setS({ loaded: true, failed: true }); return; }

        (async () => {
            const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10);
            const [pairs, loadings, axes] = await Promise.all([
                supabase.from('ratio_pairs').select('pair_key,numerator_symbol,denominator_symbol,thesis,caveats'),
                supabase.from('factor_axis_loadings').select('axis_key,pair_key,loading'),
                supabase.from('factor_axes').select('axis_key,label,pc_rank,marginal,positive_means'),
            ]);
            const bad = [pairs, loadings, axes].find(r => r && r.error);
            if (bad) throw bad.error;

            const syms = new Set([BENCHMARK]);
            for (const p of pairs.data || []) { syms.add(p.numerator_symbol); syms.add(p.denominator_symbol); }
            const prices = await fetchPricesPaged([...syms], since);

            const bySymbol = {};
            for (const r of prices) {
                if (r.adj_close == null) continue;
                (bySymbol[r.symbol] = bySymbol[r.symbol] || {})[r.date] = Number(r.adj_close);
            }
            if (!alive) return;
            setS({ loaded: true, failed: false, pairs: pairs.data || [], loadings: loadings.data || [], axes: axes.data || [], bySymbol });
        })().catch(err => {
            // Never let a transport failure render as a statement about the
            // market. The panel says the feed did not answer.
            console.error('[ATLAS] pair explorer read failed:', err && err.message);
            if (alive) setS({ loaded: true, failed: true });
        });

        return () => { alive = false; };
    }, []);

    return s;
}

// ── Chart ────────────────────────────────────────────────────
// lightweight-charts (v5), the same scaffold the Board and the perf panels
// use, so this panel carries real axes: dates along the bottom, percent up
// the side. The hand-rolled SVG it replaces had neither, which left the
// reader with four lines and no way to say when anything happened or how
// far it moved.
//
// THE SERIES ARE PLOTTED AS PERCENT FROM THE FIRST SESSION, not as an
// index. buildSeries rebases to 100, so `rebased - 100` IS that percent --
// (v/v0)*100 - 100 = (v/v0 - 1)*100 -- with no second normalisation and no
// change to the compute module. It also puts the baseline on 0, which is
// the only value a percent axis can honestly anchor to; a dashed line at
// 100 reads as a level, and a reader cannot tell a level from a move.
const fmtPct = v => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + '%';

function Chart({ series, benchIsLeg }) {
    const ref = useRef(null);

    useLwChart(ref, function (chart) {
        // rebased[i] - 100 is the percent move from the window's first bar.
        const pts = arr => series.dates
            .map((t, i) => ({ time: t, value: (arr && arr[i] != null) ? arr[i] - 100 : null }))
            .filter(p => Number.isFinite(p.value));

        const add = (color, lineWidth, data) => {
            const s = chart.addSeries(LC.LineSeries, {
                color, lineWidth,
                // Four series would otherwise draw four dashed last-value
                // rules across the plot. The axis labels carry the same
                // information without the clutter.
                priceLineVisible: false,
                priceFormat: { type: 'custom', minMove: 0.01, formatter: fmtPct },
            });
            s.setData(data);
            return s;
        };

        // Benchmark first so the three data lines draw over it. In every
        // `X/SPY` pair the benchmark IS a leg, and drawing it again as a
        // reference puts two identical lines on the chart -- one hidden
        // under the other, and both in the legend under the same name.
        if (!benchIsLeg) add(COLOR.bench, 1, pts(series.benchRebased));
        add(COLOR.num, 2, pts(series.numRebased));
        add(COLOR.den, 2, pts(series.denRebased));
        // The ratio is the subject; it carries the heaviest stroke.
        const ratio = add(COLOR.ratio, 3, pts(series.ratioRebased));

        ratio.createPriceLine({
            price: 0, color: 'rgba(255,255,255,0.18)', lineWidth: 1, lineStyle: 2,
            axisLabelVisible: false,
        });
    }, [series, benchIsLeg], { height: CHART_H });

    if (!series || !series.dates.length) return null;
    return e('div', {
        className: 'np-chart', ref, role: 'img',
        'aria-label': 'Both legs and their ratio' + (benchIsLeg ? '' : ', with SPY')
            + ', as percent moved over ' + series.dates.length + ' sessions',
    });
}

const sgn = (v, dp = 1) => (v == null ? '—' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(dp));

function NexusPairExplorer() {
    const d = usePairData();
    const [selected, setSelected] = useState(null);

    const groups = useMemo(
        () => (d.loaded && !d.failed ? groupPairsByAxis({ pairs: d.pairs, loadings: d.loadings, axes: d.axes }) : []),
        [d]);

    const flat = useMemo(() => groups.flatMap(g => g.pairs), [groups]);
    const pair = flat.find(p => p.pairKey === selected) || flat[0] || null;

    const model = useMemo(() => {
        if (!pair || !d.bySymbol) return null;
        const win = alignedWindow({
            bySymbol: d.bySymbol, numerator: pair.numerator,
            denominator: pair.denominator, benchmark: BENCHMARK, sessions: WINDOW_SESSIONS,
        });
        const series = buildSeries(win);
        return series ? { win, series, tiles: metricTiles(series, pair, BENCHMARK), read: pairRead(series, pair, pair.axis, BENCHMARK) } : null;
    }, [pair, d]);

    if (!d.loaded) return e('div', { className: 'nf-card nf-fade' }, e('div', { className: 'na-empty' }, 'Loading pairs…'));
    if (d.failed) {
        return e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Pair explorer')),
            e('div', { className: 'na-empty' }, 'The pair feed did not answer. This is a transport failure, not a reading about the market.'));
    }
    if (!pair) {
        return e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Pair explorer')),
            e('div', { className: 'na-empty' }, 'No pairs defined.'));
    }

    const ax = pair.axis;
    const benchIsLeg = pair.numerator === BENCHMARK || pair.denominator === BENCHMARK;

    return e('div', { className: 'nf-card nf-fade np-card' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Pair explorer'),
            e('span', { className: 'nf-sub' }, 'a ratio moving tells you the spread moved — the legs tell you why')),

        // Chips, grouped by axis. The grouping keeps the three-axis structure
        // visible while browsing eleven pairs; a flat row teaches the opposite
        // of what A1 found.
        e('div', { className: 'np-groups' },
            groups.map(g => e('div', { className: 'np-group', key: g.axisKey || 'unassigned' },
                e('div', { className: 'np-group-h' },
                    g.label,
                    g.marginal ? e('span', { className: 'na-marginal' }, 'marginal') : null),
                e('div', { className: 'np-chips' },
                    g.pairs.map(p => e('button', {
                        key: p.pairKey,
                        className: 'np-chip' + (p.pairKey === pair.pairKey ? ' on' : ''),
                        onClick: () => setSelected(p.pairKey),
                        title: p.measures || '',
                    }, p.label)))))),

        // §3.3 header — name, then WHAT IT MEASURES, then axis and signed
        // loading. The thesis is read before the shape, not hidden in a
        // tooltip.
        e('div', { className: 'np-head' },
            e('div', { className: 'np-title' }, pair.label),
            e('div', { className: 'np-measures' }, pair.measures || 'no description on file'),
            e('div', { className: 'np-axis' },
                ax.unassigned
                    ? e('span', { className: 'np-unassigned' }, ax.reason)
                    : e(React.Fragment, null,
                        e('span', { className: 'np-axis-k' }, ax.axisKey),
                        e('span', { className: 'np-load' }, 'loading ' + sgn(ax.loading, 2)),
                        // Stated deviation: every pair loads on all three axes,
                        // and HYG/TLT's top two are 1% apart. Showing only the
                        // winner there would assert more than the data carries.
                        ax.nearTie && ax.runnerUp
                            ? e('span', { className: 'np-tie' },
                                'near tie with ' + ax.runnerUp.axisKey + ' ' + sgn(ax.runnerUp.loading, 2))
                            : null))),

        model
            ? e(React.Fragment, null,
                e(Chart, { series: model.series, benchIsLeg }),
                e('div', { className: 'np-legend' },
                    [['num', pair.numerator, COLOR.num], ['den', pair.denominator, COLOR.den],
                     ['ratio', 'ratio', COLOR.ratio],
                     ...(benchIsLeg ? [] : [['bench', BENCHMARK, COLOR.bench]])]
                        // Keyed by ROLE, not by symbol: were the benchmark ever
                        // listed alongside a leg of the same name, a symbol key
                        // would collide.
                        .map(([role, lab, c]) =>
                            e('span', { key: role, className: 'np-leg' },
                                e('i', { style: { background: c } }), lab))),
                e('div', { className: 'np-note' },
                    (benchIsLeg
                        ? 'Legs and ratio as percent moved from the first of '
                          + model.series.dates.length + ' sessions, on adjusted closes. '
                          + BENCHMARK + ' is a leg here, so it is not drawn twice.'
                        : 'Legs, ratio and ' + BENCHMARK + ' as percent moved from the first of '
                          + model.series.dates.length + ' sessions, on adjusted closes.')
                    + (model.win.truncated ? ' Window is short: only ' + model.series.dates.length
                        + ' sessions are present in all three series.' : '')),

                e('div', { className: 'np-tiles' },
                    model.tiles.map(t => e('div', { className: 'np-tile', key: t.key },
                        e('div', { className: 'np-tile-l' }, t.label),
                        e('div', {
                            className: 'np-tile-v' + (t.tone && t.value != null ? (t.value >= 0 ? ' up' : ' down') : ''),
                        }, t.value == null ? '—' : sgn(t.value) + '%')))),

                e('div', { className: 'np-read' },
                    e('div', { className: 'np-read-t' }, 'The read'),
                    model.read.unavailable
                        ? e('div', { className: 'na-empty' }, 'Not enough aligned history to read this pair.')
                        : e(React.Fragment, null,
                            e('p', { className: 'np-read-b' }, model.read.sentences.join(' ')),
                            e('div', { className: 'np-read-d' }, model.read.derivation))))
            : e('div', { className: 'na-empty' },
                'No aligned price history for ' + pair.label + ' and ' + BENCHMARK + ' in this window.'));
}

export default NexusPairExplorer;
