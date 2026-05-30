// ============================================================
// ATLAS Fundamentals Sync
// ------------------------------------------------------------
// Populates `equity_cache` with Alpha Vantage / Finnhub / Yahoo
// OVERVIEW payloads for every current portfolio holding, so the
// valuation columns (P/E, PEG, Beta, analyst target → DCF upside)
// in vw_screener and vw_nexus_holdings light up.
//
// Strategy: reuse the deployed /api/equity?endpoint=overview
// serverless function (single source of fetch logic), which writes
// fresh rows into equity_cache as a side effect. We just drive it
// over the holding universe, throttled to respect provider limits.
//
// Required env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — to read holdings
//   ATLAS_API_BASE                           — deployed app origin,
//        e.g. https://your-atlas.vercel.app  (no trailing slash)
// Optional env:
//   FUNDAMENTALS_THROTTLE_MS  — delay between calls (default 1500)
//   FUNDAMENTALS_MAX_SYMBOLS  — cap per run (default 60)
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE     = (process.env.ATLAS_API_BASE || '').replace(/\/$/, '');
const THROTTLE_MS  = Number(process.env.FUNDAMENTALS_THROTTLE_MS || 1500);
const MAX_SYMBOLS  = Number(process.env.FUNDAMENTALS_MAX_SYMBOLS || 60);

function assertEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SERVICE_KEY)  missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!API_BASE)     missing.push('ATLAS_API_BASE');
  if (missing.length) {
    console.error('[fundamentals] Missing required env: ' + missing.join(', '));
    process.exit(1);
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getHoldingSymbols(sb) {
  // vw_portfolio_home is the live holdings surface (equities + ETFs).
  const { data, error } = await sb
    .from('vw_portfolio_home')
    .select('symbol, asset_class')
    .order('market_value', { ascending: false });
  if (error) throw new Error('read holdings: ' + error.message);
  // Skip option contracts (OCC-style symbols) — no fundamentals for those.
  const isOption = s => /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/.test(s);
  return [...new Set((data || [])
    .map(r => r.symbol)
    .filter(s => s && !isOption(s)))]
    .slice(0, MAX_SYMBOLS);
}

async function fetchOverview(symbol) {
  const url = `${API_BASE}/api/equity?endpoint=overview&symbol=${encodeURIComponent(symbol)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const ov = body && body.overview;
    const hasData = ov && (ov.PERatio != null || ov.Beta != null || ov.AnalystTargetPrice != null);
    return { ok: true, enriched: !!hasData, source: body && body.source && body.source.overview };
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  assertEnv();
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const started = Date.now();

  let symbols;
  try {
    symbols = await getHoldingSymbols(sb);
  } catch (e) {
    console.error('[fundamentals] ' + e.message);
    process.exit(1);
  }
  console.log(`[fundamentals] driving overview for ${symbols.length} symbols, throttle ${THROTTLE_MS}ms`);

  let enriched = 0, ok = 0, failed = 0;
  const failures = [];
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const r = await fetchOverview(sym);
    if (r.ok) {
      ok++;
      if (r.enriched) enriched++;
      console.log(`  [${i + 1}/${symbols.length}] ${sym} ✓ ${r.enriched ? 'enriched (' + (r.source || '?') + ')' : 'no fundamentals'}`);
    } else {
      failed++;
      failures.push(`${sym}: ${r.reason}`);
      console.log(`  [${i + 1}/${symbols.length}] ${sym} ✗ ${r.reason}`);
    }
    if (i < symbols.length - 1) await sleep(THROTTLE_MS);
  }

  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(`[fundamentals] done in ${elapsed}s — ok=${ok} enriched=${enriched} failed=${failed}`);

  // Best-effort run log (non-fatal if table/columns differ).
  try {
    await sb.from('atlas_sync_log').insert({
      sync_type: 'fundamentals',
      status: failed > ok ? 'partial' : 'success',
      metrics: { symbols: symbols.length, ok, enriched, failed, elapsed_s: elapsed },
      notes: failures.slice(0, 10).join(' | ') || null,
    });
  } catch (_) { /* logging is best-effort */ }

  // Non-zero exit only if nothing succeeded at all.
  if (ok === 0) process.exit(1);
}

main().catch(e => { console.error('[fundamentals] fatal: ' + e.message); process.exit(1); });
