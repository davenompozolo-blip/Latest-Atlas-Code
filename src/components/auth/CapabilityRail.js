// The landing page's right rail: what is inside the terminal. Each entry names
// a module that exists in the app (TABS in src/pages/app.js); nothing here is
// a figure or a claim about the market.

import React from 'react';
import { AuthIcon } from './AuthIcons.js';

const e = React.createElement;

export const CAPABILITIES = [
    { icon: 'research', title: 'Equity Research', line: 'Deeper insights. Better conviction.' },
    { icon: 'quant', title: 'Quant Dashboard', line: 'Data. Models. Edge.' },
    { icon: 'market', title: 'Market Watch', line: 'Global markets, real time.' },
    { icon: 'fund', title: 'Fund Research', line: 'ETFs, funds, managers.' },
    { icon: 'macro', title: 'Macro Intelligence', line: 'The big picture, in context.' },
];

export function CapabilityRail() {
    return e('aside', { className: 'ag-rail', 'aria-label': 'Inside the terminal' },
        e('ul', null, CAPABILITIES.map((c) => e('li', { key: c.title },
            e('span', { className: 'ag-rail-icon' }, e(AuthIcon, { name: c.icon, size: 22 })),
            e('span', { className: 'ag-rail-text' },
                e('span', { className: 'ag-rail-title' }, c.title),
                e('span', { className: 'ag-rail-line' }, c.line))))));
}
