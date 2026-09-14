-- A3 v0.1-structural, part 6. Point the nightly writer at the corrected version.
--
-- The job was pinned to 'v0-uncalibrated' in five places. Leaving it there would
-- have kept appending to the SUPERSEDED series every night while the corrected
-- one stopped at the backfill -- the two would have diverged silently and the
-- newer history would have been the shorter one.
--
-- v0-uncalibrated's stored rows are untouched and remain reproducible: the
-- engine reads its semantics from regime_logic_versions, which pins it to the
-- original same-session conjunction and dormant-abort behaviour.

CREATE OR REPLACE FUNCTION public.atlas_write_theme_states()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_log_id  bigint;
  v_macro   text;
  v_factor  text;
  v_spine   date;
  v_written int;
  v_trans   int;
  v_present int;
  v_digest  text;
  v_status  text;
  v_reason  text;
begin
  insert into public.sync_log (function_name, status, source, details)
  values ('atlas_write_theme_states', 'running', 'pg_cron',
          jsonb_build_object('logic_version', 'v0.1-structural',
                             'gate', 'load_macro_series and atlas_refresh_factor_scores today'))
  returning id into v_log_id;

  -- GATE ON WHAT THE WRITER LOGS, not on what the cron job is called. The macro
  -- load's rows carry function_name = 'load_macro_series' and the factor
  -- refresh's carry 'atlas_refresh_factor_scores' -- the EDGE FUNCTION and the
  -- inner function respectively, neither of which is its job name.
  select s.status into v_macro from public.sync_log s
   where s.function_name = 'load_macro_series' and s.started_at::date = current_date
   order by s.id desc limit 1;

  -- 'skipped' is a pass for the factor job: it logs skipped on an idempotent
  -- re-run, which means the score layer is already current for this session.
  -- The macro loader has no such path -- it answers error on a no-op -- so only
  -- success counts there.
  select s.status into v_factor from public.sync_log s
   where s.function_name = 'atlas_refresh_factor_scores' and s.started_at::date = current_date
   order by s.id desc limit 1;

  select max(p.date) into v_spine from public.market_prices p where p.symbol = 'SPY';

  if v_macro is distinct from 'success'
     or coalesce(v_factor, '(none)') not in ('success', 'skipped') then
    -- VALIDATE BEFORE YOU WRITE, and refuse with an UPDATE rather than a RAISE:
    -- a RAISE rolls back its own sync_log row and the refusal then exists only
    -- in cron.job_run_details, which nothing on this platform monitors.
    update public.sync_log
       set status = 'skipped', finished_at = clock_timestamp(),
           details = details || jsonb_build_object(
             'reason', format('upstream not ready: load_macro_series=%s, atlas_refresh_factor_scores=%s',
                              coalesce(v_macro, '(has not run today)'),
                              coalesce(v_factor, '(has not run today)')),
             'macro_status', v_macro, 'factor_status', v_factor, 'session', v_spine)
     where id = v_log_id;
    return;
  end if;

  perform public.atlas_evaluate_themes('v0.1-structural');
  select p.states_written, p.transitions_written into v_written, v_trans
    from public.atlas_persist_theme_run('v0.1-structural') p;

  select count(*) into v_present from public.regime_theme_states r
   where r.logic_version = 'v0.1-structural' and r.as_of = v_spine;

  -- Section 6's reproducibility digest: one session's discrete states, which is
  -- the case where hashing is safe. Never hash a rounded float series -- across
  -- 100k rows some value always sits on a rounding boundary and the hash breaks
  -- however small the real difference is.
  select md5(string_agg(r.theme_key || '|' || r.state || '|' ||
                        coalesce(round(r.strength, 6)::text, 'null'), E'\n' order by r.theme_key))
    into v_digest
    from public.regime_theme_states r
   where r.logic_version = 'v0.1-structural' and r.as_of = v_spine;

  -- Three outcomes. The idempotent re-run is `skipped`, never `success` with
  -- zero rows -- dressing one up as the other is what hid two silent no-ops in
  -- this codebase already.
  if v_written > 0 then
    v_status := 'success';
  elsif v_present > 0 then
    v_status := 'skipped';
    v_reason := format('already written for %s', v_spine);
  else
    v_status := 'error';
    v_reason := format('nothing written and no state row exists for session %s',
                       coalesce(v_spine::text, '(no SPY session)'));
  end if;

  update public.sync_log
     set status = v_status, finished_at = clock_timestamp(),
         error_message = case when v_status = 'error' then v_reason end,
         details = details || jsonb_build_object(
           'states_written', v_written, 'transitions_written', v_trans,
           'rows_present_for_session', v_present, 'session', v_spine,
           'state_digest', v_digest, 'macro_status', v_macro,
           'factor_status', v_factor, 'reason', v_reason)
   where id = v_log_id;
  -- No RAISE even on error, for the same reason the gate does not raise: the
  -- row above IS the alarm, and rolling it back to satisfy cron.job_run_details
  -- would trade the monitored surface for the unmonitored one.
end;
$function$
