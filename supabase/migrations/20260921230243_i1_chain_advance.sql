-- I-1: atlas_chain_advance() -- fire a stage when its PREDECESSOR completes,
-- not when a clock says its predecessor has probably finished.
--
-- Runs on a one-minute tick. Each call reaps finished pg_net responses, then
-- walks the topology in seq order and dispatches every stage whose dependency
-- has reached a terminal state and whose not_before floor has passed.
--
-- Defaults to SHADOW (p_shadow => true): it records the decision it WOULD have
-- made under source 'pg_cron_chain_shadow' and dispatches nothing. That lets the
-- graph be proven traversable against a live night without touching the running
-- pipeline. Going live is one argument plus disabling the stages' own cron
-- entries -- never both schedulers firing the same stage.
--
-- Three rules this codebase has paid for, applied here:
--   * NEVER RAISE on a refusal. A RAISE rolls back the sync_log row recording
--     the refusal and leaves the failure only in cron.job_run_details.
--   * clock_timestamp(), not now(). now() is the TRANSACTION timestamp and is
--     constant for the life of the call, so every duration would read 0 ms.
--   * A no-op must be legible as a no-op. 'skipped' with a reason, never
--     'success' with nothing written.

create or replace function public.atlas_functions_base()
returns text
language sql
stable
security definer
set search_path = public, vault, pg_temp
as $fn$
    select coalesce(
        nullif(rtrim((select decrypted_secret
                        from vault.decrypted_secrets
                       where name = 'FUNCTIONS_BASE_URL'
                       limit 1), '/'), ''),
        'https://vdmojjszvvcithuxwexx.supabase.co/functions/v1'
    );
$fn$;

comment on function public.atlas_functions_base() is
  'Edge-function base URL for chain dispatch. Vault secret FUNCTIONS_BASE_URL '
  'overrides the fallback, so moving the project is one secret and no code -- '
  'the same reason atlas_chain_base() exists for the Vercel host.';

revoke execute on function public.atlas_functions_base() from public, anon, authenticated;


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

    -- Close finished http/edge rows first: a successor cannot see a terminal
    -- state its predecessor has not been graded into yet.
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
            select l.status into v_dep
            from sync_log l
            where l.function_name = r.depends_on
              and l.source        = v_source
              and l.started_at   >= v_day_start
              and l.status in ('success','skipped','error')
            order by l.started_at desc
            limit 1;

            -- Not terminal yet: wait. This is the ordinary case and is silent.
            if v_dep is null then
                continue;
            end if;

            -- hard=true is a real data dependency, so an upstream error stops
            -- here. hard=false is ordering only and any terminal state releases.
            if r.hard and v_dep = 'error' then
                insert into sync_log (function_name, status, source, started_at,
                                      finished_at, error_message, details)
                values (r.stage, 'skipped', v_source, clock_timestamp(),
                        clock_timestamp(),
                        'blocked: hard dependency ' || r.depends_on || ' ended in error',
                        jsonb_build_object('reason','upstream_failed',
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

comment on function public.atlas_chain_advance(boolean, integer) is
  'One tick of the completion-chained nightly pipeline. Reaps, then dispatches '
  'every stage whose dependency is terminal and whose not_before has passed. '
  'Shadow by default: records the plan under source pg_cron_chain_shadow and '
  'fires nothing.';

revoke execute on function public.atlas_chain_advance(boolean, integer)
    from public, anon, authenticated;
