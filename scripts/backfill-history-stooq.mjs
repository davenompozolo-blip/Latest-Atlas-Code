// scripts/backfill-history-stooq.mjs
//
// Recently-added symbols (e.g. MU/SNDK/GEV) only have ~15–20 days of price
// history because they were added to the universe mid-sync and never got a deep
// backfill. That skews long-window returns/volatility and the 52-week range
// (the bogus SNDK "1Y" figure). This fills the missing history from Stooq
// (keyless, independent) — ADDITIVE only: it inserts rows for dates an asset
// doesn't already have, never overwriting existing prices.
//
// SAFE BY DEFAULT: dry-run unless --apply.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/backfill-history-stooq.mjs [SYM1 SYM2 ...] [--apply] [--min-rows=60]
//   (no symbols ⇒ auto-target every held equity with fewer than --min-rows rows)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const args    = process.argv.slice(2);
const APPLY   = args.includes('--apply');
const minArg  = args.find((a) => a.startsWith('--min-rows='));
const MIN_ROWS = minArg ? parseInt(minArg.split('=')[1], 10) : 60;
const SYMBOLS  = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());
const OCC = /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/;  // option symbols — skip

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Full daily history from Stooq. Header: Date,Open,High,Low,Close,Volume
async function fetchStooqHistory(symbol) {
  try {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase())}.us&i=d`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const lines = (await res.text()).trim().split('\n');
    if (lines.length < 2) return [];
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(',');
      if (c.length < 5) continue;
      const date = c[0], close = Number(c[4]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isFinite(close) || close <= 0) continue;
      out.push({ date, open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close,
                 volume: isFinite(Number(c[5])) ? Math.round(Number(c[5])) : 0 });
    }
    return out;
  } catch { return []; }
}

async function targetAssets() {
  if (SYMBOLS.length) {
    const { data } = await supabase.from('assets').select('id, symbol').in('symbol', SYMBOLS);
    return (data || []).filter((a) => !OCC.test(a.symbol));
  }
  // Auto: held equities with fewer than MIN_ROWS daily rows.
  const { data: held } = await supabase
    .from('positions').select('asset_id, assets!inner(id, symbol)')
    .neq('quantity', 0);
  const seen = new Map();
  for (const r of held || []) {
    const a = r.assets;
    if (a && !OCC.test(a.symbol)) seen.set(a.id, a.symbol);
  }
  const out = [];
  for (const [id, symbol] of seen) {
    const { count } = await supabase.from('price_history')
      .select('id', { count: 'exact', head: true }).eq('asset_id', id).eq('interval', '1d');
    if ((count || 0) < MIN_ROWS) out.push({ id, symbol, rows: count || 0 });
  }
  return out;
}

async function main() {
  console.log(`\nATLAS Stooq History Backfill  ${APPLY ? '(APPLY — will write)' : '(dry-run — pass --apply to commit)'}`);
  const assets = await targetAssets();
  if (!assets.length) { console.log('No target symbols (all have sufficient history).'); return; }
  console.log(`Targets (${assets.length}): ${assets.map((a) => a.symbol + (a.rows != null ? `[${a.rows}]` : '')).join(', ')}\n`);

  let filledSymbols = 0, totalInserted = 0;
  for (const a of assets) {
    const hist = await fetchStooqHistory(a.symbol);
    if (!hist.length) { console.warn(`  ⚠ ${a.symbol}: no Stooq history — skipping`); continue; }
    const { data: existing } = await supabase.from('price_history')
      .select('price_date').eq('asset_id', a.id).eq('interval', '1d');
    const have = new Set((existing || []).map((r) => r.price_date));
    const missing = hist.filter((b) => !have.has(b.date));
    if (!missing.length) { console.log(`  ✓ ${a.symbol}: already complete (${have.size} rows)`); continue; }

    console.log(`  ${a.symbol}: ${have.size} existing → +${missing.length} from Stooq (${missing[0].date} → ${missing[missing.length - 1].date})`);
    if (!APPLY) { filledSymbols++; totalInserted += missing.length; continue; }

    const rows = missing.map((b) => ({
      asset_id: a.id, price_date: b.date, open: b.open, high: b.high, low: b.low,
      close: b.close, adjusted_close: b.close, volume: b.volume, interval: '1d', source: 'stooq',
    }));
    const { error } = await supabase.from('price_history')
      .upsert(rows, { onConflict: 'asset_id,price_date,interval' });
    if (error) { console.error(`     ✗ insert failed: ${error.message}`); continue; }
    console.log(`     ✓ inserted ${rows.length}`);
    filledSymbols++; totalInserted += rows.length;
  }

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`${APPLY ? 'Backfilled' : 'Would backfill'}: ${filledSymbols} symbol(s), ${totalInserted} row(s)`);
  console.log(`${'═'.repeat(40)}\n`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
