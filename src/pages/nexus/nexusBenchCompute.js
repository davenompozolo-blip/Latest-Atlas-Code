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

// ── Docket row contract (§3.1) ────────────────────────────────
// Every reader here abstains rather than substitutes. A null input yields an
// em dash plus its reason; it never inherits a portfolio average, and it
// never renders a zero that would read as a measured result.

// §4.1 verdict triggers. PRESS wants a name proven and underweight; the size
// breach fires on weight alone — the TSM case, proven, oversized, still a
// problem.
export const WEIGHT_GAP_PP = 1.0;
// Within this band actual and target are the same call, not a drift.
export const WEIGHT_FLAT_PP = 0.15;

// Thesis clock. days_held only ever comes from transaction history; where it
// is absent the column says so (§3.1, §5.2) — never zero, never inferred
// from the earliest price observation.
export function thesisClock(daysHeld, fresh) {
    const d = num(daysHeld);
    if (d == null) return { state: 'unknown', days: null, label: '—', sub: 'no entry date' };
    const sub = !fresh || fresh.state === 'silent' ? 'silent'
        : fresh.state + (fresh.days != null ? ' ' + fresh.days + 'd' : '');
    return { state: fresh ? fresh.state : 'silent', days: d, label: d + 'd', sub };
}

// Weight vs conviction. Returns the track geometry the mini-bar draws plus
// the tone that reads the gap.
export function weightVsConviction(actualPct, targetPct) {
    const a = num(actualPct), t = num(targetPct);
    if (a == null || t == null) {
        return { state: 'unresolved', label: '—', sub: t == null ? 'no conviction' : 'no weight', tone: 'none', gapPp: null };
    }
    const gap = +(a - t).toFixed(3);
    const tone = Math.abs(gap) <= WEIGHT_FLAT_PP ? 'flat' : gap < 0 ? 'under' : 'over';
    return {
        state: 'resolved', tone, gapPp: gap,
        label: a.toFixed(1) + ' / ' + t.toFixed(1),
        sub: (gap >= 0 ? '+' : '') + gap.toFixed(2) + 'pp',
        actualPct: a, targetPct: t,
    };
}

// §4.2 return per unit of risk. The view already abstains below 0.25%
// component VaR; this carries the two inputs so the sub-line can show the
// arithmetic rather than assert a bare ratio.
export function rVarRead(rVar, unrealisedPct, componentVarPct) {
    const r = num(rVar);
    if (r == null) {
        const cv = num(componentVarPct);
        return { state: 'abstain', label: '—', sub: cv == null ? 'no component VaR' : 'VaR below 0.25%', value: null };
    }
    const u = num(unrealisedPct), c = num(componentVarPct);
    return {
        state: 'ok', value: r,
        label: (r >= 0 ? '' : '−') + Math.abs(r).toFixed(1) + '×',
        sub: u != null && c != null ? (u >= 0 ? '' : '−') + Math.abs(u).toFixed(1) + ' / ' + c.toFixed(1) : null,
        tone: r >= 0 ? 'pos' : 'neg',
    };
}

// §3.1 Damage renders an em dash for holdings that are not underwater —
// never 0.00pp, which would read as measured-and-zero.
export function damageRead(damagePp) {
    const d = num(damagePp);
    if (d == null || d <= 0) return { state: 'none', label: '—', value: null };
    return { state: 'damaged', label: d.toFixed(2) + 'pp', value: d };
}

// §3.1 Signal check — four chips in fixed order. A missing input is a dashed
// chip carrying an em dash and marks the whole row partial, which is the
// legacy conviction card's treatment carried over rather than rewritten.
const SIGNAL_TONE = {
    CHEAP: 'pos', UNDERVALUED: 'pos', BUY: 'pos', STRONG: 'pos', TAILWIND: 'pos', SUPPORT: 'pos',
    RICH: 'neg', OVERVALUED: 'neg', SELL: 'neg', WEAK: 'neg', HEADWIND: 'neg', WARY: 'neg', HEAD: 'neg',
};
export function signalCheck(row) {
    const j = (row && row.judged) || {};
    const s = (row && row.signals) || {};
    const raw = [
        { key: 'VAL', v: s.valuation },
        { key: 'MAC', v: j.macro },
        { key: 'TEC', v: s.technical },
        { key: 'QUA', v: j.quality },
    ];
    const chips = raw.map(c => {
        const t = c.v == null || c.v === '' ? null : String(c.v).trim();
        if (!t) return { key: c.key, label: '—', tone: 'miss', missing: true };
        const tone = SIGNAL_TONE[t.toUpperCase()] || (/^[AB][+-]?$/.test(t) ? 'pos' : /^[DF]/.test(t) ? 'neg' : 'flat');
        return { key: c.key, label: t.toUpperCase(), tone, missing: false };
    });
    const missing = chips.filter(c => c.missing);
    return { chips, partial: missing.length > 0, missingKeys: missing.map(c => c.key) };
}

