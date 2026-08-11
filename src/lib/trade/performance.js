// ATLAS Trade — period performance for the ticket's identity strip.
//
// Day / WTD / MTD / YTD, each measured from the last close of the session
// BEFORE the period opened, which is the only anchor that makes "week to date"
// mean the same thing on a Monday as it does on a Friday.
//
// A period with no anchor on file returns null rather than zero. A book whose
// price history starts in July cannot have a year-to-date figure, and printing
// 0.00% would be a claim that it was flat.

import { isNum } from './stats.js';

/** Monday of the ISO week containing `d`, as a YYYY-MM-DD string. */
function weekStart(d) {
    const dt = new Date(d + 'T00:00:00Z');
    const dow = (dt.getUTCDay() + 6) % 7;          // Mon = 0
    dt.setUTCDate(dt.getUTCDate() - dow);
    return dt.toISOString().slice(0, 10);
}

const monthStart = (d) => d.slice(0, 8) + '01';
const yearStart = (d) => d.slice(0, 4) + '-01-01';

/**
 * The last bar strictly before `boundary`. That bar is the base the period is
 * measured from: for MTD it is the final close of the previous month, so the
 * first session of a month already shows that session's move.
 */
function baseBefore(bars, boundary) {
    for (let i = bars.length - 1; i >= 0; i--) {
        if (bars[i].d < boundary && isNum(bars[i].c) && bars[i].c > 0) return bars[i];
    }
    return null;
}

/**
 * @param {Array<{d: string, c: number}>} bars ascending by date
 * @returns {{last, asOf, day, wtd, mtd, ytd}} returns as decimals, null where unmeasurable
 */
export function performanceSnapshot(bars) {
    const clean = (bars || []).filter((b) => b && b.d && isNum(b.c) && b.c > 0);
    if (!clean.length) return { last: null, asOf: null, day: null, wtd: null, mtd: null, ytd: null };

    const last = clean[clean.length - 1];
    const pct = (base) => (base && base.c > 0 ? last.c / base.c - 1 : null);

    return {
        last: last.c,
        asOf: last.d,
        day: clean.length >= 2 ? pct(clean[clean.length - 2]) : null,
        wtd: pct(baseBefore(clean, weekStart(last.d))),
        mtd: pct(baseBefore(clean, monthStart(last.d))),
        ytd: pct(baseBefore(clean, yearStart(last.d))),
    };
}

export const PERIODS = [
    { key: 'day', label: 'DAY' },
    { key: 'wtd', label: 'WTD' },
    { key: 'mtd', label: 'MTD' },
    { key: 'ytd', label: 'YTD' },
];
