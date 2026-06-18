// ============================================================
// ATLAS Nexus — Options positioning panel (Flagship monitoring)
// ------------------------------------------------------------
// The book-level options scan: per held name, what the options market is
// pricing — ATM IV (+ 90d percentile once it builds), 25Δ skew, P/C open
// interest, term structure, and the one-word positioning read. Sits in the
// COT panel's slot. Reads the resolved model (the live provider already
// loaded nexus_options + ran the shared optionsRead), so no self-fetch.
// The question here is risk: "is the market flagging downside on a name I
// hold?" — the same signal Opportunities frames as entry timing.
// ============================================================

import React from 'react';

const e = React.createElement;

const OPT_LABEL = { stressed: 'Stressed', hedged: 'Hedged', complacent: 'Complacent', neutral: 'Neutral' };
const TERM_LABEL = { backwardation: 'Backwardated', contango: 'Contango', flat: 'Flat' };
const pctIv = v => (v == null ? '—' : Math.round(v * 100) + '%');
const volPts = v => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1));
const x2 = v => (v == null ? '—' : Number(v).toFixed(2));

const COLS = [
    { k: 'tk', label: 'Ticker', l: true },
    { k: 'iv', label: 'ATM IV' },
    { k: 'rank', label: 'IV rank' },
    { k: 'skew', label: '25Δ skew' },
    { k: 'pc', label: 'P/C OI' },
    { k: 'term', label: 'Term', l: true },
    { k: 'tone', label: 'Positioning', l: true },
];

export function NexusOptionsPanel({ holdings }) {
    const rows = (holdings || []).filter(h => h.options && h.options.hasOptions);
    // Coverage line — how many held names have chains, and how many are flagged.
    const total = (holdings || []).length;
    const stressed = rows.filter(r => r.options.tone === 'stressed').length;
    const hedged = rows.filter(r => r.options.tone === 'hedged').length;
    const building = rows.length && rows.every(r => r.options.rankReady === false);

    const sub = rows.length
        ? rows.length + ' of ' + total + ' names · ' + stressed + ' stressed · ' + hedged + ' hedged'
        : 'Options positioning';

    return e('div', { className: 'nf-card nf-holdings nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Options positioning'),
            e('span', { className: 'nf-sub' }, sub)
        ),
        rows.length === 0
            ? e('div', { className: 'nb-empty' }, 'No options coverage for held names yet — the daily snapshot populates the tracked pool.')
            : e('div', { className: 'nf-table-scroll', style: { maxHeight: 360 } },
                e('table', { className: 'nf-table' },
                    e('thead', null, e('tr', null, COLS.map(c => e('th', { key: c.k, className: c.l ? 'nf-l' : '' }, c.label)))),
                    e('tbody', null, rows.map(function (h) {
                        const o = h.options;
                        const flagged = o.tone === 'stressed' || o.tone === 'hedged';
                        return e('tr', { key: h.objectId || h.tk, className: flagged ? 'ne-soon' : '' },
                            e('td', { className: 'nf-l' },
                                e('span', { className: 'nf-tk' }, h.tk),
                                o.stale ? e('span', { className: 'nf-name', title: 'Snapshot is stale' }, 'stale') : null),
                            e('td', { className: 'nf-mono-cell' }, pctIv(o.atmIv)),
                            e('td', { className: 'nf-mono-cell' }, o.rankReady && o.ivRank != null ? o.ivRank + '%' : e('span', { style: { color: 'var(--text3)' }, title: 'Builds over ~30 sessions' }, 'building')),
                            e('td', { className: 'nf-mono-cell ' + (o.skew25d == null ? '' : o.skew25d > 0 ? 'tone-down' : 'tone-up'), title: 'Put−call 25Δ IV (vol-pts) — positive = downside bid' }, volPts(o.skew25d)),
                            e('td', { className: 'nf-mono-cell ' + (o.pcOi == null ? '' : o.pcOi > 1 ? 'tone-down' : 'tone-up') }, x2(o.pcOi)),
                            e('td', { className: 'nf-l' }, e('span', { style: { color: 'var(--text2)' } }, o.termTone ? TERM_LABEL[o.termTone] : '—')),
                            e('td', { className: 'nf-l' }, e('span', { className: 'nf-opt nf-opt-' + o.tone, title: o.because || '' }, OPT_LABEL[o.tone] || o.tone))
                        );
                    }))
                )
            ),
        e('div', { className: 'nb-foot' },
            'ATM implied vol, 25Δ skew (put−call), put/call open interest, and term structure per held name. Positioning reads the crowd, not direction — a stressed/hedged flag is a risk signal, not a sell. ' +
            (building ? 'Percentile ranks build over ~30 sessions; level and skew sign are live now. ' : '') +
            'Source: Alpaca options snapshots, daily.')
    );
}

export default NexusOptionsPanel;
