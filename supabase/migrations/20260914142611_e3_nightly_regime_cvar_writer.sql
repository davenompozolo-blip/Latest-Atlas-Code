-- E3 / B2, step 5. Nightly writer, with the three lessons this codebase has
-- already paid for wired in from the start.
--
-- 1. GATE ON WHAT THE WRITER LOGS, NOT ON THE JOB NAME. The upstream cron job is
--    called `refresh_factor_scores_nightly`; the sync_log row it produces
--    carries function_name = 'atlas_refresh_factor_scores'. Gating on the job
--    name matches nothing and skips forever, silently. (C4, 2026-09-09.)
--
-- 2. A REFUSAL MUST NOT `RAISE`. A RAISE rolls back the sync_log row recording
--    the refusal, leaving the failure only in cron.job_run_details -- invisible
--    to atlas_sync_status, stuck_syncs and feed_coverage alike. Validate,
--    UPDATE the row, RETURN. (A3.1, 2026-09-08.)
--
-- 3. `clock_timestamp()`, NEVER `now()`, TO CLOSE. now() is the TRANSACTION
--    timestamp and is constant for the life of the transaction, so finished_at
--    would equal started_at and duration_ms would be 0 on every run. And
--    duration_ms is GENERATED ALWAYS -- never write it. (C4, 2026-09-09.)
--
-- `as_of` is the last session IN THE PANEL, never CURRENT_DATE. A date derived
-- from wall-clock is a claim about a session, and a weekday feed is not late on
-- a Sunday.

create or replace function public.atlas_write_regime_cvar(
  p_logic_version text    default 'v1',
  p_conf          numeric default 0.95
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_log_id     bigint;
  v_as_of      date;
  v_upstream   text;
  v_written    int := 0;
  v_present    int := 0;
  v_axes       text[] := array['cyclical','concentration','dollar'];
  v_axis       text;
begin
  insert into public.sync_log (function_name, source, status, started_at)
  values ('atlas_write_regime_cvar', 'pg_cron', 'running', clock_timestamp())
  returning id into v_log_id;

  select max(date) into v_as_of
  from public.vw_factor_return_panel where complete_z;

  -- Gate: the factor layer must have produced a row for this run date.
  select status into v_upstream
  from public.sync_log
  where function_name = 'atlas_refresh_factor_scores'
    and started_at::date = clock_timestamp()::date
  order by started_at desc limit 1;

  if v_upstream is distinct from 'success' then
    update public.sync_log
       set status = 'skipped',
           finished_at = clock_timestamp(),
           details = jsonb_build_object(
             'reason', 'factor scores not refreshed today',
             'upstream_status', coalesce(v_upstream, 'no row'),
             'as_of', v_as_of)
     where id = v_log_id;
    return;
  end if;

  select count(*) into v_present
  from public.book_regime_cvar
  where as_of = v_as_of and logic_version = p_logic_version and conf = p_conf;

  if v_present = 0 then
    foreach v_axis in array v_axes loop
      insert into public.book_regime_cvar
        (as_of, logic_version, axis_key, bucket, bucket_label, n_obs, z_lo, z_hi,
         lw_delta, betas_estimated_at, conf, vol_daily, vol_annual, var_daily,
         cvar_daily, vol_ratio_vs_unconditional, vol_daily_unshrunk)
      select v_as_of, p_logic_version, r.axis_key, r.bucket, r.bucket_label,
             r.n_obs, r.z_lo, r.z_hi, r.lw_delta, r.betas_estimated_at, p_conf,
             r.vol_daily, r.vol_annual, r.var_daily, r.cvar_daily,
             r.vol_ratio_vs_unconditional, r.vol_daily_unshrunk
      from public.atlas_regime_cvar(v_axis, 4, p_conf) r;
      v_written := v_written + (select count(*) from public.atlas_regime_cvar(v_axis, 4, p_conf));
    end loop;
  end if;

  -- Three outcomes, kept apart. The middle row is the ordinary idempotent
  -- re-run; calling it `success` is what hid the third case in the verdict job.
  if v_written > 0 then
    update public.sync_log
       set status = 'success', finished_at = clock_timestamp(),
           rows_processed = v_written,
           details = jsonb_build_object('as_of', v_as_of, 'rows_written', v_written,
                                        'rows_present', v_present, 'conf', p_conf,
                                        'logic_version', p_logic_version)
     where id = v_log_id;
  elsif v_present > 0 then
    update public.sync_log
       set status = 'skipped', finished_at = clock_timestamp(),
           details = jsonb_build_object('reason', 'already written for this as_of',
                                        'as_of', v_as_of, 'rows_present', v_present)
     where id = v_log_id;
  else
    update public.sync_log
       set status = 'error', finished_at = clock_timestamp(),
           details = jsonb_build_object('reason', 'produced no rows and none present',
                                        'as_of', v_as_of)
     where id = v_log_id;
  end if;
end;
$fn$;

comment on function public.atlas_write_regime_cvar(text,numeric) is
  'Nightly writer for book_regime_cvar. Gates on atlas_refresh_factor_scores having succeeded today -- the EDGE FUNCTION name, not the cron job name. Refuses by UPDATEing its own sync_log row, never by RAISE.';

revoke execute on function public.atlas_write_regime_cvar(text,numeric) from public, anon, authenticated;

-- 23:45 Mon-Sat: after validation at 23:40, and well clear of the 22:30-23:15
-- trade chain. Mon-Sat because the factor layer it gates on runs Mon-Sat.
select cron.unschedule('atlas_write_regime_cvar')
where exists (select 1 from cron.job where jobname = 'atlas_write_regime_cvar');

select cron.schedule(
  'atlas_write_regime_cvar',
  '45 23 * * 1-6',
  $c$select public.atlas_write_regime_cvar();$c$
);
