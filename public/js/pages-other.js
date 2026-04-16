// ============================================================
// ATLAS Terminal — Secondary Pages
// ------------------------------------------------------------
// RiskAnalysis, PerformanceSuite, CommandCentre.
// These three pages share a similar (lighter) structure than
// PortfolioHome/QuantDashboard, so they live in a single module.
// ============================================================

import { sb, loadView, MOCK_COMMAND } from './config.js';
import { fmt, fmtPct, fmtCurrency, cls, badgeCls, healthCls } from './utils.js';
import { Loading, EmptyState } from './components.js';

const { useState, useEffect, useRef } = React;

// ============================================================
// RISK ANALYSIS
// ============================================================
export function RiskAnalysis() {
    const [risk, setRisk] = useState(null);
    const [command, setCommand] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            loadView('vw_risk_analysis', []),
            loadView('vw_command_centre', [MOCK_COMMAND])
        ]).then(([r, c]) => { setRisk(r); setCommand(c[0] || MOCK_COMMAND); setLoading(false); });
    }, []);

    if (loading) return React.createElement(Loading, null);
    if (!risk || !risk.length) return React.createElement(EmptyState, null);

    const c = command || MOCK_COMMAND;
    const highRisk = risk.filter(r => r.risk_tier === 'High Risk').length;
    const modRisk = risk.filter(r => r.risk_tier === 'Moderate Risk').length;
    const lowRisk = risk.filter(r => r.risk_tier === 'Low Risk').length;

    return React.createElement('div', null,
        React.createElement('div', { className: 'page-title' }, 'Risk Analysis'),
        React.createElement('div', { className: 'metrics-row' },
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Sharpe Ratio'), React.createElement('div', { className: 'value' }, fmt(c.sharpe_ratio))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Sortino Ratio'), React.createElement('div', { className: 'value' }, fmt(c.sortino_ratio))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Max Drawdown'), React.createElement('div', { className: 'value negative' }, fmt(c.drawdown_pct) + '%')),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Portfolio VaR (95%)'), React.createElement('div', { className: 'value' }, fmtCurrency(c.dollar_var_95)))
        ),
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(3, 1fr)' } },
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'High Risk'), React.createElement('div', { className: 'value negative' }, highRisk)),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Moderate Risk'), React.createElement('div', { className: 'value neutral' }, modRisk)),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Low Risk'), React.createElement('div', { className: 'value positive' }, lowRisk))
        ),
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Position Risk Breakdown'),
            React.createElement('div', { style: { overflowX: 'auto' } },
                React.createElement('table', { className: 'data-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            ['Symbol', 'Market Value', 'Weight %', 'Annual Vol', 'Vol Contribution', 'Daily VaR $', 'Risk Tier'].map(h =>
                                React.createElement('th', { key: h }, h)))),
                    React.createElement('tbody', null,
                        risk.map(r =>
                            React.createElement('tr', { key: r.symbol },
                                React.createElement('td', { style: { fontWeight: 600, color: '#00d4ff' } }, r.symbol),
                                React.createElement('td', null, fmtCurrency(r.market_value)),
                                React.createElement('td', null, fmtPct(r.weight)),
                                React.createElement('td', null, fmtPct(r.annual_vol)),
                                React.createElement('td', null, fmtPct(r.marginal_vol_contribution)),
                                React.createElement('td', null, fmtCurrency(r.dollar_var_95_daily)),
                                React.createElement('td', null, React.createElement('span', { className: 'badge ' + badgeCls(r.risk_tier) }, r.risk_tier))
                            ))
                    )
                )
            )
        )
    );
}

