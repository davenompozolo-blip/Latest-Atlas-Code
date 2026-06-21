// scripts/lib/price-guard.mjs
//
// Data-trust for price ingestion. A vendor price feed can return a distorted
// series for a symbol (e.g. corporate-action / split mis-adjustment on a recent
// spin-off), inflating every bar from day one. Because the inflation is
// internally consistent, a day-over-day jump check can't see it — and a newly
// added symbol has no trusted history to compare against. The only thing that
// catches it is an INDEPENDENT reference.
//
// This is the same principle as the SQL safe-cast layer: never trust a single
// vendor source blindly. Here: validate an Alpaca series' latest close against a
// second, unrelated source (Stooq) before it can corrupt downstream valuations.
// SNDK ($2,185 ≈27×), MU ($1,132 ≈10×) and GEV ($1,109 ≈2×) were all caught by
// exactly this divergence.

// A legit cross-feed difference (Alpaca IEX vs Stooq, timing, last-vs-close) is
// normally <5%. 30% is far above any honest discrepancy yet well below the
// smallest corruption seen (~2×), so it false-positives on nothing real.
export const MAX_DIVERGENCE = 0.30;

// Assess one symbol's latest close against an independent reference.
// Returns { ok, divergence, reason }. When no reference is available we cannot
// validate, so we pass it through as 'no_reference' (don't block legit new
// listings) — the caller decides how loudly to flag that.
export function assessClose(alpacaClose, referenceClose, maxDivergence = MAX_DIVERGENCE) {
  const a = Number(alpacaClose);
  if (!isFinite(a) || a <= 0) return { ok: false, divergence: null, reason: 'invalid_close' };
  const r = Number(referenceClose);
  if (!isFinite(r) || r <= 0) return { ok: true, divergence: null, reason: 'no_reference' };
  const divergence = Math.abs(a / r - 1);
  if (divergence > maxDivergence) {
    return { ok: false, divergence, reason: 'reference_divergence' };
  }
  return { ok: true, divergence, reason: 'validated' };
}

// Independent reference close from Stooq (keyless, not Alpaca, not yfinance).
// US equities are addressed as `${symbol}.us`. Returns a positive number or null
// (null = no reference, never throws — a reference outage must not block a sync).
export async function fetchStooqClose(symbol, fetchImpl = fetch) {
  try {
    const s = String(symbol).toLowerCase();
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(s)}.us&f=sd2t2ohlcv&h&e=csv`;
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const text = await res.text();
    return parseStooqClose(text);
  } catch {
    return null;
  }
}

// Parse the Stooq single-quote CSV. Header:
//   Symbol,Date,Time,Open,High,Low,Close,Volume
// A missing quote comes back with 'N/D' fields -> null.
export function parseStooqClose(csv) {
  if (!csv) return null;
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return null;
  const cols = lines[1].split(',');
  if (cols.length < 7) return null;
  const close = Number(cols[6]);
  return isFinite(close) && close > 0 ? close : null;
}

// Full daily OHLCV history from Stooq (keyless). Returns [{date,open,high,low,
// close,volume}] ascending, or [] on failure. Used to repair symbols whose
// Alpaca series was quarantined — same independent source the guard validates
// against, so the replacement is correct by construction.
export async function fetchStooqHistory(symbol, fetchImpl = fetch) {
  try {
    const s = String(symbol).toLowerCase();
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}.us&i=d`;
    const res = await fetchImpl(url);
    if (!res.ok) return [];
    return parseStooqHistory(await res.text());
  } catch {
    return [];
  }
}

// Parse the Stooq history CSV. Header: Date,Open,High,Low,Close,Volume
export function parseStooqHistory(csv) {
  if (!csv) return [];
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < 5) continue;
    const date = c[0];
    const close = Number(c[4]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isFinite(close) || close <= 0) continue;
    out.push({
      date,
      open:   Number(c[1]),
      high:   Number(c[2]),
      low:    Number(c[3]),
      close,
      volume: c[5] != null && isFinite(Number(c[5])) ? Math.round(Number(c[5])) : 0,
    });
  }
  return out;
}
