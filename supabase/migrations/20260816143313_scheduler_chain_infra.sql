create or replace function public.atlas_cron_secret()
returns text language sql stable security definer set search_path to 'public', 'vault'
as $$
    select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET' limit 1;
$$;

comment on function public.atlas_cron_secret() is
'The CRON_SECRET the Vercel handlers authenticate against, read from Vault. Set it once with: select vault.create_secret(''<value>'', ''CRON_SECRET''); Never inline the value in a cron command - cron.job.command is readable to anyone with database access.';

create or replace function public.atlas_prices_current()
returns boolean language sql stable security definer set search_path to 'public'
as $$
    select exists (
        select 1 from price_history ph
        where ph.price_date = atlas_last_traded_day()
        group by ph.price_date having count(*) >= 20
    );
$$;

comment on function public.atlas_prices_current() is
'True when the price book for the last traded session has landed. The row-count floor keeps a single stray benchmark bar from reading as a full book - the same failure mode that let eleven Fridays pass with only a SPY row.';

create or replace function public.atlas_chain_dispatch(
    p_stage text, p_path text, p_gate boolean default false, p_timeout_ms integer default 300000)
returns bigint language plpgsql security definer set search_path to 'public'
as $$
declare
    v_secret text;
    v_log_id bigint;
    v_req_id bigint;
    v_base   text := 'https://latest-atlas-code-o19a.vercel.app';
begin
    insert into sync_log (function_name, status, source, started_at)
    values (p_stage, 'running', 'pg_cron_chain', now())
    returning id into v_log_id;

    v_secret := atlas_cron_secret();
    if v_secret is null or length(trim(v_secret)) = 0 then
        update sync_log set status = 'skipped', finished_at = now(),
            error_message = 'CRON_SECRET not present in Vault - chain stage not armed',
            details = jsonb_build_object('path', p_path, 'reason', 'no_secret')
        where id = v_log_id;
        return v_log_id;
    end if;

    if p_gate and not atlas_prices_current() then
        update sync_log set status = 'skipped', finished_at = now(),
            error_message = 'Upstream gate not met - no price book for ' || coalesce(atlas_last_traded_day()::text, 'unknown'),
            details = jsonb_build_object('path', p_path, 'reason', 'gate_prices_not_current', 'last_traded_day', atlas_last_traded_day())
        where id = v_log_id;
        return v_log_id;
    end if;

    select net.http_post(
        url := v_base || p_path,
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
        body := jsonb_build_object('source', 'pg_cron_chain'),
        timeout_milliseconds := p_timeout_ms
    ) into v_req_id;

    update sync_log set details = jsonb_build_object('path', p_path, 'request_id', v_req_id)
    where id = v_log_id;

    return v_log_id;
end;
$$;

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
            duration_ms = (extract(epoch from (now() - m.started_at)) * 1000)::bigint,
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

grant execute on function public.atlas_cron_secret() to service_role;
grant execute on function public.atlas_prices_current() to service_role, authenticated;
grant execute on function public.atlas_chain_dispatch(text, text, boolean, integer) to service_role;
grant execute on function public.atlas_chain_reap() to service_role;
