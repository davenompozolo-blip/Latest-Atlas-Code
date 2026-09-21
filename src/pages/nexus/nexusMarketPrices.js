// ============================================================
// ATLAS Nexus — the one paged read of `market_prices`.
// ------------------------------------------------------------
// PostgREST caps at 1,000 rows whatever `limit` says. This codebase has
// been bitten by that four times in four different layers — the bench
// pager, the theme handler, performance-suite's batches, and the pair
// explorer — so there is exactly one implementation of the read and both
// consumers call it.
//
// ORDER DESC AND PAGE. DESC is about which rows survive a truncation: if
// a bounded fetch ever truncates it must lose the OLDEST rows, never the
// current session. A short tape is usable; a stale one is a lie.
// ============================================================

import { supabase } from '../../lib/supabase.js';
import { fetchPaged } from '../../lib/pagedRead.js';

// ORDER ON A TOTAL KEY (2026-09-21). DESC alone was only half the rule.
// `date` is not a total ordering -- ~1,500 symbols share every date -- and
// LIMIT/OFFSET over a non-total ordering has no consistency guarantee
// between requests, so rows can repeat or be skipped across a page
// boundary. `market_prices` is keyed on (symbol, date), so adding `symbol`
// makes the sort total and the paging deterministic.
//
// The loop also went through `src/lib/pagedRead.js` rather than keeping its
// own copy, which is what caps it: it was driven entirely by the server's
// own response, so a server that stopped honouring `range` would spin
// forever, and a hang is the one failure that reports nothing at all.
export async function fetchMarketPricesPaged(symbols, sinceIso, client = supabase) {
    if (!symbols || !symbols.length) return [];
    return fetchPaged(function (from, to) {
        return client
            .from('market_prices')
            .select('symbol,date,adj_close')
            .in('symbol', symbols)
            .gte('date', sinceIso)
            .order('date', { ascending: false })
            .order('symbol', { ascending: true })
            .range(from, to);
    }, 'market_prices');
}

// Fetch DESC, hand back a date-keyed map. Consumers sort keys themselves;
// nothing downstream may depend on insertion order.
export function indexBySymbol(rows) {
    const bySymbol = {};
    for (const r of rows || []) {
        if (!r || r.adj_close == null) continue;
        (bySymbol[r.symbol] = bySymbol[r.symbol] || {})[r.date] = Number(r.adj_close);
    }
    return bySymbol;
}
