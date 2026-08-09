// Bench transforms — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    thesisFreshness, claimsTally, deriveIntegrity, resolveVerdict,
    buildWaterfall, cumulativeFromCloses, themeComposite, buildJaws,
    tapeEvents, buildCirculatory, benchDiagnostics,
    parseCortexCandidates, mapCortexToHoldings,
    thesisClock, weightVsConviction, rVarRead, damageRead, signalCheck, sortDocket,
} from './nexusBenchCompute.js';

const NOW = '2026-07-26T00:00:00Z';

test('thesisFreshness: updated / stale (30d) / silent', () => {
    assert.equal(thesisFreshness('2026-07-20T00:00:00Z', NOW).state, 'updated');
    assert.equal(thesisFreshness('2026-06-01T00:00:00Z', NOW).state, 'stale');
    assert.equal(thesisFreshness(null, NOW).state, 'silent');
    assert.equal(thesisFreshness('garbage', NOW).state, 'silent');
});

test('claimsTally + deriveIntegrity states', () => {
    const c = s => ({ status: s });
    assert.deepEqual(claimsTally([c('confirmed'), c('pending'), c('contradicted')]), { confirmed: 1, contradicted: 1, pending: 1, total: 3 });
    assert.equal(deriveIntegrity([]), null);                                              // no claims → no read
    assert.equal(deriveIntegrity([c('pending'), c('pending')]), 'untested');
    assert.equal(deriveIntegrity([c('confirmed'), c('confirmed'), c('pending')]), 'intact');
    assert.equal(deriveIntegrity([c('confirmed'), c('contradicted'), c('pending')]), 'bending');
    assert.equal(deriveIntegrity([c('contradicted'), c('contradicted'), c('confirmed')]), 'broken');
});

test('resolveVerdict: pending / suspended / ruled / override / aged', () => {
    // no row → pending, never invented
    assert.equal(resolveVerdict(null).state, 'pending');
    // stale price → suspended even when a ruling exists (guardrail)
    assert.equal(resolveVerdict({ verdict: 'cut' }, { priceStale: true }).state, 'suspended');
    // plain model ruling
    const r = resolveVerdict({ verdict: 'stays', thesis_integrity: 'intact', as_of_date: '2026-07-25' }, { nowIso: NOW });
    assert.equal(r.state, 'ruled');
    assert.equal(r.verdict, 'stays');
    assert.equal(r.aged, false);
    // override shows the user's ruling, keeps the model's for the strike-through
    const o = resolveVerdict({ verdict: 'cut', overridden_by_user: true, user_verdict: 'watch', as_of_date: '2026-07-25' }, { nowIso: NOW });
    assert.equal(o.verdict, 'watch');
    assert.equal(o.modelVerdict, 'cut');
    assert.equal(o.overridden, true);
    // old ruling ages visibly
    assert.equal(resolveVerdict({ verdict: 'stays', as_of_date: '2026-07-10' }, { nowIso: NOW }).aged, true);
});

test('buildWaterfall: carriers, shelf, teeth, net, concentration rail', () => {
    const w = buildWaterfall([
        { tk: 'AMD', contrib: 0.5 }, { tk: 'NVDA', contrib: 0.3 },
        { tk: 'P1', contrib: 0.02 }, { tk: 'P2', contrib: 0.01 },
        { tk: 'BABA', contrib: -0.2 },
    ]);
    assert.equal(w.bars[0].tk, 'AMD');
    assert.equal(w.bars[0].kind, 'carrier');
    assert.equal(w.bars[1].tk, 'NVDA');
    const shelf = w.bars.find(b => b.kind === 'shelf');
    assert.match(shelf.tk, /2 small/);
    assert.ok(Math.abs(shelf.value - 0.03) < 1e-9);
    const tooth = w.bars.find(b => b.kind === 'detractor');
    assert.equal(tooth.tk, 'BABA');
    assert.ok(Math.abs(w.net - 0.63) < 1e-9);
    assert.equal(w.concentration.names, 2);
    assert.equal(w.concentration.pctOfPositive, 96);
    // offsets chain: each bar starts where the previous ended
    for (let i = 1; i < w.bars.length; i++) assert.ok(Math.abs(w.bars[i].from - w.bars[i - 1].to) < 1e-9);
    assert.equal(buildWaterfall([]), null);
});

