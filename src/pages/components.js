import React from 'react';
// ============================================================
// ATLAS Terminal — Shared UI Components
// ------------------------------------------------------------
// Stateless atoms (Loading, EmptyState, ConfigPrompt,
// NarrativeStrip) + small data-aware widgets (TopBarSparkline,
// SyncStatusPill) that reuse the shared data layer.
// ============================================================

import { sb, loadView, triggerRefresh } from './config.js';
import { heroBadgeCls } from './utils.js';

const { useState, useEffect, useRef } = React;

// --- Loading Component ---
export function Loading({ text }) {
    return React.createElement('div', { className: 'loading-spinner' }, text || 'Loading data...');
}

// --- Empty State ---
export function EmptyState({ message }) {
    return React.createElement('div', { className: 'empty-state' },
        React.createElement('div', { style: { fontSize: 36, marginBottom: 12 } }, '⚠'),
        React.createElement('div', null, message || 'No data available — run Alpaca sync first')
    );
}

// --- Demo Mode Banner (non-blocking — shown when no Supabase key) ---
export function ConfigPrompt() {
    var _d = useState(false);
    var dismissed = _d[0];
    var setDismissed = _d[1];
    if (dismissed) return null;
    return React.createElement('div', {
        style: {
            background: 'rgba(0,200,224,0.08)',
            borderBottom: '1px solid rgba(0,200,224,0.2)',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 12,
            fontFamily: 'JetBrains Mono',
            color: 'rgba(255,255,255,0.6)',
            flexShrink: 0,
        }
    },
        React.createElement('span', { style: { color: '#00c8e0', fontWeight: 600 } }, '○ DEMO MODE'),
        React.createElement('span', null, 'Set '),
        React.createElement('code', { style: { background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 3, color: '#f4a261' } }, 'VITE_SUPABASE_ANON_KEY'),
        React.createElement('span', null, ' in Vercel → Environment Variables → All Environments to enable live data.'),
        React.createElement('button', {
            onClick: function() { setDismissed(true); },
            style: { marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }
        }, '×')
    );
}

// --- Hero Card — gradient metric tile with accent line + status badge ---
export function HeroCard({ icon, label, value, color, accent, badge, sub }) {
    return React.createElement('div', { className: 'hero-card accent-' + (accent || 'cyan') },
        icon ? React.createElement('span', { className: 'hc-icon' }, icon) : null,
        React.createElement('div', { className: 'hc-label' }, label),
        React.createElement('div', { className: 'hc-value', style: { color: color || 'var(--text)' } }, value),
        badge ? React.createElement('span', { className: 'hc-badge ' + heroBadgeCls(badge) }, badge) : null,
        sub ? React.createElement('div', { className: 'hc-sub' }, sub) : null
    );
}

// --- Narrative builder (one-line insight strip per panel) ---
export function NarrativeStrip({ items, title }) {
    if (!items || !items.length) return null;
    return React.createElement('div', {
        className: 'card',
        style: {
            marginBottom: 16,
            padding: '12px 16px',
            borderLeft: '2px solid rgba(0,212,255,0.45)',
            background: 'linear-gradient(90deg, rgba(0,212,255,0.04), rgba(255,255,255,0.015) 40%, transparent)',
        }
    },
        React.createElement('div', {
            style: {
                fontSize: 9, letterSpacing: 1.2, fontWeight: 700,
                color: 'rgba(0,212,255,0.6)', fontFamily: 'JetBrains Mono',
                marginBottom: 8, textTransform: 'uppercase',
            }
        }, title || 'Daily Readout'),
        React.createElement('div', { className: 'narrative-strip', style: { display: 'flex', flexDirection: 'column', gap: 6 } },
            items.map((it, i) => React.createElement('div', {
                key: i, className: 'narrative-line',
                style: { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, lineHeight: 1.55, color: 'rgba(255,255,255,0.78)' }
            },
                React.createElement('span', {
                    className: 'narrative-icon',
                    style: { color: 'rgba(0,212,255,0.7)', fontSize: 11, lineHeight: '20px', flexShrink: 0, width: 14, textAlign: 'center' }
                }, it.icon || '◇'),
                React.createElement('span', {
                    className: 'narrative-text',
                    style: { flex: 1 },
                    dangerouslySetInnerHTML: { __html: it.text }
                })
            ))
        )
    );
}

