// COT transforms — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pctRank, netSpecPctOi, buildCotMarket, groupByCode, buildCotRows } from './nexusCotCompute.js';

test('pctRank places a value within its history', () => {
    assert.equal(pctRank([0, 10, 20, 30, 40], 40), 100);
    assert.equal(pctRank([0, 10, 20, 30, 40], 0), 20);
    assert.equal(pctRank([], 5), null);
    assert.equal(pctRank([1, 2, 3], null), null);
});

test('netSpecPctOi = (specLong - specShort) / OI', () => {
    const r = { open_interest_all: 1000, noncomm_positions_long_all: 600, noncomm_positions_short_all: 100 };
    assert.equal(netSpecPctOi(r), 50);
    assert.equal(netSpecPctOi({ open_interest_all: 0, noncomm_positions_long_all: 1, noncomm_positions_short_all: 0 }), null);
});

const meta = { code: '088691', label: 'Gold', tickers: ['GDX', 'RGLD'] };
// newest-first; this week extreme-long vs a year mostly flat → high rank.
const rows = [
    { report_date_as_yyyy_mm_dd: '2026-06-09T00:00:00.000', open_interest_all: 1000, noncomm_positions_long_all: 700, noncomm_positions_short_all: 100, comm_positions_long_all: 100, comm_positions_short_all: 700, change_in_noncomm_long_all: 50, change_in_noncomm_short_all: 10 },
    { report_date_as_yyyy_mm_dd: '2026-06-02T00:00:00.000', open_interest_all: 1000, noncomm_positions_long_all: 300, noncomm_positions_short_all: 300 },
    { report_date_as_yyyy_mm_dd: '2026-05-26T00:00:00.000', open_interest_all: 1000, noncomm_positions_long_all: 320, noncomm_positions_short_all: 300 },
];

test('buildCotMarket computes net spec, %OI, WoW, rank, read', () => {
    const m = buildCotMarket(meta, rows);
    assert.equal(m.market, 'Gold');
    assert.deepEqual(m.exposure, ['GDX', 'RGLD']);
    assert.equal(m.date, '2026-06-09');
    assert.equal(m.netSpec, 600);           // 700 - 100
    assert.equal(m.netSpecPctOi, 60);       // 600/1000
    assert.equal(m.netComm, -600);          // 100 - 700 (hedgers short)
    assert.equal(m.wowNet, 40);             // +50 long, +10 short
    assert.equal(m.pctRank, 100);           // highest in the window
    assert.equal(m.read, 'Crowded long');
    assert.equal(m.tone, 'rich');
});

test('crowded short when net %OI sits at the bottom of the range', () => {
    // Current week clearly the lowest across a ~year window → rank ≤ 15.
    const lowRows = [{ report_date_as_yyyy_mm_dd: '2026-06-09', open_interest_all: 1000, noncomm_positions_long_all: 100, noncomm_positions_short_all: 400 }];
    for (let i = 1; i <= 11; i++) {
        lowRows.push({ report_date_as_yyyy_mm_dd: '2026-0' + (i % 6 + 1) + '-01', open_interest_all: 1000, noncomm_positions_long_all: 400 + i, noncomm_positions_short_all: 100 });
    }
    const m = buildCotMarket(meta, lowRows);
    assert.equal(m.read, 'Crowded short');
    assert.equal(m.tone, 'cheap');
});

test('groupByCode buckets and orders newest-first; buildCotRows skips empties', () => {
    const grouped = groupByCode([
        { cftc_contract_market_code: '088691', report_date_as_yyyy_mm_dd: '2026-06-02', open_interest_all: 1000, noncomm_positions_long_all: 300, noncomm_positions_short_all: 300 },
        { cftc_contract_market_code: '088691', report_date_as_yyyy_mm_dd: '2026-06-09', open_interest_all: 1000, noncomm_positions_long_all: 700, noncomm_positions_short_all: 100 },
    ]);
    assert.equal(grouped.get('088691')[0].report_date_as_yyyy_mm_dd, '2026-06-09');
    const out = buildCotRows([meta, { code: 'ZZZ', label: 'None', tickers: [] }], grouped);
    assert.equal(out.length, 1);
    assert.equal(out[0].market, 'Gold');
});
