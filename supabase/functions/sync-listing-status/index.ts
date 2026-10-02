import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveGuarded } from '../_shared/edge_auth.js'

const ALPHA_KEY = Deno.env.get('ALPHA_VANTAGE_API_KEY')!;
const SB_URL    = Deno.env.get('SUPABASE_URL')!;
const SB_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'NYSE ARCA', 'NYSE MKT', 'BATS']);

serveGuarded({ user: false }, async () => {
  if (!ALPHA_KEY) return new Response(JSON.stringify({ error: 'ALPHA_VANTAGE_API_KEY not set' }), { status: 500 });
  if (!SB_URL || !SB_KEY) return new Response(JSON.stringify({ error: 'Supabase env vars not set' }), { status: 500 });

  const sb = createClient(SB_URL, SB_KEY);

  const avRes = await fetch(
    `https://www.alphavantage.co/query?function=LISTING_STATUS&state=active&apikey=${ALPHA_KEY}`
  );
  if (!avRes.ok) {
    return new Response(JSON.stringify({ error: `Alpha Vantage error: ${avRes.status}` }), { status: 500 });
  }

  const csv   = await avRes.text();
  const lines = csv.trim().split('\n').slice(1);
  const now   = new Date().toISOString();

  const rows = lines
    .map(line => {
      const [symbol, name, exchange, assetType] = line.split(',');
      return {
        symbol:         symbol?.trim(),
        name:           name?.trim() || null,
        exchange:       exchange?.trim() || null,
        asset_class:    assetType?.trim() || null,
        listing_status: 'active',
        updated_at:     now,
      };
    })
    .filter(r =>
      r.symbol &&
      !r.symbol.includes('-') &&
      !r.symbol.includes('.') &&
      ALLOWED_EXCHANGES.has(r.exchange ?? '') &&
      r.asset_class === 'Stock'
    );

  const activeSymbols = new Set(rows.map(r => r.symbol));

  const { data: existing } = await sb
    .from('assets')
    .select('symbol')
    .eq('listing_status', 'active');

  const newlyDelisted = (existing || [])
    .filter(r => !activeSymbols.has(r.symbol))
    .map(r => ({ symbol: r.symbol, listing_status: 'delisted', updated_at: now }));

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
