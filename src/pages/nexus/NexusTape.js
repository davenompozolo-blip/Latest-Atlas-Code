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
// The loop is two copies of the sprint sequence translated by -50%, so
// the seam lands on an exact repeat. CSS transform only: no layout
// property is animated and there is no per-frame JS.
// ============================================================

import React from 'react';
import { supabase } from '../../lib/supabase.js';
import { fetchMarketPricesPaged, indexBySymbol } from './nexusMarketPrices.js';
import {
    sprintNames, sprintGroups, sprintSignals, buildTape,
    fmtPct, moveTone, GROUP_LABEL, SIGNAL_WINDOWS,
} from './nexusTapeCompute.js';

const { useState, useEffect, useMemo, useRef } = React;
const e = React.createElement;

const VELOCITY_PX_S = 55;
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

// ── Reduced motion ───────────────────────────────────────────
function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(function () {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch { return false; }
    });
    useEffect(function () {
        let mq;
        try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return; }
        const on = ev => setReduced(ev.matches);
        // addListener is the pre-2021 Safari spelling and is still the only
        // one some embedded WebKits expose.
        if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on);
        return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on); };
    }, []);
    return reduced;
}

// ── Items ────────────────────────────────────────────────────
// An absent move renders as an em dash with its reason on the title. It is
// never 0.00% and never a blank slot: a tape makes everything on it look
// like a measurement, so the absence has to be visible AS an absence.
function Value({ value, dp }) {
    const txt = fmtPct(value, dp);
    if (txt == null) return e('span', { className: 'nft-v nft-absent', title: 'no current measurement' }, '—');
    return e('span', { className: 'nft-v ' + moveTone(value) }, txt);
}

function NameItem({ it }) {
    return e('span', { className: 'nft-item' },
        e('span', { className: 'nft-side ' + (it.side === 'best' ? 'tone-up' : 'tone-down') },
            it.side === 'best' ? '▲' : '▼'),
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
    return e('span', { className: 'nft-item' + (it.behind ? ' nft-behind' : ''), title },
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

// ── A sprint ─────────────────────────────────────────────────
// Each sprint is a focus stop (F2 §3) and carries its own label, which is
// the separator. `copy` suppresses the duplicate from the a11y tree and
// from the tab order — the second copy exists only so the loop seam lands
// on an exact repeat.
function Sprint({ sprint, copy }) {
    // Sprint 2 carries more than one frame, and without a marker at each
    // boundary the frames are invisible: a reader sees one undifferentiated
    // run of tickers and cannot tell a sector from an index. The marker is
    // also what makes the EEM decision legible — it is shown under INDEX
    // rather than under a "REGIONAL" heading over a single instrument.
    const kids = [];
    let frame = null;
    sprint.items.forEach((it, i) => {
        if (it.kind === 'group' && it.group !== frame) {
            frame = it.group;
            kids.push(e('span', { className: 'nft-frame', key: 'f' + frame }, GROUP_LABEL[frame]));
        }
        const C = ITEM[it.kind];
        if (C) kids.push(e(C, { it, key: i }));
    });

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

    return e('div', {
        className: 'nft-sprint',
        tabIndex: copy ? -1 : 0,
        'aria-hidden': copy ? 'true' : null,
        'aria-label': copy ? null : sprint.label + ' — ' + sprint.caption,
        role: copy ? null : 'group',
    },
        e('span', { className: 'nft-label' }, sprint.label),
        kids, notes
    );
}

// ── The tape ─────────────────────────────────────────────────
export function NexusTape() {
    const data = useTapeData();
    const reduced = usePrefersReducedMotion();
    const [paused, setPaused] = useState(false);
    const [page, setPage] = useState(0);
    const seqRef = useRef(null);
    const [durationS, setDurationS] = useState(null);

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

    // Constant velocity: measure one copy of the sequence and derive the
    // duration from it. Re-measured on resize, because the same content
    // is a different width at a different breakpoint.
    useEffect(function () {
        if (!tape || tape.empty || reduced) return;
        const el = seqRef.current;
        if (!el) return;
        const measure = () => {
            const w = el.scrollWidth;
            if (w > 0) setDurationS(Math.max(8, w / VELOCITY_PX_S));
        };
        measure();
        let ro;
        try { ro = new ResizeObserver(measure); ro.observe(el); } catch { /* no RO: the first measure stands */ }
        window.addEventListener('resize', measure);
        return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
    }, [tape, reduced]);

    if (!data.loaded) return e('div', { className: 'nft nft-quiet' }, 'Tape loading…');
    // Not "no market data" — the feed did not answer, which is a different
    // statement and the only one the evidence supports.
    if (data.failed) return e('div', { className: 'nft nft-quiet' }, 'Tape unavailable — the market feed did not answer.');
    if (!tape || tape.empty) return e('div', { className: 'nft nft-quiet' }, 'Nothing on the tape.');

    const sprints = tape.sprints;

    // ── prefers-reduced-motion: a paged static list, same sprints ──
    if (reduced) {
        const i = Math.min(page, sprints.length - 1);
        return e('div', { className: 'nft nft-static' },
            e('div', { className: 'nft-viewport' }, e(Sprint, { sprint: sprints[i] })),
            e('div', { className: 'nft-pager' },
                e('button', {
                    className: 'nft-pg', type: 'button', 'aria-label': 'previous sprint',
                    onClick: () => setPage((i - 1 + sprints.length) % sprints.length),
                }, '◀'),
                e('span', { className: 'nft-pg-n' }, (i + 1) + ' / ' + sprints.length),
                e('button', {
                    className: 'nft-pg', type: 'button', 'aria-label': 'next sprint',
                    onClick: () => setPage((i + 1) % sprints.length),
                }, '▶')
            )
        );
    }

    // Two copies: the animation translates by exactly -50%, so the seam is
    // an exact repeat and the loop has no visible join.
    const seq = sprints.map((s, i) => e(Sprint, { sprint: s, key: s.key + i }));
    const seqCopy = sprints.map((s, i) => e(Sprint, { sprint: s, key: 'c' + s.key + i, copy: true }));

    return e('div', {
        className: 'nft',
        onMouseEnter: () => setPaused(true),
        onMouseLeave: () => setPaused(false),
        // Focus pauses too: a tape that cannot be stopped cannot be read,
        // and a keyboard user has no hover to stop it with.
        onFocus: () => setPaused(true),
        onBlur: ev => { if (!ev.currentTarget.contains(ev.relatedTarget)) setPaused(false); },
    },
        e('div', { className: 'nft-viewport' },
            e('div', {
                className: 'nft-track',
                style: {
                    animationDuration: durationS ? durationS + 's' : undefined,
                    animationPlayState: paused ? 'paused' : 'running',
                },
            },
                e('div', { className: 'nft-seq', ref: seqRef }, seq),
                e('div', { className: 'nft-seq' }, seqCopy)
            )
        )
    );
}

export default NexusTape;
