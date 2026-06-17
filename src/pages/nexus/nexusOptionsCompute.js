// ============================================================
// Nexus Options Positioning — shared pure compute (IO-free)
// ------------------------------------------------------------
// One canonical read, two consumers. Flagship asks "is the market
// flagging downside on a name I hold?"; Opportunities asks "is this
// candidate a clean entry or a crowded one?". Both call the SAME
// optionsRead, so the tone is implemented once even though it's
// evaluated in two places — same signal, two questions. The
// surrounding copy (per consumer) tells you which question you're in.
//
//   • chainMetrics  — raw Alpaca chain(s) → snapshot metrics (used by
//                     the snapshot job). Fails loud: nulls + dropReason.
//   • optionsRead   — metrics row → { tone, because }. The cascade:
//                     stressed | hedged | neutral | complacent.
//                     Rank-based once rank_ready; level + skew sign while
//                     history builds. Structural — a one-day IV tick
//                     mustn't flip the tone.
//   • toOptionsModel — view row → the Flagship holdings[].options block.
//   • entryTiming   — tone → the Opportunities entry chip (clean |
//                     crowded | stressed). Annotates; never reorders.
//
// All unit-tested under plain node (nexusOptionsCompute.test.mjs).
// ============================================================

const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// IV arrives as a fraction (0.30 = 30%). Reject junk: non-finite, ≤0, or absurd
// (>5 ⇒ 500%, a bad quote, matching the IV-surface guard upstream).
const usableIv = v => { const n = num(v); return n != null && isFinite(n) && n > 0 && n <= 5 ? n : null; };

function sum(rows, key) {
    let s = 0, any = false;
    for (const r of rows || []) { const v = num(r[key]); if (v != null) { s += v; any = true; } }
    return any ? s : null;
}

// The strike to read ATM at: nearest listed strike to spot when we have it,
// else the call whose |delta| is closest to 0.50 (delta needs no spot).
function atmStrike(calls, spot) {
    const strikes = (calls || []).map(c => num(c.strike)).filter(k => k != null);
    if (!strikes.length) return null;
    if (spot && spot > 0) return strikes.reduce((a, k) => (Math.abs(k - spot) < Math.abs(a - spot) ? k : a), strikes[0]);
    let best = null, bestD = Infinity;
    for (const c of calls) {
        const d = num(c.delta), k = num(c.strike);
        if (d == null || k == null) continue;
        const dist = Math.abs(Math.abs(d) - 0.5);
        if (dist < bestD) { bestD = dist; best = k; }
    }
    return best != null ? best : strikes[0];
}

// IV at the ATM strike — average the call and put leg when both are listed,
// otherwise whichever side carries a usable quote.
function atmIvOf(chain, spot) {
    if (!chain) return null;
    const calls = chain.calls || [], puts = chain.puts || [];
    const k = atmStrike(calls.length ? calls : puts, spot);
    if (k == null) return null;
    const ci = usableIv((calls.find(c => num(c.strike) === k) || {}).iv);
    const pi = usableIv((puts.find(p => num(p.strike) === k) || {}).iv);
    if (ci != null && pi != null) return (ci + pi) / 2;
    return ci != null ? ci : pi;
}

// IV of the contract whose delta is closest to the target (puts: -0.25,
// calls: +0.25). The 25Δ wing — where the crowd buys protection / lottery.
function wingIv(rows, targetDelta) {
    let best = null, bestD = Infinity;
    for (const r of rows || []) {
        const d = num(r.delta), iv = usableIv(r.iv);
        if (d == null || iv == null) continue;
        const dist = Math.abs(d - targetDelta);
        if (dist < bestD) { bestD = dist; best = iv; }
    }
    // Only trust a wing reading if we actually landed near 25Δ (≤0.18 away).
    return bestD <= 0.18 ? best : null;
}

