// scripts/backfill-price-history.mjs
//
// One-off backfill: fetch Alpaca daily bars from BACKFILL_START → yesterday
// for all equity assets in the DB and upsert into price_history.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   ALPACA_KEY=... ALPACA_SECRET=... \
//   node scripts/backfill-price-history.mjs
//
// Optional env:
//   BACKFILL_START=2026-03-25  (default: 2026-03-25, the day before data froze)

import { createClient } from '@supabase/supabase-js';
import { assessClose, fetchStooqClose, MAX_DIVERGENCE } from './lib/price-guard.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALPACA_KEY    = process.env.ALPACA_KEY;
const ALPACA_SECRET = process.env.ALPACA_SECRET;
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}
if (!ALPACA_KEY || !ALPACA_SECRET) {
  console.error('ALPACA_KEY and ALPACA_SECRET are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ALPACA_HEADERS = {
  'APCA-API-KEY-ID':     ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
};

const OCC_PATTERN = /^[A-Z.]{1,6}\d{6}[CP]\d{8}$/;

const BACKFILL_START = process.env.BACKFILL_START || '2026-03-25';

const endDt = new Date();
endDt.setDate(endDt.getDate() - 1); // yesterday
const BACKFILL_END = endDt.toISOString().slice(0, 10);

async function fetchAlpacaBars(symbols, startDate, endDate) {
  let allBars = {};
  let pageToken = null;

  do {
    let url = `${ALPACA_DATA_URL}/v2/stocks/bars?symbols=${symbols.join(',')}&timeframe=1Day&start=${startDate}&end=${endDate}&limit=1000&adjustment=all&feed=iex`;
    if (pageToken) url += `&page_token=${encodeURIComponent(pageToken)}`;

    const res = await fetch(url, { headers: ALPACA_HEADERS });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Alpaca bars ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();

    for (const [sym, bars] of Object.entries(json.bars || {})) {
      if (!allBars[sym]) allBars[sym] = [];
      allBars[sym].push(...bars);
    }
    pageToken = json.next_page_token || null;
  } while (pageToken);

  return allBars;
}

async function main() {
  console.log(`\nATLAS Price History Backfill`);
  console.log(`Range: ${BACKFILL_START} → ${BACKFILL_END}\n`);

  const { data: assets, error: assetErr } = await supabase
    .from('assets')
    .select('id, symbol');
  if (assetErr) {
    console.error('Failed to load assets:', assetErr.message);
    process.exit(1);
  }

  const equityAssets = assets.filter(a => !OCC_PATTERN.test(a.symbol));
  const symbolToId   = Object.fromEntries(equityAssets.map(a => [a.symbol, a.id]));
  const symbols      = equityAssets.map(a => a.symbol);

  console.log(`Assets total: ${assets.length} | Equities (non-options): ${symbols.length}`);
  console.log(`Symbols: ${symbols.join(', ')}\n`);

  const BATCH = 50;
  let totalFetched  = 0;
  let totalUpserted = 0;
  let totalErrors   = 0;
  const quarantined = [];   // symbols whose Alpaca series diverged from the independent reference
  const unvalidated = [];   // symbols with no reference available (written, but flagged)

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    console.log(`Fetching batch [${i + 1}–${i + batch.length}/${symbols.length}]: ${batch.join(', ')}`);

    let bars;
    try {
      bars = await fetchAlpacaBars(batch, BACKFILL_START, BACKFILL_END);
    } catch (err) {
      console.error(`  ✗ Fetch failed: ${err.message}`);
      totalErrors++;
      continue;
    }

    const rows = [];
    for (const [symbol, barList] of Object.entries(bars)) {
      const assetId = symbolToId[symbol];
      if (!assetId) {
        console.warn(`  ⚠ No asset_id for symbol: ${symbol}`);
        continue;
      }
      const symRows = barList.map(function(bar) {
        return {
          asset_id:       assetId,
          price_date:     bar.t.slice(0, 10),
          open:           parseFloat(bar.o),
          high:           parseFloat(bar.h),
          low:            parseFloat(bar.l),
          close:          parseFloat(bar.c),
          adjusted_close: parseFloat(bar.c),
          volume:         parseInt(bar.v) || 0,
          interval:       '1d',
          source:         'alpaca',
        };
      });
      if (symRows.length === 0) continue;

      // Data-trust guard: validate this symbol's latest close against an
      // independent source before writing. A corporate-action mis-adjustment can
      // inflate the whole Alpaca series uniformly (SNDK ~27×, MU ~10×, GEV ~2×),
      // which no internal check sees — so cross-check, and quarantine on a gross
      // divergence rather than corrupt every downstream valuation.
      const latest = symRows.reduce((a, b) => (a.price_date >= b.price_date ? a : b));
      const ref = await fetchStooqClose(symbol);
      const verdict = assessClose(latest.close, ref);
      if (!verdict.ok && verdict.reason === 'reference_divergence') {
        quarantined.push({ symbol, alpaca: latest.close, reference: ref, divergence: verdict.divergence });
        console.warn(`  ⛔ QUARANTINED ${symbol}: alpaca ${latest.close} vs ref ${ref} (${(verdict.divergence * 100).toFixed(0)}% > ${MAX_DIVERGENCE * 100}%) — not writing`);
        continue;
      }
      if (verdict.reason === 'no_reference') {
        unvalidated.push(symbol);
        console.warn(`  ⚠ no reference for ${symbol} — writing unvalidated`);
      }
      rows.push(...symRows);
    }

    console.log(`  Rows built: ${rows.length}`);
    totalFetched += rows.length;

    if (rows.length === 0) {
      console.log(`  — No data returned for this batch`);
      continue;
    }

    const { error: upsertErr } = await supabase
      .from('price_history')
      .upsert(rows, { onConflict: 'asset_id,price_date,interval' });

    if (upsertErr) {
      console.error(`  ✗ Upsert failed: ${upsertErr.message}`);
      totalErrors++;
    } else {
      console.log(`  ✓ Upserted ${rows.length} rows`);
      totalUpserted += rows.length;
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`Backfill complete`);
  console.log(`  Rows fetched:  ${totalFetched}`);
  console.log(`  Rows upserted: ${totalUpserted}`);
  console.log(`  Batch errors:  ${totalErrors}`);
  if (unvalidated.length) console.log(`  Unvalidated (no reference): ${unvalidated.join(', ')}`);
  if (quarantined.length) {
    console.log(`  ⛔ QUARANTINED ${quarantined.length} symbol(s) — corrupt vendor prices NOT written:`);
    for (const q of quarantined) {
      console.log(`     ${q.symbol}: alpaca ${q.alpaca} vs ref ${q.reference} (${(q.divergence * 100).toFixed(0)}% divergence)`);
    }
  }
  console.log(`═══════════════════════════════════════\n`);

  if (totalErrors > 0 || quarantined.length > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
