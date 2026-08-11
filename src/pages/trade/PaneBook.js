// ATLAS Trade — Pane B, book impact. Spec §4.1.
//
// "This is the pane that answers 'I did not even know how much exposure I
// already have'."

import React from 'react';
import { e, Card, Row, DeltaRow, Missing, fNum, fPct, fMoney, fBps, DASH, toneOf } from './shared.js';

export function PaneBook({ impact, symbol, riskLayer, volDrift, corrThreshold }) {
    if (!impact) {
        return e(Card, { title: 'B · BOOK IMPACT · BEFORE → AFTER' },
            e(Missing, { title: 'NO BOOK ON FILE' },
                'Positions and an account snapshot are both needed before a before-and-after can mean anything.'));
    }

    const p = impact.position;
    const eff = impact.effectiveExposure;
    const clu = impact.clusterExposure;
    const conc = impact.concentration;
    const r = impact.risk;
    const m = impact.margin;

    const pctFmt = (x) => fPct(x, 2);
    const sectorRows = topSectors(conc, 3);

    return e(Card, { title: 'B · BOOK IMPACT · BEFORE → AFTER' },
        e('div', { className: 'tr-lbl', style: { marginTop: 0 } }, 'POSITION'),
        e(DeltaRow, { label: 'Shares held', before: p.sharesBefore, after: p.sharesAfter, format: (x) => fNum(x, 0) }),
        e(DeltaRow, { label: 'Average cost', before: p.avgCostBefore, after: p.avgCostAfter, format: (x) => fMoney(x) }),
        e(Row, {
            label: 'Unrealised',
            value: p.unrealised == null ? DASH : `${fMoney(p.unrealised, 0, { signed: true })} (${fPct(p.unrealisedPct, 1, { signed: true })})`,
            tone: toneOf(p.unrealised),
        }),
        e(DeltaRow, { label: 'Weight of equity', before: p.weightOfEquityBefore, after: p.weightOfEquityAfter, format: pctFmt }),
        e('div', { className: 'tr-row' },
            e('span', { className: 'tr-k tr-dim3' }, 'Weight of gross ',
                e('span', { style: { fontSize: 10 } }, '(context only)')),
            e('span', { className: 'tr-v tr-dim3' },
                pctFmt(p.weightOfGrossBefore), e('span', { className: 'tr-delta' }, '→'), pctFmt(p.weightOfGrossAfter))),

        // ── Effective exposure ────────────────────────────────────────────────
        e('div', { className: 'tr-lbl' }, `EFFECTIVE EXPOSURE · ρ>${corrThreshold} / ${riskLayer && riskLayer.window ? riskLayer.window : 120}D`),
        eff && eff.peers.length
            ? e('div', null,
                e('div', { className: 'tr-row' },
                    e('span', { className: 'tr-k' },
                        eff.peers.slice(0, 4).map((x) => `${x.symbol} ${fNum(x.rho, 2)}`).join(' · ')
                        + (eff.peers.length > 4 ? ` +${eff.peers.length - 4}` : '')),
                    e('span', { className: 'tr-v' })),
                e(DeltaRow, {
                    label: 'Correlated cluster weight',
                    before: eff.clusterWeightBefore, after: eff.clusterWeightAfter,
                    format: pctFmt, tone: 'tr-am',
                }),
                e('div', { className: 'tr-note', style: { marginTop: 6 } },
                    `This is not a ${fPct(Math.abs(p.weightOfEquityAfter - p.weightOfEquityBefore), 0)} trade. `
                    + `It is a ${fPct(Math.abs(p.weightOfEquityAfter - p.weightOfEquityBefore), 0)} add to `
                    + `${fPct(eff.clusterWeightBefore, 0)} of the book that moves together.`))
            : e('div', { className: 'tr-note', style: { marginTop: 2 } },
                riskLayer && riskLayer.available
                    ? `Nothing in the book clears ρ>${corrThreshold} against ${symbol} on the trailing window.`
                    : 'No correlation snapshot on file, so effective exposure cannot be measured today. '
                      + 'It is not zero — it is unmeasured.'),

        clu
            ? e('div', null,
                e(DeltaRow, {
                    label: `Cluster weight (derived, ${clu.size} names)`,
                    before: clu.weightBefore, after: clu.weightAfter, format: pctFmt,
                    sub: clu.avgIntraRho != null ? `ρ̄ ${fNum(clu.avgIntraRho, 2)}` : null,
                }),
                Math.abs((clu.weightBefore || 0) - (eff ? eff.clusterWeightBefore : 0)) > 0.005
                    ? e('div', { className: 'tr-note', style: { marginTop: 4 } },
                        'The pairwise cut and the derived cluster disagree, which is the point of showing both: '
                        + 'a hard threshold misses a name just under it and admits one just over.')
                    : null)
            : null,

        // ── Concentration ─────────────────────────────────────────────────────
        e('div', { className: 'tr-lbl' }, 'CONCENTRATION'),
        sectorRows.map((s) =>
            e(DeltaRow, { key: s.name, label: s.name + ' sector', before: s.before, after: s.after, format: pctFmt })),
        e(DeltaRow, { label: 'Top-5 weight', before: conc.before.top5Weight, after: conc.after.top5Weight, format: pctFmt }),
        e(DeltaRow, { label: 'HHI', before: conc.before.hhi, after: conc.after.hhi, format: (x) => fNum(x, 3) }),

        // ── Risk, as three separate quantities ────────────────────────────────
        e('div', { className: 'tr-lbl' }, 'RISK · THREE SEPARATE QUANTITIES'),
        e(Row, { label: 'Current portfolio vol', value: fPct(r.currentVol, 2) }),
        e(Row, { label: 'Incremental vol', value: fPct(r.incrementalVol, 2, { signed: true }), tone: 'tr-am' }),
        e(Row, { label: 'Resulting portfolio vol', value: fPct(r.resultingVol, 2) }),
        e(Row, {
            label: 'Strategic band', value: 'NOT SET', tone: 'tr-dim3',
            title: 'Deliberately absent at V1. Sizing anchors to the existing regime and reports the delta; an explicit portfolio target is a separate decision.',
        }),
        volDrift
            ? e(Row, {
                label: 'Vol 90d ago → 60d → 30d → now',
                value: [volDrift.d90, volDrift.d60, volDrift.d30, volDrift.now]
                    .map((v) => (v == null ? DASH : (v * 100).toFixed(1))).join(' · '),
                tone: driftTone(volDrift),
            })
            : null,
        volDrift && driftTone(volDrift) === 'tr-am'
            ? e('div', { className: 'tr-note', style: { marginTop: 6 } },
                'Drift indicator, not a limit. No single ticket has breached anything. The book has still added '
                + fNum(((volDrift.now || 0) - (volDrift.d90 || 0)) * 100, 1)
                + ' points of volatility in a quarter.')
            : null,

        // ── Marginal risk ─────────────────────────────────────────────────────
        e('div', { className: 'tr-lbl' }, 'MARGINAL RISK'),
        e(Row, { label: 'MCTR of position', value: fPct(r.mctrPositionPct, 1) + ' of portfolio vol' }),
        e(Row, { label: 'Risk per $1,000 deployed', value: fBps(r.riskPerThousandBps, 1), tone: 'tr-cy' }),
        e(Row, { label: 'Incremental 95% 1d VaR', value: fMoney(r.incrementalVaR, 0, { signed: true }) }),
        e(DeltaRow, { label: 'Portfolio beta', before: r.betaBefore, after: r.betaAfter, format: (x) => fNum(x, 2) }),
        r.covarianceCoverage != null && r.covarianceCoverage < 0.999
            ? e('div', { className: 'tr-note', style: { marginTop: 4 } },
                `${fPct(1 - r.covarianceCoverage, 0)} of the covariance matrix had no correlation on file and was `
                + 'treated as uncorrelated. The risk numbers above are therefore a floor, not an estimate.')
            : null,

        // ── Margin ────────────────────────────────────────────────────────────
        e('div', { className: 'tr-lbl' }, 'MARGIN'),
        e(Row, { label: 'Buying power consumed', value: fMoney(m.buyingPowerConsumed, 0) }),
        e(Row, { label: 'Remaining', value: fMoney(m.buyingPowerRemaining, 0) }),
        e(Row, {
            label: 'Fall to maintenance call',
            value: m.fallToMaintenanceCall == null ? DASH : '−' + fPct(m.fallToMaintenanceCall, 1),
            tone: 'tr-am',
            title: m.maintenanceRate != null
                ? `Against the broker's own maintenance requirement of ${fPct(m.maintenanceRate, 1)} of long market value`
                : 'No maintenance_margin on the account snapshot',
        }));
}

function topSectors(conc, n) {
    const names = new Set([...Object.keys(conc.before.sectors), ...Object.keys(conc.after.sectors)]);
    return [...names]
        .map((name) => ({
            name,
            before: conc.before.sectors[name] ?? 0,
            after: conc.after.sectors[name] ?? 0,
        }))
        .sort((a, b) => Math.abs(b.after) - Math.abs(a.after))
        .slice(0, n);
}

function driftTone(d) {
    if (!d || d.d90 == null || d.now == null) return '';
    return d.now - d.d90 > 0.02 ? 'tr-am' : '';
}
