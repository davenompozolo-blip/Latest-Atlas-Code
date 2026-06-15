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

function Tile(label, value, sub, tone) {
    return e('div', { className: 'np-tile', key: label },
        e('div', { className: 'np-tile-l' }, label),
        e('div', { className: 'np-tile-v ' + (tone || '') }, value),
        sub != null ? e('div', { className: 'np-tile-s' }, sub) : null);
}

export function PortfolioSnapshot({ model }) {
    const p = model && model.portfolio;
    const acct = useAccount();
    if (!p) return null;

    const lev = acct && acct.equity ? (acct.long_market_value / acct.equity) : null;
    const tiles = [
        Tile('Account equity', money(acct && acct.equity), 'cash + longs − margin'),
        Tile('Long exposure', money(acct && acct.long_market_value), p.positions + ' positions' + (lev ? ' · ' + lev.toFixed(2) + '× lev' : '')),
        Tile('Cash / margin', acct ? money(acct.cash) : '—', acct && acct.cash < 0 ? 'on margin' : 'uninvested'),
        Tile('Day P&L', acct ? sgnMoney(acct.dayPnl) : '—', acct ? sgnPct(acct.dayPnlPct) + ' today' : null, acct ? moveTone(acct.dayPnl) : ''),
        Tile('Unrealised P&L', sgnMoney(p.unrealisedPnl), sgnPct(p.totalReturnPct) + ' total return', moveTone(p.unrealisedPnl)),
        Tile('Win rate', p.winRate == null ? '—' : p.winRate + '%', p.winners + ' winners · ' + p.losers + ' losers'),
        Tile('Today', p.todayUp + ' / ' + p.todayDown, 'up / down', p.todayUp > p.todayDown ? 'tone-up' : p.todayUp < p.todayDown ? 'tone-down' : ''),
        Tile('At risk', String(p.atRisk), 'positions down > 10%', p.atRisk > 0 ? 'tone-down' : ''),
        Tile('Top concentration', p.topSymbol ? p.topSymbol + ' ' + p.topWeightPct + '%' : '—', 'top 5 = ' + p.top5WeightPct + '% of book'),
        Tile('Best / worst',
            p.best ? e('span', null, e('span', { className: 'tone-up' }, p.best.tk + ' ' + sgnPct(p.best.pct)), ' / ', e('span', { className: 'tone-down' }, p.worst.tk)) : '—',
            p.worst ? 'worst ' + sgnPct(p.worst.pct) : null),
        Tile('Wtd quality', p.wtdQuality == null ? '—' : String(p.wtdQuality), 'of 100 · grade-weighted'),
    ];

    return e('div', { className: 'nf-card nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Portfolio'),
            e('span', { className: 'nf-sub' }, 'the book at a glance' + (acct && acct.mode ? ' · ' + acct.mode : ''))),
        e('div', { className: 'np-grid' }, tiles));
}

export default PortfolioSnapshot;
