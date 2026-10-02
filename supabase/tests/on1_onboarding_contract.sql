-- ON-1 contract: invite-only onboarding (atlas_connect_broker_account,
-- atlas_my_access, atlas_admins). Run as postgres. The block ALWAYS raises --
-- ON1_ALL_PASSED on success -- so nothing it writes (a broker account, a Vault
-- secret, a throwaway auth user) survives, whichever client runs it.
do $t$
declare
  v_admin uuid := (select user_id from public.atlas_admins limit 1);
  v_u2 uuid := gen_random_uuid();
  v_p uuid; v_n int; v_ok boolean; r record;
begin
  -- 1. admin connects: portfolio, owner membership, attribution, vault secret
  v_p := public.atlas_connect_broker_account(v_admin, 'ON1 Test', 'ON1TEST0001', true, 'PKTEST', 'SECRETTEST');
  if not exists (select 1 from public.portfolio_members where portfolio_id=v_p and user_id=v_admin and role='owner') then raise exception 'T1 no membership'; end if;
  if not exists (select 1 from public.portfolios p join public.broker_accounts b on b.id=p.broker_account_id where p.id=v_p and b.user_id=v_admin) then raise exception 'T1 no attribution'; end if;
  if not exists (select 1 from public.atlas_broker_credentials((select broker_account_id from public.portfolios where id=v_p)) c where c.key_id='PKTEST') then raise exception 'T1 no vault'; end if;
  -- 2. duplicate refused, nothing half-written
  begin
    perform public.atlas_connect_broker_account(v_admin, 'dup', 'ON1TEST0001', true, 'a', 'b');
    raise exception 'T2 duplicate accepted';
  exception when unique_violation then null; end;
  -- 3. unknown user refused
  begin
    perform public.atlas_connect_broker_account(gen_random_uuid(), 'x', 'ON1TEST0002', true, 'a', 'b');
    raise exception 'T3 unknown user accepted';
  exception when foreign_key_violation then null; end;
  if exists (select 1 from public.broker_accounts where alpaca_account_number='ON1TEST0002') then raise exception 'T3 partial write'; end if;
  -- 4. non-admin capped at 3; the 4th refused and leaves no rows
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'on1-test@example.invalid', now(), now());
  for i in 1..3 loop
    perform public.atlas_connect_broker_account(v_u2, 'u2-'||i, 'ON1U2'||i, true, 'a', 'b');
  end loop;
  begin
    perform public.atlas_connect_broker_account(v_u2, 'u2-4', 'ON1U24', true, 'a', 'b');
    raise exception 'T4 cap not enforced';
  exception when check_violation then null; end;
  if exists (select 1 from public.broker_accounts where alpaca_account_number='ON1U24') then raise exception 'T4 partial write'; end if;
  -- 5. my_access as each user
  perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role','authenticated')::text, true);
  select * into r from public.atlas_my_access();
  if r.is_admin or r.owned_portfolios <> 3 or r.account_cap <> 3 then raise exception 'T5 u2 %', row_to_json(r); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  select * into r from public.atlas_my_access();
  if not r.is_admin or r.account_cap is not null then raise exception 'T5 admin %', row_to_json(r); end if;
  -- 6. u2 sees only its own portfolios through vw_portfolios
  perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.vw_portfolios;
  if v_n <> 3 then raise exception 'T6 u2 sees % portfolios', v_n; end if;
  begin
    perform 1 from public.atlas_admins;
    raise exception 'T6 admins readable';
  exception when insufficient_privilege then null; end;
  reset role;
  raise exception 'ON1_ALL_PASSED';
end $t$;
