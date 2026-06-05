import React from 'react';
// ============================================================
// ATLAS Terminal — Screener Kit
// Shared primitives for the Equity and Fund screeners so they
// match the look & feel of the Valuation House Screener.
// ============================================================

const { useState } = React;
const h = React.createElement;

// ── Formatting helpers ─────────────────────────────────────────────────────────
export function fmtN(v, dec, sfx) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(dec != null ? dec : 1) + (sfx || '');
}
export function retColor(v) {
    if (v == null) return 'rgba(255,255,255,0.35)';
    return v >= 0 ? '#10b981' : '#ef4444';
}
export function retStr(v) {
    if (v == null) return '—';
    return (v >= 0 ? '+' : '') + Number(v).toFixed(1) + '%';
}
// Lower-is-better cost colouring (used for TER / TIC on funds)
export function costColor(v, warn, bad) {
    if (v == null) return 'rgba(255,255,255,0.7)';
    if (v >= (bad != null ? bad : 3))  return '#ef4444';
    if (v >= (warn != null ? warn : 1.75)) return '#f59e0b';
    return '#10b981';
}
export function fmtVol(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return String(v);
}

// ── Shared inline styles ───────────────────────────────────────────────────────
export const selStyle = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 5, color: 'rgba(255,255,255,0.8)',
    padding: '5px 10px', fontSize: 11,
    fontFamily: 'JetBrains Mono, monospace', cursor: 'pointer', outline: 'none',
};

export const thBase = {
    padding: '8px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    fontFamily: 'JetBrains Mono, monospace',
};

// ── Sortable column header ──────────────────────────────────────────────────────
export function SortableHeader({ label, col, sort, onSort, align }) {
    const active = sort.col === col;
    return h('th', {
        onClick: function() { onSort(col); },
        style: Object.assign({}, thBase, {
            color: active ? '#00d4ff' : 'rgba(255,255,255,0.35)',
            cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
            textAlign: align || 'right',
        })
    }, label + (active ? (sort.asc ? ' ↑' : ' ↓') : ''));
}

export function PlainHeader({ label, align }) {
    return h('th', { style: Object.assign({}, thBase, { textAlign: align || 'left' }) }, label);
}

// ── Category badge ──────────────────────────────────────────────────────────────
export function CatBadge({ label, color }) {
    const c = color || 'rgba(255,255,255,0.45)';
    return h('span', {
        style: {
            fontSize: 10, color: c,
            fontFamily: 'JetBrains Mono, monospace',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap',
        }
    }, label || '—');
}

// ── Generic sort comparator over a column ──────────────────────────────────────
export function cmp(a, b, col, asc) {
    var av = a[col];
    var bv = b[col];
    // numeric vs string
    if (typeof av === 'number' || typeof bv === 'number') {
        av = av != null ? av : (asc ? Infinity : -Infinity);
        bv = bv != null ? bv : (asc ? Infinity : -Infinity);
        return asc ? av - bv : bv - av;
    }
    av = (av || '').toString().toLowerCase();
    bv = (bv || '').toString().toLowerCase();
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
}

// ── Hover-able table row wrapper ────────────────────────────────────────────────
export function HoverRow(props) {
    const [hov, setHov] = useState(false);
    return h('tr', {
        onMouseEnter: function() { setHov(true); },
        onMouseLeave: function() { setHov(false); },
        style: {
            background: hov ? 'rgba(0,212,255,0.04)' : 'transparent',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            transition: 'background 0.1s',
        }
    }, props.children);
}

export { h };
