-- AU-1: what a signed-in person can reach, audited before a second person signs in.
--
-- AUTH-2 isolated the book tables. Everything else a signed-in user can touch
-- was written for a single user, and the audit found three classes of exposure:
--
-- 1. run_read_sql (the SQL Terminal) runs the caller's SQL as the caller, so RLS
--    applies -- but the caller's SQL can call set_config('request.jwt.claims')
--    first, and auth.uid() then returns whoever they named. Proven: a user with
--    no portfolio read 0 rows of positions directly and all 11,907 of the
--    administrator's through run_read_sql. It is an administrator's tool, so it
--    is now refused to anyone else BEFORE the caller's SQL runs.
-- 2. Personal and per-account tables shared by every user: saved queries, the
--    query log, chats, the bug memory, the trade ticket's theses, triggers and
--    forward-test positions, ledger alerts, the IPS and the Cortex watchlist.
--    Each is now an administrator's, the active account's, or the caller's own.
-- 3. Platform tables any signed-in user could rewrite: the nightly pipeline's
--    outputs (signals, universe, clusters, options, theme leadership,
--    dispersion, assessments), which only service_role writes and service_role
--    bypasses RLS; and platform settings the UI does edit -- the Scrapbook
--    (its fair values feed every account's conviction score) and Cortex's
--    signal mutes and tuning -- now administrator-only.
--
-- decisions accepted an INSERT carrying any portfolio_id, so a user could
-- append to another account's hash-chained, append-only ledger. The check now
-- requires a portfolio the caller owns (the trigger still fills a missing id
-- from atlas_active_portfolio(), which is membership-checked).

-- ---------------------------------------------------------------- helpers
create or replace function public.atlas_owner_portfolios()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select p.id from public.portfolios p where (select auth.uid()) is null
  union all
  select m.portfolio_id from public.portfolio_members m
   where m.user_id = (select auth.uid()) and m.role = 'owner'
$fn$;

comment on function public.atlas_owner_portfolios() is
  'AU-1. Portfolios the caller OWNS (writes); every portfolio for a headerless or service caller, '
  'as atlas_member_portfolios() does for reads.';

revoke execute on function public.atlas_owner_portfolios() from public, anon;
grant  execute on function public.atlas_owner_portfolios() to authenticated, service_role;

-- -------------------------------------------------- 1. the SQL Terminal
create or replace function public.run_read_sql(sql_text text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  result   JSONB;
  norm     TEXT;
BEGIN
  -- AU-1: an administrator's tool. Checked before the caller's SQL runs, so
  -- nothing the caller writes can change who this check sees.
  IF NOT public.atlas_is_admin() THEN
    RAISE EXCEPTION 'The SQL Terminal is limited to administrators' USING ERRCODE = '42501';
  END IF;

  SET LOCAL statement_timeout = '30000';   -- 30 s hard cap
  SET LOCAL transaction_read_only = on;    -- RLS-1: no write survives, whoever calls

  norm := upper(regexp_replace(sql_text, '\s+', ' ', 'g'));

  -- Belt-and-suspenders: block write keywords at DB level too
  IF norm ~ '\m(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|REPLACE|MERGE)\M' THEN
    RAISE EXCEPTION 'Write operations are not permitted in the SQL Terminal';
  END IF;

  -- AU-1: rewriting request settings changes who RLS thinks is asking.
  IF norm ~ '\m(SET_CONFIG)\M' THEN
    RAISE EXCEPTION 'Changing session settings is not permitted in the SQL Terminal';
  END IF;

  -- Block dangerous system catalogues
  IF norm ~ '\m(PG_CATALOG|PG_CLASS|PG_PROC|PG_STAT_ACTIVITY|PG_TOAST)\M' THEN
    RAISE EXCEPTION 'Access to system catalogues is restricted';
  END IF;

  EXECUTE format(
    'SELECT jsonb_agg(row_to_json(t)) FROM (%s) t',
    sql_text
  ) INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$function$;

revoke execute on function public.run_read_sql(text) from public, anon;
grant  execute on function public.run_read_sql(text) to authenticated;

-- ------------------------------------- 2. per-account ownership columns
-- Each table gets the account it belongs to. A browser insert takes the active
-- account (membership-checked, NULL for a non-member, which the policies then
-- refuse); a cron insert takes the default account, as atlas_active_portfolio()
-- resolves for a headerless caller.
alter table public.bench_claims           add column if not exists portfolio_id uuid references public.portfolios(id) on delete cascade;
alter table public.trade_triggers         add column if not exists portfolio_id uuid references public.portfolios(id) on delete cascade;
alter table public.forward_test_positions add column if not exists portfolio_id uuid references public.portfolios(id) on delete cascade;
alter table public.ledger_alerts          add column if not exists portfolio_id uuid references public.portfolios(id) on delete cascade;
alter table public.portfolio_ips          add column if not exists portfolio_id uuid references public.portfolios(id) on delete cascade;

-- forward_test_positions is append-only (deny_mutation); the one-off backfill
-- has to step past that trigger.
alter table public.forward_test_positions disable trigger no_mutate_ftp;

update public.bench_claims c
   set portfolio_id = coalesce((select coalesce(d.portfolio_id, public.atlas_default_portfolio())
                                  from public.decisions d where d.id = c.origin_decision_id),
                               public.atlas_default_portfolio())
 where c.portfolio_id is null;
update public.trade_triggers t
   set portfolio_id = coalesce((select coalesce(d.portfolio_id, public.atlas_default_portfolio())
                                  from public.decisions d where d.id = t.decision_id),
                               public.atlas_default_portfolio())
 where t.portfolio_id is null;
update public.forward_test_positions f
   set portfolio_id = coalesce((select coalesce(d.portfolio_id, public.atlas_default_portfolio())
                                  from public.decisions d where d.id = f.decision_id),
                               public.atlas_default_portfolio())
 where f.portfolio_id is null;
update public.ledger_alerts set portfolio_id = public.atlas_default_portfolio() where portfolio_id is null;
update public.portfolio_ips set portfolio_id = public.atlas_default_portfolio() where portfolio_id is null;

alter table public.forward_test_positions enable trigger no_mutate_ftp;

do $$
declare t text;
begin
  foreach t in array array['bench_claims','trade_triggers','forward_test_positions','ledger_alerts','portfolio_ips'] loop
    execute format('alter table public.%I alter column portfolio_id set default public.atlas_active_portfolio()', t);
    execute format('alter table public.%I alter column portfolio_id set not null', t);
    execute format('create index if not exists %I on public.%I (portfolio_id)', t || '_portfolio_idx', t);
  end loop;
end $$;

-- One investment policy statement per account (was one global row, id 1).
create unique index if not exists portfolio_ips_portfolio_uniq on public.portfolio_ips (portfolio_id);

-- --------------------------------------------------------- 3. policies
-- Drop every browser-facing policy on the tables below; service_role policies
-- (qual naming service_role) are kept, though service_role bypasses RLS anyway.
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename = any (array[
         'saved_queries','query_log','cc_chats','atlas_memory',
         'scrapbook_companies','scrapbook_narratives','scrapbook_sector_notes','scrapbook_snapshots',
         'cortex_signals','cortex_signal_controls',
         'signal_scores','theme_leadership_weekly','options_positioning_snapshots','vol_dispersion_daily',
         'trade_universe_members','trade_universe_rules','trade_universe_snapshots','universe_clusters',
         'opportunity_assessments',
         'bench_claims','trade_triggers','forward_test_positions','ledger_alerts','portfolio_ips',
         'cortex_watchlist'])
       and coalesce(qual, '') !~ 'service_role'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
  -- decisions keeps its read policy; only the unchecked insert goes.
  drop policy if exists decisions_anon_insert on public.decisions;
end $$;

-- 3a. Administrator only, read and write.
do $$
declare t text;
begin
  foreach t in array array['saved_queries','query_log','cc_chats','atlas_memory'] loop
    execute format($p$create policy au1_admin_all on public.%I for all to authenticated
                     using ((select public.atlas_is_admin())) with check ((select public.atlas_is_admin()))$p$, t);
  end loop;
end $$;

-- 3b. Everyone reads; administrators write.
do $$
declare t text;
begin
  foreach t in array array['scrapbook_companies','scrapbook_narratives','scrapbook_sector_notes',
                           'scrapbook_snapshots','cortex_signals','cortex_signal_controls'] loop
    execute format('create policy au1_read on public.%I for select to authenticated using (true)', t);
    execute format($p$create policy au1_admin_write on public.%I for all to authenticated
                     using ((select public.atlas_is_admin())) with check ((select public.atlas_is_admin()))$p$, t);
  end loop;
end $$;

-- 3c. Everyone reads; only the nightly writers (service_role) write.
do $$
declare t text;
begin
  foreach t in array array['signal_scores','theme_leadership_weekly','options_positioning_snapshots',
                           'vol_dispersion_daily','trade_universe_members','trade_universe_rules',
                           'trade_universe_snapshots','universe_clusters','opportunity_assessments'] loop
    execute format('create policy au1_read on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- 3d. Per account: read the ACTIVE account's rows (as decisions does), write
--     only into an account the caller owns.
do $$
declare t text;
begin
  foreach t in array array['bench_claims','trade_triggers','forward_test_positions','ledger_alerts','portfolio_ips'] loop
    execute format($p$create policy au1_read_active on public.%I for select to authenticated
                     using (portfolio_id = (select public.atlas_active_portfolio()))$p$, t);
  end loop;
  foreach t in array array['bench_claims','trade_triggers','portfolio_ips'] loop
    execute format($p$create policy au1_insert_owned on public.%I for insert to authenticated
                     with check (portfolio_id in (select public.atlas_owner_portfolios()))$p$, t);
    execute format($p$create policy au1_update_owned on public.%I for update to authenticated
                     using (portfolio_id in (select public.atlas_owner_portfolios()))
                     with check (portfolio_id in (select public.atlas_owner_portfolios()))$p$, t);
  end loop;
end $$;

create policy au1_insert_owned on public.decisions for insert to authenticated
  with check (portfolio_id in (select public.atlas_owner_portfolios()));

-- 3e. The caller's own watchlist.
alter table public.cortex_watchlist alter column user_id set default auth.uid();
create policy au1_own on public.cortex_watchlist for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ------------------------------------------------- 4. views over them
-- These views run with their owner's rights, which bypasses RLS, and
-- vw_position_risk_thesis reads two of them -- so a security_invoker switch
-- would not filter that path. The filter is written into each view instead.
do $$
declare
  v_def text; v_old text; v_new text; v_n int;
  patches text[][] := array[
    array['vw_bench_thesis_state',
          'WHERE c.symbol IS NOT NULL',
          'WHERE c.symbol IS NOT NULL AND c.portfolio_id = (( SELECT atlas_active_portfolio() AS atlas_active_portfolio))',
          '1'],
    array['vw_thesis_regime_drift',
          'WHERE bc.status = ANY',
          'WHERE bc.portfolio_id = (( SELECT atlas_active_portfolio() AS atlas_active_portfolio)) AND bc.status = ANY',
          '1'],
    array['vw_forward_nav',
          'FROM forward_test_positions)',
          'FROM forward_test_positions WHERE forward_test_positions.portfolio_id = (( SELECT atlas_active_portfolio() AS atlas_active_portfolio)))',
          '2'],
    array['vw_forward_nav',
          'JOIN forward_test_positions ftp ON ftp.symbol = syms.symbol',
          'JOIN forward_test_positions ftp ON ftp.symbol = syms.symbol AND ftp.portfolio_id = (( SELECT atlas_active_portfolio() AS atlas_active_portfolio))',
          '1'],
    array['vw_forward_summary',
          'WHERE forward_test_positions.qty > 0::numeric',
          'WHERE forward_test_positions.qty > 0::numeric AND forward_test_positions.portfolio_id = (( SELECT atlas_active_portfolio() AS atlas_active_portfolio))',
          '1'],
    array['vw_forward_summary',
          'FROM forward_test_positions) AS total_position_records',
          'FROM forward_test_positions WHERE forward_test_positions.portfolio_id = (( SELECT atlas_active_portfolio() AS atlas_active_portfolio))) AS total_position_records',
          '1']];
  i int;
begin
  for i in 1 .. array_length(patches, 1) loop
    v_def := pg_get_viewdef(('public.' || patches[i][1])::regclass, true);
    v_old := patches[i][2]; v_new := patches[i][3];
    if position(v_new in v_def) > 0 then
      raise exception 'AU-1: % already patched', patches[i][1];
    end if;
    v_n := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_n <> patches[i][4]::int then
      raise exception 'AU-1: % anchor "%" found % times, expected %', patches[i][1], v_old, v_n, patches[i][4];
    end if;
    execute format('create or replace view public.%I as %s', patches[i][1], replace(v_def, v_old, v_new));
  end loop;
end $$;

-- ------------------------------------------------------------ 5. assert
do $$
begin
  if has_function_privilege('anon', 'public.run_read_sql(text)', 'execute')
     or has_function_privilege('anon', 'public.atlas_owner_portfolios()', 'execute') then
    raise exception 'AU-1: anon can execute an AU-1 function';
  end if;
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and cmd in ('INSERT','UPDATE','DELETE','ALL')
       and roles && array['anon','authenticated','public']::name[]
       and coalesce(qual, '') !~ 'service_role'
       and (coalesce(qual, 'true') = 'true' and coalesce(with_check, 'true') = 'true')
  ) then
    raise exception 'AU-1: a browser-facing write policy is still unconditional';
  end if;
end $$;
