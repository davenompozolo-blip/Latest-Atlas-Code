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
import { getNexusModel } from './nexusMock.js';
import '../../styles/nexus-flagship.css';

const { useState, useEffect } = React;
const e = React.createElement;

// ── Formatters ───────────────────────────────────────────────
const signed = (v, d = 1) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(Number(v)).toFixed(d));
const pct1   = (v, d = 1) => (v == null ? '—' : signed(v, d) + '%');
const toneClass = t => 'tone-' + (t || 'neutral');
const moveTone  = v => (v > 0 ? 'tone-up' : v < 0 ? 'tone-down' : 'tone-neutral');

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
    { k: 'tk',           label: 'Ticker',     l: true },
    { k: 'theme',        label: 'Theme',      l: true },
    { k: 'conviction',   label: 'Conv (PCM)' },
    { k: 'todayPct',     label: 'Today' },
    { k: 'contribPct',   label: 'Contrib' },
    { k: 'componentVar', label: 'VaR %' },
    { k: 'fvGapPct',     label: 'FV gap' },
    { k: 'signal',       label: 'Signal',     l: true },
    { k: 'read',         label: 'Read' },
];

function HoldingsTable({ holdings }) {
    // Expanded `because` rows. The read chip is the why-affordance:
    // clicking it toggles the explanation (and stops the row's
    // open-object click so the two interactions don't collide).
    const [expanded, setExpanded] = useState({});
    if (!holdings || !holdings.length) return null;
    const toggle = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    return e('div', { className: 'nf-card nf-holdings nf-fade' },
        e('div', { className: 'nf-card-h' }, e('h3', null, 'Holdings'), e('span', { className: 'nf-sub' }, holdings.length + ' live objects · derived reads')),
        e('div', { className: 'nf-table-scroll' },
            e('table', { className: 'nf-table' },
                e('thead', null, e('tr', null,
                    COLS.map(c => e('th', { key: c.k, className: c.l ? 'nf-l' : '' }, c.label))
                )),
                e('tbody', null,
                    holdings.map(function (h) {
                        const isOpen = !!expanded[h.objectId];
                        const rows = [
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
                                e('td', { className: 'nf-mono-cell' }, h.componentVar.toFixed(1) + '%'),
                                e('td', { className: 'nf-mono-cell ' + moveTone(h.fvGapPct) }, pct1(h.fvGapPct)),
                                e('td', { className: 'nf-l' }, h.signal ? e('span', { className: 'nf-sig' }, h.signal) : e('span', { style: { color: 'var(--text3)' } }, '—')),
                                e('td', null, e('span', {
                                    className: 'nf-read-chip ' + h.read + (isOpen ? ' open' : ''),
                                    title: h.because,
                                    onClick: ev => { ev.stopPropagation(); toggle(h.objectId); },
                                }, h.read))
                            ),
                        ];
                        if (isOpen) {
                            rows.push(e('tr', { key: h.objectId + '-why', className: 'nf-why-row' },
                                e('td', { colSpan: COLS.length },
                                    e('span', { className: 'nf-why-label' }, 'WHY'),
                                    e('span', { className: 'nf-why-text' }, h.because))
                            ));
                        }
                        return rows;
                    })
                )
            )
        )
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
function FlagshipPanel({ model }) {
    return e('div', null,
        e(WindshieldBand, { windshield: model.windshield }),
        e(ContextGauges, { gauges: model.gauges }),
        e(PositioningSpine, { spine: model.spine }),
        e(HoldingsTable, { holdings: model.holdings }),
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

    useEffect(function () {
        let alive = true;
        getNexusModel()
            .then(m => { if (alive) setModel(m); })
            .catch(er => { if (alive) setErr(er.message || String(er)); });
        return () => { alive = false; };
    }, []);

    if (err) return e('div', { className: 'nexus-flagship nf-loading' }, '⚠ Nexus failed to load: ' + err);
    if (!model) return e('div', { className: 'nexus-flagship nf-loading' },
        e('div', { style: { fontSize: 22, marginBottom: 10 } }, '⬡'), 'Loading Nexus…');

    const setTab = id => setActiveTab(id);
    const tabEntry = TABS.find(t => t.id === activeTab) || TABS[0];

    let panel;
    if (activeTab === 'flagship') {
        panel = e(FlagshipPanel, { model });
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
