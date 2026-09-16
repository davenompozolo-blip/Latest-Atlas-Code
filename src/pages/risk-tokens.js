// ============================================================
// Risk module design tokens and shared styles
// ------------------------------------------------------------
// Extracted from risk-v2.js so the Model validation section (F-3) can
// use the SAME card, border, radius, padding and type scale rather than
// a second copy that drifts from it. Nothing here changed in the move --
// the values are byte-identical to the ones risk-v2.js defined.
//
// It lives in its own module rather than being exported from risk-v2.js
// because that would be an import cycle: risk-v2 imports the section,
// the section needs T at module-evaluation time, and T is a `var`, so it
// would read as undefined and throw on load.
// ============================================================

// ── Design tokens ──────────────────────────────────────────────────────────────
var T = {
    bg:      'rgba(255,255,255,0.025)',
    border:  'rgba(255,255,255,0.07)',
    teal:    '#00d4b8',
    gold:    '#f4b942',
    green:   '#22c55e',
    red:     '#ef4444',
    blue:    '#3b82f6',
    purple:  '#a855f7',
    amber:   '#f59e0b',
    slate:   '#64748b',
    t1:      'rgba(255,255,255,0.88)',
    t2:      'rgba(255,255,255,0.45)',
    t3:      'rgba(255,255,255,0.22)',
    mono:    "'JetBrains Mono', ui-monospace, monospace",
    sectors: {
        'Technology':             '#3b82f6',
        'Materials':              '#f59e0b',
        'Consumer Discretionary': '#a855f7',
        'International':          '#00d4b8',
        'Energy':                 '#22c55e',
        'Financials':             '#64748b',
        'Healthcare':             '#ec4899',
        'Industrials':            '#6366f1',
        'Other':                  '#475569',
    },
};

// ── Shared styles ──────────────────────────────────────────────────────────────
var card = { background: T.bg, border: '1px solid ' + T.border, borderRadius: 10, padding: '18px 20px', marginBottom: 16 };
var cardTitle = { fontSize: 10, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase', color: T.t2, fontFamily: T.mono, marginBottom: 14 };
var th = { padding: '6px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: T.t3, fontFamily: T.mono, borderBottom: '1px solid ' + T.border, textAlign: 'left', whiteSpace: 'nowrap' };
var td = { padding: '7px 10px', fontSize: 11, fontFamily: T.mono, borderBottom: '1px solid rgba(255,255,255,0.04)', color: T.t1 };

export { T, card, cardTitle, th, td };
