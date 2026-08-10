-- Friday closing prices were never written. Two faults compounded.
--
-- 1. sync_alpaca_prices defaults to a single day, `yesterday()`, when the
--    body carries no dates — and the cron body carried none.
-- 2. The schedule was `0 22 * * 1-5`, weekdays only.
--
-- Friday's close therefore needed a Saturday run that never happened, while
-- Monday's run spent itself fetching Sunday and built zero rows. Every Friday
-- from 2026-05-15 (when this sync went live) to 2026-08-07 was missing, except
-- the two that fell on market holidays — eleven trading days absent from
-- price_history, each showing a single SPY row from the independent 22:30
-- benchmark writer and nothing else.
--
-- The fix is not simply "add Saturday". A schedule that fetches exactly one
-- specific day has no way to repair a night it missed: one failed run leaves a
-- permanent hole, which is what turned a scheduling detail into three months of
-- silent data loss. So the body now requests a five-day window and the upsert
-- on (asset_id, price_date, "interval") makes re-fetching free. Every trading
-- day is covered by five consecutive runs; any single failure self-heals on the
-- next one.
--
-- Running 22:00 Mon-Sat rather than Tue-Sat: 22:00 UTC is after the US close
-- year-round (20:00 UTC on EDT, 21:00 on EST), so end_date = current_date
-- captures the same day's close instead of trailing it by one. The Saturday
-- run is the backstop that closes the original Friday hole.
select cron.unschedule('sync_alpaca_prices_daily')
where exists (select 1 from cron.job where jobname = 'sync_alpaca_prices_daily');

select cron.schedule(
    'sync_alpaca_prices_daily',
    '0 22 * * 1-6',
    $$
    select net.http_post(
      url := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/sync_alpaca_prices',
      headers := '{}'::jsonb,
      body := jsonb_build_object(
        'source',     'cron',
        'start_date', (current_date - 5)::text,
        'end_date',   current_date::text
      )::jsonb,
      timeout_milliseconds := 120000
    );
    $$
);
