// ============================================================
// Nexus Holdings — column registry and visibility
// ------------------------------------------------------------
// The table outgrew the screen once total return, vol and the forward
// multiple went on, so which columns show is now a choice rather than a
// constant. This module owns the catalogue and the persistence; the table
// owns the rendering.
//
// The default set is the one that answers "what do I own, is it working, and
// is it expensive" without horizontal scroll. Everything else — contribution,
// VaR, five-day, beta, the market multiple itself — is available but off,
// because a column you have to scroll past is worse than a column you opted
// into.
//
// `locked: true` means the column cannot be hidden. Ticker is locked because
// a row with no identity is not a row.
// ============================================================

export const COLUMNS = [
    { k: 'tk',            label: 'Ticker',      group: 'Identity',  locked: true,  l: true, sort: 'tk' },
    { k: 'sector',        label: 'Sector',      group: 'Identity',  l: true, sort: 'sector' },
    { k: 'theme',         label: 'Theme',       group: 'Identity',  l: true, sort: 'theme' },

    { k: 'weight',        label: 'Weight',      group: 'Position',  sort: 'currentWeightPct' },
    { k: 'conviction',    label: 'Conv (PCM)',  group: 'Position',  sort: 'conviction' },

    { k: 'todayPct',      label: 'Today',       group: 'Performance', sort: 'todayPct' },
    { k: 'totalReturn',   label: 'Total ret',   group: 'Performance', sort: 'totalReturnPct' },
    { k: 'contribPct',    label: 'Contrib',     group: 'Performance', sort: 'contribPct' },

    { k: 'annualVol',     label: 'Vol (ann)',   group: 'Risk',      sort: 'annualVol' },
    { k: 'componentVar',  label: 'VaR %',       group: 'Risk',      sort: 'componentVar' },

    { k: 'fwdPe',         label: 'Fwd P/E',     group: 'Valuation', sort: 'fwdPe' },
    { k: 'fwdPeGap',      label: 'vs Mkt',      group: 'Valuation', sort: 'fwdPePremiumPct' },
    { k: 'fwdPeBadge',    label: 'Prem / Disc', group: 'Valuation', sort: 'fwdPePremiumPct' },
    { k: 'marketFwdPe',   label: 'Mkt P/E',     group: 'Valuation' },
    { k: 'fvGapPct',      label: 'FV gap',      group: 'Valuation', sort: 'fvGapPct' },

    { k: 'signal',        label: 'Signal',      group: 'Read',      l: true },
    { k: 'options',       label: 'Options',     group: 'Read',      l: true },
    { k: 'read',          label: 'Read',        group: 'Read',      sort: 'read' },
    { k: 'trade',         label: 'Trade',       group: 'Read',      l: true },
];

/** Shown unless the user says otherwise. Deliberately fits without scrolling. */
export const DEFAULT_VISIBLE = [
    'tk', 'sector', 'theme',
    'weight', 'conviction',
    'todayPct', 'totalReturn',
    'annualVol',
    'fwdPe', 'fwdPeGap', 'fwdPeBadge',
    'read', 'trade',
];

const STORAGE_KEY = 'atlas.nexus.holdings.columns.v1';

export function loadVisible() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return new Set(DEFAULT_VISIBLE);
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || !arr.length) return new Set(DEFAULT_VISIBLE);
        // Drop keys that no longer exist, and force the locked ones back in, so
        // a stale preference can never render a table with no ticker column.
        const known = new Set(COLUMNS.map(c => c.k));
        const next = new Set(arr.filter(k => known.has(k)));
        COLUMNS.filter(c => c.locked).forEach(c => next.add(c.k));
        return next;
    } catch (_) {
        return new Set(DEFAULT_VISIBLE);
    }
}

export function saveVisible(set) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    } catch (_) { /* private mode — the session still works, it just won't persist */ }
}

/** Column groups in registry order, for the chooser's layout. */
export function columnGroups() {
    const out = [];
    for (const c of COLUMNS) {
        let g = out.find(x => x.name === c.group);
        if (!g) { g = { name: c.group, cols: [] }; out.push(g); }
        g.cols.push(c);
    }
    return out;
}

// ── Premium / discount banding ───────────────────────────────
// Bands rather than a raw number, because the question the column answers is
// "is this dear?" and a reader should not have to do the arithmetic. The
// thresholds are deliberately wide: a name within ±15% of the market multiple
// is, for this purpose, at the market.
export function premiumBand(premiumPct) {
    if (premiumPct == null || !isFinite(premiumPct)) return null;
    if (premiumPct >= 100) return { code: 'rich', label: 'RICH', tone: 'nf-band-rich' };
    if (premiumPct >= 15) return { code: 'premium', label: 'PREMIUM', tone: 'nf-band-prem' };
    if (premiumPct > -15) return { code: 'inline', label: 'IN LINE', tone: 'nf-band-inline' };
    if (premiumPct > -40) return { code: 'discount', label: 'DISCOUNT', tone: 'nf-band-disc' };
    return { code: 'deep', label: 'DEEP DISC', tone: 'nf-band-deep' };
}
