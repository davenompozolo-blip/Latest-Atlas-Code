-- 1. Clustering becomes its own chain stage.
--
-- ts_correlations posted /api/trade-sync?job=correlations, which wrote the
-- matrix (~203s) and then read all ~88,000 pairs back and clustered them. The
-- combined request never returned inside pg_net's 300s, so every night the
-- chain logged an ERROR on a stage whose work had actually succeeded --
-- universe_correlations landing 88,116 pairs across 421 symbols -- and Vercel
-- killed the function before its own closeLog could run, leaving a
-- trade_sync_correlations row open in 'running'. One more every night.
--
-- 23:30, after ts_triggers (23:12) and before validation (23:40), gated on
-- prices like the rest of the chain.
select cron.unschedule('chain_ts_clusters')
where exists (select 1 from cron.job where jobname = 'chain_ts_clusters');

select cron.schedule('chain_ts_clusters', '30 23 * * 1-5',
  $c$select public.atlas_chain_dispatch('ts_clusters', '/api/trade-sync?job=clusters', true);$c$);

-- 2. The reaper could not see the rows that were actually stuck.
--
-- atlas_chain_reap() only ever closed source='pg_cron_chain' rows -- the ones
-- carrying a pg_net request_id. The rows piling up were written by the Vercel
-- handler itself with source='vercel_cron', so nothing could ever close them
-- when the function was killed mid-flight. They grew without bound and
-- stuck_syncs warned about them nightly with no way for anyone to clear it.
--
-- A handler row open past 2h is dead by definition: every Vercel function here
-- budgets 300s. Close it as an error rather than leaving it to accumulate.
create or replace function public.atlas_chain_reap()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_closed integer := 0;
begin
    with open_rows as (
        select sl.id, safe_bigint(sl.details->>'request_id') as req_id, sl.started_at
        from sync_log sl
        where sl.source = 'pg_cron_chain' and sl.status = 'running' and sl.details ? 'request_id'
    ),
    matched as (
        select o.id, o.started_at, r.status_code, r.error_msg, r.timed_out, r.content, r.created
        from open_rows o join net._http_response r on r.id = o.req_id
    ),
    upd as (
        update sync_log sl set
            status = case when m.status_code between 200 and 299 then 'success' else 'error' end,
            finished_at = greatest(m.created, sl.started_at),
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

    -- Orphaned handler rows: the function died before it could close its own
    -- row. Nothing else will ever do it.
    update sync_log set status = 'error', finished_at = now(),
        error_message = coalesce(error_message,
            'Handler never closed this row - function killed before completing (open >2h)')
    where source <> 'pg_cron_chain' and status = 'running'
      and started_at < now() - interval '2 hours';

    return v_closed;
end;
$function$;

select public.atlas_chain_reap();
