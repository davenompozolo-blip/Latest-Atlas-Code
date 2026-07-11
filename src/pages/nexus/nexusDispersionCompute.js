// ============================================================
// Nexus Volatility Dispersion — shared pure compute (IO-free)
// ------------------------------------------------------------
// Single-name-vs-index implied-vol spread as an implied-correlation
// proxy: wide spread → idiosyncratic tape (trust rotation / name
// calls), compressed or inverted → correlation spiking, beta
// dominates (rotation calls are more likely noise). One compute,
// three basket inputs:
//
//   • market    — top SPX names vs the index leg   → Rotation Map badge
//   • portfolio — current holdings vs the index leg → Ledger annotation
//   • sector    — sector large caps vs that sector's SPDR ETF
//                 (Option B: sector-specific benchmark, so the spread
//                 reads intra-sector dispersion, not the structural
//                 vol gap between e.g. tech and staples)
//
//   • iv30FromChain — one day's options chain (Alpha Vantage
//                     HISTORICAL_OPTIONS rows) → 30D ATM IV in vol
//                     points. Interpolates in both dimensions: to ATM
//                     within each expiry (linear in delta around 0.50)
//                     and to 30 days across the two bracketing
//                     expiries (linear in total variance) — never
//                     "closest available called 30D ATM".
//   • basketIv      — [{w, iv}] → weight-normalised basket IV over
//                     the names actually priced + honest count.
//   • dispersionRead — stored spread series → { regime, pct, z,
//                     degraded }. Rank-based vs the basket's OWN
//                     trailing window; gated until enough history.
//
// Sector labels reuse the existing ATLAS taxonomy (assets.sector via
// enrich_assets / nexus_holdings.sector) — deliberately NOT a second
// taxonomy. Basket membership below is a static snapshot (same
// convention as enrich_assets' GICS map); weights are relative and
// re-normalised over priced names, so they only need to be roughly
// right and occasionally refreshed.
//
// All unit-tested under plain node (nexusDispersionCompute.test.mjs).
// ============================================================

const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// IV arrives as a fraction (0.30 = 30%). Reject junk: non-finite, ≤0, or
// absurd (>5 ⇒ 500%), matching the guard in nexusOptionsCompute.
const usableIv = v => { const n = num(v); return n != null && isFinite(n) && n > 0 && n <= 5 ? n : null; };

// ── Benchmark mapping (Option B) ─────────────────────────────
// ATLAS sector label → SPDR sector ETF. Keys are the labels the existing
// enrich_assets GICS map emits ('Healthcare', 'Communication' — not the
// formal GICS spellings), so sector tagging stays one taxonomy.
export const SECTOR_ETF = {
    'Technology':             'XLK',
    'Financials':             'XLF',
    'Energy':                 'XLE',
    'Healthcare':             'XLV',
    'Consumer Discretionary': 'XLY',
    'Consumer Staples':       'XLP',
    'Industrials':            'XLI',
    'Materials':              'XLB',
    'Utilities':              'XLU',
    'Real Estate':            'XLRE',
    'Communication':          'XLC',
};

// The market/portfolio benchmark leg. SPX index options aren't served by
// Alpha Vantage's options endpoints, so the index leg is SPY's 30D ATM IV —
// computed by the SAME iv30 function as every basket name, which keeps the
// spread internally consistent (and ≈ VIX by construction).
export const BENCHMARK_MARKET = 'SPY';

// ── Market basket — top SPX names by index weight ────────────
// Static snapshot of approximate index weights (relative; re-normalised over
// priced names at compute time). Dotted-class tickers (BRK.B) are omitted —
// their option symbology differs per vendor and one ~1.5% name isn't worth a
// silent symbol mismatch.
export const MARKET_BASKET = [
    { tk: 'NVDA', w: 7.5 }, { tk: 'MSFT', w: 6.5 }, { tk: 'AAPL', w: 6.0 },
    { tk: 'AMZN', w: 4.0 }, { tk: 'GOOGL', w: 4.0 }, { tk: 'META', w: 3.0 },
    { tk: 'AVGO', w: 2.5 }, { tk: 'TSLA', w: 2.2 }, { tk: 'LLY', w: 1.5 },
    { tk: 'JPM', w: 1.5 }, { tk: 'V', w: 1.1 }, { tk: 'XOM', w: 1.1 },
    { tk: 'UNH', w: 1.0 }, { tk: 'MA', w: 0.9 }, { tk: 'COST', w: 0.9 },
    { tk: 'HD', w: 0.8 }, { tk: 'PG', w: 0.8 }, { tk: 'WMT', w: 0.8 },
    { tk: 'NFLX', w: 0.8 }, { tk: 'JNJ', w: 0.7 }, { tk: 'ABBV', w: 0.7 },
    { tk: 'CRM', w: 0.6 }, { tk: 'ORCL', w: 0.6 }, { tk: 'BAC', w: 0.6 },
    { tk: 'AMD', w: 0.5 }, { tk: 'KO', w: 0.5 },
];

