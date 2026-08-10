// ============================================================
// ATLAS Nexus — The Bench (verdict layer)
// ------------------------------------------------------------
// Every held name appears on the docket and is judged in public:
// contribution (is it paying), thesis on trial (is the story
// surviving contact with evidence), signal check, verdict. CUT
// verdicts carry a ruling: freed capital routed to recruits from
// the opportunity ledger — exits and entries as one circulatory
// system.
//
// THE BENCH AUDITS ITSELF. The diagnostics strip renders every
// input's health; a frozen input voids the ruling; a missing table
// is a visible warning ("assessment writer: never fired"), never a
// silent fallback. Self-fetches /api/nexus-bench (+ the opportunity
// ledger for recruits); all maths is pure (nexusBenchCompute.js).
// ============================================================

import React from 'react';
import {
    thesisFreshness, claimsTally, deriveIntegrity, resolveVerdict,
    buildWaterfall, cumulativeFromCloses, themeComposite, buildJaws,
    tapeEvents, buildCirculatory, benchDiagnostics, mapCortexToHoldings,
    thesisClock, weightVsConviction, rVarRead, damageRead, signalCheck, sortDocket,
    buildCensus, applyCensusFilter, buildHeadroomRail,
    sellsFromVerdicts, buildCirculation, volTriggerRead,
} from './nexusBenchCompute.js';
import { trackSleeveComposition, SLEEVE_STALE_SESSIONS } from './nexusOpportunitiesCompute.js';

const { useState, useEffect } = React;
const e = React.createElement;

const sgnPct = (v, d = 2) => (v == null ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) + '%');
const convColor = c => (c >= 75 ? 'var(--success)' : c >= 60 ? 'var(--cyan)' : c >= 45 ? 'var(--amber)' : 'var(--danger)');

function openObject(tk) {
    window.dispatchEvent(new CustomEvent('nexus:open-object', { detail: { objectId: 'obj-' + String(tk).toLowerCase(), tk } }));
}

function useBench() {
    const [s, setS] = useState({ bench: null, ledger: [], loading: true });
    useEffect(function () {
        let alive = true;
        Promise.all([
            fetch('/api/nexus-bench').then(r => r.json()).catch(() => null),
            fetch('/api/nexus-opportunities').then(r => r.json()).catch(() => null),
        ]).then(([b, o]) => {
            if (!alive) return;
            setS({ bench: b && b.ok ? b : null, ledger: (o && o.ok && o.ledger) || [], loading: false });
        });
        return () => { alive = false; };
    }, []);
    return s;
}

// ── Verdict chip — four states + the honest non-states ────────
// PRESS filled green (rare by design) · STAYS outline green ·
// ON WATCH amber · CUT red. No ruling → 'awaiting ruling'; stale
// price → 'suspended'. An override shows both: model struck through,
// the user's ruling standing (disagreement is information).
const VERDICT_LABEL = { press: 'PRESS', stays: 'STAYS', watch: 'ON WATCH', cut: 'CUT' };

function VerdictChip({ res }) {
    if (res.state === 'suspended') return e('span', { className: 'bn-verdict suspended', title: res.reason }, 'SUSPENDED');
    if (res.state === 'pending') return e('span', { className: 'bn-verdict pending', title: res.reason }, 'AWAITING RULING');
    return e('span', { className: 'bn-vwrap' },
        res.overridden && res.modelVerdict
            ? e('span', { className: 'bn-verdict struck ' + res.modelVerdict, title: 'model verdict, overridden' }, VERDICT_LABEL[res.modelVerdict] || res.modelVerdict)
            : null,
        e('span', { className: 'bn-verdict ' + res.verdict + (res.overridden ? ' user' : ''), title: res.condition || '' }, VERDICT_LABEL[res.verdict] || res.verdict),
        res.aged ? e('span', { className: 'bn-aged', title: 'assessment has not re-run since' }, 'ruling aged ' + res.agedDays + 'd') : null);
}

// ── Thesis integrity chip ─────────────────────────────────────
const INTEGRITY_CLS = { intact: 'ok', bending: 'warn', broken: 'bad', untested: 'dim', expired: 'exp' };
function IntegrityChip({ integrity, derived }) {
    if (!integrity) return e('span', { className: 'bn-integ none', title: 'no claims on file — bench_claims pending' }, 'no claims');
    return e('span', { className: 'bn-integ ' + (INTEGRITY_CLS[integrity] || 'dim'), title: derived ? 'derived from claims maths (writer has not ruled)' : 'assessment ruling' },
        integrity + (derived ? ' ~' : ''));
}

// ── Freshness stamp ───────────────────────────────────────────
function FreshnessStamp({ fresh }) {
    if (fresh.state === 'silent') return e('span', { className: 'bn-fresh silent', title: 'no scrapbook entry since purchase — a silent thesis facing the cut gets no stay' }, 'silent');
    if (fresh.state === 'stale') return e('span', { className: 'bn-fresh stale' }, 'stale ' + fresh.daysSince + 'd');
    return e('span', { className: 'bn-fresh ok' }, 'upd ' + fresh.daysSince + 'd');
}

