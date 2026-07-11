// Volatility dispersion transforms — pure, runs under plain node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    iv30FromChain, basketIv, dispersionRead,
    SECTOR_ETF, SECTOR_BASKETS, MARKET_BASKET, BENCHMARK_MARKET,
} from './nexusDispersionCompute.js';

// Synthetic Alpha Vantage HISTORICAL_OPTIONS rows: session 2026-07-10,
// two expiries at 16 and 44 DTE bracketing 30D. ATM (delta 0.50 / −0.50)
// listed exactly, so the delta interpolation lands on the quoted contract.
const chip = (exp, type, delta, iv) => ({
    date: '2026-07-10', expiration: exp, type, delta: String(delta), implied_volatility: String(iv), strike: '100',
});
const chain = [
    chip('2026-07-26', 'call', 0.62, 0.22), chip('2026-07-26', 'call', 0.50, 0.20), chip('2026-07-26', 'call', 0.38, 0.19),
    chip('2026-07-26', 'put', -0.38, 0.21), chip('2026-07-26', 'put', -0.50, 0.20), chip('2026-07-26', 'put', -0.62, 0.22),
    chip('2026-08-23', 'call', 0.61, 0.26), chip('2026-08-23', 'call', 0.50, 0.24), chip('2026-08-23', 'call', 0.40, 0.23),
    chip('2026-08-23', 'put', -0.40, 0.25), chip('2026-08-23', 'put', -0.50, 0.24), chip('2026-08-23', 'put', -0.61, 0.26),
];

test('iv30FromChain interpolates total variance between bracketing expiries', () => {
    const r = iv30FromChain(chain);
    assert.equal(r.dropReason, null);
    assert.deepEqual(r.expiries, [16, 44]);
    assert.equal(r.asOf, '2026-07-10');
    // tv16 = 0.20²·16 = 0.64, tv44 = 0.24²·44 = 2.5344
    // tv30 = 0.64 + (2.5344−0.64)·(14/28) = 1.5872 → √(1.5872/30)·100 = 23.00
    assert.equal(r.iv30, 23.0);
});

test('iv30FromChain interpolates in delta when ATM is not listed', () => {
    const skewed = [
        chip('2026-07-26', 'call', 0.60, 0.24), chip('2026-07-26', 'call', 0.40, 0.20),
        chip('2026-08-23', 'call', 0.60, 0.24), chip('2026-08-23', 'call', 0.40, 0.20),
    ];
    const r = iv30FromChain(skewed);
    // Midpoint of the 0.60/0.40 bracket → 0.22 flat term → 22 vol pts.
    assert.equal(r.iv30, 22.0);
    assert.equal(r.dropReason, null);
});

test('iv30FromChain refuses a chain with no near-the-money quotes', () => {
    const deepItm = [
        chip('2026-07-26', 'call', 0.95, 0.30), chip('2026-08-23', 'call', 0.93, 0.31),
    ];
    assert.equal(iv30FromChain(deepItm).dropReason, 'chain_too_thin');
});

test('iv30FromChain accepts a lone expiry only near 30D', () => {
    const near = [chip('2026-08-06', 'call', 0.50, 0.25), chip('2026-08-06', 'put', -0.50, 0.27)]; // 27 DTE
    assert.equal(iv30FromChain(near).iv30, 26.0);
    const far = [chip('2026-07-24', 'call', 0.50, 0.25), chip('2026-07-24', 'put', -0.50, 0.27)]; // 14 DTE
    assert.equal(iv30FromChain(far).dropReason, 'no_30d_expiry');
});

test('iv30FromChain skips expiring-week noise and fails loud on empties', () => {
    const expiring = [chip('2026-07-13', 'call', 0.50, 0.80), chip('2026-08-06', 'call', 0.50, 0.25), chip('2026-08-06', 'put', -0.50, 0.27)];
    // 3-DTE contract ignored (minDte), lone 27-DTE expiry read flat.
    assert.equal(iv30FromChain(expiring).iv30, 26.0);
    assert.equal(iv30FromChain([]).dropReason, 'no_listed_options');
    assert.equal(iv30FromChain(null).dropReason, 'no_listed_options');
});

