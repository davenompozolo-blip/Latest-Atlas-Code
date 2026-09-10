// ============================================================
// ATLAS Nexus — intermarket axis state (A2)
// ------------------------------------------------------------
// Three things and no more: where each axis sits, what the book's
// exposure to it is, and whether the axes agree. No regime label, no
// composite score, nothing predictive.
//
// Every axis, pair, sign, label and ordering on this panel comes out of
// the database. There is no axis list in this file. All transforms are
// pure and live in nexusAxesCompute.js.
// ============================================================

import React from 'react';
import { supabase } from '../../lib/supabase.js';
import {
    buildAxisRows, dispersionState, vintage, axisRead, exposureLabel,
    latestEstimateSet, readBlockEnabled, QUIET_SIGMA,
} from './nexusAxesCompute.js';

const { useState, useEffect, useMemo } = React;
const e = React.createElement;

// 90 sessions of scores per axis is enough for a 60-point sparkline with
// slack. Bounded and ordered DESC on purpose: `limit` is a request, not a
// guarantee, and PostgREST caps at 1,000 rows whatever it says — so if
// this ever truncates it must lose the OLDEST rows, never the current
// session. Handed back ascending because the sparkline walks it in time
// order. (Three separate instances of that cap are recorded in CLAUDE.md.)
const SCORE_SESSIONS = 90;

function useAxisData() {
    const [s, setS] = useState({ loaded: false, axes: [], loadings: [], scores: [], betas: [], sessions: [] });

    useEffect(function () {
        let alive = true;
        if (!supabase) { setS(p => ({ ...p, loaded: true })); return; }

        Promise.all([
            supabase.from('factor_axes')
                .select('axis_key,label,pc_rank,variance_explained,marginal,positive_means,pc_sign_flipped'),
            supabase.from('factor_axis_loadings').select('axis_key,pair_key,loading'),
            supabase.from('factor_axis_scores')
                .select('date,axis_key,score,score_20d,score_60d,pairs_used')
                .order('date', { ascending: false })
                .limit(SCORE_SESSIONS * 8),
            supabase.from('book_factor_betas')
                .select('factor,beta,std_error,t_stat,significant,window_start,window_end,n_obs,r_squared,estimated_at')
                .order('estimated_at', { ascending: false })
                .limit(200),
            // SPY's own bars are the trading calendar: the series close and
            // the session spine staleness is measured against. A calendar
            // comparison would call a Saturday stale.
            supabase.from('market_prices')
                .select('date').eq('symbol', 'SPY')
                .order('date', { ascending: false }).limit(20),
        ]).then(([ax, ld, sc, bt, mp]) => {
            if (!alive) return;
            const fail = [ax, ld, sc, bt, mp].find(r => r && r.error);
            if (fail) {
                // Never let a transport failure render as a statement about
                // the data — the panel says the feed did not answer.
                console.error('[ATLAS] axis panel read failed:', fail.error && fail.error.message);
                setS({ loaded: true, failed: true, axes: [], loadings: [], scores: [], betas: [], sessions: [] });
                return;
            }
            setS({
                loaded: true,
                failed: false,
                axes: ax.data || [],
                loadings: ld.data || [],
                scores: (sc.data || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))),
                betas: bt.data || [],
                sessions: (mp.data || []).map(r => r.date),
            });
        });
        return () => { alive = false; };
    }, []);

    return s;
}

