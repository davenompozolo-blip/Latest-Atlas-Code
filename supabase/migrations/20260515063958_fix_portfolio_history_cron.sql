-- Migration: fix sync_portfolio_history_nightly cron authentication
--
-- Root cause: the original cron (20260427100000_portfolio_history_cron.sql)
-- used current_setting('app.supabase_url') and current_setting('app.supabase_service_key').
-- Neither of those pg settings is defined in the Supabase project, so pg_cron
-- calls net.http_post with an empty URL and empty bearer token — every run
-- silently no-ops and returns without error. Data in portfolio_equity_curve
-- (and therefore vw_portfolio_nav_daily / the performance charts) has been
-- frozen since 2026-04-28 (the day the cron was added; auth worked in the
-- migration session but not in cron context).
--
-- Fix: re-schedule with hardcoded project URL and the correct pg setting name
-- used by all other cron jobs in this repo (app.settings.service_role_key).
--
-- Also extends the rolling window from 1M to 6M so any gap caused by the
-- broken cron is automatically backfilled on the first successful run.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove the broken schedule
SELECT cron.unschedule('sync_portfolio_history_nightly')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync_portfolio_history_nightly'
);

-- Re-schedule with working auth and 6M window (auto-backfills the gap)
SELECT cron.schedule(
  'sync_portfolio_history_nightly',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://vdmojjszvvcithuxwexx.functions.supabase.co/functions/v1/sync_portfolio_history',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body    := '{"period":"6M","timeframe":"1D"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Verify after applying:
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'sync_portfolio_history_nightly';
