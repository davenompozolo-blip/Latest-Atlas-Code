-- RA-2 contract: first name + surname. Run as postgres. ALWAYS raises
-- (RA2_ALL_PASSED on success), so nothing it records survives.
do $t$
declare v_out text; r record; v_ok boolean;
begin
  -- 1. the new five-argument call stores both names
  v_out := public.atlas_submit_access_request(p_name => ' Ada ', p_email => 'ra2-ada@example.invalid',
             p_note => null, p_ip_hash => 'ra2-ip-1', p_surname => ' Lovelace ');
  if v_out <> 'recorded' then raise exception 'T1 got %', v_out; end if;
  select name, surname into r from public.access_requests where email = 'ra2-ada@example.invalid';
  if r.name <> 'Ada' or r.surname <> 'Lovelace' then raise exception 'T1 stored % / %', r.name, r.surname; end if;

  -- 2. the four named arguments the pre-RA-2 route sends still resolve (surname NULL)
  v_out := public.atlas_submit_access_request(p_name => 'Grace Hopper', p_email => 'ra2-grace@example.invalid',
             p_note => null, p_ip_hash => 'ra2-ip-2');
  if v_out <> 'recorded' then raise exception 'T2 got %', v_out; end if;
  if (select surname from public.access_requests where email = 'ra2-grace@example.invalid') is not null then
    raise exception 'T2 surname not null';
  end if;

  -- 3. a blank surname is stored as NULL, never as an empty string
  v_out := public.atlas_submit_access_request(p_name => 'Alan', p_email => 'ra2-alan@example.invalid',
             p_note => null, p_ip_hash => 'ra2-ip-3', p_surname => '   ');
  if (select surname from public.access_requests where email = 'ra2-alan@example.invalid') is not null then
    raise exception 'T3 blank surname stored';
  end if;

  -- 4. an over-long surname is refused by the table
  v_ok := false;
  begin perform public.atlas_submit_access_request(p_name => 'X', p_email => 'ra2-x@example.invalid',
             p_note => null, p_ip_hash => 'ra2-ip-4', p_surname => repeat('s', 101));
  exception when check_violation then v_ok := true; end;
  if not v_ok then raise exception 'T4 101-char surname accepted'; end if;

  -- 5. still unreachable from the browser roles
  if has_function_privilege('authenticated', 'public.atlas_submit_access_request(text,text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.atlas_submit_access_request(text,text,text,text,text)', 'execute') then
    raise exception 'T5 browser role can submit';
  end if;

  raise exception 'RA2_ALL_PASSED';
end $t$;
