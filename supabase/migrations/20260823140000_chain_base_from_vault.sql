-- Take the chain's target host out of the function body.
--
-- `atlas_chain_dispatch` hardcoded:
--     v_base text := 'https://latest-atlas-code-o19a.vercel.app';
--
-- Every scheduled write in the platform goes through that literal, inside a
-- SECURITY DEFINER function, naming one of eight Vercel projects. Renaming
-- that project, pausing it, or letting it fall behind on deploys silently
-- redirects or kills the entire nightly chain — and because the reaper grades
-- stages by HTTP status, a 404 from a renamed host would at least log an
-- error, while a stale-but-live deployment would keep logging success while
-- running old code. Neither is discoverable from the job list.
--
-- It now reads from Vault beside CRON_SECRET, with the current value as the
-- fallback so this migration changes no behaviour on its own. To point the
-- chain somewhere else — after renaming the project, say — set the secret and
-- nothing else has to change:
--
--     select vault.create_secret('https://<host>', 'CHAIN_BASE_URL');
--     -- or, if it already exists:
--     select vault.update_secret(
--         (select id from vault.secrets where name = 'CHAIN_BASE_URL'),
--         'https://<host>');
--
-- No trailing slash: paths are concatenated directly and '//api/...' 404s.

create or replace function public.atlas_chain_base()
returns text
language sql
stable
security definer
set search_path to 'public', 'vault'
as $fn$
    select coalesce(
        nullif(rtrim((select decrypted_secret
                        from vault.decrypted_secrets
                       where name = 'CHAIN_BASE_URL'
                       limit 1), '/'), ''),
        'https://latest-atlas-code-o19a.vercel.app'
    );
$fn$;

comment on function public.atlas_chain_base() is
  'Base URL the nightly chain posts to. Set CHAIN_BASE_URL in Vault to move it; '
  'falls back to the project the chain has always used.';

create or replace function public.atlas_chain_dispatch(
    p_stage text, p_path text, p_gate boolean default false, p_timeout_ms integer default 300000)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_secret text;
    v_log_id bigint;
    v_req_id bigint;
    v_base   text := atlas_chain_base();
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

    -- Record the host each stage actually hit. Without it the log cannot tell
    -- you which deployment produced a result, which is the whole failure mode
    -- this change is about.
    update sync_log set details = jsonb_build_object(
        'path', p_path, 'request_id', v_req_id, 'base', v_base)
    where id = v_log_id;

    return v_log_id;
end;
$function$;
