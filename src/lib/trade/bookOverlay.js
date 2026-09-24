// Which universe members are in the ACTIVE account's book.
//
// `trade_universe_members` is written nightly by api/trade-sync.js as
// service_role, with no request context -- so its `book_state` and
// `held_weight_pct` always describe the DEFAULT portfolio. Everything else on
// the row (eligibility, rank, signals, liquidity) is a fact about the stock and
// holds for any account. Rendered as-is on Atlas Secondary, the universe map
// ringed Primary's holdings as "in book" -- SNDK, CRWV, MRVL -- a claim about a
// different book (MP-2's single-book-source defect, one table it missed).
//
// So the two book columns are recomputed here from the live, account-scoped
// book (`loadBook`, which reads vw_active_*). The stored values are never
// consulted: a stored "held" for a name the active account does not hold is
// exactly the error being removed.
//
// Equity is the denominator, matching trade-sync's own `bookWeight`. With no
// equity figure the weight is ABSENT (null), never 0 -- a held name at "0.00%"
// would read as a measurement.

/**
 * @param {Array<object>} members   normalised universe rows
 * @param {{positions: Array<{symbol:string, marketValue:number}>, account: ?{equity:number}}} book
 * @returns {Array<object>} new rows; inputs are not mutated
 */
export function overlayActiveBook(members, book) {
    // An unreadable book is UNKNOWN, not empty: every name gets a null book
    // state and weight, never "unowned". Marking the whole universe unowned
    // because a read failed is a claim about the account nobody measured.
    if (!book || book.available === false) {
        return (members || []).map((m) => ({ ...m, bookState: null, heldWeightPct: null }));
    }
    const bySymbol = new Map();
    for (const p of (book && book.positions) || []) {
        bySymbol.set(p.symbol, (bySymbol.get(p.symbol) || 0) + Number(p.marketValue || 0));
    }
    const equity = book && book.account && Number.isFinite(book.account.equity) && book.account.equity > 0
        ? book.account.equity : null;

    return (members || []).map((m) => {
        const held = bySymbol.has(m.symbol);
        return {
            ...m,
            bookState: held ? 'held' : 'unowned',
            heldWeightPct: held && equity != null ? (bySymbol.get(m.symbol) / equity) * 100 : null,
        };
    });
}

/** Symbols in the active book, for fetching held members the sample would miss. */
export function heldSymbols(book) {
    return [...new Set(((book && book.positions) || []).map((p) => p.symbol))];
}
