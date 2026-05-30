// ============================================================
// ATLAS Nexus — Unified Intelligence Surface  (Phases 2-4)
// Single fetch from vw_nexus_holdings; every panel derives
// its view from the same array — one source of truth.
// ============================================================

import React from 'react';
import { sb } from './config.js';
import '../styles/nexus-theme.css';

const { useState, useEffect, useMemo } = React;
const e = React.createElement;

// ── Formatters ───────────────────────────────────────────────
const usd = (v, d = 0) =>
    v == null ? '—' : '$' + Math.abs(+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

const pct = (v, d = 1) =>
    v == null ? '—' : ((+v >= 0 ? '+' : '') + Number(v).toFixed(d) + '%');

const num = (v, d = 2) =>
    v == null ? '—' : Number(v).toFixed(d);

const cSign = v => +v > 0 ? 'var(--nx-green)' : +v < 0 ? 'var(--nx-red)' : 'var(--nx-text3)';

// ── Score color / bg ─────────────────────────────────────────
const SC  = s => s >= 75 ? 'var(--nx-green)' : s >= 60 ? 'var(--nx-blue)' : s >= 45 ? 'var(--nx-amber)' : 'var(--nx-red)';
const SBG = s => s >= 75 ? 'var(--nx-green-b)' : s >= 60 ? 'var(--nx-blue-b)' : s >= 45 ? 'var(--nx-amber-b)' : 'var(--nx-red-b)';

// ── Signal → [bg, color] ─────────────────────────────────────
function sigStyle(sig) {
    const M = {
        Buy:      ['var(--nx-green-b)',  'var(--nx-green)'],
        Bull:     ['var(--nx-green-b)',  'var(--nx-green)'],
        Long:     ['var(--nx-green-b)',  'var(--nx-green)'],
        'A+':     ['var(--nx-blue-b)',   'var(--nx-blue)'],
        A:        ['var(--nx-blue-b)',   'var(--nx-blue)'],
        Aligned:  ['var(--nx-green-b)',  'var(--nx-green)'],
        Strong:   ['var(--nx-green-b)',  'var(--nx-green)'],
        Positive: ['var(--nx-green-b)',  'var(--nx-green)'],
        Fair:     ['var(--nx-blue-b)',   'var(--nx-blue)'],
        Neutral:  ['var(--nx-bg3)',      'var(--nx-text2)'],
        Hold:     ['var(--nx-bg3)',      'var(--nx-text2)'],
        Rich:     ['var(--nx-red-b)',    'var(--nx-red)'],
        Wary:     ['var(--nx-amber-b)',  'var(--nx-amber)'],
        Trim:     ['var(--nx-amber-b)',  'var(--nx-amber)'],
        Short:    ['var(--nx-red-b)',    'var(--nx-red)'],
        Exit:     ['var(--nx-red-b)',    'var(--nx-red)'],
        'B+':     ['var(--nx-teal-b)',   'var(--nx-teal)'],
        B:        ['var(--nx-amber-b)',  'var(--nx-amber)'],
        C:        ['var(--nx-red-b)',    'var(--nx-red)'],
    };
    return M[sig] || ['var(--nx-bg3)', 'var(--nx-text3)'];
}

const actStyle = a => ({
    Add:  { bg: 'var(--nx-green-b)',  color: 'var(--nx-green)',  bc: 'rgba(34,197,94,.2)' },
    Hold: { bg: 'var(--nx-bg3)',      color: 'var(--nx-text2)',  bc: 'var(--nx-border-md)' },
    Trim: { bg: 'var(--nx-amber-b)',  color: 'var(--nx-amber)',  bc: 'rgba(245,158,11,.2)' },
    Exit: { bg: 'var(--nx-red-b)',    color: 'var(--nx-red)',    bc: 'rgba(239,68,68,.2)' },
}[a] || { bg: 'var(--nx-bg3)', color: 'var(--nx-text2)', bc: 'var(--nx-border)' });

// ── Portfolio aggregates ──────────────────────────────────────
function calcStats(holdings) {
    if (!holdings.length) return { total: 0, wtConv: 50, wtDaily: 0, alerts: 0, longPct: 0 };
    const total   = holdings.reduce((s, h) => s + (+h.market_value || 0), 0);
    const wtConv  = total ? holdings.reduce((s, h) => s + (+h.conviction_score || 50) * (+h.market_value || 0), 0) / total : 50;
    const wtDaily = total ? holdings.reduce((s, h) => s + (+h.daily_return_pct || 0) * (+h.market_value || 0), 0) / total : 0;
    const alerts  = holdings.filter(h => h.alert_flag).length;
    const longPct = holdings.filter(h => h.quant_signal === 'Long').reduce((s, h) => s + (+h.weight_pct || 0), 0);
    return { total, wtConv, wtDaily, alerts, longPct };
}

// ── Clock ────────────────────────────────────────────────────
function Clock() {
    const [t, setT] = useState('');
    useEffect(function() {
        const tick = () => setT(new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);
    return e('span', { style: { fontFamily: 'var(--nx-fm)', fontSize: 9, color: 'var(--nx-text3)' } }, t, ' SAST');
}

// ── NexusHeader ───────────────────────────────────────────────
function NexusHeader({ holdings }) {
    const { total, wtConv, wtDaily, alerts, longPct } = calcStats(holdings);
    const score      = Math.round(wtConv);
    const offset     = Math.round(163 * (1 - Math.min(100, score) / 100));
    const healthLbl  = score >= 70 ? 'Strong' : score >= 55 ? 'Neutral' : 'Weak';
    const healthCol  = score >= 70 ? 'var(--nx-green)' : score >= 55 ? 'var(--nx-amber)' : 'var(--nx-red)';
    const dailyDelta = total * wtDaily / 100;
    const addCount   = holdings.filter(h => h.recommended_action === 'Add').length;
    const trimCount  = holdings.filter(h => h.recommended_action === 'Trim' || h.recommended_action === 'Exit').length;
    const bullCount  = holdings.filter(h => h.technical_signal === 'Bull').length;
    const longCount  = holdings.filter(h => h.quant_signal === 'Long').length;

    return e('div', { className: 'nx-head' },
        e('div', { className: 'nx-head-top' },
            e('div', { className: 'nx-title' },
                e('span', { className: 'sub' }, 'ATLAS NEXUS — Unified Intelligence Surface'),
                'The World is ',
                e('span', { className: 'acc' }, 'Your Oyster.')
            ),
            e('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
                e('div', { className: 'nx-ring-meta' },
                    e('div', { className: 'nx-rm-l' }, 'Portfolio Health'),
                    e('div', { className: 'nx-rm-v', style: { color: healthCol } }, healthLbl),
                    e('div', { className: 'nx-rm-l', style: { marginTop: 3 } }, 'Active Signals'),
                    e('div', { className: 'nx-rm-v', style: { color: 'var(--nx-amber)' } }, alerts + ' Alert' + (alerts !== 1 ? 's' : ''))
                ),
                e('div', { className: 'nx-ring-wrap' },
                    e('svg', { width: 64, height: 64, viewBox: '0 0 64 64' },
                        e('circle', { cx: 32, cy: 32, r: 26, fill: 'none', stroke: 'rgba(255,255,255,.05)', strokeWidth: 5 }),
                        e('circle', { cx: 32, cy: 32, r: 26, fill: 'none', stroke: 'var(--nx-blue)', strokeWidth: 5,
                            strokeDasharray: '163', strokeDashoffset: offset, strokeLinecap: 'round' })
                    ),
                    e('div', { className: 'nx-ring-inner' },
                        e('span', { className: 'nx-ring-num' }, score),
                        e('span', { className: 'nx-ring-lbl' }, 'nexus')
                    )
                )
            )
        ),
        e('div', { className: 'nx-kpi-bar' },
            e('div', { className: 'nx-kc nx-bl' },
                e('div', { className: 'nx-kc-l' }, 'Portfolio Value'),
                e('div', { className: 'nx-kc-v', style: { color: 'var(--nx-blue)' } }, usd(total)),
                e('div', { className: 'nx-kc-d ' + (wtDaily >= 0 ? 'nx-up' : 'nx-dn') },
                    (wtDaily >= 0 ? '↑ +' : '↓ ') + usd(Math.abs(dailyDelta)) + ' (' + pct(wtDaily) + ')'),
                e('div', { className: 'nx-kc-s' }, 'Portfolio module')
            ),
            e('div', { className: 'nx-kc nx-al' },
                e('div', { className: 'nx-kc-l' }, 'Wtd. Conviction'),
                e('div', { className: 'nx-kc-v', style: { color: SC(score) } }, score + '/100'),
                e('div', { className: 'nx-kc-d nx-nt' }, '→ ' + healthLbl),
                e('div', { className: 'nx-kc-s' }, holdings.length + ' holdings')
            ),
            e('div', { className: 'nx-kc nx-gl' },
                e('div', { className: 'nx-kc-l' }, 'Long Exposure'),
                e('div', { className: 'nx-kc-v', style: { color: 'var(--nx-green)' } }, pct(longPct, 1)),
                e('div', { className: 'nx-kc-d nx-up' }, longCount + ' Long signals'),
                e('div', { className: 'nx-kc-s' }, bullCount + ' Bull · ' + (holdings.length - bullCount) + ' Other')
            ),
            e('div', { className: 'nx-kc nx-al' },
                e('div', { className: 'nx-kc-l' }, 'Add / Trim Flags'),
                e('div', { className: 'nx-kc-v', style: { color: 'var(--nx-amber)' } }, addCount + ' / ' + trimCount),
                e('div', { className: 'nx-kc-d nx-nt' }, holdings.filter(h => h.recommended_action === 'Exit').length + ' exit signals'),
                e('div', { className: 'nx-kc-s' }, 'Signal synthesis')
            ),
            e('div', { className: 'nx-kc nx-rl' },
                e('div', { className: 'nx-kc-l' }, 'Alerts'),
                e('div', { className: 'nx-kc-v', style: { color: alerts > 0 ? 'var(--nx-red)' : 'var(--nx-green)' } }, alerts),
                e('div', { className: 'nx-kc-d nx-nt' }, alerts > 0 ? 'Review required' : 'All clear'),
                e('div', { className: 'nx-kc-s' }, 'Cross-signal')
            ),
            e('div', { className: 'nx-kc nx-pl' },
                e('div', { className: 'nx-kc-l' }, 'Signal Mix'),
                e('div', { className: 'nx-kc-v', style: { color: 'var(--nx-purple)' } },
                    longCount + 'L / ' + holdings.filter(h => h.quant_signal === 'Short').length + 'S'),
                e('div', { className: 'nx-kc-d nx-nt' }, holdings.filter(h => h.quant_signal === 'Hold').length + ' Hold'),
                e('div', { className: 'nx-kc-s' }, 'Optimizer')
            )
        )
    );
}

// ── ConvictionPanel (Zone A) ──────────────────────────────────
function ConvictionPanel({ holdings }) {
    const [tab, setTab]       = useState('All');
    const [active, setActive] = useState(null);

    const cards = useMemo(function() {
        let list = [...holdings].sort((a, b) => b.conviction_score - a.conviction_score);
        if (tab === 'High Conv.') list = list.filter(h => h.conviction_score >= 60);
        if (tab === 'Alerts')     list = list.filter(h => h.alert_flag);
        return list.slice(0, 12);
    }, [holdings, tab]);

    return e('div', { className: 'nx-zone nx-zone-a' },
        e('div', { className: 'nx-zh' },
            e('div', { className: 'nx-zh-t' }, 'Conviction Rankings'),
            e('span', { className: 'nx-badge nx-bb' }, 'Cross-Signal')
        ),
        e('div', { className: 'nx-tabs' },
            ['All', 'High Conv.', 'Alerts'].map(t =>
                e('button', { key: t, className: 'nx-tab' + (tab === t ? ' on' : ''), onClick: () => setTab(t) }, t)
            )
        ),
        cards.map(function(h) {
            const s     = h.conviction_score || 50;
            const isOn  = active === h.symbol;
            const [vBg, vCol] = sigStyle(h.valuation_signal || 'Fair');
            const [mBg, mCol] = sigStyle(h.macro_signal    || 'Neutral');
            const [tBg, tCol] = sigStyle(h.technical_signal);
            const [qBg, qCol] = sigStyle(h.quality_grade);
            return e('div', {
                key: h.symbol,
                className: 'nx-cc' + (isOn ? ' on' : ''),
                onClick: () => setActive(isOn ? null : h.symbol)
            },
                e('div', { className: 'nx-cc-r1' },
                    e('div', null,
                        e('div', { className: 'nx-cc-tk' }, h.symbol),
                        e('div', { className: 'nx-cc-nm' }, (h.asset_name || h.symbol).slice(0, 28))
                    ),
                    e('div', { style: { textAlign: 'right' } },
                        e('div', { className: 'nx-kc-d ' + (+h.daily_return_pct >= 0 ? 'nx-up' : 'nx-dn') },
                            pct(h.daily_return_pct)),
                        e('div', { style: { fontSize: 8, color: 'var(--nx-text3)' } }, usd(h.market_value))
                    )
                ),
                e('div', { className: 'nx-sigs' },
                    e('div', { className: 'nx-sg', style: { background: vBg, color: vCol } },
                        e('span', { className: 'nx-sg-lbl' }, 'Valuation'), h.valuation_signal || 'Fair'),
                    e('div', { className: 'nx-sg', style: { background: mBg, color: mCol } },
                        e('span', { className: 'nx-sg-lbl' }, 'Macro'), h.macro_signal || 'Ntrl'),
                    e('div', { className: 'nx-sg', style: { background: tBg, color: tCol } },
                        e('span', { className: 'nx-sg-lbl' }, 'Technical'), h.technical_signal || '—'),
                    e('div', { className: 'nx-sg', style: { background: qBg, color: qCol } },
                        e('span', { className: 'nx-sg-lbl' }, 'Quality'), h.quality_grade || '—')
                ),
                e('div', { className: 'nx-meter' },
                    e('div', { className: 'nx-mt' },
                        e('div', { className: 'nx-mf', style: { width: s + '%', background: SC(s) } })
                    ),
                    e('div', { className: 'nx-ms', style: { color: SC(s) } }, s)
                ),
                e('div', { className: 'nx-insight' },
                    e('strong', null, 'Nexus: '),
                    h.nexus_insight || ('Weight ' + h.weight_pct + '% · ' + h.technical_signal + ' tech · ' + h.quality_grade + ' quality')
                )
            );
        })
    );
}

// ── IntelCanvas (Zone B) ─────────────────────────────────────
function IntelCanvas({ holdings }) {
    const wfData = useMemo(function() {
        const bars = [...holdings]
            .filter(h => h.pnl_contribution != null)
            .sort((a, b) => Math.abs(+b.pnl_contribution) - Math.abs(+a.pnl_contribution))
            .slice(0, 7);
        const total  = bars.reduce((s, h) => s + (+h.pnl_contribution || 0), 0);
        const maxAbs = Math.max(...bars.map(h => Math.abs(+h.pnl_contribution)), 1);
        return { bars, total, maxAbs };
    }, [holdings]);

    const topVar = useMemo(function() {
        return [...holdings]
            .filter(h => h.var_contribution_pct != null)
            .sort((a, b) => +b.var_contribution_pct - +a.var_contribution_pct)
            .slice(0, 4);
    }, [holdings]);

    const qualDist = useMemo(function() {
        const g = holdings.reduce(function(m, h) {
            const k = h.quality_grade || 'C';
            m[k] = (m[k] || 0) + 1;
            return m;
        }, {});
        return Object.entries(g).sort((a, b) => b[1] - a[1]);
    }, [holdings]);

    const n = holdings.length || 1;
    const longCnt  = holdings.filter(h => h.quant_signal === 'Long').length;
    const holdCnt  = holdings.filter(h => h.quant_signal === 'Hold').length;
    const shortCnt = holdings.filter(h => h.quant_signal === 'Short').length;
    const bullCnt  = holdings.filter(h => h.technical_signal === 'Bull').length;
    const neutCnt  = holdings.filter(h => h.technical_signal === 'Neutral').length;
    const waryCnt  = holdings.filter(h => h.technical_signal === 'Wary').length;

    return e('div', { className: 'nx-zone nx-zone-b' },
        // Macro Regime Map
        e('div', { className: 'nx-macro-box' },
            e('div', { className: 'nx-mb-head' },
                e('div', { className: 'nx-zh-t' }, 'Macro Regime — Global'),
                e('span', { className: 'nx-badge nx-ba' }, 'Late Cycle')
            ),
            e('div', { className: 'nx-regions' },
                e('div', { className: 'nx-reg' },
                    e('div', { className: 'nx-reg-n' }, 'United States'),
                    e('div', { className: 'nx-reg-r', style: { background: 'var(--nx-amber-b)', color: 'var(--nx-amber)' } }, 'Late Cycle'),
                    e('div', { className: 'nx-reg-m' }, 'CPI ', e('span', null, '3.2%'), ' · 10Y ', e('span', null, '4.5%'))
                ),
                e('div', { className: 'nx-reg' },
                    e('div', { className: 'nx-reg-n' }, 'Europe'),
                    e('div', { className: 'nx-reg-r', style: { background: 'var(--nx-red-b)', color: 'var(--nx-red)' } }, 'Contraction'),
                    e('div', { className: 'nx-reg-m' }, 'CPI ', e('span', null, '2.4%'), ' · GDP ', e('span', null, '+0.3%'))
                ),
                e('div', { className: 'nx-reg' },
                    e('div', { className: 'nx-reg-n' }, 'China / EM'),
                    e('div', { className: 'nx-reg-r', style: { background: 'var(--nx-teal-b)', color: 'var(--nx-teal)' } }, 'Recovery'),
                    e('div', { className: 'nx-reg-m' }, 'PMI ', e('span', null, '51.2'), ' · CPI ', e('span', null, '0.8%'))
                ),
                e('div', { className: 'nx-reg' },
                    e('div', { className: 'nx-reg-n' }, 'South Africa'),
                    e('div', { className: 'nx-reg-r', style: { background: 'var(--nx-amber-b)', color: 'var(--nx-amber)' } }, 'Stabilising'),
                    e('div', { className: 'nx-reg-m' }, 'CPI ', e('span', null, '4.1%'), ' · R/$ ', e('span', null, '18.6'))
                )
            )
        ),

        // Cross-module Intelligence Grid
        e('div', { className: 'nx-zh', style: { marginBottom: 8 } },
            e('div', { className: 'nx-zh-t' }, 'Cross-Module Intelligence'),
            e('span', { className: 'nx-badge nx-bb' }, 'Live Synthesis')
        ),
        e('div', { className: 'nx-sig-grid' },
            // Risk VaR
            e('div', { className: 'nx-sm' },
                e('div', { className: 'nx-sm-t' },
                    e('div', { className: 'nx-sm-dot', style: { background: 'var(--nx-red)' } }),
                    'Risk · VaR Contribution'
                ),
                topVar.map(function(h) {
                    const w = Math.min(100, (+h.var_contribution_pct || 0) * 20);
                    return e('div', { key: h.symbol, className: 'nx-fr' },
                        e('div', { className: 'nx-fn' }, h.symbol),
                        e('div', { className: 'nx-ft' },
                            e('div', { className: 'nx-ff', style: { width: w + '%', background: 'var(--nx-red)' } })
                        ),
                        e('div', { className: 'nx-fv nx-dn' }, pct(h.var_contribution_pct))
                    );
                })
            ),
            // Quality Distribution
            e('div', { className: 'nx-sm' },
                e('div', { className: 'nx-sm-t' },
                    e('div', { className: 'nx-sm-dot', style: { background: 'var(--nx-purple)' } }),
                    'Quality Distribution'
                ),
                qualDist.slice(0, 4).map(function([grade, count]) {
                    const [bg, col] = sigStyle(grade);
                    return e('div', { key: grade, className: 'nx-fr' },
                        e('div', { className: 'nx-fn' },
                            e('span', { style: { background: bg, color: col, padding: '1px 4px', borderRadius: 3, fontSize: 8, fontWeight: 700 } }, grade)
                        ),
                        e('div', { className: 'nx-ft' },
                            e('div', { className: 'nx-ff', style: { width: Math.round(count / n * 100) + '%', background: col } })
                        ),
                        e('div', { className: 'nx-fv nx-nt' }, count + ' pos')
                    );
                })
            ),
            // Quant Signal Mix
            e('div', { className: 'nx-sm' },
                e('div', { className: 'nx-sm-t' },
                    e('div', { className: 'nx-sm-dot', style: { background: 'var(--nx-amber)' } }),
                    'Quant · Signal Mix'
                ),
                [
                    ['Long',  longCnt,  'var(--nx-green)'],
                    ['Hold',  holdCnt,  'var(--nx-blue)'],
                    ['Short', shortCnt, 'var(--nx-red)'],
                ].map(function([lbl, cnt, col]) {
                    return e('div', { key: lbl, className: 'nx-fr' },
                        e('div', { className: 'nx-fn' }, lbl),
                        e('div', { className: 'nx-ft' },
                            e('div', { className: 'nx-ff', style: { width: Math.round(cnt / n * 100) + '%', background: col } })
                        ),
                        e('div', { className: 'nx-fv', style: { color: col } }, cnt)
                    );
                })
            ),
            // Technical Signal
            e('div', { className: 'nx-sm' },
                e('div', { className: 'nx-sm-t' },
                    e('div', { className: 'nx-sm-dot', style: { background: 'var(--nx-teal)' } }),
                    'Technical Signals'
                ),
                [
                    ['Bull',    bullCnt, 'var(--nx-green)'],
                    ['Neutral', neutCnt, 'var(--nx-blue)'],
                    ['Wary',    waryCnt, 'var(--nx-amber)'],
                ].map(function([lbl, cnt, col]) {
                    return e('div', { key: lbl, className: 'nx-fr' },
                        e('div', { className: 'nx-fn' }, lbl),
                        e('div', { className: 'nx-ft' },
                            e('div', { className: 'nx-ff', style: { width: Math.round(cnt / n * 100) + '%', background: col } })
                        ),
                        e('div', { className: 'nx-fv', style: { color: col } }, cnt)
                    );
                })
            )
        ),

        // P&L Waterfall
        e('div', { className: 'nx-wfall' },
            e('div', { className: 'nx-zh', style: { marginBottom: 0 } },
                e('div', { className: 'nx-zh-t' }, 'P&L Attribution'),
                e('span', { className: 'nx-badge ' + (wfData.total >= 0 ? 'nx-bg' : 'nx-br') },
                    (wfData.total >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(wfData.total)).toLocaleString('en-US')
                )
            ),
            e('div', { className: 'nx-wf-bars' },
                wfData.bars.map(function(h) {
                    const v    = +h.pnl_contribution;
                    const hpx  = Math.max(4, Math.round(Math.abs(v) / wfData.maxAbs * 76));
                    const col  = v >= 0 ? 'var(--nx-blue)' : 'var(--nx-red)';
                    const kStr = (Math.abs(v) >= 1000 ? (v >= 0 ? '+' : '−') + '$' + Math.round(Math.abs(v) / 1000) + 'k' : (v >= 0 ? '+' : '−') + '$' + Math.round(Math.abs(v)));
                    return e('div', { key: h.symbol, className: 'nx-wfc' },
                        e('div', { className: 'nx-wfv', style: { color: col } }, kStr),
                        e('div', { className: 'nx-wfb', style: { height: hpx + 'px', background: col, opacity: .8 } }),
                        e('div', { className: 'nx-wft' }, h.symbol)
                    );
                }),
                e('div', { className: 'nx-wfc', style: { borderLeft: '1px dashed var(--nx-border-md)', marginLeft: 2 } },
                    e('div', { className: 'nx-wfv', style: { color: wfData.total >= 0 ? 'var(--nx-green)' : 'var(--nx-red)', fontWeight: 700 } },
                        (wfData.total >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(wfData.total / 1000)) + 'k'
                    ),
                    e('div', { className: 'nx-wfb', style: { height: '76px', background: wfData.total >= 0 ? 'var(--nx-green)' : 'var(--nx-red)', opacity: .9 } }),
                    e('div', { className: 'nx-wft', style: { fontWeight: 600, color: 'var(--nx-text2)' } }, 'Total')
                )
            )
        )
    );
}

// ── ActionCentre (Zone C) ─────────────────────────────────────
function ActionCentre({ holdings }) {
    const alertRows = useMemo(function() {
        return holdings
            .filter(h => h.alert_flag)
            .sort(function(a, b) {
                const r = { conflict: 0, risk: 1, opportunity: 2 };
                return (r[a.alert_flag] || 3) - (r[b.alert_flag] || 3);
            });
    }, [holdings]);

    const trades = useMemo(function() {
        return [...holdings]
            .filter(h => h.recommended_action && h.recommended_action !== 'Hold')
            .sort(function(a, b) {
                const r = { Add: 0, Trim: 1, Exit: 2 };
                return (r[a.recommended_action] || 3) - (r[b.recommended_action] || 3);
            })
            .slice(0, 6);
    }, [holdings]);

    function alertIcon(flag) {
        return flag === 'conflict' ? '⚠' : flag === 'risk' ? '⊗' : flag === 'opportunity' ? '↑' : '⬡';
    }
    function alertCardStyle(flag) {
        if (flag === 'conflict' || flag === 'risk')
            return { background: 'var(--nx-red-b)', borderColor: 'rgba(239,68,68,.18)' };
        return { background: 'var(--nx-green-b)', borderColor: 'rgba(34,197,94,.18)' };
    }
    function alertIcoStyle(flag) {
        if (flag === 'conflict' || flag === 'risk')
            return { background: 'var(--nx-red-b)', color: 'var(--nx-red)' };
        return { background: 'var(--nx-green-b)', color: 'var(--nx-green)' };
    }
    function tradeChipClass(a) {
        return a === 'Add' ? 'nx-buy' : a === 'Exit' ? 'nx-sell' : 'nx-trim';
    }

    return e('div', { className: 'nx-zone' },
        e('div', { className: 'nx-zh' },
            e('div', { className: 'nx-zh-t' }, 'Nexus Alerts'),
            e('span', { className: 'nx-badge nx-ba' }, alertRows.length + ' Active')
        ),
        alertRows.length === 0
            ? e('div', { style: { fontSize: 9, color: 'var(--nx-text3)', padding: '8px 0' } },
                'No active alerts — portfolio within parameters.')
            : alertRows.map(function(h) {
                return e('div', { key: h.symbol, className: 'nx-alert', style: alertCardStyle(h.alert_flag) },
                    e('div', { className: 'nx-al-ico', style: alertIcoStyle(h.alert_flag) }, alertIcon(h.alert_flag)),
                    e('div', { className: 'nx-al-b' },
                        e('div', { className: 'nx-al-t' }, h.symbol + ': ' + (
                            h.alert_flag === 'conflict' ? 'Valuation × Risk Conflict' :
                            h.alert_flag === 'risk'     ? 'Position Size Risk' :
                            'Multi-Signal Opportunity'
                        )),
                        e('div', { className: 'nx-al-m' },
                            'Conv. ' + h.conviction_score + ' · Weight ' + h.weight_pct + '%' +
                            (h.var_contribution_pct ? ' · VaR ' + h.var_contribution_pct + '%' : ''))
                    ),
                    e('button', { className: 'nx-al-act' },
                        h.alert_flag === 'opportunity' ? 'Add' : 'Review')
                );
            }),

        e('div', { className: 'nx-div-line' }),
        e('div', { className: 'nx-zh' },
            e('div', { className: 'nx-zh-t' }, 'Suggested Trades'),
            e('span', { className: 'nx-badge nx-bb' }, trades.length + ' signals')
        ),
        e('div', { className: 'nx-tqueue' },
            trades.length === 0
                ? e('div', { style: { padding: '10px 12px', fontSize: 9, color: 'var(--nx-text3)' } }, 'No trades suggested.')
                : trades.map(function(h) {
                    return e('div', { key: h.symbol, className: 'nx-tr' },
                        e('span', { className: 'nx-td ' + tradeChipClass(h.recommended_action) }, h.recommended_action),
                        e('div', null,
                            e('div', { className: 'nx-ttk' }, h.symbol),
                            e('div', { className: 'nx-tre' }, (h.technical_signal || '?') + ' tech · ' + (h.quality_grade || '?') + ' qual')
                        ),
                        e('div', { className: 'nx-tsz ' + (h.recommended_action === 'Add' ? 'nx-up' : 'nx-dn') },
                            (h.recommended_action === 'Add' ? '+' : '−') + usd(Math.abs(+h.market_value) * 0.02)
                        ),
                        e('div', { className: 'nx-tcf', style: { color: SC(h.conviction_score) } }, h.conviction_score)
                    );
                })
        ),

        e('div', { className: 'nx-zh' },
            e('div', { className: 'nx-zh-t' }, 'Earnings Calendar'),
            e('span', { className: 'nx-badge nx-bg' }, 'Next 14 Days')
        ),
        e('div', { className: 'nx-ecal' },
            e('div', { style: { padding: '14px 12px', fontSize: 9, color: 'var(--nx-text3)', textAlign: 'center' } },
                'Earnings dates not yet in data layer.',
                e('br'),
                'v2 will surface upcoming catalysts per holding.'
            )
        )
    );
}

// ── NexusHoldings Table ───────────────────────────────────────
const TABLE_FILTERS = ['All', 'High Conv.', 'Long', 'Alerts', 'Trim/Exit'];

function NexusHoldings({ holdings }) {
    const [sortKey, setSortKey]   = useState('market_value');
    const [sortDir, setSortDir]   = useState(-1);
    const [filter,  setFilter]    = useState('All');
    const [expanded, setExpanded] = useState(null);

    const maxMV = useMemo(function() {
        return Math.max(...holdings.map(h => +h.market_value || 0), 1);
    }, [holdings]);

    const filtered = useMemo(function() {
        let list = [...holdings];
        if (filter === 'High Conv.')  list = list.filter(h => h.conviction_score >= 60);
        if (filter === 'Long')        list = list.filter(h => h.quant_signal === 'Long');
        if (filter === 'Alerts')      list = list.filter(h => h.alert_flag);
        if (filter === 'Trim/Exit')   list = list.filter(h => h.recommended_action === 'Trim' || h.recommended_action === 'Exit');
        list.sort(function(a, b) {
            const va = a[sortKey], vb = b[sortKey];
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            return sortDir * (isNaN(+va) ? String(va).localeCompare(String(vb)) : +va - +vb);
        });
        return list;
    }, [holdings, filter, sortKey, sortDir]);

    const totals = useMemo(function() {
        const total = holdings.reduce((s, h) => s + (+h.market_value || 0), 0) || 1;
        return {
            market_value:      holdings.reduce((s, h) => s + (+h.market_value || 0), 0),
            weight_pct:        holdings.reduce((s, h) => s + (+h.weight_pct || 0), 0),
            daily_return_pct:  holdings.reduce((s, h) => s + (+h.daily_return_pct || 0) * (+h.market_value || 0), 0) / total,
            total_return_pct:  holdings.reduce((s, h) => s + (+h.total_return_pct || 0) * (+h.market_value || 0), 0) / total,
            conviction_score:  Math.round(holdings.reduce((s, h) => s + (+h.conviction_score || 50) * (+h.market_value || 0), 0) / total),
            var_total:         holdings.reduce((s, h) => s + (+h.var_contribution_pct || 0), 0),
            earnings_count:    holdings.filter(h => h.next_earnings_date).length,
        };
    }, [holdings]);

    function handleSort(key) {
        if (sortKey === key) setSortDir(d => -d);
        else { setSortKey(key); setSortDir(-1); }
    }

    function SH({ col, label, cls: cn }) {
        const active = sortKey === col;
        const arrow  = active ? (sortDir === -1 ? ' ↓' : ' ↑') : '';
        return e('th', {
            className: 'nx-sh ' + (cn || '') + (active ? ' sorted' : ''),
            onClick: () => handleSort(col)
        }, label + arrow);
    }

    function alertBorder(h) {
        if (h.alert_flag === 'conflict' || h.alert_flag === 'risk')
            return { borderLeft: '2px solid var(--nx-red)' };
        if (h.alert_flag === 'opportunity')
            return { borderLeft: '2px solid var(--nx-green)' };
        return {};
    }

    function ExpandDetail({ h }) {
        const s   = h.conviction_score || 50;
        const aS  = actStyle(h.recommended_action);
        return e('tr', { className: 'nx-expand-row open' },
            e('td', { colSpan: 18 },
                e('div', { className: 'nx-expand-inner' },
                    e('div', { className: 'nx-expand-grid' },
                        e('div', { className: 'nx-eq' },
                            e('div', { className: 'nx-eq-l' }, 'Nexus Intelligence'),
                            e('div', { className: 'nx-eq-v', style: { color: SC(s) } },
                                (h.recommended_action || 'Hold') + ' — ' + s + '/100'),
                            e('div', { className: 'nx-eq-d' },
                                'Technical: ' + (h.technical_signal || '?') +
                                ' · Quality: ' + (h.quality_grade || '?') +
                                ' · Quant: ' + (h.quant_signal || 'Hold'))
                        ),
                        e('div', { className: 'nx-eq' },
                            e('div', { className: 'nx-eq-l' }, 'Portfolio Weight'),
                            e('div', { className: 'nx-eq-v', style: { color: +h.weight_pct > 8 ? 'var(--nx-amber)' : 'var(--nx-text)' } },
                                h.weight_pct + '%'),
                            e('div', { className: 'nx-eq-d' },
                                'P&L: ' + (h.pnl_contribution != null
                                    ? (h.pnl_contribution >= 0 ? '+' : '') + usd(h.pnl_contribution) : '—') +
                                ' · 5d: ' + pct(h.five_day_return_pct))
                        ),
                        e('div', { className: 'nx-eq' },
                            e('div', { className: 'nx-eq-l' }, 'Risk Profile'),
                            e('div', { className: 'nx-eq-v', style: { color: +h.var_contribution_pct > 2.5 ? 'var(--nx-red)' : 'var(--nx-text)' } },
                                h.var_contribution_pct != null ? 'VaR ' + h.var_contribution_pct + '%' : 'VaR —'),
                            e('div', { className: 'nx-eq-d' },
                                'Sector: ' + (h.sector || 'N/A') +
                                (h.max_drawdown_pct ? ' · Max DD: ' + h.max_drawdown_pct + '%' : ''))
                        ),
                        e('div', { className: 'nx-eq' },
                            e('div', { className: 'nx-eq-l' }, 'Recommended Action'),
                            e('div', { className: 'nx-eq-v', style: { color: aS.color } }, h.recommended_action || 'Hold'),
                            e('div', { className: 'nx-eq-d' },
                                'Total return: ' + pct(h.total_return_pct, 1) +
                                ' · Daily: ' + pct(h.daily_return_pct))
                        )
                    )
                )
            )
        );
    }

    return e('div', { className: 'nx-holdings-section' },
        e('div', { className: 'nx-hs-head' },
            e('div', { className: 'nx-hs-title' },
                'Nexus Holdings Table',
                e('span', null, 'All signals per holding · sortable · click to expand')
            ),
            e('div', { className: 'nx-hs-controls' },
                e('div', { className: 'nx-hs-filter' },
                    TABLE_FILTERS.map(f =>
                        e('button', { key: f, className: filter === f ? 'on' : '', onClick: () => setFilter(f) }, f)
                    )
                )
            )
        ),
        e('div', { className: 'nx-ht-wrap' },
            e('table', { className: 'nx-ht' },
                e('thead', null,
                    e('tr', null,
                        e('th', { className: 'nx-cg nx-cg-id',   colSpan: 1 }, 'Identity'),
                        e('th', { className: 'nx-cg nx-cg-port', colSpan: 4 }, 'Portfolio'),
                        e('th', { className: 'nx-cg nx-cg-val',  colSpan: 3 }, 'Valuation'),
                        e('th', { className: 'nx-cg nx-cg-mac',  colSpan: 3 }, 'Macro'),
                        e('th', { className: 'nx-cg nx-cg-rsk',  colSpan: 3 }, 'Risk'),
                        e('th', { className: 'nx-cg nx-cg-sig',  colSpan: 3 }, 'Signal'),
                        e('th', { className: 'nx-cg nx-cg-act',  colSpan: 1 }, 'Action')
                    ),
                    e('tr', null,
                        e('th', { className: 'nx-sh' }, 'Ticker / Name'),
                        e(SH, { col: 'market_value',      label: 'Mkt Value' }),
                        e(SH, { col: 'weight_pct',        label: 'Weight' }),
                        e(SH, { col: 'daily_return_pct',  label: 'Daily Δ' }),
                        e(SH, { col: 'total_return_pct',  label: 'Total Rtn' }),
                        e('th', { className: 'nx-sh' }, 'DCF Δ'),
                        e('th', { className: 'nx-sh' }, 'Fwd P/E'),
                        e('th', { className: 'nx-sh' }, 'PEG'),
                        e('th', { className: 'nx-sh' }, 'Regime'),
                        e('th', { className: 'nx-sh' }, 'Rate Sens.'),
                        e('th', { className: 'nx-sh' }, 'FX Expo.'),
                        e(SH, { col: 'beta',                label: 'Beta' }),
                        e('th', { className: 'nx-sh' }, 'Max DD'),
                        e(SH, { col: 'var_contribution_pct', label: 'VaR %' }),
                        e(SH, { col: 'conviction_score',   label: 'Conv.' }),
                        e(SH, { col: 'quant_signal',       label: 'Quant' }),
                        e('th', { className: 'nx-sh' }, 'Earnings'),
                        e('th', { className: 'nx-sh', style: { textAlign: 'center' } }, 'Act.')
                    )
                ),
                e('tbody', null,
                    filtered.reduce(function(rows, h) {
                        const s    = h.conviction_score || 50;
                        const isEx = expanded === h.symbol;
                        const aS   = actStyle(h.recommended_action);
                        const [, qCol] = sigStyle(h.quant_signal);
                        const tkColor  = h.alert_flag === 'conflict' || h.alert_flag === 'risk' ? 'var(--nx-red)'
                                       : h.alert_flag === 'opportunity' ? 'var(--nx-green)' : undefined;

                        rows.push(e('tr', {
                            key: h.symbol,
                            className: 'nx-hr' + (isEx ? ' active' : ''),
                            style: alertBorder(h),
                            onClick: () => setExpanded(isEx ? null : h.symbol)
                        },
                            e('td', { className: 'nx-c-id' },
                                e('div', { className: 'nx-tk', style: { color: tkColor } }, h.symbol),
                                e('div', { className: 'nx-nm' }, (h.asset_name || h.symbol).slice(0, 26)),
                                h.sector ? e('div', { className: 'nx-sec' }, h.sector.slice(0, 18)) : null
                            ),
                            e('td', { className: 'nx-c-port' },
                                e('div', { className: 'nx-mono' }, usd(h.market_value)),
                                e('div', { className: 'nx-mini-bar' },
                                    e('div', { className: 'nx-mb-t' },
                                        e('div', { className: 'nx-mb-f', style: { width: Math.round(+h.market_value / maxMV * 100) + '%', background: 'var(--nx-blue)' } })
                                    )
                                )
                            ),
                            e('td', { className: 'nx-c-port nx-mono' }, h.weight_pct + '%'),
                            e('td', { className: 'nx-c-port nx-mono', style: { color: cSign(h.daily_return_pct) } }, pct(h.daily_return_pct)),
                            e('td', { className: 'nx-c-port nx-mono', style: { color: cSign(h.total_return_pct) } }, pct(h.total_return_pct, 1)),
                            e('td', { className: 'nx-c-val nx-mono', style: { color: h.dcf_upside_pct ? cSign(h.dcf_upside_pct) : undefined } },
                                h.dcf_upside_pct != null ? pct(h.dcf_upside_pct) : '—'),
                            e('td', { className: 'nx-c-val nx-mono' }, h.fwd_pe  != null ? num(h.fwd_pe, 1) + '×' : '—'),
                            e('td', { className: 'nx-c-val nx-mono' }, h.peg_ratio != null ? num(h.peg_ratio, 2) : '—'),
                            e('td', { className: 'nx-c-mac' },
                                h.macro_regime_fit
                                    ? e('span', { className: 'nx-rchip', style: { background: 'var(--nx-amber-b)', color: 'var(--nx-amber)' } }, h.macro_regime_fit)
                                    : e('span', { style: { fontSize: 9, color: 'var(--nx-text3)' } }, '—')),
                            e('td', { className: 'nx-c-mac nx-mono', style: { color: 'var(--nx-text3)' } }, h.rate_sensitivity || '—'),
                            e('td', { className: 'nx-c-mac nx-mono' }, h.fx_exposure || '—'),
                            e('td', { className: 'nx-c-rsk nx-mono' }, h.beta != null ? num(h.beta, 2) : '—'),
                            e('td', { className: 'nx-c-rsk nx-mono', style: { color: h.max_drawdown_pct ? 'var(--nx-red)' : undefined } },
                                h.max_drawdown_pct != null ? pct(h.max_drawdown_pct) : '—'),
                            e('td', { className: 'nx-c-rsk nx-mono', style: { color: +h.var_contribution_pct > 2.5 ? 'var(--nx-red)' : undefined } },
                                h.var_contribution_pct != null ? pct(h.var_contribution_pct) : '—'),
                            e('td', { className: 'nx-c-sig' },
                                e('span', { className: 'nx-sscore', style: { background: SBG(s), color: SC(s) } }, s)
                            ),
                            e('td', { className: 'nx-c-sig' },
                                e('span', { className: 'nx-rchip', style: { background: SBG(s), color: qCol || SC(s) } }, h.quant_signal || '—')
                            ),
                            e('td', { className: 'nx-c-sig nx-mono', style: { color: 'var(--nx-text3)' } }, h.next_earnings_date || '—'),
                            e('td', { className: 'nx-c-act' },
                                e('button', {
                                    className: 'nx-act-btn',
                                    style: { background: aS.bg, color: aS.color, borderColor: aS.bc },
                                    onClick: ev => ev.stopPropagation()
                                }, h.recommended_action || 'Hold')
                            )
                        ));

                        if (isEx) rows.push(e(ExpandDetail, { key: h.symbol + '_exp', h }));
                        return rows;
                    }, []),

                    // Totals row
                    e('tr', { key: '__totals', className: 'nx-totals-row' },
                        e('td', { className: 'nx-c-id', style: { fontFamily: 'var(--nx-fm)', fontSize: 10, color: 'var(--nx-text2)' } },
                            'TOTAL · ' + holdings.length + ' holdings'),
                        e('td', { className: 'nx-c-port nx-mono' }, usd(totals.market_value)),
                        e('td', { className: 'nx-c-port nx-mono' }, totals.weight_pct.toFixed(0) + '%'),
                        e('td', { className: 'nx-c-port nx-mono', style: { color: cSign(totals.daily_return_pct) } }, pct(totals.daily_return_pct)),
                        e('td', { className: 'nx-c-port nx-mono', style: { color: cSign(totals.total_return_pct) } }, pct(totals.total_return_pct, 1)),
                        e('td', { className: 'nx-c-val' }),
                        e('td', { className: 'nx-c-val' }),
                        e('td', { className: 'nx-c-val' }),
                        e('td', { className: 'nx-c-mac' }),
                        e('td', { className: 'nx-c-mac' }),
                        e('td', { className: 'nx-c-mac' }),
                        e('td', { className: 'nx-c-rsk' }),
                        e('td', { className: 'nx-c-rsk' }),
                        e('td', { className: 'nx-c-rsk nx-mono', style: { color: 'var(--nx-red)' } }, pct(totals.var_total, 1)),
                        e('td', { className: 'nx-c-sig nx-mono', style: { color: 'var(--nx-amber)' } }, totals.conviction_score + ' avg'),
                        e('td', { className: 'nx-c-sig' }),
                        e('td', { className: 'nx-c-sig nx-mono', style: { color: totals.earnings_count > 0 ? 'var(--nx-amber)' : 'var(--nx-text3)' } },
                            totals.earnings_count > 0 ? totals.earnings_count + ' upcoming' : '—'),
                        e('td', { className: 'nx-c-act' })
                    )
                )
            ),
            e('div', { className: 'nx-tpager' },
                e('div', { className: 'nx-tpager-info' },
                    'Showing ' + filtered.length + ' of ' + holdings.length + ' holdings · sorted by ' + sortKey.replace(/_/g, ' ')),
                e('div', { style: { fontSize: 9, color: 'var(--nx-text3)' } },
                    'Click row to expand · click header to sort')
            )
        )
    );
}

// ── Nexus shell: own topbar + icon sidebar ────────────────────
const NEXUS_NAV = [
    { id: 'nexus',       icon: '⬡', label: 'Nexus'     },
    { id: 'portfolio',   icon: '◎', label: 'Portfolio' },
    { id: 'trading',     icon: '▶', label: 'Trade'     },
    { id: 'quant',       icon: '◇', label: 'Quant'     },
    { id: 'risk',        icon: '△', label: 'Risk'      },
    { id: 'performance', icon: '◆', label: 'Perf'      },
    { id: 'equity',      icon: '□', label: 'Equity'    },
    { id: 'macro',       icon: '◉', label: 'Macro'     },
    { id: 'funds',       icon: '■', label: 'Funds'     },
    { id: 'markets',     icon: '◎', label: 'Markets'   },
    { id: 'options',     icon: 'Ω', label: 'Options'   },
    { id: 'valuation',   icon: '◈', label: 'Valuation' },
];

// NexusShell is the universal persistent app shell — exported so app.js
// can use it for every module, not just the Nexus landing page.
export function NexusShell({ children, onNavigate, activeTab }) {
    const topPills = ['nexus', 'portfolio', 'equity', 'macro', 'quant', 'trading', 'risk', 'funds'];
    return e('div', {
        style: {
            position: 'fixed', inset: 0, zIndex: 9000,
            display: 'flex', flexDirection: 'column',
            background: 'var(--nx-bg1)', fontFamily: 'var(--nx-fb)',
            overflow: 'hidden'
        }
    },
        // gradient accent line
        e('div', { style: { height: 2, flexShrink: 0, background: 'linear-gradient(90deg,transparent,var(--nx-blue),var(--nx-purple),transparent)' } }),
        // topbar
        e('div', {
            style: {
                height: 44, flexShrink: 0, display: 'flex', alignItems: 'center',
                gap: 0, padding: '0 16px', borderBottom: '1px solid var(--nx-border)',
                background: 'var(--nx-bg2)'
            }
        },
            e('div', { style: { display: 'flex', flexDirection: 'column', lineHeight: 1.1, marginRight: 24 } },
                e('span', { style: { fontSize: 15, fontWeight: 800, letterSpacing: 2, color: 'var(--nx-blue)', fontFamily: 'var(--nx-fd)' } }, 'ATLAS⬡'),
                e('span', { style: { fontSize: 7, letterSpacing: 2.5, color: 'var(--nx-text3)', textTransform: 'uppercase' } }, 'NEXUS')
            ),
            e('div', { style: { display: 'flex', gap: 2, flex: 1 } },
                topPills.map(function(id) {
                    const nav = NEXUS_NAV.find(n => n.id === id);
                    if (!nav) return null;
                    const isActive = id === activeTab;
                    return e('button', {
                        key: id,
                        onClick: () => onNavigate && onNavigate(id),
                        style: {
                            padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                            fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
                            fontFamily: 'var(--nx-fb)',
                            background: isActive ? 'rgba(0,212,255,.15)' : 'transparent',
                            color: isActive ? 'var(--nx-blue)' : 'var(--nx-text3)',
                            transition: 'all .15s'
                        }
                    }, nav.label);
                })
            ),
            e('div', { style: { padding: '3px 8px', borderRadius: 4, background: 'rgba(20,184,166,.12)', color: 'var(--nx-teal)', fontSize: 9, fontWeight: 600, letterSpacing: 1, marginRight: 12 } }, 'RISK-ON'),
            e(Clock, null)
        ),
        // body: icon sidebar + main
        e('div', { style: { display: 'flex', flex: 1, overflow: 'hidden' } },
            e('nav', {
                style: {
                    width: 48, flexShrink: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', paddingTop: 12, gap: 4,
                    borderRight: '1px solid var(--nx-border)', background: 'var(--nx-bg2)', overflowY: 'auto'
                }
            },
                NEXUS_NAV.map(function(nav) {
                    const isActive = nav.id === activeTab;
                    return e('button', {
                        key: nav.id,
                        title: nav.label,
                        onClick: () => onNavigate && onNavigate(nav.id),
                        style: {
                            width: 36, height: 36, borderRadius: 6, border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, transition: 'all .15s',
                            background: isActive ? 'rgba(0,212,255,.15)' : 'transparent',
                            color: isActive ? 'var(--nx-blue)' : 'var(--nx-text3)'
                        }
                    }, nav.icon);
                })
            ),
            e('div', { style: { flex: 1, overflowY: 'auto', overflowX: 'hidden' } },
                children
            )
        )
    );
}

// ── Nexus landing content (no shell — shell is in app.js) ────
export function NexusPage() {
    const [holdings, setHoldings] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [err,      setErr]      = useState(null);

    useEffect(function() {
        if (!sb) { setLoading(false); return; }
        sb.from('vw_nexus_holdings').select('*').then(function({ data, error }) {
            if (error) setErr(error.message);
            else setHoldings(data || []);
            setLoading(false);
        });
    }, []);

    useEffect(function() {
        function onRefresh() {
            if (!sb) return;
            sb.from('vw_nexus_holdings').select('*').then(function({ data }) {
                if (data) setHoldings(data);
            });
        }
        window.addEventListener('atlas:refresh', onRefresh);
        return () => window.removeEventListener('atlas:refresh', onRefresh);
    }, []);

    if (loading) return e('div', { className: 'nexus-root nx-loading' },
        e('div', { style: { fontSize: 20, marginBottom: 10 } }, '⬡'), 'Loading Nexus…');
    if (err) return e('div', { className: 'nexus-root nx-error' },
        '⚠ Failed to load vw_nexus_holdings: ', e('br'), err);
    if (!sb || !holdings.length) return e('div', { className: 'nexus-root nx-loading' },
        e('div', { style: { fontSize: 20, marginBottom: 10 } }, '⬡'),
        'No holdings data — configure Supabase key to load Nexus Intelligence.');

    return e('div', { className: 'nexus-root' },
        e(NexusHeader,   { holdings }),
        e('div', { className: 'nx-three-col' },
            e(ConvictionPanel, { holdings }),
            e(IntelCanvas,     { holdings }),
            e(ActionCentre,    { holdings })
        ),
        e(NexusHoldings, { holdings })
    );
}
