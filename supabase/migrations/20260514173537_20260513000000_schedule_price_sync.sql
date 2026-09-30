-- Migration: schedule sync_alpaca_prices via pg_cron
-- Pattern mirrors existing sync-alpaca-positions cron (empty headers, simple post).
-- Weekdays at 22:00 UTC (~5 PM ET, post-close + buffer for Alpaca finalisation).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent
SELECT cron.unschedule('sync_alpaca_prices_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync_alpaca_prices_daily');

SELECT cron.schedule(
  'sync_alpaca_prices_daily',
  '0 22 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/sync_alpaca_prices',
    headers := '{}'::jsonb,
    body := jsonb_build_object('source', 'cron', 'time', now())::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
