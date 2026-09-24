// MP-2: the account switcher and the banner that says what switching means.
//
// The chip shows the account the SERVER resolved (vw_portfolios.is_active),
// never the client's own belief -- see switcherState. Choosing an account
// stores it and RELOADS: loaders across the app cache in module-level promises
// and memos, and a partial switch would put two books on one screen.
//
// The banner is not decoration. On a non-default account the live book --
// positions, P&L, account, live risk -- follows the switch, but the nightly
// analytics (verdicts, segments, factor betas, VaR backtest, conviction,
// contribution) are computed for the DEFAULT portfolio only until MP-4, and
// the database withholds them rather than attach them to the wrong book.
// Without the banner those withheld panels would read as "no data" with
// nothing to say why. It also names the account an order will execute in:
// since MP-3, trading follows the switch.

import React from 'react';
import { sb } from '../config.js';
import { ACTIVE_PORTFOLIO, switcherState, writeStoredPortfolio } from '../../lib/activePortfolio.js';

const e = React.createElement;

let portfoliosPromise = null;
function loadPortfolios() {
    if (!portfoliosPromise) {
        portfoliosPromise = (async () => {
            if (!sb) return { rows: null, error: 'no Supabase client' };
            const { data, error } = await sb
                .from('vw_portfolios')
                .select('id,name,is_default,is_active,account_last4,is_paper,latest_equity,equity_as_of')
                .order('is_default', { ascending: false })
                .order('name', { ascending: true });
            if (error) {
                console.error('[PortfolioSwitcher] vw_portfolios:', error.message || error);
                return { rows: null, error: error.message || String(error) };
            }
            return { rows: data || [], error: null };
        })();
    }
    return portfoliosPromise;
}

function usePortfolios() {
    const [res, setRes] = React.useState({ loading: true, rows: null, error: null });
    React.useEffect(() => {
        let live = true;
        loadPortfolios().then((r) => { if (live) setRes({ loading: false, ...r }); });
        return () => { live = false; };
    }, []);
    return res;
}

function money(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return '$' + Math.round(n).toLocaleString('en-US');
}

export function PortfolioSwitcher() {
    const res = usePortfolios();
    const [open, setOpen] = React.useState(false);
    const [err, setErr] = React.useState(null);
    const st = switcherState(res.rows, ACTIVE_PORTFOLIO);

    const chipStyle = {
        display: 'flex', alignItems: 'center', gap: 8, marginRight: 12,
        padding: '4px 10px', borderRadius: 4, cursor: st.options.length > 1 ? 'pointer' : 'default',
        border: '1px solid ' + (st.onDefault === false ? 'var(--nx-amber)' : 'var(--nx-border)'),
        background: 'transparent', color: 'var(--nx-text)', fontFamily: 'var(--nx-fb)',
        fontSize: 10, letterSpacing: 0.5, position: 'relative',
    };

    if (res.loading) return e('div', { style: chipStyle, 'aria-busy': 'true' }, e('span', { style: { color: 'var(--nx-text3)' } }, 'ACCOUNT …'));
    if (!st.active) {
        // The list did not load: say so rather than name an account we cannot see.
        return e('div', { style: chipStyle, title: 'Account list unavailable: ' + (res.error || 'no active account reported') },
            e('span', { style: { color: 'var(--nx-text3)' } }, 'ACCOUNT UNAVAILABLE'));
    }

    function choose(row) {
        setOpen(false);
        if (row.id === st.active.id) return;
        // Choosing the default CLEARS the choice rather than pinning an id.
        const ok = writeStoredPortfolio(row.is_default ? null : row.id);
        if (!ok) { setErr('This browser is blocking site storage, so the account choice cannot be kept.'); return; }
        window.location.reload();
    }

    return e('div', { style: { position: 'relative' } },
        e('button', {
            type: 'button', style: chipStyle, 'aria-haspopup': 'listbox', 'aria-expanded': open,
            title: st.active.name + (st.active.account_last4 ? ' · ···' + st.active.account_last4 : ''),
            onClick: () => st.options.length > 1 && setOpen(!open),
        },
            e('span', { style: { color: 'var(--nx-text3)', fontSize: 8, letterSpacing: 1.5 } }, st.active.is_paper ? 'PAPER' : 'LIVE'),
            e('span', { style: { fontWeight: 700 } }, st.active.name),
            st.active.account_last4 && e('span', { style: { color: 'var(--nx-text3)' } }, '···' + st.active.account_last4),
            st.options.length > 1 && e('span', { style: { color: 'var(--nx-text3)' } }, open ? '▴' : '▾')
        ),
        err && e('div', { role: 'alert', style: { position: 'absolute', top: 34, right: 12, width: 260, padding: 8, fontSize: 10, background: 'var(--nx-bg3)', border: '1px solid var(--nx-border)', color: 'var(--nx-text)', zIndex: 9100 } }, err),
        open && e('div', {
            role: 'listbox',
            style: {
                position: 'absolute', top: 34, right: 12, minWidth: 260, zIndex: 9100,
                background: 'var(--nx-bg2)', border: '1px solid var(--nx-border)', borderRadius: 6,
                boxShadow: '0 8px 24px rgba(0,0,0,.45)', padding: 4,
            },
        },
            st.options.map((row) => e('button', {
                key: row.id, type: 'button', role: 'option', 'aria-selected': row.id === st.active.id,
                onClick: () => choose(row),
                style: {
                    display: 'flex', width: '100%', alignItems: 'baseline', gap: 8, padding: '8px 10px',
                    border: 'none', borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'var(--nx-fb)', fontSize: 11,
                    background: row.id === st.active.id ? 'var(--nx-accent-w)' : 'transparent',
                    color: row.id === st.active.id ? 'var(--nx-accent)' : 'var(--nx-text)',
                },
            },
                e('span', { style: { fontWeight: 700, flex: 1 } }, row.name, row.is_default && e('span', { style: { color: 'var(--nx-text3)', fontWeight: 400 } }, '  · default')),
                row.account_last4 && e('span', { style: { color: 'var(--nx-text3)', fontSize: 10 } }, '···' + row.account_last4),
                money(row.latest_equity) && e('span', { style: { color: 'var(--nx-text2)', fontSize: 10, fontVariantNumeric: 'tabular-nums' } }, money(row.latest_equity))
            ))
        )
    );
}

export function PortfolioBanner() {
    const res = usePortfolios();
    const st = switcherState(res.rows, ACTIVE_PORTFOLIO);
    const bar = {
        flexShrink: 0, padding: '6px 16px', fontSize: 10, lineHeight: 1.5,
        borderBottom: '1px solid var(--nx-border)', fontFamily: 'var(--nx-fb)',
        background: 'rgba(245,158,11,.08)', color: 'var(--nx-text)',
    };
    if (st.mismatch) {
        return e('div', { role: 'status', style: bar },
            e('strong', null, 'The saved account is no longer available. '),
            'Showing ', e('strong', null, st.active.name), ', the account the server resolved.');
    }
    if (st.onDefault !== false) return null;   // default account, or unknown: claim nothing
    return e('div', { role: 'status', style: bar },
        e('strong', null, 'Viewing ' + st.active.name + '. '),
        'Positions, P&L, account, live risk and the holdings analytics (conviction, signals, valuation) are this account’s. ',
        'Nightly analytics — verdicts, segments, contribution, factor betas and the VaR backtest — ',
        'are computed for the default account only, and are withheld here rather than shown against the wrong book. ',
        e('strong', null, 'Orders from this screen go to ' + st.active.name + '.'));
}
