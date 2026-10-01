-- AUTH-2d contract: a signed-in user reads only the books they are a member of.
-- Runs entirely inside one DO block that always raises, so every insert rolls
-- back. Run under psql or the management API; expect
--   AUTH2D_TEST_PASSED n/n (rolled back)
do $$
declare
  p_pri uuid := 'e11b0e63-8edf-48b4-a57f-583f24c0a1c8';
  p_sec uuid := '6844aec5-43c5-4d9b-96ed-d3cd1372cd37';
  p_ter uuid := '04d55592-90a4-46e6-b363-879ab2af6e79';
  u_sec uuid := '00000000-0000-4000-8000-0000000000d1';   -- member of Secondary only
  u_none uuid := '00000000-0000-4000-8000-0000000000d2';  -- member of nothing
  n_pos_all int; n_pos_sec int; n_tx_sec int; n_snap_sec int; n_curve_sec int;
  v int; v_uuid uuid; passed int := 0; total int := 0;
  claims text;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (u_sec, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auth2d-sec@example.invalid', now(), now()),
         (u_none, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'auth2d-none@example.invalid', now(), now());
  perform public.atlas_grant_portfolio_access(u_sec, p_sec, 'viewer');

  select count(*) into n_pos_all from public.positions;
  select count(*) into n_pos_sec from public.positions where portfolio_id = p_sec;
  select count(*) into n_tx_sec from public.transactions where portfolio_id = p_sec;
  select count(*) into n_snap_sec from public.account_snapshots where portfolio_id = p_sec;
  select count(*) into n_curve_sec from public.portfolio_equity_curve where portfolio_id = p_sec;

  -- 1-5. A Secondary-only user sees exactly Secondary's rows in each raw book table.
  claims := json_build_object('sub', u_sec, 'role', 'authenticated')::text;
  perform set_config('request.jwt.claims', claims, true);
  set local role authenticated;
  total := total + 1; select count(*) into v from public.positions;
  if v = n_pos_sec and v > 0 then passed := passed + 1; else raise notice 'FAIL 1 positions % vs %', v, n_pos_sec; end if;
  total := total + 1; select count(*) into v from public.transactions;
  if v = n_tx_sec then passed := passed + 1; else raise notice 'FAIL 2 transactions % vs %', v, n_tx_sec; end if;
  total := total + 1; select count(*) into v from public.account_snapshots;
  if v = n_snap_sec then passed := passed + 1; else raise notice 'FAIL 3 snapshots % vs %', v, n_snap_sec; end if;
  total := total + 1; select count(*) into v from public.portfolio_equity_curve;
  if v = n_curve_sec then passed := passed + 1; else raise notice 'FAIL 4 curve % vs %', v, n_curve_sec; end if;
  total := total + 1; select count(*) into v from public.orders where portfolio_id <> p_sec;
  if v = 0 then passed := passed + 1; else raise notice 'FAIL 5 orders of other books visible: %', v; end if;

  -- 6. sync_log: only Secondary's rows and rows that belong to no portfolio.
  total := total + 1; select count(*) into v from public.sync_log where portfolio_id is not null and portfolio_id <> p_sec;
  if v = 0 then passed := passed + 1; else raise notice 'FAIL 6 other books'' sync rows: %', v; end if;

  -- 7. Account health grades Secondary and nothing else.
  total := total + 1; select count(*) into v from public.atlas_account_sync_health() h where h.portfolio_id <> p_sec;
  if v = 0 and exists (select 1 from public.atlas_account_sync_health() h where h.portfolio_id = p_sec) then passed := passed + 1;
  else raise notice 'FAIL 7 health rows for other books: %', v; end if;

  -- 8. Asking for Primary by header still resolves to Secondary.
  perform set_config('request.headers', json_build_object('x-atlas-portfolio', p_pri)::text, true);
  total := total + 1; v_uuid := public.atlas_active_portfolio();
  if v_uuid = p_sec then passed := passed + 1; else raise notice 'FAIL 8 resolved %', v_uuid; end if;
  perform set_config('request.headers', '', true);

  -- 9-10. A user with no membership sees no book and no account.
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_none, 'role', 'authenticated')::text, true);
  set local role authenticated;
  total := total + 1; select count(*) into v from public.positions;
  if v = 0 then passed := passed + 1; else raise notice 'FAIL 9 positions %', v; end if;
  total := total + 1; select count(*) into v from public.atlas_account_sync_health();
  if v = 0 then passed := passed + 1; else raise notice 'FAIL 10 health %', v; end if;

  -- 11. Headerless / no session (pg_cron, service jobs): unchanged, every book.
  reset role;
  perform set_config('request.jwt.claims', '', true);
  total := total + 1; select count(*) into v from public.positions;
  if v = n_pos_all then passed := passed + 1; else raise notice 'FAIL 11 headerless % vs %', v, n_pos_all; end if;

  -- 12. Headerless health grades every registered account, Vault-held Tertiary included.
  total := total + 1;
  if exists (select 1 from public.atlas_account_sync_health() h where h.portfolio_id = p_ter) then passed := passed + 1;
  else raise notice 'FAIL 12 Tertiary is not graded'; end if;

  raise exception 'AUTH2D_TEST_PASSED %/% (rolled back)', passed, total;
end $$;