// Parse raw Alpaca chain(s) → the snapshot metrics. front/back are
// { calls:[{strike,iv,oi,delta,volume}], puts:[...] }; back optional (term
// structure). spot optional (ATM location). Never throws — degrades to nulls
// with a dropReason so the no-chain / thin-chain cases are recorded honestly.
export function chainMetrics(front, back, spot) {
    const empty = { atmIv: null, skew25d: null, pcOi: null, pcVol: null, frontIv: null, backIv: null, oiPeak: null, dropReason: null };
    if (!front || ((!front.calls || !front.calls.length) && (!front.puts || !front.puts.length))) {
        return { ...empty, dropReason: 'no_listed_options' };
    }
    const calls = front.calls || [], puts = front.puts || [];
    const atmIv = atmIvOf(front, spot);
    if (atmIv == null) return { ...empty, dropReason: 'chain_too_thin' };

    const callWing = wingIv(calls, 0.25);
    const putWing = wingIv(puts, -0.25);
    const skew25d = (callWing != null && putWing != null) ? round(putWing - callWing, 4) : null;

    const callOi = sum(calls, 'oi'), putOi = sum(puts, 'oi');
    const callVol = sum(calls, 'volume'), putVol = sum(puts, 'volume');
    const pcOi = (callOi && callOi > 0 && putOi != null) ? round(putOi / callOi, 2) : null;
    const pcVol = (callVol && callVol > 0 && putVol != null) ? round(putVol / callVol, 2) : null;

    // OI wall — the strike carrying the most open interest across both legs.
    const oiByStrike = {};
    for (const r of [...calls, ...puts]) { const k = num(r.strike), o = num(r.oi); if (k != null && o != null) oiByStrike[k] = (oiByStrike[k] || 0) + o; }
    const oiPeak = Object.keys(oiByStrike).length
        ? num(Object.entries(oiByStrike).sort((a, b) => b[1] - a[1])[0][0])
        : null;

    const backIv = back ? atmIvOf(back, spot) : null;

    return {
        atmIv: round(atmIv, 4),
        skew25d,
        pcOi, pcVol,
        frontIv: round(atmIv, 4),
        backIv: round(backIv, 4),
        oiPeak,
        dropReason: null,
    };
}

// ── The read ─────────────────────────────────────────────────
// Default thresholds (overridable via config for tests / tuning). IV is a
// fraction; skew is in fraction-of-vol (0.03 ≈ 3 vol points of put-over-call).
const CFG = {
    ivRankHi: 80, ivRankLo: 20, skewRankHi: 72,
    ivHi: 0.45, ivLo: 0.22, skewHi: 0.03, pcOiHi: 1.3, termBackwardation: 1.05,
};

