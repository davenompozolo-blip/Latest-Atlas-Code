// The landing page's left panel: wordmark, the three verbs, and the promise.

import React from 'react';
import { AtlasWordmark } from './AtlasWordmark.js';

const e = React.createElement;

const VERBS = ['Analyse', 'Track', 'Invest'];

export function AuthBrandPanel() {
    return e('section', { className: 'ag-brand', 'aria-label': 'Atlas' },
        e(AtlasWordmark, { className: 'ag-brand-mark', decorative: true }),
        e('p', { className: 'ag-verbs' },
            VERBS.map((v, i) => e(React.Fragment, { key: v },
                i > 0 && e('span', { className: 'ag-slash', 'aria-hidden': 'true' }, ' / '),
                v))),
        e('div', { className: 'ag-pitch' },
            e('p', { className: 'ag-headline' }, 'Smarter analytics.', e('br'), 'Better decisions.'),
            e('p', { className: 'ag-copy' }, 'Equity research, portfolio analytics, market intelligence and more.')));
}
