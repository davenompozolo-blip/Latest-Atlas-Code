// ============================================================
// ATLAS Nexus — the tape shell (G-1)
// ------------------------------------------------------------
// The marquee mechanics, extracted from NexusTape.js when the market
// tape became the second reader: constant velocity from a measured
// track, the two-copy loop whose seam lands on an exact repeat, pause
// on hover and focus, the reduced-motion pager, and the frame markers.
//
// A second copy of any of that is how two tapes on one page end up
// scrolling at different speeds, pausing differently, or disagreeing
// about what a reduced-motion reader gets. This file is the only
// implementation; a tape supplies its ITEMS and its NOTES and nothing
// about how they move.
//
// What stays with each tape: its data, its item vocabulary, and the
// sentences it prints when it has nothing. Those are statements about
// a particular feed and do not generalise.
// ============================================================

import React from 'react';
import { fmtPct, moveTone } from './nexusTapeCompute.js';

const { useState, useEffect, useRef } = React;
const e = React.createElement;

export const VELOCITY_PX_S = 55;

// ── Reduced motion ───────────────────────────────────────────
export function usePrefersReducedMotion() {
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

// ── Shared item primitives ───────────────────────────────────
// An absent move renders as an em dash with its reason on the title. It is
// never 0.00% and never a blank slot: a tape makes everything on it look
// like a measurement, so the absence has to be visible AS an absence.
export function Value({ value, dp }) {
    const txt = fmtPct(value, dp);
    if (txt == null) return e('span', { className: 'nft-v nft-absent', title: 'no current measurement' }, '—');
    return e('span', { className: 'nft-v ' + moveTone(value) }, txt);
}

// The caret encodes the SIGN of the move and nothing else. A magnitude
// threshold here would be a significance claim the tape has no basis for,
// so a flat session gets its own mark rather than being rounded into one
// of the two directions.
export function Caret({ value }) {
    if (value == null) return null;
    const tone = value > 0 ? 'tone-up' : value < 0 ? 'tone-down' : 'is-flat';
    return e('span', { className: 'nft-dir ' + tone }, value > 0 ? '▲' : value < 0 ? '▼' : '·');
}

// ── A sprint ─────────────────────────────────────────────────
// Each sprint is a focus stop (F2 §3) and carries its own label, which is
// the separator. `copy` suppresses the duplicate from the a11y tree and
// from the tab order — the second copy exists only so the loop seam lands
// on an exact repeat.
//
// A sprint carrying more than one frame needs a marker at each boundary,
// or the frames are invisible: a reader sees one undifferentiated run of
// tickers and cannot tell a sector from an index.
export function Sprint({ sprint, copy, itemRenderers, bandOf, renderNotes }) {
    const kids = [];
    let band = null;
    sprint.items.forEach((it, i) => {
        const b = bandOf ? bandOf(it) : null;
        if (b && b.key !== band) {
            band = b.key;
            kids.push(e('span', { className: 'nft-frame', key: 'b' + band }, b.label));
        }
        const C = itemRenderers[it.kind];
        if (C) kids.push(e(C, { it, key: i }));
    });

    const notes = renderNotes ? renderNotes(sprint) : null;

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

// ── The shell ────────────────────────────────────────────────
// `state` is { loading, failed }. The three sentences are supplied by the
// caller because each one is a claim about a particular feed: "the market
// feed did not answer" is true of one tape and false of another, and a
// shared default would put a sentence on screen that nobody verified.
export function TapeShell({
    tape, state, itemRenderers, bandOf, renderNotes,
    loadingText, failedText, emptyText, className,
}) {
    const reduced = usePrefersReducedMotion();
    const [paused, setPaused] = useState(false);
    const [page, setPage] = useState(0);
    const seqRef = useRef(null);
    const [durationS, setDurationS] = useState(null);

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

    const cls = 'nft' + (className ? ' ' + className : '');

    if (state && state.loading) return e('div', { className: cls + ' nft-quiet' }, loadingText);
    if (state && state.failed) return e('div', { className: cls + ' nft-quiet' }, failedText);
    if (!tape || tape.empty) return e('div', { className: cls + ' nft-quiet' }, emptyText);

    const sprints = tape.sprints;
    const props = { itemRenderers, bandOf, renderNotes };

    // ── prefers-reduced-motion: a paged static list, same sprints ──
    if (reduced) {
        const i = Math.min(page, sprints.length - 1);
        return e('div', { className: cls + ' nft-static' },
            e('div', { className: 'nft-viewport' }, e(Sprint, Object.assign({ sprint: sprints[i] }, props))),
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
    const seq = sprints.map((s, i) => e(Sprint, Object.assign({ sprint: s, key: s.key + i }, props)));
    const seqCopy = sprints.map((s, i) => e(Sprint, Object.assign({ sprint: s, key: 'c' + s.key + i, copy: true }, props)));

    return e('div', {
        className: cls,
        onMouseEnter: () => setPaused(true),
        onMouseLeave: () => setPaused(false),
        // Focus pauses too: a tape that cannot be stopped cannot be read,
        // and a keyboard user has no hover to stop it with.
        onFocus: () => setPaused(true),
        onBlur: ev => { if (!ev.currentTarget.contains(ev.relatedTarget)) setPaused(false); },
    },
        // Pause on hover/focus already worked and said nothing, so a tape
        // that had stopped FOR the reader was indistinguishable from one
        // that had stopped working. The chip is the affordance and only
        // exists while paused.
        paused ? e('div', { className: 'nft-paused' },
            e('span', { className: 'nft-paused-bars' }, '❙❙'), 'PAUSED') : null,
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
