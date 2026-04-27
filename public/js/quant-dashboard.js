// ============================================================
// ATLAS Terminal — Quant Dashboard Orchestrator
// ------------------------------------------------------------
// Loads the four quant Supabase views in parallel, computes the
// aggregate banner strip, and routes between the four panels.
// ============================================================

import { loadView } from './config.js';
import { Loading, EmptyState, HeroCard, NarrativeStrip } from './components.js';
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
    ).length / 2;

    const inDD20 = dd.filter(d => Number(d.current_drawdown_pct) <= -0.20).length;
    const inDD10 = dd.filter(d => Number(d.current_drawdown_pct) <= -0.10).length;

    // --- Accent logic for dynamic cards ---
    const trendAccent = uptrend > downtrend ? 'green' : downtrend > uptrend ? 'red' : 'amber';
    const trendColor  = uptrend > downtrend ? 'var(--green)' : downtrend > uptrend ? 'var(--red)' : 'var(--amber)';
    const corrAccent  = avgCorr == null ? 'indigo' : avgCorr > 0.6 ? 'red' : avgCorr > 0.4 ? 'amber' : 'green';
    const corrColor   = avgCorr == null ? 'var(--text)' : avgCorr > 0.6 ? 'var(--red)' : avgCorr > 0.4 ? 'var(--amber)' : 'var(--green)';
    const ddAccent    = inDD20 > 0 ? 'red' : inDD10 > 0 ? 'amber' : 'green';
    const ddColor     = inDD20 > 0 ? 'var(--red)' : inDD10 > 0 ? 'var(--amber)' : 'var(--green)';

    return React.createElement('div', null,
        React.createElement('div', { className: 'page-title' }, 'Quant Dashboard'),

        // === Aggregate regime banner — Hero Cards ===
        React.createElement('div', { className: 'hero-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginBottom: 20 } },
            React.createElement(HeroCard, {
                icon: '◉', label: 'POSITIONS', accent: 'indigo',
                value: String(sig.length || dd.length || roll.length)
            }),
            React.createElement(HeroCard, {
                icon: '◆', label: 'TREND  UP / SIDE / DOWN',
                value: uptrend + ' / ' + sideways + ' / ' + downtrend,
                color: trendColor, accent: trendAccent
            }),
            React.createElement(HeroCard, {
                icon: '≈', label: 'MEAN-REV  OB / OS',
                value: overbought + ' / ' + oversold,
                color: overbought > oversold ? 'var(--red)' : oversold > overbought ? 'var(--green)' : 'var(--text)',
                accent: overbought > oversold ? 'red' : oversold > overbought ? 'green' : 'amber'
            }),
            React.createElement(HeroCard, {
                icon: '✦', label: 'RSI EXTREMES  >70 / <30',
                value: rsiOver + ' / ' + rsiUnder,
                color: rsiOver > 0 ? 'var(--red)' : rsiUnder > 0 ? 'var(--green)' : 'var(--text)',
                accent: rsiOver > 0 ? 'red' : 'cyan'
            }),
            React.createElement(HeroCard, {
                icon: '≈', label: 'EXPANDING VOL',
                value: String(expanding),
                color: expanding > sig.length / 3 ? 'var(--red)' : expanding > 0 ? 'var(--amber)' : 'var(--green)',
                accent: expanding > sig.length / 3 ? 'red' : expanding > 0 ? 'amber' : 'green'
            }),
            React.createElement(HeroCard, {
                icon: '◆', label: 'AVG PAIRWISE ρ',
                value: avgCorr != null ? avgCorr.toFixed(2) : '—',
                color: corrColor, accent: corrAccent,
                sub: highCorrPairs > 0 ? highCorrPairs.toFixed(0) + ' pair(s) ρ≥0.8' : null
            }),
            React.createElement(HeroCard, {
                icon: '▽', label: 'DRAWDOWNS  ≤10 / ≤20%',
                value: inDD10 + ' / ' + inDD20,
                color: ddColor, accent: ddAccent
            })
        ),

        // === Quant insight strip ===
        React.createElement(NarrativeStrip, { items: (function() {
            var items = [];
            var total = sig.length || 1;
            items.push({
                icon: '◆',
                text: '<strong>' + uptrend + '/' + total + ' uptrend</strong>, ' + downtrend + ' downtrend, ' + sideways + ' sideways — ' +
                    (uptrend > downtrend ? '<span style="color:#10b981">bullish breadth</span>' : downtrend > uptrend ? '<span style="color:#ef4444">bearish breadth</span>' : '<span style="color:#f59e0b">mixed regime</span>')
            });
            if (rsiOver > 0 || rsiUnder > 0) items.push({
                icon: '✦',
                text: (rsiOver > 0 ? '<strong style="color:#ef4444">' + rsiOver + ' overbought (RSI≥70)</strong>' : '') +
                    (rsiOver > 0 && rsiUnder > 0 ? ' · ' : '') +
                    (rsiUnder > 0 ? '<strong style="color:#10b981">' + rsiUnder + ' oversold (RSI≤30)</strong>' : '')
            });
            if (avgCorr != null) items.push({
                icon: '≈',
                text: 'Avg pairwise ρ <strong>' + avgCorr.toFixed(2) + '</strong>' +
                    (avgCorr > 0.6 ? ' — <span style="color:#ef4444">high concentration risk, diversification reduced</span>' : avgCorr > 0.4 ? ' — moderate overlap' : ' — <span style="color:#10b981">well-diversified portfolio</span>') +
                    (highCorrPairs > 0 ? ', <strong>' + highCorrPairs.toFixed(0) + ' pair(s)</strong> ρ≥0.80' : '')
            });
            if (inDD20 > 0 || inDD10 > 0) items.push({
                icon: '▽',
                text: (inDD20 > 0 ? '<strong style="color:#ef4444">' + inDD20 + ' position(s) in deep drawdown (≥20%)</strong>' : '') +
                    (inDD20 > 0 && inDD10 > inDD20 ? ' · ' : '') +
                    (inDD10 > inDD20 ? (inDD10 - inDD20) + ' more in moderate drawdown (10-20%)' : '')
            });
            return items;
        })() }),

        // === Panel tabs (Performance Suite style) ===
        React.createElement('div', { style: { display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.07)' } },
            ...[
                { id: 'signals',     label: 'SIGNALS',     sub: 'Regime Breakdown',  n: sig.length },
                { id: 'rolling',     label: 'ROLLING',     sub: 'Period Analysis',   n: roll.length },
                { id: 'correlation', label: 'CORRELATION', sub: 'Pairwise ρ Matrix', n: corr.length },
                { id: 'drawdown',    label: 'DRAWDOWN',    sub: 'Recovery Map',      n: dd.length },
            ].map(function(t) {
                var a = activePanel === t.id;
                return React.createElement('button', {
                    key: t.id, onClick: () => setActivePanel(t.id),
                    style: { padding: '10px 24px 12px', border: 'none', borderBottom: '2px solid ' + (a ? '#00d4ff' : 'transparent'), background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, transition: 'all 0.15s ease', marginBottom: -1 }
                },
                    React.createElement('span', { style: { fontSize: 11, fontWeight: 700, letterSpacing: 1.2, fontFamily: 'JetBrains Mono', color: a ? '#00d4ff' : 'rgba(255,255,255,0.42)' } },
                        t.label + '  ' + (t.n > 0 ? '(' + t.n + ')' : '')),
                    React.createElement('span', { style: { fontSize: 9.5, color: a ? 'rgba(0,212,255,0.55)' : 'rgba(255,255,255,0.2)', fontFamily: 'DM Sans' } }, t.sub)
                );
            })
        ),

        // === Active panel content ===
        activePanel === 'signals'     ? React.createElement(SignalsPanel,     { rows: sig })
      : activePanel === 'rolling'     ? React.createElement(RollingPanel,     { rows: roll })
      : activePanel === 'correlation' ? React.createElement(CorrelationPanel, { rows: corr })
      :                                 React.createElement(DrawdownPanel,    { rows: dd })
    );
}