// ============================================================
// PERFORMANCE SUITE
// ============================================================
export function PerformanceSuite() {
    const [perf, setPerf] = useState(null);
    const [nav, setNav] = useState(null);
    const [loading, setLoading] = useState(true);
    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    useEffect(() => {
        Promise.all([
            loadView('vw_performance_suite', []),
            loadView('vw_portfolio_nav_daily', [])
        ]).then(([p, n]) => { setPerf(p); setNav(n); setLoading(false); });
    }, []);

    useEffect(() => {
        if (!nav || !nav.length || !chartRef.current) return;
        if (chartInstance.current) chartInstance.current.destroy();
        const sorted = [...nav].sort((a, b) => new Date(a.price_date) - new Date(b.price_date));
        chartInstance.current = new Chart(chartRef.current, {
            type: 'line',
            data: {
                labels: sorted.map(d => d.price_date),
                datasets: [{
                    label: 'Portfolio NAV',
                    data: sorted.map(d => Number(d.nav)),
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0,212,255,0.05)',
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: { ticks: { color: 'rgba(255,255,255,0.3)', maxTicksLimit: 12, font: { size: 10 } }, grid: { display: false } },
                    y: { ticks: { color: 'rgba(255,255,255,0.3)', callback: v => '$' + (v/1000).toFixed(0) + 'k', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                },
                plugins: { legend: { display: false } }
            }
        });
        return () => { if (chartInstance.current) chartInstance.current.destroy(); };
    }, [nav]);

    if (loading) return React.createElement(Loading, null);
    if (!perf || !perf.length) return React.createElement(EmptyState, null);

    const avgEfficiency = perf.reduce((s, p) => s + (Number(p.entry_efficiency_score) || 0), 0) / perf.length;
    const avgCAGR = perf.reduce((s, p) => s + (Number(p.annualised_return) || 0), 0) / perf.length;
    const cuts = perf.filter(p => p.cut_candidate_flag).length;
    const best = perf.reduce((b, p) => (Number(p.total_return_pct) || 0) > (Number(b.total_return_pct) || 0) ? p : b, perf[0]);

    return React.createElement('div', null,
        React.createElement('div', { className: 'page-title' }, 'Performance Suite'),
        React.createElement('div', { className: 'metrics-row' },
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Avg Entry Efficiency'), React.createElement('div', { className: 'value' }, fmt(avgEfficiency, 1) + '%')),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Avg Annualised Return'), React.createElement('div', { className: 'value ' + cls(avgCAGR) }, fmtPct(avgCAGR))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Cut Candidates'), React.createElement('div', { className: 'value ' + (cuts > 0 ? 'negative' : 'positive') }, cuts)),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Best Performer'), React.createElement('div', { className: 'value positive' }, best.symbol),
                React.createElement('div', { className: 'sub' }, fmtPct(best.total_return_pct)))
        ),
        nav && nav.length > 0 ? React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Portfolio NAV (FIFO)'),
            React.createElement('div', { className: 'chart-container' }, React.createElement('canvas', { ref: chartRef }))
        ) : null,
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'Position Performance (' + perf.length + ')'),
            React.createElement('div', { style: { overflowX: 'auto' } },
                React.createElement('table', { className: 'data-table' },
                    React.createElement('thead', null,
                        React.createElement('tr', null,
                            ['Symbol', 'Entry $', 'Current $', 'Entry Date', 'Days Held', 'Return %', 'CAGR %', 'Efficiency', 'Cut?'].map(h =>
                                React.createElement('th', { key: h }, h)))),
                    React.createElement('tbody', null,
                        perf.map(p =>
                            React.createElement('tr', { key: p.symbol },
                                React.createElement('td', { style: { fontWeight: 600, color: '#00d4ff' } }, p.symbol),
                                React.createElement('td', null, fmtCurrency(p.entry_price)),
                                React.createElement('td', null, fmtCurrency(p.current_price)),
                                React.createElement('td', { style: { fontFamily: 'DM Sans' } }, p.entry_date ? new Date(p.entry_date).toLocaleDateString() : '\u2014'),
                                React.createElement('td', null, p.days_held || '\u2014'),
                                React.createElement('td', { className: cls(p.total_return_pct) }, fmtPct(p.total_return_pct)),
                                React.createElement('td', { className: cls(p.annualised_return) }, fmtPct(p.annualised_return)),
                                React.createElement('td', null, fmt(p.entry_efficiency_score, 1)),
                                React.createElement('td', null, p.cut_candidate_flag ? React.createElement('span', { className: 'badge red' }, 'CUT') : React.createElement('span', { className: 'badge green' }, 'HOLD'))
                            ))
                    )
                )
            )
        )
    );
}

