-- AUTH-1: a signed-in user resolves only portfolios they are a member of;
-- anonymous and headerless calls are unchanged. Runs in one transaction that
-- always ends in an exception, so nothing it writes survives -- including
-- through an API that commits each call (see CLAUDE.md, cluster_identity).
do $$
declare
  u1 uuid := '00000000-0000-4000-8000-0000000000a1';
  u2 uuid := '00000000-0000-4000-8000-0000000000a2';
  p_def uuid := (select id from portfolios where is_default);
  p_sec uuid;
  p_ter uuid;
  n int;
  ok int := 0;
begin
  select id into p_sec from portfolios where not is_default order by created_at, id limit 1;
  select id into p_ter from portfolios where not is_default and id <> p_sec order by created_at, id limit 1;
  if p_def is null or p_sec is null or p_ter is null then
    raise exception 'AUTH-1 test needs three portfolios';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auth1-test-a@example.invalid', now(), now()),
         (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auth1-test-b@example.invalid', now(), now());
  perform atlas_grant_portfolio_access(u1, p_def);
  perform atlas_grant_portfolio_access(u1, p_sec);
  perform atlas_grant_portfolio_access(u2, p_ter);

  -- 1. anonymous, no header: the default portfolio, as before
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.headers', '{}', true);
  if atlas_active_portfolio() is distinct from p_def then raise exception 'case 1'; end if; ok := ok + 1;

  -- 2. anonymous with a header: honoured, as before (AUTH-2 removes this path)
  perform set_config('request.headers', json_build_object('x-atlas-portfolio', p_ter)::text, true);
  if atlas_active_portfolio() is distinct from p_ter then raise exception 'case 2'; end if; ok := ok + 1;

  -- 3. u1 asks for a portfolio it is not a member of: refused, falls to its default
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  if atlas_active_portfolio() is distinct from p_def then raise exception 'case 3'; end if; ok := ok + 1;

  -- 4. u1 asks for its own second portfolio: honoured
  perform set_config('request.headers', json_build_object('x-atlas-portfolio', p_sec)::text, true);
  if atlas_active_portfolio() is distinct from p_sec then raise exception 'case 4'; end if; ok := ok + 1;

  -- 5. u1's switcher lists exactly its two portfolios
  select count(*) into n from vw_portfolios;
  if n <> 2 then raise exception 'case 5: % rows', n; end if; ok := ok + 1;
  if exists (select 1 from vw_portfolios where id = p_ter) then raise exception 'case 5b'; end if;

  -- 6. u2 owns only the third; asking for the default gets the third
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-atlas-portfolio', p_def)::text, true);
  if atlas_active_portfolio() is distinct from p_ter then raise exception 'case 6'; end if; ok := ok + 1;
  select count(*) into n from vw_portfolios;
  if n <> 1 then raise exception 'case 6b: % rows', n; end if;

  -- 7. a signed-in user with no grant resolves to nothing, and sees an empty book
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  if atlas_active_portfolio() is not null then raise exception 'case 7'; end if; ok := ok + 1;
  select count(*) into n from vw_positions_current;
  if n <> 0 then raise exception 'case 7b: % positions', n; end if;

  -- 8. membership is written by the grant function only
  if has_table_privilege('authenticated', 'public.portfolio_members', 'insert')
     or has_function_privilege('authenticated', 'public.atlas_grant_portfolio_access(uuid, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.atlas_grant_portfolio_access(uuid, uuid, text)', 'execute') then
    raise exception 'case 8';
  end if; ok := ok + 1;

  -- 9. the grant function refuses an unknown user
  begin
    perform atlas_grant_portfolio_access(gen_random_uuid(), p_def);
    raise exception 'case 9: unknown user accepted';
  exception when raise_exception then
    if sqlerrm like 'case 9%' then raise; end if;
  end; ok := ok + 1;

  raise exception 'AUTH1_TEST_PASSED %/9 (rolled back)', ok;
end $$;