test('buildWaterfall: a long tail of tiny detractors collapses instead of crushing the axis', () => {
    const rows = [{ tk: 'BIG', contrib: 5 }];
    for (let i = 0; i < 30; i++) rows.push({ tk: 'T' + i, contrib: -0.02 });  // the unreadable tail
    rows.push({ tk: 'HURT', contrib: -1.2 });                                  // a real tooth
    const w = buildWaterfall(rows);
    assert.ok(w.bars.length <= 14, 'bar count stays legible, got ' + w.bars.length);
    assert.ok(w.bars.some(b => b.kind === 'detractor' && b.tk === 'HURT'), 'material detractor stays named');
    const tail = w.bars.find(b => b.kind === 'tail');
    assert.match(tail.tk, /small/);
    // collapsing is presentational only — the arithmetic must still close
    const last = w.bars[w.bars.length - 1];
    assert.ok(Math.abs(last.to - w.net) < 1e-9, 'bars must still bridge to net');
});

test('buildWaterfall: unmeasurable names are counted, never silently dropped', () => {
    const w = buildWaterfall([
        { tk: 'AMD', contrib: 0.5, weightPct: 4 },
        { tk: 'BABA', contrib: -0.2, weightPct: 3 },
        // no position history → no measurable contribution
        { tk: 'SNDK', contrib: null, weightPct: 1.76, contribReason: 'no_transaction_history' },
        { tk: 'MU', contrib: null, weightPct: 2.63, contribReason: 'no_transaction_history' },
    ]);
    assert.equal(w.omitted.n, 2);
    assert.equal(w.omitted.weightPct, 4.39);
    assert.equal(w.omitted.reason, 'no_transaction_history');
    // the omission must not distort the drawn arithmetic
    assert.ok(Math.abs(w.net - 0.3) < 1e-9);
    assert.ok(!w.bars.some(b => b.tk === 'SNDK' || b.tk === 'MU'));
    // fully covered → nothing to declare
    assert.equal(buildWaterfall([{ tk: 'AMD', contrib: 0.5, weightPct: 4 }]).omitted, null);
});

test('buildWaterfall: every name unmeasurable returns a declared-empty shape, not null', () => {
    const w = buildWaterfall([
        { tk: 'SNDK', contrib: null, weightPct: 1.76, contribReason: 'no_transaction_history' },
    ]);
    assert.deepEqual(w.bars, []);
    assert.equal(w.net, null);
    assert.equal(w.omitted.n, 1);
});

test('benchDiagnostics: partial contribution coverage is stated on the strip', () => {
    const base = { fvTotal: null, writerRows: 1, writerLastRun: NOW, claimsAvailable: true, contributionBasis: 'view', nowIso: NOW };
    const cov = benchDiagnostics({ ...base, navCoveragePct: 75.87, contribUncovered: 12 }).find(i => i.key === 'coverage');
    assert.equal(cov.level, 'bad');
    assert.match(cov.label, /75\.87% of book/);
    assert.match(cov.label, /12 holdings/);
    // full coverage → no coverage chip at all
    assert.equal(benchDiagnostics({ ...base, navCoveragePct: 100, contribUncovered: 0 }).find(i => i.key === 'coverage'), undefined);
});

test('thesisClock: never renders zero, never infers an entry date', () => {
    const c = thesisClock(null, { state: 'fresh', days: 3 });
    assert.equal(c.state, 'unknown');
    assert.equal(c.label, '—');
    assert.equal(c.sub, 'no entry date');
    assert.equal(c.days, null);                      // not 0 — absent, not new
    assert.equal(thesisClock(217, { state: 'silent' }).label, '217d');
    assert.equal(thesisClock(222, { state: 'stale', days: 44 }).sub, 'stale 44d');
});

