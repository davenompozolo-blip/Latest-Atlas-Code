// ============================================================
// ATLAS Nexus — the tape (F-5; F2 §3, F3 §2.1)
// ------------------------------------------------------------
// An exchange-style ticker in three sprints — names, groups, signals —
// running where the portfolio strip sits. All arithmetic and all of the
// refusals live in nexusTapeCompute.js; this file fetches, measures and
// renders.
//
// DECISIONS F1 §7 LEAVES TO CC, recorded here rather than asked:
//
//   Velocity — 55 px/s, constant. The duration is derived from the
//   MEASURED track width rather than fixed, so a long sprint and a short
//   one move at the same speed. A fixed duration would make the tape
//   accelerate on days the book has more to say, which is the opposite
//   of what a reader needs.
//
//   The separator is each sprint's own leading label, not a divider
//   between them. On a tape you land mid-sprint constantly, and a rule
//   you have already scrolled past tells you nothing about which frame
//   of reference you are now in. The label travels with its sprint, so
//   the frame is legible from anywhere in the stream — which is what
//   F2 §3 actually asks for ("so a reader knows which frame of
//   reference they are in").
//
//   Component boundary — compute is pure and IO-free and is tested under
//   plain node; this file holds the only fetch and the only DOM.
//
// The marquee mechanics — velocity, the two-copy loop, pause, the
// reduced-motion pager, the frame markers — moved to NexusTapeShell.js
// when G-1's market tape became their second reader. What stays here is
// this tape's data, its item vocabulary and its own sentences.
// ============================================================

import React from 'react';
import { supabase } from '../../lib/supabase.js';
import { fetchMarketPricesPaged, indexBySymbol } from './nexusMarketPrices.js';
import {
    sprintNames, sprintGroups, sprintSignals, buildTape,
    bandOf, GROUP_LABEL, SIGNAL_WINDOWS,
} from './nexusTapeCompute.js';
import { TapeShell, Caret, Value } from './NexusTapeShell.js';

const { useState, useEffect, useMemo } = React;
const e = React.createElement;
// The monthly window needs 22 aligned sessions; 70 calendar days covers
// that with room for holidays without dragging a quarter of history
// across the wire for a ticker.
const LOOKBACK_DAYS = 70;
const BENCHMARK = 'SPY';

// ── Data ─────────────────────────────────────────────────────
function useTapeData() {
    const [s, setS] = useState({ loaded: false });

    useEffect(function () {
        let alive = true;
        if (!supabase) { setS({ loaded: true, failed: true }); return; }

        (async () => {
            const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10);
            const [holdings, instruments, pairs, loadings, axes] = await Promise.all([
                // nexus_holdings, NOT vw_nexus_holdings: the latter reads a
                // matview that ran three positions behind the live book and
                // its move column carries no staleness gate at all.
                supabase.from('nexus_holdings').select('tk,today_pct,price_days_old,stale'),
                supabase.from('market_instruments').select('symbol,tape_group,proxies_for').eq('active', true),
                supabase.from('ratio_pairs').select('pair_key,numerator_symbol,denominator_symbol'),
                supabase.from('factor_axis_loadings').select('axis_key,pair_key,loading'),
                supabase.from('factor_axes').select('axis_key,label,pc_rank,marginal,positive_means'),
            ]);
            const bad = [holdings, instruments, pairs, loadings, axes].find(r => r && r.error);
            if (bad) throw bad.error;

            const syms = new Set([BENCHMARK]);
            for (const i of instruments.data || []) if (i.tape_group) syms.add(i.symbol);
            for (const p of pairs.data || []) { syms.add(p.numerator_symbol); syms.add(p.denominator_symbol); }
            const bySymbol = indexBySymbol(await fetchMarketPricesPaged([...syms], since));

            if (!alive) return;
            setS({
                loaded: true, failed: false,
                holdings: holdings.data || [], instruments: instruments.data || [],
                pairs: pairs.data || [], loadings: loadings.data || [], axes: axes.data || [],
                bySymbol,
            });
        })().catch(err => {
            // A transport failure must never render as a statement about the
            // market. The tape says the feed did not answer, and the failure
            // is logged at error level rather than swallowed.
            console.error('[ATLAS] tape read failed:', err && err.message, err);
            if (alive) setS({ loaded: true, failed: true });
        });

        return () => { alive = false; };
    }, []);

    return s;
}

// ── Items ────────────────────────────────────────────────────
// Value and Caret are the shell's, shared with the market tape: an absent
// move is an em dash with its reason, never 0.00% and never a blank slot.

function NameItem({ it }) {
    return e('span', { className: 'nft-item' + (it.move === 0 ? ' is-flat' : '') },
        // Toned by the MOVE, not by which half of the ranking the name
        // sits in -- on a red day the five "best" names can all be down, and
        // a green ▲ on a falling name would be a lie about the tape. The
        // best/worst split is carried by the band marker instead.
        e(Caret, { value: it.move }),
        e('span', { className: 'nft-tk' }, it.symbol),
        e(Value, { value: it.move }),
        it.daysOld > 1 ? e('span', { className: 'nft-age', title: 'last price ' + it.daysOld + ' days old' }, it.daysOld + 'd') : null
    );
}

