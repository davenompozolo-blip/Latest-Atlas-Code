// ATLAS Trade — module shell. Spec §8: TRADE becomes three routes rather than
// one screen.
//
//   /trade/universe        new default landing
//   /trade/ticket/:symbol  the restructured ticket
//   /trade/blotter         intents + orders + armed triggers + outcome review
//
// The app shell drives modules by tab state rather than a router, so the routes
// are mirrored into the URL hash: they are addressable and shareable, back and
// forward work, and nothing about the existing chrome has to change.

import React from 'react';
import '../../styles/trade.css';
import { e } from './shared.js';
import { TradeUniverse } from './TradeUniverse.js';
import { TradeTicket } from './TradeTicket.js';
import { TradeBlotter } from './TradeBlotter.js';
import { OptionsChain } from '../trading.js';
import { loadUniverse } from '../../lib/trade/tradeData.js';

const { useState, useEffect, useCallback } = React;

const ROUTES = [
    { id: 'universe', label: '/TRADE/UNIVERSE' },
    { id: 'ticket',   label: '/TRADE/TICKET' },
    { id: 'blotter',  label: '/TRADE/BLOTTER' },
    { id: 'options',  label: '/TRADE/OPTIONS' },
];

function parseHash() {
    const h = (window.location.hash || '').replace(/^#/, '');
    const m = h.match(/^\/trade\/(universe|ticket|blotter|options)(?:\/([A-Za-z0-9.\-]{1,14}))?/);
    if (!m) return null;
    return { route: m[1], symbol: m[2] ? m[2].toUpperCase() : null };
}

function writeHash(route, symbol) {
    const next = '#/trade/' + route + (route === 'ticket' && symbol ? '/' + symbol : '');
    if (window.location.hash !== next) window.history.pushState(null, '', next);
}

export function TradeModule(props) {
    const initial = parseHash();
    const [route, setRoute] = useState(initial ? initial.route : 'universe');
    const [symbol, setSymbol] = useState(
        (initial && initial.symbol) || (props && props.initialSymbol) || null,
    );
    const [universeContext, setUniverseContext] = useState(null);
    const [universe, setUniverse] = useState(null);
    const [loadingUniverse, setLoadingUniverse] = useState(true);

    // Load the universe once for the module: the universe screen renders it and
    // the ticket carries the row that surfaced a name into the intent record.
    useEffect(() => {
        let live = true;
        loadUniverse().then((u) => { if (live) { setUniverse(u); setLoadingUniverse(false); } })
            .catch(() => { if (live) setLoadingUniverse(false); });
        return () => { live = false; };
    }, []);

    // Cross-module navigation (atlas:navigate carries a symbol into TRADE).
    useEffect(() => {
        const sym = props && props.initialSymbol;
        if (!sym) return;
        setSymbol(sym.toUpperCase());
        setRoute('ticket');
    }, [props && props.initialSymbol]);

    useEffect(() => {
        function onPop() {
            const h = parseHash();
            if (!h) return;
            setRoute(h.route);
            if (h.symbol) setSymbol(h.symbol);
        }
        window.addEventListener('popstate', onPop);
        window.addEventListener('hashchange', onPop);
        return () => {
            window.removeEventListener('popstate', onPop);
            window.removeEventListener('hashchange', onPop);
        };
    }, []);

    useEffect(() => { writeHash(route, symbol); }, [route, symbol]);

    /**
     * §3.7: clicking a name anywhere in the universe routes to the ticket
     * carrying which view surfaced it, which filters were active and its rank
     * at that moment. That context lands in the intent row, so reviewing the
     * trade later tells you not just what you bought but what set it came out of.
     */
    const openTicket = useCallback((row, ctx = {}) => {
        const sym = typeof row === 'string' ? row : row.symbol;
        setSymbol(sym);
        setUniverseContext(typeof row === 'string' ? null : {
            surfaced_from: ctx.view || null,
            rank_at_click: row.rank ?? null,
            ranked_by: ctx.rankBy || null,
            net: row.net ?? null,
            alignment: row.alignment ?? null,
            eligible: row.eligible ?? null,
            exclusion_code: row.exclusionCode ?? null,
            book_state: row.bookState ?? null,
            active_axes: ctx.axes ? Object.fromEntries(
                Object.entries(ctx.axes).filter(([, v]) => (Array.isArray(v) ? v.length : v != null)),
            ) : null,
            universe_as_of: universe ? universe.asOfDate : null,
        });
        setRoute('ticket');
        window.scrollTo(0, 0);
    }, [universe]);

    const tabLabel = (r) => (r.id === 'ticket' && symbol ? r.label + '/' + symbol : r.label);

    return e('div', { className: 'tr-root' },
        e('div', { className: 'tr-tabs' },
            ROUTES.map((r) =>
                e('button', {
                    key: r.id, type: 'button',
                    className: route === r.id ? 'on' : '',
                    onClick: () => { setRoute(r.id); window.scrollTo(0, 0); },
                    disabled: r.id === 'ticket' && !symbol,
                    title: r.id === 'ticket' && !symbol ? 'Pick a name from the universe first' : null,
                }, tabLabel(r)))),

        route === 'universe'
            ? e(TradeUniverse, { universe, loading: loadingUniverse, onOpenTicket: openTicket })
            : route === 'ticket' && symbol
                ? e(TradeTicket, { symbol, universeContext, onNavigate: setRoute })
                : route === 'blotter'
                    ? e(TradeBlotter, { onOpenTicket: openTicket })
                    : route === 'options'
                        ? e('div', { className: 'tr-wrap' }, e(OptionsChain, { symbol: symbol || 'AAPL' }))
                        : e(TradeUniverse, { universe, loading: loadingUniverse, onOpenTicket: openTicket }));
}

export default TradeModule;
