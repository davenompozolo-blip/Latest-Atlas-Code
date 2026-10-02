-- RA-1 contract: access requests. Run as postgres. ALWAYS raises
-- (RA1_ALL_PASSED on success), so nothing it records survives.
do $t$
declare
  v_admin uuid := (select user_id from public.atlas_admins limit 1);
  v_u2    uuid := gen_random_uuid();
  v_out   text;
  v_id    uuid;
  v_n     bigint;
  v_ok    boolean;
begin
  -- 1. a new address is recorded; the same address again is a quiet duplicate
  v_out := public.atlas_submit_access_request('Ada', 'RA1-Ada@Example.invalid', 'hello', 'ip-a');
  if v_out <> 'recorded' then raise exception 'T1 got %', v_out; end if;
  v_out := public.atlas_submit_access_request('Ada', 'ra1-ada@example.invalid', null, 'ip-b');
  if v_out <> 'duplicate' then raise exception 'T1 duplicate got %', v_out; end if;
  select count(*) into v_n from public.access_requests where lower(email) = 'ra1-ada@example.invalid';
  if v_n <> 1 then raise exception 'T1 % rows for one address', v_n; end if;

  -- 2. an address that already has an account records nothing
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ra1-member@example.invalid', now(), now());
  v_out := public.atlas_submit_access_request('Mem', 'RA1-member@example.invalid', null, 'ip-c');
  if v_out <> 'existing_user' then raise exception 'T2 got %', v_out; end if;
  if exists (select 1 from public.access_requests where lower(email) = 'ra1-member@example.invalid') then
    raise exception 'T2 recorded a request for an existing account';
  end if;

  -- 3. three an hour per IP, then rate limited
  perform public.atlas_submit_access_request('x', 'ra1-x1@example.invalid', null, 'ip-flood');
  perform public.atlas_submit_access_request('x', 'ra1-x2@example.invalid', null, 'ip-flood');
  perform public.atlas_submit_access_request('x', 'ra1-x3@example.invalid', null, 'ip-flood');
  v_out := public.atlas_submit_access_request('x', 'ra1-x4@example.invalid', null, 'ip-flood');
  if v_out <> 'rate_limited' then raise exception 'T3 fourth request from one IP got %', v_out; end if;

  -- 4. malformed input is refused by the table
  v_ok := false;
  begin perform public.atlas_submit_access_request('', 'ra1-y@example.invalid', null, 'ip-y');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'T4 empty name accepted'; end if;
  v_ok := false;
  begin perform public.atlas_submit_access_request('y', 'not-an-email', null, 'ip-y');
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'T4 bad email accepted'; end if;

  -- 5. only an administrator decides; a decision is final
  select id into v_id from public.access_requests where lower(email) = 'ra1-ada@example.invalid';
  v_ok := false;
  begin perform public.atlas_decide_access_request(v_id, 'approved', v_u2);
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T5 a non-admin decided a request'; end if;
  v_out := public.atlas_decide_access_request(v_id, 'approved', v_admin);
  if v_out <> 'ra1-ada@example.invalid' then raise exception 'T5 got %', v_out; end if;
  v_ok := false;
  begin perform public.atlas_decide_access_request(v_id, 'declined', v_admin);
  exception when no_data_found then v_ok := true; end;
  if not v_ok then raise exception 'T5 a decided request was decided again'; end if;
  -- a decided address may ask again
  v_out := public.atlas_submit_access_request('Ada', 'ra1-ada@example.invalid', null, 'ip-z');
  if v_out <> 'recorded' then raise exception 'T5 re-request got %', v_out; end if;

  -- 6. browser roles: a member reads nothing, an admin reads the queue, nobody calls the functions
  perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.access_requests;
  if v_n <> 0 then raise exception 'T6 a non-admin sees % requests', v_n; end if;
  v_ok := false;
  begin perform public.atlas_submit_access_request('z', 'ra1-z@example.invalid', null, 'ip');
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T6 authenticated called the submit function'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from public.access_requests where status = 'pending';
  if v_n = 0 then raise exception 'T6 the admin cannot read the queue'; end if;
  reset role;

  raise exception 'RA1_ALL_PASSED';
end $t$;
