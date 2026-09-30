-- Runs 25 minutes after sync_alpaca_prices_daily (22:00 weekdays), so the
-- window is computed from the session that job has just written rather than
-- from yesterday's closes. Weekdays only — there is nothing new to measure on
-- a weekend, and re-running would just rewrite identical rows.
select cron.unschedule('refresh_holding_vol_trailing')
where exists (select 1 from cron.job where jobname = 'refresh_holding_vol_trailing');

select cron.schedule(
    'refresh_holding_vol_trailing',
    '25 22 * * 1-5',
    $$select public.refresh_holding_vol_trailing(400);$$
);
