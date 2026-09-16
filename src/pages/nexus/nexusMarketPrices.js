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

const PAGE = 1000;

export async function fetchMarketPricesPaged(symbols, sinceIso, client = supabase) {
    const out = [];
    if (!symbols || !symbols.length) return out;
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await client
            .from('market_prices')
            .select('symbol,date,adj_close')
            .in('symbol', symbols)
            .gte('date', sinceIso)
            .order('date', { ascending: false })
            .range(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...(data || []));
        // A short page ends the read. Without this the loop cannot
        // terminate on an exact multiple of PAGE.
        if (!data || data.length < PAGE) break;
    }
    return out;
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
