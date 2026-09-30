-- Migration: schedule sync_alpaca_prices via pg_cron
--
-- ⚠ APPLY ONLY after:
--   1. Migration 20260512000000 (price_history schema fix) is applied
--   2. Edge Function sync_alpaca_prices is deployed (--no-verify-jwt)
--   3. Manual backfill has succeeded (prices_upserted > 0 in sync_log)
--
-- Schedules: weekdays at 22:00 UTC (~5 PM ET) — after US market close with
-- a 1-hour buffer for Alpaca to finalise daily OHLCV bars.
--
-- Auth pattern: matches existing sync_alpaca_positions cron job in this repo.
-- Uses current_setting('app.settings.service_role_key', true) — if your repo
-- uses a different secret delivery (vault.decrypted_secrets, etc.), update
-- the headers line to match the pattern in sync_alpaca_positions' cron entry.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: remove any prior schedule with this name before recreating
SELECT cron.unschedule('sync_alpaca_prices_daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync_alpaca_prices_daily'
);

SELECT cron.schedule(
  'sync_alpaca_prices_daily',
  '0 22 * * 1-5',
  $$
  SELECT net.http_post(
    url     := 'https://vdmojjszvvcithuxwexx.functions.supabase.co/sync_alpaca_prices',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Verify after applying:
-- SELECT jobid, jobname, schedule, command FROM cron.job
-- WHERE jobname IN ('sync_alpaca_prices_daily', 'sync_alpaca_positions_5min');
