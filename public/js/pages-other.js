// ============================================================
// ATLAS Terminal — Secondary Pages
// ------------------------------------------------------------
// RiskAnalysis, CommandCentre.
// PerformanceSuite moved to performance-suite.js (v2 retrofit).
// ============================================================

import { sb, loadView, MOCK_COMMAND } from './config.js';
import { fmt, fmtPct, fmtCurrency, cls, badgeCls, healthCls, sharpeStatus, ddStatus, returnStatus } from './utils.js';
import { Loading, EmptyState, HeroCard } from './components.js';

const { useState, useEffect } = React;

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

    var ddVal = c.drawdown_pct != null ? c.drawdown_pct / 100 : null;

    return React.createElement('div', null,
        React.createElement('div', { className: 'page-title' }, 'Risk Analysis'),
        // Primary risk KPIs
        React.createElement('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 } },
            React.createElement(HeroCard, {
                icon: '✦',
                label: 'SHARPE RATIO',
                value: fmt(c.sharpe_ratio),
                color: c.sharpe_ratio > 1 ? 'var(--green)' : c.sharpe_ratio > 0 ? 'var(--amber)' : 'var(--red)',
                accent: 'cyan',
                badge: sharpeStatus(c.sharpe_ratio)
            }),
            React.createElement(HeroCard, {
                icon: '◈',
                label: 'SORTINO RATIO',
                value: fmt(c.sortino_ratio),
                color: c.sortino_ratio > 1 ? 'var(--green)' : c.sortino_ratio > 0 ? 'var(--amber)' : 'var(--red)',
                accent: 'violet',
                badge: sharpeStatus(c.sortino_ratio)
            }),
            React.createElement(HeroCard, {
                icon: '▽',
                label: 'MAX DRAWDOWN',
                value: c.drawdown_pct != null ? fmt(c.drawdown_pct, 2) + '%' : '—',
                color: 'var(--red)',
                accent: 'red',
                badge: ddStatus(ddVal)
            }),
            React.createElement(HeroCard, {
                icon: '⚠',
                label: 'PORTFOLIO VAR (95%)',
                value: fmtCurrency(c.dollar_var_95),
                accent: 'amber'
            })
        ),
        // Risk tier counts
        React.createElement('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 } },
            React.createElement(HeroCard, { icon: '⬡', label: 'HIGH RISK POSITIONS',  value: String(highRisk), color: 'var(--red)',   accent: 'red' }),
            React.createElement(HeroCard, { icon: '⬡', label: 'MODERATE RISK',        value: String(modRisk),  color: 'var(--amber)', accent: 'amber' }),
            React.createElement(HeroCard, { icon: '⬡', label: 'LOW RISK POSITIONS',   value: String(lowRisk),  color: 'var(--green)', accent: 'green' })
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
        // Metrics Grid — Hero Cards
        React.createElement('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 } },
            React.createElement(HeroCard, {
                icon: '◊', label: 'PORTFOLIO NAV', value: fmtCurrency(c.portfolio_nav), accent: 'cyan'
            }),
            React.createElement(HeroCard, {
                icon: '◇', label: 'TOTAL INVESTED', value: fmtCurrency(c.total_invested), accent: 'indigo'
            }),
            React.createElement(HeroCard, {
                icon: (c.total_return_pct || 0) >= 0 ? '▲' : '▽',
                label: 'TOTAL RETURN',
                value: fmtPct(c.total_return_pct),
                color: (c.total_return_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)',
                accent: (c.total_return_pct || 0) >= 0 ? 'green' : 'red',
                badge: returnStatus(c.total_return_pct)
            }),
            React.createElement(HeroCard, {
                icon: '✦', label: 'SHARPE RATIO', value: fmt(c.sharpe_ratio),
                color: c.sharpe_ratio > 1 ? 'var(--green)' : c.sharpe_ratio > 0 ? 'var(--amber)' : 'var(--red)',
                accent: 'cyan', badge: sharpeStatus(c.sharpe_ratio)
            }),
            React.createElement(HeroCard, {
                icon: '◈', label: 'SORTINO RATIO', value: fmt(c.sortino_ratio),
                color: c.sortino_ratio > 1 ? 'var(--green)' : c.sortino_ratio > 0 ? 'var(--amber)' : 'var(--red)',
                accent: 'violet', badge: sharpeStatus(c.sortino_ratio)
            }),
            React.createElement(HeroCard, {
                icon: '▽', label: 'MAX DRAWDOWN',
                value: c.drawdown_pct != null ? fmt(c.drawdown_pct, 2) + '%' : '—',
                color: 'var(--red)', accent: 'red',
                badge: ddStatus(c.drawdown_pct != null ? c.drawdown_pct / 100 : null)
            }),
            React.createElement(HeroCard, {
                icon: '⚠', label: 'DAILY VAR (95%)', value: fmtCurrency(c.dollar_var_95), accent: 'amber'
            }),
            React.createElement(HeroCard, {
                icon: '◉', label: 'POSITIONS', value: String(c.position_count || '—'), accent: 'indigo'
            }),
            React.createElement(HeroCard, {
                icon: '≡', label: 'DAYS OF HISTORY', value: String(c.days_of_history || '—'), accent: 'indigo'
            })
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
