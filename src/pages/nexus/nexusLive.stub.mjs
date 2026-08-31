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
        { symbol: 'NVDA', sector: 'Technology', theme: 'AI / accelerated compute', weight_pct: 60, daily_return_pct: -2, var_contribution_pct: 70, conviction_score: 78, current_price: 100, dcf_upside_pct: 5, valuation_signal: 'Momentum cooling', quant_signal: 'Bullish',   technical_signal: '' },
        { symbol: 'CVX',  sector: 'Energy',     theme: 'Energy',                   weight_pct: 40, daily_return_pct:  1, var_contribution_pct: 30, conviction_score: 63, current_price: 150, dcf_upside_pct: 8, valuation_signal: 'Macro tailwind',   quant_signal: 'Improving', technical_signal: '' },
    ];

    function table(name) {
        return {
            select() { return this; },
            not() { return this; },
            // PostgREST builders are thenable; the provider awaits them directly.
            then(res) {
                if (MODE === 'error') return Promise.resolve({ data: null, error: new Error('stubbed failure') }).then(res);
                const holdings = name === 'vw_nexus_holdings';
                if (holdings && MODE === 'empty') return Promise.resolve({ data: [], error: null }).then(res);
                return Promise.resolve({ data: holdings ? BOOK : [], error: null }).then(res);
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
