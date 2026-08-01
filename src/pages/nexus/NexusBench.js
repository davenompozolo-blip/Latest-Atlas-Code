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
    });
    if (sleeveDays >= SLEEVE_STALE_SESSIONS) items.push({ key: 'sleeve-stale', label: 'sleeve unchanged ' + sleeveDays + 'd — verify inputs', level: 'warn' });
    return e('div', { className: 'bn-diag' },
        items.map(i => e('span', { key: i.key, className: 'bn-diag-i ' + i.level }, i.label)));
}

// ── 6.1 Contribution waterfall ────────────────────────────────
function ContributionWaterfall({ docket, basis }) {
    const rows = docket.map(d => ({ tk: d.tk, contrib: basis === 'view' && d.contrib.ytd != null ? d.contrib.ytd : d.contrib.today }));
    const w = buildWaterfall(rows);
    if (!w) return null;
    const X0 = 40, X1 = 730, Y0 = 24, Y1 = 150;
    const vals = w.bars.flatMap(b => [b.from, b.to]).concat([0]);
    const vMin = Math.min(...vals), vMax = Math.max(...vals);
    const span = (vMax - vMin) || 1;
    const py = v => Y1 - ((v - vMin) / span) * (Y1 - Y0);
    const bw = Math.min(64, (X1 - X0) / w.bars.length - 6);
    const kids = [];
    kids.push(e('line', { key: 'zero', x1: X0, y1: py(0), x2: X1, y2: py(0), stroke: 'rgba(255,255,255,.12)', strokeDasharray: '2 3' }));
    let lastCarrierX = X0;
    w.bars.forEach((b, i) => {
        const x = X0 + i * ((X1 - X0) / w.bars.length) + 3;
        const yA = py(b.from), yB = py(b.to);
        const fill = b.kind === 'carrier' ? 'var(--success)' : b.kind === 'detractor' ? 'var(--danger)' : '#5b6b7d';
        kids.push(e('rect', { key: 'b' + i, x, y: Math.min(yA, yB), width: bw, height: Math.max(2, Math.abs(yA - yB)), rx: 2, fill, opacity: b.kind === 'shelf' ? 0.6 : 0.85 }));
        kids.push(e('text', { key: 't' + i, x: x + bw / 2, y: Y1 + 14, textAnchor: 'middle', fontSize: 8.5, fill: 'var(--text3)', style: { fontFamily: 'var(--fm)' } }, b.tk));
        kids.push(e('text', { key: 'v' + i, x: x + bw / 2, y: Math.min(yA, yB) - 4, textAnchor: 'middle', fontSize: 8, fill: 'var(--text2)', style: { fontFamily: 'var(--fm)' } }, sgnPct(b.value)));
        if (b.kind === 'carrier') lastCarrierX = x + bw;
    });
    // net marker + concentration rail over the carriers
    kids.push(e('line', { key: 'net', x1: X0, y1: py(w.net), x2: X1, y2: py(w.net), stroke: 'var(--cyan)', strokeWidth: 1, strokeDasharray: '5 4', opacity: 0.7 }));
    kids.push(e('text', { key: 'netl', x: X1, y: py(w.net) - 4, textAnchor: 'end', fontSize: 9, fill: 'var(--cyan)', style: { fontFamily: 'var(--fm)' } }, 'net ' + sgnPct(w.net)));
    if (w.concentration) {
        kids.push(e('line', { key: 'rail', x1: X0, y1: Y0 - 8, x2: lastCarrierX, y2: Y0 - 8, stroke: 'var(--purple)', strokeWidth: 1, strokeDasharray: '3 3' }));
        kids.push(e('text', { key: 'raill', x: X0, y: Y0 - 12, fontSize: 9, fill: 'var(--purple)', style: { fontFamily: 'var(--fm)' } },
            w.concentration.names + ' names = ' + w.concentration.pctOfPositive + '% of contribution'));
    }
    return e('div', { className: 'nf-card nf-fade' },
        e('div', { className: 'nf-card-h' }, e('h3', null, 'Contribution'),
            e('span', { className: 'nf-sub' }, basis === 'view' ? 'cumulative YTD' : 'today only — cumulative view pending')),
        e('svg', { viewBox: '0 0 760 175', width: '100%', role: 'img', 'aria-label': 'Contribution waterfall: carriers, passengers, detractors, net.' }, kids));
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
        e('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': 'Story vs tape' },
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
    return e('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%' },
        e('polyline', {
            points: pts.map((v, i) => (P + i / (pts.length - 1) * (W - 2 * P)) + ',' + ((H - P) - (v - vMin) / span * (H - 2 * P))).join(' '),
            fill: 'none', stroke: color, strokeWidth: 1.2,
        }));
}