// §3 default sort: damage descending, then a divider, then the undamaged
// block ranked by |weight_gap_pp| descending so the largest conviction
// mismatches lead it. Rows with neither key sort last, in weight order.
export function sortDocket(rows, keyOf) {
    const k = keyOf || (r => r.judged || {});
    const damaged = [], clean = [];
    for (const r of rows || []) (num(k(r).damagePp) > 0 ? damaged : clean).push(r);
    damaged.sort((a, b) => num(k(b).damagePp) - num(k(a).damagePp));
    clean.sort((a, b) => {
        const ag = num(k(a).weightGapPp), bg = num(k(b).weightGapPp);
        if (ag == null && bg == null) return (num(k(b).actualWeightPct) || 0) - (num(k(a).actualWeightPct) || 0);
        if (ag == null) return 1;
        if (bg == null) return -1;
        return Math.abs(bg) - Math.abs(ag);
    });
    return { damaged, clean, dividerLabel: 'No drawdown damage · ' + clean.length + ' holdings · ranked by conviction gap' };
}

// ── Census strip (§2 item 8) ──────────────────────────────────
// Four legacy cross-module panels collapse into one strip. Every row is a
// docket filter, so the census is a control surface rather than a readout.
// Unknown inputs get their own bucket instead of being folded into a
// plausible-looking one.
const QUALITY_TONE = { A: 'good', 'A-': 'good', 'B+': 'cyan', B: 'warn', 'B-': 'warn', C: 'bad', D: 'bad', F: 'bad' };
const SIGNAL_BUCKET_TONE = { long: 'good', bull: 'good', buy: 'good', hold: 'cyan', neutral: 'cyan', short: 'bad', wary: 'warn', sell: 'bad' };

