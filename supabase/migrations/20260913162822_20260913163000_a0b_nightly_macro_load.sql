-- A0b.3 -- the nightly macro load.
--
-- 23:05 UTC Mon-Sat: after the 22:50 market-series sync and before the 23:10
-- factor refresh, which is the window the spec names. Mon-Sat rather than daily
-- because FRED publishes on trading days; a Saturday run exists to pick up the
-- values FRED publishes late on Friday and to re-fetch Brent, which lags two
-- sessions.
--
-- UNGATED, deliberately, and this is a departure from the spec's "gate on the
-- upstream stage" worth stating plainly.
--
-- C4's gate exists because the factor refresh reads market_prices and is wrong
-- if that night's prices have not landed. This job reads nothing this platform
-- writes -- every one of the seven series comes from FRED over HTTP. Gating it
-- on backfill_market_prices would mean that a night Yahoo is unreachable also
-- costs the breakevens, which makes the dependency worse rather than safer, and
-- a gate that does not track a real dependency is the "gate you learn to
-- ignore" this codebase already has an entry about. sync_market_series_daily is
-- itself ungated for exactly this reason.
--
-- The gate that DOES matter is downstream: A3.1's theme engine gates on this
-- load having succeeded for the run date, because it genuinely cannot evaluate
-- a trigger against a series that did not arrive.
--
-- The handler owns the sync_log row (function_name = 'load_macro_series'),
-- writes finished_at and never duration_ms, and answers 503 on a no-op so a
-- run that wrote nothing cannot be graded green.

do $$
begin
  perform cron.unschedule('load_macro_series_daily')
   where exists (select 1 from cron.job where jobname = 'load_macro_series_daily');
end $$;

select cron.schedule(
  'load_macro_series_daily',
  '5 23 * * 1-6',
  $job$
  select net.http_post(
    url     := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/load_macro_series',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{"lookback_days":30}'::jsonb,
    timeout_milliseconds := 120000);
  $job$
);
