-- ONB-1 contract: onboarding is a status on the account row, and the database
-- decides the next step. Run under psql. Always ends in an exception, so the
-- users, rows and grants it creates do not survive.
do $$
declare
    v_admin   uuid := (select user_id from public.atlas_admins limit 1);
    v_new     uuid := gen_random_uuid();
    v_inv     uuid := gen_random_uuid();
    v_auth    uuid := gen_random_uuid();
    v_step    text;
    v_state   jsonb;
    v_res     text;
    n         bigint;
begin
    -- 1. Every existing auth user has a row; administrators land on ready.
    if exists (select 1 from auth.users u
                where not exists (select 1 from public.atlas_accounts a where a.user_id = u.id)) then
        raise exception 'ONB1 1: an auth user has no atlas_accounts row';
    end if;
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_step := public.atlas_my_onboarding() ->> 'next_step';
    if v_step <> 'ready' then raise exception 'ONB1 1: admin step is %', v_step; end if;

    -- 2. A stranger signing in for the first time is pending, then asked for
    --    their name, then waits.
    perform set_config('request.jwt.claims', null, true);
    insert into auth.users (id, email, aud, role, created_at)
    values (v_new, 'onb1-stranger@example.invalid', 'authenticated', 'authenticated', now());
    if (select status from public.atlas_accounts where user_id = v_new) <> 'pending' then
        raise exception 'ONB1 2: a new sign-up is not pending';
    end if;
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_new, 'role', 'authenticated')::text, true);
    v_step := public.atlas_my_onboarding() ->> 'next_step';
    if v_step <> 'details' then raise exception 'ONB1 2: step is %, want details', v_step; end if;
    v_step := public.atlas_set_my_details('Test', 'Stranger') ->> 'next_step';
    if v_step <> 'awaiting_approval' then raise exception 'ONB1 2: step is %, want awaiting_approval', v_step; end if;

    -- 3. A pending account cannot attach a broker, whatever inserts it.
    perform set_config('request.jwt.claims', null, true);
    begin
        insert into public.broker_accounts (user_id, broker, is_paper, alpaca_account_number)
        values (v_new, 'alpaca', true, 'PATEST00001');
        raise exception 'ONB1 3: a pending account attached a broker';
    exception when insufficient_privilege then null;
    end;

    -- 4. A non-administrator cannot approve anyone, including themselves.
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_new, 'role', 'authenticated')::text, true);
    begin
        perform public.atlas_admin_set_status(v_new, 'approved');
        raise exception 'ONB1 4: a non-administrator changed a status';
    exception when insufficient_privilege then null;
    end;

    -- 5. The administrator approves; the next step is the broker.
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_res := public.atlas_admin_set_status(v_new, 'approved');
    if v_res <> 'pending -> approved' then raise exception 'ONB1 5: set_status said %', v_res; end if;
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_new, 'role', 'authenticated')::text, true);
    v_step := public.atlas_my_onboarding() ->> 'next_step';
    if v_step <> 'connect_broker' then raise exception 'ONB1 5: step is %, want connect_broker', v_step; end if;

    -- 6. An invited email is approved the moment it first signs in.
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_res := public.atlas_admin_invite('onb1-invited@example.invalid', 'Invited', 'Person');
    if v_res <> 'allowlisted' then raise exception 'ONB1 6: invite said %', v_res; end if;
    perform set_config('request.jwt.claims', null, true);
    insert into auth.users (id, email, aud, role, created_at)
    values (v_inv, 'onb1-invited@example.invalid', 'authenticated', 'authenticated', now());
    select to_jsonb(a) into v_state from public.atlas_accounts a where a.user_id = v_inv;
    if v_state ->> 'status' <> 'approved' or v_state ->> 'first_name' <> 'Invited' then
        raise exception 'ONB1 6: invited account is %', v_state;
    end if;

    -- 7. Revoking ends the account's access.
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    perform public.atlas_admin_set_status(v_inv, 'revoked');
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_inv, 'role', 'authenticated')::text, true);
    v_step := public.atlas_my_onboarding() ->> 'next_step';
    if v_step <> 'revoked' then raise exception 'ONB1 7: step is %, want revoked', v_step; end if;

    -- 7b. An account created by Auth's invite endpoint (the ON-1 / RA-2 flow
    --     still live until ONB-3) is approved, so its broker connect works.
    perform set_config('request.jwt.claims', null, true);
    insert into auth.users (id, email, aud, role, created_at, invited_at)
    values (v_auth, 'onb1-authinvite@example.invalid', 'authenticated', 'authenticated', now(), now());
    if (select status from public.atlas_accounts where user_id = v_auth) <> 'approved' then
        raise exception 'ONB1 7b: an Auth-invited account is not approved';
    end if;
    perform set_config('request.jwt.claims',
        json_build_object('sub', v_inv, 'role', 'authenticated')::text, true);

    -- 8. A signed-in user reads only their own row; the browser cannot write.
    set local role authenticated;
    select count(*) into n from public.atlas_accounts;
    if n <> 1 then raise exception 'ONB1 8: a user sees % account rows', n; end if;
    begin
        update public.atlas_accounts set status = 'approved' where user_id = v_inv;
        raise exception 'ONB1 8: the browser can write atlas_accounts';
    exception when insufficient_privilege then null;
    end;
    reset role;
    if has_function_privilege('anon', 'public.atlas_my_onboarding()', 'execute') then
        raise exception 'ONB1 8: anon can call atlas_my_onboarding';
    end if;

    raise exception 'ONB1_ALL_PASSED';
end $$;
