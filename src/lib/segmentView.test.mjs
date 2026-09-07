// node src/lib/segmentView.test.mjs

import assert from 'node:assert/strict';
import {
    buildBetsView, insightSentences, effectiveBets, pp, latestAsOf,
    GROUPING_BET, GROUPING_THEME, DEFAULT_GROUPING, FULL_ROWS,
} from './segmentView.js';

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  pass  ' + name); }

// Real rows from segment_verdicts on 2026-09-07, grouping='theme'. Values are
// stored FRACTIONS, exactly as the table holds them — a fixture that
// pre-multiplied would hide the very bug pp() exists to prevent.
const seg = (o) => Object.assign({
    as_of: '2026-09-07', grouping: 'theme', segment_kind: 'theme',
    members: [], members_measured: 1, members_withheld: 0, withheld_symbols: [],
    cf_status: 'measured', cf_reason: null, verdict_counts: null,
}, o);

const THEME_ROWS = [
    seg({ segment_id: 'theme:AI / accelerated compute', segment_label: 'AI / accelerated compute',
          member_count: 8, members: ['AMD','NVDA','TSM','ASML','MU','SNDK','MRVL','TSLA'],
          members_measured: 8, weight_share: 0.1907, risk_share: 0.3931,
          excess_vs_book_pct: 0.3069, dispersion: 0.7743,
          best_member: 'AMD', best_member_excess_pct: 1.78,
          worst_member: 'TSLA', worst_member_excess_pct: -0.55,
          dispersion_basis: 'tier2:excess_vs_book',
          verdict_counts: { leader: 4, lagging: 2, cut_candidate: 2 } }),
    seg({ segment_id: 'unpaired', segment_label: 'Unpaired', segment_kind: 'unpaired',
          member_count: 17, members_measured: 17, weight_share: 0.2698, risk_share: 0.1968,
          excess_vs_book_pct: -0.1374, dispersion: 0.1414,
          best_member: 'ANF', best_member_excess_pct: 0.31,
          worst_member: 'MRVL', worst_member_excess_pct: -0.29,
          dispersion_basis: 'tier2:excess_vs_book',
          verdict_counts: { leader: 2, lagging: 4, holding_own: 9, cut_candidate: 2 } }),
    seg({ segment_id: 'theme:Fixed income / duration', segment_label: 'Fixed income / duration',
          member_count: 4, members: ['BOND','BSV','SHY','PTRB'], members_measured: 4,
          weight_share: 0.0336, risk_share: 0.0012,
          excess_vs_book_pct: -0.3004, dispersion: 0.0295,
          best_member: 'SHY', best_member_excess_pct: -0.27,
          worst_member: 'PTRB', worst_member_excess_pct: -0.33,
          dispersion_basis: 'tier2:excess_vs_book',
          verdict_counts: { holding_own: 4 } }),
];

// ── the fraction trap ─────────────────────────────────────────
t('stored columns are fractions and pp() is the only place that knows', () => {
    // AMD's selection effect stores 1.604 and means +160.4pp. A surface that
    // renders the raw column shows "+1.6pp" and nobody notices.
    assert.equal(pp(1.604).toFixed(1), '160.4');
    assert.equal(pp(0.4724).toFixed(2), '47.24');
    // Missing must stay missing. A segment that could not be measured must
    // never render as flat.
    assert.equal(pp(null), null);
    assert.equal(pp(undefined), null);
    // But a genuine zero survives — it is a measurement, not an absence.
    assert.equal(pp(0), 0);
});

// ── effective bets follows the grouping ───────────────────────
t('effective bets is computed from the rows on screen, not read from the book', () => {
    // 1/sum(s^2). Two equal bets => exactly 2.
    assert.equal(effectiveBets([{ riskShare: 0.5 }, { riskShare: 0.5 }]), 2);
    // On real shares, against the arithmetic rather than a guessed band —
    // these three rows are 3 of 13, so they do not sum to 1 and any
    // eyeballed range would be a coincidence rather than a check.
    const shares = THEME_ROWS.map(r => r.risk_share);
    const expect = 1 / shares.reduce((t, s) => t + s * s, 0);
    assert.equal(effectiveBets(shares.map(s => ({ riskShare: s }))), expect);
});

t('the two groupings give different effective bets — so it cannot be one stored number', () => {
    const concentrated = effectiveBets([{ riskShare: 0.9 }, { riskShare: 0.1 }]);
    const even = effectiveBets([{ riskShare: 0.34 }, { riskShare: 0.33 }, { riskShare: 0.33 }]);
    assert.ok(concentrated < even);
});

