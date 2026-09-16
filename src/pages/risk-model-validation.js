// ============================================================
// F-3 — Risk § Model validation: "Does the risk model work?"
// ------------------------------------------------------------
// B5, both legs, plus the distribution the exception counts describe.
//
// The two legs answer different questions — is the tail SHAPE right
// (model leg) and is the SCALE right (book leg) — and a reader shown one
// number averages them into "the model is a bit off", which is false in
// both directions at once. So: two panels, headers stating the question.
//
// All three confidence levels render together, always. A view showing
// only 95% would certify the assumption the other two refute, which is
// the entire B5 finding. There is no collapsed or headline mode in this
// file and no code path that selects one level.
//
// Nothing here recomputes VaR, and no function is called from the
// browser: atlas_regime_cvar is 706–710 ms per axis against a 3 s anon
// cap. The panel reads var_backtest_runs and vw_var_backtest_distribution,
// both indexed table/view reads.
// ============================================================

import React from 'react';
import { Chart, registerables } from 'chart.js';

// Register here rather than relying on risk-v2.js having done it as an
// import side effect. That happens to hold when this section is mounted
// as a tab of that module, and breaks the moment it is mounted anywhere
// else -- which is how it failed first time under the render harness:
// `"category" is not a registered scale`. Chart.register is idempotent.
Chart.register(...registerables);
import { sb } from './config.js';
import { T, card, cardTitle } from './risk-tokens.js';
import {
    VAR_Z, confKey, latestRunSet, tailShapeRows, patternSentence,
    scaleChain, scaleClosing, normalOverlay, tailBinFlags, vintageAgrees,
} from './riskModelValidationCompute.js';

const { useState, useEffect, useRef, useMemo } = React;
const h = React.createElement;

// PostgREST caps at 1,000 rows whatever `limit` says — recorded in
// CLAUDE.md in three separate layers. var_backtest_runs grows by ~24 rows
// a night, so it will cross that cap. Page with .range() until a short
// page ends it, and order DESC so a truncation would lose the OLDEST
// vintages rather than the current one.
const PAGE = 500;

async function fetchAllRuns() {
    const out = [];
    for (let from = 0; ; from += PAGE) {
        const res = await sb.from('var_backtest_runs')
            .select('as_of,logic_version,leg,basis,axis_key,conf,n_obs,exceptions,'
                  + 'expected_exceptions,kupiec_lr,kupiec_reject_05,kupiec_reject_01,'
                  + 'sd_pred_daily,sd_realised_daily,sd_factor_window,sd_residual_window,'
                  + 'var_pred_daily,cvar_pred_daily,cvar_realised_daily,'
                  + 'window_start,window_end,betas_estimated_at')
            .order('as_of', { ascending: false })
            .range(from, from + PAGE - 1);
        if (res.error) throw res.error;
        const rows = res.data || [];
        out.push(...rows);
        if (rows.length < PAGE) break;
    }
    return out;
}

