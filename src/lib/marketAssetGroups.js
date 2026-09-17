// ============================================================
// ATLAS — cross-asset registry for the /api/macro ETF legs
// ------------------------------------------------------------
// `market-watch.js` carried this list privately, and G-1's market tape
// needed the same classification. A second copy is how two surfaces end
// up disagreeing about whether EEM is "global" or "emerging" — the same
// failure `nexusPairsCompute.js` refuses for pair-to-axis maps.
//
// THIS IS A UI REGISTRY AND THAT IS A GAP, not a design. `market_instruments`
// owns `tape_group` for the sixteen A0 legs and is the right home for this
// too; these sixteen are simply not registered there yet, and inventing rows
// for them is an A0-shaped data unit rather than part of a UI build. Recorded
// here so the next session does not mistake the gap for a decision.
//
// The ticker is the label everywhere. "EEM", never "Emerging markets" — the
// ETF is the measurement and the asset class is an interpretation of it.
// `proxies` carries that interpretation without letting it stand in for the
// measurement.
// ============================================================

export const ASSET_CLASSES = [
    {
        key: 'us', label: 'US EQUITIES',
        symbols: ['SPY', 'QQQ', 'IWM'],
        proxies: { SPY: 'S&P 500', QQQ: 'Nasdaq 100', IWM: 'Russell 2000' },
    },
    {
        key: 'global', label: 'GLOBAL',
        symbols: ['EFA', 'EEM', 'EWJ', 'EWG', 'EWU', 'EWY', 'EWH'],
        proxies: {
            EFA: 'MSCI EAFE', EEM: 'MSCI Emerging Markets', EWJ: 'Japan',
            EWG: 'Germany', EWU: 'UK', EWY: 'South Korea', EWH: 'Hong Kong',
        },
    },
    {
        key: 'rates', label: 'RATES & CREDIT',
        symbols: ['TLT', 'LQD', 'HYG'],
        proxies: { TLT: '20y+ Treasuries', LQD: 'IG corporates', HYG: 'HY corporates' },
    },
    {
        key: 'alts', label: 'COMMODITIES & FX',
        symbols: ['GLD', 'USO', 'UUP'],
        proxies: { GLD: 'Gold', USO: 'WTI crude', UUP: 'USD index' },
    },
];

// Flat symbol → { classKey, label, proxies } for a single lookup.
export const ASSET_INDEX = ASSET_CLASSES.reduce((m, c) => {
    for (const s of c.symbols) m[s] = { classKey: c.key, classLabel: c.label, proxiesFor: c.proxies[s] || null };
    return m;
}, {});

// ── GICS sector ETFs ────────────────────────────────────────────────
// The sector legs `/api/macro` returns, with the names it labels them
// with. G-6 needs the INVERSE -- book sector -> ETF -- to ask whether the
// book's sector weights line up with where the market moved.
//
// THE BOOK'S SECTOR STRINGS COME FROM THE DATABASE AND NEED NOT MATCH
// THESE. `assets.sector` is populated by a different vendor from Alpha
// Vantage's ETF labelling, so "Consumer Discretionary" and
// "Cons. Discretionary" are the same sector and different strings.
// Matching is therefore normalised AND the misses are reported -- a
// partial match is worse than none, because it reads as a data gap
// rather than as a join that did not land. That is this codebase's own
// finding from the sector/theme overlap, applied before it can bite.
export const SECTOR_ETF = {
    XLK: 'Technology', XLF: 'Financials', XLV: 'Health Care',
    XLY: 'Cons. Discretionary', XLC: 'Comm. Services', XLI: 'Industrials',
    XLP: 'Cons. Staples', XLE: 'Energy', XLU: 'Utilities',
    XLRE: 'Real Estate', XLB: 'Materials',
};

// Lower-cased, punctuation-stripped, with the common abbreviations
// expanded so a vendor difference is not read as a different sector.
export function normaliseSector(name) {
    if (name == null) return null;
    let s = String(name).toLowerCase().trim();
    if (!s) return null;
    s = s.replace(/\./g, ' ')
         .replace(/\bcons\b/g, 'consumer')
         .replace(/\bcomm\b/g, 'communication')
         .replace(/\bcommunications\b/g, 'communication')
         .replace(/\btech\b/g, 'technology')
         .replace(/\binfo(rmation)? technology\b/g, 'technology')
         .replace(/\bhealthcare\b/g, 'health care')
         .replace(/\bfinancial\b/g, 'financials')
         .replace(/\bservices\b/g, 'services')
         .replace(/[^a-z ]/g, ' ')
         .replace(/\s+/g, ' ')
         .trim();
    return s || null;
}

// normalised sector name -> ETF symbol
export const SECTOR_BY_NAME = Object.keys(SECTOR_ETF).reduce((m, sym) => {
    const k = normaliseSector(SECTOR_ETF[sym]);
    if (k) m[k] = sym;
    return m;
}, {});
