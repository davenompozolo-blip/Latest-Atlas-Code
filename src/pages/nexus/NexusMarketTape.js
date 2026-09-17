// ============================================================
// ATLAS Nexus — the market tape (G-1)
// ------------------------------------------------------------
// The book tape says what MY names did; this one says what the market
// did. Two tapes, not one merged stream, because the whole value of
// having both is being able to tell "my book is down" apart from "the
// market is down" — and a single stream makes that a matter of
// remembering which sprint scrolled past.
//
// Sources are the Markets module's own endpoints, unchanged: /api/macro
// for sectors and cross-asset, /api/movers for the ranked names and the
// cap spectrum. Nothing new is fetched and nothing is re-derived — the
// arithmetic is entirely in nexusMarketTapeCompute.js and the marquee is
// entirely in NexusTapeShell.js.
//
// The two endpoints fail INDEPENDENTLY. A dead /api/movers must not take
// the sector sprint down with it: that is the "each gauge falls back
// independently" rule from the flagship's context gauges, which exists
// because one dark feed dragging a healthy panel to a fallback is
// indistinguishable from the whole surface being broken.
// ============================================================

import React from 'react';
import {
    sprintSectors, sprintMovers, sprintCapSpectrum, sprintCrossAsset,
    buildMarketTape, marketBandOf,
} from './nexusMarketTapeCompute.js';
import { TapeShell, Caret, Value } from './NexusTapeShell.js';
import { useMacroFeed } from './useMacroFeed.js';

const { useMemo } = React;
const e = React.createElement;

// ── Data ─────────────────────────────────────────────────────
// Both endpoints come from the shared feed, so the tape, the cross-asset
// panels and the chrome's risk pill make ONE request each and — more to
// the point — cannot be handed two different payloads either side of a
// server-side cache expiry.
//
// The two still fail INDEPENDENTLY. A dead /api/movers must not take the
// sector sprint down with it: that is the "each gauge falls back
// independently" rule from the context gauges, which exists because one
// dark feed dragging a healthy panel to a fallback is indistinguishable
// from the whole surface being broken.
const PATHS = ['/api/macro', '/api/movers'];

// ── Item ─────────────────────────────────────────────────────
// One renderer for every market item: ticker, caret, move. The proxy
// ("Technology", "20y+ Treasuries") lives on the title rather than on the
// tape, because the ETF is the measurement and the asset class is an
// interpretation of it — the rule F-5 settled for EEM, applied to all of
// these legs at once.
function MarketItem({ it }) {
    return e('span', {
        className: 'nft-item' + (it.move === 0 ? ' is-flat' : ''),
        title: it.proxiesFor || null,
    },
        e(Caret, { value: it.move }),
        e('span', { className: 'nft-tk' }, it.symbol),
        e(Value, { value: it.move })
    );
}

const ITEM = { mkt: MarketItem };

// Notes are this tape's refusals and its scope limits, in that order: a
// sprint that ranks thirty curated names has to say so on the tape, not
// only in a file nobody reads.
function renderNotes(sprint) {
    const notes = [];
    if (sprint.scopeNote) {
        notes.push(e('span', { className: 'nft-note', key: 's' }, sprint.scopeNote));
    }
    if (sprint.withheldCount) {
        notes.push(e('span', { className: 'nft-note', key: 'w' },
            sprint.withheldCount + ' withheld · ' + sprint.withheldReason));
    }
    if (sprint.droppedSymbols && sprint.droppedSymbols.length) {
        notes.push(e('span', { className: 'nft-note', key: 'd' },
            sprint.droppedSymbols.join(', ') + ' · unclassified'));
    }
    return notes;
}

// ── The market tape ──────────────────────────────────────────
export function NexusMarketTape() {
    const feed = useMacroFeed(PATHS);
    const data = {
        loaded: feed.loaded,
        macro: feed.data['/api/macro'],
        movers: feed.data['/api/movers'],
    };

    const tape = useMemo(function () {
        if (!data.loaded) return null;
        const macro = data.macro || {};
        const movers = data.movers || {};
        return buildMarketTape([
            sprintSectors(macro.sectors),
            sprintMovers(movers.top, movers.bottom),
            sprintCapSpectrum(movers.capSpectrum),
            sprintCrossAsset(macro.market),
        ], { asOfTs: movers._ts });
    }, [data.loaded, data.macro, data.movers]);

    // Both endpoints dead is a dead feed. One of them dead still leaves a
    // tape, with the surviving sprints on it and the empty ones simply
    // absent — which is why this is not `data.macro && data.movers`.
    const bothDown = data.loaded && !data.macro && !data.movers;

    return e(TapeShell, {
        tape,
        state: { loading: !data.loaded, failed: bothDown },
        itemRenderers: ITEM,
        bandOf: marketBandOf,
        renderNotes,
        className: 'nft-market',
        loadingText: 'Market tape loading…',
        failedText: 'Market tape unavailable — neither market feed answered.',
        emptyText: 'No market quotes on the tape.',
    });
}

export default NexusMarketTape;