async function fetchDistribution() {
    const res = await sb.from('vw_var_backtest_distribution')
        .select('bin_lo,bin_hi,bin_mid,obs,n_obs,z_min,z_max,betas_estimated_at,cvar_as_of')
        .order('bin_lo', { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
}

// ── small presentational helpers ─────────────────────────────────────
const mono = { fontFamily: T.mono };

function SectionHead(props) {
    return h('div', { style: { marginBottom: 14 } },
        h('div', { style: { fontSize: 13, fontWeight: 700, color: T.t1, ...mono } }, props.title),
        props.question && h('div', {
            style: { fontSize: 10, color: T.t2, marginTop: 3, ...mono },
        }, props.question)
    );
}

function Absent(props) {
    // An absent number beats a flagged one: no numeric slot at all, a
    // label and the reason it cannot be measured.
    return h('div', {
        style: {
            border: '1px dashed ' + T.border, borderRadius: 8, padding: '14px 16px',
            background: 'transparent',
        },
    },
        h('div', { style: { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, ...mono } }, props.label),
        h('div', { style: { fontSize: 10.5, color: T.t2, marginTop: 6, ...mono } }, props.reason)
    );
}

// ── Tail shape ───────────────────────────────────────────────────────
function TailShapePanel(props) {
    const rows = props.rows;
    const dist = props.dist;
    const canvasRef = useRef(null);
    const chartRef = useRef(null);

    const overlay = useMemo(() => normalOverlay(dist), [dist]);
    const z99 = VAR_Z[confKey(0.99)];
    const tailFlags = useMemo(() => tailBinFlags(dist, z99), [dist, z99]);

    useEffect(() => {
        if (!canvasRef.current || !dist || !dist.length) return;
        if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

        // The three thresholds sit at exactly the Gaussian quantiles on a
        // standardised axis, so they are marked as constants. No VaR is
        // computed in the browser.
        const marks = [
            [-VAR_Z[confKey(0.90)], T.amber, '90%'],
            [-VAR_Z[confKey(0.95)], '#ff8c42', '95%'],
            [-VAR_Z[confKey(0.99)], T.red, '99%'],
        ];
        const thresholdPlugin = {
            id: 'b5Thresholds',
            afterDraw(chart) {
                const xs = chart.scales.x;
                if (!xs) return;
                marks.forEach(([zv, colour, text]) => {
                    // Locate the bin the threshold falls inside, then
                    // interpolate within it — the x scale is categorical.
                    let idx = -1;
                    for (let i = 0; i < dist.length; i++) {
                        if (zv >= Number(dist[i].bin_lo) && zv < Number(dist[i].bin_hi)) { idx = i; break; }
                    }
                    if (idx < 0) return;
                    const lo = Number(dist[idx].bin_lo), hi = Number(dist[idx].bin_hi);
                    const frac = (zv - lo) / (hi - lo);
                    const x0 = xs.getPixelForValue(idx);
                    const w = xs.width / Math.max(dist.length, 1);
                    const xPx = x0 + (frac - 0.5) * w;
                    const ctx = chart.ctx;
                    ctx.save();
                    ctx.strokeStyle = colour; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
                    ctx.beginPath();
                    ctx.moveTo(xPx, chart.chartArea.top);
                    ctx.lineTo(xPx, chart.chartArea.bottom);
                    ctx.stroke();
                    ctx.fillStyle = colour; ctx.font = '9px ' + T.mono;
                    ctx.fillText(text, xPx + 3, chart.chartArea.top + 11);
                    ctx.restore();
                });
            },
        };

        chartRef.current = new Chart(canvasRef.current, {
            type: 'bar',
            data: {
                labels: dist.map((b) => Number(b.bin_mid).toFixed(2)),
                datasets: [
                    {
                        type: 'bar',
                        label: 'Observed',
                        data: dist.map((b) => Number(b.obs)),
                        // The 99% tail is shaded; a bin straddling the
                        // threshold is not, so shading never overstates it.
                        backgroundColor: tailFlags.map((t) => (t ? 'rgba(239,68,68,0.55)' : 'rgba(100,116,139,0.45)')),
                        borderColor: tailFlags.map((t) => (t ? T.red : '#64748b')),
                        borderWidth: 1,
                    },
                    {
                        type: 'line',
                        label: 'Normal',
                        data: overlay,
                        borderColor: T.amber, borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.35,
                    },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: {
                    legend: { display: false },
                    b5Thresholds: {},
                    tooltip: {
                        backgroundColor: 'rgba(10,14,26,0.92)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                        titleColor: T.t2, bodyColor: T.t1,
                        titleFont: { family: T.mono, size: 10 }, bodyFont: { family: T.mono, size: 11 },
                        callbacks: {
                            title: (items) => (items[0] ? items[0].label + ' σ' : ''),
                            label: (ctx) => (ctx.datasetIndex === 0
                                ? ' Observed: ' + ctx.parsed.y
                                : ' Normal: ' + ctx.parsed.y.toFixed(1)),
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: T.t3, font: { family: T.mono, size: 8 }, maxTicksLimit: 14 },
                        border: { display: false },
                        title: { display: true, text: 'Standardised return (σ of predicted)', color: T.t3, font: { family: T.mono, size: 9 } },
                    },
                    // LOG scale, deliberately. On a linear axis the body
                    // (437 sessions in one bin) flattens the tail against
                    // the floor, and the tail is a third of the finding --
                    // 14 sessions past 4σ against 0.2 expected. Log shows
                    // all three parts of the one defect at once: bars above
                    // the curve in the body, below it at the shoulders, and
                    // far above it in the tails where the normal falls off a
                    // cliff. Empty bins have no log value and simply do not
                    // draw, which is the honest rendering of a zero count.
                    y: {
                        type: 'logarithmic',
                        // Floored at half a session. Without it the axis is
                        // driven by the NORMAL curve, which reaches ~1e-15 at
                        // 9σ and forces sixteen decades that flatten every bar
                        // into the same height. At 0.5 the axis spans ~3
                        // decades and the curve simply leaves the bottom of the
                        // chart in the far tails — which is the finding drawn
                        // rather than described: the normal assigns well under
                        // one session out there, and there are observations.
                        min: 0.5,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: T.t3, font: { family: T.mono, size: 9 } },
                        border: { display: false },
                        title: { display: true, text: 'Sessions (log)', color: T.t3, font: { family: T.mono, size: 9 } },
                    },
                },
            },
            plugins: [thresholdPlugin],
        });
        return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
    }, [dist, overlay, tailFlags]);

    const sentence = patternSentence(rows);
    const nObs = rows.length ? rows[0].nObs : null;

    return h('div', { style: card },
        h(SectionHead, {
            title: 'Tail shape',
            question: 'Is the shape of the distribution the model assumes the right shape?'
                    + (nObs ? '  ·  ' + nObs.toLocaleString() + ' sessions, factor-replicated book return' : ''),
        }),

        // All three levels, always together.
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 1, background: T.border, border: '1px solid ' + T.border, borderRadius: 8, overflow: 'hidden' } },
            rows.map((r) => h('div', {
                key: r.confLabel,
                style: { background: '#0b0f1a', padding: '12px 14px' },
            },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
                    h('div', { style: { fontSize: 10, letterSpacing: 1.2, color: T.t3, ...mono } }, r.confLabel + ' VaR'),
                    h('div', {
                        style: {
                            fontSize: 8, letterSpacing: 0.6, padding: '1px 6px', borderRadius: 8, ...mono,
                            background: (r.passes ? T.green : T.red) + '22',
                            color: r.passes ? T.green : T.red,
                        },
                    }, r.passes ? 'PASSES' : 'REJECTED')
                ),
                h('div', { style: { fontSize: 20, fontWeight: 700, color: T.t1, marginTop: 6, ...mono } },
                    r.observed.toLocaleString(),
                    h('span', { style: { fontSize: 11, color: T.t2, fontWeight: 400 } },
                        '  vs ' + r.expected.toFixed(1) + ' expected')
                ),
                h('div', { style: { fontSize: 10, color: T.t2, marginTop: 2, ...mono } },
                    r.ratio == null ? '—' : r.ratio.toFixed(2) + '× expected'),
                h('div', {
                    style: { fontSize: 10, marginTop: 8, color: r.passes ? T.t2 : T.amber, ...mono },
                }, r.direction),
                // Kupiec is drill-down, not face: the direction is what a
                // reader acts on.
                h('div', { style: { fontSize: 8.5, color: T.t3, marginTop: 6, ...mono } },
                    r.kupiecLr == null ? 'LR —' : 'Kupiec LR ' + r.kupiecLr.toFixed(3)
                        + (r.reject01 ? ' · rejects at 1%' : r.reject05 ? ' · rejects at 5%' : ' · does not reject'))
            ))
        ),

        sentence && h('div', {
            style: {
                marginTop: 12, padding: '10px 12px', borderRadius: 6,
                background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)',
                fontSize: 10.5, lineHeight: 1.6, color: T.t1, ...mono,
            },
        }, sentence),

        dist && dist.length
            ? h('div', { style: { marginTop: 16 } },
                h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                    h('div', { style: { fontSize: 10.5, fontWeight: 600, color: T.t1 } }, 'Standardised return distribution'),
                    h('div', { style: { display: 'flex', gap: 12 } },
                        h('span', { style: { fontSize: 8.5, color: T.slate, ...mono } }, '▇ observed'),
                        h('span', { style: { fontSize: 8.5, color: T.amber, ...mono } }, '— normal'),
                        h('span', { style: { fontSize: 8.5, color: T.red, ...mono } }, '▇ 99% tail')
                    )
                ),
                h('div', { style: { height: 200 } }, h('canvas', { ref: canvasRef })),
                h('div', { style: { fontSize: 8.5, color: T.t3, marginTop: 6, ...mono } },
                    'Observed range ' + Number(dist[0].z_min).toFixed(2) + 'σ to +'
                    + Number(dist[0].z_max).toFixed(2) + 'σ · bins are 0.25σ and are never clamped')
            )
            : h('div', { style: { marginTop: 16 } },
                h(Absent, { label: 'Standardised return distribution', reason: 'The distribution feed did not answer.' }))
    );
}