// ── Sector baskets — large caps per ATLAS sector label ───────
// Weights are rough relative market caps; membership mirrors the
// enrich_assets GICS map so a name never carries two different sectors.
export const SECTOR_BASKETS = {
    'Technology': [
        { tk: 'NVDA', w: 30 }, { tk: 'AAPL', w: 30 }, { tk: 'MSFT', w: 28 },
        { tk: 'AVGO', w: 10 }, { tk: 'ORCL', w: 6 }, { tk: 'CRM', w: 4 },
        { tk: 'AMD', w: 4 }, { tk: 'CSCO', w: 4 },
    ],
    'Financials': [
        { tk: 'JPM', w: 12 }, { tk: 'BAC', w: 6 }, { tk: 'WFC', w: 4 },
        { tk: 'GS', w: 3 }, { tk: 'MS', w: 3 }, { tk: 'BLK', w: 3 },
        { tk: 'AXP', w: 3 }, { tk: 'SCHW', w: 2 },
    ],
    'Energy': [
        { tk: 'XOM', w: 9 }, { tk: 'CVX', w: 5 }, { tk: 'COP', w: 2.5 },
        { tk: 'SLB', w: 1.2 }, { tk: 'EOG', w: 1.4 }, { tk: 'MPC', w: 1.2 },
        { tk: 'PSX', w: 1 }, { tk: 'VLO', w: 0.9 },
    ],
    'Healthcare': [
        { tk: 'LLY', w: 14 }, { tk: 'UNH', w: 9 }, { tk: 'JNJ', w: 7 },
        { tk: 'ABBV', w: 6 }, { tk: 'MRK', w: 5 }, { tk: 'TMO', w: 4 },
        { tk: 'ABT', w: 4 }, { tk: 'AMGN', w: 3 },
    ],
    'Consumer Discretionary': [
        { tk: 'AMZN', w: 20 }, { tk: 'TSLA', w: 12 }, { tk: 'HD', w: 7 },
        { tk: 'MCD', w: 4 }, { tk: 'BKNG', w: 3 }, { tk: 'LOW', w: 3 },
        { tk: 'NKE', w: 2 }, { tk: 'SBUX', w: 2 },
    ],
    'Consumer Staples': [
        { tk: 'WMT', w: 10 }, { tk: 'PG', w: 8 }, { tk: 'COST', w: 8 },
        { tk: 'KO', w: 5 }, { tk: 'PEP', w: 4 }, { tk: 'PM', w: 4 },
        { tk: 'MDLZ', w: 2 }, { tk: 'CL', w: 2 },
    ],
    'Industrials': [
        { tk: 'GE', w: 4 }, { tk: 'CAT', w: 4 }, { tk: 'RTX', w: 3.5 },
        { tk: 'HON', w: 3 }, { tk: 'UNP', w: 3 }, { tk: 'BA', w: 3 },
        { tk: 'DE', w: 2.5 }, { tk: 'LMT', w: 2.5 },
    ],
    'Materials': [
        { tk: 'LIN', w: 5 }, { tk: 'SHW', w: 2 }, { tk: 'APD', w: 1.5 },
        { tk: 'FCX', w: 1.5 }, { tk: 'ECL', w: 1.4 }, { tk: 'NEM', w: 1.2 },
        { tk: 'NUE', w: 0.9 }, { tk: 'DOW', w: 0.8 },
    ],
    'Utilities': [
        { tk: 'NEE', w: 4 }, { tk: 'SO', w: 2.2 }, { tk: 'DUK', w: 2 },
        { tk: 'AEP', w: 1.2 }, { tk: 'SRE', w: 1.2 }, { tk: 'D', w: 1 },
        { tk: 'EXC', w: 0.9 }, { tk: 'XEL', w: 0.8 },
    ],
    'Real Estate': [
        { tk: 'PLD', w: 2.5 }, { tk: 'AMT', w: 2.2 }, { tk: 'EQIX', w: 2 },
        { tk: 'WELL', w: 1.8 }, { tk: 'SPG', w: 1.2 }, { tk: 'PSA', w: 1.1 },
        { tk: 'O', w: 1 }, { tk: 'DLR', w: 1 },
    ],
    'Communication': [
        { tk: 'GOOGL', w: 20 }, { tk: 'META', w: 16 }, { tk: 'NFLX', w: 5 },
        { tk: 'DIS', w: 4 }, { tk: 'TMUS', w: 3 }, { tk: 'CMCSA', w: 3 },
        { tk: 'VZ', w: 3 }, { tk: 'T', w: 2.5 },
    ],
};

