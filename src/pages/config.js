// Compatibility shim — re-exports everything pages expect from the old config.js
// All Supabase logic lives in src/lib/supabase.js
export { supabase as sb, loadViewState } from '../lib/supabase.js';
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vdmojjszvvcithuxwexx.supabase.co';

export function triggerRefresh() {
    window.dispatchEvent(new CustomEvent('atlas:refresh'));
}

// Mock book data (positions, command centre, PCM allocation/factors/risk/drift)
// was removed 2026-09-25: every page that fell back to it rendered a sample book
// as the real one whenever a feed did not answer. Pages read loadViewState and
// say which feed failed (src/lib/feedStates.js).

// The live vw_command_centre exposes different column names than the legacy
// command shape the UI was built against, so cards reading the old names
// (Sortino, VaR$, Days, Total Return) rendered "—" against real data (PF-07).
// Alias the canonical columns onto the names every consumer already reads, so
// the same figure flows whichever name the view carries.
export function normalizeCommand(c) {
    if (!c) return c;
    var out = Object.assign({}, c);
    if (out.sortino_ratio   == null && out.sortino_annualised   != null) out.sortino_ratio   = out.sortino_annualised;
    if (out.days_of_history == null && out.trading_days         != null) out.days_of_history = out.trading_days;
    if (out.dollar_var_95   == null && out.var_95_daily_dollar  != null) out.dollar_var_95   = out.var_95_daily_dollar;
    if (out.total_return_pct == null && out.unrealised_return_pct != null) out.total_return_pct = out.unrealised_return_pct;
    return out;
}

// --- PCM IPS form default (an editable template, marked unsaved) ---
export const MOCK_PCM_IPS = {
    risk_tolerance: 7, risk_label: 'Aggressive', return_target: 12.5,
    time_horizon: '10 Years', benchmark: 'SPY', concentration_limit: 20,
    liquidity_need: 'Medium',
};
