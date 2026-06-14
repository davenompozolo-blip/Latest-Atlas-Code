// ============================================================
// ATLAS Nexus — Earnings intelligence table
// ------------------------------------------------------------
// A second lens on the book, earnings-first. Mirrors the Holdings
// table — every holding is visible, searchable, theme- and window-
// filterable, scrollable — but the columns are the context that
// shapes an earnings trade: the next print, consensus, the name's
// prior print + beat-rate, the implied move, and a sentiment read
// from the book's own signals. Names actually reporting float to the
// top; everything else sits below with the date we know (or —).
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

// Timeframe facets — default shows the whole book; the windows narrow to
// names reporting inside N calendar days (undated / past names drop out).
const WINDOWS = [
    { id: 'all', label: 'All' },
    { id: '7', label: '≤7d', days: 7 },
    { id: '30', label: '≤30d', days: 30 },
];

function SentChip({ row }) {
    return e('span', { className: 'ne-sent ' + row.sentiment, title: row.signal || row.sentimentLabel }, row.sentimentLabel);
}

function EarningsRow(r) {
    const soon = r.daysUntil != null && r.daysUntil >= 0 && r.daysUntil <= 7;
    const undated = r.daysUntil == null;
    return e('tr', { key: r.tk, className: soon ? 'ne-soon' : (undated ? 'ne-undated' : '') },
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
}

export function NexusEarningsTable() {
    const { data, loading } = useEarnings();
    const [query, setQuery] = useState('');
    const [theme, setTheme] = useState('ALL');
    const [win, setWin] = useState('all');
    if (loading) return e('div', { className: 'nf-card nb-loading' }, e('span', { className: 'nb-spin' }, '◴'), ' Loading earnings…');

    const allRows = (data && data.rows) || [];
    const horizon = (data && data.horizonDays) || 75;
    const reporting = (data && data.reportingCount != null)
        ? data.reportingCount
        : allRows.filter(r => r.daysUntil != null && r.daysUntil >= 0 && r.daysUntil <= horizon).length;

    // Live facets.
    const themes = Array.from(new Set(allRows.map(r => r.theme).filter(Boolean))).sort();
    const q = query.trim().toLowerCase();
    const winDef = WINDOWS.find(w => w.id === win);
    const rows = allRows.filter(r =>
        (!q || r.tk.toLowerCase().includes(q)) &&
        (theme === 'ALL' || r.theme === theme) &&
        (!winDef || !winDef.days || (r.daysUntil != null && r.daysUntil >= 0 && r.daysUntil <= winDef.days))
    );
    const dirty = query || theme !== 'ALL' || win !== 'all';

    return e('div', { className: 'nf-card nf-holdings nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Earnings on deck'),
            e('span', { className: 'nf-sub' }, allRows.length + ' holdings · ' + reporting + ' reporting ≤' + horizon + 'd')
        ),

        // Filter bar — search + theme + reporting window (mirrors Holdings).
        e('div', { className: 'nf-filters' },
            e('input', {
                className: 'nf-search', type: 'text', placeholder: 'Search ticker…',
                value: query, onChange: ev => setQuery(ev.target.value),
            }),
            e('select', { className: 'nf-theme-select', value: theme, onChange: ev => setTheme(ev.target.value) },
                e('option', { value: 'ALL' }, 'All themes'),
                themes.map(t => e('option', { key: t, value: t }, t))
            ),
            e('div', { className: 'nf-rfilter' },
                WINDOWS.map(w => e('button', {
                    key: w.id,
                    className: 'nf-rchip' + (win === w.id ? ' active' : ''),
                    onClick: () => setWin(w.id),
                    title: w.id === 'all' ? 'All holdings' : 'Reporting within ' + w.days + ' days',
                }, w.label)),
                dirty ? e('button', { className: 'nf-rclear', onClick: () => { setQuery(''); setTheme('ALL'); setWin('all'); } }, 'clear') : null
            )
        ),

        rows.length === 0
            ? e('div', { className: 'nb-empty' }, 'No holdings match these filters.')
            : e('div', { className: 'nf-table-scroll', style: { maxHeight: 460 } },
                e('table', { className: 'nf-table' },
                    e('thead', null, e('tr', null, COLS.map(c => e('th', { key: c.k, className: c.l ? 'nf-l' : '' }, c.label)))),
                    e('tbody', null, rows.map(EarningsRow))
                )
            ),
        e('div', { className: 'nb-foot' }, 'Implied move = the ticker’s own typical earnings-day reaction (hist), or a realized-vol estimate where there’s no history (vol). Sentiment is the book’s live signal read — options-implied pricing arrives with the positioning phase.')
    );
}

export default NexusEarningsTable;
