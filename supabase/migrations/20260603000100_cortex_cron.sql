-- Cortex signal engine: pg_cron schedule
--
-- Fires at 22:15 UTC weekdays (15 min after sync_alpaca_prices at 22:00)
-- so signals are generated from fresh prices.
-- Also callable on-demand via POST to the Edge Function URL.

SELECT cron.schedule(
  'generate_cortex_signals_daily',
  '15 22 * * 1-5',
  $$
  SELECT net.http_post(
    url     := 'https://vdmojjszvvcithuxwexx.functions.supabase.co/generate_cortex_signals',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
