// ============================================================
// ATLAS Nexus — Portfolio snapshot (Flagship header)
// ------------------------------------------------------------
// The book at a glance, in the Flagship aesthetic: account economics
// (equity, exposure, cash, P&L) self-fetched live from /api/trading,
// and the position-level stats (positions, win rate, today, at-risk,
// concentration, best/worst, quality) from the resolved model. Pure
// aggregation lives in nexusLiveCompute.buildPortfolioSnapshot.
// ============================================================

import React from 'react';

const { useState, useEffect } = React;
const e = React.createElement;

const money = v => (v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US'));
const sgnMoney = v => (v == null ? '—' : (v >= 0 ? '+$' : '−$') + Math.round(Math.abs(v)).toLocaleString('en-US'));
const sgnPct = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');
const moveTone = v => (v == null ? '' : v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : '');
const winTone = w => (w == null ? '' : w >= 55 ? 'tone-up' : w >= 45 ? 'tone-warn' : 'tone-down');
const qualityTone = q => (q == null ? '' : q >= 80 ? 'tone-up' : q >= 65 ? 'tone-warn' : 'tone-down');

function useAccount() {
    const [a, setA] = useState(null);
    useEffect(function () {
        let alive = true;
        fetch('/api/trading?action=account').then(r => (r.ok ? r.json() : null))
            .then(j => { if (alive && j && j.equity != null) setA(j); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    return a;
}

// The four figures that carry a decision. Everything else in the snapshot is
// orientation, and orientation does not need a tile each.
const DECISION_TILES = ['Day P&L', 'Unrealised P&L', 'Long exposure', 'At risk'];

// `compact` is the v2 treatment: those four keep tile treatment, the other
// seven collapse into one mono line of label/value pairs. Same data, same
// relative order within each tier, ~85% less vertical. v1 passes nothing.
export function PortfolioSnapshot({ model, compact }) {
    const p = model && model.portfolio;
    const acct = useAccount();
    if (!p) return null;

    const lev = acct && acct.equity ? (acct.long_market_value / acct.equity) : null;
    // Each tile colour-codes its value by meaning (P&L green/red, risk red,
    // quality/win-rate graded), so the snapshot reads at a glance.
    const defs = [
        { l: 'Account equity', v: money(acct && acct.equity), s: 'cash + longs − margin', t: 'accent' },
        { l: 'Long exposure', v: money(acct && acct.long_market_value), s: p.positions + ' positions' + (lev ? ' · ' + lev.toFixed(2) + '× lev' : '') },
        { l: 'Cash / margin', v: acct ? money(acct.cash) : '—', s: acct && acct.cash < 0 ? 'on margin' : 'uninvested', t: acct && acct.cash < 0 ? 'tone-down' : '' },
        { l: 'Day P&L', v: acct ? sgnMoney(acct.dayPnl) : '—', s: acct ? sgnPct(acct.dayPnlPct) + ' today' : null, t: acct ? moveTone(acct.dayPnl) : '' },
        { l: 'Unrealised P&L', v: sgnMoney(p.unrealisedPnl), s: sgnPct(p.totalReturnPct) + ' total return', t: moveTone(p.unrealisedPnl) },
        { l: 'Win rate', v: p.winRate == null ? '—' : p.winRate + '%', s: p.winners + ' winners · ' + p.losers + ' losers', t: winTone(p.winRate) },
        { l: 'Today', v: p.todayUp + ' / ' + p.todayDown, s: 'up / down', t: p.todayUp > p.todayDown ? 'tone-up' : p.todayUp < p.todayDown ? 'tone-down' : '' },
        { l: 'At risk', v: String(p.atRisk), s: 'positions down > 10%', t: p.atRisk > 0 ? 'tone-down' : 'tone-up' },
        { l: 'Top concentration', v: p.topSymbol ? p.topSymbol + ' ' + p.topWeightPct + '%' : '—', s: 'top 5 = ' + p.top5WeightPct + '% of book', t: p.top5WeightPct >= 35 ? 'tone-warn' : '' },
        { l: 'Best / worst', node: p.best ? e('span', null, e('span', { className: 'tone-up' }, p.best.tk + ' ' + sgnPct(p.best.pct)), ' / ', e('span', { className: 'tone-down' }, p.worst.tk)) : '—', s: p.worst ? 'worst ' + sgnPct(p.worst.pct) : null },
        { l: 'Wtd quality', v: p.wtdQuality == null ? '—' : String(p.wtdQuality), s: 'of 100 · grade-weighted', t: qualityTone(p.wtdQuality) },
    ];

    const tiles = compact ? defs.filter(d => DECISION_TILES.indexOf(d.l) !== -1) : defs;
    const rest = compact ? defs.filter(d => DECISION_TILES.indexOf(d.l) === -1) : [];

    return e('div', { className: 'nf-card np-card nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Portfolio'),
            e('span', { className: 'nf-sub' }, 'the book at a glance' + (acct && acct.mode ? ' · ' + acct.mode : ''))),
        e('div', { className: 'np-grid' },
            tiles.map((d, i) => e('div', { className: 'np-tile', key: d.l, style: { animationDelay: (i * 45) + 'ms' } },
                e('div', { className: 'np-tile-l' }, d.l),
                e('div', { className: 'np-tile-v ' + (d.t || '') }, d.node || d.v),
                d.s != null ? e('div', { className: 'np-tile-s' }, d.s) : null))),
        // The orientation tier. Sub-labels are dropped rather than wrapped —
        // they are the part a tile has room for and a line does not — so each
        // pair carries its own title instead of losing the detail entirely.
        rest.length
            ? e('div', { className: 'nfv2-pf-line nf-mono' },
                rest.map(d => e('span', { className: 'nfv2-pf-pair', key: d.l, title: d.s || null },
                    e('span', { className: 'nfv2-pf-l' }, d.l),
                    e('span', { className: 'nfv2-pf-v ' + (d.t || '') }, d.node || d.v))))
            : null);
}

export default PortfolioSnapshot;
