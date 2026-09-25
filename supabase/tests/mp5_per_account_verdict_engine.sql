-- MP-5 contract: the verdict engine's per-account storage answers for the
-- active account and nothing else. Run under psql against production; the
-- whole file rolls back. Every check raises on failure.
begin;

do $$
declare
  v_default uuid := public.atlas_default_portfolio();
  v_other   uuid := (select id from public.portfolios where id <> public.atlas_default_portfolio() order by name limit 1);
  v_acct    uuid;
  n_only_view int; n_only_store int;
  m text;
begin
  -- A single-portfolio database still gets the type and privilege checks;
  -- only the second-account isolation pass needs v_other.
  if v_other is null then raise notice 'only one portfolio; second-account isolation checks skipped'; end if;

  foreach m in array array['mv_book_daily_weights','mv_book_ex_index','mv_position_returns',
                           'mv_position_tier1','mv_position_tier2','mv_segment_ex_index'] loop
    -- 1. the matview is gone; the name is a view over <name>__acct
    if (select relkind from pg_class where oid = ('public.' || m)::regclass) <> 'v' then
      raise exception '% is not a view', m;
    end if;
    -- 2. each account sees exactly its own stored rows -- compared row for
    --    row both ways, so a view serving another account's rows fails even
    --    when the counts happen to match.
    foreach v_acct in array array_remove(array[v_default, v_other], null) loop
      perform set_config('request.headers', json_build_object('x-atlas-portfolio', v_acct::text)::text, true);
      -- jsonb, because the store carries portfolio_id and the view does not.
      execute format('select count(*) from (select to_jsonb(v) j from public.%I v except all
                        select to_jsonb(s) - ''portfolio_id'' from public.%I s where s.portfolio_id = $1) d',
                     m, m || '__acct') into n_only_view using v_acct;
      execute format('select count(*) from (select to_jsonb(s) - ''portfolio_id'' j from public.%I s where s.portfolio_id = $1
                        except all select to_jsonb(v) from public.%I v) d',
                     m || '__acct', m) into n_only_store using v_acct;
      if n_only_view <> 0 or n_only_store <> 0 then
        raise exception '% for %: % rows only in the view, % only in the store', m, v_acct, n_only_view, n_only_store;
      end if;
    end loop;
    -- 3. storage is not reachable from the browser roles
    if has_table_privilege('anon', 'public.' || m || '__acct', 'select')
       or has_table_privilege('authenticated', 'public.' || m || '__acct', 'select')
       or has_table_privilege('anon', 'public.' || m, 'insert') then
      raise exception '% storage or view is writable/readable beyond select', m;
    end if;
  end loop;
  perform set_config('request.headers', '', true);
end $$;

-- 4. the histories: the read policy returns only the active account's rows
--    (happy path included: the default account still sees its own).
set local role anon;
do $$
declare v_other uuid := (select id from public.vw_portfolios where not is_default order by name limit 1);
begin
  if exists (select 1 from public.position_verdicts where portfolio_id <> public.atlas_active_portfolio())
     or exists (select 1 from public.segment_verdicts where portfolio_id <> public.atlas_active_portfolio()) then
    raise exception 'anon sees another account''s verdicts on the default header';
  end if;
  if not exists (select 1 from public.position_verdicts) then
    raise exception 'anon sees no verdicts on the default account';
  end if;
  if v_other is not null then
    perform set_config('request.headers', json_build_object('x-atlas-portfolio', v_other::text)::text, true);
    if exists (select 1 from public.position_verdicts where portfolio_id <> v_other)
       or exists (select 1 from public.segment_verdicts where portfolio_id <> v_other) then
      raise exception 'anon on % sees another account''s verdicts', v_other;
    end if;
  end if;
end $$;
reset role;

-- 5. writers are not executable by the browser roles
do $$
begin
  if has_function_privilege('anon', 'public.atlas_write_verdicts(date,text,boolean)', 'execute')
     or has_function_privilege('anon', 'public.atlas_write_segment_verdicts(date,text)', 'execute')
     or has_function_privilege('anon', 'public.atlas_rematerialise(text[])', 'execute')
     or has_function_privilege('anon', 'public.atlas_write_verdicts_active(date,text,boolean)', 'execute') then
    raise exception 'a verdict writer is executable by anon';
  end if;
end $$;

select 'mp5 per-account verdict engine: all checks passed' as result;
rollback;
