-- VC-1b: re-assert the credential functions' privileges for BOTH browser roles.
--
-- 20260930075711's closing check tested `authenticated` on the read function
-- only, so an authenticated grant on the store or register function would have
-- passed it (CodeRabbit, PR #845). The grants themselves were right -- verified
-- with has_function_privilege after that migration applied -- so this changes
-- nothing; it makes the assertion total. No DDL, so it is safe to replay.
do $$
declare
    f text;
    r text;
begin
    foreach f in array array[
        'public.atlas_broker_credentials(uuid)',
        'public.atlas_store_broker_credentials(uuid, text, text)',
        'public.atlas_register_broker_account(text, text, boolean, text, text)'
    ] loop
        foreach r in array array['anon', 'authenticated'] loop
            if has_function_privilege(r, f, 'execute') then
                raise exception 'VC-1b: % is executable by %', f, r;
            end if;
        end loop;
        if not has_function_privilege('service_role', f, 'execute') then
            raise exception 'VC-1b: % is not executable by service_role', f;
        end if;
    end loop;
end $$;
