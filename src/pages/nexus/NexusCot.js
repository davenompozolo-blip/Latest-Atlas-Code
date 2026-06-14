// ============================================================
// ATLAS Nexus — COT positioning table
// ------------------------------------------------------------
// How the futures crowd is positioned in the markets that drive the
// book — large-spec net position, net as % of open interest, the
// week-over-week shift, and where this week sits in a ~1-year range.
// Extreme positioning is a reversal/risk flag on the correlated
// holdings (shown per row). Self-fetching (/api/nexus-cot); pure
// scoring in nexusCotCompute.js. Degrades to empty, never breaks.
// ============================================================

import React from 'react';

const { useState, useEffect } = React;
const e = React.createElement;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = s => { if (!s) return '—'; const d = new Date(s + 'T00:00:00Z'); return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate(); };
const pct = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');
const kInt = v => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString('en-US'));
// Contrarian framing: crowded long → caution (bearish chip), crowded short →
// washed out (bullish chip). Reuses the earnings sentiment-pill styles.
const READ_TONE = { rich: 'bearish', cheap: 'bullish', neutral: 'neutral' };

function useCot() {
    const [s, setS] = useState({ data: null, loading: true });
    useEffect(function () {
        let alive = true;
        fetch('/api/nexus-cot').then(r => r.json())
            .then(j => { if (alive) setS({ data: j && j.ok ? j : { rows: [] }, loading: false }); })
            .catch(() => { if (alive) setS({ data: { rows: [] }, loading: false }); });
        return () => { alive = false; };
    }, []);
    return s;
}

const COLS = [
    { k: 'market', label: 'Market', l: true },
    { k: 'exposure', label: 'Book exposure', l: true },
    { k: 'net', label: 'Spec net (% OI)' },
    { k: 'rank', label: '1y rank' },
    { k: 'wow', label: 'WoW Δ (net)' },
    { k: 'read', label: 'Positioning', l: true },
];

// Diverging net-%OI bar: green right (net long), red left (net short),
// centred at zero, scaled against the widest absolute reading in view.
function NetBar({ v, scale }) {
    if (v == null) return e('span', { className: 'nf-fvbar' });
    const frac = Math.max(-1, Math.min(1, v / (scale || 1)));
    const w = Math.abs(frac) * 50;
    const pos = v >= 0;
    return e('span', { className: 'nf-fvbar' },
        e('i', { className: pos ? 'pos' : 'neg', style: pos ? { left: '50%', width: w + '%' } : { right: '50%', width: w + '%' } })
    );
}

export function NexusCotTable() {
    const { data, loading } = useCot();
    if (loading) return e('div', { className: 'nf-card nb-loading' }, e('span', { className: 'nb-spin' }, '◴'), ' Loading positioning…');
    const rows = (data && data.rows) || [];
    const scale = Math.max(10, ...rows.map(r => Math.abs(Number(r.netSpecPctOi) || 0)));

    return e('div', { className: 'nf-card nf-holdings nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Futures positioning'),
            e('span', { className: 'nf-sub' }, rows.length ? 'COT · ' + rows.length + ' markets · as of ' + fmtDate(data.asOf) : 'CFTC Commitments of Traders')
        ),
        rows.length === 0
            ? e('div', { className: 'nb-empty' }, 'Positioning data unavailable.')
            : e('div', { className: 'nf-table-scroll', style: { maxHeight: 360 } },
                e('table', { className: 'nf-table' },
                    e('thead', null, e('tr', null, COLS.map(c => e('th', { key: c.k, className: c.l ? 'nf-l' : '' }, c.label)))),
                    e('tbody', null, rows.map(function (r) {
                        const extreme = r.tone === 'rich' || r.tone === 'cheap';
                        return e('tr', { key: r.code, className: extreme ? 'ne-soon' : '' },
                            e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk' }, r.market)),
                            e('td', { className: 'nf-l nf-theme-cell' }, (r.exposure || []).join(' · ')),
                            e('td', { className: 'nf-mono-cell ' + (r.netSpecPctOi >= 0 ? 'tone-up' : 'tone-down') },
                                e('span', { className: 'nf-fv-wrap' },
                                    e(NetBar, { v: r.netSpecPctOi, scale }),
                                    e('span', null, pct(r.netSpecPctOi)))),
                            e('td', { className: 'nf-mono-cell' }, r.pctRank == null ? '—' : r.pctRank + '%'),
                            e('td', { className: 'nf-mono-cell ' + (r.wowNet >= 0 ? 'tone-up' : 'tone-down') }, kInt(r.wowNet)),
                            e('td', { className: 'nf-l' }, e('span', { className: 'ne-sent ' + (READ_TONE[r.tone] || 'neutral'), title: 'Large-spec net positioning vs its 1-year range' }, r.read))
                        );
                    }))
                )
            ),
        e('div', { className: 'nb-foot' }, 'Large speculators (non-commercials) net position as % of open interest, vs its 1-year range. A crowded reading is a reversal/risk flag on the correlated holdings — not a directional call. Source: CFTC, weekly.')
    );
}

export default NexusCotTable;
