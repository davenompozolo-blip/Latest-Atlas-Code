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
import { NexusOptionsPanel } from './NexusOptions.js';
import { NexusDriftPanel } from './NexusDrift.js';
import { NexusThemePanel } from './NexusTheme.js';
import { PortfolioSnapshot } from './NexusPortfolio.js';
import { NexusRegimePanel } from './NexusRegime.js';
import { NexusOpportunitiesPanel } from './NexusOpportunities.js';
import { NexusBenchPanel } from './NexusBench.js';
import { NexusQuickTicket } from './NexusQuickTicket.js';
import { SpineTreemap } from './NexusSpineTreemap.js';
import { COLUMNS, DEFAULT_VISIBLE, loadVisible, saveVisible, columnGroups, premiumBand } from './nexusColumns.js';
import { BASIS_MWR, PLAIN_LABEL } from '../../lib/returnBasis.js';
import { ReturnBasisToggle, useReturnBasis } from '../../components/ReturnBasisToggle.js';
import { NexusFaceToggle } from './NexusFaceToggle.js';
import { loadLayout } from './nexusLayout.js';

// The return a row shows under the active basis, and why it is absent.
// Never falls back across bases: a position with no MWR renders a reason, not
// its SINCE ENTRY number wearing the MWR heading.
function activeRetOf(h, basis) {
    if (basis !== BASIS_MWR) return h.totalReturnPct;
    return h.mwrPct == null ? null : h.mwrPct;
}
function activeRetReason(h) {
    return h.engineReason || h.engineStatus || 'no engine row';
}
import '../../styles/nexus-flagship.css';
import '../../styles/nexus-flagship-v2.css';

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
    { id: 'bench',    label: 'The Bench' },
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

// ── Orientation rail (v2) ─────────────────────────────────────
// A persistent strip above the tab rail carrying the state you need to
// stay oriented, so scrolling never costs it. Replaces NexusHeader in
// v2: the wordmark collapses into it and MarketClock moves in.
//
// Every figure is read straight off the resolved model — no new fetch,
// no new computation, no derived number invented here.
//
// One deliberate gap: the spec asks for account equity and day P&L in
// dollars. Neither is on the model. Both come from /api/trading, which
// PortfolioSnapshot fetches for itself; putting them here would mean a
// second call to that endpoint or hoisting the fetch into the provider
// — a provider-shaped change, and out of scope for a layout pass. The
// rail shows what the model actually holds and is labelled for it:
// book NAV rather than account equity, and the day's up/down split
// rather than a dollar P&L it cannot source.
function railStat(w, label) {
    const s = ((w && w.stats) || []).find(x => x.label === label);
    return s || null;
}

function RailItem({ label, value, tone, title }) {
    if (value == null) return null;
    return e('div', { className: 'nfv2-rail-item', title: title || null },
        e('span', { className: 'nfv2-rail-l' }, label),
        e('span', { className: 'nfv2-rail-v nf-mono ' + (tone || '') }, value)
    );
}

