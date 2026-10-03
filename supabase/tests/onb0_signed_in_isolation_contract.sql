-- ONB-0 contract: a signed-in user who owns nothing reads nothing of another
-- book; the owner, administrators and headerless jobs are unaffected.
-- Run under psql. Always ends in an exception, so nothing it does survives.
--
-- The held_weight_pct assertion in case 3 holds only once ONB-0b (the
-- column revoke on trade_universe_members) is applied; until then this test
-- fails there, which is the remaining exposure stated rather than hidden.
--
-- Needs two auth users: an administrator who is a member of the default
-- portfolio, and a user with no membership (picked automatically).
do $$
declare
    v_admin uuid := (select a.user_id from public.atlas_admins a
                       join public.portfolio_members m on m.user_id = a.user_id
                      limit 1);
    v_other uuid := (select u.id from auth.users u
                      where not exists (select 1 from public.portfolio_members m where m.user_id = u.id)
                        and not exists (select 1 from public.atlas_admins a where a.user_id = u.id)
                      limit 1);
    n bigint;
begin
    if v_admin is null or v_other is null then
        raise exception 'ONB0: needs an administrator with a portfolio and a user with none';
    end if;

    -- 1. Headerless backend: every portfolio, as before.
    if (select count(*) from public.atlas_member_portfolios())
       <> (select count(*) from public.portfolios) then
        raise exception 'ONB0 1: the backend lost portfolios';
    end if;

    -- 2. An anonymous JWT: nothing, and no active portfolio.
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    if (select count(*) from public.atlas_member_portfolios()) <> 0 then
        raise exception 'ONB0 2: anon sees portfolios';
    end if;
    if public.atlas_active_portfolio() is not null then
        raise exception 'ONB0 2: anon has an active portfolio';
    end if;

    -- 3. The user with no portfolio, as authenticated.
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.portfolios;
    if n <> 0 then raise exception 'ONB0 3: % portfolios visible', n; end if;
    select count(*) into n from public.cortex_signals;
    if n <> 0 then raise exception 'ONB0 3: % cortex signals visible', n; end if;
    select count(*) into n from public.atlas_validation_log;
    if n <> 0 then raise exception 'ONB0 3: % validation rows visible', n; end if;
    select count(*) into n from public.insight_sector_attribution;
    if n <> 0 then raise exception 'ONB0 3: % insight rows visible', n; end if;
    select count(*) into n from (select symbol from public.trade_universe_members limit 5) s;
    if n = 0 then raise exception 'ONB0 3: the universe is unreadable'; end if;
    begin
        perform held_weight_pct from public.trade_universe_members limit 1;
        raise exception 'ONB0 3: the stored book weight is readable';
    exception when insufficient_privilege then null;
    end;
    select count(*) into n from public.vw_positions_current;
    if n <> 0 then raise exception 'ONB0 3: % positions visible', n; end if;
    reset role;

    -- 4. The administrator still sees everything they did.
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from public.portfolios;
    if n = 0 then raise exception 'ONB0 4: the administrator lost portfolios'; end if;
    select count(*) into n from public.vw_positions_current;
    if n = 0 then raise exception 'ONB0 4: the administrator lost the book'; end if;
    select count(*) into n from public.cortex_signals;
    if n = 0 then raise exception 'ONB0 4: the administrator lost cortex signals'; end if;
    reset role;

    raise exception 'ONB0_ALL_PASSED';
end $$;
