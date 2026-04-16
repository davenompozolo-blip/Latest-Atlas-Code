// ============================================================
// ATLAS Terminal — Quant Dashboard Orchestrator
// ------------------------------------------------------------
// Loads the four quant Supabase views in parallel, computes the
// aggregate banner strip, and routes between the four panels.
// ============================================================

import { loadView } from './config.js';
import { quantTile } from './utils.js';
import { Loading, EmptyState } from './components.js';
import { SignalsPanel } from './quant-signals.js';
import { RollingPanel } from './quant-rolling.js';
import { CorrelationPanel } from './quant-correlation.js';
import { DrawdownPanel } from './quant-drawdown.js';

const { useState, useEffect } = React;

export function QuantDashboard() {
    const [signals, setSignals]         = useState(null);
    const [rolling, setRolling]         = useState(null);
    const [correlation, setCorrelation] = useState(null);
    const [drawdown, setDrawdown]       = useState(null);
    const [loading, setLoading]         = useState(true);
    const [activePanel, setActivePanel] = useState('signals');

    useEffect(() => {
        Promise.all([
            loadView('vw_quant_dashboard', []),
            loadView('vw_quant_rolling_returns', []),
            loadView('vw_quant_correlation', []),
            loadView('vw_quant_drawdown', []),
        ]).then(([s, r, c, d]) => {
            setSignals(s || []);
            setRolling(r || []);
            setCorrelation(c || []);
            setDrawdown(d || []);
            setLoading(false);
        });
    }, []);

    if (loading) return React.createElement(Loading, null);

    const sig = signals || [];
    const roll = rolling || [];
    const corr = correlation || [];
    const dd  = drawdown || [];

    if (!sig.length && !roll.length && !corr.length && !dd.length) {
        return React.createElement(EmptyState, null);
    }

    // --- Aggregate banner stats ---
    const uptrend    = sig.filter(d => d.price_regime === 'Uptrend').length;
    const downtrend  = sig.filter(d => d.price_regime === 'Downtrend').length;
    const sideways   = sig.filter(d => d.price_regime === 'Sideways').length;
    const overbought = sig.filter(d => d.mean_reversion_signal === 'Overbought').length;
    const oversold   = sig.filter(d => d.mean_reversion_signal === 'Oversold').length;
    const expanding  = sig.filter(d => d.vol_regime === 'Expanding').length;
    const rsiOver    = sig.filter(d => Number(d.rsi_14) >= 70).length;
    const rsiUnder   = sig.filter(d => Number(d.rsi_14) <= 30).length;

    const offCorrVals = corr
        .filter(c => c.symbol_a !== c.symbol_b && c.correlation != null)
        .map(c => Number(c.correlation));
    const avgCorr = offCorrVals.length
        ? offCorrVals.reduce((a, b) => a + b, 0) / offCorrVals.length
        : null;
    const highCorrPairs = corr.filter(c =>
        c.symbol_a !== c.symbol_b && Number(c.correlation) >= 0.80
    ).length / 2;  // each pair counted twice in symmetric matrix

    const inDD20  = dd.filter(d => Number(d.current_drawdown_pct) <= -0.20).length;
    const inDD10  = dd.filter(d => Number(d.current_drawdown_pct) <= -0.10).length;

    return React.createElement('div', null,
        React.createElement('div', { className: 'page-title' }, 'Quant Dashboard'),

        // === Aggregate metric strip ===
        React.createElement('div', { className: 'metrics-row' },
            quantTile('Positions', sig.length || dd.length || roll.length),
            quantTile('Trend (Up / Side / Down)',
                      uptrend + ' / ' + sideways + ' / ' + downtrend,
                      uptrend > downtrend ? 'positive' : downtrend > uptrend ? 'negative' : 'neutral'),
            quantTile('Mean-Rev (OB / OS)',
                      overbought + ' / ' + oversold,
                      overbought > oversold ? 'negative' : oversold > overbought ? 'positive' : ''),
            quantTile('RSI Extremes (>70 / <30)',
                      rsiOver + ' / ' + rsiUnder,
                      rsiOver > 0 ? 'negative' : rsiUnder > 0 ? 'positive' : ''),
            quantTile('Expanding Vol', expanding,
                      expanding > sig.length / 3 ? 'negative' : expanding > 0 ? 'neutral' : ''),
            quantTile('Avg Pairwise ρ',
                      avgCorr != null ? avgCorr.toFixed(2) : '\u2014',
                      avgCorr == null ? '' : avgCorr > 0.6 ? 'negative' : avgCorr > 0.4 ? 'neutral' : 'positive',
                      highCorrPairs > 0 ? (highCorrPairs.toFixed(0) + ' pair(s) ρ ≥ 0.8') : null),
            quantTile('Drawdowns (≤-10 / ≤-20%)',
                      inDD10 + ' / ' + inDD20,
                      inDD20 > 0 ? 'negative' : inDD10 > 0 ? 'neutral' : 'positive')
        ),

        // === Panel tabs ===
        React.createElement('div', { className: 'view-tabs' },
            React.createElement('div', {
                className: 'view-tab' + (activePanel === 'signals' ? ' active' : ''),
                onClick: () => setActivePanel('signals')
            }, 'Position Signals',
                React.createElement('span', { className: 'count-pill' }, sig.length)),
            React.createElement('div', {
                className: 'view-tab' + (activePanel === 'rolling' ? ' active' : ''),
                onClick: () => setActivePanel('rolling')
            }, 'Rolling Returns',
                React.createElement('span', { className: 'count-pill' }, roll.length)),
            React.createElement('div', {
                className: 'view-tab' + (activePanel === 'correlation' ? ' active' : ''),
                onClick: () => setActivePanel('correlation')
            }, 'Correlation Matrix',
                React.createElement('span', { className: 'count-pill' }, corr.length)),
            React.createElement('div', {
                className: 'view-tab' + (activePanel === 'drawdown' ? ' active' : ''),
                onClick: () => setActivePanel('drawdown')
            }, 'Drawdown Map',
                React.createElement('span', { className: 'count-pill' }, dd.length))
        ),

        // === Active panel content ===
        activePanel === 'signals'    ? React.createElement(SignalsPanel,    { rows: sig })
      : activePanel === 'rolling'    ? React.createElement(RollingPanel,    { rows: roll })
      : activePanel === 'correlation'? React.createElement(CorrelationPanel,{ rows: corr })
      :                                React.createElement(DrawdownPanel,   { rows: dd })
    );
}
