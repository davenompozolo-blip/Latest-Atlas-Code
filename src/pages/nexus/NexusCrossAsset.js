// ============================================================
// ATLAS Nexus — cross-asset (G-4)
// ------------------------------------------------------------
// The Markets module's heatmap, credit levels and risk barometer, on the
// flagship below the names — in the house casing, not lifted with their
// old design system attached. Recycling the markup is what makes a page
// feel like panels held together with tape; recycling the DATA and
// re-rendering it in one idiom is what makes it feel like one machine.
//
// The barometer is the interesting one and it is not decoration: it is
// the CHEAP signal, instant and uncalibrated, and the whole reason to
// have it on the same page as the expensive ones is to be able to see
// when they disagree. So it renders its three components, not just its
// label, and carries `heuristic` on its face.
// ============================================================

import React from 'react';
import { ASSET_CLASSES } from '../../lib/marketAssetGroups.js';
import { useMacroFeed } from './useMacroFeed.js';
import { riskBarometer, heatmapRows, creditLevels, RISK_BAND } from './nexusCrossAssetCompute.js';

const { useMemo } = React;
const e = React.createElement;

const PATHS = ['/api/macro'];

const pct = (v, d = 2) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%');
const tone = v => (v == null ? '' : v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : '');
const fx = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d));

// The cell's ground carries the magnitude; the text carries the number.
// Intensity is capped in the compute module, not here, so the scale is
// testable without a DOM.
function cellBg(move, intensity) {
    if (move == null || intensity == null) return 'transparent';
    const a = 0.07 + intensity * 0.24;
    return move > 0 ? 'rgba(34,197,94,' + a + ')' : move < 0 ? 'rgba(239,68,68,' + a + ')' : 'rgba(255,255,255,0.04)';
}

function Heat({ market }) {
    const { rows, withheld } = useMemo(() => heatmapRows(market, ASSET_CLASSES), [market]);
    if (!rows.length) {
        return e('div', { className: 'nxa-empty' }, 'No quotes in the cross-asset set.');
    }
    return e('div', null,
        rows.map(r => e('div', { className: 'nxa-row', key: r.key },
            e('div', { className: 'nxa-row-l' }, r.label),
            e('div', { className: 'nxa-cells' },
                r.cells.map(c => e('div', {
                    key: c.symbol, className: 'nxa-cell',
                    style: { background: cellBg(c.move, c.intensity) },
                    title: c.proxiesFor || null,
                },
                    e('span', { className: 'nxa-cell-tk' }, c.symbol),
                    e('span', { className: 'nxa-cell-v ' + tone(c.move) }, pct(c.move)))))
        )),
        // Named, not silently absent: a heatmap renders every cell as a
        // measurement, so a missing one has to be accounted for in words.
        withheld.length
            ? e('div', { className: 'nxa-foot' }, withheld.join(', ') + ' · no quote, cell withheld')
            : null
    );
}

function Barometer({ market, credit }) {
    const b = useMemo(() => riskBarometer(market, credit), [market, credit]);
    // The needle is the SCORE, not the label: three positions would throw
    // away the distance from the band, which is the only thing that says
    // whether the reading is marginal.
    const pos = b.score == null ? 50 : Math.max(2, Math.min(98, 50 + b.score * 48));

    return e('div', { className: 'nxa-baro' },
        e('div', { className: 'nxa-baro-h' },
            e('span', { className: 'nxa-baro-label tone-' + b.tone }, b.label),
            // Never rendered without this. Three signs over a ±0.3 band is
            // not a measured regime, and the panels a scroll away ARE.
            e('span', { className: 'nxa-baro-basis' }, 'heuristic'),
            b.partial ? e('span', { className: 'nxa-baro-basis' }, b.measured + ' of 3 inputs') : null
        ),
        e('div', { className: 'nxa-baro-track' },
            e('span', { className: 'nxa-baro-band', style: { left: (50 - RISK_BAND * 48) + '%', width: (RISK_BAND * 96) + '%' } }),
            b.score == null ? null : e('span', { className: 'nxa-baro-needle', style: { left: pos + '%' } })
        ),
        e('div', { className: 'nxa-baro-ends' }, e('span', null, 'Risk-off'), e('span', null, 'Neutral'), e('span', null, 'Risk-on')),
        // The components ARE the panel. A label with nothing under it is
        // the gauge that was hardcoded in the chrome for however long.
        b.components.length
            ? e('div', { className: 'nxa-parts' },
                b.components.map(c => e('div', { className: 'nxa-part', key: c.key },
                    e('span', { className: 'nxa-part-n' }, c.label),
                    e('span', { className: 'nxa-part-v ' + (c.contribution > 0 ? 'tone-up' : c.contribution < 0 ? 'tone-down' : '') },
                        c.key === 'hy' ? fx(c.reading) + '%' : pct(c.reading)),
                    e('span', { className: 'nxa-part-s' }, c.says))))
            : e('div', { className: 'nxa-foot' }, 'No inputs — the barometer has nothing to read.')
    );
}

function Credit({ credit }) {
    const c = useMemo(() => creditLevels(credit), [credit]);
    if (!c.measured) return e('div', { className: 'nxa-empty' }, 'No credit series available.');
    const row = (label, value, says, dp) => e('div', { className: 'nxa-cr', key: label },
        e('span', { className: 'nxa-cr-n' }, label),
        e('span', { className: 'nxa-cr-v' }, value == null ? '—' : fx(value, dp)),
        says ? e('span', { className: 'nxa-cr-s' }, says) : null);
    return e('div', { className: 'nxa-credit' },
        row('HY OAS', c.hy, c.hySays, 2),
        row('IG OAS', c.ig, null, 2),
        // The sign is counter-intuitive, so the direction is printed with
        // the number rather than left to the reader.
        row('NFCI', c.nfci, c.nfciSays, 2)
    );
}

export function NexusCrossAsset() {
    const feed = useMacroFeed(PATHS);
    const macro = feed.data['/api/macro'];

    const head = e('div', { className: 'nf-card-h' },
        e('div', null,
            e('h3', null, 'Cross-asset'),
            e('div', { className: 'nf-sub', style: { marginTop: 3 } },
                'today’s moves by class, credit levels, and the cheap risk read')));

    if (!feed.loaded) return e('div', { className: 'nf-card nxa' }, head, e('div', { className: 'nxa-empty' }, 'Loading cross-asset…'));
    // A statement about the transport, never about the market.
    if (!macro) return e('div', { className: 'nf-card nxa' }, head, e('div', { className: 'nxa-empty' }, 'Cross-asset unavailable — /api/macro did not answer.'));

    return e('div', { className: 'nf-card nf-fade nxa' }, head,
        e(Heat, { market: macro.market }),
        e('div', { className: 'nxa-split' },
            e('div', { className: 'nxa-sub' },
                e('div', { className: 'nxa-sub-h' }, 'Credit & conditions'),
                e(Credit, { credit: macro.credit })),
            e('div', { className: 'nxa-sub' },
                e('div', { className: 'nxa-sub-h' }, 'Risk barometer'),
                e(Barometer, { market: macro.market, credit: macro.credit })))
    );
}

export default NexusCrossAsset;
