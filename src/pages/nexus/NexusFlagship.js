// ============================================================
// ATLAS Nexus — Flagship (Spine)
// ------------------------------------------------------------
// Positioning read through today's lens. This is the *spine*:
// full page structure + tab shell + per-ticker Live Object table,
// all wired to a single typed contract (NexusModel) served by a
// mock provider. No real computation lives here yet — every field
// flows from the resolved model. Swap the provider, not the
// components, when the meat wires in.
//
// See nexus/nexusModel.js for the contract and the handoff spec.
// ============================================================

import React from 'react';
import { getNexusModel } from './nexusLive.js';
import { NexusBoardSection } from './NexusBoard.js';
import { NexusEarningsTable } from './NexusEarnings.js';
import { NexusCotTable } from './NexusCot.js';
import { NexusThemePanel } from './NexusTheme.js';
import '../../styles/nexus-flagship.css';

const { useState, useEffect } = React;
const e = React.createElement;

// ── Formatters ───────────────────────────────────────────────
const signed = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(Number(v)).toFixed(d));
const pct1   = (v, d = 1) => (v == null ? '—' : signed(v, d) + '%');
const toneClass = t => 'tone-' + (t || 'neutral');
const moveTone  = v => (v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : 'tone-neutral');
const fmtUsd = v => {
    if (v == null) return '—';
    const a = Math.abs(v);
    if (a >= 1000) return '$' + (a / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k';
    return '$' + a.toFixed(0);
};

// Conviction → colour
const convColor = c => (c >= 75 ? 'var(--success)' : c >= 60 ? 'var(--cyan)' : c >= 45 ? 'var(--amber)' : 'var(--danger)');

// ── Tab definitions (ids match chef.hotTab + seasonal keys) ──
const TABS = [
    { id: 'flagship', label: 'Flagship' },
    { id: 'theme',    label: 'Theme',         seasonal: 'theme' },
    { id: 'regime',   label: 'Regime',        seasonal: 'regime' },
    { id: 'opp',      label: 'Opportunities', seasonal: 'opportunities' },
    { id: 'drift',    label: 'Drift',         seasonal: 'drift' },
];

// ── Live Object affordance — the click stub ───────────────────
// Spine establishes the contract + the affordance; cross-module
// drill is meat. Fire and forget.
function openLiveObject(objectId, tk) {
    window.dispatchEvent(new CustomEvent('nexus:open-object', { detail: { objectId, tk } }));
}

// ── Market clock ──────────────────────────────────────────────
function MarketClock({ marketStatus }) {
    const [t, setT] = useState('');
    useEffect(function () {
        const tick = () => setT(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);
    return e('div', { className: 'nf-clock' }, t, marketStatus ? e('span', { className: 'nf-mkt' }, marketStatus) : null);
}

// ── Data integrity indicator (REAL data) ──────────────────────
function DataIntegrityIndicator({ dataIntegrity: di }) {
    const [open, setOpen] = useState(false);
    if (!di) return null;
    const labelMap = { ok: 'All feeds current', warn: 'Feeds degraded', bad: 'Integrity failure' };
    return e('div', {
        className: 'nf-integrity ' + di.status,
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
    },
        e('span', { className: 'nf-dot' }),
        e('span', { className: 'nf-int-label' }, labelMap[di.status] || di.status),
        open && e('div', { className: 'nf-int-pop' },
            e('h5', null, 'Data integrity'),
            e('div', { className: 'nf-int-line' }, e('span', null, 'Status'), e('span', null, di.status.toUpperCase())),
            e('div', { className: 'nf-int-line' }, e('span', null, 'Stale feeds'), e('span', null, String(di.staleFeedCount))),
            e('div', { className: 'nf-int-line' }, e('span', null, 'Positioning age'),
                e('span', null, di.positioningAgeDays == null ? 'unknown' : di.positioningAgeDays + 'd')),
            di.staleTickers.length
                ? e('div', { className: 'nf-int-tickers' }, di.staleTickers.join(' · '))
                : null
        )
    );
}

// ── Header ────────────────────────────────────────────────────
function NexusHeader({ model }) {
    return e('div', { className: 'nf-header' },
        e('div', { className: 'nf-wordmark' },
            e('b', null, 'ATLAS ', e('span', null, 'Nexus')),
            e('small', null, 'Positioning · read through today')
        ),
        e('div', { className: 'nf-header-right' },
            e(MarketClock, { marketStatus: model.marketStatus }),
            e(DataIntegrityIndicator, { dataIntegrity: model.dataIntegrity })
        )
    );
}

// ── Tab rail ──────────────────────────────────────────────────
function TabRail({ activeTab, onTab, chef }) {
    return e('div', { className: 'nf-tabrail' },
        TABS.map(function (tab) {
            const isHot = chef && chef.hotTab === tab.id;
            return e('button', {
                key: tab.id,
                className: 'nf-tab' + (activeTab === tab.id ? ' active' : ''),
                onClick: () => onTab(tab.id),
            },
                tab.label,
                isHot ? e('span', { className: 'nf-hot' }, '● HOT') : null
            );
        })
    );
}

// ── Chefbar ───────────────────────────────────────────────────
function ChefBar({ chef, onTab }) {
    if (!chef) return null;
    const target = TABS.find(t => t.id === chef.hotTab);
    return e('div', { className: 'nf-chefbar' },
        e('span', { className: 'nf-chef-ico' }, '👨‍🍳'),
        e('span', { className: 'nf-chef-txt' }, chef.reason),
        target && target.id !== 'flagship'
            ? e('button', { className: 'nf-chef-link', onClick: () => onTab(chef.hotTab) }, 'Open ' + target.label + ' →')
            : null
    );
}

// ── Windshield band ───────────────────────────────────────────
function WindshieldBand({ windshield: w }) {
    if (!w) return null;
    // Split driver to emphasise driverEmphasis inline if present.
    let driverNode;
    if (w.driverEmphasis && w.driver) {
        driverNode = [w.driver, ' — this is ', e('em', { key: 'em' }, w.driverEmphasis), '.'];
    } else {
        driverNode = [w.driver];
    }
    return e('div', { className: 'nf-windshield nf-fade' },
        e('div', { className: 'nf-driver' }, driverNode),
        e('div', { className: 'nf-stats' },
            (w.stats || []).map(function (s, i) {
                return e('div', { className: 'nf-stat', key: i },
                    e('div', { className: 'nf-stat-l' }, s.label),
                    e('div', { className: 'nf-stat-v ' + toneClass(s.tone) }, s.value),
                    s.change ? e('div', { className: 'nf-stat-c ' + toneClass(s.tone) }, s.change) : null
                );
            })
        )
    );
}

// ── Gauges ────────────────────────────────────────────────────
function chipClass(verdict) {
    const v = (verdict || '').toLowerCase();
    if (/(fragile|breach|over|exceed|fail)/.test(v)) return 'bad';
    if (/(within|beat|ok|good|healthy|current)/.test(v)) return 'good';
    if (/(watch|wary|tight|elevated)/.test(v)) return 'warnc';
    return 'neutral';
}

function RiskGauge({ g }) {
    const usedFrac = Math.min(1, g.budgetUsedPct / (g.limitPct || 100));
    const barColor = g.budgetUsedPct >= g.limitPct ? 'var(--danger)' : g.budgetUsedPct >= 80 ? 'var(--warn)' : 'var(--success)';
    return e('div', { className: 'nf-card nf-gauge nf-fade' },
        e('div', { className: 'nf-card-h' }, e('h3', null, 'Risk'), e('span', { className: 'nf-chip ' + chipClass(g.verdictChip) }, g.verdictChip)),
        e('div', { className: 'nf-gauge-top' },
            e('span', { className: 'nf-gauge-big' }, g.budgetUsedPct, e('span', { className: 'nf-gauge-unit' }, ' / ' + g.limitPct + '%')),
            e('span', { className: 'nf-mono ' + (g.deltaTodayPts >= 0 ? 'tone-down' : 'tone-up'), style: { fontSize: 11 } }, 'Δ ' + signed(g.deltaTodayPts, 0) + 'pt')
        ),
        e('div', { className: 'nf-bar' }, e('i', { style: { width: (usedFrac * 100) + '%', background: barColor } })),
        e('div', { className: 'nf-note' }, g.note)
    );
}

function PerformanceGauge({ g }) {
    const rel = g.bookPct - g.benchPct;
    return e('div', { className: 'nf-card nf-gauge nf-fade' },
        e('div', { className: 'nf-card-h' }, e('h3', null, 'Performance'), e('span', { className: 'nf-chip ' + chipClass(g.verdictChip) }, g.verdictChip)),
        e('div', { className: 'nf-gauge-top' },
            e('span', { className: 'nf-gauge-big ' + moveTone(g.bookPct) }, pct1(g.bookPct)),
            e('span', { className: 'nf-gauge-unit' }, 'bench ' + pct1(g.benchPct) + ' · rel ' + pct1(rel))
        ),
        e('div', { className: 'nf-movers' },
            (g.topMovers || []).map((m, i) => e('span', { className: 'nf-mover ' + moveTone(m.pct), key: i }, m.tk + ' ' + pct1(m.pct)))
        ),
        e('div', { className: 'nf-note' }, g.note,
            e('div', { style: { marginTop: 6, color: 'var(--text3)' } }, 'Concentrated contribution: ' + g.concentratedContribPct + '%'))
    );
}

function ConcentrationGauge({ g }) {
    return e('div', { className: 'nf-card nf-gauge nf-fade' },
        e('div', { className: 'nf-card-h' }, e('h3', null, 'Concentration'), e('span', { className: 'nf-chip ' + chipClass(g.verdictChip) }, g.verdictChip)),
        e('div', { className: 'nf-gauge-top' },
            e('span', { className: 'nf-gauge-big' }, g.effectiveN.toFixed(1), e('span', { className: 'nf-gauge-unit' }, ' eff N / ' + g.nominalN)),
            e('span', { className: 'nf-mono tone-warn', style: { fontSize: 11 } }, 'top factor ' + g.topFactorPct + '%')
        ),
        e('div', { className: 'nf-cluster' }, 'Fragility cluster: ' + (g.fragilityCluster || []).join(' · ')),
        e('div', { className: 'nf-note' }, g.note)
    );
}

function ContextGauges({ gauges }) {
    if (!gauges) return null;
    return e('div', { className: 'nf-gauges' },
        e(RiskGauge, { g: gauges.risk }),
        e(PerformanceGauge, { g: gauges.performance }),
        e(ConcentrationGauge, { g: gauges.concentration })
    );
}

// ── Positioning spine ─────────────────────────────────────────
function riskShiftBars(rs) {
    const bars = [];
    for (let i = 0; i < 2; i++) {
        let cls = '';
        if (rs > 0 && i < rs) cls = 'on-up';
        else if (rs < 0 && i === 0) cls = 'on-down';
        bars.push(e('i', { key: i, className: cls }));
    }
    return e('span', { className: 'nf-rs', title: 'risk shift ' + rs }, bars);
}

function PositioningSpine({ spine }) {
    if (!spine || !spine.length) return null;
    const maxShare = Math.max.apply(null, spine.map(r => r.sharePct));
    return e('div', { className: 'nf-card nf-spine nf-fade' },
        e('div', { className: 'nf-card-h' }, e('h3', null, 'Positioning spine'), e('span', { className: 'nf-sub' }, 'share · today · risk shift')),
        spine.map(function (r, i) {
            return e('div', { className: 'nf-spine-row', key: i },
                e('div', { className: 'nf-spine-theme' },
                    r.theme,
                    r.fragility ? e('span', { className: 'nf-frag', title: 'fragility cluster' }, '◆') : null,
                    r.stale ? e('span', { className: 'nf-stale-tag' }, 'stale') : null
                ),
                e('div', { className: 'nf-spine-share' }, r.sharePct.toFixed(1) + '%'),
                e('div', { className: 'nf-spine-move ' + moveTone(r.movePct) }, pct1(r.movePct)),
                e('div', { className: 'nf-spine-track' },
                    e('i', { style: { width: (r.sharePct / maxShare * 100) + '%', background: r.fragility ? 'var(--purple)' : 'var(--cyan)' } }),
                    riskShiftBars(r.riskShift)
                )
            );
        })
    );
}

// ── Holdings table (Live Objects) ─────────────────────────────
const COLS = [
    { k: 'tk',           label: 'Ticker',     l: true, sort: 'tk' },
    { k: 'theme',        label: 'Theme',      l: true, sort: 'theme' },
    { k: 'conviction',   label: 'Conv (PCM)',          sort: 'conviction' },
    { k: 'todayPct',     label: 'Today',               sort: 'todayPct' },
    { k: 'contribPct',   label: 'Contrib',             sort: 'contribPct' },
    { k: 'componentVar', label: 'VaR %',               sort: 'componentVar' },
    { k: 'fvGapPct',     label: 'FV gap',              sort: 'fvGapPct' },
    { k: 'signal',       label: 'Signal',     l: true },
    { k: 'read',         label: 'Read',                sort: 'read' },
    { k: 'trade',        label: 'Trade',      l: true },
];

// Read taxonomy order — used for the filter rail and read-sort rank.
const READ_ORDER = ['add', 'hold', 'trim', 'watch', 'exit'];
const READ_RANK = { add: 0, hold: 1, trim: 2, watch: 3, exit: 4 };

// Diverging fair-value-gap bar: green right (cheap), red left (rich),
// centred at zero, scaled against the widest gap currently in view.
function FvGapBar({ v, scale }) {
    if (v == null) return e('span', { className: 'nf-fvbar' });
    const frac = Math.max(-1, Math.min(1, v / (scale || 1)));
    const w = Math.abs(frac) * 50;
    const pos = v >= 0;
    return e('span', { className: 'nf-fvbar' },
        e('i', { className: pos ? 'pos' : 'neg', style: pos ? { left: '50%', width: w + '%' } : { right: '50%', width: w + '%' } })
    );
}

// ── Trade quantum cell ────────────────────────────────────────
// The conviction-target trade for a name, in the read's direction.
// The chip stages it to the blotter (stop-propagation so the row's
// open-object click doesn't also fire). HOLD/WATCH → —; an ADD/TRIM
// already at its conviction weight → "at target".
function TradeCell({ h, staged, onStage }) {
    if (!h.tradeSide || !h.tradeShares) {
        return h.atTarget
            ? e('span', { className: 'nf-trade-at', title: 'Already at conviction-target weight' }, 'at target')
            : e('span', { style: { color: 'var(--text3)' } }, '—');
    }
    const sh = Math.abs(h.tradeShares);
    const cls = h.tradeSide === 'buy' ? 'buy' : 'sell';
    return e('span', { className: 'nf-trade ' + cls },
        e('button', {
            className: 'nf-trade-stage ' + cls + (staged ? ' staged' : ''),
            onClick: ev => { ev.stopPropagation(); onStage(h); },
            title: (staged ? 'Staged — click to remove. ' : 'Stage → blotter. ') +
                h.tradeSide.toUpperCase() + ' ' + sh + ' ' + h.tk +
                ' (to ' + h.targetWeightPct + '% target vs ' + h.currentWeightPct + '% now)',
        }, (h.tradeSide === 'buy' ? '＋' : '－') + sh),
        e('span', { className: 'nf-trade-usd' }, fmtUsd(h.tradeUsd))
    );
}

// ── Account mode (PAPER / LIVE) for the blotter banner ────────
function useAccountMode() {
    const [m, setM] = useState(null);
    useEffect(function () {
        let alive = true;
        fetch('/api/trading?action=account').then(r => (r.ok ? r.json() : null))
            .then(j => { if (alive && j && j.mode) setM({ mode: j.mode, buyingPower: j.buyingPower }); })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    return m;
}

// ── Order blotter ─────────────────────────────────────────────
// Staged tickets, reviewed as a batch. Nothing reaches the broker
// until an explicit two-step submit (arm → confirm). Each order posts
// through /api/trading (paper by default) with the nexus decision
// context (conviction + signal) so the Ledger records *why*.
function OrderBlotter({ tickets, onRemove, onClear }) {
    const acct = useAccountMode();
    const [arming, setArming] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [results, setResults] = useState(null);
    if (!tickets.length) return null;

    const mode = acct && acct.mode;
    const buys = tickets.filter(t => t.side === 'buy').reduce((a, t) => a + t.usd, 0);
    const sells = tickets.filter(t => t.side === 'sell').reduce((a, t) => a + t.usd, 0);

    async function submit() {
        setSubmitting(true);
        const out = {};
        for (const t of tickets) {
            try {
                const r = await fetch('/api/trading?action=order', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        symbol: t.tk, side: t.side, qty: t.shares, type: 'market', tif: 'day',
                        client_order_id: 'nexus-' + t.tk.toLowerCase() + '-' + Date.now(),
                        ledger: {
                            conviction: t.conviction, intent: t.read,
                            rationale: 'Nexus conviction-target rebalance',
                            snapshot: { signal: t.signal, side: t.side, shares: t.shares, read: t.read },
                        },
                    }),
                });
                const j = await r.json().catch(() => ({}));
                out[t.tk] = (r.ok && j.success) ? { ok: true, status: (j.order && j.order.status) || 'submitted' } : { ok: false, status: j.error || 'rejected' };
            } catch (e) { out[t.tk] = { ok: false, status: (e && e.message) || 'error' }; }
        }
        setResults(out);
        setSubmitting(false);
        setArming(false);
    }

    return e('div', { className: 'nf-card nf-blotter nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Order blotter'),
            e('span', { className: 'nf-sub' },
                tickets.length + ' ticket' + (tickets.length > 1 ? 's' : '') + ' · buys ' + fmtUsd(buys) + ' · sells ' + fmtUsd(sells),
                mode ? e('span', { className: 'nf-mode ' + (mode === 'LIVE' ? 'live' : 'paper') }, mode) : null
            )
        ),
        e('div', { className: 'nf-blotter-list' },
            tickets.map(function (t) {
                const res = results && results[t.tk];
                return e('div', { className: 'nf-blot-row', key: t.tk },
                    e('span', { className: 'nf-blot-side ' + t.side }, t.side.toUpperCase()),
                    e('span', { className: 'nf-tk' }, t.tk),
                    e('span', { className: 'nf-blot-qty' }, t.shares + ' sh'),
                    e('span', { className: 'nf-blot-usd' }, '≈ ' + fmtUsd(t.usd)),
                    res
                        ? e('span', { className: 'nf-blot-res ' + (res.ok ? 'ok' : 'err'), title: res.status }, (res.ok ? '✓ ' : '✗ ') + res.status)
                        : e('button', { className: 'nf-blot-x', onClick: () => onRemove(t.tk), title: 'Remove ticket' }, '×')
                );
            })
        ),
        e('div', { className: 'nf-blotter-foot' },
            e('span', { className: 'nf-blot-note ' + (mode === 'LIVE' ? 'live' : '') },
                mode === 'LIVE'
                    ? '⚠ LIVE account — these execute against real capital.'
                    : 'Paper account — simulated fills. Market orders · day.'),
            e('div', { className: 'nf-blot-actions' },
                e('button', { className: 'nf-blot-clear', onClick: onClear, disabled: submitting }, results ? 'Close' : 'Clear'),
                !results
                    ? (arming
                        ? e('button', { className: 'nf-blot-submit confirm', onClick: submit, disabled: submitting },
                            submitting ? 'Submitting…' : 'Confirm ' + tickets.length + (mode ? ' · ' + mode : ''))
                        : e('button', { className: 'nf-blot-submit', onClick: () => setArming(true) }, 'Submit batch'))
                    : null
            )
        )
    );
}

function HoldingsTable({ holdings, forceTheme }) {
    // Expanded `because` rows. The read chip is the why-affordance:
    // clicking it toggles the explanation (and stops the row's
    // open-object click so the two interactions don't collide).
    const [expanded, setExpanded] = useState({});
    const [query, setQuery] = useState('');
    const [theme, setTheme] = useState('ALL');
    const [reads, setReads] = useState(() => new Set());
    const [sortK, setSortK] = useState('');     // '' = provider order (weight desc)
    const [sortDir, setSortDir] = useState('desc');
    const [blotter, setBlotter] = useState({}); // tk → staged ticket
    // Drill-down from the Theme tab routes here with a theme to filter to.
    useEffect(() => { if (forceTheme) setTheme(forceTheme); }, [forceTheme]);
    if (!holdings || !holdings.length) return null;

    const toggle = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    // Stage / unstage a conviction-target trade. Clicking a staged name again
    // pulls it back off the blotter (the chip doubles as the remove affordance).
    const onStage = h => setBlotter(prev => {
        const next = { ...prev };
        if (next[h.tk]) delete next[h.tk];
        else next[h.tk] = { tk: h.tk, side: h.tradeSide, shares: Math.abs(h.tradeShares), usd: Math.abs(h.tradeUsd), price: h.price, read: h.read, conviction: h.conviction, signal: h.signal };
        return next;
    });
    const removeTicket = tk => setBlotter(prev => { const n = { ...prev }; delete n[tk]; return n; });
    const clearBlotter = () => setBlotter({});
    const tickets = Object.values(blotter);
    const toggleRead = r => setReads(prev => {
        const next = new Set(prev);
        if (next.has(r)) next.delete(r); else next.add(r);
        return next;
    });
    const setSort = k => {
        if (!k) return;
        if (sortK === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortK(k); setSortDir(k === 'tk' || k === 'theme' ? 'asc' : 'desc'); }
    };
    const arrow = k => (sortK === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

    // Live facets: themes for the dropdown, read counts for the rail.
    const themes = Array.from(new Set(holdings.map(h => h.theme))).sort();
    const counts = holdings.reduce((m, h) => { m[h.read] = (m[h.read] || 0) + 1; return m; }, {});

    // Filter → sort.
    const q = query.trim().toLowerCase();
    let rows = holdings.filter(h =>
        (!q || h.tk.toLowerCase().includes(q)) &&
        (theme === 'ALL' || h.theme === theme) &&
        (!reads.size || reads.has(h.read))
    );
    if (sortK) {
        const dir = sortDir === 'asc' ? 1 : -1;
        rows = rows.slice().sort((a, b) => {
            if (sortK === 'tk' || sortK === 'theme') return String(a[sortK] || '').localeCompare(String(b[sortK] || '')) * dir;
            if (sortK === 'read') return ((READ_RANK[a.read] ?? 9) - (READ_RANK[b.read] ?? 9)) * dir;
            let av = Number(a[sortK]); let bv = Number(b[sortK]);
            if (isNaN(av)) av = -Infinity; if (isNaN(bv)) bv = -Infinity;
            return (av - bv) * dir;
        });
    }
    // FV-gap bar scale = widest absolute gap in view (floored so small books still read).
    const fvScale = Math.max(10, ...rows.map(h => Math.abs(Number(h.fvGapPct) || 0)));
    const dirty = reads.size || theme !== 'ALL' || query;

    return e(React.Fragment, null,
      e('div', { className: 'nf-card nf-holdings nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Holdings'),
            e('span', { className: 'nf-sub' }, rows.length + ' / ' + holdings.length + ' live objects · derived reads')
        ),

        // Filter bar — search + theme + read-distribution rail (doubles as a visual)
        e('div', { className: 'nf-filters' },
            e('input', {
                className: 'nf-search', type: 'text', placeholder: 'Search ticker…',
                value: query, onChange: ev => setQuery(ev.target.value),
            }),
            e('select', { className: 'nf-theme-select', value: theme, onChange: ev => setTheme(ev.target.value) },
                e('option', { value: 'ALL' }, 'All themes'),
                themes.map(t => e('option', { key: t, value: t }, t))
            ),
            e('div', { className: 'nf-rfilter' },
                READ_ORDER.filter(r => counts[r]).map(r => e('button', {
                    key: r,
                    className: 'nf-rchip ' + r + (reads.has(r) ? ' active' : ''),
                    onClick: () => toggleRead(r),
                    title: 'Filter ' + r,
                }, r, e('span', { className: 'nf-rchip-n' }, counts[r]))),
                dirty ? e('button', { className: 'nf-rclear', onClick: () => { setReads(new Set()); setTheme('ALL'); setQuery(''); } }, 'clear') : null
            )
        ),

        // Table — capped height + internal scroll, sticky header
        e('div', { className: 'nf-table-scroll' },
            e('table', { className: 'nf-table' },
                e('thead', null, e('tr', null,
                    COLS.map(c => e('th', {
                        key: c.k,
                        className: (c.l ? 'nf-l' : '') + (c.sort ? ' nf-th-sort' : ''),
                        onClick: c.sort ? () => setSort(c.sort) : undefined,
                    }, c.label, c.sort ? arrow(c.sort) : ''))
                )),
                e('tbody', null,
                    rows.length ? rows.map(function (h) {
                        const isOpen = !!expanded[h.objectId];
                        const out = [
                            e('tr', {
                                key: h.objectId,
                                className: h.stale ? 'nf-stale-row' : '',
                                onClick: () => openLiveObject(h.objectId, h.tk),
                                title: 'Open ' + h.tk + ' live object',
                            },
                                e('td', { className: 'nf-l' }, e('span', { className: 'nf-tk' }, h.tk)),
                                e('td', { className: 'nf-l nf-theme-cell' }, h.theme),
                                e('td', null, e('span', { className: 'nf-conv-bar' },
                                    e('span', { className: 'nf-cb-track' }, e('i', { style: { width: h.conviction + '%', background: convColor(h.conviction) } })),
                                    e('span', { className: 'nf-mono-cell' }, h.conviction))),
                                e('td', { className: 'nf-mono-cell ' + moveTone(h.todayPct) }, pct1(h.todayPct)),
                                e('td', { className: 'nf-mono-cell ' + moveTone(h.contribPct) }, pct1(h.contribPct, 2)),
                                e('td', { className: 'nf-mono-cell' }, (h.componentVar ?? 0).toFixed(1) + '%'),
                                e('td', { className: 'nf-mono-cell ' + moveTone(h.fvGapPct) },
                                    e('span', { className: 'nf-fv-wrap' },
                                        e(FvGapBar, { v: h.fvGapPct, scale: fvScale }),
                                        e('span', null, pct1(h.fvGapPct)))),
                                e('td', { className: 'nf-l' }, h.signal ? e('span', { className: 'nf-sig' }, h.signal) : e('span', { style: { color: 'var(--text3)' } }, '—')),
                                e('td', null, e('span', {
                                    className: 'nf-read-chip ' + h.read + (isOpen ? ' open' : ''),
                                    title: h.because,
                                    onClick: ev => { ev.stopPropagation(); toggle(h.objectId); },
                                }, h.read)),
                                e('td', { className: 'nf-l' }, e(TradeCell, { h, staged: !!blotter[h.tk], onStage }))
                            ),
                        ];
                        if (isOpen) {
                            out.push(e('tr', { key: h.objectId + '-why', className: 'nf-why-row' },
                                e('td', { colSpan: COLS.length },
                                    e('span', { className: 'nf-why-label' }, 'WHY'),
                                    e('span', { className: 'nf-why-text' }, h.because))
                            ));
                        }
                        return out;
                    }) : e('tr', null, e('td', { colSpan: COLS.length, className: 'nf-empty' }, 'No holdings match these filters.'))
                )
            )
        )
      ),
      e(OrderBlotter, { tickets, onRemove: removeTicket, onClear: clearBlotter })
    );
}

// ── The Read (rate-view toggle) ───────────────────────────────
const STANCE_LABEL = { market: 'What’s priced', hfl: 'Higher-for-longer' };
function TheRead({ read }) {
    const keys = read && read.variants ? Object.keys(read.variants) : [];
    const initial = read && read.default && read.variants[read.default] ? read.default : keys[0];
    const [stance, setStance] = useState(initial);
    if (!read || !keys.length) return null;
    const variant = read.variants[stance] || read.variants[keys[0]];
    return e('div', { className: 'nf-card nf-read nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'The Read'),
            e('div', { className: 'nf-read-toggle' },
                keys.map(k => e('button', {
                    key: k,
                    className: stance === k ? 'active' : '',
                    onClick: () => setStance(k),
                }, STANCE_LABEL[k] || k))
            )
        ),
        e('div', { className: 'nf-read-body' },
            e('span', { className: 'nf-read-dot ' + (variant.dotTone || 'warn') }),
            e('span', { dangerouslySetInnerHTML: { __html: variant.html } })
        )
    );
}

// ── Flagship panel ────────────────────────────────────────────
function FlagshipPanel({ model, holdingsTheme }) {
    return e('div', null,
        e(WindshieldBand, { windshield: model.windshield }),
        e(ContextGauges, { gauges: model.gauges }),
        e(NexusBoardSection, null),
        e(PositioningSpine, { spine: model.spine }),
        e(HoldingsTable, { holdings: model.holdings, forceTheme: holdingsTheme }),
        e(NexusEarningsTable, null),
        e(NexusCotTable, null),
        e(TheRead, { read: model.read })
    );
}

// ── Seasonal panels (shell — render whatever the mock supplies) ─
function SeasonalPanel({ data }) {
    if (!data) return e('div', { className: 'nf-card nf-seasonal' }, e('div', { className: 'nf-note' }, 'No data.'));
    return e('div', { className: 'nf-card nf-seasonal nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('div', null,
                e('h3', null, data.title || '—'),
                data.subtitle ? e('div', { className: 'nf-sub', style: { marginTop: 4 } }, data.subtitle) : null
            )
        ),
        data.tags ? e('div', { className: 'nf-tags' }, data.tags.map((t, i) => e('span', { className: 'nf-tag', key: i }, t))) : null,
        (data.body || []).map((p, i) => e('p', { key: i }, p)),
        e('div', { className: 'nf-deferred' }, '◇ Spine shell — live seasonal intelligence wires in behind this same contract (meat).')
    );
}

