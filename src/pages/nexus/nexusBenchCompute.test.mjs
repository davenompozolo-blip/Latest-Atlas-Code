// Bench transforms — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    thesisFreshness, claimsTally, deriveIntegrity, resolveVerdict,
    buildWaterfall, cumulativeFromCloses, themeComposite, buildJaws,
    tapeEvents, buildCirculatory, benchDiagnostics,
    parseCortexCandidates, mapCortexToHoldings,
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
    assert.match(shelf.tk, /2 passengers/);
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
