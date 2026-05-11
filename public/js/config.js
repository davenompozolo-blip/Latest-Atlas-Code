// ============================================================
// ATLAS Terminal — Configuration & Data Layer
// ------------------------------------------------------------
// This module owns:
//   • Supabase URL / anon-key resolution (Vercel injection target)
//   • Singleton `sb` client
//   • `loadView()` helper (feeds into __ATLAS_DATA_MODE__ flag)
//   • Mock fallback data for demo mode
//
// Vercel's inject-env.js string-replaces the `SUPABASE_KEY` line
// below at build time. Keep the exact pattern in sync there.
// ============================================================

window.ATLAS_CONFIG = window.ATLAS_CONFIG || {};
export const SUPABASE_URL = window.ATLAS_CONFIG.supabaseUrl || 'https://vdmojjszvvcithuxwexx.supabase.co';
export const SUPABASE_KEY = window.ATLAS_CONFIG.supabaseKey || '';

// --- Supabase Client ---
export const sb = SUPABASE_KEY
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

// Global data-mode flag: 'live' only if at least one view returned
// rows under the anon key. Otherwise 'mock' (fallback/demo).
window.__ATLAS_DATA_MODE__ = sb ? 'pending' : 'mock';

// ── Global refresh bus ────────────────────────────────────────────────────────
// Components subscribe via window.addEventListener('atlas:refresh', fn).
// Callers dispatch via triggerRefresh(). The SyncStatusPill fires this
// automatically when it detects a new Alpaca sync timestamp.
export function triggerRefresh() {
    window.dispatchEvent(new CustomEvent('atlas:refresh'));
}

export async function loadView(viewName, fallback = []) {
    if (!sb) return fallback;
    try {
        const { data, error } = await sb.from(viewName).select('*');
        if (error) throw error;
        if (data && data.length) {
            window.__ATLAS_DATA_MODE__ = 'live';
            return data;
        }
        console.warn('[ATLAS] ' + viewName + ': empty result (RLS blocking anon, or view has no rows) — using fallback');
        return fallback;
    } catch (e) {
        console.warn('[ATLAS] ' + viewName + ':', e.message);
        return fallback;
    }
}

// --- Mock Data (fallback when no Supabase key) ---
export const MOCK_POSITIONS = [
    { symbol: 'AAPL', name: 'Apple Inc.', quantity: 50, cost_basis: 178.50, current_price: 195.20, market_value: 9760, unrealised_return_pct: 0.0936, portfolio_weight: 0.082, annualised_vol: 0.28, sharpe_approx: 1.2, is_concentrated: false },
    { symbol: 'MSFT', name: 'Microsoft Corp', quantity: 30, cost_basis: 380.00, current_price: 425.80, market_value: 12774, unrealised_return_pct: 0.1205, portfolio_weight: 0.107, annualised_vol: 0.25, sharpe_approx: 1.5, is_concentrated: true },
    { symbol: 'NVDA', name: 'NVIDIA Corp', quantity: 20, cost_basis: 650.00, current_price: 890.50, market_value: 17810, unrealised_return_pct: 0.3700, portfolio_weight: 0.149, annualised_vol: 0.52, sharpe_approx: 2.1, is_concentrated: true },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', quantity: 40, cost_basis: 140.00, current_price: 162.30, market_value: 6492, unrealised_return_pct: 0.1593, portfolio_weight: 0.054, annualised_vol: 0.30, sharpe_approx: 0.9, is_concentrated: false },
];
export const MOCK_COMMAND = { portfolio_nav: 119500, total_invested: 98000, total_return_pct: 0.2194, sharpe_ratio: 1.35, sortino_ratio: 1.82, drawdown_pct: -8.4, dollar_var_95: 2850, atlas_health_score: 72, portfolio_health_status: 'Moderate', position_count: 55, days_of_history: 420, computed_at: new Date().toISOString() };
