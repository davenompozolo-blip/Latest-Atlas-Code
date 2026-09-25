-- chain_sync_valuations: weekly -> daily.
--
-- api/sync-valuations.js is now a budgeted rolling refresh (oldest attempt
-- first, paced under Finnhub's 60/min, stops inside 240s). Weekly, it covered
-- ~28 names a week of a 75-name union and fv_trustworthy -- which needs a
-- valuation <= 14 days old -- read 0 of 67 and 0 of 38. Daily, the union turns
-- over in a few days. Only the schedule moves; the command is unchanged.
-- 06:05 rather than 06:00: off the hour, and still clear of the 20:00-01:59
-- nightly chain window.
do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'chain_sync_valuations';
  if v_id is null then raise exception 'chain_sync_valuations not found'; end if;
  perform cron.alter_job(v_id, schedule := '5 6 * * *');
  if (select schedule from cron.job where jobid = v_id) <> '5 6 * * *' then
    raise exception 'schedule did not change';
  end if;
end $$;
