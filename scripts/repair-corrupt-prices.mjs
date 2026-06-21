// scripts/repair-corrupt-prices.mjs
//
// Repairs symbols whose price_history was corrupted by a distorted Alpaca series
// (corporate-action mis-adjustment on recent spin-offs): SNDK (~27×), MU (~10×),
// GEV (~2×). For each symbol it:
//   1. fetches the full validated daily history from Stooq (independent source),
//   2. re-validates the latest Stooq close against the *current* stored close so
//      we never replace good data, and confirms the stored series really diverged,
//   3. deletes the corrupt rows and inserts the Stooq history (source='stooq').
//
// SAFE BY DEFAULT: dry-run unless --apply is passed. Dry-run fetches, validates,
// and prints exactly what it would change without writing.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/repair-corrupt-prices.mjs [SYM1 SYM2 ...] [--apply]
//   (default symbols: SNDK MU GEV)

import { createClient } from '@supabase/supabase-js';
import { fetchStooqHistory, fetchStooqClose, assessClose } from './lib/price-guard.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const args   = process.argv.slice(2);
const APPLY  = args.includes('--apply');
const SYMBOLS = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());
const TARGETS = SYMBOLS.length ? SYMBOLS : ['SNDK', 'MU', 'GEV'];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log(`\nATLAS Price Repair  ${APPLY ? '(APPLY — will write)' : '(dry-run — no writes; pass --apply to commit)'}`);
  console.log(`Targets: ${TARGETS.join(', ')}\n`);

  let repaired = 0, skipped = 0;
  for (const symbol of TARGETS) {
    const { data: asset, error: aErr } = await supabase
      .from('assets').select('id, symbol, name').eq('symbol', symbol).maybeSingle();
    if (aErr || !asset) { console.warn(`  ⚠ ${symbol}: asset not found — skipping`); skipped++; continue; }

    // Current stored latest close
    const { data: cur } = await supabase
      .from('price_history').select('close, price_date, source')
      .eq('asset_id', asset.id).eq('interval', '1d')
      .order('price_date', { ascending: false }).limit(1).maybeSingle();

    // Independent truth
    const ref = await fetchStooqClose(symbol);
    const history = await fetchStooqHistory(symbol);
    if (ref == null || history.length === 0) {
      console.warn(`  ⚠ ${symbol}: no Stooq reference/history available — skipping (cannot safely repair)`);
      skipped++; continue;
    }

    // Confirm the stored series really is corrupt before touching it.
    const storedClose = cur ? Number(cur.close) : null;
    const verdict = storedClose != null ? assessClose(storedClose, ref) : { ok: false, reason: 'no_stored' };
    if (verdict.ok) {
      console.log(`  ✓ ${symbol}: stored ${storedClose} agrees with reference ${ref} — already clean, skipping`);
      skipped++; continue;
    }

    console.log(`  ⛔ ${symbol}: stored ${storedClose} vs reference ${ref}` +
      (verdict.divergence != null ? ` (${(verdict.divergence * 100).toFixed(0)}% off)` : '') +
      ` → replace with ${history.length} Stooq rows (${history[0].date} → ${history[history.length - 1].date}, latest close ${history[history.length - 1].close})`);

    if (!APPLY) { repaired++; continue; }

    // Delete corrupt rows, insert validated Stooq history.
    const { error: delErr } = await supabase
      .from('price_history').delete().eq('asset_id', asset.id).eq('interval', '1d');
    if (delErr) { console.error(`     ✗ delete failed: ${delErr.message}`); skipped++; continue; }

    const rows = history.map((b) => ({
      asset_id: asset.id, price_date: b.date,
      open: b.open, high: b.high, low: b.low, close: b.close,
      adjusted_close: b.close, volume: b.volume, interval: '1d', source: 'stooq',
    }));
    const { error: insErr } = await supabase
      .from('price_history').upsert(rows, { onConflict: 'asset_id,price_date,interval' });
    if (insErr) { console.error(`     ✗ insert failed: ${insErr.message}`); skipped++; continue; }
    console.log(`     ✓ replaced with ${rows.length} validated rows`);
    repaired++;
  }

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`${APPLY ? 'Repaired' : 'Would repair'}: ${repaired} | Skipped: ${skipped}`);
  console.log(`${'═'.repeat(40)}\n`);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
