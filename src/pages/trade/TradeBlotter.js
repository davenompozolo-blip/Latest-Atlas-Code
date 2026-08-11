// ATLAS Trade — /trade/blotter. Spec §8 and §6.
//
// "Order History expanded into intents plus orders plus armed triggers plus the
// outcome review."
//
// §6 is the reason the module exists at all in the long run: joined to fills
// and realised P&L, the intent rows answer whether high-alignment trades beat
// low-alignment ones, and whether your overrides beat the model. Those two
// tables are rendered here as soon as there is anything to render — and are
// explicitly empty until then rather than filled with plausible noise.

import React from 'react';
import { e, Card, Missing, fNum, fPct, fMoney, DASH, toneOf } from './shared.js';
import * as data from '../../lib/trade/tradeData.js';

const { useState, useEffect, useMemo } = React;

const TABS = [
    { id: 'intents', label: 'INTENTS' },
    { id: 'triggers', label: 'ARMED TRIGGERS' },
    { id: 'review', label: 'OUTCOME REVIEW' },
];

export function TradeBlotter({ onOpenTicket }) {
    const [tab, setTab] = useState('intents');
    const [state, setState] = useState({ loading: true, decisions: [], outcomes: [], triggers: [], integrity: null });

    useEffect(() => {
        let live = true;
        data.loadBlotter().then((b) => { if (live) setState({ loading: false, ...b }); });
        return () => { live = false; };
    }, []);

    if (state.loading) return e('div', { className: 'tr-wrap' }, e('div', { className: 'tr-sub' }, 'Loading the blotter…'));

    const armed = state.triggers.filter((t) => t.status === 'armed');

    return e('div', { className: 'tr-wrap' },
        e('div', { className: 'tr-h2' }, 'Blotter'),
        e('p', { className: 'tr-sub' },
            'Intents, the orders they became, the conditions still armed, and what all of it was worth. ',
            'Nothing else in ATLAS produces a labelled dataset of your own decisions; this does, as a by-product of normal use.'),

        e(IntegrityStrip, { integrity: state.integrity, decisions: state.decisions, armed: armed.length }),

        e('div', { className: 'tr-tabs', style: { marginBottom: 14, position: 'static' } },
            TABS.map((t) =>
                e('button', { key: t.id, className: tab === t.id ? 'on' : '', onClick: () => setTab(t.id), type: 'button' },
                    t.label + (t.id === 'triggers' && armed.length ? ` · ${armed.length}` : '')))),

        tab === 'intents' ? e(IntentTable, { decisions: state.decisions, onOpenTicket })
            : tab === 'triggers' ? e(TriggerTable, { triggers: state.triggers, onOpenTicket })
            : e(OutcomeReview, { outcomes: state.outcomes, decisions: state.decisions }));
}

function IntegrityStrip({ integrity, decisions, armed }) {
    const byType = decisions.reduce((a, d) => { a[d.decision_type] = (a[d.decision_type] || 0) + 1; return a; }, {});
    const cell = (v, l, tone) => e('div', null,
        e('div', { className: 'tr-n ' + (tone || '') }, v),
        e('div', { className: 'tr-l' }, l));

    return e('div', { style: { marginBottom: 14 } },
        e('div', { className: 'tr-three', style: { gridTemplateColumns: 'repeat(5,1fr)' } },
            cell(byType.executed || 0, 'EXECUTED'),
            cell(byType.passed || 0, 'PASSED', (byType.passed || 0) === 0 ? 'tr-am' : ''),
            cell(byType.deferred || 0, 'DEFERRED', (byType.deferred || 0) === 0 ? 'tr-am' : ''),
            cell(armed, 'ARMED'),
            cell(integrity ? (integrity.chain_ok ? 'OK' : 'BROKEN') : DASH, 'HASH CHAIN',
                integrity && integrity.chain_ok ? 'tr-pos' : 'tr-neg')),
        (byType.passed || 0) === 0 && (byType.deferred || 0) === 0
            ? e('div', { className: 'tr-note' },
                'Every decision on file is an execution, so there is no control group yet: you can compare executed '
                + 'trades to each other but never to the ones you correctly declined. Arming a trigger from the ticket '
                + 'writes a deferred row and starts fixing that.')
            : null);
}

