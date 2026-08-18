-- ============================================================
-- Two fixes from the chain's first live run (2026-08-17)
-- ============================================================

-- 1. trade_sync_all exceeded its budget and wrote nothing.
--
-- '/api/trade-sync?job=all' runs correlations, signals, coherence, universe
-- and triggers in one invocation. It hit pg_net's 300s timeout, and raising
-- that would not help: api/trade-sync.js has maxDuration 300 in vercel.json,
-- so Vercel kills it at the same instant. signal_scores was therefore still
-- frozen at 2026-08-11 while every other stage of the night succeeded --
-- assets, ledger and options all returned 200.
--
-- The endpoint already exposes each sub-job separately, and they have a real
-- dependency order, so the chain now walks them as its own stages. Each does
-- strictly less work than 'all', and -- the point -- each reports its own
-- status and duration, so a stage that is still too slow names itself instead
-- of hiding inside one opaque failure.
--
-- Spaced 10 minutes apart: double the 300s ceiling, so a slow stage cannot
-- collide with the next one.
select cron.unschedule('chain_trade_sync_all');

select cron.schedule('chain_ts_correlations', '35 22 * * 1-5',
  $c$select public.atlas_chain_dispatch('ts_correlations', '/api/trade-sync?job=correlations', true);$c$);
select cron.schedule('chain_ts_signals', '45 22 * * 1-5',
  $c$select public.atlas_chain_dispatch('ts_signals', '/api/trade-sync?job=signals', true);$c$);
select cron.schedule('chain_ts_coherence', '55 22 * * 1-5',
  $c$select public.atlas_chain_dispatch('ts_coherence', '/api/trade-sync?job=coherence', true);$c$);
select cron.schedule('chain_ts_universe', '5 23 * * 1-5',
  $c$select public.atlas_chain_dispatch('ts_universe', '/api/trade-sync?job=universe', true);$c$);
select cron.schedule('chain_ts_triggers', '12 23 * * 1-5',
  $c$select public.atlas_chain_dispatch('ts_triggers', '/api/trade-sync?job=triggers', true);$c$);

-- 2. duration_ms on chain stages was measuring the wrong thing.
--
-- The reaper set finished_at = now(), but the reaper runs every 15 minutes, so
-- every stage reported a duration quantised to the reap interval -- last night
-- four stages all showed ~900,000 ms, which is the reap lag, not the request.
-- That made the one real signal in the column (how long a stage actually took,
-- i.e. how close it is to the 300s ceiling) completely unreadable.
--
-- pg_net records when the response arrived; use that. greatest() guards the
-- degenerate case where the response predates the row somehow, so the
-- GENERATED duration can never come out negative.
create or replace function public.atlas_chain_reap()
returns integer language plpgsql security definer set search_path to 'public'
as $$
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
            -- The response's arrival time, not the reaper's wall clock.
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

    return v_closed;
end;
$$;
