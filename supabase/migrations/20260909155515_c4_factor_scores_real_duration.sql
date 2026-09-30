-- Corrective: sync_log.started_at defaults to now() and the wrapper closed with
-- now() too. now() is the TRANSACTION timestamp, constant for the life of the
-- transaction, so finished_at always equalled started_at and every run reported
-- duration_ms = 0 -- a job that recomputes the entire history looking like it
-- did nothing at all. clock_timestamp() advances inside the transaction.
--
-- Body is otherwise identical to 20260909161500; replaying both is idempotent.

create or replace function public.atlas_run_factor_scores()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_log_id          bigint;
  v_upstream_status text;
  v_z               int;
  v_s               int;
  v_prev_score      date;
  v_latest_score    date;
  v_latest_z        date;
  v_latest_spy      date;
  v_status          text;
  v_reason          text;
begin
  insert into public.sync_log (function_name, status, source, details)
  values ('atlas_refresh_factor_scores', 'running', 'pg_cron',
          jsonb_build_object('gate', 'backfill_market_prices success today'))
  returning id into v_log_id;

  select max(date) into v_prev_score from public.factor_axis_scores;
  select max(date) into v_latest_spy from public.market_prices where symbol = 'SPY';

  select status into v_upstream_status
    from public.sync_log
   where function_name = 'backfill_market_prices'
     and started_at::date = current_date
   order by id desc
   limit 1;

  if v_upstream_status is distinct from 'success' then
    update public.sync_log
       set status = 'skipped', finished_at = clock_timestamp(),
           details = details || jsonb_build_object(
             'reason', case
                         when v_upstream_status is null
                           then 'upstream backfill_market_prices has not run today'
                         else 'upstream backfill_market_prices is ' || v_upstream_status
                       end,
             'upstream_status',    v_upstream_status,
             'latest_score_date',  v_prev_score,
             'latest_spy_date',    v_latest_spy)
     where id = v_log_id;
    return;
  end if;

  select zscores_written, scores_written
    into v_z, v_s
    from public.atlas_refresh_factor_scores();

  select max(date) into v_latest_score from public.factor_axis_scores;
  select max(date) into v_latest_z     from public.factor_pair_zscores;

  if v_s > 0 then
    v_status := 'success';
    v_reason := null;
  elsif v_z = 0 and v_latest_z < v_latest_spy then
    v_status := 'error';
    v_reason := 'nothing written and the z layer stops at '
                || coalesce(v_latest_z::text, '(none)')
                || ' behind the newest SPY session ' || coalesce(v_latest_spy::text, '(none)');
  else
    v_status := 'skipped';
    v_reason := case
                  when v_latest_score >= v_latest_spy
                    then 'already current through ' || v_latest_score
                  else 'no new fully-covered session (a score needs all 11 pairs)'
                end;
  end if;

  update public.sync_log
     set status        = v_status,
         finished_at   = clock_timestamp(),
         error_message = case when v_status = 'error' then v_reason end,
         details       = details || jsonb_build_object(
           'zscores_written',     v_z,
           'scores_written',      v_s,
           'previous_score_date', v_prev_score,
           'latest_score_date',   v_latest_score,
           'latest_z_date',       v_latest_z,
           'latest_spy_date',     v_latest_spy,
           'upstream_status',     v_upstream_status,
           'reason',              v_reason)
   where id = v_log_id;
end;
$$;

revoke execute on function public.atlas_run_factor_scores() from anon, authenticated;
