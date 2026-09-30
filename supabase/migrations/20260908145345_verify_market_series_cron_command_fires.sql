-- Verification only: run the exact body of sync_market_series_daily once, so
-- the pg_net -> edge function path is proven rather than assumed. The loader is
-- idempotent on (symbol, date), so firing it early costs nothing.
select net.http_post(
  url     := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/backfill_market_prices',
  headers := '{"Content-Type":"application/json"}'::jsonb,
  body    := '{"lookback_days":10}'::jsonb,
  timeout_milliseconds := 120000);