function GroupItem({ it }) {
    // The ticker is the label. The ETF is the measurement; the sector or
    // the region is an interpretation of it, and every one of these legs
    // carries caveats saying how loose that interpretation is.
    const title = [it.proxiesFor, it.asOf ? 'as of ' + it.asOf : null,
        it.folded ? 'registered ' + it.nativeGroup + ' — shown in ' + GROUP_LABEL[it.group].toLowerCase()
            + ' because one instrument is not a category' : null]
        .filter(Boolean).join(' · ');
    return e('span', {
        className: 'nft-item' + (it.behind ? ' nft-behind' : '') + (it.move === 0 ? ' is-flat' : ''),
        title,
    },
        e(Caret, { value: it.move }),
        e('span', { className: 'nft-tk' }, it.symbol),
        e(Value, { value: it.move }),
        it.behind ? e('span', { className: 'nft-age', title: 'behind the tape at ' + it.asOf }, '·stale') : null
    );
}

function SignalItem({ it }) {
    return e('span', { className: 'nft-item', title: it.asOf ? 'as of ' + it.asOf : null },
        e('span', { className: 'nft-tk' }, it.label),
        SIGNAL_WINDOWS.map(w => e('span', { className: 'nft-win', key: w.key },
            e('span', { className: 'nft-wl' }, w.label),
            e(Value, { value: it.moves[w.key].value, dp: 1 }),
            it.moves[w.key].truncated
                ? e('span', { className: 'nft-age', title: 'only ' + it.moves[w.key].sessions + ' aligned sessions' }, '*')
                : null)),
        // CPER/GLD loads on no axis. Absent, never filed under one of the
        // three and never left blank.
        it.axisUnassigned
            ? e('span', { className: 'nft-axis nft-absent', title: 'loads below the noise threshold on every axis' }, 'no axis')
            : e('span', {
                className: 'nft-axis',
                title: [
                    'loads ' + (it.loading == null ? '?' : it.loading.toFixed(3)) + ' on ' + it.axisLabel,
                    it.axisPositiveMeans ? 'positive means: ' + it.axisPositiveMeans : null,
                    it.axisNearTie ? 'near tie with the runner-up axis — the assignment is not comfortable' : null,
                ].filter(Boolean).join(' · '),
            },
                it.axisKey,
                // The loading's sign, always. A pair that loads negative
                // moves the axis the other way, and the tag alone would say
                // the reverse.
                it.loadingSign ? e('span', { className: 'nft-sign' }, it.loadingSign) : null,
                it.axisNearTie ? e('span', { className: 'nft-age' }, '·tie') : null)
    );
}

const ITEM = { name: NameItem, group: GroupItem, signal: SignalItem };

// ── Notes ────────────────────────────────────────────────────
// Every note here is this tape refusing to print something and saying so:
// a name it withheld, a group too small to be a frame, a leg with no frame
// at all. They are statements about the BOOK's feed, which is why the
// shell takes them as a hook rather than owning them.
function renderNotes(sprint) {
    const notes = [];
    if (sprint.withheldCount) {
        notes.push(e('span', { className: 'nft-note', key: 'w' },
            sprint.withheldCount + ' withheld · ' + sprint.withheldReason));
    }
    if (sprint.foldedGroups && sprint.foldedGroups.length) {
        notes.push(e('span', { className: 'nft-note', key: 'f' },
            sprint.foldedGroups.join(', ') + ' shown in ' + GROUP_LABEL[sprint.foldedInto].toLowerCase()));
    }
    if (sprint.droppedSymbols && sprint.droppedSymbols.length) {
        notes.push(e('span', { className: 'nft-note', key: 'd' },
            sprint.droppedSymbols.join(', ') + ' · no frame'));
    }
    return notes;
}

// ── The tape ─────────────────────────────────────────────────
export function NexusTape() {
    const data = useTapeData();

    const tape = useMemo(function () {
        if (!data.loaded || data.failed) return null;
        return buildTape([
            sprintNames(data.holdings),
            sprintGroups(data.instruments, data.bySymbol),
            sprintSignals({
                pairs: data.pairs, loadings: data.loadings,
                axes: data.axes, bySymbol: data.bySymbol, benchmark: BENCHMARK,
            }),
        ]);
    }, [data]);

    return e(TapeShell, {
        tape,
        state: { loading: !data.loaded, failed: data.failed },
        itemRenderers: ITEM,
        bandOf, renderNotes,
        loadingText: 'Tape loading…',
        // Not "no market data" — the feed did not answer, which is a
        // different statement and the only one the evidence supports.
        failedText: 'Tape unavailable — the market feed did not answer.',
        emptyText: 'Nothing on the tape.',
    });
}

export default NexusTape;
