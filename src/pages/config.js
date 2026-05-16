// Compatibility shim — re-exports everything pages expect from the old config.js
// All Supabase logic lives in src/lib/supabase.js
export { supabase as sb, loadView } from '../lib/supabase.js';
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vdmojjszvvcithuxwexx.supabase.co';

export function triggerRefresh() {
    window.dispatchEvent(new CustomEvent('atlas:refresh'));
}

export const MOCK_POSITIONS = [
    { symbol: 'AAPL', name: 'Apple Inc.', quantity: 50, cost_basis: 178.50, current_price: 195.20, market_value: 9760, unrealised_return_pct: 0.0936, portfolio_weight: 0.082, annualised_vol: 0.28, sharpe_approx: 1.2, is_concentrated: false },
    { symbol: 'MSFT', name: 'Microsoft Corp', quantity: 30, cost_basis: 380.00, current_price: 425.80, market_value: 12774, unrealised_return_pct: 0.1205, portfolio_weight: 0.107, annualised_vol: 0.25, sharpe_approx: 1.5, is_concentrated: true },
    { symbol: 'NVDA', name: 'NVIDIA Corp', quantity: 20, cost_basis: 650.00, current_price: 890.50, market_value: 17810, unrealised_return_pct: 0.3700, portfolio_weight: 0.149, annualised_vol: 0.52, sharpe_approx: 2.1, is_concentrated: true },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', quantity: 40, cost_basis: 140.00, current_price: 162.30, market_value: 6492, unrealised_return_pct: 0.1593, portfolio_weight: 0.054, annualised_vol: 0.30, sharpe_approx: 0.9, is_concentrated: false },
];
export const MOCK_COMMAND = { portfolio_nav: 119500, total_invested: 98000, total_return_pct: 0.2194, sharpe_ratio: 1.35, sortino_ratio: 1.82, drawdown_pct: -8.4, dollar_var_95: 2850, atlas_health_score: 72, portfolio_health_status: 'Moderate', position_count: 55, days_of_history: 420, computed_at: new Date().toISOString() };

// --- PCM Mock Data ---
export const MOCK_PCM_IPS = {
    risk_tolerance: 7, risk_label: 'Aggressive', return_target: 12.5,
    time_horizon: '10 Years', benchmark: 'SPY', concentration_limit: 20,
    liquidity_need: 'Medium',
};
export const MOCK_PCM_ALLOCATION = [
    { asset_class: 'EQUITY',       current_weight: 82.1, saa_floor: 70, saa_ceil: 85, taa_target: 75 },
    { asset_class: 'FIXED_INCOME', current_weight:  4.8, saa_floor:  0, saa_ceil: 10, taa_target:  8 },
    { asset_class: 'ALTERNATIVE',  current_weight:  8.2, saa_floor: 10, saa_ceil: 20, taa_target: 12 },
    { asset_class: 'CASH',         current_weight:  4.9, saa_floor:  2, saa_ceil:  5, taa_target:  5 },
];
export const MOCK_PCM_FACTORS = [
    { factor: 'Momentum',      score:  0.82, direction: 'Overweight'  },
    { factor: 'Quality',       score:  0.61, direction: 'Overweight'  },
    { factor: 'Growth',        score:  0.54, direction: 'Moderate'    },
    { factor: 'Value',         score: -0.12, direction: 'Neutral'     },
    { factor: 'Low Vol',       score: -0.48, direction: 'Underweight' },
    { factor: 'Profitability', score:  0.44, direction: 'Moderate'    },
    { factor: 'Size',          score:  0.08, direction: 'Neutral'     },
];
export const MOCK_PCM_RISK = [
    { ticker: 'NVDA',  weight: 14.2, vol_90d: 42.1, mrc: 0.041, prc: 22.3 },
    { ticker: 'AAPL',  weight: 11.8, vol_90d: 24.3, mrc: 0.019, prc: 10.3 },
    { ticker: 'MSFT',  weight: 10.4, vol_90d: 26.7, mrc: 0.026, prc: 14.1 },
    { ticker: 'META',  weight:  8.1, vol_90d: 38.4, mrc: 0.022, prc: 11.9 },
    { ticker: 'GOOGL', weight:  7.3, vol_90d: 27.2, mrc: 0.014, prc:  7.6 },
];
export const MOCK_PCM_DRIFT = {
    aggregate_drift: 7.2, trigger_fired: true,
    trades: [
        { ticker: 'NVDA', action: 'SELL', delta_shares: -12, est_value: 7240, rationale: 'Overweight vs SAA target' },
        { ticker: 'BND',  action: 'BUY',  delta_shares:  48, est_value: 4560, rationale: 'Fixed income underweight' },
        { ticker: 'IEFA', action: 'BUY',  delta_shares:  22, est_value: 1980, rationale: 'Alternatives underweight' },
    ],
};