// ── Scale ────────────────────────────────────────────────────────────
function ScalePanel(props) {
    const chain = props.chain;
    const bookRows = props.bookRows;

    if (!chain) {
        return h('div', { style: card },
            h(SectionHead, { title: 'Scale', question: 'Is the size of the predicted loss right?' }),
            h(Absent, {
                label: 'Variance decomposition',
                reason: 'No unconditional book-leg run in the latest vintage, so there is nothing to decompose.',
            })
        );
    }

    const step = (label, value, cause, colour) => h('div', {
        style: { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid ' + T.border },
    },
        h('div', {
            style: { fontSize: 15, fontWeight: 700, color: colour, minWidth: 74, ...mono },
        }, value),
        h('div', null,
            h('div', { style: { fontSize: 10.5, color: T.t1, ...mono } }, label),
            h('div', { style: { fontSize: 10, color: T.t2, marginTop: 3, lineHeight: 1.55, ...mono } }, cause)
        )
    );

    return h('div', { style: card },
        h(SectionHead, {
            title: 'Scale',
            question: 'Is the size of the predicted loss right?  ·  ' + (bookRows.length ? bookRows[0].nObs : '—') + ' sessions of realised book return',
        }),

        // The chain, explicit — not a bare number and not a tooltip.
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 } },
            h('div', null,
                h('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, ...mono } }, 'Predicted'),
                h('div', { style: { fontSize: 17, fontWeight: 700, color: T.t1, ...mono } }, (chain.sdPred * 100).toFixed(3) + '%')
            ),
            chain.steps && chain.steps.map((s, i) => h('div', { key: i, style: { display: 'flex', alignItems: 'center', gap: 10 } },
                h('span', { style: { fontSize: 13, color: T.t3 } }, '→'),
                h('div', null,
                    h('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, ...mono } }, '×'),
                    h('div', { style: { fontSize: 17, fontWeight: 700, color: T.amber, ...mono } }, s.factor.toFixed(4))
                )
            )),
            h('span', { style: { fontSize: 13, color: T.t3 } }, '→'),
            h('div', null,
                h('div', { style: { fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, ...mono } }, 'Realised'),
                h('div', { style: { fontSize: 17, fontWeight: 700, color: T.red, ...mono } }, (chain.sdReal * 100).toFixed(3) + '%')
            )
        ),

        chain.steps
            ? h('div', { style: { marginTop: 8 } },
                chain.steps.map((s, i) => h(React.Fragment, { key: i },
                    step(s.label, '×' + s.factor.toFixed(4), s.cause, T.amber))),
                h('div', { style: { fontSize: 8.5, color: T.t3, padding: '8px 0 0', borderTop: '1px solid ' + T.border, ...mono } },
                    'The two factors multiply to ' + chain.product.toFixed(4) + ' against a measured '
                    + chain.total.toFixed(4) + ' — a ' + (Math.abs(chain.gap) * 100).toFixed(2)
                    + '% residual, the residual’s small non-orthogonality over this window.')
            )
            : h('div', { style: { marginTop: 10 } },
                h(Absent, { label: 'Decomposition', reason: chain.reason })),

        h('div', {
            style: {
                marginTop: 12, padding: '10px 12px', borderRadius: 6,
                background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)',
                fontSize: 10.5, lineHeight: 1.6, color: T.t1, ...mono,
            },
        }, scaleClosing(chain)),

        // The book leg's own exception counts, all three, beneath the chain.
        bookRows.length ? h('div', { style: { marginTop: 14 } },
            h('div', { style: { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, marginBottom: 6, ...mono } },
                'Book-leg exceptions'),
            h('div', { style: { display: 'flex', gap: 18, flexWrap: 'wrap' } },
                bookRows.map((r) => h('div', { key: r.confLabel, style: { fontSize: 10, color: T.t2, ...mono } },
                    h('span', { style: { color: T.t1 } }, r.confLabel), ' · ',
                    h('span', { style: { color: r.passes ? T.green : T.red } }, r.observed + ' obs'),
                    ' vs ' + r.expected.toFixed(1) + ' exp'))
            )
        ) : null
    );
}

