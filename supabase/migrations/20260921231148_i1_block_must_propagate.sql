-- I-1: a block has to propagate, and as first written it did not.
--
-- Forced failure test: ts_correlations set to error, its downstream cleared,
-- one tick. Result:
--
--   blocked: [ts_signals]
--   fired:   [ts_coherence, ts_universe, ts_triggers, ts_clusters,
--             write_verdicts, write_segment_verdicts, refresh_cluster_identity,
--             run_validation, log_universe_price_coverage]
--
-- ts_signals was blocked correctly and then EVERY stage below it ran. The
-- mechanism: a blocked stage records itself 'skipped', and 'skipped' is a pass,
-- so ts_coherence read its own blocked predecessor as a stage that had simply
-- declined to do work. hard=true stopped at exactly one level.
--
-- That is worse than the clock gaps this unit replaces -- there, at least, a
-- failed stage's successors ran on stale input rather than absent input.
--
-- 'skipped' is doing two jobs: "I declined to work" (no CRON_SECRET, price gate
-- not met, already written for this as_of) and "I was not allowed to run". The
-- first is terminal and releases successors. The second is a failure wearing a
-- skip, and must keep propagating. details.reason tells them apart, so the row
-- stays honest about what happened while the chain stops.

create or replace function public.atlas_chain_stage_status(
    p_stage     text,
    p_source    text,
    p_day_start timestamptz
) returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
    s record;
    d record;
    v_probe text;
begin
    select * into s from public.atlas_chain_stages where stage = p_stage;
    if not found then
        return 'unknown';
    end if;

    select l.status, l.started_at, l.finished_at, l.details into d
    from sync_log l
    where l.function_name = p_stage
      and l.source        = p_source
      and l.started_at   >= p_day_start
    order by l.started_at desc
    limit 1;

    if not found then
        return 'not_started';
    end if;

    if d.status = 'skipped' then
        -- A stage skipped because its OWN upstream failed is not a stage that
        -- declined to work. Returning 'skipped' here releases its successors
        -- and the block dies after one level.
        if coalesce(d.details->>'reason', '') like 'upstream_%' then
            return 'error';
        end if;
        return 'skipped';
    end if;

    if d.status = 'error'   then return 'error';   end if;
    if d.status = 'running' then return 'running'; end if;

    -- d.status is 'success'. For a stage that returns on completion that is the
    -- answer; for one that answers early it is only the acknowledgement.
    if s.completion_log_name is null then
        return 'success';
    end if;

    select l.status into v_probe
    from sync_log l
    where l.function_name = s.completion_log_name
      and l.source        = s.completion_source
      and l.started_at   >= d.started_at - interval '30 seconds'
      and l.started_at   <= d.started_at + make_interval(secs => s.max_wait_s + 60)
      and l.status in ('success','partial','skipped','error')
    order by l.started_at desc
    limit 1;

    if v_probe is not null then
        return case when v_probe = 'error' then 'error' else 'success' end;
    end if;

    if clock_timestamp() > d.started_at + make_interval(secs => s.max_wait_s) then
        return 'unobserved';
    end if;

    return 'running';
end;
$fn$;

revoke execute on function public.atlas_chain_stage_status(text, text, timestamptz)
    from public, anon, authenticated;