// ── 30D ATM IV from one day's chain ──────────────────────────

const DAY_MS = 86_400_000;
const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / DAY_MS);

// ATM IV for one leg of one expiry: linear interpolation in delta across the
// pair bracketing the target (calls +0.50, puts −0.50). Falls back to the
// nearest contract only when it's genuinely near the money (≤0.12 from
// target) — a chain whose closest delta is 0.75 has no ATM to read.
function legAtmIv(rows, targetDelta) {
    const pts = [];
    for (const r of rows) {
        const d = num(r.delta), iv = usableIv(r.implied_volatility != null ? r.implied_volatility : r.iv);
        if (d == null || iv == null) continue;
        pts.push({ d, iv });
    }
    if (!pts.length) return null;
    pts.sort((a, b) => a.d - b.d);
    let lo = null, hi = null;
    for (const p of pts) {
        if (p.d <= targetDelta && (!lo || p.d > lo.d)) lo = p;
        if (p.d >= targetDelta && (!hi || p.d < hi.d)) hi = p;
    }
    if (lo && hi && hi.d > lo.d) {
        const t = (targetDelta - lo.d) / (hi.d - lo.d);
        return lo.iv + t * (hi.iv - lo.iv);
    }
    const nearest = lo || hi;
    return Math.abs(nearest.d - targetDelta) <= 0.12 ? nearest.iv : null;
}

// ATM IV of one expiry: average the call and put reads when both legs
// interpolate, else whichever side does.
function expiryAtmIv(calls, puts) {
    const c = legAtmIv(calls, 0.5);
    const p = legAtmIv(puts, -0.5);
    if (c != null && p != null) return (c + p) / 2;
    return c != null ? c : p;
}

// Alpha Vantage HISTORICAL_OPTIONS `data` rows (one underlying, one session)
// → 30D ATM IV in vol points. Picks the expiries bracketing 30 calendar days
// and interpolates linearly in total variance; a single expiry only counts if
// it sits within `flatTolerance` days of 30. Never throws — nulls + dropReason.
export function iv30FromChain(rows, cfg = {}) {
    const minDte = cfg.minDte != null ? cfg.minDte : 7;    // skip expiring-week gamma noise
    const maxDte = cfg.maxDte != null ? cfg.maxDte : 120;
    const flatTolerance = cfg.flatTolerance != null ? cfg.flatTolerance : 10;
    const empty = { iv30: null, asOf: null, expiries: null, dropReason: null };

    if (!Array.isArray(rows) || !rows.length) return { ...empty, dropReason: 'no_listed_options' };

    // Group by expiry, split legs. Every row carries the session date.
    const byExp = new Map();
    let asOf = null;
    for (const r of rows) {
        const exp = r.expiration, type = r.type;
        if (!exp || (type !== 'call' && type !== 'put')) continue;
        if (!asOf && r.date) asOf = r.date;
        if (!byExp.has(exp)) byExp.set(exp, { calls: [], puts: [] });
        byExp.get(exp)[type === 'call' ? 'calls' : 'puts'].push(r);
    }
    if (!asOf || !byExp.size) return { ...empty, dropReason: 'no_listed_options' };

    // ATM IV per usable expiry.
    const term = [];
    for (const [exp, legs] of byExp) {
        const dte = daysBetween(asOf, exp);
        if (dte < minDte || dte > maxDte) continue;
        const iv = expiryAtmIv(legs.calls, legs.puts);
        if (iv != null) term.push({ dte, iv });
    }
    if (!term.length) return { ...empty, asOf, dropReason: 'chain_too_thin' };
    term.sort((a, b) => a.dte - b.dte);

    // Bracket 30D: nearest at-or-below and nearest above.
    let lo = null, hi = null;
    for (const t of term) {
        if (t.dte <= 30) lo = t;
        if (t.dte > 30 && !hi) hi = t;
    }
    if (lo && hi) {
        // Linear in total variance σ²·t — the standard constant-maturity read.
        const tvLo = lo.iv * lo.iv * lo.dte, tvHi = hi.iv * hi.iv * hi.dte;
        const tv30 = tvLo + (tvHi - tvLo) * ((30 - lo.dte) / (hi.dte - lo.dte));
        if (tv30 <= 0) return { ...empty, asOf, dropReason: 'chain_too_thin' };
        return { iv30: round(Math.sqrt(tv30 / 30) * 100, 2), asOf, expiries: [lo.dte, hi.dte], dropReason: null };
    }
    const only = lo || hi;
    if (Math.abs(only.dte - 30) <= flatTolerance) {
        return { iv30: round(only.iv * 100, 2), asOf, expiries: [only.dte], dropReason: null };
    }
    return { ...empty, asOf, dropReason: 'no_30d_expiry' };
}