// ── Section root ─────────────────────────────────────────────────────
export function ModelValidationTab() {
    const [runs, setRuns] = useState(null);
    const [dist, setDist] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        function load() {
            setLoading(true); setFailed(false);
            Promise.all([fetchAllRuns(), fetchDistribution()]).then(([r, d]) => {
                if (!alive) return;
                setRuns(r); setDist(d); setLoading(false);
            }).catch((err) => {
                if (!alive) return;
                // A transport failure is never rendered as a statement
                // about the data. Logged at error level because a silent
                // fallback is how a dead panel looks like a working one.
                console.error('[ATLAS] model validation read failed:', err && err.message ? err.message : err);
                setFailed(true); setLoading(false);
            });
        }
        load();
        window.addEventListener('atlas:refresh', load);
        return () => { alive = false; window.removeEventListener('atlas:refresh', load); };
    }, []);

    const set = useMemo(() => latestRunSet(runs), [runs]);
    const tailRows = useMemo(() => tailShapeRows(set ? set.rows : []), [set]);
    const bookRows = useMemo(() => (set ? set.rows : [])
        .filter((r) => r.leg === 'book' && r.basis === 'unconditional')
        .map((r) => ({
            confLabel: (Number(r.conf) * 100).toFixed(0) + '%',
            observed: Number(r.exceptions),
            expected: Number(r.expected_exceptions),
            passes: r.kupiec_reject_05 !== true,
            nObs: Number(r.n_obs),
        }))
        .sort((a, b) => parseFloat(a.confLabel) - parseFloat(b.confLabel)), [set]);
    const chain = useMemo(() => scaleChain(set ? set.rows : []), [set]);

    if (loading) {
        return h('div', { style: card }, h('div', { style: { fontSize: 11, color: T.t2, ...mono } }, 'Loading model validation…'));
    }
    if (failed) {
        return h('div', { style: card },
            h(SectionHead, { title: 'Model validation', question: 'Does the risk model work?' }),
            h(Absent, {
                label: 'Backtest feed',
                reason: 'The backtest feed did not answer. This is a transport failure, not a reading about the model.',
            })
        );
    }
    if (!set || !tailRows.length) {
        return h('div', { style: card },
            h(SectionHead, { title: 'Model validation', question: 'Does the risk model work?' }),
            h(Absent, { label: 'Backtest', reason: 'No backtest run has been written yet.' })
        );
    }

    const runRow = set.rows[0];
    const distRow = dist && dist.length ? dist[0] : null;
    const agrees = vintageAgrees(runRow, distRow);

    return h('div', null,
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' } },
            h('div', { style: { fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: T.teal, ...mono } },
                'Module 6 · Model validation'),
            h('div', { style: { fontSize: 9, color: T.t3, ...mono } },
                'as of ' + set.asOf + ' · ' + set.logicVersion)
        ),

        // Which VaR is under test. The header KPI strip above carries a
        // HISTORICAL VaR computed from the book's own realised returns;
        // this section grades the PARAMETRIC factor-model VaR. Saying so
        // is the difference between a reader learning something and a
        // reader concluding the number in the strip has been refuted.
        h('div', {
            style: {
                ...card, padding: '10px 14px', marginBottom: 14,
                fontSize: 10, lineHeight: 1.6, color: T.t2, ...mono,
            },
        },
            'Under test here is the ',
            h('span', { style: { color: T.t1 } }, 'parametric factor-model VaR'),
            ' — b′Σb with a Gaussian assumption, the estimator behind the regime CVaR layer. It is ',
            h('span', { style: { color: T.t1 } }, 'not'),
            ' the historical VaR in the strip above, which is measured directly from the book’s own realised returns and makes no distributional assumption.'
        ),

        set.logicVersionsSeen.length > 1 && h('div', {
            style: { ...card, padding: '8px 12px', marginBottom: 14, fontSize: 9.5, color: T.amber, ...mono },
        }, 'This as_of carries more than one logic_version (' + set.logicVersionsSeen.join(', ')
           + '). Showing ' + set.logicVersion + ' only — the two are different engines and are never blended.'),

        agrees === false && h('div', {
            style: { ...card, padding: '8px 12px', marginBottom: 14, fontSize: 9.5, color: T.amber, ...mono },
        }, 'The distribution is drawn from betas estimated at ' + distRow.betas_estimated_at
           + ', while the backtest row was written against ' + runRow.betas_estimated_at
           + '. The counts and the picture describe different vintages until the next nightly run.'),

        h(TailShapePanel, { rows: tailRows, dist: dist }),
        h(ScalePanel, { chain: chain, bookRows: bookRows })
    );
}

export default ModelValidationTab;