// --- Top bar sparkline (tiny inline chart) ---
export function TopBarSparkline({ nav }) {
    var canvasRef = useRef(null);
    useEffect(function() {
        if (!nav || !nav.length || !canvasRef.current) return;
        var ctx = canvasRef.current.getContext('2d');
        var w = canvasRef.current.width;
        var h = canvasRef.current.height;
        ctx.clearRect(0, 0, w, h);
        var vals = nav.slice(-60).map(function(d) { return d.nav; });
        var min = Math.min.apply(null, vals);
        var max = Math.max.apply(null, vals);
        var range = max - min || 1;
        ctx.beginPath();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        vals.forEach(function(v, i) {
            var x = (i / (vals.length - 1)) * w;
            var y = h - ((v - min) / range) * (h - 4) - 2;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }, [nav]);
    return React.createElement('canvas', { ref: canvasRef, width: 120, height: 32, className: 'sparkline-container' });
}

// --- Sync status pill — reads vw_sync_status (latest row from sync_log) ---
// Fires atlas:refresh whenever last_synced_at advances (new Alpaca sync landed).
export function SyncStatusPill() {
    var _s = useState(null);
    var sync = _s[0];
    var setSync = _s[1];

    useEffect(function() {
        if (!sb) return;
        var prevSyncedAt = null;
        function load() {
            loadView('vw_sync_status', []).then(function(rows) {
                var row = rows && rows.length ? rows[0] : null;
                setSync(row);
                if (row && row.last_synced_at && row.last_synced_at !== prevSyncedAt) {
                    if (prevSyncedAt !== null) triggerRefresh();
                    prevSyncedAt = row.last_synced_at;
                }
            });
        }
        load();
        var t = setInterval(load, 60000);
        return function() { clearInterval(t); };
    }, []);

    if (!sb) return null;
    if (!sync) {
        return React.createElement('div', { className: 'sync-pill', title: 'No sync data yet' },
            React.createElement('span', { className: 'dot' }),
            'SYNC —'
        );
    }

    var seconds = sync.seconds_since != null ? sync.seconds_since : 9999;
    var tier = 'ok';
    if (sync.status === 'error') tier = 'err';
    else if (sync.status === 'running' && seconds > 600) tier = 'warn';
    else if (seconds > 3600) tier = 'err';
    else if (seconds > 1200 || sync.status === 'partial') tier = 'warn';

    var rel;
    if (seconds < 60) rel = Math.max(1, Math.round(seconds)) + 's';
    else if (seconds < 3600) rel = Math.round(seconds / 60) + 'm';
    else if (seconds < 86400) rel = Math.round(seconds / 3600) + 'h';
    else rel = Math.round(seconds / 86400) + 'd';

    var title = 'Status: ' + sync.status
        + (sync.positions_upserted != null ? '\nPositions: ' + sync.positions_upserted : '')
        + (sync.duration_ms != null ? '\nDuration: ' + sync.duration_ms + 'ms' : '')
        + (sync.error_message ? '\nError: ' + sync.error_message : '');

    return React.createElement('div', { className: 'sync-pill ' + tier, title: title },
        React.createElement('span', { className: 'dot' }),
        'SYNC ' + rel + ' AGO'
    );
}

// --- Manual refresh button ---
export function RefreshButton() {
    var _s = useState(false);
    var spinning = _s[0];
    var setSpinning = _s[1];

    function handleClick() {
        setSpinning(true);
        triggerRefresh();
        setTimeout(function() { setSpinning(false); }, 1200);
    }

    return React.createElement('button', {
        onClick: handleClick,
        title: 'Refresh all portfolio data',
        style: {
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 5,
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            fontSize: 12,
            padding: '3px 8px',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: 0.5,
            transition: 'all 0.15s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
        }
    },
        React.createElement('span', {
            style: {
                display: 'inline-block',
                transition: 'transform 0.6s',
                transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)',
            }
        }, '↺'),
        'REFRESH'
    );
}
