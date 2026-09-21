// ============================================================
// ATLAS — one paged PostgREST read.
// ------------------------------------------------------------
// PostgREST caps a response at 1,000 rows whatever `limit` says. This
// codebase has now been bitten by that in six layers: `api/nexus-bench.js`,
// `api/nexus-theme.js`, `performance-suite.js`, the pair explorer, the
// Trade risk layer, and the Risk page's own return series.
//
// `limit` is a request, not a guarantee. So is no limit.
//
// TWO rules, and the second is the one the earlier copies got wrong:
//
//   1. ORDER DESC on a time series. DESC decides which rows survive a
//      truncation — lose the OLDEST bars, never the current session. A
//      short tape is usable; a stale one is a lie.
//
//   2. ORDER ON A TOTAL KEY. `LIMIT`/`OFFSET` over a non-total ordering
//      has no consistency guarantee between requests, so a series ordered
//      by date alone — where hundreds of rows share a date — can repeat
//      or skip rows across page boundaries. Pass a tiebreaker that makes
//      the sort total, and this module will not let you forget: it is a
//      required argument.
// ============================================================

export const PAGE_SIZE = 1000;

// A hang is the one failure that reports nothing at all. The loop is
// driven by the server's own response, so a server that stopped honouring
// `range` would spin forever; cap it and say so at error level.
export const MAX_PAGES = 64;

/**
 * Page a PostgREST read until a short page ends it.
 *
 * @param {(from:number,to:number)=>PromiseLike<{data:any[],error:any}>} pageQuery
 *        Builds one page. It MUST already carry a total ordering — see rule 2.
 * @param {string} label  Relation name, used only in the cap's error line.
 * @returns {Promise<any[]>} every row, in the order the server returned them.
 */
export function fetchPaged(pageQuery, label) {
    if (typeof pageQuery !== 'function') {
        throw new TypeError('fetchPaged: pageQuery must be a function');
    }
    if (!label) {
        // The label is required so the cap's error line can name the read.
        throw new TypeError('fetchPaged: label is required');
    }
    var acc = [];
    function page(n) {
        var from = n * PAGE_SIZE;
        return Promise.resolve(pageQuery(from, from + PAGE_SIZE - 1)).then(function (res) {
            if (res && res.error) throw res.error;
            var got = (res && res.data) || [];
            acc = acc.concat(got);
            // A full page means there may be more; a short one is the end.
            if (got.length < PAGE_SIZE) return acc;
            if (n + 1 >= MAX_PAGES) {
                console.error(
                    '[pagedRead] ' + label + ': hit the ' + MAX_PAGES +
                    '-page cap at ' + acc.length + ' rows. The read is TRUNCATED; ' +
                    'narrow the filter or raise MAX_PAGES deliberately.'
                );
                return acc;
            }
            return page(n + 1);
        });
    }
    return page(0);
}
