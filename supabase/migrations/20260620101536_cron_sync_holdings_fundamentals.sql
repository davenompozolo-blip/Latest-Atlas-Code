-- Keep current holdings' fundamentals fresh. The universe-rotation sync only
-- reaches each symbol ~every 10 days and gates out sub-$2B names, so held names
-- (incl. small caps) went uncovered (the B-09 screener-fundamentals gap).
-- This calls sync_fundamentals in targeted mode (symbols = current holdings,
-- market-cap gate bypassed) every weekday morning before the universe sync.
-- ETFs/ADRs without fundamentals are simply skipped. Requires the
-- sync_fundamentals edge function deployed with the `symbols` param.
do $$ begin
  perform cron.unschedule('sync_holdings_fundamentals');
exception when others then null; end $$;

select cron.schedule(
  'sync_holdings_fundamentals',
  '0 12 * * 1-5',
  $cmd$
  select net.http_post(
    url := 'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1/sync_fundamentals',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object(
      'symbols', (select jsonb_agg(distinct symbol) from vw_nexus_holdings),
      'only_missing', false
    ),
    timeout_milliseconds := 150000
  );
  $cmd$
);
