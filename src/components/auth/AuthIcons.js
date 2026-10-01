// Line icons for the landing page. 24-unit grid, stroked in currentColor.

import React from 'react';

const e = React.createElement;

const PATHS = {
    mail: ['M3 6.5h18v11H3z', 'M3.5 7l8.5 6.5L20.5 7'],
    lock: ['M5.5 10.5h13v10h-13z', 'M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3', 'M12 14.5v2.5'],
    research: ['M4 20V13', 'M9 20V8', 'M14 20V11', 'M19 20V4', 'M2.5 20.5h19'],
    quant: ['M3 4.5h18v15H3z', 'M6 15.5l3.5-4 3 2.5 5-6'],
    market: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M3 12h18', 'M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9', 'M12 3c-2.6 2.6-3.8 5.6-3.8 9s1.2 6.4 3.8 9'],
    fund: ['M12 3a9 9 0 1 0 9 9h-9z', 'M15 3.5a8.5 8.5 0 0 1 5.5 5.5H15z'],
    macro: ['M7 7h10v10H7z', 'M10 10h4v4h-4z', 'M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5'],
    arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
};

export function AuthIcon({ name, size = 20, strokeWidth = 1.6, className }) {
    return e('svg', {
        className, width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
    }, (PATHS[name] || []).map((d, i) => e('path', { key: i, d })));
}
