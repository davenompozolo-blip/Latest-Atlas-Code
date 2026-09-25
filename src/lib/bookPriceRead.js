// src/lib/bookPriceRead.js
//
// The one PostgREST path for "daily closes for the names in the book", used by
// api/nexus-theme.js and api/nexus-bench.js.
//
// Both used to filter through the embed:
//
//   price_history?select=...,assets!inner(symbol)&assets.symbol=in.(...)
//
// which makes Postgres range the whole 1,900-name window of price_history and
// narrow to the book only through the join. Measured as anon on 2026-09-25:
// page 0 cancelled at the 3s cap (57014) in 3.97s. Both handlers treat a failed
// first page as "no prices", so every theme read "Momentum pending -- price
// history syncing" and every Bench tape "No price series in window" -- a
// timeout rendered as a statement about the data -- and the theme answer was
// then CDN-cached for six hours.
//
// Resolving the book to asset ids first and filtering price_history on its own
// indexed columns returns the same 3,181 rows.
//
// ORDER IS ASSET-MAJOR, and that is a cost decision. Ordered price_date DESC
// the planner walks idx_price_history_price_date across ALL ~1,900 symbols and
// filters out the ~96% it does not want: 12,260 buffers for page 0 and 67,965
// at offset 3000 -- fast warm, over the 3s anon cap cold (measured 2026-09-25,
// a page 0 timed out under the Bench's concurrent reads). Ordered
// (asset_id, price_date DESC) it is served straight off
// idx_price_history_asset_interval_date with no sort: 714 buffers at page 0,
// 2,778 at offset 3000. Cost scales with the book, not the universe.
//
// The price: a truncated read now loses whole trailing NAMES rather than the
// oldest dates. So a caller must page until a short page and REPORT a cap or a
// failed page (pricesComplete / tapeAvailable) -- never truncate silently.
//
// `interval=eq.1d` is pinned because price_history carries a second spelling
// for SPY (CLAUDE.md, 2026-09-21), and with it (asset_id, price_date) is
// unique, so the ordering is total and OFFSET paging cannot repeat or skip.

// assets?select=id,symbol for a symbol list. `assets.symbol` is unique
// (assets_symbol_key), so the id -> symbol map is one-to-one.
export function assetIdsPath(symbols) {
    const syms = [...new Set((symbols || []).filter(Boolean))];
    if (!syms.length) return null;
    return 'assets?select=id,symbol&symbol=in.(' + syms.map(quote).join(',') + ')';
}

// price_history rows for those ids since `since` (YYYY-MM-DD), asset-major,
// newest first within each asset. Callers re-sort per symbol.
export function bookPricesPath(assetIds, since) {
    const ids = [...new Set((assetIds || []).filter(Boolean))];
    if (!ids.length) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(since || ''))) throw new Error('bookPricesPath: since must be YYYY-MM-DD');
    return 'price_history?select=price_date,close,asset_id'
        + '&asset_id=in.(' + ids.join(',') + ')'
        + '&interval=eq.1d'
        + '&price_date=gte.' + since
        + '&order=asset_id.asc,price_date.desc';
}

// Map rows of assets?select=id,symbol to id -> symbol.
export function symbolById(assetRows) {
    const m = new Map();
    for (const a of assetRows || []) if (a && a.id && a.symbol) m.set(a.id, a.symbol);
    return m;
}

// PostgREST `in.()` list: quote a value carrying a reserved character. Class
// shares (BRK.B) and some option symbols carry '.' or ',' and would otherwise
// split or mis-parse the list.
function quote(s) {
    const v = String(s);
    return /[,.()"\s:]/.test(v) ? '"' + v.replace(/"/g, '\\"') + '"' : v;
}