test('weightVsConviction: missing conviction abstains rather than averaging', () => {
    const none = weightVsConviction(1.8, null);
    assert.equal(none.state, 'unresolved');
    assert.equal(none.label, '—');
    assert.equal(none.sub, 'no conviction');
    assert.equal(none.gapPp, null);
    // over target -> amber, under -> cyan, inside the band -> flat
    assert.equal(weightVsConviction(1.8, 1.0).tone, 'over');
    assert.equal(weightVsConviction(1.0, 2.4).tone, 'under');
    assert.equal(weightVsConviction(2.00, 2.10).tone, 'flat');
    assert.equal(weightVsConviction(1.8, 1.0).label, '1.8 / 1.0');
    assert.equal(weightVsConviction(1.8, 1.0).sub, '+0.80pp');
});

test('rVarRead: abstains on a null ratio and names why', () => {
    assert.equal(rVarRead(null, -48.4, 0.1).sub, 'VaR below 0.25%');
    assert.equal(rVarRead(null, -48.4, null).sub, 'no component VaR');
    const r = rVarRead(-8.8, -48.4, 5.5);
    assert.equal(r.label, '−8.8×');
    assert.equal(r.sub, '−48.4 / 5.5');
    assert.equal(r.tone, 'neg');
});

test('damageRead: not-underwater renders an em dash, never 0.00pp', () => {
    assert.equal(damageRead(null).label, '—');
    assert.equal(damageRead(0).label, '—');
    assert.equal(damageRead(0.712).label, '0.71pp');   // matches the signed-off mockup
});

test('signalCheck: fixed order, missing input dashes the chip and marks the row partial', () => {
    const c = signalCheck({ signals: { valuation: null, technical: 'WARY' }, judged: { macro: 'HEAD', quality: 'C' } });
    assert.deepEqual(c.chips.map(x => x.key), ['VAL', 'MAC', 'TEC', 'QUA']);
    assert.equal(c.chips[0].missing, true);
    assert.equal(c.chips[0].label, '—');
    assert.equal(c.partial, true);
    assert.deepEqual(c.missingKeys, ['VAL']);
    const full = signalCheck({ signals: { valuation: 'CHEAP', technical: 'WARY' }, judged: { macro: 'HEAD', quality: 'A' } });
    assert.equal(full.partial, false);
    assert.equal(full.chips[0].tone, 'pos');
    assert.equal(full.chips[3].tone, 'pos');           // quality grade A
});

test('sortDocket: damage descending, then undamaged by |weight gap|', () => {
    const r = (tk, damagePp, weightGapPp) => ({ tk, judged: { damagePp, weightGapPp } });
    const { damaged, clean, dividerLabel } = sortDocket([
        r('A', null, 0.2), r('SNDK', 0.71, 0.8), r('B', null, -2.4),
        r('MU', 0.40, -0.1), r('C', null, null),
    ]);
    assert.deepEqual(damaged.map(x => x.tk), ['SNDK', 'MU']);
    // largest conviction mismatch leads the second block; no-gap rows sink
    assert.deepEqual(clean.map(x => x.tk), ['B', 'A', 'C']);
    assert.match(dividerLabel, /No drawdown damage · 3 holdings/);
});

test('cumulativeFromCloses rebases to first close', () => {
    const c = cumulativeFromCloses([{ date: 'd1', close: 100 }, { date: 'd2', close: 110 }, { date: 'd3', close: 99 }]);
    assert.deepEqual(c.map(p => p.v), [0, 10, -1]);
    assert.equal(cumulativeFromCloses([{ date: 'd1', close: 100 }]), null);
});