// ── Page (owns activeTab + NexusModel) ────────────────────────
export function NexusFlagshipPage() {
    const [model, setModel] = useState(null);
    const [err, setErr] = useState(null);
    const [activeTab, setActiveTab] = useState('flagship');
    const [holdingsTheme, setHoldingsTheme] = useState(null);

    useEffect(function () {
        let alive = true;
        getNexusModel()
            .then(m => { if (alive) setModel(m); })
            .catch(er => { if (alive) setErr(er.message || String(er)); });
        return () => { alive = false; };
    }, []);

    // Theme-tab drill-down → route to Flagship with the holdings filtered.
    useEffect(function () {
        const onFilter = ev => {
            const theme = ev && ev.detail && ev.detail.theme;
            if (!theme) return;
            setHoldingsTheme(theme);
            setActiveTab('flagship');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
        window.addEventListener('nexus:filter-theme', onFilter);
        return () => window.removeEventListener('nexus:filter-theme', onFilter);
    }, []);

    if (err) return e('div', { className: 'nexus-flagship nf-loading' }, '⚠ Nexus failed to load: ' + err);
    if (!model) return e('div', { className: 'nexus-flagship nf-loading' },
        e('div', { style: { fontSize: 22, marginBottom: 10 } }, '⬡'), 'Loading Nexus…');

    const setTab = id => setActiveTab(id);
    const tabEntry = TABS.find(t => t.id === activeTab) || TABS[0];

    let panel;
    if (activeTab === 'flagship') {
        panel = e(FlagshipPanel, { model, holdingsTheme });
    } else if (activeTab === 'theme') {
        panel = e('div', { className: 'nf-seasonal' }, e(NexusThemePanel, { model }));
    } else {
        panel = e('div', { className: 'nf-seasonal' }, e(SeasonalPanel, { data: model.seasonal && model.seasonal[tabEntry.seasonal] }));
    }

    return e('div', { className: 'nexus-flagship' },
        e('div', { className: 'nf-page' },
            e(NexusHeader, { model }),
            e(TabRail, { activeTab, onTab: setTab, chef: model.chef }),
            // chefbar nudges toward the hot tab; same setTab() as the rail
            activeTab === 'flagship' ? e(ChefBar, { chef: model.chef, onTab: setTab }) : null,
            panel
        )
    );
}

export default NexusFlagshipPage;