// ── the view ──────────────────────────────────────────────────
t('rows are ranked by risk share and split at eight', () => {
    const many = [];
    for (let i = 0; i < 12; i++) {
        many.push(seg({ segment_id: 's' + i, segment_label: 'S' + i, member_count: 1,
                        weight_share: 0.05, risk_share: (12 - i) / 100 }));
    }
    const v = buildBetsView(many, GROUPING_THEME);
    assert.equal(v.full.length, FULL_ROWS);
    assert.equal(v.tail.length, 4);
    assert.equal(v.segments[0].segmentId, 's0');
    assert.ok(v.segments[0].riskShare > v.segments[1].riskShare);
});

t('the risk strip carries every segment, not just the visible eight', () => {
    const many = [];
    for (let i = 0; i < 12; i++) {
        many.push(seg({ segment_id: 's' + i, segment_label: 'S' + i, member_count: 1,
                        weight_share: 0.05, risk_share: (12 - i) / 100 }));
    }
    const v = buildBetsView(many, GROUPING_THEME);
    // Collapsing the tail must not make the book look more concentrated.
    assert.equal(v.strip.length, 12);
    assert.equal(v.full.length, 8);
});

t('a gated segment is carried with its reason, never dropped', () => {
    const rows = THEME_ROWS.concat([
        seg({ segment_id: 'theme:X', segment_label: 'X', member_count: 1, members: ['KMTUY'],
              members_measured: 0, members_withheld: 1, withheld_symbols: ['KMTUY'],
              weight_share: 0.02, risk_share: 0.01,
              excess_vs_book_pct: null, cf_status: 'no_measured_members',
              cf_reason: 'every member is gated by the return engine' }),
    ]);
    const v = buildBetsView(rows, GROUPING_THEME);
    assert.equal(v.segments.length, 4);
    assert.equal(v.gated.length, 1);
    assert.equal(v.gated[0].cfStatus, 'no_measured_members');
    assert.equal(v.gated[0].excessPp, null, 'a gated segment must not publish an excess');
    assert.equal(v.withheldTotal, 1);
    assert.deepEqual(v.gated[0].withheldSymbols, ['KMTUY']);
});

t('verdict counts are surfaced with their own total so a caller can check them', () => {
    const v = buildBetsView(THEME_ROWS, GROUPING_THEME);
    const ai = v.segments.find(s => s.label === 'AI / accelerated compute');
    // The counts must account for every member. They once summed to 3 on this
    // exact segment of 8, because jsonb_object_agg keeps the last value on a
    // duplicate key.
    assert.equal(ai.labelledCount, ai.memberCount);
    const un = v.segments.find(s => s.kind === 'unpaired');
    assert.equal(un.labelledCount, 17);
});

t('the grouping filter is exclusive — no screen mixes the two', () => {
    const mixed = THEME_ROWS.concat([
        seg({ grouping: 'bet', segment_id: 'cluster:199', segment_label: 'Cluster 199',
              segment_kind: 'cluster', member_count: 8, weight_share: 0.1932, risk_share: 0.4287 }),
    ]);
    const v = buildBetsView(mixed, GROUPING_THEME);
    assert.equal(v.segments.length, 3);
    assert.ok(v.segments.every(s => s.grouping === 'theme'));
});

t('an empty grouping is null, not an empty screen pretending to be a book', () => {
    assert.equal(buildBetsView([], GROUPING_BET), null);
    assert.equal(buildBetsView(THEME_ROWS, GROUPING_BET), null);
});

// ── §2.5 sentences ────────────────────────────────────────────
t('the risk-over-weight sentence fires on the real AI segment', () => {
    const v = buildBetsView(THEME_ROWS, GROUPING_THEME);
    const ai = v.segments.find(s => s.label === 'AI / accelerated compute');
    const first = ai.insights[0];
    assert.equal(first.key, 'risk_over_weight');
    assert.match(first.text, /19\.1% of the book, 39\.3% of the risk/);
});

t('the hedge sentence fires on the bond sleeve', () => {
    const v = buildBetsView(THEME_ROWS, GROUPING_THEME);
    const bonds = v.segments.find(s => s.label === 'Fixed income / duration');
    assert.ok(bonds.insights.some(i => i.key === 'risk_under_weight'));
    assert.match(bonds.insights.find(i => i.key === 'risk_under_weight').text,
        /3\.4% of the book for 0\.1% of the risk/);
});

