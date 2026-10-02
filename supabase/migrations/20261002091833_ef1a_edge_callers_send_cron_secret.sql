-- EF-1a: every caller of an edge function sends Bearer CRON_SECRET.
--
-- Callers first, guard second: the edge functions do not check yet, so an
-- extra Authorization header changes nothing today. Once they do (EF-1b),
-- a caller that sends nothing is refused -- which is the point.
--
-- The secret stays in Vault. Cron commands and the chain call
-- atlas_edge_headers() rather than carrying it inline in cron.job.command,
-- and the functions verify it with atlas_check_cron_secret(), which compares
-- inside the database so the secret never has to be an edge secret as well.

create or replace function public.atlas_edge_headers()
returns jsonb
language sql
stable
security definer
set search_path = public, vault
as $$
    select case
        when public.atlas_cron_secret() is null then
            jsonb_build_object('Content-Type', 'application/json')
        else
            jsonb_build_object('Content-Type', 'application/json',
                               'Authorization', 'Bearer ' || public.atlas_cron_secret())
    end;
$$;

comment on function public.atlas_edge_headers() is
  'Headers for pg_net calls to edge functions: Content-Type plus Bearer CRON_SECRET from Vault. '
  'postgres only (pg_cron and the chain). Without the secret the call goes out with no '
  'Authorization and the function refuses it (401) -- a missing secret fails loudly.';

create or replace function public.atlas_check_cron_secret(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, vault
as $$
    select coalesce(p_token is not null
                    and length(p_token) > 0
                    and p_token = public.atlas_cron_secret(), false);
$$;

comment on function public.atlas_check_cron_secret(text) is
  'True when p_token is the Vault CRON_SECRET. Called by _shared/edge_auth.js with the '
  'service key, so the comparison happens here and the secret is never returned. '
  'service_role only.';

revoke execute on function public.atlas_edge_headers()            from public, anon, authenticated, service_role;
revoke execute on function public.atlas_check_cron_secret(text)   from public, anon, authenticated;
grant  execute on function public.atlas_check_cron_secret(text)   to service_role;

do $$
begin
    if has_function_privilege('anon', 'public.atlas_check_cron_secret(text)', 'execute')
       or has_function_privilege('authenticated', 'public.atlas_check_cron_secret(text)', 'execute')
       or has_function_privilege('anon', 'public.atlas_edge_headers()', 'execute')
       or has_function_privilege('authenticated', 'public.atlas_edge_headers()', 'execute')
       or has_function_privilege('service_role', 'public.atlas_edge_headers()', 'execute') then
        raise exception 'EF-1a: a browser or service role can still execute a secret-bearing function';
    end if;
    if not has_function_privilege('service_role', 'public.atlas_check_cron_secret(text)', 'execute') then
        raise exception 'EF-1a: service_role cannot run the cron-secret check';
    end if;
end $$;

-- The six cron jobs that call edge functions directly. Each replacement is
-- asserted to land exactly once, so a job whose command has drifted fails the
-- migration instead of being skipped.
do $$
declare
    v_job  record;
    v_old  text;
    v_new  text;
    v_pat  text;
begin
    for v_job in
        select * from (values
            (6,  $p$'{}'::jsonb$p$),
            (59, $p$'{}'::jsonb$p$),
            (9,  $p$jsonb_build_object('Content-Type', 'application/json')$p$),
            (10, $p$'{"Content-Type":"application/json"}'::jsonb$p$),
            (13, $p$'{"Content-Type":"application/json"}'::jsonb$p$),
            (28, $p$'{"Content-Type":"application/json"}'::jsonb$p$)
        ) t(jobid, pat)
    loop
        select command into v_old from cron.job where jobid = v_job.jobid;
        if v_old is null then
            raise exception 'EF-1a: cron job % not found', v_job.jobid;
        end if;
        if v_old not like '%/functions/v1/%' then
            raise exception 'EF-1a: cron job % does not call an edge function', v_job.jobid;
        end if;
        -- "headers", any spacing, ":=", any spacing, then the literal value.
        v_pat := 'headers\s*:=\s*'
                 || regexp_replace(v_job.pat, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g');
        if (select count(*) from regexp_matches(v_old, v_pat, 'g')) <> 1 then
            raise exception 'EF-1a: cron job % headers clause not found exactly once', v_job.jobid;
        end if;
        v_new := regexp_replace(v_old, v_pat, 'headers := public.atlas_edge_headers()');
        perform cron.alter_job(v_job.jobid, command := v_new);
    end loop;
end $$;

-- The chain's edge branch.
do $$
declare
    v_def text := pg_get_functiondef('public.atlas_chain_advance'::regproc);
    v_old text := $o$headers := '{"Content-Type":"application/json"}'::jsonb,$o$;
    v_new text := $n$headers := public.atlas_edge_headers(),$n$;
begin
    if position(v_new in v_def) > 0 then
        raise exception 'EF-1a: atlas_chain_advance already patched';
    end if;
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
        raise exception 'EF-1a: atlas_chain_advance edge headers not found exactly once';
    end if;
    execute replace(v_def, v_old, v_new);
end $$;
