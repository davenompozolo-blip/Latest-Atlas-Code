// ============================================================
// ATLAS Nexus — Theme tab (transmission)
// ------------------------------------------------------------
// How today's macro is propagating through the book's themes. Keeps
// the computed transmission narrative, then adds the meat: a per-theme
// card grid rolled up from the live book — share, today's move,
// contribution, VaR share, conviction, valuation tilt, the read mix the
// engine derived, and the top names. Pure aggregation in
// nexusThemeCompute.js; this file only renders the resolved model.
// ============================================================

import React from 'react';
import { buildThemeView, themeLeaders } from './nexusThemeCompute.js';

const e = React.createElement;

const pct1 = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');
const moveTone = v => (v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : 'tone-neutral');
const TILT = {
    cheap: { label: 'Cheap', cls: 'tone-up' },
    rich:  { label: 'Rich',  cls: 'tone-down' },
    fair:  { label: 'Fair',  cls: 'tone-neutral' },
};
const READ_ORDER = ['add', 'hold', 'trim', 'watch', 'exit'];

function Stat(label, val, cls) {
    return e('div', { className: 'nt-stat', key: label },
        e('div', { className: 'nt-stat-l' }, label),
        e('div', { className: 'nt-stat-v ' + (cls || '') }, val));
}

function ReadMix({ reads }) {
    const items = READ_ORDER.filter(r => reads[r]);
    if (!items.length) return null;
    return e('div', { className: 'nt-reads' },
        items.map(r => e('span', { key: r, className: 'nt-read ' + r, title: reads[r] + ' ' + r }, reads[r] + ' ' + r.toUpperCase())));
}

function ThemeCard({ row }) {
    const tilt = row.valuationTilt ? TILT[row.valuationTilt] : null;
    const shift = row.riskShift > 0 ? 'risk ↑' : row.riskShift < 0 ? 'risk ↓' : null;
    return e('div', { className: 'nt-card' + (row.fragility ? ' frag' : '') + (row.stale ? ' stale' : '') },
        e('div', { className: 'nt-card-h' },
            e('span', { className: 'nt-theme' }, row.theme,
                row.fragility ? e('span', { className: 'nf-frag', title: 'fragility cluster' }, '◆') : null),
            e('span', { className: 'nt-share' }, row.sharePct == null ? '—' : row.sharePct.toFixed(1) + '%')
        ),
        e('div', { className: 'nt-moveline' },
            e('span', { className: 'nt-move ' + moveTone(row.movePct) }, pct1(row.movePct)),
            shift ? e('span', { className: 'nt-shift' }, shift) : null,
            e('span', { className: 'nt-count' }, row.count + (row.count === 1 ? ' name' : ' names'))
        ),
        e('div', { className: 'nt-stats' },
            Stat('Contrib', pct1(row.contribPct, 2), moveTone(row.contribPct)),
            Stat('VaR', row.varSharePct.toFixed(1) + '%'),
            Stat('Conv', String(row.avgConviction)),
            tilt ? Stat('Value', tilt.label, tilt.cls) : Stat('Value', '—')
        ),
        e(ReadMix, { reads: row.reads }),
        row.topNames.length
            ? e('div', { className: 'nt-names' }, row.topNames.map(t => e('span', { key: t, className: 'nf-tk' }, t)))
            : null
    );
}

export function NexusThemePanel({ model }) {
    const rows = buildThemeView(model.holdings, model.spine);
    const L = themeLeaders(rows);
    const intro = (model.seasonal && model.seasonal.theme) || {};

    return e('div', { className: 'nf-card nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('div', null,
                e('h3', null, intro.title || 'Theme transmission'),
                intro.subtitle ? e('div', { className: 'nf-sub', style: { marginTop: 4 } }, intro.subtitle) : null
            ),
            L.leader && L.laggard
                ? e('span', { className: 'nf-sub' },
                    'leads ', e('b', { className: 'tone-up' }, L.leader.theme + ' ' + pct1(L.leader.movePct)),
                    ' · lags ', e('b', { className: 'tone-down' }, L.laggard.theme + ' ' + pct1(L.laggard.movePct)))
                : null
        ),
        (intro.body || []).map((p, i) => e('p', { key: i, className: 'nt-intro' }, p)),
        rows.length
            ? e('div', { className: 'nt-grid' }, rows.map(r => e(ThemeCard, { key: r.theme, row: r })))
            : e('div', { className: 'nb-empty' }, 'No theme data yet.')
    );
}

export default NexusThemePanel;