function tally(rows, pick) {
    const counts = new Map();
    for (const r of rows) {
        const raw = pick(r);
        const k = raw == null || raw === '' ? 'unknown' : String(raw).trim();
        counts.set(k, (counts.get(k) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function buildCensus(docket) {
    const rows = docket || [];
    const n = rows.length;
    if (!n) return null;
    const col = (key, title, entries, field, toneOf) => {
        const top = entries.slice(0, 4);
        const max = top.length ? top[0][1] : 1;
        return {
            key, title, sub: n + ' pos',
            rows: top.map(([label, count]) => ({
                key: field + ':' + label, label, count,
                barPct: Math.round((count / (max || 1)) * 100),
                tone: label === 'unknown' ? 'none' : (toneOf(label) || 'cyan'),
                filter: { field, value: label },
            })),
        };
    };
    // VaR is a magnitude ranking, not a tally — the top four risk consumers,
    // each filtering the docket to that one name.
    const byVar = rows
        .filter(r => num(r.varPct) != null)
        .sort((a, b) => Math.abs(num(b.varPct)) - Math.abs(num(a.varPct)))
        .slice(0, 4);
    const varMax = byVar.length ? Math.abs(num(byVar[0].varPct)) : 1;
    const varCol = {
        key: 'var', title: 'VaR contribution', sub: 'top 4',
        rows: byVar.map(r => {
            const v = Math.abs(num(r.varPct));
            return {
                key: 'tk:' + r.tk, label: r.tk, count: v.toFixed(1) + '%',
                barPct: Math.round((v / (varMax || 1)) * 100),
                tone: v >= varMax * 0.9 ? 'bad' : 'warn',
                filter: { field: 'tk', value: r.tk },
            };
        }),
    };
    return [
        col('quality', 'Quality', tally(rows, r => (r.judged || {}).quality), 'quality', l => QUALITY_TONE[l.toUpperCase()]),
        varCol,
        col('quant', 'Quant signal', tally(rows, r => (r.signals || {}).quant), 'quant', l => SIGNAL_BUCKET_TONE[l.toLowerCase()]),
        col('technical', 'Technical', tally(rows, r => (r.signals || {}).technical), 'technical', l => SIGNAL_BUCKET_TONE[l.toLowerCase()]),
    ];
}

// Applying a census filter to the docket. 'unknown' matches exactly the rows
// whose input was absent — the bucket is selectable, not decorative.
export function applyCensusFilter(docket, filter) {
    if (!filter) return docket || [];
    const val = String(filter.value);
    const read = r => {
        if (filter.field === 'tk') return r.tk;
        if (filter.field === 'quality') return (r.judged || {}).quality;
        if (filter.field === 'quant') return (r.signals || {}).quant;
        if (filter.field === 'technical') return (r.signals || {}).technical;
        return null;
    };
    return (docket || []).filter(r => {
        const v = read(r);
        return val === 'unknown' ? (v == null || v === '') : String(v).trim() === val;
    });
}

// ── Sleeve headroom rail (§5.4) ───────────────────────────────
// Rail renders sleeves under HEADROOM_RAIL_PP of headroom, plus any sleeve
// named by an open ruling. Everything else collapses to a count, so a rail of
// twelve near-empty gauges never buries the one that actually binds.
export const SLEEVE_TIGHT_PP = 3.0;
export const HEADROOM_RAIL_PP = 20.0;

export function buildHeadroomRail(sleeves, namedSleeves) {
    const all = (sleeves || []).filter(s => s && s.sleeve);
    if (!all.length) return null;
    const named = new Set((namedSleeves || []).filter(Boolean));
    const shown = all
        .filter(s => num(s.headroomPp) != null && (num(s.headroomPp) < HEADROOM_RAIL_PP || named.has(s.sleeve)))
        .sort((a, b) => num(a.headroomPp) - num(b.headroomPp))
        .map(s => {
            const cap = num(s.capPct) || 30;
            const w = num(s.weightPct) || 0;
            const hp = num(s.headroomPp);
            return {
                ...s, capPct: cap,
                fillPct: Math.max(0, Math.min(100, (w / cap) * 100)),
                tone: hp <= 0 ? 'breach' : hp < SLEEVE_TIGHT_PP ? 'tight' : 'ok',
                label: w.toFixed(1) + '% · ' + (hp <= 0 ? Math.abs(hp).toFixed(1) + 'pp over' : hp.toFixed(1) + 'pp left'),
            };
        });
    const hidden = all.length - shown.length;
    return { capPct: shown.length ? shown[0].capPct : 30, sleeves: shown, hidden };
}

// §6.3 headroom is a hard gate. A recruit is PERMITTED, QUEUED or BLOCKED,
// and a block always names its reason. QUEUED is the interesting state: the
// headroom does not exist yet but a pending ruling will create it.
export function gateRecruit(recruit, sleeves, pendingRulings) {
    const need = num(recruit && recruit.sizePp);
    const sleeveName = recruit && recruit.sleeve;
    const s = (sleeves || []).find(x => x.sleeve === sleeveName);
    if (!s || num(s.headroomPp) == null) {
        return { state: 'blocked', reason: 'no headroom reading for ' + (sleeveName || 'unknown sleeve') };
    }
    const have = num(s.headroomPp);
    if (need == null) return { state: 'blocked', reason: 'recruit has no size' };
    if (have >= need) return { state: 'permitted', reason: have.toFixed(1) + 'pp available in ' + sleeveName };
    // Would a ruling in flight create the room?
    const freeing = (pendingRulings || []).filter(r => r.sleeve === sleeveName && num(r.freesPp) > 0);
    const wouldHave = have + freeing.reduce((a, r) => a + num(r.freesPp), 0);
    if (freeing.length && wouldHave >= need) {
        const behind = freeing.map(r => r.tk + (r.stage ? ' stage ' + r.stage : '')).join(', ');
        return {
            state: 'queued',
            reason: 'queued behind ' + behind,
            detail: have.toFixed(1) + 'pp now → ' + wouldHave.toFixed(1) + 'pp after, needs ' + need.toFixed(1) + 'pp',
        };
    }
    return {
        state: 'blocked',
        reason: sleeveName + ' has ' + have.toFixed(1) + 'pp, recruit needs ' + need.toFixed(1) + 'pp'
            + (freeing.length ? ' — pending rulings free only ' + (wouldHave - have).toFixed(1) + 'pp' : ' and no pending ruling would create it'),
    };
}

// ── Contribution waterfall (6.1) ──────────────────────────────
// Carriers as green cliffs, passengers as one grey shelf, detractors
// as red teeth, net marker, concentration rail over the carriers.
// A carrier is a positive contributor pulling meaningful freight
// (≥ 8% of total positive contribution, max 6 named); the rest of
// the positives collapse into the shelf. Detractors render singly.
export function buildWaterfall(rows) {
    const all = rows || [];
    const R = all.filter(r => num(r.contrib) != null).map(r => ({ tk: r.tk, contrib: Number(r.contrib) }));
    // Names with no measurable contribution are counted, not dropped. A bar
    // chart that quietly spans 76% of the book reads as if it spans all of it.
    const missing = all.filter(r => num(r.contrib) == null);
    const omitted = missing.length
        ? {
            n: missing.length,
            weightPct: +missing.reduce((a, r) => a + (num(r.weightPct) || 0), 0).toFixed(2),
            reason: missing.find(r => r.contribReason)?.contribReason || null,
        }
        : null;
    if (!R.length) return omitted ? { bars: [], net: null, concentration: null, omitted } : null;
    const pos = R.filter(r => r.contrib > 0).sort((a, b) => b.contrib - a.contrib);
    const neg = R.filter(r => r.contrib < 0).sort((a, b) => a.contrib - b.contrib);
    const posTotal = pos.reduce((a, r) => a + r.contrib, 0);
    const negTotal = neg.reduce((a, r) => a + r.contrib, 0);
    const carriers = pos.filter((r, i) => i < 6 && posTotal > 0 && r.contrib >= posTotal * 0.08);
    const passengers = pos.slice(carriers.length);
    const passengersNet = passengers.reduce((a, r) => a + r.contrib, 0);
    // Detractors collapse the same way carriers do. Drawing all ~30 negatives
    // individually crushed the axis into unreadable overlapping labels; the
    // named teeth are the ones that actually cost you something.
    const teeth = neg.filter((r, i) => i < 6 && negTotal < 0 && r.contrib <= negTotal * 0.08);
    const tail = neg.slice(teeth.length);
    const tailNet = tail.reduce((a, r) => a + r.contrib, 0);
    const net = R.reduce((a, r) => a + r.contrib, 0);

    // Bar sequence with running offsets (start → end of each segment).
    const bars = [];
    let cum = 0;
    for (const c of carriers) { bars.push({ kind: 'carrier', tk: c.tk, value: c.contrib, from: cum, to: cum + c.contrib }); cum += c.contrib; }
    if (passengers.length) { bars.push({ kind: 'shelf', tk: passengers.length + ' small', value: passengersNet, from: cum, to: cum + passengersNet }); cum += passengersNet; }
    for (const d of teeth) { bars.push({ kind: 'detractor', tk: d.tk, value: d.contrib, from: cum, to: cum + d.contrib }); cum += d.contrib; }
    if (tail.length) { bars.push({ kind: 'tail', tk: tail.length + ' small', value: tailNet, from: cum, to: cum + tailNet }); cum += tailNet; }

    const carrierSum = carriers.reduce((a, r) => a + r.contrib, 0);
    return {
        bars, net: +net.toFixed(3),
        concentration: carriers.length && posTotal > 0
            ? { names: carriers.length, pctOfPositive: Math.round((carrierSum / posTotal) * 100) }
            : null,
        omitted,
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
    // updates (and from the last update to the window end), clipped to the
    // visible window — a silence that began before the window still washes
    // from the window's left edge instead of vanishing off-canvas.
    const sorted = (thesisDates || []).map(t => String(t).slice(0, 10)).sort();
    const silences = [];
    const pushSilence = (fromIso, toIso) => {
        const from = Date.parse(fromIso), to = Date.parse(toIso);
        if (!isFinite(from) || !isFinite(to) || (to - from) / DAY_MS < THESIS_STALE_DAYS) return;
        let a = new Date(from + THESIS_STALE_DAYS * DAY_MS).toISOString().slice(0, 10);
        let b = toIso;
        if (windowStart && a < windowStart) a = windowStart;
        if (windowEnd && b > windowEnd) b = windowEnd;
        if (a < b) silences.push({ from: a, to: b });
    };
    for (let i = 1; i < sorted.length; i++) pushSilence(sorted[i - 1], sorted[i]);
    if (sorted.length && windowEnd) pushSilence(sorted[sorted.length - 1], windowEnd);
    // never updated at all → the whole window is silent
    if (!sorted.length && windowStart && windowEnd) silences.push({ from: windowStart, to: windowEnd });
    return { claimMarks, ticks, silences };
}

// ── Cortex signal check — leveraged, not duplicated ───────────
// The Bench's signal column reads the ACTUAL Cortex hub taxonomy
// (Thesis Extender / Gap Filler / Risk Flag with relevance), not a
// parallel vocabulary. cortex_signals.candidates arrives DOUBLE-ENCODED
// (a JSON string inside jsonb) — parse defensively, never iterate the
// raw value (for..of over a string walks characters and matches nothing).
export function parseCortexCandidates(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
}

// symbol → [{class, title, relevance, stance}] for held names. A signal
// attaches when its candidates name the ticker, or (risk flags) when the
// title names the holding's company. stance: risk = contradicting,
// thesis = confirming, gap = adjacent.
const CORTEX_STANCE = { risk: 'contradict', thesis: 'confirm', gap: 'adjacent' };

export function mapCortexToHoldings(signals, holdings) {
    const out = new Map();
    const push = (tk, sig) => {
        if (!out.has(tk)) out.set(tk, []);
        const arr = out.get(tk);
        if (!arr.some(s => s.title === sig.title)) arr.push(sig);
    };
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(inc|corp|corporation|ltd|plc|co|group|holdings?)\b/g, '').trim();
    for (const sig of signals || []) {
        if (sig.is_muted) continue;
        const entry = {
            class: sig.signal_class || 'thesis',
            title: sig.title || '',
            relevance: num(sig.relevance),
            stance: CORTEX_STANCE[sig.signal_class] || 'adjacent',
        };
        const cands = parseCortexCandidates(sig.candidates);
        const candTks = new Set(cands.map(c => c && c.ticker).filter(Boolean));
        for (const h of holdings || []) {
            if (candTks.has(h.tk)) { push(h.tk, entry); continue; }
            // risk flags carry the company name in the title, not a ticker
            if (sig.signal_class === 'risk' && h.name) {
                const nm = norm(h.name);
                if (nm && norm(sig.title).includes(nm)) push(h.tk, entry);
            }
        }
    }
    return out;
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

// ── Capital circulation (§6) ──────────────────────────────────
// Three surfaces used to issue trade recommendations independently and could
// therefore disagree. The contract: the Bench owns every sell, the ledger owns
// every buy candidate, and this footer only joins them — it holds no opinion
// of its own.

// §6.1 A trim is a verdict outcome, never an independent signal. ON WATCH
// with a size breach trims back to target; CUT stages the full position. No
// other verdict emits a sell.
export function sellsFromVerdicts(rows) {
    const sells = [];
    for (const r of rows || []) {
        const v = r.verdict;
        const gap = num(r.weightGapPp);
        const wt = num(r.weightPct);
        if (v === 'cut') {
            sells.push({ kind: 'exit', tk: r.tk, sleeve: r.theme || null, freesPp: wt, reason: r.reason || 'thesis failed on the evidence' });
        } else if (v === 'watch' && gap != null && gap >= WEIGHT_GAP_PP) {
            // sized to bring the position back to target, not to zero — the
            // problem is size, not story
            sells.push({ kind: 'trim', tk: r.tk, sleeve: r.theme || null, freesPp: +gap.toFixed(2), reason: 'size breach: ' + gap.toFixed(2) + 'pp over conviction target' });
        }
    }
    return sells;
}

// §6.2 The circulation identity. residual returns to cash and is rendered as
// such — there is no forced deployment. A page that must spend everything it
// raises will manufacture a recruit, which is the failure mode this whole
// structure exists to prevent.
export function buildCirculation({ sells, ledger, sleeves, navUsd }) {
    const sources = sells || [];
    const availablePp = +sources.reduce((a, s) => a + (num(s.freesPp) || 0), 0).toFixed(2);
    // Rulings in flight, keyed by the sleeve they would free room in.
    const pending = sources.map(s => ({ sleeve: s.sleeve, tk: s.tk, freesPp: num(s.freesPp), stage: s.stage || null }));
    const candidates = (ledger || [])
        .filter(l => l.fit === 'additive' && !l.held)
        .slice(0, 6);
    let remaining = availablePp;
    const uses = candidates.map(l => {
        // A recruit is sized by what is left, capped at the sleeve's room.
        const want = num(l.sizePp) != null ? num(l.sizePp) : Math.min(remaining, 2.0);
        const gate = gateRecruit({ sleeve: l.theme || l.sleeve || null, sizePp: want }, sleeves, pending);
        const deployed = gate.state === 'permitted' ? Math.max(0, Math.min(want, remaining)) : 0;
        if (deployed > 0) remaining = +(remaining - deployed).toFixed(2);
        // Headroom permits it but there is nothing left to spend. That is a
        // different state from an approval, and saying "PERMITTED · 0.00pp"
        // would read as one.
        const starved = gate.state === 'permitted' && deployed < want;
        return {
            tk: l.tk, sleeve: l.theme || l.sleeve || null,
            wantPp: want != null ? +want.toFixed(2) : null,
            deployedPp: +deployed.toFixed(2),
            gate: deployed === 0 && starved ? 'unfunded' : gate.state,
            partial: starved && deployed > 0,
            reason: starved
                ? (deployed > 0
                    ? 'partially funded — ' + deployed.toFixed(2) + 'pp of ' + want.toFixed(2) + 'pp available'
                    : 'headroom available, but freed capital is exhausted')
                : gate.reason,
            detail: gate.detail || null,
            fvGapPct: num(l.fvGapPct),
        };
    });
    const deployedPp = +uses.reduce((a, u) => a + u.deployedPp, 0).toFixed(2);
    const residualPp = +(availablePp - deployedPp).toFixed(2);
    const usd = pp => (num(navUsd) == null ? null : Math.round((pp / 100) * navUsd));
    return {
        sources, uses,
        availablePp, deployedPp, residualPp,
        availableUsd: usd(availablePp), deployedUsd: usd(deployedPp), residualUsd: usd(residualPp),
        blocked: uses.filter(u => u.gate === 'blocked').length,
        queued: uses.filter(u => u.gate === 'queued').length,
        // residual is cash, stated as cash. Never redistributed to make the
        // identity look tidy.
        residualNote: residualPp > 0 ? 'returns to cash — no forced deployment' : null,
    };
}

// ── Diagnostics strip (7) ─────────────────────────────────────
// The bench audits itself: every input's health is a visible line,
// "never fired" is a warning on screen, not a hidden state.
export function benchDiagnostics({ fvTrusted = null, fvTotal = null, fvReasons = null, writerLastRun = null, writerRows = 0, claimsAvailable = false, contributionBasis = 'today-only', sleeveUnresolved = false, navCoveragePct = null, contribUncovered = 0, nowIso = null }) {
    const items = [];
    if (fvTotal != null) {
        // A bare "0/54" tells you nothing actionable. nexus_holdings.fv_untrust_reason
        // says WHY — stale valuations read differently from single-method ones,
        // and only one of them is fixed by re-running the valuation pipeline.
        const top = (fvReasons || []).slice()
            .sort((a, b) => b.n - a.n)
            .slice(0, 2)
            .map(r => r.n + ' ' + r.reason)
            .join(', ');
        items.push({
            key: 'fv',
            label: 'fv_trustworthy ' + (fvTrusted ?? 0) + '/' + fvTotal + (top ? ' — ' + top : ''),
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
    // Coverage is a first-class diagnostic, not a footnote. Contribution is
    // computed against the names with position history only, so the strip
    // states that share outright.
    if (contribUncovered > 0) {
        items.push({
            key: 'coverage',
            label: 'contribution covers ' + (navCoveragePct != null ? navCoveragePct + '% of book' : 'part of book')
                 + ' — ' + contribUncovered + ' holdings have no transaction history',
            level: navCoveragePct != null && navCoveragePct < 90 ? 'bad' : 'warn',
        });
    }
    if (sleeveUnresolved) items.push({ key: 'sleeve', label: 'funding sleeve: unresolved', level: 'bad' });
    return items;
}
