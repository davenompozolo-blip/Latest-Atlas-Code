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
export const MOCK_COMMAND = {
    portfolio_nav: 119500,
    total_invested: 98000,
    total_return_pct: 0.2194,
    mtd_return_pct: 0.0234,
    ytd_return_pct: 0.2194,
    sharpe_ratio: 1.35,
    sortino_ratio: 1.82,
    drawdown_pct: -8.4,
    max_drawdown_pct: -0.084,
    dollar_var_95: 2850,
    daily_var_95: 2850,
    atlas_health_score: 72,
    health_score: 72,
    health_label: 'MODERATE',
    portfolio_health_status: 'Moderate',
    drift_alert_pct: 0.072,
    position_count: 55,
    days_of_history: 420,
    computed_at: new Date().toISOString(),
};

// 90-day synthetic NAV series for demo mode (used when live data is absent)
function _buildMockNav() {
    var series = [];
    var nav = 100000;
    var now = new Date('2026-05-16');
    for (var i = 89; i >= 0; i--) {
        var d = new Date(now);
        d.setDate(d.getDate() - i);
        var day = d.getDay();
        if (day === 0 || day === 6) continue; // skip weekends
        var daily = (Math.random() - 0.44) * 0.012; // slight positive drift
        nav = nav * (1 + daily);
        series.push({
            price_date: d.toISOString().slice(0, 10),
            nav: Math.round(nav * 100) / 100,
            daily_return: daily,
        });
    }
    // Pin final value to portfolio_nav
    if (series.length) series[series.length - 1].nav = 119500;
    return series;
}
export const MOCK_NAV = _buildMockNav();

export const MOCK_PERF_STATS = [
    { period: '1M', return_pct: 0.0234, benchmark_pct: 0.018 },
    { period: '3M', return_pct: 0.0712, benchmark_pct: 0.054 },
    { period: 'YTD', return_pct: 0.2194, benchmark_pct: 0.168 },
    { period: '1Y', return_pct: 0.2194, benchmark_pct: 0.168 },
];

export const MOCK_BENCHMARK_NAV = MOCK_NAV.map(function(p, i) {
    return { price_date: p.price_date, nav: 100000 * (1 + i * 0.00085) };
});
