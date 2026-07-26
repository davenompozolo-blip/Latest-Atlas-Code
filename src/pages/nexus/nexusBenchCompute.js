// ============================================================
// Nexus Bench — pure transforms (verdict layer, IO-free)
// ------------------------------------------------------------
// The Bench is the verdict layer: every held name is judged in
// public across contribution, thesis-on-trial, signal check and
// verdict. Design principle carried through every function here:
// THE BENCH AUDITS ITSELF. A frozen input voids the ruling; a
// missing input renders its specified degraded state. Nothing is
// ever invented (the SNDK lesson, codified).
//
// The provider (api/nexus-bench.js) does the Supabase reads and
// hands raw rows here; components stay dumb and render.
// ============================================================

export const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

const DAY_MS = 86_400_000;

// ── Thesis freshness — first-class, three states ──────────────
// 'updated' (quiet) · 'stale' (no scrapbook update in 30+ days)
// · 'silent' (no entry at all). A silent thesis facing the cut
// gets no stay — the verdict layer reads this directly.
export const THESIS_STALE_DAYS = 30;

export function thesisFreshness(lastUpdateIso, nowIso) {
    if (!lastUpdateIso) return { state: 'silent', daysSince: null };
    const last = Date.parse(lastUpdateIso), now = nowIso ? Date.parse(nowIso) : Date.now();
    if (!isFinite(last)) return { state: 'silent', daysSince: null };
    const days = Math.max(0, Math.floor((now - last) / DAY_MS));
    return { state: days >= THESIS_STALE_DAYS ? 'stale' : 'updated', daysSince: days };
}

// ── Claims tally + derived integrity ──────────────────────────
export function claimsTally(claims) {
    const t = { confirmed: 0, contradicted: 0, pending: 0, total: 0 };
    for (const c of claims || []) {
        if (c.status === 'confirmed') t.confirmed++;
        else if (c.status === 'contradicted') t.contradicted++;
        else t.pending++;
        t.total++;
    }
    return t;
}

// Integrity from the claims maths alone — the honest fallback when
// the assessment writer hasn't ruled. EXPIRED is model-authored only
// (it needs the macro-vs-capture distinction), so it never derives here.
export function deriveIntegrity(claims) {
    const t = claimsTally(claims);
    if (!t.total) return null;                                   // no claims → no integrity read
    if (t.pending === t.total) return 'untested';
    if (t.contradicted > t.total / 2) return 'broken';
    if (t.contradicted >= 1 && (t.confirmed + t.pending) >= 1) return 'bending';
    if (t.confirmed > t.total / 2 && t.contradicted === 0) return 'intact';
    return 'untested';
}

// ── Verdict resolution (display, not authorship) ──────────────
// Verdicts are authored by the assessment writer (opportunity_
// assessments); this resolves what the docket SHOWS:
//   • no assessment row → 'pending' (writer status carries the why)
//   • stale-priced name → suspended, never issued (guardrail)
//   • override → user verdict stands, model verdict struck through
//   • old ruling → aged badge (disagreement + decay are information)
export const RULING_AGED_DAYS = 5;

export function resolveVerdict(assessment, { priceStale = false, nowIso = null } = {}) {
    if (priceStale) return { state: 'suspended', verdict: null, reason: 'stale price feed — verdict suspended, not issued' };
    if (!assessment || (!assessment.verdict && !assessment.user_verdict)) {
        return { state: 'pending', verdict: null, reason: 'no ruling on file' };
    }
    const overridden = !!assessment.overridden_by_user && !!assessment.user_verdict;
    const verdict = overridden ? assessment.user_verdict : (assessment.verdict || null);
    const asOf = assessment.as_of_date || assessment.created_at || null;
    let agedDays = null;
    if (asOf) {
        const t = Date.parse(asOf), now = nowIso ? Date.parse(nowIso) : Date.now();
        if (isFinite(t)) agedDays = Math.max(0, Math.floor((now - t) / DAY_MS));
    }
    return {
        state: 'ruled',
        verdict,
        modelVerdict: assessment.verdict || null,
        overridden,
        aged: agedDays != null && agedDays > RULING_AGED_DAYS,
        agedDays,
        integrity: assessment.thesis_integrity || null,
        synthesis: assessment.synthesis || null,
        condition: assessment.verdict_condition || null,
    };
}

