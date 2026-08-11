// ATLAS Trade — shared formatters and primitives for the three routes.

import React from 'react';

export const e = React.createElement;

// ── Formatters ───────────────────────────────────────────────────────────────
// A missing number renders as an em dash. It never renders as 0, and it never
// renders as a plausible-looking placeholder, because the entire module is an
// argument about being honest with yourself about what you know.

export const DASH = '—';

export function fNum(v, d = 2) {
    if (v == null || !isFinite(v)) return DASH;
    return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fPct(v, d = 2, { signed = false } = {}) {
    if (v == null || !isFinite(v)) return DASH;
    const s = (v * 100).toFixed(d);
    return (signed && v > 0 ? '+' : '') + s + '%';
}

export function fMoney(v, d = 2, { signed = false } = {}) {
    if (v == null || !isFinite(v)) return DASH;
    const neg = v < 0;
    const s = '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    return neg ? '−' + s : (signed && v > 0 ? '+' + s : s);
}

export function fLarge(v) {
    if (v == null || !isFinite(v)) return DASH;
    const a = Math.abs(v);
    if (a >= 1e12) return '$' + (v / 1e12).toFixed(1) + 't';
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'b';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'm';
    if (a >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'k';
    return '$' + v.toFixed(0);
}

export function fSigned(v, d = 2) {
    if (v == null || !isFinite(v)) return DASH;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
}

export function fBps(v, d = 1) {
    if (v == null || !isFinite(v)) return DASH;
    return v.toFixed(d) + 'bps';
}

export const toneOf = (v) => (v == null || !isFinite(v) ? 'tr-dim3' : v > 0 ? 'tr-pos' : v < 0 ? 'tr-neg' : 'tr-dim');

// ── Primitives ───────────────────────────────────────────────────────────────

export function Card({ title, right, children, style, bodyStyle, bodyClass }) {
    return e('div', { className: 'tr-card', style },
        title != null && e('div', { className: 'tr-ch', style: right ? { display: 'flex', alignItems: 'center', gap: 9 } : null },
            right ? e('span', { style: { flex: 1 } }, title) : title,
            right || null),
        e('div', { className: 'tr-cb ' + (bodyClass || ''), style: bodyStyle }, children));
}

/** A before → after row. The arrow is the whole point of Pane B. */
export function DeltaRow({ label, before, after, format = (x) => fNum(x), tone, sub, title }) {
    const changed = after !== undefined && after !== null && after !== before;
    return e('div', { className: 'tr-row', title },
        e('span', { className: 'tr-k' }, label, sub ? e('span', { style: { fontSize: 10, marginLeft: 4 }, className: 'tr-dim3' }, sub) : null),
        e('span', { className: 'tr-v' },
            format(before),
            changed ? e('span', { className: 'tr-delta' }, '→') : null,
            changed ? e('span', { className: tone || 'tr-cy' }, format(after)) : null));
}

export function Row({ label, value, tone, title, sub }) {
    return e('div', { className: 'tr-row', title },
        e('span', { className: 'tr-k' }, label, sub ? e('span', { className: 'tr-dim3', style: { fontSize: 10, marginLeft: 4 } }, sub) : null),
        e('span', { className: 'tr-v ' + (tone || '') }, value));
}

export function Chip({ on, onClick, children, disabled, title }) {
    return e('button', {
        className: 'tr-chip' + (on ? ' on' : ''), onClick, disabled, title, type: 'button',
    }, children);
}

/**
 * The standard degraded state. Every pane uses this rather than rendering a
 * zero: the module's first principle is that a missing input is information,
 * not a value of nothing.
 */
export function Missing({ title, children }) {
    return e('div', { className: 'tr-empty' },
        e('b', null, title || 'NO DATA ON FILE'),
        children);
}

export function Ann({ title, children }) {
    return e('div', { className: 'tr-ann' }, e('b', null, title), children);
}
