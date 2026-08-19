// ============================================================
// ATLAS — shared ticker search
// ------------------------------------------------------------
// One search box, used by TRADE and by VALUATION.
//
// Both modules already had a search input and neither could find anything
// new with it: they filtered the rows their landing screen had already
// loaded — the Trade universe, or the screener's curated list — so a ticker
// outside that set matched nothing and there was no way to ask for it. The
// Trade ticket tab was even disabled until you had clicked a name off the
// universe.
//
// This resolves against `assets` (7,860 active listings) through the
// atlas_symbol_search RPC, which is far wider than either landing.
//
// WHAT IT SHOWS, AND WHY. Every hit carries capability flags — held, priced,
// valued, screener-covered. The interesting answer is rarely "does this
// ticker exist"; it is "will the terminal actually be able to do anything
// with it". GSL and GSM are real listings with no price series, and a search
// box that returned them looking identical to Goldman would be lying by
// omission. A name with no local price history is still selectable — the
// valuation house fetches live from /api/equity — but you find that out
// before you click, not after.
//
// The last row is deliberate too: a ticker that matches nothing at all can
// still be forced through, because the catalogue is a snapshot and a brand
// new listing should not be unreachable just because our copy is a day old.
// It is labelled as unverified rather than dressed up as a result.
// ============================================================

import React from 'react';
import { sb } from '../pages/config.js';
import '../styles/ticker-search.css';

const { useState, useEffect, useRef, useCallback } = React;
const e = React.createElement;

const DEBOUNCE_MS = 180;
const MIN_CHARS = 1;

/** Capability chips, in the order they matter when deciding to open a name. */
function flagChips(r) {
    const chips = [];
    if (r.held) chips.push(['held', 'held', 'Already in the book']);
    if (r.has_valuation) chips.push(['val', 'valued', 'Fair value on file in the scrapbook']);
    if (r.in_screener) chips.push(['scr', 'screener', 'Covered by the screener universe']);
    if (!r.has_prices) chips.push(['nopx', 'no price history', 'No daily bars stored locally — live data is fetched on open']);
    return chips.map(([cls, label, title]) =>
        e('span', { key: cls, className: 'tks-chip tks-' + cls, title }, label));
}

/**
 * @param {object}   props
 * @param {(symbol: string, row: object|null) => void} props.onPick
 * @param {string}  [props.placeholder]
 * @param {string}  [props.label]     small caps label rendered before the input
 * @param {boolean} [props.autoFocus]
 */
export function TickerSearch({ onPick, placeholder, label, autoFocus }) {
    const [q, setQ] = useState('');
    const [rows, setRows] = useState([]);
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState('idle');   // idle | loading | ready | error
    const [active, setActive] = useState(0);
    const boxRef = useRef(null);
    const inputRef = useRef(null);
    // Monotonic id so a slow response for "NV" can never overwrite the
    // results for "NVDA" that the user has already typed past.
    const seq = useRef(0);

    const query = q.trim();

    useEffect(() => {
        if (query.length < MIN_CHARS) { setRows([]); setStatus('idle'); return undefined; }
        if (!sb) { setStatus('error'); return undefined; }
        const mine = ++seq.current;
        setStatus('loading');
        const t = setTimeout(() => {
            sb.rpc('atlas_symbol_search', { q: query, lim: 12 })
                .then(({ data, error }) => {
                    if (mine !== seq.current) return;
                    if (error) { setRows([]); setStatus('error'); return; }
                    setRows(Array.isArray(data) ? data : []);
                    setActive(0);
                    setStatus('ready');
                })
                .catch(() => { if (mine === seq.current) { setRows([]); setStatus('error'); } });
        }, DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [query]);

    // Close on outside click — a combobox left hanging over the page is worse
    // than one that needs a second click to reopen.
    useEffect(() => {
        function onDoc(ev) {
            if (boxRef.current && !boxRef.current.contains(ev.target)) setOpen(false);
        }
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const pick = useCallback((symbol, row) => {
        if (!symbol) return;
        setOpen(false);
        setQ('');
        setRows([]);
        setStatus('idle');
        if (inputRef.current) inputRef.current.blur();
        onPick(String(symbol).toUpperCase(), row || null);
    }, [onPick]);

    // The forced entry is offered only when nothing matched, and only for
    // something that could plausibly be a ticker.
    const forceable = status === 'ready' && !rows.length && /^[A-Za-z.\-]{1,6}$/.test(query);
    const options = rows.length + (forceable ? 1 : 0);

    function onKeyDown(ev) {
        if (ev.key === 'Escape') { setOpen(false); return; }
        if (!open || !options) {
            if (ev.key === 'Enter' && query) { setOpen(true); }
            return;
        }
        if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive(a => (a + 1) % options); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive(a => (a - 1 + options) % options); }
        else if (ev.key === 'Enter') {
            ev.preventDefault();
            if (forceable && active === rows.length) pick(query.toUpperCase(), null);
            else if (rows[active]) pick(rows[active].symbol, rows[active]);
        }
    }

    return e('div', { className: 'tks', ref: boxRef },
        label ? e('span', { className: 'tks-label' }, label) : null,
        e('input', {
            ref: inputRef,
            className: 'tks-input',
            type: 'text',
            value: q,
            autoFocus: !!autoFocus,
            spellCheck: false,
            autoComplete: 'off',
            placeholder: placeholder || 'Search any ticker or company…',
            'aria-label': placeholder || 'Search any ticker or company',
            onChange: (ev) => { setQ(ev.target.value); setOpen(true); },
            onFocus: () => { if (query) setOpen(true); },
            onKeyDown,
        }),
        q ? e('button', {
            type: 'button', className: 'tks-clear', title: 'Clear',
            onClick: () => { setQ(''); setRows([]); setStatus('idle'); if (inputRef.current) inputRef.current.focus(); },
        }, '×') : null,

        open && query.length >= MIN_CHARS
            ? e('div', { className: 'tks-pop', role: 'listbox' },
                status === 'loading' && !rows.length
                    ? e('div', { className: 'tks-note' }, 'searching…')
                    : null,
                status === 'error'
                    ? e('div', { className: 'tks-note tks-err' }, 'symbol lookup unavailable — the catalogue did not respond')
                    : null,
                rows.map((r, i) => e('div', {
                    key: r.symbol,
                    role: 'option',
                    'aria-selected': i === active,
                    className: 'tks-row' + (i === active ? ' on' : ''),
                    onMouseEnter: () => setActive(i),
                    onMouseDown: (ev) => { ev.preventDefault(); pick(r.symbol, r); },
                },
                    e('span', { className: 'tks-tk' }, r.symbol),
                    e('span', { className: 'tks-nm' }, r.name || '—'),
                    e('span', { className: 'tks-flags' }, flagChips(r)))),
                forceable
                    ? e('div', {
                        role: 'option',
                        'aria-selected': active === rows.length,
                        className: 'tks-row tks-force' + (active === rows.length ? ' on' : ''),
                        onMouseEnter: () => setActive(rows.length),
                        onMouseDown: (ev) => { ev.preventDefault(); pick(query.toUpperCase(), null); },
                        title: 'Not in the local catalogue. Opening it will try the live data feed.',
                    },
                        e('span', { className: 'tks-tk' }, query.toUpperCase()),
                        e('span', { className: 'tks-nm tks-dim' }, 'not in the catalogue — open anyway, live feed only'))
                    : null,
                status === 'ready' && !rows.length && !forceable
                    ? e('div', { className: 'tks-note' }, 'no match in 7,860 active listings')
                    : null)
            : null);
}

export default TickerSearch;