// ── Trial panel (expanded row) ────────────────────────────────
const CLAIM_ICON = { confirmed: '✓', contradicted: '✗', pending: '·' };
function TrialPanel({ row, series, docket, seriesByTk, res }) {
    const fresh = thesisFreshness(row.thesisUpdatedAt);
    return e('tr', { className: 'bn-trial-row' }, e('td', { colSpan: 8 },
        e('div', { className: 'bn-trial' },
            e('div', { className: 'bn-trial-thesis' },
                e('span', { className: 'bn-lab' }, 'THE THESIS, AS FILED '),
                e(FreshnessStamp, { fresh }),
                e('div', { className: 'bn-quote' }, row.thesis || 'No scrapbook thesis on file — the story was never written down.'),
                row.thesisTruncated ? e('div', { className: 'bn-degraded' }, 'Summary truncated at source (220 chars, mid-sentence) — full narrative missing from the scrapbook. Upstream writer bug, flagged.') : null),
            e('div', { className: 'bn-trial-claims' },
                e('span', { className: 'bn-lab' }, 'CLAIMS v EVIDENCE'),
                row.claims.length
                    ? row.claims.map((c, i) => e('div', { key: c.id || i, className: 'bn-claim ' + c.status },
                        e('span', { className: 'bn-claim-ic' }, CLAIM_ICON[c.status] || '·'),
                        e('span', { className: 'bn-claim-tx' }, c.claim_text),
                        c.evidence_text ? e('span', { className: 'bn-claim-ev' }, c.evidence_text) : null))
                    : e('div', { className: 'bn-degraded' }, 'No claims extracted yet — bench_claims pending provisioning. The trial cannot proceed on evidence it does not have.')),
            (res.synthesis || res.condition) ? e('div', { className: 'bn-trial-synth' },
                res.synthesis ? e('div', null, e('span', { className: 'bn-lab' }, 'SYNTHESIS '), res.synthesis) : null,
                res.condition ? e('div', { className: 'bn-cond' }, e('span', { className: 'bn-lab' }, 'THIS RULING CHANGES IF '), res.condition) : null) : null,
            e('div', { className: 'bn-trial-jaws' },
                e('span', { className: 'bn-lab' }, 'STORY v TAPE'),
                e(JawsChart, { row, series, docket, seriesByTk })))));
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

function RulingBlock({ cutRows, ledger }) {
    if (!cutRows.length) return null;
    const flow = buildCirculatory(cutRows, ledger);
    return e('div', { className: 'nf-card nf-fade bn-ruling' },
        e('div', { className: 'nf-card-h' }, e('h3', null, 'The ruling'),
            e('span', { className: 'nf-sub' }, cutRows.length + ' cut' + (cutRows.length > 1 ? 's' : '') + ' · freed capital routed through the ledger')),
        cutRows.map(r => e('div', { key: r.tk, className: 'bn-ruling-row' },
            e('b', null, r.tk), ' — exit stages the full ' + (r.weightPct != null ? r.weightPct.toFixed(2) : '—') + '% via PCM; ',
            r.condition ? 'ruling condition: ' + r.condition : 'no stay: ' + (r.reason || 'thesis failed on the evidence') + '.')),
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
const VERDICT_ORDER = { cut: 0, watch: 1, press: 2, stays: 3 };
function DocketTable({ docket, series, ledger, writerRows, cortexByTk }) {
    const [open, setOpen] = useState({});
    const rows = docket.map(row => {
        const derived = deriveIntegrity(row.claims);
        const res = resolveVerdict(row.assessment, { priceStale: row.priceStale });
        const integrity = res.integrity || derived;
        return { row, res, integrity, derivedOnly: !res.integrity && !!derived, fresh: thesisFreshness(row.thesisUpdatedAt), tally: claimsTally(row.claims) };
    }).sort((a, b) => {
        const av = a.res.verdict ? VERDICT_ORDER[a.res.verdict] ?? 9 : 9;
        const bv = b.res.verdict ? VERDICT_ORDER[b.res.verdict] ?? 9 : 9;
        return av - bv || (b.row.weightPct || 0) - (a.row.weightPct || 0);
    });
    const cuts = rows.filter(r => r.res.verdict === 'cut')
        .map(r => ({ tk: r.row.tk, weightPct: r.row.weightPct, theme: r.row.theme, condition: r.res.condition, reason: r.res.synthesis }));

    return e(React.Fragment, null,
        e('div', { className: 'nf-card nf-fade' },
            e('div', { className: 'nf-card-h' },
                e('h3', null, 'The docket'),
                e('span', { className: 'nf-sub' }, docket.length + ' names before the bench' +
                    (writerRows ? '' : ' · no rulings on file — assessment writer has never fired'))),
            e('div', { className: 'nf-table-scroll', style: { maxHeight: 520 } },
                e('table', { className: 'nf-table bn-table' },
                    e('thead', null, e('tr', null,
                        ['Name', 'Theme', 'Wt', 'Contribution', 'Thesis on trial', 'Signals', 'Tape', 'Verdict']
                            .map(h => e('th', { key: h, className: 'nf-l' }, h)))),
                    e('tbody', null, rows.flatMap(({ row, res, integrity, derivedOnly, fresh, tally }) => {
                        const isOpen = !!open[row.tk];
                        const out = [e('tr', {
                            key: row.tk,
                            className: (row.priceStale ? 'nf-stale-row ' : '') + (isOpen ? 'bn-open' : ''),
                            onClick: () => setOpen(p => ({ ...p, [row.tk]: !p[row.tk] })),
                            style: { cursor: 'pointer' }, title: 'Open the trial',
                        },
                            e('td', { className: 'nf-l' },
                                e('span', { className: 'nf-tk', onClick: ev => { ev.stopPropagation(); openObject(row.tk); }, title: 'Open ' + row.tk }, row.tk),
                                row.sleeveRank ? e('span', { className: 'bn-slv', title: 'funding sleeve rank (qualified)' }, '#' + row.sleeveRank) : null),
                            e('td', { className: 'nf-l bn-theme' }, row.theme),
                            e('td', { className: 'nf-l nf-mono-cell' }, row.weightPct != null ? row.weightPct.toFixed(1) + '%' : '—'),
                            e('td', { className: 'nf-l' },
                                e('span', { className: 'bn-contrib ' + (row.contrib.today > 0 ? 'up' : row.contrib.today < 0 ? 'dn' : '') }, sgnPct(row.contrib.today)),
                                e('span', { className: 'bn-cbar' }, e('i', {
                                    className: row.contrib.today >= 0 ? 'up' : 'dn',
                                    style: { width: Math.min(40, Math.abs(row.contrib.today || 0) * 220) + 'px' },
                                }))),
                            e('td', { className: 'nf-l' },
                                e(IntegrityChip, { integrity, derived: derivedOnly }),
                                tally.total ? e('span', { className: 'bn-tally' }, tally.confirmed + '✓ ' + tally.contradicted + '✗ ' + tally.pending + '·') : null,
                                e(FreshnessStamp, { fresh })),
                            e('td', { className: 'nf-l' },
                                e(CortexChips, { sigs: cortexByTk.get(row.tk) }),
                                row.signals.quant ? e('span', { className: 'bn-sig' }, row.signals.quant) : null,
                                row.signals.technical ? e('span', { className: 'bn-sig t' }, row.signals.technical) : null,
                                (!(cortexByTk.get(row.tk) || []).length && !row.signals.quant && !row.signals.technical) ? e('span', { style: { color: 'var(--text3)' } }, '—') : null),
                            e('td', { className: 'nf-l' }, e(AnnotatedTape, { row, series: series[row.tk] })),
                            e('td', { className: 'nf-l' }, e(VerdictChip, { res })))];
                        if (isOpen) out.push(e(TrialPanel, { key: row.tk + '-trial', row, series: series[row.tk], docket, seriesByTk: series, res }));
                        return out;
                    }))))),
        e(RulingBlock, { cutRows: cuts, ledger }));
}

// ── The beat ──────────────────────────────────────────────────
export function NexusBenchPanel() {
    const { bench, ledger, loading } = useBench();
    if (loading) return e('div', { className: 'nf-card nb-loading' }, e('span', { className: 'nb-spin' }, '◴'), ' Convening the bench…');
    if (!bench) return e('div', { className: 'nf-card' }, e('div', { className: 'nb-empty' }, 'The bench cannot sit — holdings feed unavailable. No verdicts are rendered on missing data.'));
    const { docket, series, funding, diagnostics } = bench;
    const cortexByTk = mapCortexToHoldings(bench.cortex, docket);
    return e('div', null,
        e(DiagnosticsStrip, { diagnostics, funding }),
        e(ContributionWaterfall, { docket, basis: diagnostics.contributionBasis }),
        e(DocketTable, { docket, series, ledger, writerRows: diagnostics.writerRows, cortexByTk }));
}

export default NexusBenchPanel;
