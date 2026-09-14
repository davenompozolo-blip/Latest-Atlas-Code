-- E3 fix. The writer set `rows_processed` on sync_log and that column does not
-- exist -- the table's counters are positions_seen / positions_upserted /
-- transactions_upserted / prices_upserted, none of which fit a risk job. The
-- success branch would have raised 42703 on its FIRST scheduled run, and
-- because that raise happens inside the function it would have rolled back the
-- sync_log row recording it: the failure would have existed only in
-- cron.job_run_details. Exactly the invisible-failure shape A3.1 documented.
--
-- Caught by reading information_schema rather than by the job failing at 23:45.
-- The count lives in details.rows_written, which it already carried.

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
  v_log_id   bigint;
  v_as_of    date;
  v_upstream text;
  v_written  int := 0;
  v_present  int := 0;
  v_axes     text[] := array['cyclical','concentration','dollar'];
  v_axis     text;
  v_n        int;
begin
  insert into public.sync_log (function_name, source, status, started_at)
  values ('atlas_write_regime_cvar', 'pg_cron', 'running', clock_timestamp())
  returning id into v_log_id;

  select max(date) into v_as_of
  from public.vw_factor_return_panel where complete_z;

  -- Gate on the WRITER's name in sync_log, not the cron job's name.
  select status into v_upstream
  from public.sync_log
  where function_name = 'atlas_refresh_factor_scores'
    and started_at::date = clock_timestamp()::date
  order by started_at desc limit 1;

  if v_upstream is distinct from 'success' then
    update public.sync_log
       set status = 'skipped', finished_at = clock_timestamp(),
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
      with ins as (
        insert into public.book_regime_cvar
          (as_of, logic_version, axis_key, bucket, bucket_label, n_obs, z_lo, z_hi,
           lw_delta, betas_estimated_at, conf, vol_daily, vol_annual, var_daily,
           cvar_daily, vol_ratio_vs_unconditional, vol_daily_unshrunk)
        select v_as_of, p_logic_version, r.axis_key, r.bucket, r.bucket_label,
               r.n_obs, r.z_lo, r.z_hi, r.lw_delta, r.betas_estimated_at, p_conf,
               r.vol_daily, r.vol_annual, r.var_daily, r.cvar_daily,
               r.vol_ratio_vs_unconditional, r.vol_daily_unshrunk
        from public.atlas_regime_cvar(v_axis, 4, p_conf) r
        returning 1
      )
      select count(*) into v_n from ins;
      v_written := v_written + v_n;
    end loop;
  end if;

  if v_written > 0 then
    update public.sync_log
       set status = 'success', finished_at = clock_timestamp(),
           details = jsonb_build_object('as_of', v_as_of, 'rows_written', v_written,
                                        'rows_present', v_present, 'conf', p_conf,
                                        'logic_version', p_logic_version,
                                        'axes', to_jsonb(v_axes))
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

revoke execute on function public.atlas_write_regime_cvar(text,numeric) from public, anon, authenticated;