// ── Diagnostics strip — the bench auditing itself ─────────────
const SLEEVE_LS_KEY = 'nexus.fundingSleeve.history';
function DiagnosticsStrip({ diagnostics, funding }) {
    const [sleeveDays, setSleeveDays] = useState(0);
    const tks = ((funding && funding.sleeve) || []).map(s => s.tk);
    const comp = tks.join('|');
    useEffect(function () {
        if (!comp) return;
        try {
            const prev = JSON.parse(window.localStorage.getItem(SLEEVE_LS_KEY) || 'null');
            const next = trackSleeveComposition(prev, tks, new Date().toISOString().slice(0, 10));
            window.localStorage.setItem(SLEEVE_LS_KEY, JSON.stringify(next));
            setSleeveDays(next.days);
        } catch { /* localStorage unavailable → no badge, never a crash */ }
    }, [comp]);
    const items = benchDiagnostics({
        fvTrusted: diagnostics.fvTrusted, fvTotal: diagnostics.fvTotal, fvReasons: diagnostics.fvReasons,
        writerRows: diagnostics.writerRows, writerLastRun: diagnostics.writerLastRun,
        claimsAvailable: diagnostics.claimsAvailable, contributionBasis: diagnostics.contributionBasis,
        sleeveUnresolved: !!(funding && funding.unresolved),
        navCoveragePct: diagnostics.navCoveragePct, contribUncovered: diagnostics.contribUncovered,
        volRows: diagnostics.volRows, volTriggered: diagnostics.volTriggered, volAbstaining: diagnostics.volAbstaining,
    });
    if (sleeveDays >= SLEEVE_STALE_SESSIONS) items.push({ key: 'sleeve-stale', label: 'sleeve unchanged ' + sleeveDays + 'd — verify inputs', level: 'warn' });
    return e('div', { className: 'bn-diag' },
        items.map(i => e('span', { key: i.key, className: 'bn-diag-i ' + i.level }, i.label)));
}

// ── 6.1 Contribution waterfall ────────────────────────────────
function ContributionWaterfall({ docket, basis }) {
    const rows = docket.map(d => ({
        tk: d.tk,
        contrib: basis === 'view' && d.contrib.ytd != null ? d.contrib.ytd : d.contrib.today,
        weightPct: d.weightPct,
        contribReason: d.contrib.reason,
    }));
    const w = buildWaterfall(rows);
    if (!w) return null;
    const omitLine = w.omitted
        ? w.omitted.n + ' holdings (' + w.omitted.weightPct + '% of book) not measurable'
            + (w.omitted.reason === 'no_transaction_history' ? ' — no transaction history' : '')
        : null;
    // Every name unmeasurable → say so rather than draw an empty axis.
    if (!w.bars.length) {
        return e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' }, e('h3', null, 'Contribution')),
            e('div', { className: 'bn-empty' }, 'No measurable contribution. ' + (omitLine || '')));
    }
    // Layout: room reserved above for the concentration rail and below for the
    // ticker row, so nothing collides. Y-scale is zero-anchored on round steps.
    const W = 760, H = 230;
    const X0 = 46, X1 = W - 74, Y0 = 40, Y1 = 172;
    const vals = w.bars.flatMap(b => [b.from, b.to]).concat([0, w.net]);
    const rawMin = Math.min(...vals, 0), rawMax = Math.max(...vals, 0);
    const rough = ((rawMax - rawMin) || 1) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const nn = rough / mag;
    const stepV = (nn <= 1 ? 1 : nn <= 2 ? 2 : nn <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(rawMin / stepV) * stepV;
    const hi = Math.ceil(rawMax / stepV) * stepV;
    const loF = lo === hi ? lo - stepV : lo, hiF = hi === lo ? hi + stepV : hi;
    const py = v => Y1 - ((v - loF) / (hiF - loF)) * (Y1 - Y0);
    const slot = (X1 - X0) / w.bars.length;
    const bw = Math.max(6, Math.min(46, slot - 8));
    const kids = [];

    // Gridlines on round steps, zero picked out.
    for (let g = loF; g <= hiF + 1e-9; g += stepV) {
        const gv = +g.toFixed(10), isZero = Math.abs(gv) < 1e-9;
        kids.push(e('line', { key: 'g' + gv, x1: X0, y1: py(gv), x2: X1, y2: py(gv), stroke: isZero ? 'rgba(255,255,255,.20)' : 'rgba(255,255,255,.045)' }));
        kids.push(e('text', { key: 'gl' + gv, x: X0 - 7, y: py(gv) + 3, textAnchor: 'end', fontSize: 8.5, fill: isZero ? 'var(--text2)' : 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, gv.toFixed(1) + '%'));
    }

    const FILL = { carrier: 'var(--success)', detractor: 'var(--danger)', shelf: '#5b6b7d', tail: '#5b6b7d' };
    let lastCarrierX = X0;
    w.bars.forEach((b, i) => {
        const x = X0 + i * slot + (slot - bw) / 2;
        const yA = py(b.from), yB = py(b.to);
        const top = Math.min(yA, yB), h = Math.max(2, Math.abs(yA - yB));
        const grouped = b.kind === 'shelf' || b.kind === 'tail';
        kids.push(e('rect', {
            key: 'b' + i, x, y: top, width: bw, height: h, rx: 2,
            fill: FILL[b.kind] || '#5b6b7d', opacity: grouped ? 0.5 : 0.9,
        }));
        // Ticker labels rotate 40° so they never overlap at any bar count.
        kids.push(e('text', {
            key: 't' + i, transform: 'translate(' + (x + bw / 2) + ',' + (Y1 + 11) + ') rotate(40)',
            fontSize: 9, fill: grouped ? 'var(--text3)' : '#fff', style: { fontFamily: 'var(--fm)' },
        }, b.tk));
        // Value labels only where they fit and mean something — a column of
        // "0.02%" on hairline bars was the noise that made this unreadable.
        if (!grouped && Math.abs(b.value) >= stepV * 0.4) {
            kids.push(e('text', {
                key: 'v' + i, x: x + bw / 2, y: (b.value >= 0 ? top - 5 : top + h + 10),
                textAnchor: 'middle', fontSize: 8.5, fill: b.value >= 0 ? 'var(--success)' : 'var(--danger)',
                style: { fontFamily: 'var(--fm)' },
            }, sgnPct(b.value)));
        }
        if (b.kind === 'carrier') lastCarrierX = x + bw;
    });

    // Net marker, labelled in the right-hand gutter so it clears the bars.
    kids.push(e('line', { key: 'net', x1: X0, y1: py(w.net), x2: X1 + 4, y2: py(w.net), stroke: 'var(--cyan)', strokeWidth: 1, strokeDasharray: '5 4', opacity: 0.75 }));
    kids.push(e('text', { key: 'netl', x: X1 + 8, y: py(w.net) + 3, textAnchor: 'start', fontSize: 9, fill: 'var(--cyan)', style: { fontFamily: 'var(--fm)' } }, 'net ' + sgnPct(w.net)));
    if (w.concentration) {
        kids.push(e('line', { key: 'rail', x1: X0, y1: Y0 - 14, x2: lastCarrierX, y2: Y0 - 14, stroke: 'var(--purple)', strokeWidth: 1, strokeDasharray: '3 3' }));
        kids.push(e('text', { key: 'raill', x: X0, y: Y0 - 20, fontSize: 9, fill: 'var(--purple)', style: { fontFamily: 'var(--fm)' } },
            w.concentration.names + ' names = ' + w.concentration.pctOfPositive + '% of contribution'));
    }
    return e('div', { className: 'nf-card nf-fade' },
        e('div', { className: 'nf-card-h' }, e('h3', null, 'Contribution'),
            e('span', { className: 'nf-sub' }, basis === 'view' ? 'cumulative YTD' : 'today only — cumulative view pending')),
        e('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': 'Contribution waterfall: carriers, small names, detractors, net.' }, kids),
        // The chart spans only what is measurable; the gap is stated under it
        // rather than left for the reader to discover by counting bars.
        omitLine && e('div', { className: 'bn-omit' }, omitLine));
}

