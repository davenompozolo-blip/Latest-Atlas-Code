-- B5, step 4. Nightly writer, with the lessons this codebase has already paid
-- for wired in from the start.
--
-- 1. GATE ON THE DEPENDENCY, NOT ON A NAME OR A STATUS. The gate here is that
--    book_regime_cvar actually holds a snapshot for the session being graded.
--    A status gate would have been wrong in a way that is easy to miss: E3's
--    writer logs `skipped` on an idempotent re-run, and on such a night the
--    rows ARE present and this job should proceed. Gating on `= 'success'`
--    would refuse forever the first time E3 re-ran -- the "gate that can never
--    pass" in a new shape.
--
-- 2. A REFUSAL MUST NOT `RAISE`. A RAISE rolls back the sync_log row recording
--    the refusal, leaving the failure only in cron.job_run_details -- invisible
--    to atlas_sync_status, stuck_syncs and feed_coverage alike.
--
-- 3. `clock_timestamp()`, NEVER `now()`, to close. now() is the TRANSACTION
--    timestamp, so finished_at would equal started_at and duration_ms would be
--    0 on every run. And duration_ms is GENERATED ALWAYS -- never write it.
--
-- 4. THREE OUTCOMES, NOT TWO. An idempotent re-run logs `skipped`, never
--    `success` with zero rows written. Dressing the ordinary case up as a
--    successful write is what hid a silent no-op for weeks in two other jobs.

create or replace function public.atlas_write_var_backtest(
  p_logic_version text      default 'v1',
  p_confs         numeric[] default array[0.90, 0.95, 0.99]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_log_id     bigint;
  v_as_of      date;
  v_cvar_as_of date;
  v_written    int := 0;
  v_present    int := 0;
  v_n          int;
  v_conf       numeric;
begin
  insert into public.sync_log (function_name, source, status, started_at)
  values ('atlas_write_var_backtest', 'pg_cron', 'running', clock_timestamp())
  returning id into v_log_id;

  select max(f.date) into v_as_of
  from public.vw_factor_return_panel f where f.complete_z;

  select max(c.as_of) into v_cvar_as_of from public.book_regime_cvar c;

  if v_as_of is null or v_cvar_as_of is distinct from v_as_of then
    update public.sync_log
       set status = 'skipped', finished_at = clock_timestamp(),
           details = jsonb_build_object(
             'reason', 'no regime cvar snapshot for the latest panel session',
             'as_of', v_as_of,
             'cvar_as_of', v_cvar_as_of)
     where id = v_log_id;
    return;
  end if;

  select count(*) into v_present
  from public.var_backtest_runs r
  where r.as_of = v_as_of and r.logic_version = p_logic_version;

  if v_present = 0 then
    foreach v_conf in array p_confs loop
      with ins as (
        insert into public.var_backtest_runs
          (as_of, cvar_as_of, logic_version, leg, basis, axis_key, conf,
           window_start, window_end, n_obs, exceptions,
           var_pred_daily, cvar_pred_daily, cvar_pred_on_exceptions,
           cvar_realised_daily, sd_pred_daily, sd_realised_daily,
           sd_factor_window, sd_residual_window,
           kupiec_lr, kupiec_reject_05, kupiec_reject_01, betas_estimated_at)
        select b.as_of, b.cvar_as_of, p_logic_version, b.leg, b.basis, b.axis_key, b.conf,
               b.window_start, b.window_end, b.n_obs, b.exceptions,
               b.var_pred_daily, b.cvar_pred_daily, b.cvar_pred_on_exceptions,
               b.cvar_realised_daily, b.sd_pred_daily, b.sd_realised_daily,
               b.sd_factor_window, b.sd_residual_window,
               b.kupiec_lr,
               b.kupiec_lr > 3.841459,
               b.kupiec_lr > 6.634897,
               b.betas_estimated_at
        from public.atlas_var_backtest(v_conf) b
        returning 1
      )
      select count(*) into v_n from ins;
      v_written := v_written + v_n;
    end loop;
  end if;

  if v_written > 0 then
    update public.sync_log
       set status = 'success', finished_at = clock_timestamp(),
           details = jsonb_build_object(
             'as_of', v_as_of, 'cvar_as_of', v_cvar_as_of,
             'rows_written', v_written, 'rows_present', v_present,
             'confs', to_jsonb(p_confs), 'logic_version', p_logic_version)
     where id = v_log_id;
  elsif v_present > 0 then
    update public.sync_log
       set status = 'skipped', finished_at = clock_timestamp(),
           details = jsonb_build_object(
             'reason', 'already written for this as_of',
             'as_of', v_as_of, 'rows_present', v_present)
     where id = v_log_id;
  else
    update public.sync_log
       set status = 'error', finished_at = clock_timestamp(),
           details = jsonb_build_object(
             'reason', 'produced no rows and none present',
             'as_of', v_as_of, 'cvar_as_of', v_cvar_as_of)
     where id = v_log_id;
    raise warning 'atlas_write_var_backtest produced no rows for as_of %', v_as_of;
  end if;
end;
$fn$;

comment on function public.atlas_write_var_backtest(text, numeric[]) is
  'Nightly writer for var_backtest_runs. Gates on book_regime_cvar holding a snapshot for the session being graded -- the dependency itself, not the upstream job''s status, which is `skipped` on a legitimate idempotent re-run. Refuses by UPDATEing its own sync_log row, never by RAISE.';

revoke execute on function public.atlas_write_var_backtest(text, numeric[]) from public, anon, authenticated;

-- 23:50 Mon-Sat: five minutes after atlas_write_regime_cvar, whose snapshot it
-- grades. Mon-Sat because the factor layer both depend on runs Mon-Sat.
select cron.unschedule('atlas_write_var_backtest')
where exists (select 1 from cron.job where jobname = 'atlas_write_var_backtest');

select cron.schedule(
  'atlas_write_var_backtest',
  '50 23 * * 1-6',
  $c$select public.atlas_write_var_backtest();$c$
);