// ── Contribution waterfall (6.1) ──────────────────────────────
// Carriers as green cliffs, passengers as one grey shelf, detractors
// as red teeth, net marker, concentration rail over the carriers.
// A carrier is a positive contributor pulling meaningful freight
// (≥ 8% of total positive contribution, max 6 named); the rest of
// the positives collapse into the shelf. Detractors render singly.
export function buildWaterfall(rows) {
    const R = (rows || []).filter(r => num(r.contrib) != null).map(r => ({ tk: r.tk, contrib: Number(r.contrib) }));
    if (!R.length) return null;
    const pos = R.filter(r => r.contrib > 0).sort((a, b) => b.contrib - a.contrib);
    const neg = R.filter(r => r.contrib < 0).sort((a, b) => a.contrib - b.contrib);
    const posTotal = pos.reduce((a, r) => a + r.contrib, 0);
    const carriers = pos.filter((r, i) => i < 6 && posTotal > 0 && r.contrib >= posTotal * 0.08);
    const passengers = pos.slice(carriers.length);
    const passengersNet = passengers.reduce((a, r) => a + r.contrib, 0);
    const net = R.reduce((a, r) => a + r.contrib, 0);

    // Bar sequence with running offsets (start → end of each segment).
    const bars = [];
    let cum = 0;
    for (const c of carriers) { bars.push({ kind: 'carrier', tk: c.tk, value: c.contrib, from: cum, to: cum + c.contrib }); cum += c.contrib; }
    if (passengers.length) { bars.push({ kind: 'shelf', tk: passengers.length + ' passengers', value: passengersNet, from: cum, to: cum + passengersNet }); cum += passengersNet; }
    for (const d of neg) { bars.push({ kind: 'detractor', tk: d.tk, value: d.contrib, from: cum, to: cum + d.contrib }); cum += d.contrib; }

    const carrierSum = carriers.reduce((a, r) => a + r.contrib, 0);
    return {
        bars, net: +net.toFixed(3),
        concentration: carriers.length && posTotal > 0
            ? { names: carriers.length, pctOfPositive: Math.round((carrierSum / posTotal) * 100) }
            : null,
    };
}

// ── Series helpers (tape + jaws) ──────────────────────────────
// Cumulative % return vs the first close of the window.
export function cumulativeFromCloses(closes) {
    const C = (closes || []).filter(p => num(p.close) > 0);
    if (C.length < 2) return null;
    const base = Number(C[0].close);
    return C.map(p => ({ d: p.date, v: +(((Number(p.close) - base) / base) * 100).toFixed(2) }));
}

// Equal-weight theme composite from same-theme peers (self excluded).
// The honest story line for sector/theme claims — needs ≥ 2 peers with
// series, else null (the jaws then renders tape-only, never a fake line).
export function themeComposite(seriesByTk, docket, theme, excludeTk) {
    const peers = (docket || []).filter(r => r.theme === theme && r.tk !== excludeTk && seriesByTk[r.tk]);
    if (peers.length < 2) return null;
    const cums = peers.map(p => cumulativeFromCloses(seriesByTk[p.tk])).filter(Boolean);
    if (cums.length < 2) return null;
    const byDate = new Map();
    for (const cum of cums) for (const pt of cum) {
        const b = byDate.get(pt.d) || { sum: 0, n: 0 };
        b.sum += pt.v; b.n++;
        byDate.set(pt.d, b);
    }
    // only dates where every peer reported — a thin composite lies
    return [...byDate.entries()].filter(([, b]) => b.n === cums.length)
        .map(([d, b]) => ({ d, v: +(b.sum / b.n).toFixed(2) }))
        .sort((a, b) => a.d < b.d ? -1 : 1);
}

// ── Story vs Tape, the jaws (6.2) ─────────────────────────────
// tape = the name's cumulative return; story = the claim path.
// Where no honest story line exists → tape-only + 'story unquantified'.
// The shaded band is the honesty gap, annotated when ≥ threshold ppt.
export const JAWS_GAP_ANNOTATE_PPT = 5;

export function buildJaws(tape, story) {
    if (!tape || tape.length < 2) return null;
    if (!story || story.length < 2) return { mode: 'tape-only', tape, note: 'story unquantified' };
    const storyByD = new Map(story.map(p => [p.d, p.v]));
    const shared = tape.filter(p => storyByD.has(p.d));
    if (shared.length < 2) return { mode: 'tape-only', tape, note: 'story unquantified' };
    // re-base both to the first shared date so the jaws open from zero
    const t0 = shared[0].v, s0 = storyByD.get(shared[0].d);
    const points = shared.map(p => ({
        d: p.d,
        tape: +(p.v - t0).toFixed(2),
        story: +(storyByD.get(p.d) - s0).toFixed(2),
    }));
    const last = points[points.length - 1];
    const gap = +(last.story - last.tape).toFixed(1);
    return {
        mode: 'jaws', points,
        gapPpt: gap,
        annotate: Math.abs(gap) >= JAWS_GAP_ANNOTATE_PPT,
        tracking: gap <= 0 || Math.abs(gap) < JAWS_GAP_ANNOTATE_PPT,
    };
}