// ── Sparkline over the daily score ───────────────────────────
function Spark({ vals, color, w = 104, h = 24 }) {
    if (!vals || vals.length < 2) return null;
    const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
    const step = w / (vals.length - 1);
    const d = vals.map((v, i) => (i ? 'L' : 'M') + (i * step).toFixed(1) + ' '
        + (2 + (h - 4) * (1 - (v - min) / span)).toFixed(1)).join(' ');
    const zeroY = 2 + (h - 4) * (1 - (0 - min) / span);
    return e('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, 'aria-hidden': true, className: 'na-spark' },
        zeroY >= 0 && zeroY <= h
            ? e('line', { x1: 0, y1: zeroY, x2: w, y2: zeroY, stroke: 'rgba(255,255,255,.13)', strokeWidth: 1 })
            : null,
        e('path', { d, fill: 'none', stroke: color, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', opacity: 0.9 }));
}

const sigma = v => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + 'σ');
const pct = v => (v == null ? '—' : (v * 100).toFixed(1) + '%');
const signed = (v, dp) => (v == null ? '—' : (v < 0 ? '−' : '+') + Math.abs(v).toFixed(dp));
const pairLabel = k => String(k || '').split('_').map(p => p.toUpperCase()).join('/');

function AxisRow({ row, history }) {
    const measured = row.exposure.measured;
    const tone = row.score20d == null ? 'flat' : row.score20d > 0 ? 'up' : 'down';
    const colour = row.score20d == null ? 'var(--text3)'
        : Math.abs(row.score20d) >= QUIET_SIGMA ? '#3ad6e0' : 'var(--text2)';

    return e('div', { className: 'na-row' },
        // Identity
        e('div', { className: 'na-id' },
            e('div', { className: 'na-key' },
                row.axisKey,
                row.marginal
                    // §3: dollar cleared the Marchenko-Pastur edge by little
                    // AND carries the second-largest exposure. That
                    // combination belongs on the face of the panel.
                    ? e('span', {
                        className: 'na-marginal',
                        title: 'Marginal axis — cleared the Marchenko-Pastur edge by a small margin',
                    }, 'marginal')
                    : null),
            e('div', { className: 'na-var' }, pct(row.varianceExplained) + ' of variance'),
            // Direction is stated, never inferred from the key.
            e('div', { className: 'na-means' }, '↑ ' + (row.positiveMeans || '—'))),

        // Market state
        e('div', { className: 'na-market' },
            e('div', { className: 'na-scores' },
                e('span', { className: 'na-s20 tone-' + tone, style: { color: colour } }, sigma(row.score20d)),
                e('span', { className: 'na-slab' }, '20d'),
                e('span', { className: 'na-s60' }, sigma(row.score60d)),
                e('span', { className: 'na-slab' }, '60d')),
            e(Spark, { vals: history, color: colour })),

        // Book exposure — the one rule that matters
        e('div', { className: 'na-exposure' },
            measured
                ? e(React.Fragment, null,
                    e('span', { className: 'na-beta' }, signed(row.exposure.beta, 6)),
                    e('span', { className: 'na-t' }, 't ' + signed(row.exposure.tStat, 2)))
                : e('span', {
                    className: 'na-none',
                    title: row.exposure.tStatWhenUnmeasured != null
                        ? 't = ' + row.exposure.tStatWhenUnmeasured.toFixed(2) + ' — not distinguishable from zero'
                        : 'no estimate in the latest set',
                }, exposureLabel(row)),
            !measured && row.exposure.tStatWhenUnmeasured != null
                ? e('span', { className: 'na-t' }, 't ' + signed(row.exposure.tStatWhenUnmeasured, 2))
                : null),

        // The pairs under the axis, signed
        e('div', { className: 'na-pairs' },
            row.pairs.slice(0, 6).map(p => e('span', {
                key: p.pairKey,
                className: 'na-pair ' + (p.loading < 0 ? 'neg' : 'pos'),
                title: 'loading ' + signed(p.loading, 3),
            }, (p.loading < 0 ? '−' : '+') + pairLabel(p.pairKey)))));
}

function NexusAxesPanel() {
    const d = useAxisData();

    const model = useMemo(() => {
        if (!d.loaded || d.failed) return null;
        const rows = buildAxisRows({ axes: d.axes, loadings: d.loadings, scores: d.scores, betas: d.betas });
        const est = latestEstimateSet(d.betas);
        const scoreDate = d.scores.length ? d.scores[d.scores.length - 1].date : null;
        const v = vintage({
            seriesClose: d.sessions[0] || null,
            scoreDate,
            estimate: est,
            sessions: d.sessions,
        });
        // §5: a stale panel suppresses the state rather than presenting an
        // old one as current.
        const disp = v.stale ? null : dispersionState(rows);
        const hist = {};
        for (const s of d.scores) (hist[s.axis_key] = hist[s.axis_key] || []).push(Number(s.score));
        return { rows, est, vintage: v, disp, hist };
    }, [d]);

    if (!d.loaded) return e('div', { className: 'nf-card nf-fade' }, e('div', { className: 'na-empty' }, 'Loading axis state…'));

    if (d.failed) {
        return e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Intermarket axes')),
            e('div', { className: 'na-empty' }, 'The factor feed did not answer. This is a transport failure, not a reading about the market.'));
    }
    if (!model || !model.rows.length) {
        return e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Intermarket axes')),
            e('div', { className: 'na-empty' }, 'No axes defined.'));
    }

    const { rows, vintage: v, disp, hist } = model;
    const read = readBlockEnabled() ? axisRead(rows, disp) : null;

    return e('div', { className: 'nf-card nf-fade na-card' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Intermarket axes'),
            e('span', { className: 'nf-sub' }, 'axis state, book exposure, and whether the axes agree')),

        // §5 stale banner
        v.stale
            ? e('div', { className: 'na-stale' },
                e('strong', null, 'Scores are stale. '),
                v.staleReason + '. The cross-axis state is withheld rather than computed on old numbers.')
            : null,

        e('div', { className: 'na-head' },
            e('span', null, 'axis'), e('span', null, 'market state'),
            e('span', null, 'book exposure'), e('span', null, 'pairs')),

        rows.map(r => e(AxisRow, { key: r.axisKey, row: r, history: (hist[r.axisKey] || []).slice(-60) })),

        // §4 dispersion — a state, never a score
        e('div', { className: 'na-disp' },
            e('div', { className: 'na-disp-l' }, 'Cross-axis'),
            disp
                ? e(React.Fragment, null,
                    e('span', { className: 'na-disp-v st-' + disp.state }, disp.label),
                    e('span', { className: 'na-disp-n' },
                        disp.note,
                        disp.excluded.length ? ' · excludes ' + disp.excluded.join(', ') + ' (marginal)' : '',
                        disp.twoWay ? ' · two-way comparison, not a consensus' : ''))
                : e('span', { className: 'na-disp-n' }, 'withheld while the scores are stale')),

        // §5 vintage — three separate dates, all visible
        e('div', { className: 'na-vintage' },
            e('span', null, 'series close ', e('b', null, v.seriesClose || '—')),
            e('span', null, 'score date ', e('b', null, v.scoreDate || '—')),
            e('span', null, 'beta window to ', e('b', null, v.betaWindowEnd || '—'), ' · n=', e('b', null, v.nObs != null ? v.nObs : '—'))),

        // Stated once, on the panel, not per row.
        e('div', { className: 'na-foot' },
            'Exposures are contemporaneous — same-day co-movement over the estimation window. Nothing here is predictive.'),

        read
            ? e('div', { className: 'na-read' },
                e('div', { className: 'na-read-t' }, 'The coherence read'),
                read.lines.map((l, i) => e('div', { className: 'na-read-l', key: i }, l)),
                e('div', { className: 'na-read-d' }, read.derivation))
            : null);
}

export default NexusAxesPanel;
