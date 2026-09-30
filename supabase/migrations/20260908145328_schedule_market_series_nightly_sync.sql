-- Nightly sync for the A0 regime/risk series layer.
--
-- pg_cron is the only scheduler in this platform, so this goes in cron.job and
-- nowhere else -- not Vercel Cron, not GitHub Actions. Both of those were
-- retired precisely because work split across three schedulers had no ordering
-- guarantee and half of it silently never fired.
--
-- 22:50 UTC, Mon-Sat.
--   * After the US close year-round (20:00 UTC on EDT, 21:00 on EST), so the
--     session is settled. The loader independently refuses a bar whose session
--     has not closed, so an early run degrades to "no new bar" rather than to
--     a partial close.
--   * In the free slot between chain_trade_sync_all (22:45) and
--     chain_options_snapshot (23:00), and well before atlas_run_validation
--     (23:40).
--   * Mon-Sat, matching sync_alpaca_prices_daily: a Saturday run recovers
--     Friday's close if Friday's run failed. Nothing depends on this feed yet,
--     so it is ungated -- it reads no table any other stage writes.
--
-- A WINDOW, not the whole series. The upsert on (symbol, date) makes the
-- overlap free, so a missed night self-heals on the next run instead of
-- leaving a permanent hole -- the lesson that cost eleven Fridays of price
-- history. lookback_days is sent explicitly so the schedule states its own
-- recovery budget rather than depending on a default in the function.
--
-- pg_net is fire-and-forget, but this needs no reaper: the function opens and
-- closes its own sync_log row, so the real outcome is recorded either way.

select cron.unschedule('sync_market_series_daily')
where exists (select 1 from cron.job where jobname = 'sync_market_series_daily');

select cron.schedule(
  'sync_market_series_daily',
  '50 22 * * 1-6',
  $job$
  select net.http_post(
    url     := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/backfill_market_prices',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"lookback_days":10}'::jsonb,
    timeout_milliseconds := 120000);
  $job$
);
