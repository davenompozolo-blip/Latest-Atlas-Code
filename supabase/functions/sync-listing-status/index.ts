import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALPHA_KEY = Deno.env.get('ALPHA_VANTAGE_API_KEY')!;
const SB_URL    = Deno.env.get('SUPABASE_URL')!;
const SB_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Curated exchanges only — keeps universe at ~6-7k stocks rather than 10k+
const ALLOWED_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'NYSE ARCA', 'NYSE MKT', 'BATS']);

Deno.serve(async () => {
  if (!ALPHA_KEY) return new Response(JSON.stringify({ error: 'ALPHA_VANTAGE_API_KEY not set' }), { status: 500 });
  if (!SB_URL || !SB_KEY) return new Response(JSON.stringify({ error: 'Supabase env vars not set' }), { status: 500 });

  const sb  = createClient(SB_URL, SB_KEY);
  const now = new Date().toISOString();

  const avRes = await fetch(
    `https://www.alphavantage.co/query?function=LISTING_STATUS&state=active&apikey=${ALPHA_KEY}`
  );
  if (!avRes.ok) {
    return new Response(JSON.stringify({ error: `Alpha Vantage error: ${avRes.status}` }), { status: 500 });
  }

  const csv   = await avRes.text();
  const lines = csv.trim().split('\n').slice(1); // skip header row

  const rows = lines
    .map(line => {
      const [symbol, name, exchange, assetType] = line.split(',');
      return {
        symbol:         symbol?.trim(),
        name:           name?.trim() || null,
        exchange:       exchange?.trim() || null,
        asset_class:    assetType?.trim() || null, // assets table uses asset_class not asset_type
        listing_status: 'active',
        updated_at:     now,
      };
    })
    .filter(r =>
      r.symbol &&
      !r.symbol.includes('-') &&         // exclude preferreds, units, warrants (e.g. BRK-A)
      !r.symbol.includes('.') &&         // exclude class shares with dots (e.g. BRK.B)
      ALLOWED_EXCHANGES.has(r.exchange ?? '') &&
      r.asset_class === 'Stock'
    );

  const activeSymbols = new Set(rows.map(r => r.symbol));

  // Find previously-active rows now absent from the feed — mark as delisted
  const { data: existing } = await sb
    .from('assets')
    .select('symbol')
    .eq('listing_status', 'active');

  const newlyDelisted = (existing || [])
    .filter(r => !activeSymbols.has(r.symbol))
    .map(r => ({ symbol: r.symbol, listing_status: 'delisted', updated_at: now }));

  // Upsert in 500-row chunks (Supabase payload cap)
  const CHUNK = 500;
  let totalUpserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb
      .from('assets')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'symbol' });
    if (error) {
      return new Response(JSON.stringify({ error: error.message, at_chunk: i }), { status: 500 });
    }
    totalUpserted += Math.min(CHUNK, rows.length - i);
  }

  if (newlyDelisted.length) {
    await sb.from('assets').upsert(newlyDelisted, { onConflict: 'symbol' });
  }

  return new Response(
    JSON.stringify({ active: totalUpserted, delisted: newlyDelisted.length, synced_at: now }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
