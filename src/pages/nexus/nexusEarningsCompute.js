// ============================================================
// Nexus Earnings intelligence — pure transforms
// ------------------------------------------------------------
// Side-effect-free, IO-free. The endpoint (/api/nexus-earnings)
// fetches the book + Finnhub earnings + daily closes and hands the
// raw pieces here; the panel renders the result. Kept separate so
// the maths is unit-testable under plain node.
//
//   • daysUntil            — calendar days to the print
//   • beatRate             — share of recent quarters that beat
//   • avgEarningsMovePct   — the name's OWN typical post-earnings move
//   • realizedVolPct       — fallback "typical daily move"
//   • expectedMove         — implied magnitude (history-first, vol fallback)
//   • sentimentFromSignals — book signals → bullish/neutral/bearish
//   • buildEarningsRows    — assemble + sort by soonest
// ============================================================

const round1 = v => Math.round(v * 10) / 10;
const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function daysUntil(dateStr, today) {
    if (!dateStr) return null;
    const a = new Date(dateStr + 'T00:00:00Z').getTime();
    const b = new Date((today || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z').getTime();
    return Math.round((a - b) / 86_400_000);
}

// Share of the last `n` quarters whose actual beat the estimate.
// history: Finnhub /stock/earnings rows [{actual, estimate, surprisePercent, period}]
export function beatRate(history, n = 4) {
    const rows = (history || []).filter(r => r && r.actual != null && r.estimate != null).slice(0, n);
    if (!rows.length) return null;
    const beats = rows.filter(r => Number(r.actual) > Number(r.estimate)).length;
    return Math.round((beats / rows.length) * 100);
}

// Most recent reported quarter (prior print).
export function priorPrint(history) {
    const rows = (history || []).filter(r => r && r.actual != null).slice();
    if (!rows.length) return null;
    rows.sort((a, b) => (a.period < b.period ? 1 : -1)); // newest first
    const r = rows[0];
    return { period: r.period, actual: num(r.actual), estimate: num(r.estimate), surprisePct: num(r.surprisePercent) };
}

// The name's OWN typical earnings reaction: |close-to-close move| on the
// first trading day on/after each past earnings date, averaged.
// series: [{t,c}] ascending; dates: ['YYYY-MM-DD', ...]
export function avgEarningsMovePct(series, dates) {
    if (!series || series.length < 2 || !dates || !dates.length) return null;
    const moves = [];
    for (const d of dates) {
        // first trading day strictly after the report (reaction day; most
        // prints land after the close), measured close-to-close.
        const i = series.findIndex(p => p.t > d);
        if (i > 0 && series[i - 1].c > 0) moves.push(Math.abs(series[i].c / series[i - 1].c - 1) * 100);
    }
    if (!moves.length) return null;
    return round1(moves.reduce((s, v) => s + v, 0) / moves.length);
}

// Fallback magnitude: stdev of the last `n` daily returns (a typical day).
export function realizedVolPct(series, n = 20) {
    if (!series || series.length < n + 1) return null;
    const rets = [];
    for (let i = series.length - n; i < series.length; i++) {
        if (series[i - 1].c > 0) rets.push(series[i].c / series[i - 1].c - 1);
    }
    if (!rets.length) return null;
    const m = rets.reduce((s, v) => s + v, 0) / rets.length;
    const varc = rets.reduce((s, v) => s + (v - m) * (v - m), 0) / rets.length;
    return round1(Math.sqrt(varc) * 100);
}

// Implied event magnitude — the name's own earnings history first, a
// vol-based estimate (≈1.6× a normal day) when there's no history.
export function expectedMove(series, earningsDates) {
    const hist = avgEarningsMovePct(series, earningsDates);
    if (hist != null) return { pct: hist, basis: 'history' };
    const vol = realizedVolPct(series, 20);
    if (vol != null) return { pct: round1(vol * 1.6), basis: 'vol' };
    return { pct: null, basis: null };
}

// ── Options-implied earnings move (real IV) ───────────────────
// The first listed expiry on/after the print captures the event; its
// ATM straddle priced against spot is the market's implied move.

// First expiry >= the earnings date (the contract that brackets the event).
export function pickEarningsExpiry(expiries, earningsDate) {
    if (!Array.isArray(expiries) || !expiries.length || !earningsDate) return null;
    const after = expiries.filter(d => d && d >= earningsDate).sort();
    return after.length ? after[0] : null;
}

// ATM straddle / spot → implied move %. chain = { calls:[{strike,bid,ask,last}],
// puts:[...] }. Uses bid/ask mid (last as fallback); the ATM strike must be
// listed on BOTH legs. Guards against junk quotes (non-finite, ≤0, absurd).
export function atmStraddleMovePct(chain, spot) {
    if (!chain || !spot || spot <= 0) return null;
    const calls = chain.calls || [], puts = chain.puts || [];
    if (!calls.length || !puts.length) return null;
    const putStrikes = new Set(puts.map(p => p.strike));
    const strikes = calls.map(c => c.strike).filter(k => putStrikes.has(k));
    if (!strikes.length) return null;
    const atm = strikes.reduce((a, k) => (Math.abs(k - spot) < Math.abs(a - spot) ? k : a), strikes[0]);
    const mid = q => (q && q.bid != null && q.ask != null && q.ask > 0) ? (q.bid + q.ask) / 2 : (q && q.last != null ? q.last : null);
    const cm = mid(calls.find(c => c.strike === atm));
    const pm = mid(puts.find(p => p.strike === atm));
    if (cm == null || pm == null) return null;
    const move = ((cm + pm) / spot) * 100;
    return (isFinite(move) && move > 0 && move < 80) ? round1(move) : null;
}

// Book signals → a single sentiment read for the name/theme.
export function sentimentFromSignals(row) {
    const s = `${row.quant_signal || ''} ${row.valuation_signal || ''} ${row.technical_signal || ''}`.toLowerCase();
    if (/bull|long|cheap|improv|upgrade|accumulat|buy|add/.test(s)) return { tone: 'bullish', label: 'Bullish' };
    if (/bear|rich|deterior|downgrade|sell|trim|reduce/.test(s)) return { tone: 'bearish', label: 'Bearish' };
    return { tone: 'neutral', label: 'Neutral' };
}

// Assemble one display row from a holding + its Finnhub history/calendar + daily series.
export function buildEarningsRow(holding, parts, today) {
    const cal = parts.calendar || {};      // { date, epsEstimate, revenueEstimate, hour }
    const hist = parts.history || [];       // /stock/earnings rows
    const series = parts.series || [];      // [{t,c}]
    const date = cal.date || holding.next_earnings_date || null;
    const prior = priorPrint(hist);
    // Prefer the real options-implied move (ATM straddle) when the endpoint
    // priced one; otherwise fall back to the name's history / realized-vol proxy.
    const em = (parts.optionsMovePct != null)
        ? { pct: round1(parts.optionsMovePct), basis: 'iv' }
        : expectedMove(series, (hist || []).map(r => r && r.period).filter(Boolean));
    const sent = sentimentFromSignals(holding);
    return {
        tk: holding.symbol,
        theme: holding.sector || 'Unclassified',
        date,
        hour: cal.hour || null,
        daysUntil: daysUntil(date, today),
        consensusEps: num(cal.epsEstimate),
        priorActual: prior ? prior.actual : null,
        priorEstimate: prior ? prior.estimate : null,
        priorSurprisePct: prior ? prior.surprisePct : null,
        beatRate: beatRate(hist),
        expectedMovePct: em.pct,
        expectedMoveBasis: em.basis,
        sentiment: sent.tone,
        sentimentLabel: sent.label,
        signal: holding.valuation_signal || null,
        conviction: num(holding.conviction_score),
    };
}

// Sort by soonest upcoming; names already reported / undated sink to the bottom.
export function sortRows(rows) {
    return (rows || []).slice().sort((a, b) => {
        const av = a.daysUntil == null || a.daysUntil < 0 ? 9999 : a.daysUntil;
        const bv = b.daysUntil == null || b.daysUntil < 0 ? 9999 : b.daysUntil;
        return av - bv;
    });
}