const pctOf = v => (v == null ? '—' : Math.round(v * 100) + '%');
const volPts = v => (v == null ? null : (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(1) + ' vol-pts');
const ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

// Metrics row → { tone, because }. Context-neutral `because` grounded in the
// numbers; each consumer's copy frames it (Flagship as risk, Opportunities as
// entry). Structural cascade: rank-based once rank_ready, level + skew sign
// while ranks build.
export function optionsRead(row, config) {
    const c = { ...CFG, ...(config || {}) };
    const atmIv = num(row && row.atm_iv);
    const skew = num(row && row.skew_25d);
    const ivRank = num(row && row.iv_rank);
    const skewRank = num(row && row.skew_rank);
    const pcOi = num(row && row.pc_oi);
    const front = num(row && row.front_iv), back = num(row && row.back_iv);
    const rankReady = !!(row && row.rank_ready) && ivRank != null;
    const backwardation = front != null && back != null && back > 0 && front > back * c.termBackwardation;

    if (atmIv == null && skew == null && ivRank == null) {
        return { tone: 'neutral', because: 'No options signal yet.' };
    }

    let tone, because;
    if (rankReady) {
        const hot = ivRank >= c.ivRankHi;
        const skewBid = skewRank != null && skewRank >= c.skewRankHi;
        if (hot && (skewBid || backwardation)) {
            tone = 'stressed';
            because = 'IV in the ' + ord(Math.round(ivRank)) + ' percentile' + (skewBid ? ' with downside skew bid' : ' and a front-loaded term') + '.';
        } else if (skewBid && !hot) {
            tone = 'hedged';
            because = 'Downside puts bid up (skew in the ' + ord(Math.round(skewRank)) + ' percentile)' + (pcOi != null && pcOi >= c.pcOiHi ? ', P/C ' + pcOi : '') + ' — crowded protection.';
        } else if (ivRank <= c.ivRankLo && (skewRank == null || skewRank <= 35)) {
            tone = 'complacent';
            because = 'IV in the ' + ord(Math.round(ivRank)) + ' percentile, little downside demand — cheap optionality.';
        } else {
            tone = 'neutral';
            because = 'IV in the ' + ord(Math.round(ivRank)) + ' percentile — no positioning extreme.';
        }
    } else {
        // Level + skew sign while history builds (≈first 30 sessions).
        const hot = atmIv != null && atmIv >= c.ivHi;
        const skewBid = skew != null && skew >= c.skewHi;
        const strongSkew = (skew != null && skew >= c.skewHi * 1.5) || (pcOi != null && pcOi >= c.pcOiHi);
        if (hot && (skewBid || backwardation)) {
            tone = 'stressed';
            because = 'ATM IV ' + pctOf(atmIv) + (skewBid ? ' with puts bid over calls' : ' and a front-loaded term') + '.';
        } else if (strongSkew && !hot) {
            tone = 'hedged';
            because = 'Downside puts bid up (' + (volPts(skew) || 'P/C ' + pcOi) + ') — crowded protection.';
        } else if (atmIv != null && atmIv <= c.ivLo && !skewBid) {
            tone = 'complacent';
            because = 'ATM IV ' + pctOf(atmIv) + ', little downside demand — cheap optionality.';
        } else {
            tone = 'neutral';
            because = atmIv != null ? 'ATM IV ' + pctOf(atmIv) + ' — balanced positioning.' : 'Balanced positioning.';
        }
    }
    return { tone, because };
}

// Term-structure tag from front vs back ATM IV.
export function termTone(front, back) {
    const f = num(front), b = num(back);
    if (f == null || b == null || b <= 0) return null;
    if (f > b * CFG.termBackwardation) return 'backwardation'; // event/stress: near-term bid
    if (b > f * CFG.termBackwardation) return 'contango';      // calm: term slopes up
    return 'flat';
}

// nexus_options view row → the Flagship holdings[].options block.
export function toOptionsModel(row) {
    if (!row) return { hasOptions: false, tone: 'neutral', because: null };
    const hasOptions = num(row.atm_iv) != null;
    if (!hasOptions) {
        return { hasOptions: false, dropReason: row.drop_reason || null, tone: 'neutral', because: null, stale: !!row.stale };
    }
    const { tone, because } = optionsRead(row);
    return {
        atmIv: num(row.atm_iv),
        ivRank: num(row.iv_rank),
        rankReady: !!row.rank_ready,
        skew25d: num(row.skew_25d),
        skewRank: num(row.skew_rank),
        pcOi: num(row.pc_oi),
        pcVol: num(row.pc_vol),
        termTone: termTone(row.front_iv, row.back_iv),
        oiPeak: num(row.oi_peak_strike),
        tone, because,
        hasOptions: true,
        stale: !!row.stale,
    };
}

// Entry framing for Opportunities — the timing chip. Annotates the ledger;
// never reorders it (rank stays own-worthiness). complacent/neutral read as a
// clean entry, hedged as crowded, stressed as stressed.
export function entryTiming(tone) {
    if (tone === 'stressed') return 'stressed';
    if (tone === 'hedged') return 'crowded';
    return 'clean';
}
