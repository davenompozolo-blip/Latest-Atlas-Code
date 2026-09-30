-- =============================================================================
-- ATLAS — Nightly portfolio equity curve sync via pg_cron
-- Calls sync_portfolio_history edge function each night at 01:00 UTC with a
-- 1-month rolling window so portfolio_equity_curve stays current without a
-- full backfill on every run.
-- =============================================================================

-- Enable pg_cron extension (no-op if already enabled)
create extension if not exists pg_cron;

-- Schedule: every night at 01:00 UTC, after Alpaca daily close is settled
select cron.schedule(
  'sync_portfolio_history_nightly',
  '0 1 * * *',
  $$
  select net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync_portfolio_history',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || current_setting('app.supabase_service_key')
    ),
    body    := '{"period":"1M","timeframe":"1D"}'::jsonb
  );
  $$
);