// ── 6.3 Annotated tape sparkline ──────────────────────────────
function AnnotatedTape({ row, series }) {
    const cum = cumulativeFromCloses(series);
    if (!cum) return e('span', { className: 'bn-tape-none', title: 'no price series in window' }, '—');
    const W = 150, H = 34, P = 3;
    const vMin = Math.min(...cum.map(p => p.v)), vMax = Math.max(...cum.map(p => p.v));
    const span = (vMax - vMin) || 1;
    const px = i => P + (i / (cum.length - 1)) * (W - 2 * P);
    const py = v => (H - P) - ((v - vMin) / span) * (H - 2 * P);
    const dToX = new Map(cum.map((p, i) => [p.d, px(i)]));
    const nearestX = d => { // events snap to the nearest bar at/before the date
        let x = null;
        for (const p of cum) { if (p.d <= d) x = dToX.get(p.d); else break; }
        return x;
    };
    const ev = tapeEvents({ claims: row.claims, thesisDates: row.thesisDates, windowStart: cum[0].d, windowEnd: cum[cum.length - 1].d });
    const kids = [];
    // amber wash over thesis-silence stretches, under everything
    for (const s of ev.silences) {
        const a = nearestX(s.from), b = nearestX(s.to);
        if (a != null && b != null && b > a) kids.push(e('rect', { key: 'sil' + s.from, x: a, y: 0, width: b - a, height: H, fill: 'rgba(245,166,35,0.18)' }));
    }
    kids.push(e('polyline', { key: 'line', points: cum.map((p, i) => px(i) + ',' + py(p.v)).join(' '), fill: 'none', stroke: 'rgba(160,178,196,0.75)', strokeWidth: 1 }));
    kids.push(e('circle', { key: 'entry', cx: px(0), cy: py(cum[0].v), r: 2.2, fill: 'var(--cyan)' }));
    for (const t of ev.ticks) {
        const x = nearestX(t);
        if (x != null) kids.push(e('line', { key: 'tick' + t, x1: x, y1: H - 6, x2: x, y2: H, stroke: 'var(--cyan)', strokeWidth: 1 }));
    }
    for (const m of ev.claimMarks) {
        const x = nearestX(m.d);
        if (x != null) kids.push(e('circle', { key: 'cm' + m.d + m.ok, cx: x, cy: 5, r: 2.4, fill: m.ok ? 'var(--success)' : 'var(--danger)' }));
    }
    return e('svg', { className: 'bn-tape', viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': row.tk + ' tape' }, kids);
}

// ── 6.2 Story vs Tape — the jaws ──────────────────────────────
function JawsChart({ row, series, docket, seriesByTk }) {
    const tape = cumulativeFromCloses(series);
    const story = themeComposite(seriesByTk, docket, row.theme, row.tk);
    const j = buildJaws(tape, story);
    if (!j) return e('div', { className: 'nb-empty' }, 'No price series in window — tape unavailable, no line invented.');
    if (j.mode === 'tape-only') {
        return e('div', null,
            e(SimpleLine, { pts: j.tape.map(p => p.v), color: 'var(--text2)' }),
            e('div', { className: 'bn-jaws-note' }, 'story unquantified — tape only, no dashed line invented'));
    }
    const W = 680, H = 172, P = 14;
    const all = j.points.flatMap(p => [p.tape, p.story]);
    const vMin = Math.min(...all), vMax = Math.max(...all);
    const span = (vMax - vMin) || 1;
    const px = i => P + (i / (j.points.length - 1)) * (W - 2 * P);
    const py = v => (H - P - 12) - ((v - vMin) / span) * (H - 2 * P - 12);
    const tapeColor = j.tracking ? 'var(--success)' : 'var(--danger)';
    const band = j.points.map((p, i) => px(i) + ',' + py(p.story)).join(' ') + ' ' +
                 j.points.slice().reverse().map((p, i) => px(j.points.length - 1 - i) + ',' + py(p.tape)).join(' ');
    const last = j.points[j.points.length - 1];
    // claim verdict markers (C1 ✓ / C2 ✗) pinned at status_changed_at
    const dToIdx = new Map(j.points.map((p, i) => [p.d, i]));
    const nearestIdx = d => {
        let idx = null;
        for (const p of j.points) { if (p.d <= d) idx = dToIdx.get(p.d); else break; }
        return idx;
    };
    const markers = [];
    (row.claims || []).forEach((c, n) => {
        if (c.status === 'pending' || !c.status_changed_at) return;
        const idx = nearestIdx(String(c.status_changed_at).slice(0, 10));
        if (idx == null) return;
        const ok = c.status === 'confirmed';
        markers.push(
            e('circle', { key: 'cm' + n, cx: px(idx), cy: py(j.points[idx].tape), r: 3.4, fill: ok ? 'var(--success)' : 'var(--danger)' }),
            e('text', { key: 'cml' + n, x: px(idx), y: py(j.points[idx].tape) - 7, textAnchor: 'middle', fontSize: 8.5, fill: ok ? 'var(--success)' : 'var(--danger)', style: { fontFamily: 'var(--fm)' } },
                'C' + (n + 1) + ' ' + (ok ? '✓' : '✗')));
    });
    return e('div', null,
        // The chart lives in a table cell whose width is content-driven, so it
        // caps itself at its own viewBox width. Without the cap, a wide cell
        // scales every stroke up with it and the chart leaves the card.
        e('svg', {
            viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Story vs tape',
            style: { display: 'block', width: '100%', maxWidth: W + 'px', height: 'auto' },
        },
            e('polygon', { points: band, fill: j.tracking ? 'rgba(58,214,224,0.07)' : 'rgba(240,88,79,0.09)' }),
            e('line', { x1: P, y1: py(0), x2: W - P, y2: py(0), stroke: 'rgba(255,255,255,.1)', strokeDasharray: '2 3' }),
            e('polyline', { points: j.points.map((p, i) => px(i) + ',' + py(p.story)).join(' '), fill: 'none', stroke: 'var(--cyan)', strokeWidth: 1.2, strokeDasharray: '5 4' }),
            e('polyline', { points: j.points.map((p, i) => px(i) + ',' + py(p.tape)).join(' '), fill: 'none', stroke: tapeColor, strokeWidth: 1.4 }),
            markers,
            j.annotate ? e('text', { x: W - P, y: py((last.story + last.tape) / 2), textAnchor: 'end', fontSize: 10, fill: 'var(--amber)', style: { fontFamily: 'var(--fm)' } },
                'honesty gap ' + (j.gapPpt >= 0 ? '+' : '−') + Math.abs(j.gapPpt) + 'ppt') : null,
            e('text', { x: P, y: H - 2, fontSize: 8.5, fill: 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, j.points[0].d),
            e('text', { x: W - P, y: H - 2, textAnchor: 'end', fontSize: 8.5, fill: 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, last.d)),
        e('div', { className: 'bn-jaws-leg' },
            e('span', null, e('i', { className: 'bn-leg-dash' }), 'the story (theme composite)'),
            e('span', null, e('i', { className: 'bn-leg-solid', style: { background: tapeColor } }), 'the tape (position)'),
            markers.length ? e('span', null, 'C✓/C✗ = claim verdicts at their stamp date') : null,
            j.annotate ? e('span', { className: 'bn-jaws-gapl' }, 'gap ' + Math.abs(j.gapPpt) + 'ppt') : null));
}

function SimpleLine({ pts, color }) {
    if (!pts || pts.length < 2) return null;
    const W = 680, H = 90, P = 8;
    const vMin = Math.min(...pts), vMax = Math.max(...pts);
    const span = (vMax - vMin) || 1;
    // Same cap as JawsChart — this renders in the same table cell.
    return e('svg', {
        viewBox: '0 0 ' + W + ' ' + H,
        style: { display: 'block', width: '100%', maxWidth: W + 'px', height: 'auto' },
    },
        e('polyline', {
            points: pts.map((v, i) => (P + i / (pts.length - 1) * (W - 2 * P)) + ',' + ((H - P) - (v - vMin) / span * (H - 2 * P))).join(' '),
            fill: 'none', stroke: color, strokeWidth: 1.2,
        }));
}

// ── Trial panel (expanded row) ────────────────────────────────
const CLAIM_ICON = { confirmed: '✓', contradicted: '✗', pending: '·' };
function TrialPanel({ row, series, docket, seriesByTk, res }) {
    const fresh = thesisFreshness(row.thesisUpdatedAt);
    // Two columns: the exhibit (chart, then claims) on the left at the chart's
    // own width, the thesis as a card on the right absorbing the remainder.
    // The thesis comes first in the DOM so the reading order stays argument-
    // then-evidence even though the chart sits left of it.
    return e('tr', { className: 'bn-trial-row' }, e('td', { colSpan: 7, className: 'bn-trial-cell' },
        e('div', { className: 'bn-trial' },
            e('div', { className: 'bn-trial-thesis' },
                e('span', { className: 'bn-lab' }, 'THE THESIS, AS FILED '),
                e(FreshnessStamp, { fresh }),
                e('div', { className: 'bn-quote' }, row.thesis || 'No scrapbook thesis on file — the story was never written down.'),
                row.thesisTruncated ? e('div', { className: 'bn-degraded' }, 'Summary truncated at source (220 chars, mid-sentence) — full narrative missing from the scrapbook. Upstream writer bug, flagged.') : null),
            e('div', { className: 'bn-trial-exhibit' },
                e('div', { className: 'bn-trial-jaws' },
                    e('span', { className: 'bn-lab' }, 'STORY v TAPE'),
                    e(JawsChart, { row, series, docket, seriesByTk })),
                e('div', { className: 'bn-trial-claims' },
                    e('span', { className: 'bn-lab' }, 'CLAIMS v EVIDENCE'),
                    row.claims.length
                        ? row.claims.map((c, i) => e('div', { key: c.id || i, className: 'bn-claim ' + c.status },
                            e('span', { className: 'bn-claim-ic' }, CLAIM_ICON[c.status] || '·'),
                            e('span', { className: 'bn-claim-tx' }, c.claim_text),
                            c.evidence_text ? e('span', { className: 'bn-claim-ev' }, c.evidence_text) : null))
                        : e('div', { className: 'bn-degraded' }, 'No claims extracted yet — bench_claims pending provisioning. The trial cannot proceed on evidence it does not have.'))),
            (res.synthesis || res.condition) ? e('div', { className: 'bn-trial-synth' },
                res.synthesis ? e('div', null, e('span', { className: 'bn-lab' }, 'SYNTHESIS '), res.synthesis) : null,
                res.condition ? e('div', { className: 'bn-cond' }, e('span', { className: 'bn-lab' }, 'THIS RULING CHANGES IF '), res.condition) : null) : null)));
}

// ── Ruling panel (CUT verdicts) + 6.4 circulatory chart ───────
function CirculatoryChart({ flow }) {
    if (!flow) return null;
    const W = 720, H = 40 + Math.max(flow.cuts.length, flow.recruits.length || 1) * 34;
    const cy = i => 30 + i * 34;
    const poolY = H / 2;
    const kids = [];
    flow.cuts.forEach((c, i) => {
        kids.push(e('text', { key: 'c' + c.tk, x: 8, y: cy(i) + 4, fontSize: 11, fill: 'var(--danger)', style: { fontFamily: 'var(--fm)' } }, c.tk + ' −' + c.weightPct + '%'));
        kids.push(e('path', { key: 'cr' + c.tk, d: 'M 95 ' + cy(i) + ' C 190 ' + cy(i) + ', 220 ' + poolY + ', 310 ' + poolY, fill: 'none', stroke: 'var(--danger)', strokeWidth: Math.max(1.5, c.weightPct * 2.4), opacity: 0.4 }));
    });
    kids.push(e('circle', { key: 'pool', cx: 340, cy: poolY, r: 22, fill: 'rgba(58,214,224,0.08)', stroke: 'var(--cyan)', strokeWidth: 1 }));
    kids.push(e('text', { key: 'pooll', x: 340, y: poolY - 28, textAnchor: 'middle', fontSize: 10, fill: 'var(--cyan)', style: { fontFamily: 'var(--fm)' } }, 'freed ' + flow.freedPct + '% NAV'));
    if (flow.recruits.length) {
        flow.recruits.forEach((r, i) => {
            kids.push(e('path', { key: 'rr' + r.tk, d: 'M 370 ' + poolY + ' C 460 ' + poolY + ', 490 ' + cy(i) + ', 585 ' + cy(i), fill: 'none', stroke: 'var(--cyan)', strokeWidth: 2, opacity: 0.5 }));
            kids.push(e('text', { key: 'r' + r.tk, x: 595, y: cy(i) + 4, fontSize: 11, fill: 'var(--cyan)', style: { fontFamily: 'var(--fm)' } }, r.tk + ' ' + (r.fvGapPct >= 0 ? '+' : '−') + Math.abs(r.fvGapPct) + '% · additive'));
        });
    } else {
        kids.push(e('text', { key: 'nor', x: 420, y: poolY + 4, fontSize: 10, fill: 'var(--text3)' }, 'no additive recruits on the ledger'));
    }
    return e('div', { className: 'bn-circ' },
        e('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': 'Freed capital routed from cuts to recruits.' }, kids),
        flow.factorShifts.length ? e('div', { className: 'bn-circ-foot' },
            flow.factorShifts.map(f => f.theme + ' frees ' + f.freedPct + '%').join(' · ') + ' — advisory, no ticket drafted (phase 2).') : null);
}

const GATE_LABEL = { permitted: 'PERMITTED', queued: 'QUEUED', blocked: 'BLOCKED', unfunded: 'UNFUNDED' };

function RulingBlock({ cutRows, sellRows, ledger, sleeves, navUsd }) {
    const sells = sellsFromVerdicts(sellRows || []);
    if (!sells.length) return null;
    const flow = buildCirculatory(cutRows, ledger);
    const circ = buildCirculation({ sells, ledger, sleeves, navUsd });
    const pp = v => (v == null ? '—' : v.toFixed(2) + 'pp');
    const usd = v => (v == null ? '' : ' ($' + Math.abs(v).toLocaleString() + ')');
    return e('div', { className: 'nf-card nf-fade bn-ruling' },
        e('div', { className: 'nf-card-h' }, e('h3', null, 'The ruling'),
            e('span', { className: 'nf-sub' },
                sells.filter(s => s.kind === 'exit').length + ' exit · ' +
                sells.filter(s => s.kind === 'trim').length + ' trim · freed capital gated on sleeve headroom')),
        // §6.1 every sell is a verdict outcome, and says which one
        sells.map(s => e('div', { key: s.kind + s.tk, className: 'bn-ruling-row' },
            e('b', null, s.tk),
            s.kind === 'exit'
                ? ' — CUT stages the full ' + pp(s.freesPp) + ' via PCM; '
                : ' — ON WATCH trims ' + pp(s.freesPp) + ' back to target; ',
            s.reason)),
        // §6.2 the identity, stated in full including the residual
        e('div', { className: 'bn-circ' },
            e('div', { className: 'bn-circ-id' },
                e('span', null, 'available ', e('b', null, pp(circ.availablePp)), usd(circ.availableUsd)),
                e('span', { className: 'bn-circ-op' }, '−'),
                e('span', null, 'deployed ', e('b', null, pp(circ.deployedPp)), usd(circ.deployedUsd)),
                e('span', { className: 'bn-circ-op' }, '='),
                e('span', { className: 'bn-circ-res' }, 'residual ', e('b', null, pp(circ.residualPp)), usd(circ.residualUsd)),
                circ.residualNote ? e('span', { className: 'bn-circ-note' }, circ.residualNote) : null),
            // §6.3 the gate is hard: a blocked recruit cannot be executed here
            e('div', { className: 'bn-uses' }, circ.uses.length
                ? circ.uses.map(u => e('div', { key: u.tk, className: 'bn-use ' + u.gate },
                    e('span', { className: 'bn-gate ' + u.gate }, GATE_LABEL[u.gate]),
                    e('span', { className: 'nf-tk', onClick: () => openObject(u.tk) }, u.tk),
                    e('span', { className: 'bn-use-sl' }, u.sleeve || 'no sleeve'),
                    e('span', { className: 'bn-use-sz' },
                        u.gate === 'permitted' ? pp(u.deployedPp) + (u.partial ? ' part' : '') : pp(u.wantPp) + ' wanted'),
                    e('span', { className: 'bn-use-why' }, u.detail || u.reason)))
                : e('div', { className: 'bn-use none' }, 'No additive recruits on the ledger — freed capital returns to cash.'))),
        e(CirculatoryChart, { flow }));
}

// ── Cortex signal chips — the hub's own taxonomy, not a parallel one ──
// Risk Flag = contradicting (red) · Thesis Extender = confirming (green)
// · Gap Filler = adjacent (cyan). Tooltip carries title + relevance.
const CORTEX_LABEL = { risk: 'risk flag', thesis: 'thesis ext', gap: 'gap filler' };
function CortexChips({ sigs }) {
    if (!sigs || !sigs.length) return null;
    return sigs.slice(0, 2).map((s, i) => e('span', {
        key: i,
        className: 'bn-ctx ' + s.stance,
        title: s.title + (s.relevance != null ? ' · relevance ' + s.relevance : '') + ' — Cortex hub',
    }, CORTEX_LABEL[s.class] || s.class));
}

// ── Docket table ──────────────────────────────────────────────
// ── Census strip — four legacy panels as one control surface ──
function CensusStrip({ docket, filter, onFilter }) {
    const cols = buildCensus(docket);
    if (!cols) return null;
    const active = filter ? filter.field + ':' + filter.value : null;
    return e('div', null,
        e('div', { className: 'bn-seclabel' }, 'State of the docket',
            e('span', { className: 'bn-src' }, 'absorbs: Legacy Nexus · Cross-Module Intelligence')),
        e('div', { className: 'bn-census' }, cols.map(c =>
            e('div', { key: c.key, className: 'bn-census-col' },
                e('h4', null, c.title, e('span', null, c.sub)),
                c.rows.map(r => e('div', {
                    key: r.key,
                    className: 'bn-crow' + (active === r.key ? ' on' : ''),
                    // Clicking the active row clears it — a filter you cannot
                    // undo from the same control is a trap.
                    onClick: () => onFilter(active === r.key ? null : r.filter),
                    title: active === r.key ? 'Clear filter' : 'Filter the docket to ' + r.label,
                },
                    e('span', { className: 'bn-ck' }, r.label),
                    e('span', { className: 'bn-cbar2' }, e('i', { className: r.tone, style: { width: r.barPct + '%' } })),
                    e('span', { className: 'bn-cv' }, r.count)))))));
}

// ── Sleeve headroom rail (§5.4) ───────────────────────────────
function HeadroomRail({ sleeves, namedSleeves }) {
    const rail = buildHeadroomRail(sleeves, namedSleeves);
    if (!rail) {
        return e('div', { className: 'bn-seclabel' }, 'Sleeve headroom',
            e('span', { className: 'bn-src warn' }, 'unavailable — no sleeve reading'));
    }
    return e('div', null,
        e('div', { className: 'bn-seclabel' }, 'Sleeve headroom',
            e('span', { className: 'bn-src' }, 'absorbs: Portfolio Risk · Sector Risk Budget')),
        e('div', { className: 'bn-headroom' },
            e('span', { className: 'bn-hr-title' }, rail.capPct + '% cap'),
            rail.sleeves.map(s => e('div', { key: s.sleeve, className: 'bn-sleeve' },
                e('span', { className: 'bn-hr-nm' }, s.sleeve),
                e('span', { className: 'bn-gauge' },
                    e('i', { className: s.tone, style: { width: s.fillPct + '%' } }),
                    e('b', null)),
                e('span', { className: 'bn-hd ' + s.tone, title: s.headroomUsd != null ? '$' + Math.round(s.headroomUsd).toLocaleString() + ' of room' : '' }, s.label))),
            rail.hidden > 0
                ? e('span', { className: 'bn-hr-rest' }, rail.hidden + ' sleeves with room to spare not shown')
                : null));
}

// ── §3.1 judged column cells ──────────────────────────────────
// Each abstains loudly. None of them can render a substituted average, and
// none renders a zero where the input was absent.
function ClockCell({ clock }) {
    return e('div', { className: 'bn-clock' + (clock.state === 'unknown' ? ' none' : '') },
        clock.label,
        e('small', { className: 'bn-clock-sub ' + clock.state }, clock.sub));
}

function WeightCell({ wv }) {
    if (wv.state !== 'resolved') {
        return e('div', { className: 'bn-wt none' }, '—', e('small', null, wv.sub));
    }
    // Track spans 0 → 2x target so a target sits mid-rail and the filled span
    // reads as the distance actually travelled from it.
    const span = Math.max(wv.targetPct * 2, wv.actualPct * 1.15, 0.5);
    const pct = v => Math.max(0, Math.min(100, (v / span) * 100));
    const lo = Math.min(pct(wv.targetPct), pct(wv.actualPct));
    const hi = Math.max(pct(wv.targetPct), pct(wv.actualPct));
    return e('div', { className: 'bn-wt', title: wv.label + ' (' + wv.sub + ')' },
        e('span', { className: 'bn-wt-track' }),
        e('span', { className: 'bn-wt-fill ' + wv.tone, style: { left: lo + '%', width: Math.max(1, hi - lo) + '%' } }),
        e('span', { className: 'bn-wt-tgt', style: { left: pct(wv.targetPct) + '%' } }),
        e('span', { className: 'bn-wt-lbl ' + wv.tone }, wv.label));
}

function RVarCell({ rv }) {
    if (rv.state !== 'ok') return e('div', { className: 'bn-num none' }, '—', e('small', null, rv.sub));
    return e('div', { className: 'bn-num ' + rv.tone }, rv.label, rv.sub ? e('small', null, rv.sub) : null);
}

function SignalChips({ check }) {
    return e('div', { className: 'bn-chips' + (check.partial ? ' partial' : '') },
        check.chips.map(c => e('span', { key: c.key, className: 'bn-chip ' + c.tone },
            e('small', null, c.key), c.label)),
        check.partial ? e('span', { className: 'bn-partial', title: check.missingKeys.join(', ') + ' missing' }, 'Partial — input missing') : null);
}

function DocketTable({ docket, series, ledger, writerRows, cortexByTk, sleeves, total, navUsd }) {
    const [open, setOpen] = useState({});
    const built = docket.map(row => {
        const derived = deriveIntegrity(row.claims);
        const res = resolveVerdict(row.assessment, { priceStale: row.priceStale });
        const integrity = res.integrity || derived;
        const fresh = thesisFreshness(row.thesisUpdatedAt);
        const j = row.judged || {};
        return {
            row, res, integrity, derivedOnly: !res.integrity && !!derived, fresh,
            tally: claimsTally(row.claims),
            clock: thesisClock(j.daysHeld, fresh),
            wv: weightVsConviction(row.weightPct, j.targetWeightPct),
            rv: rVarRead(j.rVar, j.unrealisedPct, j.componentVarPct),
            dmg: damageRead(j.damagePp),
            check: signalCheck(row),
            vol: volTriggerRead(row.vol),
            judged: { ...j, actualWeightPct: row.weightPct },
        };
    });
    // §3: damage descending, divider, then the undamaged block by |gap|.
    const { damaged, clean, dividerLabel } = sortDocket(built);
    const rows = damaged.concat(clean);
    // §6.1 the sell side: CUT exits and ON WATCH size breaches, nothing else
    const sellRows = rows.map(b => ({
        tk: b.row.tk, theme: b.row.theme, verdict: b.res.verdict,
        weightPct: b.row.weightPct, weightGapPp: b.judged.weightGapPp,
        reason: b.res.condition || b.res.synthesis || null,
    }));
    const cuts = rows.filter(r => r.res.verdict === 'cut')
        .map(r => ({ tk: r.row.tk, weightPct: r.row.weightPct, theme: r.row.theme, condition: r.res.condition, reason: r.res.synthesis }));

    return e(React.Fragment, null,
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' },
                e('h3', null, 'The docket'),
                e('span', { className: 'nf-sub' },
                    (total && total !== docket.length ? docket.length + ' of ' + total + ' names' : docket.length + ' names before the bench') +
                    (writerRows ? '' : ' · no rulings on file — assessment writer has never fired'))),
            e('div', { className: 'nf-table-scroll', style: { maxHeight: 520 } },
                e('table', { className: 'nf-table bn-table' },
                    // §3 seven columns, fixed order, no user reordering in v1
                    e('thead', null, e('tr', null,
                        ['Holding', 'Thesis clock', 'Weight vs conviction', 'R / VaR', 'Damage ↓', 'Signal check', 'Verdict']
                            .map(h => e('th', { key: h, className: 'nf-l' + (h === 'Damage ↓' ? ' bn-sorted' : '') }, h)))),
                    e('tbody', null, rows.flatMap(b => {
                        const { row, res, integrity, derivedOnly, fresh, tally, clock, wv, rv, dmg, check, vol } = b;
                        const isOpen = !!open[row.tk];
                        const out = [];
                        // The divider is a row so it scrolls with the block it labels.
                        if (b === clean[0] && damaged.length) {
                            out.push(e('tr', { key: '--divider', className: 'bn-divider-row' },
                                e('td', { colSpan: 7 }, dividerLabel)));
                        }
                        out.push(e('tr', {
                            key: row.tk,
                            className: (row.priceStale ? 'nf-stale-row ' : '') + (isOpen ? 'bn-open' : ''),
                            onClick: () => setOpen(p => ({ ...p, [row.tk]: !p[row.tk] })),
                            style: { cursor: 'pointer' }, title: 'Open the trial',
                        },
                            e('td', { className: 'nf-l' },
                                e('span', { className: 'nf-tk', onClick: ev => { ev.stopPropagation(); openObject(row.tk); }, title: 'Open ' + row.tk }, row.tk),
                                row.sleeveRank ? e('span', { className: 'bn-slv', title: 'funding sleeve rank (qualified)' }, '#' + row.sleeveRank) : null,
                                // §4.4 the trigger surfaces here and nowhere
                                // else — a flag on the row it concerns
                                vol.trigger ? e('span', { className: 'bn-volflag', title: vol.reason }, vol.label) : null,
                                vol.state === 'stale' ? e('span', { className: 'bn-volflag stale', title: vol.reason }, 'vol ?') : null,
                                row.name ? e('div', { className: 'bn-nm2' }, row.name) : null,
                                e('div', { className: 'bn-theme' }, row.theme)),
                            e('td', { className: 'nf-l' }, e(ClockCell, { clock })),
                            e('td', { className: 'nf-l' }, e(WeightCell, { wv })),
                            e('td', { className: 'nf-l bn-r' }, e(RVarCell, { rv })),
                            e('td', { className: 'nf-l bn-r' },
                                e('span', { className: 'bn-damage' + (dmg.state === 'damaged' ? '' : ' none') }, dmg.label)),
                            e('td', { className: 'nf-l' },
                                e(SignalChips, { check }),
                                e(CortexChips, { sigs: cortexByTk.get(row.tk) })),
                            e('td', { className: 'nf-l' },
                                e(VerdictChip, { res }),
                                e('div', { className: 'bn-trial-inline' },
                                    e(IntegrityChip, { integrity, derived: derivedOnly }),
                                    tally.total ? e('span', { className: 'bn-tally' }, tally.confirmed + '✓ ' + tally.contradicted + '✗ ' + tally.pending + '·') : null,
                                    e(FreshnessStamp, { fresh })))));
                        if (isOpen) out.push(e(TrialPanel, { key: row.tk + '-trial', row, series: series[row.tk], docket, seriesByTk: series, res }));
                        return out;
                    }))))),
        e(RulingBlock, { cutRows: cuts, sellRows, ledger, sleeves, navUsd }));
}

// ── The beat ──────────────────────────────────────────────────
export function NexusBenchPanel() {
    const { bench, ledger, loading } = useBench();
    const [filter, setFilter] = useState(null);
    if (loading) return e('div', { className: 'nf-card nb-loading' }, e('span', { className: 'nb-spin' }, '◴'), ' Convening the bench…');
    if (!bench) return e('div', { className: 'nf-card' }, e('div', { className: 'nb-empty' }, 'The bench cannot sit — holdings feed unavailable. No verdicts are rendered on missing data.'));
    const { docket, series, funding, diagnostics } = bench;
    const cortexByTk = mapCortexToHoldings(bench.cortex, docket);
    // Sleeves named by an open ruling stay on the rail even when they have
    // room — those are the ones a ruling is about to move.
    const namedSleeves = docket.filter(r => {
        const v = resolveVerdict(r.assessment, { priceStale: r.priceStale }).verdict;
        return v === 'cut' || v === 'watch';
    }).map(r => r.theme);
    const shown = applyCensusFilter(docket, filter);
    return e('div', null,
        e(DiagnosticsStrip, { diagnostics, funding }),
        e(CensusStrip, { docket, filter, onFilter: setFilter }),
        e(HeadroomRail, { sleeves: bench.sleeves, namedSleeves }),
        e(ContributionWaterfall, { docket, basis: diagnostics.contributionBasis }),
        filter ? e('div', { className: 'bn-filterbar' },
            'Docket filtered to ' + filter.field + ' = ' + filter.value + ' · ' + shown.length + ' of ' + docket.length,
            e('button', { className: 'bn-clear', onClick: () => setFilter(null) }, 'clear')) : null,
        e(DocketTable, {
            docket: shown, series, ledger, writerRows: diagnostics.writerRows, cortexByTk,
            sleeves: bench.sleeves, total: docket.length, navUsd: bench.navUsd,
        }));
}

export default NexusBenchPanel;
