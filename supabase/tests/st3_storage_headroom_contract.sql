-- ST-3 contract: the storage_headroom validation check grades the database
-- against the Free plan quota. Runs inside a block that always raises, so the
-- forced sizes (a replaced atlas_storage_headroom) and the validation rows it
-- writes never persist. Run with psql or the management API; expect the final
-- exception text to read 'ST-3 contract: 6/6 passed'.
do $$
declare
    v_n      int := 0;
    v_status text;
    v_sev    text;
    v_h      record;
begin
    -- 1. The headroom function measures decimal MB against a 500 MB quota.
    select * into v_h from public.atlas_storage_headroom();
    if not (v_h.size_mb > 0 and v_h.quota_mb = 500 and v_h.warn_mb = 460 and v_h.critical_mb = 480
            and jsonb_array_length(v_h.largest) = 5) then
        raise exception 'case 1: headroom shape wrong: %', row_to_json(v_h);
    end if;
    if abs(v_h.size_mb - round(pg_database_size(current_database()) / 1e6, 1)) > 1 then
        raise exception 'case 1: size is not decimal MB';
    end if;
    v_n := v_n + 1;

    -- 2. Browser roles cannot call it.
    if has_function_privilege('anon', 'public.atlas_storage_headroom()', 'execute')
       or has_function_privilege('authenticated', 'public.atlas_storage_headroom()', 'execute') then
        raise exception 'case 2: a browser role can execute atlas_storage_headroom';
    end if;
    v_n := v_n + 1;

    -- 3. Under the warning line the check passes (happy path, forced to 300 MB).
    execute $f$create or replace function public.atlas_storage_headroom()
        returns table (size_mb numeric, quota_mb numeric, used_pct numeric, warn_mb numeric, critical_mb numeric, largest jsonb)
        language sql as $b$ select 300.0, 500::numeric, 60.0, 460::numeric, 480::numeric, '[]'::jsonb $b$ $f$;
    select r.status, r.severity into v_status, v_sev from public.atlas_run_validation() r where r.check_name = 'storage_headroom';
    if v_status is distinct from 'passed' or v_sev is distinct from 'info' then
        raise exception 'case 3: 300 MB graded %/%', v_status, v_sev;
    end if;
    v_n := v_n + 1;

    -- 4. Exactly at the warning line it warns.
    execute $f$create or replace function public.atlas_storage_headroom()
        returns table (size_mb numeric, quota_mb numeric, used_pct numeric, warn_mb numeric, critical_mb numeric, largest jsonb)
        language sql as $b$ select 460.0, 500::numeric, 92.0, 460::numeric, 480::numeric, '[{"table":"t","mb":1}]'::jsonb $b$ $f$;
    select r.status, r.severity into v_status, v_sev from public.atlas_run_validation() r where r.check_name = 'storage_headroom';
    if v_status is distinct from 'warning' or v_sev is distinct from 'warning' then
        raise exception 'case 4: 460 MB graded %/%', v_status, v_sev;
    end if;
    v_n := v_n + 1;

    -- 5. At the critical line it fails as critical and raises the memory row.
    execute $f$create or replace function public.atlas_storage_headroom()
        returns table (size_mb numeric, quota_mb numeric, used_pct numeric, warn_mb numeric, critical_mb numeric, largest jsonb)
        language sql as $b$ select 485.0, 500::numeric, 97.0, 460::numeric, 480::numeric, '[{"table":"t","mb":1}]'::jsonb $b$ $f$;
    select r.status, r.severity into v_status, v_sev from public.atlas_run_validation() r where r.check_name = 'storage_headroom';
    if v_status is distinct from 'failed' or v_sev is distinct from 'critical' then
        raise exception 'case 5: 485 MB graded %/%', v_status, v_sev;
    end if;
    if not exists (select 1 from public.atlas_memory where category = 'bug' and key = 'validation-critical'
                    and updated_at >= now()) then
        raise exception 'case 5: critical did not write the atlas_memory bug row';
    end if;
    v_n := v_n + 1;

    -- 6. Exactly one storage_headroom row per validation run.
    if (select count(*) from public.atlas_validation_log
         where check_name = 'storage_headroom' and created_at >= now()) <> 3 then
        raise exception 'case 6: expected 3 storage_headroom rows from 3 runs';
    end if;
    v_n := v_n + 1;

    raise exception 'ST-3 contract: %/6 passed', v_n;
end $$;
