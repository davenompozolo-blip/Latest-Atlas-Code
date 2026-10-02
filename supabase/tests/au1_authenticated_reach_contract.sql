-- AU-1 contract: what a signed-in person can reach (migration 20261002202721).
-- Run as postgres against the applied database. The block ALWAYS raises --
-- AU1_ALL_PASSED on success -- so the throwaway user, claim and IPS row it
-- writes never survive, whichever client runs it. The terminal check runs LAST
-- because run_read_sql's SET LOCAL timeout and read-only mode last until the
-- end of the transaction.
--
-- T1 is the probe that found the hole: before AU-1 a user with no portfolio
-- read 0 rows of positions directly and every row of the administrator's
-- book through run_read_sql by forging request.jwt.claims.
do $t$
declare
  v_admin uuid := (select user_id from public.atlas_admins limit 1);
  v_def   uuid := public.atlas_default_portfolio();
  v_u2    uuid := gen_random_uuid();
  v_n     bigint;
  v_j     jsonb;
  v_ok    boolean;
  v_ins   int;

begin
  -- What the administrator's default account held, read past RLS.
  create temp table au1_before_claims on commit drop as
    select * from public.bench_claims where portfolio_id = public.atlas_default_portfolio();
  create temp table au1_before_ftp on commit drop as
    select * from public.forward_test_positions where portfolio_id = public.atlas_default_portfolio();
  grant select on au1_before_claims, au1_before_ftp to authenticated;

  -- A signed-in person who belongs to no portfolio.
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'au1-test@example.invalid', now(), now());

  -- ========== as the non-member ==========
  perform set_config('request.jwt.claims', json_build_object('sub', v_u2, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  set local role authenticated;

  -- 1. the SQL Terminal refuses them before their SQL runs (the forged-claims probe)
  v_ok := false;
  begin
    v_j := public.run_read_sql(format(
      $q$with s as materialized (select set_config('request.jwt.claims', %L, true) x)
         select (select count(*) from s) s, (select count(*) from positions) n$q$,
      json_build_object('sub', v_admin, 'role', 'authenticated')::text));
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T1 run_read_sql ran for a non-admin: %', v_j; end if;

  -- 2. personal and per-account tables read empty
  select (select count(*) from saved_queries) + (select count(*) from query_log) + (select count(*) from atlas_memory)
       + (select count(*) from cc_chats) + (select count(*) from bench_claims) + (select count(*) from trade_triggers)
       + (select count(*) from forward_test_positions) + (select count(*) from ledger_alerts)
       + (select count(*) from portfolio_ips) + (select count(*) from cortex_watchlist)
    into v_n;
  if v_n <> 0 then raise exception 'T2 a non-member sees % personal rows', v_n; end if;
  select count(*) into v_n from vw_bench_thesis_state;
  if v_n <> 0 then raise exception 'T2 vw_bench_thesis_state shows % rows to a non-member', v_n; end if;
  select count(*) into v_n from vw_forward_nav;
  if v_n <> 0 then raise exception 'T2 vw_forward_nav shows % days to a non-member', v_n; end if;

  -- 3. they cannot write into another account's ledger or theses
  v_ok := false;
  begin
    insert into decisions (symbol, decision_type, intent, portfolio_id) values ('AU1', 'deferred', 'test', v_def);
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T3 decision inserted into someone else''s account'; end if;
  v_ok := false;
  begin
    insert into bench_claims (symbol, claim_text, status, portfolio_id) values ('AU1', 'x', 'untested', v_def);
  exception when insufficient_privilege then v_ok := true; end;
  if not v_ok then raise exception 'T3 claim inserted into someone else''s account'; end if;
  v_ok := false;
  begin
    insert into bench_claims (symbol, claim_text, status) values ('AU1', 'x', 'untested');  -- default: no active account
  exception when insufficient_privilege or not_null_violation then v_ok := true; end;
  if not v_ok then raise exception 'T3 claim inserted with no account of their own'; end if;

  -- 4. platform tables: updates touch nothing, inserts are refused
  update scrapbook_companies set notes = notes where true;
  get diagnostics v_ins = row_count;
  if v_ins <> 0 then raise exception 'T4 non-admin updated % scrapbook rows', v_ins; end if;
  update cortex_signals set is_muted = is_muted where true;
  get diagnostics v_ins = row_count;
  if v_ins <> 0 then raise exception 'T4 non-admin updated % cortex signals', v_ins; end if;
  v_ok := false;
  begin
    insert into universe_clusters default values;
  exception when insufficient_privilege or not_null_violation then v_ok := true; end;
  if not v_ok then raise exception 'T4 non-admin inserted into universe_clusters'; end if;

  -- 5. platform reference data is still readable
  select count(*) into v_n from scrapbook_companies;
  if v_n = 0 then raise exception 'T5 scrapbook unreadable to a signed-in user'; end if;
  reset role;

  -- ========== as the administrator, on the default account ==========
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', json_build_object('x-atlas-portfolio', v_def)::text, true);
  set local role authenticated;

  -- 7. their own data is all still there
  select count(*) into v_n from bench_claims;
  if v_n <> (select count(*) from au1_before_claims) then raise exception 'T7 admin sees % of % claims', v_n, (select count(*) from au1_before_claims); end if;
  select count(*) into v_n from forward_test_positions;
  if v_n <> (select count(*) from au1_before_ftp) then raise exception 'T7 admin sees % of % forward-test rows', v_n, (select count(*) from au1_before_ftp); end if;

  -- 8. the admin can still write a claim, a decision and one IPS per account
  insert into bench_claims (symbol, claim_text, status) values ('AU1', 'x', 'untested');
  insert into portfolio_ips (risk_tolerance) values (5)
    on conflict (portfolio_id) do update set risk_tolerance = excluded.risk_tolerance;
  select count(*) into v_n from portfolio_ips;
  if v_n <> 1 then raise exception 'T8 % IPS rows for one account', v_n; end if;
  update scrapbook_companies set notes = notes where true;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then raise exception 'T8 admin could not update the scrapbook'; end if;
  set local role authenticated;
  -- 6. LAST: run_read_sql sets SET LOCAL statement_timeout and read-only for the rest of
  --    the transaction, so nothing may follow it in this block.
  --    The terminal still works for an administrator, and still refuses set_config
  v_j := public.run_read_sql('select count(*) n from scrapbook_companies');
  if (v_j->0->>'n')::int = 0 then raise exception 'T6 admin terminal returned nothing'; end if;
  v_ok := false;
  begin
    perform public.run_read_sql($q$select set_config('request.jwt.claims','{}',true)$q$);
  exception when others then v_ok := true; end;
  if not v_ok then raise exception 'T6 set_config allowed in the terminal'; end if;

  reset role;

  raise exception 'AU1_ALL_PASSED';
end $t$;