test('themeComposite: equal-weight peers, self excluded, needs 2+ peers', () => {
    const series = {
        A: [{ date: 'd1', close: 100 }, { date: 'd2', close: 110 }],
        B: [{ date: 'd1', close: 50 }, { date: 'd2', close: 51 }],
        C: [{ date: 'd1', close: 10 }, { date: 'd2', close: 9 }],
    };
    const docket = [{ tk: 'A', theme: 'T' }, { tk: 'B', theme: 'T' }, { tk: 'C', theme: 'T' }];
    const comp = themeComposite(series, docket, 'T', 'C');            // peers = A(+10), B(+2)
    assert.equal(comp[1].v, 6);
    assert.equal(themeComposite(series, [{ tk: 'A', theme: 'T' }, { tk: 'C', theme: 'T' }], 'T', 'C'), null); // 1 peer → no line
});

test('buildJaws: honesty gap, tape-only when story unquantified', () => {
    const tape = [{ d: 'd1', v: 0 }, { d: 'd2', v: 2 }, { d: 'd3', v: 3 }];
    const story = [{ d: 'd1', v: 0 }, { d: 'd2', v: 5 }, { d: 'd3', v: 12 }];
    const j = buildJaws(tape, story);
    assert.equal(j.mode, 'jaws');
    assert.equal(j.gapPpt, 9);                    // story ran +12, tape +3 → the story came true without paying
    assert.equal(j.annotate, true);
    assert.equal(j.tracking, false);
    const t = buildJaws(tape, null);
    assert.equal(t.mode, 'tape-only');
    assert.equal(t.note, 'story unquantified');   // never fabricate the dashed line
    assert.equal(buildJaws(null, story), null);
});

test('tapeEvents: claim marks, thesis ticks, silence washes', () => {
    const ev = tapeEvents({
        claims: [
            { status: 'confirmed', status_changed_at: '2026-06-10T12:00:00Z' },
            { status: 'contradicted', status_changed_at: '2026-07-01T12:00:00Z' },
            { status: 'pending', status_changed_at: null },
        ],
        thesisDates: ['2026-05-01', '2026-07-20'],
        windowStart: '2026-04-27', windowEnd: '2026-07-26',
    });
    assert.deepEqual(ev.claimMarks, [{ d: '2026-06-10', ok: true }, { d: '2026-07-01', ok: false }]);
    assert.deepEqual(ev.ticks, ['2026-05-01', '2026-07-20']);
    // 2026-05-01 → 2026-07-20 is an 80d gap → amber wash starts 30d after the last update
    assert.equal(ev.silences.length, 1);
    assert.equal(ev.silences[0].from, '2026-05-31');
    assert.equal(ev.silences[0].to, '2026-07-20');
    // never updated → whole window silent
    const silent = tapeEvents({ claims: [], thesisDates: [], windowStart: '2026-04-27', windowEnd: '2026-07-26' });
    assert.deepEqual(silent.silences, [{ from: '2026-04-27', to: '2026-07-26' }]);
});

test('tapeEvents: a silence beginning before the window washes from the window edge, not off-canvas', () => {
    // last thesis update long before the window: silence starts update+30d,
    // which predates windowStart → must clip to windowStart, not vanish
    const ev = tapeEvents({ claims: [], thesisDates: ['2026-01-10'], windowStart: '2026-04-27', windowEnd: '2026-07-26' });
    assert.deepEqual(ev.silences, [{ from: '2026-04-27', to: '2026-07-26' }]);
});

test('parseCortexCandidates handles the double-encoded jsonb string', () => {
    assert.deepEqual(parseCortexCandidates('[{"ticker":"BKNG"}]'), [{ ticker: 'BKNG' }]);
    assert.deepEqual(parseCortexCandidates([{ ticker: 'AMGN' }]), [{ ticker: 'AMGN' }]);
    assert.deepEqual(parseCortexCandidates('not json'), []);
    assert.deepEqual(parseCortexCandidates(null), []);
});