// ── Basket aggregation ───────────────────────────────────────
// members: [{ tk, w, iv }] with iv in vol points (null = not priced today).
// Weights re-normalise over the priced subset; count is the honest sample
// size the degraded check reads.
export function basketIv(members) {
    let wSum = 0, acc = 0, count = 0;
    for (const m of members || []) {
        const iv = num(m.iv), w = num(m.w);
        if (iv == null || w == null || w <= 0) continue;
        acc += iv * w; wSum += w; count++;
    }
    if (!count || wSum <= 0) return { iv: null, count: 0 };
    return { iv: round(acc / wSum, 2), count };
}

// ── The regime read ──────────────────────────────────────────
// Default thresholds (overridable for tests / tuning). Percentile is of the
// latest spread vs the basket's OWN trailing window — each basket carries its
// own baseline, per spec.
const CFG = {
    wideAt: 67,          // percentile ≥ → wide
    compressedAt: 33,    // percentile ≤ → compressed
    minObs: 20,          // sessions before the label is trusted
    degradedBelow: 0.7,  // constituent_count under 70% of expected → degraded
};

// rows: [{ date, spread, constituent_count }] ascending for ONE basket.
// expectedCount: the basket's designed size (falls back to max observed).
export function dispersionRead(rows, expectedCount, config) {
    const c = { ...CFG, ...(config || {}) };
    const hist = (rows || []).filter(r => num(r.spread) != null);
    if (!hist.length) {
        return { regime: 'building', label: 'No data', pct: null, z: null, spread: null, inverted: false, degraded: false, ready: false, because: 'No dispersion history yet.' };
    }
    const latest = hist[hist.length - 1];
    const spread = num(latest.spread);
    const vals = hist.map(r => num(r.spread));
    const n = vals.length;

    // Mid-rank percentile: ties count half, so a flat series reads 50th.
    let less = 0, eq = 0;
    for (const v of vals) { if (v < spread) less++; else if (v === spread) eq++; }
    const pct = Math.round(((less + eq / 2) / n) * 100);

    const mean = vals.reduce((a, v) => a + v, 0) / n;
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
    const z = sd > 0 ? round((spread - mean) / sd, 2) : 0;

    const expected = num(expectedCount) || Math.max(...hist.map(r => num(r.constituent_count) || 0));
    const cc = num(latest.constituent_count);
    const degraded = !!(expected && cc != null && cc < Math.ceil(expected * c.degradedBelow));

    const inverted = spread <= 0;
    const ready = n >= c.minObs;
    let regime, because;
    if (!ready) {
        regime = 'building';
        because = 'History building (' + n + '/' + c.minObs + ' sessions) — level shown, label withheld.';
    } else if (inverted) {
        regime = 'compressed';
        because = 'Spread inverted — index vol pricier than single names; correlation spiking, beta dominates.';
    } else if (pct <= c.compressedAt) {
        regime = 'compressed';
        because = 'Spread in the ' + pct + 'th percentile of its window — correlation elevated, macro/beta dominates.';
    } else if (pct >= c.wideAt) {
        regime = 'wide';
        because = 'Spread in the ' + pct + 'th percentile — low implied correlation; idiosyncratic differentiation dominates.';
    } else {
        regime = 'neutral';
        because = 'Spread mid-range (' + pct + 'th percentile) — no correlation extreme.';
    }
    const label = regime === 'building' ? 'Building' : regime.charAt(0).toUpperCase() + regime.slice(1) + (inverted ? ' (inverted)' : '');
    return { regime, label, pct: ready ? pct : null, z: ready ? z : null, spread, inverted, degraded, ready, because };
}
