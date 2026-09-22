-- I-1: bound the completion probe's search window at BOTH ends.
--
-- As first written the probe was `started_at >= dispatch - 30s` with no upper
-- bound, so it would accept any later row from the same handler under the same
-- source -- including one belonging to a subsequent dispatch. Within a single
-- night that is mostly harmless, which is exactly why it would have survived
-- inspection; it was found by writing the test, where a sentinel dispatch dated
-- in the past happily matched a real row from today.
--
-- The window a dispatch can legitimately be answered in is bounded by the same
-- max_wait_s that decides 'unobserved', plus a minute of slack. Beyond that the
-- answer is not this dispatch's answer.

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

    select l.status, l.started_at, l.finished_at into d
    from sync_log l
    where l.function_name = p_stage
      and l.source        = p_source
      and l.started_at   >= p_day_start
    order by l.started_at desc
    limit 1;

    if not found then
        return 'not_started';
    end if;

    -- A dispatch that never left the gate is terminal on its own account: no
    -- secret, gate not met, or the shadow plan's recorded decision.
    if d.status = 'skipped' then return 'skipped'; end if;
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