// ── Intents ──────────────────────────────────────────────────────────────────

function IntentTable({ decisions, onOpenTicket }) {
    if (!decisions.length) {
        return e(Card, { title: 'INTENTS' }, e(Missing, { title: 'NO INTENTS ON FILE' }, 'Nothing has been recorded yet.'));
    }
    return e('div', { className: 'tr-card' },
        e('div', { className: 'tr-ch' }, `INTENTS · ${decisions.length}`),
        e('div', { className: 'tr-scroll' },
            e('table', { className: 'tr-table' },
                e('thead', null, e('tr', null,
                    ['DATE', 'SYMBOL', 'TYPE', 'INTENT', 'METHOD', '% EQUITY', 'MODEL', 'SENT', 'OVR', 'NET', 'ALIGN', '×', 'ORDER']
                        .map((h) => e('th', { key: h }, h)))),
                e('tbody', null, decisions.map((d) =>
                    e('tr', { key: d.id, onClick: () => onOpenTicket(d.symbol) },
                        e('td', { className: 'name' }, String(d.decided_at || '').slice(0, 10)),
                        e('td', { className: 'name' }, d.symbol),
                        e('td', null, e('span', {
                            className: 'tr-badge ' + (d.decision_type === 'executed' ? 'pos' : d.decision_type === 'passed' ? 'warn' : ''),
                        }, String(d.decision_type || '').toUpperCase())),
                        e('td', null, d.intent || DASH),
                        e('td', null, d.sizing_method ? d.sizing_method.replace(/_/g, ' ') : DASH),
                        e('td', null, d.pct_of_equity == null ? DASH : fPct(Number(d.pct_of_equity), 2)),
                        e('td', null, d.model_qty == null ? DASH : fNum(Number(d.model_qty), 0)),
                        e('td', null, d.submitted_qty == null ? DASH : fNum(Number(d.submitted_qty), 0)),
                        e('td', { className: d.is_override ? 'tr-am' : 'tr-dim3' }, d.is_override ? 'YES' : d.is_override === false ? 'no' : DASH),
                        e('td', { className: toneOf(d.coherence_net == null ? null : Number(d.coherence_net)) },
                            d.coherence_net == null ? DASH : fNum(Number(d.coherence_net), 2)),
                        e('td', null, d.coherence_alignment == null ? DASH : fNum(Number(d.coherence_alignment), 2)),
                        e('td', null, d.size_multiplier == null ? DASH : '×' + fNum(Number(d.size_multiplier), 2)),
                        e('td', { className: 'tr-dim3' },
                            d.orders ? String(d.orders.status || '').toUpperCase() : DASH)))))));
}

// ── Armed triggers ───────────────────────────────────────────────────────────

function TriggerTable({ triggers, onOpenTicket }) {
    if (!triggers.length) {
        return e(Card, { title: 'TRIGGERS' },
            e(Missing, { title: 'NOTHING ARMED' },
                'A posture other than Act owes at least one monitorable trigger. Arm one from the ticket and it '
                + 'appears here with a lifecycle, evaluated nightly.'));
    }
    return e('div', { className: 'tr-card' },
        e('div', { className: 'tr-ch' }, `TRIGGERS · ${triggers.length}`),
        e('div', { className: 'tr-scroll' },
            e('table', { className: 'tr-table' },
                e('thead', null, e('tr', null,
                    ['ARMED', 'SYMBOL', 'TYPE', 'CONDITION', 'STATUS', 'LAST CHECK', 'OBSERVED', 'EXPIRES']
                        .map((h) => e('th', { key: h }, h)))),
                e('tbody', null, triggers.map((t) =>
                    e('tr', { key: t.id, onClick: () => onOpenTicket(t.symbol) },
                        e('td', { className: 'name' }, String(t.armed_at || '').slice(0, 10)),
                        e('td', { className: 'name' }, t.symbol),
                        e('td', null, String(t.trigger_type || '').toUpperCase()),
                        e('td', { className: 'name' }, t.description),
                        e('td', null, e('span', {
                            className: 'tr-badge ' + (t.status === 'fired' ? 'pos' : t.status === 'armed' ? 'held' : ''),
                        }, String(t.status).toUpperCase())),
                        e('td', { className: 'tr-dim3' }, t.last_checked_at ? String(t.last_checked_at).slice(0, 10) : DASH),
                        e('td', { className: 'tr-dim3' }, t.last_observed ? JSON.stringify(t.last_observed).slice(0, 40) : DASH),
                        e('td', { className: 'tr-dim3' }, t.expires_at || 'none')))))));
}