// ============================================================
// COMMAND CENTRE
// ============================================================
export function CommandCentre() {
    const [command, setCommand] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadView('vw_command_centre', [MOCK_COMMAND]).then(d => { setCommand(d[0] || MOCK_COMMAND); setLoading(false); });
    }, []);

    if (loading) return React.createElement(Loading, null);
    const c = command || MOCK_COMMAND;

    return React.createElement('div', null,
        React.createElement('div', { className: 'page-title' }, 'Command Centre'),
        // Health Score Hero
        React.createElement('div', { style: { textAlign: 'center', marginBottom: 32 } },
            React.createElement('div', { className: 'health-score ' + healthCls(c.atlas_health_score), style: { width: 120, height: 120, fontSize: 42, margin: '0 auto 12px' } },
                Math.round(c.atlas_health_score || 0)),
            React.createElement('div', { style: { fontSize: 18, fontWeight: 600 } }, 'ATLAS Health Score'),
            React.createElement('div', null, React.createElement('span', { className: 'badge ' + badgeCls(c.portfolio_health_status), style: { marginTop: 8, fontSize: 13, padding: '5px 16px' } }, c.portfolio_health_status))
        ),
        // Metrics Grid
        React.createElement('div', { className: 'metrics-row', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' } },
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Portfolio NAV'), React.createElement('div', { className: 'value' }, fmtCurrency(c.portfolio_nav))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Total Invested'), React.createElement('div', { className: 'value' }, fmtCurrency(c.total_invested))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Total Return'), React.createElement('div', { className: 'value ' + cls(c.total_return_pct) }, fmtPct(c.total_return_pct))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Sharpe Ratio'), React.createElement('div', { className: 'value' }, fmt(c.sharpe_ratio))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Sortino Ratio'), React.createElement('div', { className: 'value' }, fmt(c.sortino_ratio))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Max Drawdown'), React.createElement('div', { className: 'value negative' }, fmt(c.drawdown_pct) + '%')),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Daily VaR (95%)'), React.createElement('div', { className: 'value' }, fmtCurrency(c.dollar_var_95))),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Positions'), React.createElement('div', { className: 'value' }, c.position_count)),
            React.createElement('div', { className: 'metric-card' },
                React.createElement('div', { className: 'label' }, 'Days of History'), React.createElement('div', { className: 'value' }, c.days_of_history))
        ),
        // System Status
        React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'card-title' }, 'System Status'),
            React.createElement('table', { className: 'data-table' },
                React.createElement('tbody', null,
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'DM Sans', color: 'rgba(255,255,255,0.5)' } }, 'Supabase Connection'),
                        React.createElement('td', null, sb ? React.createElement('span', { className: 'badge green' }, 'Connected') : React.createElement('span', { className: 'badge amber' }, 'Demo Mode'))),
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'DM Sans', color: 'rgba(255,255,255,0.5)' } }, 'Last Computed'),
                        React.createElement('td', null, c.computed_at ? new Date(c.computed_at).toLocaleString() : '\u2014')),
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'DM Sans', color: 'rgba(255,255,255,0.5)' } }, 'Data Source'),
                        React.createElement('td', null, 'Supabase PostgreSQL + Alpaca Markets API')),
                    React.createElement('tr', null,
                        React.createElement('td', { style: { fontFamily: 'DM Sans', color: 'rgba(255,255,255,0.5)' } }, 'NAV Methodology'),
                        React.createElement('td', null, 'FIFO Transaction-Based Reconstruction'))
                )
            )
        )
    );
}
