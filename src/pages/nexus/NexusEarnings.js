// ============================================================
// ATLAS Nexus — Earnings intelligence table
// ------------------------------------------------------------
// Which holdings report next, paired with the context that shapes the
// trade: consensus, the name's prior print + beat-rate, the market-
// implied move (the name's own typical earnings reaction, vol fallback),
// the driving theme, and a sentiment read from the book's signals.
// Self-fetching (/api/nexus-earnings); pure scoring in
// nexusEarningsCompute.js. Degrades to an empty state, never breaks.
// ============================================================

import React from 'react';

const { useState, useEffect } = React;
const e = React.createElement;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = s => { if (!s) return '—'; const d = new Date(s + 'T00:00:00Z'); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate(); };
const inDays = n => (n == null ? '' : n === 0 ? 'today' : n < 0 ? Math.abs(n) + 'd ago' : 'in ' + n + 'd');
const eps = v => (v == null ? '—' : (v < 0 ? '−$' : '$') + Math.abs(v).toFixed(2));
const sPct = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');
const HOUR = { bmo: 'BMO', amc: 'AMC', dmh: 'DMH' };

function useEarnings() {
    const [s, setS] = useState({ data: null, loading: true });
    useEffect(function () {
        let alive = true;
        fetch('/api/nexus-earnings').then(r => r.json())
            .then(j => { if (alive) setS({ data: j && j.ok ? j : { rows: [] }, loading: false }); })
            .catch(() => { if (alive) setS({ data: { rows: [] }, loading: false }); });
        return () => { alive = false; };
    }, []);
    return s;
}

const COLS = [
    { k: 'tk', label: 'Ticker', l: true },
    { k: 'theme', label: 'Theme', l: true },
    { k: 'when', label: 'Reports' },
    { k: 'cons', label: 'Consensus' },
    { k: 'prior', label: 'Prior (act / est)' },
    { k: 'beat', label: 'Beat rate' },
    { k: 'move', label: 'Implied move' },
    { k: 'sent', label: 'Sentiment', l: true },
];

function SentChip({ row }) {
    return e('span', { className: 'ne-sent ' + row.sentiment, title: row.signal || row.sentimentLabel }, row.sentimentLabel);
}

export function NexusEarningsTable() {
    const { data, loading } = useEarnings();
    if (loading) return e('div', { className: 'nf-card nb-loading' }, e('span', { className: 'nb-spin' }, '◴'), ' Loading earnings…');
    const rows = (data && data.rows) || [];
    return e('div', { className: 'nf-card nf-holdings nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Earnings on deck'),
            e('span', { className: 'nf-sub' }, rows.length ? rows.length + ' holdings · next ' + (data.horizonDays || 75) + 'd' : 'next ' + ((data && data.horizonDays) || 75) + 'd')
        ),
        rows.length === 0
            ? e('div', { className: 'nb-empty' }, 'No holdings reporting in the window.')
            : e('div', { className: 'nf-table-scroll', style: { maxHeight: 420 } },
                e('table', { className: 'nf-table' },
                    e('thead', null, e('tr', null, COLS.map(c => e('th', { key: c.k, className: c.l ? 'nf-l' : '' }, c.label)))),
                    e('tbody', null, rows.map(function (r) {
                        const soon = r.daysUntil != null && r.daysUntil >= 0 && r.daysUntil <= 7;
                        return e('tr', { key: r.tk, className: soon ? 'ne-soon' : '' },
                            e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk' }, r.tk)),
                            e('td', { className: 'nf-l nf-theme-cell' }, r.theme),
                            e('td', { className: 'nf-l' },
                                e('span', { className: 'ne-date' }, fmtDate(r.date)),
                                r.hour && HOUR[r.hour] ? e('span', { className: 'ne-hour' }, HOUR[r.hour]) : null,
                                e('span', { className: 'ne-when' + (soon ? ' hot' : '') }, inDays(r.daysUntil))),
                            e('td', { className: 'nf-mono-cell' }, eps(r.consensusEps)),
                            e('td', { className: 'nf-mono-cell' },
                                r.priorActual == null ? '—'
                                    : e('span', null, eps(r.priorActual), ' / ', eps(r.priorEstimate),
                                        r.priorSurprisePct != null ? e('span', { className: 'ne-surp ' + (r.priorSurprisePct >= 0 ? 'up' : 'down') }, ' ' + sPct(r.priorSurprisePct)) : null)),
                            e('td', { className: 'nf-mono-cell' }, r.beatRate == null ? '—' : r.beatRate + '%'),
                            e('td', { className: 'nf-mono-cell' },
                                r.expectedMovePct == null ? '—'
                                    : e('span', { className: 'ne-move' }, '±' + r.expectedMovePct.toFixed(1) + '%',
                                        e('span', { className: 'ne-basis ' + r.expectedMoveBasis, title: r.expectedMoveBasis === 'history' ? "name's own past earnings moves" : 'realized-vol estimate (no history)' }, r.expectedMoveBasis === 'history' ? 'hist' : 'vol'))),
                            e('td', { className: 'nf-l' }, e(SentChip, { row: r }))
                        );
                    }))
                )
            ),
        e('div', { className: 'nb-foot' }, 'Implied move = the ticker’s own typical earnings-day reaction (hist), or a realized-vol estimate where there’s no history (vol). Sentiment is the book’s live signal read — options-implied pricing arrives with the positioning phase.')
    );
}

export default NexusEarningsTable;