t('the unpaired sentence names the capital with no story', () => {
    const v = buildBetsView(THEME_ROWS, GROUPING_THEME);
    const un = v.segments.find(s => s.kind === 'unpaired');
    assert.ok(un.insights.some(i => i.key === 'unpaired'));
    assert.match(un.insights.find(i => i.key === 'unpaired').text,
        /27\.0% of capital with no story attached/);
});

t('only the actual widest segment is called the widest', () => {
    // Dispersions 100, 90, 5, 1, 1 -> median 5, so TWO segments (100 and 90)
    // clear 2x the median. Calling both "the widest dispersion in the book"
    // would be false on one of them. Note the shape is load-bearing: with
    // three values the median is the middle one, so the max cannot exceed
    // twice it while a second value also does — a three-row fixture cannot
    // express this case at all.
    const d = { a: 1.00, b: 0.90, c: 0.05, d: 0.01, e: 0.01 };
    const rows = Object.keys(d).map(k => seg({
        segment_id: k, segment_label: k.toUpperCase(), member_count: 3,
        weight_share: 0.1, risk_share: 0.1, dispersion: d[k],
        best_member: 'X', best_member_excess_pct: 1,
        worst_member: 'Y', worst_member_excess_pct: -1,
        dispersion_basis: 'tier2:excess_vs_book',
    }));
    const v = buildBetsView(rows, GROUPING_THEME);
    const clearing = v.segments.filter(s => s.dispersionPp > 2 * 5);
    assert.equal(clearing.length, 2, 'fixture must have two segments clearing the threshold');

    const widest = v.segments.filter(s => s.insights.some(i => i.key === 'dispersion'));
    assert.equal(widest.length, 1);
    assert.equal(widest[0].label, 'A');
});

t('never more than two sentences, in the spec order', () => {
    const s = {
        segmentId: 'z', kind: 'unpaired', label: 'Z', memberCount: 2, members: ['A', 'B'],
        weightShare: 0.30, riskShare: 0.50, returnShare: 0.4,
        dispersionPp: 90, bestMember: 'A', bestMemberPp: 10, worstMember: 'B', worstMemberPp: -10,
    };
    const out = insightSentences(s, { medianDispersionPp: 1, widestSegmentId: 'z' },
        [{ symbol: 'A', excessPp: 0.2, daysHeld: 400 }]);
    assert.equal(out.length, 2);
    assert.equal(out[0].key, 'risk_over_weight');
    assert.equal(out[1].key, 'one_bet');
});

t('the slot-holder sentence needs member rows and stays silent without them', () => {
    const s = {
        segmentId: 'z', kind: 'cluster', label: 'Z', memberCount: 6, members: [],
        weightShare: 0.10, riskShare: 0.10, returnShare: 0.1, dispersionPp: null,
    };
    assert.deepEqual(insightSentences(s, { medianDispersionPp: null, widestSegmentId: null }), []);
    const withMembers = insightSentences(s, { medianDispersionPp: null, widestSegmentId: null },
        [{ symbol: 'UAE', excessPp: 0.4, daysHeld: 220 }]);
    assert.equal(withMembers.length, 1);
    assert.match(withMembers[0].text, /UAE has added \+0\.40pp in 220 days/);
});

t('sub_threshold produces no sentence — the concept is deleted', () => {
    const s = {
        segmentId: 'z', kind: 'cluster', label: 'Z', memberCount: 3, members: [],
        weightShare: 0.10, riskShare: 0.10, returnShare: 0.1, dispersionPp: null,
        sub_threshold: true, subThreshold: true,
    };
    const out = insightSentences(s, { medianDispersionPp: null, widestSegmentId: null });
    assert.ok(out.every(i => i.key !== 'sub_threshold'));
});

t('sentences are deterministic — same rows in, same words out', () => {
    const a = buildBetsView(THEME_ROWS, GROUPING_THEME);
    const b = buildBetsView(THEME_ROWS, GROUPING_THEME);
    assert.deepEqual(a.segments.map(s => s.insights.map(i => i.text)),
                     b.segments.map(s => s.insights.map(i => i.text)));
});

// ── misc ──────────────────────────────────────────────────────
t('the default grouping is BY THEME', () => {
    assert.equal(DEFAULT_GROUPING, GROUPING_THEME);
});

t('latestAsOf picks the newest date', () => {
    assert.equal(latestAsOf([{ as_of: '2026-09-04' }, { as_of: '2026-09-07' }]), '2026-09-07');
    assert.equal(latestAsOf([]), null);
});

console.log('\n' + passed + '/' + passed + ' passed');
