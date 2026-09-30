-- LG-1: the 10-minute holdings job logs every step, and one failing step can
-- no longer erase the others' log rows.
--
-- Cron job 11 runs `select refresh_cortex_screener(); select
-- refresh_nexus_holdings();`, which is ONE transaction. Two of its four steps
-- (the cortex screener and the book candidate map, both REFRESH MATERIALIZED
-- VIEW) wrote nothing to sync_log, and an exception in either rolled back the
-- sync_log rows the other two had already written -- so a failure would have
-- existed only in cron.job_run_details, the "RAISE rolls back its own log row"
-- shape recorded in CLAUDE.md. No such failure in 2,012 runs over 14 days;
-- fixed while nothing is on fire.
--
-- atlas_run_logged_step runs one statement in its own subtransaction, writes a
-- sync_log row for it (always for a step that logs nothing itself, on failure
-- only for one that already logs its own rows), and never raises.
--
-- Also: refresh_cortex_screener() was SECURITY DEFINER and EXECUTABLE BY ANON
-- through the default PUBLIC grant, so anyone holding the publishable key could
-- trigger a concurrent matview refresh on demand. Nothing in src/, api/ or the
-- edge functions calls it. Revoked here, with refresh_nexus_holdings, and both
-- asserted with has_function_privilege.

create or replace function public.atlas_run_logged_step(
    p_function_name text,
    p_sql           text,
    p_log_success   boolean default true
) returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
    v_start timestamptz := clock_timestamp();
    v_err   text;
begin
    begin
        execute p_sql;
    exception when others then
        get stacked diagnostics v_err = message_text;
        insert into public.sync_log (function_name, source, status, started_at, finished_at, error_message, details)
        values (p_function_name, 'pg_cron', 'error', v_start, clock_timestamp(), v_err,
                jsonb_build_object('step', p_sql));
        raise warning 'atlas_run_logged_step %: %', p_function_name, v_err;
        return false;
    end;
    if p_log_success then
        insert into public.sync_log (function_name, source, status, started_at, finished_at, details)
        values (p_function_name, 'pg_cron', 'success', v_start, clock_timestamp(),
                jsonb_build_object('step', p_sql));
    end if;
    return true;
end;
$fn$;

create or replace function public.refresh_cortex_screener()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
    perform public.atlas_run_logged_step('refresh_cortex_screener',
        'refresh materialized view concurrently public.mv_cortex_screener');
end;
$fn$;

create or replace function public.refresh_nexus_holdings()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
    -- These two write their own per-account sync_log rows; log only a failure.
    perform public.atlas_run_logged_step('refresh_nexus_holdings_analytics',
        'select public.atlas_refresh_nexus_holdings_analytics()', false);
    perform public.atlas_run_logged_step('refresh_bench_contribution',
        'select public.atlas_refresh_bench_contribution()', false);
    perform public.atlas_run_logged_step('refresh_book_candidate_map',
        'refresh materialized view concurrently public.mv_book_candidate_map');
end;
$fn$;

revoke execute on function public.atlas_run_logged_step(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.refresh_cortex_screener() from public, anon, authenticated;
revoke execute on function public.refresh_nexus_holdings() from public, anon, authenticated;
grant execute on function public.atlas_run_logged_step(text, text, boolean) to service_role;
grant execute on function public.refresh_cortex_screener() to service_role;
grant execute on function public.refresh_nexus_holdings() to service_role;

do $$
declare
    f text;
    r text;
begin
    foreach f in array array[
        'public.atlas_run_logged_step(text, text, boolean)',
        'public.refresh_cortex_screener()',
        'public.refresh_nexus_holdings()'
    ] loop
        foreach r in array array['anon', 'authenticated'] loop
            if has_function_privilege(r, f, 'execute') then
                raise exception 'LG-1: % is executable by %', f, r;
            end if;
        end loop;
    end loop;
end $$;