test('basketIv weight-normalises over priced names and counts honestly', () => {
    const { iv, count } = basketIv([
        { tk: 'A', w: 2, iv: 30 }, { tk: 'B', w: 1, iv: 24 }, { tk: 'C', w: 5, iv: null },
    ]);
    assert.equal(iv, 28);       // (30·2 + 24·1) / 3 — the unpriced 5-weight name is out
    assert.equal(count, 2);
    assert.deepEqual(basketIv([{ tk: 'A', w: 1, iv: null }]), { iv: null, count: 0 });
    assert.deepEqual(basketIv([]), { iv: null, count: 0 });
});

// Spread history helper: n sessions ramping so percentiles are predictable.
const hist = (spreads, cc = 25) => spreads.map((s, i) => ({
    date: '2026-01-' + String(i + 1).padStart(2, '0'), spread: s, constituent_count: cc,
}));

test('dispersionRead labels wide / compressed / neutral off own-window percentile', () => {
    const ramp = Array.from({ length: 24 }, (_, i) => 2 + i * 0.25); // rising spread
    const wide = dispersionRead(hist(ramp), 25);
    assert.equal(wide.regime, 'wide');
    assert.ok(wide.pct >= 90);
    assert.ok(wide.ready);

    const fall = dispersionRead(hist(ramp.slice().reverse()), 25);
    assert.equal(fall.regime, 'compressed');
    assert.ok(fall.pct <= 10);

    const flat = dispersionRead(hist(Array(24).fill(4)), 25);
    assert.equal(flat.regime, 'neutral');
    assert.equal(flat.pct, 50); // mid-rank: ties count half
});

test('dispersionRead flags inversion as compressed regardless of percentile', () => {
    const rows = hist([-5, -4, -3, -2, -1.5, -1.4, -1.3, -1.2, -1.1, -1, -0.9, -0.8, -0.7, -0.6, -0.5, -0.45, -0.4, -0.35, -0.3, -0.25, -0.2, -0.15, -0.1, -0.05]);
    const r = dispersionRead(rows, 25);
    // Latest is the HIGHEST value in the window (top percentile) but still ≤0.
    assert.equal(r.regime, 'compressed');
    assert.ok(r.inverted);
    assert.match(r.label, /inverted/i);
});

test('dispersionRead withholds the label until history accrues', () => {
    const r = dispersionRead(hist([3, 4, 5]), 25);
    assert.equal(r.regime, 'building');
    assert.equal(r.pct, null);
    assert.equal(r.spread, 5); // level still shown
    assert.ok(!r.ready);
});

test('dispersionRead surfaces degraded coverage instead of trusting a thin sample', () => {
    const rows = hist(Array.from({ length: 24 }, (_, i) => 2 + i * 0.25));
    rows[rows.length - 1].constituent_count = 12; // < 70% of 25
    const r = dispersionRead(rows, 25);
    assert.ok(r.degraded);
    const ok = dispersionRead(hist(Array.from({ length: 24 }, (_, i) => 2 + i * 0.25), 24), 25);
    assert.ok(!ok.degraded); // 24/25 is fine
});

test('basket definitions stay internally consistent', () => {
    // Every sector basket maps to an ETF benchmark, and vice versa.
    assert.deepEqual(Object.keys(SECTOR_BASKETS).sort(), Object.keys(SECTOR_ETF).sort());
    for (const [sector, members] of Object.entries(SECTOR_BASKETS)) {
        assert.ok(members.length >= 5, sector + ' basket too small');
        for (const m of members) assert.ok(m.tk && m.w > 0, sector + ' member malformed');
    }
    // Market basket is the spec'd 20–30 names, positive weights, no dupes.
    assert.ok(MARKET_BASKET.length >= 20 && MARKET_BASKET.length <= 30);
    assert.equal(new Set(MARKET_BASKET.map(m => m.tk)).size, MARKET_BASKET.length);
    assert.equal(BENCHMARK_MARKET, 'SPY');
});