// ── Outcome review (§6) ──────────────────────────────────────────────────────

function OutcomeReview({ outcomes, decisions }) {
    const byAlignment = useMemo(() => {
        const bins = [
            { label: '0.00 – 0.25', lo: 0, hi: 0.25 },
            { label: '0.25 – 0.50', lo: 0.25, hi: 0.5 },
            { label: '0.50 – 0.75', lo: 0.5, hi: 0.75 },
            { label: '0.75 – 1.00', lo: 0.75, hi: 1.01 },
        ].map((b) => ({ ...b, n: 0, hits: 0, alpha: 0 }));

        for (const o of outcomes) {
            const d = o.decisions;
            if (!d || d.coherence_alignment == null || o.alpha == null) continue;
            const a = Number(d.coherence_alignment);
            const bin = bins.find((b) => a >= b.lo && a < b.hi);
            if (!bin) continue;
            bin.n++;
            bin.alpha += Number(o.alpha);
            if (o.correct) bin.hits++;
        }
        return bins;
    }, [outcomes]);

    const overrides = useMemo(() => {
        const groups = { override: { n: 0, alpha: 0, hits: 0 }, model: { n: 0, alpha: 0, hits: 0 } };
        for (const o of outcomes) {
            const d = o.decisions;
            if (!d || d.is_override == null || o.alpha == null) continue;
            const g = d.is_override ? groups.override : groups.model;
            g.n++; g.alpha += Number(o.alpha);
            if (o.correct) g.hits++;
        }
        return groups;
    }, [outcomes]);

    const scored = byAlignment.reduce((a, b) => a + b.n, 0);

    return e('div', { style: { display: 'grid', gap: 14 } },
        e(Card, { title: 'HIT RATE AND AVERAGE OUTCOME BY ALIGNMENT DECILE' },
            scored === 0
                ? e(Missing, { title: 'NOT MEASURABLE YET' },
                    'No outcome row yet carries a coherence reading. This table fills itself in as intents written '
                    + 'by this module age past their first horizon — it is deliberately empty rather than fitted to '
                    + 'a sample that cannot support it.')
                : e('table', { className: 'tr-ftable' },
                    e('thead', null, e('tr', null,
                        e('th', null, 'ALIGNMENT'), e('th', null, 'N'), e('th', null, 'HIT RATE'), e('th', null, 'AVG ALPHA'))),
                    e('tbody', null, byAlignment.map((b) =>
                        e('tr', { key: b.label },
                            e('td', null, b.label),
                            e('td', null, b.n),
                            e('td', null, b.n ? fPct(b.hits / b.n, 0) : DASH),
                            e('td', { className: toneOf(b.n ? b.alpha / b.n : null) },
                                b.n ? fPct(b.alpha / b.n, 2, { signed: true }) : DASH)))))),

        e(Card, { title: 'DO YOUR OVERRIDES BEAT THE MODEL SIZE?' },
            overrides.model.n === 0 && overrides.override.n === 0
                ? e(Missing, { title: 'NOT MEASURABLE YET' },
                    'The genuinely uncomfortable number. It needs overridden and non-overridden intents that have '
                    + 'both aged past a horizon, and there are none yet.')
                : e('table', { className: 'tr-ftable' },
                    e('thead', null, e('tr', null,
                        e('th', null, 'SIZED BY'), e('th', null, 'N'), e('th', null, 'HIT RATE'), e('th', null, 'AVG ALPHA'))),
                    e('tbody', null, [['Model', overrides.model], ['Override', overrides.override]].map(([label, g]) =>
                        e('tr', { key: label },
                            e('td', null, label),
                            e('td', null, g.n),
                            e('td', null, g.n ? fPct(g.hits / g.n, 0) : DASH),
                            e('td', { className: toneOf(g.n ? g.alpha / g.n : null) },
                                g.n ? fPct(g.alpha / g.n, 2, { signed: true }) : DASH)))))));
}
