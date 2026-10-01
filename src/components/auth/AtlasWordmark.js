// The ATLAS wordmark as stroked geometry: chevron A's with a crossbar stub,
// drawn in currentColor so the caller sets the colour from a token. An <svg>
// with role="img" and a label, so it reads as "Atlas" to a screen reader.

import React from 'react';

const e = React.createElement;

// Each glyph sits in an 80 x 100 cell; cells are 104 apart.
const GLYPHS = [
    'M2 100 L40 4 L78 100 M64 64 H46',                                     // A
    'M0 9 H80 M40 9 V100',                                                  // T
    'M9 0 V91 H80',                                                         // L
    'M2 100 L40 4 L78 100 M64 64 H46',                                     // A
    'M80 9 H30.5 A20.5 20.5 0 0 0 30.5 50 H49.5 A20.5 20.5 0 0 1 49.5 91 H0', // S
];

export function AtlasWordmark({ className, title = 'Atlas', decorative = false }) {
    const a11y = decorative ? { 'aria-hidden': 'true', focusable: 'false' } : { role: 'img', 'aria-label': title };
    return e('svg', {
        className, viewBox: '-10 -12 516 124', fill: 'none', stroke: 'currentColor',
        strokeWidth: 15, strokeLinejoin: 'miter', strokeMiterlimit: 10, ...a11y,
    }, GLYPHS.map((d, i) => e('path', { key: i, d, transform: 'translate(' + i * 104 + ' 0)' })));
}
