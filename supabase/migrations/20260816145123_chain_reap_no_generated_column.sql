-- duration_ms is GENERATED ALWAYS from (finished_at - started_at). Assigning to
-- it is an error, so the reaper must set finished_at and let the column derive
-- itself. This is the same defect that kept 41 sync_funddata_prices rows open.
create or replace function public.atlas_chain_reap()
returns integer language plpgsql security definer set search_path to 'public'
as $$
declare
    v_closed integer := 0;
begin
    with open_rows as (
        select sl.id, (sl.details->>'request_id')::bigint as req_id, sl.started_at
        from sync_log sl
        where sl.source = 'pg_cron_chain' and sl.status = 'running' and sl.details ? 'request_id'
    ),
    matched as (
        select o.id, o.started_at, r.status_code, r.error_msg, r.timed_out, r.content
        from open_rows o join net._http_response r on r.id = o.req_id
    ),
    upd as (
        update sync_log sl set
            status = case when m.status_code between 200 and 299 then 'success' else 'error' end,
            finished_at = now(),
            error_message = case
                when m.status_code between 200 and 299 then null
                else coalesce(m.error_msg, 'HTTP ' || coalesce(m.status_code::text, '?'))
                     || case when m.content is not null then ' - ' || left(m.content, 300) else '' end end,
            details = sl.details || jsonb_build_object('status_code', m.status_code, 'timed_out', m.timed_out)
        from matched m where sl.id = m.id
        returning 1
    )
    select count(*) into v_closed from upd;

    update sync_log set status = 'error', finished_at = now(),
        error_message = coalesce(error_message, 'No pg_net response recorded before retention expiry')
    where source = 'pg_cron_chain' and status = 'running' and started_at < now() - interval '2 hours';

    return v_closed;
end;
$$;
