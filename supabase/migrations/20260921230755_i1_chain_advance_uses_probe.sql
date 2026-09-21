-- I-1: grade a stage by its COMPLETION, not by its dispatch response.
--
-- atlas_chain_stage_status() is the single place that decides whether a stage
-- has finished, so the advance loop cannot hold a second opinion. It returns:
--
--   not_started  no dispatch row today
--   running      dispatched, outcome not yet observable
--   success      finished (a 'partial' probe counts -- see below)
--   skipped      declined before doing work; terminal, and successors proceed
--   error        failed
--   unobserved   probe never went terminal within max_wait_s
--
-- 'unobserved' is deliberately NOT folded into either success or error. A stage
-- whose completion cannot be seen has not been seen to complete, and saying so
-- is the difference between a pipeline that reports what happened and one that
-- reports what it assumed.
--
-- 'partial' counts as success because on this platform it is the HEALTHY
-- outcome: sync_portfolio_history reports partial when it correctly flags a
-- stale_snapshot row, and sync_fundamentals when it stops at its wall-clock
-- budget having processed what it could. Treating partial as failure would
-- block the chain nightly on jobs that are working as designed.

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


create or replace function public.atlas_chain_advance(
    p_shadow    boolean default true,
    p_budget_ms integer default 45000
) returns jsonb
language plpgsql
security definer
set search_path = public, net, pg_temp
as $fn$
declare
    v_start     timestamptz := clock_timestamp();
    v_today     date        := current_date;
    v_day_start timestamptz := v_today::timestamptz;
    v_dow       smallint    := extract(dow from v_today)::smallint;
    v_source    text        := case when p_shadow then 'pg_cron_chain_shadow'
                                    else 'pg_cron_chain' end;
    v_fired     jsonb := '[]'::jsonb;
    v_blocked   jsonb := '[]'::jsonb;
    v_dep       text;
    v_log_id    bigint;
    v_req_id    bigint;
    v_body      jsonb;
    v_err       text;
    r           record;
begin
    -- pg_cron happily runs overlapping instances of the same job, and a sql
    -- stage can hold the tick for 27s. Without this, two ticks fire the same
    -- stage twice.
    if not pg_try_advisory_lock(hashtext('atlas_chain_advance')) then
        return jsonb_build_object('locked', true, 'tick_at', v_start);
    end if;

    -- Close finished http/edge dispatch rows first. This grades the response,
    -- not the work -- atlas_chain_stage_status() is what grades the work.
    perform public.atlas_chain_reap();

    for r in
        select s.* from public.atlas_chain_stages s
        where s.enabled
          and v_dow = any(s.dow)
          and (s.not_before is null or clock_timestamp()::time >= s.not_before)
          and not exists (
                select 1 from sync_log l
                where l.function_name = s.stage
                  and l.source       = v_source
                  and l.started_at  >= v_day_start)
        order by s.seq
    loop
        exit when clock_timestamp() - v_start
                  > make_interval(secs => p_budget_ms / 1000.0);

        -- Dependency. NULL means chain head.
        if r.depends_on is not null then
            v_dep := public.atlas_chain_stage_status(
                         r.depends_on, v_source, v_day_start);

            -- Not terminal yet: wait. The ordinary case, and silent.
            if v_dep in ('not_started', 'running') then
                continue;
            end if;

            -- hard=true is a real data dependency, so an upstream that failed
            -- or could not be observed stops here. hard=false is ordering only
            -- and any terminal state releases it.
            if r.hard and v_dep in ('error', 'unobserved') then
                insert into sync_log (function_name, status, source, started_at,
                                      finished_at, error_message, details)
                values (r.stage, 'skipped', v_source, clock_timestamp(),
                        clock_timestamp(),
                        'blocked: hard dependency ' || r.depends_on || ' ended ' || v_dep,
                        jsonb_build_object('reason','upstream_' || v_dep,
                                           'depends_on', r.depends_on,
                                           'shadow', p_shadow));
                v_blocked := v_blocked || to_jsonb(r.stage);
                continue;
            end if;
        end if;

        -- ---- eligible ----------------------------------------------------
        if p_shadow then
            insert into sync_log (function_name, status, source, started_at,
                                  finished_at, error_message, details)
            values (r.stage, 'skipped', v_source, clock_timestamp(),
                    clock_timestamp(),
                    'shadow: would dispatch (' || r.kind || ')',
                    jsonb_build_object('reason','shadow_plan','kind',r.kind,
                                       'target',r.target,'seq',r.seq,
                                       'depends_on',r.depends_on,'shadow',true));
            v_fired := v_fired || to_jsonb(r.stage);
            continue;
        end if;

        if r.kind = 'http' then
            v_log_id := public.atlas_chain_dispatch(
                            r.stage, r.target, r.gate_prices, r.timeout_ms);
            v_fired := v_fired || to_jsonb(r.stage);

        elsif r.kind = 'edge' then
            -- Closed placeholder set. Longer token first so it cannot be
            -- partially consumed by the shorter one.
            v_body := replace(replace(r.body::text,
                          '{{today_minus_5}}', (v_today - 5)::text),
                          '{{today}}',         v_today::text)::jsonb;

            insert into sync_log (function_name, status, source, started_at)
            values (r.stage, 'running', v_source, clock_timestamp())
            returning id into v_log_id;

            select net.http_post(
                url     := public.atlas_functions_base() || '/' || r.target,
                headers := '{"Content-Type":"application/json"}'::jsonb,
                body    := v_body,
                timeout_milliseconds := r.timeout_ms
            ) into v_req_id;

            update sync_log set details = jsonb_build_object(
                'request_id', v_req_id, 'fn', r.target,
                'base', public.atlas_functions_base(), 'body', v_body)
            where id = v_log_id;
            v_fired := v_fired || to_jsonb(r.stage);

        else  -- kind = 'sql', executed inline
            insert into sync_log (function_name, status, source, started_at)
            values (r.stage, 'running', v_source, clock_timestamp())
            returning id into v_log_id;

            v_err := null;
            begin
                execute 'select public.' || r.target;
            exception when others then
                v_err := left(coalesce(sqlerrm, 'unknown error'), 500);
            end;

            -- The INSERT above is outside this subtransaction, so it survives
            -- the handler. That is the whole reason the row is opened first.
            update sync_log set
                status        = case when v_err is null then 'success' else 'error' end,
                finished_at   = clock_timestamp(),
                error_message = v_err,
                details       = jsonb_build_object('target', r.target, 'seq', r.seq)
            where id = v_log_id;

            if v_err is null then
                v_fired := v_fired || to_jsonb(r.stage);
            else
                v_blocked := v_blocked || to_jsonb(r.stage);
            end if;
        end if;
    end loop;

    perform pg_advisory_unlock(hashtext('atlas_chain_advance'));

    return jsonb_build_object(
        'tick_at',     v_start,
        'shadow',      p_shadow,
        'dow',         v_dow,
        'fired',       v_fired,
        'blocked',     v_blocked,
        'elapsed_ms',  round(extract(epoch from clock_timestamp() - v_start) * 1000));
end;
$fn$;

revoke execute on function public.atlas_chain_advance(boolean, integer)
    from public, anon, authenticated;
