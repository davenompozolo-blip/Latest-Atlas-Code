// Options positioning transforms — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainMetrics, optionsRead, termTone, toOptionsModel, entryTiming } from './nexusOptionsCompute.js';

// A synthetic chain: spot ≈ 100. ATM strike 100. 25Δ put = strike 90 (delta
// -0.25), 25Δ call = strike 110 (delta +0.25). Puts bid higher IV → skew.
const front = {
    calls: [
        { strike: 90, iv: 0.34, oi: 200, volume: 50, delta: 0.78 },
        { strike: 100, iv: 0.30, oi: 1000, volume: 400, delta: 0.50 },
        { strike: 110, iv: 0.28, oi: 300, volume: 120, delta: 0.25 },
    ],
    puts: [
        { strike: 90, iv: 0.36, oi: 800, volume: 300, delta: -0.25 },
        { strike: 100, iv: 0.32, oi: 1200, volume: 500, delta: -0.50 },
        { strike: 110, iv: 0.40, oi: 150, volume: 40, delta: -0.80 },
    ],
};

test('chainMetrics computes ATM IV, 25Δ skew, P/C, OI wall', () => {
    const m = chainMetrics(front, null, 100);
    assert.equal(m.dropReason, null);
    // ATM = (call 0.30 + put 0.32) / 2
    assert.equal(m.atmIv, 0.31);
    assert.equal(m.frontIv, 0.31);
    // 25Δ skew = put wing IV (0.36) − call wing IV (0.28)
    assert.equal(m.skew25d, 0.08);
    // P/C OI = (800+1200+150) / (200+1000+300) = 2150/1500
    assert.equal(m.pcOi, 1.43);
    // OI wall: strike 100 carries the most (1000+1200)
    assert.equal(m.oiPeak, 100);
});

test('chainMetrics records term structure from a back chain', () => {
    const back = { calls: [{ strike: 100, iv: 0.26, oi: 100, volume: 10, delta: 0.5 }], puts: [{ strike: 100, iv: 0.27, oi: 100, volume: 10, delta: -0.5 }] };
    const m = chainMetrics(front, back, 100);
    assert.equal(m.backIv, 0.265);
    // front 0.31 > back 0.265 → backwardation
    assert.equal(termTone(m.frontIv, m.backIv), 'backwardation');
});

test('chainMetrics fails loud on no / thin chains', () => {
    assert.equal(chainMetrics(null, null, 100).dropReason, 'no_listed_options');
    assert.equal(chainMetrics({ calls: [], puts: [] }).dropReason, 'no_listed_options');
    // strikes present but no usable IV → too thin
    const thin = { calls: [{ strike: 100, iv: 0, oi: 5, delta: 0.5 }], puts: [{ strike: 100, iv: null, oi: 5, delta: -0.5 }] };
    assert.equal(chainMetrics(thin, null, 100).dropReason, 'chain_too_thin');
});

test('optionsRead rank-based: stressed when IV hot AND skew bid', () => {
    const r = optionsRead({ atm_iv: 0.55, skew_25d: 0.05, iv_rank: 92, skew_rank: 85, rank_ready: true });
    assert.equal(r.tone, 'stressed');
    assert.match(r.because, /percentile/);
});

test('optionsRead rank-based: hedged when skew bid but IV not extreme', () => {
    const r = optionsRead({ atm_iv: 0.30, skew_25d: 0.06, iv_rank: 55, skew_rank: 88, pc_oi: 1.5, rank_ready: true });
    assert.equal(r.tone, 'hedged');
});

test('optionsRead rank-based: complacent when IV low and no skew', () => {
    const r = optionsRead({ atm_iv: 0.15, skew_25d: 0.005, iv_rank: 12, skew_rank: 20, rank_ready: true });
    assert.equal(r.tone, 'complacent');
});

test('optionsRead level fallback while ranks build', () => {
    // rank_ready false → uses absolute IV + skew sign
    const stressed = optionsRead({ atm_iv: 0.50, skew_25d: 0.04, front_iv: 0.50, back_iv: 0.40, rank_ready: false });
    assert.equal(stressed.tone, 'stressed');
    const complacent = optionsRead({ atm_iv: 0.18, skew_25d: 0.0, rank_ready: false });
    assert.equal(complacent.tone, 'complacent');
    const neutral = optionsRead({ atm_iv: 0.30, skew_25d: 0.01, rank_ready: false });
    assert.equal(neutral.tone, 'neutral');
});

test('optionsRead degrades to neutral with no signal', () => {
    assert.equal(optionsRead({}).tone, 'neutral');
    assert.equal(optionsRead(null).tone, 'neutral');
});

test('toOptionsModel: no-chain row carries hasOptions:false + dropReason', () => {
    const m = toOptionsModel({ tk: 'TCEHY', atm_iv: null, drop_reason: 'no_listed_options', stale: false });
    assert.equal(m.hasOptions, false);
    assert.equal(m.dropReason, 'no_listed_options');
});

test('toOptionsModel: live row carries metrics + tone', () => {
    const m = toOptionsModel({ tk: 'NVDA', atm_iv: 0.55, skew_25d: 0.05, iv_rank: 90, skew_rank: 80, pc_oi: 1.2, front_iv: 0.55, back_iv: 0.42, oi_peak_strike: 120, rank_ready: true, stale: false });
    assert.equal(m.hasOptions, true);
    assert.equal(m.tone, 'stressed');
    assert.equal(m.termTone, 'backwardation');
    assert.equal(m.oiPeak, 120);
});

test('entryTiming maps tone → Opportunities chip', () => {
    assert.equal(entryTiming('stressed'), 'stressed');
    assert.equal(entryTiming('hedged'), 'crowded');
    assert.equal(entryTiming('complacent'), 'clean');
    assert.equal(entryTiming('neutral'), 'clean');
});

// Structural: a one-day IV tick within a band mustn't flip the tone (the band
// is wide enough that small moves stay neutral).
test('optionsRead is structural — small IV moves stay neutral', () => {
    const a = optionsRead({ atm_iv: 0.30, skew_25d: 0.01, iv_rank: 50, skew_rank: 50, rank_ready: true });
    const b = optionsRead({ atm_iv: 0.31, skew_25d: 0.012, iv_rank: 52, skew_rank: 51, rank_ready: true });
    assert.equal(a.tone, 'neutral');
    assert.equal(b.tone, 'neutral');
});