test('mapCortexToHoldings: candidates by ticker, risk flags by company name, hub taxonomy kept', () => {
    const holdings = [
        { tk: 'SNDK', name: 'SanDisk Corp' },
        { tk: 'AMGN', name: 'AMGEN Inc' },
        { tk: 'TSM', name: 'Taiwan Semiconductor' },
    ];
    const signals = [
        { signal_class: 'thesis', title: 'Thesis Extender: Healthcare', relevance: 59, candidates: '[{"ticker":"AMGN"}]', is_muted: false },
        { signal_class: 'risk', title: 'Risk Flag: Sandisk Corp', relevance: 13, candidates: '[]', is_muted: false },
        { signal_class: 'gap', title: 'Gap Filler: Communications', relevance: 55, candidates: '[{"ticker":"ANET"}]', is_muted: false },
        { signal_class: 'thesis', title: 'Muted one', relevance: 90, candidates: '[{"ticker":"TSM"}]', is_muted: true },
    ];
    const m = mapCortexToHoldings(signals, holdings);
    assert.equal(m.get('AMGN')[0].stance, 'confirm');
    assert.equal(m.get('AMGN')[0].class, 'thesis');
    assert.equal(m.get('SNDK')[0].stance, 'contradict');   // matched via title company name
    assert.equal(m.get('SNDK')[0].relevance, 13);
    assert.equal(m.get('TSM'), undefined);                  // muted signals never attach
});

test('buildCirculatory: freed pool, recruits from additive non-held ledger, factor shift', () => {
    const c = buildCirculatory(
        [{ tk: 'BABA', weightPct: 1.12, theme: 'China internet' }, { tk: 'RGLD', weightPct: 1.28, theme: 'Precious metals' }],
        [
            { tk: 'HELD', fit: 'additive', held: true, fvGapPct: 30 },
            { tk: 'AR', fit: 'additive', held: false, fvGapPct: 25 },
            { tk: 'TSM', fit: 'redundant', held: false, fvGapPct: 40 },
        ]);
    assert.equal(c.freedPct, 2.4);
    assert.deepEqual(c.recruits.map(r => r.tk), ['AR']);          // additive + not held only
    assert.equal(c.factorShifts.length, 2);
    assert.equal(buildCirculatory([], []), null);
});

test('benchDiagnostics: fv coverage carries the reason, not a bare zero', () => {
    const items = benchDiagnostics({
        fvTrusted: 0, fvTotal: 54,
        fvReasons: [{ reason: 'stale valuations', n: 34 }, { reason: 'no valuation on file', n: 25 }, { reason: 'single method only', n: 3 }],
        writerRows: 0, nowIso: NOW,
    });
    const fv = items.find(i => i.key === 'fv');
    assert.match(fv.label, /0\/54/);
    assert.match(fv.label, /34 stale valuations/);      // the actionable half
    assert.match(fv.label, /25 no valuation on file/);
    assert.ok(!/single method/.test(fv.label));          // only the top two
    assert.equal(fv.level, 'bad');
});

test('benchDiagnostics: never-fired is a visible warning, degraded bases are labelled', () => {
    const items = benchDiagnostics({ fvTrusted: 0, fvTotal: 61, writerRows: 0, claimsAvailable: false, contributionBasis: 'today-only', sleeveUnresolved: false, nowIso: NOW });
    assert.equal(items.find(i => i.key === 'fv').level, 'bad');
    assert.equal(items.find(i => i.key === 'writer').label, 'assessment writer: never fired');
    assert.equal(items.find(i => i.key === 'writer').level, 'bad');
    assert.equal(items.find(i => i.key === 'claims').level, 'warn');
    assert.match(items.find(i => i.key === 'contrib').label, /today only/);
    const ok = benchDiagnostics({ fvTrusted: 40, fvTotal: 61, writerRows: 10, writerLastRun: '2026-07-25T00:00:00Z', claimsAvailable: true, contributionBasis: 'view', nowIso: NOW });
    assert.equal(ok.find(i => i.key === 'writer').level, 'ok');
    assert.equal(ok.find(i => i.key === 'contrib').level, 'ok');
});
