// ============================================================
// Loader hook for nexusLiveProvider.test.mjs — swaps src/pages/config.js
// for a stub whose `sb` the test drives per case.
// ------------------------------------------------------------
// The provider imports Supabase through ../config.js, which reaches for
// import.meta.env and @supabase/supabase-js. Neither exists under plain
// node, and neither is what the provider test is about: the question is
// what getNexusModel() returns when `sb` is null, empty or erroring.
// Registered via module.register() from the test.
//
// `sb` is an ESM LIVE BINDING driven by __configure(), not a value read
// from the environment at module-eval time. The environment version was
// tried first and made the whole suite vacuous: the stub is cached under
// one URL, so it evaluated once on the first case and every later case
// silently re-ran the healthy path — including the sb-null case the suite
// exists for, which passed against a deliberately broken provider.
// ============================================================

const CONFIG = new URL('../config.js', import.meta.url).href;

const SOURCE = `
    // 'null' → unconfigured; 'empty' → no holdings; 'error' → the view throws;
    // anything else → a healthy two-name book.
    let MODE = 'ok';

    const BOOK = [
        // market_value is what bookNav() reads (weight = |mv| / NAV). Without
        // it NAV is null and the Risk gauge falls back to the baseline — which
        // is correct behaviour, but it made the stub unable to exercise the
        // gauge at all. NAV here resolves to 100,000.
        { symbol: 'NVDA', sector: 'Technology', theme: 'AI / accelerated compute', weight_pct: 60, market_value: 60000, daily_return_pct: -2, var_contribution_pct: 70, conviction_score: 78, current_price: 100, dcf_upside_pct: 5, valuation_signal: 'Momentum cooling', quant_signal: 'Bullish',   technical_signal: '' },
        { symbol: 'CVX',  sector: 'Energy',     theme: 'Energy',                   weight_pct: 40, market_value: 40000, daily_return_pct:  1, var_contribution_pct: 30, conviction_score: 63, current_price: 150, dcf_upside_pct: 8, valuation_signal: 'Macro tailwind',   quant_signal: 'Improving', technical_signal: '' },
    ];

    // Two sessions of book risk, so the Risk gauge is exercised for real
    // rather than falling into its own catch. VaR 5000 against a NAV of
    // 100 (60+40 weight → bookNav) is deliberately over any sane cap; the
    // suite asserts the utilisation, not that it looks comfortable.
    const RISK = [
        { as_of: '2026-09-07', book_var_95_daily: 5650.62, total_vol_annual: 0.1046 },
        { as_of: '2026-09-04', book_var_95_daily: 5629.10, total_vol_annual: 0.1044 },
    ];

    function table(name) {
        return {
            select() { return this; },
            not() { return this; },
            // The real builder carries these; a stub that omits them sends
            // every chained loader into its catch, where it looks like a
            // clean fallback and tests nothing.
            order() { return this; },
            limit() { return this; },
            range() { return this; },
            in() { return this; },
            eq() { return this; },
            gte() { return this; },
            // PostgREST builders are thenable; the provider awaits them directly.
            then(res) {
                if (MODE === 'error') return Promise.resolve({ data: null, error: new Error('stubbed failure') }).then(res);
                const holdings = name === 'vw_nexus_holdings';
                if (holdings && MODE === 'empty') return Promise.resolve({ data: [], error: null }).then(res);
                const data = holdings ? BOOK : name === 'book_risk_daily' ? RISK : [];
                return Promise.resolve({ data, error: null }).then(res);
            },
        };
    }

    export let sb = { from: table };

    // Reassigning here updates every importer's binding, so the provider sees
    // the new state without the module graph being rebuilt.
    export function __configure(mode) {
        MODE = mode;
        sb = mode === 'null' ? null : { from: table };
    }

    export const loadView = async () => [];
    export const SUPABASE_URL = 'https://stub.invalid';
    export function triggerRefresh() {}
`;

export async function load(url, ctx, next) {
    if (url === CONFIG) return { format: 'module', shortCircuit: true, source: SOURCE };
    return next(url, ctx);
}
