// ============================================================
// Loader hook for nexusLiveOrdering.test.mjs — a second stub for
// ../config.js that additionally RECORDS every table read.
// ------------------------------------------------------------
// Kept separate from nexusLive.stub.mjs on purpose. That stub is what
// the provider acceptance suite is pinned to; adding instrumentation to
// it would mean the suite that guards the panel contract and the suite
// that guards fetch ordering share a fixture, and a change made for one
// could quietly alter the other.
//
// `sb.from(name)` appends `sb:<name>` to globalThis.__ORDER, which the
// ordering test interleaves with its own `fetch:<url>` entries to see
// which calls were ISSUED first — the property that decides whether the
// three panel fetches sit on the critical path or overlap it.
// ============================================================

const CONFIG = new URL('../config.js', import.meta.url).href;

const SOURCE = `
    let MODE = 'ok';

    const BOOK = [
        { symbol: 'NVDA', sector: 'Technology', theme: 'AI / accelerated compute', weight_pct: 60, daily_return_pct: -2, var_contribution_pct: 70, conviction_score: 78, current_price: 100, dcf_upside_pct: 5, valuation_signal: 'Momentum cooling', quant_signal: 'Bullish',   technical_signal: '' },
        { symbol: 'CVX',  sector: 'Energy',     theme: 'Energy',                   weight_pct: 40, daily_return_pct:  1, var_contribution_pct: 30, conviction_score: 63, current_price: 150, dcf_upside_pct: 8, valuation_signal: 'Macro tailwind',   quant_signal: 'Improving', technical_signal: '' },
    ];

    function table(name) {
        // Recorded at CALL time, not at resolution time — the question is the
        // order work was issued in, not the order it happened to finish in.
        if (globalThis.__ORDER) globalThis.__ORDER.push('sb:' + name);
        return {
            select() { return this; },
            not() { return this; },
            then(res) {
                if (MODE === 'error') return Promise.resolve({ data: null, error: new Error('stubbed failure') }).then(res);
                const holdings = name === 'vw_nexus_holdings';
                if (holdings && MODE === 'empty') return Promise.resolve({ data: [], error: null }).then(res);
                return Promise.resolve({ data: holdings ? BOOK : [], error: null }).then(res);
            },
        };
    }

    export let sb = { from: table };

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
