-- Transaction sync moves off GitHub Actions onto pg_cron.
--
-- Actions cannot provision a runner in this repository: all 30 ATLAS Sync
-- runs died in 3-5 seconds with runner_id 0, never reaching their first step.
-- pg_cron, by contrast, has 2016 consecutive clean runs on positions and 1008
-- on holdings with zero failures. The schedule was never the problem; the
-- thing it was firing at was.
--
-- Mirrors the original workflow's twice-daily intent — post-close and
-- pre-market on weekdays — but 10 minutes past the hour so it does not
-- contend with the price sync at 22:00 or the vol refresh at 22:25.
select cron.unschedule('sync_alpaca_transactions')
where exists (select 1 from cron.job where jobname = 'sync_alpaca_transactions');

select cron.schedule(
    'sync_alpaca_transactions',
    '10 13,22 * * 1-5',
    $$
    select net.http_post(
      url := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/sync_alpaca_transactions',
      headers := '{}'::jsonb,
      body := jsonb_build_object('time', now())::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
    $$
);
