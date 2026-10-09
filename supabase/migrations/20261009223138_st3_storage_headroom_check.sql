-- ST-3: warn before the database reaches the Free plan's size quota.
--
-- On 2026-10-03 the project crossed 500 MB and every API request answered 402
-- for six days. Nothing in the platform measured database size, so the first
-- signal was the outage itself. On 2026-10-09 the same thing nearly happened
-- again within two hours of the restriction lifting (ST-2).
--
-- atlas_storage_headroom() reports the size the quota is measured on:
-- pg_database_size in DECIMAL megabytes (Supabase's 0.5 GB is 500,000,000
-- bytes; dividing by 1048576 reads ~5% low and is how 433 MB was misquoted as
-- 413). The validation check grades it:
--   < 460 MB  passed
--   >= 460    warning   (92%: days of headroom, time to look)
--   >= 480    critical  (96%: act now; writes the atlas_memory bug row)
-- Critical is right here, unlike the subscription-bound feeds: pruning can
-- always bring it back, so the red light is one that can go green.

create or replace function public.atlas_storage_headroom()
returns table (size_mb numeric, quota_mb numeric, used_pct numeric,
               warn_mb numeric, critical_mb numeric, largest jsonb)
language sql
stable
security definer
set search_path = ''
as $$
    select round(pg_database_size(current_database()) / 1e6, 1),
           500::numeric,
           round(pg_database_size(current_database()) / 1e6 / 500 * 100, 1),
           460::numeric,
           480::numeric,
           (select jsonb_agg(jsonb_build_object('table', t.relname, 'mb', t.mb) order by t.mb desc)
              from (select c.relname, round(pg_total_relation_size(c.oid) / 1e6, 1) mb
                      from pg_catalog.pg_class c
                      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                     where c.relkind in ('r', 'm') and n.nspname not in ('pg_catalog', 'information_schema')
                     order by pg_total_relation_size(c.oid) desc
                     limit 5) t);
$$;

revoke all on function public.atlas_storage_headroom() from public, anon, authenticated;

do $$
declare
    v_def text;
    v_anchor text := '    insert into atlas_validation_log (check_name, status, severity, message, details)';
    v_block text := $blk$    -- storage_headroom (ST-3): the Free plan restricts the WHOLE project
    -- (every API call answers 402) once the database passes 500 MB.
    declare
        v_h record;
    begin
        select * into v_h from atlas_storage_headroom();
        v_results := v_results || jsonb_build_object(
            'check_name', 'storage_headroom',
            'status',   case when v_h.size_mb >= v_h.critical_mb then 'failed'
                             when v_h.size_mb >= v_h.warn_mb then 'warning' else 'passed' end,
            'severity', case when v_h.size_mb >= v_h.critical_mb then 'critical'
                             when v_h.size_mb >= v_h.warn_mb then 'warning' else 'info' end,
            'message',  case when v_h.size_mb >= v_h.warn_mb
                then format('Database is %s MB of the %s MB quota (%s%%). Past %s MB every API request is refused. Largest: %s.',
                            v_h.size_mb, v_h.quota_mb, v_h.used_pct, v_h.quota_mb,
                            (select string_agg(e->>'table' || ' ' || (e->>'mb') || ' MB', ', ')
                               from jsonb_array_elements(v_h.largest) e))
                else format('Database is %s MB of the %s MB quota (%s%%).', v_h.size_mb, v_h.quota_mb, v_h.used_pct) end,
            'details',  jsonb_build_object('size_mb', v_h.size_mb, 'quota_mb', v_h.quota_mb,
                                           'warn_mb', v_h.warn_mb, 'critical_mb', v_h.critical_mb,
                                           'largest', v_h.largest));
    end;

$blk$;
begin
    select pg_get_functiondef('public.atlas_run_validation()'::regprocedure) into v_def;
    if position('storage_headroom' in v_def) > 0 then
        raise exception 'ST-3: atlas_run_validation already carries storage_headroom';
    end if;
    if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
        raise exception 'ST-3: validation anchor not found exactly once';
    end if;
    execute replace(v_def, v_anchor, v_block || v_anchor);
end $$;
