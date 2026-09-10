-- C5 runner: wraps the unchanged check with a sync_log row and an
-- atlas_validation_log row, and schedules it.
--
-- Status mapping. The spec asks for "partial on divergence", and partial is
-- also right for a coverage gap: the run did what it was asked and found
-- something, which is not the same as the run failing. The one error case is
-- having nothing to compare -- a check that cannot see its inputs must not
-- report health (three prior instances of that pattern in this codebase).
--
-- Refusal is an UPDATE and a RETURN, never a RAISE: a RAISE rolls back the
-- very sync_log row that records the refusal and leaves the failure visible
-- only in cron.job_run_details.
--
-- clock_timestamp(), not now(): now() is the TRANSACTION timestamp and
-- started_at defaults to it, so now() would report every run as 0 ms.
-- duration_ms is GENERATED ALWAYS and is never written.

create or replace function public.atlas_run_feed_reconciliation()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    r        record;
    v_log_id bigint;
    v_status text;
begin
    insert into public.sync_log (function_name, status, source, details)
    values ('atlas_feed_reconciliation', 'running', 'pg_cron',
            jsonb_build_object('sessions', 5, 'threshold_bps', 25))
    returning id into v_log_id;

    select * into r from public.atlas_check_feed_reconciliation(5, 25);

    insert into public.atlas_validation_log (check_name, status, severity, message, details)
    values (r.check_name, r.status, r.severity, r.message, coalesce(r.details, '{}'::jsonb));

    v_status := case
        when r.status = 'passed'                              then 'success'
        when r.severity = 'critical'                          then 'error'
        else 'partial'                                        -- divergence or coverage gap
    end;

    update public.sync_log
       set status        = v_status,
           finished_at   = clock_timestamp(),
           error_message = case when v_status = 'error' then r.message else null end,
           details       = coalesce(r.details, '{}'::jsonb)
                           || jsonb_build_object('check_status', r.status, 'message', r.message)
     where id = v_log_id;
end;
$function$;

revoke execute on function public.atlas_run_feed_reconciliation() from public, anon, authenticated;

-- 23:25 UTC Mon-Sat: after the Alpaca universe leg (23:20) and the Yahoo leg
-- (22:50), before atlas_run_validation (23:40) so the night's result is on
-- file when validation reports. Mon-Sat matches both price feeds' cadence.
select cron.schedule('atlas_feed_reconciliation_nightly', '25 23 * * 1-6',
                     $$select public.atlas_run_feed_reconciliation();$$);
