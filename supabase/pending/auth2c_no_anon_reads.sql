-- AUTH-2c: the anon key reads nothing in public.
--
-- Since AUTH-1 the terminal renders only behind a Supabase session, so the
-- browser's requests run as `authenticated`. Since AUTH-2b every /api route
-- forwards that user's token, or uses the service key for pg_cron. So nothing
-- legitimate still talks to PostgREST as anon -- and the anon key is public:
-- it ships in the bundle. Until now it read every book view, the trade ledger
-- and the verdict history.
--
-- Three layers, so a future object cannot reopen the path by accident:
--   1. every existing table, view, matview and sequence: anon holds nothing;
--   2. every function: EXECUTE moves from PUBLIC (which anon inherits) to
--      authenticated and service_role explicitly, preserving exactly who
--      could call what before -- minus anon;
--   3. default privileges for objects postgres creates later: none to anon,
--      and functions no longer granted to PUBLIC.
-- Schema USAGE is left alone: anon inherits it through PUBLIC, and revoking it
-- from PUBLIC would also reach Supabase's internal roles. USAGE alone grants
-- nothing; the object-level revokes and default privileges are the guard.
--
-- Policies that name anon are left as they are: with no grant behind them they
-- admit nothing, and rewriting ~40 of them is churn with no security effect.

-- 1. Objects.
do $$
declare r record; n int := 0;
begin
  for r in
    select c.oid::regclass as rel, c.relkind
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  loop
    execute format('revoke all on %s from anon', r.rel);
    n := n + 1;
  end loop;
  raise notice 'AUTH-2c: anon privileges revoked on % relations', n;
end $$;

-- 2. Functions: authenticated/service_role keep what they had; anon and PUBLIC lose it.
do $$
declare r record; g int := 0;
begin
  for r in
    select p.oid::regprocedure as fn,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
           has_function_privilege('service_role', p.oid, 'execute') as svc_ok
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.prokind in ('f', 'p', 'w')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    if r.auth_ok then execute format('grant execute on function %s to authenticated', r.fn); end if;
    if r.svc_ok then execute format('grant execute on function %s to service_role', r.fn); end if;
    execute format('revoke execute on function %s from public, anon', r.fn);
    g := g + 1;
  end loop;
  raise notice 'AUTH-2c: execute re-granted explicitly on % functions', g;
end $$;

-- 3. Future objects created by postgres in public.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;

-- Assertions.
do $$
declare n_rel int; n_fn int;
begin
  select count(*) into n_rel
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
     and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
       or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'));
  select count(*) into n_fn
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if n_rel > 0 or n_fn > 0 then
    raise exception 'AUTH-2c: anon still reaches % relations and % functions', n_rel, n_fn;
  end if;
end $$;
