// ============================================================
// ATLAS Nexus — Portfolio snapshot (Flagship header)
// ------------------------------------------------------------
// The book at a glance: account economics (equity, exposure, cash, P&L)
// self-fetched live from /api/trading, and the position-level stats from
// the resolved model. Pure aggregation lives in
// nexusLiveCompute.buildPortfolioSnapshot; card shape, formatting and
// absence live in nexusPortfolioCards.js.
//
// F-4 (F2 §2) promoted the seven metrics that used to collapse into a
// dense text line beneath the four decision tiles into cards in the same
// grid. The grid was already `repeat(auto-fill, minmax(168px, 1fr))`, so
// they wrap naturally and no card is privileged by size — the existing
// tile styling is untouched, which F2 §5 clause 4 requires.
// ============================================================

import React from 'react';
import {
    portfolioCards, cardCoverage,
    ACCOUNT_OK, ACCOUNT_FAILED, ACCOUNT_LOADING,
} from './nexusPortfolioCards.js';

const { useState, useEffect } = React;
const e = React.createElement;

// The account fetch used to `.catch(() => {})`, so a feed that did not
// answer and a feed that had not answered yet both arrived as `null` and
// both rendered an em dash. That is the swallowed-failure pattern this
// codebase has recorded in four layers, and it is what made the absent
// state undecidable. The status is now explicit and a failure is logged
// at error level.
function useAccount() {
    const [s, setS] = useState({ status: ACCOUNT_LOADING, data: null });
    useEffect(function () {
        let alive = true;
        fetch('/api/trading?action=account')
            .then(r => {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(j => {
                if (!alive) return;
                if (j && j.equity != null) setS({ status: ACCOUNT_OK, data: j });
                else throw new Error('account payload carried no equity');
            })
            .catch(err => {
                console.error('[ATLAS] portfolio account read failed:', err && err.message);
                if (alive) setS({ status: ACCOUNT_FAILED, data: null });
            });
        return () => { alive = false; };
    }, []);
    return s;
}

// The absent variant (F3 §2.3): a named card state with its own styling,
// not an ad-hoc branch inside each card. Dashed border, NO numeric slot,
// label plus the reason. There is nothing here that can render a value,
// which is the point — an absent card is handed none.
function AbsentCard({ c, i }) {
    return e('div', {
        className: 'np-tile np-tile-absent',
        key: c.key,
        style: { animationDelay: (i * 45) + 'ms' },
        title: c.reason,
    },
        e('div', { className: 'np-tile-l' }, c.label),
        e('div', { className: 'np-tile-absent-r' }, c.reason)
    );
}

function MeasuredCard({ c, i }) {
    // Best/worst is a pair and its halves are toned opposite ways, so it
    // arrives as a structure rather than a string.
    const value = c.pair
        ? e('span', null,
            e('span', { className: 'tone-up' }, c.pair.best.tk + (c.pair.best.pct ? ' ' + c.pair.best.pct : '')),
            ' / ',
            e('span', { className: 'tone-down' }, c.pair.worst.tk))
        : c.value;

    return e('div', {
        className: 'np-tile',
        key: c.key,
        style: { animationDelay: (i * 45) + 'ms' },
    },
        e('div', { className: 'np-tile-l' }, c.label),
        e('div', { className: 'np-tile-v ' + (c.tone || '') }, value),
        c.sub != null ? e('div', { className: 'np-tile-s' }, c.sub) : null
    );
}

// The `compact` prop is GONE. It used to mean "four tiles plus seven in a
// text line", and F2 §2 removes that split by promoting all eleven into
// the grid — so v1 and v2 now render the same cards and the prop had no
// remaining meaning. Both call sites were updated rather than leaving it
// accepted and ignored, which is how a dead prop survives a rewrite.
export function PortfolioSnapshot({ model }) {
    const p = model && model.portfolio;
    const acct = useAccount();
    if (!p) return null;

    const cards = portfolioCards({
        portfolio: p, account: acct.data, accountStatus: acct.status,
    });
    const cov = cardCoverage(cards);

    return e('div', { className: 'nf-card np-card nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Portfolio'),
            e('span', { className: 'nf-sub' },
                'the book at a glance'
                + (acct.data && acct.data.mode ? ' · ' + acct.data.mode : '')
                // State the denominator rather than showing a grid with
                // holes in it and nothing to say why.
                + (cov.absentCount ? ' · ' + cov.absentCount + ' of ' + cov.total + ' not measured' : ''))),
        e('div', { className: 'np-grid' },
            cards.map((c, i) => (c.absent
                ? e(AbsentCard, { c, i, key: c.key })
                : e(MeasuredCard, { c, i, key: c.key })))));
}

export default PortfolioSnapshot;
