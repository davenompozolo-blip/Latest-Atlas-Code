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