function NexusRail({ model }) {
    const p = model.portfolio;
    const risk = model.gauges && model.gauges.risk;
    const vix = railStat(model.windshield, 'VIX');
    const curve = railStat(model.windshield, '10Y–2Y');

    return e('div', { className: 'nfv2-rail' },
        e('div', { className: 'nfv2-rail-mark' }, e('b', null, 'ATLAS ', e('span', null, 'Nexus'))),
        e('div', { className: 'nfv2-rail-stats' },
            e(RailItem, { label: 'NAV', value: model.nav != null ? fmtUsd(model.nav) : null,
                title: 'book NAV from the resolved model — not broker account equity' }),
            e(RailItem, { label: 'Unrealised', value: p ? fmtUsd(p.unrealisedPnl) : null,
                tone: p ? moveTone(p.unrealisedPnl) : '' }),
            e(RailItem, { label: 'Today', value: p ? p.todayUp + '↑ ' + p.todayDown + '↓' : null,
                tone: p ? (p.todayUp > p.todayDown ? 'tone-up' : p.todayUp < p.todayDown ? 'tone-down' : '') : '',
                title: 'names up / down today' }),
            e(RailItem, { label: 'Risk', value: risk && risk.budgetUsedPct != null ? risk.budgetUsedPct + '%' : null,
                tone: risk && risk.limitPct != null && risk.budgetUsedPct > risk.limitPct ? 'tone-down' : '',
                title: risk && risk.limitPct != null ? 'of a ' + risk.limitPct + '% budget' : null }),
            vix ? e(RailItem, { label: 'VIX', value: vix.value, tone: toneClass(vix.tone) }) : null,
            curve ? e(RailItem, { label: '10−2', value: curve.value, tone: toneClass(curve.tone) }) : null
        ),
        e('div', { className: 'nfv2-rail-right' },
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

// Two views of the same book. Sector answers "what industries am I in";
// theme answers "what bets am I actually making". A book can look spread
// across sectors while being one trade expressed eight ways, and only the
// theme cut shows that — which is the point of carrying both.
// Bars ↔ Treemap: the same `spine` rows read two ways, so it is a face flip
// rather than a filter. No persistKey and no `⇄` affix — this control renders
// in the v1 layout too, which stays pixel-identical.
const SPINE_FACES = [{ id: 'bars', label: 'Bars' }, { id: 'map', label: 'Treemap' }];

function PositioningSpine({ spine, themeSpine }) {
    const [dim, setDim] = useState('sector');
    // Bars are the default because they carry risk-shift, which the treemap
    // has no free channel for. The treemap wins on share comparison.
    const [view, setView] = useState('bars');
    const hasTheme = !!(themeSpine && themeSpine.length);
    const active = (dim === 'theme' && hasTheme) ? themeSpine : spine;
    if (!active || !active.length) return null;

    const maxShare = Math.max.apply(null, active.map(r => r.sharePct));
    const unmapped = Number(active.unmappedWeight) || 0;

    return e('div', { className: 'nf-card nf-spine nf-fade' },
        e('div', { className: 'nf-card-h' },
            e('h3', null, 'Positioning spine'),
            e('div', { className: 'nf-spine-head-right' },
                hasTheme ? e('div', { className: 'nf-spine-toggle' },
                    ['sector', 'theme'].map(d => e('button', {
                        key: d,
                        className: 'nf-sp-tab' + (dim === d ? ' active' : ''),
                        onClick: () => setDim(d),
                    }, d === 'sector' ? 'Sector' : 'Theme'))
                ) : null,
                e(NexusFaceToggle, { faces: SPINE_FACES, active: view, onChange: setView }),
                e('span', { className: 'nf-sub' },
                    view === 'bars' ? 'share · today · risk shift' : 'area = share · colour = today'))),

        view === 'map'
            ? e(SpineTreemap, { rows: active, dimension: dim, unmappedWeight: unmapped })
            : null,

        view === 'map' ? null : active.map(function (r, i) {
            return e('div', { className: 'nf-spine-row', key: (r.label || i) },
                e('div', { className: 'nf-spine-theme' + (r.label === 'Unclassified' ? ' nf-unmapped' : '') },
                    r.label,
                    r.names ? e('span', { className: 'nf-sp-n' }, r.names) : null,
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
        }),
        // Say what the view could not place rather than quietly showing a
        // smaller book than the one that exists.
        unmapped > 0 && view === 'bars'
            ? e('div', { className: 'nf-spine-note' },
                unmapped.toFixed(1) + '% of the book has no ' + dim + ' mapped and sits in Unclassified — '
                + 'that is a gap in the taxonomy, not a position with no exposure.')
            : null
    );
}

// ── Holdings table (Live Objects) ─────────────────────────────
// Column catalogue, default set and persistence live in nexusColumns.js —
// the table now renders whichever subset the user has chosen.

// Per-cell tone, applied to the <td> itself so the whole cell colours.
const CELL_CLASS = {
    todayPct:     h => 'nf-mono-cell ' + moveTone(h.todayPct),
    totalReturn:  (h, basis) => 'nf-mono-cell ' + moveTone(activeRetOf(h, basis)),
    contribPct:   h => 'nf-mono-cell ' + moveTone(h.contribPct),
    componentVar: () => 'nf-mono-cell',
    annualVol:    () => 'nf-mono-cell',
    fwdPe:        () => 'nf-mono-cell',
    marketFwdPe:  () => 'nf-mono-cell',
    // The gap is signed the other way round to a return: a POSITIVE premium is
    // the expensive direction, so it must not render in the same green that
    // means "up" two columns to the left.
    fwdPeGap:     h => 'nf-mono-cell ' + (h.fwdPePremiumPct == null ? '' : (h.fwdPePremiumPct > 0 ? 'tone-down' : 'tone-up')),
    fvGapPct:     h => 'nf-mono-cell ' + moveTone(h.fvGapPct),
    sector:       () => 'nf-theme-cell',
    theme:        h => 'nf-theme-cell' + (h.theme ? '' : ' nf-unmapped'),
};

const num1 = (v, suffix = '') => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(1) + suffix);

function renderCell(k, h, ctx) {
    switch (k) {
        case 'tk':
            // The row opens the quick ticket; the ticker itself keeps the
            // live-object drill it always had. Nothing listens for that event
            // yet, but deleting the affordance because its receiver is not
            // built would be the wrong way round.
            return [
                e('span', {
                    className: 'nf-tk', key: 'a', title: 'Open ' + h.tk + ' live object',
                    onClick: ev => { ev.stopPropagation(); openLiveObject(h.objectId, h.tk); },
                }, h.tk),
                h.name ? e('span', { className: 'nf-name', title: h.name, key: 'b' }, h.name) : null,
            ];
        case 'sector': return h.sector || '—';
        case 'theme':  return h.theme || 'Unclassified';
        case 'weight':
            return e('span', { className: 'nf-conv-bar', title: (Number(h.currentWeightPct) || 0).toFixed(2) + '% of NAV' },
                e('span', { className: 'nf-cb-track' }, e('i', { style: { width: Math.min(100, ((Number(h.currentWeightPct) || 0) / ctx.wtScale) * 100) + '%', background: '#5b6b7d' } })),
                e('span', { className: 'nf-mono-cell' }, (Number(h.currentWeightPct) || 0).toFixed(1) + '%'));
        case 'conviction':
            return e('span', { className: 'nf-conv-bar' },
                e('span', { className: 'nf-cb-track' }, e('i', { style: { width: h.conviction + '%', background: convColor(h.conviction) } })),
                e('span', { className: 'nf-mono-cell' }, h.conviction));
        case 'todayPct':     return pct1(h.todayPct);
        case 'totalReturn':  return pct1(activeRetOf(h, ctx.basis));
        case 'contribPct':   return pct1(h.contribPct, 2);
        case 'componentVar': return (h.componentVar ?? 0).toFixed(1) + '%';
        // Vol is a magnitude, not a direction — no sign, no tone.
        case 'annualVol':    return h.annualVol == null ? '—' : (h.annualVol * 100).toFixed(0) + '%';
        case 'fwdPe':        return h.fwdPe == null ? '—' : Number(h.fwdPe).toFixed(1) + '×';
        case 'marketFwdPe':  return h.marketFwdPe == null ? '—' : Number(h.marketFwdPe).toFixed(1) + '×';
        case 'fwdPeGap':
            return h.fwdPePremiumPct == null
                ? e('span', { title: 'No forward multiple on file — not the same as trading in line with the market' }, '—')
                : (h.fwdPePremiumPct >= 0 ? '+' : '−') + Math.abs(h.fwdPePremiumPct).toFixed(0) + '%';
        case 'fwdPeBadge': {
            const b = premiumBand(h.fwdPePremiumPct);
            return b
                ? e('span', { className: 'nf-band ' + b.tone, title: 'Forward P/E ' + num1(h.fwdPe) + '× vs market median ' + num1(h.marketFwdPe) + '×' }, b.label)
                : e('span', { style: { color: 'var(--text3)' } }, '—');
        }
        case 'fvGapPct':
            return e('span', { className: 'nf-fv-wrap' },
                e(FvGapBar, { v: h.fvGapPct, scale: ctx.fvScale }),
                e('span', null, pct1(h.fvGapPct)));
        case 'signal':
            return h.signal ? e('span', { className: 'nf-sig' }, h.signal) : e('span', { style: { color: 'var(--text3)' } }, '—');
        case 'options': return e(OptionsTone, { options: h.options });
        case 'read':
            return e('span', {
                className: 'nf-read-chip ' + h.read + (ctx.isOpen ? ' open' : ''),
                title: h.because,
                onClick: ev => { ev.stopPropagation(); ctx.toggle(h.objectId); },
            }, h.read);
        case 'trade':
            return e(TradeCell, { h, staged: !!ctx.blotter[h.tk], onStage: ctx.onStage });
        default: return null;
    }
}

// ── Column chooser ────────────────────────────────────────────
function ColumnChooser({ visible, setVisible }) {
    const [open, setOpen] = useState(false);
    const groups = columnGroups();
    const n = visible.size;
    const toggle = (k) => setVisible(prev => {
        const next = new Set(prev);
        if (next.has(k)) next.delete(k); else next.add(k);
        saveVisible(next);
        return next;
    });
    return e('div', { className: 'nf-colwrap' },
        e('button', {
            className: 'nf-colbtn' + (open ? ' active' : ''),
            onClick: () => setOpen(o => !o),
            title: 'Choose columns',
        }, '☰ Columns', e('span', { className: 'nf-colcount' }, n)),
        open ? e('div', { className: 'nf-colpop' },
            e('div', { className: 'nf-colpop-h' },
                e('span', null, 'Columns'),
                e('button', {
                    className: 'nf-colreset',
                    onClick: () => { const d = new Set(DEFAULT_VISIBLE); saveVisible(d); setVisible(d); },
                }, 'reset')),
            groups.map(g => e('div', { className: 'nf-colgrp', key: g.name },
                e('div', { className: 'nf-colgrp-n' }, g.name),
                g.cols.map(c => e('label', {
                    key: c.k,
                    className: 'nf-colitem' + (c.locked ? ' locked' : ''),
                    title: c.locked ? 'Always shown' : null,
                },
                    e('input', {
                        type: 'checkbox',
                        checked: visible.has(c.k),
                        disabled: !!c.locked,
                        onChange: () => toggle(c.k),
                    }),
                    e('span', null, c.label))))),
            e('div', { className: 'nf-colpop-f' }, 'Saved on this browser.')) : null);
}

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

// ── Options tone cell ─────────────────────────────────────────
// The market's options-positioning read on a held name — an adjacent,
// glanceable signal beside the read (it does NOT drive the read verdict).
// No chain (ADRs / OTC / thin) → "—". Tooltip carries the metric `because`,
// framed here as a risk question ("is the market flagging downside?").
const OPT_LABEL = { stressed: 'Stressed', hedged: 'Hedged', complacent: 'Complacent', neutral: 'Neutral' };
function OptionsTone({ options }) {
    if (!options || !options.hasOptions) {
        return e('span', { style: { color: 'var(--text3)' }, title: 'No listed options / chain too thin' }, '—');
    }
    const t = options.tone || 'neutral';
    const building = options.rankReady === false;
    const title = (options.because || '') + (building ? ' (percentile ranks still building)' : '');
    return e('span', { className: 'nf-opt nf-opt-' + t, title },
        OPT_LABEL[t] || t,
        building ? e('span', { className: 'nf-opt-bld', title: 'Percentile ranks build over ~30 sessions' }, '·') : null
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
    const [visible, setVisible] = useState(loadVisible);
    const [basis, setBasis] = useReturnBasis();
    const [ticket, setTicket] = useState(null);  // holding whose quick ticket is open
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
        else { setSortK(k); setSortDir(k === 'tk' || k === 'theme' || k === 'sector' ? 'asc' : 'desc'); }
    };
    const arrow = k => (sortK === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

    // Registry order is the display order — the chooser picks membership, not
    // position, so the table never reshuffles under the reader.
    const cols = COLUMNS.filter(c => visible.has(c.k));

    // Live facets: themes for the dropdown, read counts for the rail.
    const themes = Array.from(new Set(holdings.map(h => h.theme).filter(Boolean))).sort();
    const anyUnmapped = holdings.some(h => !h.theme);
    const counts = holdings.reduce((m, h) => { m[h.read] = (m[h.read] || 0) + 1; return m; }, {});

    // Filter → sort.
    const q = query.trim().toLowerCase();
    let rows = holdings.filter(h =>
        (!q || h.tk.toLowerCase().includes(q)) &&
        (theme === 'ALL' || (theme === 'UNMAPPED' ? !h.theme : h.theme === theme)) &&
        (!reads.size || reads.has(h.read))
    );
    if (sortK) {
        const dir = sortDir === 'asc' ? 1 : -1;
        rows = rows.slice().sort((a, b) => {
            if (sortK === 'tk' || sortK === 'theme' || sortK === 'sector') return String(a[sortK] || '').localeCompare(String(b[sortK] || '')) * dir;
            if (sortK === 'read') return ((READ_RANK[a.read] ?? 9) - (READ_RANK[b.read] ?? 9)) * dir;
            // Sorting follows the displayed basis, or the column would rank by
            // SINCE ENTRY while showing MWR.
            const key = h => sortK === 'totalReturnPct' ? activeRetOf(h, basis) : h[sortK];
            let av = Number(key(a)); let bv = Number(key(b));
            if (isNaN(av)) av = -Infinity; if (isNaN(bv)) bv = -Infinity;
            return (av - bv) * dir;
        });
    }
    // FV-gap bar scale = widest absolute gap in view (floored so small books still read).
    const fvScale = Math.max(10, ...rows.map(h => Math.abs(Number(h.fvGapPct) || 0)));
    // Weight bar scale = heaviest position in view (floored so a light book still reads).
    const wtScale = Math.max(2, ...rows.map(h => Number(h.currentWeightPct) || 0));
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
                themes.map(t => e('option', { key: t, value: t }, t)),
                anyUnmapped ? e('option', { value: 'UNMAPPED' }, 'Unclassified') : null
            ),
            e('div', { className: 'nf-rfilter' },
                READ_ORDER.filter(r => counts[r]).map(r => e('button', {
                    key: r,
                    className: 'nf-rchip ' + r + (reads.has(r) ? ' active' : ''),
                    onClick: () => toggleRead(r),
                    title: 'Filter ' + r,
                }, r, e('span', { className: 'nf-rchip-n' }, counts[r]))),
                dirty ? e('button', { className: 'nf-rclear', onClick: () => { setReads(new Set()); setTheme('ALL'); setQuery(''); } }, 'clear') : null
            ),
            e(ReturnBasisToggle, { surface: 'nexus', basis, onBasis: setBasis }),
            e(ColumnChooser, { visible, setVisible })
        ),

        // Table — capped height + internal scroll, sticky header
        e('div', { className: 'nf-table-scroll' },
            e('table', { className: 'nf-table' },
                e('thead', null, e('tr', null,
                    cols.map(c => e('th', {
                        key: c.k,
                        className: (c.l ? 'nf-l' : '') + (c.sort ? ' nf-th-sort' : ''),
                        onClick: c.sort ? () => setSort(c.sort) : undefined,
                        title: c.k === 'fwdPeGap'
                            ? 'Forward P/E against the median forward P/E of the screener universe'
                            : (c.k === 'annualVol' ? 'Annualised realised volatility, 120-day window' : null),
                    }, c.k === 'totalReturn' ? (basis === BASIS_MWR ? 'MWR' : c.label) : c.label,
                       c.sort ? arrow(c.sort) : ''))
                )),
                e('tbody', null,
                    rows.length ? rows.map(function (h) {
                        const isOpen = !!expanded[h.objectId];
                        const out = [
                            e('tr', {
                                key: h.objectId,
                                className: 'nf-clickrow' + (h.stale ? ' nf-stale-row' : ''),
                                onClick: () => setTicket(h),
                                title: 'Quick ticket · ' + h.tk,
                            },
                                cols.map(c => e('td', {
                                    key: c.k,
                                    className: (c.l ? 'nf-l' : '') + (CELL_CLASS[c.k] ? ' ' + CELL_CLASS[c.k](h, basis) : ''),
                                    title: c.k === 'totalReturn' && activeRetOf(h, basis) == null ? activeRetReason(h) : undefined,
                                }, renderCell(c.k, h, { wtScale, fvScale, isOpen, toggle, blotter, onStage, basis })))
                            ),
                        ];
                        if (isOpen) {
                            out.push(e('tr', { key: h.objectId + '-why', className: 'nf-why-row' },
                                e('td', { colSpan: cols.length },
                                    e('span', { className: 'nf-why-label' }, 'WHY'),
                                    e('span', { className: 'nf-why-text' }, h.because),
                                    h.scrapbookThesis ? e('div', { className: 'nf-why-thesis', style: { marginTop: 6 } },
                                        e('span', { className: 'nf-why-label' }, 'THESIS' + (h.scrapbookConviction ? ' · ' + h.scrapbookConviction : '')),
                                        e('span', { className: 'nf-why-text' }, h.scrapbookThesis)) : null)
                            ));
                        }
                        return out;
                    }) : e('tr', null, e('td', { colSpan: cols.length, className: 'nf-empty' }, 'No holdings match these filters.'))
                )
            )
        )
      ),
      e(OrderBlotter, { tickets, onRemove: removeTicket, onClear: clearBlotter }),
      ticket ? e(NexusQuickTicket, { holding: ticket, onClose: () => setTicket(null) }) : null
    );
}

// ── The Read (rate-view toggle) ───────────────────────────────
const STANCE_LABEL = { market: 'What’s priced', hfl: 'Higher-for-longer' };
// `pinned` is the v2 treatment: a left accent rule instead of a card, so it
// reads as the verdict rather than as one more panel. v1 passes nothing and is
// untouched.
function TheRead({ read, pinned }) {
    const keys = read && read.variants ? Object.keys(read.variants) : [];
    const initial = read && read.default && read.variants[read.default] ? read.default : keys[0];
    const [stance, setStance] = useState(initial);
    if (!read || !keys.length) return null;
    const variant = read.variants[stance] || read.variants[keys[0]];
    return e('div', { className: (pinned ? 'nf-read nf-fade nfv2-read' : 'nf-card nf-read nf-fade') },
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
        e(PortfolioSnapshot, { model }),
        e(WindshieldBand, { windshield: model.windshield }),
        e(ContextGauges, { gauges: model.gauges }),
        e(NexusBoardSection, { board: model.board }),
        e(PositioningSpine, { spine: model.spine, themeSpine: model.themeSpine }),
        e(HoldingsTable, { holdings: model.holdings, forceTheme: holdingsTheme }),
        e(NexusEarningsTable, { earnings: model.earnings }),
        e(NexusCotTable, { cot: model.cot }),
        e(NexusOptionsPanel, { holdings: model.holdings }),
        e(TheRead, { read: model.read })
    );
}

// ── Section — a labelled group of panels ──────────────────────
// The label is a signpost, not a heading: it names the question the
// panels below it answer, and is styled to sit under the card titles
// rather than compete with them.
function Section({ label, children }) {
    return e('div', { className: 'nfv2-section' },
        e('div', { className: 'nfv2-section-label' }, label),
        e('div', { className: 'nfv2-section-body' }, children)
    );
}

// ── Flagship panel, v2 flow ───────────────────────────────────
// Ten flat siblings become four labelled sections, each answering one
// question in the order you actually ask them: where do I stand, what
// are the conditions, how am I exposed to them, who is carrying it.
//
// Every child is unchanged internally — this is grouping and ordering.
//
// OrderBlotter is NOT a sibling here. It renders inside HoldingsTable,
// which owns the staged-ticket state it reads, and already sits exactly
// where this section would put it. Adding it here would mount a second,
// stateless one — and `e(OrderBlotter, null)` throws outright, since it
// reads `tickets.length` off props it would never receive.
function FlagshipPanelV2({ model, holdingsTheme }) {
    return e('div', { className: 'nfv2' },
        e(TheRead, { read: model.read, pinned: true }),
        e(Section, { label: 'WHERE I STAND' },
            e(PortfolioSnapshot, { model, compact: true }),
            e(ContextGauges, { gauges: model.gauges })),
        e(Section, { label: 'THE WEATHER' },
            e(WindshieldBand, { windshield: model.windshield }),
            e(NexusBoardSection, { board: model.board })),
        e(Section, { label: 'MY SHAPE' },
            e(PositioningSpine, { spine: model.spine, themeSpine: model.themeSpine })),
        e(Section, { label: 'THE NAMES' },
            e(HoldingsTable, { holdings: model.holdings, forceTheme: holdingsTheme }),
            e(NexusEarningsTable, { earnings: model.earnings }),
            e(NexusCotTable, { cot: model.cot }),
            e(NexusOptionsPanel, { holdings: model.holdings }))
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
    // Read once on mount, like loadVisible(). Defensive — an unknown value is
    // already normalised to 'v1' by loadLayout().
    const [layout] = useState(loadLayout);

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

    const v2 = layout === 'v2';

    let panel;
    if (activeTab === 'flagship') {
        panel = v2 ? e(FlagshipPanelV2, { model, holdingsTheme })
                   : e(FlagshipPanel, { model, holdingsTheme });
    } else if (activeTab === 'theme') {
        panel = e('div', { className: 'nf-seasonal' }, e(NexusThemePanel, { model }));
    } else if (activeTab === 'regime') {
        panel = e('div', { className: 'nf-seasonal' }, e(NexusRegimePanel, { model }));
    } else if (activeTab === 'opp') {
        panel = e('div', { className: 'nf-seasonal' }, e(NexusOpportunitiesPanel, { model }));
    } else if (activeTab === 'bench') {
        panel = e('div', { className: 'nf-seasonal' }, e(NexusBenchPanel, { model }));
    } else if (activeTab === 'drift') {
        panel = e('div', { className: 'nf-seasonal' }, e(NexusDriftPanel, { model }));
    } else {
        panel = e('div', { className: 'nf-seasonal' }, e(SeasonalPanel, { data: model.seasonal && model.seasonal[tabEntry.seasonal] }));
    }

    return e('div', { className: 'nexus-flagship' + (v2 ? ' nexus-flagship-v2' : '') },
        e('div', { className: 'nf-page' },
            v2 ? e(NexusRail, { model }) : e(NexusHeader, { model }),
            e(TabRail, { activeTab, onTab: setTab, chef: model.chef }),
            // chefbar nudges toward the hot tab; same setTab() as the rail
            activeTab === 'flagship' ? e(ChefBar, { chef: model.chef, onTab: setTab }) : null,
            panel
        )
    );
}

export default NexusFlagshipPage;
