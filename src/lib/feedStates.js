// Feed states for a page that reads several views at once.
//
// `loadView(name, fallback)` returned its fallback on ANY error, so a page could
// not tell "this view has no rows" from "this view was cancelled at the 3s anon
// cap" -- and four pages passed MOCK data as the fallback, so a timed-out
// command centre rendered a made-up $119,500 NAV and a 1.35 Sharpe as the book.
// `loadViewState` keeps ok / empty / partial / failed apart; this module lets a
// page load several views that way and say which ones did not answer.
//
// Pure: the loader is passed in, so the node suite can drive it with a stub.

export const FEED_OK = 'ok';
export const FEED_EMPTY = 'empty';
export const FEED_PARTIAL = 'partial';
export const FEED_FAILED = 'failed';

// names: view names. loadState: (name) => Promise<{ state, rows, error? }>.
// Never rejects: a loader that throws is recorded as that feed failing, so one
// bad view cannot take the page's other feeds down with it.
export async function loadFeeds(names, loadState) {
    const settled = await Promise.all(names.map(function (name) {
        return Promise.resolve()
            .then(function () { return loadState(name); })
            .catch(function (e) {
                return { state: FEED_FAILED, rows: [], error: (e && e.message) || String(e) };
            });
    }));
    const rows = {};
    const states = {};
    names.forEach(function (name, i) {
        const r = settled[i] || {};
        const state = r.state === FEED_OK || r.state === FEED_EMPTY || r.state === FEED_PARTIAL
            ? r.state : FEED_FAILED;
        rows[name] = Array.isArray(r.rows) ? r.rows : [];
        states[name] = r.error ? { state: state, error: r.error } : { state: state };
    });
    return { rows: rows, states: states, problems: feedProblems(states) };
}

// The feeds a page must SAY something about: failed ones (the data exists and
// the query did not answer) and partial ones (a response cap truncated them).
// An empty feed is an answer, not a problem.
export function feedProblems(states) {
    return Object.keys(states || {})
        .filter(function (n) {
            const s = states[n] && states[n].state;
            return s === FEED_FAILED || s === FEED_PARTIAL;
        })
        .map(function (n) {
            const out = { view: n, state: states[n].state };
            if (states[n].error) out.error = states[n].error;
            return out;
        });
}

export function feedFailed(states, name) {
    return !!(states && states[name] && states[name].state === FEED_FAILED);
}

// One sentence per page, naming the views. Absent when there is nothing to say,
// so a caller cannot render an empty notice.
export function feedNoticeText(problems) {
    if (!problems || !problems.length) return null;
    const failed = problems.filter(function (p) { return p.state === FEED_FAILED; }).map(function (p) { return p.view; });
    const partial = problems.filter(function (p) { return p.state === FEED_PARTIAL; }).map(function (p) { return p.view; });
    const parts = [];
    if (failed.length) {
        parts.push((failed.length === 1 ? 'One feed' : failed.length + ' feeds') + ' did not answer (' + failed.join(', ')
            + ') -- figures that depend on ' + (failed.length === 1 ? 'it' : 'them') + ' are absent, not zero.');
    }
    if (partial.length) {
        parts.push(partial.join(', ') + ' hit the 1,000-row response cap and ' + (partial.length === 1 ? 'is' : 'are') + ' shown partially.');
    }
    return parts.join(' ');
}