// ── Annotated tape events (6.3) ───────────────────────────────
// Claim verdicts pin at status_changed_at; thesis updates tick in
// cyan; stretches of 30+ days with no scrapbook update wash amber.
export function tapeEvents({ claims = [], thesisDates = [], windowStart, windowEnd }) {
    const inWin = d => d && (!windowStart || d >= windowStart) && (!windowEnd || d <= windowEnd);
    const claimMarks = (claims || [])
        .filter(c => c.status !== 'pending' && c.status_changed_at)
        .map(c => ({ d: String(c.status_changed_at).slice(0, 10), ok: c.status === 'confirmed' }))
        .filter(m => inWin(m.d));
    const ticks = (thesisDates || []).map(t => String(t).slice(0, 10)).filter(inWin);

    // silence stretches: gaps of 30+ days between consecutive thesis
    // updates (and from the last update to the window end)
    const sorted = (thesisDates || []).map(t => String(t).slice(0, 10)).sort();
    const silences = [];
    const pushSilence = (fromIso, toIso) => {
        const from = Date.parse(fromIso), to = Date.parse(toIso);
        if (isFinite(from) && isFinite(to) && (to - from) / DAY_MS >= THESIS_STALE_DAYS) {
            silences.push({ from: new Date(from + THESIS_STALE_DAYS * DAY_MS).toISOString().slice(0, 10), to: toIso });
        }
    };
    for (let i = 1; i < sorted.length; i++) pushSilence(sorted[i - 1], sorted[i]);
    if (sorted.length && windowEnd) pushSilence(sorted[sorted.length - 1], windowEnd);
    // never updated at all → the whole window is silent
    if (!sorted.length && windowStart && windowEnd) silences.push({ from: windowStart, to: windowEnd });
    return { claimMarks, ticks, silences };
}

// ── Circulatory chart data (6.4) ──────────────────────────────
// Red ribbons out of the CUT nodes into the freed pool; cyan ribbons
// out to recruits from the opportunity ledger. Advisory in phase 1.
export function buildCirculatory(cutRows, ledger) {
    const cuts = (cutRows || []).filter(r => num(r.weightPct) != null)
        .map(r => ({ tk: r.tk, weightPct: +Number(r.weightPct).toFixed(2), theme: r.theme || null }));
    if (!cuts.length) return null;
    const freedPct = +cuts.reduce((a, c) => a + c.weightPct, 0).toFixed(2);
    const recruits = (ledger || [])
        .filter(l => l.fit === 'additive' && !l.held && num(l.fvGapPct) != null)
        .slice(0, 3)
        .map(l => ({ tk: l.tk, fvGapPct: +Number(l.fvGapPct).toFixed(1), fit: l.fit }));
    // factor consequence: theme weight before → after the cuts
    const byTheme = new Map();
    for (const c of cuts) if (c.theme) byTheme.set(c.theme, (byTheme.get(c.theme) || 0) + c.weightPct);
    const factorShifts = [...byTheme.entries()].map(([theme, freed]) => ({ theme, freedPct: +freed.toFixed(2) }));
    return { cuts, freedPct, recruits, factorShifts };
}

// ── Diagnostics strip (7) ─────────────────────────────────────
// The bench audits itself: every input's health is a visible line,
// "never fired" is a warning on screen, not a hidden state.
export function benchDiagnostics({ fvTrusted = null, fvTotal = null, writerLastRun = null, writerRows = 0, claimsAvailable = false, contributionBasis = 'today-only', sleeveUnresolved = false, nowIso = null }) {
    const items = [];
    if (fvTotal != null) {
        items.push({
            key: 'fv', label: 'fv_trustworthy ' + (fvTrusted ?? 0) + '/' + fvTotal,
            level: !fvTrusted ? 'bad' : fvTrusted < fvTotal * 0.5 ? 'warn' : 'ok',
        });
    }
    if (!writerRows) {
        items.push({ key: 'writer', label: 'assessment writer: never fired', level: 'bad' });
    } else {
        const days = writerLastRun ? Math.floor(((nowIso ? Date.parse(nowIso) : Date.now()) - Date.parse(writerLastRun)) / DAY_MS) : null;
        items.push({
            key: 'writer',
            label: 'assessment writer: last run ' + (days == null ? 'unknown' : days + 'd ago'),
            level: days == null || days > RULING_AGED_DAYS ? 'warn' : 'ok',
        });
    }
    items.push(claimsAvailable
        ? { key: 'claims', label: 'bench_claims: live', level: 'ok' }
        : { key: 'claims', label: 'bench_claims: not yet provisioned', level: 'warn' });
    items.push(contributionBasis === 'view'
        ? { key: 'contrib', label: 'contribution: cumulative (vw_bench_contribution)', level: 'ok' }
        : { key: 'contrib', label: 'contribution: today only — cumulative view pending', level: 'warn' });
    if (sleeveUnresolved) items.push({ key: 'sleeve', label: 'funding sleeve: unresolved', level: 'bad' });
    return items;
}
